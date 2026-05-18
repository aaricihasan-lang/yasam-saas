import type { YasamUser } from "@/lib/auth/yasamUser";
import { isAdminUser, isExpertAccountReady } from "@/lib/auth/yasamUser";

export type PackageType = "trial" | "pro" | "premium";

export type MembershipStatus = "trial" | "active" | "expired" | "suspended";

export type PackagePlanUi = PackageType;

const PACKAGE_LABELS: Record<PackageType, string> = {
  trial: "Deneme",
  pro: "Pro",
  premium: "Premium",
};

const STATUS_LABELS: Record<MembershipStatus, string> = {
  trial: "Deneme",
  active: "Aktif",
  expired: "Süresi Dolmuş",
  suspended: "Askıda",
};

const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

export type MembershipSnapshot = {
  packageType?: PackageType;
  membershipStatus?: MembershipStatus;
  effectiveStatus: MembershipStatus | "unknown";
  trialStartedAt?: string;
  trialEndsAt?: string;
  membershipStartedAt?: string;
  membershipEndsAt?: string | null;
  isUnlimited: boolean;
  isTrialExpired: boolean;
  adminLevel?: string;
};

export type MembershipDisplay = {
  packageLabel: string;
  statusLabel: string;
  trialEndLabel: string;
  remainingDaysLabel: string;
  durationNote: string;
};

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

function normalizeToken(value?: string): string {
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

function parsePackageType(raw?: string): PackageType | undefined {
  const token = normalizeToken(raw);
  if (token === "trial" || token === "deneme") return "trial";
  if (token === "pro") return "pro";
  if (token === "premium") return "premium";
  return undefined;
}

function parseMembershipStatus(raw?: string): MembershipStatus | undefined {
  const token = normalizeToken(raw);
  if (token === "trial" || token === "deneme") return "trial";
  if (token === "active" || token === "aktif") return "active";
  if (token === "expired" || token === "suresi_dolmus" || token === "passive") {
    return "expired";
  }
  if (token === "suspended" || token === "askida" || token === "askıda") {
    return "suspended";
  }
  return undefined;
}

function isPastIso(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() <= Date.now();
}

export function parseMembershipFromRow(
  row: Record<string, unknown>,
): MembershipSnapshot {
  const packageType =
    parsePackageType(
      pickString(row, ["package_type", "plan", "package", "subscription_plan"]),
    ) ?? undefined;

  const membershipStatus =
    parseMembershipStatus(
      pickString(row, ["membership_status", "subscription_status", "package_status"]),
    ) ?? undefined;

  const trialStartedAt = pickString(row, [
    "trial_started_at",
    "subscription_start_at",
    "membership_start_at",
  ]);
  const trialEndsAt = pickString(row, ["trial_ends_at", "subscription_end_at"]);
  const membershipStartedAt = pickString(row, ["membership_started_at"]);
  const membershipEndsAtRaw = pickString(row, ["membership_ends_at", "ends_at"]);

  const isUnlimited =
    packageType === "pro" || packageType === "premium";

  const isTrialExpired =
    packageType === "trial" &&
    (membershipStatus === "expired" || isPastIso(trialEndsAt));

  let effectiveStatus: MembershipStatus | "unknown" = membershipStatus ?? "unknown";
  if (isTrialExpired) {
    effectiveStatus = "expired";
  } else if (isUnlimited && membershipStatus !== "suspended") {
    effectiveStatus = membershipStatus === "trial" ? "active" : membershipStatus ?? "active";
  } else if (packageType === "trial" && !isTrialExpired) {
    effectiveStatus = "trial";
  }

  return {
    packageType,
    membershipStatus,
    effectiveStatus,
    trialStartedAt,
    trialEndsAt,
    membershipStartedAt,
    membershipEndsAt: membershipEndsAtRaw ?? null,
    isUnlimited,
    isTrialExpired,
    adminLevel: pickString(row, ["admin_level"]),
  };
}

export function parseMembershipFromUser(user: YasamUser): MembershipSnapshot {
  const row = user as unknown as Record<string, unknown>;
  return parseMembershipFromRow(row);
}

export function formatMembershipDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function computeRemainingDaysLabel(endIso?: string): string {
  if (!endIso) return "-";
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return "-";
  const days = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 1000));
  if (days < 0) return "0";
  return String(days);
}

