import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/kisisel-arsiv — personal_archives (Kişisel Arşiv) güvenli server kapısı.
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - Her sorgu/insert/update/delete .eq("tenant_id", tenantId) ile bağlanır.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Kapsam: yalnızca personal_archives DB tablosu. personal_archive_files satırları ve
 * storage bucket işlemleri (signed-url / upload / remove) bu route'un dışındadır.
 */

// Client'tan kabul EDİLMEYECEK alanlar (tenant override + id/zaman güvenliği).
const PROTECTED = new Set(["tenant_id", "id", "created_at"]);

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (!PROTECTED.has(k)) out[k] = v;
  return out;
}

// ─── GET /api/kisisel-arsiv — liste ────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("personal_archives")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── POST /api/kisisel-arsiv — ekle ────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "Başlık alanı zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, id: null });

  const payload = { ...sanitize(body), title, tenant_id: tenantId };
  const { data, error } = await db
    .from("personal_archives")
    .insert(payload)
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

// ─── PATCH /api/kisisel-arsiv — güncelle (body.id) ─────────────────────────────
export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "Başlık alanı zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, id });

  const fields = { ...sanitize(body), title, updated_at: new Date().toISOString() };
  const { data, error } = await db
    .from("personal_archives")
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

// ─── DELETE /api/kisisel-arsiv?id=... — sil ────────────────────────────────────
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const fromQuery = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  let id = fromQuery;
  if (!id) {
    try { const b = (await req.json()) as { id?: unknown }; id = String(b.id ?? "").trim(); }
    catch { /* gövde yoksa query'e güven */ }
  }
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, id });

  const { data, error } = await db
    .from("personal_archives")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}
