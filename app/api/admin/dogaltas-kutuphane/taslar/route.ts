import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, pickObject, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["draft", "review", "ready", "published", "hidden", "deleted"]);

/** GET /api/admin/dogaltas-kutuphane/taslar?q=&status=&limit=&offset= — owner taş listesi (inceleme sayaçlarıyla). */
export async function GET(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status");
    const lim = Number.parseInt(sp.get("limit") ?? "50", 10);
    const off = Number.parseInt(sp.get("offset") ?? "0", 10);
    const data = await ownerRpc(db, "stone_library_owner_stones", {
      p_actor: ownerId, p_query: (sp.get("q") ?? "").slice(0, 80), p_status: status && STATUSES.has(status) ? status : null,
      p_limit: Number.isFinite(lim) ? lim : 50, p_offset: Number.isFinite(off) ? off : 0,
    });
    return ownerJson({ ok: true, ...(data as object) });
  });
}

/** POST /api/admin/dogaltas-kutuphane/taslar — owner yeni taş ekler: { stone: { slug, name_tr, name_en? } } (taslak başlar). */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const id = await ownerRpc<string>(db, "stone_library_stone_save", { p_actor: ownerId, p_stone_id: null, p_data: pickObject(body, "stone") });
    return ownerJson({ ok: true, id }, 201);
  });
}