export function buildMembershipDisplay(snapshot: MembershipSnapshot): MembershipDisplay {
  const packageLabel = snapshot.packageType
    ? PACKAGE_LABELS[snapshot.packageType]
    : "Tanımsız";

  const statusLabel =
    snapshot.effectiveStatus === "unknown"
      ? "Tanımsız"
      : STATUS_LABELS[snapshot.effectiveStatus];

  if (snapshot.isUnlimited) {
    return {
      packageLabel,
      statusLabel,
      trialEndLabel: "—",
      remainingDaysLabel: "Süresiz / Admin pasife alana kadar aktif",
      durationNote: "Süresiz / Admin pasife alana kadar aktif",
    };
  }

  if (snapshot.packageType === "trial") {
    return {
      packageLabel,
      statusLabel,
      trialEndLabel: formatMembershipDate(snapshot.trialEndsAt),
      remainingDaysLabel: snapshot.isTrialExpired
        ? "0"
        : computeRemainingDaysLabel(snapshot.trialEndsAt),
      durationNote: snapshot.isTrialExpired
        ? "Deneme süresi sona erdi"
        : "3 günlük deneme süresi",
    };
  }

  return {
    packageLabel,
    statusLabel,
    trialEndLabel: "—",
    remainingDaysLabel: "-",
    durationNote: "—",
  };
}

export function buildMembershipUpdatePayload(
  plan: PackagePlanUi,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const trialEnd = new Date(Date.now() + TRIAL_DURATION_MS).toISOString();

  if (plan === "trial") {
    return {
      package_type: "trial",
      membership_status: "trial",
      trial_started_at: now,
      trial_ends_at: trialEnd,
      membership_started_at: null,
      membership_ends_at: null,
      plan: "trial",
      subscription_status: "trial",
    };
  }

  if (plan === "pro") {
    return {
      package_type: "pro",
      membership_status: "active",
      membership_started_at: now,
      membership_ends_at: null,
      trial_started_at: null,
      trial_ends_at: null,
      plan: "pro",
      subscription_status: "active",
    };
  }

  return {
    package_type: "premium",
    membership_status: "active",
    membership_started_at: now,
    membership_ends_at: null,
    trial_started_at: null,
    trial_ends_at: null,
    plan: "premium",
    subscription_status: "active",
  };
}

export const MEMBERSHIP_PAYLOAD_KEYS = [
  "package_type",
  "membership_status",
  "trial_started_at",
  "trial_ends_at",
  "membership_started_at",
  "membership_ends_at",
  "plan",
  "subscription_status",
] as const;

export function filterMembershipPayloadForRow(
  payload: Record<string, unknown>,
  sampleRow: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!sampleRow) return payload;
  const filtered: Record<string, unknown> = {};
  for (const key of MEMBERSHIP_PAYLOAD_KEYS) {
    if (key in sampleRow) {
      filtered[key] = payload[key];
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : payload;
}

/** Uzman modül erişimi: onay+aktif ve üyelik süresi dolmamış */
export function hasExpertMembershipAccess(user: YasamUser | null | undefined): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  if (!isExpertAccountReady(user)) return false;

  const snapshot = parseMembershipFromUser(user);
  if (snapshot.effectiveStatus === "expired") return false;
  if (snapshot.effectiveStatus === "suspended") return false;
  if (snapshot.packageType === "trial" && snapshot.isTrialExpired) return false;

  if (snapshot.packageType === "pro" || snapshot.packageType === "premium") {
    return snapshot.effectiveStatus === "active" || snapshot.effectiveStatus === "trial";
  }

  if (snapshot.packageType === "trial") {
    return !snapshot.isTrialExpired;
  }

  return true;
}

export function inferPackagePlanFromSnapshot(
  snapshot: MembershipSnapshot,
): PackagePlanUi | "" {
  if (snapshot.packageType) return snapshot.packageType;
  return "";
}
