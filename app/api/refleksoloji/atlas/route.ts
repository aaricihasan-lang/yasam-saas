import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { decideAtlasPut } from "@/lib/refleksoloji/atlasSyncCore";
import { validateAtlasPayload } from "@/lib/refleksoloji/atlasValidate";
import { sameJsonContent } from "@/lib/refleksoloji/usageChange";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/atlas — uzmanın refleksoloji atlası (P1-1, cihazlar arası senkron).
 *
 * Model: tenant başına TEK satır. `document` = organ→bölge haritası JSON belgesi,
 *   `organ_list` = organ adı listesi. İstemci her değişiklikte TAM belgeyi PUT eder.
 *
 * Eşzamanlılık (REF-001): PUT optimistic concurrency (updated_at compare-and-set).
 *   İstemci en son bildiği `expected_updated_at`'i gönderir; sunucudaki değerle
 *   uyuşmazsa (başka sekme/cihaz araya yazmış) 409 döner ve SESSİZ OVERWRITE YAPILMAZ.
 *   İstemci 409'da sunucu belgesini çekip birleştirir (bkz. refleksolojiAtlasSync).
 *
 * Güvenlik:
 *   - requireModuleAccess binding; tenant_id SUNUCUDA (body'den değil).
 *   - RLS + service_role only. Demo hesap: Supabase'e yazılmaz.
 *   - Hatalarda ham DB mesajı istemciye sızmaz (jsonServerError).
 */

// ─── GET — tenant'ın atlas belgesi ────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, document: null, organ_list: [] });
  }

  const { data, error } = await db
    .from("reflexology_atlas")
    .select("document, organ_list, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return jsonServerError("atlas.GET", error);
  }

  return NextResponse.json({
    ok: true,
    document: data?.document ?? null,
    organ_list: data?.organ_list ?? [],
    updated_at: data?.updated_at ?? null,
  });
}


