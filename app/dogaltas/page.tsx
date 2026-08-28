"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { runInEffect } from "@/lib/runInEffect";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { fetchCombinationsViaApi } from "@/lib/dogaltas/combinationsApi";
import { fetchStonesListCount } from "@/lib/dogaltas/stonesListFetch";
import { fetchMineralsListCount } from "@/lib/dogaltas/mineralsListFetch";
import { dogaltasApiGet } from "@/lib/dogaltas/dogaltasApi";
import { normalizeTrSearch } from "@/lib/dogaltas/searchHighlight";
import { DOGALTAS_MODULES } from "@/lib/dogaltas/dogaltasModules";
import { DOGALTAS_ACCENT } from "@/lib/dogaltas/dogaltasAccent";

const VIEWED_SEARCH_STORAGE_KEY = "yasam-dogaltas-viewed-search-results";

type StoneSearchRecord = {
  id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  chakras: string[] | null;
  assignments: Record<string, unknown> | null;
};

type StoneSearchFieldHit = {
  label: string;
  text: string;
};

type StoneSearchResult = {
  id: string;
  stone_name: string;
  short_description: string;
  matchedField: string;
  snippet: string;
};

function readViewedStoneIds(): Set<string> {
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

function markViewedStoneId(id: string) {
  const viewed = readViewedStoneIds();
  viewed.add(id);
  localStorage.setItem(VIEWED_SEARCH_STORAGE_KEY, JSON.stringify([...viewed]));
}

function assignmentsToSearchText(assignments: Record<string, unknown> | null): string {
  if (!assignments || typeof assignments !== "object") return "";

  const parts: string[] = [];
  for (const value of Object.values(assignments)) {
    if (Array.isArray(value)) {
      for (const row of value) {
        if (Array.isArray(row)) {
          parts.push(row.map((cell) => String(cell ?? "")).join(" "));
        } else if (typeof row === "string") {
          parts.push(row);
        }
      }
    } else if (typeof value === "string") {
      parts.push(value);
    }
  }
  return parts.filter(Boolean).join(" ");
}

/** Görünen alan etiketi çözümleyicisi (i18n `stones.hub` grubu). */
type HubLabelResolver = (key: string) => string;

function buildStoneSearchFields(
  stone: StoneSearchRecord,
  t: HubLabelResolver,
): StoneSearchFieldHit[] {
  const fields: StoneSearchFieldHit[] = [
    { label: t("field.stoneName"), text: stone.stone_name },
    { label: t("field.shortDescription"), text: stone.short_description ?? "" },
    { label: t("field.generalInfo"), text: stone.general_info ?? "" },
    { label: t("field.physicalEffects"), text: stone.physical_effects ?? "" },
    { label: t("field.spiritualEffects"), text: stone.spiritual_effects ?? "" },
    { label: t("field.otherEffects"), text: stone.other_effects ?? "" },
    { label: t("field.warning"), text: stone.warning_text ?? "" },
  ];

  if (stone.chakras?.length) {
    fields.push({ label: t("field.chakra"), text: stone.chakras.join(", ") });
  }
  if (stone.warning_tags?.length) {
    fields.push({ label: t("field.tag"), text: stone.warning_tags.join(", ") });
  }

  const assignmentText = assignmentsToSearchText(stone.assignments);
  if (assignmentText) {
    fields.push({ label: t("field.assignments"), text: assignmentText });
  }

  return fields;
}

function extractSnippet(text: string, query: string, maxLen = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const norm = normalizeTrSearch(clean);
  const qNorm = normalizeTrSearch(query);
  const idx = norm.indexOf(qNorm);
  if (idx < 0) return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;

  const start = Math.max(0, idx - 36);
  const end = Math.min(clean.length, idx + query.length + 56);
  let snippet = clean.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < clean.length) snippet = `${snippet}…`;
  return snippet;
}

