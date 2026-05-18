"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Eye,
  KeyRound,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  clearYasamUser,
  isAdminUser,
  normalizeApprovalStatus,
  normalizeRole,
  readYasamUser,
} from "@/lib/auth/yasamUser";
import {
  buildMembershipDisplay,
  buildMembershipUpdatePayload,
  filterMembershipPayloadForRow,
  inferPackagePlanFromSnapshot,
  parseMembershipFromRow,
  type MembershipDisplay,
  type MembershipSnapshot,
  type PackagePlanUi,
} from "@/lib/auth/membership";
import { buildPremiumModulePermissionsPayload } from "@/lib/auth/modulePermissions";
import { supabase } from "@/lib/supabase";

const PACKAGE_PLAN_OPTIONS: { value: PackagePlanUi; label: string }[] = [
  { value: "trial", label: "Deneme" },
  { value: "pro", label: "Pro" },
  { value: "premium", label: "Premium" },
];

type ManagedUserRole = "admin" | "expert";

type ApprovalStatusUi = "pending" | "approved" | "rejected";

type UserListFilter =
  | "all"
  | "pending"
  | "active"
  | "passive"
  | "admin"
  | "expert";

const USER_LIST_FILTERS: { key: UserListFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Onay Bekleyen" },
  { key: "active", label: "Aktif" },
  { key: "passive", label: "Pasif" },
  { key: "admin", label: "Admin" },
  { key: "expert", label: "Uzman" },
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
    default:
      return true;
  }
}

const ADMIN_MODULE_UI_KEYS = [
  "clients",
  "appointments",
  "numerology",
  "stones",
  "reflexology",
  "energy_body",
  "aromatherapy",
  "personal_archive",
] as const;

type AdminModuleUiKey = (typeof ADMIN_MODULE_UI_KEYS)[number];

export type AdminModulePermissions = Record<AdminModuleUiKey, boolean>;

const ADMIN_MODULE_UI_LABELS: Record<AdminModuleUiKey, string> = {
  clients: "Danışan Yönetimi",
  appointments: "Ajanda",
  numerology: "Numeroloji",
  stones: "Doğaltaş",
  reflexology: "Refleksoloji",
  energy_body: "Biyoenerji",
  aromatherapy: "Aromaterapi",
  personal_archive: "Kişisel Arşiv",
};

const DEFAULT_ADMIN_MODULE_PERMISSIONS: AdminModulePermissions = {
  clients: false,
  appointments: false,
  numerology: false,
  stones: false,
  reflexology: false,
  energy_body: false,
  aromatherapy: false,
  personal_archive: false,
};

const ADMIN_MODULE_TR_ALIAS_TO_UI: Record<string, AdminModuleUiKey> = {
  danisan_yonetimi: "clients",
  ajanda: "appointments",
  numeroloji: "numerology",
  dogaltas: "stones",
  refleksoloji: "reflexology",
  biyoenerji: "energy_body",
  aromaterapi: "aromatherapy",
  kisisel_arsiv: "personal_archive",
};

function parseAdminModulePermissions(raw: unknown): AdminModulePermissions {
  const perms = { ...DEFAULT_ADMIN_MODULE_PERMISSIONS };
  if (!raw || typeof raw !== "object") return perms;
  const row = raw as Record<string, unknown>;
  for (const key of ADMIN_MODULE_UI_KEYS) {
    if (typeof row[key] === "boolean") perms[key] = row[key];
  }
  for (const [alias, uiKey] of Object.entries(ADMIN_MODULE_TR_ALIAS_TO_UI)) {
    if (row[alias] === true) perms[uiKey] = true;
  }
  return perms;
}

function isUserPremiumPackage(user: ManagedUser): boolean {
  return user.membership.packageType === "premium";
}

function premiumAdminModulePermissions(): AdminModulePermissions {
  return parseAdminModulePermissions(buildPremiumModulePermissionsPayload());
}

