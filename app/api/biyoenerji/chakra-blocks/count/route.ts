import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { chakraChildBreakdown } from "@/lib/bioenergy/chakraBlockCrud";

export const runtime = "nodejs";

/**
 * POST /api/biyoenerji/chakra-blocks/count — toplu silme cascade uyarısı için
 * child block sayıları (READ-ONLY). Body: { chakraIds: string[] } | { all: true }.
 *
 * Güvenlik:
 *   - requireModuleAccess("energy_body"); tenant_id SUNUCUDA.
 *   - Tüm sayımlar .eq("tenant_id", tenantId) ile scoped → başka tenant verisi
 *     ASLA sayıma girmez (yabancı id'ler 0 katkı yapar, bilgi sızmaz).
 *   - Yazma yok; demo davranışı değişmez.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  let body: { chakraIds?: unknown; all?: unknown };
  try {
    body = (await req.json()) as { chakraIds?: unknown; all?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const all = body.all === true;
  const ids = Array.isArray(body.chakraIds)
    ? body.chakraIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 1000)
    : [];

  if (!all && ids.length === 0) {
    return NextResponse.json({ ok: true, parents: 0, total: 0, visible: 0, evidence: 0 });
  }

  const parentQ = db.from("bioenergy_chakras").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const totalQ = db.from("bioenergy_chakra_blocks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const evidenceQ = db
    .from("bioenergy_chakra_blocks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("block_type", "source-evidence");

  const [parentR, totalR, evidenceR] = await Promise.all([
    all ? parentQ : parentQ.in("id", ids),
    all ? totalQ : totalQ.in("chakra_id", ids),
    all ? evidenceQ : evidenceQ.in("chakra_id", ids),
  ]);

  if (parentR.error || totalR.error || evidenceR.error) {
    console.error("[chakra-blocks/count]", parentR.error?.message || totalR.error?.message || evidenceR.error?.message);
    return NextResponse.json({ ok: false, error: "Sayım yapılamadı." }, { status: 500 });
  }

  const bd = chakraChildBreakdown(totalR.count ?? 0, evidenceR.count ?? 0);
  return NextResponse.json({ ok: true, parents: parentR.count ?? 0, ...bd });
}