function searchStones(
  records: StoneSearchRecord[],
  query: string,
  t: HubLabelResolver,
): StoneSearchResult[] {
  const qNorm = normalizeTrSearch(query.trim());
  if (!qNorm) return [];

  const results: StoneSearchResult[] = [];

  for (const stone of records) {
    const fields = buildStoneSearchFields(stone, t);
    const hit = fields.find((field) => normalizeTrSearch(field.text).includes(qNorm));
    if (!hit) continue;

    results.push({
      id: stone.id,
      stone_name: stone.stone_name?.trim() || "İsimsiz taş",
      short_description:
        stone.short_description?.trim() || t("results.noDescription"),
      matchedField: hit.label,
      snippet: extractSnippet(hit.text, query) || hit.text.slice(0, 140),
    });
  }

  return results.sort((a, b) =>
    a.stone_name.localeCompare(b.stone_name, "tr-TR"),
  );
}

function mapStoneSearchRecord(row: Record<string, unknown>): StoneSearchRecord {
  return {
    id: String(row.id ?? ""),
    stone_name: String(row.stone_name ?? ""),
    short_description:
      row.short_description != null ? String(row.short_description) : null,
    general_info: row.general_info != null ? String(row.general_info) : null,
    physical_effects:
      row.physical_effects != null ? String(row.physical_effects) : null,
    spiritual_effects:
      row.spiritual_effects != null ? String(row.spiritual_effects) : null,
    other_effects: row.other_effects != null ? String(row.other_effects) : null,
    warning_text: row.warning_text != null ? String(row.warning_text) : null,
    warning_tags: Array.isArray(row.warning_tags)
      ? row.warning_tags.map((tag) => String(tag))
      : null,
    chakras: Array.isArray(row.chakras) ? row.chakras.map((c) => String(c)) : null,
    assignments:
      row.assignments && typeof row.assignments === "object"
        ? (row.assignments as Record<string, unknown>)
        : null,
  };
}


type MonthTrendBucket = {
  label: string;
  count: number;
  heightPct: number;
};

// F-013: "Stok Değeri" ölü widget'ı kaldırıldı — Doğaltaş'ta fiyat/stok kolonu yok,
// widget her müşteride kalıcı boş placeholder gösteriyordu. Fatura/POS/stok sistemi
// EKLENMEDİ (ürün kararı). İlgili tespit/hesap makinesi (parseNumeric/detectStockValueFields/
// computeStockValue/formatTry) de kaldırıldı.

function buildLast6MonthTrend(createdAts: string[]): MonthTrendBucket[] {
  const now = new Date();
  const buckets: { label: string; year: number; month: number; count: number }[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      label: date.toLocaleDateString("tr-TR", { month: "short" }),
      year: date.getFullYear(),
      month: date.getMonth(),
      count: 0,
    });
  }

  for (const iso of createdAts) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const bucket = buckets.find(
      (item) => item.year === date.getFullYear() && item.month === date.getMonth(),
    );
    if (bucket) bucket.count += 1;
  }

  const maxCount = Math.max(...buckets.map((item) => item.count), 1);

  return buckets.map((item) => ({
    label: item.label,
    count: item.count,
    heightPct:
      item.count === 0 ? 0 : Math.max(8, Math.round((item.count / maxCount) * 100)),
  }));
}

function formatCount(
  value: number | null,
  loading: boolean,
  loadingLabel: string,
): string {
  if (loading) return loadingLabel;
  if (value === null) return "—";
  return value.toLocaleString("tr-TR");
}


/** Aylık trend + stok değeri için ham taş satırları (server API, kullanıcı tenant'ı). */
async function fetchStonesRaw(): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>("/api/dogaltas/stones?mode=raw");
  return { data: r.data?.rows ?? [], error: r.ok ? null : (r.error ?? "Okuma hatası") };
}

