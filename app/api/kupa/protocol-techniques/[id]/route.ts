import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_TECHNIQUE_META_WRITABLE } from "@/lib/cupping/fields";
import { cuppingError, parseJsonBody, pickWritable, updateEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/protocol-techniques/[id] — META güncelle / detach.
 * DETACH KİLİDİ: step ref_technique bu tekniği kullanıyorsa 23503 → 409.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "İlişki id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, relation: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, PROTOCOL_TECHNIQUE_META_WRITABLE);
  if (Object.keys(fields).length === 0) return cuppingError(400, "Güncellenecek alan yok.");

  const res = await updateEntity(db, CUPPING_TABLES.protocolTechniques, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, relation: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "İlişki id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const { data, error } = await db
    .from(CUPPING_TABLES.protocolTechniques)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    if ((error as { code?: string }).code === "23503") {
      return cuppingError(409, "Bu teknik protokolün uygulama akışında (bir adım) kullanılıyor. Önce ilgili adımı düzenleyin.");
    }
    return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
