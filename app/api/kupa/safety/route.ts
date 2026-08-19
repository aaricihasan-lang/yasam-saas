import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, SAFETY_WRITABLE } from "@/lib/cupping/fields";
import { insertEntity, listEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/safety — güvenlik / kontrendikasyon (bağımsız kayıt, açıklamaya gömülü değil). */

const SEVERITIES = new Set(["info", "warning", "contraindication"]);

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const res = await listEntity(guard.db, CUPPING_TABLES.safety, guard.tenantId, {
    orderBy: "sort_order",
    ascending: true,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, notes: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, note: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, SAFETY_WRITABLE);
  if (!String(fields.title ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "Başlık gerekli." }, { status: 400 });
  }
  if (fields.severity !== undefined && !SEVERITIES.has(String(fields.severity))) {
    return NextResponse.json({ ok: false, error: "Geçersiz önem düzeyi." }, { status: 400 });
  }
  const res = await insertEntity(db, CUPPING_TABLES.safety, tenantId, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, note: res.data });
}
