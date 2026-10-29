import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, pickEnum, pickString, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dogaltas-kutuphane/yetkiler — kişi bazlı uzman erişimi (F4'te mevcut admin yetki ekranı bu ucu çağırır).
 *   { action: "grant", user_id, note? } | { action: "revoke", user_id }
 * Varsayılan: hiçbir uzmanın erişimi yok. Uygunluk (aktif, onaylı, demo değil, Doğaltaş izinli uzman) DB'de doğrulanır.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const action = pickEnum(body, "action", ["grant", "revoke"] as const);
    const target = pickUuid(body, "user_id");
    if (action === "grant") {
      const id = await ownerRpc<string>(db, "stone_library_grant_access", { p_actor: ownerId, p_target: target, p_note: pickString(body, "note", 500) });
      return ownerJson({ ok: true, id });
    }
    await ownerRpc(db, "stone_library_revoke_access", { p_actor: ownerId, p_target: target, p_reason: "owner_revoked" });
    return ownerJson({ ok: true });
  });
}
