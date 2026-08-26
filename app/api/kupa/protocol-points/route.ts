import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_POINT_WRITABLE } from "@/lib/cupping/fields";
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
 * /api/kupa/protocol-points — protokol ↔ master point (Bölüm 2).
 *
 * Güvenlik: gate + tenant server-side + demo; protocol_id ve point_id AYNI tenant'ta
 * GERÇEK olmalı (cross-tenant FK enjeksiyonu reddi). Master point ETKİLENMEZ (RESTRICT).
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const protocolId = req.nextUrl.searchParams.get("protocolId")?.trim();
  const res = await listEntity(db, CUPPING_TABLES.protocolPoints, tenantId, {
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

  const fields = pickWritable(parsed.data, PROTOCOL_POINT_WRITABLE);
  const protocolId = typeof fields.protocol_id === "string" ? fields.protocol_id : "";
  const pointId = typeof fields.point_id === "string" ? fields.point_id : "";

  if (!(await assertOwnedRef(db, CUPPING_TABLES.protocols, tenantId, protocolId))) {
    return cuppingError(400, "Protokol bu hesaba ait değil veya bulunamadı.");
  }
  if (!(await assertOwnedRef(db, CUPPING_TABLES.points, tenantId, pointId))) {
    return cuppingError(400, "Seçilen bölge bu hesaba ait değil.");
  }
  // Duplicate (aynı protokolde aynı bölge) → net 409 (kör 500 yerine).
  if (await assertCompositeRef(db, CUPPING_TABLES.protocolPoints, { tenant_id: tenantId, protocol_id: protocolId, point_id: pointId })) {
    return cuppingError(409, "Bu bölge protokole zaten eklenmiş.");
  }

  const ins = await insertEntity(db, CUPPING_TABLES.protocolPoints, tenantId, fields);
  if (!ins.ok) return ins.response;
  return NextResponse.json({ ok: true, relation: ins.data });
}
