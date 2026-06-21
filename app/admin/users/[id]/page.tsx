"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  ChevronDown,
  Eye,
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
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ADMIN_MODULE_UI_DESCRIPTIONS,
  ADMIN_MODULE_UI_KEYS,
  ADMIN_MODULE_UI_LABELS,
  adminPermissionsToPayload,
  formatCreatedAt,
  isUserPremiumPackage,
  mapDbUser,
  mapPaymentHistoryRow,
  PACKAGE_PLAN_OPTIONS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_SELECT_OPTIONS,
  paymentSnapshotToEditDraft,
  rowHasMembershipColumns,
  rowHasPaymentColumns,
  type AdminModulePermissions,
  type ApprovalStatusUi,
  type ManagedUser,
  type ManagedUserRole,
  type PaymentEditDraft,
  type PaymentHistoryEntry,
  type PaymentStatusUi,
} from "@/lib/admin/userManagement";
import {
  inferPackagePlanFromSnapshot,
  type PackagePlanUi,
} from "@/lib/auth/membership";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
  type YasamUser,
} from "@/lib/auth/yasamUser";

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

const OWNER_FALLBACK_EMAIL = "admin@yasamsistemi.com";
const DELETE_CONFIRM_PHRASE = "SİLMEYİ ONAYLIYORUM";

const deleteModalOverlay =
  "fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm";

const deleteModalPanel =
  "relative w-full max-w-lg rounded-[28px] border-2 border-white/90 bg-gradient-to-br from-rose-50/95 via-white to-violet-50/80 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.22)] sm:p-8";

function normalizeAdminLevel(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isOwnerAdmin(admin: YasamUser | null | undefined): boolean {
  if (!admin || !isAdminUser(admin)) return false;
  if (normalizeAdminLevel(admin.admin_level) === "owner") return true;
  const email = String(admin.email ?? "")
    .trim()
    .toLowerCase();
  if (!normalizeAdminLevel(admin.admin_level) && email === OWNER_FALLBACK_EMAIL) {
    return true;
  }
  return false;
}

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const PAYMENT_BADGE_STYLES: Record<PaymentStatusUi, string> = {
  paid: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  pending: "bg-amber-100 text-amber-900 ring-amber-200",
  overdue: "bg-rose-100 text-rose-900 ring-rose-200",
  exempt: "bg-sky-100 text-sky-900 ring-sky-200",
  unknown: "bg-slate-100 text-slate-700 ring-slate-200",
};

function PaymentStatusBadge({ status }: { status: PaymentStatusUi }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-black ring-1 ${PAYMENT_BADGE_STYLES[status]}`}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

function PaymentHistorySection({
  entries,
  loading,
}: {
  entries: PaymentHistoryEntry[];
  loading: boolean;
}) {
  return (
    <div className="mt-8 border-t border-teal-200/80 pt-8">
      <h3 className="text-xl font-black text-teal-950 md:text-2xl">Geçmiş Ödemeler</h3>
      <p className="mt-1 text-sm font-medium text-teal-900/75">
        Kayıt zamanına göre en yeni üstte listelenir.
      </p>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-3 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" aria-hidden />
          <span className="text-base font-bold text-slate-600">Geçmiş yükleniyor…</span>
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-6 rounded-2xl border-2 border-dashed border-teal-200/90 bg-white/70 px-6 py-10 text-center text-base font-bold text-slate-600">
          Henüz ödeme geçmişi yok.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border-2 border-teal-100/90 bg-gradient-to-br from-white/95 via-teal-50/30 to-emerald-50/40 shadow-sm">
          <div className="hidden md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-teal-100 bg-teal-50/80">
                  {[
                    "Ödeme Tarihi",
                    "Sonraki Ödeme",
                    "Tutar",
                    "Durum",
                    "Not",
                    "Kayıt Zamanı",
                  ].map((head) => (
                    <th
                      key={head}
                      className="px-4 py-4 text-xs font-black uppercase tracking-wide text-teal-900"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id || `${entry.createdAtLabel}-${entry.paymentDateLabel}`}
                    className="border-b border-teal-50/90 last:border-0"
                  >
                    <td className="px-4 py-4 text-base font-bold text-slate-900">
                      {entry.paymentDateLabel}
                    </td>
                    <td className="px-4 py-4 text-base font-bold text-slate-900">
                      {entry.nextPaymentDateLabel}
                    </td>
                    <td className="px-4 py-4 text-base font-black text-slate-900">
                      {entry.amountLabel}
                    </td>
                    <td className="px-4 py-4">
                      <PaymentStatusBadge status={entry.status} />
                    </td>
                    <td className="max-w-[200px] px-4 py-4 text-sm font-medium text-slate-700">
                      {entry.note?.trim() ? entry.note : "—"}
                    </td>
                    <td className="px-4 py-4 text-sm font-bold text-slate-600">
                      {entry.createdAtLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-3 md:hidden">
            {entries.map((entry) => (
              <article
                key={entry.id || `${entry.createdAtLabel}-mobile`}
                className="rounded-xl border border-teal-100/90 bg-white/90 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-black text-slate-900">{entry.amountLabel}</p>
                  <PaymentStatusBadge status={entry.status} />
                </div>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="font-bold text-slate-500">Ödeme</dt>
                    <dd className="font-bold text-slate-900">{entry.paymentDateLabel}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-bold text-slate-500">Sonraki</dt>
                    <dd className="font-bold text-slate-900">{entry.nextPaymentDateLabel}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-bold text-slate-500">Kayıt</dt>
                    <dd className="font-bold text-slate-700">{entry.createdAtLabel}</dd>
                  </div>
                  {entry.note ? (
                    <div>
                      <dt className="font-bold text-slate-500">Not</dt>
                      <dd className="mt-1 font-medium text-slate-800">{entry.note}</dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
        {ADMIN_MODULE_UI_KEYS.map((key) => {
          const desc = ADMIN_MODULE_UI_DESCRIPTIONS[key];
          return (
            <label
              key={key}
              className={`flex min-h-[64px] items-center justify-between gap-4 rounded-xl border border-white/80 bg-white/90 px-4 py-3 ${
                disabled ? "opacity-70" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-800">
                  {ADMIN_MODULE_UI_LABELS[key]}
                </span>
                {desc ? (
                  <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-500">
                    {desc}
                  </span>
                ) : null}
              </div>
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
          );
        })}
      </div>
    </div>
  );
}

