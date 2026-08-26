import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_ENTRY_WRITABLE } from "@/lib/cupping/fields";
import { cuppingError, deleteEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/protocol-entries/[id] — Bilgi güncelle (metin/kaynak/bölgeler) / sil.
 *
 * ATOMİKLİK: Tüm yazma TEK transaction'da (RPC cupping_protocol_entry_update_atomic) —
 * sahiplik + alan update + source/point tenant doğrulaması + entry-point REPLACE aynı
 * transaction'da; herhangi bir hata TAM rollback (partial state YASAK). tenant_id
 * İSTEMCİDEN değil, guard'dan gelir.
 */

const MAX_POINTS = 50;

function parsePointIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && x && !out.includes(x)) out.push(x);
  return out;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Bilgi id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, entry: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, PROTOCOL_ENTRY_WRITABLE);
  const hasPoints = Object.prototype.hasOwnProperty.call(parsed.data, "point_ids");
  if (Object.keys(fields).length === 0 && !hasPoints) return cuppingError(400, "Güncellenecek alan yok.");
  if (Object.prototype.hasOwnProperty.call(fields, "content") && !String(fields.content ?? "").trim()) {
    return cuppingError(400, "Bilgi içeriği boş olamaz.");
  }
  const pointIds = hasPoints ? parsePointIds(parsed.data.point_ids) : null;
  if (pointIds && pointIds.length > MAX_POINTS) return cuppingError(400, "Çok fazla bölge seçildi.");

  const { data, error } = await db.rpc("cupping_protocol_entry_update_atomic", {
    p_tenant_id: tenantId,
    p_entry_id: id,
    p_fields: fields,
    p_point_ids: pointIds,
  });

  if (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "45001") return cuppingError(404, "Kayıt bu hesaba ait değil veya bulunamadı.");
    if (code === "45002") return cuppingError(400, "Bilgi içeriği boş olamaz.");
    if (code === "45003") return cuppingError(400, "Seçilen bölge bu hesaba ait değil.");
    if (code === "45004") return cuppingError(400, "Çok fazla bölge seçildi.");
    if (code === "45005") return cuppingError(400, "Seçilen kaynak bu hesaba ait değil.");
    return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  }

  return NextResponse.json({ ok: true, entry: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Bilgi id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  // entry_points FK ON DELETE CASCADE ile birlikte silinir.
  const res = await deleteEntity(db, CUPPING_TABLES.protocolEntries, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
