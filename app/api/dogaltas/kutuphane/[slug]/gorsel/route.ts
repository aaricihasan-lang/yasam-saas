import type { NextRequest } from "next/server";
import { requireStoneLibraryViewer, stoneLibraryNotFound } from "@/lib/stone-library/access";
import { isStoneLibrarySlug } from "@/lib/stone-library/expertDto";
import { rpcValue } from "@/lib/stone-library/import/ownerRpc";
import { sha256Hex } from "@/lib/stone-library/import/imageProcess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };
type ImageRef = { bucket: string; path: string; mime: string; bytes: number; sha256: string };

/**
 * GET /api/dogaltas/kutuphane/[slug]/gorsel — yayımlanmış taşın lisanslı görseli (yetkili uzman + owner).
 * Baytlar BU uçtan akar: sağlayıcı URL'si / depo yolu / bucket adı istemciye gitmez. Görsel yalnız owner onaylı + lisans
 * kanıtı owner tarafından doğrulanmış ise servis edilir (DB). Bütünlük: depodan gelen bayt SHA-256'sı kayıtla eşleşmeli.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireStoneLibraryViewer(req);
  if (!gate.ok) return gate.response;
  try {
    const { slug } = await context.params;
    if (!isStoneLibrarySlug(slug)) return stoneLibraryNotFound();
    const variant = new URL(req.url).searchParams.get("v") === "original" ? "original" : "optimized";
    const { data, error } = await gate.ctx.db.rpc("stone_library_expert_image", { p_viewer: gate.ctx.viewerId, p_slug: slug, p_variant: variant });
    if (error) return stoneLibraryNotFound();
    const ref = rpcValue<ImageRef | null>("stone_library_expert_image", data);
    if (!ref || !ref.path || !ref.bucket) return stoneLibraryNotFound();
    const dl = await gate.ctx.db.storage.from(ref.bucket).download(ref.path);
    if (dl.error || !dl.data) return stoneLibraryNotFound();
    const bytes = Buffer.from(await dl.data.arrayBuffer());
    if (sha256Hex(bytes) !== ref.sha256) {
      console.warn("[stone-library] görsel bütünlük kontrolü başarısız (SHA uyuşmazlığı)");
      return stoneLibraryNotFound();
    }
    return new Response(bytes, {
      headers: {
        "Content-Type": ref.mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${slug}.${ref.mime === "image/webp" ? "webp" : ref.mime === "image/png" ? "png" : "jpg"}"`,
      },
    });
  } catch {
    return stoneLibraryNotFound();
  }
}
