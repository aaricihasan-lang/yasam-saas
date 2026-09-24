/**
 * Refleksoloji Klinik Notlar — per-note eşzamanlılık uzlaştırması (REF-003).
 *
 * DB-AGNOSTİK ÇEKİRDEK. Her not için `updated_at` üzerinden compare-and-set (CAS)
 * kararını verir. `/api/refleksoloji/notes` PUT bu çekirdeği Supabase destekli bir
 * `NotesStore` ile çağırır; harness bellek-içi bir store ile aynı çekirdeği test eder.
 *
 * SÖZLEŞME (deterministik, kısmi-başarı GİZLENMEZ):
 *   - baseUpdatedAt (expected) VARSA  → CAS UPDATE.
 *       · CAS tutarsa            → { outcome: "updated", updated_at }
 *       · satır başka cihazda değişmişse → { outcome: "conflict", server, server_updated_at }
 *         (SERVER SÜRÜMÜ KORUNUR — stale istemci overwrite ETMEZ; last-write-wins DEĞİL)
 *       · satır uzaktan silinmişse → { outcome: "conflict", server: null }
 *   - baseUpdatedAt YOKSA → CREATE (upsert; yeni not için idempotent).
 *       · Gözlemlenmemiş-base penceresinde last-write-wins'tir (yeni UUID id ile
 *         çakışma pratikte imkânsız) — rapor bunu AYRI belirtir.
 *   - Silme: expected VARSA CAS delete; stale ise { outcome: "delete-conflict" }
 *       (silinmez, SERVER KORUNUR). Satır zaten yoksa idempotent { "delete-noop" }.
 *
 * Her PUT için TEK deterministik sonuç listesi döner; en az bir conflict varsa
 * çağıran 409 döndürür ama sonuç listesini gövdede taşır (başarılılar bilinir).
 */

export type NoteFields = Record<string, unknown>;

/** Sunucudaki bir not satırının uzlaştırma için gereken en küçük görünümü. */
export interface ServerNoteSnapshot {
  updated_at: string;
  raw_json: unknown;
}

export interface NotesStore {
  /**
   * CAS update: satırın `updated_at` değeri `expectedUpdatedAt` ile BİREBİR eşitse
   * günceller ve YENİ snapshot döner; eşit değilse (veya satır yoksa) null döner.
   * Atomik: WHERE tenant AND source_uid AND updated_at = expected.
   */
  casUpdate(
    uid: string,
    expectedUpdatedAt: string,
    fields: NoteFields,
    newUpdatedAt: string,
  ): Promise<ServerNoteSnapshot | null>;

  /** Mevcut satırın snapshot'ı (conflict ayrımı + server sürümünü döndürmek için). */
  getByUid(uid: string): Promise<ServerNoteSnapshot | null>;

  /** Yeni not (upsert — tenant_id,source_uid çakışmasında günceller); snapshot döner. */
  createNote(
    uid: string,
    fields: NoteFields,
    newUpdatedAt: string,
  ): Promise<ServerNoteSnapshot>;

  /**
   * Silme. `expectedUpdatedAt` null ise KOŞULSUZ siler (legacy/best-effort).
   * Doluysa CAS delete (WHERE ... AND updated_at = expected). Dönüş:
   *   deleted     → silinen satır sayısı (0 veya 1)
   *   existsAfter → silme sonrası hâlâ mevcut satır (stale delete ayrımı için)
   */
  deleteNote(
    uid: string,
    expectedUpdatedAt: string | null,
  ): Promise<{ deleted: number; existsAfter: ServerNoteSnapshot | null }>;
}

export type IncomingSyncNote = {
  uid: string;
  /** İstemcinin en son GÖZLEMLEDİĞİ server updated_at değeri (yeni not → null). */
  baseUpdatedAt: string | null;
  fields: NoteFields;
};

export type IncomingDeletion = {
  uid: string;
  expectedUpdatedAt: string | null;
};

export type NoteSyncResult =
  | { uid: string; outcome: "created" | "updated"; updated_at: string }
  | { uid: string; outcome: "conflict"; server_updated_at: string | null; server: unknown }
  | { uid: string; outcome: "deleted" | "delete-noop" }
  | { uid: string; outcome: "delete-conflict"; server_updated_at: string | null; server: unknown };

/**
 * Gelen not + silme listelerini store üzerinde per-note uzlaştırır.
 * Prod/DB mutasyonu bu fonksiyonda YOK — store implementasyonuna delege edilir.
 */
export async function reconcileNoteSync(
  store: NotesStore,
  notes: IncomingSyncNote[],
  deletions: IncomingDeletion[],
  nowIso: string,
): Promise<{ results: NoteSyncResult[]; conflicts: number }> {
  const results: NoteSyncResult[] = [];
  let conflicts = 0;

  for (const n of notes) {
    const hasBase = typeof n.baseUpdatedAt === "string" && n.baseUpdatedAt.length > 0;
    if (hasBase) {
      // ── Mevcut not düzenlemesi → atomik CAS ──────────────────────────────────
      const updated = await store.casUpdate(
        n.uid,
        n.baseUpdatedAt as string,
        n.fields,
        nowIso,
      );
      if (updated) {
        results.push({ uid: n.uid, outcome: "updated", updated_at: updated.updated_at });
      } else {
        // CAS başarısız → satır ya başka cihazda değişti ya da uzaktan silindi.
        const current = await store.getByUid(n.uid);
        conflicts++;
        results.push({
          uid: n.uid,
          outcome: "conflict",
          server_updated_at: current?.updated_at ?? null,
          server: current?.raw_json ?? null,
        });
      }
    } else {
      // ── Yeni not → upsert (idempotent) ───────────────────────────────────────
      const created = await store.createNote(n.uid, n.fields, nowIso);
      results.push({ uid: n.uid, outcome: "created", updated_at: created.updated_at });
    }
  }

  for (const d of deletions) {
    const res = await store.deleteNote(d.uid, d.expectedUpdatedAt);
    if (res.deleted > 0) {
      results.push({ uid: d.uid, outcome: "deleted" });
    } else if (res.existsAfter) {
      // Silinmedi ama satır hâlâ var → stale delete engellendi (server korundu).
      conflicts++;
      results.push({
        uid: d.uid,
        outcome: "delete-conflict",
        server_updated_at: res.existsAfter.updated_at,
        server: res.existsAfter.raw_json,
      });
    } else {
      // Satır zaten yok → silme idempotenttir (başarı sayılır).
      results.push({ uid: d.uid, outcome: "delete-noop" });
    }
  }

  return { results, conflicts };
}
