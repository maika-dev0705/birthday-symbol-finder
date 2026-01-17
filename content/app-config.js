// 調整はこのファイルで一括管理します。
// ===== UI/表示 =====
export const FACT_INTERVAL_MS = 9000;
export const FACT_FADE_MS = 900;
export const RESULT_LIMIT = 20;
export const PAGE_SIZE = 10;

// ===== 入力制限 =====
export const MAX_KEYWORDS = 5;
export const MAX_KEYWORD_CHARS = 50;
export const MAX_TEXT_CHARS = 500;

// ===== 検索/スコア =====
export const MATCH_PERCENT_MIN = 30;
export const COVERAGE_BONUS = 0.3;
export const KEYWORD_WEIGHT_MIN = 0.7;
export const EMBEDDING_THRESHOLD = 0.4;
export const EMBEDDING_MAX_SCORE = 2;
export const SEMANTIC_SIMILARITY_MAX = 0.85;
export const SEMANTIC_SIMILARITY_CURVE = 0.6;
export const MIN_TOKEN_LENGTH = 2;
export const SEARCH_TIMEOUT_MS = 120_000;

// ===== LLM評価 =====
export const SEMANTIC_LIMIT_PER_KEYWORD = 50;
export const LLM_BATCH_SIZE = 30;

// ===== レート制限 =====
export const SEARCH_RATE_LIMIT_WINDOW_MS = 60_000;
export const SEARCH_RATE_LIMIT_MAX = 20;
export const KEYWORDS_RATE_LIMIT_WINDOW_MS = 60_000;
export const KEYWORDS_RATE_LIMIT_MAX = 30;
