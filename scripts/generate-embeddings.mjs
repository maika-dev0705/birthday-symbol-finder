import fs from "fs";
import path from "path";

loadEnvIfNeeded();
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is required.");
  process.exit(1);
}

const model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const dataPath = path.join(process.cwd(), "content", "birthdata.json");
const embedPath = path.join(process.cwd(), "content", "embeddings.json");
const metaPath = path.join(process.cwd(), "content", "meta.json");

const data = readJsonFile(dataPath);
const meta = fs.existsSync(metaPath) ? readJsonFile(metaPath) : null;

const categoryKeys = collectCategoryKeys(data, meta);
const items = [];
const phrases = [];

for (const [dateKey, dateData] of Object.entries(data.dates || {})) {
  for (const category of categoryKeys) {
    const list = Array.isArray(dateData[category]) ? dateData[category] : [];
    list.forEach((item, index) => {
      const meaning = Array.isArray(item.meaning)
        ? item.meaning
        : item.meaning
        ? [item.meaning]
        : [];
      const meaningList = meaning.filter(Boolean).map((text) => String(text).trim()).filter(Boolean);
      const text = meaningList.join(" ").trim();
      if (!text) return;
      items.push({
        id: `${dateKey}|${category}|${index}`,
        text,
      });
      meaningList.forEach((meaningText, meaningIndex) => {
        phrases.push({
          id: `${dateKey}|${category}|${index}|m${meaningIndex}`,
          text: meaningText,
        });
      });
    });
  }
}

const itemEmbeddings = {};
const phraseEmbeddings = {};
const batchSize = Number(process.env.EMBEDDING_BATCH_SIZE || 64);
const requestTimeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS || 20000);
const maxRetries = Number(process.env.EMBEDDING_RETRIES || 3);

await embedItems(items, itemEmbeddings);
await embedItems(phrases, phraseEmbeddings);

fs.writeFileSync(
  embedPath,
  JSON.stringify({ items: itemEmbeddings, phrases: phraseEmbeddings })
);
console.log(
  `Saved embeddings: items=${Object.keys(itemEmbeddings).length}, phrases=${Object.keys(phraseEmbeddings).length}`
);

function loadEnvIfNeeded() {
  if (process.env.OPENAI_API_KEY) {
    return;
  }
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^\"|\"$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function collectCategoryKeys(data, meta) {
  const fromMeta = meta?.categories || data.meta?.categories;
  if (Array.isArray(fromMeta)) {
    return fromMeta.map((item) => item.key);
  }

  const dates = Object.values(data.dates || {});
  const keys = new Set();
  dates.forEach((dateData) => {
    Object.keys(dateData || {}).forEach((key) => keys.add(key));
  });
  return Array.from(keys);
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

async function embedItems(list, targetMap) {
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const payload = await fetchEmbeddingBatch(
      batch.map((item) => item.text),
      0
    );
    payload.data.forEach((entry, index) => {
      targetMap[batch[index].id] = entry.embedding;
    });
  }
}

async function fetchEmbeddingBatch(input, attempt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      if (attempt < maxRetries && isRetryableStatus(response.status)) {
        await backoff(attempt);
        return fetchEmbeddingBatch(input, attempt + 1);
      }
      console.error(error);
      process.exit(1);
    }

    return await response.json();
  } catch (error) {
    if (attempt < maxRetries && isRetryableError(error)) {
      await backoff(attempt);
      return fetchEmbeddingBatch(input, attempt + 1);
    }
    console.error(error);
    process.exit(1);
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryableStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

function isRetryableError(error) {
  return (
    error?.name === "AbortError" ||
    error?.code === "ETIMEDOUT" ||
    error?.code === "ECONNRESET" ||
    error?.code === "EAI_AGAIN"
  );
}

function backoff(attempt) {
  const delay = Math.min(1000 * 2 ** attempt, 5000);
  return new Promise((resolve) => setTimeout(resolve, delay));
}
