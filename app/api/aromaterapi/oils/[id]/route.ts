import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { pickWritableOilFields } from "@/lib/aromaterapi/oilFields";
import { legacyDbErrorResponse } from "@/lib/aromaterapi/legacyErrors";
import { isValidExpectedUpdatedAt } from "@/lib/aromaterapi/service/writeValidation";

export const runtime = "nodejs";

/**
 * /api/aromaterapi/oils/[id] — tekil yağ oku (GET) / güncelle (PATCH) / sil (DELETE) (K-2).
 * PATCH: expected_updated_at ile iyimser kilit (AROMA-3) — eski sekme yeni kaydı ezemez (409).
 * tenant_id DAİMA oturumdan. GET/PATCH/DELETE: YALNIZ kendi tenant kaydı
 * (.eq id + tenant) → IDOR koruması. Kanonik/paylaşımlı (null) satırlar uzman
 * UI'sında görünmez; admin bir yağı vermek isterse P4 transfer ile bağımsız
 * snapshot kopya üretir (origin_type='admin_transfer').
 */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  const { data, error } = await db
    .from("aromatherapy_oils")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) return legacyDbErrorResponse("oils.detail", error, "Yağ kaydı yüklenemedi.");
  if (!data)
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı.", notFound: true }, { status: 404 });
  return NextResponse.json({ ok: true, oil: data });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });

  // ARO-003: kısmi birleştirme — yalnız gövdede BULUNAN alanlar güncellenir; omit edilen
  // güvenlik alanları (safety_notes/contraindications/photosensitivity_status) DOKUNULMAZ.
  const fields = pickWritableOilFields(body, { partial: true });
  // İsim yalnız gövdede gönderildiyse zorunluluk denetlenir (kısmi PATCH ismi omit edebilir).
  if ("name" in (body as Record<string, unknown>) && !fields.name)
    return NextResponse.json({ ok: false, error: "Yağ adı zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  // AROMA-3 iyimser kilit (blends ARO-008 deseni) — expected_updated_at ZORUNLU.
  // İstemci GET'te aldığı updated_at'i AYNEN geri gönderir; eksik/biçimsiz → 400 (sorgudan ÖNCE).
  // KIRICI sözleşme: token göndermeyen eski istemci artık 400 alır (tek çağıran updateOil günceldir).
  const rawExpected = (body as Record<string, unknown>).expected_updated_at;
  const expectedUpdatedAt =
    typeof rawExpected === "string" && rawExpected.trim() ? rawExpected.trim() : null;
  if (!expectedUpdatedAt) {
    return NextResponse.json(
      { ok: false, error: "AROMA_MISSING_VERSION" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return NextResponse.json(
      { ok: false, error: "AROMA_INVALID_VERSION" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Atomik koşullu güncelleme — updated_at (timestamptz NOT NULL; trg_aro_oils_updated_at
  // BEFORE UPDATE trigger'ı her güncellemede yeniler) tek-cümle iyimser kilit sağlar.
  const { data, error } = await db
    .from("aromatherapy_oils")
    .update(fields)
    .eq("tenant_id", tenantId) // oturumdan; başka tenant / global kayıt güncellenemez
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt) // iyimser kilit — yalnız beklenen sürüm
    .select("id,updated_at");
  if (error) {
    await trackUsage(guard, req, { module: "aromatherapy", action: "action_failed", failedAction: "record_updated", subEntity: "oil", errorClass: "server" });
    return legacyDbErrorResponse("oils.update", error, "Yağ güncellenemedi.");
  }
  if (!data || data.length === 0) {
    // Satır güncellenmedi: kayıt (bu tenant'ta) varsa sürüm çakışması (409), yoksa 404.
    const { data: existing } = await db
      .from("aromatherapy_oils")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (existing) {
      await trackUsage(guard, req, { module: "aromatherapy", action: "action_failed", failedAction: "record_updated", subEntity: "oil", errorClass: "conflict" });
      return NextResponse.json(
        { ok: false, error: "AROMA_STALE_OIL", stale: true },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Kayıt bulunamadı veya bu hesaba ait değil.", notFound: true },
      { status: 404 },
    );
  }
  await trackUsage(guard, req, { module: "aromatherapy", action: "record_updated", subEntity: "oil", resourceId: id });
  // Yeni sürüm token'ı döner → aynı sekme düzenlemeye devam edebilir.
  const row = data[0] as { id: string; updated_at: string | null };
  return NextResponse.json({ ok: true, id, updated_at: row.updated_at ?? null });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("aromatherapy_oils")
    .delete()
    .eq("tenant_id", tenantId) // oturumdan; başka tenant / global kayıt silinemez
    .eq("id", id)
    .select("id");
  if (error) {
    await trackUsage(guard, req, { module: "aromatherapy", action: "action_failed", failedAction: "record_deleted", subEntity: "oil", errorClass: "server" });
    return legacyDbErrorResponse("oils.delete", error, "Yağ silinemedi.");
  }
  if (!data || data.length === 0)
    return NextResponse.json(
      { ok: false, error: "Kayıt bulunamadı veya bu hesaba ait değil." },
      { status: 404 },
    );
  await trackUsage(guard, req, { module: "aromatherapy", action: "record_deleted", subEntity: "oil", resourceId: id });
  return NextResponse.json({ ok: true, id });
}
