import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  STONE_PHOTO_BUCKET,
  STONE_PHOTO_MIME_EXT,
  STONE_PHOTO_MAX_BYTES,
  buildStonePhotoPath,
  isOwnedStonePhotoPath,
} from "@/lib/dogaltas/stonePhoto";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stones/photos — SUNUCU-YETKİLİ taş fotoğrafı yükleme/silme (F-016).
 *
 * Önceki durum: yükleme client-direct (anon supabase) → server doğrulaması YOK, path
 * client-kurulu, tip yalnız client-side. Bu route yükleme yolunu server'a taşır:
 *   - requireModuleAccess → x-user-id + x-session-token binding + modül izni.
 *   - tenant SUNUCUDAN (oturumdan); client body/path'inden ALINMAZ.
 *   - server MIME allowlist + boyut sınırı.
 *   - path server'da üretilir (uuid) → client dosya adı/path enjekte edemez.
 *   - service_role yalnız server (guard.db).
 *
 * NİHAİ MODEL: bucket ADANMIŞ private `dogaltas-photos` (STONE_PHOTO_BUCKET). Kalıcı public
 * URL ÜRETİLMEZ; DB'ye yalnız `file_path` yazılır. Yükleme yanıtı, anlık önizleme için KISA
 * ÖMÜRLÜ signed URL (`previewUrl`) döner — bu değer DB'ye KAYDEDİLMEZ (yalnız o oturumun
 * önizlemesi). Deployment sırası Model A: önce migration apply (bucket oluşur), sonra kod deploy.
 */
const PREVIEW_TTL_SECONDS = 3600;

// ─── POST: multipart yükleme ─────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Dosya bulunamadı." }, { status: 400 });
  }

  // Server MIME doğrulaması — client uzantısına güvenilmez.
  const ext = STONE_PHOTO_MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Yalnızca WEBP/JPEG/PNG/GIF görselleri yüklenebilir." },
      { status: 415 },
    );
  }
  // Server boyut doğrulaması.
  if (file.size <= 0 || file.size > STONE_PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Görsel boyutu 10 MB sınırını aşıyor." },
      { status: 413 },
    );
  }

  const uuid = crypto.randomUUID();
  const filePath = buildStonePhotoPath(tenantId, ext, uuid);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from(STONE_PHOTO_BUCKET)
    .upload(filePath, bytes, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: "Görsel yüklenemedi." }, { status: 500 });
  }

  // Kalıcı public URL YOK. DB'ye yalnız file_path yazılır. Önizleme için kısa ömürlü signed
  // URL döner (DB'ye kaydedilmez). Upload başarılı ama signed üretilemese bile file_path döner.
  const { data: signed } = await db.storage
    .from(STONE_PHOTO_BUCKET)
    .createSignedUrl(filePath, PREVIEW_TTL_SECONDS);

  return NextResponse.json({
    ok: true,
    image: {
      id: `${uuid}`,
      name: typeof form.get("name") === "string" ? String(form.get("name")).slice(0, 200) : (file.name || "gorsel"),
      file_path: filePath,
    },
    previewUrl: signed?.signedUrl ?? null,
  });
}

// ─── DELETE: tek obje kaldırma (ownership guard'lı) ──────────────────────────
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const filePath = body.file_path;
  // Ownership: yalnız kendi tenant öneki altındaki path silinebilir (cross-tenant remove engeli).
  if (!isOwnedStonePhotoPath(filePath, tenantId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
  }

  const { error } = await db.storage.from(STONE_PHOTO_BUCKET).remove([filePath]);
  if (error) {
    return NextResponse.json({ ok: false, error: "Görsel kaldırılamadı." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
