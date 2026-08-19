import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, POINT_WRITABLE } from "@/lib/cupping/fields";
import { insertEntity, listEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/points — Hacamat noktaları (nokta bilgisi; yerleşimler ayrı tabloda).
 *
 * Güvenlik: requireModuleAccess("cupping") → x-user-id + x-session-token binding +
 * kişiye-özel modül izni. tenant_id SUNUCUDA; body'den güvenilmez. Demo: yazma yok.
 * Ham DB hatası sızmaz (sabit mesaj).
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const res = await listEntity(db, CUPPING_TABLES.points, tenantId, {
    orderBy: "sort_order",
    ascending: true,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, points: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, point: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, POINT_WRITABLE);
  if (!String(fields.name ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "Nokta adı gerekli." }, { status: 400 });
  }

  const res = await insertEntity(db, CUPPING_TABLES.points, tenantId, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, point: res.data });
}
