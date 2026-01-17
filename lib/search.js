import { getCategoryKeys, normalizeText } from "./data.js";
import {
  COVERAGE_BONUS,
  EMBEDDING_MAX_SCORE,
  KEYWORD_WEIGHT_MIN,
  MATCH_PERCENT_MIN,
  MIN_TOKEN_LENGTH,
  SEMANTIC_SIMILARITY_CURVE,
  SEMANTIC_SIMILARITY_MAX,
} from "../content/app-config.js";

const TOKEN_SPLIT_RE = /[\s/・、,，／]+/g;
const STRIP_RE = /[\s\u3000/・、,，／\.\-—–~〜!?！？:：;；"'“”‘’()（）\[\]【】{}「」『』]/g;
const SEARCH_EXCLUDED_CATEGORIES = new Set(["stone_monthly"]);

export function getKeywordWeight(index, totalKeywords) {
  if (!totalKeywords || totalKeywords <= 1) return 1;
  const ratio = index / (totalKeywords - 1);
  return 1 - (1 - KEYWORD_WEIGHT_MIN) * ratio;
}

function getCoverageMultiplier(matchedCount, totalKeywords) {
  if (!totalKeywords) return 1;
  const ratio = matchedCount / totalKeywords;
  return 1 + COVERAGE_BONUS * ratio;
}

export function buildDateItems(dateKey, dateData) {
  const categoryKeys = getCategoryKeys().filter((key) => !SEARCH_EXCLUDED_CATEGORIES.has(key));
  const items = [];

  for (const category of categoryKeys) {
    const list = Array.isArray(dateData?.[category]) ? dateData[category] : [];
    list.forEach((item, index) => {
      const meaning = Array.isArray(item.meaning)
        ? item.meaning
        : item.meaning
        ? [item.meaning]
        : [];

      const tokens = collectTokens([item.name, ...meaning]);
      const searchText = normalizeText([item.name, ...meaning].join(" "));
      const searchCompact = normalizeForMatch([item.name, ...meaning].join(" "));

      items.push({
        id: `${dateKey}|${category}|${index}`,
        index,
        category,
        name: item.name,
        meaning,
        source: item.source || "",
        searchText,
        searchCompact,
        tokens,
      });
    });
  }

  return items;
}

export function buildItemMatchIndex({
  items,
  keywords,
  keywordEmbeddings,
  embeddingsMap,
  embeddingThreshold = 0.4,
}) {
  const normalizedKeywords = keywords.map((keyword) => normalizeText(keyword)).filter(Boolean);
  const matchIndex = new Map();

  items.forEach((item) => {
    matchIndex.set(item.id, {
      matchedKeywords: [],
      matchedByEmbedding: false,
      semanticMeaningIndex: null,
      semanticSimilarity: 0,
    });
  });

  items.forEach((item) => {
    const matched = [];
    normalizedKeywords.forEach((normalized, idx) => {
      if (!normalized) return;
      const match = matchKeywordAgainstItem(normalized, keywords[idx], item);
      if (match.length > 0) {
        matched.push(...match);
      }
    });
    if (matched.length > 0) {
      matchIndex.set(item.id, {
        ...matchIndex.get(item.id),
        matchedKeywords: uniq(matched),
      });
    }
  });

  if (keywordEmbeddings && embeddingsMap) {
    const itemEmbeddings = embeddingsMap.items || embeddingsMap;
    const phraseEmbeddings = embeddingsMap.phrases || null;

    items.forEach((item) => {
      let bestSimilarity = 0;
      let bestMeaningIndex = null;

      if (phraseEmbeddings && Array.isArray(item.meaning) && item.meaning.length > 0) {
        item.meaning.forEach((_, meaningIndex) => {
          const vector = phraseEmbeddings[`${item.id}|m${meaningIndex}`];
          if (!vector) return;
          keywordEmbeddings.forEach((keywordEmbedding) => {
            const similarity = cosineSimilarity(keywordEmbedding, vector);
            if (similarity > bestSimilarity) {
              bestSimilarity = similarity;
              bestMeaningIndex = meaningIndex;
            }
          });
        });
      } else {
        const vector = itemEmbeddings[item.id];
        if (vector) {
          keywordEmbeddings.forEach((keywordEmbedding) => {
            const similarity = cosineSimilarity(keywordEmbedding, vector);
            if (similarity > bestSimilarity) {
              bestSimilarity = similarity;
            }
          });
        }
      }

      if (bestSimilarity >= embeddingThreshold) {
        matchIndex.set(item.id, {
          ...matchIndex.get(item.id),
          matchedByEmbedding: true,
          semanticMeaningIndex: bestMeaningIndex,
          semanticSimilarity: bestSimilarity,
        });
      }
    });
  }

  return matchIndex;
}

export function getItemKeywordMatchDetail({
  item,
  keyword,
  keywordEmbedding,
  embeddingsMap,
  embeddingThreshold = 0.4,
  embeddingMaxScore = EMBEDDING_MAX_SCORE,
  weight = 1,
}) {
  const normalized = normalizeText(keyword);
  if (!normalized) return null;
  const textMatched = matchKeywordAgainstItem(normalized, keyword, item).length > 0;
  const nameMatched = textMatched && isTextMatchInValue(normalized, keyword, item?.name);
  const meaningMatched =
    textMatched &&
    Array.isArray(item?.meaning) &&
    item.meaning.some((value) => isTextMatchInValue(normalized, keyword, value));
  if (textMatched) {
    return {
      keyword,
      score: 2,
      percent: 100,
      source: "text",
      target: nameMatched ? "name" : meaningMatched ? "meaning" : "meaning",
    };
  }

  const itemEmbeddings = embeddingsMap ? embeddingsMap.items || embeddingsMap : null;
  const phraseEmbeddings = embeddingsMap ? embeddingsMap.phrases || null : null;
  const embeddingScore = scoreItemEmbedding(
    keywordEmbedding,
    item,
    itemEmbeddings,
    phraseEmbeddings,
    embeddingThreshold,
    embeddingMaxScore
  );
  if (embeddingScore <= 0) return null;
  const weightedScore = applyWeight(embeddingScore, weight, embeddingMaxScore);
  const percent = Math.min(100, Math.round((weightedScore / embeddingMaxScore) * 100));
  return {
    keyword,
    score: weightedScore,
    percent,
    source: "semantic",
    target: "meaning",
  };
}

export function scoreDate({
  dateKey,
  dateData,
  keywords,
  keywordEmbeddings,
  embeddingsMap,
  embeddingThreshold = 0.4,
  embeddingMaxScore = EMBEDDING_MAX_SCORE,
  semanticWeights = null,
}) {
  const items = buildDateItems(dateKey, dateData);
  const itemEmbeddings = embeddingsMap ? embeddingsMap.items || embeddingsMap : null;
  const phraseEmbeddings = embeddingsMap ? embeddingsMap.phrases || null : null;
  let matchedCount = 0;
  let score = 0;

  keywords.forEach((keyword, index) => {
    const normalized = normalizeText(keyword);
    if (!normalized) return;

    let keywordMatched = false;
    const keywordWeight = getKeywordWeight(index, keywords.length);
    const keywordEmbedding = keywordEmbeddings ? keywordEmbeddings[index] : null;

    for (const item of items) {
      const textMatched = matchKeywordAgainstItem(normalized, keyword, item).length > 0;
      const textScore = textMatched ? 2 : 0;
      const weight = semanticWeights ? semanticWeights.get(item.id)?.get(index) : null;
      const embeddingScore = textMatched
        ? 0
        : scoreItemEmbedding(
            keywordEmbedding,
            item,
            itemEmbeddings,
            phraseEmbeddings,
            embeddingThreshold,
            embeddingMaxScore
          );
      const weightedEmbeddingScore =
        embeddingScore > 0 ? applyWeight(embeddingScore, weight, embeddingMaxScore) : 0;
      const semanticPercent =
        weightedEmbeddingScore > 0
          ? Math.round((weightedEmbeddingScore / embeddingMaxScore) * 100)
          : 0;
      const filteredEmbeddingScore =
        semanticPercent >= MATCH_PERCENT_MIN ? weightedEmbeddingScore : 0;
      const itemScore = Math.max(textScore, filteredEmbeddingScore);
      if (itemScore > 0) {
        keywordMatched = true;
        score += itemScore * keywordWeight;
      }
    }

  if (keywordMatched) {
    matchedCount += 1;
  }
});

  const coverageMultiplier = getCoverageMultiplier(matchedCount, keywords.length);
  const adjustedScore = score * coverageMultiplier;

  return {
    score: adjustedScore,
    matchedCount,
    coverageMultiplier,
    coverageRatio: keywords.length ? matchedCount / keywords.length : 0,
    items,
  };
}

function scoreItemEmbedding(
  keywordEmbedding,
  item,
  itemEmbeddings,
  phraseEmbeddings,
  threshold,
  maxScore
) {
  if (!keywordEmbedding) return 0;
  let bestSimilarity = 0;

  if (phraseEmbeddings && Array.isArray(item?.meaning) && item.meaning.length > 0) {
    item.meaning.forEach((_, meaningIndex) => {
      const vector = phraseEmbeddings[`${item.id}|m${meaningIndex}`];
      if (!vector) return;
      const similarity = cosineSimilarity(keywordEmbedding, vector);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
      }
    });
  } else if (itemEmbeddings) {
    const vector = itemEmbeddings[item.id];
    if (vector) {
      bestSimilarity = cosineSimilarity(keywordEmbedding, vector);
    }
  }

  const normalized = normalizeSemanticSimilarity(bestSimilarity, threshold);
  if (normalized <= 0) return 0;
  return Math.min(maxScore, Math.max(0, normalized * maxScore));
}

