import { NextRequest, NextResponse } from "next/server";
import {
  searchGlobalLocations, MIN_QUERY_LENGTH, MAX_LIMIT, DEFAULT_LIMIT,
} from "@/lib/location/server/search";

export const runtime = "nodejs";

/**
 * GET /api/location/search?q=<sorgu>&limit=<n>&country=<ISO2>
 *
 * Global (Türkiye HARİÇ) konum arama — FAZ 5 / P5f-2.
 *   - Salt-okunur; DIŞ API çağrısı YOK; DB YOK; auth YOK (public referans veri).
 *   - `q` trim sonrası MIN_QUERY_LENGTH'ten kısaysa boş results döner.
 *   - `limit` DEFAULT_LIMIT (10), MAX_LIMIT (10) ile cap'lenir.
 *   - Sonuçlar Location uyumlu; TR authoritative olarak dataset dışı → asla TR dönmez
 *     (client TR_LOCATIONS birleştirmesi P5f-3).
 *
 * Yanıt: { ok: true, results: Location[], query: string }
 * Hata : { ok: false, error: string }  (ham stack DÖNMEZ)
 */
export function GET(req: NextRequest): NextResponse {
  try {
    const sp = req.nextUrl.searchParams;
    const query = (sp.get("q") ?? "").trim();
    const country = (sp.get("country") ?? "").trim() || undefined;

    const limitRaw = Number(sp.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ ok: true, results: [], query });
    }

    const results = searchGlobalLocations(query, { limit, countryCode: country });
    return NextResponse.json({ ok: true, results, query });
  } catch {
    // Ham hata/stack sızdırma yok.
    return NextResponse.json({ ok: false, error: "Arama sırasında bir hata oluştu." }, { status: 500 });
  }
}
