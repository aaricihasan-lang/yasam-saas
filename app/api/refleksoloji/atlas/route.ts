import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { decideAtlasPut } from "@/lib/refleksoloji/atlasSyncCore";

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
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const document =
    body.document && typeof body.document === "object" && !Array.isArray(body.document)
      ? body.document
      : {};
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
    return jsonServerError("atlas.PUT.read", curErr);
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

  if (decision.kind === "conflict") {
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
      return NextResponse.json(
        { ok: false, conflict: true, code: "ATLAS_STALE", error: "Atlas başka bir yerde oluşturuldu." },
        { status: 409 },
      );
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
    return jsonServerError("atlas.PUT.update", updErr);
  }
  if (!upd || upd.length === 0) {
    return NextResponse.json(
      { ok: false, conflict: true, code: "ATLAS_STALE", error: "Atlas eşzamanlı güncellendi." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, updated_at: upd[0].updated_at });
}
