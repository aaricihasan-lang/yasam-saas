import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { OwnerInputError, ownerJson, pickEnum, pickString, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";
import { BULK_DELETE_MIN } from "@/lib/stone-library/ownerLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 3 ve üzeri taşın silinmesi ÜÇ AŞAMALI onay ister (arayüz: seçim → sayılı uyarı → "SİL" yazma):
 *   { step: "prepare", stone_ids: uuid[] }                         → onay belirteci (10 dk, tek kullanımlık, owner'a bağlı)
 *   { step: "confirm", token, confirm_text: "SİL", reason? }        → yayındakiler yayından kaldırılır, hepsi geri alınabilir silinir
 *   { step: "restore", token }                                      → toplu silmenin tamamı geri alınır
 * Tek / iki taş: mevcut /silme ucu (geri alınabilir). Kalıcı silme yolu yoktur.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const step = pickEnum(body, "step", ["prepare", "confirm", "restore"] as const);
    if (step === "prepare") {
      const ids = body.stone_ids;
      if (!Array.isArray(ids) || ids.length < BULK_DELETE_MIN || ids.length > 500) throw new OwnerInputError(`Toplu silme ${BULK_DELETE_MIN}–500 taş içindir.`);
      return ownerJson({ ok: true, result: await ownerRpc(db, "stone_library_bulk_delete_prepare", { p_actor: ownerId, p_stone_ids: ids }) });
    }
    const token = pickUuid(body, "token");
    if (step === "confirm") {
      return ownerJson({ ok: true, result: await ownerRpc(db, "stone_library_bulk_delete_confirm", {
        p_actor: ownerId, p_token: token, p_confirm_text: pickString(body, "confirm_text", 20) ?? "", p_reason: pickString(body, "reason", 1000),
      }) });
    }
    return ownerJson({ ok: true, result: await ownerRpc(db, "stone_library_bulk_restore", { p_actor: ownerId, p_token: token }) });
  });
}
