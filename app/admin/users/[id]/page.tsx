"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  ChevronDown,
  Eye,
  EyeOff,
  Filter,
  HelpCircle,
  Home,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Package,
  Pencil,
  Shield,
  Smartphone,
  Tablet,
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
  DEFAULT_LICENSE_SETTINGS,
  formatCreatedAt,
  isUserPremiumPackage,
  LICENSE_PRESETS,
  LICENSE_TYPE_OPTIONS,
  mapDbUser,
  mapPaymentHistoryRow,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_SELECT_OPTIONS,
  paymentSnapshotToEditDraft,
  rowHasMembershipColumns,
  rowHasPaymentColumns,
  SECURITY_MODE_OPTIONS,
  type AdminModulePermissions,
  type ApprovalStatusUi,
  type LicenseSettings,
  type ManagedUser,
  type ManagedUserRole,
  type PaymentEditDraft,
  type PaymentHistoryEntry,
  type PaymentStatusUi,
} from "@/lib/admin/userManagement";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
  readSessionToken,
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
/** Tüm cihazlardan çıkış ikinci onayı — tam metin (Türkçe karakter korunur). */
const LOGOUT_ALL_PHRASE = "ÇIKIŞ YAPTIR";

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

/**
 * Yönetilen hedef kullanıcı owner (sistem sahibi) admin mi?
 * NOT: admin_level kolonu varsayılan 'owner' ürettiğinden güvenilmez; owner
 * kimliği e-posta ile belirlenir (server tarafı isOwnerAdminRow ile aynı kural).
 */
