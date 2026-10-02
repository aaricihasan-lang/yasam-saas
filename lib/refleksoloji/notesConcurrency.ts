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
 *   - baseUpdatedAt YOKSA → CREATE (yalnız satır YOKSA ekler; P1-5: kör upsert YOK).
 *       · Aynı uid'li satır zaten varsa (yeniden deneme / başka cihaz) ÜZERİNE YAZILMAZ:
 *         içerik aynıysa { "unchanged" }, farklıysa { "conflict", server } (server korunur).
 *   - Silme: expected VARSA CAS delete; stale ise { outcome: "delete-conflict" }
 *       (silinmez, SERVER KORUNUR). Satır zaten yoksa idempotent { "delete-noop" }.
 *
 * Her PUT için TEK deterministik sonuç listesi döner; en az bir conflict varsa
 * çağıran 409 döndürür ama sonuç listesini gövdede taşır (başarılılar bilinir).
 *
 * FA-03 (not-başına sonuç):
 *   - Doğrulamadan geçemeyen not → { outcome: "rejected", reason } (diğerleri işlenir;
 *     tek bozuk not artık tüm toplu senkronu 422 ile düşürmez).
 *   - Store `getManyByUid` sağlıyorsa: base eşleşen VE içeriği sunucuyla aynı not
 *     → { outcome: "unchanged" } (satır YENİDEN YAZILMAZ; gereksiz CAS-update yok).
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

  /**
   * Yeni not — YALNIZ (tenant_id, source_uid) satırı yoksa ekler (ON CONFLICT DO NOTHING).
   * Eklendiyse snapshot; satır zaten varsa null (mevcut satıra DOKUNULMAZ — P1-5).
   */
  createNote(
    uid: string,
    fields: NoteFields,
    newUpdatedAt: string,
  ): Promise<ServerNoteSnapshot | null>;

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

  /**
   * (Opsiyonel) Birden çok notun anlık görüntüsü — tek sorgu. Varsa değişmemiş
   * notlar yazılmadan "unchanged" döner.
   */
  getManyByUid?(uids: string[]): Promise<Map<string, ServerNoteSnapshot>>;
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
  | { uid: string; outcome: "created" | "updated" | "unchanged"; updated_at: string }
  | { uid: string; outcome: "rejected"; reason: string }
  | { uid: string; outcome: "conflict"; server_updated_at: string | null; server: unknown }
  | { uid: string; outcome: "deleted" | "delete-noop" }
  | { uid: string; outcome: "delete-conflict"; server_updated_at: string | null; server: unknown };

/**
 * Gelen not + silme listelerini store üzerinde per-note uzlaştırır.
 * Prod/DB mutasyonu bu fonksiyonda YOK — store implementasyonuna delege edilir.
 */
/** Not içeriği karşılaştırma anahtarı (yalnız kullanıcı alanları; zaman damgaları hariç). */
export function noteContentKey(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  return JSON.stringify([
    typeof o.title === "string" ? o.title : null,
    typeof o.date === "string" ? o.date : null,
    typeof o.content === "string" ? o.content : null,
    Array.isArray(o.attachments) ? o.attachments : [],
  ]);
}

export async function reconcileNoteSync(
  store: NotesStore,
  notes: IncomingSyncNote[],
  deletions: IncomingDeletion[],
  nowIso: string,
  rejected: Array<{ uid: string; reason: string }> = [],
): Promise<{ results: NoteSyncResult[]; conflicts: number; rejected: number }> {
  const results: NoteSyncResult[] = [];
  let conflicts = 0;

  for (const r of rejected) {
    results.push({ uid: r.uid, outcome: "rejected", reason: r.reason });
  }

  // Değişmemiş notları yazmadan ayırt etmek için (store destekliyorsa) tek sorgu.
  const withBase = notes.filter(
    (n) => typeof n.baseUpdatedAt === "string" && n.baseUpdatedAt.length > 0,
  );
  const snapshots =
    store.getManyByUid && withBase.length > 0
      ? await store.getManyByUid(withBase.map((n) => n.uid))
      : null;

  for (const n of notes) {
    const hasBase = typeof n.baseUpdatedAt === "string" && n.baseUpdatedAt.length > 0;
    if (hasBase && snapshots) {
      const snap = snapshots.get(n.uid);
      if (
        snap &&
        snap.updated_at === n.baseUpdatedAt &&
        noteContentKey(snap.raw_json) === noteContentKey(n.fields.raw_json)
      ) {
        results.push({ uid: n.uid, outcome: "unchanged", updated_at: snap.updated_at });
        continue;
      }
    }
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
      // ── Yeni not → yalnız yoksa ekle (P1-5: mevcut satır körlemesine ezilmez) ──
      const created = await store.createNote(n.uid, n.fields, nowIso);
      if (created) {
        results.push({ uid: n.uid, outcome: "created", updated_at: created.updated_at });
        continue;
      }
      const existing = await store.getByUid(n.uid);
      if (existing && noteContentKey(existing.raw_json) === noteContentKey(n.fields.raw_json)) {
        // Aynı not zaten sunucuda (ör. yanıtı kaybolan create'in yeniden denemesi) → idempotent.
        results.push({ uid: n.uid, outcome: "unchanged", updated_at: existing.updated_at });
      } else {
        conflicts++;
        results.push({
          uid: n.uid,
          outcome: "conflict",
          server_updated_at: existing?.updated_at ?? null,
          server: existing?.raw_json ?? null,
        });
      }
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

  return { results, conflicts, rejected: rejected.length };
}