// ─── PUT — tam belgeyi senkronla (upsert, tek satır) ──────────────────────────
//
// FA-13 (veri ezme koruması — karar saf `decideAtlasPut`'ta, harness'li):
//   - Satır VARKEN expected_updated_at gönderilmezse → 409 (eskiden CAS atlanıyor ve
//     boş/eski yerel belge sunucuyu körlemesine eziyordu).
//   - Dolu sunucu belgesini BOŞ belgeyle değiştirme → 409 (istemci `allow_empty:true`
//     göndermedikçe — yalnız kullanıcı son organı bilinçli sildiğinde).
//   - RF-13: sunucudaki bir organı MEZAR TAŞI olmadan düşüren belge → 409 ATLAS_SHRINK
//     (bayat / eksik yerel kopya sunucu atlasını topluca küçültemez).
//   - Gövde ≤ 4 MB (platform sınırının altı) ve bölge şekli doğrulanır (400/413).
export async function PUT(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: {
    document?: unknown;
    organ_list?: unknown;
    expected_updated_at?: unknown;
    allow_empty?: unknown;
  };
  let rawBody: string;
  try {
    rawBody = await req.text();
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // Hardening: bozuk bölge (null / id'siz / sayı olmayan koordinat) renderer'ı ve Word'ü
  // çökertir → KABUL EDİLMEZ; aşırı büyük belge reddedilir. Tenant dışı davranış yok.
  const invalid = validateAtlasPayload({
    document: body.document,
    organList: body.organ_list,
    bodyBytes: Buffer.byteLength(rawBody, "utf8"),
  });
  if (invalid) {
    return NextResponse.json(
      { ok: false, code: invalid.code, error: invalid.error },
      { status: invalid.status },
    );
  }

  const document = body.document as Record<string, unknown>;
  const organList = Array.isArray(body.organ_list)
    ? body.organ_list.filter((o): o is string => typeof o === "string")
    : [];
  const expected =
    typeof body.expected_updated_at === "string" && body.expected_updated_at.length > 0
      ? body.expected_updated_at
      : null;
  const allowEmpty = body.allow_empty === true;
  const nowIso = new Date().toISOString();

  // Mevcut satır (concurrency token + boş-ezme kontrolü için içerik).
  const { data: cur, error: curErr } = await db
    .from("reflexology_atlas")
    .select("updated_at, document, organ_list")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (curErr) {
    return jsonServerError("atlas.PUT.read", curErr, { usage: { guard, req, failedAction: "record_updated", subEntity: "atlas" } });
  }

  const decision = decideAtlasPut({
    current: cur
      ? {
          updated_at: String((cur as { updated_at: string }).updated_at),
          document: (cur as { document: unknown }).document,
          organ_list: (cur as { organ_list: unknown }).organ_list,
        }
      : null,
    expected,
    incomingDocument: document,
    incomingOrganList: organList,
    allowEmpty,
  });

  // USAGE360: aynı belge/organ listesi yeniden gönderildiyse (senkron tekrarı) yazma sürer
  // ama kullanım olayı SAYILMAZ. Atlas tekil (tenant başına bir satır) → resourceId sabit
  // "atlas" → debounce'lu ardışık kayıtlar 60 sn kovasında tek sayılır.
  const usageAtlasChanged =
    !cur ||
    !sameJsonContent((cur as { document: unknown }).document, document) ||
    !sameJsonContent((cur as { organ_list: unknown }).organ_list, organList);

  if (decision.kind === "conflict") {
    await trackUsage(guard, req, { module: "reflexology", action: "action_failed", failedAction: "record_updated", subEntity: "atlas", errorClass: "conflict" });
    return NextResponse.json(
      {
        ok: false,
        conflict: true,
        code: decision.code,
        server_updated_at: cur ? (cur as { updated_at: string }).updated_at : null,
        error: decision.error,
      },
      { status: 409 },
    );
  }

  // İlk kayıt — satır yok → insert (yarışta 409).
  if (decision.kind === "insert") {
    const { data: ins, error: insErr } = await db
      .from("reflexology_atlas")
      .insert({ tenant_id: tenantId, document, organ_list: organList, updated_at: nowIso })
      .select("updated_at")
      .single();
    if (insErr) {
      // PK çakışması: başka istek araya insert etmiş → conflict (overwrite yok).
      await trackUsage(guard, req, { module: "reflexology", action: "action_failed", failedAction: "record_updated", subEntity: "atlas", errorClass: "conflict" });
      return NextResponse.json(
        { ok: false, conflict: true, code: "ATLAS_STALE", error: "Atlas başka bir yerde oluşturuldu." },
        { status: 409 },
      );
    }
    if (usageAtlasChanged) {
      await trackUsage(guard, req, { module: "reflexology", action: "record_updated", subEntity: "atlas", resourceId: "atlas" });
    }
    return NextResponse.json({ ok: true, updated_at: ins.updated_at });
  }

  // CAS update: yalnız updated_at hâlâ beklenen değerse yaz (read→write yarışı da kapanır).
  const { data: upd, error: updErr } = await db
    .from("reflexology_atlas")
    .update({ document, organ_list: organList, updated_at: nowIso })
    .eq("tenant_id", tenantId)
    .eq("updated_at", decision.expected)
    .select("updated_at");
  if (updErr) {
    return jsonServerError("atlas.PUT.update", updErr, { usage: { guard, req, failedAction: "record_updated", subEntity: "atlas" } });
  }
  if (!upd || upd.length === 0) {
    await trackUsage(guard, req, { module: "reflexology", action: "action_failed", failedAction: "record_updated", subEntity: "atlas", errorClass: "conflict" });
    return NextResponse.json(
      { ok: false, conflict: true, code: "ATLAS_STALE", error: "Atlas eşzamanlı güncellendi." },
      { status: 409 },
    );
  }

  if (usageAtlasChanged) {
    await trackUsage(guard, req, { module: "reflexology", action: "record_updated", subEntity: "atlas", resourceId: "atlas" });
  }
  return NextResponse.json({ ok: true, updated_at: upd[0].updated_at });
}
