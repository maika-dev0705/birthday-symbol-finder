"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import meta from "../content/meta.json";
import fakeFacts from "../content/fake-facts.json";
import categoryImages from "../content/category-images.json";
import {
  FACT_FADE_MS,
  FACT_INTERVAL_MS,
  MATCH_PERCENT_MIN,
  MAX_KEYWORD_CHARS,
  MAX_KEYWORDS,
  MAX_TEXT_CHARS,
  PAGE_SIZE,
  RESULT_LIMIT,
} from "../content/app-config.js";

const daysByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const normalizeDigits = (value) =>
  value.replace(/[\uFF10-\uFF19]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const KEYWORD_CHAR_LIMIT = MAX_KEYWORD_CHARS;
const KEYWORD_COUNT_LIMIT = MAX_KEYWORDS;
const PARAGRAPH_CHAR_LIMIT = MAX_TEXT_CHARS;

const hasTextMatch = (text, keywords) => {
  if (!text) return false;
  const target = String(text).toLowerCase();
  return keywords.some((keyword) => {
    const normalized = String(keyword || "").toLowerCase().trim();
    return normalized && target.includes(normalized);
  });
};

const renderHighlightedText = (text, keywords) => {
  const cleaned = keywords.map((keyword) => keyword.trim()).filter(Boolean);
  if (!text || cleaned.length === 0) return text;

  const unique = [];
  const seen = new Set();
  cleaned.forEach((keyword) => {
    const normalized = keyword.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(keyword);
    }
  });

  const escaped = unique.map(escapeRegExp);
  if (escaped.length === 0) return text;

  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = String(text).split(regex);
  if (parts.length === 1) return text;

  const lookup = new Set(unique.map((keyword) => keyword.toLowerCase()));
  return parts.map((part, index) => {
    if (lookup.has(part.toLowerCase())) {
      return (
        <mark className="keyword-mark" key={`${part}-${index}`}>
          {part}
        </mark>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

const parseKeywords = (value) =>
  String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

const isKeywordsInputAllowed = (value, previousValue = "") => {
  if (value.length > KEYWORD_CHAR_LIMIT) return false;
  const keywords = parseKeywords(value);
  if (keywords.length > KEYWORD_COUNT_LIMIT) return false;
  if (
    keywords.length === KEYWORD_COUNT_LIMIT &&
    value.length > previousValue.length &&
    /\s$/.test(value)
  ) {
    return false;
  }
  return true;
};

const normalizeKeyword = (value) => String(value || "").toLowerCase().trim();

const filterHighlightTerms = (terms, meta) => {
  if (!Array.isArray(terms) || terms.length === 0) return [];
  if (!Array.isArray(meta) || meta.length === 0) return [];
  const keywords = meta
    .map((detail) => normalizeKeyword(detail.keyword))
    .filter(Boolean);
  if (keywords.length === 0) return [];
  return terms.filter((term) => {
    const normalized = normalizeKeyword(term);
    if (!normalized) return false;
    return keywords.some(
      (keyword) => keyword.includes(normalized) || normalized.includes(keyword)
    );
  });
};

const normalizeColorCode = (value) => {
  if (!value) return "";
  const match = String(value).match(/#?[0-9a-fA-F]{6}/);
  if (!match) return "";
  const hex = match[0].startsWith("#") ? match[0] : `#${match[0]}`;
  return hex.toUpperCase();
};

const getCategoryColorCode = (items) => {
  if (!Array.isArray(items)) return "";
  for (const item of items) {
    if (!item) continue;
    const code = normalizeColorCode(item.colorCode);
    if (code) return code;
  }
  return "";
};

const renderMatchMeta = (entries, options = {}) => {
  if (!entries || entries.length === 0) return null;
  const minPercent = Number.isFinite(options.minPercent)
    ? options.minPercent
    : MATCH_PERCENT_MIN;
  let visible = entries.filter((entry) => Number(entry.percent) >= minPercent);
  if (options.topOnly && visible.length > 1) {
    visible = [
      visible.reduce((best, entry) => (entry.percent > best.percent ? entry : best)),
    ];
  }
  if (visible.length === 0) return null;
  return (
    <span className="match-meta">
      （
      {visible.map((entry, index) => (
        <span className="match-meta__item" key={`${entry.keyword}-${entry.percent}`}>
          {entry.keyword}：{entry.percent}%一致
          {index < visible.length - 1 ? " / " : ""}
        </span>
      ))}
      ）
    </span>
  );
};

const renderScoreSummary = (result, keywords) => {
  if (!result) return null;
  const total = Number.isFinite(result.score) ? result.score.toFixed(2) : "-";
  const list = Array.isArray(keywords) ? keywords : [];
  if (list.length === 0) {
    return <>スコア {total}</>;
  }
  const keywordScores = result.keywordScores || {};
  const details = list
    .map((keyword) => {
      const value = keywordScores[keyword];
      const score = Number.isFinite(value) ? value.toFixed(2) : "0.00";
      return `${keyword} ${score}`;
    })
    .join(" / ");
  return (
    <>
      合計 {total}
      <span className="score__details">（{details}）</span>
    </>
  );
};

export default function Home() {
  const [tab, setTab] = useState("date");
  const [reverseMode, setReverseMode] = useState("keywords");
  const [monthInput, setMonthInput] = useState("");
  const [dayInput, setDayInput] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [paragraph, setParagraph] = useState("");
  const [dateResult, setDateResult] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [totalResults, setTotalResults] = useState(0);
  const [normalizedKeywords, setNormalizedKeywords] = useState([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reverseStatus, setReverseStatus] = useState("");
  const [factIndex, setFactIndex] = useState(0);
  const [prevFactIndex, setPrevFactIndex] = useState(null);
  const [expandedDates, setExpandedDates] = useState(() => new Set());
  const [categoryBackgrounds, setCategoryBackgrounds] = useState({});
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const tabsRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ opacity: 0 });
  const factIntervalRef = useRef(null);
  const factFadeRef = useRef(null);
  const dateBackgroundCacheRef = useRef({});
  const activeTabRef = useRef(tab);
  const isComposingKeywordsRef = useRef(false);
  const isComposingParagraphRef = useRef(false);
  const lastValidKeywordsRef = useRef("");
  const lastValidParagraphRef = useRef("");

  const normalizedMonthInput = normalizeDigits(monthInput);
  const normalizedDayInput = normalizeDigits(dayInput);
  const monthHasNonDigit = normalizedMonthInput.length > 0 && /[^0-9]/.test(normalizedMonthInput);
  const monthValue = !monthHasNonDigit && normalizedMonthInput ? Number(normalizedMonthInput) : NaN;
  const monthIsValid = Number.isInteger(monthValue) && monthValue >= 1 && monthValue <= 12;
  const safeMonth = monthIsValid ? monthValue : 1;
  const maxDay = daysByMonth[safeMonth - 1] || 31;
  const dayHasNonDigit = normalizedDayInput.length > 0 && /[^0-9]/.test(normalizedDayInput);
  const dayValue = !dayHasNonDigit && normalizedDayInput ? Number(normalizedDayInput) : NaN;
  const dayIsValid = Number.isInteger(dayValue) && dayValue >= 1 && dayValue <= maxDay;
  const monthError = monthInput
    ? monthHasNonDigit
      ? "数字のみ入力してください。"
      : monthIsValid
      ? ""
      : "1〜12の数字で入力してください。"
    : "";
  const dayError = dayInput
    ? dayHasNonDigit
      ? "数字のみ入力してください。"
      : dayIsValid
      ? ""
      : `1〜${maxDay}の数字で入力してください。`
    : "";
  const dateError =
    monthError && dayError
      ? `月: ${monthError} / 日: ${dayError}`
      : monthError
      ? `月: ${monthError}`
      : dayError
      ? `日: ${dayError}`
      : "";

  const keywordList = useMemo(() => parseKeywords(keywordsText), [keywordsText]);
  const keywordCountReached = keywordList.length >= KEYWORD_COUNT_LIMIT;
  const keywordCharReached = keywordsText.length >= KEYWORD_CHAR_LIMIT;
  const paragraphCharReached = paragraph.length >= PARAGRAPH_CHAR_LIMIT;

  const displayedResults = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.slice(0, visibleCount);
  }, [searchResults, visibleCount]);

  const factMessages = useMemo(() => {
    if (Array.isArray(fakeFacts)) {
      return fakeFacts.map((value) => String(value || "").trim()).filter(Boolean);
    }
    if (Array.isArray(fakeFacts?.messages)) {
      return fakeFacts.messages.map((value) => String(value || "").trim()).filter(Boolean);
    }
    return [];
  }, []);

  const currentFact =
    factMessages.length > 0 ? factMessages[factIndex % factMessages.length] : "";
  const timeoutMessage =
    error && String(error).toLowerCase().includes("timed out")
      ? "検索がタイムアウトしました。時間をおいて再度お試しください。"
      : "";
  const showTimeoutMessage = tab === "reverse" && timeoutMessage;

  useEffect(() => {
    if (isComposingKeywordsRef.current) return;
    if (isKeywordsInputAllowed(keywordsText, lastValidKeywordsRef.current)) {
      lastValidKeywordsRef.current = keywordsText;
    }
  }, [keywordsText]);

  useEffect(() => {
    if (isComposingParagraphRef.current) return;
    if (paragraph.length <= PARAGRAPH_CHAR_LIMIT) {
      lastValidParagraphRef.current = paragraph;
    }
  }, [paragraph]);

  const resetResults = () => {
    setDateResult(null);
    setSearchResults(null);
    setTotalResults(0);
    setNormalizedKeywords([]);
    setVisibleCount(PAGE_SIZE);
    setExpandedDates(new Set());
    setCategoryBackgrounds({});
    setReverseStatus("");
    setError("");
    setMonthInput("");
    setDayInput("");
    setKeywordsText("");
    setParagraph("");
    setReverseMode("keywords");
    lastValidKeywordsRef.current = "";
    lastValidParagraphRef.current = "";
  };

  useEffect(() => {
    activeTabRef.current = tab;
    resetResults();
  }, [tab]);
  const buildCategoryBackgrounds = (dateKeys) => {
    const map = {};
    (dateKeys || []).forEach((dateKey) => {
      const perDate = {};
      (meta.categories || []).forEach((category) => {
        const list = categoryImages?.[category.key];
        if (!Array.isArray(list) || list.length === 0) return;
        const choice = list[Math.floor(Math.random() * list.length)];
        if (choice) {
          perDate[category.key] = choice;
        }
      });
      if (Object.keys(perDate).length > 0) {
        map[dateKey] = perDate;
      }
    });
    return map;
  };
  const pickNextFactIndex = (current) => {
    if (factMessages.length <= 1) return current;
    let next = current;
    while (next === current) {
      next = Math.floor(Math.random() * factMessages.length);
    }
    return next;
  };

  const handleDateSearch = async () => {
    setError("");
    setMonthInput(normalizedMonthInput);
    setDayInput(normalizedDayInput);
    if (!monthIsValid || !dayIsValid) {
      setError("月と日を正しく入力してください。");
      return;
    }
    setLoading(true);
    setSearchResults(null);
    setVisibleCount(PAGE_SIZE);

    try {
      const response = await fetch(`/api/date?month=${monthValue}&day=${dayValue}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "日付検索に失敗しました。");
      }
      const data = await response.json();
      if (activeTabRef.current !== "date") return;
      setDateResult(data);
      const cache = dateBackgroundCacheRef.current;
      if (!cache[data.date]) {
        const built = buildCategoryBackgrounds([data.date]);
        cache[data.date] = built[data.date] || {};
      }
      const nextVisuals = cache[data.date];
      setCategoryBackgrounds(
        nextVisuals && Object.keys(nextVisuals).length > 0
          ? { [data.date]: nextVisuals }
          : {}
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReverseSearch = async () => {
    setError("");
    setDateResult(null);
    setSearchResults(null);
    setTotalResults(0);
    setVisibleCount(PAGE_SIZE);
    setNormalizedKeywords([]);
    if (reverseMode === "paragraph" && !paragraph.trim()) {
      setError("文章を入力してください。");
      return;
    }
    if (reverseMode === "keywords" && keywordList.length === 0) {
      setError("キーワードを入力してください。");
      return;
    }
    setLoading(true);
    setReverseStatus("処理中");
    setExpandedDates(new Set());
    setCategoryBackgrounds({});

    try {
      let keywords = keywordList;
      if (reverseMode === "paragraph") {
        const extractResponse = await fetch("/api/keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: paragraph }),
        });

        if (!extractResponse.ok) {
          const data = await extractResponse.json();
          throw new Error(data.error || "キーワード抽出に失敗しました。");
        }

        const extractData = await extractResponse.json();
        keywords = (extractData.keywords || []).filter(Boolean);
        if (keywords.length === 0) {
          setError("キーワードを抽出できませんでした。");
          return;
        }
        setKeywordsText(keywords.join(" "));
        setReverseMode("keywords");
      }

      const responsePromise = fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords,
          limit: RESULT_LIMIT,
        }),
      });
      const response = await responsePromise;

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "逆引き検索に失敗しました。");
      }

      const data = await response.json();
      if (activeTabRef.current !== "reverse") return;
      setSearchResults(data.results);
      setTotalResults(data.total);
      setVisibleCount(Math.min(PAGE_SIZE, data.results.length));
      if (Array.isArray(data.keywords)) {
        setNormalizedKeywords(data.keywords);
        if (reverseMode === "keywords") {
          setKeywordsText(data.keywords.join(" "));
        }
      } else {
        setNormalizedKeywords([]);
      }
      setCategoryBackgrounds(
        buildCategoryBackgrounds(data.results.map((result) => result.date))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setReverseStatus("");
    }
  };

  const renderItems = (itemsByCategory, highlightKeywords = [], dateKey) => {
    const categoryVisuals = dateKey ? categoryBackgrounds[dateKey] : null;
    const renderItemList = (items, listKey) =>
      items.map((item, index) => {
        const highlightTerms =
          Array.isArray(item.matchedKeywords) && item.matchedKeywords.length > 0
            ? item.matchedKeywords
            : highlightKeywords;
        const meanings = Array.isArray(item.meaning)
          ? item.meaning
          : item.meaning
          ? [item.meaning]
          : [];
        const meaningText = meanings.join(" / ");
        const matchDetails = Array.isArray(item.matchDetails) ? item.matchDetails : [];
        const nameMeta = matchDetails.filter((detail) => detail.target === "name");
        const meaningMeta = matchDetails.filter((detail) => detail.target !== "name");
        const nameMetaAllowed = nameMeta.filter(
          (detail) => Number(detail.percent) >= MATCH_PERCENT_MIN
        );
        const meaningMetaAllowed = meaningMeta.filter(
          (detail) => Number(detail.percent) >= MATCH_PERCENT_MIN
        );
        const nameHighlightTerms = filterHighlightTerms(highlightTerms, nameMetaAllowed);
        const meaningHighlightTerms = filterHighlightTerms(highlightTerms, meaningMetaAllowed);
        const hasLiteralMatch = meaningHighlightTerms.length
          ? hasTextMatch(meaningText, meaningHighlightTerms)
          : false;
        const hasSemanticMatch = meaningMetaAllowed.some((detail) => detail.source === "semantic");
        const semanticIndex = Number.isInteger(item.semanticMeaningIndex)
          ? item.semanticMeaningIndex
          : null;
        const shouldSemanticHighlight =
          item.matchedByEmbedding && hasSemanticMatch && !hasLiteralMatch;
        const shouldHighlightPhrase = shouldSemanticHighlight && semanticIndex !== null;
        const nameText =
          nameHighlightTerms.length > 0
            ? renderHighlightedText(item.name, nameHighlightTerms)
            : item.name;

        return (
          <div className="item" key={`${listKey}-${index}`}>
            <div className="item-name">
              {nameText}
              {renderMatchMeta(nameMeta)}
            </div>
            {meanings.length ? (
              <div className="item-meaning">
                <span className="item-meaning__wrap">
                  <span className="item-meaning__text">
                    {meaningHighlightTerms.length > 0
                      ? hasLiteralMatch
                        ? renderHighlightedText(meaningText, meaningHighlightTerms)
                        : shouldHighlightPhrase
                        ? meanings.map((meaning, meaningIndex) => (
                            <span key={`${listKey}-${index}-meaning-${meaningIndex}`}>
                              {meaningIndex > 0 ? " / " : ""}
                              {meaningIndex === semanticIndex ? (
                                <mark className="keyword-mark keyword-mark--semantic">
                                  {meaning}
                                </mark>
                              ) : (
                                meaning
                              )}
                            </span>
                          ))
                        : shouldSemanticHighlight
                        ? (
                            <mark className="keyword-mark keyword-mark--semantic">
                              {meaningText}
                            </mark>
                          )
                        : meaningText
                      : meaningText}
                  </span>
                  {renderMatchMeta(meaningMeta, { topOnly: true })}
                </span>
              </div>
            ) : null}
          </div>
        );
      });

    const monthlyKey = "stone_monthly";
    const monthLabel = dateKey ? `${parseInt(dateKey.split("-")[0], 10)}月` : "今月";
    const dayLabel = dateKey ? `${parseInt(dateKey.split("-")[1], 10)}日` : "本日";

    return meta.categories.map((category) => {
      if (category.key === monthlyKey) return null;

      const monthlyItems =
        category.key === "stone"
          ? (itemsByCategory?.[monthlyKey] || []).filter((item) => {
              if (Array.isArray(item.meaning)) return item.meaning.length > 0;
              return Boolean(item.meaning);
            })
          : [];
      const dailyItems = itemsByCategory?.[category.key] || [];
      const items = category.key === "stone" ? dailyItems : dailyItems;

      if (category.key === "stone") {
        if (dailyItems.length === 0 && monthlyItems.length === 0) return null;
      } else if (items.length === 0) {
        return null;
      }

      const colorCode = category.key === "color" ? getCategoryColorCode(items) : "";
      const visualKey = category.key === "stone" ? "stone" : category.key;
      const categoryVisual = colorCode ? null : categoryVisuals?.[visualKey];
      const categoryStyle = {};
      if (categoryVisual) {
        categoryStyle["--category-bg"] = `url("${categoryVisual.src}")`;
      }
      if (colorCode) {
        categoryStyle["--category-color"] = colorCode;
      }
      const hasVisual = Boolean(categoryVisual || colorCode);

      return (
        <div
          className={`category ${hasVisual ? "category--visual" : ""} ${
            colorCode ? "category--color" : ""
          }`}
          key={category.key}
          style={Object.keys(categoryStyle).length ? categoryStyle : undefined}
        >
          <h4>{category.label}</h4>
          <div className="category-items">
            {category.key === "stone" ? (
              <>
                {monthlyItems.length ? (
                  <>
                    <div className="category-subheading">{monthLabel}の誕生石</div>
                    {renderItemList(monthlyItems, "stone-monthly")}
                  </>
                ) : null}
                {monthlyItems.length && dailyItems.length ? (
                  <div className="category-divider" aria-hidden="true" />
                ) : null}
                {dailyItems.length ? (
                  <>
                    <div className="category-subheading">{dayLabel}の誕生石</div>
                    {renderItemList(dailyItems, "stone-daily")}
                  </>
                ) : null}
              </>
            ) : (
              renderItemList(items, category.key)
            )}
          </div>
        </div>
      );
    });
  };

  const countItems = (itemsByCategory) => {
    if (!itemsByCategory) return 0;
    return Object.values(itemsByCategory).reduce((sum, list) => sum + list.length, 0);
  };

  const toggleDateItems = (dateKey) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  useEffect(() => {
    const updateIndicator = () => {
      const container = tabsRef.current;
      if (!container) return;
      const active = container.querySelector(".tab.active");
      if (!active) return;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const extra = 18;
      const width = activeRect.width + extra;
      const left = activeRect.left - containerRect.left - extra / 2;
      setIndicatorStyle({
        width: `${width}px`,
        transform: `translateX(${left}px)`,
        opacity: 1,
      });
    };

    const raf = requestAnimationFrame(updateIndicator);
    window.addEventListener("resize", updateIndicator);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateIndicator);
    };
  }, [tab]);

  useEffect(() => {
    if (!reverseStatus || factMessages.length === 0) return;
    const initialIndex = Math.floor(Math.random() * factMessages.length);
    setFactIndex(initialIndex);
    setPrevFactIndex(null);

    if (factMessages.length <= 1) {
      return () => {};
    }

    if (factIntervalRef.current) {
      clearInterval(factIntervalRef.current);
    }
    if (factFadeRef.current) {
      clearTimeout(factFadeRef.current);
    }

    factIntervalRef.current = setInterval(() => {
      setFactIndex((current) => {
        const next = pickNextFactIndex(current);
        setPrevFactIndex(current);
        if (factFadeRef.current) {
          clearTimeout(factFadeRef.current);
        }
        factFadeRef.current = setTimeout(() => {
          setPrevFactIndex(null);
        }, FACT_FADE_MS);
        return next;
      });
    }, FACT_INTERVAL_MS);

    return () => {
      if (factIntervalRef.current) {
        clearInterval(factIntervalRef.current);
        factIntervalRef.current = null;
      }
      if (factFadeRef.current) {
        clearTimeout(factFadeRef.current);
        factFadeRef.current = null;
      }
      setPrevFactIndex(null);
    };
  }, [reverseStatus, factMessages.length]);

  return (
    <main className="page">
      <header className="hero">
        <h1 className="hero__title">{meta.appName}</h1>
        <p className="hero__lead">
          {meta.heroSubtitle ??
            "誕生花・誕生石・誕生色など、誕生○○の意味をまとめて見える化します。"}
        </p>
      </header>

      <section className="panel panel--search">
        <div className="tabs" ref={tabsRef}>
          <button
            className={`tab ${tab === "date" ? "active" : ""}`}
            onClick={() => setTab("date")}
          >
            誕生日から探す
          </button>
          <button
            className={`tab ${tab === "reverse" ? "active" : ""}`}
            onClick={() => setTab("reverse")}
          >
            逆引きで探す
          </button>
          <span className="tabs-indicator" style={indicatorStyle} aria-hidden="true" />
        </div>

        {tab === "date" ? (
          <div className="form-body">
            <div className="field-row">
              <div className="field">
                <label>月</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={monthInput}
                  onChange={(e) => {
                    setMonthInput(e.target.value);
                  }}
                  onBlur={(e) => {
                    setMonthInput(normalizeDigits(e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setMonthInput(normalizeDigits(e.currentTarget.value));
                    }
                  }}
                />
              </div>
              <div className="field">
                <label>日</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={dayInput}
                  onChange={(e) => {
                    setDayInput(e.target.value);
                  }}
                  onBlur={(e) => {
                    setDayInput(normalizeDigits(e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setDayInput(normalizeDigits(e.currentTarget.value));
                    }
                  }}
                />
              </div>
              <div className="inline-row" style={{ alignSelf: "flex-end" }}>
                <button
                  className="primary-btn"
                  onClick={handleDateSearch}
                  disabled={loading || !monthIsValid || !dayIsValid}
                >
                  誕生日を検索
                </button>
              </div>
            </div>
            {dateError ? (
              <div className="field-error field-error--single" aria-live="polite">
                {dateError}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="form-body">
            <div className="mode-toggle">
              <div className="mode-toggle__buttons" role="tablist" aria-label="検索方法">
                <button
                  type="button"
                  className={`mode-toggle__button ${reverseMode === "keywords" ? "active" : ""}`}
                  onClick={() => setReverseMode("keywords")}
                  aria-pressed={reverseMode === "keywords"}
                >
                  キーワード検索
                </button>
                <button
                  type="button"
                  className={`mode-toggle__button ${reverseMode === "paragraph" ? "active" : ""}`}
                  onClick={() => setReverseMode("paragraph")}
                  aria-pressed={reverseMode === "paragraph"}
                >
                  文章検索
                </button>
              </div>
            </div>

            {reverseMode === "keywords" ? (
              <div>
                <label>キーワード（スペース区切り）</label>
                <input
                  value={keywordsText}
                  onCompositionStart={() => {
                    isComposingKeywordsRef.current = true;
                  }}
                  onCompositionEnd={(e) => {
                    isComposingKeywordsRef.current = false;
                    const nextValue = e.currentTarget.value;
                    if (!isKeywordsInputAllowed(nextValue, lastValidKeywordsRef.current)) {
                      setKeywordsText(lastValidKeywordsRef.current);
                      return;
                    }
                    setKeywordsText(nextValue);
                    lastValidKeywordsRef.current = nextValue;
                  }}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (isComposingKeywordsRef.current) {
                      setKeywordsText(nextValue);
                      return;
                    }
                    if (!isKeywordsInputAllowed(nextValue, lastValidKeywordsRef.current)) {
                      return;
                    }
                    setKeywordsText(nextValue);
                    lastValidKeywordsRef.current = nextValue;
                  }}
                  placeholder="例: 勇敢 親切"
                  maxLength={KEYWORD_CHAR_LIMIT}
                />
                <div className="field-count">
                  <span
                    className={`field-count__item ${
                      keywordCountReached ? "field-count__item--limit" : ""
                    }`}
                  >
                    キーワード {keywordList.length}/{KEYWORD_COUNT_LIMIT}
                  </span>
                  　
                  <span
                    className={`field-count__item ${
                      keywordCharReached ? "field-count__item--limit" : ""
                    }`}
                  >
                    文字 {keywordsText.length}/{KEYWORD_CHAR_LIMIT}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label>文章入力</label>
                <textarea
                  value={paragraph}
                  onCompositionStart={() => {
                    isComposingParagraphRef.current = true;
                  }}
                  onCompositionEnd={(e) => {
                    isComposingParagraphRef.current = false;
                    const nextValue = e.currentTarget.value;
                    if (nextValue.length > PARAGRAPH_CHAR_LIMIT) {
                      setParagraph(lastValidParagraphRef.current);
                      return;
                    }
                    setParagraph(nextValue);
                    lastValidParagraphRef.current = nextValue;
                  }}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (isComposingParagraphRef.current) {
                      setParagraph(nextValue);
                      return;
                    }
                    if (nextValue.length > PARAGRAPH_CHAR_LIMIT) {
                      return;
                    }
                    setParagraph(nextValue);
                    lastValidParagraphRef.current = nextValue;
                  }}
                  placeholder="キャラクターの概要を入力してください"
                  maxLength={PARAGRAPH_CHAR_LIMIT}
                />
                <div className={`field-count ${paragraphCharReached ? "field-count--limit" : ""}`}>
                  {paragraph.length} / {PARAGRAPH_CHAR_LIMIT}
                </div>
              </div>
            )}

            <div className="inline-row">
              <button
                className="primary-btn"
                onClick={() => handleReverseSearch()}
                disabled={
                  loading ||
                  (reverseMode === "keywords" ? keywordList.length === 0 : !paragraph.trim())
                }
              >
                逆引き検索
              </button>
            </div>
            {reverseStatus && tab === "reverse" ? (
              <div className="loading-indicator" role="status" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                {reverseStatus}
              </div>
            ) : null}
            {reverseStatus && currentFact ? (
              <div
                className="loading-fact-stack"
                style={{ "--fact-fade": `${FACT_FADE_MS}ms` }}
              >
                {Number.isInteger(prevFactIndex) ? (
                  <div
                    className="loading-fact loading-fact--exit"
                    key={`fact-prev-${prevFactIndex}`}
                  >
                    嘘知識：{factMessages[prevFactIndex]}
                  </div>
                ) : null}
                <div
                  className="loading-fact loading-fact--enter"
                  key={`fact-${factIndex}`}
                  aria-live="polite"
                >
                  嘘知識：{currentFact}
                </div>
              </div>
            ) : null}
            {showTimeoutMessage ? (
              <div className="notice notice--empty">{timeoutMessage}</div>
            ) : tab === "reverse" && searchResults && searchResults.length === 0 ? (
              <div className="notice notice--empty">該当する誕生日が見つかりませんでした。</div>
            ) : null}
            <p className="form-note">{meta.aiNotice}</p>
          </div>
        )}

        {error && !showTimeoutMessage ? <div className="notice">{error}</div> : null}
      </section>

      {searchResults && totalResults > 0 ? (
        <div className="result-meta">
          <div className="notice">
            表示 {displayedResults.length} / {totalResults}
          </div>
        </div>
      ) : null}

      <section className="results">
        {dateResult ? (
          <div className="result-card">
            <div className="result-header">
              <div className="result-date">
                {formatDateLabel(dateResult.date)}
              </div>
            </div>
            <div className="category-list">
              {renderItems(dateResult.items, [], dateResult.date)}
              {Object.values(dateResult.items || {}).every((items) => !items.length) ? (
                <div className="notice">データが未登録です。</div>
              ) : null}
            </div>
          </div>
        ) : null}

        {displayedResults.map((result) => {
          const isExpanded = expandedDates.has(result.date);
          const allCount = countItems(result.allItems);
          const matchedCount = countItems(result.matchedItems);
          return (
              <div className="result-card" key={result.date}>
                <div className="result-header">
                  <div className="result-date">{formatDateLabel(result.date)}</div>
                  <div className="score">
                    {renderScoreSummary(result, normalizedKeywords)}
                  </div>
                </div>
                <div className="category-list">
                  {renderItems(
                    isExpanded ? result.allItems : result.matchedItems,
                    normalizedKeywords,
                    result.date
                  )}
                </div>
              {allCount > matchedCount ? (
                <div className="card-actions">
                  <button className="secondary-btn" onClick={() => toggleDateItems(result.date)}>
                    {isExpanded ? "関連のみ表示" : "全て表示"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

      </section>

      {searchResults && visibleCount < totalResults ? (
        <div className="result-meta result-meta--bottom">
          <button
            className="secondary-btn"
            onClick={() =>
              setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, totalResults))
            }
          >
            さらに10件表示
          </button>
        </div>
      ) : null}

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__creator">
            <span className="site-footer__label">Developed by</span>
            <a
              className="site-footer__x"
              href="https://x.com/maika_dev"
              target="_blank"
              rel="noreferrer"
            >
              まいか（@maika_dev）
            </a>
          </div>
          <nav className="site-footer__links" aria-label="フッターリンク">
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSeeVyoHW8lAr8EthfS8_uDRpumsyuftb3CyuAUlvab5H584ZQ/viewform?usp=pp_url&entry.1389388372=BirthSymbol+Index&entry.897614082=%E4%B8%8D%E5%85%B7%E5%90%88"
              target="_blank"
              rel="noreferrer"
            >
              お問い合わせ
            </a>
            <a href="/support#gift" target="_blank" rel="noreferrer">
              開発者に投げ銭する
            </a>
            <a href="/support#updates" target="_blank" rel="noreferrer">
              更新履歴 / お知らせ
            </a>
            <a href="/support#terms" target="_blank" rel="noreferrer">
              利用規約
            </a>
            <a href="/support#privacy" target="_blank" rel="noreferrer">
              プライバシーポリシー
            </a>
          </nav>
        </div>
      </footer>

      <div className={`support-menu ${supportMenuOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className="support-menu__toggle"
          onClick={() => setSupportMenuOpen((prev) => !prev)}
          aria-expanded={supportMenuOpen}
          aria-controls="support-menu-panel"
        >
          <span className="support-menu__icon" aria-hidden="true">
            ≡
          </span>
          <span className="sr-only">メニュー</span>
        </button>
        <div className="support-menu__panel" id="support-menu-panel" role="menu">
          <a
            className="support-menu__item"
            role="menuitem"
            href="https://docs.google.com/forms/d/e/1FAIpQLSeeVyoHW8lAr8EthfS8_uDRpumsyuftb3CyuAUlvab5H584ZQ/viewform?usp=pp_url&entry.1389388372=BirthSymbol+Index&entry.897614082=%E4%B8%8D%E5%85%B7%E5%90%88"
            target="_blank"
            rel="noreferrer"
          >
            お問い合わせ
          </a>
          <a
            className="support-menu__item"
            role="menuitem"
            href="/support#gift"
            target="_blank"
            rel="noreferrer"
          >
            開発者に投げ銭する
          </a>
          <a
            className="support-menu__item"
            role="menuitem"
            href="/support#updates"
            target="_blank"
            rel="noreferrer"
          >
            更新履歴 / お知らせ
          </a>
          <a
            className="support-menu__item"
            role="menuitem"
            href="/support#terms"
            target="_blank"
            rel="noreferrer"
          >
            利用規約
          </a>
          <a
            className="support-menu__item"
            role="menuitem"
            href="/support#privacy"
            target="_blank"
            rel="noreferrer"
          >
            プライバシーポリシー
          </a>
        </div>
      </div>
    </main>
  );
}

function formatDateLabel(dateKey) {
  const [month, day] = dateKey.split("-");
  return `${Number(month)}月${Number(day)}日`;
}
