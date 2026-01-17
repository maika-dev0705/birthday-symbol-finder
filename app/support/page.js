"use client";

import { useEffect, useRef, useState } from "react";
import supportUpdates from "../../content/support-updates.json";

const tabs = [
  { id: "gift", label: "投げ銭する" },
  { id: "updates", label: "更新履歴 / お知らせ" },
  { id: "terms", label: "利用規約" },
  { id: "privacy", label: "プライバシーポリシー" },
];

const policyContent = {
  terms: {
    intro:
      "本サイトは誕生○○に関する情報を一覧・検索できるツールです。ご利用にあたっては以下に同意いただいたものとします。",
    lastUpdated: "最終更新日: 2026/01/16",
    sections: [
      {
        title: "免責事項",
        items: [
          "本サイトの情報は参考情報であり、正確性・完全性を保証しません。",
          "本サイトの利用により生じた損害について、開発者は一切の責任を負いません。",
        ],
      },
      {
        title: "禁止事項",
        items: [
          "サイトやサービスの運営を妨げる行為",
          "不正アクセス・過度な負荷をかける行為",
          "法令または公序良俗に反する行為",
          "本サイトの内容や機能を無断で商用利用する行為",
          "自作発言や権利者を誤認させる行為",
        ],
      },
      {
        title: "サービスの変更・停止",
        items: [
          "予告なく内容の変更、公開停止を行う場合があります。",
          "利用状況に応じて、機能の一部を有料化する場合があります。",
          "有料化される場合でも、利用者が申込みを行わない限り料金は発生しません。",
        ],
      },
      {
        title: "外部リンク",
        items: ["外部サイトの内容について開発者は責任を負いません。"],
      },
      {
        title: "AIの利用",
        items: [
          "逆引き検索ではAIを使用します。",
          "文章検索では、入力文からキーワードを抽出するためにAIを使用します。",
          "検索結果の関連度評価のためにAIを使用する場合があります。",
          "入力内容はAIの学習に使用しません。",
        ],
      },
      {
        title: "著作権・利用",
        items: [
          "本サイト内の文章・構成・デザイン・プログラムなど、開発者が作成した部分の著作権は開発者（まいか）に帰属します。",
          "誕生○○の名称・意味文・画像など第三者の権利が関わる内容の著作権は、各権利者に帰属します。",
          "非商用での転載・紹介は可能ですが、出典元の表記を条件とします。その際、ひとことご連絡いただけると嬉しいです（必須ではありません）。",
        ],
      },
      {
        title: "準拠法",
        items: ["本規約は日本法に準拠します。"],
      },
    ],
    sourcesTitle: "出典・参考サイト",
    sources: [
      "https://andplants.jp",
      "https://www.oiwai-item.com",
      "https://monokotoba.com",
      "https://aqsakana.com",
      "https://pixabay.com",
    ],
  },
  privacy: {
    intro: "利用者のプライバシーを尊重し、以下の方針で情報を取り扱います。",
    lastUpdated: "最終更新日: 2026/01/16",
    sections: [
      {
        title: "取得する情報と利用目的",
        items: [
          "逆引き検索で入力された文章やキーワード：検索結果の生成に使用（保存しません）",
          "お問い合わせフォームに入力された内容とメールアドレス：お問い合わせ対応・必要に応じた返信に使用",
          "アクセスログ（ホスティング提供の範囲で記録される場合があります）：不正アクセス/スパムの検知、障害調査、安定運用のために使用",
        ],
      },
      {
        title: "AIの利用について",
        items: [
          "逆引き検索では、文章からのキーワード抽出や関連度評価のためにAIを使用します。",
          "入力内容はAIの学習に使用しない設定で利用します。",
        ],
      },
      {
        title: "外部サービス",
        items: [
          "お問い合わせフォームはGoogleフォームを利用しています。",
          "AI処理にOpenAIのAPIを利用しています。",
          "これらの外部サービスでの取り扱いは各サービスの規約に準拠します。",
        ],
      },
      {
        title: "解析ツール",
        items: [
          "現在は解析ツール（Google Analytics等）を使用していません。",
          "利用開始する場合は本ポリシーを更新します。",
        ],
      },
      {
        title: "第三者提供",
        items: [
          "法令に基づく場合を除き、取得した情報を第三者に提供しません。",
        ],
      },
      {
        title: "保管期間",
        items: ["取得した情報は、利用目的の達成に必要な期間のみ保持します。"],
      },
      {
        title: "改定",
        items: ["本ポリシーは必要に応じて改定することがあります。"],
      },
      {
        title: "お問い合わせ",
        items: ["お問い合わせはフォームから受け付けます。"],
      },
    ],
  },
};

const AMAZON_GIFT_URL =
  "https://www.amazon.co.jp/dp/B004N3APGO?ref=altParentAsins_treatment_text_from_Any_to_Amazon&th=1&gpo=150";
