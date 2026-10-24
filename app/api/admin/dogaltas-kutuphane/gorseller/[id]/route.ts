import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { isUuid, ownerBadRequest, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type ImageRow = { id: string; storage_bucket: string; storage_path: string; mime: string; deleted_at: string | null };

/** GET — owner görsel önizleme (onay öncesi dahil). Baytlar sunucudan akar; depo yolu / sağlayıcı URL'si dönmez. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const rows = await ownerRpc<ImageRow[]>(db, "stone_library_owner_images", { p_actor: ownerId, p_stone_id: null });
    const row = (rows ?? []).find((r) => r.id === id && !r.deleted_at);
    if (!row) return ownerBadRequest("NOT_FOUND", "Görsel bulunamadı.", 404);
    const dl = await db.storage.from(row.storage_bucket).download(row.storage_path);
    if (dl.error || !dl.data) return ownerBadRequest("NOT_FOUND", "Görsel dosyası bulunamadı.", 404);
    return new Response(Buffer.from(await dl.data.arrayBuffer()), {
      headers: { "Content-Type": row.mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  });
}
