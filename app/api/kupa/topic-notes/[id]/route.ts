import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, TOPIC_NOTE_WRITABLE } from "@/lib/cupping/fields";
import { cuppingError, deleteEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/topic-notes/[id] — not güncelle (metin/etiket + ilgili bölgeler) / sil. */

const MAX_POINTS = 50;

/** body.point_ids → temiz string[] (dedupe, string olmayanları at). */
function parsePointIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && x && !out.includes(x)) out.push(x);
  return out;
}

/**
 * PATCH — not alanları + ilgili bölgeler (note-point) güncellemesi.
 *
 * ATOMİKLİK: Tüm yazma TEK Postgres transaction'ında (RPC
 * `cupping_topic_note_update_atomic`) yapılır — sahiplik + point-tenant doğrulaması
 * yazmalarla AYNI transaction'da; herhangi bir hata TAM rollback eder. Böylece eski
 * "önce not yaz, sonra point doğrula" yarım-güncelleme (partial state) hatası biter.
 * tenant_id İSTEMCİDEN değil, requireModuleAccess'ten (server-side) gelir.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Not id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, note: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  // Mass-assignment engeli: yalnız allowlist alanları (tenant_id/id/topic_id ASLA).
  const fields = pickWritable(parsed.data, TOPIC_NOTE_WRITABLE);
  const hasPoints = Object.prototype.hasOwnProperty.call(parsed.data, "point_ids");
  if (Object.keys(fields).length === 0 && !hasPoints) {
    return cuppingError(400, "Güncellenecek alan yok.");
  }
  // Erken/ucuz doğrulamalar (RPC de aynı kuralları uygular — savunma derinliği).
  if (Object.prototype.hasOwnProperty.call(fields, "note") && !String(fields.note ?? "").trim()) {
    return cuppingError(400, "Not metni boş olamaz.");
  }
  const pointIds = hasPoints ? parsePointIds(parsed.data.point_ids) : null;
  if (pointIds && pointIds.length > MAX_POINTS) {
    return cuppingError(400, "Çok fazla bölge seçildi.");
  }

  // TEK transaction: sahiplik + alan update + point-tenant doğrulaması + ilişki replace.
  // p_point_ids NULL → ilişkilere dokunma; dizi (boş [] dahil) → atomik REPLACE.
  const { data, error } = await db.rpc("cupping_topic_note_update_atomic", {
    p_tenant_id: tenantId,
    p_note_id: id,
    p_fields: fields,
    p_point_ids: pointIds,
  });

  if (error) {
    // SQLSTATE → sabit güvenli mesaj (ham DB hatası SIZMAZ).
    const code = (error as { code?: string }).code ?? "";
    if (code === "45001") return cuppingError(404, "Kayıt bu hesaba ait değil veya bulunamadı.");
    if (code === "45002") return cuppingError(400, "Not metni boş olamaz.");
    if (code === "45003") return cuppingError(400, "Seçilen bölge bu hesaba ait değil.");
    if (code === "45004") return cuppingError(400, "Çok fazla bölge seçildi.");
    return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  }

  return NextResponse.json({ ok: true, note: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Not id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  // note_points FK ON DELETE CASCADE ile birlikte silinir.
  const res = await deleteEntity(db, CUPPING_TABLES.topicNotes, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
