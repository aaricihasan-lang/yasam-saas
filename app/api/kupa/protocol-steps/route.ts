import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_STEP_WRITABLE } from "@/lib/cupping/fields";
import {
  assertCompositeRef,
  assertOwnedRef,
  cuppingError,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
} from "@/lib/cupping/api";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/kupa/protocol-steps — sıralı uygulama akışı (Bölüm 4).
 *
 * STEP REFERENTIAL INTEGRITY: ref_point_id/ref_technique_id verilirse, o point/technique
 * AYNI protokolün cupping_protocol_points / cupping_protocol_techniques setinde OLMALI.
 * API katmanında NET mesajla doğrulanır + DB composite FK (NO ACTION) backstop olarak
 * yeniden zorlar (savunma derinliği). Boş string → NULL (referanssız adım).
 */

/** "" / boş → null; string → değer. */
function normRef(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** ref_point/ref_technique protokol-üyeliğini doğrula (verilmişse). ok=false → hata yanıtı. */
async function assertStepRefs(
  db: SupabaseClient,
  tenantId: string,
  protocolId: string,
  refPoint: string | null,
  refTechnique: string | null,
): Promise<Response | null> {
  if (refPoint) {
    const inSet = await assertCompositeRef(db, CUPPING_TABLES.protocolPoints, {
      tenant_id: tenantId,
      protocol_id: protocolId,
      point_id: refPoint,
    });
    if (!inSet) return cuppingError(400, "Adımın referans verdiği bölge, protokolün uygulama bölgeleri arasında değil.");
  }
  if (refTechnique) {
    const inSet = await assertCompositeRef(db, CUPPING_TABLES.protocolTechniques, {
      tenant_id: tenantId,
      protocol_id: protocolId,
      technique_id: refTechnique,
    });
    if (!inSet) return cuppingError(400, "Adımın referans verdiği teknik, protokolün teknikleri arasında değil.");
  }
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const protocolId = req.nextUrl.searchParams.get("protocolId")?.trim();
  const res = await listEntity(db, CUPPING_TABLES.protocolSteps, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: protocolId ? { protocol_id: protocolId } : undefined,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, steps: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, step: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, PROTOCOL_STEP_WRITABLE);
  const protocolId = typeof fields.protocol_id === "string" ? fields.protocol_id : "";
  if (!String(fields.body ?? "").trim()) return cuppingError(400, "Adım metni gerekli.");

  const refPoint = normRef(fields.ref_point_id);
  const refTechnique = normRef(fields.ref_technique_id);
  fields.ref_point_id = refPoint;
  fields.ref_technique_id = refTechnique;

  if (!(await assertOwnedRef(db, CUPPING_TABLES.protocols, tenantId, protocolId))) {
    return cuppingError(400, "Protokol bu hesaba ait değil veya bulunamadı.");
  }
  const refErr = await assertStepRefs(db, tenantId, protocolId, refPoint, refTechnique);
  if (refErr) return refErr;

  const ins = await insertEntity(db, CUPPING_TABLES.protocolSteps, tenantId, fields);
  if (!ins.ok) return ins.response;
  return NextResponse.json({ ok: true, step: ins.data });
}
