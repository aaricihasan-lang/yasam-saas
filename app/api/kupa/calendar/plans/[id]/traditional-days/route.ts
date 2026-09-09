import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { cuppingError, getEntity, seedSunnahAutoDays } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/calendar/plans/[id]/traditional-days — SİSTEM-OTOMATİK geleneksel günler.
 *
 * ÜRÜN KURALI (owner KİLİTLİ): AYNI yıllık takvimin içine, uzmanın varsayılan geleneksel
 *   Sünnet/Altın günleri (Hicrî 17/19/21 + izinli haftagünü; 17+Salı=Altın) eklenir. Bu
 *   uç KÖKEN sunucu-sahipli olduğu için ayrıdır: genel /days POST YALNIZ 'manual' üretir;
 *   'sunnah_auto' kökeni client'tan GELEMEZ. İkinci hesaplanmış takvim YOK.
 *
 * POST  → EKSİK aday günleri sunnah_auto olarak ekle (restore / add-missing / seed).
 *          IDEMPOTENT + MANUEL-KORUR: var olan gün (manuel/otomatik) DEĞİŞTİRİLMEZ;
 *          formüle uyan manuel gün manuel KALIR (asla sunnah_auto'ya çevrilmez).
 * DELETE → "Sünnet Günlerini Temizle": YALNIZ selection_source='sunnah_auto' satırları sil.
 *          Manuel günler — kurala uysa bile — KORUNUR.
 *
 * Güvenlik: requireModuleAccess("cupping"); tenant SUNUCUDA; sahipli plan; demo → persist=0;
 *   ham DB hatası sızmaz. Kozmik/Word/YH/appointment yan-etkisi YOK.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Plan id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, inserted: 0, skippedExisting: 0 });

  // Sahipli plan + yıl (aday günler bu yıla göre hesaplanır).
  const plan = await getEntity(db, CUPPING_TABLES.calendarPlans, tenantId, id);
  if (!plan.ok) return plan.response;
  const planYear = (plan.data as { year: number }).year;

  const seed = await seedSunnahAutoDays(db, CUPPING_TABLES.calendarPlanDays, tenantId, id, planYear);
  if (!seed.ok) return seed.response;
  return NextResponse.json({ ok: true, inserted: seed.data.inserted, skippedExisting: seed.data.skippedExisting });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Plan id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  // Sahiplik doğrulaması (cross-tenant/olmayan plan → 404; sızıntı yok).
  const plan = await getEntity(db, CUPPING_TABLES.calendarPlans, tenantId, id);
  if (!plan.ok) return plan.response;

  // YALNIZ sistem-otomatik satırlar silinir; manuel günler (kurala uysa bile) KORUNUR.
  const { data, error } = await db
    .from(CUPPING_TABLES.calendarPlanDays)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("plan_id", id)
    .eq("selection_source", "sunnah_auto")
    .select("id");
  if (error) return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
