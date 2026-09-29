import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { NOTE_LIMITS } from "@/lib/refleksoloji/notesValidation";
import { prepareNoteSyncBatch } from "@/lib/refleksoloji/notesSyncBatch";
import {
  reconcileNoteSync,
  type NotesStore,
  type ServerNoteSnapshot,
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
 *   (created / updated / unchanged / rejected / conflict / deleted / delete-conflict / delete-noop).
 */

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

// ─── PUT — per-note CAS senkron (upsert + explicit delete + conflict raporu) ───
//
// FA-03: not-başına doğrulama. Bozuk not `{outcome:"rejected", reason}` alır;
// geçerli notlar işlenir (eskiden tek bozuk ek TÜM toplu senkronu 422 ile
// düşürüyordu). Base'i ve içeriği sunucuyla aynı not YENİDEN YAZILMAZ
// (`unchanged`) — istemci zaten yalnız kirli notları gönderir.
export async function PUT(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, results: [], conflicts: 0, rejected: 0 });
  }

  // Kaba payload üst sınırı (REF-009): aşırı büyük gövdeyi erken 413 ile reddet.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > NOTE_LIMITS.MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "İstek gövdesi çok büyük." },
      { status: 413 },
    );
  }

  let body: { notes?: unknown; deleted_uids?: unknown };
  try {
    body = (await req.json()) as { notes?: unknown; deleted_uids?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // Sunucu tarafı runtime doğrulama (REF-009 / REF-017) — NOT-BAŞINA (FA-03).
  const prepared = prepareNoteSyncBatch(body);
  if (!prepared.ok) {
    return NextResponse.json(
      { ok: false, error: prepared.error.message },
      { status: prepared.error.status },
    );
  }
  const { valid: validNotes, rejected, deletions } = prepared;

  const nowIso = new Date().toISOString();

  // Supabase destekli NotesStore adaptörü (tenant kapanışı; service_role bypass).
  const store: NotesStore = {
    async getManyByUid(uids) {
      const out = new Map<string, ServerNoteSnapshot>();
      // .in() parça parça (URL uzunluğu sınırı).
      for (let i = 0; i < uids.length; i += 100) {
        const chunk = uids.slice(i, i + 100);
        const { data, error } = await db
          .from("reflexology_notes")
          .select("source_uid, raw_json, updated_at")
          .eq("tenant_id", tenantId)
          .in("source_uid", chunk);
        if (error) throw error;
        for (const r of (data ?? []) as Array<ServerNoteSnapshot & { source_uid: string }>) {
          out.set(r.source_uid, { updated_at: r.updated_at, raw_json: r.raw_json });
        }
      }
      return out;
    },
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
    const { results, conflicts, rejected: rejectedCount } = await reconcileNoteSync(
      store,
      validNotes,
      deletions,
      nowIso,
      rejected,
    );
    // USAGE360: yalnız GERÇEK değişiklik (created/updated/deleted) sayılır; "unchanged",
    // "delete-noop", "rejected" senkron tekrarları olay ÜRETMEZ. Toplu senkron = TEK olay
    // (+itemCount). resourceId = değişen not uid'lerinin sıralı birleşimi (yalnız HMAC'lanır)
    // → aynı değişiklik kümesinin yeniden gönderimi 60 sn kovasında tek sayılır.
    const changedUids = results
      .filter((r) => r.outcome === "created" || r.outcome === "updated" || r.outcome === "deleted")
      .map((r) => r.uid)
      .sort();
    if (changedUids.length > 0) {
      await trackUsage(guard, req, {
        module: "reflexology",
        action: "record_updated",
        subEntity: "note",
        resourceId: `notes:${changedUids.join(",")}`,
        itemCount: changedUids.length,
      });
    }
    if (conflicts > 0) {
      await trackUsage(guard, req, { module: "reflexology", action: "action_failed", failedAction: "record_updated", subEntity: "note", errorClass: "conflict" });
    }
    return NextResponse.json(
      { ok: conflicts === 0 && rejectedCount === 0, results, conflicts, rejected: rejectedCount },
      { status: conflicts > 0 ? 409 : 200 },
    );
  } catch (err) {
    return jsonServerError("notes.PUT.reconcile", err, { usage: { guard, req, failedAction: "record_updated", subEntity: "note" } });
  }
}
