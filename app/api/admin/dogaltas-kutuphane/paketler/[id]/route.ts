import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { isUuid, ownerBadRequest, ownerJson, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — aktarım paketi: durum, kredi / kota, işlem kaydı (hata günlüğü dahil), ham yanıt sayıları. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const data = await ownerRpc<Record<string, unknown> | null>(db, "stone_library_owner_batch", { p_actor: ownerId, p_batch_id: id });
    if (!data) return ownerBadRequest("NOT_FOUND", "Paket bulunamadı.", 404);
    return ownerJson({ ok: true, ...data });
  });
}
