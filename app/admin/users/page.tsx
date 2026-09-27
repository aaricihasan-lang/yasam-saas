"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ADMIN_MODULE_KIND,
  ADMIN_MODULE_UI_LABELS,
  formatCreatedAt,
  formatDateTimeTr,
  mapDbUser,
  type AdminModuleUiKey,
  type ManagedUser,
  type ManagedUserRole,
} from "@/lib/admin/userManagement";
import {
  DEFAULT_MEMBER_LIST_QUERY,
  MEMBER_LIST_RETURN_KEY,
  MEMBER_PAGE_SIZES,
  memberListQueryToSearch,
  parseMemberCounts,
  parseMemberListQuery,
  type MemberCounts,
  type MemberListQuery,
} from "@/lib/admin/memberListQuery";
import { classifyFetchFailure, FETCH_FAILURE_COPY, type FetchFailureKind } from "@/lib/admin/fetchState";
import { passwordPolicyError } from "@/lib/auth/registerValidation";
import {
  AccountBadge,
  ApprovalBadge,
  PackageBadge,
  PaymentBadge,
  RoleBadge,
  SecurityExemptBadge,
} from "@/components/admin/members/MemberBadges";
import { ModuleCheckboxGrid } from "@/components/admin/members/ModuleCheckboxGrid";
import { clearYasamUser, isAdminUser, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

// ── Filtre seçenekleri (MEM-018: ham enum gösterilmez) ─────────────────────────
const APPROVAL_OPTIONS: { key: MemberListQuery["approval"]; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Onay Bekliyor" },
  { key: "approved", label: "Onaylandı" },
  { key: "rejected", label: "Reddedildi" },
];
const ACTIVE_OPTIONS: { key: MemberListQuery["active"]; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Aktif" },
  { key: "passive", label: "Pasif" },
];
const ROLE_OPTIONS: { key: MemberListQuery["role"]; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "expert", label: "Uzman" },
  { key: "admin", label: "Yönetici" },
];
const PAYMENT_OPTIONS: { key: MemberListQuery["payment"]; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Ödeme Bekliyor" },
  { key: "overdue", label: "Gecikti" },
  { key: "paid", label: "Ödendi" },
  { key: "exempt", label: "Ödemeden Muaf" },
];

function FilterPillRow<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2" role="group" aria-label={label}>
      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500 sm:w-28 sm:shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onSelect(o.key)}
            className={`rounded-full border-2 px-3 py-1.5 text-xs font-black transition ${
              value === o.key
                ? "border-violet-400 bg-violet-100 text-violet-950"
                : "border-slate-200 bg-white text-slate-700 hover:bg-violet-50/80"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const panelClass = "rounded-2xl border border-white/80 bg-white/90 p-4 shadow-md backdrop-blur-sm sm:p-6";
const inputClass =
  "mt-2 h-12 w-full rounded-2xl border-2 border-indigo-100 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";
const labelClass = "block text-sm font-black text-slate-700";
const navBtn =
  "inline-flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl border-2 px-4 sm:px-5 text-sm font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

function PastelLoader({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16" role="status" aria-live="polite">
      <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      <p className="text-sm font-bold text-slate-600">{label}</p>
    </div>
  );
}

function ErrorPanel({ kind, onRetry }: { kind: FetchFailureKind; onRetry?: () => void }) {
  const copy = FETCH_FAILURE_COPY[kind];
  return (
    <div className={`${panelClass} border-rose-200 text-center`} role="alert">
      <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" aria-hidden />
      <p className="mt-2 text-base font-black text-rose-950">{copy.title}</p>
      <p className="mt-1 text-sm font-medium text-slate-600">{copy.message}</p>
      {copy.retry && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border-2 border-rose-200 bg-white px-4 text-sm font-black text-rose-900 hover:bg-rose-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Tekrar Dene
        </button>
      ) : null}
    </div>
  );
}

function UsersTopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav
      className="sticky top-0 z-50 mb-6 rounded-2xl border border-white/80 bg-gradient-to-r from-rose-100/90 via-violet-100/85 to-sky-100/90 p-2 shadow-md backdrop-blur-xl sm:p-3"
      aria-label="Üst navigasyon"
    >
      <div className="flex flex-col gap-1.5 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-3">
        <Link
          href="/"
          className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 no-underline lg:justify-self-start`}
        >
          Ana Panele Dön
        </Link>
        <Link
          href="/admin"
          className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 no-underline lg:justify-self-center`}
        >
          Yönetim Merkezi
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 lg:justify-self-end`}
        >
          Çıkış Yap
        </button>
      </div>
    </nav>
  );
}

