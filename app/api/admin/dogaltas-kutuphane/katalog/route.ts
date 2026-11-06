import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — owner taş yönetimi listesi: katman özeti + dinamik sayımlar (sabit taş sayısı yok).
 * `?yoklama=1`: yalnız owner yoklaması (kütüphanedeki "Kütüphane Yönetimi" sekmesi) — owner kapısı aynen uygulanır,
 * katman özeti hesaplanmaz (owner olmayan herkese yine tek tip 404).
 */
export async function GET(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    if (req.nextUrl.searchParams.get("yoklama") === "1") return ownerJson({ ok: true });
    const summary = await ownerRpc<Record<string, unknown>>(db, "stone_library_owner_layer_summary", { p_actor: ownerId });
    return ownerJson({ ok: true, ...summary });
  });
}
