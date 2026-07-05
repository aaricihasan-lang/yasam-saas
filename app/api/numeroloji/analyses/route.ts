import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/numeroloji/analyses — numerology_records tablosunun güvenli sunucu kapısı.
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA oturum kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma .eq("tenant_id", tenantId) ile bağlanır (çapraz-tenant engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Bu route SADECE kendi tenant'ını okutur/yazar. Başka/tüm tenant'ları okuyan
 * admin yüzeyleri için /api/admin/numeroloji/tenant-metrics kullanılır.
 */

// Client'tan kabul EDİLMEYECEK alanlar (tenant override + id güvenliği).
const PROTECTED = new Set(["tenant_id", "id", "created_at"]);

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (!PROTECTED.has(k)) out[k] = v;
  return out;
}

// ─── GET /api/numeroloji/analyses ──────────────────────────────────────────────
// ?count=1 → yalnızca sayım döner ({ ok, count }).
// ?recent=N → son N kayıt (full_name, created_at) döner.
// Aksi halde tüm satırlar listelenir.
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // Tekil kayıt (detay sayfası)
  const idParam = req.nextUrl.searchParams.get("id")?.trim();
  if (idParam) {
    const { data, error } = await db
      .from("numerology_records")
      .select("*")
      .eq("id", idParam)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    return NextResponse.json({ ok: true, row: data });
  }

  const wantCount = req.nextUrl.searchParams.get("count") === "1";
  if (wantCount) {
    const { count, error } = await db
      .from("numerology_records")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: count ?? 0 });
  }

  const recentRaw = req.nextUrl.searchParams.get("recent");
  if (recentRaw != null) {
    const limit = Math.min(Math.max(Number.parseInt(recentRaw, 10) || 0, 1), 50);
    const { data, error } = await db
      .from("numerology_records")
      .select("name, surname, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rows: data ?? [] });
  }

  const { data, error } = await db
    .from("numerology_records")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── POST /api/numeroloji/analyses — yeni analiz kaydı ──────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload = { ...sanitize(body), tenant_id: tenantId };
  const { data, error } = await db
    .from("numerology_records")
    .insert(payload)
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

// ─── PATCH /api/numeroloji/analyses — kayıt güncelle (body.id) ──────────────────
export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("numerology_records")
    .update(sanitize(body))
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Analiz kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

// ─── DELETE /api/numeroloji/analyses — kayıt sil (?id veya body.id) ─────────────
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const fromQuery = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  let ids: string[] = fromQuery ? [fromQuery] : [];
  if (ids.length === 0) {
    try {
      const b = (await req.json()) as { id?: unknown; ids?: unknown };
      if (Array.isArray(b.ids)) {
        ids = b.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 1000);
      } else if (b.id != null) {
        const single = String(b.id).trim();
        if (single) ids = [single];
      }
    } catch { /* gövde yoksa query'e güven */ }
  }
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "id veya ids zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const { data, error } = await db
    .from("numerology_records")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const deleted = data?.length ?? 0;
  if (deleted === 0) {
    return NextResponse.json({ ok: false, error: "Analiz kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted, ids: (data ?? []).map((r) => (r as { id: string }).id) });
}