function isManagedOwnerAdmin(
  u: { role?: string; email?: string } | null | undefined,
): boolean {
  if (!u || u.role !== "admin") return false;
  return String(u.email ?? "").trim().toLowerCase() === OWNER_FALLBACK_EMAIL;
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

/** Tek üyelik modeli: erişim durumu yalnız active + approval_status'tan türer. */
function membershipAccessState(user: ManagedUser): { label: string; cls: string } {
  if (user.approvalStatus === "rejected") {
    return { label: "Reddedildi", cls: "border-rose-300 bg-rose-50 text-rose-700" };
  }
  if (!user.active) {
    return { label: "Erişim kapalı", cls: "border-slate-300 bg-slate-100 text-slate-700" };
  }
  if (user.approvalStatus === "pending") {
    return { label: "Onay bekliyor", cls: "border-amber-300 bg-amber-50 text-amber-800" };
  }
  return { label: "Premium · Aktif · Onaylı", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" };
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
        Premium kullanıcılar tüm uzman modüllerine otomatik erişir. Özel modül izinleri ayrıca yönetilebilir.
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

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-1) */
function adminHeaders(adminId: string, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
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
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  // P2 — hesap müdahaleleri: pasife alma onayı + tüm cihazlardan çıkış (iki adım).
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [logoutAllStep, setLogoutAllStep] = useState<null | "confirm" | "verify">(null);
  const [logoutAllPhrase, setLogoutAllPhrase] = useState("");
  const [logoutAllSubmitting, setLogoutAllSubmitting] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

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
  const [showSecurityPanel, setShowSecurityPanel] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityLoaded, setSecurityLoaded] = useState(false);
  const [securityEvents, setSecurityEvents] = useState<Record<string, unknown>[]>([]);
  const [userSessions, setUserSessions] = useState<Record<string, unknown>[]>([]);
  const [licenseDraft, setLicenseDraft] = useState<LicenseSettings>(DEFAULT_LICENSE_SETTINGS);
  const [savingLicense, setSavingLicense] = useState(false);
  const [showLicenseHelp, setShowLicenseHelp] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Record<string, unknown>[]>([]);
  const [activeSessionsLoading, setActiveSessionsLoading] = useState(false);
  const [activeSessionsLoaded, setActiveSessionsLoaded] = useState(false);
  const [activeSessionsSummary, setActiveSessionsSummary] = useState<Record<string, unknown> | null>(null);
  const [showActiveSessions, setShowActiveSessions] = useState(false);
  const [devicesDateFrom, setDevicesDateFrom] = useState("");
  const [devicesDateTo, setDevicesDateTo] = useState("");
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);
  const [securityEventFilter, setSecurityEventFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [securityDatePreset, setSecurityDatePreset] = useState<"all" | "today" | "7d" | "30d" | "custom">("all");
  const [securityDateFrom, setSecurityDateFrom] = useState("");
  const [securityDateTo, setSecurityDateTo] = useState("");
  // Güvenlik özet badge'i (sayfa yüklendiğinde hızlı çekilir, panel kapalıyken gösterilir)
  const [securitySummary, setSecuritySummary] = useState<{ high30d: number; suspicious30d: number } | null>(null);
  // Güvenlik paneli sayfalama
  const [secEventsLimit, setSecEventsLimit] = useState<5 | 10 | 25>(5);
  const [secEventsOffset, setSecEventsOffset] = useState(0);
  const [secEventsTotal, setSecEventsTotal] = useState(0);
  const [secSessLimit, setSecSessLimit] = useState<5 | 10 | 25>(5);
  const [secSessOffset, setSecSessOffset] = useState(0);
  const [secSessTotal, setSecSessTotal] = useState(0);
  // Aktif cihazlar sayfalama
  const [actSessLimit, setActSessLimit] = useState<5 | 10 | 25>(5);
  const [actSessOffset, setActSessOffset] = useState(0);
  const [actSessTotal, setActSessTotal] = useState(0);

  function togglePaymentPanel() {
    setShowPaymentPanel((open) => {
      if (open) setShowPaymentHistory(false);
      return !open;
    });
  }

  const loadPaymentHistory = useCallback(async (uid: string, adminId: string) => {
    setHistoryLoading(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/payment-history`, {
      headers: adminHeaders(adminId),
    });
    setHistoryLoading(false);
    if (!res.ok) { setPaymentHistory([]); return; }
    const json = (await res.json()) as { history: Record<string, unknown>[] };
    setPaymentHistory((json.history ?? []).map((row) => mapPaymentHistoryRow(row)));
  }, []);

  async function fetchSecurityPaged(opts: {
    eventsLimit:   number;
    eventsOffset:  number;
    sessLimit:     number;
    sessOffset:    number;
    severity:      string;
    dateFrom:      string;
    dateTo:        string;
    appendEvents?: boolean;
    appendSessions?: boolean;
  }) {
    if (!user) return;
    setSecurityLoading(true);
    const p = new URLSearchParams({
      limit:           String(opts.eventsLimit),
      offset:          String(opts.eventsOffset),
      sessions_limit:  String(opts.sessLimit),
      sessions_offset: String(opts.sessOffset),
    });
    if (opts.severity !== "all") p.set("severity", opts.severity);
    if (opts.dateFrom) p.set("from", opts.dateFrom);
    if (opts.dateTo)   p.set("to",   opts.dateTo);

    const res = await fetch(
      `/api/admin/users/${encodeURIComponent(user.id)}/security-events?${p.toString()}`,
      { headers: adminHeaders(currentAdminId) },
    );
    setSecurityLoading(false);
    if (!res.ok) return;

    const json = (await res.json()) as {
      events:       Record<string, unknown>[];
      eventsTotal:  number;
      sessions:     Record<string, unknown>[];
      sessionsTotal: number;
      summary:      { high30d: number; suspicious30d: number };
    };

    if (opts.appendEvents && opts.eventsOffset > 0) {
      setSecurityEvents((prev) => [...prev, ...(json.events ?? [])]);
    } else {
      setSecurityEvents(json.events ?? []);
    }
    setSecEventsTotal(json.eventsTotal ?? 0);
    setSecEventsOffset(opts.eventsOffset);
    setSecEventsLimit(opts.eventsLimit as 5 | 10 | 25);

    if (opts.appendSessions && opts.sessOffset > 0) {
      setUserSessions((prev) => [...prev, ...(json.sessions ?? [])]);
    } else {
      setUserSessions(json.sessions ?? []);
    }
    setSecSessTotal(json.sessionsTotal ?? 0);
    setSecSessOffset(opts.sessOffset);
    setSecSessLimit(opts.sessLimit as 5 | 10 | 25);

    if (json.summary) setSecuritySummary(json.summary);
    setSecurityLoaded(true);
  }

  // Güvenlik paneli açıldığında veya limit/filtre değiştiğinde çağrılır
  async function loadSecurityData(uid: string, adminId: string) {
    // İlk yüklemede mevcut state değerlerini kullan
    await fetchSecurityPaged({
      eventsLimit:  secEventsLimit,
      eventsOffset: 0,
      sessLimit:    secSessLimit,
      sessOffset:   0,
      severity:     securityEventFilter,
      dateFrom:     securityDateFrom,
      dateTo:       securityDateTo,
    });
  }

  const loadUser = useCallback(async (adminId: string) => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      headers: adminHeaders(adminId),
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
    setLicenseDraft({ ...mapped.licenseSettings });
    setPaymentHistory((json.paymentHistory ?? []).map((r) => mapPaymentHistoryRow(r)));
    setNotFound(false);
    setLoading(false);
    // Panel state'i sıfırla
    setActiveSessionsLoaded(false);
    setShowActiveSessions(false);
    setSecurityLoaded(false);
    setShowSecurityPanel(false);
    setSecEventsOffset(0);
    setSecSessOffset(0);
    setActSessOffset(0);
    // Hafif özet: panel kapalıyken badge göstermek için
    void loadPanelSummaries(mapped.id, adminId);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPanelSummaries(uid: string, adminId: string) {
    const [secRes, actRes] = await Promise.allSettled([
      fetch(`/api/admin/users/${encodeURIComponent(uid)}/security-events?limit=0&sessions_limit=0`, {
        headers: adminHeaders(adminId),
      }),
      fetch(`/api/admin/users/${encodeURIComponent(uid)}/active-sessions?limit=0`, {
        headers: adminHeaders(adminId),
      }),
    ]);
    if (secRes.status === "fulfilled" && secRes.value.ok) {
      const j = (await secRes.value.json()) as { summary?: { high30d: number; suspicious30d: number } };
      if (j.summary) setSecuritySummary(j.summary);
    }
    if (actRes.status === "fulfilled" && actRes.value.ok) {
      const j = (await actRes.value.json()) as { summary?: Record<string, unknown> };
      if (j.summary) setActiveSessionsSummary(j.summary);
    }
  }

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
      headers: adminHeaders(currentAdminId, true),
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
      headers: adminHeaders(currentAdminId, true),
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

  /** Şifre panelini kapatırken hassas parola state'ini temizle. */
  function closePasswordPanel() {
    setPasswordOpen(false);
    setNewPassword("");
    setNewPasswordRepeat("");
    setShowNewPassword(false);
  }

  /**
   * Bu hedef üzerinde P2 hesap müdahalesi (pasife alma / şifre / logout-all) UI'da
   * açık mı? Sunucu her koşulda yeniden doğrular; bu yalnız erken engelleme:
   *   - kendi hesabın → kapalı
   *   - ana yönetici (owner) hedef → kapalı (mutlak koruma)
   *   - admin hedef + görüntüleyen ana yönetici değil → kapalı (P1)
   */
  function canManageAccountActions(): boolean {
    if (!user || isSelf()) return false;
    if (isManagedOwnerAdmin(user)) return false;
    if (user.role === "admin" && !isOwnerAdmin(currentAdminUser)) return false;
    return true;
  }

  async function savePassword() {
    if (!user || !canManageAccountActions()) return;
    const pw = newPassword.trim();
    const pw2 = newPasswordRepeat.trim();
    if (!pw) {
      showToast({ title: "İşlem başarısız", message: "Yeni şifre giriniz.", type: "error" });
      return;
    }
    if (pw.length < 6) {
      showToast({ title: "İşlem başarısız", message: "Yeni şifre en az 6 karakter olmalı.", type: "error" });
      return;
    }
    if (pw !== pw2) {
      showToast({ title: "İşlem başarısız", message: "Şifreler eşleşmiyor.", type: "error" });
      return;
    }

    setSavingPassword(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/password`, {
      method: "POST",
      headers: adminHeaders(currentAdminId, true),
      body: JSON.stringify({ newPassword: pw }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      revokedSessionCount?: number;
    };
    setSavingPassword(false);

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Şifre güncellenemedi.", type: "error" });
      return;
    }

    closePasswordPanel();
    showToast({
      title: "Başarılı",
      message: "Şifre değiştirildi ve kullanıcı tüm cihazlardan çıkarıldı.",
      type: "success",
    });
  }

  async function postStatus(action: string, extra?: Record<string, unknown>): Promise<boolean> {
    if (!user) return false;
    setActionUserId(user.id);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/status`, {
      method: "POST",
      headers: adminHeaders(currentAdminId, true),
      body: JSON.stringify({ action, ...extra }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setActionUserId(null);
    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "İşlem başarısız.", type: "error" });
      return false;
    }
    await loadUser(currentAdminId);
    return true;
  }

  async function approveUser() {
    if (await postStatus("approve")) {
      showToast({ title: "Başarılı", message: "Kullanıcı onaylandı.", type: "success" });
    }
  }

  async function rejectUser() {
    if (await postStatus("reject")) {
      showToast({ title: "Başarılı", message: "Kullanıcı reddedildi.", type: "success" });
    }
  }

  /** Aktif/Pasif düğmesi: pasife alma güvenli onay ister (tüm cihaz çıkışı), aktifleştirme doğrudan. */
  function requestToggleActive() {
    if (!user || isSelf()) return;
    // Owner (sistem sahibi) admin pasifleştirilemez — sunucu da engeller, burada erken uyarı.
    if (user.active && isManagedOwnerAdmin(user)) {
      showToast({
        title: "İşlem engellendi",
        message: "Sistem sahibi (owner) admin pasifleştirilemez.",
        type: "error",
      });
      return;
    }
    if (user.active) {
      setDeactivateOpen(true); // pasife alma → onay ekranı (tüm cihazlardan çıkış)
    } else {
      void doToggleActive(); // aktifleştirme → doğrudan (oturum oluşturmaz)
    }
  }

  async function doToggleActive(): Promise<boolean> {
    if (!user) return false;
    const wasActive = user.active;
    const done = await postStatus("toggle_active", { currentActive: wasActive });
    if (done) {
      showToast({
        title: "Başarılı",
        message: wasActive
          ? "Kullanıcı pasif yapıldı ve tüm cihazlardan çıkarıldı."
          : "Kullanıcı aktif yapıldı. Erişim için tekrar giriş yapmalı.",
        type: "success",
      });
    }
    return done;
  }

  async function confirmDeactivate() {
    if (await doToggleActive()) setDeactivateOpen(false);
  }

  // ── Tüm cihazlardan çıkış (iki adımlı onay) ─────────────────────────────────
  function closeLogoutAllModal() {
    setLogoutAllStep(null);
    setLogoutAllPhrase("");
    setLogoutAllSubmitting(false);
  }

  function openLogoutAllModal() {
    if (!canManageAccountActions()) return;
    setLogoutAllPhrase("");
    setLogoutAllStep("confirm");
  }

  async function executeLogoutAll() {
    if (!user || !canManageAccountActions()) return;
    if (logoutAllPhrase.trim() !== LOGOUT_ALL_PHRASE) {
      showToast({
        title: "İşlem başarısız",
        message: `Onay için tam olarak "${LOGOUT_ALL_PHRASE}" yazmalısınız.`,
        type: "error",
      });
      return;
    }

    setLogoutAllSubmitting(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/logout-all`, {
      method: "POST",
      headers: adminHeaders(currentAdminId, true),
      body: JSON.stringify({ confirm: logoutAllPhrase.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      revokedSessionCount?: number;
    };
    setLogoutAllSubmitting(false);

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "İşlem başarısız.", type: "error" });
      return;
    }

    closeLogoutAllModal();
    const n = json.revokedSessionCount ?? 0;
    showToast({
      title: "Başarılı",
      message:
        n > 0
          ? `${n} oturum kapatıldı; kullanıcı tüm cihazlardan çıkarıldı.`
          : "Aktif oturum yoktu; kullanıcı zaten çıkış yapmış.",
      type: "success",
    });
    if (activeSessionsLoaded) await loadActiveSessions(user.id, currentAdminId);
  }

  async function savePackageMembership() {
    if (!user) return;
    if (!canPersistMembership) {
      showToast({ title: "Kayıt yapılamadı", message: "Veritabanında paket kolonları bulunamadı.", type: "error" });
      return;
    }

    setSavingPackage(true);
    // Tek üyelik modeli: her zaman "premium". Route atomik olarak
    // package_type=premium + active=true + approval_status=approved + approved_at yazar.
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/package`, {
      method: "POST",
      headers: adminHeaders(currentAdminId, true),
      body: JSON.stringify({ packagePlan: "premium" }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSavingPackage(false);

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Paket güncellenemedi.", type: "error" });
      return;
    }

    showToast({ title: "Başarılı", message: "Kullanıcı Premium olarak kaydedildi (aktif + onaylı).", type: "success" });
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
      headers: adminHeaders(currentAdminId, true),
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
    // P3: Premium dahil her uzman için modül izinleri kişiye özel düzenlenebilir.
    if (!user || user.role !== "expert") return;

    setUser((prev) => (prev ? { ...prev, modulePermissions: next } : prev));
    if (!canPersistModulePermissions) return;

    setSavingModules(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: adminHeaders(currentAdminId, true),
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

  async function saveLicenseSettings(confirmExcessRevocation = false) {
    if (!user) return;
    setSavingLicense(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: adminHeaders(currentAdminId, true),
      body: JSON.stringify({
        action:                 "license",
        licenseType:            licenseDraft.licenseType,
        allowedActiveSessions:  licenseDraft.allowedActiveSessions,
        allowedLocations:       licenseDraft.allowedLocations,
        allowedDesktopSessions: licenseDraft.allowedDesktopSessions,
        allowedMobileSessions:  licenseDraft.allowedMobileSessions,
        allowedTabletSessions:  licenseDraft.allowedTabletSessions,
        allowedUnknownSessions: licenseDraft.allowedUnknownSessions,
        securityMode:           licenseDraft.securityMode,
        securityExempt:         licenseDraft.securityExempt,
        licenseNote:            licenseDraft.licenseNote,
        confirmExcessRevocation,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      requiresConfirmation?: boolean;
      excessSessionCount?: number;
      revokedSessionCount?: number;
    };
    setSavingLicense(false);

    // P3: limit düşürme fazla oturum kapatacaksa ONAYSIZ uygulanmaz (409). Admin'e
    // kaç oturumun kapanacağını göster, açık onay al, sonra revoke-onaylı tekrar gönder.
    if (res.status === 409 && json.requiresConfirmation) {
      const n = json.excessSessionCount ?? 0;
      const proceed = window.confirm(
        `Bu limitler ${n} aktif oturumu kapatacak (en eski oturumlar öncelikli). Devam edilsin mi?`,
      );
      if (proceed) await saveLicenseSettings(true);
      return;
    }

    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Lisans ayarları güncellenemedi.", type: "error" });
      return;
    }
    const revoked = json.revokedSessionCount ?? 0;
    showToast({
      title: "Başarılı",
      message:
        revoked > 0
          ? `Lisans & oturum limitleri güncellendi; ${revoked} fazla oturum kapatıldı.`
          : "Lisans & oturum limitleri güncellendi.",
      type: "success",
    });
    await loadUser(currentAdminId);
    await loadActiveSessions(user.id, currentAdminId);
  }

  async function fetchActiveSessionsPaged(opts: {
    limit:    number;
    offset:   number;
    dateFrom: string;
    dateTo:   string;
    append?:  boolean;
  }) {
    if (!user) return;
    setActiveSessionsLoading(true);
    const p = new URLSearchParams({ limit: String(opts.limit), offset: String(opts.offset) });
    if (opts.dateFrom) p.set("from", opts.dateFrom);
    if (opts.dateTo)   p.set("to",   opts.dateTo);

    const res = await fetch(
      `/api/admin/users/${encodeURIComponent(user.id)}/active-sessions?${p.toString()}`,
      { headers: adminHeaders(currentAdminId) },
    );
    setActiveSessionsLoading(false);
    if (!res.ok) return;

    const json = (await res.json()) as {
      sessions:      Record<string, unknown>[];
      sessionsTotal: number;
      summary:       Record<string, unknown>;
    };

    if (opts.append && opts.offset > 0) {
      setActiveSessions((prev) => [...prev, ...(json.sessions ?? [])]);
    } else {
      setActiveSessions(json.sessions ?? []);
    }
    setActSessTotal(json.sessionsTotal ?? 0);
    setActSessOffset(opts.offset);
    setActSessLimit(opts.limit as 5 | 10 | 25);
    setActiveSessionsSummary(json.summary ?? null);
    setActiveSessionsLoaded(true);
  }

  async function loadActiveSessions(uid: string, adminId: string) {
    await fetchActiveSessionsPaged({
      limit: actSessLimit, offset: 0,
      dateFrom: devicesDateFrom, dateTo: devicesDateTo,
    });
  }

  async function terminateSession(sessionId: string) {
    if (!user) return;
    setTerminatingSessionId(sessionId);
    const res = await fetch(
      `/api/admin/users/${encodeURIComponent(user.id)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "PATCH", headers: adminHeaders(currentAdminId) },
    );
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setTerminatingSessionId(null);
    if (!res.ok || !json.ok) {
      showToast({ title: "İşlem başarısız", message: json.error ?? "Oturum sonlandırılamadı.", type: "error" });
      return;
    }
    showToast({ title: "Başarılı", message: "Oturum sonlandırıldı.", type: "success" });
    await loadActiveSessions(user.id, currentAdminId);
  }

  // ── Yardımcı hesaplama fonksiyonları ─────────────────────────────────────

  function computeSecurityScore(events: Record<string, unknown>[]): "green" | "yellow" | "red" {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = events.filter((e) => new Date(String(e.created_at ?? "")).getTime() > cutoff);
    const high   = recent.filter((e) => e.severity === "high").length;
    const med    = recent.filter((e) => e.severity === "medium").length;
    if (high >= 2 || med >= 6) return "red";
    if (high >= 1 || med >= 2) return "yellow";
    return "green";
  }

  function filterByDateRange<T extends Record<string, unknown>>(
    items: T[], from: string, to: string, key = "created_at",
  ): T[] {
    if (!from && !to) return items;
    const fromMs = from ? new Date(from + "T00:00:00").getTime() : 0;
    const toMs   = to   ? new Date(to + "T23:59:59").getTime()   : Infinity;
    return items.filter((item) => {
      const d = new Date(String(item[key] ?? "")).getTime();
      return d >= fromMs && d <= toMs;
    });
  }

  function applySecurityDatePreset(preset: "today" | "7d" | "30d") {
    const now   = new Date();
    const pad   = (n: number) => String(n).padStart(2, "0");
    const fmt   = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = fmt(now);
    const from  = preset === "today" ? today : fmt(new Date(now.getTime() - (preset === "7d" ? 7 : 30) * 86400000));
    setSecurityDateFrom(from);
    setSecurityDateTo(today);
    setSecurityDatePreset(preset);
    // Tarih filtresi etkin → 25 kayıt, offset sıfırla, yeniden yükle
    if (securityLoaded) {
      void fetchSecurityPaged({
        eventsLimit: 25, eventsOffset: 0, sessLimit: 25, sessOffset: 0,
        severity: securityEventFilter, dateFrom: from, dateTo: today,
      });
    }
  }

  function clearSecurityDateFilter() {
    setSecurityDateFrom(""); setSecurityDateTo(""); setSecurityDatePreset("all");
    if (securityLoaded) {
      void fetchSecurityPaged({
        eventsLimit: secEventsLimit, eventsOffset: 0, sessLimit: secSessLimit, sessOffset: 0,
        severity: securityEventFilter, dateFrom: "", dateTo: "",
      });
    }
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
                Bu ekranda yalnızca üye hesabı ve erişim yetkileri yönetilir.
                Danışan, analiz, taş veya diğer uzman içerikleri admin tarafından
                görüntülenemez veya düzenlenemez.
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

            {/* GİZLİLİK KARARI (2026-08-24): "Uzman Panelini Görüntüle" / çalışma alanı
                kartı kaldırıldı — admin/owner artık uzman özel içeriğini görüntüleyemez. */}

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
                  disabled={actionUserId === user.id || !canManageAccountActions()}
                  title={
                    isSelf()
                      ? "Kendi hesabınız üzerinde durum değişikliği yapamazsınız."
                      : isManagedOwnerAdmin(user)
                        ? "Ana yönetici pasifleştirilemez."
                        : user.role === "admin" && !isOwnerAdmin(currentAdminUser)
                          ? "Admin hesabı durumunu yalnızca ana yönetici değiştirebilir."
                          : undefined
                  }
                  onClick={requestToggleActive}
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
                  disabled={!canManageAccountActions()}
                  title={
                    isManagedOwnerAdmin(user)
                      ? "Ana yönetici hesabına bu işlem uygulanamaz."
                      : user.role === "admin" && !isOwnerAdmin(currentAdminUser)
                        ? "Admin şifresini yalnızca ana yönetici sıfırlayabilir."
                        : undefined
                  }
                  onClick={() => {
                    if (passwordOpen) {
                      closePasswordPanel();
                    } else {
                      setPasswordOpen(true);
                      setEditOpen(false);
                    }
                  }}
                  className={`${actionBtn} border-amber-200 bg-amber-50 text-amber-950 disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <KeyRound className="h-4 w-4" />
                  Şifreyi Sıfırla
                </button>
                <button
                  type="button"
                  disabled={!canManageAccountActions()}
                  title={
                    isManagedOwnerAdmin(user)
                      ? "Ana yönetici hesabına bu işlem uygulanamaz."
                      : user.role === "admin" && !isOwnerAdmin(currentAdminUser)
                        ? "Bu işlem yalnızca ana yöneticiye açıktır."
                        : undefined
                  }
                  onClick={openLogoutAllModal}
                  className={`${actionBtn} border-orange-200 bg-orange-50 text-orange-950 disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <LogOut className="h-4 w-4" />
                  Tüm Cihazlardan Çıkış
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
                  <p className="text-sm font-black text-amber-950">Yeni şifre belirle</p>
                  <p className="mt-1 text-xs font-bold text-amber-900/85">
                    Şifre değiştirildiğinde kullanıcı tüm cihazlardan çıkarılır ve tekrar giriş yapması gerekir.
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        autoComplete="new-password"
                        className={`${inputClass} mt-0 w-full pr-11`}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Yeni şifre (en az 6 karakter)"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100"
                        aria-label={showNewPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      className={`${inputClass} mt-0 w-full`}
                      value={newPasswordRepeat}
                      onChange={(e) => setNewPasswordRepeat(e.target.value)}
                      placeholder="Yeni şifre (tekrar)"
                    />
                    {newPasswordRepeat.length > 0 && newPassword.trim() !== newPasswordRepeat.trim() ? (
                      <p className="text-xs font-bold text-rose-700">Şifreler eşleşmiyor.</p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={savePassword}
                      disabled={
                        savingPassword ||
                        newPassword.trim().length < 6 ||
                        newPassword.trim() !== newPasswordRepeat.trim()
                      }
                      className={`${saveBtnClass} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {savingPassword ? "Kaydediliyor…" : "Şifreyi Sıfırla"}
                    </button>
                    <button
                      type="button"
                      onClick={closePasswordPanel}
                      disabled={savingPassword}
                      className={`${actionBtn} border-slate-200 bg-white text-slate-800`}
                    >
                      İptal
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
                      Tek Paket: Premium · Erişim, yönetici kullanıcıyı pasife alana
                      kadar aktiftir.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">Paket</p>
                    <p className="mt-1 font-black">Premium</p>
                  </div>
                  <div className="rounded-xl border border-white/90 bg-white/85 px-4 py-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">
                      Erişim durumu
                    </p>
                    {(() => {
                      const st = membershipAccessState(user);
                      return (
                        <span
                          className={`mt-1 inline-block rounded-full border px-3 py-1 text-xs font-black ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-md text-xs font-bold text-amber-900/85">
                    “Premium Olarak Kaydet” kullanıcıyı Premium · Aktif · Onaylı yapar.
                    Erişimi kapatmak için “Pasif Yap” işlemini kullanın.
                  </p>
                  <button
                    type="button"
                    onClick={savePackageMembership}
                    disabled={savingPackage || !canPersistMembership}
                    className={`${saveBtnClass} sm:shrink-0 sm:px-10`}
                  >
                    {savingPackage ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        Kaydediliyor…
                      </span>
                    ) : (
                      "Premium Olarak Kaydet"
                    )}
                  </button>
                </div>
              </section>
            ) : null}

            <section className={`${panelClass} border-violet-200/80`}>
              <h2 className="text-xl font-black text-slate-950">Modül İzinleri</h2>
              {user.role === "expert" ? (
                <div className="mt-4">
                  {isUserPremiumPackage(user) ? (
                    <p className="mb-3 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs font-bold text-violet-900">
                      Premium: modüller varsayılan açık verildi. Kişiye özel olarak
                      kapatıp açabilirsiniz — erişim server tarafında zorlanır.
                    </p>
                  ) : null}
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

            {/* ── Güvenlik & Oturum Geçmişi ──────────────────────────────── */}
            <section className={`${panelClass} border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-white to-orange-50/60`}>
              <button
                type="button"
                onClick={() => {
                  if (!showSecurityPanel && !securityLoaded) {
                    void loadSecurityData(user.id, currentAdminId);
                  }
                  setShowSecurityPanel((o) => !o);
                }}
                className="flex w-full items-center gap-4 rounded-2xl border-2 border-rose-200/90 bg-white/80 px-4 py-4 text-left shadow-sm transition hover:border-rose-300 hover:bg-rose-50/60 sm:px-5"
                aria-expanded={showSecurityPanel}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 text-white shadow-md">
                  <Shield className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-rose-950 sm:text-xl">
                    Güvenlik & Oturum Geçmişi
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-rose-900/75">
                    Şüpheli girişler, konum değişimleri ve oturum kayıtları
                  </p>
                </div>
                {securitySummary ? (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ring-1 ${
                    (securitySummary.high30d ?? 0) >= 1
                      ? "bg-rose-100 text-rose-900 ring-rose-300"
                      : (securitySummary.suspicious30d ?? 0) >= 1
                        ? "bg-amber-100 text-amber-900 ring-amber-300"
                        : "bg-emerald-100 text-emerald-900 ring-emerald-300"
                  }`}>
                    {(securitySummary.high30d ?? 0) >= 1
                      ? "Yüksek Risk"
                      : (securitySummary.suspicious30d ?? 0) >= 1
                        ? "Dikkat" : "Normal"}
                  </span>
                ) : null}
                <ChevronDown
                  className={`h-6 w-6 shrink-0 text-rose-700 transition-transform ${showSecurityPanel ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              {/* Panel kapalıyken uyarı metni */}
              {!showSecurityPanel && securitySummary && ((securitySummary.high30d ?? 0) > 0 || (securitySummary.suspicious30d ?? 0) > 0) ? (
                <div className={`mt-3 rounded-xl border px-4 py-2.5 text-sm font-bold ${
                  (securitySummary.high30d ?? 0) > 0
                    ? "border-rose-200 bg-rose-50/80 text-rose-800"
                    : "border-amber-200 bg-amber-50/80 text-amber-800"
                }`}>
                  {(securitySummary.high30d ?? 0) > 0
                    ? `Yüksek Risk: Son 30 günde ${securitySummary.high30d} yüksek riskli giriş var`
                    : `Dikkat: Son 30 günde ${securitySummary.suspicious30d} şüpheli giriş var`}
                </div>
              ) : null}

              {showSecurityPanel ? (
                <div className="mt-5 border-t border-rose-200/70 pt-5">
                  {securityLoading ? (
                    <div className="flex items-center justify-center gap-3 py-10">
                      <Loader2 className="h-8 w-8 animate-spin text-rose-500" aria-hidden />
                      <span className="font-bold text-slate-600">Yükleniyor…</span>
                    </div>
                  ) : (
                    <>
                      {/* ── Güvenlik Puan Kartı (summary'den) ─────────────── */}
                      {securitySummary ? (() => {
                        const h = securitySummary.high30d ?? 0;
                        const m = securitySummary.suspicious30d ?? 0;
                        const score = h >= 1 ? "red" : m >= 1 ? "yellow" : "green";
                        const cfg = {
                          green:  { label: "Normal",      bg: "from-emerald-50 to-teal-50",  border: "border-emerald-200", text: "text-emerald-900", dot: "bg-emerald-500" },
                          yellow: { label: "Dikkat",      bg: "from-amber-50 to-orange-50",  border: "border-amber-200",  text: "text-amber-900",  dot: "bg-amber-500"  },
                          red:    { label: "Yüksek Risk", bg: "from-rose-50 to-red-50",      border: "border-rose-300",   text: "text-rose-900",   dot: "bg-rose-500"   },
                        }[score];
                        return (
                          <div className={`mb-5 flex flex-wrap items-center gap-4 rounded-2xl border-2 bg-gradient-to-br p-4 ${cfg.bg} ${cfg.border}`}>
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${cfg.dot} text-white shadow-md`}>
                              <Shield className="h-6 w-6" aria-hidden />
                            </div>
                            <div className="flex-1">
                              <p className={`text-lg font-black ${cfg.text}`}>Güvenlik Durumu: {cfg.label}</p>
                              <p className="text-sm font-medium text-slate-600">Son 30 günde: {h} yüksek risk · {m} şüpheli olay</p>
                            </div>
                            {(h >= 3 || m >= 6) ? <p className="text-sm font-black text-rose-800">Hesap paylaşımı riski olabilir.</p> : null}
                          </div>
                        );
                      })() : null}

                      {/* ── Filtre Araç Çubuğu ────────────────────────────── */}
                      <div className="mb-4 space-y-3">
                        {/* Önem seviyesi + kayıt sayısı */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 text-xs font-black text-slate-500"><Filter className="h-3 w-3" /> Filtre:</span>
                          {(["all", "high", "medium", "low"] as const).map((f) => (
                            <button key={f} type="button"
                              onClick={() => {
                                setSecurityEventFilter(f);
                                void fetchSecurityPaged({ eventsLimit: secEventsLimit, eventsOffset: 0, sessLimit: secSessLimit, sessOffset: 0, severity: f, dateFrom: securityDateFrom, dateTo: securityDateTo });
                              }}
                              className={`rounded-full px-3 py-1 text-[11px] font-black ring-1 transition ${securityEventFilter === f ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-slate-700 ring-slate-200 hover:ring-rose-300"}`}
                            >
                              {f === "all" ? "Tümü" : f === "high" ? "Yüksek Risk" : f === "medium" ? "Şüpheli" : "Bilgilendirme"}
                            </button>
                          ))}
                        </div>
                        {/* Tarih filtresi */}
                        <div className="flex flex-wrap items-center gap-2">
                          {(["today", "7d", "30d"] as const).map((p) => (
                            <button key={p} type="button" onClick={() => applySecurityDatePreset(p)}
                              className={`rounded-full px-3 py-1 text-[11px] font-black ring-1 transition ${securityDatePreset === p ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-700 ring-slate-200 hover:ring-indigo-300"}`}
                            >
                              {p === "today" ? "Bugün" : p === "7d" ? "Son 7 Gün" : "Son 30 Gün"}
                            </button>
                          ))}
                          <input type="date" value={securityDateFrom}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSecurityDateFrom(v); setSecurityDatePreset("custom");
                              void fetchSecurityPaged({ eventsLimit: 25, eventsOffset: 0, sessLimit: 25, sessOffset: 0, severity: securityEventFilter, dateFrom: v, dateTo: securityDateTo });
                            }}
                            className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                          />
                          <span className="text-xs text-slate-400">—</span>
                          <input type="date" value={securityDateTo}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSecurityDateTo(v); setSecurityDatePreset("custom");
                              void fetchSecurityPaged({ eventsLimit: 25, eventsOffset: 0, sessLimit: 25, sessOffset: 0, severity: securityEventFilter, dateFrom: securityDateFrom, dateTo: v });
                            }}
                            className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                          />
                          {(securityDateFrom || securityDateTo) ? (
                            <button type="button" onClick={clearSecurityDateFilter}
                              className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200">
                              Temizle
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* ── Son Oturumlar ─────────────────────────────────── */}
                      {(() => {
                        const END_REASON_LABELS: Record<string, string> = {
                          stale: "Pasife düştü", new_login: "Yeni giriş",
                          session_limit: "Oturum limiti", admin_terminated: "Admin sonlandırdı",
                        };
                        const hasDateFilter = !!(securityDateFrom || securityDateTo);
                        return (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-base font-black text-slate-900">
                                Son Oturumlar <span className="text-sm font-medium text-slate-400">({userSessions.length}/{secSessTotal})</span>
                              </h3>
                              {!hasDateFilter ? (
                                <div className="flex gap-1">
                                  {([5, 10, 25] as const).map((n) => (
                                    <button key={n} type="button"
                                      onClick={() => { setSecSessLimit(n); void fetchSecurityPaged({ eventsLimit: secEventsLimit, eventsOffset: secEventsOffset, sessLimit: n, sessOffset: 0, severity: securityEventFilter, dateFrom: securityDateFrom, dateTo: securityDateTo }); }}
                                      className={`rounded-lg px-2.5 py-1 text-[11px] font-black ring-1 transition ${secSessLimit === n && secSessOffset === 0 ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-slate-600 ring-slate-200 hover:ring-rose-300"}`}
                                    >Son {n}</button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {userSessions.length === 0 ? (
                              <p className="mt-2 text-sm font-medium text-slate-500">Oturum kaydı yok.</p>
                            ) : (
                              <div className="mt-3 grid gap-2">
                                {userSessions.map((s) => {
                                  const isActive  = s.is_active === true;
                                  const endReason = s.end_reason ? (END_REASON_LABELS[String(s.end_reason)] ?? String(s.end_reason)) : null;
                                  const statusLabel = isActive ? "Aktif" : endReason === "Admin sonlandırdı" ? "Sonlandırıldı" : "Pasif";
                                  const statusCls   = isActive ? "bg-emerald-100 text-emerald-900 ring-emerald-200" : endReason === "Admin sonlandırdı" ? "bg-rose-100 text-rose-900 ring-rose-200" : "bg-slate-100 text-slate-600 ring-slate-200";
                                  return (
                                    <div key={String(s.id)} className={`rounded-xl border px-4 py-3 text-sm ${isActive ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white/70"}`}>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${statusCls}`}>{statusLabel}</span>
                                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-100">{String(s.platform ?? "desktop")}</span>
                                        <span className="font-bold text-slate-900">{String(s.city ?? "—")}{s.country ? `, ${String(s.country)}` : ""}</span>
                                        <span className="font-mono text-xs text-slate-500">{String(s.ip_address ?? "")}</span>
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Giriş: {new Date(String(s.created_at)).toLocaleString("tr-TR")}
                                        {s.ended_at ? ` · Kapandı: ${new Date(String(s.ended_at)).toLocaleString("tr-TR")}` : ""}
                                        {endReason ? ` (${endReason})` : ""}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {hasDateFilter && userSessions.length < secSessTotal ? (
                              <button type="button"
                                onClick={() => { const next = secSessOffset + 25; setSecSessOffset(next); void fetchSecurityPaged({ eventsLimit: secEventsLimit, eventsOffset: secEventsOffset, sessLimit: 25, sessOffset: next, severity: securityEventFilter, dateFrom: securityDateFrom, dateTo: securityDateTo, appendSessions: true }); }}
                                className="mt-3 rounded-xl border-2 border-rose-200 bg-white px-4 py-1.5 text-sm font-black text-rose-700 transition hover:bg-rose-50">
                                Daha Fazla Yükle ({secSessTotal - userSessions.length} kaldı)
                              </button>
                            ) : null}
                          </>
                        );
                      })()}

                      {/* ── Güvenlik Olayları ─────────────────────────────── */}
                      {(() => {
                        const hasDateFilter = !!(securityDateFrom || securityDateTo);
                        return (
                          <div className="mt-6">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-base font-black text-slate-900">
                                Güvenlik Olayları <span className="text-sm font-medium text-slate-400">({securityEvents.length}/{secEventsTotal})</span>
                              </h3>
                              {!hasDateFilter ? (
                                <div className="flex gap-1">
                                  {([5, 10, 25] as const).map((n) => (
                                    <button key={n} type="button"
                                      onClick={() => { setSecEventsLimit(n); void fetchSecurityPaged({ eventsLimit: n, eventsOffset: 0, sessLimit: secSessLimit, sessOffset: secSessOffset, severity: securityEventFilter, dateFrom: securityDateFrom, dateTo: securityDateTo }); }}
                                      className={`rounded-lg px-2.5 py-1 text-[11px] font-black ring-1 transition ${secEventsLimit === n && secEventsOffset === 0 ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-slate-600 ring-slate-200 hover:ring-rose-300"}`}
                                    >Son {n}</button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {securityEvents.length === 0 ? (
                              <p className="mt-2 text-sm font-medium text-slate-500">Kayıtlı güvenlik olayı yok.</p>
                            ) : (
                              <div className="mt-3 grid gap-2">
                                {securityEvents.map((ev) => (
                                  <div key={String(ev.id)} className={`rounded-xl border px-4 py-3 text-sm ${ev.severity === "high" ? "border-rose-300 bg-rose-50/80" : ev.severity === "medium" ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-white/70"}`}>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${ev.severity === "high" ? "bg-rose-100 text-rose-900 ring-rose-300" : ev.severity === "medium" ? "bg-amber-100 text-amber-900 ring-amber-300" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                                        {ev.severity === "high" ? "Yüksek Risk" : ev.severity === "medium" ? "Şüpheli" : "Bilgilendirme"}
                                      </span>
                                      <span className="font-bold text-slate-900">{String(ev.message ?? "")}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">{String(ev.city ?? "—")}{ev.country ? `, ${String(ev.country)}` : ""} · IP: {String(ev.ip_address ?? "—")}</p>
                                    <p className="mt-0.5 text-xs text-slate-400">{new Date(String(ev.created_at)).toLocaleString("tr-TR")}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {hasDateFilter && securityEvents.length < secEventsTotal ? (
                              <button type="button"
                                onClick={() => { const next = secEventsOffset + 25; setSecEventsOffset(next); void fetchSecurityPaged({ eventsLimit: 25, eventsOffset: next, sessLimit: secSessLimit, sessOffset: secSessOffset, severity: securityEventFilter, dateFrom: securityDateFrom, dateTo: securityDateTo, appendEvents: true }); }}
                                className="mt-3 rounded-xl border-2 border-rose-200 bg-white px-4 py-1.5 text-sm font-black text-rose-700 transition hover:bg-rose-50">
                                Daha Fazla Yükle ({secEventsTotal - securityEvents.length} kaldı)
                              </button>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              ) : null}
            </section>

            {/* ── Aktif Cihazlar & Güvenlik Özeti ─────────────────────── */}
            <section className={`${panelClass} border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/60`}>
              <button
                type="button"
                onClick={() => {
                  if (!showActiveSessions && !activeSessionsLoaded) {
                    void loadActiveSessions(user.id, currentAdminId);
                  }
                  setShowActiveSessions((o) => !o);
                }}
                className="flex w-full items-center gap-4 rounded-2xl border-2 border-sky-200/90 bg-white/80 px-4 py-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50/60 sm:px-5"
                aria-expanded={showActiveSessions}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md">
                  <Eye className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-sky-950 sm:text-xl">
                    Aktif Cihazlar & Güvenlik Özeti
                    {activeSessionsSummary ? (
                      <span className="ml-2 text-sm font-medium text-sky-600">
                        ({Number(activeSessionsSummary.totalActive ?? 0)} aktif cihaz)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-sky-900/70">
                    Gerçek zamanlı oturum durumu ve platform kullanımı
                  </p>
                </div>
                {activeSessionsLoaded ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void loadActiveSessions(user.id, currentAdminId); }}
                    disabled={activeSessionsLoading}
                    className="shrink-0 rounded-xl border-2 border-sky-200 bg-white px-3 py-1.5 text-xs font-black text-sky-800 transition hover:border-sky-400 hover:bg-sky-50 disabled:opacity-50"
                  >
                    {activeSessionsLoading ? <Loader2 className="inline h-3 w-3 animate-spin" aria-hidden /> : "Yenile"}
                  </button>
                ) : null}
                {/* Limit/lokasyon uyarı badge'leri (her zaman görünür) */}
                {activeSessionsSummary ? (() => {
                  const s   = activeSessionsSummary;
                  const lim = (s.limits ?? {}) as Record<string, number>;
                  const limitOver = Number(s.totalFresh ?? 0) > (lim.allowedActiveSessions ?? 2);
                  const locOver   = Number(s.distinctLocations ?? 0) > (lim.allowedLocations ?? 1);
                  return (
                    <>
                      {limitOver ? <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 ring-1 ring-rose-300">Limit Aşıldı</span> : null}
                      {locOver   ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 ring-1 ring-amber-300">Şüpheli Konum</span> : null}
                    </>
                  );
                })() : null}
                <ChevronDown className={`h-6 w-6 shrink-0 text-sky-700 transition-transform ${showActiveSessions ? "rotate-180" : ""}`} aria-hidden />
              </button>

              {showActiveSessions ? (
                <div className="mt-5 border-t border-sky-200/70 pt-5">
                  {activeSessionsLoading && !activeSessionsLoaded ? (
                    <div className="flex items-center justify-center gap-3 py-10">
                      <Loader2 className="h-8 w-8 animate-spin text-sky-500" aria-hidden />
                      <span className="font-bold text-slate-600">Yükleniyor…</span>
                    </div>
                  ) : activeSessionsSummary ? (
                    <>
                      {/* ── Özet sayaç kartları ────────────────────────── */}
                      {(() => {
                        const s   = activeSessionsSummary;
                        const lim = (s.limits ?? {}) as Record<string, number>;
                        const bp  = (s.byPlatform ?? {}) as Record<string, number>;
                        const statItems = [
                          { label: "Toplam Aktif", current: Number(s.totalFresh ?? 0), limit: lim.allowedActiveSessions ?? 2 },
                          { label: "Lokasyon",     current: Number(s.distinctLocations ?? 0), limit: lim.allowedLocations ?? 1 },
                          { label: "Bilgisayar",   current: bp.desktop ?? 0, limit: lim.allowedDesktopSessions ?? 1 },
                          { label: "Mobil",        current: bp.mobile  ?? 0, limit: lim.allowedMobileSessions  ?? 1 },
                          { label: "Tablet",       current: bp.tablet  ?? 0, limit: lim.allowedTabletSessions  ?? 0 },
                          { label: "Tanınmayan",   current: bp.unknown ?? 0, limit: lim.allowedUnknownSessions ?? 0 },
                        ];
                        return (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                            {statItems.map((item) => {
                              const over = item.limit > 0 && item.current > item.limit;
                              return (
                                <div key={item.label} className={`rounded-2xl border-2 p-3 text-center ${over ? "border-rose-300 bg-rose-50" : "border-white bg-white/80 shadow-sm"}`}>
                                  <p className="text-xs font-bold text-slate-500">{item.label}</p>
                                  <p className={`mt-1 text-2xl font-black tabular-nums ${over ? "text-rose-700" : "text-slate-900"}`}>
                                    {item.current}<span className="text-base font-medium text-slate-400">/{item.limit}</span>
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {activeSessionsSummary.securityExempt === true ? (
                        <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50/70 px-4 py-3">
                          <p className="text-sm font-black text-rose-900">Güvenlik İstisnası Aktif — Oturum kapatma yapılmaz.</p>
                        </div>
                      ) : null}

                      {/* ── Tarih Filtresi ──────────────────────────────── */}
                      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-100 bg-white/60 px-4 py-3">
                        <Filter className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        <input
                          type="date"
                          value={devicesDateFrom}
                          onChange={(e) => { setDevicesDateFrom(e.target.value); setShowActiveSessions(false); }}
                          className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                        />
                        <span className="text-xs text-slate-400">—</span>
                        <input
                          type="date"
                          value={devicesDateTo}
                          onChange={(e) => { setDevicesDateTo(e.target.value); setShowActiveSessions(false); }}
                          className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                        />
                        {(devicesDateFrom || devicesDateTo) ? (
                          <button type="button"
                            onClick={() => { setDevicesDateFrom(""); setDevicesDateTo(""); setShowActiveSessions(false); }}
                            className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200">
                            Temizle
                          </button>
                        ) : null}
                      </div>

                      {/* ── Cihaz Listesi ──────────────────────────────── */}
                      {(() => {
                        const PLATFORM_LABELS: Record<string, string> = { desktop: "Bilgisayar", mobile: "Telefon", tablet: "Tablet", unknown: "Tanınmayan" };
                        const END_REASON_LABELS: Record<string, string> = {
                          stale: "Pasife düştü", new_login: "Yeni giriş",
                          session_limit: "Oturum limiti", admin_terminated: "Admin sonlandırdı",
                        };
                        function parseBrowser(ua: string): string {
                          const lower = ua.toLowerCase();
                          if (lower.includes("firefox")) return "Firefox";
                          if (lower.includes("edg/") || lower.includes("edge")) return "Edge";
                          if (lower.includes("chrome") && !lower.includes("chromium")) return "Chrome";
                          if (lower.includes("safari") && !lower.includes("chrome")) return "Safari";
                          if (lower.includes("opera") || lower.includes("opr/")) return "Opera";
                          return "Tarayıcı";
                        }
                        const hasDateFilter = !!(devicesDateFrom || devicesDateTo);
                        return (
                          <div className="mt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-base font-black text-slate-900">Oturumlar <span className="text-sm font-medium text-slate-400">({activeSessions.length}/{actSessTotal})</span></h3>
                              {!hasDateFilter ? (
                                <div className="flex gap-1">
                                  {([5, 10, 25] as const).map((n) => (
                                    <button key={n} type="button"
                                      onClick={() => { void fetchActiveSessionsPaged({ limit: n, offset: 0, dateFrom: devicesDateFrom, dateTo: devicesDateTo }); }}
                                      className={`rounded-lg px-2.5 py-1 text-[11px] font-black ring-1 transition ${actSessLimit === n && actSessOffset === 0 ? "bg-sky-600 text-white ring-sky-600" : "bg-white text-slate-600 ring-slate-200 hover:ring-sky-300"}`}
                                    >Son {n}</button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {activeSessions.length === 0 ? (
                              <p className="mt-2 text-sm font-medium text-slate-500">Oturum yok.</p>
                            ) : (
                              <div className="mt-3 grid gap-2">
                                {activeSessions.map((s: Record<string, unknown>) => {
                                  const isActive  = s.is_active === true;
                                  const platform  = String(s.platform  ?? "desktop");
                                  const endReason = s.end_reason ? (END_REASON_LABELS[String(s.end_reason)] ?? String(s.end_reason)) : null;
                                  const statusLabel = isActive ? "Aktif" : endReason === "Admin sonlandırdı" ? "Sonlandırıldı" : "Pasif";
                                  const statusCls   = isActive ? "bg-sky-100 text-sky-900 ring-sky-200" : endReason === "Admin sonlandırdı" ? "bg-rose-100 text-rose-900 ring-rose-200" : "bg-slate-100 text-slate-600 ring-slate-200";
                                  const platformIcon = platform === "mobile" ? <Smartphone className="h-3 w-3" /> : platform === "tablet" ? <Tablet className="h-3 w-3" /> : <Monitor className="h-3 w-3" />;
                                  const browser   = parseBrowser(String(s.user_agent ?? ""));
                                  const city      = String(s.city      ?? "—");
                                  const country   = String(s.country   ?? "");
                                  const ip        = String(s.ip_address ?? "—");
                                  const lastSeen  = s.last_seen_at ? new Date(String(s.last_seen_at)).toLocaleString("tr-TR") : "—";
                                  const createdAt = s.created_at   ? new Date(String(s.created_at)).toLocaleString("tr-TR")   : "—";
                                  const sid       = String(s.id);
                                  return (
                                    <div key={sid} className={`rounded-xl border px-4 py-3 text-sm ${isActive ? "border-sky-200 bg-sky-50/60" : "border-slate-200 bg-white/70 opacity-75"}`}>
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                          {/* Durum + Platform + Lokasyon satırı */}
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${statusCls}`}>{statusLabel}</span>
                                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-800 ring-1 ring-indigo-100">
                                              {platformIcon} {PLATFORM_LABELS[platform] ?? platform}
                                            </span>
                                            <span className="font-bold text-slate-900">{city}{country ? `, ${country}` : ""}</span>
                                          </div>
                                          {/* IP + Tarayıcı satırı */}
                                          <div className="flex flex-wrap items-center gap-3">
                                            <span className="font-mono text-xs text-slate-500">{ip}</span>
                                            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-100">{browser}</span>
                                          </div>
                                          {/* Zaman bilgisi */}
                                          <div className="text-xs text-slate-400">
                                            <span>Giriş: {createdAt}</span>
                                            <span className="mx-1.5">·</span>
                                            <span>Son: {lastSeen}</span>
                                            {endReason ? <><span className="mx-1.5">·</span><span className="text-rose-500">{endReason}</span></> : null}
                                          </div>
                                        </div>
                                        {isActive ? (
                                          <button type="button" onClick={() => void terminateSession(sid)} disabled={terminatingSessionId === sid}
                                            className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-xl border-2 border-rose-200 bg-white px-3 text-xs font-black text-rose-800 transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50 sm:self-center">
                                            {terminatingSessionId === sid ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                                            Sonlandır
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {hasDateFilter && activeSessions.length < actSessTotal ? (
                              <button type="button"
                                onClick={() => { void fetchActiveSessionsPaged({ limit: 25, offset: actSessOffset + 25, dateFrom: devicesDateFrom, dateTo: devicesDateTo, append: true }); }}
                                className="mt-3 rounded-xl border-2 border-sky-200 bg-white px-4 py-1.5 text-sm font-black text-sky-700 transition hover:bg-sky-50">
                                Daha Fazla Yükle ({actSessTotal - activeSessions.length} kaldı)
                              </button>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="text-sm font-medium text-slate-500">Veri yüklenemedi.</p>
                  )}
                </div>
              ) : null}
            </section>

            {/* ── Lisans & Oturum Limitleri ────────────────────────────── */}
            <section className={`${panelClass} border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/60`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
                    <KeyRound className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-indigo-950">Lisans & Oturum Limitleri</h2>
                    <p className="mt-0.5 text-sm font-medium text-indigo-900/70">
                      Cihaz, lokasyon ve güvenlik politikası istisnası
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLicenseHelp((o) => !o)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-800 transition hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <HelpCircle className="h-4 w-4" aria-hidden />
                  Kullanım Kılavuzu
                </button>
              </div>

              {/* ── Yardım Kutusu ──────────────────────────────────────── */}
              {showLicenseHelp ? (
                <div className="mt-4 rounded-2xl border-2 border-indigo-200/80 bg-indigo-50/60 p-5 text-sm">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="font-black text-indigo-950">Lisans Türü</p>
                      <ul className="mt-2 space-y-1 text-indigo-900/80">
                        <li><span className="font-bold">Bireysel:</span> Standart tek kullanıcı</li>
                        <li><span className="font-bold">Profesyonel:</span> Birden fazla cihaz kullanan uzman</li>
                        <li><span className="font-bold">Aile:</span> Aynı aile içinde kullanım</li>
                        <li><span className="font-bold">Ortak:</span> Farklı şehir/ülkelerde ortak kullanım</li>
                        <li><span className="font-bold">Ekip:</span> Kurumsal çok kullanıcılı kullanım</li>
                        <li><span className="font-bold">Özel:</span> Admin tarafından tanımlanan özel kurallar</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-black text-indigo-950">İzinli Lokasyon</p>
                      <p className="mt-2 text-indigo-900/80">Aynı anda kullanılabilecek farklı şehir/ülke sayısı.</p>
                      <ul className="mt-1 space-y-0.5 text-indigo-900/80">
                        <li><span className="font-bold">1:</span> Yalnızca 1 şehir (Ankara veya İstanbul)</li>
                        <li><span className="font-bold">2:</span> Ankara + İstanbul aynı anda</li>
                        <li><span className="font-bold">3:</span> Ankara + İstanbul + Berlin aynı anda</li>
                      </ul>
                      <p className="mt-2 font-black text-indigo-950">Toplam Oturum</p>
                      <p className="mt-1 text-indigo-900/80">Aynı anda açık kalabilecek toplam cihaz sayısı.</p>
                    </div>
                    <div>
                      <p className="font-black text-indigo-950">Cihaz Limitleri</p>
                      <ul className="mt-2 space-y-1 text-indigo-900/80">
                        <li><span className="font-bold">Bilgisayar/Web:</span> Masaüstü veya dizüstü</li>
                        <li><span className="font-bold">Telefon/Mobil:</span> Telefon uygulaması veya mobil tarayıcı</li>
                        <li><span className="font-bold">Tablet:</span> Tablet cihazlar</li>
                        <li><span className="font-bold">Tanınmayan:</span> Platformu tespit edilemeyen cihazlar</li>
                        <li className="text-xs text-indigo-700/70">0 = o platform için özel limit yok, toplam limitiyle yönetilir</li>
                      </ul>
                      <p className="mt-2 font-black text-indigo-950">Güvenlik Modu</p>
                      <ul className="mt-1 space-y-0.5 text-indigo-900/80">
                        <li><span className="font-bold">Sıkı:</span> Daha agresif koruma</li>
                        <li><span className="font-bold">Normal:</span> Önerilen</li>
                        <li><span className="font-bold">Esnek:</span> Seyahat eden veya çok cihaz kullananlar</li>
                      </ul>
                      <p className="mt-2 font-black text-indigo-950">Güvenlik İstisnası</p>
                      <p className="mt-1 text-indigo-900/80">Açılırsa tüm güvenlik kısıtları devre dışı kalır.</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Hazır Presetler */}
              <div className="mt-5">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-indigo-800">Hazır Presetler</p>
                <div className="flex flex-wrap gap-2">
                  {LICENSE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setLicenseDraft({ ...preset.settings })}
                      className="rounded-xl border-2 border-indigo-200 bg-white px-3 py-1.5 text-sm font-black text-indigo-900 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* Lisans Türü */}
                <div>
                  <label className={labelClass} htmlFor="license-type">Lisans Türü</label>
                  <select
                    id="license-type"
                    value={licenseDraft.licenseType}
                    onChange={(e) => setLicenseDraft((d) => ({ ...d, licenseType: e.target.value as LicenseSettings["licenseType"] }))}
                    className={inputClass}
                  >
                    {LICENSE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Güvenlik Modu */}
                <div>
                  <label className={labelClass} htmlFor="security-mode">Güvenlik Modu</label>
                  <select
                    id="security-mode"
                    value={licenseDraft.securityMode}
                    onChange={(e) => setLicenseDraft((d) => ({ ...d, securityMode: e.target.value as LicenseSettings["securityMode"] }))}
                    className={inputClass}
                  >
                    {SECURITY_MODE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Lokasyon Limiti */}
                <div>
                  <label className={labelClass} htmlFor="allowed-locations">İzinli Lokasyon</label>
                  <input id="allowed-locations" type="number" min={1} max={20}
                    value={licenseDraft.allowedLocations}
                    onChange={(e) => setLicenseDraft((d) => ({ ...d, allowedLocations: Number(e.target.value) }))}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Platform Limitleri */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-indigo-800">Cihaz Bazlı Oturum Limitleri</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <label className={labelClass} htmlFor="allowed-total">Toplam Oturum</label>
                    <input id="allowed-total" type="number" min={1} max={50}
                      value={licenseDraft.allowedActiveSessions}
                      onChange={(e) => setLicenseDraft((d) => ({ ...d, allowedActiveSessions: Number(e.target.value) }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="allowed-desktop">Bilgisayar/Web</label>
                    <input id="allowed-desktop" type="number" min={0} max={20}
                      value={licenseDraft.allowedDesktopSessions}
                      onChange={(e) => setLicenseDraft((d) => ({ ...d, allowedDesktopSessions: Number(e.target.value) }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="allowed-mobile">Telefon/Mobil</label>
                    <input id="allowed-mobile" type="number" min={0} max={20}
                      value={licenseDraft.allowedMobileSessions}
                      onChange={(e) => setLicenseDraft((d) => ({ ...d, allowedMobileSessions: Number(e.target.value) }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="allowed-tablet">Tablet</label>
                    <input id="allowed-tablet" type="number" min={0} max={10}
                      value={licenseDraft.allowedTabletSessions}
                      onChange={(e) => setLicenseDraft((d) => ({ ...d, allowedTabletSessions: Number(e.target.value) }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="allowed-unknown">Tanınmayan</label>
                    <input id="allowed-unknown" type="number" min={0} max={5}
                      value={licenseDraft.allowedUnknownSessions}
                      onChange={(e) => setLicenseDraft((d) => ({ ...d, allowedUnknownSessions: Number(e.target.value) }))}
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs font-medium text-indigo-700/70">
                  0 = bu cihaz türü için ayrı platform limiti uygulanmaz; toplam oturum limiti içinde değerlendirilir
                </p>
              </div>

              {/* ── Limit Özeti ─────────────────────────────────────────── */}
              {(() => {
                const d = licenseDraft;
                const platformTotal =
                  d.allowedDesktopSessions +
                  d.allowedMobileSessions +
                  d.allowedTabletSessions +
                  d.allowedUnknownSessions;
                const hasZero =
                  d.allowedDesktopSessions === 0 ||
                  d.allowedMobileSessions  === 0 ||
                  d.allowedTabletSessions  === 0 ||
                  d.allowedUnknownSessions === 0;
                const effectiveMax =
                  platformTotal === 0
                    ? d.allowedActiveSessions
                    : Math.min(d.allowedActiveSessions, platformTotal);

                const status: "over" | "match" | "under" | "zero" =
                  platformTotal === 0
                    ? "zero"
                    : platformTotal > d.allowedActiveSessions
                      ? "over"
                      : platformTotal === d.allowedActiveSessions
                        ? "match"
                        : "under";

                const statusConfig = {
                  over: {
                    border:  "border-amber-300",
                    bg:      "bg-amber-50/80",
                    icon:    "⚠",
                    iconCls: "text-amber-600",
                    title:   "Dikkat: Platform toplamı Toplam Limit'ten yüksek",
                    titleCls:"text-amber-900",
                    msg:     `Platform limitleri toplamı (${platformTotal}) Toplam Oturum Limiti'nden (${d.allowedActiveSessions}) yüksek. Bu kullanıcı aynı anda en fazla ${d.allowedActiveSessions} cihaz kullanabilir. Yeni bir cihaz türü açılırsa en eski cihaz kapanabilir.`,
                    msgCls:  "text-amber-800",
                  },
                  match: {
                    border:  "border-emerald-300",
                    bg:      "bg-emerald-50/80",
                    icon:    "✓",
                    iconCls: "text-emerald-600",
                    title:   "Yapılandırma uyumlu",
                    titleCls:"text-emerald-900",
                    msg:     `Toplam limit (${d.allowedActiveSessions}) ve platform limitleri toplamı (${platformTotal}) eşit. Her platform için belirlenen kota tam olarak uygulanır.`,
                    msgCls:  "text-emerald-800",
                  },
                  under: {
                    border:  "border-sky-300",
                    bg:      "bg-sky-50/80",
                    icon:    "ℹ",
                    iconCls: "text-sky-600",
                    title:   "Bilgi: Pratik maksimum platform limitleriyle belirleniyor",
                    titleCls:"text-sky-900",
                    msg:     `Toplam limit (${d.allowedActiveSessions}) daha yüksek olsa da platform limitleri toplamı (${platformTotal}) nedeniyle kullanıcı pratikte en fazla ${platformTotal} cihaz açık tutabilir.`,
                    msgCls:  "text-sky-800",
                  },
                  zero: {
                    border:  "border-slate-300",
                    bg:      "bg-slate-50/80",
                    icon:    "ℹ",
                    iconCls: "text-slate-500",
                    title:   "Tüm platform limitleri 0",
                    titleCls:"text-slate-800",
                    msg:     `Tüm platform limitleri 0 olduğunda yalnızca Toplam Oturum Limiti (${d.allowedActiveSessions}) geçerlidir. Her cihaz türünden oturum açılabilir.`,
                    msgCls:  "text-slate-600",
                  },
                }[status];

                return (
                  <div className={`mt-4 rounded-2xl border-2 p-4 ${statusConfig.border} ${statusConfig.bg}`}>
                    {/* Başlık satırı */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={`text-sm font-black ${statusConfig.titleCls}`}>
                        <span className={`mr-1.5 ${statusConfig.iconCls}`}>{statusConfig.icon}</span>
                        {statusConfig.title}
                      </p>
                      {/* Toplamı X yap butonu — platformTotal > 0 ve toplam ≠ platform toplamı */}
                      {platformTotal > 0 && platformTotal !== d.allowedActiveSessions ? (
                        <button
                          type="button"
                          onClick={() => setLicenseDraft((prev) => ({ ...prev, allowedActiveSessions: platformTotal }))}
                          className="inline-flex items-center gap-1 rounded-xl border-2 border-indigo-300 bg-white px-3 py-1 text-xs font-black text-indigo-800 shadow-sm transition hover:border-indigo-500 hover:bg-indigo-50"
                        >
                          Toplamı {platformTotal} yap
                        </button>
                      ) : null}
                    </div>

                    {/* Açıklama */}
                    <p className={`mt-1.5 text-xs font-medium leading-relaxed ${statusConfig.msgCls}`}>
                      {statusConfig.msg}
                    </p>

                    {/* Özet sayaçlar */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/60 pt-3 text-xs font-bold text-slate-700">
                      <span>Toplam Oturum Limiti: <span className="font-black text-slate-900">{d.allowedActiveSessions}</span></span>
                      <span>Platform Toplamı: <span className="font-black text-slate-900">{platformTotal}</span></span>
                      <span>
                        Etkin Maksimum:{" "}
                        <span className="font-black text-slate-900">
                          {platformTotal === 0 ? `${d.allowedActiveSessions} (platform limitsiz)` : `${effectiveMax}`}
                          {hasZero && platformTotal > 0 ? " *" : ""}
                        </span>
                      </span>
                      {hasZero && platformTotal > 0 ? (
                        <span className="w-full text-[10px] font-medium text-slate-500">
                          * 0 değeri olan platform türleri sınırsız sayılır; gerçek maksimum koşullara göre değişebilir.
                        </span>
                      ) : null}
                    </div>

                    {/* Sabit kural hatırlatıcı */}
                    <p className="mt-2 text-[10px] font-medium text-slate-500">
                      Toplam Oturum her zaman üst sınırdır. Platform limitleri bu toplamın cihaz türlerine dağılımıdır.
                    </p>
                  </div>
                );
              })()}

              {/* Admin Notu */}
              <div className="mt-4">
                <label className={labelClass} htmlFor="license-note">Admin Notu</label>
                <textarea
                  id="license-note"
                  rows={2}
                  maxLength={500}
                  value={licenseDraft.licenseNote}
                  onChange={(e) => setLicenseDraft((d) => ({ ...d, licenseNote: e.target.value }))}
                  placeholder="İsteğe bağlı not…"
                  className="mt-2 w-full resize-none rounded-2xl border-2 border-indigo-100 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </div>

              {/* Güvenlik İstisnası */}
              <div className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-rose-200/80 bg-rose-50/60 px-4 py-4">
                <input
                  id="security-exempt"
                  type="checkbox"
                  checked={licenseDraft.securityExempt}
                  onChange={(e) => setLicenseDraft((d) => ({ ...d, securityExempt: e.target.checked }))}
                  className="mt-0.5 h-5 w-5 accent-rose-600"
                />
                <div>
                  <label htmlFor="security-exempt" className="text-sm font-black text-rose-950 cursor-pointer">
                    Güvenlik İstisnası — Tüm güvenlik kısıtlarından muaf tut
                  </label>
                  <p className="mt-1 text-xs font-medium text-rose-800/80">
                    İşaretlendiğinde bu kullanıcı için oturum kapatma ve risk olayı üretilmez.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => void saveLicenseSettings()}
                  disabled={savingLicense}
                  className={saveBtnClass}
                >
                  {savingLicense ? (
                    <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Kaydediliyor…</>
                  ) : "Lisans Ayarlarını Kaydet"}
                </button>
              </div>
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
                    enabled={user.modulePermissions[key] === true}
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

      {/* ── P2: Pasife alma onayı (tüm cihazlardan çıkış uyarısı) ───────────── */}
      {deactivateOpen && user ? (
        <div
          className={deleteModalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-title"
        >
          <div className={deleteModalPanel}>
            <button
              type="button"
              onClick={() => setDeactivateOpen(false)}
              disabled={actionUserId === user.id}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-500 transition hover:bg-white/80 hover:text-slate-800 disabled:opacity-50"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 id="deactivate-title" className="pr-8 text-xl font-black text-rose-950 sm:text-2xl">
              Kullanıcıyı pasife almak üzeresiniz
            </h2>
            <p className="mt-4 text-sm font-medium leading-relaxed text-slate-700">
              Bu işlem kullanıcının erişimini durdurur ve <span className="font-black">masaüstü, mobil ve tablet
              dahil tüm cihazlardaki oturumlarını kapatır</span>. Kullanıcı yeniden aktif yapılana ve tekrar giriş
              yapana kadar sisteme erişemez.
            </p>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeactivateOpen(false)}
                disabled={actionUserId === user.id}
                className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void confirmDeactivate()}
                disabled={actionUserId === user.id}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-rose-300 bg-rose-600 px-5 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionUserId === user.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    İşleniyor…
                  </>
                ) : (
                  "Pasife al ve çıkış yaptır"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── P2: Tüm cihazlardan çıkış — adım 1 (bilgilendirme) ──────────────── */}
      {logoutAllStep === "confirm" && user ? (
        <div
          className={deleteModalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-all-confirm-title"
        >
          <div className={deleteModalPanel}>
            <button
              type="button"
              onClick={closeLogoutAllModal}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-500 transition hover:bg-white/80 hover:text-slate-800"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 id="logout-all-confirm-title" className="pr-8 text-xl font-black text-orange-950 sm:text-2xl">
              Tüm cihazlardan çıkış
            </h2>
            <p className="mt-4 text-sm font-medium leading-relaxed text-slate-700">
              Kullanıcının <span className="font-black">masaüstü, mobil ve tablet dahil tüm aktif oturumları</span>{" "}
              sonlandırılır. Hesap durumu, şifre ve modül izinleri değişmez. Kullanıcı isterse tekrar giriş
              yapabilir (pasifse giriş yapamaz).
            </p>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeLogoutAllModal}
                className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setLogoutAllPhrase("");
                  setLogoutAllStep("verify");
                }}
                className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-orange-300 bg-orange-600 px-5 text-sm font-black text-white transition hover:bg-orange-700"
              >
                Devam et
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── P2: Tüm cihazlardan çıkış — adım 2 (tam metin onayı) ────────────── */}
      {logoutAllStep === "verify" && user ? (
        <div
          className={deleteModalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-all-verify-title"
        >
          <div className={deleteModalPanel}>
            <button
              type="button"
              onClick={closeLogoutAllModal}
              disabled={logoutAllSubmitting}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-500 transition hover:bg-white/80 hover:text-slate-800 disabled:opacity-50"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 id="logout-all-verify-title" className="pr-8 text-xl font-black text-orange-950 sm:text-2xl">
              Onay gerekli
            </h2>
            <p className="mt-3 text-sm font-medium text-slate-700">
              Onaylamak için aşağıya tam olarak yazın:
            </p>
            <p className="mt-1 text-sm font-black text-orange-900">{LOGOUT_ALL_PHRASE}</p>
            <input
              type="text"
              value={logoutAllPhrase}
              onChange={(e) => setLogoutAllPhrase(e.target.value)}
              disabled={logoutAllSubmitting}
              className="mt-4 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none ring-orange-300 focus:border-orange-400 focus:ring-2 disabled:opacity-60"
              placeholder={LOGOUT_ALL_PHRASE}
            />
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setLogoutAllStep("confirm")}
                disabled={logoutAllSubmitting}
                className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Geri
              </button>
              <button
                type="button"
                onClick={() => void executeLogoutAll()}
                disabled={logoutAllSubmitting || logoutAllPhrase.trim() !== LOGOUT_ALL_PHRASE}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-orange-300 bg-orange-600 px-5 text-sm font-black text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {logoutAllSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Çıkış yaptırılıyor…
                  </>
                ) : (
                  "Tüm cihazlardan çıkış yaptır"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
