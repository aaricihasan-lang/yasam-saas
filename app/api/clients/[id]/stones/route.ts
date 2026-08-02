import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/clients/[id]/stones — bir danışanın taş kayıtları (client_stones)
 * (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA.
 *   - Önce client_id'nin bu tenant'a ait olduğu doğrulanır (IDOR).
 *   - Tüm sorgu/insert/update/delete tenant_id + client_id ile bağlanır.
 *   - PATCH/DELETE hedef satır id'si body/query'den; filtre id + tenant_id + client_id.
 *   - Body'deki tenant_id/id/client_id/created_at yok sayılır.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

const PROTECTED_KEYS = new Set(["tenant_id", "id", "created_at", "client_id"]);

// Taş fotoğraflarının saklandığı storage bucket'ı (StonesTab ile aynı).
const STONE_PHOTO_BUCKET = "stone-photos";

/**
 * O-6: Bir taş (veya danışanın tüm taşları) silinmeden ÖNCE, o taş(lar)a bağlı
 * client_stone_photos DB satırlarını ve storage dosyalarını temizler. Aksi halde
 * tekil taş silmede yetim fotoğraf kaydı kalıyordu (cascade-delete siliyor, tekil
 * silme silmiyordu). service_role ile çalışır; tenant + client ile sınırlıdır.
 * Foto önce silinir: taş silme başarısız olsa bile yetim foto kalmaz.
 */
async function deleteStonePhotos(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  stoneId: string | null,
): Promise<{ error: string | null }> {
  let sel = db
    .from("client_stone_photos")
    .select("file_path")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (stoneId) sel = sel.eq("stone_id", stoneId);
  const { data: rows, error: selError } = await sel;
  if (selError) return { error: selError.message };

  const paths = (rows ?? [])
    .map((r) => (r as { file_path?: unknown }).file_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length > 0) {
    const { error: storageError } = await db.storage.from(STONE_PHOTO_BUCKET).remove(paths);
    // Storage hatası veri bütünlüğünü bozmaz (DB satırı yine silinir) — sadece loglanır.
    if (storageError) console.error("O-6 storage foto silme:", storageError.message);
  }

  let del = db
    .from("client_stone_photos")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (stoneId) del = del.eq("stone_id", stoneId);
  const { error: delError } = await del;
  return { error: delError?.message ?? null };
}

function sanitizePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!PROTECTED_KEYS.has(k)) out[k] = v;
  }
  return out;
}

async function clientBelongsToTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

// ─── GET ────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId } = guard;
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const { data, error } = await db
    .from("client_stones")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stones: data ?? [] });
}

// ─── POST ───────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, stone: null });
  }
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const fields = sanitizePayload(body);
  const { data, error } = await db
    .from("client_stones")
    .insert({ ...fields, tenant_id: tenantId, client_id: clientId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stone: data });
}

// ─── PATCH ──────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, stone: null });
  }
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const rowId = body.id != null ? String(body.id) : "";
  if (!rowId) {
    return NextResponse.json({ ok: false, error: "Kayıt id gerekli." }, { status: 400 });
  }

  const fields = sanitizePayload(body);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { data, error } = await db
    .from("client_stones")
    .update(fields)
    .eq("id", rowId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, stone: data });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────────
// Query/body'de id varsa o satır silinir; yoksa danışanın TÜM taş kayıtları silinir.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  }
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let rowId = new URL(req.url).searchParams.get("id")?.trim() || "";
  if (!rowId) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      if (body?.id != null) rowId = String(body.id);
    } catch {
      /* gövde yoksa: tümünü sil */
    }
  }

  // O-6: taş(lar)ı silmeden ÖNCE bağlı fotoğrafları (DB satırı + storage) temizle
  // → tekil silmede yetim client_stone_photos kaydı kalmaz. rowId yoksa danışanın
  // tüm taş fotoğrafları silinir (tümünü-sil yolu). Foto silme hatasında dur (taşı
  // silme) ki tutarsızlık oluşmasın.
  const photoResult = await deleteStonePhotos(db, tenantId, clientId, rowId || null);
  if (photoResult.error) {
    return NextResponse.json({ ok: false, error: photoResult.error }, { status: 500 });
  }

  let query = db
    .from("client_stones")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (rowId) query = query.eq("id", rowId);

  const { data, error } = await query.select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
