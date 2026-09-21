import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse, logServerError } from "@/lib/http/apiError";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteStoneAndPhotos, STONE_PHOTO_BUCKET } from "@/lib/clients/stonePhotoStorage";

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
    return serverErrorResponse({ route: "clients/[id]/stones", action: "GET", tenantId, cause: error });
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
    return serverErrorResponse({ route: "clients/[id]/stones", action: "POST", tenantId, cause: error });
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
    return serverErrorResponse({ route: "clients/[id]/stones", action: "PATCH", tenantId, cause: error });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, stone: data });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────────
// GÜVENLİK: yalnız TEK kayıt silinir. Hedef satır id'si query (?id=) veya body'den
// alınır. id yoksa 400 döner — implicit "tümünü sil" yolu KALDIRILDI (boş/bozuk
// istek danışanın tüm taşlarını + fotoğraflarını silemez). Silme filtresi
// id + tenant_id + client_id; fotoğraf temizliği yalnız hedef taşla sınırlıdır.
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
      if (body?.id != null) rowId = String(body.id).trim();
    } catch {
      /* gövde yok/bozuk — id aşağıda zorunlu tutulur */
    }
  }

  // id zorunlu: id olmadan silme YOK (implicit toplu silme kaldırıldı).
  if (!rowId) {
    return NextResponse.json(
      { ok: false, error: "Silinecek kayıt id gerekli." },
      { status: 400 },
    );
  }

  // PR #262 fix — STONE-FIRST silme (stone_id→client_stones ON DELETE CASCADE YOK):
  //   1) path'ler toplanır, 2) TAŞ silinir (başarısızsa fotoğraflara dokunulmaz →
  //   yaşayan taşın fotoğrafı KAYBOLMAZ), 3) foto satırları + referans-güvenli storage
  //   temizlenir (ortak dosya korunur). Taş silme hatası → 500 (foto bütünlüğü korunur).
  const result = await deleteStoneAndPhotos(db, {
    bucket: STONE_PHOTO_BUCKET,
    tenantId,
    clientId,
    stoneId: rowId,
  });
  if (result.error) {
    return serverErrorResponse({ route: "clients/[id]/stones", action: "DELETE", tenantId, cause: result.error });
  }
  // Taş silindi; foto DB satırı temizliği best-effort'tur (yalnız yetim satır/blob riski,
  // yaşayan taş etkilenmez) — hata sunucu logunda kalır, işlem ok döner.
  if (result.photoCleanupError) {
    logServerError({ route: "clients/[id]/stones", action: "DELETE-photo-cleanup", tenantId, cause: result.photoCleanupError });
  }
  return NextResponse.json({ ok: true, deleted: result.stoneDeleted });
}
