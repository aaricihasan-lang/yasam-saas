/**
 * Refleksoloji — Klinik Notlar per-note EŞZAMANLILIK harness'i (REF-003).
 *
 * SAF birim testi: reconcileNoteSync CAS/conflict/silme sözleşmesini bellek-içi bir
 * NotesStore ile doğrular. Prod/DB'ye DOKUNMAZ (route ile AYNI çekirdeği test eder).
 * Çalıştır: npm run refleksoloji:notes-concurrency:harness
 *
 * Kapsanan senaryolar (görev §4):
 *   S1  aynı not A/B eş-zamanlı düzenleme → stale olan 409/conflict, server korunur
 *   S2  A yeni not ekler, B bayat liste senkronlar → yeni not SİLİNMEZ
 *   S3  [] PUT (silme yok) → tenant'ın TÜM notları KORUNUR
 *   S4  explicit son-not silme → YALNIZ hedef silinir
 *   S5  batch: bir stale + bir geçerli not → deterministik (conflict + updated)
 *   +   stale delete koruması → delete-conflict (server korunur)
 *   +   remote silinmiş nota CAS update → conflict (server null)
 *   +   yeni not create (base yok) → created
 */
import {
  reconcileNoteSync,
  type NotesStore,
  type ServerNoteSnapshot,
  type IncomingSyncNote,
  type IncomingDeletion,
  type NoteFields,
} from "../lib/refleksoloji/notesConcurrency";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}`);
  }
}

/**
 * Bellek-içi NotesStore — Supabase (tenant_id, source_uid) UNIQUE + updated_at CAS
 * semantiğini birebir taklit eder. updated_at BİREBİR string eşitliğiyle karşılaştırılır
 * (server aynı ISO string'i geri döndürdüğü için gerçek davranışa sadık).
 */
function makeStore(seed?: Array<{ uid: string; updated_at: string; content?: string }>) {
  const rows = new Map<string, ServerNoteSnapshot>();
  if (seed) {
    for (const s of seed) {
      rows.set(s.uid, {
        updated_at: s.updated_at,
        raw_json: { id: s.uid, content: s.content ?? "seed", updatedAt: s.updated_at },
      });
    }
  }
  const store: NotesStore = {
    async casUpdate(uid, expected, fields, newUpdatedAt) {
      const cur = rows.get(uid);
      if (!cur || cur.updated_at !== expected) return null;
      const raw = { ...(fields.raw_json as Record<string, unknown>), __col_updated_at: newUpdatedAt };
      const snap: ServerNoteSnapshot = { updated_at: newUpdatedAt, raw_json: raw };
      rows.set(uid, snap);
      return snap;
    },
    async getByUid(uid) {
      return rows.get(uid) ?? null;
    },
    async createNote(uid, fields, newUpdatedAt) {
      // upsert: varsa üzerine yaz (idempotent), yoksa ekle.
      const snap: ServerNoteSnapshot = {
        updated_at: newUpdatedAt,
        raw_json: fields.raw_json ?? { id: uid },
      };
      rows.set(uid, snap);
      return snap;
    },
    async deleteNote(uid, expected) {
      const cur = rows.get(uid);
      if (!cur) return { deleted: 0, existsAfter: null };
      if (expected != null && cur.updated_at !== expected) {
        // CAS eşleşmedi → silme; satır kalır.
        return { deleted: 0, existsAfter: cur };
      }
      rows.delete(uid);
      return { deleted: 1, existsAfter: null };
    },
  };
  return { store, rows };
}

function fields(content: string, uid: string): NoteFields {
  return {
    title: "t",
    note_date: null,
    content,
    attachments: [],
    raw_json: { id: uid, content },
  };
}
function note(uid: string, base: string | null, content: string): IncomingSyncNote {
  return { uid, baseUpdatedAt: base, fields: fields(content, uid) };
}
function del(uid: string, expected: string | null): IncomingDeletion {
  return { uid, expectedUpdatedAt: expected };
}

async function main() {
  console.log("REF-003 — notes per-note concurrency (CAS)");

  // ── S1: aynı not, iki cihaz, eş-zamanlı düzenleme ────────────────────────────
  {
    const { store, rows } = makeStore([{ uid: "N1", updated_at: "V1", content: "orig" }]);
    // Cihaz A: base V1 ile günceller → V2
    const a = await reconcileNoteSync(store, [note("N1", "V1", "A-değişiklik")], [], "V2");
    check("S1: A güncellemesi başarılı (updated)", a.results[0].outcome === "updated");
    check("S1: A conflict yok", a.conflicts === 0);
    check("S1: store N1 = V2", rows.get("N1")?.updated_at === "V2");

    // Cihaz B: HÂLÂ bayat base V1 ile günceller → conflict
    const b = await reconcileNoteSync(store, [note("N1", "V1", "B-değişiklik")], [], "V3");
    check("S1: B stale güncelleme → conflict", b.results[0].outcome === "conflict");
    check("S1: B conflicts=1 (409 tetikler)", b.conflicts === 1);
    const bres = b.results[0];
    check(
      "S1: conflict server sürümü V2 (A korundu)",
      bres.outcome === "conflict" && bres.server_updated_at === "V2",
    );
    check(
      "S1: server içeriği A-değişiklik (last-write-wins DEĞİL)",
      bres.outcome === "conflict" &&
        (bres.server as { content?: string } | null)?.content === "A-değişiklik",
    );
    check("S1: B stale overwrite YAPMADI (store hâlâ V2)", rows.get("N1")?.updated_at === "V2");
  }

  // ── S2: A yeni not ekler; B bayat liste senkronlar → yeni not silinmez ───────
  {
    const { store, rows } = makeStore([{ uid: "N1", updated_at: "V1", content: "n1" }]);
    // A: yeni N2 ekler (base yok → create)
    const a = await reconcileNoteSync(store, [note("N2", null, "yeni")], [], "V2");
    check("S2: A yeni not create", a.results[0].outcome === "created");
    check("S2: store'da N2 var", rows.has("N2"));
    // B: yalnız kendi bildiği N1'i (base V1) gönderir, silme YOK → N2 dokunulmaz
    const b = await reconcileNoteSync(store, [note("N1", "V1", "n1-b")], [], "V3");
    check("S2: B senkronu N1 günceller", b.results[0].outcome === "updated");
    check("S2: B senkronu N2'yi SİLMEZ (bayat liste)", rows.has("N2"));
    check("S2: store 2 not içerir", rows.size === 2);
  }

  // ── S3: [] PUT → tüm notlar korunur ──────────────────────────────────────────
  {
    const { store, rows } = makeStore([
      { uid: "N1", updated_at: "V1" },
      { uid: "N2", updated_at: "V1" },
      { uid: "N3", updated_at: "V1" },
    ]);
    const r = await reconcileNoteSync(store, [], [], "V2");
    check("S3: boş PUT → sonuç yok", r.results.length === 0);
    check("S3: boş PUT → TÜM notlar korunur (3)", rows.size === 3);
  }

  // ── S4: explicit son-not silme → yalnız hedef silinir ────────────────────────
  {
    const { store, rows } = makeStore([
      { uid: "N1", updated_at: "V1" },
      { uid: "N2", updated_at: "V1" },
    ]);
    const r = await reconcileNoteSync(store, [], [del("N2", "V1")], "V2");
    check("S4: hedef silindi (deleted)", r.results[0].outcome === "deleted");
    check("S4: N2 gitti", !rows.has("N2"));
    check("S4: N1 korundu (yalnız hedef silindi)", rows.has("N1"));
    check("S4: store 1 not", rows.size === 1);
  }

  // ── S5: batch: bir stale + bir geçerli not → deterministik ───────────────────
  {
    const { store, rows } = makeStore([
      { uid: "N1", updated_at: "V2", content: "server-A" }, // başka cihaz zaten V2
      { uid: "N3", updated_at: "V1", content: "orig3" },
    ]);
    const r = await reconcileNoteSync(
      store,
      [note("N1", "V1", "stale-1"), note("N3", "V1", "valid-3")],
      [],
      "V9",
    );
    const rN1 = r.results.find((x) => x.uid === "N1")!;
    const rN3 = r.results.find((x) => x.uid === "N3")!;
    check("S5: stale not → conflict", rN1.outcome === "conflict");
    check("S5: geçerli not → updated", rN3.outcome === "updated");
    check("S5: conflicts=1 (kısmi başarı deterministik)", r.conflicts === 1);
    check("S5: geçerli not DB'ye yazıldı (N3=V9)", rows.get("N3")?.updated_at === "V9");
    check("S5: stale not DB'de değişmedi (N1=V2)", rows.get("N1")?.updated_at === "V2");
  }

  // ── EK: stale delete koruması → delete-conflict ──────────────────────────────
  {
    const { store, rows } = makeStore([{ uid: "N1", updated_at: "V2", content: "değişti" }]);
    // Cihaz bayat V1 ile silmeye çalışıyor ama not V2'ye geçmiş
    const r = await reconcileNoteSync(store, [], [del("N1", "V1")], "V3");
    check("EK: stale delete → delete-conflict", r.results[0].outcome === "delete-conflict");
    check("EK: stale delete conflicts=1", r.conflicts === 1);
    check("EK: not SİLİNMEDİ (server korundu)", rows.has("N1"));
  }

  // ── EK: geçerli delete (expected doğru) ──────────────────────────────────────
  {
    const { store, rows } = makeStore([{ uid: "N1", updated_at: "V1" }]);
    const r = await reconcileNoteSync(store, [], [del("N1", "V1")], "V2");
    check("EK: doğru sürümle delete → deleted", r.results[0].outcome === "deleted");
    check("EK: not silindi", !rows.has("N1"));
  }

  // ── EK: zaten yok olan notu silme → idempotent noop ──────────────────────────
  {
    const { store } = makeStore([]);
    const r = await reconcileNoteSync(store, [], [del("GHOST", "V1")], "V2");
    check("EK: yok olan not silme → delete-noop (idempotent)", r.results[0].outcome === "delete-noop");
    check("EK: noop conflict üretmez", r.conflicts === 0);
  }

  // ── EK: remote silinmiş nota CAS update → conflict (server null) ──────────────
  {
    const { store } = makeStore([]); // N1 uzaktan silinmiş
    const r = await reconcileNoteSync(store, [note("N1", "V1", "yerel-edit")], [], "V2");
    check("EK: remote-silinmiş update → conflict", r.results[0].outcome === "conflict");
    const c = r.results[0];
    check("EK: conflict server null (uzaktan silinmiş)", c.outcome === "conflict" && c.server === null);
  }

  // ── EK: yeni not (base yok) → created ────────────────────────────────────────
  {
    const { store, rows } = makeStore([]);
    const r = await reconcileNoteSync(store, [note("NEW", null, "ilk")], [], "V1");
    check("EK: base yok → created", r.results[0].outcome === "created");
    check("EK: yeni not eklendi", rows.has("NEW"));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error("FAILURES:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
}

void main();
