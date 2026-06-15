"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  fetchKnowledgeArticles,
  getCategoryMeta,
  parseArticleContent,
  KNOWLEDGE_CATEGORIES,
  type KnowledgeArticle,
} from "@/lib/aromaterapi/aromatherapyKnowledgeData";

// -------------------------------------------------------
// Tasarım token'ları
// -------------------------------------------------------

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-slate-950";

const scrollArea =
  "overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// -------------------------------------------------------
// Makale içerik render bileşeni
// -------------------------------------------------------

function ArticleBody({ content }: { content: string }) {
  const blocks = useMemo(() => parseArticleContent(content), [content]);
  return (
    <div className="space-y-3">
      {blocks.map((block, i) =>
        block.type === "heading" ? (
          <h3
            key={i}
            className="pt-2 text-[14px] font-black tracking-tight text-slate-900"
          >
            {block.text}
          </h3>
        ) : (
          <p key={i} className="text-[13px] leading-[1.7] text-slate-700">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

// -------------------------------------------------------
// Makale kartı
// -------------------------------------------------------

function ArticleCard({
  article,
  isSelected,
  onSelect,
}: {
  article: KnowledgeArticle;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const cat = getCategoryMeta(article.category);

  return (
    <article
      className={`group flex cursor-pointer flex-col rounded-2xl border bg-gradient-to-br p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${cat.cardCls} ${
        isSelected
          ? "ring-2 ring-violet-400/60 ring-offset-1"
          : ""
      }`}
      onClick={onSelect}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${cat.badgeCls}`}
        >
          <span>{cat.icon}</span>
          <span>{cat.label}</span>
        </span>
      </div>

      <h2 className="text-[14px] font-black leading-snug tracking-tight text-slate-950">
        {article.title}
      </h2>

      <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-slate-600">
        {article.summary}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-400">
          {article.content.length} karakter
        </span>
        <span
          className={`text-[11px] font-bold text-violet-600 transition group-hover:text-violet-800`}
        >
          Oku →
        </span>
      </div>
    </article>
  );
}

// -------------------------------------------------------
// Okuma Bölmesi
// -------------------------------------------------------

function ReadingPane({
  article,
  onClose,
}: {
  article: KnowledgeArticle | null;
  onClose: () => void;
}) {
  const cat = article ? getCategoryMeta(article.category) : null;

  if (!article || !cat) {
    return (
      <div className="hidden lg:flex h-full flex-col items-center justify-center rounded-[26px] border border-slate-100 bg-white/70 p-8 text-center shadow-sm">
        <div className="text-4xl opacity-30">📖</div>
        <p className="mt-3 text-[13px] font-medium text-slate-400">
          Okumak için bir makale seçin
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[26px] border border-white/80 bg-white/90 shadow-[0_12px_40px_rgba(15,23,42,0.07)] ring-1 ring-white/90">
      {/* Başlık */}
      <div className="shrink-0 border-b border-slate-100/80 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span
              className={`mb-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${cat.badgeCls}`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </span>
            <h2 className="mt-1.5 text-[18px] font-black leading-snug tracking-tight text-slate-950">
              {article.title}
            </h2>
            {article.source && (
              <p className="mt-1 text-[11px] font-medium text-slate-400">
                Kaynak: {article.source}
              </p>
            )}
          </div>
          {/* Mobil kapatma butonu */}
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            ← Geri
          </button>
        </div>
      </div>

      {/* İçerik */}
      <div className={`${scrollArea} flex-1 p-5`}>
        <ArticleBody content={article.content} />

        <div className="mt-8 border-t border-slate-100 pt-4">
          <p className="text-[11px] font-medium text-slate-400">
            📋 {article.source}
          </p>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Ana sayfa
// -------------------------------------------------------

export default function BilgiBankasiPage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadArticles = useCallback(async (tid: string) => {
    setLoading(true);
    setErrorMsg("");
    const { articles: data, error } = await fetchKnowledgeArticles(tid);
    setLoading(false);
    if (error) { setErrorMsg(`Makaleler yüklenemedi: ${error}`); return; }
    setArticles(data);
    // İlk makaleyi otomatik seç
    if (data.length > 0 && !selectedId) setSelectedId(data[0]!.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runInEffect(() => {
      void (async () => {
        const tid = await getSyncedTenantId();
        if (!tid) { setLoading(false); setErrorMsg(MISSING_SESSION_TENANT_MESSAGE); return; }
        await loadArticles(tid);
      })();
    });
  }, [loadArticles]);

  useBfcacheRefresh();

  const filteredArticles = useMemo(
    () =>
      activeCategory === "all"
        ? articles
        : articles.filter((a) => a.category === activeCategory),
    [articles, activeCategory],
  );

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === selectedId) ?? null,
    [articles, selectedId],
  );

  // Mobilde: makale seçilince sadece okuma bölmesi gösterilir
  const mobileShowArticle = selectedId !== null;

  function selectArticle(id: string) {
    setSelectedId(id);
  }

  function clearSelection() {
    setSelectedId(null);
  }

  // Kategori değişince otomatik seçimi güncelleme (opsiyonel)
  function changeCategory(slug: string) {
    setActiveCategory(slug);
    setSelectedId(null);
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute -left-20 -top-20 h-[420px] w-[420px] rounded-full bg-violet-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-[320px] w-[320px] rounded-full bg-amber-200/15 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] space-y-4 px-4 py-5 sm:px-6 lg:px-8 xl:px-10">

        {/* Header */}
        <header className="rounded-[28px] border border-violet-200/50 bg-white/80 p-5 shadow-sm backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-violet-50/90 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-violet-800 shadow-sm">
                <span>📚</span>
                <span>Aromaterapi — Bilgi Bankası</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Bilgi Bankası
              </h1>
              <p className="mt-1.5 max-w-xl text-sm font-medium leading-relaxed text-slate-600">
                Kimyasal bileşenler, elde etme yöntemleri, etki mekanizmaları ve klinik
                uygulamalar — aromaterapi referans makale kütüphanesi.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!loading && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700">
                  {articles.length} makale
                </span>
              )}
              <Link
                href="/aromaterapi"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-violet-300/55 bg-gradient-to-r from-violet-500 to-purple-500 px-3.5 text-[12px] font-black text-white shadow-md ring-1 ring-white/35 transition hover:brightness-105"
              >
                <span aria-hidden className="text-sm leading-none">←</span>
                <span className="hidden sm:inline">Aromaterapi Ana</span>
                <span className="sm:hidden">Ana</span>
              </Link>
            </div>
          </div>
        </header>

        {errorMsg ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMsg}
          </div>
        ) : null}

        {/* Kategori filtreleri */}
        <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2 pb-0.5">
            {KNOWLEDGE_CATEGORIES.map((cat) => {
              const count =
                cat.slug === "all"
                  ? articles.length
                  : articles.filter((a) => a.category === cat.slug).length;
              const active = activeCategory === cat.slug;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => changeCategory(cat.slug)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition ${
                    active
                      ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
                      : "border border-violet-100/80 bg-white/80 text-slate-600 hover:bg-violet-50"
                  }`}
                >
                  <span className="text-sm leading-none">{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span
                    className={`rounded-full px-1.5 text-[9px] font-black ${
                      active ? "bg-white/20 text-white" : "bg-violet-50 text-violet-700"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* İçerik — 2 kolon (desktop) / tek kolon (mobil) */}
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-[26px] bg-white/70 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Makaleler yükleniyor…</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[26px] bg-white/70 p-8 text-center shadow-sm">
            <div className="text-4xl">📚</div>
            <h2 className="mt-3 text-lg font-black text-slate-900">Henüz makale yok</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Bilgi bankası içeriği import aşamasında yüklenecek.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr] lg:items-start">

            {/* Sol: makale listesi */}
            <div className={`${mobileShowArticle ? "hidden lg:block" : "block"}`}>
              {filteredArticles.length === 0 ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white/70 p-6 text-center shadow-sm">
                  <p className="text-[13px] font-medium text-slate-400">
                    Bu kategoride makale yok
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredArticles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      isSelected={selectedId === article.id}
                      onSelect={() => selectArticle(article.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Sağ: okuma bölmesi */}
            <div
              className={`lg:sticky lg:top-4 ${
                mobileShowArticle ? "block" : "hidden lg:block"
              }`}
              style={{ maxHeight: "calc(100vh - 7rem)" }}
            >
              <ReadingPane
                article={selectedArticle}
                onClose={clearSelection}
              />
            </div>

          </div>
        )}

        {/* Alt bilgi */}
        <div className="rounded-2xl border border-violet-100/60 bg-white/60 px-4 py-3 backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-500">
            📋 Kaynak: Aromaterapi.xlsx — Genel Bilgi ve Elde Etme Yöntemleri sekmeleri.
            Word raporu dışa aktarma özelliği ilerleyen aşamada eklenecek.
          </p>
        </div>
      </div>
    </main>
  );
}
