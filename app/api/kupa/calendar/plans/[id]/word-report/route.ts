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
 * GET /api/kupa/calendar/plans/[id]/word-report            → YILLIK rapor (12 ay, A3 yatay)
 * GET /api/kupa/calendar/plans/[id]/word-report?month=1     → yalnız Ocak (A4 dikey tek-ay)
 * GET /api/kupa/calendar/plans/[id]/word-report?month=7     → yalnız Temmuz
 *   AKTİF (istemcide açık) planın KAYDEDİLMİŞ verisinden gerçek .docx üretir. Yalnız OKUMA;
 *   DB'ye YAZMAZ (rapor üretimi kalıcılaştırmaz). Kimlik başlıkları fetch ile gönderildiği için
 *   GET yeterlidir (client blob indirir; düz tarayıcı navigasyonu değil).
 *
 *   month: YOKSA yıllık. Varsa 1–12 arası TAM SAYI; boş/0/13/negatif/ondalık/metin/çoklu → 400.
 *   Yıl, client'tan DEĞİL planın kendi (tenant-doğrulanmış) yılından alınır (aylık filtre plan.year).
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

  // Rapor kapsamı — month YOKSA yıllık; varsa KATI 1–12 tam sayı (SQL'e sokulmaz; yalnız gösterim filtresi).
  const monthParams = new URL(req.url).searchParams.getAll("month");
  let month: number | null = null;
  if (monthParams.length > 1) return cuppingError(400, "Ay parametresi yalnız bir kez verilebilir.");
  if (monthParams.length === 1) {
    const raw = monthParams[0];
    // Yalnız 1–2 haneli tam sayı; boş/işaret/ondalık/boşluk/metin reddedilir.
    if (!/^\d{1,2}$/.test(raw)) return cuppingError(400, "Geçersiz ay. 1–12 arası tam sayı olmalı.");
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 12) return cuppingError(400, "Geçersiz ay. 1–12 arası tam sayı olmalı.");
    month = n;
  }

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

  // 3) Bağlı bilgilendirme şablonu — üç durum AÇIKÇA ayrılır (sessiz eksik-rapor YOK):
  //    A) Plana şablon BAĞLANMAMIŞ (advice_template_id yok) → normal Word; bölüm eklenmez; hata yok.
  //    B) Bağlı ve BAŞARIYLA okundu → gerçek metinler aktarılır.
  //    C) Bağlı ama OKUNAMIYOR (silinmiş/DB hatası) → sessizce şablonsuz rapor ÜRETME; güvenli hata döndür
  //       (kullanıcı eksik rapordan habersiz kalmaz). 404 (bulunamadı) ile DB hatası teknik ayrılır.
  let template: CuppingAdviceTemplate | null = null;
  if (plan.advice_template_id) {
    const tRes = await getEntity(db, CUPPING_TABLES.adviceTemplates, tenantId, plan.advice_template_id);
    if (tRes.ok) {
      template = tRes.data as unknown as CuppingAdviceTemplate; // Durum B
    } else if (tRes.response.status === 404) {
      // Durum C-1: bağlı şablon bulunamadı (silinmiş veya bu tenant'a ait değil). Ham tenant/id sızmaz.
      return cuppingError(
        409,
        "Takvime bağlı bilgilendirme şablonu bulunamadı. Şablonu yeniden bağlayın veya bağlantısını kaldırın.",
      );
    } else {
      // Durum C-2: gerçek DB/erişim hatası. Ham Supabase mesajı gösterilmez.
      return cuppingError(502, "Takvime bağlı bilgilendirme notları alınamadı. Lütfen tekrar deneyin.");
    }
  }

  // 4) DOCX üret (SAF builder; DB'ye YAZMAZ). month YOKSA yıllık, varsa yalnız o ay (builder plan.year+ay filtreler).
  let buffer: Buffer;
  try {
    buffer = await buildCalendarPlanWordBuffer({ plan, days, template, month });
  } catch {
    return cuppingError(500, "Word raporu oluşturulamadı. Lütfen tekrar deneyin.");
  }

  const filename = calendarWordFilename(plan, month);
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
