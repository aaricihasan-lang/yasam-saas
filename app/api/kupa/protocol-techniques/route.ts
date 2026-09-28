import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { CUPPING_TABLES, PROTOCOL_TECHNIQUE_WRITABLE } from "@/lib/cupping/fields";
import {
  assertCompositeRef,
  assertOwnedRef,
  cuppingError,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
  usageRowId,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/protocol-techniques — protokol ↔ master technique (Bölüm 3). */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const protocolId = req.nextUrl.searchParams.get("protocolId")?.trim();
  const res = await listEntity(db, CUPPING_TABLES.protocolTechniques, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: protocolId ? { protocol_id: protocolId } : undefined,
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

  const fields = pickWritable(parsed.data, PROTOCOL_TECHNIQUE_WRITABLE);
  const protocolId = typeof fields.protocol_id === "string" ? fields.protocol_id : "";
  const techniqueId = typeof fields.technique_id === "string" ? fields.technique_id : "";

  if (!(await assertOwnedRef(db, CUPPING_TABLES.protocols, tenantId, protocolId))) {
    return cuppingError(400, "Protokol bu hesaba ait değil veya bulunamadı.");
  }
  if (!(await assertOwnedRef(db, CUPPING_TABLES.techniques, tenantId, techniqueId))) {
    return cuppingError(400, "Seçilen teknik bu hesaba ait değil.");
  }
  if (await assertCompositeRef(db, CUPPING_TABLES.protocolTechniques, { tenant_id: tenantId, protocol_id: protocolId, technique_id: techniqueId })) {
    await trackUsage(guard, req, { module: "cupping", action: "action_failed", failedAction: "record_updated", subEntity: "protocol", errorClass: "conflict" });
    return cuppingError(409, "Bu teknik protokole zaten eklenmiş.");
  }

  const ins = await insertEntity(db, CUPPING_TABLES.protocolTechniques, tenantId, fields);
  if (!ins.ok) {
    const errorClass = usageErrorClassForStatus(ins.response.status);
    if (errorClass) await trackUsage(guard, req, { module: "cupping", action: "action_failed", failedAction: "record_updated", subEntity: "protocol", errorClass });
    return ins.response;
  }
  await trackUsage(guard, req, { module: "cupping", action: "record_updated", subEntity: "protocol", resourceId: usageRowId(ins.data) });
  return NextResponse.json({ ok: true, relation: ins.data });
}
