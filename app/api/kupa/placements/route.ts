import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PLACEMENT_WRITABLE } from "@/lib/cupping/fields";
import {
  assertOwnedRef,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
} from "@/lib/cupping/api";
import { isKnownCuppingMap } from "@/lib/cupping/maps";

export const runtime = "nodejs";

/**
 * /api/kupa/placements — nokta yerleşimleri (point ≠ placement).
 *
 * Bir nokta N haritada N yerleşim taşıyabilir. GET ?mapKey= / ?pointId= ile filtrelenir.
 * POST: point_id AYNI tenant'a ait olmalı (cross-tenant FK enjeksiyonu engeli); map_key
 * bilinen harita; geometri sonlu sayı. Demo: yazma yok. Ham DB hatası sızmaz.
 */

function finiteNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const mapKey = req.nextUrl.searchParams.get("mapKey")?.trim();
  const pointId = req.nextUrl.searchParams.get("pointId")?.trim();
  const eqFilters: Record<string, string> = {};
  if (mapKey) eqFilters.map_key = mapKey;
  if (pointId) eqFilters.point_id = pointId;

  const res = await listEntity(db, CUPPING_TABLES.placements, tenantId, {
    orderBy: "created_at",
    ascending: true,
    eqFilters,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, placements: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, placement: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, PLACEMENT_WRITABLE);

  // map_key doğrulama (bilinen harita registry'si)
  if (!isKnownCuppingMap(fields.map_key)) {
    return NextResponse.json({ ok: false, error: "Geçersiz harita." }, { status: 400 });
  }
  // shape doğrulama
  const shape = fields.shape === "rect" ? "rect" : "oval";
  fields.shape = shape;
  // geometri doğrulama (sonlu sayı)
  for (const key of ["cx", "cy", "rx", "ry"] as const) {
    const n = finiteNum(fields[key]);
    if (n === null) {
      return NextResponse.json({ ok: false, error: "Geçersiz konum bilgisi." }, { status: 400 });
    }
    fields[key] = n;
  }
  fields.angle = finiteNum(fields.angle) ?? 0;

  // FK sahiplik: point_id AYNI tenant'ın gerçek noktası olmalı.
  const owned = await assertOwnedRef(db, CUPPING_TABLES.points, tenantId, fields.point_id);
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Nokta bu hesaba ait değil." }, { status: 400 });
  }

  const res = await insertEntity(db, CUPPING_TABLES.placements, tenantId, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, placement: res.data });
}
