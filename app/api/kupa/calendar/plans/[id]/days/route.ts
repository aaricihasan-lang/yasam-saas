import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { CUPPING_PLAN_DAYS_MAX_BATCH } from "@/lib/cupping/calendarTypes";
import { cuppingError, getEntity, parseJsonBody } from "@/lib/cupping/api";
import { parseYmd } from "@/lib/cupping/hijri";

export const runtime = "nodejs";

/**
 * /api/kupa/calendar/plans/[id]/days — plana somut GREGORYEN gün(ler) ekle.
 *
 * Kabul: tek "date" (YYYY-MM-DD) VEYA "dates" dizisi (somut YYYY-MM-DD). Toplu-seçim
 *   yardımcısı (ileride) kullanıcının KENDİ kriterini somut tarih dizisine çözer →
 *   bu uç onları kalıcılaştırır. GİZLİ gün-tavsiye motoru YOK; kriter kalıcılığı YOK.
 *
 * Kurallar: sahipli plan; tenant SUNUCUDA; KATI YYYY-MM-DD; her tarihin Gregoryen
 *   yılı = plan.year; azami toplu <= 366; tekrar eden tarihler idempotent (atlanır).
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

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  // Sahipli plan + yıl (her tarih bu yıla eşit olmalı).
  const plan = await getEntity(db, CUPPING_TABLES.calendarPlans, tenantId, id);
  if (!plan.ok) return plan.response;
  const planYear = (plan.data as { year: number }).year;

  // Girdi normalize: tek "date" veya "dates" dizisi → string[].
  const raw: unknown[] = Array.isArray(parsed.data.dates)
    ? parsed.data.dates
    : typeof parsed.data.date === "string"
      ? [parsed.data.date]
      : [];
  if (raw.length === 0) return cuppingError(400, "En az bir tarih (YYYY-MM-DD) gerekli.");
  if (raw.length > CUPPING_PLAN_DAYS_MAX_BATCH) {
    return cuppingError(400, `Tek seferde en fazla ${CUPPING_PLAN_DAYS_MAX_BATCH} gün seçilebilir.`);
  }

  // KATI doğrulama + yıl eşitliği + istek-içi tekilleştirme (Set, giriş sırasını korur).
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const v of raw) {
    const parts = parseYmd(v);
    if (!parts) return cuppingError(400, "Geçersiz tarih biçimi (YYYY-MM-DD bekleniyor).");
    if (parts.year !== planYear) {
      return cuppingError(400, `Seçilen tarih plan yılına (${planYear}) ait olmalı.`);
    }
    const ymd = typeof v === "string" ? v.trim() : "";
    if (!seen.has(ymd)) {
      seen.add(ymd);
      dates.push(ymd);
    }
  }

  // Opsiyonel tek-gün meta (yalnız string ise). Toplu seçimde tüm yeni satırlara uygulanır.
  const userLabel =
    typeof parsed.data.user_label === "string" && parsed.data.user_label.trim() !== ""
      ? parsed.data.user_label
      : null;
  const note =
    typeof parsed.data.note === "string" && parsed.data.note.trim() !== "" ? parsed.data.note : null;

  const rows = dates.map((gregorian_date) => ({
    tenant_id: tenantId,
    plan_id: id,
    gregorian_date,
    user_label: userLabel,
    note,
  }));

  // Idempotent: UNIQUE(tenant_id, plan_id, gregorian_date) çakışmalarını YOKSAY (race-safe).
  const { data, error } = await db
    .from(CUPPING_TABLES.calendarPlanDays)
    .upsert(rows, { onConflict: "tenant_id,plan_id,gregorian_date", ignoreDuplicates: true })
    .select("id");
  if (error) return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

  const inserted = data?.length ?? 0;
  return NextResponse.json({ ok: true, inserted, skippedExisting: dates.length - inserted });
}
