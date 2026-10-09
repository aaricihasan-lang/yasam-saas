"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import Link from "next/link";
import {
  ArrowUpDown,
  CalendarCheck,
  ChevronDown,
  ListFilter,
  Phone,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import { readYasamUser, readSessionToken, type YasamUser } from "@/lib/auth/yasamUser";
import {
  TR_ALPHABET,
  countActiveClientFilters,
  matchesClientFilters,
} from "@/lib/danisan/clientListFilter";
import {
  getDanisanListCache,
  setDanisanListCache,
} from "@/lib/danisan/listCache";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { DanisanSectionShell } from "@/app/danisan-yolculugu/components/DanisanSectionShell";
import { pruneSelection, visibleSelection } from "@/lib/ui/selection";
import { buildNameListLines } from "@/lib/ui/deleteConfirmMessage";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";
import { BULK_WORD_MAX_CLIENTS, resolveBulkWordScope } from "@/lib/danisan/bulkWord";
import { NO_ANDROID_CLASS } from "@/lib/platform/outputSupport";
import { activityStatus, relativeDayInfo } from "@/lib/danisan/clientDisplay";

// ─── Types ────────────────────────────────────────────────────────────────────
type Client = {
  id: string;
  ad: string | null;
  soyad: string | null;
  telefon: string | null;
  dogum: string | null;
  gorusme: string | null;
  burc: string | null;
  kan: string | null;
  mizac: string | null;
  created_at: string;
};

type SortKey =
  | "newest"
  | "oldest"
  | "name-az"
  | "name-za"
  | "gorusme-new"
  | "gorusme-old";

type AktifDurum = "aktif" | "takip" | "pasif" | "yeni";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDateTR(date: string | null) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Göreli süre metni — çeviri anahtarları clients.list.relative.* üzerinden.
// `t`, clients.list namespace çevirmenidir (çağıran ClientCard'dan geçirilir).
// DY-A: İstanbul takvim günü farkı; gelecek tarih artık "bugün" değil "X gün sonra".
function goreleSure(date: string | null, t: (key: string, values?: Record<string, string | number>) => string): string {
  const info = relativeDayInfo(date);
  if (!info) return "";
  switch (info.kind) {
    case "today":  return t("relative.today");
    case "future": return t("relative.daysLater", { n: info.days });
    case "days":   return t("relative.daysAgo", { n: info.n });
    case "weeks":  return t("relative.weeksAgo", { n: info.n });
    case "months": return t("relative.monthsAgo", { n: info.n });
    default:       return t("relative.yearsAgo", { n: info.n });
  }
}

// Durum, danışanın son (tamamlanmış) görüşme tarihine göre belirlenir (takvim günü).
// `gorusme` yoksa danışan henüz görülmemiştir → yanıltıcı "Aktif" yerine "Yeni Kayıt".
function calcAktifDurum(gorusme: string | null): AktifDurum {
  return activityStatus(gorusme);
}

// Durum rozet stilleri. Görünen etiket clients.list.durum.<key> ile çevrilir;
// anahtar (aktif/takip/pasif/yeni) calcAktifDurum() çıktısıdır.
const DURUM_CLS: Record<AktifDurum, string> = {
  aktif: "bg-emerald-100 text-emerald-700",
  takip: "bg-amber-100 text-amber-700",
  pasif: "bg-red-100 text-red-600",
  yeni:  "bg-slate-100 text-slate-600",
};

function clientInitials(ad: string | null, soyad: string | null): string {
  const a = (ad?.trim() ?? "").toLocaleUpperCase("tr-TR");
  const s = (soyad?.trim() ?? "").toLocaleUpperCase("tr-TR");
  return `${a[0] ?? ""}${s[0] ?? ""}` || "?";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[13px] font-black tracking-wide text-slate-800">{label}</span>
      {children}
    </label>
  );
}

