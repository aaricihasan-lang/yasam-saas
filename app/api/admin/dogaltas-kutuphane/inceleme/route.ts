import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { OwnerInputError, ownerJson, pickEnum, pickString, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTITIES = ["record", "facet", "name", "image"] as const;
const REVIEW_ACTIONS = ["approve", "reject", "hide", "show", "legal_clear", "legal_revoke", "mark_health_sensitive"] as const;
const LANG_ACTIONS = ["confirm_language", "mark_lang_suspect"] as const;
const ALL = [...REVIEW_ACTIONS, ...LANG_ACTIONS, "set_current", "edit_text"] as const;

/**
 * POST /api/admin/dogaltas-kutuphane/inceleme — owner içerik kararı.
 *   { entity, id, action, note? }                         onay / ret / gizle / göster / hukuk onayı / sağlık işareti
 *   { entity: "record"|"facet", id, action: "confirm_language" | "mark_lang_suspect" }   dil doğrulama
 *   { entity: "record", id, action: "set_current" }        sürüm seçimi (eski sürüme dönüş dahil)
 *   { entity: "record", id, action: "edit_text", content } owner düzenlemesi = YENİ SÜRÜM (kaynak metni değişmez)
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const entity = pickEnum(body, "entity", ENTITIES);
    const id = pickUuid(body, "id");
    const action = pickEnum(body, "action", ALL);
    const note = pickString(body, "note", 2000);
    if ((LANG_ACTIONS as readonly string[]).includes(action)) {
      if (entity !== "record" && entity !== "facet") throw new OwnerInputError("Dil işlemi yalnız kayıt / facet için.");
      const flags = await ownerRpc(db, "stone_library_quality_flags", { p_actor: ownerId, p_entity: entity, p_id: id, p_action: action, p_flags: null, p_note: note });
      return ownerJson({ ok: true, flags });
    }
    if (action === "set_current") {
      if (entity !== "record") throw new OwnerInputError("Sürüm seçimi yalnız kayıt için.");
      await ownerRpc(db, "stone_library_record_set_current", { p_actor: ownerId, p_record_id: id, p_note: note });
      return ownerJson({ ok: true });
    }
    if (action === "edit_text") {
      if (entity !== "record") throw new OwnerInputError("Metin düzenleme yalnız kayıt için.");
      const content = pickString(body, "content", 150000);
      if (!content || !content.trim()) throw new OwnerInputError("content gerekli.");
      const stone = await ownerRpc<{ records?: { id: string; stone_id: string; source_id: string; field_key: string; lang: string }[] } | null>(
        db, "stone_library_owner_stone", { p_actor: ownerId, p_stone_id: pickUuid(body, "stone_id") });
      const base = stone?.records?.find((r) => r.id === id);
      if (!base) throw new OwnerInputError("Düzenleme tabanı bulunamadı.");
      const newId = await ownerRpc<string>(db, "stone_library_record_add", { p_actor: ownerId, p_data: {
        stone_id: base.stone_id, source_id: base.source_id, field_key: base.field_key, lang: base.lang, content, origin: "owner_edit", based_on_id: id } });
      return ownerJson({ ok: true, id: newId }, 201);
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
