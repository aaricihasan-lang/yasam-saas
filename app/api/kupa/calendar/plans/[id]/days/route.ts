import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import {
  CUPPING_PLAN_DAYS_MAX_BATCH,
  normalizeCuppingDayStyle,
  pickCuppingDayStyleInput,
  type CuppingDayStyleInput,
} from "@/lib/cupping/calendarTypes";
import { cuppingError, getEntity, parseJsonBody } from "@/lib/cupping/api";
import { parseYmd } from "@/lib/cupping/hijri";

export const runtime = "nodejs";

/**
 * /api/kupa/calendar/plans/[id]/days — plana somut GREGORYEN gün(ler) ekle.
 *
 * Kabul (geriye uyumlu):
 *   A) Legacy — "date" (YYYY-MM-DD) VEYA "dates" dizisi; opsiyonel tek user_label/note
 *      TÜM yeni satırlara uygulanır (toplu-seçim varsayılan: renksiz/normal gün).
 *   B) FAZ 5/5 — "days" dizisi: her öğe { date, color_key?, user_label?, note? } ile
 *      PER-DAY renk + kısa açıklama TAŞIR (yeni gün + stil TEK istekte kalıcılaşır).
 * İki biçim birlikte kullanılmaz; "days" verilirse o esas alınır.
 *
 * Kurallar: sahipli plan; tenant SUNUCUDA; KATI YYYY-MM-DD; her tarihin Gregoryen
 *   yılı = plan.year; azami toplu <= 366; tekrar eden tarihler idempotent (atlanır).
 *   Köken (selection_source) DAİMA 'manual' (uzman-sahipli); client köken enjekte EDEMEZ.
 *   GİZLİ gün-tavsiye motoru YOK; renk anlamı platform tarafından sabitlenmez.
 */

/** Girdi öğesi — tarih + opsiyonel stil (renk/kısa açıklama/detay notu). */
type DayItem = { date: unknown; style: CuppingDayStyleInput };

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

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  // Sahipli plan + yıl (her tarih bu yıla eşit olmalı).
  const plan = await getEntity(db, CUPPING_TABLES.calendarPlans, tenantId, id);
  if (!plan.ok) return plan.response;
  const planYear = (plan.data as { year: number }).year;

  // Girdi normalize → DayItem[] (tarih + stil). "days" (B) öncelikli; yoksa legacy (A).
  let items: DayItem[] = [];
  if (Array.isArray(parsed.data.days)) {
    for (const entry of parsed.data.days) {
      if (!entry || typeof entry !== "object") {
        return cuppingError(400, "Geçersiz gün öğesi.");
      }
      const e = entry as Record<string, unknown>;
      // YALNIZ gerçekten gönderilmiş stil alanları (undefined enjekte YOK → stilsiz gün geçerli).
      items.push({ date: e.date, style: pickCuppingDayStyleInput(e) });
    }
  } else {
    // Legacy: "dates" dizisi veya tek "date" + paylaşılan tek user_label/note.
    const rawDates: unknown[] = Array.isArray(parsed.data.dates)
      ? parsed.data.dates
      : typeof parsed.data.date === "string"
        ? [parsed.data.date]
        : [];
    const sharedStyle: CuppingDayStyleInput = {};
    if (typeof parsed.data.user_label === "string") sharedStyle.user_label = parsed.data.user_label;
    if (typeof parsed.data.note === "string") sharedStyle.note = parsed.data.note;
    items = rawDates.map((date) => ({ date, style: sharedStyle }));
  }

  if (items.length === 0) return cuppingError(400, "En az bir tarih (YYYY-MM-DD) gerekli.");
  if (items.length > CUPPING_PLAN_DAYS_MAX_BATCH) {
    return cuppingError(400, `Tek seferde en fazla ${CUPPING_PLAN_DAYS_MAX_BATCH} gün seçilebilir.`);
  }

  // KATI doğrulama + yıl eşitliği + istek-içi tekilleştirme (ilk giren kazanır; giriş sırasını korur).
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const item of items) {
    const parts = parseYmd(item.date);
    if (!parts) return cuppingError(400, "Geçersiz tarih biçimi (YYYY-MM-DD bekleniyor).");
    if (parts.year !== planYear) {
      return cuppingError(400, `Seçilen tarih plan yılına (${planYear}) ait olmalı.`);
    }
    const ymd = typeof item.date === "string" ? item.date.trim() : "";
    if (seen.has(ymd)) continue;
    seen.add(ymd);

    // Per-day stil doğrulama (renk allowlist + kısa açıklama sınırı + detay notu sınırı).
    const norm = normalizeCuppingDayStyle(item.style);
    if (!norm.ok) return cuppingError(400, norm.error);

    // Tüm günler MANUEL (uzman-sahipli) köken ile yazılır (client köken enjekte edemez).
    // Kolon kümesi SABİT (heterojen upsert yok): stil verilmeyen alanlar NULL.
    rows.push({
      tenant_id: tenantId,
      plan_id: id,
      gregorian_date: ymd,
      selection_source: "manual" as const,
      user_label: norm.fields.user_label ?? null,
      note: norm.fields.note ?? null,
      color_key: norm.fields.color_key ?? null,
    });
  }

  // Idempotent: UNIQUE(tenant_id, plan_id, gregorian_date) çakışmalarını YOKSAY (race-safe).
  const { data, error } = await db
    .from(CUPPING_TABLES.calendarPlanDays)
    .upsert(rows, { onConflict: "tenant_id,plan_id,gregorian_date", ignoreDuplicates: true })
    .select("id");
  if (error) return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

  const inserted = data?.length ?? 0;
  return NextResponse.json({ ok: true, inserted, skippedExisting: rows.length - inserted });
}
