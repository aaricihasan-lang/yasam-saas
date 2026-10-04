/**
 * SAF (server-bağımsız) ÜYELİK erişim çekirdeği — FAZ1 FINAL HARDENING (AUTH, üyelik kapısı).
 *
 * TEK KAYNAK: "uzman modül kullanabilir mi?" üyelik kuralı burada. İstemci
 * (`lib/auth/membership.ts` → hasExpertMembershipAccess) ve sunucu
 * (`lib/auth/userGuard.ts` requireModuleAccess, `lib/auth/moduleAccess.ts`
 * assertUserModuleAccess) AYNI fonksiyonu kullanır → kural iki katmanda sapmaz.
 *
 * Kural (owner kararı, tek üyelik modeli): admin → her zaman; uzman → active + approved +
 * package premium. Tarih alanları (trial_ends_at, membership_ends_at, expired/suspended
 * statüsü) erişim kararına GİRMEZ; erişimin kapatılması admin'in manuel active=false kararıdır.
 *
 * SAFLIK: yalnız `approvalGate` (zero-import saf çekirdek) import edilir; IO/env/DB YOK.
 */
import { normalizeRole, normalizeApprovalStatus, resolveApprovalStatus } from "./approvalGate";

export type MembershipPackageType = "trial" | "pro" | "premium";

/** membership.ts ile birebir aynı normalize (TR karakter → ASCII, boşluk → _). */
export function normalizeMembershipToken(value?: string): string {
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

export function parseMembershipPackageType(raw?: string): MembershipPackageType | undefined {
  const token = normalizeMembershipToken(raw);
  if (token === "trial" || token === "deneme") return "trial";
  if (token === "pro") return "pro";
  if (token === "premium") return "premium";
  return undefined;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return undefined;
}

/** Satırdaki paket türü (package_type → plan → package → subscription_plan önceliği). */
export function resolveMembershipPackageType(
  row: Record<string, unknown>,
): MembershipPackageType | undefined {
  return parseMembershipPackageType(
    pickString(row, ["package_type", "plan", "package", "subscription_plan"]),
  );
}

function isActiveFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "t";
}

/**
 * SAF karar: bu satır (DB profili veya istemci YasamUser kaydı) uzman üyelik erişimine sahip mi?
 * admin → true; aksi halde active + approved + premium.
 */
export function hasMembershipAccessForRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  if (normalizeRole(row.role) === "admin") return true;
  if (!isActiveFlag(row.active)) return false;
  if (normalizeApprovalStatus(resolveApprovalStatus(row)) !== "approved") return false;
  return resolveMembershipPackageType(row) === "premium";
}

export const MEMBERSHIP_INACTIVE_CODE = "MEMBERSHIP_INACTIVE" as const;
export const MODULE_DENIED_CODE = "MODULE_DENIED" as const;

export const MEMBERSHIP_INACTIVE_MESSAGE =
  "Üyeliğiniz aktif değil. Modüllere erişmek için yöneticinizle iletişime geçin.";
export const MODULE_DENIED_MESSAGE =
  "Bu modül hesabınız için aktif değil. Yöneticinizle iletişime geçin.";

/**
 * userId-bazlı kapılar (assertUserModuleAccess) için gereken users kolonları — üyelik KISITI
 * (premium şartı) + modül izni. Bu bir bypass DEĞİLDİR: paket yalnız ERİŞİMİ KISITLAR, açmaz.
 * PROFILE_USER_SELECT alt kümesi; hassas alan (password/password_hash) YOK.
 */
export const MEMBERSHIP_USER_SELECT =
  "role, module_permissions, active, approval_status, status, package_type, plan, is_demo_account" as const;
