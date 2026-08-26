"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import Link from "next/link";
import {
  ArrowUpDown,
  CalendarCheck,
  ListFilter,
  Phone,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { readYasamUser, readSessionToken, type YasamUser } from "@/lib/auth/yasamUser";
import { containsTr } from "@/lib/text/turkishSearch";
import {
  getDanisanListCache,
  setDanisanListCache,
} from "@/lib/danisan/listCache";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { DanisanSectionShell } from "@/app/danisan-yolculugu/components/DanisanSectionShell";
import { DEMO_CLIENTS, type DemoListClient } from "@/lib/demo/demoClients";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { initDemoSession, readDemoClients, type DemoClient } from "@/lib/demo/demoSession";

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
function goreleSure(date: string | null, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (diff < 1)   return t("relative.today");
  if (diff < 7)   return t("relative.daysAgo", { n: diff });
  if (diff < 30)  return t("relative.weeksAgo", { n: Math.floor(diff / 7) });
  if (diff < 365) return t("relative.monthsAgo", { n: Math.floor(diff / 30) });
  return t("relative.yearsAgo", { n: Math.floor(diff / 365) });
}

// Durum, danışanın son (tamamlanmış) görüşme tarihine göre belirlenir.
// `gorusme` yoksa danışan henüz görülmemiştir → yanıltıcı "Aktif" yerine "Yeni Kayıt".
function calcAktifDurum(gorusme: string | null): AktifDurum {
  if (!gorusme) return "yeni";
  const diff = Math.floor((Date.now() - new Date(gorusme).getTime()) / 86400000);
  if (diff <= 30)  return "aktif";
  if (diff <= 90)  return "takip";
  return "pasif";
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
  isDemo,
  onToggle,
  onOpen,
  onPrefetch,
}: {
  client: Client;
  isSelected: boolean;
  expiredCount: number;
  isDemo: boolean;
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
      {/* Checkbox — demo'da gizli */}
      {!isDemo && (
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
          <DemoBlur isProtected={isDemo} intensity={4} className="min-w-0 flex-1">
            <span className="block truncate">{client.telefon || t("card.noPhone")}</span>
          </DemoBlur>
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
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);

  // Toplu seçim ve Word export
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);

  const tenantId = sessionUser?.tenant_id?.trim() || null;
  const tenantMissing = sessionChecked && (!sessionUser || !tenantId);
  const isDemo = sessionUser?.is_demo_account === true;

  const totalExpiredHomework = useMemo(
    () => Object.values(homeworkAlerts).reduce((sum, count) => sum + count, 0),
    [homeworkAlerts],
  );

  const filteredClients = useMemo(() => {
    const q = search.trim();
    const filtered = clients.filter((c) => {
      const fullName = `${c.ad || ""} ${c.soyad || ""}`;
      const searchOk =
        !q || containsTr(fullName, q) || containsTr(c.telefon, q);
      const burcOk = !filterBurc || c.burc === filterBurc;
      const kanOk = !filterKan || c.kan === filterKan;
      const mizacOk = !filterMizac || c.mizac === filterMizac;
      return searchOk && burcOk && kanOk && mizacOk;
    });

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
  }, [clients, search, filterBurc, filterKan, filterMizac, sortBy]);

  const hasActiveFilter = Boolean(search.trim() || filterBurc || filterKan || filterMizac);
  // Arama/filtre veya varsayılan-dışı sıralama → doğru sonuç için tüm veri gerekir.
  const needsFullData = hasActiveFilter || sortBy !== "newest";
  // Gözat modu: filtre yok + varsayılan sıralama + tüm veri henüz çekilmedi →
  // sunucu-sayfalı kayıtları göster, "Daha fazla yükle" ile devam et.
  const browseMode = !isDemo && !fullLoaded && !needsFullData;

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
  }, [search, filterBurc, filterKan, filterMizac, sortBy]);

  const toggleClientSelection = useCallback((id: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedClientIds(new Set(filteredClients.map((c) => c.id)));
  }, [filteredClients]);

  const clearClientSelection = useCallback(() => {
    setSelectedClientIds(new Set());
  }, []);

  // Kart tıklaması / hover — stabil referanslar (memoized kartların gereksiz
  // re-render'ını önler). Hover'da detay rotasını prefetch et → tıklayınca anında.
  const openClient = useCallback(
    (id: string) => {
      router.push(isDemo ? `/demo/danisan/${id}` : `/dashboard/clients/${id}`);
    },
    [router, isDemo],
  );
  const prefetchClient = useCallback(
    (id: string) => {
      if (!isDemo) router.prefetch(`/dashboard/clients/${id}`);
    },
    [router, isDemo],
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

  async function fetchAlerts(): Promise<Record<string, number>> {
    const res = await fetch("/api/clients/homeworks-alerts", { headers: authHeaders() });
    if (!res.ok) { console.error("Ödev uyarıları yüklenemedi:", res.status); return {}; }
    const j = (await res.json().catch(() => ({}))) as { alerts?: Record<string, number> };
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
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [page, alerts] = await Promise.all([fetchClientsPage(0, PAGE_SIZE), fetchAlerts()]);
      const full = page.count !== null && page.clients.length >= page.count;
      setClients(page.clients);
      setTotal(page.count);
      setFullLoaded(full);
      setHomeworkAlerts(alerts);
      setDanisanListCache(tid, {
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
      setDanisanListCache(tenantId, { clients: merged, total: newTotal, fullLoaded: full, alerts: homeworkAlerts });
    } catch {
      showToast({ title: t("toast.errorTitle"), message: t("toast.loadMoreError"), type: "error" });
    } finally {
      setLoadingMore(false);
    }
  }

  // Arama/filtre/sıralama gerekince: tüm veriyi bir kez çek (Türkçe arama tam veriyle).
  async function loadFull(tid: string) {
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
      setDanisanListCache(tid, { clients: all, total: grand ?? all.length, fullLoaded: true, alerts: homeworkAlerts });
    } catch {
      showToast({ title: t("toast.errorTitle"), message: t("toast.loadAllError"), type: "error" });
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!sessionChecked) return;
    // Demo hesap: gerçek DB sorgusu yerine session + fixture veri kullan (tümü)
    if (isDemo) {
      initDemoSession();
      const sessionClients = readDemoClients() as DemoClient[] as Client[];
      const fixtureClients = DEMO_CLIENTS as DemoListClient[] as Client[];
      const all = [...sessionClients, ...fixtureClients];
      setClients(all);
      setTotal(all.length);
      setFullLoaded(true);
      setHomeworkAlerts({});
      setLoading(false);
      return;
    }
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
  }, [sessionChecked, tenantId, isDemo]);

  // Arama/filtre/sıralama gerekiyorsa ve tüm veri henüz yoksa → tümünü çek.
  useEffect(() => {
    if (isDemo || !tenantId || fullLoaded) return;
    if (needsFullData && !fullReqRef.current) {
      fullReqRef.current = true;
      void loadFull(tenantId).finally(() => { fullReqRef.current = false; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFullData, fullLoaded, tenantId, isDemo]);

  // Gözat modunda seçili sayfanın kayıtları henüz yüklenmediyse sonraki sunucu
  // sayfasını çek (chunk'lar birikerek istenen sayfayı kapsar).
  useEffect(() => {
    if (pageNeedsMore && !loadingMore) {
      void loadMore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNeedsMore, loadingMore]);

  async function handleBulkDeleteClients() {
    const ids = Array.from(selectedClientIds);
    if (ids.length === 0) return;
    if (!tenantId) {
      showToast({ title: t("toast.errorTitle"), message: t("toast.sessionMissing"), type: "error" });
      return;
    }

    const confirmed = await deleteConfirm({
      title: t("toast.deleteConfirmTitle"),
      message: t("toast.deleteConfirmMsg", { count: ids.length }),
      secondMessage: t("toast.deleteConfirmSecond"),
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
    const deletedIds: string[] = [];
    let anyStorageWarning = false;
    for (const id of ids) {
      const res = await fetch(`/api/clients/${id}/cascade-delete`, {
        method: "DELETE",
        headers: bulkHeaders,
      });
      if (res.ok) {
        deletedIds.push(id);
        // F5: DB silme başarılı; storage temizliği kısmen başarısız olabilir.
        const j = (await res.json().catch(() => ({}))) as { warnings?: string[] };
        if (Array.isArray(j.warnings) && j.warnings.length > 0) anyStorageWarning = true;
      }
    }

    setDeleteLoading(false);

    if (deletedIds.length === 0) {
      showToast({ title: t("toast.errorTitle"), message: t("toast.deleteNone"), type: "error" });
      return;
    }

    if (anyStorageWarning) {
      showToast({ title: t("toast.deletePartialTitle"), message: t("toast.deletePartialMsg"), type: "warning" });
    }

    const deletedIdSet = new Set(deletedIds);
    const remaining = clients.filter((c) => !deletedIdSet.has(c.id));
    const newTotal = total !== null ? Math.max(0, total - deletedIds.length) : null;
    setClients(remaining);
    setTotal(newTotal);
    setSelectedClientIds(new Set());
    // Önbelleği güncel tut → geri dönüşte doğru (silinmiş) liste anında görünür.
    if (tenantId) {
      setDanisanListCache(tenantId, {
        clients: remaining,
        total: newTotal ?? remaining.length,
        fullLoaded,
        alerts: homeworkAlerts,
      });
    }
    showToast({ title: t("toast.successTitle"), message: t("toast.deleteSuccess", { count: deletedIds.length }), type: "success" });
  }

  async function exportClientsWord(mode: "selected" | "all" | "filtered") {
    if (!tenantId) return;
    setWordBusy(true);
    try {
      let clientIds: string[] | undefined;
      if (mode === "selected") {
        clientIds = [...selectedClientIds];
        if (!clientIds.length) { showToast({ title: t("toast.warnTitle"), message: t("toast.exportSelectFirst"), type: "warning" }); return; }
      } else if (mode === "filtered") {
        clientIds = filteredClients.map((c) => c.id);
        if (!clientIds.length) { showToast({ title: t("toast.warnTitle"), message: t("toast.exportNoFiltered"), type: "warning" }); return; }
      }

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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const modeSlug = mode === "selected" ? "secili" : mode === "filtered" ? "filtreli" : "tumu";
      a.download = `danisan-listesi-${modeSlug}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ title: t("toast.successTitle"), message: t("toast.exportSuccess"), type: "success" });
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
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-4 py-5 shadow-lg sm:px-8">
            <UsersRound
              className="pointer-events-none absolute right-6 top-1/2 h-24 w-24 -translate-y-1/2 text-blue-400 opacity-10"
              strokeWidth={1.25}
              aria-hidden
            />
            <div className="relative z-10">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-700/85">{t("eyebrow")}</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{t("title")}</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-snug text-slate-600">
                {t("subtitle")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 sm:flex-nowrap sm:items-start">
            <div className="min-w-[110px] rounded-2xl border border-white/80 bg-white/85 px-5 py-4 text-center shadow-md backdrop-blur-sm">
              <strong className="block text-3xl font-black text-slate-950">{loading ? "—" : (total ?? clients.length)}</strong>
              <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{t("statClients")}</span>
            </div>
            <div className={`min-w-[110px] rounded-2xl border px-5 py-4 text-center shadow-md backdrop-blur-sm ${
              totalExpiredHomework > 0 ? "border-red-200/80 bg-red-50/90" : "border-blue-200/80 bg-blue-50/90"
            }`}>
              <strong className={`block text-3xl font-black ${totalExpiredHomework > 0 ? "text-red-600" : "text-blue-600"}`}>
                {totalExpiredHomework}
              </strong>
              <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{t("statAlerts")}</span>
            </div>
            <Link
              href="/danisan-yolculugu/kayit"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-sm font-black text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <UserPlus className="h-4 w-4" />
              {isDemo ? t("newClientDemo") : t("newClient")}
            </Link>
          </div>
        </header>

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
          desktopClassName="sm:rounded-2xl sm:border sm:border-white/80 sm:bg-white/80 sm:p-8 sm:shadow-lg sm:backdrop-blur-sm"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 shadow-sm">
              <ListFilter className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <p className="text-base font-black text-slate-900">{t("filter.title")}</p>
              <p className="text-xs text-slate-500">{t("filter.subtitle")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Field label={t("filter.searchLabel")}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("filter.searchPlaceholder")}
                className={inputCls}
              />
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
        </DanisanSectionShell>

        {/* Client List */}
        <DanisanSectionShell desktopClassName="sm:rounded-2xl sm:border sm:border-white/80 sm:bg-white/80 sm:p-8 sm:shadow-lg sm:backdrop-blur-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-950">
              {t("listHeader")}
              {!loading && (
                <span className="ml-2 text-base font-bold text-slate-400">({displayCount})</span>
              )}
            </h2>

            {/* Sort selector */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
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
          {!isDemo && !loading && filteredClients.length > 0 && (
            <div className="mb-5">
              <BulkExportBar
                selectedCount={selectedClientIds.size}
                totalCount={total ?? clients.length}
                filteredCount={filteredClients.length}
                hasActiveFilter={hasActiveFilter}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearClientSelection}
                onExportSelected={() => void exportClientsWord("selected")}
                onExportAll={() => void exportClientsWord("all")}
                onExportFiltered={hasActiveFilter ? () => void exportClientsWord("filtered") : undefined}
                isExporting={wordBusy}
                onDeleteSelected={() => void handleBulkDeleteClients()}
                isDeleting={deleteLoading}
                hideWordOnMobile
              />
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
                  isDemo={isDemo}
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
