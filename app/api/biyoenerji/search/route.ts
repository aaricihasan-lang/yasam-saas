import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { bioDbError } from "@/lib/biyoenerji/apiError";
import {
  BIO_GLOBAL_CANDIDATE_LIMIT,
  BIO_GLOBAL_RESULT_LIMIT,
  BIO_GLOBAL_SECTIONS,
  bioPrefilterPattern,
  cleanBioGlobalQuery,
  matchBioRow,
  sortBioHits,
  type BioGlobalHit,
} from "@/lib/biyoenerji/globalSearch";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/biyoenerji/search?q= — Biyoenerji modül-içi GENEL arama (WT5).
 *
 * Güvenlik (biyoenerji [resource] ile aynı model):
 *   - requireModuleAccess("energy_body") → x-user-id + x-session-token + binding + modül izni.
 *   - tenant_id YALNIZ session'dan; her sorgu `.eq("tenant_id", tenantId)` → başka tenant'ın kaydı
 *     asla dönmez. Tablo/kolon listesi sunucuda sabit (lib/biyoenerji/globalSearch); istemci
 *     yalnız arama terimini verir.
 *   - Ham DB hatası istemciye dönmez (bioDbError).
 * Yanıt: { ok, query, total, sections: [{ key, label, total, hits[] }] } — bölüm başına en fazla
 * BIO_GLOBAL_RESULT_LIMIT sonuç; `total` gerçek eşleşme sayısıdır (aday tavanı dahilinde).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const query = cleanBioGlobalQuery(new URL(req.url).searchParams.get("q"));
  if (!query) {
    return NextResponse.json({ ok: true, query: "", total: 0, sections: [] }, { headers: NO_STORE });
  }
  const pattern = bioPrefilterPattern(query);

  const results = await Promise.all(
    BIO_GLOBAL_SECTIONS.map(async (sec) => {
      const cols = ["id", ...new Set([sec.titleCol, ...sec.fields])].join(",");
      const { data, error } = await db
        .from(sec.table)
        .select(cols)
        .eq("tenant_id", tenantId)
        .or(sec.fields.map((f) => `${f}.ilike.${pattern}`).join(","))
        .order(sec.titleCol, { ascending: true })
        .limit(BIO_GLOBAL_CANDIDATE_LIMIT);
      return { sec, data: (data ?? []) as unknown as Record<string, unknown>[], error };
    }),
  );

  const failed = results.find((r) => r.error);
  if (failed) return bioDbError(`global-search:${failed.sec.resource}`, failed.error, "Arama yapılamadı. Lütfen tekrar deneyin.");

  let total = 0;
  const sections = results
    .map(({ sec, data }) => {
      const hits = sortBioHits(
        data.map((row) => matchBioRow(sec, row, query)).filter((h): h is BioGlobalHit => h !== null),
        sec,
      );
      total += hits.length;
      return { key: sec.key, label: sec.label, total: hits.length, hits: hits.slice(0, BIO_GLOBAL_RESULT_LIMIT) };
    })
    .filter((s) => s.total > 0);

  return NextResponse.json({ ok: true, query, total, sections }, { headers: NO_STORE });
}