// ─── Danışan kartı (memoized — re-render fırtınasını önler) ──────────────────
// Arama yazarken / seçim değiştikçe yalnızca prop'u değişen kart yeniden çizilir.
const ClientCard = memo(function ClientCard({
  client,
  isSelected,
  expiredCount,
  unpaidCount = 0,
  onToggle,
  onOpen,
  onPrefetch,
}: {
  client: Client;
  isSelected: boolean;
  expiredCount: number;
  /** WT7: payment_status='unpaid' ücret kaydı adedi (eski/Belirtilmemiş sayılmaz). */
  unpaidCount?: number;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  const t = useTranslations("clients.list");
  const hasExpiredHw = expiredCount > 0;
  const durumKey = calcAktifDurum(client.gorusme);
  const durumCls = DURUM_CLS[durumKey];
  const durumLabel = t(`durum.${durumKey}`);
  const initText = clientInitials(client.ad, client.soyad);
  const gorceleSureStr = goreleSure(client.gorusme, t);

  return (
    <div
      className={`group relative cursor-pointer rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
        isSelected ? "ring-2 ring-blue-400 ring-offset-1" : ""
      }`}
      style={{
        borderColor: isSelected ? "#60a5fa" : hasExpiredHw ? "#fecaca" : "#e2e8f0",
        background: isSelected
          ? "linear-gradient(135deg,#eff6ff,#eef2ff)"
          : hasExpiredHw
            ? "linear-gradient(135deg,#fff7ed,#fff1f2)"
            : "white",
      }}
      onClick={() => onOpen(client.id)}
      onMouseEnter={() => onPrefetch(client.id)}
      title={t("card.openTitle")}
    >
      {/* Checkbox — demo vitrin hesabında da görünür (toplu Word çıktısı salt-okunur çalışır) */}
      {(
        <label
          className="absolute right-1 top-1 z-10 flex h-11 w-11 cursor-pointer items-center justify-center lg:right-3 lg:top-3 lg:h-6 lg:w-6"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(client.id)}
            className="h-5 w-5 rounded border-slate-300 accent-blue-600 lg:h-4 lg:w-4"
          />
        </label>
      )}

      {/* Avatar + İsim + Durum */}
      <div className="mb-3 flex items-start gap-3 pr-7">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-[13px] font-black text-white shadow-sm">
          {initText}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-1.5">
            <span className="truncate text-[15px] font-black leading-tight text-slate-900">
              {client.ad} {client.soyad}
            </span>
            {hasExpiredHw && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                {t("card.expiredHw", { count: expiredCount })}
              </span>
            )}
            {unpaidCount > 0 && (
              <span
                data-testid="client-unpaid-badge"
                className="inline-flex shrink-0 items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700"
              >
                {t("card.unpaid")}
              </span>
            )}
          </div>
          {durumLabel && (
            <span className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-black ${durumCls}`}>
              {durumLabel}
            </span>
          )}
        </div>
      </div>

      {/* Veri satırları */}
      <div className="space-y-1.5 text-[12px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 flex-shrink-0 text-slate-400" />
          <span className="block min-w-0 flex-1 truncate">{client.telefon || t("card.noPhone")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarCheck className="h-3 w-3 flex-shrink-0 text-slate-400" />
          <span className="truncate">
            {client.gorusme
              ? `${formatDateTR(client.gorusme)}${gorceleSureStr ? ` · ${gorceleSureStr}` : ""}`
              : t("card.noGorusme")}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex justify-end">
        <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold text-sky-700 transition-all group-hover:bg-sky-200">
          {t("card.detail")}
        </span>
      </div>
    </div>
  );
});

// ─── Sayfalama çubuğu ──────────────────────────────────────────────────────────
// DOM'u tek sayfayla sınırlar. Aktif sayfa etrafında pencere gösterir; ilk/son
// sayfaya kısayol + « ‹ › ». Dokunma hedefleri mobilde ≥40px.
const PaginationBar = memo(function PaginationBar({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const t = useTranslations("clients.list");
  const win = 1;
  const start = Math.max(1, page - win);
  const end = Math.min(pageCount, page + win);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const base =
    "inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border px-3 text-[13px] font-black transition-all";
  const normal = `${base} border-slate-200 bg-white text-slate-600 shadow-sm hover:-translate-y-0.5 hover:bg-slate-50`;
  const active = `${base} border-blue-500 bg-blue-600 text-white shadow`;
  const nav = `${normal} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0`;

  return (
    <nav className="mt-6 flex flex-col items-center gap-2.5" aria-label={t("pagination.aria")}>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className={nav}
          aria-label={t("pagination.prev")}
        >
          ‹
        </button>

        {start > 1 && (
          <>
            <button type="button" onClick={() => onChange(1)} className={normal}>1</button>
            {start > 2 && <span className="px-0.5 text-slate-400">…</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={p === page ? active : normal}
          >
            {p}
          </button>
        ))}

        {end < pageCount && (
          <>
            {end < pageCount - 1 && <span className="px-0.5 text-slate-400">…</span>}
            <button type="button" onClick={() => onChange(pageCount)} className={normal}>
              {pageCount}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          className={nav}
          aria-label={t("pagination.next")}
        >
          ›
        </button>
      </div>
      <p className="text-[12px] font-bold text-slate-400">
        {t("pagination.summary", { page, pageCount, total })}
      </p>
    </nav>
  );
});

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DanisanListePage() {
  const t = useTranslations("clients.list");
  const router = useRouter();
  useBfcacheRefresh();
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  const [sessionUser, setSessionUser] = useState<YasamUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [homeworkAlerts, setHomeworkAlerts] = useState<Record<string, number>>({});
  // WT7: "Ücret Alınmadı" rozeti — tek aggregate istek (N+1 yok); yalnız 'unpaid' kayıtlar.
  const [unpaidCharges, setUnpaidCharges] = useState<Record<string, { count: number; total: number }>>({});
  const unpaidRef = useRef<Record<string, { count: number; total: number }>>({});
  useEffect(() => { unpaidRef.current = unpaidCharges; }, [unpaidCharges]);
  // Aktif Uyarı listesi: uyarısı olan danışanların adları (sunucudan) + panel aç/kapat.
  const [alertNames, setAlertNames] = useState<Record<string, string>>({});
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Sunucu tarafı sayfalama: ilk açılışta yalnızca ilk sayfa (30) gelir.
  // Arama/filtre/varsayılan-dışı sıralama gerekince tüm veri bir kez çekilir
  // (Türkçe-duyarlı client-side arama tam veriyle korunur).
  const [total, setTotal] = useState<number | null>(null);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [filterBurc, setFilterBurc] = useState("");
  const [filterKan, setFilterKan] = useState("");
  const [filterMizac, setFilterMizac] = useState("");
  // İlk Harf (Türkçe alfabe; "" = Tümü).
  const [filterInitial, setFilterInitial] = useState("");
  // Mobil (<sm) filtre paneli varsayılan kapalı; sm+ her zaman açık (CSS).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);

  // Toplu seçim ve Word export
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const isAndroid = useIsAndroid();

  const tenantId = sessionUser?.tenant_id?.trim() || null;
  const tenantMissing = sessionChecked && (!sessionUser || !tenantId);
  const isDemo = sessionUser?.is_demo_account === true;

  const totalExpiredHomework = useMemo(
    () => Object.values(homeworkAlerts).reduce((sum, count) => sum + count, 0),
    [homeworkAlerts],
  );

  const filteredClients = useMemo(() => {
    const filters = {
      search,
      burc: filterBurc,
      kan: filterKan,
      mizac: filterMizac,
      initial: filterInitial,
    };
    const filtered = clients.filter((c) => matchesClientFilters(c, filters));

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-az":
          return `${a.ad ?? ""} ${a.soyad ?? ""}`.localeCompare(`${b.ad ?? ""} ${b.soyad ?? ""}`, "tr-TR");
        case "name-za":
          return `${b.ad ?? ""} ${b.soyad ?? ""}`.localeCompare(`${a.ad ?? ""} ${a.soyad ?? ""}`, "tr-TR");
        case "oldest":
          return a.created_at.localeCompare(b.created_at);
        case "gorusme-new":
          return (b.gorusme ?? "").localeCompare(a.gorusme ?? "");
        case "gorusme-old":
          return (a.gorusme ?? "").localeCompare(b.gorusme ?? "");
        default: // "newest"
          return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [clients, search, filterBurc, filterKan, filterMizac, filterInitial, sortBy]);

  const activeFilterCount = countActiveClientFilters({
    search,
    burc: filterBurc,
    kan: filterKan,
    mizac: filterMizac,
    initial: filterInitial,
  });
  const hasActiveFilter = activeFilterCount > 0;
  const clearFilters = useCallback(() => {
    setSearch("");
    setFilterBurc("");
    setFilterKan("");
    setFilterMizac("");
    setFilterInitial("");
  }, []);
  // Arama/filtre veya varsayılan-dışı sıralama → doğru sonuç için tüm veri gerekir.
  const needsFullData = hasActiveFilter || sortBy !== "newest";
  // Gözat modu: filtre yok + varsayılan sıralama + tüm veri henüz çekilmedi →
  // sunucu-sayfalı kayıtları göster, "Daha fazla yükle" ile devam et.
  const browseMode = !fullLoaded && !needsFullData;

  // ─── Sayfalama ───────────────────────────────────────────────────────────────
  // DOM'da her zaman EN ÇOK PER_PAGE kart render edilir → liste ne kadar büyürse
  // büyüsün mobil/masaüstünde aşırı uzamaz, performans sabit kalır.
  const PER_PAGE = 24;
  // Başlık sayacı: gözat modunda toplam kayıt; filtre/tam modda filtrelenmiş sonuç.
  const displayCount = browseMode ? (total ?? clients.length) : filteredClients.length;
  const pageCount = Math.max(1, Math.ceil(displayCount / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pageStart = (safePage - 1) * PER_PAGE;
  const pagedClients = filteredClients.slice(pageStart, pageStart + PER_PAGE);
  // Gözat modunda seçili sayfanın kayıtları sunucudan henüz çekilmemiş olabilir.
  const pageNeedsMore =
    browseMode && total !== null && clients.length < Math.min(safePage * PER_PAGE, total);

  // Filtre / arama / sıralama değişince sayfayı başa sar.
  useEffect(() => {
    setPage(1);
  }, [search, filterBurc, filterKan, filterMizac, filterInitial, sortBy]);

  // DY-A: seçim her zaman GÖRÜNÜR (filtrelenmiş) kümeyle budanır → aramayla gizlenen
  // seçili danışan habersizce silinemez/Word'e girmez. Değişiklik yoksa aynı Set (döngü yok).
  // Render sırasında budama (React "önceki prop'a göre state ayarla" deseni; effect yok).
  const filteredIds = useMemo(() => filteredClients.map((c) => c.id), [filteredClients]);
  const [prunedFor, setPrunedFor] = useState(filteredIds);
  if (prunedFor !== filteredIds) {
    setPrunedFor(filteredIds);
    setSelectedClientIds((prev) => pruneSelection(prev, filteredIds));
  }
  const visibleSelectedIds = useMemo(
    () => visibleSelection(selectedClientIds, filteredIds),
    [selectedClientIds, filteredIds],
  );
  const wordScope = resolveBulkWordScope(visibleSelectedIds.length, total, hasActiveFilter);

  const toggleClientSelection = useCallback((id: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // WT7: "Tümünü Seç" GERÇEK tam veri kümesini kapsar — gözat modunda yalnız yüklü sayfalar
  // değil; önce tüm danışanlar çekilir, sonra (varsa) aktif arama/filtre uygulanır.
  const selectAllBusyRef = useRef(false);
  async function selectAllFiltered() {
    if (!tenantId || selectAllBusyRef.current) return;
    selectAllBusyRef.current = true;
    setSelectingAll(true);
    try {
      let base: Client[] | null = clients;
      if (!fullLoaded) base = await loadFull(tenantId);
      if (!base) return;
      const filters = { search, burc: filterBurc, kan: filterKan, mizac: filterMizac, initial: filterInitial };
      setSelectedClientIds(new Set(base.filter((c) => matchesClientFilters(c, filters)).map((c) => c.id)));
    } finally {
      selectAllBusyRef.current = false;
      setSelectingAll(false);
    }
  }

  const clearClientSelection = useCallback(() => {
    setSelectedClientIds(new Set());
  }, []);

  // Kart tıklaması / hover — stabil referanslar (memoized kartların gereksiz
  // re-render'ını önler). Hover'da detay rotasını prefetch et → tıklayınca anında.
  const openClient = useCallback(
    (id: string) => {
      // Demo vitrin hesabı da GERÇEK danışan detay sayfasını kullanır (paralel demo sayfası yok).
      router.push(`/dashboard/clients/${id}`);
    },
    [router],
  );
  const prefetchClient = useCallback(
    (id: string) => {
      router.prefetch(`/dashboard/clients/${id}`);
    },
    [router],
  );

  // Sayfa değişiminde listenin başına kaydır → yeni sayfa hep en üstten görünür.
  const goToPage = useCallback((p: number) => {
    setPage(p);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    setSessionUser(readYasamUser());
    setSessionChecked(true);
  }, []);

  const PAGE_SIZE = 30;
  const fullReqRef = useRef(false);

  function authHeaders(): Record<string, string> {
    const user = readYasamUser();
    const token = readSessionToken();
    return { "x-user-id": user?.id ?? "", ...(token ? { "x-session-token": token } : {}) };
  }

  async function fetchClientsPage(
    offset: number,
    limit: number,
  ): Promise<{ clients: Client[]; count: number | null }> {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset), count: "1" });
    const res = await fetch(`/api/clients?${qs.toString()}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Listeleme hatası");
    const json = (await res.json()) as { clients?: Client[]; count?: number };
    return { clients: json.clients ?? [], count: typeof json.count === "number" ? json.count : null };
  }

  async function fetchUnpaid(): Promise<Record<string, { count: number; total: number }>> {
    const res = await fetch("/api/clients/charges-unpaid", { headers: authHeaders() }).catch(() => null);
    if (!res || !res.ok) { console.error("Ödenmemiş ücret özeti yüklenemedi:", res?.status); return {}; }
    const j = (await res.json().catch(() => ({}))) as { unpaid?: Record<string, { count: number; total: number }> };
    return j.unpaid ?? {};
  }

  /** Önbelleğe yazarken güncel ödenmemiş özeti de korur. */
  function writeCache(tid: string, entry: Omit<Parameters<typeof setDanisanListCache>[1], "unpaid">) {
    setDanisanListCache(tid, { ...entry, unpaid: unpaidRef.current });
  }

  async function fetchAlerts(): Promise<Record<string, number>> {
    const res = await fetch("/api/clients/homeworks-alerts", { headers: authHeaders() });
    if (!res.ok) { console.error("Ödev uyarıları yüklenemedi:", res.status); return {}; }
    const j = (await res.json().catch(() => ({}))) as { alerts?: Record<string, number>; names?: Record<string, string> };
    if (j.names) setAlertNames((prev) => ({ ...prev, ...j.names }));
    return j.alerts ?? {};
  }

  // İlk açılış: önbellek varsa anında boya; yoksa YALNIZCA ilk sayfayı (30) + uyarıları çek.
  async function loadInitial(tid: string) {
    const cached = getDanisanListCache(tid);
    if (cached) {
      setClients(cached.clients as Client[]);
      setTotal(cached.total);
      setFullLoaded(cached.fullLoaded);
      setHomeworkAlerts(cached.alerts);
      if (cached.unpaid) setUnpaidCharges(cached.unpaid);
      else void fetchUnpaid().then(setUnpaidCharges);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [page, alerts, unpaid] = await Promise.all([fetchClientsPage(0, PAGE_SIZE), fetchAlerts(), fetchUnpaid()]);
      const full = page.count !== null && page.clients.length >= page.count;
      setClients(page.clients);
      setTotal(page.count);
      setFullLoaded(full);
      setHomeworkAlerts(alerts);
      setUnpaidCharges(unpaid);
      unpaidRef.current = unpaid;
      writeCache(tid, {
        clients: page.clients,
        total: page.count ?? page.clients.length,
        fullLoaded: full,
        alerts,
      });
    } catch {
      showToast({ title: t("toast.failTitle"), message: t("toast.listError"), type: "error" });
    } finally {
      setLoading(false);
    }
  }

  // "Daha fazla yükle" — sonraki sayfayı ekler (gözat modu).
  async function loadMore() {
    if (!tenantId || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchClientsPage(clients.length, PAGE_SIZE);
      const merged = [...clients, ...page.clients];
      const newTotal = page.count ?? total ?? merged.length;
      const full = merged.length >= newTotal;
      setClients(merged);
      setTotal(newTotal);
      setFullLoaded(full);
      writeCache(tenantId, { clients: merged, total: newTotal, fullLoaded: full, alerts: homeworkAlerts });
    } catch {
      showToast({ title: t("toast.errorTitle"), message: t("toast.loadMoreError"), type: "error" });
    } finally {
      setLoadingMore(false);
    }
  }

  // Arama/filtre/sıralama gerekince: tüm veriyi bir kez çek (Türkçe arama tam veriyle).
  async function loadFull(tid: string): Promise<Client[] | null> {
    setLoadingMore(true);
    try {
      const all: Client[] = [];
      let offset = 0;
      let grand: number | null = total;
      for (;;) {
        const qs = new URLSearchParams({ limit: "1000", offset: String(offset), count: "1" });
        const res = await fetch(`/api/clients?${qs.toString()}`, { headers: authHeaders() });
        if (!res.ok) throw new Error("full");
        const json = (await res.json()) as { clients?: Client[]; count?: number };
        const chunk = json.clients ?? [];
        if (typeof json.count === "number") grand = json.count;
        all.push(...chunk);
        offset += chunk.length;
        if (chunk.length < 1000 || (grand !== null && all.length >= grand)) break;
      }
      setClients(all);
      setTotal(grand ?? all.length);
      setFullLoaded(true);
      writeCache(tid, { clients: all, total: grand ?? all.length, fullLoaded: true, alerts: homeworkAlerts });
      return all;
    } catch {
      showToast({ title: t("toast.errorTitle"), message: t("toast.loadAllError"), type: "error" });
      return null;
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!sessionChecked) return;
    if (!tenantId) {
      setLoading(false);
      setClients([]);
      setHomeworkAlerts({});
      showToast({
        title: t("toast.sessionWarningTitle"),
        message: !sessionUser ? t("toast.noSession") : t("toast.noTenant"),
        type: "warning",
      });
      return;
    }
    void loadInitial(tenantId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, tenantId]);

  // Arama/filtre/sıralama gerekiyorsa ve tüm veri henüz yoksa → tümünü çek.
  useEffect(() => {
    if (!tenantId || fullLoaded) return;
    if (needsFullData && !fullReqRef.current) {
      fullReqRef.current = true;
      void loadFull(tenantId).finally(() => { fullReqRef.current = false; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFullData, fullLoaded, tenantId]);

  // Gözat modunda seçili sayfanın kayıtları henüz yüklenmediyse sonraki sunucu
  // sayfasını çek (chunk'lar birikerek istenen sayfayı kapsar).
  useEffect(() => {
    if (pageNeedsMore && !loadingMore) {
      void loadMore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNeedsMore, loadingMore]);

  const bulkDeleteBusyRef = useRef(false);

  async function handleBulkDeleteClients() {
    // DY-A: yalnız seçili ∩ görünür; senkron kilit (çift tık → ikinci çağrı yok sayılır).
    if (bulkDeleteBusyRef.current) return;
    const ids = visibleSelectedIds;
    if (ids.length === 0) return;
    if (!tenantId) {
      showToast({ title: t("toast.errorTitle"), message: t("toast.sessionMissing"), type: "error" });
      return;
    }

    bulkDeleteBusyRef.current = true;
    const byId = new Map(clients.map((c) => [c.id, c] as const));
    const nameOf = (id: string) => {
      const c = byId.get(id);
      return `${c?.ad ?? ""} ${c?.soyad ?? ""}`.trim() || id.slice(0, 8);
    };
    const deletedIds: string[] = [];
    const failedIds: string[] = [];
    let anyStorageWarning = false;

    try {
      // Ad listeli onay + bağlı olmayan modüller notu + "SİL" yazarak onay (geri alınamaz).
      const confirmed = await deleteConfirm({
        title: t("toast.deleteConfirmTitle"),
        count: ids.length,
        noun: "danışan",
        message: [
          t("toast.deleteConfirmMsg", { count: ids.length }),
          buildNameListLines(ids.map(nameOf), ids.length).join("\n"),
          "",
          t("toast.deleteUnlinked"),
        ].join("\n"),
        requireText: "SİL",
        requireTextLabel: t("toast.deleteRequireLabel"),
      });
      if (!confirmed) return;

      setDeleteLoading(true);

      // Her danışan için tam silme güvenli cascade-delete API'si üzerinden yapılır.
      const user = readYasamUser();
      const bulkToken = readSessionToken();
      const bulkHeaders = {
        "x-user-id": user?.id ?? "",
        ...(bulkToken ? { "x-session-token": bulkToken } : {}),
      };
      for (const id of ids) {
        try {
          const res = await fetch(`/api/clients/${id}/cascade-delete`, {
            method: "DELETE",
            headers: bulkHeaders,
          });
          if (res.ok) {
            deletedIds.push(id);
            // F5: DB silme başarılı; storage temizliği kısmen başarısız olabilir.
            const j = (await res.json().catch(() => ({}))) as { warnings?: string[] };
            if (Array.isArray(j.warnings) && j.warnings.length > 0) anyStorageWarning = true;
          } else {
            failedIds.push(id);
          }
        } catch {
          failedIds.push(id);
        }
      }
    } finally {
      bulkDeleteBusyRef.current = false;
      setDeleteLoading(false);

      if (deletedIds.length > 0) {
        const deletedIdSet = new Set(deletedIds);
        const remaining = clients.filter((c) => !deletedIdSet.has(c.id));
        const newTotal = total !== null ? Math.max(0, total - deletedIds.length) : null;
        setClients(remaining);
        setTotal(newTotal);
        // Başarısızlar SEÇİLİ KALIR (tekrar denenebilir); yalnız silinenler seçimden çıkar.
        setSelectedClientIds((prev) => {
          const next = new Set(prev);
          for (const id of deletedIds) next.delete(id);
          return next;
        });
        // Silinen danışanların "Aktif Uyarı" katkısı ANINDA düşer (sayfa yenilemeden).
        const remainingAlerts: Record<string, number> = { ...homeworkAlerts };
        for (const id of deletedIds) delete remainingAlerts[id];
        setHomeworkAlerts(remainingAlerts);
        // Önbelleği güncel tut → geri dönüşte doğru (silinmiş) liste anında görünür.
        writeCache(tenantId, {
          clients: remaining,
          total: newTotal ?? remaining.length,
          fullLoaded,
          alerts: remainingAlerts,
        });
        // Sunucu gerçeğiyle eşitle (başka sekme/cihaz değişiklikleri dahil).
        void fetchAlerts().then((fresh) => {
          setHomeworkAlerts(fresh);
          writeCache(tenantId, {
            clients: remaining,
            total: newTotal ?? remaining.length,
            fullLoaded,
            alerts: fresh,
          });
        });
      }
    }

    if (failedIds.length > 0) {
      showToast({
        title: deletedIds.length === 0 ? t("toast.errorTitle") : t("toast.deleteFailedTitle"),
        message: t("toast.deleteFailedNames", { names: failedIds.map(nameOf).join(", ") }),
        type: "error",
      });
    }
    if (deletedIds.length === 0) return;

    if (anyStorageWarning) {
      showToast({ title: t("toast.deletePartialTitle"), message: t("toast.deletePartialMsg"), type: "warning" });
    }
    showToast({ title: t("toast.successTitle"), message: t("toast.deleteSuccess", { count: deletedIds.length }), type: "success" });
  }

  // WT7: TEK dinamik Word aksiyonu — yalnız iki kapsam: seçilen danışanlar veya GERÇEKTEN tüm danışanlar.
  async function exportClientsWord() {
    if (!tenantId || wordBusy) return;
    // DY-A: Word yalnız seçili ∩ görünür kesişim.
    const ids = [...visibleSelectedIds];
    const scope = resolveBulkWordScope(ids.length, total, hasActiveFilter);
    if (scope.count === 0) { showToast({ title: t("toast.warnTitle"), message: t("toast.exportSelectFirst"), type: "warning" }); return; }
    if (scope.count > BULK_WORD_MAX_CLIENTS) {
      showToast({ title: t("toast.errorTitle"), message: t("bulkWord.tooMany", { max: BULK_WORD_MAX_CLIENTS, count: scope.count }), type: "error" });
      return;
    }
    const mode = scope.mode;
    const clientIds = mode === "selected" ? ids : undefined;
    setWordBusy(true);
    try {

      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const res = await fetch("/api/clients/word-report-bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          "x-session-token": sessionToken ?? "",
        },
        body: JSON.stringify({ exportMode: mode, clientIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || t("toast.exportError"));
      }
      // Dosya adı sunucudan (Content-Disposition); yoksa yerel-gün (İstanbul) yedeği.
      const count = Number(res.headers.get("X-Report-Client-Count")) || scope.count;
      await downloadFileResponse(res, `danisan-dosyalari-${count}-danisan-${reportFileDate()}.docx`);
      showToast({ title: t("toast.successTitle"), message: t("bulkWord.success", { count }), type: "success" });
    } catch (err) {
      showToast({ title: t("toast.errorTitle"), message: err instanceof Error ? err.message : t("toast.unknownError"), type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  const inputCls =
    "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-900 shadow-inner outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_90%_15%,rgba(236,72,153,0.10),transparent_30%),linear-gradient(135deg,#eef5ff_0%,#f7f2ff_48%,#fff4fb_100%)] px-2 py-5 text-slate-900 antialiased sm:px-6 lg:px-8 xl:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-[500px] w-[500px] rounded-full bg-blue-400/14 blur-[160px]" />
        <div className="absolute -right-20 top-0 h-[440px] w-[440px] rounded-full bg-violet-400/10 blur-[160px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-indigo-300/10 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1600px]">
        {/* Header */}
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-4 py-3.5 shadow-lg sm:px-8 sm:py-5">
            <UsersRound
              className="pointer-events-none absolute right-6 top-1/2 h-24 w-24 -translate-y-1/2 text-blue-400 opacity-10"
              strokeWidth={1.25}
              aria-hidden
            />
            <div className="relative z-10">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-700/85">{t("eyebrow")}</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-4xl">{t("title")}</h1>
              <p className="mt-2 hidden max-w-2xl text-sm font-medium leading-snug text-slate-600 sm:block">
                {t("subtitle")}
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-nowrap sm:items-start sm:gap-3">
            <div className="rounded-2xl border border-white/80 bg-white/85 px-2 py-2.5 text-center shadow-md backdrop-blur-sm sm:min-w-[110px] sm:px-5 sm:py-4">
              <strong className="block text-2xl font-black text-slate-950 sm:text-3xl">{loading ? "—" : (total ?? clients.length)}</strong>
              <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{t("statClients")}</span>
            </div>
            {totalExpiredHomework > 0 ? (
              // Uyarı > 0 → kart tıklanabilir: geciken ödevi olan danışanların listesi açılır.
              <button
                type="button"
                onClick={() => setAlertsOpen((v) => !v)}
                aria-expanded={alertsOpen}
                aria-controls="dy-active-alerts-panel"
                aria-label={t("alertsOpen")}
                data-testid="dy-alerts-card"
                className="rounded-2xl border border-red-200/80 bg-red-50/90 px-2 py-2.5 text-center shadow-md backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 sm:min-w-[110px] sm:px-5 sm:py-4"
              >
                <strong className="block text-2xl font-black text-red-600 sm:text-3xl">{totalExpiredHomework}</strong>
                <span className="mt-0.5 flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {t("statAlerts")}
                  <span aria-hidden className={`inline-block transition-transform ${alertsOpen ? "rotate-180" : ""}`}>▾</span>
                </span>
              </button>
            ) : (
              <div data-testid="dy-alerts-card" className="rounded-2xl border border-blue-200/80 bg-blue-50/90 px-2 py-2.5 text-center shadow-md backdrop-blur-sm sm:min-w-[110px] sm:px-5 sm:py-4">
                <strong className="block text-2xl font-black text-blue-600 sm:text-3xl">{totalExpiredHomework}</strong>
                <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{t("statAlerts")}</span>
              </div>
            )}
            <Link
              href="/danisan-yolculugu/kayit"
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-2.5 text-center text-[13px] font-black text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg sm:gap-2 sm:px-5 sm:py-4 sm:text-sm"
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              {isDemo ? t("newClientDemo") : t("newClient")}
            </Link>
          </div>
        </header>

        {alertsOpen && totalExpiredHomework > 0 ? (
          <section
            id="dy-active-alerts-panel"
            data-testid="dy-alerts-panel"
            className="mb-5 rounded-2xl border border-red-200 bg-white/95 p-3 shadow-md sm:p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-red-700">⚠ {t("alertsPanelTitle")}</h2>
              <button type="button" onClick={() => setAlertsOpen(false)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100">
                {t("alertsClose")}
              </button>
            </div>
            <ul className="divide-y divide-slate-100">
              {Object.entries(homeworkAlerts)
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => {
                  const fromList = clients.find((c) => c.id === id);
                  const name =
                    alertNames[id] ||
                    [fromList?.ad, fromList?.soyad].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") ||
                    t("alertsUnknownClient");
                  return (
                    <li key={id} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{name}</p>
                        <p className="text-xs font-bold text-red-600">{t("alertsOverdue", { count: n })}</p>
                      </div>
                      <Link
                        href={`/dashboard/clients/${encodeURIComponent(id)}?tab=odevler`}
                        data-testid="dy-alert-link"
                        className="inline-flex w-fit items-center rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-100"
                      >
                        {t("alertsGoTo")} →
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>
        ) : null}

        {isDemo && (
          <div className="mb-6 overflow-hidden rounded-2xl border-2 border-amber-400 shadow-md">
            <div className="flex items-start gap-3.5 bg-amber-50 px-5 py-4">
              <span className="mt-0.5 text-2xl leading-none">🔎</span>
              <div>
                <p className="text-base font-black text-amber-900">{t("demoNotice.title")}</p>
                <p className="mt-1 text-sm leading-relaxed text-amber-800">
                  {t.rich("demoNotice.desc", { b: (chunks) => <span className="font-black">{chunks}</span> })}
                </p>
              </div>
            </div>
            <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-red-400" />
          </div>
        )}

        {tenantMissing && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/95 px-5 py-4 text-sm font-bold text-amber-950 shadow-sm">
            {!sessionUser ? t("tenantMissing.noSession") : t("tenantMissing.noTenant")}
          </div>
        )}

        {/* Filter Panel */}
        <DanisanSectionShell
          className="mb-5"
          desktopClassName="sm:rounded-2xl sm:border sm:border-white/80 sm:bg-white/80 sm:p-8 sm:shadow-lg sm:backdrop-blur-sm [@media(max-height:500px)]:sm:p-3"
        >
          {/* Mobil (<sm) ve alçak yatay ekran: tek satır "Filtrele" açma/kapama butonu. sm+ gizli. */}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="dy-liste-filtre-panel"
            className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 text-left text-[15px] font-black text-slate-900 shadow-sm transition-colors hover:bg-slate-50 sm:hidden [@media(max-height:500px)]:flex"
          >
            <ListFilter className="h-4 w-4 shrink-0 text-blue-700" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t("filter.toggle")}</span>
            {activeFilterCount > 0 && (
              <>
                <span
                  className="inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[12px] font-black text-white"
                  aria-hidden
                >
                  {activeFilterCount}
                </span>
                <span className="sr-only">{t("filter.activeCount", { count: activeFilterCount })}</span>
              </>
            )}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          <div
            id="dy-liste-filtre-panel"
            className={filtersOpen ? "mt-4 sm:mt-0 [@media(max-height:500px)]:mt-4" : "hidden sm:block [@media(max-height:500px)]:hidden"}
          >
          <div className="mb-5 hidden items-center gap-3 sm:flex">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 shadow-sm">
              <ListFilter className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <p className="text-base font-black text-slate-900">{t("filter.title")}</p>
              <p className="text-xs text-slate-500">{t("filter.subtitle")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Field label={t("filter.searchLabel")}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("filter.searchPlaceholder")}
                className={inputCls}
              />
            </Field>
            <Field label={t("filter.initial")}>
              {/* İlk Harf: Türkçe alfabe (I ≠ İ, C ≠ Ç); eşleşme tr-TR büyük harf. */}
              <select value={filterInitial} onChange={(e) => setFilterInitial(e.target.value)} className={inputCls}>
                <option value="">{t("filter.initialAll")}</option>
                {TR_ALPHABET.map((letter) => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
            </Field>
            <Field label={t("filter.burcLabel")}>
              {/* Burç option VALUE'su KANONİK Türkçe kalır (filtre: c.burc === filterBurc);
                  yalnız görünen LABEL locale'e göre map'lenir (EN→Aries…), bilinmeyen→raw. */}
              <select value={filterBurc} onChange={(e) => setFilterBurc(e.target.value)} className={inputCls}>
                <option value="">{t("filter.all")}</option>
                {["Koç","Boğa","İkizler","Yengeç","Aslan","Başak","Terazi","Akrep","Yay","Oğlak","Kova","Balık"].map((b) => (
                  <option key={b} value={b}>{t.has(`filter.burcOptions.${b}`) ? t(`filter.burcOptions.${b}`) : b}</option>
                ))}
              </select>
            </Field>
            <Field label={t("filter.kanLabel")}>
              {/* Kan grubu KANONİK değer (filtre: c.kan === filterKan) → ÇEVRİLMEZ. */}
              <select value={filterKan} onChange={(e) => setFilterKan(e.target.value)} className={inputCls}>
                <option value="">{t("filter.all")}</option>
                <option>A Rh+</option><option>A Rh-</option>
                <option>B Rh+</option><option>B Rh-</option>
                <option>AB Rh+</option><option>AB Rh-</option>
                <option>0 Rh+</option><option>0 Rh-</option>
              </select>
            </Field>
            <Field label={t("filter.mizacLabel")}>
              {/* Mizaç: value KANONİK (filtre: c.mizac === filterMizac); yalnız
                  görünen etiket çevrilir. */}
              <select value={filterMizac} onChange={(e) => setFilterMizac(e.target.value)} className={inputCls}>
                <option value="">{t("filter.all")}</option>
                <option value="safra">{t("filter.mizacOptions.safra")}</option>
                <option value="sovdavi">{t("filter.mizacOptions.sovdavi")}</option>
                <option value="dem">{t("filter.mizacOptions.dem")}</option>
                <option value="balgam">{t("filter.mizacOptions.balgam")}</option>
              </select>
            </Field>
          </div>

          {/* Mobil: aktif filtre varken "Temizle" (desktop düzeni değişmez). */}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[14px] font-black text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:hidden [@media(max-height:500px)]:inline-flex"
            >
              <X className="h-4 w-4" aria-hidden />
              {t("filter.clear")}
            </button>
          )}
          </div>
        </DanisanSectionShell>

        {/* Client List */}
        <DanisanSectionShell desktopClassName="sm:rounded-2xl sm:border sm:border-white/80 sm:bg-white/80 sm:p-8 sm:shadow-lg sm:backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-2 sm:mb-5 sm:flex-wrap sm:gap-3">
            <h2 className="min-w-0 text-lg font-black text-slate-950 sm:text-xl">
              {t("listHeader")}
              {!loading && (
                <span className="ml-2 text-base font-bold text-slate-400">({displayCount})</span>
              )}
            </h2>

            {/* Sort selector */}
            <div className="flex shrink-0 items-center gap-2">
              <ArrowUpDown className="hidden h-3.5 w-3.5 flex-shrink-0 text-slate-400 sm:block" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 lg:min-h-0"
              >
                <option value="newest">{t("sort.newest")}</option>
                <option value="oldest">{t("sort.oldest")}</option>
                <option value="name-az">{t("sort.nameAz")}</option>
                <option value="name-za">{t("sort.nameZa")}</option>
                <option value="gorusme-new">{t("sort.gorusmeNew")}</option>
                <option value="gorusme-old">{t("sort.gorusmeOld")}</option>
              </select>
            </div>
          </div>

          {/* Toplu işlem / Word export çubuğu */}
          {!loading && filteredClients.length > 0 && (
            <div className="mb-5">
              <BulkExportBar
                selectedCount={visibleSelectedIds.length}
                totalCount={total ?? clients.length}
                filteredCount={filteredClients.length}
                hasActiveFilter={hasActiveFilter}
                onSelectAll={() => void selectAllFiltered()}
                selectAllLabel={selectingAll ? t("bulkWord.loadingAll") : hasActiveFilter ? t("bulkWord.selectAllFiltered") : t("bulkWord.selectAll")}
                selectAllCount={hasActiveFilter && fullLoaded ? filteredClients.length : (total ?? clients.length)}
                onClearSelection={clearClientSelection}
                onExportSelected={isAndroid ? undefined : () => void exportClientsWord()}
                exportSelectedLabel={wordScope.isAll ? t("bulkWord.wordAll") : t("bulkWord.wordSelected")}
                isExporting={wordBusy || selectingAll}
                onDeleteSelected={
                  isDemo
                    ? () => showToast({ title: t("demoNotice.title"), message: t("demoReadOnly"), type: "info" })
                    : () => void handleBulkDeleteClients()
                }
                isDeleting={deleteLoading}
                hideWordOnMobile
              />
              {/* Kapsam açıklaması yalnız Word butonunun göründüğü yerde (md+, Android değil) — politika gereği
                  Word gizliyken "Word…" metni yanıltmasın; seçim sayacı çubukta her yerde görünür. */}
              {!isAndroid && (
              <p data-testid="bulk-word-scope" className={`${NO_ANDROID_CLASS} mt-1.5 hidden px-1 text-[12px] font-semibold text-slate-500 md:block`}>
                {visibleSelectedIds.length === 0
                  ? t("bulkWord.scopeNone")
                  : hasActiveFilter
                    ? t("bulkWord.scopeFiltered", { filtered: filteredClients.length, selected: visibleSelectedIds.length })
                    : wordScope.isAll
                      ? t("bulkWord.scopeAll", { total: total ?? clients.length })
                      : t("bulkWord.scopeSelected", { selected: visibleSelectedIds.length, total: total ?? clients.length })}
              </p>
              )}
            </div>
          )}

          {loading ? (
            <div className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-3/4 rounded bg-slate-200" />
                      <div className="h-3 w-16 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-2/3 rounded bg-slate-100" />
                    <div className="h-3 w-1/2 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
              <UsersRound className="mx-auto mb-3 h-10 w-10 text-slate-300" strokeWidth={1.5} />
              <p className="text-base font-bold text-slate-500">
                {clients.length === 0 ? t("empty.none") : t("empty.noMatch")}
              </p>
              {clients.length === 0 && (
                <Link
                  href="/danisan-yolculugu/kayit"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-black text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <UserPlus className="h-4 w-4" />
                  {t("empty.addFirst")}
                </Link>
              )}
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pagedClients.map((client) => (
                <ClientCard
                  key={client.id}
                  client={client}
                  isSelected={selectedClientIds.has(client.id)}
                  expiredCount={homeworkAlerts[client.id] || 0}
                  unpaidCount={unpaidCharges[client.id]?.count || 0}
                  onToggle={toggleClientSelection}
                  onOpen={openClient}
                  onPrefetch={prefetchClient}
                />
              ))}
            </div>
            {/* Gözat modunda seçili sayfa yüklenirken kısa bilgi */}
            {pageNeedsMore && (
              <div className="mt-4 flex justify-center">
                <span className="text-[13px] font-bold text-slate-400">{t("loadingMore")}</span>
              </div>
            )}
            {pageCount > 1 && (
              <PaginationBar
                page={safePage}
                pageCount={pageCount}
                total={displayCount}
                onChange={goToPage}
              />
            )}
            </>
          )}
        </DanisanSectionShell>
      </div>
    </main>
  );
}
