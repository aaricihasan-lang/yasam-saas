"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import Link from "next/link";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { fetchCombinationsViaApi } from "@/lib/dogaltas/combinationsApi";
import { STONES_WORKSPACE_UNAVAILABLE } from "@/lib/dogaltas/sessionError";

/** Güvenli delete API'sine issue listesi gönderir (publishable delete yerine). */
async function deleteCombinationsViaApi(
  issues: string[],
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const userId = readYasamUser()?.id;
  const sessionToken = readSessionToken();
  try {
    const res = await fetch("/api/dogaltas/combinations/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ issues }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      demo?: boolean;
    };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    return { ok: true, demo: json.demo };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ağ hatası" };
  }
}
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import {
  normalizeTrSearch,
  renderHighlightedText,
  SEARCH_MATCH_BADGE_COMPACT_CLASS as SEARCH_MATCH_BADGE_CLASS,
} from "@/lib/dogaltas/searchHighlight";
import { DogaltasSectionShell } from "@/app/dogaltas/components/DogaltasSectionShell";
import { BulkExportBar } from "@/components/common/BulkExportBar";

const VIEWED_SEARCH_STORAGE_KEY = "yasam-combinations-viewed-search-results";

const COMBINATIONS_SEARCH_STORAGE_KEYS = [
  "yasam-combinations-search",
  "yasam-combinations-search-query",
  "combinations-search",
  "searchTerm",
  "q",
] as const;


function clearCombinationsSearchStorage() {
  if (typeof window === "undefined") return;
  for (const key of COMBINATIONS_SEARCH_STORAGE_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

function readUrlSearchQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
}

function stripUrlSearchQuery() {
  if (typeof window === "undefined") return;
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);
}

function readViewedCombinationIssues(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(VIEWED_SEARCH_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((id) => String(id)));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function markViewedCombinationIssue(issue: string) {
  const viewed = readViewedCombinationIssues();
  viewed.add(issue);
  localStorage.setItem(VIEWED_SEARCH_STORAGE_KEY, JSON.stringify([...viewed]));
}

function combinationDetailHref(issue: string, query: string, isSearchActive: boolean) {
  const base = `/dogaltas/kombinasyonlar/${encodeURIComponent(issue)}`;
  return isSearchActive ? `${base}?q=${encodeURIComponent(query)}` : base;
}

type CombinationRecord = {
  id: string;
  tenant_id: string;
  source_id: string;
  issue: string;
  description: string | null;
  variant_index: number;
  source: string | null;
  stones_text: string | null;
  notes_text: string | null;
  notes_text_2: string | null;
  notes_text_3: string | null;
  created_at: string;
  /** P4 provenance — 'admin_transfer' ise "Admin Kütüphanesi" rozeti. */
  origin_type?: string | null;
};

function previewText(rows: CombinationRecord[], limit = 100) {
  for (const row of rows) {
    const chunk = [row.stones_text, row.notes_text, row.notes_text_2, row.notes_text_3, row.source]
      .find((v) => v && v.trim().length > 0)
      ?.replace(/\s+/g, " ")
      .trim();

    if (chunk) {
      return chunk.length > limit ? `${chunk.slice(0, limit)}…` : chunk;
    }
  }

  return null;
}

function firstSourceInGroup(rows: CombinationRecord[]) {
  for (const row of rows) {
    const note = row.source?.trim();
    if (note) return note;
  }
  return null;
}

function groupDescription(rows: CombinationRecord[]) {
  for (const row of rows) {
    const desc = row.description?.trim();
    if (desc) return desc;
  }
  return null;
}

function latestDisplayTimestamp(rows: CombinationRecord[]) {
  let best = 0;
  let chosen: string | null = null;

  for (const row of rows) {
    const raw = row.created_at;
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t) && t >= best) {
      best = t;
      chosen = raw;
    }
  }

  return chosen;
}