function isTextMatchInValue(normalizedKeyword, rawKeyword, value) {
  if (!normalizedKeyword) return false;
  const text = normalizeText(value);
  if (text.includes(normalizedKeyword)) return true;
  const keywordCompact = normalizeForMatch(rawKeyword);
  if (!keywordCompact) return false;
  const compactValue = normalizeForMatch(value);
  if (!compactValue) return false;
  return compactValue.includes(keywordCompact);
}

function applyWeight(score, weight, maxScore) {
  const MIN_WEIGHT = 0.4;
  const MAX_WEIGHT = 1.5;
  const safeWeight =
    typeof weight === "number" && Number.isFinite(weight)
      ? Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight))
      : 1;
  const boosted = score * safeWeight;
  const maxAllowed = maxScore * MAX_WEIGHT;
  return Math.min(maxAllowed, Math.max(0, boosted));
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length && i < b.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denom) return 0;
  return dot / denom;
}

function uniq(values) {
  return Array.from(new Set(values));
}

function collectTokens(values) {
  const tokens = [];
  values.forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    text.split(TOKEN_SPLIT_RE).forEach((token) => {
      const cleaned = token.trim();
      if (!cleaned) return;
      tokens.push({
        text: cleaned,
        normalized: normalizeText(cleaned),
        compact: normalizeForMatch(cleaned),
      });
    });
  });
  return tokens;
}

