import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_SOURCE_WRITABLE } from "@/lib/cupping/fields";
import {
  assertOwnedRef,
  cuppingError,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/protocol-sources — protokol-seviye kaynak künyeleri (Bölüm 8).
 * AYNI source protokolde FARKLI locator ile birden fazla kullanılabilir (unique locator dahil).
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const protocolId = req.nextUrl.searchParams.get("protocolId")?.trim();
  const res = await listEntity(db, CUPPING_TABLES.protocolSources, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: protocolId ? { protocol_id: protocolId } : undefined,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, sources: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, source: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, PROTOCOL_SOURCE_WRITABLE);
  const protocolId = typeof fields.protocol_id === "string" ? fields.protocol_id : "";
  const sourceId = typeof fields.source_id === "string" ? fields.source_id : "";

  if (!(await assertOwnedRef(db, CUPPING_TABLES.protocols, tenantId, protocolId))) {
    return cuppingError(400, "Protokol bu hesaba ait değil veya bulunamadı.");
  }
  if (!(await assertOwnedRef(db, CUPPING_TABLES.sources, tenantId, sourceId))) {
    return cuppingError(400, "Seçilen kaynak bu hesaba ait değil.");
  }

  const ins = await insertEntity(db, CUPPING_TABLES.protocolSources, tenantId, fields);
  if (!ins.ok) return ins.response;
  return NextResponse.json({ ok: true, source: ins.data });
}