function adminPermissionsToPayload(
  perms: AdminModulePermissions,
): Record<string, boolean> {
  return { ...perms };
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: ManagedUserRole;
  active: boolean;
  approvalStatus: ApprovalStatusUi;
  modulePermissions: AdminModulePermissions;
  membership: MembershipSnapshot;
  membershipDisplay: MembershipDisplay;
  adminLevel?: string;
  createdAt?: string;
};

function mapApprovalStatus(value: unknown): ApprovalStatusUi {
  const s = normalizeApprovalStatus(value);
  if (s === "approved" || s === "rejected") return s;
  return "pending";
}

function mapDbUser(row: Record<string, unknown>): ManagedUser {
  const roleRaw = normalizeRole(row.role);
  const role: ManagedUserRole = roleRaw === "admin" ? "admin" : "expert";
  const id = row.id != null ? String(row.id).trim() : "";
  const fullName = String(row.full_name ?? row.name ?? "").trim();
  const email = String(row.email ?? "").trim();
  const membership = parseMembershipFromRow(row);

  return {
    id: id || email,
    fullName: fullName || email || "İsimsiz kullanıcı",
    email,
    role,
    active: row.active === true,
    approvalStatus: mapApprovalStatus(row.approval_status),
    modulePermissions: parseAdminModulePermissions(row.module_permissions),
    membership,
    membershipDisplay: buildMembershipDisplay(membership),
    adminLevel:
      row.admin_level != null ? String(row.admin_level).trim() : undefined,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
  };
}

function rowHasMembershipColumns(row: Record<string, unknown>): boolean {
  return (
    "package_type" in row ||
    "membership_status" in row ||
    "trial_ends_at" in row ||
    "plan" in row
  );
}