function matchKeywordAgainstItem(normalizedKeyword, rawKeyword, item) {
  const matched = [];
  if (!normalizedKeyword) return matched;

  if (item.searchText.includes(normalizedKeyword)) {
    matched.push(rawKeyword);
    return matched;
  }

  const keywordCompact = normalizeForMatch(rawKeyword);
  if (!keywordCompact) return matched;
  if (item.searchCompact && item.searchCompact.includes(keywordCompact)) {
    matched.push(rawKeyword);
    return matched;
  }

  if (Array.isArray(item.tokens)) {
    item.tokens.forEach((token) => {
      if (!token.normalized) return;
      if (!token.compact) return;
      if (token.compact.length < MIN_TOKEN_LENGTH) return;
      if (keywordCompact.includes(token.compact)) {
        matched.push(token.text);
      }
    });
  }

  return matched;
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(STRIP_RE, "");
}

function normalizeSemanticSimilarity(similarity, threshold) {
  if (!Number.isFinite(similarity)) return 0;
  if (similarity <= threshold) return 0;
  const span = Math.max(0.01, SEMANTIC_SIMILARITY_MAX - threshold);
  const raw = Math.min(1, Math.max(0, (similarity - threshold) / span));
  return Math.pow(raw, SEMANTIC_SIMILARITY_CURVE);
}
