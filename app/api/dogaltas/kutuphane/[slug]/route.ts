import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { STONE_LIBRARY_NO_STORE, requireStoneLibraryViewer, stoneLibraryNotFound } from "@/lib/stone-library/access";
import { STONE_LIBRARY_RPC } from "@/lib/stone-library/contract";
import { findStoneLibraryLeaks, isStoneLibrarySlug, stoneDocAllowedLabels, toExpertStoneDoc } from "@/lib/stone-library/expertDto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/dogaltas/kutuphane/[slug] — yayımlanmış taş kartı (yetkili uzman + owner). Kaynak etiketi görünürlük
 * kararına göre DB'de çözülmüştür; gerçek kaynak kimliği / lisans / ham veri / iç kimlik yanıtta YOKTUR.
 * Yayımlanmamış / gizli / silinmiş / tahmin edilen slug → 404.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireStoneLibraryViewer(req);
  if (!gate.ok) return gate.response;
  try {
    const { slug } = await context.params;
    if (!isStoneLibrarySlug(slug)) return stoneLibraryNotFound();
    const { data, error } = await gate.ctx.db.rpc(STONE_LIBRARY_RPC.expertStone, { p_viewer: gate.ctx.viewerId, p_slug: slug });
    if (error) return stoneLibraryNotFound();
    const raw = Array.isArray(data) ? data[0]?.[STONE_LIBRARY_RPC.expertStone] ?? data[0] : data;
    const item = toExpertStoneDoc(raw);
    if (!item) return stoneLibraryNotFound();
    const leaks = findStoneLibraryLeaks(item, stoneDocAllowedLabels(item));
    if (leaks.length > 0) {
      // İçerik log'a yazılmaz; yalnız yol + neden (teşhis için).
      console.warn("[stone-library] sızıntı kilidi: taş kartı servis edilmedi", leaks.slice(0, 5));
      return stoneLibraryNotFound();
    }
    return NextResponse.json({ ok: true, item }, { headers: STONE_LIBRARY_NO_STORE });
  } catch {
    return stoneLibraryNotFound();
  }
}
