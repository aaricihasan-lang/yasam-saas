import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, TECHNIQUE_SAFETY_WRITABLE } from "@/lib/cupping/fields";
import {
  assertCompositeRef,
  assertOwnedRef,
  cuppingError,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/technique-safety — technique ↔ master safety note (FAZ 4).
 * protocol_safety desenini yeniden kullanır; tenant server-forced, service-role only.
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const techniqueId = req.nextUrl.searchParams.get("techniqueId")?.trim();
  const safetyId = req.nextUrl.searchParams.get("safetyId")?.trim();
  const eqFilters: Record<string, string> = {};
  if (techniqueId) eqFilters.technique_id = techniqueId;
  if (safetyId) eqFilters.safety_id = safetyId;
  const res = await listEntity(db, CUPPING_TABLES.techniqueSafety, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: Object.keys(eqFilters).length ? eqFilters : undefined,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, relations: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, relation: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, TECHNIQUE_SAFETY_WRITABLE);
  const techniqueId = typeof fields.technique_id === "string" ? fields.technique_id : "";
  const safetyId = typeof fields.safety_id === "string" ? fields.safety_id : "";

  if (!(await assertOwnedRef(db, CUPPING_TABLES.techniques, tenantId, techniqueId))) {
    return cuppingError(400, "Teknik bu hesaba ait değil veya bulunamadı.");
  }
  if (!(await assertOwnedRef(db, CUPPING_TABLES.safety, tenantId, safetyId))) {
    return cuppingError(400, "Seçilen güvenlik kaydı bu hesaba ait değil.");
  }
  if (await assertCompositeRef(db, CUPPING_TABLES.techniqueSafety, { tenant_id: tenantId, technique_id: techniqueId, safety_id: safetyId })) {
    return cuppingError(409, "Bu güvenlik kaydı tekniğe zaten eklenmiş.");
  }

  const ins = await insertEntity(db, CUPPING_TABLES.techniqueSafety, tenantId, fields);
  if (!ins.ok) return ins.response;
  return NextResponse.json({ ok: true, relation: ins.data });
}
