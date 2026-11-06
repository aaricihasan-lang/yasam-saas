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
 * TRIAL7 (Owner 2026-11-06): YALNIZ `trial_kind='self_7d'` satırları (7 günlük ücretsiz deneme)
 * için pencere (trial_ends_at) okunur → aktif pencere = tam erişim; süresi dolmuş / durdurulmuş =
 * salt-okunur; inceleme / başlamamış = erişim yok. Bu kolon mevcut hesapların hiçbirinde yoktur:
 * Premium / admin / demo / eski deneme hesaplarında tarih alanları erişime GİRMEZ (davranış aynı).
 *
 * SAFLIK: yalnız `approvalGate` ve `lib/trial/trialCore` (saf çekirdekler) import edilir; IO/env/DB YOK.
 */
import { normalizeRole, normalizeApprovalStatus, resolveApprovalStatus } from "./approvalGate";
import {
  isSelfTrialRow,
  resolveTrialPhase,
  trialPhaseAccessLevel,
  type MembershipAccessLevel,
} from "@/lib/trial/trialCore";

export type { MembershipAccessLevel };

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
 * SAF karar: üyelik erişim SEVİYESİ.
 *   admin → full · pasif / onaysız → none · premium → full (mevcut kural, sıra korunur) ·
 *   deneme (trial_kind=self_7d): aktif pencere → full, süresi dolmuş/durdurulmuş → read_only,
 *   inceleme/başlamamış → none · diğer her şey → none (fail-closed).
 */
export function resolveMembershipAccessLevel(
  row: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
): MembershipAccessLevel {
  if (!row) return "none";
  if (normalizeRole(row.role) === "admin") return "full";
  if (!isActiveFlag(row.active)) return "none";
  if (normalizeApprovalStatus(resolveApprovalStatus(row)) !== "approved") return "none";
  if (resolveMembershipPackageType(row) === "premium") return "full";
  if (isSelfTrialRow(row)) return trialPhaseAccessLevel(resolveTrialPhase(row, nowMs));
  return "none";
}

/**
 * SAF karar: bu satır (DB profili veya istemci YasamUser kaydı) TAM uzman üyelik erişimine sahip mi?
 * admin → true; aksi halde active + approved + premium, ya da aktif 7 günlük deneme penceresi.
 * Salt-okunur (süresi dolmuş deneme) BURADA false'tur — yazma/geri yükleme yolları (ör. yedek geri
 * yükleme membershipActive) bu katı kuralı kullanır; okuma izni resolveMembershipAccessLevel'dadır.
 */
export function hasMembershipAccessForRow(row: Record<string, unknown> | null | undefined): boolean {
  return resolveMembershipAccessLevel(row) === "full";
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
  "role, module_permissions, active, approval_status, status, package_type, plan, is_demo_account, trial_kind, trial_status, trial_ends_at" as const;

/** TRIAL7 geçiş güvenliği: deneme kolonları henüz yokken kullanılan eski liste (bkz. moduleAccess). */
export const MEMBERSHIP_USER_SELECT_PRE_TRIAL =
  "role, module_permissions, active, approval_status, status, package_type, plan, is_demo_account" as const;
