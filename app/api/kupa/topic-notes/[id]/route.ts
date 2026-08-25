import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, TOPIC_NOTE_WRITABLE } from "@/lib/cupping/fields";
import {
  assertOwnedRef,
  cuppingError,
  deleteEntity,
  getEntity,
  parseJsonBody,
  pickWritable,
  updateEntity,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/topic-notes/[id] — not güncelle (metin/etiket + ilgili bölgeler) / sil. */

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
  if (!id) return cuppingError(400, "Not id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, note: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, TOPIC_NOTE_WRITABLE);
  const hasPoints = Object.prototype.hasOwnProperty.call(parsed.data, "point_ids");
  if (Object.keys(fields).length === 0 && !hasPoints) {
    return cuppingError(400, "Güncellenecek alan yok.");
  }

  // Not bu hesaba ait mi? (IDOR guard — id + tenant)
  const owned = await getEntity(db, CUPPING_TABLES.topicNotes, tenantId, id);
  if (!owned.ok) return owned.response;

  let note = owned.data as Record<string, unknown>;
  if (Object.keys(fields).length > 0) {
    if (Object.prototype.hasOwnProperty.call(fields, "note") && !String(fields.note ?? "").trim()) {
      return cuppingError(400, "Not metni boş olamaz.");
    }
    const upd = await updateEntity(db, CUPPING_TABLES.topicNotes, tenantId, id, fields);
    if (!upd.ok) return upd.response;
    note = upd.data as Record<string, unknown>;
  }

  let pointIds = parsePointIds((owned.data as Record<string, unknown>).point_ids); // fallback (yoktur)
  if (hasPoints) {
    pointIds = parsePointIds(parsed.data.point_ids);
    if (pointIds.length > MAX_POINTS) return cuppingError(400, "Çok fazla bölge seçildi.");
    for (const pid of pointIds) {
      if (!(await assertOwnedRef(db, CUPPING_TABLES.points, tenantId, pid))) {
        return cuppingError(400, "Seçilen bölge bu hesaba ait değil.");
      }
    }
    // Replace: mevcut note-point'leri sil, yenilerini yaz (hepsi doğrulanmış).
    const del = await db
      .from(CUPPING_TABLES.topicNotePoints)
      .delete()
      .eq("tenant_id", tenantId)
      .eq("topic_note_id", id);
    if (del.error) return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
    if (pointIds.length > 0) {
      const rows = pointIds.map((pid, i) => ({
        tenant_id: tenantId,
        topic_note_id: id,
        point_id: pid,
        sort_order: i,
      }));
      const { error } = await db.from(CUPPING_TABLES.topicNotePoints).insert(rows);
      if (error) return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
    }
  } else {
    // point_ids gönderilmediyse mevcut bağları oku (yanıtı tam döndürmek için).
    const { data } = await db
      .from(CUPPING_TABLES.topicNotePoints)
      .select("point_id, sort_order")
      .eq("tenant_id", tenantId)
      .eq("topic_note_id", id)
      .order("sort_order", { ascending: true });
    pointIds = (data ?? []).map((r) => String((r as Record<string, unknown>).point_id));
  }

  return NextResponse.json({ ok: true, note: { ...note, point_ids: pointIds } });
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
