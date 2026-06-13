"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  formatCreatedAt,
  mapDbUser,
  sortUsersForAdmin,
  type ApprovalStatusUi,
  type ManagedUser,
  type ManagedUserRole,
  type PaymentStatusUi,
} from "@/lib/admin/userManagement";
import {
  createTenantForNewUser,
  deleteTenantById,
} from "@/lib/auth/createExpertTenant";
import { DEFAULT_MODULE_PERMISSIONS } from "@/lib/auth/modulePermissions";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

type UserListFilter =
  | "all"
  | "pending"
  | "active"
  | "passive"
  | "admin"
  | "expert"
  | "payment_pending"
  | "payment_overdue"
  | "payment_paid";

const USER_LIST_FILTERS: { key: UserListFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Onay Bekleyen" },
  { key: "active", label: "Aktif" },
  { key: "passive", label: "Pasif" },
  { key: "admin", label: "Admin" },
  { key: "expert", label: "Uzman" },
  { key: "payment_pending", label: "Ödeme Bekleyen" },
  { key: "payment_overdue", label: "Geciken Ödeme" },
  { key: "payment_paid", label: "Ödendi" },
];

function matchesUserSearch(user: ManagedUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${user.fullName} ${user.email} ${user.role}`.toLowerCase();
  return haystack.includes(q);
}

function matchesUserListFilter(user: ManagedUser, filter: UserListFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return user.approvalStatus === "pending";
    case "active":
      return user.active && user.approvalStatus === "approved";
    case "passive":
      return !user.active;
    case "admin":
      return user.role === "admin";
    case "expert":
      return user.role === "expert";
    case "payment_pending":
      return user.payment.status === "pending";
    case "payment_overdue":
      return user.payment.status === "overdue";
    case "payment_paid":
      return user.payment.status === "paid";
    default:
      return true;
  }
}

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const inputClass =
  "mt-2 h-14 w-full rounded-2xl border-2 border-indigo-100 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

const labelClass = "block text-sm font-black text-slate-700";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px]";

const saveBtnClass =
  "inline-flex h-14 w-full items-center justify-center rounded-2xl border-2 border-violet-400 bg-gradient-to-r from-violet-100 via-fuchsia-100 to-rose-100 px-8 text-base font-black text-violet-950 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50";

function PastelLoader({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16" role="status">
      <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      <p className="text-sm font-bold text-slate-600">{label}</p>
    </div>
  );
}

function UsersTopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav
      className="sticky top-0 z-50 mb-8 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-rose-100/90 via-violet-100/85 to-sky-100/90 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-4"
      aria-label="Üst navigasyon"
    >
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-stretch lg:gap-4">
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
          Admin Yönetim Merkezi
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

function SummaryStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "violet" | "amber" | "emerald" | "slate";
}) {
  const tones = {
    violet: "border-violet-200/90 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/80",
    amber: "border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/70",
    emerald:
      "border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/70",
    slate: "border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-slate-100/80",
  };
  return (
    <div className={`rounded-[24px] border-2 p-5 shadow-sm sm:p-6 ${tones[tone]}`}>
      <p className="text-sm font-black uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-2 text-4xl font-black tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function RoleBadge({ role }: { role: ManagedUserRole }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase ${
        isAdmin
          ? "bg-violet-100 text-violet-900 ring-1 ring-violet-200"
          : "bg-sky-100 text-sky-900 ring-1 ring-sky-200"
      }`}
    >
      {isAdmin ? "admin" : "expert"}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${
        active
          ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
          : "bg-slate-200 text-slate-700 ring-1 ring-slate-300"
      }`}
    >
      {active ? "Aktif" : "Pasif"}
    </span>
  );
}

function ApprovalBadge({ status }: { status: ApprovalStatusUi }) {
  const styles =
    status === "approved"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : status === "rejected"
        ? "bg-rose-100 text-rose-900 ring-rose-200"
        : "bg-amber-100 text-amber-900 ring-amber-200";
  const label =
    status === "approved"
      ? "Onaylı"
      : status === "rejected"
        ? "Reddedildi"
        : "Onay Bekliyor";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1 ${styles}`}>
      {label}
    </span>
  );
}

function PackageBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-950 ring-1 ring-amber-200">
      {label}
    </span>
  );
}

