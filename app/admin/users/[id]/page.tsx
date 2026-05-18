"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Home,
  KeyRound,
  Loader2,
  Package,
  Pencil,
  Shield,
  Trash2,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ADMIN_MODULE_UI_KEYS,
  ADMIN_MODULE_UI_LABELS,
  adminPermissionsToPayload,
  formatCreatedAt,
  isUserPremiumPackage,
  mapDbUser,
  PACKAGE_PLAN_OPTIONS,
  rowHasMembershipColumns,
  type AdminModulePermissions,
  type ApprovalStatusUi,
  type ManagedUser,
  type ManagedUserRole,
} from "@/lib/admin/userManagement";
import {
  buildMembershipUpdatePayload,
  filterMembershipPayloadForRow,
  inferPackagePlanFromSnapshot,
  parseMembershipFromRow,
  type PackagePlanUi,
} from "@/lib/auth/membership";
import { buildPremiumModulePermissionsPayload } from "@/lib/auth/modulePermissions";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const inputClass =
  "mt-2 h-14 w-full rounded-2xl border-2 border-indigo-100 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

const labelClass = "block text-sm font-black text-slate-700";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px]";

const saveBtnClass =
  "inline-flex h-14 items-center justify-center rounded-2xl border-2 border-violet-400 bg-gradient-to-r from-violet-100 via-fuchsia-100 to-rose-100 px-8 text-base font-black text-violet-950 shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";

const actionBtn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50";

type EditForm = {
  fullName: string;
  email: string;
  role: ManagedUserRole;
  active: boolean;
  modulePermissions: AdminModulePermissions;
};

function RoleBadge({ role }: { role: ManagedUserRole }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
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
      className={`rounded-full px-3 py-1 text-xs font-black ${
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
    <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${styles}`}>
      {label}
    </span>
  );
}

function PremiumModuleNotice() {
  return (
    <div className="rounded-2xl border-2 border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-teal-50/80 to-white p-4 md:p-5">
      <p className="text-sm font-black text-emerald-950">Modül İzinleri</p>
      <p className="mt-2 text-sm font-bold leading-relaxed text-emerald-900/95">
        Premium üyelik: Admin hariç tüm modüller otomatik açıktır.
      </p>
    </div>
  );
}

