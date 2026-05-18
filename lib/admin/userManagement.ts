import {
  buildMembershipDisplay,
  parseMembershipFromRow,
  type MembershipDisplay,
  type MembershipSnapshot,
  type PackagePlanUi,
} from "@/lib/auth/membership";
import { buildPremiumModulePermissionsPayload } from "@/lib/auth/modulePermissions";
import {
  normalizeApprovalStatus,
  normalizeRole,
} from "@/lib/auth/yasamUser";

export const PACKAGE_PLAN_OPTIONS: { value: PackagePlanUi; label: string }[] = [
  { value: "trial", label: "Deneme" },
  { value: "pro", label: "Pro" },
  { value: "premium", label: "Premium" },
];

export type ManagedUserRole = "admin" | "expert";

export type ApprovalStatusUi = "pending" | "approved" | "rejected";

export const ADMIN_MODULE_UI_KEYS = [
  "clients",
  "appointments",
  "numerology",
  "stones",
  "reflexology",
  "energy_body",
  "aromatherapy",
  "personal_archive",
] as const;

export type AdminModuleUiKey = (typeof ADMIN_MODULE_UI_KEYS)[number];

export type AdminModulePermissions = Record<AdminModuleUiKey, boolean>;

export const ADMIN_MODULE_UI_LABELS: Record<AdminModuleUiKey, string> = {
  clients: "Danışan Yönetimi",
  appointments: "Ajanda",
  numerology: "Numeroloji",
  stones: "Doğaltaş",
  reflexology: "Refleksoloji",
  energy_body: "Biyoenerji",
  aromatherapy: "Aromaterapi",
  personal_archive: "Kişisel Arşiv",
};

export const DEFAULT_ADMIN_MODULE_PERMISSIONS: AdminModulePermissions = {
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

export type PaymentStatusUi = "paid" | "pending" | "overdue" | "exempt" | "unknown";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusUi, string> = {
  paid: "Ödendi",
  pending: "Bekliyor",
  overdue: "Gecikti",
  exempt: "Muaf",
  unknown: "Tanımsız",
};

export const PAYMENT_STATUS_SELECT_OPTIONS: {
  value: Exclude<PaymentStatusUi, "unknown">;
  label: string;
}[] = [
  { value: "paid", label: "Ödendi" },
  { value: "pending", label: "Bekliyor" },
  { value: "overdue", label: "Gecikti" },
  { value: "exempt", label: "Muaf" },
];

export type PaymentSnapshot = {
  status: PaymentStatusUi;
  statusLabel: string;
  lastPaymentAt?: string;
  lastPaymentLabel: string;
  nextPaymentAt?: string;
  nextPaymentLabel: string;
  paidAmountLabel: string;
  paidAmountRaw?: number;
  note?: string;
};

export type PaymentEditDraft = {
  status: PaymentStatusUi;
  lastPaymentDate: string;
  nextPaymentDate: string;
  paidAmount: string;
  note: string;
};

function pickPaymentString(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

function normalizePaymentToken(value?: string): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, "_");
}

function parsePaymentStatus(raw?: string): PaymentStatusUi {
  const token = normalizePaymentToken(raw);
  if (token === "paid" || token === "odendi" || token === "ödendi") return "paid";
  if (token === "pending" || token === "bekliyor" || token === "waiting") {
    return "pending";
  }
  if (token === "overdue" || token === "gecikti" || token === "late") return "overdue";
  if (token === "exempt" || token === "muaf") return "exempt";
  return "unknown";
}

export function formatPaymentDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPaidAmount(raw: unknown): { label: string; amount?: number } {
  if (raw == null || raw === "") return { label: "—" };
  const num = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (Number.isNaN(num)) return { label: String(raw) };
  return {
    label: new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(num),
    amount: num,
  };
}

export function parsePaymentFromRow(row: Record<string, unknown>): PaymentSnapshot {
  const statusValue = row.payment_status;
  const status =
    statusValue == null || String(statusValue).trim() === ""
      ? "unknown"
      : parsePaymentStatus(String(statusValue));

  const lastPaymentAt = pickPaymentString(row, [
    "last_payment_date",
    "last_payment_at",
    "son_odeme_tarihi",
  ]);
  const nextPaymentAt = pickPaymentString(row, [
    "next_payment_date",
    "next_payment_at",
    "sonraki_odeme_tarihi",
  ]);

  const paidRaw = row.paid_amount ?? row.paidAmount ?? row.odenen_tutar;
  const { label: paidAmountLabel, amount: paidAmountRaw } = formatPaidAmount(paidRaw);

  const note = pickPaymentString(row, ["payment_note", "paymentNote", "odeme_notu"]);

  return {
    status,
    statusLabel: PAYMENT_STATUS_LABELS[status],
    lastPaymentAt,
    lastPaymentLabel: formatPaymentDate(lastPaymentAt),
    nextPaymentAt,
    nextPaymentLabel: formatPaymentDate(nextPaymentAt),
    paidAmountLabel,
    paidAmountRaw,
    note,
  };
}

