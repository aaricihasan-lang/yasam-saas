import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * client_stone_photos güvenli API katmanı (Faz 1D).
 *
 * Amaç: client_stone_photos TABLOSU artık tarayıcıdan publishable key ile
 *       doğrudan okunmaz/yazılmaz/silinmez. Erişim service_role'lü bu route üzerinden.
 *
 * NOT: Storage (stone-photos bucket) yükleme/silme işlemleri kapsam dışıdır ve
 *      şimdilik client tarafında (supabase.storage) kalır — bu route yalnızca
 *      veritabanı satırlarını (image_url, file_path metadata) yönetir.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA user kaydından alınır; client'tan gelen tenant_id'ye GÜVENİLMEZ.
 *   - client_id ownership doğrulanır.
 *   - Tüm sorgular tenant_id + client_id birlikte kullanır.
 *   - Demo hesap: Supabase'e yazma/silme yapılmaz.
 */

type CreateBody = {
  stone_id?: string | null;
  image_url?: string | null;
  file_path?: string | null;
};

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

// ─── GET — liste ────────────────────────────────────────────────────────────────
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
    .from("client_stone_photos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, photos: data ?? [] });
}

// ─── POST — foto satırı ekle (storage upload client tarafında yapılır) ───────────
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
    return NextResponse.json({ ok: true, demo: true, photo: null });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const stoneId = typeof body.stone_id === "string" ? body.stone_id.trim() : "";
  const imageUrl = typeof body.image_url === "string" ? body.image_url : "";
  const filePath = typeof body.file_path === "string" ? body.file_path : "";

  if (!stoneId || !imageUrl || !filePath) {
    return NextResponse.json(
      { ok: false, error: "stone_id, image_url ve file_path gerekli." },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from("client_stone_photos")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      stone_id: stoneId,
      image_url: imageUrl,
      file_path: filePath,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, photo: data });
}

// ─── DELETE — tek foto ({ photoId }) veya tüm danışan fotoları ({ all: true }) ────
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
    return NextResponse.json({ ok: true, demo: true });
  }

  let photoId = "";
  let all = false;
  try {
    const body = (await req.json()) as { photoId?: unknown; all?: unknown };
    photoId = typeof body.photoId === "string" ? body.photoId.trim() : "";
    all = body.all === true;
  } catch {
    /* aşağıda doğrulanır */
  }

  if (!photoId && !all) {
    return NextResponse.json({ ok: false, error: "photoId veya all gerekli." }, { status: 400 });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let query = db
    .from("client_stone_photos")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  // Tek foto silme: ek olarak id filtresi. all=true ise danışanın tüm fotoları silinir.
  if (!all) {
    query = query.eq("id", photoId);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
