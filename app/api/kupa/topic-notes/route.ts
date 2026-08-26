import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, TOPIC_NOTE_WRITABLE } from "@/lib/cupping/fields";
import {
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
 * /api/kupa/topic-notes — Amaç/Rahatsızlık KULLANICI NOTLARI (formal citation'dan AYRI).
 *
 * Güvenlik: requireModuleAccess("cupping"); tenant_id SUNUCUDA (body'den güvenilmez);
 *   topic_id + her point_id AYNI tenant'ta GERÇEK olmalı (assertOwnedRef → cross-tenant reddi);
 *   yalnız TOPIC_NOTE_WRITABLE alanları yazılır (mass-assignment engeli); demo → persist=0;
 *   ham DB hatası sızmaz. Not↔point (M:N) junction'a YALNIZ server yazar.
 */

const MAX_POINTS = 50;

/** body.point_ids → temiz string[] (dedupe, string olmayanları at). */
function parsePointIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && x && !out.includes(x)) out.push(x);
  return out;
}

/** Bir not kümesinin point_id listelerini tek sorguda çekip note_id → point_id[] map'i kurar. */
async function pointsByNote(
  db: SupabaseClient,
  tenantId: string,
  noteIds: string[],
): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  if (noteIds.length === 0) return map;
  const { data, error } = await db
    .from(CUPPING_TABLES.topicNotePoints)
    .select("topic_note_id, point_id, sort_order")
    .eq("tenant_id", tenantId)
    .in("topic_note_id", noteIds)
    .order("sort_order", { ascending: true });
  if (error) return map; // okuma kritik değil; boş bırak
  for (const row of data ?? []) {
    const nid = String((row as Record<string, unknown>).topic_note_id);
    (map[nid] ||= []).push(String((row as Record<string, unknown>).point_id));
  }
  return map;
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const topicId = req.nextUrl.searchParams.get("topicId")?.trim();
  const res = await listEntity(db, CUPPING_TABLES.topicNotes, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: topicId ? { topic_id: topicId } : undefined,
  });
  if (!res.ok) return res.response;

  const notes = res.data as Record<string, unknown>[];
  const byNote = await pointsByNote(db, tenantId, notes.map((n) => String(n.id)));
  const withPoints = notes.map((n) => ({ ...n, point_ids: byNote[String(n.id)] ?? [] }));
  return NextResponse.json({ ok: true, notes: withPoints });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, note: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const topicId = typeof parsed.data.topic_id === "string" ? parsed.data.topic_id : "";
  const fields = pickWritable(parsed.data, TOPIC_NOTE_WRITABLE);
  if (!String(fields.note ?? "").trim()) {
    return cuppingError(400, "Not metni gerekli.");
  }
  const pointIds = parsePointIds(parsed.data.point_ids);
  if (pointIds.length > MAX_POINTS) return cuppingError(400, "Çok fazla bölge seçildi.");

  // topic + tüm point'ler AYNI tenant'ta gerçek olmalı (cross-tenant FK enjeksiyonu reddi).
  const topicOwned = await assertOwnedRef(db, CUPPING_TABLES.topics, tenantId, topicId);
  if (!topicOwned) return cuppingError(400, "Konu bu hesaba ait değil veya bulunamadı.");
  for (const pid of pointIds) {
    if (!(await assertOwnedRef(db, CUPPING_TABLES.points, tenantId, pid))) {
      return cuppingError(400, "Seçilen bölge bu hesaba ait değil.");
    }
  }

  const ins = await insertEntity(db, CUPPING_TABLES.topicNotes, tenantId, {
    ...fields,
    topic_id: topicId,
  });
  if (!ins.ok) return ins.response;
  const noteId = String((ins.data as Record<string, unknown>).id);

  if (pointIds.length > 0) {
    const rows = pointIds.map((pid, i) => ({
      tenant_id: tenantId,
      topic_note_id: noteId,
      point_id: pid,
      sort_order: i,
    }));
    const { error } = await db.from(CUPPING_TABLES.topicNotePoints).insert(rows);
    if (error) {
      // partial state bırakma: notu geri al (compensating delete).
      await db.from(CUPPING_TABLES.topicNotes).delete().eq("tenant_id", tenantId).eq("id", noteId);
      return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
    }
  }

  return NextResponse.json({ ok: true, note: { ...ins.data, point_ids: pointIds } });
}
