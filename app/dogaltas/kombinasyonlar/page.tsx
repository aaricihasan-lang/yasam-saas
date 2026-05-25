"use client";

import { runInEffect } from "@/lib/runInEffect";
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
  "inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700";

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

function previewText(rows: CombinationRecord[], limit = 140) {
  for (const row of rows) {
    const chunk = [row.stones_text, row.notes_text, row.notes_text_2, row.notes_text_3, row.source]
      .find((v) => v && v.trim().length > 0)
      ?.replace(/\s+/g, " ")
      .trim();

    if (chunk) {
      return chunk.length > limit ? `${chunk.slice(0, limit)}…` : chunk;
    }
  }

  return "Henüz önizleme metni yok.";
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

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#eef2ff_35%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-6 px-3 py-6 sm:px-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[34px] border-[3px] border-violet-300/45 bg-white/75 p-4 shadow-[0_0_45px_rgba(139,92,246,0.16)] backdrop-blur-xl sm:p-6 lg:p-8";
const uiStatCard =
  "rounded-2xl border-2 border-cyan-200 bg-white/85 px-2 py-3 text-center shadow-md sm:px-5 sm:py-4 lg:px-8";
const uiFilterCard =
  "rounded-[30px] border-[3px] border-cyan-300/45 bg-white/75 p-5 shadow-[0_0_40px_rgba(34,211,238,0.14)] backdrop-blur-xl";
const uiSearchInput =
  "h-14 w-full rounded-2xl border-2 border-cyan-200 bg-white/90 px-5 pl-12 font-semibold shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";
const uiCategorySelect =
  "h-14 min-w-[200px] rounded-2xl border-2 border-violet-200 bg-white/90 px-4 font-bold text-slate-800 shadow-inner outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-300/30";
const uiViewBtn =
  "rounded-2xl px-6 py-4 font-black shadow-md transition-all duration-300 hover:-translate-y-1";
const uiComboCard =
  "relative flex flex-col overflow-hidden rounded-[32px] border-[3px] border-cyan-300/45 bg-white/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.15)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-2 hover:border-violet-400 hover:shadow-[0_0_55px_rgba(139,92,246,0.18)]";
const uiComboBadge =
  "inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 font-black text-white shadow-md";
const uiCategoryPill =
  "inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-900";
const uiComboBtn =
  "mt-4 inline-flex w-fit items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white shadow-lg transition hover:bg-violet-700";
const uiSelectActionBtn =
  "min-h-[44px] rounded-2xl border-2 px-5 py-3 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
const uiRowCheckbox =
  "h-5 w-5 shrink-0 cursor-pointer rounded-md border-2 border-cyan-300 text-cyan-600 shadow-sm accent-cyan-600 focus:ring-2 focus:ring-cyan-300/40";

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
    if (readUrlSearchQuery()) {
      stripUrlSearchQuery();
    }
    clearCombinationsSearchStorage();
    setSearchTerm("");
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (!value.trim()) {
      if (readUrlSearchQuery()) {
        stripUrlSearchQuery();
      }
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
    runInEffect(() => {
      void loadCombinations();
    });
  }, []);

  useEffect(() => {
    const q = readUrlSearchQuery();
    if (q) {
      setSearchTerm(q);
    }
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
  const isEmptyDatabase = !loading && !errorMessage && rows.length === 0;
  const isEmptyFiltered = !loading && !errorMessage && rows.length > 0 && groups.length === 0;

  const selectedCount = selectedIds.size;

  const toggleGroupSelection = useCallback((issue: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(issue)) {
        next.delete(issue);
      } else {
        next.add(issue);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(groups.map((group) => group.issue)));
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

    showToast({
      type: "success",
      message: `${deleteCount} kombinasyon silindi`,
    });
    setSelectedIds(new Set());
    await loadCombinations();
  }, [confirm, isMobile, selectedIds, showToast]);

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-cyan-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-black tracking-[0.18em] text-violet-700">
              ✶ TAŞ KOMBİNASYONLARI
            </div>

            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl">
              Taş Kombinasyonları
            </h1>

            <p className="mt-2 text-sm font-medium text-slate-600 sm:mt-3 sm:text-base lg:text-lg xl:text-xl">
              Rahatsızlık başlığına göre gruplanmış kombinasyon bilgi bankası.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex h-12 max-w-full shrink-0 items-center gap-2 rounded-2xl border-2 border-cyan-200 bg-white px-4 font-black text-slate-800 shadow-md transition hover:bg-cyan-50 sm:h-14 sm:px-6"
              >
                <svg
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 text-cyan-600/90"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" />
                </svg>
                <span className="truncate">Ana Panele Dön</span>
              </Link>

              <Link
                href="/dogaltas"
                className="inline-flex h-12 max-w-full shrink-0 items-center gap-2 rounded-2xl border-2 border-cyan-200 bg-cyan-50 px-4 font-black text-slate-800 shadow-md transition hover:bg-cyan-100 sm:h-14 sm:px-6"
              >
                <span className="shrink-0 text-base leading-none" aria-hidden>
                  💎
                </span>
                <span className="truncate">Doğaltaş Sayfasına Dön</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 lg:min-w-[480px]">
            <div className={uiStatCard}>
              <div className="text-xl font-black text-slate-950 sm:text-3xl">{rows.length}</div>
              <div className="text-xs font-bold text-slate-500 sm:text-sm">Variant</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-xl font-black text-slate-950 sm:text-3xl">{uniqueIssues}</div>
              <div className="text-xs font-bold text-slate-500 sm:text-sm">Sorun / Issue</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-xl font-black text-slate-950 sm:text-3xl">{groups.length}</div>
              <div className="text-xs font-bold text-slate-500 sm:text-sm">Görünen grup</div>
            </div>
          </div>
        </header>

        <section className={uiFilterCard}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <form
              className="relative min-w-0 w-full flex-1"
              onSubmit={(event) => event.preventDefault()}
            >
              <span className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[17px] text-slate-400">
                ⌕
              </span>

              <input
                type="search"
                value={searchTerm}
                onChange={(event) => handleSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="Issue, açıklama, taş metni veya notlarda ara..."
                className={uiSearchInput}
                enterKeyHint="search"
                autoComplete="off"
              />
            </form>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={uiCategorySelect}
              aria-label="Kategori filtresi"
            >
              <option value="">Tüm kategoriler</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <div className="flex w-full shrink-0 flex-wrap items-center gap-3 xl:w-auto xl:justify-end">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`${uiViewBtn} ${
                  viewMode === "list"
                    ? "bg-slate-950 text-white"
                    : "border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Liste
              </button>

              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`${uiViewBtn} ${
                  viewMode === "card"
                    ? "bg-slate-950 text-white"
                    : "border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Kart
              </button>

              <button
                type="button"
                onClick={handleRefresh}
                className={`${uiViewBtn} border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
              >
                Yenile
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-[11px] font-bold text-slate-400">
              {isSearchActive
                ? `Arama: “${activeSearch}” · ${filteredRows.length} variant · ${groups.length} grup`
                : hasFilters
                  ? `${filteredRows.length} variant · ${groups.length} grup`
                  : `${rows.length} variant · ${groups.length} grup`}
            </p>

            {loading && (
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                Yükleniyor...
              </span>
            )}
          </div>

          {!loading && groups.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <span className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-800 shadow-sm">
                Seçili: {selectedCount}
              </span>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={selectAllFiltered}
                className={`${uiSelectActionBtn} border-cyan-200 bg-cyan-50 text-cyan-950 hover:bg-cyan-100`}
              >
                Tümünü Seç
              </button>
              <button
                type="button"
                disabled={deleteLoading || selectedCount === 0}
                onClick={clearSelection}
                className={`${uiSelectActionBtn} border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100`}
              >
                Seçimi Temizle
              </button>
              <button
                type="button"
                disabled={deleteLoading || selectedCount === 0}
                onClick={() => void deleteSelectedCombinations()}
                className={`${uiSelectActionBtn} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}
              >
                {deleteLoading ? "Siliniyor..." : "Seçilenleri Sil"}
              </button>
            </div>
          ) : null}
        </section>

        {errorMessage ? (
          <div className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[28px] bg-white/72 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.04)] ring-1 ring-white/80">
          {loading ? (
            <div className="flex h-[280px] items-center justify-center text-[14px] font-bold text-slate-400">
              Kayıtlar yükleniyor...
            </div>
          ) : isEmptyDatabase ? (
            <div className="flex h-[280px] flex-col items-center justify-center rounded-[24px] bg-white/70 text-center ring-1 ring-white">
              <div className="text-[48px]">✶</div>
              <h3 className="mt-2 text-[18px] font-black text-slate-900">Henüz kombinasyon kaydı yok</h3>
              <p className="mt-2 max-w-[400px] text-[13px] leading-6 text-slate-500">
                Admin panelinden JSON aktarımı yapıldığında kayıtlar burada listelenir.
              </p>
            </div>
          ) : isEmptyFiltered ? (
            <div className="flex h-[280px] flex-col items-center justify-center rounded-[24px] bg-white/70 text-center ring-1 ring-white">
              <div className="text-[48px]">✶</div>
              <h3 className="mt-2 text-[18px] font-black text-slate-900">Sonuç bulunamadı</h3>
              <p className="mt-2 max-w-[400px] text-[13px] leading-6 text-slate-500">
                Arama veya kategori filtresini değiştirin.
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="overflow-hidden rounded-[24px] bg-white/86 ring-1 ring-slate-100">
              {/* Column headers — desktop only */}
              <div className="hidden grid-cols-[auto_1.2fr_0.9fr_0.55fr_1fr_0.78fr_0.62fr] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 md:grid">
                <div className="w-8" aria-hidden />
                <div>Issue</div>
                <div>Kategori</div>
                <div>Kombinasyon</div>
                <div>Kaynak</div>
                <div>Son kayıt</div>
                <div className="text-right">İşlem</div>
              </div>

              <div className="divide-y divide-slate-100">
                {groups.map(({ issue, rows: groupRows }) => {
                  const sourceLine = firstSourceInGroup(groupRows);
                  const category = groupDescription(groupRows);
                  const ts = latestDisplayTimestamp(groupRows);
                  const count = groupRows.length;
                  const isViewedInSearch =
                    isSearchActive && viewedIssueKeys.has(issue);
                  const detailHref = combinationDetailHref(
                    issue,
                    activeSearch,
                    isSearchActive,
                  );
                  const sourceDisplay = sourceLine || "Kaynak belirtilmedi";
                  const isSelected = selectedIds.has(issue);

                  return (
                    <Fragment key={issue}>
                      {/* Mobile row: checkbox + issue name + detail button */}
                      <div
                        className={`relative flex items-center gap-3 px-3 py-3.5 transition hover:bg-cyan-50/45 md:hidden ${
                          isSelected ? "bg-violet-50/60" : ""
                        } ${
                          isViewedInSearch
                            ? "border-l-4 border-rose-600"
                            : isSearchActive
                              ? "border-l-4 border-amber-400"
                              : ""
                        }`}
                      >
                        {isViewedInSearch ? (
                          <span className="absolute bottom-0 left-0 top-0 w-1.5 bg-rose-600" aria-hidden />
                        ) : null}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleGroupSelection(issue)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`${issue} seç`}
                          className={uiRowCheckbox}
                        />
                        <div className={`min-w-0 flex-1 ${isViewedInSearch ? "pl-1" : ""}`}>
                          {isSearchActive ? (
                            <div className="mb-0.5 flex flex-wrap items-center gap-1">
                              <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme</span>
                              {isViewedInSearch ? (
                                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-800 ring-1 ring-rose-200">
                                  Bakıldı
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="line-clamp-2 text-sm font-black leading-snug text-slate-950">
                            {isSearchActive
                              ? renderHighlightedText(issue, activeSearch)
                              : issue}
                          </div>
                        </div>
                        <Link
                          href={detailHref}
                          onClick={() => {
                            if (isSearchActive) handleCombinationNavigate(issue);
                          }}
                          className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-md transition hover:bg-violet-700"
                        >
                          Detay →
                        </Link>
                      </div>

                      {/* Desktop row: all 7 columns */}
                      <div
                        className={`relative hidden grid-cols-[auto_1.2fr_0.9fr_0.55fr_1fr_0.78fr_0.62fr] gap-3 overflow-hidden px-4 py-3 text-[12px] transition hover:bg-cyan-50/45 md:grid ${
                          isSelected ? "bg-violet-50/60" : ""
                        } ${
                          isViewedInSearch
                            ? "border-l-4 border-rose-600"
                            : isSearchActive
                              ? "border-l-4 border-amber-400"
                              : ""
                        }`}
                      >
                        {isViewedInSearch ? (
                          <span
                            className="absolute bottom-0 left-0 top-0 w-1.5 bg-rose-600"
                            aria-hidden
                          />
                        ) : null}
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleGroupSelection(issue)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`${issue} seç`}
                            className={uiRowCheckbox}
                          />
                        </div>
                        <div className={`min-w-0 font-black text-slate-950 ${isViewedInSearch ? "pl-2" : ""}`}>
                          {isSearchActive ? (
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme Var</span>
                              {isViewedInSearch ? (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-800 ring-1 ring-rose-200">
                                  Bakıldı
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <span className="block truncate">
                            {isSearchActive
                              ? renderHighlightedText(issue, activeSearch)
                              : issue}
                          </span>
                        </div>
                        <div className={`min-w-0 font-semibold text-violet-800 ${isViewedInSearch ? "pl-2" : ""}`}>
                          <span className="line-clamp-2 block">
                            {isSearchActive && category
                              ? renderHighlightedText(category, activeSearch)
                              : category || "—"}
                          </span>
                        </div>
                        <div className={`font-bold text-slate-600 ${isViewedInSearch ? "pl-2" : ""}`}>
                          {count}
                        </div>
                        <div className={`min-w-0 text-slate-600 ${isViewedInSearch ? "pl-2" : ""}`}>
                          <span className="line-clamp-2 block font-medium">
                            {isSearchActive && sourceLine
                              ? renderHighlightedText(sourceDisplay, activeSearch)
                              : sourceLine ? (
                                sourceDisplay
                              ) : (
                                <span className="text-slate-400">Kaynak belirtilmedi</span>
                              )}
                          </span>
                        </div>
                        <div
                          className={`whitespace-nowrap text-[12px] font-semibold text-slate-500 ${isViewedInSearch ? "pl-2" : ""}`}
                        >
                          {ts ? formatListCardDate(ts) : "—"}
                        </div>
                        <div className="flex justify-end">
                          <Link
                            href={detailHref}
                            onClick={() => {
                              if (isSearchActive) handleCombinationNavigate(issue);
                            }}
                            className={`${uiComboBtn} !mt-0 px-4 py-3 text-sm`}
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
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {groups.map(({ issue, rows: groupRows }) => {
                const sourceLine = firstSourceInGroup(groupRows);
                const category = groupDescription(groupRows);
                const ts = latestDisplayTimestamp(groupRows);
                const count = groupRows.length;
                const isViewedInSearch =
                  isSearchActive && viewedIssueKeys.has(issue);
                const detailHref = combinationDetailHref(
                  issue,
                  activeSearch,
                  isSearchActive,
                );
                const preview = previewText(groupRows);
                const isSelected = selectedIds.has(issue);

                return (
                  <article
                    key={issue}
                    className={`${uiComboCard} ${
                      isSelected ? "border-violet-400/70 bg-violet-50/50" : ""
                    } ${
                      isViewedInSearch
                        ? "border-l-4 border-rose-600"
                        : isSearchActive
                          ? "border-l-4 border-amber-400"
                          : ""
                    }`}
                  >
                    {isViewedInSearch ? (
                      <span
                        className="absolute bottom-0 left-0 top-0 w-1.5 bg-rose-600"
                        aria-hidden
                      />
                    ) : null}
                    <div
                      className={`absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl bg-white/90 px-2 py-1.5 shadow-sm ring-1 ring-slate-100 ${isViewedInSearch ? "left-6" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleGroupSelection(issue)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`${issue} seç`}
                        className={uiRowCheckbox}
                      />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Seç
                      </span>
                    </div>
                    <div className={`flex gap-3 pt-10 ${isViewedInSearch ? "pl-2" : ""}`}>
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#ede9fe_0%,#e0f2fe_48%,#d1fae5_100%)] text-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_20px_rgba(139,92,246,0.12)] ring-1 ring-white/90"
                        aria-hidden
                      >
                        ✦
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={uiComboBadge}>{count} kombinasyon</span>
                          {isSearchActive ? (
                            <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme Var</span>
                          ) : null}
                          {isViewedInSearch ? (
                            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-800 ring-1 ring-rose-200">
                              Bakıldı
                            </span>
                          ) : null}
                          {category ? (
                            <span className={uiCategoryPill}>
                              {isSearchActive
                                ? renderHighlightedText(category, activeSearch)
                                : category}
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-3 text-3xl font-black text-slate-950">
                          {isSearchActive
                            ? renderHighlightedText(issue, activeSearch)
                            : issue}
                        </h2>

                        <p className="mt-2 line-clamp-2 text-sm font-bold text-cyan-700">
                          {sourceLine ? (
                            <>
                              <span>Kaynak: </span>
                              {isSearchActive
                                ? renderHighlightedText(sourceLine, activeSearch)
                                : sourceLine}
                            </>
                          ) : (
                            <span className="text-slate-400">Kaynak belirtilmedi</span>
                          )}
                        </p>

                        <p className="mt-3 flex-1 text-base leading-7 text-slate-700">
                          {isSearchActive
                            ? renderHighlightedText(preview, activeSearch)
                            : preview}
                        </p>

                        <p className="mt-2 text-sm font-medium text-slate-500">
                          {ts ? `Son kayıt: ${formatListCardDate(ts)}` : "Son kayıt: —"}
                        </p>

                        <Link
                          href={detailHref}
                          onClick={() => {
                            if (isSearchActive) handleCombinationNavigate(issue);
                          }}
                          className={uiComboBtn}
                        >
                          Kombinasyonları Gör →
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
