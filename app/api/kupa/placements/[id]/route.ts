import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PLACEMENT_WRITABLE } from "@/lib/cupping/fields";
import { deleteEntity, parseJsonBody, pickWritable, updateEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/placements/[id] — yerleşim güncelle (taşı/boyutlandır/döndür) / sil.
 * point_id/map_key burada DEĞİŞMEZ (yalnız geometri/renk/sıra); id+tenant_id eşleşmesi.
 */

const GEOMETRY_WRITABLE = PLACEMENT_WRITABLE.filter(
  (f) => f !== "point_id" && f !== "map_key",
);

function finiteNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "Yerleşim id gerekli." }, { status: 400 });

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, placement: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, GEOMETRY_WRITABLE);
  if (fields.shape !== undefined) fields.shape = fields.shape === "rect" ? "rect" : "oval";
  for (const key of ["cx", "cy", "rx", "ry", "angle"] as const) {
    if (fields[key] === undefined) continue;
    const n = finiteNum(fields[key]);
    if (n === null) {
      return NextResponse.json({ ok: false, error: "Geçersiz konum bilgisi." }, { status: 400 });
    }
    fields[key] = n;
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const res = await updateEntity(db, CUPPING_TABLES.placements, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, placement: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "Yerleşim id gerekli." }, { status: 400 });

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const res = await deleteEntity(db, CUPPING_TABLES.placements, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
