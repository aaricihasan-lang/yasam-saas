import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, pickObject, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dogaltas-kutuphane/ayarlar — { data: { health_content_publication_enabled?, health_publication_mode?,
 *   legal_review_ref?, owner_decision_ref?, health_notice_tr?, health_notice_en?, medical_notice_tr?, medical_notice_en? } }
 * Genel sağlık kilidi: legal_review modunda hukuk referansı, owner_decision modunda owner'ın yazılı karar referansı olmadan
 * açılamaz (DB CHECK). owner_decision modu hukuki inceleme yerine GEÇMEZ.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    await ownerRpc(db, "stone_library_settings_save", { p_actor: ownerId, p_data: pickObject(body, "data") });
    return ownerJson({ ok: true });
  });
}
