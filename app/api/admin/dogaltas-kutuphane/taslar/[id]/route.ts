import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { buildOwnerCompare, type OwnerRecordRow } from "@/lib/stone-library/ownerCompare";
import { isUuid, ownerBadRequest, ownerJson, pickEnum, pickObject, pickString, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — owner taş ayrıntısı: tüm sürümler, facet'ler, adlar, görseller, TR/EN karşılaştırma, uzmana giden yayın belgesi. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const [stone, images] = await Promise.all([
      ownerRpc<Record<string, unknown> | null>(db, "stone_library_owner_stone", { p_actor: ownerId, p_stone_id: id }),
      ownerRpc(db, "stone_library_owner_images", { p_actor: ownerId, p_stone_id: id }),
    ]);
    if (!stone) return ownerBadRequest("NOT_FOUND", "Taş bulunamadı.", 404);
    const compare = buildOwnerCompare((stone.records ?? []) as OwnerRecordRow[]);
    return ownerJson({ ok: true, ...stone, images, compare });
  });
}

const ACTIONS = ["edit", "publish", "unpublish", "hide"] as const;

/**
 * POST — { action: "edit", data: { name_tr?, name_en?, slug?, expected_version? } } | { action: "publish" | "unpublish" | "hide", note? }
 * Silme / geri alma: /silme ucu (geri alınabilir, bağımlılık kontrollü).
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return ownerBadRequest("INPUT", "id geçersiz.");
    const body = await readOwnerBody(req);
    const action = pickEnum(body, "action", ACTIONS);
    if (action === "edit") {
      await ownerRpc(db, "stone_library_stone_save", { p_actor: ownerId, p_stone_id: id, p_data: pickObject(body, "data") });
    } else {
      const status = action === "publish" ? "published" : action === "hide" ? "hidden" : "draft";
      await ownerRpc(db, "stone_library_stone_set_status", { p_actor: ownerId, p_stone_id: id, p_status: status, p_note: pickString(body, "note", 2000) });
    }
    return ownerJson({ ok: true });
  });
}
