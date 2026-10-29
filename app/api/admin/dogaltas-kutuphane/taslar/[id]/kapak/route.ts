import type { NextRequest } from "next/server";
import { ownerRpc, ownerRpcList } from "@/lib/stone-library/import/ownerRpc";
import { isUuid, ownerBadRequest, withOwner } from "@/lib/stone-library/ownerApi";
import { ownerImagePath } from "@/lib/stone-library/ownerLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type LayerStone = { image_choice?: string; primary_owner_image_id?: string | null };
type OwnerImage = { id: string; mime: string; sha256: string; deleted_at: string | null };
type SourceImage = { id: string; variant: string; storage_bucket: string; storage_path: string; mime: string; deleted_at: string | null };
const BUCKET = "stone-library-images";

/**
 * GET — owner kapak önizlemesi (YALNIZ OWNER): taşın owner ekranında gösterilecek görseli.
 * Seçim: owner görseli birincilse o; değilse kaynak görseli (önce optimize, yoksa özgün). Lisans / onay durumundan bağımsızdır
 * çünkü yalnız owner görür — uzman görsel ucu (yayın + onay + doğrulanmış lisans kapısı) DEĞİŞMEZ.
 * Baytlar sunucudan akar; depo yolu / sağlayıcı adresi dönmez. Görsel yoksa 404.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const layers = await ownerRpc<{ stone?: LayerStone; owner_images?: OwnerImage[] } | null>(db, "stone_library_owner_layers", { p_actor: ownerId, p_stone_id: id });
    if (!layers?.stone) return ownerBadRequest("NOT_FOUND", "Taş bulunamadı.", 404);

    let bucket = BUCKET;
    let path: string | null = null;
    let mime = "";
    const primary = layers.stone.image_choice === "owner"
      ? (layers.owner_images ?? []).find((x) => x.id === layers.stone?.primary_owner_image_id && !x.deleted_at)
      : undefined;
    if (primary) {
      const ext = primary.mime === "image/png" ? "png" : primary.mime === "image/webp" ? "webp" : "jpg";
      path = ownerImagePath(id, primary.sha256, ext);
      mime = primary.mime;
    } else {
      const rows = await ownerRpcList<SourceImage>(db, "stone_library_owner_images", { p_actor: ownerId, p_stone_id: id });
      const live = rows.filter((x) => !x.deleted_at);
      const pick = live.find((x) => x.variant === "optimized") ?? live.find((x) => x.variant === "original");
      if (pick) {
        bucket = pick.storage_bucket;
        path = pick.storage_path;
        mime = pick.mime;
      }
    }
    if (!path) return ownerBadRequest("NOT_FOUND", "Görsel yok.", 404);
    const dl = await db.storage.from(bucket).download(path);
    if (dl.error || !dl.data) return ownerBadRequest("NOT_FOUND", "Görsel dosyası bulunamadı.", 404);
    return new Response(Buffer.from(await dl.data.arrayBuffer()), {
      headers: { "Content-Type": mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  });
}
