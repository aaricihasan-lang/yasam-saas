import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { STONE_LIBRARY_NO_STORE, requireStoneLibraryViewer, stoneLibraryNotFound } from "@/lib/stone-library/access";
import { STONE_LIBRARY_RPC } from "@/lib/stone-library/contract";
import { dropLeakingItems, findStoneLibraryLeaks, parseStoneLibrarySearch, toExpertFacetCatalog, toExpertSearchResult } from "@/lib/stone-library/expertDto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dogaltas/kutuphane — Doğaltaş Kütüphanesi araması (yalnız owner'ın kişi bazında yetki verdiği uzman + owner).
 * Yalnız yayımlanmış yüzeyden okur (sağlayıcı çağrısı / kredi YOK). Yazma ucu YOK (POST/PATCH/DELETE → 405).
 * `?filtreler=1` → filtre kataloğu (yalnız yayındaki taşlarda gerçekten bulunan renk / çakra / burç / element / gezegen /
 * doğum ayı değerleri + sayıları; kaynakta olmayan değer üretilmez).
 * Yetkisiz / kapalı / hata → tek tip 404 + no-store.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireStoneLibraryViewer(req);
  if (!gate.ok) return gate.response;
  try {
    const sp = new URL(req.url).searchParams;
    // `?yoklama=1`: yalnız erişim yoklaması (Doğaltaş ana ekranındaki kütüphane kartı) — kapı yukarıda aynen uygulandı;
    // içerik hesaplanmaz / gönderilmez. Yetkisiz herkes yine tek tip 404 alır.
    if (sp.get("yoklama") === "1") return NextResponse.json({ ok: true }, { headers: STONE_LIBRARY_NO_STORE });
    if (sp.get("filtreler") === "1") {
      const { data, error } = await gate.ctx.db.rpc(STONE_LIBRARY_RPC.expertFacets, { p_viewer: gate.ctx.viewerId });
      if (error) return stoneLibraryNotFound();
      const catalog = toExpertFacetCatalog(Array.isArray(data) ? data[0]?.[STONE_LIBRARY_RPC.expertFacets] ?? data[0] : data);
      if (!catalog || findStoneLibraryLeaks(catalog).length > 0) return stoneLibraryNotFound();
      return NextResponse.json({ ok: true, ...catalog }, { headers: STONE_LIBRARY_NO_STORE });
    }
    const p = parseStoneLibrarySearch(sp);
    const { data, error } = await gate.ctx.db.rpc(STONE_LIBRARY_RPC.expertSearch, {
      p_viewer: gate.ctx.viewerId,
      p_query: p.query,
      p_filters: p.filters,
      p_limit: p.limit,
      p_offset: p.offset,
    });
    if (error) return stoneLibraryNotFound();
    const result = toExpertSearchResult(Array.isArray(data) ? data[0]?.[STONE_LIBRARY_RPC.expertSearch] ?? data[0] : data);
    if (!result) return stoneLibraryNotFound();
    // İkinci kilit: sızıntı taramasına takılan öğe HİÇ gönderilmez (sayfanın geri kalanı servis edilir).
    const safe = dropLeakingItems(result);
    if (safe.dropped.length > 0) {
      // İçerik log'a yazılmaz; yalnız yol + neden (teşhis için).
      console.warn("[stone-library] sızıntı kilidi: arama öğesi düşürüldü", safe.dropped.slice(0, 5));
    }
    return NextResponse.json({ ok: true, ...safe.result }, { headers: STONE_LIBRARY_NO_STORE });
  } catch {
    return stoneLibraryNotFound();
  }
}
