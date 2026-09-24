import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { validateIncomingNotes, NOTE_LIMITS } from "@/lib/refleksoloji/notesValidation";
import {
  reconcileNoteSync,
  type NotesStore,
  type ServerNoteSnapshot,
  type IncomingSyncNote,
  type IncomingDeletion,
  type NoteFields,
} from "@/lib/refleksoloji/notesConcurrency";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/notes — uzmanın klinik notları (P1-1, cihazlar arası senkron).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token binding.
 *   - tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma tenant_id ile bağlanır. Demo hesap: Supabase'e yazılmaz.
 *   - Ham DB mesajı istemciye sızmaz (jsonServerError).
 *
 * Model: her not bir satır; source_uid = istemci not id'si.
 *
 * ⚠️ SİLME SEMANTİĞİ (REF-003 / REF-004):
 *   Eski "replace-all" (listede olmayanı sil) KALDIRILDI — boş [] PUT'un tenant'ın
 *   TÜM notlarını silmesi ve bayat bir cihazın başka cihazın notlarını sessizce
 *   silmesi engellendi. Silme YALNIZ açık `deleted_uids` ile yapılır.
 *
 * ⚠️ EŞZAMANLILIK (REF-003 — TAM KAPANIŞ):
 *   Aynı notun iki cihazda eş-zamanlı düzenlenmesi ARTIK last-write-wins DEĞİL.
 *   Her not için `updated_at` üzerinden atomik compare-and-set (CAS) uygulanır
 *   (bkz. lib/refleksoloji/notesConcurrency.ts). İstemci, GET'te aldığı
 *   `baseUpdatedAt`'i saklar ve PUT'ta geri gönderir; server bunu beklenen sürüm
 *   olarak kullanır. Stale güncelleme 409 döndürür, server sürümü KORUNUR ve
 *   sonuç listesinde `conflict` işaretlenir (istemci lokal metni kaybetmez).
 *   Toplu PUT'ta kısmi başarı GİZLENMEZ: her not deterministik sonuç alır
 *   (created / updated / conflict / deleted / delete-conflict / delete-noop).
 */

type IncomingNote = {
  id: string;
  title?: string;
  date?: string;
  content?: string;
  attachments?: unknown;
  createdAt?: string;
  updatedAt?: string;
  /** İstemcinin en son gözlemlediği server updated_at (yeni not → yok). */
  baseUpdatedAt?: unknown;
  [k: string]: unknown;
};

// ─── GET — tenant'ın tüm notları (SavedClinicalNote[] + baseUpdatedAt) ─────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, notes: [] });
  }

  const { data, error } = await db
    .from("reflexology_notes")
    .select("raw_json, updated_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) {
    return jsonServerError("notes.GET", error);
  }

  // CAS için: server `updated_at` KOLONU her nota `baseUpdatedAt` olarak enjekte
  // edilir (raw_json.updatedAt istemci semantik zamanı; base AYRI kolondur).
  const notes = (data ?? [])
    .map((r) => {
      const row = r as { raw_json: unknown; updated_at: string };
      const raw = row.raw_json;
      if (raw == null || typeof raw !== "object") return null;
      return { ...(raw as Record<string, unknown>), baseUpdatedAt: row.updated_at };
    })
    .filter((n): n is Record<string, unknown> & { baseUpdatedAt: string } => n != null);

  return NextResponse.json({ ok: true, notes });
}

/** Bir not için DB kolon alanlarını (tenant/source_uid/updated_at HARİÇ) çıkarır. */
function noteToFields(n: IncomingNote): NoteFields {
  return {
    title: typeof n.title === "string" ? n.title : null,
    note_date: typeof n.date === "string" ? n.date : null,
    content: typeof n.content === "string" ? n.content : null,
    attachments: Array.isArray(n.attachments) ? n.attachments : [],
    raw_json: n as Record<string, unknown>,
  };
}