function sortUsersForAdmin(list: ManagedUser[]): ManagedUser[] {
  const order: Record<ApprovalStatusUi, number> = {
    pending: 0,
    approved: 1,
    rejected: 2,
  };
  return [...list].sort((a, b) => {
    const byApproval = order[a.approvalStatus] - order[b.approvalStatus];
    if (byApproval !== 0) return byApproval;
    if (!a.createdAt || !b.createdAt) return 0;
    return b.createdAt.localeCompare(a.createdAt);
  });
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

const actionBtn =
  "inline-flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50";

const profileViewBtn =
  "flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-sky-300/80 bg-gradient-to-r from-sky-50/95 via-cyan-50/80 to-blue-50/90 text-sm font-black text-sky-950 shadow-[0_12px_40px_rgba(14,165,233,0.2)] backdrop-blur-md transition hover:border-sky-400 hover:from-sky-100 hover:to-cyan-100 no-underline";

function PastelLoader({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-4 border-violet-200/90" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-violet-500 border-r-fuchsia-400" />
        <Loader2 className="relative h-7 w-7 animate-spin text-violet-600" aria-hidden />
      </div>
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
          className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 hover:from-emerald-100 hover:to-teal-100 no-underline lg:justify-self-start`}
        >
          <span className="text-xl" aria-hidden>
            🏠
          </span>
          Ana Panele Dön
        </Link>

        <Link
          href="/admin"
          className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 hover:border-violet-400 hover:from-violet-100 hover:to-indigo-100 no-underline lg:justify-self-center`}
        >
          <span className="text-xl" aria-hidden>
            👑
          </span>
          Admin Yönetim Merkezi
        </Link>

        <button
          type="button"
          onClick={onLogout}
          className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400 hover:from-rose-100 hover:to-orange-100 lg:justify-self-end`}
        >
          <span className="text-xl" aria-hidden>
            🚪
          </span>
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
    <div
      className={`rounded-[24px] border-2 p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6 ${tones[tone]}`}
    >
      <p className="text-sm font-black uppercase tracking-wide text-slate-600">
        {label}
      </p>
      <p className="mt-2 text-4xl font-black tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function RoleBadge({ role }: { role: ManagedUserRole }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
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
        Premium üyelik: Admin yetkisi hariç tüm modüller otomatik açıktır.
      </p>
    </div>
  );
}

function ModulePermissionSwitches({
  value,
  onChange,
  disabled = false,
  readOnlyHint,
}: {
  value: AdminModulePermissions;
  onChange: (next: AdminModulePermissions) => void;
  disabled?: boolean;
  readOnlyHint?: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-violet-100 bg-violet-50/50 p-4 md:p-5">
      <p className="text-sm font-black text-violet-950">Modül İzinleri</p>
      <p className="mt-1 text-xs font-medium text-slate-600">
        {readOnlyHint ??
          "Açık modüller uzmanın ana panelinde görünür."}
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

function PackageSubscriptionSection({
  display,
  onEdit,
  disabled,
}: {
  display: MembershipDisplay;
  onEdit: () => void;
  disabled?: boolean;
}) {
  const fields = [
    { label: "Paket", value: display.packageLabel },
    { label: "Durum", value: display.statusLabel },
    { label: "Deneme Bitiş Tarihi", value: display.trialEndLabel },
    { label: "Kalan Gün", value: display.remainingDaysLabel },
  ];

  return (
    <div className="rounded-2xl border-2 border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-orange-50/70 to-rose-50/60 p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
            <Package className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-black text-amber-950">Paket / Üyelik</p>
            <p className="mt-0.5 text-xs font-medium text-amber-900/80">
              Deneme, Pro ve Premium paket yönetimi
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-amber-300/90 bg-white/90 px-4 text-xs font-black text-amber-950 shadow-sm transition hover:border-amber-400 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Paket Düzenle
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div
            key={field.label}
            className="rounded-xl border border-white/90 bg-white/85 px-4 py-3 shadow-sm"
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
              {field.label}
            </p>
            <p className="mt-1 text-base font-black text-slate-900">{field.value}</p>
          </div>
        ))}
      </div>
      {display.durationNote && display.durationNote !== "—" ? (
        <p className="mt-3 rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2 text-xs font-bold text-amber-950">
          {display.durationNote}
        </p>
      ) : null}
    </div>
  );
}

type PackageEditDraft = {
  packagePlan: PackagePlanUi | "";
};

function PackageEditModal({
  user,
  draft,
  onDraftChange,
  onClose,
  onSave,
  saving,
  canPersist,
}: {
  user: ManagedUser;
  draft: PackageEditDraft;
  onDraftChange: (next: PackageEditDraft) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  canPersist: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="package-edit-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-[28px] border-2 border-white/90 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/80 p-6 shadow-[0_24px_64px_rgba(15,23,42,0.2)] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-3 pr-10">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
            <Package className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-800">
              Paket / Üyelik Yönetimi
            </p>
            <h2 id="package-edit-title" className="mt-1 text-xl font-black text-slate-950">
              Paket Düzenle
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {user.fullName} · {user.email}
            </p>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs font-bold text-amber-950">
          {draft.packagePlan === "trial"
            ? "Deneme: 3 gün süreyle trial_started_at / trial_ends_at atanır."
            : draft.packagePlan === "pro" || draft.packagePlan === "premium"
              ? "Pro / Premium: süresiz aktif (membership_ends_at boş)."
              : "Paket seçin; durum ve tarihler otomatik atanır."}
          {!canPersist
            ? " Veritabanında paket kolonları bulunamadı — kayıt yapılamaz."
            : ""}
        </p>

        <div className="mt-5">
          <label className="block">
            <span className={labelClass}>Paket</span>
            <select
              className={inputClass}
              value={draft.packagePlan}
              onChange={(e) =>
                onDraftChange({
                  packagePlan: e.target.value as PackagePlanUi | "",
                })
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
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !draft.packagePlan || !canPersist}
            className={`${saveBtnClass} sm:flex-1`}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Kaydediliyor…
              </span>
            ) : (
              "Kaydet"
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-14 flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-6 font-black text-slate-800"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}

type EmptyForm = {
  fullName: string;
  email: string;
  password: string;
  role: ManagedUserRole;
  active: boolean;
  modulePermissions: AdminModulePermissions;
};

const emptyForm: EmptyForm = {
  fullName: "",
  email: "",
  password: "",
  role: "expert",
  active: true,
  modulePermissions: { ...DEFAULT_ADMIN_MODULE_PERMISSIONS },
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const [form, setForm] = useState<EmptyForm>(emptyForm);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EmptyForm>(emptyForm);

  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [canPersistModulePermissions, setCanPersistModulePermissions] =
    useState(true);
  const [savingModulesUserId, setSavingModulesUserId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [listFilter, setListFilter] = useState<UserListFilter>("all");
  const [packageEditUser, setPackageEditUser] = useState<ManagedUser | null>(null);
  const [packageEditDraft, setPackageEditDraft] = useState<PackageEditDraft>({
    packagePlan: "",
  });
  const [savingPackageUserId, setSavingPackageUserId] = useState<string | null>(
    null,
  );
  const [canPersistMembership, setCanPersistMembership] = useState(true);
  const [membershipSampleRow, setMembershipSampleRow] = useState<Record<
    string,
    unknown
  > | null>(null);

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

    const rows = data ?? [];
    if (rows.length > 0 && rows[0] && typeof rows[0] === "object") {
      const sample = rows[0] as Record<string, unknown>;
      setCanPersistModulePermissions("module_permissions" in sample);
      setMembershipSampleRow(sample);
      setCanPersistMembership(rowHasMembershipColumns(sample));
    }

    const mapped = rows.map((row) =>
      mapDbUser(row as Record<string, unknown>),
    );

    setUsers(sortUsersForAdmin(mapped));
    setListLoading(false);
  }, [showToast]);

  useEffect(() => {
    const user = readYasamUser();
    setAllowed(isAdminUser(user));
    setCurrentAdminId(user?.id ?? null);
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

  function openPackageEdit(user: ManagedUser) {
    setPackageEditUser(user);
    setPackageEditDraft({
      packagePlan: inferPackagePlanFromSnapshot(user.membership),
    });
  }

  function closePackageEdit() {
    setPackageEditUser(null);
    setPackageEditDraft({ packagePlan: "" });
  }

  async function savePackageMembership() {
    if (!packageEditUser || !packageEditDraft.packagePlan) return;
    if (!canPersistMembership) {
      showToast({
        title: "Kayıt yapılamadı",
        message: "Veritabanında paket kolonları bulunamadı.",
        type: "error",
      });
      return;
    }

    const rawPayload = buildMembershipUpdatePayload(packageEditDraft.packagePlan);
    const payload = filterMembershipPayloadForRow(
      rawPayload,
      membershipSampleRow,
    );
    const updatePayload: Record<string, unknown> = { ...payload };

    if (
      packageEditDraft.packagePlan === "premium" &&
      canPersistModulePermissions
    ) {
      updatePayload.module_permissions = buildPremiumModulePermissionsPayload();
    }

    setSavingPackageUserId(packageEditUser.id);
    const { error } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", packageEditUser.id);

    setSavingPackageUserId(null);

    if (error) {
      console.error("Paket kaydı hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: error.message,
        type: "error",
      });
      return;
    }

    const mergedRow = {
      ...(membershipSampleRow ?? {}),
      ...updatePayload,
      id: packageEditUser.id,
    } as Record<string, unknown>;
    const membership = parseMembershipFromRow(mergedRow);
    const nextModulePermissions =
      packageEditDraft.packagePlan === "premium"
        ? premiumAdminModulePermissions()
        : packageEditUser.modulePermissions;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === packageEditUser.id
          ? {
              ...u,
              membership,
              membershipDisplay: buildMembershipDisplay(membership),
              modulePermissions: nextModulePermissions,
            }
          : u,
      ),
    );

    showToast({
      title: "Paket kaydedildi",
      message: `${packageEditUser.fullName} için üyelik güncellendi.`,
      type: "success",
    });
    closePackageEdit();
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
    const insertPayload: Record<string, unknown> = {
      full_name: fullName,
      email,
      password: form.password.trim(),
      role: form.role,
      active: form.active,
      approval_status: form.active ? "approved" : "pending",
    };
    if (canPersistModulePermissions) {
      insertPayload.module_permissions = adminPermissionsToPayload(
        form.modulePermissions,
      );
    }

    const { error } = await supabase.from("users").insert(insertPayload);

    if (error) {
      console.error("Kullanıcı ekleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Kayıt hatası: " + error.message,
        type: "error",
      });
      setCreating(false);
      return;
    }

    setForm(emptyForm);
    setFormOpen(false);
    setCreating(false);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı eklendi.",
      type: "success",
    });
    await loadUsers();
  }

  function startEdit(user: ManagedUser) {
    setEditingId(user.id);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      password: "",
      role: user.role,
      active: user.active,
      modulePermissions: { ...user.modulePermissions },
    });
    setPasswordUserId(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    const fullName = editForm.fullName.trim();
    const email = editForm.email.trim().toLowerCase();
    if (!fullName || !email) {
      showToast({
        title: "İşlem başarısız",
        message: "Düzenleme: ad ve e-posta zorunludur.",
        type: "error",
      });
      return;
    }
    if (users.some((u) => u.id !== editingId && u.email.toLowerCase() === email)) {
      showToast({
        title: "İşlem başarısız",
        message: "Bu e-posta başka bir kullanıcıda kayıtlı.",
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
    if (canPersistModulePermissions) {
      updatePayload.module_permissions = adminPermissionsToPayload(
        editForm.modulePermissions,
      );
    }

    const { error } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", editingId);

    if (error) {
      console.error("Kullanıcı güncelleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Güncelleme hatası: " + error.message,
        type: "error",
      });
      setSavingEdit(false);
      return;
    }

    setEditingId(null);
    setSavingEdit(false);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı güncellendi.",
      type: "success",
    });
    await loadUsers();
  }

  async function savePassword() {
    if (!passwordUserId || !newPassword.trim()) {
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
      .eq("id", passwordUserId);

    if (error) {
      console.error("Şifre güncelleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Şifre güncellenemedi: " + error.message,
        type: "error",
      });
      setSavingPassword(false);
      return;
    }

    setPasswordUserId(null);
    setNewPassword("");
    setSavingPassword(false);
    showToast({
      title: "Başarılı",
      message: "Şifre güncellendi.",
      type: "success",
    });
  }

  async function approveUser(user: ManagedUser) {
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({
        approval_status: "approved",
        active: true,
        approved_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      showToast({
        title: "İşlem başarısız",
        message: error.message,
        type: "error",
      });
      setActionUserId(null);
      return;
    }

    setActionUserId(null);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı onaylandı.",
      type: "success",
    });
    await loadUsers();
  }

  async function rejectUser(user: ManagedUser) {
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({
        approval_status: "rejected",
        active: false,
      })
      .eq("id", user.id);

    if (error) {
      showToast({
        title: "İşlem başarısız",
        message: error.message,
        type: "error",
      });
      setActionUserId(null);
      return;
    }

    setActionUserId(null);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı reddedildi.",
      type: "success",
    });
    await loadUsers();
  }

  async function deactivateUser(user: ManagedUser) {
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({ active: false })
      .eq("id", user.id);

    if (error) {
      showToast({
        title: "İşlem başarısız",
        message: error.message,
        type: "error",
      });
      setActionUserId(null);
      return;
    }

    setActionUserId(null);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı pasif yapıldı.",
      type: "success",
    });
    await loadUsers();
  }

  async function toggleActive(user: ManagedUser) {
    const nextActive = !user.active;
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({ active: nextActive })
      .eq("id", user.id);

    if (error) {
      console.error("Durum güncelleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Durum güncellenemedi: " + error.message,
        type: "error",
      });
      setActionUserId(null);
      return;
    }

    setActionUserId(null);
    showToast({
      title: "Başarılı",
      message: nextActive ? "Kullanıcı aktif yapıldı." : "Kullanıcı pasif yapıldı.",
      type: "success",
    });
    await loadUsers();
  }

  async function saveUserModulePermissions(
    userId: string,
    next: AdminModulePermissions,
  ) {
    const target = users.find((u) => u.id === userId);
    if (target && isUserPremiumPackage(target)) return;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, modulePermissions: next } : u,
      ),
    );

    if (!canPersistModulePermissions) return;

    setSavingModulesUserId(userId);
    const { error } = await supabase
      .from("users")
      .update({ module_permissions: adminPermissionsToPayload(next) })
      .eq("id", userId);

    if (error) {
      console.error("Modül izinleri güncelleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: error.message,
        type: "error",
      });
      await loadUsers();
      setSavingModulesUserId(null);
      return;
    }

    setSavingModulesUserId(null);
    showToast({
      title: "Başarılı",
      message: "Modül izinleri güncellendi.",
      type: "success",
    });
  }

  function isCurrentAdminUser(user: ManagedUser): boolean {
    if (!currentAdminId) return false;
    return user.id === currentAdminId;
  }

  async function softDelete(id: string) {
    setActionUserId(id);
    const { error } = await supabase.from("users").update({ active: false }).eq("id", id);

    if (error) {
      console.error("Pasif yapma hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "İşlem başarısız: " + error.message,
        type: "error",
      });
      setActionUserId(null);
      return;
    }

    setActionUserId(null);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı silinmedi; pasif yapıldı.",
      type: "success",
    });
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
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-rose-200/15 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1500px] px-6 py-6 md:px-10 md:py-8 xl:px-16">
        <UsersTopNav onLogout={handleLogout} />

        <header className={`${panelClass} mb-8 border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/70`}>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700">
            Admin · Üye Yönetimi
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-[2.75rem]">
            Kullanıcı / Üye Yönetimi
          </h1>
          <p className="mt-3 max-w-3xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
            Uzman hesapları, onay süreçleri, modül erişimleri ve profil izleme
            işlemleri bu ekrandan yönetilir.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryStatCard label="Toplam Üye" value={stats.total} tone="violet" />
          <SummaryStatCard
            label="Onay Bekleyen"
            value={stats.pending}
            tone="amber"
          />
          <SummaryStatCard label="Aktif Üye" value={stats.active} tone="emerald" />
          <SummaryStatCard
            label="Pasif / Askıda"
            value={stats.passive}
            tone="slate"
          />
        </section>

        <section className={`${panelClass} mb-8 border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/80`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-indigo-950 sm:text-2xl">
                Yeni Uzman Ekle
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Kayıtlar Supabase users tablosuna kaydedilir.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen((open) => !open)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-violet-300 bg-violet-50 px-5 text-sm font-black text-violet-950 transition hover:bg-violet-100"
            >
              {formOpen ? (
                <ChevronDown className="h-5 w-5 rotate-180" aria-hidden />
              ) : (
                <Plus className="h-5 w-5" aria-hidden />
              )}
              {formOpen ? "Formu Kapat" : "+ Yeni Uzman Ekle"}
            </button>
          </div>

          {formOpen ? (
          <form onSubmit={handleCreate} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className={labelClass}>Ad Soyad</span>
              <input
                className={inputClass}
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="Örn. Ayşe Yılmaz"
              />
            </label>
            <label className="block">
              <span className={labelClass}>E-posta</span>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="uzman@yasam.com"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Şifre</span>
              <input
                type="password"
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
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
            <label className="flex items-center gap-4 rounded-2xl border-2 border-indigo-100 bg-white px-4 py-4">
              <span className={labelClass}>Aktif / Pasif</span>
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                className={`relative h-9 w-16 shrink-0 rounded-full transition ${
                  form.active ? "bg-emerald-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition ${
                    form.active ? "left-8" : "left-1"
                  }`}
                />
              </button>
              <span className="text-sm font-bold text-slate-700">
                {form.active ? "Aktif" : "Pasif"}
              </span>
            </label>
            <div className="lg:col-span-3">
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

        <section>
          <div className={`${panelClass} mb-6 border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-indigo-50/50`}>
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Kullanıcı adı, e-posta veya rol ara..."
                className="h-14 w-full rounded-2xl border-2 border-indigo-100 bg-white/95 py-3 pl-12 pr-4 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              {USER_LIST_FILTERS.map(({ key, label }) => {
                const active = listFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setListFilter(key)}
                    className={`rounded-full border-2 px-4 py-2 text-sm font-black transition ${
                      active
                        ? "border-violet-400 bg-violet-100 text-violet-950 shadow-sm"
                        : "border-slate-200 bg-white/90 text-slate-700 hover:border-violet-200 hover:bg-violet-50/80"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <h2 className="mb-4 flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Users className="h-6 w-6 text-violet-600" aria-hidden />
            Kullanıcı Listesi
            {!listLoading && users.length > 0 ? (
              <span className="text-base font-bold text-slate-500">
                ({filteredUsers.length}/{users.length})
              </span>
            ) : null}
          </h2>
          {listLoading ? (
            <div className={`${panelClass} border-slate-200/80`}>
              <PastelLoader label="Kullanıcılar yükleniyor…" />
            </div>
          ) : !listLoading && users.length === 0 ? (
            <div className={`${panelClass} border-dashed border-slate-300 text-center`}>
              <p className="text-base font-black text-slate-800">Henüz kullanıcı yok</p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Yukarıdaki formdan yeni uzman ekleyebilirsiniz.
              </p>
            </div>
          ) : !listLoading && filteredUsers.length === 0 ? (
            <div className={`${panelClass} border-dashed border-slate-300 text-center`}>
              <p className="text-base font-black text-slate-800">Sonuç bulunamadı</p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Arama veya filtreyi değiştirerek tekrar deneyin.
              </p>
            </div>
          ) : (
          <div className="space-y-5">
            {filteredUsers.map((user) => {
              const isEditing = editingId === user.id;
              const isSelf = isCurrentAdminUser(user);
              return (
                <article
                  key={user.id}
                  className={`${panelClass} min-h-[300px] border-slate-200/80 py-8 md:min-h-[320px] md:py-10 ${
                    !user.active ? "opacity-80" : ""
                  }`}
                >
                  {isEditing ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className={labelClass}>Ad Soyad</span>
                        <input
                          className={inputClass}
                          value={editForm.fullName}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, fullName: e.target.value }))
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
                            setEditForm((f) => ({ ...f, email: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Rol</span>
                        <select
                          className={inputClass}
                          value={editForm.role}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              role: e.target.value as ManagedUserRole,
                            }))
                          }
                        >
                          <option value="expert">expert</option>
                          <option value="admin">admin</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-4 sm:col-span-2">
                        <span className={labelClass}>Aktif</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={editForm.active}
                          onClick={() =>
                            setEditForm((f) => ({ ...f, active: !f.active }))
                          }
                          className={`relative h-9 w-16 rounded-full ${
                            editForm.active ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow ${
                              editForm.active ? "left-8" : "left-1"
                            }`}
                          />
                        </button>
                      </label>
                      <div className="sm:col-span-2">
                        <ModulePermissionSwitches
                          value={editForm.modulePermissions}
                          onChange={(modulePermissions) =>
                            setEditForm((f) => ({ ...f, modulePermissions }))
                          }
                          disabled={!canPersistModulePermissions}
                          readOnlyHint={
                            canPersistModulePermissions
                              ? undefined
                              : "Modül izinleri veritabanında henüz kaydedilemiyor (yalnızca önizleme)."
                          }
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={savingEdit}
                          className={saveBtnClass}
                        >
                          {savingEdit ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                              Kaydediliyor…
                            </span>
                          ) : (
                            "Kaydet"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-14 flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 font-black text-slate-800"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_minmax(360px,440px)] lg:items-start lg:gap-10">
                      <div className="min-w-0">
                        <p className="text-xl font-black text-slate-900 md:text-2xl">{user.fullName}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600 md:text-base">{user.email}</p>
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          Kayıt: {formatCreatedAt(user.createdAt)}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <RoleBadge role={user.role} />
                          <ApprovalBadge status={user.approvalStatus} />
                          <StatusBadge active={user.active} />
                        </div>
                        {isSelf ? (
                          <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs font-bold text-violet-900">
                            Bu sizin admin hesabınız — pasif yapma ve silme devre dışı.
                          </p>
                        ) : null}
                        {user.adminLevel ? (
                          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs font-bold text-slate-800">
                            Admin yetki seviyesi (salt okunur):{" "}
                            <span className="text-violet-900">{user.adminLevel}</span>
                            <span className="mt-1 block font-medium text-slate-600">
                              İleride owner_admin / limited_admin ayrımı eklenecek.
                            </span>
                          </p>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {user.role === "expert" ? (
                          <>
                            <button
                              type="button"
                              disabled={actionUserId === user.id}
                              onClick={() => approveUser(user)}
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <UserCheck className="h-4 w-4" />
                              Onayla
                            </button>
                            <button
                              type="button"
                              disabled={actionUserId === user.id}
                              onClick={() => rejectUser(user)}
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-950 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <UserX className="h-4 w-4" />
                              Reddet
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordUserId(user.id);
                            setNewPassword("");
                            setEditingId(null);
                          }}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-950 transition hover:bg-amber-100"
                        >
                          <KeyRound className="h-4 w-4" />
                          Şifre Güncelle
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(user)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-violet-200 bg-violet-50 px-4 text-sm font-black text-violet-950 transition hover:bg-violet-100"
                        >
                          <Pencil className="h-4 w-4" />
                          Düzenle
                        </button>
                        <button
                          type="button"
                          disabled={isSelf || actionUserId === user.id}
                          onClick={() => toggleActive(user)}
                          title={isSelf ? "Kendi hesabınızı pasif yapamazsınız" : undefined}
                          className={`${actionBtn} border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100`}
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
                          disabled={isSelf || actionUserId === user.id}
                          onClick={() => softDelete(user.id)}
                          className={`${actionBtn} border-rose-200 bg-rose-50 text-rose-950 hover:bg-rose-100 sm:col-span-2`}
                          title={
                            isSelf
                              ? "Kendi hesabınızı silemezsiniz"
                              : "Kayıt silinmez, pasif yapılır"
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          Sil
                        </button>
                      </div>
                    </div>

                    <Link
                      href={`/admin/users/${encodeURIComponent(user.id)}`}
                      className={`${profileViewBtn} mt-6`}
                    >
                      <Eye className="h-5 w-5 shrink-0" aria-hidden />
                      Üye Profilini İzle
                    </Link>

                    {user.role === "expert" ? (
                      <div className="mt-6">
                        <PackageSubscriptionSection
                          display={user.membershipDisplay}
                          onEdit={() => openPackageEdit(user)}
                          disabled={savingPackageUserId === user.id}
                        />
                      </div>
                    ) : null}

                    <div className="mt-6 border-t border-violet-100/90 pt-6">
                    {user.role === "expert" && isUserPremiumPackage(user) ? (
                      <PremiumModuleNotice />
                    ) : (
                      <ModulePermissionSwitches
                        value={user.modulePermissions}
                        onChange={(next) =>
                          saveUserModulePermissions(user.id, next)
                        }
                        disabled={
                          !canPersistModulePermissions ||
                          savingModulesUserId === user.id
                        }
                        readOnlyHint={
                          canPersistModulePermissions
                            ? savingModulesUserId === user.id
                              ? "Modül izinleri kaydediliyor…"
                              : undefined
                            : "Modül izinleri yalnızca önizleme modunda (veritabanı kolonu yok)."
                        }
                      />
                    )}
                    </div>
                    </>
                  )}

                  {passwordUserId === user.id ? (
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
                          className="inline-flex h-14 shrink-0 items-center justify-center rounded-2xl border-2 border-amber-400 bg-amber-100 px-6 font-black text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingPassword ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              Kaydediliyor…
                            </span>
                          ) : (
                            "Onayla"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPasswordUserId(null)}
                          className="inline-flex h-14 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-6 font-black text-slate-700"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          )}
        </section>
      </div>

      {packageEditUser ? (
        <PackageEditModal
          user={packageEditUser}
          draft={packageEditDraft}
          onDraftChange={setPackageEditDraft}
          onClose={closePackageEdit}
          onSave={savePackageMembership}
          saving={savingPackageUserId === packageEditUser.id}
          canPersist={canPersistMembership}
        />
      ) : null}
    </main>
  );
}
