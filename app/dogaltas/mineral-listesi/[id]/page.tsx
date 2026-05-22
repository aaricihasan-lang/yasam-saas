"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { ensureMineralStringArray } from "@/lib/dogaltas/mineralsListFetch";
import type { MineralContentTypography } from "@/lib/dogaltas/mineralDetailFontSize";
import { useMineralDetailFontSize } from "@/lib/dogaltas/useMineralDetailFontSize";
import { supabase } from "@/lib/supabase";

const MINERALS_DETAIL_SELECT =
  "id,source_id,name,aciklama,fiziksel,zihinsel,fizyoloji,eksiklik_belirtileri,fazlalik_belirtileri,doz_asimi,iceren_taslar,organ_etkileri,cakralar,kategori,created_at";

const HIGHLIGHT_MARK_CLASS = "rounded bg-yellow-200 px-1 font-bold text-slate-950";
const SEARCH_MATCH_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700";
const SEARCH_MATCH_CARD_CLASS = "border-rose-300 ring-2 ring-rose-100";

type MineralRecord = {
  id: string;
  source_id: string;
  name: string;
  aciklama: string | null;
  fiziksel: string[];
  zihinsel: string[];
  fizyoloji: string[];
  eksiklik_belirtileri: string[];
  fazlalik_belirtileri: string[];
  doz_asimi: string[];
  iceren_taslar: string[];
  organ_etkileri: string[];
  cakralar: string[];
  kategori: string | null;
  created_at: string;
};

type MineralRow = Omit<
  MineralRecord,
  | "fiziksel"
  | "zihinsel"
  | "fizyoloji"
  | "eksiklik_belirtileri"
  | "fazlalik_belirtileri"
  | "doz_asimi"
  | "iceren_taslar"
  | "organ_etkileri"
  | "cakralar"
> & {
  fiziksel: string[] | null;
  zihinsel: string[] | null;
  fizyoloji: string[] | null;
  eksiklik_belirtileri: string[] | null;
  fazlalik_belirtileri: string[] | null;
  doz_asimi: string[] | null;
  iceren_taslar: string[] | null;
  organ_etkileri: string[] | null;
  cakralar: string[] | null;
};

function normalizeTrSearch(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildNormIndexMap(text: string): { norm: string; indexMap: number[] } {
  let norm = "";
  const indexMap: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const charNorm = normalizeTrSearch(text[i] ?? "");
    for (let j = 0; j < charNorm.length; j += 1) {
      norm += charNorm[j];
      indexMap.push(i);
    }
  }

  return { norm, indexMap };
}