/**
 * Sayaçlar: uzmanlar dört gruba BÖLÜMLENİR (kesişim yok):
 * Onay Bekleyen + Onaylı · Aktif + Arşiv (Onaylı · Pasif) + Reddedilen = Toplam Uzman.
 * Yöneticiler ayrı sayılır. Kartlar ilgili filtreyi uygular.
 */
function CountCard({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | null;
  hint?: string;
  tone: "violet" | "amber" | "emerald" | "slate" | "rose" | "sky";
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    violet: "border-violet-200 from-violet-50/95 to-fuchsia-50/70",
    amber: "border-amber-200 from-amber-50/95 to-orange-50/70",
    emerald: "border-emerald-200 from-emerald-50/95 to-teal-50/70",
    slate: "border-slate-200 from-slate-50/95 to-slate-100/80",
    rose: "border-rose-200 from-rose-50/95 to-orange-50/60",
    sky: "border-sky-200 from-sky-50/95 to-indigo-50/60",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border bg-gradient-to-br via-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${tones[tone]} ${
        active ? "ring-2 ring-violet-400" : ""
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-950 sm:text-3xl">{value ?? "—"}</p>
      {hint ? <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{hint}</p> : null}
    </button>
  );
}

function CompactUserRow({ user, suspiciousCount }: { user: ManagedUser; suspiciousCount: number }) {
  return (
    <article
      className={`flex min-w-0 flex-col gap-3 rounded-2xl border-2 border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm transition hover:border-violet-200/80 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5 ${
        !user.active ? "bg-slate-50/90" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-base font-black text-slate-900 sm:text-lg" title={user.fullName}>
            {user.fullName}
          </p>
          {suspiciousCount > 0 ? (
            <span
              title={`${suspiciousCount} şüpheli güvenlik olayı`}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${
                suspiciousCount >= 3 ? "bg-rose-100 text-rose-900 ring-rose-300" : "bg-amber-100 text-amber-900 ring-amber-300"
              }`}
            >
              ⚠ {suspiciousCount}
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm font-medium text-slate-600" title={user.email}>
          {user.email}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <RoleBadge role={user.role} />
          {user.role === "expert" ? <ApprovalBadge status={user.approvalStatus} /> : null}
          <AccountBadge active={user.active} />
          {user.role === "expert" ? <PackageBadge label={user.membershipDisplay.packageLabel} /> : null}
          {user.role === "expert" ? <PaymentBadge status={user.payment.status} /> : null}
          {user.licenseSettings.securityExempt ? <SecurityExemptBadge /> : null}
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">Kayıt: {formatCreatedAt(user.createdAt)}</p>
      </div>
      <Link
        href={`/admin/users/${encodeURIComponent(user.id)}`}
        className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-violet-300/90 bg-gradient-to-r from-violet-50 to-indigo-50 px-5 text-sm font-black text-violet-950 no-underline transition hover:border-violet-400 hover:from-violet-100 sm:w-auto"
        aria-label={`${user.fullName} detayı`}
      >
        Detay
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

type DeactivationInfo = { at: string | null; byId: string | null; byName: string | null; actorIsMainAdmin: boolean };

function ArchiveUserRow({
  user,
  deactivation,
  onReactivate,
  reactivating,
}: {
  user: ManagedUser;
  deactivation?: DeactivationInfo;
  onReactivate: (user: ManagedUser) => void;
  reactivating: boolean;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-2xl border-2 border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm transition hover:border-amber-200/80 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-base font-black text-slate-900 sm:text-lg" title={user.fullName}>
            {user.fullName}
          </p>
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-950 ring-1 ring-amber-200">
            Arşivde · Onaylı · Pasif
          </span>
        </div>
        <p className="truncate text-sm font-medium text-slate-600" title={user.email}>
          {user.email}
        </p>
        <div className="mt-2 grid gap-0.5 text-xs font-semibold text-slate-500">
          <span>
            Pasife alınma: <span className="text-slate-700">{deactivation?.at ? formatDateTimeTr(deactivation.at) : "Kayıt bulunamadı"}</span>
          </span>
          <span>
            İşlemi yapan: <span className="text-slate-700">{deactivation?.byName ?? "Kayıt bulunamadı"}</span>
          </span>
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => onReactivate(user)}
          disabled={reactivating}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-emerald-300/90 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 text-sm font-black text-emerald-950 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reactivating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
          Yeniden Aktifleştir
        </button>
        <Link
          href={`/admin/users/${encodeURIComponent(user.id)}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-violet-300/90 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 text-sm font-black text-violet-950 no-underline transition hover:border-violet-400"
          aria-label={`${user.fullName} detayı`}
        >
          Detay
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

type CreateForm = { fullName: string; email: string; password: string; role: ManagedUserRole };
const emptyCreateForm: CreateForm = { fullName: "", email: "", password: "", role: "expert" };

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-1) */
function adminHeaders(adminId: string, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; users: ManagedUser[]; total: number; suspicious: Record<string, number> }
  | { kind: "error"; failure: FetchFailureKind };

type ArchiveState =
  | { kind: "loading" }
  | { kind: "ready"; users: ManagedUser[]; deactivations: Record<string, DeactivationInfo> }
  | { kind: "error"; failure: FetchFailureKind };

/** İstek anahtarına bağlı sonuç: anahtar değişince türetilmiş durum otomatik "loading" olur. */
type Keyed<T> = { key: string; state: T };

// localStorage oturumu — useSyncExternalStore (SSR'da null; hydration uyumsuzluğu yok).
const noopSubscribe = () => () => {};
const readStoredUserRaw = () => {
  try {
    return localStorage.getItem("yasam_user");
  } catch {
    return null;
  }
};
const serverUserRaw = () => null;

function AdminUsersContent() {
  useBfcacheRefresh();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const parsedQuery = parseMemberListQuery(searchParams);
  const query: MemberListQuery = parsedQuery.ok ? parsedQuery.value : DEFAULT_MEMBER_LIST_QUERY;
  const queryKey = memberListQueryToSearch(query);

  // Oturum: localStorage (yalnız istemci) → useSyncExternalStore; ham değer stabil string.
  const storedUserRaw = useSyncExternalStore(noopSubscribe, readStoredUserRaw, serverUserRaw);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const sessionUser = useMemo(() => (storedUserRaw ? readYasamUser() : null), [storedUserRaw]);
  const sessionChecked = hydrated;
  const allowed = isAdminUser(sessionUser);
  const currentUserId = sessionUser?.id ?? "";

  const [reloadTick, setReloadTick] = useState(0);
  const requestKey = `${queryKey}|${query.view}|${reloadTick}`;
  const [listResult, setListResult] = useState<Keyed<ListState> | null>(null);
  const [archiveResult, setArchiveResult] = useState<Keyed<ArchiveState> | null>(null);
  const list: ListState = listResult && listResult.key === requestKey ? listResult.state : { kind: "loading" };
  const archive: ArchiveState =
    archiveResult && archiveResult.key === requestKey ? archiveResult.state : { kind: "loading" };
  const [counts, setCounts] = useState<MemberCounts | null>(null);

  // Arama kutusu ↔ URL: geri/ileri ile q değişince kutu, render sırasında senkronlanır
  // (React "state'i render'da ayarla" deseni; effect içinde setState yok).
  // Yarış koruması: kutunun KENDİ gönderdiği (debounce) q değerleri `ownQs`'te tutulur; bu
  // gezinmeler geç tamamlansa bile kullanıcının o arada yazdığı metni EZMEZ. Yalnız dış
  // değişiklik (Geri/İleri, Filtreleri Temizle) kutuyu günceller ve listeyi sıfırlar.
  const [searchText, setSearchText] = useState(query.q);
  const [syncedQ, setSyncedQ] = useState(query.q);
  const [ownQs, setOwnQs] = useState<string[]>([]);
  if (syncedQ !== query.q) {
    setSyncedQ(query.q);
    if (!ownQs.includes(query.q)) {
      setSearchText(query.q);
      setOwnQs([]);
    }
  }
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreateForm);
  const [formModules, setFormModules] = useState<Set<AdminModuleUiKey>>(() => new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string>("");

  // Geçmiş davranışı: filtre / sayfa / sayfa boyutu / sekme / temizle → router.push (tarayıcı
  // Geri/İleri her adımı geri getirir). Arama yazımı: bir yazma oturumunun İLK değişikliği push,
  // aynı oturumdaki sonraki tuşlar replace → tek arama = tek geçmiş adımı (tuş başına kayıt yok).
  const searchHistoryMode = useRef<"push" | "replace">("push");
  const setQuery = useCallback(
    (patch: Partial<MemberListQuery>, mode: "push" | "replace" = "push") => {
      const next: MemberListQuery = { ...query, ...patch };
      const qs = memberListQueryToSearch(next);
      if (qs === memberListQueryToSearch(query)) return;
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [query, router, pathname],
  );
  const navigate = useCallback(
    (patch: Partial<MemberListQuery>) => {
      searchHistoryMode.current = "push";
      setQuery(patch, "push");
    },
    [setQuery],
  );

  // Yazarken 350 ms debounce → URL (q) güncellenir; sayfa 1'e döner.
  useEffect(() => {
    if (searchText.trim() === query.q) return;
    const t = setTimeout(() => {
      const mode = searchHistoryMode.current;
      const nextQ = searchText.trim();
      searchHistoryMode.current = "replace";
      setOwnQs((prev) => [...prev.slice(-4), nextQ]);
      setQuery({ q: nextQ, page: 1 }, mode);
    }, 350);
    return () => clearTimeout(t);
  }, [searchText, query.q, setQuery]);

  // Detaydan "Üye Listesine Dön" aynı filtre/sayfaya döner (sekme-yerel; yalnız doğrulanmış sorgu).
  useEffect(() => {
    try {
      window.sessionStorage.setItem(MEMBER_LIST_RETURN_KEY, queryKey);
    } catch {
      /* depolama kapalı → dönüş düz listeye */
    }
  }, [queryKey]);

  // Liste (sunucu tarafı sayfalama) — URL durumu değişince; yarışlar AbortController ile iptal.
  useEffect(() => {
    if (!sessionChecked || !allowed || !currentUserId) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams(queryKey);
    params.set("pageSize", String(query.pageSize));
    if (query.view === "archive") params.set("view", "archive");
    const key = requestKey;
    const setList = (state: ListState) => setListResult({ key, state });
    fetch(`/api/admin/users?${params.toString()}`, { headers: adminHeaders(currentUserId), signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          setList({ kind: "error", failure: classifyFetchFailure(res.status) });
          return;
        }
        const json = (await res.json()) as {
          users?: Record<string, unknown>[];
          total?: number;
          counts?: unknown;
          suspiciousCounts?: Record<string, number>;
        };
        setCounts(parseMemberCounts(json.counts));
        setList({
          kind: "ready",
          users: (json.users ?? []).map((row) => mapDbUser(row)),
          total: Math.max(0, Number(json.total) || 0),
          suspicious: json.suspiciousCounts ?? {},
        });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setList({ kind: "error", failure: "network" });
      });
    return () => ctrl.abort();
  }, [sessionChecked, allowed, currentUserId, queryKey, query.pageSize, query.view, requestKey]);

  // Arşiv satırları (pasife alınma tarih + aktör) — yalnız arşiv görünümünde.
  useEffect(() => {
    if (!sessionChecked || !allowed || !currentUserId || query.view !== "archive") return;
    const ctrl = new AbortController();
    const key = requestKey;
    const setArchive = (state: ArchiveState) => setArchiveResult({ key, state });
    fetch("/api/admin/users/archive", { headers: adminHeaders(currentUserId), signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          setArchive({ kind: "error", failure: classifyFetchFailure(res.status) });
          return;
        }
        const json = (await res.json()) as { users?: Record<string, unknown>[]; deactivations?: Record<string, DeactivationInfo> };
        setArchive({ kind: "ready", users: (json.users ?? []).map((r) => mapDbUser(r)), deactivations: json.deactivations ?? {} });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setArchive({ kind: "error", failure: "network" });
      });
    return () => ctrl.abort();
  }, [sessionChecked, allowed, currentUserId, query.view, requestKey]);

  const totalPages = list.kind === "ready" ? Math.max(1, Math.ceil(list.total / query.pageSize)) : 1;
  const activeFilterCount = [query.approval, query.active, query.role, query.payment].filter((v) => v !== "all").length;
  const formHasModule = useMemo(() => [...formModules].some((k) => ADMIN_MODULE_KIND[k] === "module"), [formModules]);

  async function reactivateUser(target: ManagedUser) {
    setReactivatingId(target.id);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(target.id)}/status`, {
      method: "POST",
      headers: adminHeaders(currentUserId, true),
      body: JSON.stringify({ action: "toggle_active", currentActive: false }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : {};
    setReactivatingId("");
    if (!res || !res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Yeniden aktifleştirilemedi.", type: "error" });
      return;
    }
    showToast({
      title: "Yeniden aktifleştirildi",
      message: `${target.fullName} aktif üyelere döndü. Eski oturumlar kapalıdır; yeniden giriş yapması gerekir.`,
      type: "success",
    });
    setReloadTick((n) => n + 1);
  }

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password.trim();
    if (!fullName || !email || !password) {
      showToast({ title: "Eksik bilgi", message: "Ad soyad, e-posta ve şifre zorunludur.", type: "error" });
      return;
    }
    if (passwordPolicyError(password, email)) {
      showToast({ title: "Zayıf şifre", message: "Şifre en az 8 karakter olmalı; en az bir harf ve bir rakam içermelidir.", type: "error" });
      return;
    }
    if (form.role === "expert" && !formHasModule) {
      showToast({ title: "Modül seçin", message: "Yeni uzman için en az bir modül seçmelisiniz.", type: "error" });
      return;
    }
    setCreating(true);
    const modules = form.role === "expert" ? [...formModules] : [];
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: adminHeaders(currentUserId, true),
      body: JSON.stringify({ fullName, email, password, role: form.role, modules }),
    }).catch(() => null);
    const json = res
      ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; moduleCount?: number })
      : {};
    setCreating(false);
    if (!res || !res.ok || !json.ok) {
      showToast({
        title: "Kayıt oluşturulamadı",
        message: json.error ?? (res ? "Kayıt tamamlanamadı." : "Sunucuya ulaşılamadı."),
        type: "error",
      });
      return;
    }
    setForm(emptyCreateForm);
    setFormModules(new Set());
    setFormOpen(false);
    showToast({
      title: form.role === "expert" ? "Uzman oluşturuldu" : "Yönetici oluşturuldu",
      message:
        form.role === "expert"
          ? `Hesap onaylı, aktif ve Premium. ${json.moduleCount ?? modules.length} modül erişime açıldı: ${modules
              .filter((k) => ADMIN_MODULE_KIND[k] === "module")
              .map((k) => ADMIN_MODULE_UI_LABELS[k])
              .join(", ")}.`
          : "Yönetici hesabı oluşturuldu.",
      type: "success",
    });
    setReloadTick((n) => n + 1);
  }

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <PastelLoader label="Oturum kontrol ediliyor…" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black">Erişim reddedildi</h1>
          <p className="mt-2 text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
          <Link href="/" className="mt-6 inline-block font-black text-violet-700 no-underline">
            Ana panele dön
          </Link>
        </div>
      </main>
    );
  }

  const isArchive = query.view === "archive";
  const from = list.kind === "ready" && list.total > 0 ? (query.page - 1) * query.pageSize + 1 : 0;
  const to = list.kind === "ready" ? Math.min(list.total, query.page * query.pageSize) : 0;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <UsersTopNav onLogout={handleLogout} />

        <header className="relative mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r from-slate-900 via-violet-900 to-slate-800 px-5 py-5 text-white shadow-[0_16px_48px_rgba(88,28,135,0.18)] sm:px-8 sm:py-7">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <Users className="h-6 w-6 text-white/90" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">Yönetim · Üye Yönetimi</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Üye Yönetimi</h1>
              <p className="mt-1 text-sm font-medium text-white/70">
                Uzman ve yönetici hesapları. Onay, modül erişimi ve güvenlik ayarları üye detayında yönetilir.
              </p>
            </div>
          </div>
        </header>

        {/* Sayaçlar — uzmanlar için kesişimsiz bölümleme */}
        <section aria-label="Üye sayıları" className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 sm:gap-3">
          <CountCard label="Toplam Uzman" value={counts?.experts_total ?? null} tone="violet"
            active={!isArchive && query.role === "expert" && query.approval === "all" && query.active === "all"}
            onClick={() => navigate({ view: "members", role: "expert", approval: "all", active: "all", payment: "all", page: 1 })} />
          <CountCard label="Onay Bekleyen" value={counts?.pending ?? null} tone="amber"
            active={!isArchive && query.approval === "pending"}
            onClick={() => navigate({ view: "members", role: "expert", approval: "pending", active: "all", payment: "all", page: 1 })} />
          <CountCard label="Onaylı · Aktif" value={counts?.approved_active ?? null} tone="emerald"
            active={!isArchive && query.approval === "approved" && query.active === "active"}
            onClick={() => navigate({ view: "members", role: "expert", approval: "approved", active: "active", payment: "all", page: 1 })} />
          <CountCard label="Arşiv" hint="Onaylı · Pasif" value={counts?.archived ?? null} tone="slate"
            active={isArchive}
            onClick={() => navigate({ ...DEFAULT_MEMBER_LIST_QUERY, view: "archive" })} />
          <CountCard label="Reddedilen" value={counts?.rejected ?? null} tone="rose"
            active={!isArchive && query.approval === "rejected"}
            onClick={() => navigate({ view: "members", role: "expert", approval: "rejected", active: "all", payment: "all", page: 1 })} />
          <CountCard label="Yönetici" value={counts?.admins ?? null} tone="sky"
            active={!isArchive && query.role === "admin"}
            onClick={() => navigate({ view: "members", role: "admin", approval: "all", active: "all", payment: "all", page: 1 })} />
        </section>
        <p className="mb-5 text-[11px] font-semibold text-slate-500">
          Her uzman yalnızca bir gruptadır: Onay Bekleyen + Onaylı · Aktif + Arşiv + Reddedilen = Toplam Uzman.
          Yöneticiler ayrı sayılır.
        </p>

        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Görünüm">
          <button type="button" role="tab" aria-selected={!isArchive}
            onClick={() => navigate({ ...DEFAULT_MEMBER_LIST_QUERY })}
            className={`inline-flex h-11 items-center gap-2 rounded-xl border-2 px-4 text-sm font-black transition ${
              !isArchive ? "border-violet-400 bg-violet-100 text-violet-950" : "border-slate-200 bg-white text-slate-700 hover:bg-violet-50/80"
            }`}>
            <Users className="h-4 w-4" aria-hidden />
            Üyeler
          </button>
          <button type="button" role="tab" aria-selected={isArchive}
            onClick={() => navigate({ ...DEFAULT_MEMBER_LIST_QUERY, view: "archive" })}
            className={`inline-flex h-11 items-center gap-2 rounded-xl border-2 px-4 text-sm font-black transition ${
              isArchive ? "border-amber-400 bg-amber-100 text-amber-950" : "border-slate-200 bg-white text-slate-700 hover:bg-amber-50/80"
            }`}>
            <Archive className="h-4 w-4" aria-hidden />
            Arşiv{counts ? ` (${counts.archived})` : ""}
          </button>
        </div>

        {!isArchive ? (
          <>
            <section className={`${panelClass} mb-6 border-indigo-200/80`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-indigo-950">Yeni Uzman Ekle</h2>
                  <p className="text-sm font-medium text-slate-600">
                    Yönetici tarafından eklenen uzman doğrudan onaylı, aktif ve Premium olur; yalnız seçilen modüllere erişir.
                  </p>
                </div>
                <button type="button" onClick={() => setFormOpen((o) => !o)} aria-expanded={formOpen}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-violet-300 bg-violet-50 px-4 text-sm font-black text-violet-950">
                  {formOpen ? <ChevronDown className="h-4 w-4 rotate-180" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                  {formOpen ? "Formu Kapat" : "Yeni Uzman"}
                </button>
              </div>
              {formOpen ? (
                <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
                  <label className="block sm:col-span-2" htmlFor="create-name">
                    <span className={labelClass}>Ad Soyad</span>
                    <input id="create-name" className={inputClass} autoComplete="off" value={form.fullName} maxLength={120}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
                  </label>
                  <label className="block" htmlFor="create-email">
                    <span className={labelClass}>E-posta</span>
                    <input id="create-email" type="email" className={inputClass} autoComplete="off" value={form.email} maxLength={254}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  </label>
                  <label className="block" htmlFor="create-password">
                    <span className={labelClass}>Geçici Şifre</span>
                    <input id="create-password" type="password" className={inputClass} autoComplete="new-password" value={form.password}
                      aria-describedby="create-password-hint"
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                    <span id="create-password-hint" className="mt-1 block text-xs font-medium text-slate-500">
                      En az 8 karakter; en az bir harf ve bir rakam.
                    </span>
                  </label>
                  <label className="block" htmlFor="create-role">
                    <span className={labelClass}>Hesap Türü</span>
                    <select id="create-role" className={inputClass} value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as ManagedUserRole }))}>
                      <option value="expert">Uzman</option>
                      <option value="admin">Yönetici (yalnız ana yönetici)</option>
                    </select>
                  </label>
                  {form.role === "expert" ? (
                    <fieldset className="sm:col-span-2">
                      <legend className={labelClass}>
                        Açılacak Modüller{" "}
                        <span className="font-bold text-slate-500">
                          ({[...formModules].filter((k) => ADMIN_MODULE_KIND[k] === "module").length} seçili)
                        </span>
                      </legend>
                      <div className="mt-2">
                        <ModuleCheckboxGrid
                          idPrefix="create-module"
                          selected={formModules}
                          disabled={creating}
                          onToggle={(k) =>
                            setFormModules((prev) => {
                              const n = new Set(prev);
                              if (n.has(k)) n.delete(k);
                              else n.add(k);
                              return n;
                            })
                          }
                        />
                      </div>
                      {!formHasModule ? (
                        <p className="mt-2 text-xs font-bold text-amber-800">En az bir modül seçmelisiniz.</p>
                      ) : null}
                    </fieldset>
                  ) : null}
                  <div className="sm:col-span-2">
                    <button type="submit" disabled={creating || (form.role === "expert" && !formHasModule)}
                      className="inline-flex h-12 w-full items-center justify-center rounded-2xl border-2 border-emerald-600 bg-emerald-600 px-8 text-base font-black text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                      {creating ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                          Oluşturuluyor…
                        </span>
                      ) : form.role === "expert" ? "Uzmanı Oluştur ve Onayla" : "Yöneticiyi Oluştur"}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>

            <section className={`${panelClass} mb-4 border-slate-200/80`} aria-label="Arama ve filtreler">
              <label className="relative block" htmlFor="member-search">
                <span className="sr-only">Üye ara</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input id="member-search" type="search" value={searchText} maxLength={120}
                  onChange={(e) => setSearchText(e.target.value)}
                  onBlur={() => { searchHistoryMode.current = "push"; }}
                  placeholder="Ad, e-posta veya rol (ör. uzman, yönetici) ara…"
                  className="h-12 w-full rounded-2xl border-2 border-indigo-100 bg-white py-3 pl-12 pr-4 text-base font-semibold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" />
              </label>
              <div className="mt-3 space-y-2.5">
                <FilterPillRow label="Onay Durumu" options={APPROVAL_OPTIONS} value={query.approval}
                  onSelect={(approval) => navigate({ approval, page: 1 })} />
                <FilterPillRow label="Hesap Durumu" options={ACTIVE_OPTIONS} value={query.active}
                  onSelect={(active) => navigate({ active, page: 1 })} />
                <FilterPillRow label="Rol" options={ROLE_OPTIONS} value={query.role}
                  onSelect={(role) => navigate({ role, page: 1 })} />
                <FilterPillRow label="Ödeme" options={PAYMENT_OPTIONS} value={query.payment}
                  onSelect={(payment) => navigate({ payment, page: 1 })} />
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-bold text-slate-500">
                    {activeFilterCount > 0 ? `${activeFilterCount} filtre aktif` : "Filtre yok"} · Arşivdeki uzmanlar “Arşiv” sekmesindedir.
                  </span>
                  <button type="button"
                    onClick={() => { setSearchText(""); navigate({ ...DEFAULT_MEMBER_LIST_QUERY, pageSize: query.pageSize }); }}
                    disabled={activeFilterCount === 0 && query.q === ""}
                    className="rounded-full border-2 border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                    Filtreleri Temizle
                  </button>
                </div>
              </div>
            </section>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Users className="h-4 w-4 text-violet-600" aria-hidden />
                Üye Listesi
                {list.kind === "ready" ? (
                  <span className="text-sm font-bold text-slate-500" aria-live="polite">
                    ({list.total === 0 ? "0 sonuç" : `${list.total} sonuçtan ${from}–${to}`})
                  </span>
                ) : null}
              </h2>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600" htmlFor="page-size">
                Sayfa başına
                <select id="page-size" value={query.pageSize}
                  onChange={(e) => navigate({ pageSize: Number(e.target.value) as MemberListQuery["pageSize"], page: 1 })}
                  className="h-9 rounded-xl border-2 border-slate-200 bg-white px-2 text-sm font-bold">
                  {MEMBER_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>

            {list.kind === "loading" ? (
              <PastelLoader label="Üyeler yükleniyor…" />
            ) : list.kind === "error" ? (
              <ErrorPanel kind={list.failure} onRetry={() => setReloadTick((n) => n + 1)} />
            ) : list.users.length === 0 ? (
              <div className={`${panelClass} border-dashed text-center text-slate-600`}>
                <p className="font-black text-slate-800">
                  {query.q || activeFilterCount > 0 ? "Bu arama/filtrelerle eşleşen üye yok." : "Henüz üye yok."}
                </p>
                {query.q || activeFilterCount > 0 ? (
                  <p className="mt-1 text-sm">Arama metnini veya filtreleri değiştirmeyi deneyin.</p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3">
                {list.users.map((user) => (
                  <CompactUserRow key={user.id} user={user} suspiciousCount={list.suspicious[user.id] ?? 0} />
                ))}
              </div>
            )}

            {list.kind === "ready" && list.total > query.pageSize ? (
              <nav className="mt-4 flex flex-wrap items-center justify-center gap-2" aria-label="Sayfalama">
                <button type="button" disabled={query.page <= 1} onClick={() => navigate({ page: query.page - 1 })}
                  className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Önceki
                </button>
                <span className="text-sm font-bold text-slate-600" aria-current="page">
                  Sayfa {query.page} / {totalPages}
                </span>
                <button type="button" disabled={query.page >= totalPages} onClick={() => navigate({ page: query.page + 1 })}
                  className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-black text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                  Sonraki
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </nav>
            ) : null}
          </>
        ) : (
          <>
            <div className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-black text-amber-950">
                <Archive className="h-4 w-4" aria-hidden />
                Arşiv — Onaylı ancak pasife alınmış uzmanlar
              </h2>
              <p className="mt-1 text-sm font-medium text-amber-900/80">
                Hesap, veriler ve modül izinleri korunur (kalıcı silme yoktur). Açık oturumları kapatılmıştır;
                yeniden aktifleştirilen uzman tekrar giriş yapar. Onay bekleyen ve reddedilen başvurular arşivde gösterilmez.
              </p>
            </div>

            {archive.kind === "loading" ? (
              <PastelLoader label="Arşiv yükleniyor…" />
            ) : archive.kind === "error" ? (
              <ErrorPanel kind={archive.failure} onRetry={() => setReloadTick((n) => n + 1)} />
            ) : archive.users.length === 0 ? (
              <div className={`${panelClass} border-dashed text-center text-slate-600`}>Arşivde uzman bulunmuyor.</div>
            ) : (
              <div className="grid gap-3">
                {archive.users.map((user) => (
                  <ArchiveUserRow key={user.id} user={user} deactivation={archive.deactivations[user.id]}
                    onReactivate={reactivateUser} reactivating={reactivatingId === user.id} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
          <PastelLoader label="Yükleniyor…" />
        </main>
      }
    >
      <AdminUsersContent />
    </Suspense>
  );
}
