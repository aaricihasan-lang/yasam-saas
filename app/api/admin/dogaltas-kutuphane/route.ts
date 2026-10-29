import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/dogaltas-kutuphane — owner genel görünüm: ayarlar, kaynaklar (gerçek ad), paketler, yetkiler, lisans izinleri. */
export async function GET(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const [overview, licenses] = await Promise.all([
      ownerRpc(db, "stone_library_owner_overview", { p_actor: ownerId }),
      ownerRpc(db, "stone_library_owner_licenses", { p_actor: ownerId }),
    ]);
    return ownerJson({ ok: true, overview, licenses });
  });
}
