import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, KNOWLEDGE_WRITABLE } from "@/lib/cupping/fields";
import { insertEntity, listEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/knowledge — bilgi & eğitim kütüphanesi (uzun profesyonel kayıtlar). */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const res = await listEntity(guard.db, CUPPING_TABLES.knowledge, guard.tenantId, {
    orderBy: "sort_order",
    ascending: true,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, records: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, record: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, KNOWLEDGE_WRITABLE);
  if (!String(fields.title ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "Başlık gerekli." }, { status: 400 });
  }
  const res = await insertEntity(db, CUPPING_TABLES.knowledge, tenantId, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, record: res.data });
}
