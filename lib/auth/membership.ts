import type { YasamUser } from "@/lib/auth/yasamUser";
import {
  hasMembershipAccessForRow,
  normalizeMembershipToken,
  parseMembershipPackageType,
} from "@/lib/auth/membershipAccessCore";

export type PackageType = "trial" | "pro" | "premium";

export type MembershipStatus = "trial" | "active" | "expired" | "suspended";

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

// SAF çekirdeğe delege (sunucu üyelik kapısı ile TEK KAYNAK — membershipAccessCore).
function normalizeToken(value?: string): string {
  return normalizeMembershipToken(value);
}

function parsePackageType(raw?: string): PackageType | undefined {
  return parseMembershipPackageType(raw);
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

// FAZ 1: Deneme/Pro gösterimi (buildMembershipDisplay, kalan-gün hesabı) KALDIRILDI —
// yönetim göstergesi lib/admin/userManagement::buildManagedMembershipDisplay'den türer
// (onaylı uzman = Premium; hesap durumu = Aktif/Pasif).

/**
 * Onay sırasında yazılan legacy üyelik kolonları — YALNIZ Premium (FAZ 1: Deneme/Pro ürün
 * seçeneği KALDIRILDI; admin paket seçmez). Kolonlar teknik uyumluluk için doldurulur:
 * yh_grade_expert_premium sözleşmesi package_type VE plan = 'premium' ister.
 */
export function buildPremiumMembershipPayload(): Record<string, unknown> {
  const now = new Date().toISOString();
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

/**
 * Uzman erişimi — tek üyelik modeli (Premium-only): her ONAYLI uzman Premium'dur (onay RPC'leri
 * package_type/plan = premium yazar; Deneme/Pro seçeneği yok). Kural membershipAccessCore'da TEK
 * KAYNAK: admin → her zaman; uzman → active + approved + premium (paket yalnız KISITLAR, açmaz).
 * İstemci ve sunucu (requireModuleAccess / assertUserModuleAccess) aynı fonksiyonu kullanır.
 * Tarih alanları erişime GİRMEZ; erişimin kapatılması admin'in active=false / onay kararıdır.
 */
export function hasExpertMembershipAccess(user: YasamUser | null | undefined): boolean {
  if (!user) return false;
  // FAZ1 FINAL HARDENING: kural SAF çekirdekte (membershipAccessCore) — sunucu
  // requireModuleAccess aynı fonksiyonu kullanır (istemci/sunucu sapması yok).
  return hasMembershipAccessForRow(user as unknown as Record<string, unknown>);
}
