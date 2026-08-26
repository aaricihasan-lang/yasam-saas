import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_STEP_META_WRITABLE } from "@/lib/cupping/fields";
import {
  assertCompositeRef,
  cuppingError,
  deleteEntity,
  getEntity,
  parseJsonBody,
  pickWritable,
  updateEntity,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/protocol-steps/[id] — adım güncelle / sil.
 *
 * protocol_id IMMUTABLE (META allowlist içermez). ref_point_id/ref_technique_id
 * güncelleniyorsa, adımın MEVCUT protocol_id'sine göre protokol-üyeliği doğrulanır
 * (API net mesaj + DB composite FK backstop). Boş → NULL (referans temizlenir).
 */

function normRef(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Adım id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, step: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, PROTOCOL_STEP_META_WRITABLE);
  if (Object.keys(fields).length === 0) return cuppingError(400, "Güncellenecek alan yok.");
  if (Object.prototype.hasOwnProperty.call(fields, "body") && !String(fields.body ?? "").trim()) {
    return cuppingError(400, "Adım metni boş olamaz.");
  }

  // ref doğrulaması için adımın mevcut protocol_id'sini al (aynı zamanda sahiplik/IDOR kontrolü).
  const cur = await getEntity(db, CUPPING_TABLES.protocolSteps, tenantId, id);
  if (!cur.ok) return cur.response;
  const protocolId = String((cur.data as Record<string, unknown>).protocol_id ?? "");

  if (Object.prototype.hasOwnProperty.call(fields, "ref_point_id")) {
    const refPoint = normRef(fields.ref_point_id);
    fields.ref_point_id = refPoint;
    if (refPoint && !(await assertCompositeRef(db, CUPPING_TABLES.protocolPoints, { tenant_id: tenantId, protocol_id: protocolId, point_id: refPoint }))) {
      return cuppingError(400, "Adımın referans verdiği bölge, protokolün uygulama bölgeleri arasında değil.");
    }
  }
  if (Object.prototype.hasOwnProperty.call(fields, "ref_technique_id")) {
    const refTech = normRef(fields.ref_technique_id);
    fields.ref_technique_id = refTech;
    if (refTech && !(await assertCompositeRef(db, CUPPING_TABLES.protocolTechniques, { tenant_id: tenantId, protocol_id: protocolId, technique_id: refTech }))) {
      return cuppingError(400, "Adımın referans verdiği teknik, protokolün teknikleri arasında değil.");
    }
  }

  const res = await updateEntity(db, CUPPING_TABLES.protocolSteps, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, step: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Adım id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  const res = await deleteEntity(db, CUPPING_TABLES.protocolSteps, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
