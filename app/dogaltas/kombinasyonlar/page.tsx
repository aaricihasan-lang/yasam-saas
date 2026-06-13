"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";

const VIEWED_SEARCH_STORAGE_KEY = "yasam-combinations-viewed-search-results";

const COMBINATIONS_SEARCH_STORAGE_KEYS = [
  "yasam-combinations-search",
  "yasam-combinations-search-query",
  "combinations-search",
  "searchTerm",
  "q",
] as const;

const HIGHLIGHT_MARK_CLASS = "rounded bg-yellow-200 px-1 font-bold text-slate-950";
const SEARCH_MATCH_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700";

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
    .replace(/[̀-ͯ]/g, "");
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

const COMBINATIONS_SELECT =
  "id,tenant_id,source_id,issue,description,variant_index,source,stones_text,notes_text,notes_text_2,notes_text_3,created_at";

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

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#eef2ff_35%,#f8fafc_100%)] text-slate-950";
const pageContent =
  "relative z-10 mx-auto w-full max-w-[1720px] space-y-2 px-4 py-3 sm:px-5 lg:px-8 2xl:px-10";
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
  "inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-black text-cyan-900";
const uiComboBtn =
  "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-50";
const uiSelectActionBtn =
  "h-7 rounded-lg border px-3 text-[11px] font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50";
const uiRowCheckbox =
  "h-4 w-4 shrink-0 cursor-pointer rounded border border-slate-300 accent-violet-600 focus:ring-2 focus:ring-violet-200/40";

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

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setLoading(false);
      setRows([]);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { data, error } = await supabase
      .from("combinations")
      .select(COMBINATIONS_SELECT)
      .eq("tenant_id", tenantId)
      .order("issue", { ascending: true })
      .order("variant_index", { ascending: true });

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıtlar alınamadı: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data || []) as CombinationRecord[]);
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

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setDeleteLoading(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { error } = await supabase
      .from("combinations")
      .delete()
      .eq("tenant_id", tenantId)
      .in("issue", issueKeys);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Seçili kombinasyonlar silinemedi: ${error.message}`);
      return;
    }

    showToast({ type: "success", message: `${deleteCount} kombinasyon silindi` });
    setSelectedIds(new Set());
    await loadCombinations();
  }, [confirm, isMobile, selectedIds, showToast]);

  const exportCombosWord = useCallback(async (mode: "selected" | "all" | "filtered") => {
    const tenantId = await getSyncedTenantId();
    if (!tenantId) { setErrorMessage(MISSING_SESSION_TENANT_MESSAGE); return; }
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
      const body: Record<string, unknown> = { tenantId, exportMode: mode };
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

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setDeleteLoading(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { error } = await supabase
      .from("combinations")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("issue", issueKey);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Kombinasyon silinemedi: ${error.message}`);
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
    <main className={pageBg}>
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute left-0 top-0 h-[400px] w-[400px] rounded-full bg-cyan-300/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-violet-300/15 blur-[120px]" />

      <div className={pageContent}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className={`${uiHeaderCard} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-black tracking-[0.15em] text-violet-700">
                TAŞ KOMBİNASYONLARI
              </span>
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Taş Kombinasyonları
            </h1>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              {loading
                ? "Yükleniyor..."
                : `${uniqueIssues} başlık · ${rows.length} variant · ${groups.length} gösterilen`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-cyan-50"
            >
              Yenile
            </button>
          </div>
        </header>

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
              {loading && <span className="ml-2 text-cyan-600">yükleniyor...</span>}
            </p>

            {!loading && groups.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500">
                  Seçili: <span className="font-black text-violet-700">{selectedCount}</span>
                </span>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={selectAllFiltered}
                  className={`${uiSelectActionBtn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
                >
                  Tümünü Seç
                </button>
                <button
                  type="button"
                  disabled={deleteLoading || selectedCount === 0}
                  onClick={clearSelection}
                  className={`${uiSelectActionBtn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
                >
                  Temizle
                </button>
                <button
                  type="button"
                  disabled={deleteLoading || selectedCount === 0}
                  onClick={() => void deleteSelectedCombinations()}
                  className={`${uiSelectActionBtn} border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100`}
                >
                  {deleteLoading ? "Siliniyor..." : "Sil"}
                </button>
                <span className="h-4 w-px bg-slate-200 hidden sm:block" aria-hidden />
                <button
                  type="button"
                  disabled={wordBusy || selectedCount === 0}
                  onClick={() => void exportCombosWord("selected")}
                  className={`${uiSelectActionBtn} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
                >
                  {wordBusy ? "⏳..." : `📄 Seçili Word (${selectedCount})`}
                </button>
                {hasFilters && (
                  <button
                    type="button"
                    disabled={wordBusy}
                    onClick={() => void exportCombosWord("filtered")}
                    className={`${uiSelectActionBtn} border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100`}
                  >
                    {wordBusy ? "⏳..." : `📄 Filtreli Word (${groups.length})`}
                  </button>
                )}
                <button
                  type="button"
                  disabled={wordBusy}
                  onClick={() => void exportCombosWord("all")}
                  className={`${uiSelectActionBtn} border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100`}
                >
                  {wordBusy ? "⏳..." : "📄 Tümünü Word"}
                </button>
              </div>
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
              {groups.map(({ issue, rows: groupRows }) => {
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
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleMobileDeleteGroup(issue); }}
                        className="min-h-[36px] shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 text-xs font-black text-rose-600 hover:bg-rose-100"
                      >
                        Sil
                      </button>
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
                        {sourceLine ? (
                          isSearchActive ? renderHighlightedText(sourceLine, activeSearch) : sourceLine
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                      <div className="whitespace-nowrap font-medium text-slate-500">
                        {ts ? formatListCardDate(ts) : "—"}
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
            {groups.map(({ issue, rows: groupRows }) => {
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
                    <p className="mt-1 truncate text-[11px] font-medium text-violet-700">
                      {isSearchActive ? renderHighlightedText(sourceLine, activeSearch) : sourceLine}
                    </p>
                  ) : null}

                  {/* Preview */}
                  {preview ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                      {isSearchActive ? renderHighlightedText(preview, activeSearch) : preview}
                    </p>
                  ) : null}

                  {/* Metadata */}
                  <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                    {stats.sources > 0 ? `${stats.sources} kaynak · ` : ""}
                    {stats.stonesCount > 0 ? `${stats.stonesCount} taş metni · ` : ""}
                    {ts ? formatListCardDate(ts) : "—"}
                  </p>

                  {/* Action */}
                  <div className="mt-2 flex items-center gap-2">
                    <Link
                      href={detailHref}
                      onClick={() => { if (isSearchActive) handleCombinationNavigate(issue); }}
                      className={uiComboBtn}
                    >
                      Detay →
                    </Link>
                    {isMobile && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); void handleMobileDeleteGroup(issue); }}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-black text-rose-600 hover:bg-rose-100"
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

      </div>
    </main>
  );
}
