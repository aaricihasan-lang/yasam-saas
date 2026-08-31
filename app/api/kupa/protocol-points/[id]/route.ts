import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_POINT_META_WRITABLE } from "@/lib/cupping/fields";
import { cuppingError, parseJsonBody, pickWritable, updateEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/protocol-points/[id] — ilişki META güncelle (protocol_note/sort_order) / detach.
 *
 * DETACH KİLİDİ: Bir step bu bölgeyi (ref_point) kullanıyorsa, DB composite FK
 * (NO ACTION) silmeyi 23503 ile REDDEDER → generic 500 yerine anlaşılır 409 döneriz.
 * FK kolonları (protocol_id/point_id) PATCH'te IMMUTABLE (META allowlist FK içermez).
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

  const fields = pickWritable(parsed.data, PROTOCOL_POINT_META_WRITABLE);
  if (Object.keys(fields).length === 0) return cuppingError(400, "Güncellenecek alan yok.");

  const res = await updateEntity(db, CUPPING_TABLES.protocolPoints, tenantId, id, fields);
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
    .from(CUPPING_TABLES.protocolPoints)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    // 23503: step (uygulama akışı) hâlâ bu bölgeyi referanslıyor → detach engellendi.
    if ((error as { code?: string }).code === "23503") {
      return cuppingError(409, "Bu bölge protokolün uygulama akışında (bir adım) kullanılıyor. Önce ilgili adımı düzenleyin.");
    }
    return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
