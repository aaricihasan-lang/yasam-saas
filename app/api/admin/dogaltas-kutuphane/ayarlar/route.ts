import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, pickObject, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dogaltas-kutuphane/ayarlar — { data: { health_content_publication_enabled?, legal_review_ref?, health_notice_tr?, health_notice_en? } }
 * Genel sağlık kilidi hukuk referansı olmadan açılamaz (DB CHECK).
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    await ownerRpc(db, "stone_library_settings_save", { p_actor: ownerId, p_data: pickObject(body, "data") });
    return ownerJson({ ok: true });
  });
}