const PAYMENT_BADGE_STYLES: Record<PaymentStatusUi, string> = {
  paid: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  pending: "bg-amber-100 text-amber-900 ring-amber-200",
  overdue: "bg-rose-100 text-rose-900 ring-rose-200",
  exempt: "bg-sky-100 text-sky-900 ring-sky-200",
  unknown: "bg-slate-100 text-slate-700 ring-slate-200",
};

function PaymentBadge({ status, label }: { status: PaymentStatusUi; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1 ${PAYMENT_BADGE_STYLES[status]}`}
    >
      {label}
    </span>
  );
}

function CompactUserRow({ user }: { user: ManagedUser }) {
  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl border-2 border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm transition hover:border-violet-200/80 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5 ${
        !user.active ? "opacity-75" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-black text-slate-900 sm:text-lg">
          {user.fullName}
        </p>
        <p className="truncate text-sm font-medium text-slate-600">{user.email}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <RoleBadge role={user.role} />
          <ApprovalBadge status={user.approvalStatus} />
          <StatusBadge active={user.active} />
          <PackageBadge label={user.membershipDisplay.packageLabel} />
          <PaymentBadge
            status={user.payment.status}
            label={user.payment.statusLabel}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          Kayıt: {formatCreatedAt(user.createdAt)}
        </p>
      </div>
      <Link
        href={`/admin/users/${encodeURIComponent(user.id)}`}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-violet-300/90 bg-gradient-to-r from-violet-50 to-indigo-50 px-5 text-sm font-black text-violet-950 no-underline transition hover:border-violet-400 hover:from-violet-100 sm:w-auto"
      >
        Detay
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

type CreateForm = {
  fullName: string;
  email: string;
  password: string;
  role: ManagedUserRole;
  active: boolean;
};

const emptyCreateForm: CreateForm = {
  fullName: "",
  email: "",
  password: "",
  role: "expert",
  active: true,
};

export default function AdminUsersPage() {
  useBfcacheRefresh();
  const router = useRouter();
  const { showToast } = useToast();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreateForm);
  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [listFilter, setListFilter] = useState<UserListFilter>("all");

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          matchesUserSearch(user, searchQuery) &&
          matchesUserListFilter(user, listFilter),
      ),
    [users, searchQuery, listFilter],
  );

  const stats = useMemo(() => {
    const pending = users.filter((u) => u.approvalStatus === "pending").length;
    const active = users.filter(
      (u) => u.active && u.approvalStatus === "approved",
    ).length;
    const passive = users.filter(
      (u) => !u.active || u.approvalStatus === "rejected",
    ).length;
    return { total: users.length, pending, active, passive };
  }, [users]);

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Kullanıcı listesi hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: error.message,
        type: "error",
      });
      setUsers([]);
      setListLoading(false);
      return;
    }

    const mapped = (data ?? []).map((row) =>
      mapDbUser(row as Record<string, unknown>),
    );
    setUsers(sortUsersForAdmin(mapped));
    setListLoading(false);
  }, [showToast]);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    loadUsers();
  }, [sessionChecked, allowed, loadUsers]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    if (!fullName || !email || !form.password.trim()) {
      showToast({
        title: "İşlem başarısız",
        message: "Ad soyad, e-posta ve şifre zorunludur.",
        type: "error",
      });
      return;
    }
    if (users.some((u) => u.email.toLowerCase() === email)) {
      showToast({
        title: "İşlem başarısız",
        message: "Bu e-posta adresi zaten kayıtlı.",
        type: "error",
      });
      return;
    }

    setCreating(true);

    const tenantResult = await createTenantForNewUser({
      fullName,
      email,
    });

    if (!tenantResult.ok) {
      setCreating(false);
      showToast({
        title: "İşlem başarısız",
        message: "Çalışma alanı oluşturulamadı: " + tenantResult.error,
        type: "error",
      });
      return;
    }

    const tenantId = tenantResult.tenantId;
    const isExpert = form.role === "expert";
    const now = new Date();
    const trialEnds = new Date(now);
    trialEnds.setDate(trialEnds.getDate() + 7);

    const userPayload: Record<string, unknown> = {
      full_name: fullName,
      email,
      password: form.password.trim(),
      role: form.role,
      active: form.active,
      approval_status: form.active ? "approved" : "pending",
      tenant_id: tenantId,
    };

    if (isExpert) {
      userPayload.module_permissions = DEFAULT_MODULE_PERMISSIONS;
      if (form.active) {
        userPayload.plan = "trial";
        userPayload.subscription_status = "trial";
        userPayload.trial_started_at = now.toISOString();
        userPayload.trial_ends_at = trialEnds.toISOString();
      }
    }

    const { error } = await supabase.from("users").insert(userPayload);

    setCreating(false);

    if (error) {
      console.error("Kullanıcı ekleme hatası:", error);
      await deleteTenantById(tenantId);
      showToast({
        title: "İşlem başarısız",
        message: "Kayıt hatası: " + error.message,
        type: "error",
      });
      return;
    }

    setForm(emptyCreateForm);
    setFormOpen(false);
    showToast({ title: "Başarılı", message: "Kullanıcı eklendi.", type: "success" });
    await loadUsers();
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
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
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

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-6 py-6 md:px-10 md:py-8">
        <UsersTopNav onLogout={handleLogout} />

        <header className={`${panelClass} mb-6 border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/70`}>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700">
            Admin · Üye Yönetimi
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
            Kullanıcı / Üye Yönetimi
          </h1>
          <p className="mt-2 text-base font-medium text-slate-600">
            Kısa liste görünümü. Paket, modül ve işlemler için kullanıcı detayına gidin.
          </p>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryStatCard label="Toplam Üye" value={stats.total} tone="violet" />
          <SummaryStatCard label="Onay Bekleyen" value={stats.pending} tone="amber" />
          <SummaryStatCard label="Aktif Üye" value={stats.active} tone="emerald" />
          <SummaryStatCard label="Pasif / Askıda" value={stats.passive} tone="slate" />
        </section>

        <section className={`${panelClass} mb-6 border-indigo-200/80`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-indigo-950">Yeni Uzman Ekle</h2>
              <p className="text-sm font-medium text-slate-600">
                Detaylı ayarlar kayıt sonrası kullanıcı detayında yapılır.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen((o) => !o)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-violet-300 bg-violet-50 px-4 text-sm font-black text-violet-950"
            >
              {formOpen ? (
                <ChevronDown className="h-4 w-4 rotate-180" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              {formOpen ? "Formu Kapat" : "Yeni Uzman"}
            </button>
          </div>
          {formOpen ? (
            <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={labelClass}>Ad Soyad</span>
                <input
                  className={inputClass}
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className={labelClass}>E-posta</span>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Şifre</span>
                <input
                  type="password"
                  className={inputClass}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Rol</span>
                <select
                  className={inputClass}
                  value={form.role}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, role: e.target.value as ManagedUserRole }))
                  }
                >
                  <option value="expert">expert</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <div className="sm:col-span-2">
                <button type="submit" disabled={creating} className={`${saveBtnClass} sm:max-w-xs`}>
                  {creating ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      Kaydediliyor…
                    </span>
                  ) : (
                    "Kaydet"
                  )}
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section className={`${panelClass} mb-4 border-slate-200/80`}>
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ad, e-posta veya rol ara…"
              className="h-12 w-full rounded-2xl border-2 border-indigo-100 bg-white py-3 pl-12 pr-4 text-base font-semibold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {USER_LIST_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setListFilter(key)}
                className={`rounded-full border-2 px-3 py-1.5 text-xs font-black transition ${
                  listFilter === key
                    ? "border-violet-400 bg-violet-100 text-violet-950"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-violet-50/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-slate-900">
          <Users className="h-5 w-5 text-violet-600" aria-hidden />
          Kullanıcı Listesi
          {!listLoading ? (
            <span className="text-sm font-bold text-slate-500">
              ({filteredUsers.length}/{users.length})
            </span>
          ) : null}
        </h2>

        {listLoading ? (
          <PastelLoader label="Kullanıcılar yükleniyor…" />
        ) : filteredUsers.length === 0 ? (
          <div className={`${panelClass} border-dashed text-center text-slate-600`}>
            Sonuç bulunamadı.
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredUsers.map((user) => (
              <CompactUserRow key={user.id} user={user} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
