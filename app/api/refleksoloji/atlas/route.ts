import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { jsonServerError } from "@/lib/refleksoloji/apiError";

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
export async function PUT(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: { document?: unknown; organ_list?: unknown; expected_updated_at?: unknown };
  try {
    body = (await req.json()) as {
      document?: unknown;
      organ_list?: unknown;
      expected_updated_at?: unknown;
    };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const document =
    body.document && typeof body.document === "object" ? body.document : {};
  const organList = Array.isArray(body.organ_list)
    ? body.organ_list.filter((o): o is string => typeof o === "string")
    : [];
  const expected =
    typeof body.expected_updated_at === "string" ? body.expected_updated_at : null;
  const nowIso = new Date().toISOString();

  // Mevcut satırın updated_at'ini oku (concurrency token).
  const { data: cur, error: curErr } = await db
    .from("reflexology_atlas")
    .select("updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (curErr) {
    return jsonServerError("atlas.PUT.read", curErr);
  }

  // İlk kayıt — satır yok → insert (yarışta 409).
  if (!cur) {
    const { data: ins, error: insErr } = await db
      .from("reflexology_atlas")
      .insert({ tenant_id: tenantId, document, organ_list: organList, updated_at: nowIso })
      .select("updated_at")
      .single();
    if (insErr) {
      // PK çakışması: başka istek araya insert etmiş → conflict (overwrite yok).
      return NextResponse.json(
        { ok: false, conflict: true, error: "Atlas başka bir yerde oluşturuldu." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, updated_at: ins.updated_at });
  }

  // Satır var. İstemci token gönderdiyse sunucudaki ile eşleşmeli (stale yazan → 409).
  if (expected !== null && cur.updated_at !== expected) {
    return NextResponse.json(
      {
        ok: false,
        conflict: true,
        server_updated_at: cur.updated_at,
        error: "Atlas başka bir cihazda güncellendi.",
      },
      { status: 409 },
    );
  }

  // CAS update: yalnız updated_at hâlâ okuduğumuz değerse yaz (read→write yarışı da kapanır).
  const { data: upd, error: updErr } = await db
    .from("reflexology_atlas")
    .update({ document, organ_list: organList, updated_at: nowIso })
    .eq("tenant_id", tenantId)
    .eq("updated_at", cur.updated_at)
    .select("updated_at");
  if (updErr) {
    return jsonServerError("atlas.PUT.update", updErr);
  }
  if (!upd || upd.length === 0) {
    return NextResponse.json(
      { ok: false, conflict: true, error: "Atlas eşzamanlı güncellendi." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, updated_at: upd[0].updated_at });
}
