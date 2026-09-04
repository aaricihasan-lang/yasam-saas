import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, ADVICE_TEMPLATE_WRITABLE } from "@/lib/cupping/fields";
import { cuppingError, insertEntity, listEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/advice-templates — FAZ 5 GENEL bilgilendirme şablonları (root).
 *
 * Güvenlik: requireModuleAccess("cupping"); tenant SUNUCUDA; yalnız
 *   ADVICE_TEMPLATE_WRITABLE yazılır (is_default HARİÇ — atomik RPC ile); demo → persist=0;
 *   ham DB hatası sızmaz. Platform ASLA evrensel tıbbi metin üretmez (metin uzmanındır).
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const res = await listEntity(guard.db, CUPPING_TABLES.adviceTemplates, guard.tenantId, {
    orderBy: "updated_at",
    ascending: false,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, templates: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, template: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, ADVICE_TEMPLATE_WRITABLE);
  if (!String(fields.title ?? "").trim()) return cuppingError(400, "Şablon başlığı gerekli.");

  const ins = await insertEntity(db, CUPPING_TABLES.adviceTemplates, tenantId, fields);
  if (!ins.ok) return ins.response;

  // is_default yalnız atomik RPC ile (partial-unique invariant; transient çift-varsayılan YOK).
  if (parsed.data.is_default === true) {
    const { data, error } = await db.rpc("cupping_advice_template_set_default_atomic", {
      p_tenant_id: tenantId,
      p_template_id: (ins.data as { id: string }).id,
    });
    if (error) return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
    return NextResponse.json({ ok: true, template: data });
  }

  return NextResponse.json({ ok: true, template: ins.data });
}
