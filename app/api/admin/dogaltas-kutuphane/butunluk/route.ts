import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { isUuid, ownerBadRequest, ownerJson, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dogaltas-kutuphane/butunluk[?stone_id=] — kaynak metin bütünlüğü (owner; salt-okuma).
 * Sağlayıcı kaynak kayıtları, anahtar kelimeler ve taş adları bağlı oldukları ham yanıtla karakteri karakterine + SHA-256 ile
 * karşılaştırılır. Yanıt yalnız sayılar + uyuşmayan kayıt kimlikleri içerir (metin içermez).
 */
export async function GET(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const sid = new URL(req.url).searchParams.get("stone_id");
    if (sid !== null && !isUuid(sid)) return ownerBadRequest("INPUT", "stone_id geçersiz.");
    const integrity = await ownerRpc(db, "stone_library_owner_integrity", { p_actor: ownerId, p_stone_id: sid });
    return ownerJson({ ok: true, integrity });
  });
}
