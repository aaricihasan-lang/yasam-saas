import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — owner taş yönetimi listesi: katman özeti + dinamik sayımlar (sabit taş sayısı yok). */
export async function GET(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const summary = await ownerRpc<Record<string, unknown>>(db, "stone_library_owner_layer_summary", { p_actor: ownerId });
    return ownerJson({ ok: true, ...summary });
  });
}
