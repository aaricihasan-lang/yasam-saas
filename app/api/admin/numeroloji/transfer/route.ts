import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * /api/admin/numeroloji/transfer — admin kütüphanesinden bir uzmana numeroloji
 * bilgi/taş kayıtlarının kopyalanması (veri paylaşımı). Service-role okuma+yazma.
 *
 * Güvenlik: verifyAdminRequest. Yalnız numeroloji tabloları whitelist'te.
 *
 * POST { table, sourceTenantId, targetTenantId, filterIds? } → { ok, inserted }
 */

const ALLOWED = new Set(["numerology_knowledge_records", "numerology_stone_assignments"]);
const STRIP = new Set(["id", "created_at", "updated_at"]);
const BATCH = 100;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  let body: { table?: unknown; sourceTenantId?: unknown; targetTenantId?: unknown; filterIds?: unknown };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const table = String(body.table ?? "").trim();
  const sourceTenantId = String(body.sourceTenantId ?? "").trim();
  const targetTenantId = String(body.targetTenantId ?? "").trim();
  const filterIds = Array.isArray(body.filterIds)
    ? body.filterIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined;

  if (!ALLOWED.has(table)) return NextResponse.json({ ok: false, error: "Geçersiz tablo." }, { status: 400 });
  if (!sourceTenantId || !targetTenantId) {
    return NextResponse.json({ ok: false, error: "Kaynak/hedef tenant zorunludur." }, { status: 400 });
  }
  if (sourceTenantId === targetTenantId) {
    return NextResponse.json({ ok: false, error: "Kaynak ve hedef tenant aynı." }, { status: 400 });
  }

  let readQ = db.from(table).select("*").eq("tenant_id", sourceTenantId);
  if (filterIds?.length) readQ = readQ.in("id", filterIds);
  const { data: sourceRows, error: readErr } = await readQ;
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });

  const rows = (sourceRows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return NextResponse.json({ ok: true, inserted: 0 });

  const payloads = rows.map((row) => {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) if (!STRIP.has(k)) copy[k] = v;
    copy.tenant_id = targetTenantId;
    return copy;
  });

  let inserted = 0;
  for (let off = 0; off < payloads.length; off += BATCH) {
    const batch = payloads.slice(off, off + BATCH);
    const { error } = await db.from(table).insert(batch);
    if (error) return NextResponse.json({ ok: false, error: error.message, inserted }, { status: 500 });
    inserted += batch.length;
  }

  return NextResponse.json({ ok: true, inserted });
}
