import type { NextRequest } from "next/server";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { ownerJson, pickEnum, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["description", "meaning_spiritual", "meaning_emotional", "meaning_physical", "affirmation", "keywords"] as const;

/**
 * POST { op: "publish" | "unpublish", field?: alan, dry_run?: boolean } — katalog genelinde sayılı toplu çeviri yayını.
 * Kaynak metin (fallback) ve eskimiş (kaynak EN metni değişmiş) alanlar SUNUCUDA hariç tutulur; önce dry_run ile
 * etkilenecek / hariç sayıları alınır. Çeviri içe aktarma web'den YAPILMAZ (Git dışı paket, çevrimdışı betik).
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const result = await ownerRpc(db, "stone_library_translation_publish", {
      p_actor: ownerId, p_stone_id: null, p_field: body.field == null ? null : pickEnum(body, "field", FIELDS),
      p_action: pickEnum(body, "op", ["publish", "unpublish"] as const), p_dry_run: body.dry_run === true,
    });
    return ownerJson({ ok: true, result });
  });
}
