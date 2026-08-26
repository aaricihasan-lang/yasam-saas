import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_WRITABLE } from "@/lib/cupping/fields";
import { cuppingError, insertEntity, listEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/protocols — V2 HACAMAT PROTOKOLLERİ (root). Legacy /api/kupa/topics'ten AYRI.
 *
 * Güvenlik: requireModuleAccess("cupping"); tenant_id SUNUCUDA (body'den güvenilmez);
 *   yalnız PROTOCOL_WRITABLE alanları yazılır (mass-assignment engeli); demo → persist=0;
 *   ham DB hatası sızmaz.
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const res = await listEntity(db, CUPPING_TABLES.protocols, tenantId, {
    orderBy: "sort_order",
    ascending: true,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, protocols: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, protocol: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, PROTOCOL_WRITABLE);
  if (!String(fields.title ?? "").trim()) return cuppingError(400, "Protokol başlığı gerekli.");

  const ins = await insertEntity(db, CUPPING_TABLES.protocols, tenantId, fields);
  if (!ins.ok) return ins.response;
  return NextResponse.json({ ok: true, protocol: ins.data });
}
