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
import { runInEffect } from "@/lib/runInEffect";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { fetchCombinationsViaApi } from "@/lib/dogaltas/combinationsApi";
import { fetchStonesListCount } from "@/lib/dogaltas/stonesListFetch";
import { fetchMineralsListCount } from "@/lib/dogaltas/mineralsListFetch";
import { dogaltasApiGet } from "@/lib/dogaltas/dogaltasApi";

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

function buildStoneSearchFields(stone: StoneSearchRecord): StoneSearchFieldHit[] {
  const fields: StoneSearchFieldHit[] = [
    { label: "Taş adı", text: stone.stone_name },
    { label: "Kısa açıklama", text: stone.short_description ?? "" },
    { label: "Genel bilgi", text: stone.general_info ?? "" },
    { label: "Fiziksel etkiler", text: stone.physical_effects ?? "" },
    { label: "Ruhsal etkiler", text: stone.spiritual_effects ?? "" },
    { label: "Diğer etkiler", text: stone.other_effects ?? "" },
    { label: "Uyarı", text: stone.warning_text ?? "" },
  ];

  if (stone.chakras?.length) {
    fields.push({ label: "Çakra", text: stone.chakras.join(", ") });
  }
  if (stone.warning_tags?.length) {
    fields.push({ label: "Etiket", text: stone.warning_tags.join(", ") });
  }

  const assignmentText = assignmentsToSearchText(stone.assignments);
  if (assignmentText) {
    fields.push({ label: "Atamalar", text: assignmentText });
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

function searchStones(records: StoneSearchRecord[], query: string): StoneSearchResult[] {
  const qNorm = normalizeTrSearch(query.trim());
  if (!qNorm) return [];

  const results: StoneSearchResult[] = [];

  for (const stone of records) {
    const fields = buildStoneSearchFields(stone);
    const hit = fields.find((field) => normalizeTrSearch(field.text).includes(qNorm));
    if (!hit) continue;

    results.push({
      id: stone.id,
      stone_name: stone.stone_name?.trim() || "İsimsiz taş",
      short_description:
        stone.short_description?.trim() || "Kısa açıklama eklenmemiş.",
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

const modules = [
  {
    title: "Doğaltaş Kayıt",
    subtitle: "Yeni taş kaydı oluştur.",
    icon: "💎",
    href: "/dogaltas/dogaltas-kayit",
    dot: "bg-emerald-500",
    iconBg: "bg-cyan-50",
  },
  {
    title: "Mineral Bankası",
    subtitle: "Mineral veri kayıtları.",
    icon: "🧪",
    href: "/dogaltas/mineral-bankasi",
    dot: "bg-violet-500",
    iconBg: "bg-violet-50",
  },
  {
    title: "Mineral Listesi",
    subtitle: "Filtrele ve düzenle.",
    icon: "📋",
    href: "/dogaltas/mineral-listesi",
    dot: "bg-sky-500",
    iconBg: "bg-sky-50",
  },
  {
    title: "Doğaltaş Listesi",
    subtitle: "Kayıtlı taşlar.",
    icon: "🗂️",
    href: "/dogaltas/dogaltas-listesi",
    dot: "bg-blue-500",
    iconBg: "bg-blue-50",
  },
  {
    title: "Kombinasyonlar",
    subtitle: "Taş kombinasyonları.",
    icon: "🧩",
    href: "/dogaltas/kombinasyonlar",
    dot: "bg-orange-500",
    iconBg: "bg-orange-50",
  },
  {
    title: "Kombinasyon Oluştur",
    subtitle: "Minerale göre taş bul.",
    icon: "⚗️",
    href: "/dogaltas/kombinasyon-olustur",
    dot: "bg-teal-500",
    iconBg: "bg-teal-50",
  },
  {
    title: "Taş Bilgi Kütüphanesi",
    subtitle: "Eğitim ve referans.",
    icon: "📚",
    href: "/dogaltas/tas-bilgi-kutuphanesi",
    dot: "bg-pink-500",
    iconBg: "bg-pink-50",
  },
];

type MonthTrendBucket = {
  label: string;
  count: number;
  heightPct: number;
};

const STOCK_PRICE_FIELD_CANDIDATES: [string, string][] = [
  ["stock_qty", "unit_price"],
  ["stock_quantity", "price"],
  ["quantity", "price"],
  ["adet", "fiyat"],
  ["stok", "fiyat"],
  ["stock", "price"],
  ["qty", "unit_price"],
];

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function detectStockValueFields(rows: Record<string, unknown>[]): [string, string] | null {
  if (rows.length === 0) return null;

  for (const [qtyKey, priceKey] of STOCK_PRICE_FIELD_CANDIDATES) {
    const hasPair = rows.some((row) => {
      const qty = parseNumeric(row[qtyKey]);
      const price = parseNumeric(row[priceKey]);
      return qty != null && price != null && (qty > 0 || price > 0);
    });
    if (hasPair) return [qtyKey, priceKey];
  }

  return null;
}

function computeStockValue(rows: Record<string, unknown>[], keys: [string, string]): number {
  const [qtyKey, priceKey] = keys;
  return rows.reduce((sum, row) => {
    const qty = parseNumeric(row[qtyKey]) ?? 0;
    const price = parseNumeric(row[priceKey]) ?? 0;
    return sum + qty * price;
  }, 0);
}

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

function formatCount(value: number | null, loading: boolean): string {
  if (loading) return "Yükleniyor...";
  if (value === null) return "—";
  return value.toLocaleString("tr-TR");
}

function formatTry(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Aylık trend + stok değeri için ham taş satırları (server API, kullanıcı tenant'ı). */
async function fetchStonesRaw(): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>("/api/dogaltas/stones?mode=raw");
  return { data: r.data?.rows ?? [], error: r.ok ? null : (r.error ?? "Okuma hatası") };
}

function DogaltasPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useBfcacheRefresh();
  const urlQuery = searchParams.get("q")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [activeQuery, setActiveQuery] = useState(urlQuery);
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
  const [stockValue, setStockValue] = useState<number | null>(null);
  const [stockValueMessage, setStockValueMessage] = useState<string | null>(null);
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
      setStockValue(null);
      setStockValueMessage(null);
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
      failed.push("taş kaydı");
    } else {
      setStonesCount(stonesCountRes.count);
    }

    if (!combinationsRes.ok) {
      console.error("[dogaltas/dashboard] Kombinasyon sayımı hatası:", combinationsRes.error);
      setCombinationsCount(null);
      failed.push("kombinasyon");
    } else {
      setCombinationsCount(combinationsRes.rows.length);
    }

    // Mineral Bankası — server API (tenant-only). Hata olursa null (→ "—"), 0 yazma yok.
    if (mineralsCountRes.error) {
      console.error("[dogaltas/dashboard] Mineral sayımı hatası:", mineralsCountRes.error);
      setMineralsCount(null);
      failed.push("mineral");
    } else {
      setMineralsCount(mineralsCountRes.count);
    }

    // Aylık trend + stok değeri — kullanıcı tenant'ı ham satırları (mevcut davranış).
    const rows = (stonesRowsRes.data ?? []) as Record<string, unknown>[];
    if (stonesRowsRes.error) {
      console.error("[dogaltas/dashboard] Taş satırları (trend/stok) hatası:", stonesRowsRes.error);
    }

    const createdAts = rows
      .map((row) => (row.created_at != null ? String(row.created_at) : ""))
      .filter(Boolean);
    setMonthlyTrend(buildLast6MonthTrend(createdAts));

    const stockFields = detectStockValueFields(rows);
    if (stockFields) {
      const total = computeStockValue(rows, stockFields);
      setStockValue(total);
      setStockValueMessage(null);
    } else {
      setStockValue(null);
      setStockValueMessage("Stok değeri için fiyat/stok verisi bekleniyor");
    }

    if (failed.length > 0) {
      setErrorMessage(`Bazı sayaçlar okunamadı (${failed.join(", ")}). Lütfen sayfayı yenileyin.`);
    }
  }, []);

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
      throw new Error(r.error ?? "Arama verisi okunamadı.");
    }

    const mapped = (r.data?.rows ?? []).map((row) =>
      mapStoneSearchRecord(row as Record<string, unknown>),
    );
    setStonesForSearch(mapped);
    return mapped;
  }, [stonesForSearch]);

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
        const message = err instanceof Error ? err.message : "Arama verisi okunamadı.";
        setSearchError(`Taş kayıtları okunamadı: ${message}`);
      } finally {
        setSearchLoading(false);
      }
    },
    [ensureStonesForSearch, router],
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
          const message = err instanceof Error ? err.message : "Arama verisi okunamadı.";
          setSearchError(`Taş kayıtları okunamadı: ${message}`);
        } finally {
          setSearchLoading(false);
        }
      })();
    });
  }, [activeQuery, ensureStonesForSearch]);

  const searchResults = useMemo(() => {
    if (!activeQuery.trim() || !stonesForSearch) return [];
    return searchStones(stonesForSearch, activeQuery);
  }, [activeQuery, stonesForSearch]);

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

  const stockValueDisplay = useMemo(() => {
    if (loading) return "Yükleniyor...";
    if (stockValueMessage) return stockValueMessage;
    if (stockValue != null && stockValue > 0) return formatTry(stockValue);
    if (stockValue === 0) return formatTry(0);
    return "Stok değeri için fiyat/stok verisi bekleniyor";
  }, [loading, stockValue, stockValueMessage]);

  const stockValueIsMessage = !loading && Boolean(stockValueMessage || stockValue == null);

  // ─── Word raporu ─────────────────────────────────────────────────────────────

  const allReportSelected = Object.values(reportSections).every(Boolean);

  function toggleAllReport() {
    const next = !allReportSelected;
    setReportSections({ stones: next, minerals: next, combinations: next, knowledge: next, analytics: next });
  }

  async function downloadReport() {
    if (!Object.values(reportSections).some(Boolean)) {
      setReportError("Lütfen rapora dahil edilecek en az bir bölüm seçin.");
      return;
    }
    const tid = await getSyncedTenantId();
    if (!tid) { setReportError("Oturum bulunamadı. Lütfen sayfayı yenileyin."); return; }
    const uid = readYasamUser()?.id;
    if (!uid) { setReportError("Kullanıcı kimliği bulunamadı. Lütfen tekrar giriş yapın."); return; }
    setReportLoading(true);
    setReportError("");
    setReportSuccess("");
    try {
      const res = await fetch("/api/dogaltas/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tid, userId: uid, sections: reportSections }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Rapor oluşturulamadı.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yasam-sistemi-dogaltas-raporu-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setReportSuccess("Word raporu başarıyla oluşturuldu.");
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Rapor oluşturulamadı.");
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <main className="w-full overflow-x-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.14),transparent_30%),radial-gradient(circle_at_60%_90%,rgba(45,212,191,0.12),transparent_35%),linear-gradient(135deg,#eef7ff_0%,#f7f2ff_45%,#f2fffb_100%)] text-slate-950 lg:h-screen lg:overflow-hidden">
      <div className="flex flex-col lg:grid lg:h-full lg:grid-cols-[300px_1fr] lg:overflow-x-hidden">
        <aside className="flex flex-col border-b border-white/80 bg-white/88 px-4 py-4 shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:h-screen lg:w-[300px] lg:min-w-[300px] lg:max-w-[300px] lg:shrink-0 lg:overflow-hidden lg:border-b-0 lg:border-r lg:shadow-[14px_0_35px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex h-11 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-md ring-1 ring-slate-100">
              💎
            </div>
            <div>
              <h2 className="text-[11px] font-black tracking-[0.22em] text-slate-950">
                YAŞAM SİSTEMİ
              </h2>
              <p className="mt-0.5 text-[11px] font-bold text-emerald-700">Doğaltaş Modülü</p>
            </div>
          </div>

          <div className="mb-2 shrink-0 text-[11px] font-black tracking-[0.24em] text-slate-400">
            MODÜLLER
          </div>

          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
            {modules.map((item, index) => {
              const isFeatured = index === 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex w-full cursor-pointer items-center gap-3 rounded-[18px] border px-3 py-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-cyan-300 hover:bg-white hover:shadow-[0_12px_32px_rgba(79,70,229,0.14)] lg:h-[64px] lg:shrink-0 lg:px-4 ${
                    isFeatured
                      ? "border-cyan-300 bg-gradient-to-r from-cyan-50 via-white to-blue-50 shadow-[0_10px_28px_rgba(14,165,233,0.14)]"
                      : "border-white/80 bg-white/70"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 min-w-[32px] shrink-0 items-center justify-center rounded-[12px] shadow-sm ring-1 ring-white/80 lg:h-9 lg:w-9 lg:min-w-[36px] ${item.iconBg}`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center text-base leading-none">
                      {item.icon}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-black leading-tight text-slate-950 lg:text-[13px]">
                      {item.title}
                    </span>
                    <span className="mt-0.5 hidden truncate text-[11px] font-semibold leading-snug text-slate-500 sm:block">
                      {item.subtitle}
                    </span>
                  </span>

                  <span className="ml-auto shrink-0 text-base font-black opacity-60 transition-transform duration-300 group-hover:translate-x-1">
                    ›
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="relative min-w-0 px-4 py-4 sm:px-5 lg:h-screen lg:overflow-hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-200/30 blur-3xl" />
            <div className="absolute left-[8%] -top-16 h-56 w-56 rounded-full bg-violet-200/25 blur-3xl" />
            <div className="absolute bottom-0 left-[28%] h-48 w-48 rounded-full bg-emerald-200/20 blur-3xl" />
          </div>

          <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-2.5 lg:h-full lg:overflow-y-auto">
            <header className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/80 bg-white/65 px-5 py-3 shadow-[0_8px_28px_rgba(15,23,42,0.07)] backdrop-blur-xl">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center text-xl leading-none">
                💎
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-slate-950">
                  <span className="bg-[linear-gradient(90deg,#a855f7_0%,#38bdf8_45%,#34d399_100%)] bg-clip-text text-transparent">
                    Doğaltaş
                  </span>{" "}
                  Yönetimi
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  Doğaltaş, mineral, kombinasyon ve stok süreçlerini tek merkezden yönetin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowReportModal(true); setReportError(""); setReportSuccess(""); }}
                className="ml-auto shrink-0 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-2 text-sm font-black text-violet-800 shadow-sm transition hover:scale-[1.02] hover:shadow-md"
              >
                📄 Profesyonel Rapor
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
                    value={searchInput}
                    onChange={(event) => handleSearchInputChange(event.target.value)}
                    placeholder="Taş adı veya içerikte ara (ör. mide, şifa)..."
                    className="h-10 w-full rounded-xl border border-slate-200/70 bg-white/90 pl-9 pr-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="h-10 shrink-0 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-5 text-sm font-black text-white shadow-md transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {searchLoading ? "Aranıyor..." : "Ara"}
                </button>
              </div>
            </form>

            {activeQuery.trim() ? (
              <section className="shrink-0 rounded-[26px] border border-cyan-200/80 bg-white/85 p-4 shadow-[0_14px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-black text-slate-900">
                    Arama Sonuçları
                    {!searchLoading && stonesForSearch
                      ? ` · ${searchResults.length} kayıt`
                      : ""}
                  </h2>
                  {activeQuery ? (
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800 ring-1 ring-cyan-200">
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
                    Yükleniyor...
                  </p>
                ) : searchResults.length === 0 && !searchError ? (
                  <p className="py-6 text-center text-sm font-semibold text-slate-600">
                    Bu arama için sonuç bulunamadı.
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
                                  Bakıldı
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-600">
                              {result.short_description}
                            </p>

                            <p className="mt-2 text-xs font-bold text-violet-700">
                              Eşleşme: {result.matchedField}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-700">
                              {result.snippet}
                            </p>

                            <Link
                              href={detailHref}
                              onClick={() => handleResultNavigate(result.id)}
                              className="mt-3 inline-flex rounded-xl border border-cyan-300/80 bg-cyan-50 px-4 py-2 text-sm font-black text-cyan-950 transition hover:bg-cyan-100"
                            >
                              Detaya Git
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
                  <h2 className="text-base font-black text-slate-950">Hesaplanmış Analizler</h2>
                  <p className="text-[11px] text-slate-500">Supabase stones, minerals ve combinations verilerine göre</p>
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

              <div className="grid shrink-0 grid-cols-3 gap-2.5">
                <div className="flex h-[155px] flex-col rounded-[18px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-4 shadow-md">
                  <p className="text-sm font-black text-slate-800">Stok Değeri</p>
                  <p className="text-[11px] text-slate-500">Stones tablosu fiyat × stok</p>
                  <h3
                    className={`mt-auto pt-2 font-black text-slate-950 ${
                      stockValueIsMessage ? "text-sm leading-snug" : "text-2xl"
                    }`}
                  >
                    {stockValueDisplay}
                  </h3>
                </div>

                <div className="flex h-[155px] flex-col rounded-[18px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-4 shadow-md">
                  <p className="text-sm font-black text-slate-800">Aylık Kayıt Trendi</p>
                  <p className="text-[11px] text-slate-500">Son 6 ay · stones.created_at</p>
                  {loading ? (
                    <p className="mt-auto text-sm font-semibold text-slate-600">Yükleniyor...</p>
                  ) : (
                    <>
                      <div className="mt-1.5 flex h-[62px] items-end gap-1">
                        {monthlyTrend.map((bucket) => (
                          <div
                            key={bucket.label}
                            className="flex h-full flex-1 flex-col justify-end"
                            title={`${bucket.label}: ${bucket.count} kayıt`}
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

                <div className="flex h-[155px] flex-col rounded-[18px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-4 shadow-md">
                  <p className="text-sm font-black text-slate-800">En Çok Satılan Taşlar</p>
                  <p className="text-[11px] text-slate-500">Satış hareket tablosu</p>
                  <p className="mt-auto text-sm font-semibold leading-relaxed text-slate-600">
                    {loading ? "Yükleniyor..." : "Henüz satış verisi yok"}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 grid shrink-0 grid-cols-3 gap-2.5">
                <div className="flex min-h-[72px] flex-col justify-center rounded-[16px] border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-3.5 shadow-md">
                  <p className="text-xs font-black text-teal-700">Toplam Taş Kaydı</p>
                  <p className="mt-0.5 text-xl font-black text-slate-950">
                    {formatCount(stonesCount, loading)}
                  </p>
                </div>
                <div className="flex min-h-[72px] flex-col justify-center rounded-[16px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-3.5 shadow-md">
                  <p className="text-xs font-black text-violet-700">Mineral Bankası</p>
                  <p className="mt-0.5 text-xl font-black text-slate-950">
                    {formatCount(mineralsCount, loading)}
                  </p>
                </div>
                <div className="flex min-h-[72px] flex-col justify-center rounded-[16px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3.5 shadow-md">
                  <p className="text-xs font-black text-amber-700">Aktif Kombinasyonlar</p>
                  <p className="mt-0.5 text-xl font-black text-slate-950">
                    {formatCount(combinationsCount, loading)}
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
              <h2 className="text-lg font-black text-slate-950">Profesyonel Word Raporu Oluştur</h2>
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

            <p className="mb-4 text-sm text-slate-500">Rapora dahil edilecek bölümleri seçin.</p>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allReportSelected}
                  onChange={toggleAllReport}
                  className="h-4 w-4 rounded accent-violet-600"
                />
                <span className="text-sm font-black text-violet-800">Tümünü Seç</span>
              </label>

              <div className="my-1 border-t border-slate-100" />

              {([
                ["stones",       "💎", "Doğaltaş Kayıtları"],
                ["minerals",     "🧪", "Mineral Bankası"],
                ["combinations", "🧩", "Kombinasyonlar"],
                ["knowledge",    "📚", "Taş Bilgi Kütüphanesi"],
                ["analytics",    "📊", "Stok / Analiz Özeti"],
              ] as const).map(([key, icon, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={reportSections[key]}
                    onChange={() => setReportSections(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="h-4 w-4 rounded accent-violet-600"
                  />
                  <span className="text-sm font-semibold text-slate-700">{icon} {label}</span>
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
                Profesyonel Word raporu hazırlanıyor...
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setReportSections({ stones: false, minerals: false, combinations: false, knowledge: false, analytics: false })}
                disabled={reportLoading}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Seçimi Temizle
              </button>
              <button
                type="button"
                onClick={() => void downloadReport()}
                disabled={reportLoading}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
              >
                {reportLoading ? "Hazırlanıyor..." : "Rapor Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DogaltasPageFallback() {
  return (
    <main className="flex h-screen w-full items-center justify-center bg-[linear-gradient(135deg,#eef7ff_0%,#f7f2ff_45%,#f2fffb_100%)]">
      <p className="text-base font-semibold text-violet-900">Yükleniyor…</p>
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
