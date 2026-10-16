import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { listHdAnalysisGroups } from "@/lib/human-design/api/hdAnalysisList";

export const runtime = "nodejs";

/**
 * GET /api/hd/analyses?q=&offset=&limit= — "HUMAN DESIGN ANALİZLERİM" tek listesi (salt-okuma).
 *
 *   - requireModuleAccess("human_design"); tenant YALNIZ guard'dan (withTenant).
 *   - Profil bazında gruplanmış; yalnız analizi olan profiller; sunucu taraflı arama + sayfalama.
 *   - Yanıtta yalnız liste alanları (ad, doğum tarihi, tip/profil kodu, tarih, sayı, bağlantı durumu);
 *     doğum saati/yeri, notlar, hesap sonucu dönmez. no-store.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const sp = new URL(req.url).searchParams;
  const num = (k: string) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) ? v : undefined;
  };
  const r = await listHdAnalysisGroups(guard.db, guard.tenantId, { q: sp.get("q") ?? "", offset: num("offset"), limit: num("limit") });
  if (!r.ok) {
    return NextResponse.json({ ok: false, code: "LIST_FAILED", error: "Human Design analizleri yüklenemedi. Sayfayı yenileyin." }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json(
    { ok: true, rows: r.rows, total: r.total, offset: r.offset, limit: r.limit },
    { status: 200, headers: NO_STORE },
  );
}