const CONTACT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeeVyoHW8lAr8EthfS8_uDRpumsyuftb3CyuAUlvab5H584ZQ/viewform?usp=pp_url&entry.1389388372=BirthSymbol+Index&entry.897614082=%E4%B8%8D%E5%85%B7%E5%90%88";

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState("gift");
  const [isReady, setIsReady] = useState(false);
  const [indicatorStyle, setIndicatorStyle] = useState({ opacity: 0 });
  const tabsRef = useRef(null);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (tabs.some((tab) => tab.id === hash)) {
        setActiveTab(hash);
        setIsReady(true);
        return;
      }
      setActiveTab("gift");
      setIsReady(true);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (window.location.hash !== `#${tabId}`) {
      window.history.replaceState(null, "", `#${tabId}`);
    }
  };

  useEffect(() => {
    if (!isReady) return;
    const updateIndicator = () => {
      const container = tabsRef.current;
      if (!container) return;
      const active = container.querySelector(".tab.active");
      if (!active) return;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const extra = 18;
      const width = activeRect.width + extra;
      const left =
        activeRect.left - containerRect.left - extra / 2 + container.scrollLeft;
      setIndicatorStyle({
        width: `${width}px`,
        transform: `translateX(${left}px)`,
        opacity: 1,
      });
    };

    const raf = requestAnimationFrame(updateIndicator);
    tabsRef.current?.addEventListener("scroll", updateIndicator, {
      passive: true,
    });
    window.addEventListener("resize", updateIndicator);
    return () => {
      cancelAnimationFrame(raf);
      tabsRef.current?.removeEventListener("scroll", updateIndicator);
      window.removeEventListener("resize", updateIndicator);
    };
  }, [activeTab, isReady]);

  const updates = supportUpdates || { items: [] };
  const updateItems = Array.isArray(updates.items) ? updates.items : [];
  const orderedUpdateItems = [...updateItems].reverse();
  const activePolicy = policyContent[activeTab];

  return (
    <main className="page support-page">
      <header className="hero support-hero">
        <h1 className="hero__title">Support</h1>
      </header>

      <section className="panel panel--search support-panel">
        {!isReady ? (
          <div className="support-loading" aria-live="polite">
            読み込み中...
          </div>
        ) : (
          <>
            <div
              className="tabs support-tabs"
              ref={tabsRef}
              role="tablist"
              aria-label="サポートメニュー"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`tab ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => handleTabClick(tab.id)}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                >
                  {tab.label}
                </button>
              ))}
              <span
                className="tabs-indicator"
                style={indicatorStyle}
                aria-hidden="true"
              />
            </div>

            <div className="support-content" role="tabpanel">
              {activeTab === "gift" ? (
                <>
                  <p className="support-content__text">
                    応援ありがとうございます！
                    <br />
                    150円：うれしいです。モチベーションが上がります！
                    <br />
                    300円：やったー！コーヒーを飲みながら開発できます！
                    <br />
                    500円：いいんですか？コーヒーに加えてお菓子も食べちゃいます！
                    <br />
                    <br />
                    以下リンク先で金額を入力し、受取人は{" "}
                    <span className="support-content__em">
                      maika-dev@googlegroups.com
                    </span>{" "}
                    宛てにお願いします！
                  </p>
                  <a
                    className="support-content__link"
                    href={AMAZON_GIFT_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Amazonギフト券を開く
                  </a>
                </>
              ) : activeTab === "updates" ? (
                <>
                  {orderedUpdateItems.length === 0 ? (
                    <p className="support-content__text">
                      まだお知らせはありません。
                    </p>
                  ) : (
                    <div className="support-updates">
                      {orderedUpdateItems.map((item, index) => (
                        <div
                          className="support-update"
                          key={`${item.date}-${item.title}-${index}`}
                        >
                          <p className="support-update__meta">
                            <span className="support-update__date">
                              {item.date}
                            </span>
                            <span className="support-update__title">
                              {item.title}
                            </span>
                          </p>
                          <p className="support-update__body">{item.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : activePolicy ? (
                <>
                  {activePolicy.intro ? (
                    <p className="support-content__text">
                      {activePolicy.intro}
                    </p>
                  ) : null}
                  {activePolicy.lastUpdated ? (
                    <p className="support-policy__meta">
                      {activePolicy.lastUpdated}
                    </p>
                  ) : null}
                  <div className="support-policy">
                    {activePolicy.sections.map((section, index) => (
                      <div className="support-policy__section" key={section.title}>
                        <p className="support-policy__title">
                          {index + 1}. {section.title}
                        </p>
                        <ul className="support-policy__list">
                          {section.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {activePolicy.sourcesTitle ? (
                    <div className="support-policy__section">
                      <p className="support-policy__title">
                        {activePolicy.sourcesTitle}
                      </p>
                      <ul className="support-policy__list">
                        {activePolicy.sources.map((source) => (
                          <li key={source}>
                            <a
                              className="support-content__anchor"
                              href={source}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {activeTab === "privacy" ? (
                    <a
                      className="support-content__anchor"
                      href={CONTACT_FORM_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      お問い合わせフォームへ
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="support-content__text"></p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
