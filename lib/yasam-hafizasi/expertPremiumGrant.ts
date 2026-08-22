/**
 * YAŞAM HAFIZASI™ — PREMIUM GRADE + YH GRANT (server-only; tek authoritative sözleşme).
 *
 * Premium/eligible expert'e geçiş İLE Yaşam Hafızası grant'i (module_permissions.yasam_hafizasi
 * + yasam_hafizasi_flags.yh_enabled/yh_hizli) TEK DB TRANSACTION'da tamamlanır: RPC
 * `public.yh_grade_expert_premium` HEM membership premium geçişini HEM YH grant'i tek statement'ta
 * uygular. YH/flags yazımı başarısız olursa PREMIUM GEÇİŞİ DE COMMIT EDİLMEZ (all-or-nothing) →
 * "premium oldu ama YH kapalı" PARTIAL state İMKÂNSIZ. İki işlem transaction DIŞINDA ardışık kalmaz.
 *
 * Ineligible (demo/non-expert/demo-tenant) → RPC premium'u uygular ama YH'yi atlar ('premium_no_yh';
 * hata değil, YH fail-closed). RPC/transport hatası → { ok:false } (FAIL-CLOSED; çağıran premium
 * grant'ı başarısız saymalı, retry idempotenttir).
 *
 * NOT: yasam_hafizasi izni generic premium payload'ında (PREMIUM_EXPERT_MODULE_KEYS) YOKTUR →
 * hiçbir düz users.update perm'i flag olmadan set edemez.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PremiumGradeOutcome = "premium_with_yh" | "premium_no_yh" | "error";

export interface PremiumGradeResult {
  /** true → RPC hatasız çalıştı (premium_with_yh VEYA premium_no_yh). false → RPC/transport hatası. */
  readonly ok: boolean;
  readonly outcome: PremiumGradeOutcome;
}

/**
 * Premium geçişi + YH grant'i atomik uygular. membershipPayload = app'in ürettiği filtrelenmiş
 * üyelik payload'ı; modulePermissions = premium modül izinleri (YH HARİÇ). RPC active/approved'ı
 * ve (eligible ise) YH perm+flags'i tek transaction'da yazar.
 */
export async function gradeExpertPremiumWithYasamHafizasi(
  db: SupabaseClient,
  userId: string,
  membershipPayload: Record<string, unknown>,
  modulePermissions: Record<string, boolean>,
): Promise<PremiumGradeResult> {
  if (!userId) return { ok: false, outcome: "error" };
  try {
    const { data, error } = await db.rpc("yh_grade_expert_premium", {
      p_user_id: userId,
      p_membership: membershipPayload,
      p_module_permissions: modulePermissions,
    });
    if (error) return { ok: false, outcome: "error" };
    const outcome = data === "premium_with_yh" ? "premium_with_yh" : "premium_no_yh";
    return { ok: true, outcome };
  } catch {
    return { ok: false, outcome: "error" };
  }
}
