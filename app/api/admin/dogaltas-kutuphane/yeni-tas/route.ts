import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, pickObject, pickString, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";
import { ownerHealthFields } from "@/lib/stone-library/ownerLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { data: { name_tr (zorunlu), name_en?, fields?, keywords?, facets?, hardness?, birth_month?, numerical_vibration?, pairings? },
 *        publish?: boolean, note? }
 * Owner kökenli yeni taş. Kaynak türü "Owner tarafından oluşturuldu"; lisans / SHA / doğrulanmış çeviri ATANMAZ.
 * "Taslak Kaydet" (publish=false) / "Kaydet ve Yayınla" (publish=true).
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const data = pickObject(body, "data");
    const result = await ownerRpc(db, "stone_library_owner_stone_create", {
      p_actor: ownerId, p_data: data, p_health_fields: ownerHealthFields(data), p_publish: body.publish === true, p_note: pickString(body, "note", 1000),
    });
    return ownerJson({ ok: true, result });
  });
}
