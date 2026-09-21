import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STONE_PHOTO_BUCKET,
  isOwnedClientStonePhotoPath,
  stonePhotoPrefix,
  deleteStonePhotoRecords,
} from "@/lib/clients/stonePhotoStorage";

export const runtime = "nodejs";

/**
 * client_stone_photos güvenli API katmanı (Faz 1D).
 *
 * Amaç: client_stone_photos TABLOSU artık tarayıcıdan publishable key ile
 *       doğrudan okunmaz/yazılmaz/silinmez. Erişim service_role'lü bu route üzerinden.
 *
 * DYA-07 PHASE B: Storage yükleme signed-upload (prepare route) + POST'ta obje varlık
 *   doğrulaması ile SUNUCU-YETKİLİdir; silme bu route'ta service_role ile (path-ownership
 *   guard'lı) yapılır. Tarayıcı artık stone-photos üzerinde anon `.upload()/.remove()`
 *   kullanmaz. Okuma kısa ömürlü signed URL (signed-urls route) ile yürür.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA user kaydından alınır; client'tan gelen tenant_id'ye GÜVENİLMEZ.
 *   - client_id ownership + stone_id ownership doğrulanır.
 *   - file_path SUNUCUDA tenant+client+stone önekine göre doğrulanır (isOwnedClientStonePhotoPath);
 *     client'tan gelen path güvenlik kararı için körü körüne kullanılmaz.
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

async function stoneBelongsToClient(
  db: SupabaseClient,
  stoneId: string,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("client_stones")
    .select("id")
    .eq("id", stoneId)
    .eq("client_id", clientId)
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
    return serverErrorResponse({ route: "clients/[id]/stone-photos", action: "GET", tenantId, cause: error });
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
  const filePath = typeof body.file_path === "string" ? body.file_path : "";

  if (!stoneId || !filePath) {
    return NextResponse.json(
      { ok: false, error: "stone_id ve file_path gerekli." },
      { status: 400 },
    );
  }

  // Stone ownership: stone bu danışana + tenant'a ait olmalı (IDOR).
  if (!(await stoneBelongsToClient(db, stoneId, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Taş kaydı bu danışana ait değil." }, { status: 403 });
  }

  // file_path SUNUCUDA doğrulanır: tenant+client öneki + bu stone'a bağlı segment.
  // Client'tan gelen path güvenlik kararı için körü körüne kabul EDİLMEZ.
  if (
    !isOwnedClientStonePhotoPath(filePath, tenantId, clientId) ||
    !filePath.startsWith(stonePhotoPrefix(tenantId, clientId, stoneId))
  ) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
  }

  // Güçlü bağlama: obje gerçekten (signed upload ile) yüklenmiş olmalı — uydurma path
  // DB'ye bağlanmaz.
  const { data: objectExists, error: existsError } = await db.storage
    .from(STONE_PHOTO_BUCKET)
    .exists(filePath);
  if (existsError) {
    return serverErrorResponse({ route: "clients/[id]/stone-photos", action: "POST-exists", tenantId, cause: existsError });
  }
  if (!objectExists) {
    return NextResponse.json({ ok: false, error: "Yüklenen dosya bulunamadı." }, { status: 409 });
  }

  // Idempotency (DYA-07 veri bütünlüğü): aynı obje (file_path) için MÜKERRER metadata
  // satırı oluşturma. Aksi halde iki satır aynı objeyi işaret eder ve BİRİNİN silinmesi
  // diğerinin objesini yok eder (paylaşılan-path veri kaybı). Aynı tenant+client+file_path
  // zaten varsa mevcut satır döndürülür → çift POST / çift-tık idempotent.
  // NOT: uygulama-katmanı kontrolü eşzamanlı yarışta tek başına yeterli DEĞİLDİR; kesin
  // çözüm UNIQUE(tenant_id, file_path) DB index'idir (migration → AYRI ONAY; bu fazda YOK).
  const { data: existing } = await db
    .from("client_stone_photos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("file_path", filePath)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, photo: existing, deduped: true });
  }

  // image_url artık kalıcı public URL DEĞİL — okuma signed URL ile yapılır. Kolonu
  // (olası NOT NULL) stabil file_path ile doldururuz; bu değer çözümlenebilir bir URL değildir.
  const { data, error } = await db
    .from("client_stone_photos")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      stone_id: stoneId,
      image_url: filePath,
      file_path: filePath,
    })
    .select()
    .single();

  if (error) {
    return serverErrorResponse({ route: "clients/[id]/stone-photos", action: "POST", tenantId, cause: error });
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

  // DB-FIRST + referans-güvenli silme (ortak dosya kullanan başka kayıt varsa obje
  // fiziksel silinmez; DB hata verirse storage'a dokunulmaz → foto kaybı yok).
  const result = await deleteStonePhotoRecords(db, {
    bucket: STONE_PHOTO_BUCKET,
    tenantId,
    clientId,
    photoId: all ? null : photoId,
    all,
  });
  if (result.error) {
    return serverErrorResponse({ route: "clients/[id]/stone-photos", action: "DELETE", tenantId, cause: result.error });
  }
  if (!all && result.deleted === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: result.deleted });
}