function DogaltasPageContent() {
  const t = useTranslations("stones.hub");
  // Modül kartı etiketleri: DOGALTAS_MODULES registry KANONİK Türkçe kalır (slug/href/canonical);
  // görünen title/subtitle slug ile localize edilir.
  const tm = useTranslations("stones.modules");
  const router = useRouter();
  const searchParams = useSearchParams();
  useBfcacheRefresh();
  const urlQuery = searchParams.get("q")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [activeQuery, setActiveQuery] = useState(urlQuery);
  // Mobilde daha kısa placeholder göstermek için (masaüstü metni değişmez).
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [stonesForSearch, setStonesForSearch] = useState<StoneSearchRecord[] | null>(
    null,
  );
  const [viewedStoneIds, setViewedStoneIds] = useState<Set<string>>(() => new Set());
  const [stonesCount, setStonesCount] = useState<number | null>(null);
  const [mineralsCount, setMineralsCount] = useState<number | null>(null);
  const [combinationsCount, setCombinationsCount] = useState<number | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthTrendBucket[]>([]);
  // Word raporu modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportSections, setReportSections] = useState({
    stones: false, minerals: false, combinations: false, knowledge: false, analytics: false,
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setLoading(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      setStonesCount(null);
      setMineralsCount(null);
      setCombinationsCount(null);
      setMonthlyTrend([]);
      return;
    }

    const [stonesCountRes, stonesRowsRes, mineralsCountRes, combinationsRes] =
      await Promise.all([
        // Toplam Taş Kaydı — server API (oturum tenant'ı + demo'da kütüphane).
        fetchStonesListCount(tenantId),
        // Aylık trend + stok değeri için ham satırlar (server API, kullanıcı tenant'ı).
        fetchStonesRaw(),
        // Mineral Bankası sayacı — server API (tenant-only).
        fetchMineralsListCount(tenantId),
        // Aktif Kombinasyonlar — güvenli server API (oturum tenant'ı).
        fetchCombinationsViaApi(),
      ]);

    setLoading(false);

    // Sessizce 0 YAZMA: hata olan sayaç null (→ "—") + console.error + kullanıcı uyarısı.
    const failed: string[] = [];

    if (stonesCountRes.error) {
      console.error("[dogaltas/dashboard] Taş sayımı hatası:", stonesCountRes.error);
      setStonesCount(null);
      failed.push(t("analytics.failedLabel.stones"));
    } else {
      setStonesCount(stonesCountRes.count);
    }

    if (!combinationsRes.ok) {
      console.error("[dogaltas/dashboard] Kombinasyon sayımı hatası:", combinationsRes.error);
      setCombinationsCount(null);
      failed.push(t("analytics.failedLabel.combinations"));
    } else {
      setCombinationsCount(combinationsRes.rows.length);
    }

    // Mineral Bankası — server API (tenant-only). Hata olursa null (→ "—"), 0 yazma yok.
    if (mineralsCountRes.error) {
      console.error("[dogaltas/dashboard] Mineral sayımı hatası:", mineralsCountRes.error);
      setMineralsCount(null);
      failed.push(t("analytics.failedLabel.minerals"));
    } else {
      setMineralsCount(mineralsCountRes.count);
    }

    // Aylık trend — kullanıcı tenant'ı ham satırlarından created_at (mevcut davranış).
    const rows = (stonesRowsRes.data ?? []) as Record<string, unknown>[];
    if (stonesRowsRes.error) {
      console.error("[dogaltas/dashboard] Taş satırları (trend) hatası:", stonesRowsRes.error);
    }

    const createdAts = rows
      .map((row) => (row.created_at != null ? String(row.created_at) : ""))
      .filter(Boolean);
    setMonthlyTrend(buildLast6MonthTrend(createdAts));

    if (failed.length > 0) {
      setErrorMessage(t("analytics.failedCounters", { items: failed.join(", ") }));
    }
  }, [t]);

  useEffect(() => {
    runInEffect(() => {
      void loadAnalytics();
    });
  }, [loadAnalytics]);

  useEffect(() => {
    setSearchInput(urlQuery);
    setActiveQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const refreshViewed = () => setViewedStoneIds(readViewedStoneIds());
    refreshViewed();
    window.addEventListener("focus", refreshViewed);
    return () => window.removeEventListener("focus", refreshViewed);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrowViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const ensureStonesForSearch = useCallback(async () => {
    if (stonesForSearch !== null) return stonesForSearch;

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      throw new Error(MISSING_SESSION_TENANT_MESSAGE);
    }

    // Server API (mode=extended) — assignments dahil tüm arama alanlarını döndürür.
    const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(
      "/api/dogaltas/stones?mode=extended");
    if (!r.ok) {
      throw new Error(r.error ?? t("search.dataError"));
    }

    const mapped = (r.data?.rows ?? []).map((row) =>
      mapStoneSearchRecord(row as Record<string, unknown>),
    );
    setStonesForSearch(mapped);
    return mapped;
  }, [stonesForSearch, t]);

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      router.replace(trimmed ? `/dogaltas?${params.toString()}` : "/dogaltas", {
        scroll: false,
      });
      setActiveQuery(trimmed);

      if (!trimmed) {
        setSearchError(null);
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);
      setSearchError(null);

      try {
        await ensureStonesForSearch();
      } catch (err) {
        const message = err instanceof Error ? err.message : t("search.dataError");
        setSearchError(t("search.recordsError", { message }));
      } finally {
        setSearchLoading(false);
      }
    },
    [ensureStonesForSearch, router, t],
  );

  useEffect(() => {
    if (!activeQuery.trim()) return;
    runInEffect(() => {
      void (async () => {
        setSearchLoading(true);
        setSearchError(null);
        try {
          await ensureStonesForSearch();
        } catch (err) {
          const message = err instanceof Error ? err.message : t("search.dataError");
          setSearchError(t("search.recordsError", { message }));
        } finally {
          setSearchLoading(false);
        }
      })();
    });
  }, [activeQuery, ensureStonesForSearch, t]);

  const searchResults = useMemo(() => {
    if (!activeQuery.trim() || !stonesForSearch) return [];
    return searchStones(stonesForSearch, activeQuery, t);
  }, [activeQuery, stonesForSearch, t]);

  const handleSearchSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      void runSearch(searchInput);
    },
    [runSearch, searchInput],
  );

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (!value.trim()) {
        setActiveQuery("");
        setSearchError(null);
        setSearchLoading(false);
        router.replace("/dogaltas", { scroll: false });
      }
    },
    [router],
  );

  const handleResultNavigate = useCallback((stoneId: string) => {
    markViewedStoneId(stoneId);
    setViewedStoneIds(readViewedStoneIds());
  }, []);

  // ─── Word raporu ─────────────────────────────────────────────────────────────

  const allReportSelected = Object.values(reportSections).every(Boolean);

  function toggleAllReport() {
    const next = !allReportSelected;
    setReportSections({ stones: next, minerals: next, combinations: next, knowledge: next, analytics: next });
  }

  async function downloadReport() {
    if (!Object.values(reportSections).some(Boolean)) {
      setReportError(t("report.errorEmpty"));
      return;
    }
    const tid = await getSyncedTenantId();
    if (!tid) { setReportError(t("report.errorSession")); return; }
    const uid = readYasamUser()?.id;
    if (!uid) { setReportError(t("report.errorUser")); return; }
    const sessionToken = readSessionToken();
    setReportLoading(true);
    setReportError("");
    setReportSuccess("");
    try {
      // F-018: kimlik doğrulanmış oturum header'ıyla taşınır; body'de userId/tenantId GÖNDERİLMEZ.
      const res = await fetch("/api/dogaltas/word-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": uid,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ sections: reportSections }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? t("report.errorGeneric"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yasam-sistemi-dogaltas-raporu-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setReportSuccess(t("report.success"));
    } catch (err) {
      setReportError(err instanceof Error ? err.message : t("report.errorGeneric"));
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <main className="w-full overflow-x-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(251,191,36,0.16),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_60%_90%,rgba(132,204,22,0.12),transparent_35%),linear-gradient(135deg,#fffaf0_0%,#fef9e7_45%,#f2fff7_100%)] text-slate-950 lg:h-screen lg:overflow-hidden">
      <div className="flex flex-col lg:grid lg:h-full lg:grid-cols-[300px_1fr] lg:overflow-x-hidden">
        <aside className="flex flex-col border-b border-white/80 bg-white/88 px-4 py-4 shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:h-screen lg:w-[300px] lg:min-w-[300px] lg:max-w-[300px] lg:shrink-0 lg:overflow-hidden lg:border-b-0 lg:border-r lg:shadow-[14px_0_35px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex h-11 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-md ring-1 ring-slate-100">
              💎
            </div>
            <div>
              <h2 className="text-[11px] font-black tracking-[0.22em] text-slate-950">
                {t("sidebar.brand")}
              </h2>
              <p className="mt-0.5 text-[11px] font-bold text-emerald-700">{t("sidebar.moduleName")}</p>
            </div>
          </div>

          <div className="mb-2 shrink-0 text-[11px] font-black tracking-[0.24em] text-slate-400">
            {t("sidebar.modulesHeading")}
          </div>

          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
            {DOGALTAS_MODULES.map((item, index) => {
              const isFeatured = index === 0;
              const accent = DOGALTAS_ACCENT[item.accent];

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex w-full cursor-pointer items-center gap-2 rounded-[18px] border px-3 py-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-emerald-300 hover:bg-white hover:shadow-[0_12px_32px_rgba(16,185,129,0.16)] sm:gap-3 lg:h-[64px] lg:shrink-0 lg:px-4 ${
                    isFeatured
                      ? "border-emerald-300 bg-gradient-to-r from-emerald-50 via-white to-amber-50 shadow-[0_10px_28px_rgba(16,185,129,0.16)]"
                      : "border-white/80 bg-white/70"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 min-w-[32px] shrink-0 items-center justify-center rounded-[12px] shadow-sm ring-1 lg:h-9 lg:w-9 lg:min-w-[36px] ${accent.iconBox}`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center text-base leading-none">
                      {item.icon}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[12px] font-black leading-tight text-slate-950 lg:truncate lg:text-[13px]">
                      {tm.has(`${item.slug}.title`) ? tm(`${item.slug}.title`) : item.title}
                    </span>
                    <span className="mt-0.5 hidden truncate text-[11px] font-semibold leading-snug text-slate-500 sm:block">
                      {tm.has(`${item.slug}.subtitle`) ? tm(`${item.slug}.subtitle`) : item.subtitle}
                    </span>
                  </span>

                  <span className="ml-auto hidden shrink-0 text-base font-black opacity-60 transition-transform duration-300 group-hover:translate-x-1 sm:block">
                    ›
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="relative min-w-0 px-4 py-4 sm:px-5 lg:h-screen lg:overflow-hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-200/30 blur-3xl" />
            <div className="absolute left-[8%] -top-16 h-56 w-56 rounded-full bg-emerald-200/25 blur-3xl" />
            <div className="absolute bottom-0 left-[28%] h-48 w-48 rounded-full bg-lime-200/20 blur-3xl" />
          </div>

          <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-2.5 lg:h-full lg:overflow-y-auto">
            <header className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/65 px-5 py-3 shadow-[0_8px_28px_rgba(15,23,42,0.07)] backdrop-blur-xl">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center text-xl leading-none">
                💎
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-slate-950">
                  <span className="bg-[linear-gradient(90deg,#d97706_0%,#10b981_55%,#84cc16_100%)] bg-clip-text text-transparent">
                    {t("hero.titleAccent")}
                  </span>{" "}
                  {t("hero.titleSuffix")}
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  {t("hero.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowReportModal(true); setReportError(""); setReportSuccess(""); }}
                className="btn-soft w-full shrink-0 !px-4 !py-2 sm:ml-auto sm:w-auto"
              >
                {t("hero.reportButton")}
              </button>
            </header>

            <form
              className="w-full shrink-0 rounded-2xl border border-white/80 bg-white/75 p-2 shadow-[0_6px_20px_rgba(15,23,42,0.07)] backdrop-blur-xl"
              onSubmit={handleSearchSubmit}
            >
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    ⌕
                  </span>
                  <input
                    type="search"
                    aria-label={t("search.aria")}
                    value={searchInput}
                    onChange={(event) => handleSearchInputChange(event.target.value)}
                    placeholder={
                      isNarrowViewport
                        ? t("search.placeholderNarrow")
                        : t("search.placeholderWide")
                    }
                    className="h-10 w-full rounded-xl border border-slate-200/70 bg-white/90 pl-9 pr-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="btn-primary h-10 shrink-0 !px-5"
                >
                  {searchLoading ? t("search.submitting") : t("search.submit")}
                </button>
              </div>
            </form>

            {activeQuery.trim() ? (
              <section className="shrink-0 rounded-[26px] border border-emerald-200/80 bg-white/85 p-4 shadow-[0_14px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-black text-slate-900">
                    {t("results.title")}
                    {!searchLoading && stonesForSearch
                      ? t("results.count", { count: searchResults.length })
                      : ""}
                  </h2>
                  {activeQuery ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                      "{activeQuery}"
                    </span>
                  ) : null}
                </div>

                {searchError ? (
                  <p
                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
                    role="alert"
                  >
                    {searchError}
                  </p>
                ) : null}

                {searchLoading ? (
                  <p className="py-6 text-center text-sm font-semibold text-slate-600">
                    {t("results.loading")}
                  </p>
                ) : searchResults.length === 0 && !searchError ? (
                  <p className="py-6 text-center text-sm font-semibold text-slate-600">
                    {t("results.empty")}
                  </p>
                ) : (
                  <div className="max-h-[min(42vh,360px)] space-y-3 overflow-y-auto pr-1">
                    {searchResults.map((result) => {
                      const isViewed = viewedStoneIds.has(result.id);
                      const detailHref = `/dogaltas/dogaltas-listesi/${encodeURIComponent(result.id)}?q=${encodeURIComponent(activeQuery)}`;

                      return (
                        <article
                          key={result.id}
                          className={`relative overflow-hidden rounded-[22px] border bg-white/95 p-4 shadow-sm transition hover:shadow-md ${
                            isViewed
                              ? "border-rose-200/90 ring-1 ring-rose-100"
                              : "border-slate-200/80"
                          }`}
                        >
                          {isViewed ? (
                            <span
                              className="absolute bottom-0 left-0 top-0 w-1.5 bg-rose-600"
                              aria-hidden
                            />
                          ) : null}

                          <div className={isViewed ? "pl-2" : ""}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h3 className="text-lg font-black text-slate-950">
                                {result.stone_name}
                              </h3>
                              {isViewed ? (
                                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-800 ring-1 ring-rose-200">
                                  {t("results.viewed")}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-600">
                              {result.short_description}
                            </p>

                            <p className="mt-2 text-xs font-bold text-violet-700">
                              {t("results.matched", { field: result.matchedField })}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-700">
                              {result.snippet}
                            </p>

                            <Link
                              href={detailHref}
                              onClick={() => handleResultNavigate(result.id)}
                              className="mt-3 inline-flex rounded-xl border border-emerald-300/80 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-950 transition hover:bg-emerald-100"
                            >
                              {t("results.detail")}
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            <div className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[22px] border border-white/80 bg-white/70 p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="mb-3 flex shrink-0 items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-sm">
                  📊
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-950">{t("analytics.title")}</h2>
                  <p className="text-[11px] text-slate-500">{t("analytics.subtitle")}</p>
                </div>
              </div>

              {errorMessage ? (
                <p
                  className="mb-3 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}

              {/* F-013: Ölü widget'lar ("Stok Değeri", "En Çok Satılan Taşlar") kaldırıldı;
                  gerçek veriyle beslenen "Aylık Kayıt Trendi" tam genişliğe alındı. */}
              <div className="grid shrink-0 grid-cols-1 gap-2.5">
                <div className="flex min-h-[155px] flex-col rounded-[18px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-4 shadow-md">
                  <p className="text-sm font-black text-slate-800">{t("analytics.trendTitle")}</p>
                  <p className="text-[11px] text-slate-500">{t("analytics.trendSubtitle")}</p>
                  {loading ? (
                    <p className="mt-auto text-sm font-semibold text-slate-600">{t("analytics.loading")}</p>
                  ) : (
                    <>
                      <div className="mt-1.5 flex h-[62px] items-end gap-1">
                        {monthlyTrend.map((bucket) => (
                          <div
                            key={bucket.label}
                            className="flex h-full flex-1 flex-col justify-end"
                            title={t("analytics.barTitle", { label: bucket.label, count: bucket.count })}
                          >
                            <div
                              className="w-full rounded-t-lg bg-gradient-to-t from-indigo-500 via-violet-400 to-sky-300"
                              style={{
                                height: bucket.heightPct > 0 ? `${bucket.heightPct}%` : "4px",
                                minHeight: "4px",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 grid grid-cols-6 text-center text-[10px] font-medium text-slate-500">
                        {monthlyTrend.map((bucket) => (
                          <span key={`${bucket.label}-lbl`}>{bucket.label}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2.5 grid shrink-0 grid-cols-3 gap-2.5">
                <div className="flex min-h-[72px] flex-col justify-center rounded-[16px] border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-3.5 shadow-md">
                  <p className="text-xs font-black text-teal-700">{t("analytics.totalStones")}</p>
                  <p className="mt-0.5 text-xl font-black text-slate-950">
                    {formatCount(stonesCount, loading, t("analytics.loading"))}
                  </p>
                </div>
                <div className="flex min-h-[72px] flex-col justify-center rounded-[16px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-3.5 shadow-md">
                  <p className="text-xs font-black text-violet-700">{t("analytics.mineralBank")}</p>
                  <p className="mt-0.5 text-xl font-black text-slate-950">
                    {formatCount(mineralsCount, loading, t("analytics.loading"))}
                  </p>
                </div>
                <div className="flex min-h-[72px] flex-col justify-center rounded-[16px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3.5 shadow-md">
                  <p className="text-xs font-black text-amber-700">{t("analytics.activeCombinations")}</p>
                  <p className="mt-0.5 text-xl font-black text-slate-950">
                    {formatCount(combinationsCount, loading, t("analytics.loading"))}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Word raporu modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-950">{t("report.title")}</h2>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-500">{t("report.subtitle")}</p>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allReportSelected}
                  onChange={toggleAllReport}
                  className="h-4 w-4 rounded accent-emerald-600"
                />
                <span className="text-sm font-black text-violet-800">{t("report.selectAll")}</span>
              </label>

              <div className="my-1 border-t border-slate-100" />

              {([
                ["stones",       "💎"],
                ["minerals",     "🧪"],
                ["combinations", "🧩"],
                ["knowledge",    "📚"],
                ["analytics",    "📊"],
              ] as const).map(([key, icon]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={reportSections[key]}
                    onChange={() => setReportSections(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="h-4 w-4 rounded accent-emerald-600"
                  />
                  <span className="text-sm font-semibold text-slate-700">{icon} {t(`report.section.${key}`)}</span>
                </label>
              ))}
            </div>

            {reportError && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {reportError}
              </p>
            )}
            {reportSuccess && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                ✓ {reportSuccess}
              </p>
            )}
            {reportLoading && (
              <p className="mt-4 text-center text-sm font-semibold text-violet-700">
                {t("report.preparing")}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setReportSections({ stones: false, minerals: false, combinations: false, knowledge: false, analytics: false })}
                disabled={reportLoading}
                className="btn-soft flex-1 !px-4 !py-2.5"
              >
                {t("report.clear")}
              </button>
              <button
                type="button"
                onClick={() => void downloadReport()}
                disabled={reportLoading}
                className="btn-primary flex-1 !px-4 !py-2.5"
              >
                {reportLoading ? t("report.submitting") : t("report.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DogaltasPageFallback() {
  const t = useTranslations("stones.hub");
  return (
    <main className="flex h-screen w-full items-center justify-center bg-[linear-gradient(135deg,#eef7ff_0%,#f7f2ff_45%,#f2fffb_100%)]">
      <p className="text-base font-semibold text-violet-900">{t("fallbackLoading")}</p>
    </main>
  );
}

export default function DogaltasPage() {
  return (
    <Suspense fallback={<DogaltasPageFallback />}>
      <DogaltasPageContent />
    </Suspense>
  );
}