export function rowHasPaymentColumns(row: Record<string, unknown>): boolean {
  return "payment_status" in row;
}

export const PAYMENT_UPDATE_KEYS = [
  "payment_status",
  "last_payment_date",
  "next_payment_date",
  "paid_amount",
  "payment_note",
] as const;

export function buildPaymentUpdatePayload(
  draft: PaymentEditDraft,
): Record<string, unknown> {
  const status =
    draft.status === "unknown"
      ? null
      : (draft.status as Exclude<PaymentStatusUi, "unknown">);

  const paidTrimmed = draft.paidAmount.trim().replace(",", ".");
  const paidNum = paidTrimmed ? Number(paidTrimmed) : null;

  return {
    payment_status: status,
    last_payment_date: draft.lastPaymentDate.trim() || null,
    next_payment_date: draft.nextPaymentDate.trim() || null,
    paid_amount: paidNum != null && !Number.isNaN(paidNum) ? paidNum : null,
    payment_note: draft.note.trim() || null,
  };
}

export function isoToDateInputValue(iso?: string): string {
  if (!iso) return "";
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function paymentSnapshotToEditDraft(payment: PaymentSnapshot): PaymentEditDraft {
  return {
    status: payment.status === "unknown" ? "pending" : payment.status,
    lastPaymentDate: isoToDateInputValue(payment.lastPaymentAt),
    nextPaymentDate: isoToDateInputValue(payment.nextPaymentAt),
    paidAmount:
      payment.paidAmountRaw != null ? String(payment.paidAmountRaw) : "",
    note: payment.note ?? "",
  };
}

export function buildPaymentDisplayFromDraft(draft: PaymentEditDraft): PaymentSnapshot {
  const status =
    draft.status === "unknown" ? "unknown" : (draft.status as PaymentStatusUi);
  const lastPaymentAt = draft.lastPaymentDate
    ? new Date(`${draft.lastPaymentDate}T12:00:00`).toISOString()
    : undefined;
  const nextPaymentAt = draft.nextPaymentDate
    ? new Date(`${draft.nextPaymentDate}T12:00:00`).toISOString()
    : undefined;
  const paidNum = draft.paidAmount.trim()
    ? Number(draft.paidAmount.replace(",", "."))
    : undefined;
  const { label: paidAmountLabel, amount: paidAmountRaw } = formatPaidAmount(
    paidNum != null && !Number.isNaN(paidNum) ? paidNum : undefined,
  );

  return {
    status,
    statusLabel: PAYMENT_STATUS_LABELS[status],
    lastPaymentAt,
    lastPaymentLabel: formatPaymentDate(lastPaymentAt),
    nextPaymentAt,
    nextPaymentLabel: formatPaymentDate(nextPaymentAt),
    paidAmountLabel,
    paidAmountRaw,
    note: draft.note.trim() || undefined,
  };
}

export type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: ManagedUserRole;
  active: boolean;
  approvalStatus: ApprovalStatusUi;
  modulePermissions: AdminModulePermissions;
  membership: MembershipSnapshot;
  membershipDisplay: MembershipDisplay;
  payment: PaymentSnapshot;
  adminLevel?: string;
  createdAt?: string;
};

export function parseAdminModulePermissions(raw: unknown): AdminModulePermissions {
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

export function isUserPremiumPackage(user: ManagedUser): boolean {
  return user.membership.packageType === "premium";
}

export function premiumAdminModulePermissions(): AdminModulePermissions {
  return parseAdminModulePermissions(buildPremiumModulePermissionsPayload());
}

export function adminPermissionsToPayload(
  perms: AdminModulePermissions,
): Record<string, boolean> {
  return { ...perms };
}

export function formatCreatedAt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function mapApprovalStatus(value: unknown): ApprovalStatusUi {
  const s = normalizeApprovalStatus(value);
  if (s === "approved" || s === "rejected") return s;
  return "pending";
}

export function mapDbUser(row: Record<string, unknown>): ManagedUser {
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
    payment: parsePaymentFromRow(row),
    adminLevel:
      row.admin_level != null ? String(row.admin_level).trim() : undefined,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
  };
}

export function rowHasMembershipColumns(row: Record<string, unknown>): boolean {
  return (
    "package_type" in row ||
    "membership_status" in row ||
    "trial_ends_at" in row ||
    "plan" in row
  );
}

export function sortUsersForAdmin(list: ManagedUser[]): ManagedUser[] {
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
