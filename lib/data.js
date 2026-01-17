import fs from "fs";
import path from "path";

const dataPath = path.join(process.cwd(), "content", "birthdata.json");
const embedPath = path.join(process.cwd(), "content", "embeddings.json");
const metaPath = path.join(process.cwd(), "content", "meta.json");

let cachedData = null;
let cachedEmbeddings = null;
let cachedMeta = null;

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

export function getBirthData() {
  if (cachedData) return cachedData;
  cachedData = readJsonFile(dataPath);
  return cachedData;
}

export function getEmbeddings() {
  if (cachedEmbeddings) return cachedEmbeddings;
  if (!fs.existsSync(embedPath)) {
    cachedEmbeddings = { items: {}, phrases: {} };
    return cachedEmbeddings;
  }
  const raw = fs.readFileSync(embedPath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) {
    cachedEmbeddings = { items: {}, phrases: {} };
    return cachedEmbeddings;
  }
  const parsed = JSON.parse(raw);
  if (parsed && parsed.items) {
    cachedEmbeddings = parsed;
  } else {
    cachedEmbeddings = { items: parsed || {}, phrases: {} };
  }
  return cachedEmbeddings;
}

export function getMeta() {
  if (cachedMeta) return cachedMeta;
  cachedMeta = readJsonFile(metaPath);
  return cachedMeta;
}

export function getCategoryKeys() {
  return getMeta().categories.map((category) => category.key);
}

export function toDateKey(month, day) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${mm}-${dd}`;
}

export function normalizeText(value) {
  return String(value || "").toLowerCase();
}
