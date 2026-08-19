import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, TECHNIQUE_WRITABLE } from "@/lib/cupping/fields";
import { insertEntity, listEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/techniques — kupa teknikleri (kuru/yaş/sabit/hareketli — `kind` serbest). */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const res = await listEntity(guard.db, CUPPING_TABLES.techniques, guard.tenantId, {
    orderBy: "sort_order",
    ascending: true,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, techniques: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, technique: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, TECHNIQUE_WRITABLE);
  if (!String(fields.name ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "Teknik adı gerekli." }, { status: 400 });
  }
  const res = await insertEntity(db, CUPPING_TABLES.techniques, tenantId, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, technique: res.data });
}