function formatListCardDate(iso: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function groupStats(rows: CombinationRecord[]) {
  const sources = new Set(rows.map((r) => r.source?.trim()).filter(Boolean));
  const stonesCount = rows.filter((r) => r.stones_text?.trim()).length;
  return { sources: sources.size, stonesCount };
}

function buildSearchableText(row: CombinationRecord): string {
  const parts: string[] = [
    row.issue,
    row.description ?? "",
    row.source ?? "",
    row.stones_text ?? "",
    row.notes_text ?? "",
    row.notes_text_2 ?? "",
    row.notes_text_3 ?? "",
    row.source_id,
    String(row.variant_index),
  ];

  for (const value of Object.values(row)) {
    if (typeof value === "string" && value.trim()) {
      parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) parts.push(item);
      }
    }
  }

  return parts.filter(Boolean).join(" ");
}

function rowMatchesSearch(row: CombinationRecord, searchTerm: string): boolean {
  const trimmed = searchTerm.trim();
  if (!trimmed) return true;
  const haystack = normalizeTrSearch(buildSearchableText(row));
  const needle = normalizeTrSearch(trimmed);
  return Boolean(needle) && haystack.includes(needle);
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const pageContent = "relative z-10 w-full space-y-2";
const uiHeaderCard =
  "rounded-2xl border-[2px] border-violet-300/50 bg-white/80 p-3 shadow-md backdrop-blur-xl";
const uiFilterCard =
  "rounded-xl border border-slate-200/60 bg-white/80 p-3 shadow-sm backdrop-blur-xl";
const uiSearchInput =
  "h-9 w-full rounded-lg border border-slate-200 bg-white/90 px-3 pl-9 text-sm font-semibold shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/40";
const uiCategorySelect =
  "h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white/90 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200/40";
const uiComboCard =
  "rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-sm backdrop-blur-xl transition-colors hover:border-violet-200 hover:bg-white";
const uiComboBadge =
  "inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700";
const uiCategoryPill =
  "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-900";
const uiComboBtn =
  "btn-soft !px-3 !py-1.5 !text-[11px] !rounded-lg";
const uiRowCheckbox =
  "h-4 w-4 shrink-0 cursor-pointer rounded border border-slate-300 accent-emerald-600 focus:ring-2 focus:ring-emerald-200/40";

/**
 * İlk render'da gösterilecek başlık (grup) sayısı; kalanı "Daha Fazla Göster"
 * ile açılır. Tüm kayıtlar API'den çekilir (arama/filtre tam set üzerinde
 * çalışır) ama DOM'a yalnızca bu kadarı basılır → ağır liste/mobil yükü önlenir.
 */
const GROUPS_PAGE_SIZE = 24;

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function KombinasyonlarPage() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const t = useTranslations("stones.combinations.list");
  const tc = useTranslations("stones.common");
  const [rows, setRows] = useState<CombinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [viewedIssueKeys, setViewedIssueKeys] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [visibleCount, setVisibleCount] = useState(GROUPS_PAGE_SIZE);
  const { isDemo } = useDemoGuard();

  const clearSearch = useCallback(() => {
    if (readUrlSearchQuery()) stripUrlSearchQuery();
    clearCombinationsSearchStorage();
    setSearchTerm("");
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (!value.trim()) {
      if (readUrlSearchQuery()) stripUrlSearchQuery();
      clearCombinationsSearchStorage();
    }
  }, []);

  const handleCombinationNavigate = useCallback((issue: string) => {
    markViewedCombinationIssue(issue);
    setViewedIssueKeys(readViewedCombinationIssues());
  }, []);

  const handleRefresh = useCallback(() => {
    clearSearch();
    void loadCombinations();
  }, [clearSearch]);

  async function loadCombinations() {
    setLoading(true);
    setErrorMessage("");

    const result = await fetchCombinationsViaApi();

    setLoading(false);

    if (!result.ok) {
      // loadCombinations plain fn + [] mount effect → t()'yi doğrudan kullanmıyoruz
      // (reaktif bağımlılık/lint döngüsü olmasın). Hata KODU saklanır, render'da t() ile çözülür.
      setErrorMessage(`@@loadError:${result.error ?? ""}`);
      setRows([]);
      return;
    }

    setRows(result.rows as CombinationRecord[]);
  }

  useEffect(() => {
    runInEffect(() => { void loadCombinations(); });
  }, []);

  useEffect(() => {
    const q = readUrlSearchQuery();
    if (q) setSearchTerm(q);
  }, []);

  useEffect(() => {
    const refreshViewed = () => setViewedIssueKeys(readViewedCombinationIssues());
    refreshViewed();
    window.addEventListener("focus", refreshViewed);
    return () => window.removeEventListener("focus", refreshViewed);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isSearchActive = Boolean(searchTerm.trim());
  const activeSearch = searchTerm.trim();

  // UAT #3: kategori dropdown'ı kısa başlıklardan (issue) türer — uzun "amaç"
  // açıklaması (description) DEĞİL. Grup anahtarıyla aynı ("İsimsiz" fallback),
  // eski veri kırılmaz (issue tüm satırlarda var).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) set.add(row.issue?.trim() || "İsimsiz");
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr-TR"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const category = categoryFilter.trim();
    return rows.filter((row) => {
      if (category && (row.issue?.trim() || "İsimsiz") !== category) return false;
      return rowMatchesSearch(row, isSearchActive ? searchTerm : "");
    });
  }, [rows, searchTerm, isSearchActive, categoryFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, CombinationRecord[]>();
    for (const row of filteredRows) {
      const key = row.issue?.trim() || "İsimsiz";
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return Array.from(map.entries())
      .map(([issue, groupRows]) => ({
        issue,
        rows: [...groupRows].sort((a, b) => a.variant_index - b.variant_index),
      }))
      .sort((a, b) => a.issue.localeCompare(b.issue, "tr-TR"));
  }, [filteredRows]);

  const uniqueIssues = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.issue?.trim() || "İsimsiz"));
    return set.size;
  }, [rows]);

  // Sayfalama yalnızca RENDER'ı sınırlar; arama/filtre tam set (`rows`) üzerinde
  // yapıldıktan SONRA uygulanır → K-1'deki "filtre sonrası boş kalma" tuzağına düşmez.
  const visibleGroups = useMemo(
    () => groups.slice(0, visibleCount),
    [groups, visibleCount],
  );
  const hasMoreGroups = groups.length > visibleGroups.length;

  // Arama/kategori değişince sayfalamayı başa sar (kullanıcı ilk eşleşmeleri görsün).
  useEffect(() => {
    setVisibleCount(GROUPS_PAGE_SIZE);
  }, [searchTerm, categoryFilter]);

  const hasFilters = Boolean(isSearchActive || categoryFilter.trim());
  const [wordBusy, setWordBusy] = useState(false);
  const isEmptyDatabase = !loading && !errorMessage && rows.length === 0;
  const isEmptyFiltered = !loading && !errorMessage && rows.length > 0 && groups.length === 0;
  const selectedCount = selectedIds.size;

  const toggleGroupSelection = useCallback((issue: string) => {
    // FAZ-1: Mobil/PWA'da aynı anda en fazla 2 kayıt seçilebilir.
    if (isMobile && !selectedIds.has(issue) && selectedIds.size >= 2) {
      showToast({ type: "info", message: t("mobileMaxSelect") });
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(issue)) next.delete(issue);
      else if (isMobile && next.size >= 2) return current; // state seviyesinde sınır
      else next.add(issue);
      return next;
    });
  }, [isMobile, selectedIds, showToast, t]);

  const clearSelection = useCallback(() => { setSelectedIds(new Set()); }, []);

  const selectAllFiltered = useCallback(() => {
    if (isMobile) {
      showToast({ type: "info", message: t("mobileMaxSelect") });
      return;
    }
    setSelectedIds(new Set(groups.map((g) => g.issue)));
  }, [groups, isMobile, showToast, t]);

  const deleteSelectedCombinations = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const issueKeys = Array.from(selectedIds);
    const deleteCount = issueKeys.length;

    const firstConfirmed = await confirm({
      title: isMobile ? t("deleteTitleMobile") : t("deleteTitle"),
      message: t("deleteMessage", { n: deleteCount }),
      tone: "danger",
      confirmText: isMobile ? t("confirmYesMobile") : t("confirmYes"),
      cancelText: isMobile ? t("cancelNo") : tc("giveUp"),
    });
    if (!firstConfirmed) return;

    if (isMobile) {
      const secondConfirmed = await confirm({
        title: t("secondConfirmTitle"),
        message: t("secondConfirmMessage"),
        tone: "danger",
        confirmText: t("secondConfirmYes"),
        cancelText: tc("giveUp"),
      });
      if (!secondConfirmed) return;
    }

    setDeleteLoading(true);
    setErrorMessage("");

    const result = await deleteCombinationsViaApi(issueKeys);

    setDeleteLoading(false);

    if (!result.ok) {
      setErrorMessage(t("deleteSelectedError", { error: result.error ?? "" }));
      return;
    }

    showToast({ type: "success", message: t("deletedToast", { n: deleteCount }) });
    setSelectedIds(new Set());
    await loadCombinations();
  }, [confirm, isMobile, selectedIds, showToast, t, tc]);

  const exportCombosWord = useCallback(async (mode: "selected" | "all" | "filtered") => {
    const tenantId = await getSyncedTenantId();
    if (!tenantId) { setErrorMessage(tc("workspaceUnavailable")); return; }
    const userId = readYasamUser()?.id;
    if (!userId) { setErrorMessage(tc("workspaceUnavailable")); return; }
    setWordBusy(true);
    try {
      let issues: string[] | undefined;
      if (mode === "selected") {
        issues = [...selectedIds];
        if (!issues.length) return;
      } else if (mode === "filtered") {
        issues = groups.map((g) => g.issue);
        if (!issues.length) return;
      }
      const sessionToken = readSessionToken();
      const body: Record<string, unknown> = { exportMode: mode };
      if (issues) body.issues = issues;
      // F-018: kimlik header'dan; body'de userId/tenantId GÖNDERİLMEZ.
      const res = await fetch("/api/dogaltas/combinations/word-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        // FAZ-4B: ham backend hatası kullanıcıya gösterilmez; yalnız geliştirici logunda.
        console.error("[kombinasyonlar] Word raporu hatası:", data.error ?? `HTTP ${res.status}`);
        setErrorMessage(t("wordError"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const modeSlug = mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu";
      a.download = `kombinasyon-${modeSlug}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      // FAZ-4B: indirme tetiklendi. "İndirildi" demiyoruz — tarayıcının gerçek konumunu/
      // tamamlanmayı uygulama doğrulayamaz; dürüst mesaj.
      showToast({
        type: "success",
        message: t("wordDownloadStarted"),
      });
    } catch (err) {
      console.error("[kombinasyonlar] Word raporu hatası:", err);
      setErrorMessage(t("wordError"));
    } finally {
      setWordBusy(false);
    }
  }, [selectedIds, groups, showToast, t, tc]);

  const handleMobileDeleteGroup = useCallback(async (issueKey: string) => {
    const firstConfirmed = await confirm({
      title: t("deleteGroupTitle"),
      message: t("deleteGroupMessage", { issue: issueKey }),
      tone: "danger",
      confirmText: t("confirmYesMobile"),
      cancelText: t("cancelNo"),
    });
    if (!firstConfirmed) return;

    const secondConfirmed = await confirm({
      title: t("secondConfirmTitle"),
      message: t("secondConfirmMessage"),
      tone: "danger",
      confirmText: t("secondConfirmYes"),
      cancelText: tc("giveUp"),
    });
    if (!secondConfirmed) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const result = await deleteCombinationsViaApi([issueKey]);

    setDeleteLoading(false);

    if (!result.ok) {
      setErrorMessage(t("deleteGroupError", { error: result.error ?? "" }));
      return;
    }

    showToast({ type: "success", message: t("deletedGroupToast", { issue: issueKey }) });
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(issueKey);
      return next;
    });
    void loadCombinations();
  }, [confirm, showToast, t, tc]);

  return (
    <DogaltasSectionShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={
        loading
          ? tc("loading")
          : t("subtitleCounts", {
              issues: uniqueIssues,
              variants: rows.length,
              shown: visibleGroups.length,
              total: groups.length,
            })
      }
      icon="🧩"
      maxWidthClass="max-w-[1720px]"
      actions={
        <button
          type="button"
          onClick={handleRefresh}
          className="btn-soft"
        >
          {t("refresh")}
        </button>
      }
    >
      <BfcacheRefreshHandler />
      <div className={pageContent}>

        {/* ── Filter bar ─────────────────────────────────────────────── */}
        <section className={uiFilterCard}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              className="relative min-w-0 flex-1"
              onSubmit={(e) => e.preventDefault()}
            >
              <span className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-base text-slate-400">
                ⌕
              </span>
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder={t("searchPlaceholder")}
                className={uiSearchInput}
                enterKeyHint="search"
                autoComplete="off"
              />
            </form>

            {categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={uiCategorySelect}
                aria-label={t("categoryFilterAria")}
              >
                <option value="">{t("allCategories")}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.length > 40 ? `${cat.slice(0, 40)}…` : cat}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <p className="text-[11px] font-medium text-slate-400">
              {isSearchActive
                ? t("searchCounts", { q: activeSearch, variants: filteredRows.length, titles: groups.length })
                : hasFilters
                  ? t("variantTitleCounts", { variants: filteredRows.length, titles: groups.length })
                  : t("variantTitleCounts", { variants: rows.length, titles: groups.length })}
              {loading && <span className="ml-2 text-emerald-600">{t("loadingInline")}</span>}
            </p>

            {!isDemo && !loading && groups.length > 0 && (
              <BulkExportBar
                compact
                selectedCount={selectedCount}
                totalCount={uniqueIssues}
                filteredCount={groups.length}
                hasActiveFilter={hasFilters}
                selectAllLabel={t("selectAll")}
                selectAllCount={groups.length}
                onSelectAll={selectAllFiltered}
                hideSelectAll={isMobile}
                onClearSelection={clearSelection}
                exportSelectedLabel={t("exportSelected")}
                onExportSelected={() => void exportCombosWord("selected")}
                onExportFiltered={() => void exportCombosWord("filtered")}
                onExportAll={() => void exportCombosWord("all")}
                onDeleteSelected={() => void deleteSelectedCombinations()}
                isExporting={wordBusy}
                isDeleting={deleteLoading}
              />
            )}
          </div>

          {/* UAT #2: "Tümünü Seç" tüm veri yüklü olduğu için filtrelenmiş TÜM
              başlıkları seçer (yalnız ekranda görüneni değil). */}
          {!isDemo && !loading && groups.length > 0 && (
            <p className="mt-1.5 text-[11px] font-medium text-slate-400">
              {t("selectAllNote", { count: groups.length })}
            </p>
          )}
        </section>

        {/* ── Error ──────────────────────────────────────────────────── */}
        {errorMessage && (
          <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage.startsWith("@@loadError:")
              ? errorMessage.slice("@@loadError:".length) === STONES_WORKSPACE_UNAVAILABLE
                ? tc("workspaceUnavailable")
                : t("loadError", { error: errorMessage.slice("@@loadError:".length) })
              : errorMessage}
          </div>
        )}

        {/* ── Content ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex h-[200px] items-center justify-center text-sm font-bold text-slate-400">
            {t("loadingRecords")}
          </div>
        ) : isEmptyDatabase ? (
          <div className="flex h-[200px] flex-col items-center justify-center text-center">
            <div className="text-4xl">✶</div>
            <p className="mt-2 text-base font-black text-slate-800">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm font-medium text-slate-500">{t("emptyDesc")}</p>
          </div>
        ) : isEmptyFiltered ? (
          <div className="flex h-[200px] flex-col items-center justify-center text-center">
            <div className="text-4xl">✶</div>
            <p className="mt-2 text-base font-black text-slate-800">{t("noResultTitle")}</p>
            <p className="mt-1 text-sm font-medium text-slate-500">{t("noResultDesc")}</p>
          </div>
        ) : (

          /* ── Card view ── */
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {visibleGroups.map(({ issue, rows: groupRows }) => {
              const sourceLine = firstSourceInGroup(groupRows);
              const category = groupDescription(groupRows);
              const ts = latestDisplayTimestamp(groupRows);
              const count = groupRows.length;
              const isViewedInSearch = isSearchActive && viewedIssueKeys.has(issue);
              const detailHref = combinationDetailHref(issue, activeSearch, isSearchActive);
              const preview = previewText(groupRows);
              const isSelected = selectedIds.has(issue);
              const stats = groupStats(groupRows);

              return (
                <article
                  key={issue}
                  className={`${uiComboCard} ${isSelected ? "border-violet-300 bg-violet-50/40" : ""} ${
                    isViewedInSearch ? "border-l-[3px] border-rose-500" : isSearchActive ? "border-l-[3px] border-amber-400" : ""
                  }`}
                >
                  {/* Checkbox + badges row */}
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleGroupSelection(issue)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t("selectAria", { issue })}
                      className={uiRowCheckbox}
                    />
                    <span className={uiComboBadge}>{t("variantBadge", { n: count })}</span>
                    {category && (
                      <span className={uiCategoryPill}>
                        {category === "İsimsiz"
                          ? t("untitled")
                          : isSearchActive ? renderHighlightedText(category, activeSearch) : category}
                      </span>
                    )}
                    {isSearchActive && (
                      <span className={SEARCH_MATCH_BADGE_CLASS}>{t("matchBadge")}</span>
                    )}
                    {isViewedInSearch && (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-700">{t("viewed")}</span>
                    )}
                  </div>

                  {/* Title */}
                  <h2 className="text-sm font-black leading-snug text-slate-950">
                    {isSearchActive ? renderHighlightedText(issue, activeSearch) : issue}
                  </h2>
                  <AdminTransferBadge
                    originType={
                      groupRows.some((r) => r.origin_type === "admin_transfer")
                        ? "admin_transfer"
                        : null
                    }
                    className="mt-1"
                  />

                  {/* Source */}
                  {sourceLine ? (
                    <DemoBlur isProtected={isDemo}>
                      <p className="mt-1 truncate text-[11px] font-medium text-violet-700">
                        {isSearchActive ? renderHighlightedText(sourceLine, activeSearch) : sourceLine}
                      </p>
                    </DemoBlur>
                  ) : null}

                  {/* Preview */}
                  {preview ? (
                    <DemoBlur isProtected={isDemo}>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                        {isSearchActive ? renderHighlightedText(preview, activeSearch) : preview}
                      </p>
                    </DemoBlur>
                  ) : null}

                  {/* Metadata */}
                  <DemoBlur isProtected={isDemo}>
                    <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                      {stats.sources > 0 ? t("sourcesCount", { n: stats.sources }) + " · " : ""}
                      {stats.stonesCount > 0 ? t("stoneTextCount", { n: stats.stonesCount }) + " · " : ""}
                      {ts ? formatListCardDate(ts) : "—"}
                    </p>
                  </DemoBlur>

                  {/* Action */}
                  <div className="mt-2 flex items-center gap-2">
                    <Link
                      href={detailHref}
                      onClick={() => { if (isSearchActive) handleCombinationNavigate(issue); }}
                      className={uiComboBtn}
                    >
                      {t("detailLink")}
                    </Link>
                    {!isDemo && isMobile && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); void handleMobileDeleteGroup(issue); }}
                        className="btn-danger !px-2.5 !py-1.5 !text-[11px] !rounded-lg"
                      >
                        {tc("delete")}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* ── Daha Fazla Göster ─────────────────────────────────────────
            Sayfalama: yalnız hasMoreGroups iken çıkar (boş listede çıkmaz);
            arama/filtre aktifken de eşleşmelerin kalanını açar → çıkmaz sokak yok. */}
        {!loading && !errorMessage && hasMoreGroups && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + GROUPS_PAGE_SIZE)}
              className="rounded-xl border border-violet-200 bg-white px-5 py-2.5 text-sm font-black text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-50"
            >
              {t("showMore", { shown: visibleGroups.length, total: groups.length })}
            </button>
          </div>
        )}

      </div>
    </DogaltasSectionShell>
  );
}