function ModulePermissionSwitches({
  value,
  onChange,
  disabled = false,
}: {
  value: AdminModulePermissions;
  onChange: (next: AdminModulePermissions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border-2 border-violet-100 bg-violet-50/50 p-4 md:p-5">
      <p className="text-sm font-black text-violet-950">Modül İzinleri</p>
      <p className="mt-1 text-xs font-medium text-slate-600">
        Deneme ve Pro paketlerde açık modüller uzman panelinde görünür.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ADMIN_MODULE_UI_KEYS.map((key) => (
          <label
            key={key}
            className={`flex h-16 items-center justify-between gap-4 rounded-xl border border-white/80 bg-white/90 px-4 ${
              disabled ? "opacity-70" : ""
            }`}
          >
            <span className="text-sm font-bold text-slate-800">
              {ADMIN_MODULE_UI_LABELS[key]}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={value[key]}
              disabled={disabled}
              onClick={() => onChange({ ...value, [key]: !value[key] })}
              className={`relative h-10 w-[4.5rem] shrink-0 rounded-full transition disabled:cursor-not-allowed ${
                value[key] ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-8 w-8 rounded-full bg-white shadow-md transition ${
                  value[key] ? "left-[calc(100%-2.25rem)]" : "left-1"
                }`}
              />
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}

function ModulePermissionCard({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <div
      className={`flex min-h-[80px] flex-col justify-between rounded-2xl border-2 px-4 py-3 ${
        enabled
          ? "border-emerald-200/90 bg-emerald-50/80"
          : "border-slate-200/90 bg-slate-50/80"
      }`}
    >
      <p className="text-sm font-black text-slate-900">{label}</p>
      <span
        className={`mt-2 inline-flex w-fit rounded-full px-3 py-1 text-xs font-black ${
          enabled ? "bg-emerald-500 text-white" : "bg-slate-300 text-slate-800"
        }`}
      >
        {enabled ? "Açık" : "Kapalı"}
      </span>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";
  const { showToast } = useToast();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [user, setUser] = useState<ManagedUser | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);
  const [savingModules, setSavingModules] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const [packagePlan, setPackagePlan] = useState<PackagePlanUi | "">("");
  const [canPersistModulePermissions, setCanPersistModulePermissions] =
    useState(true);
  const [canPersistMembership, setCanPersistMembership] = useState(true);
  const [membershipSampleRow, setMembershipSampleRow] = useState<Record<
    string,
    unknown
  > | null>(null);

  const loadUser = useCallback(async () => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) {
      console.error("Kullanıcı detay hatası:", error);
      setUser(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const row = data as Record<string, unknown>;
    setMembershipSampleRow(row);
    setCanPersistModulePermissions("module_permissions" in row);
    setCanPersistMembership(rowHasMembershipColumns(row));

    const mapped = mapDbUser(row);
    setUser(mapped);
    setPackagePlan(inferPackagePlanFromSnapshot(mapped.membership));
    setNotFound(false);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setCurrentAdminId(session?.id ?? null);
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    loadUser();
  }, [sessionChecked, allowed, loadUser]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  function isSelf(): boolean {
    return Boolean(user && currentAdminId && user.id === currentAdminId);
  }

  function openEdit() {
    if (!user) return;
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      active: user.active,
      modulePermissions: { ...user.modulePermissions },
    });
    setEditOpen(true);
    setPasswordOpen(false);
  }

  async function saveEdit() {
    if (!user || !editForm) return;
    const fullName = editForm.fullName.trim();
    const email = editForm.email.trim().toLowerCase();
    if (!fullName || !email) {
      showToast({
        title: "İşlem başarısız",
        message: "Ad ve e-posta zorunludur.",
        type: "error",
      });
      return;
    }

    setSavingEdit(true);
    const updatePayload: Record<string, unknown> = {
      full_name: fullName,
      email,
      role: editForm.role,
      active: editForm.active,
    };
    if (canPersistModulePermissions && !isUserPremiumPackage(user)) {
      updatePayload.module_permissions = adminPermissionsToPayload(
        editForm.modulePermissions,
      );
    }

    const { error } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", user.id);

    setSavingEdit(false);

    if (error) {
      showToast({ title: "İşlem başarısız", message: error.message, type: "error" });
      return;
    }

    setEditOpen(false);
    showToast({ title: "Başarılı", message: "Kullanıcı güncellendi.", type: "success" });
    await loadUser();
  }

  async function savePassword() {
    if (!user || !newPassword.trim()) {
      showToast({
        title: "İşlem başarısız",
        message: "Yeni şifre giriniz.",
        type: "error",
      });
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase
      .from("users")
      .update({ password: newPassword.trim() })
      .eq("id", user.id);

    setSavingPassword(false);

    if (error) {
      showToast({ title: "İşlem başarısız", message: error.message, type: "error" });
      return;
    }

    setPasswordOpen(false);
    setNewPassword("");
    showToast({ title: "Başarılı", message: "Şifre güncellendi.", type: "success" });
  }

  async function approveUser() {
    if (!user) return;
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({
        approval_status: "approved",
        active: true,
        approved_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setActionUserId(null);
    if (error) {
      showToast({ title: "İşlem başarısız", message: error.message, type: "error" });
      return;
    }
    showToast({ title: "Başarılı", message: "Kullanıcı onaylandı.", type: "success" });
    await loadUser();
  }

  async function rejectUser() {
    if (!user) return;
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({ approval_status: "rejected", active: false })
      .eq("id", user.id);
    setActionUserId(null);
    if (error) {
      showToast({ title: "İşlem başarısız", message: error.message, type: "error" });
      return;
    }
    showToast({ title: "Başarılı", message: "Kullanıcı reddedildi.", type: "success" });
    await loadUser();
  }

  async function toggleActive() {
    if (!user || isSelf()) return;
    const nextActive = !user.active;
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({ active: nextActive })
      .eq("id", user.id);
    setActionUserId(null);
    if (error) {
      showToast({ title: "İşlem başarısız", message: error.message, type: "error" });
      return;
    }
    showToast({
      title: "Başarılı",
      message: nextActive ? "Kullanıcı aktif yapıldı." : "Kullanıcı pasif yapıldı.",
      type: "success",
    });
    await loadUser();
  }

  async function softDelete() {
    if (!user || isSelf()) return;
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({ active: false })
      .eq("id", user.id);
    setActionUserId(null);
    if (error) {
      showToast({ title: "İşlem başarısız", message: error.message, type: "error" });
      return;
    }
    showToast({
      title: "Başarılı",
      message: "Kullanıcı silinmedi; pasif yapıldı.",
      type: "success",
    });
    await loadUser();
  }

  async function savePackageMembership() {
    if (!user || !packagePlan) return;
    if (!canPersistMembership) {
      showToast({
        title: "Kayıt yapılamadı",
        message: "Veritabanında paket kolonları bulunamadı.",
        type: "error",
      });
      return;
    }

    const rawPayload = buildMembershipUpdatePayload(packagePlan);
    const payload = filterMembershipPayloadForRow(rawPayload, membershipSampleRow);
    const updatePayload: Record<string, unknown> = { ...payload };

    if (packagePlan === "premium" && canPersistModulePermissions) {
      updatePayload.module_permissions = buildPremiumModulePermissionsPayload();
    }

    setSavingPackage(true);
    const { error } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", user.id);
    setSavingPackage(false);

    if (error) {
      showToast({ title: "İşlem başarısız", message: error.message, type: "error" });
      return;
    }

    showToast({ title: "Başarılı", message: "Paket güncellendi.", type: "success" });
    await loadUser();
  }

  async function saveModulePermissions(next: AdminModulePermissions) {
    if (!user || isUserPremiumPackage(user)) return;

    setUser((prev) => (prev ? { ...prev, modulePermissions: next } : prev));
    if (!canPersistModulePermissions) return;

    setSavingModules(true);
    const { error } = await supabase
      .from("users")
      .update({ module_permissions: adminPermissionsToPayload(next) })
      .eq("id", user.id);
    setSavingModules(false);

    if (error) {
      showToast({ title: "İşlem başarısız", message: error.message, type: "error" });
      await loadUser();
      return;
    }

    showToast({
      title: "Başarılı",
      message: "Modül izinleri güncellendi.",
      type: "success",
    });
  }

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black">Erişim reddedildi</h1>
          <Link href="/" className="mt-6 inline-block font-black text-violet-700 no-underline">
            Ana panele dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-6 py-6 md:px-10 md:py-8">
        <nav
          className="sticky top-0 z-50 mb-6 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-violet-100/90 via-indigo-100/85 to-rose-100/90 p-3 shadow-lg backdrop-blur-xl sm:p-4"
          aria-label="Üst navigasyon"
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
            <Link
              href="/admin/users"
              className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 no-underline`}
            >
              <Users className="h-5 w-5 shrink-0" aria-hidden />
              Kullanıcı Yönetimine Dön
            </Link>
            <Link
              href="/"
              className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 no-underline`}
            >
              <Home className="h-5 w-5 shrink-0" aria-hidden />
              Ana Panele Dön
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950`}
            >
              Çıkış Yap
            </button>
          </div>
        </nav>

        {loading ? (
          <div className={`${panelClass} flex flex-col items-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 font-bold text-slate-600">Yükleniyor…</p>
          </div>
        ) : notFound || !user ? (
          <div className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Üye bulunamadı</p>
            <Link href="/admin/users" className={`${navBtn} mt-6 inline-flex max-w-md no-underline`}>
              Listeye dön
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <header className={`${panelClass} border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/70`}>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700">
                Kullanıcı detay
              </p>
              <h1 className="mt-2 text-3xl font-black text-slate-950">{user.fullName}</h1>
              <p className="mt-1 text-base font-medium text-slate-600">{user.email}</p>
            </header>

            <div
              className={`${panelClass} border-amber-300/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/90`}
              role="note"
            >
              <p className="text-sm font-bold leading-relaxed text-amber-950 md:text-base">
                Bu ekranda üye hesabı yönetilir; danışan, analiz, taş veya diğer
                kayıtlar burada düzenlenemez (salt izleme).
              </p>
            </div>

            <section className={`${panelClass} border-slate-200/80`}>
              <h2 className="text-xl font-black text-slate-950">Profil Özeti</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <RoleBadge role={user.role} />
                <ApprovalBadge status={user.approvalStatus} />
                <StatusBadge active={user.active} />
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950 ring-1 ring-amber-200">
                  Paket: {user.membershipDisplay.packageLabel}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-black uppercase text-slate-500">Ad Soyad</dt>
                  <dd className="mt-1 font-bold text-slate-900">{user.fullName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-black uppercase text-slate-500">E-posta</dt>
                  <dd className="mt-1 font-bold text-slate-900">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-black uppercase text-slate-500">Kayıt Tarihi</dt>
                  <dd className="mt-1 font-bold text-slate-900">
                    {formatCreatedAt(user.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-black uppercase text-slate-500">Üyelik Durumu</dt>
                  <dd className="mt-1 font-bold text-slate-900">
                    {user.membershipDisplay.statusLabel}
                  </dd>
                </div>
              </dl>
              {user.adminLevel ? (
                <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800">
                  Admin yetki seviyesi (salt okunur): {user.adminLevel}
                </p>
              ) : null}
              {isSelf() ? (
                <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900">
                  Bu sizin admin hesabınız — pasif yapma ve silme devre dışı.
                </p>
              ) : null}
            </section>

            <section className={`${panelClass} border-indigo-200/80`}>
              <h2 className="text-xl font-black text-slate-950">İşlemler</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {user.role === "expert" ? (
                  <>
                    <button
                      type="button"
                      disabled={actionUserId === user.id}
                      onClick={approveUser}
                      className={`${actionBtn} border-emerald-200 bg-emerald-50 text-emerald-950`}
                    >
                      <UserCheck className="h-4 w-4" />
                      Onayla
                    </button>
                    <button
                      type="button"
                      disabled={actionUserId === user.id}
                      onClick={rejectUser}
                      className={`${actionBtn} border-rose-200 bg-rose-50 text-rose-950`}
                    >
                      <UserX className="h-4 w-4" />
                      Reddet
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={isSelf() || actionUserId === user.id}
                  onClick={toggleActive}
                  className={`${actionBtn} border-emerald-200 bg-emerald-50 text-emerald-950`}
                >
                  {user.active ? (
                    <UserX className="h-4 w-4" />
                  ) : (
                    <UserCheck className="h-4 w-4" />
                  )}
                  {user.active ? "Pasif Yap" : "Aktif Yap"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordOpen((o) => !o);
                    setEditOpen(false);
                  }}
                  className={`${actionBtn} border-amber-200 bg-amber-50 text-amber-950`}
                >
                  <KeyRound className="h-4 w-4" />
                  Şifre Güncelle
                </button>
                <button
                  type="button"
                  onClick={openEdit}
                  className={`${actionBtn} border-violet-200 bg-violet-50 text-violet-950`}
                >
                  <Pencil className="h-4 w-4" />
                  Düzenle
                </button>
                <button
                  type="button"
                  disabled={isSelf() || actionUserId === user.id}
                  onClick={softDelete}
                  className={`${actionBtn} border-rose-200 bg-rose-50 text-rose-950`}
                >
                  <Trash2 className="h-4 w-4" />
                  Sil
                </button>
              </div>

              {passwordOpen ? (
                <div className="mt-4 rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4">
                  <p className="text-sm font-black text-amber-950">Yeni şifre</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="password"
                      className={`${inputClass} mt-0 flex-1`}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Yeni şifre"
                    />
                    <button
                      type="button"
                      onClick={savePassword}
                      disabled={savingPassword}
                      className={saveBtnClass}
                    >
                      {savingPassword ? "Kaydediliyor…" : "Onayla"}
                    </button>
                  </div>
                </div>
              ) : null}

              {editOpen && editForm ? (
                <div className="mt-4 rounded-2xl border-2 border-violet-200 bg-violet-50/50 p-4">
                  <p className="text-sm font-black text-violet-950">Kullanıcı düzenle</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Ad Soyad</span>
                      <input
                        className={inputClass}
                        value={editForm.fullName}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, fullName: e.target.value } : f,
                          )
                        }
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>E-posta</span>
                      <input
                        type="email"
                        className={inputClass}
                        value={editForm.email}
                        onChange={(e) =>
                          setEditForm((f) => (f ? { ...f, email: e.target.value } : f))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Rol</span>
                      <select
                        className={inputClass}
                        value={editForm.role}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f
                              ? { ...f, role: e.target.value as ManagedUserRole }
                              : f,
                          )
                        }
                      >
                        <option value="expert">expert</option>
                        <option value="admin">admin</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={savingEdit}
                      className={saveBtnClass}
                    >
                      {savingEdit ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditOpen(false)}
                      className={`${actionBtn} border-slate-200 bg-white text-slate-800`}
                    >
                      İptal
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            {user.role === "expert" ? (
              <section className={`${panelClass} border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
                    <Package className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-amber-950">
                      Paket / Üyelik Yönetimi
                    </h2>
                    <p className="mt-1 text-xs font-medium text-amber-900/85">
                      Deneme: 3 gün · Pro: admin pasife alana kadar · Premium: tüm
                      uzman modülleri otomatik
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">Paket</p>
                    <p className="mt-1 font-black">{user.membershipDisplay.packageLabel}</p>
                  </div>
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">Durum</p>
                    <p className="mt-1 font-black">{user.membershipDisplay.statusLabel}</p>
                  </div>
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">
                      Deneme bitiş
                    </p>
                    <p className="mt-1 font-black">
                      {user.membershipDisplay.trialEndLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">Kalan gün</p>
                    <p className="mt-1 font-black">
                      {user.membershipDisplay.remainingDaysLabel}
                    </p>
                  </div>
                </div>
                {user.membershipDisplay.durationNote &&
                user.membershipDisplay.durationNote !== "—" ? (
                  <p className="mt-3 rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2 text-xs font-bold text-amber-950">
                    {user.membershipDisplay.durationNote}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="block flex-1">
                    <span className={labelClass}>Paket seç</span>
                    <select
                      className={inputClass}
                      value={packagePlan}
                      onChange={(e) =>
                        setPackagePlan(e.target.value as PackagePlanUi | "")
                      }
                    >
                      <option value="">Seçiniz</option>
                      {PACKAGE_PLAN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={savePackageMembership}
                    disabled={savingPackage || !packagePlan || !canPersistMembership}
                    className={`${saveBtnClass} sm:shrink-0 sm:px-10`}
                  >
                    {savingPackage ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        Kaydediliyor…
                      </span>
                    ) : (
                      "Paketi Kaydet"
                    )}
                  </button>
                </div>
              </section>
            ) : null}

            <section className={`${panelClass} border-violet-200/80`}>
              <h2 className="text-xl font-black text-slate-950">Modül İzinleri</h2>
              {user.role === "expert" && isUserPremiumPackage(user) ? (
                <div className="mt-4">
                  <PremiumModuleNotice />
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {ADMIN_MODULE_UI_KEYS.map((key) => (
                      <ModulePermissionCard
                        key={key}
                        label={ADMIN_MODULE_UI_LABELS[key]}
                        enabled
                      />
                    ))}
                  </div>
                </div>
              ) : user.role === "expert" ? (
                <div className="mt-4">
                  <ModulePermissionSwitches
                    value={user.modulePermissions}
                    onChange={saveModulePermissions}
                    disabled={!canPersistModulePermissions || savingModules}
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm font-medium text-slate-600">
                  Admin hesapları için modül izni tanımı gerekmez.
                </p>
              )}
            </section>

            <section className={`${panelClass} border-slate-200/80 bg-slate-50/50`}>
              <h2 className="text-xl font-black text-slate-950">
                Üye Profil İzleme (salt okunur)
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Mevcut modül erişim durumu — veritabanındaki izinlere göre.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {ADMIN_MODULE_UI_KEYS.map((key) => (
                  <ModulePermissionCard
                    key={key}
                    label={ADMIN_MODULE_UI_LABELS[key]}
                    enabled={
                      isUserPremiumPackage(user)
                        ? true
                        : user.modulePermissions[key]
                    }
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
