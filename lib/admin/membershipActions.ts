/**
 * ÜYE YÖNETİMİ — AŞAMA 1 · saf yardımcılar (server + UI + harness paylaşımlı).
 *
 * Bu dosya YALNIZ saf (yan-etkisiz) mantık içerir: onay/premium/arşiv karar kuralları,
 * approved_at koruma semantiği ve gerçek erişim türetimi. DB erişimi, RPC çağrısı veya
 * istemci-durumu YOKTUR → harness ile birebir test edilir. Erişim kuralları
 * lib/auth/membership.ts::hasExpertMembershipAccess ile TUTARLI olmalıdır.
 */
import { normalizeApprovalStatus, normalizeRole } from "@/lib/auth/yasamUser";
import type { AdminAuditAction } from "@/lib/admin/adminAudit";

/**
 * Bir uzmanın "arşiv/pasif" durumunu üreten audit türleri. Pasife alma (toggle_active)
 * → user_deactivated; "Pasife Al ve Arşivle" (soft-delete) → user_archived. Arşiv ekranı
 * pasife alınma tarih+aktörünü bu türlerin EN SON kaydından türetir.
 */
export const DEACTIVATION_AUDIT_ACTIONS = [
  "user_deactivated",
  "user_archived",
] as const;

/** Onay / ret işlemlerinin audit sözleşmesi (admin_audit_log CHECK ile uyumlu). */
export const APPROVAL_AUDIT_ACTION: Record<"approve" | "reject", AdminAuditAction> = {
  approve: "user_approved",
  reject: "user_rejected",
};

/**
 * Row'daki mevcut module_permissions'ı premium-grade RPC'ye AYNEN geçmek için normalize
 * eder (yalnız boolean değerler; obje değilse {}). Böylece Premium geçişi mevcut izinleri
 * KORUR (topluca true YAPMAZ). Row'da izin yoksa boş {} döner → hiçbir modül kendiliğinden
 * açılmaz.
 */
export function currentModulePermissions(
  row: Record<string, unknown>,
): Record<string, boolean> {
  const raw = row.module_permissions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * İlk onay tarihini KORU. Premium-grade RPC (yh_grade_expert_premium) approved_at'i
 * her çağrıda now() yapar. Hedef ZATEN approved ve bir approved_at'i varsa bu ilk tarih
 * korunmalıdır (yeniden onay ilk tarihi gereksiz yere ezmemeli). Yeniden aktifleştirme
 * approve'dan GEÇMEZ (toggle_active approved_at'e dokunmaz) → orada da ilk tarih korunur.
 *
 * @returns korunacak ISO tarih (RPC sonrası geri yazılacak) veya null (RPC'nin now()'ı geçerli).
 */
export function preservedApprovedAt(prior: {
  approval_status?: unknown;
  approved_at?: unknown;
}): string | null {
  const wasApproved = normalizeApprovalStatus(prior.approval_status) === "approved";
  const prev = prior.approved_at;
  if (wasApproved && prev != null && String(prev).trim() !== "") {
    return String(prev);
  }
  return null;
}

/**
 * Arşiv kapsamı — KESİN kural: yalnız role=expert & approval_status=approved & active=false.
 * Onay bekleyen (pending) ve reddedilmiş (rejected) başvurular ve admin hesapları HARİÇ.
 * Böylece "geçmişte onaylanıp pasife alınmış uzman" ile "reddedilmiş başvuru" karışmaz.
 */
export function isArchivedExpert(u: {
  role?: unknown;
  approval_status?: unknown;
  active?: unknown;
}): boolean {
  return (
    normalizeRole(u.role) === "expert" &&
    normalizeApprovalStatus(u.approval_status) === "approved" &&
    u.active !== true
  );
}

/**
 * Gerçek TEMEL erişim (uzman modüllerine erişebilir mi?) — hasExpertMembershipAccess ile
 * TUTARLI: admin her zaman; uzman ancak active && approved && package_type=premium ise.
 * Sadece active=true olması erişim anlamına GELMEZ (yöneticiye doğru durum gösterilir).
 */
export function deriveBaseExpertAccess(input: {
  role: string;
  active: boolean;
  approvalStatus: string;
  packageType?: string | null;
}): boolean {
  if (normalizeRole(input.role) === "admin") return true;
  return (
    input.active === true &&
    input.approvalStatus === "approved" &&
    String(input.packageType ?? "").toLowerCase() === "premium"
  );
}

/** Verilen audit satırları içinden istenen türlerin EN SON olanını (created_at) seçer. */
export function pickLatestAuditByAction<
  T extends { action?: unknown; created_at?: unknown },
>(rows: readonly T[], actions: readonly string[]): T | null {
  const set = new Set(actions);
  let latest: T | null = null;
  let latestMs = -Infinity;
  for (const r of rows) {
    if (typeof r.action !== "string" || !set.has(r.action)) continue;
    const ms = r.created_at != null ? new Date(String(r.created_at)).getTime() : NaN;
    if (Number.isNaN(ms)) continue;
    if (ms >= latestMs) {
      latestMs = ms;
      latest = r;
    }
  }
  return latest;
}
