import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { isUuid, OwnerInputError, ownerBadRequest, ownerJson, pickEnum, pickObject, pickString, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";
import { noteHealthSensitive, ownerHealthFields } from "@/lib/stone-library/ownerLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — owner katmanları: sürümler, çeviriler (eskime dahil), ek bilgiler, owner görselleri, yayına hazırlık. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const layers = await ownerRpc<Record<string, unknown> | null>(db, "stone_library_owner_layers", { p_actor: ownerId, p_stone_id: id });
    if (!layers) return ownerBadRequest("NOT_FOUND", "Taş bulunamadı.", 404);
    return ownerJson({ ok: true, ...layers });
  });
}

const ACTIONS = ["save_version", "set_version", "publish", "unpublish", "note_save", "note_delete", "note_restore",
  "image_primary", "image_delete", "image_restore", "image_license", "translation"] as const;

/**
 * POST (owner). Kaynak (sağlayıcı) kayıtlarına hiçbir işlem yazmaz; owner katmanı ayrı ve sürümlüdür.
 *   save_version  { data, publish?: boolean, expected_version?, note? }   Taslak Kaydet / Kaydet ve Yayınla
 *   set_version   { version: number | null, note? }                       önceki sürüme / özgün kaynağa dön (null)
 *   publish       { note? }  tek adım yayın · unpublish { note? } yayından kaldır
 *   note_save     { note_id?, data: { kind, title?, body, visible_to_experts?, expected_version? } }
 *   note_delete / note_restore { note_id }
 *   image_primary { image_id: uuid | null }   (null = kaynak görseline dön)
 *   image_delete / image_restore { image_id } · image_license { image_id, license_status, license_note? }
 *   translation   { field?: alan | null, op: "publish" | "unpublish", dry_run?: boolean }
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const body = await readOwnerBody(req);
    const action = pickEnum(body, "action", ACTIONS);
    const note = pickString(body, "note", 1000);
    let result: unknown = null;
    switch (action) {
      case "save_version": {
        const data = pickObject(body, "data");
        const expected = body.expected_version;
        if (expected != null && (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0)) throw new OwnerInputError("expected_version geçersiz.");
        result = await ownerRpc(db, "stone_library_owner_version_save", {
          p_actor: ownerId, p_stone_id: id, p_data: data, p_health_fields: ownerHealthFields(data),
          p_publish: body.publish === true, p_expected_version: expected ?? null, p_note: note,
        });
        break;
      }
      case "set_version": {
        const v = body.version;
        if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 1)) throw new OwnerInputError("version geçersiz.");
        await ownerRpc(db, "stone_library_owner_version_set_current", { p_actor: ownerId, p_stone_id: id, p_version: v, p_note: note });
        break;
      }
      case "publish":
        result = await ownerRpc(db, "stone_library_owner_publish", { p_actor: ownerId, p_stone_id: id, p_note: note });
        break;
      case "unpublish":
        await ownerRpc(db, "stone_library_stone_set_status", { p_actor: ownerId, p_stone_id: id, p_status: "hidden", p_note: note });
        break;
      case "note_save": {
        const data = pickObject(body, "data");
        const noteId = body.note_id == null ? null : body.note_id;
        if (noteId !== null && !isUuid(noteId)) throw new OwnerInputError("note_id geçersiz.");
        if (data.kind != null && data.kind !== "note" && data.kind !== "warning") throw new OwnerInputError("kind geçersiz.");
        const clean: Record<string, unknown> = {};
        for (const k of ["kind", "title", "body", "visible_to_experts", "sort_order", "expected_version"]) if (k in data) clean[k] = data[k];
        clean.health_sensitive = noteHealthSensitive(data.title, data.body);
        result = await ownerRpc(db, "stone_library_owner_note_save", { p_actor: ownerId, p_note_id: noteId, p_stone_id: id, p_data: clean });
        break;
      }
      case "note_delete":
      case "note_restore": {
        const noteId = body.note_id;
        if (!isUuid(noteId)) throw new OwnerInputError("note_id geçersiz.");
        await ownerRpc(db, "stone_library_owner_note_delete", { p_actor: ownerId, p_note_id: noteId, p_restore: action === "note_restore" });
        break;
      }
      case "image_primary": {
        const img = body.image_id ?? null;
        if (img !== null && !isUuid(img)) throw new OwnerInputError("image_id geçersiz.");
        await ownerRpc(db, "stone_library_owner_image_set_primary", { p_actor: ownerId, p_stone_id: id, p_image_id: img });
        break;
      }
      case "image_delete":
      case "image_restore":
      case "image_license": {
        const img = body.image_id;
        if (!isUuid(img)) throw new OwnerInputError("image_id geçersiz.");
        const data: Record<string, unknown> = {};
        if (action === "image_license") {
          data.license_status = pickEnum(body, "license_status", ["documented", "undocumented"] as const);
          data.license_note = pickString(body, "license_note", 2000);
        }
        // Görsel bu taşa ait olmalı (başka taşın görseli bu uçtan değiştirilemez).
        const layers = await ownerRpc<{ owner_images?: { id: string }[] } | null>(db, "stone_library_owner_layers", { p_actor: ownerId, p_stone_id: id });
        if (!layers?.owner_images?.some((x) => x.id === img)) return ownerBadRequest("NOT_FOUND", "Görsel bu taşa ait değil.", 404);
        await ownerRpc(db, "stone_library_owner_image_update", {
          p_actor: ownerId, p_image_id: img, p_action: action === "image_delete" ? "delete" : action === "image_restore" ? "restore" : "license", p_data: data,
        });
        break;
      }
      case "translation": {
        const field = body.field == null ? null : pickEnum(body, "field", ["description", "meaning_spiritual", "meaning_emotional", "meaning_physical", "affirmation", "keywords"] as const);
        result = await ownerRpc(db, "stone_library_translation_publish", {
          p_actor: ownerId, p_stone_id: id, p_field: field, p_action: pickEnum(body, "op", ["publish", "unpublish"] as const), p_dry_run: body.dry_run === true,
        });
        break;
      }
    }
    const readiness = await ownerRpc(db, "stone_library_owner_readiness", { p_actor: ownerId, p_stone_id: id });
    return ownerJson({ ok: true, result, readiness });
  });
}
