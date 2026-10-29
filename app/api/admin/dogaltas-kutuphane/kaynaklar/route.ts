import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { isUuid, OwnerInputError, ownerJson, pickEnum, pickObject, pickString, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["save_source", "add_document", "save_license", "license_status"] as const;

/**
 * POST /api/admin/dogaltas-kutuphane/kaynaklar — kaynak / lisans yönetimi (yalnız owner).
 *   { action: "save_source", id?, data }            kaynak oluştur / güncelle (görünürlük, lisans, görsel hakkı …)
 *   { action: "add_document", source_id, data }     lisans belgesi kaydı (içerik değil; başlık + SHA-256)
 *   { action: "save_license", id?, data }           yazılı izin kaydı (kapsam, abonelik sonrası hak, atıf …)
 *   { action: "license_status", id, status, note? } verified | revoked | owner_verification_pending
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const action = pickEnum(body, "action", ACTIONS);
    const optId = (k: string) => {
      const v = body[k];
      if (v == null) return null;
      if (!isUuid(v)) throw new OwnerInputError(`${k} geçersiz.`);
      return v;
    };
    if (action === "save_source") {
      const id = await ownerRpc<string>(db, "stone_library_source_save", { p_actor: ownerId, p_source_id: optId("id"), p_data: pickObject(body, "data") });
      return ownerJson({ ok: true, id });
    }
    if (action === "add_document") {
      const id = await ownerRpc<string>(db, "stone_library_document_add", { p_actor: ownerId, p_source_id: pickUuid(body, "source_id"), p_data: pickObject(body, "data") });
      return ownerJson({ ok: true, id }, 201);
    }
    if (action === "save_license") {
      const id = await ownerRpc<string>(db, "stone_library_license_grant_save", { p_actor: ownerId, p_grant_id: optId("id"), p_data: pickObject(body, "data") });
      return ownerJson({ ok: true, id });
    }
    await ownerRpc(db, "stone_library_license_grant_set_status", {
      p_actor: ownerId, p_grant_id: pickUuid(body, "id"), p_status: pickEnum(body, "status", ["verified", "revoked", "owner_verification_pending"] as const),
      p_note: pickString(body, "note", 2000),
    });
    return ownerJson({ ok: true });
  });
}
