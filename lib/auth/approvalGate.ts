/**
 * Yaşam SaaS — Onay/Uzman-Hazırlık Saf Çekirdeği (approval gate; BF-4B).
 *
 * TEK KAYNAK: kullanıcı rol/aktiflik/onay durumu normalizasyonu ve "uzman hazır mı"
 * kararının SAF primitifleri burada tanımlanır. `lib/auth/yasamUser.ts` bu dosyaya
 * DELEGE eder (semantik el ile kopyalanmaz); tenant-scoped indexer de aynı çekirdeği
 * `evaluateRawRowTenantReady` ile kullanır → iki katman ASLA sapmaz.
 *
 * SAFLIK SINIRI (KESİN):
 *   - Bu modülün HİÇBİR import'u yoktur (zero-import); client + server + izole
 *     harness güvenle import eder. Secret / runtime env / IO / DB / fetch YOKTUR.
 *   - Coercion YALNIZ açık normalize helper'larındadır (String(x ?? "").trim().toLowerCase()).
 *   - Aynı girdi → aynı sonuç; side-effect yok; fail-closed.
 */

/** Rol string'ini normalize eder (boş/undefined → ""). */
export function normalizeRole(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Onay durumu string'ini normalize eder (boş/undefined → ""). */
export function normalizeApprovalStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Ham satırdan onay durumunu çözer (admin paneli ile aynı standart). Sıra:
 *   1) approval_status non-empty → normalize edilmiş değer,
 *   2) is_approved/approved boolean → approved|pending,
 *   3) status ∈ {approved,pending,rejected} → o değer,
 *   4) aksi → undefined (belirsiz; fail-closed çağırana ait).
 */
export function resolveApprovalStatus(row: Record<string, unknown>): string | undefined {
  if (row.approval_status != null && String(row.approval_status).trim() !== "") {
    return normalizeApprovalStatus(row.approval_status);
  }
  if (row.is_approved === true || row.approved === true) return "approved";
  if (row.is_approved === false || row.approved === false) return "pending";
  const status = normalizeApprovalStatus(row.status);
  if (status === "approved" || status === "pending" || status === "rejected") {
    return status;
  }
  return undefined;
}

/**
 * Uzman hazır mı? (aktif + onaylı; admin paneli ile uyumlu.)
 *   active !== true                → false
 *   norm(approval) === 'rejected'  → false
 *   norm(approval) === 'approved'  → true
 *   norm(approval) === '' (boş)    → true (legacy: onay alanı yok sayılır)
 *   diğer                          → false (bilinmeyen/beklenmeyen durum fail-closed)
 */
export function isExpertReady(input: { active: unknown; approval: string | undefined }): boolean {
  if (input.active !== true) return false;
  const norm = normalizeApprovalStatus(input.approval);
  if (norm === "rejected") return false;
  if (norm === "approved") return true;
  if (!norm) return true;
  return false;
}

/**
 * Ham DB users satırının tenant-scoped indeksleme için "hazır uzman" olup
 * olmadığını değerlendirir (SAF; coercion yalnız normalize helper'larında).
 *   - isExpert = normalizeRole(row.role) === 'expert'
 *   - isDemo   = row.is_demo_account === true (kesin boolean; coercion YOK)
 *   - ready    = isExpert && isExpertReady({ active, approval: resolveApprovalStatus(row) })
 *
 * NOT: demo değerlendirmesi bu fonksiyonda YALNIZ raporlanır (isDemo); demo tenant'ın
 * REDDİ çağıran kapıya (tenantScopeGate) aittir — burada karar verilmez.
 */
export function evaluateRawRowTenantReady(row: {
  role?: unknown;
  active?: unknown;
  is_demo_account?: unknown;
  approval_status?: unknown;
  status?: unknown;
}): { isExpert: boolean; isDemo: boolean; ready: boolean } {
  const isExpert = normalizeRole(row.role) === "expert";
  const isDemo = row.is_demo_account === true;
  const approval = resolveApprovalStatus(row as Record<string, unknown>);
  const ready = isExpert && isExpertReady({ active: row.active, approval });
  return { isExpert, isDemo, ready };
}
