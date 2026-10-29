import type { NextRequest } from "next/server";
import { ownerRpc, ownerRpcList } from "@/lib/stone-library/import/ownerRpc";
import { isUuid, OwnerInputError, ownerJson, pickEnum, pickString, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTITIES = ["record", "facet", "name", "image"] as const;
const REVIEW_ACTIONS = ["approve", "reject", "hide", "show", "legal_clear", "legal_revoke", "mark_health_sensitive"] as const;
const LANG_ACTIONS = ["confirm_language", "mark_lang_suspect"] as const;
const ALL = [...REVIEW_ACTIONS, ...LANG_ACTIONS, "set_current"] as const;

/**
 * POST /api/admin/dogaltas-kutuphane/inceleme — owner içerik kararı.
 *   { entity, id, action, note? }                         onay / ret / gizle / göster / hukuk onayı / sağlık işareti
 *   { entity: "record"|"facet", id, action: "confirm_language" | "mark_lang_suspect" }   dil doğrulama
 *   { entity: "record", id, action: "set_current" }        sürüm seçimi (yalnız kaynak sürümleri arasında; DB zorlar)
 *   { action: "bulk_approve", stone_ids: uuid[1..200], note? }  seçilen taşların BEKLEYEN güncel metin + facet kayıtlarını
 *       owner kararıyla onaylar (görsel, dil doğrulaması, sağlık kararı ve yayın DAHİL DEĞİL).
 * F3: kaynak metni düzenleme ucu YOKTUR. Sağlayıcı metinleri değiştirilemez (DB: SL037); owner'ın kendi içeriği ileride
 * ayrı içerik türü olarak eklenir ve sağlayıcı kaynağıyla karıştırılmaz.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    if (body.action === "bulk_approve") {
      const ids = body.stone_ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 200 || !ids.every((x) => typeof x === "string" && isUuid(x))) {
        throw new OwnerInputError("stone_ids: 1–200 geçerli kimlik gerekli.");
      }
      const result = await ownerRpc(db, "stone_library_owner_bulk_review", { p_actor: ownerId, p_stone_ids: ids, p_note: pickString(body, "note", 2000) });
      return ownerJson({ ok: true, result });
    }
    const entity = pickEnum(body, "entity", ENTITIES);
    const id = pickUuid(body, "id");
    const action = pickEnum(body, "action", ALL);
    const note = pickString(body, "note", 2000);
    if ((LANG_ACTIONS as readonly string[]).includes(action)) {
      if (entity !== "record" && entity !== "facet") throw new OwnerInputError("Dil işlemi yalnız kayıt / facet için.");
      const flags = await ownerRpcList<string>(db, "stone_library_quality_flags", { p_actor: ownerId, p_entity: entity, p_id: id, p_action: action, p_flags: null, p_note: note });
      return ownerJson({ ok: true, flags });
    }
    if (action === "set_current") {
      if (entity !== "record") throw new OwnerInputError("Sürüm seçimi yalnız kayıt için.");
      await ownerRpc(db, "stone_library_record_set_current", { p_actor: ownerId, p_record_id: id, p_note: note });
      return ownerJson({ ok: true });
    }
    if (entity === "image") {
      if (!["approve", "reject", "hide", "show"].includes(action)) throw new OwnerInputError("Görsel için geçersiz işlem.");
      await ownerRpc(db, "stone_library_image_review", { p_actor: ownerId, p_image_id: id, p_action: action, p_note: note });
      return ownerJson({ ok: true });
    }
    await ownerRpc(db, "stone_library_review", { p_actor: ownerId, p_entity: entity, p_id: id, p_action: action, p_note: note });
    return ownerJson({ ok: true });
  });
}
