"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { ensureMineralStringArray, getDemoReferenceMineralId } from "@/lib/dogaltas/mineralsListFetch";
import type { MineralContentTypography } from "@/lib/dogaltas/mineralDetailFontSize";
import { useMineralDetailFontSize } from "@/lib/dogaltas/useMineralDetailFontSize";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { getMineral, updateMineral } from "@/lib/dogaltas/dogaltasApi";
import {
  mergeMatchCardClass,
  renderHighlightedText,
  SEARCH_MATCH_BADGE_CLASS,
  textMatchesQuery,
} from "@/lib/dogaltas/searchHighlight";


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


function listMatchesQuery(items: string[], query: string): boolean {
  return textMatchesQuery(items.join(" "), query);
}

function SearchMatchBadge() {
  const tRoot = useTranslations("stones.minerals");
  return <span className={SEARCH_MATCH_BADGE_CLASS}>{tRoot("searchMatchBadge")}</span>;
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

// ─── Düzenleme yardımcıları ──────────────────────────────────────────────────
function linesToArray(value: string): string[] {
  return value.split("\n").map((l) => l.trim()).filter(Boolean);
}

// Mineral kaydının düzenlenebilir liste alanları (veri modelinde mevcut alanlar).
// Etiketler i18n katalogundan (stones.minerals.detail.sections.<key>.title) gelir;
// DB alan anahtarı (key) aşağıdaki dizide sabit ve sıralıdır.
const MINERAL_EDIT_LIST_FIELD_KEYS: (keyof MineralEditForm)[] = [
  "fiziksel",
  "zihinsel",
  "fizyoloji",
  "organ_etkileri",
  "cakralar",
  "eksiklik_belirtileri",
  "fazlalik_belirtileri",
  "doz_asimi",
  "iceren_taslar",
];

type MineralEditForm = {
  name: string;
  kategori: string;
  aciklama: string;
  fiziksel: string;
  zihinsel: string;
  fizyoloji: string;
  organ_etkileri: string;
  cakralar: string;
  eksiklik_belirtileri: string;
  fazlalik_belirtileri: string;
  doz_asimi: string;
  iceren_taslar: string;
};

function mineralToEditForm(m: MineralRecord): MineralEditForm {
  return {
    name: m.name ?? "",
    kategori: m.kategori ?? "",
    aciklama: m.aciklama ?? "",
    fiziksel: m.fiziksel.join("\n"),
    zihinsel: m.zihinsel.join("\n"),
    fizyoloji: m.fizyoloji.join("\n"),
    organ_etkileri: m.organ_etkileri.join("\n"),
    cakralar: m.cakralar.join("\n"),
    eksiklik_belirtileri: m.eksiklik_belirtileri.join("\n"),
    fazlalik_belirtileri: m.fazlalik_belirtileri.join("\n"),
    doz_asimi: m.doz_asimi.join("\n"),
    iceren_taslar: m.iceren_taslar.join("\n"),
  };
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

// ─── Mineral detay sayfasına özel sade içerik renderer ───────────────────────
// formatStoneContent'ten bağımsız; inner box/article/shadow üretmez.
const MINERAL_LIST_RE = /^\s*(?:[-•·–—]|\d+[.):])\s+(.+)$/u;
const MINERAL_LABEL_RE = /^([^:\n]{2,60}):\s*(.+)$/u;

function renderMineralContent(
  rawText: string,
  bodyStyle: React.CSSProperties,
  renderSeg: (text: string, key: string) => ReactNode,
): ReactNode {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;

  const nodes = normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((block, bIdx) =>
      block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line, lIdx) => {
          const key = `${bIdx}-${lIdx}`;

          const listMatch = line.match(MINERAL_LIST_RE);
          if (listMatch) {
            return (
              <div key={key} className="flex items-start gap-2 text-slate-700">
                <span
                  className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  {renderSeg(listMatch[1]!.trim(), key)}
                </span>
              </div>
            );
          }

          const labelMatch = line.match(MINERAL_LABEL_RE);
          if (labelMatch) {
            return (
              <p key={key} className="text-slate-700">
                <span className="font-semibold text-slate-900">{labelMatch[1]}:</span>{" "}
                <span>{renderSeg(labelMatch[2]!.trim(), key)}</span>
              </p>
            );
          }

          return (
            <p key={key} className="text-slate-700">
              {renderSeg(line, key)}
            </p>
          );
        }),
    );

  return (
    <div className="space-y-1 leading-relaxed" style={bodyStyle}>
      {nodes}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#ecfccb_38%,#f8fafc_100%)]";
const pageContent = "relative z-10 w-full space-y-2 px-4 py-3 xl:px-8 2xl:px-10";
const uiHeaderCard =
  "rounded-2xl border-[2px] border-emerald-300/50 bg-white/80 p-3 shadow-md backdrop-blur-xl";
const uiInfoCard =
  "w-full rounded-xl border border-emerald-200/60 bg-white/80 p-3 text-left shadow-sm backdrop-blur-xl transition-colors duration-200 hover:border-amber-300 hover:bg-white";
const uiEmptyText = "text-slate-400 italic text-xs";
const uiCategoryPill =
  "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-black text-emerald-900";

function toneClass(
  tone: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple" | "red"
) {
  const map = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cyan: "border-emerald-200 bg-emerald-50 text-emerald-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-red-200 bg-red-50 text-red-600",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    red: "border-red-200 bg-red-50 text-red-700",
  };
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black tracking-wide ${map[tone]}`;
}

function TextSectionCard({
  title,
  badge,
  text,
  tone = "emerald",
  highlightQuery = "",
  hasSearchMatch = false,
  contentTypography,
  isContentProtected = false,
}: {
  title: string;
  badge: string;
  text: string | null | undefined;
  tone?: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple" | "red";
  highlightQuery?: string;
  hasSearchMatch?: boolean;
  contentTypography: MineralContentTypography;
  isContentProtected?: boolean;
}) {
  const tDetail = useTranslations("stones.minerals.detail");
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiInfoCard, showMatchBadge);
  const displayText = text?.trim() || "";
  const renderSeg = (segment: string, key: string): ReactNode =>
    highlightQuery.trim() ? renderHighlightedText(segment, highlightQuery) : segment;

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={toneClass(tone)}>{badge}</span>
        <h2 className="text-sm font-black text-slate-950">{title}</h2>
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>
      <div className="mt-1.5">
        <DemoBlur isProtected={isContentProtected} intensity={4}>
          {displayText ? (
            renderMineralContent(displayText, contentTypography.bodyStyle, renderSeg)
          ) : (
            <p className={uiEmptyText}>{tDetail("noInfo")}</p>
          )}
        </DemoBlur>
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
  isContentProtected = false,
}: {
  title: string;
  badge: string;
  items: string[];
  tone?: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple" | "red";
  highlightQuery?: string;
  hasSearchMatch?: boolean;
  contentTypography: MineralContentTypography;
  isContentProtected?: boolean;
}) {
  const tDetail = useTranslations("stones.minerals.detail");
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiInfoCard, showMatchBadge);

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={toneClass(tone)}>{badge}</span>
        <h2 className="text-sm font-black text-slate-950">{title}</h2>
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>
      <div className="mt-1.5">
        <DemoBlur isProtected={isContentProtected} intensity={4}>
          <div className="space-y-1 leading-relaxed" style={contentTypography.bodyStyle}>
            {items.length > 0 ? (
              items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-slate-700">
                  <span
                    className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    {highlightQuery.trim()
                      ? renderHighlightedText(item, highlightQuery)
                      : item}
                  </span>
                </div>
              ))
            ) : (
              <p className={uiEmptyText}>{tDetail("noInfo")}</p>
            )}
          </div>
        </DemoBlur>
      </div>
    </article>
  );
}

function MineralDetailPageContent() {
  const t = useTranslations("stones.minerals.detail");
  const tEdit = useTranslations("stones.minerals.edit");
  const tRoot = useTranslations("stones.minerals");
  const tc = useTranslations("stones.common");
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  const highlightQuery = searchParams.get("q")?.trim() ?? "";
  // Liste sayfasından gelen demo referans — doğrudan karşılaştırma için kullanılır
  const refMineralIdFromQuery = searchParams.get("refMineralId")?.trim() ?? "";
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
  const [wordBusy, setWordBusy] = useState(false);
  const [isDemoReference, setIsDemoReference] = useState(false);
  const { isDemo } = useDemoGuard();
  const isContentProtected = isDemo && !isDemoReference;

  // ─── Düzenleme durumu (yalnız kendi tenant kaydı; mineraller her zaman tenant-only) ──
  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState<MineralEditForm | null>(null);
  const canEdit = !isDemo; // demo hesap yazamaz (Word butonu ile aynı kural)

  function startEdit() {
    if (!mineral) return;
    setEditForm(mineralToEditForm(mineral));
    setEditError("");
    setIsEditing(true);
  }
  function cancelEdit() {
    setIsEditing(false);
    setEditError("");
    setEditForm(null);
  }
  async function saveEdit() {
    if (!mineral || !editForm) return;
    const name = editForm.name.trim();
    if (!name) {
      setEditError(tRoot("validation.nameRequired"));
      return;
    }
    setEditSaving(true);
    setEditError("");
    const payload: Record<string, unknown> = {
      name,
      kategori: editForm.kategori.trim() || null,
      aciklama: editForm.aciklama.trim() || null,
    };
    for (const key of MINERAL_EDIT_LIST_FIELD_KEYS) {
      payload[key] = linesToArray(editForm[key]);
    }
    const res = await updateMineral(mineral.id, payload);
    setEditSaving(false);
    if (!res.ok) {
      setEditError(res.error || t("updateFailed"));
      return;
    }
    setIsEditing(false);
    setEditForm(null);
    await loadMineral();
  }
  const updateEditField = (key: keyof MineralEditForm, value: string) =>
    setEditForm((f) => (f ? { ...f, [key]: value } : f));

  const loadMineral = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setErrorMessage(t("invalidId"));
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

    // Demo: referans mineral tespiti
    // 1) Liste üzerinden gelinmişse query param önceliklidir (timing sorunu yok)
    // 2) Direkt URL ile girilmişse DB sorgusu fallback
    if (readYasamUser()?.is_demo_account) {
      if (refMineralIdFromQuery) {
        setIsDemoReference(refMineralIdFromQuery === id);
      } else {
        const refId = await getDemoReferenceMineralId(tenantId, {
          search: highlightQuery || undefined,
        });
        setIsDemoReference(refId === id);
      }
    }

    const { ok, row: data, error } = await getMineral(id);

    setLoading(false);

    if (!ok) {
      setErrorMessage(t("loadError", { error: error ?? "" }));
      setMineral(null);
      return;
    }

    if (!data) {
      setErrorMessage(t("notFound"));
      setMineral(null);
      return;
    }

    setMineral(normalizeMineral(data as MineralRow));
  }, [id, highlightQuery, refMineralIdFromQuery, t]);

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

  async function downloadWordReport() {
    if (!mineral) return;
    const tenantId = await getSyncedTenantId();
    if (!tenantId) return;
    const userId = readYasamUser()?.id;
    if (!userId) return;
    const sessionToken = readSessionToken();
    setWordBusy(true);
    try {
      // F-018: kimlik header'dan; body'de userId/tenantId GÖNDERİLMEZ.
      const res = await fetch(`/api/dogaltas/minerals/${mineral.id}/word-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeN = mineral.name.toLowerCase()
        .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
        .replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
        .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      a.download = `mineral-${safeN}-${new Date().toISOString().slice(0,10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz hata */ } finally {
      setWordBusy(false);
    }
  }

  if (loading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
        <div className={`${uiHeaderCard} text-sm font-black text-slate-600`}>
          {t("loading")}
        </div>
      </main>
    );
  }

  if (errorMessage && !mineral) {
    return (
      <main className={`flex min-h-screen items-center justify-center px-6 ${pageBg}`}>
        <div className={`${uiHeaderCard} w-full max-w-lg text-center`}>
          <div className="text-5xl">⚗️</div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">{t("loadFailedTitle")}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-rose-700" role="alert">
            {errorMessage}
          </p>
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
        <header className={`${uiHeaderCard} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black tracking-[0.15em] text-emerald-700">
                {t("badgeDetail")}
              </span>
              {isEditing && editForm ? (
                <input
                  value={editForm.kategori}
                  onChange={(e) => updateEditField("kategori", e.target.value)}
                  placeholder={t("categoryPlaceholder")}
                  aria-label={t("categoryAria")}
                  className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              ) : mineral.kategori?.trim() ? (
                <span className={uiCategoryPill}>
                  {hasHighlight
                    ? renderHighlightedText(mineral.kategori, highlightQuery)
                    : mineral.kategori}
                </span>
              ) : null}
              {!isEditing && hasHighlight && sectionMatches?.kategori ? <SearchMatchBadge /> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isEditing && editForm ? (
                <input
                  value={editForm.name}
                  onChange={(e) => updateEditField("name", e.target.value)}
                  placeholder={t("namePlaceholder")}
                  aria-label={t("namePlaceholder")}
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xl font-black text-slate-950 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 sm:text-2xl"
                />
              ) : (
                <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                  {hasHighlight
                    ? renderHighlightedText(mineral.name, highlightQuery)
                    : mineral.name}
                </h1>
              )}
              {!isEditing && hasHighlight && sectionMatches?.name ? <SearchMatchBadge /> : null}
            </div>

            <p className="mt-1 text-[11px] font-medium text-slate-500">
              {formatDate(mineral.created_at)}
              {" · "}
              {hasHighlight
                ? renderHighlightedText(mineral.source_id, highlightQuery)
                : mineral.source_id}
              {" · "}
              <span className="font-black text-emerald-700">{filledSections}</span>
              {t("filledSuffix", { n: filledSections })}
              <span className="font-black text-amber-700">{mineral.iceren_taslar.length}</span>
              {t("icerenSuffix", { n: mineral.iceren_taslar.length })}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={editSaving}
                  className="btn-soft"
                >
                  {tc("giveUp")}
                </button>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={editSaving}
                  className="btn-primary"
                >
                  {editSaving ? tc("saving") : tc("save")}
                </button>
              </>
            ) : (
              <>
                <DogaltasFontSizeControl
                  fontSizePx={fontSizePx}
                  onDecrease={decreaseFontSize}
                  onReset={resetFontSize}
                  onIncrease={increaseFontSize}
                  canDecrease={canDecreaseFontSize}
                  canIncrease={canIncreaseFontSize}
                  isDefault={isDefaultFontSize}
                />
                {!isDemo && (
                  <button
                    type="button"
                    onClick={() => void downloadWordReport()}
                    disabled={wordBusy}
                    className="btn-soft"
                  >
                    {wordBusy ? t("wordBusy") : t("wordButton")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void loadMineral()}
                  className="btn-soft"
                >
                  {t("refresh")}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="btn-primary"
                  >
                    {t("editButton")}
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        {hasHighlight && headerHasMatch ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">{t("matchLabel")}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-800">
              🔍 {highlightQuery}
            </span>
          </div>
        ) : null}

        {isEditing && editForm ? (
          <section className="space-y-2">
            {editError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" role="alert">
                {editError}
              </div>
            ) : null}
            <div className={uiInfoCard}>
              <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                {t("sections.aciklama.title")}
              </label>
              <textarea
                value={editForm.aciklama}
                onChange={(e) => updateEditField("aciklama", e.target.value)}
                rows={4}
                placeholder={tRoot("bank.sections.aciklama.placeholder")}
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {MINERAL_EDIT_LIST_FIELD_KEYS.map((key) => (
                <div key={key} className={uiInfoCard}>
                  <label className="mb-1 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <span>{t(`sections.${key}.title`)}</span>
                    <span className="font-medium normal-case tracking-normal text-slate-400">{tEdit("lineHint")}</span>
                  </label>
                  <textarea
                    value={editForm[key]}
                    onChange={(e) => updateEditField(key, e.target.value)}
                    rows={3}
                    placeholder={tEdit("fieldPlaceholder", { label: t(`sections.${key}.title`) })}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              ))}
            </div>
            {/* Mobil kolaylığı için alt kaydet/vazgeç */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={cancelEdit} disabled={editSaving} className="btn-soft">
                {tc("giveUp")}
              </button>
              <button type="button" onClick={() => void saveEdit()} disabled={editSaving} className="btn-primary">
                {editSaving ? tc("saving") : tc("save")}
              </button>
            </div>
          </section>
        ) : (
        <section className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <TextSectionCard
              title={t("sections.aciklama.title")}
              badge={t("sections.aciklama.badge")}
              text={mineral.aciklama}
              tone="emerald"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.aciklama}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <ListSectionCard
              title={t("sections.fiziksel.title")}
              badge={t("sections.fiziksel.badge")}
              items={mineral.fiziksel}
              tone="sky"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.fiziksel}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <ListSectionCard
              title={t("sections.zihinsel.title")}
              badge={t("sections.zihinsel.badge")}
              items={mineral.zihinsel}
              tone="purple"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.zihinsel}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <ListSectionCard
              title={t("sections.fizyoloji.title")}
              badge={t("sections.fizyoloji.badge")}
              items={mineral.fizyoloji}
              tone="violet"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.fizyoloji}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <ListSectionCard
              title={t("sections.organ_etkileri.title")}
              badge={t("sections.organ_etkileri.badge")}
              items={mineral.organ_etkileri}
              tone="emerald"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.organEtkileri}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <ListSectionCard
              title={t("sections.cakralar.title")}
              badge={t("sections.cakralar.badge")}
              items={mineral.cakralar}
              tone="cyan"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.cakralar}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <ListSectionCard
              title={t("sections.eksiklik_belirtileri.title")}
              badge={t("sections.eksiklik_belirtileri.badge")}
              items={mineral.eksiklik_belirtileri}
              tone="amber"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.eksiklik}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <ListSectionCard
              title={t("sections.fazlalik_belirtileri.title")}
              badge={t("sections.fazlalik_belirtileri.badge")}
              items={mineral.fazlalik_belirtileri}
              tone="red"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.fazlalik}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <ListSectionCard
              title={t("sections.doz_asimi.title")}
              badge={t("sections.doz_asimi.badge")}
              items={mineral.doz_asimi}
              tone="rose"
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.dozAsimi}
              contentTypography={contentTypography}
              isContentProtected={isContentProtected}
            />
            <div className="lg:col-span-2">
              <ListSectionCard
                title={t("sections.iceren_taslar.title")}
                badge={t("icerenTaslarBadge", { n: mineral.iceren_taslar.length })}
                items={mineral.iceren_taslar}
                tone="cyan"
                highlightQuery={highlightQuery}
                hasSearchMatch={sectionMatches?.icerenTaslar}
                contentTypography={contentTypography}
                isContentProtected={isContentProtected}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function MineralDetailPageFallback() {
  const tRoot = useTranslations("stones.minerals");
  return (
    <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
      <p className="text-sm font-semibold text-slate-600">{tRoot("fallbackLoading")}</p>
    </main>
  );
}

export default function MineralDetailPage() {
  return (
    <>
      <BfcacheRefreshHandler />
      <Suspense fallback={<MineralDetailPageFallback />}>
        <MineralDetailPageContent />
      </Suspense>
    </>
  );
}
