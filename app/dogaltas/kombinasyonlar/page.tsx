"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { fetchCombinationsViaApi } from "@/lib/dogaltas/combinationsApi";

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
const uiViewBtn = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-xs font-black transition ${
    active
      ? "bg-slate-950 text-white shadow-sm"
      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
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
  const [rows, setRows] = useState<CombinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [viewedIssueKeys, setViewedIssueKeys] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<"list" | "card">("card");
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
      setErrorMessage(`Kayıtlar alınamadı: ${result.error ?? ""}`);
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

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const desc = row.description?.trim();
      if (desc) set.add(desc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr-TR"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const category = categoryFilter.trim();
    return rows.filter((row) => {
      if (category && (row.description?.trim() || "") !== category) return false;
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
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(issue)) next.delete(issue);
      else next.add(issue);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => { setSelectedIds(new Set()); }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(groups.map((g) => g.issue)));
  }, [groups]);

  const deleteSelectedCombinations = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const issueKeys = Array.from(selectedIds);
    const deleteCount = issueKeys.length;

    const firstConfirmed = await confirm({
      title: isMobile ? "Bu kaydı silmek istiyor musunuz?" : "Kombinasyonları sil",
      message: `Seçili ${deleteCount} kombinasyon silinecek`,
      tone: "danger",
      confirmText: isMobile ? "Evet" : "Evet Sil",
      cancelText: isMobile ? "Hayır" : "Vazgeç",
    });
    if (!firstConfirmed) return;

    if (isMobile) {
      const secondConfirmed = await confirm({
        title: "Son Onay",
        message: "Bu işlem geri alınamaz. Kalıcı olarak silinsin mi?",
        tone: "danger",
        confirmText: "Evet, Kalıcı Sil",
        cancelText: "Vazgeç",
      });
      if (!secondConfirmed) return;
    }

    setDeleteLoading(true);
    setErrorMessage("");

    const result = await deleteCombinationsViaApi(issueKeys);

    setDeleteLoading(false);

    if (!result.ok) {
      setErrorMessage(`Seçili kombinasyonlar silinemedi: ${result.error ?? ""}`);
      return;
    }

    showToast({ type: "success", message: `${deleteCount} kombinasyon silindi` });
    setSelectedIds(new Set());
    await loadCombinations();
  }, [confirm, isMobile, selectedIds, showToast]);

  const exportCombosWord = useCallback(async (mode: "selected" | "all" | "filtered") => {
    const tenantId = await getSyncedTenantId();
    if (!tenantId) { setErrorMessage(MISSING_SESSION_TENANT_MESSAGE); return; }
    const userId = readYasamUser()?.id;
    if (!userId) { setErrorMessage(MISSING_SESSION_TENANT_MESSAGE); return; }
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
      const body: Record<string, unknown> = { tenantId, userId, exportMode: mode };
      if (issues) body.issues = issues;
      const res = await fetch("/api/dogaltas/combinations/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setErrorMessage(data.error ?? "Rapor oluşturulamadı.");
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
    } catch { setErrorMessage("Rapor oluşturulamadı."); } finally {
      setWordBusy(false);
    }
  }, [selectedIds, groups]);

  const handleMobileDeleteGroup = useCallback(async (issueKey: string) => {
    const firstConfirmed = await confirm({
      title: "Bu kombinasyonu silmek istiyor musunuz?",
      message: `"${issueKey}" grubundaki tüm kayıtlar silinecek`,
      tone: "danger",
      confirmText: "Evet",
      cancelText: "Hayır",
    });
    if (!firstConfirmed) return;

    const secondConfirmed = await confirm({
      title: "Son Onay",
      message: "Bu işlem geri alınamaz. Kalıcı olarak silinsin mi?",
      tone: "danger",
      confirmText: "Evet, Kalıcı Sil",
      cancelText: "Vazgeç",
    });
    if (!secondConfirmed) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const result = await deleteCombinationsViaApi([issueKey]);

    setDeleteLoading(false);

    if (!result.ok) {
      setErrorMessage(`Kombinasyon silinemedi: ${result.error ?? ""}`);
      return;
    }

    showToast({ type: "success", message: `"${issueKey}" silindi` });
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(issueKey);
      return next;
    });
    void loadCombinations();
  }, [confirm, showToast]);

  return (
    <DogaltasSectionShell
      eyebrow="DOĞALTAŞ · TAŞ KOMBİNASYONLARI"
      title="Taş Kombinasyonları"
      subtitle={
        loading
          ? "Yükleniyor..."
          : `${uniqueIssues} başlık · ${rows.length} variant · ${visibleGroups.length}/${groups.length} gösterilen`
      }
      icon="🧩"
      maxWidthClass="max-w-[1720px]"
      actions={
        <button
          type="button"
          onClick={handleRefresh}
          className="btn-soft"
        >
          Yenile
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
                placeholder="Başlık, taş, kaynak veya not ara..."
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
                aria-label="Kategori filtresi"
              >
                <option value="">Tüm kategoriler</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}

            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setViewMode("list")} className={uiViewBtn(viewMode === "list")}>Liste</button>
              <button type="button" onClick={() => setViewMode("card")} className={uiViewBtn(viewMode === "card")}>Kart</button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <p className="text-[11px] font-medium text-slate-400">
              {isSearchActive
                ? `"${activeSearch}" · ${filteredRows.length} variant · ${groups.length} başlık`
                : hasFilters
                  ? `${filteredRows.length} variant · ${groups.length} başlık`
                  : `${rows.length} variant · ${groups.length} başlık`}
              {loading && <span className="ml-2 text-emerald-600">yükleniyor...</span>}
            </p>

            {!isDemo && !loading && groups.length > 0 && (
              <BulkExportBar
                compact
                selectedCount={selectedCount}
                totalCount={uniqueIssues}
                filteredCount={groups.length}
                hasActiveFilter={hasFilters}
                selectAllCount={groups.length}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                onExportSelected={() => void exportCombosWord("selected")}
                onExportFiltered={() => void exportCombosWord("filtered")}
                onExportAll={() => void exportCombosWord("all")}
                onDeleteSelected={() => void deleteSelectedCombinations()}
                isExporting={wordBusy}
                isDeleting={deleteLoading}
              />
            )}
          </div>
        </section>

        {/* ── Error ──────────────────────────────────────────────────── */}
        {errorMessage && (
          <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        )}

        {/* ── Content ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex h-[200px] items-center justify-center text-sm font-bold text-slate-400">
            Kayıtlar yükleniyor...
          </div>
        ) : isEmptyDatabase ? (
          <div className="flex h-[200px] flex-col items-center justify-center text-center">
            <div className="text-4xl">✶</div>
            <p className="mt-2 text-base font-black text-slate-800">Henüz kombinasyon kaydı yok</p>
            <p className="mt-1 text-sm font-medium text-slate-500">Admin panelinden JSON aktarımı yapıldığında kayıtlar burada listelenir.</p>
          </div>
        ) : isEmptyFiltered ? (
          <div className="flex h-[200px] flex-col items-center justify-center text-center">
            <div className="text-4xl">✶</div>
            <p className="mt-2 text-base font-black text-slate-800">Sonuç bulunamadı</p>
            <p className="mt-1 text-sm font-medium text-slate-500">Arama veya kategori filtresini değiştirin.</p>
          </div>
        ) : viewMode === "list" ? (

          /* ── List view ── */
          <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-xl">
            {/* Column headers — desktop */}
            <div className="hidden grid-cols-[auto_1.4fr_0.8fr_0.4fr_1fr_0.7fr_0.5fr] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 md:grid">
              <div className="w-5" aria-hidden />
              <div>Başlık</div>
              <div>Kategori</div>
              <div>Variant</div>
              <div>Kaynak</div>
              <div>Tarih</div>
              <div className="text-right">İşlem</div>
            </div>

            <div className="divide-y divide-slate-100">
              {visibleGroups.map(({ issue, rows: groupRows }) => {
                const sourceLine = firstSourceInGroup(groupRows);
                const category = groupDescription(groupRows);
                const ts = latestDisplayTimestamp(groupRows);
                const count = groupRows.length;
                const isViewedInSearch = isSearchActive && viewedIssueKeys.has(issue);
                const detailHref = combinationDetailHref(issue, activeSearch, isSearchActive);
                const isSelected = selectedIds.has(issue);

                return (
                  <Fragment key={issue}>
                    {/* Mobile */}
                    <div
                      className={`relative flex items-center gap-2 px-3 py-2.5 transition hover:bg-violet-50/30 md:hidden ${
                        isSelected ? "bg-violet-50/40" : ""
                      } ${isViewedInSearch ? "border-l-[3px] border-rose-500" : isSearchActive ? "border-l-[3px] border-amber-400" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleGroupSelection(issue)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${issue} seç`}
                        className={uiRowCheckbox}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-900">
                        {isSearchActive ? renderHighlightedText(issue, activeSearch) : issue}
                      </span>
                      <Link
                        href={detailHref}
                        onClick={() => { if (isSearchActive) handleCombinationNavigate(issue); }}
                        className="shrink-0 text-xs font-bold text-violet-600 hover:text-violet-800"
                      >
                        Detay →
                      </Link>
                      {!isDemo && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleMobileDeleteGroup(issue); }}
                          className="btn-danger shrink-0 !px-2 !py-1 !text-xs !rounded-lg min-h-[36px]"
                        >
                          Sil
                        </button>
                      )}
                    </div>

                    {/* Desktop */}
                    <div
                      className={`relative hidden grid-cols-[auto_1.4fr_0.8fr_0.4fr_1fr_0.7fr_0.5fr] gap-3 px-4 py-2.5 text-[12px] transition hover:bg-violet-50/20 md:grid ${
                        isSelected ? "bg-violet-50/30" : ""
                      } ${isViewedInSearch ? "border-l-[3px] border-rose-500" : isSearchActive ? "border-l-[3px] border-amber-400" : ""}`}
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleGroupSelection(issue)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`${issue} seç`}
                          className={uiRowCheckbox}
                        />
                      </div>
                      <div className="min-w-0 font-black text-slate-900">
                        {isSearchActive ? (
                          <div className="mb-0.5 flex flex-wrap items-center gap-1">
                            <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme</span>
                            {isViewedInSearch && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-700">
                                Bakıldı
                              </span>
                            )}
                          </div>
                        ) : null}
                        <span className="block truncate">
                          {isSearchActive ? renderHighlightedText(issue, activeSearch) : issue}
                        </span>
                      </div>
                      <div className="min-w-0 truncate font-semibold text-violet-700">
                        {isSearchActive && category
                          ? renderHighlightedText(category, activeSearch)
                          : category || <span className="text-slate-400">—</span>}
                      </div>
                      <div className="font-black text-slate-700">{count}</div>
                      <div className="min-w-0 truncate font-medium text-slate-600">
                        <DemoBlur isProtected={isDemo}>
                          {sourceLine ? (
                            isSearchActive ? renderHighlightedText(sourceLine, activeSearch) : sourceLine
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </DemoBlur>
                      </div>
                      <div className="whitespace-nowrap font-medium text-slate-500">
                        <DemoBlur isProtected={isDemo}>
                          {ts ? formatListCardDate(ts) : "—"}
                        </DemoBlur>
                      </div>
                      <div className="flex justify-end">
                        <Link
                          href={detailHref}
                          onClick={() => { if (isSearchActive) handleCombinationNavigate(issue); }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-800 shadow-sm hover:border-violet-300 hover:bg-violet-50"
                        >
                          Detay →
                        </Link>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
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
                      aria-label={`${issue} seç`}
                      className={uiRowCheckbox}
                    />
                    <span className={uiComboBadge}>{count} variant</span>
                    {category && (
                      <span className={uiCategoryPill}>
                        {isSearchActive ? renderHighlightedText(category, activeSearch) : category}
                      </span>
                    )}
                    {isSearchActive && (
                      <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme</span>
                    )}
                    {isViewedInSearch && (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-700">Bakıldı</span>
                    )}
                  </div>

                  {/* Title */}
                  <h2 className="text-sm font-black leading-snug text-slate-950">
                    {isSearchActive ? renderHighlightedText(issue, activeSearch) : issue}
                  </h2>

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
                      {stats.sources > 0 ? `${stats.sources} kaynak · ` : ""}
                      {stats.stonesCount > 0 ? `${stats.stonesCount} taş metni · ` : ""}
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
                      Detay →
                    </Link>
                    {!isDemo && isMobile && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); void handleMobileDeleteGroup(issue); }}
                        className="btn-danger !px-2.5 !py-1.5 !text-[11px] !rounded-lg"
                      >
                        Sil
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
              Daha Fazla Göster ({visibleGroups.length} / {groups.length})
            </button>
          </div>
        )}

      </div>
    </DogaltasSectionShell>
  );
}