// ─── PUT — per-note CAS senkron (upsert + explicit delete + conflict raporu) ───
export async function PUT(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, results: [], conflicts: 0 });
  }

  // Kaba payload üst sınırı (REF-009): aşırı büyük gövdeyi erken 413 ile reddet.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > NOTE_LIMITS.MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "İstek gövdesi çok büyük." },
      { status: 413 },
    );
  }

  let body: { notes?: IncomingNote[]; deleted_uids?: unknown };
  try {
    body = (await req.json()) as { notes?: IncomingNote[]; deleted_uids?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const incoming = Array.isArray(body.notes) ? body.notes : [];

  // Sunucu tarafı runtime doğrulama (REF-009 / REF-017): boyut/adet/MIME/data-URL.
  const validationError = validateIncomingNotes(incoming);
  if (validationError) {
    return NextResponse.json(
      { ok: false, error: validationError.message },
      { status: validationError.status },
    );
  }

  const validNotes: IncomingSyncNote[] = incoming
    .filter((n) => n && typeof n === "object" && typeof n.id === "string" && n.id.length > 0)
    .map((n) => ({
      uid: n.id,
      baseUpdatedAt:
        typeof n.baseUpdatedAt === "string" && n.baseUpdatedAt.length > 0
          ? n.baseUpdatedAt
          : null,
      fields: noteToFields(n),
    }));

  // Açık silme listesi (REF-004): string (legacy) veya {uid, expected_updated_at}.
  // Stale-delete koruması (REF-003): expected verilirse CAS delete uygulanır.
  const deletions: IncomingDeletion[] = Array.isArray(body.deleted_uids)
    ? body.deleted_uids
        .map((v): IncomingDeletion | null => {
          if (typeof v === "string" && v.length > 0) {
            return { uid: v, expectedUpdatedAt: null };
          }
          if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            const uid = typeof o.uid === "string" ? o.uid : "";
            if (!uid) return null;
            const exp =
              typeof o.expected_updated_at === "string" && o.expected_updated_at.length > 0
                ? o.expected_updated_at
                : null;
            return { uid, expectedUpdatedAt: exp };
          }
          return null;
        })
        .filter((d): d is IncomingDeletion => d != null)
    : [];

  const nowIso = new Date().toISOString();

  // Supabase destekli NotesStore adaptörü (tenant kapanışı; service_role bypass).
  const store: NotesStore = {
    async casUpdate(uid, expectedUpdatedAt, fields, newUpdatedAt) {
      const { data, error } = await db
        .from("reflexology_notes")
        .update({ ...fields, updated_at: newUpdatedAt })
        .eq("tenant_id", tenantId)
        .eq("source_uid", uid)
        .eq("updated_at", expectedUpdatedAt)
        .select("raw_json, updated_at");
      if (error) throw error;
      const row = (data ?? [])[0] as ServerNoteSnapshot | undefined;
      return row ? { updated_at: row.updated_at, raw_json: row.raw_json } : null;
    },
    async getByUid(uid) {
      const { data, error } = await db
        .from("reflexology_notes")
        .select("raw_json, updated_at")
        .eq("tenant_id", tenantId)
        .eq("source_uid", uid)
        .maybeSingle();
      if (error) throw error;
      const row = data as ServerNoteSnapshot | null;
      return row ? { updated_at: row.updated_at, raw_json: row.raw_json } : null;
    },
    async createNote(uid, fields, newUpdatedAt) {
      const { data, error } = await db
        .from("reflexology_notes")
        .upsert(
          {
            ...fields,
            tenant_id: tenantId,
            source_uid: uid,
            updated_at: newUpdatedAt,
          },
          { onConflict: "tenant_id,source_uid" },
        )
        .select("raw_json, updated_at")
        .single();
      if (error) throw error;
      const row = data as ServerNoteSnapshot;
      return { updated_at: row.updated_at, raw_json: row.raw_json };
    },
    async deleteNote(uid, expectedUpdatedAt) {
      let q = db
        .from("reflexology_notes")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("source_uid", uid);
      if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
      const { data, error } = await q.select("id");
      if (error) throw error;
      const deleted = (data ?? []).length;
      if (deleted > 0) return { deleted, existsAfter: null };
      // 0 silindi → satır hâlâ var mı? (stale delete conflict ayrımı)
      const existsAfter = await store.getByUid(uid);
      return { deleted: 0, existsAfter };
    },
  };

  try {
    const { results, conflicts } = await reconcileNoteSync(
      store,
      validNotes,
      deletions,
      nowIso,
    );
    return NextResponse.json(
      { ok: conflicts === 0, results, conflicts },
      { status: conflicts > 0 ? 409 : 200 },
    );
  } catch (err) {
    return jsonServerError("notes.PUT.reconcile", err);
  }
}
