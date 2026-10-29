import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, pickEnum, pickString, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTITIES = ["stone", "source", "record", "facet", "name", "external_id", "document", "image"] as const;

/**
 * POST /api/admin/dogaltas-kutuphane/silme — geri alınabilir silme / geri getirme (fiziksel silme yok).
 *   { action: "delete", entity, id, reason?, cascade? }  → { op_id }   (yayımdaki taş silinmez; bağımlılık → cascade gerekir)
 *   { action: "restore", op_id }                        → { restored }
 *   { action: "rollback_batch", batch_id, note? }       → { op_id }   (paketin yazdıkları; ham veri kalır)
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const action = pickEnum(body, "action", ["delete", "restore", "rollback_batch"] as const);
    if (action === "delete") {
      const op = await ownerRpc<string>(db, "stone_library_delete", {
        p_actor: ownerId, p_entity: pickEnum(body, "entity", ENTITIES), p_id: pickUuid(body, "id"), p_reason: pickString(body, "reason", 1000),
        p_cascade: body.cascade === true,
      });
      return ownerJson({ ok: true, op_id: op });
    }
    if (action === "restore") {
      const n = await ownerRpc<number>(db, "stone_library_restore", { p_actor: ownerId, p_op_id: pickUuid(body, "op_id") });
      return ownerJson({ ok: true, restored: n });
    }
    const op = await ownerRpc<string>(db, "stone_library_batch_rollback", { p_actor: ownerId, p_batch_id: pickUuid(body, "batch_id"), p_note: pickString(body, "note", 2000) });
    return ownerJson({ ok: true, op_id: op });
  });
}