function renderHighlightedText(text: string, query: string): ReactNode {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const queryNorm = normalizeTrSearch(trimmedQuery);
  if (!queryNorm) return text;

  const { norm, indexMap } = buildNormIndexMap(text);
  const nodes: ReactNode[] = [];
  let lastEnd = 0;
  let searchFrom = 0;

  while (searchFrom <= norm.length - queryNorm.length) {
    const idx = norm.indexOf(queryNorm, searchFrom);
    if (idx < 0) break;

    const startOrig = indexMap[idx] ?? 0;
    const endOrig = (indexMap[idx + queryNorm.length - 1] ?? startOrig) + 1;

    if (startOrig > lastEnd) {
      nodes.push(
        <Fragment key={`p-${lastEnd}`}>{text.slice(lastEnd, startOrig)}</Fragment>,
      );
    }

    nodes.push(
      <mark key={`m-${startOrig}-${idx}`} className={HIGHLIGHT_MARK_CLASS}>
        {text.slice(startOrig, endOrig)}
      </mark>,
    );

    lastEnd = endOrig;
    searchFrom = idx + queryNorm.length;
  }

  if (lastEnd < text.length) {
    nodes.push(<Fragment key="p-end">{text.slice(lastEnd)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : text;
}

function textMatchesQuery(text: string | null | undefined, query: string): boolean {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return false;
  const haystack = normalizeTrSearch(String(text ?? ""));
  const needle = normalizeTrSearch(trimmedQuery);
  return Boolean(needle) && haystack.includes(needle);
}

function listMatchesQuery(items: string[], query: string): boolean {
  return textMatchesQuery(items.join(" "), query);
}

function SearchMatchBadge() {
  return <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme Var</span>;
}

function mergeMatchCardClass(baseClass: string, hasSearchMatch: boolean) {
  return hasSearchMatch ? `${baseClass} ${SEARCH_MATCH_CARD_CLASS}` : baseClass;
}

function normalizeMineral(row: MineralRow): MineralRecord {
  return {
    ...row,
    fiziksel: ensureMineralStringArray(row.fiziksel),
    zihinsel: ensureMineralStringArray(row.zihinsel),
    fizyoloji: ensureMineralStringArray(row.fizyoloji),
    eksiklik_belirtileri: ensureMineralStringArray(row.eksiklik_belirtileri),
    fazlalik_belirtileri: ensureMineralStringArray(row.fazlalik_belirtileri),
    doz_asimi: ensureMineralStringArray(row.doz_asimi),
    iceren_taslar: ensureMineralStringArray(row.iceren_taslar),
    organ_etkileri: ensureMineralStringArray(row.organ_etkileri),
    cakralar: ensureMineralStringArray(row.cakralar),
  };
}

function arraySectionToText(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n\n");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#ecfccb_38%,#f8fafc_100%)]";
const pageContent = "relative z-10 w-full px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[32px] border-[3px] border-emerald-400/40 bg-white/75 p-6 shadow-[0_0_45px_rgba(16,185,129,0.16)] backdrop-blur-xl";
const uiProfileCard =
  "rounded-[32px] border-[3px] border-amber-300/50 bg-gradient-to-br from-white/80 via-amber-50/70 to-emerald-50/70 p-6 shadow-[0_0_40px_rgba(245,158,11,0.16)] backdrop-blur-xl";
const uiStatBox =
  "rounded-2xl border-2 border-emerald-200 bg-white/80 p-4 text-center shadow-md";
const uiInfoCard =
  "w-full rounded-[28px] border-[3px] border-emerald-300/45 bg-white/75 p-5 shadow-[0_0_35px_rgba(16,185,129,0.12)] backdrop-blur-xl";
const uiContentBox =
  "mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-5 sm:p-6 text-slate-700 shadow-inner";
const uiEmptyText = "text-slate-400 italic font-medium";
const uiCategoryPill =
  "inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-sm font-black text-cyan-900";

function toneClass(
  tone: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple" | "red"
) {
  const map = {
    emerald: "bg-emerald-100 text-emerald-700",
    cyan: "bg-cyan-100 text-cyan-700",
    violet: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
    sky: "bg-sky-100 text-sky-700",
    purple: "bg-purple-100 text-purple-700",
    red: "bg-red-100 text-red-700",
  };
  return `inline-flex items-center rounded-full px-3 py-1 text-xs font-black tracking-wide ${map[tone]}`;
}

function TextSectionCard({
  title,
  badge,
  text,
  tone = "emerald",
  highlightQuery = "",
  hasSearchMatch = false,
  contentTypography,
}: {
  title: string;
  badge: string;
  text: string | null | undefined;
  tone?: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple" | "red";
  highlightQuery?: string;
  hasSearchMatch?: boolean;
  contentTypography: MineralContentTypography;
}) {
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiInfoCard, showMatchBadge);
  const displayText = text?.trim() || "";
  const renderSegment = (segment: string, key: string) =>
    highlightQuery.trim() ? renderHighlightedText(segment, highlightQuery) : segment;

  return (
    <article className={cardClass}>
      <div className={toneClass(tone)}>{badge}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>
      <div className={uiContentBox} style={contentTypography.bodyStyle}>
        {displayText ? (
          formatStoneContent(displayText, {
            renderSegment,
            fontSizePx: contentTypography.fontSizePx,
          })
        ) : (
          <p className={uiEmptyText}>Henüz bilgi girilmedi.</p>
        )}
      </div>
    </article>
  );
}

function ListSectionCard({
  title,
  badge,
  items,
  tone = "cyan",
  highlightQuery = "",
  hasSearchMatch = false,
  contentTypography,
}: {
  title: string;
  badge: string;
  items: string[];
  tone?: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple" | "red";
  highlightQuery?: string;
  hasSearchMatch?: boolean;
  contentTypography: MineralContentTypography;
}) {
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiInfoCard, showMatchBadge);
  const bodyText = arraySectionToText(items);
  const renderSegment = (segment: string, key: string) =>
    highlightQuery.trim() ? renderHighlightedText(segment, highlightQuery) : segment;

  return (
    <article className={cardClass}>
      <div className={toneClass(tone)}>{badge}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>
      <div className={uiContentBox} style={contentTypography.bodyStyle}>
        {items.length > 0 ? (
          formatStoneContent(bodyText, {
            renderSegment,
            fontSizePx: contentTypography.fontSizePx,
          })
        ) : (
          <p className={uiEmptyText}>Henüz bilgi girilmedi.</p>
        )}
      </div>
    </article>
  );
}

function MineralDetailPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  const highlightQuery = searchParams.get("q")?.trim() ?? "";
  const listBackHref = highlightQuery
    ? `/dogaltas/mineral-listesi?q=${encodeURIComponent(highlightQuery)}`
    : "/dogaltas/mineral-listesi";

  const {
    fontSizePx,
    typography: contentTypography,
    decrease: decreaseFontSize,
    reset: resetFontSize,
    increase: increaseFontSize,
    canDecrease: canDecreaseFontSize,
    canIncrease: canIncreaseFontSize,
    isDefault: isDefaultFontSize,
  } = useMineralDetailFontSize();

  const [mineral, setMineral] = useState<MineralRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadMineral = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setErrorMessage("Geçersiz mineral kimliği.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setLoading(false);
      setMineral(null);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { data, error } = await supabase
      .from("minerals")
      .select(MINERALS_DETAIL_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    setLoading(false);

    if (error) {
      setErrorMessage(`Mineral kayıtları okunamadı: ${error.message}`);
      setMineral(null);
      return;
    }

    if (!data) {
      setErrorMessage("Mineral kaydı bulunamadı.");
      setMineral(null);
      return;
    }

    setMineral(normalizeMineral(data as MineralRow));
  }, [id]);

  useEffect(() => {
    runInEffect(() => {
      void loadMineral();
    });
  }, [loadMineral]);

  const sectionMatches = useMemo(() => {
    const q = highlightQuery.trim();
    if (!q || !mineral) return null;

    const matchesText = (value: string | null | undefined) => textMatchesQuery(value, q);
    const matchesList = (items: string[]) => listMatchesQuery(items, q);

    return {
      name: matchesText(mineral.name),
      kategori: matchesText(mineral.kategori),
      sourceId: matchesText(mineral.source_id),
      aciklama: matchesText(mineral.aciklama),
      fiziksel: matchesList(mineral.fiziksel),
      zihinsel: matchesList(mineral.zihinsel),
      fizyoloji: matchesList(mineral.fizyoloji),
      eksiklik: matchesList(mineral.eksiklik_belirtileri),
      fazlalik: matchesList(mineral.fazlalik_belirtileri),
      dozAsimi: matchesList(mineral.doz_asimi),
      icerenTaslar: matchesList(mineral.iceren_taslar),
      organEtkileri: matchesList(mineral.organ_etkileri),
      cakralar: matchesList(mineral.cakralar),
    };
  }, [highlightQuery, mineral]);

  const filledSections = useMemo(() => {
    if (!mineral) return 0;
    let count = 0;
    if (mineral.aciklama?.trim()) count += 1;
    if (mineral.fiziksel.length) count += 1;
    if (mineral.zihinsel.length) count += 1;
    if (mineral.fizyoloji.length) count += 1;
    if (mineral.eksiklik_belirtileri.length) count += 1;
    if (mineral.fazlalik_belirtileri.length) count += 1;
    if (mineral.doz_asimi.length) count += 1;
    if (mineral.iceren_taslar.length) count += 1;
    if (mineral.organ_etkileri.length) count += 1;
    if (mineral.cakralar.length) count += 1;
    return count;
  }, [mineral]);

  if (loading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
        <div className={`${uiHeaderCard} text-sm font-black text-slate-600`}>
          Mineral yükleniyor...
        </div>
      </main>
    );
  }

  if (errorMessage && !mineral) {
    return (
      <main className={`flex min-h-screen items-center justify-center px-6 ${pageBg}`}>
        <div className={`${uiHeaderCard} w-full max-w-lg text-center`}>
          <div className="text-5xl">⚗️</div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Mineral yüklenemedi</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-rose-700" role="alert">
            {errorMessage}
          </p>
          <Link
            href={listBackHref}
            className="mt-6 inline-flex rounded-2xl border-2 border-slate-200 bg-white px-6 py-3 font-black text-slate-800 shadow-md hover:bg-slate-50"
          >
            {highlightQuery ? "Aramaya Dön" : "Listeye Dön"}
          </Link>
        </div>
      </main>
    );
  }

  if (!mineral) return null;

  const hasHighlight = Boolean(highlightQuery.trim());
  const headerHasMatch =
    Boolean(sectionMatches?.name) || Boolean(sectionMatches?.kategori);

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-amber-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-emerald-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <span className={toneClass("emerald")}>⚗️ MİNERAL DETAY</span>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h1 className="text-4xl font-black tracking-tight text-slate-950 xl:text-5xl">
                {hasHighlight
                  ? renderHighlightedText(mineral.name, highlightQuery)
                  : mineral.name}
              </h1>
              {hasHighlight && sectionMatches?.name ? <SearchMatchBadge /> : null}
            </div>
            {mineral.kategori?.trim() ? (
              <p className="mt-3 flex flex-wrap items-center gap-2">
                <span className={uiCategoryPill}>
                  {hasHighlight
                    ? renderHighlightedText(mineral.kategori, highlightQuery)
                    : mineral.kategori}
                </span>
                {hasHighlight && sectionMatches?.kategori ? <SearchMatchBadge /> : null}
              </p>
            ) : null}
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Kayıt: {formatDate(mineral.created_at)} · Kaynak:{" "}
              {hasHighlight
                ? renderHighlightedText(mineral.source_id, highlightQuery)
                : mineral.source_id}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DogaltasFontSizeControl
              fontSizePx={fontSizePx}
              onDecrease={decreaseFontSize}
              onReset={resetFontSize}
              onIncrease={increaseFontSize}
              canDecrease={canDecreaseFontSize}
              canIncrease={canIncreaseFontSize}
              isDefault={isDefaultFontSize}
            />
            <Link
              href={listBackHref}
              className="rounded-2xl border-2 border-slate-200 bg-white px-6 py-3 font-black text-slate-800 shadow-md hover:bg-slate-50"
            >
              {highlightQuery ? "Aramaya Dön" : "Listeye Dön"}
            </Link>
            <button
              type="button"
              onClick={() => void loadMineral()}
              className="rounded-2xl border-2 border-emerald-200 bg-white px-6 py-3 font-black text-slate-800 shadow-md hover:bg-emerald-50"
            >
              Yenile
            </button>
          </div>
        </header>

        {hasHighlight && headerHasMatch ? (
          <p className="mb-4 text-sm font-bold text-cyan-800">
            Arama: “{highlightQuery}”
          </p>
        ) : null}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <div
              className={mergeMatchCardClass(
                uiProfileCard,
                Boolean(hasHighlight && (sectionMatches?.name || sectionMatches?.kategori)),
              )}
            >
              <div className="flex min-h-[180px] items-center justify-center rounded-[24px] border-2 border-dashed border-amber-200/80 bg-white/60">
                <div className="text-center">
                  <div className="text-6xl">⚗️</div>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <h2 className="text-2xl font-black text-slate-950">
                      {hasHighlight
                        ? renderHighlightedText(mineral.name, highlightQuery)
                        : mineral.name}
                    </h2>
                    {hasHighlight && sectionMatches?.name ? <SearchMatchBadge /> : null}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className={uiStatBox}>
                  <div className="text-2xl font-black text-slate-950">{filledSections}</div>
                  <div className="mt-1 text-xs font-bold text-slate-500">Dolu bölüm</div>
                </div>
                <div className={uiStatBox}>
                  <div className="text-2xl font-black text-slate-950">
                    {mineral.iceren_taslar.length}
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-500">İçeren taş</div>
                </div>
              </div>
            </div>
          </aside>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TextSectionCard
              title="Açıklama"
              badge="AÇIKLAMA"
              text={mineral.aciklama}
              tone="emerald"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.aciklama}
              contentTypography={contentTypography}
            />
            <ListSectionCard
              title="Fiziksel"
              badge="FİZİKSEL"
              items={mineral.fiziksel}
              tone="sky"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.fiziksel}
              contentTypography={contentTypography}
            />
            <ListSectionCard
              title="Zihinsel"
              badge="ZİHİNSEL"
              items={mineral.zihinsel}
              tone="purple"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.zihinsel}
              contentTypography={contentTypography}
            />
            <ListSectionCard
              title="Fizyoloji"
              badge="FİZYOLOJİ"
              items={mineral.fizyoloji}
              tone="violet"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.fizyoloji}
              contentTypography={contentTypography}
            />
            <ListSectionCard
              title="Organ etkileri"
              badge="ORGAN"
              items={mineral.organ_etkileri}
              tone="emerald"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.organEtkileri}
              contentTypography={contentTypography}
            />
            <ListSectionCard
              title="Çakralar"
              badge="ÇAKRA"
              items={mineral.cakralar}
              tone="cyan"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.cakralar}
              contentTypography={contentTypography}
            />
            <ListSectionCard
              title="Eksiklik belirtileri"
              badge="EKSİKLİK"
              items={mineral.eksiklik_belirtileri}
              tone="amber"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.eksiklik}
              contentTypography={contentTypography}
            />
            <ListSectionCard
              title="Fazlalık belirtileri"
              badge="FAZLALIK"
              items={mineral.fazlalik_belirtileri}
              tone="red"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.fazlalik}
              contentTypography={contentTypography}
            />
            <ListSectionCard
              title="Doz aşımı"
              badge="DOZ"
              items={mineral.doz_asimi}
              tone="rose"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.dozAsimi}
              contentTypography={contentTypography}
            />
            <div className="lg:col-span-2">
              <ListSectionCard
                title="İçeren taşlar"
                badge={`${mineral.iceren_taslar.length} TAŞ`}
                items={mineral.iceren_taslar}
                tone="cyan"
                highlightQuery={highlightQuery}
                hasSearchMatch={sectionMatches?.icerenTaslar}
                contentTypography={contentTypography}
              />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function MineralDetailPageFallback() {
  return (
    <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
      <p className="text-sm font-black text-slate-600">Yükleniyor…</p>
    </main>
  );
}

export default function MineralDetailPage() {
  return (
    <Suspense fallback={<MineralDetailPageFallback />}>
      <MineralDetailPageContent />
    </Suspense>
  );
}
