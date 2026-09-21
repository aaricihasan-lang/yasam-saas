import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import {
  cuppingError,
  getEntity,
  listEntity,
} from "@/lib/cupping/api";
import {
  buildCalendarPlanWordBuffer,
  calendarWordFilename,
  WORD_CONTENT_TYPE,
} from "@/lib/cupping/calendarWord";
import type {
  CuppingAdviceTemplate,
  CuppingCalendarPlan,
  CuppingCalendarPlanDay,
} from "@/lib/cupping/calendarTypes";

export const runtime = "nodejs";

/**
 * KUPA & HACAMAT — FAZ 6 — YILLIK HACAMAT TAKVİMİ WORD İNDİRME.
 *
 * GET /api/kupa/calendar/plans/[id]/word-report
 *   AKTİF (istemcide açık) planın KAYDEDİLMİŞ verisinden gerçek .docx üretir. Yalnız OKUMA;
 *   DB'ye YAZMAZ (rapor üretimi kalıcılaştırmaz). Kimlik başlıkları fetch ile gönderildiği için
 *   GET yeterlidir (client blob indirir; düz tarayıcı navigasyonu değil).
 *
 * GÜVENLİK:
 *   - requireModuleAccess(req, "cupping") — gate + tenant server-derived.
 *   - Plan + günler + şablon YALNIZ guard.tenantId ile okunur (getEntity/listEntity .eq tenant_id) →
 *     başka tenant'ın planı indirilemez (getEntity 404 döner; IDOR engeli).
 *   - client'tan tenantId/tablo/alan ALINMAZ (id path param; server her şeyi kendi doğrular).
 *   - Ham DB hatası sızmaz (cupping api sabit güvenli mesaj döndürür).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Plan id gerekli.");

  const { db, tenantId } = guard;

  // 1) Plan — tenant-scoped (başka tenant → 404).
  const planRes = await getEntity(db, CUPPING_TABLES.calendarPlans, tenantId, id);
  if (!planRes.ok) return planRes.response;
  const plan = planRes.data as unknown as CuppingCalendarPlan;

  // 2) Seçili günler — tenant-scoped, plan_id filtreli, gregorian_date ASC.
  const daysRes = await listEntity(db, CUPPING_TABLES.calendarPlanDays, tenantId, {
    orderBy: "gregorian_date",
    ascending: true,
    eqFilters: { plan_id: id },
  });
  if (!daysRes.ok) return daysRes.response;
  const days = daysRes.data as unknown as CuppingCalendarPlanDay[];

  // 3) Bağlı bilgilendirme şablonu (varsa) — tenant-scoped. Silinmiş/erişilemezse sessizce atla
  //    (rapor günler bölümüyle yine geçerlidir; sağlık tavsiyesi UYDURULMAZ).
  let template: CuppingAdviceTemplate | null = null;
  if (plan.advice_template_id) {
    const tRes = await getEntity(db, CUPPING_TABLES.adviceTemplates, tenantId, plan.advice_template_id);
    if (tRes.ok) template = tRes.data as unknown as CuppingAdviceTemplate;
  }

  // 4) DOCX üret (SAF builder; DB'ye YAZMAZ).
  let buffer: Buffer;
  try {
    buffer = await buildCalendarPlanWordBuffer({ plan, days, template });
  } catch {
    return cuppingError(500, "Word raporu oluşturulamadı. Lütfen tekrar deneyin.");
  }

  const filename = calendarWordFilename(plan);
  // ASCII fallback + RFC 5987 UTF-8 (Türkçe karakter güvenli).
  const asciiName = filename.replace(/[^\x20-\x7E]/g, "_");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": WORD_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