function ModulePermissionCard({
  label,
  description,
  enabled,
}: {
  label: string;
  description?: string;
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
      <div>
        <p className="text-sm font-black text-slate-900">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
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
  useBfcacheRefresh();
  const router = useRouter();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";
  const { showToast } = useToast();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [user, setUser] = useState<ManagedUser | null>(null);
  const [currentAdminUser, setCurrentAdminUser] = useState<YasamUser | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string>("");
  const [deleteModalStep, setDeleteModalStep] = useState<null | "confirm" | "verify">(
    null,
  );
  const [deleteAdminPassword, setDeleteAdminPassword] = useState("");
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

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
  const [paymentDraft, setPaymentDraft] = useState<PaymentEditDraft | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [canPersistPayment, setCanPersistPayment] = useState(true);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);

  function togglePaymentPanel() {
    setShowPaymentPanel((open) => {
      if (open) setShowPaymentHistory(false);
      return !open;
    });
  }

  const loadPaymentHistory = useCallback(async (uid: string, adminId: string) => {
    setHistoryLoading(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/payment-history`, {
      headers: { "x-admin-id": adminId },
    });
    setHistoryLoading(false);
    if (!res.ok) { setPaymentHistory([]); return; }
    const json = (await res.json()) as { history: Record<string, unknown>[] };
    setPaymentHistory((json.history ?? []).map((row) => mapPaymentHistoryRow(row)));
  }, []);

  const loadUser = useCallback(async (adminId: string) => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      headers: { "x-admin-id": adminId },
    });

    if (!res.ok) {
      setUser(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const json = (await res.json()) as {
      user: Record<string, unknown>;
      paymentHistory: Record<string, unknown>[];
    };

    const row = json.user;
    setMembershipSampleRow(row);
    setCanPersistModulePermissions("module_permissions" in row);
    setCanPersistMembership(rowHasMembershipColumns(row));
    setCanPersistPayment(rowHasPaymentColumns(row));

    const mapped = mapDbUser(row);
    setUser(mapped);
    setPaymentDraft(paymentSnapshotToEditDraft(mapped.payment));
    setPackagePlan(inferPackagePlanFromSnapshot(mapped.membership));
    setPaymentHistory((json.paymentHistory ?? []).map((r) => mapPaymentHistoryRow(r)));
    setNotFound(false);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setCurrentAdminUser(session);
    setCurrentAdminId(session?.id ?? "");
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed || !currentAdminId) return;
    void loadUser(currentAdminId);
  }, [sessionChecked, allowed, currentAdminId, loadUser]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  const canDeleteAsOwner = isOwnerAdmin(currentAdminUser);

  function isSelf(): boolean {
    return Boolean(user && currentAdminId && user.id === currentAdminId);
  }



  function closeDeleteModals() {
    setDeleteModalStep(null);
    setDeleteAdminPassword("");
    setDeleteConfirmPhrase("");
    setDeleteSubmitting(false);
  }

  function openDeleteConfirmModal() {
    if (!user || isSelf() || !canDeleteAsOwner) return;
    setDeleteModalStep("confirm");
  }

  async function executeVerifiedDelete() {
    if (!user || isSelf() || !canDeleteAsOwner) return;

    if (!deleteAdminPassword.trim()) {
      showToast({ title: "İşlem başarısız", message: "Admin şifresi giriniz.", type: "error" });
      return;
    }
    if (deleteConfirmPhrase.trim() !== DELETE_CONFIRM_PHRASE) {
      showToast({
        title: "İşlem başarısız",
        message: `Onay metni tam olarak "${DELETE_CONFIRM_PHRASE}" olmalıdır.`,
        type: "error",
      });
      return;
    }

    setDeleteSubmitting(true);

    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-id": currentAdminId },
      body: JSON.stringify({ adminPassword: deleteAdminPassword.trim() }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setDeleteSubmitting(false);

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Silme başarısız.", type: "error" });
      return;
    }

    closeDeleteModals();
    showToast({ title: "Başarılı", message: "Kullanıcı pasife alındı.", type: "success" });
    router.push("/admin/users");
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
      showToast({ title: "İşlem başarısız", message: "Ad ve e-posta zorunludur.", type: "error" });
      return;
    }

    setSavingEdit(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-id": currentAdminId },
      body: JSON.stringify({
        action: "edit",
        fullName,
        email,
        role: editForm.role,
        active: editForm.active,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSavingEdit(false);

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Güncelleme başarısız.", type: "error" });
      return;
    }

    setEditOpen(false);
    showToast({ title: "Başarılı", message: "Kullanıcı güncellendi.", type: "success" });
    await loadUser(currentAdminId);
  }

  async function savePassword() {
    if (!user || !newPassword.trim()) {
      showToast({ title: "İşlem başarısız", message: "Yeni şifre giriniz.", type: "error" });
      return;
    }

    setSavingPassword(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-id": currentAdminId },
      body: JSON.stringify({ newPassword: newPassword.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSavingPassword(false);

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Şifre güncellenemedi.", type: "error" });
      return;
    }

    setPasswordOpen(false);
    setNewPassword("");
    showToast({ title: "Başarılı", message: "Şifre güncellendi.", type: "success" });
  }

  async function postStatus(action: string, extra?: Record<string, unknown>) {
    if (!user) return;
    setActionUserId(user.id);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-id": currentAdminId },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setActionUserId(null);
    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "İşlem başarısız.", type: "error" });
      return;
    }
    await loadUser(currentAdminId);
  }

  async function approveUser() {
    showToast({ title: "Başarılı", message: "Kullanıcı onaylandı.", type: "success" });
    await postStatus("approve");
  }

  async function rejectUser() {
    showToast({ title: "Başarılı", message: "Kullanıcı reddedildi.", type: "success" });
    await postStatus("reject");
  }

  async function toggleActive() {
    if (!user || isSelf()) return;
    const label = user.active ? "Kullanıcı pasif yapıldı." : "Kullanıcı aktif yapıldı.";
    showToast({ title: "Başarılı", message: label, type: "success" });
    await postStatus("toggle_active", { currentActive: user.active });
  }

  async function savePackageMembership() {
    if (!user || !packagePlan) return;
    if (!canPersistMembership) {
      showToast({ title: "Kayıt yapılamadı", message: "Veritabanında paket kolonları bulunamadı.", type: "error" });
      return;
    }

    setSavingPackage(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/package`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-id": currentAdminId },
      body: JSON.stringify({ packagePlan }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSavingPackage(false);

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Paket güncellenemedi.", type: "error" });
      return;
    }

    showToast({ title: "Başarılı", message: "Paket güncellendi.", type: "success" });
    await loadUser(currentAdminId);
  }

  async function savePayment() {
    if (!user || !paymentDraft) return;
    if (!canPersistPayment) {
      showToast({ title: "Kayıt yapılamadı", message: "Veritabanında ödeme kolonları bulunamadı.", type: "error" });
      return;
    }

    setSavingPayment(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-id": currentAdminId },
      body: JSON.stringify({ draft: paymentDraft }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; warning?: string; error?: string };
    setSavingPayment(false);

    if (!res.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Ödeme güncellenemedi.", type: "error" });
      return;
    }

    if (json.warning) {
      showToast({ title: "Kısmi kayıt", message: json.warning, type: "warning" });
    } else {
      showToast({ title: "Başarılı", message: "Ödeme bilgileri güncellendi.", type: "success" });
    }
    await loadUser(currentAdminId);
  }

  async function saveModulePermissions(next: AdminModulePermissions) {
    if (!user || isUserPremiumPackage(user)) return;

    setUser((prev) => (prev ? { ...prev, modulePermissions: next } : prev));
    if (!canPersistModulePermissions) return;

    setSavingModules(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-id": currentAdminId },
      body: JSON.stringify({ action: "modules", modulePermissions: adminPermissionsToPayload(next) }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSavingModules(false);

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Modül izinleri güncellenemedi.", type: "error" });
      await loadUser(currentAdminId);
      return;
    }

    showToast({ title: "Başarılı", message: "Modül izinleri güncellendi.", type: "success" });
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
      <div className={pageContainerClass}>
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
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                    user.payment.status === "paid"
                      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                      : user.payment.status === "pending"
                        ? "bg-amber-100 text-amber-900 ring-amber-200"
                        : user.payment.status === "overdue"
                          ? "bg-rose-100 text-rose-900 ring-rose-200"
                          : user.payment.status === "exempt"
                            ? "bg-sky-100 text-sky-900 ring-sky-200"
                            : "bg-slate-100 text-slate-700 ring-slate-200"
                  }`}
                >
                  Ödeme: {user.payment.statusLabel}
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

            <section
              className={`${panelClass} border-indigo-200/80 bg-gradient-to-br from-indigo-50/95 via-white to-violet-50/70`}
            >
              <Link
                href={`/admin/users/${user.id}/workspace`}
                className="group flex w-full flex-col gap-3 rounded-[24px] border-2 border-indigo-300/90 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-6 text-left text-white shadow-[0_16px_40px_rgba(79,70,229,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(79,70,229,0.42)] no-underline sm:flex-row sm:items-center sm:gap-6 sm:px-8 sm:py-7"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/30">
                  <Eye className="h-7 w-7" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-black sm:text-2xl">Uzman Panelini Görüntüle</p>
                  <p className="mt-1 text-sm font-semibold text-indigo-100/95 sm:text-base">
                    Bu üyeye ait çalışma alanını salt okunur olarak açar.
                  </p>
                </div>
              </Link>
            </section>

            {paymentDraft ? (
              <section
                className={`${panelClass} border-teal-200/80 bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/50 py-4 sm:py-5`}
              >
                <button
                  type="button"
                  onClick={togglePaymentPanel}
                  className="flex w-full items-center gap-4 rounded-2xl border-2 border-teal-200/90 bg-white/80 px-4 py-4 text-left shadow-sm transition hover:border-teal-300 hover:bg-teal-50/60 sm:px-5"
                  aria-expanded={showPaymentPanel}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md">
                    <Banknote className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-black text-teal-950 sm:text-xl">
                      Ödeme Takibi
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-teal-900/75">
                      Ödeme durumu, tutar ve ödeme geçmişini yönet
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-6 w-6 shrink-0 text-teal-700 transition-transform ${
                      showPaymentPanel ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </button>

                {showPaymentPanel ? (
                  <div className="mt-5 border-t border-teal-200/70 pt-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Ödeme Durumu</span>
                    <select
                      className={inputClass}
                      value={
                        paymentDraft.status === "unknown"
                          ? "pending"
                          : paymentDraft.status
                      }
                      onChange={(e) =>
                        setPaymentDraft((d) =>
                          d
                            ? {
                                ...d,
                                status: e.target.value as Exclude<
                                  PaymentStatusUi,
                                  "unknown"
                                >,
                              }
                            : d,
                        )
                      }
                    >
                      {PAYMENT_STATUS_SELECT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Son Ödeme Tarihi</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={paymentDraft.lastPaymentDate}
                      onChange={(e) =>
                        setPaymentDraft((d) =>
                          d ? { ...d, lastPaymentDate: e.target.value } : d,
                        )
                      }
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Sonraki Ödeme Tarihi</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={paymentDraft.nextPaymentDate}
                      onChange={(e) =>
                        setPaymentDraft((d) =>
                          d ? { ...d, nextPaymentDate: e.target.value } : d,
                        )
                      }
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Ödenen Tutar</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={inputClass}
                      placeholder="örn. 1500"
                      value={paymentDraft.paidAmount}
                      onChange={(e) =>
                        setPaymentDraft((d) =>
                          d ? { ...d, paidAmount: e.target.value } : d,
                        )
                      }
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Ödeme Notu</span>
                    <textarea
                      className={`${inputClass} min-h-[100px] resize-y py-3`}
                      rows={3}
                      value={paymentDraft.note}
                      onChange={(e) =>
                        setPaymentDraft((d) =>
                          d ? { ...d, note: e.target.value } : d,
                        )
                      }
                      placeholder="Havale referansı, fatura no vb."
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3 text-sm">
                    <p className="text-[11px] font-black uppercase text-slate-500">
                      Mevcut son ödeme
                    </p>
                    <p className="mt-1 font-black text-slate-900">
                      {user.payment.lastPaymentLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3 text-sm">
                    <p className="text-[11px] font-black uppercase text-slate-500">
                      Mevcut sonraki ödeme
                    </p>
                    <p className="mt-1 font-black text-slate-900">
                      {user.payment.nextPaymentLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3 text-sm">
                    <p className="text-[11px] font-black uppercase text-slate-500">
                      Mevcut tutar
                    </p>
                    <p className="mt-1 font-black text-slate-900">
                      {user.payment.paidAmountLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={savePayment}
                    disabled={savingPayment || !canPersistPayment}
                    className={`${saveBtnClass} sm:min-w-[200px] sm:flex-1 sm:max-w-xs`}
                  >
                    {savingPayment ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        Kaydediliyor…
                      </span>
                    ) : (
                      "Ödemeyi Kaydet"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPaymentHistory((open) => !open)}
                    className="inline-flex h-14 min-w-[200px] items-center justify-center rounded-2xl border-2 border-teal-300/90 bg-gradient-to-r from-teal-50 to-emerald-50 px-8 text-base font-black text-teal-950 shadow-sm transition hover:border-teal-400 hover:from-teal-100 sm:flex-1 sm:max-w-xs"
                    aria-expanded={showPaymentHistory}
                  >
                    {showPaymentHistory ? "Geçmişi Gizle" : "Geçmiş Ödemeler"}
                  </button>
                </div>

                {showPaymentHistory ? (
                  <PaymentHistorySection
                    entries={paymentHistory}
                    loading={historyLoading}
                  />
                ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

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
                {isSelf() ? (
                  <p className="w-full rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs font-bold text-violet-900">
                    Kendi admin hesabınızı silemezsiniz.
                  </p>
                ) : canDeleteAsOwner ? (
                  <button
                    type="button"
                    disabled={deleteSubmitting}
                    onClick={openDeleteConfirmModal}
                    className={`${actionBtn} border-rose-200 bg-rose-50 text-rose-950 hover:bg-rose-100`}
                  >
                    <Trash2 className="h-4 w-4" />
                    Sil
                  </button>
                ) : (
                  <div className="flex w-full flex-col gap-1 sm:w-auto">
                    <button
                      type="button"
                      disabled
                      className={`${actionBtn} border-rose-200/60 bg-rose-50/50 text-rose-400`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Sil
                    </button>
                    <p className="text-xs font-bold text-slate-500">
                      Silme yetkisi yalnızca ana admine aittir.
                    </p>
                  </div>
                )}
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
                        description={ADMIN_MODULE_UI_DESCRIPTIONS[key]}
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
                    description={ADMIN_MODULE_UI_DESCRIPTIONS[key]}
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

      {deleteModalStep === "confirm" ? (
        <div
          className={deleteModalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div className={deleteModalPanel}>
            <button
              type="button"
              onClick={closeDeleteModals}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-500 transition hover:bg-white/80 hover:text-slate-800"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
            <h2
              id="delete-confirm-title"
              className="pr-8 text-xl font-black text-rose-950 sm:text-2xl"
            >
              Kullanıcıyı silmek üzeresiniz
            </h2>
            <p className="mt-4 text-sm font-medium leading-relaxed text-slate-700">
              Bu işlem geri alınamaz. Kullanıcı ve ona bağlı veriler kalıcı olarak
              silinebilir. Devam etmek istediğinizden emin misiniz?
            </p>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteModals}
                className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteAdminPassword("");
                  setDeleteConfirmPhrase("");
                  setDeleteModalStep("verify");
                }}
                className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-rose-300 bg-rose-600 px-5 text-sm font-black text-white transition hover:bg-rose-700"
              >
                Evet, devam et
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModalStep === "verify" ? (
        <div
          className={deleteModalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-verify-title"
        >
          <div className={deleteModalPanel}>
            <button
              type="button"
              onClick={closeDeleteModals}
              disabled={deleteSubmitting}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-500 transition hover:bg-white/80 hover:text-slate-800 disabled:opacity-50"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
            <h2
              id="delete-verify-title"
              className="pr-8 text-xl font-black text-rose-950 sm:text-2xl"
            >
              Admin doğrulaması gerekli
            </h2>
            <p className="mt-3 text-sm font-medium text-slate-700">
              Silme işlemini tamamlamak için ana admin şifresini girin.
            </p>
            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-600">
                  Admin şifresi
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deleteAdminPassword}
                  onChange={(e) => setDeleteAdminPassword(e.target.value)}
                  disabled={deleteSubmitting}
                  className="mt-1.5 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none ring-violet-300 focus:border-violet-400 focus:ring-2 disabled:opacity-60"
                  placeholder="Şifrenizi girin"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-600">
                  Onay metni
                </span>
                <p className="mt-0.5 text-xs font-bold text-rose-800">
                  Yazın: <span className="font-black">{DELETE_CONFIRM_PHRASE}</span>
                </p>
                <input
                  type="text"
                  value={deleteConfirmPhrase}
                  onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                  disabled={deleteSubmitting}
                  className="mt-1.5 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none ring-violet-300 focus:border-violet-400 focus:ring-2 disabled:opacity-60"
                  placeholder={DELETE_CONFIRM_PHRASE}
                />
              </label>
            </div>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteModalStep("confirm")}
                disabled={deleteSubmitting}
                className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Geri
              </button>
              <button
                type="button"
                onClick={() => void executeVerifiedDelete()}
                disabled={
                  deleteSubmitting ||
                  !deleteAdminPassword.trim() ||
                  deleteConfirmPhrase.trim() !== DELETE_CONFIRM_PHRASE
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-rose-300 bg-rose-600 px-5 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Siliniyor…
                  </>
                ) : (
                  "Kullanıcıyı sil"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
