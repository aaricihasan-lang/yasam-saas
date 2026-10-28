import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { isUuid, ownerBadRequest, ownerJson, withOwner } from "@/lib/stone-library/ownerApi";
import { OWNER_IMAGE_MAX_BYTES, ownerImagePath, sniffImage } from "@/lib/stone-library/ownerLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type OwnerImage = { id: string; mime: string; sha256: string; deleted_at: string | null };
const BUCKET = "stone-library-images";

/** GET ?image_id= — owner görseli önizleme (baytlar sunucudan akar; depo yolu dönmez). */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    const imageId = req.nextUrl.searchParams.get("image_id");
    if (!isUuid(id) || !isUuid(imageId)) return ownerBadRequest("INPUT", "id geçersiz.");
    const layers = await ownerRpc<{ owner_images?: OwnerImage[] } | null>(db, "stone_library_owner_layers", { p_actor: ownerId, p_stone_id: id });
    const row = layers?.owner_images?.find((x) => x.id === imageId);
    if (!row) return ownerBadRequest("NOT_FOUND", "Görsel bulunamadı.", 404);
    const ext = row.mime === "image/png" ? "png" : row.mime === "image/webp" ? "webp" : "jpg";
    const dl = await db.storage.from(BUCKET).download(ownerImagePath(id, row.sha256, ext));
    if (dl.error || !dl.data) return ownerBadRequest("NOT_FOUND", "Görsel dosyası bulunamadı.", 404);
    return new Response(Buffer.from(await dl.data.arrayBuffer()), {
      headers: { "Content-Type": row.mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  });
}

/**
 * POST multipart/form-data { file, license_status?: documented|undocumented, license_note?, make_primary?: "true"|"false" }
 * Doğrulama: bayt sınırı (2 MB), dosya İÇERİĞİNDEN tür + boyut (JPEG/PNG/WebP, en çok 4000 px), SHA-256 sunucuda.
 * Yol: owner/<taş>/<sha>.<uzantı> (özel kova; istemci yol seçemez). Aynı dosya aynı taşa ikinci kez eklenmez.
 * Belgesiz görsel "documented" işaretlenemez (DB: belge notu zorunlu); mevcut kaynak görselleri silinmez / değiştirilmez.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > OWNER_IMAGE_MAX_BYTES + 64 * 1024) return ownerBadRequest("TOO_LARGE", "Görsel en çok 2 MB olabilir.", 413);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return ownerBadRequest("INPUT", "Çok parçalı form bekleniyor.");
    }
    const file = form.get("file");
    if (!file || typeof file === "string") return ownerBadRequest("INPUT", "Dosya seçilmedi.");
    if (file.size > OWNER_IMAGE_MAX_BYTES) return ownerBadRequest("TOO_LARGE", "Görsel en çok 2 MB olabilir.", 413);
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0 || buf.length > OWNER_IMAGE_MAX_BYTES) return ownerBadRequest("TOO_LARGE", "Görsel en çok 2 MB olabilir.", 413);
    const img = sniffImage(buf);
    if (!img) return ownerBadRequest("BAD_IMAGE", "Dosya geçerli bir JPEG, PNG veya WebP görseli değil (en çok 4000 px).", 415);
    const licenseStatus = form.get("license_status") === "documented" ? "documented" : "undocumented";
    const noteRaw = form.get("license_note");
    const licenseNote = typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim().slice(0, 2000) : null;
    if (licenseStatus === "documented" && !licenseNote) return ownerBadRequest("INPUT", "Belgeli görsel için belge açıklaması zorunlu.");
    const sha256 = createHash("sha256").update(buf).digest("hex");
    // Taş owner tarafından görülebilir olmalı (yoksa dosya yüklenmez).
    const layers = await ownerRpc<{ stone?: { deleted_at: string | null } } | null>(db, "stone_library_owner_layers", { p_actor: ownerId, p_stone_id: id });
    if (!layers?.stone || layers.stone.deleted_at) return ownerBadRequest("NOT_FOUND", "Taş bulunamadı.", 404);
    const path = ownerImagePath(id, sha256, img.ext);
    const up = await db.storage.from(BUCKET).upload(path, buf, { contentType: img.mime, upsert: false });
    if (up.error && !/exist|duplicate/i.test(up.error.message ?? "")) return ownerBadRequest("STORAGE", "Görsel depoya yüklenemedi.", 502);
    const imageId = await ownerRpc<string>(db, "stone_library_owner_image_register", {
      p_actor: ownerId, p_stone_id: id, p_make_primary: form.get("make_primary") !== "false",
      p_data: { storage_path: path, mime: img.mime, bytes: buf.length, width: img.width, height: img.height, sha256, license_status: licenseStatus, license_note: licenseNote },
    });
    return ownerJson({ ok: true, image_id: imageId, width: img.width, height: img.height, mime: img.mime, license_status: licenseStatus });
  });
}
