/**
 * FAZ1 Final Hardening — PAKET DY-A harness (saf + fake DB; gerçek DB/ağ YOK).
 * Çalıştırma: npx tsx scripts/final-hardening/dy.harness.ts
 * Saat dilimi bağımsız olmalı: PowerShell ile $env:TZ="America/Los_Angeles" altında da koş.
 */
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyNotesPatch,
  buildNotesFields,
  decideNotesWrite,
  notesVersion,
} from "../../lib/danisan/notesPatch";
import {
  createClientIdempotent,
  resolveCreateRequestId,
  sanitizeClientPayload,
} from "../../lib/danisan/clientCreate";
import {
  HOMEWORK_END_BEFORE_START,
  mergeHomeworkDates,
  validateHomeworkDates,
} from "../../lib/danisan/homeworkDates";
import {
  countAppointments,
  deriveAppointmentStatus,
  isAppointmentInFuture,
  nextGorusme,
  validateAppointmentCreate,
  validateAppointmentPatch,
} from "../../lib/danisan/appointmentRules";
import { advanceClientGorusme } from "../../lib/danisan/appointmentGorusme";
import { activityStatus, relativeDayInfo, totalChargesAmount } from "../../lib/danisan/clientDisplay";
import { collectDeletePreview, nonZeroPreviewItems, DELETE_PREVIEW_TABLES } from "../../lib/danisan/deletePreview";
import { pruneSelection, visibleSelection } from "../../lib/ui/selection";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}:`, (e as Error).message);
  }
}

// ─── Minimal in-memory Supabase taklidi ──────────────────────────────────────
type Row = Record<string, unknown>;
type Err = { code?: string; message: string } | null;
type Hooks = {
  /** insert öncesi: hata döndürürse insert başarısız olur. */
  beforeInsert?: (table: string, row: Row) => Err;
  /** update öncesi (koşullu yazım yarışını simüle etmek için). */
  beforeUpdate?: (table: string) => void;
  failTables?: Set<string>;
};

class FakeDb {
  tables: Record<string, Row[]> = {};
  log: Array<{ op: string; table: string; payload?: unknown }> = [];
  hooks: Hooks = {};
  private seq = 0;
  constructor(init: Record<string, Row[]>) {
    for (const [k, v] of Object.entries(init)) this.tables[k] = v.map((r) => ({ ...r }));
  }
  rows(t: string) {
    return (this.tables[t] ??= []);
  }
  nextId() {
    this.seq++;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`;
  }
  from(table: string) {
    return new Query(this, table);
  }
  /** Sorgu filtrelerinde (URL'e giden) kullanılan kolon/değer uzunlukları — DY-01 kanıtı. */
  urlCols: Array<{ col: string; len: number }> = [];
  /** true → RPC migration'ı henüz uygulanmamış prod gibi davran (PGRST202). */
  rpcMissing = false;
  /** client_notes_cas_update RPC emülasyonu: tek ifade (hook → özet kontrolü → yazım) = atomik. */
  async rpc(name: string, args: Record<string, unknown>) {
    if (this.rpcMissing || name !== "client_notes_cas_update") {
      return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } };
    }
    this.hooks.beforeUpdate?.("client_notes");
    const fields = args.p_fields as Row;
    const hit = this.rows("client_notes").filter(
      (r) =>
        r.id === args.p_note_id &&
        r.tenant_id === args.p_tenant_id &&
        r.client_id === args.p_client_id &&
        (args.p_expected_sha256 == null || notesVersion((r.notlar as string | null) ?? null) === args.p_expected_sha256),
    );
    for (const r of hit) Object.assign(r, fields);
    this.log.push({ op: "update", table: "client_notes", payload: fields });
    return { data: hit.map((r) => ({ ...r })), error: null };
  }
  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private op: "select" | "update" | "insert" | "delete" = "select";
  private payload: Row | null = null;
  private headCount = false;
  constructor(private db: FakeDb, private table: string) {}
  // Kolon listesi (1. argüman) yok sayılır; yalnız { head } okunur.
  select(...args: [string?, { count?: string; head?: boolean }?]) {
    const opts = args[1];
    if (this.op === "select" && opts?.head) this.headCount = true;
    return this;
  }
  eq(col: string, v: unknown) {
    this.db.urlCols.push({ col, len: String(v).length });
    this.filters.push((r) => r[col] === v);
    return this;
  }
  is(col: string, v: null) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  insert(p: Row) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private match() {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }
  private exec(): { data: unknown; error: Err; count?: number } {
    if (this.db.hooks.failTables?.has(this.table)) return { data: null, error: { message: "boom" } };
    if (this.op === "insert") {
      const row = { id: this.db.nextId(), ...(this.payload as Row) };
      const err = this.db.hooks.beforeInsert?.(this.table, row) ?? null;
      this.db.log.push({ op: "insert", table: this.table, payload: this.payload });
      if (err) return { data: null, error: err };
      this.db.rows(this.table).push(row);
      return { data: [row], error: null };
    }
    if (this.op === "update") {
      this.db.hooks.beforeUpdate?.(this.table);
      const hit = this.match();
      for (const r of hit) Object.assign(r, this.payload);
      this.db.log.push({ op: "update", table: this.table, payload: this.payload });
      return { data: hit.map((r) => ({ ...r })), error: null };
    }
    if (this.op === "delete") {
      const hit = this.match();
      this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !hit.includes(r));
      return { data: hit, error: null };
    }
    const hit = this.match();
    if (this.headCount) return { data: null, error: null, count: hit.length };
    return { data: hit.map((r) => ({ ...r })), error: null };
  }
  async maybeSingle() {
    const r = this.exec();
    if (r.error) return { data: null, error: r.error };
    const list = r.data as Row[];
    if (list.length > 1) return { data: null, error: { message: "multiple rows" } };
    return { data: list[0] ?? null, error: null };
  }
  async single() {
    const r = this.exec();
    if (r.error) return { data: null, error: r.error };
    const list = r.data as Row[];
    if (list.length !== 1) return { data: null, error: { message: "not single" } };
    return { data: list[0], error: null };
  }
  then<T>(res: (v: { data: unknown; error: Err; count?: number }) => T, rej?: (e: unknown) => T) {
    try {
      return Promise.resolve(res(this.exec()));
    } catch (e) {
      return rej ? Promise.resolve(rej(e)) : Promise.reject(e);
    }
  }
}

const TEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLI = "11111111-1111-4111-8111-111111111111";

(async () => {
  // ── 1) Notlar: alan oluşturucu ─────────────────────────────────────────────
  await t("notes fields: yalnız gövdedeki alanlar", () => {
    const r = buildNotesFields({ saglik_notu: "x", adres: null });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.fields, { saglik_notu: "x", adres: null });
  });
  await t("notes fields: notlar + base_version", () => {
    const r = buildNotesFields({ notlar: "[]", base_version: "abc" });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(Object.keys(r.fields), ["notlar"]);
      assert.equal(r.baseVersion, "abc");
    }
  });
  await t("notes fields: tip dışı → hata", () => assert.equal(buildNotesFields({ notlar: 5 }).ok, false));
  await t("notes fields: boş gövde → hata", () => assert.equal(buildNotesFields({ foo: 1 }).ok, false));
  await t("notes fields: tenant_id/id yok sayılır", () => {
    const r = buildNotesFields({ tenant_id: "x", id: "y", oneriler: "z" });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.fields, { oneriler: "z" });
  });

  // ── 2) CAS kararı ─────────────────────────────────────────────────────────
  await t("CAS: eski istemci (base yok) → write", () =>
    assert.equal(decideNotesWrite({ writesNotlar: true, baseVersion: null, currentRaw: "x" }), "write"));
  await t("CAS: eşleşen sürüm → write", () =>
    assert.equal(decideNotesWrite({ writesNotlar: true, baseVersion: notesVersion("x"), currentRaw: "x" }), "write"));
  await t("CAS: farklı sürüm → conflict", () =>
    assert.equal(decideNotesWrite({ writesNotlar: true, baseVersion: notesVersion("old"), currentRaw: "new" }), "conflict"));
  await t("CAS: null ve \"\" aynı sürüm", () => assert.equal(notesVersion(null), notesVersion("")));
  await t("CAS: notlar yazılmıyorsa kontrol yok", () =>
    assert.equal(decideNotesWrite({ writesNotlar: false, baseVersion: "zz", currentRaw: "x" }), "write"));

  // ── 3) applyNotesPatch (fake DB) ─────────────────────────────────────────
  const baseNote = { id: "n1", tenant_id: TEN, client_id: CLI, notlar: '[{"id":"a","content":"A"}]', saglik_notu: "S", adres: "Ad", oneriler: "O" };
  await t("notes PATCH: genel kayıt notlar'a dokunmaz", async () => {
    const db = new FakeDb({ client_notes: [baseNote] });
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { saglik_notu: "S2", adres: "A2", oneriler: "O2" }, null);
    assert.equal(r.kind, "ok");
    assert.equal(db.rows("client_notes")[0].notlar, baseNote.notlar);
    assert.equal(db.rows("client_notes")[0].saglik_notu, "S2");
  });
  await t("notes PATCH: notlar CAS eşleşir → yalnız notlar yazılır", async () => {
    const db = new FakeDb({ client_notes: [baseNote] });
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[]" }, notesVersion(baseNote.notlar));
    assert.equal(r.kind, "ok");
    const row = db.rows("client_notes")[0];
    assert.equal(row.notlar, "[]");
    assert.equal(row.saglik_notu, "S");
    const upd = db.log.find((l) => l.op === "update");
    assert.deepEqual(Object.keys(upd?.payload as Row), ["notlar"]);
  });
  await t("notes PATCH: sürüm uyuşmazsa 409 ve yazım yok", async () => {
    const db = new FakeDb({ client_notes: [baseNote] });
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[]" }, notesVersion(""));
    assert.equal(r.kind, "conflict");
    assert.equal(db.rows("client_notes")[0].notlar, baseNote.notlar);
    assert.equal(db.log.filter((l) => l.op === "update").length, 0);
  });
  await t("notes PATCH: okuma-yazma arası değişim → conflict (atomik koşul)", async () => {
    const db = new FakeDb({ client_notes: [baseNote] });
    db.hooks.beforeUpdate = () => { db.rows("client_notes")[0].notlar = "başka cihaz"; };
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[]" }, notesVersion(baseNote.notlar));
    assert.equal(r.kind, "conflict");
    assert.equal(db.rows("client_notes")[0].notlar, "başka cihaz");
  });
  await t("notes PATCH: satır yok → insert", async () => {
    const db = new FakeDb({ client_notes: [] });
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[1]" }, notesVersion(null));
    assert.equal(r.kind, "ok");
    assert.equal(db.rows("client_notes").length, 1);
  });
  await t("notes PATCH: insert yarışı 23505 → mevcut satır güncellenir", async () => {
    const db = new FakeDb({ client_notes: [] });
    db.hooks.beforeInsert = () => {
      // Başka istek aynı anda satırı yarattı (yalnız saglik_notu) → UNIQUE ihlali.
      db.rows("client_notes").push({ id: "raced", tenant_id: TEN, client_id: CLI, notlar: null, saglik_notu: "S" });
      db.hooks.beforeInsert = undefined;
      return { code: "23505", message: "duplicate key" };
    };
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[x]" }, notesVersion(null));
    assert.equal(r.kind, "ok");
    assert.equal(db.rows("client_notes").length, 1);
    assert.equal(db.rows("client_notes")[0].notlar, "[x]");
    assert.equal(db.rows("client_notes")[0].saglik_notu, "S");
  });
  await t("notes PATCH: başka tenant satırı etkilenmez", async () => {
    const db = new FakeDb({ client_notes: [{ ...baseNote, tenant_id: "other" }] });
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[]" }, null);
    assert.equal(r.kind, "ok");
    assert.equal(db.rows("client_notes").length, 2);
    assert.equal(db.rows("client_notes")[0].notlar, baseNote.notlar);
  });

  // ── 3b) DY-01: uzun notlar URL'e girmez, kilitlenmez; CAS korunur ─────────
  const longText = (n: number) => JSON.stringify([{ id: "L", content: "Şğüıöç 🌿 notu ".repeat(Math.ceil(n / 14)).slice(0, n), createdAt: "2026-10-02T09:00:00.000Z" }]);
  for (const size of [100, 8500, 20000, 200000]) {
    await t(`DY-01: ${size} karakter not → yaz/düzenle/sil/temizle, URL'de not metni yok`, async () => {
      const db = new FakeDb({ client_notes: [{ ...baseNote, notlar: longText(size) }] });
      let cur = db.rows("client_notes")[0].notlar as string;
      for (const next of [longText(size + 50), longText(size), "[]", ""]) {
        const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: next }, notesVersion(cur));
        assert.equal(r.kind, "ok");
        cur = db.rows("client_notes")[0].notlar as string;
        assert.equal(cur, next);
      }
      assert.ok(db.urlCols.every((u) => u.col !== "notlar"), "notlar URL filtresinde kullanılmamalı");
      assert.ok(db.urlCols.every((u) => u.len < 100), "URL filtre değerleri kısa olmalı");
    });
  }
  await t("DY-01: uzun notta iki sekme çakışması → conflict (409), yazım yok", async () => {
    const db = new FakeDb({ client_notes: [{ ...baseNote, notlar: longText(20000) }] });
    const stale = notesVersion(longText(20000));
    db.rows("client_notes")[0].notlar = longText(20001); // diğer sekme kaydetti
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[]" }, stale);
    assert.equal(r.kind, "conflict");
    assert.equal(db.rows("client_notes")[0].notlar, longText(20001));
  });
  await t("DY-01: uzun notta okuma→yazma arası değişim → conflict (RPC atomik)", async () => {
    const db = new FakeDb({ client_notes: [{ ...baseNote, notlar: longText(20000) }] });
    db.hooks.beforeUpdate = () => { db.rows("client_notes")[0].notlar = "başka cihaz"; };
    const r = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[]" }, notesVersion(longText(20000)));
    assert.equal(r.kind, "conflict");
    assert.equal(db.rows("client_notes")[0].notlar, "başka cihaz");
  });
  await t("DY-01: RPC yok (migration öncesi) → uzun not yine yazılır, URL'de metin yok, sürüm çakışması 409", async () => {
    const db = new FakeDb({ client_notes: [{ ...baseNote, notlar: longText(20000) }] });
    db.rpcMissing = true;
    const ok1 = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: longText(9000) }, notesVersion(longText(20000)));
    assert.equal(ok1.kind, "ok");
    assert.equal(db.rows("client_notes")[0].notlar, longText(9000));
    const bad = await applyNotesPatch(db.asClient(), TEN, CLI, { notlar: "[]" }, notesVersion(longText(20000)));
    assert.equal(bad.kind, "conflict");
    assert.ok(db.urlCols.every((u) => u.col !== "notlar"));
  });

  // ── 4) Danışan oluşturma idempotency ──────────────────────────────────────
  const RID = "0b8f2a44-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  await t("clients: create_request_id istemciden yazılamaz", () => {
    const f = sanitizeClientPayload({ ad: "A", create_request_id: RID, tenant_id: "x", id: "y", request_id: RID });
    assert.deepEqual(f, { ad: "A" });
  });
  await t("clients: request_id doğrulama", () => {
    assert.equal(resolveCreateRequestId({ request_id: RID.toUpperCase() }), RID);
    assert.equal(resolveCreateRequestId({ request_id: "abc" }), null);
    assert.equal(resolveCreateRequestId({}), null);
  });
  await t("clients POST: 23505 → idempotent replay (tek kayıt)", async () => {
    const db = new FakeDb({ clients: [] });
    db.hooks.beforeInsert = (_table, row) =>
      db.rows("clients").some((r) => r.tenant_id === row.tenant_id && r.create_request_id === row.create_request_id)
        ? { code: "23505", message: "dup" }
        : null;
    const a = await createClientIdempotent(db.asClient(), TEN, { ad: "Ayşe" }, RID);
    const b = await createClientIdempotent(db.asClient(), TEN, { ad: "Ayşe" }, RID);
    assert.equal(a.kind, "created");
    assert.equal(b.kind, "replay");
    assert.equal(db.rows("clients").length, 1);
    assert.equal((a as { client: Row }).client.id, (b as { client: Row }).client.id);
  });
  await t("clients POST: request_id yoksa düz insert", async () => {
    const db = new FakeDb({ clients: [] });
    await createClientIdempotent(db.asClient(), TEN, { ad: "A" }, null);
    await createClientIdempotent(db.asClient(), TEN, { ad: "A" }, null);
    assert.equal(db.rows("clients").length, 2);
    assert.equal("create_request_id" in db.rows("clients")[0], false);
  });
  await t("clients POST: kolon yok (migration öncesi) → idempotency'siz geri uyum", async () => {
    const db = new FakeDb({ clients: [] });
    db.hooks.beforeInsert = (_table, row) =>
      "create_request_id" in row ? { code: "PGRST204", message: "Could not find the 'create_request_id' column" } : null;
    const r = await createClientIdempotent(db.asClient(), TEN, { ad: "A" }, RID);
    assert.equal(r.kind, "created");
    assert.equal(db.rows("clients").length, 1);
  });

  // ── 5) Ödev tarihleri ─────────────────────────────────────────────────────
  await t("ödev: end < start → hata", () =>
    assert.equal(validateHomeworkDates({ start_date: "2026-10-10", end_date: "2026-10-01" }), HOMEWORK_END_BEFORE_START));
  await t("ödev: eşit/boş geçerli", () => {
    assert.equal(validateHomeworkDates({ start_date: "2026-10-10", end_date: "2026-10-10" }), null);
    assert.equal(validateHomeworkDates({ start_date: "", end_date: "2026-10-01" }), null);
    assert.equal(validateHomeworkDates({}), null);
  });
  await t("ödev: bozuk tarih → hata", () => assert.ok(validateHomeworkDates({ end_date: "2026-02-30" })));
  await t("ödev PATCH: yalnız end_date → kayıtlı start ile birleşir", () => {
    const merged = mergeHomeworkDates({ start_date: "2026-10-10", end_date: "2026-10-20" }, { end_date: "2026-10-01" });
    assert.equal(validateHomeworkDates(merged), HOMEWORK_END_BEFORE_START);
    const ok = mergeHomeworkDates({ start_date: "2026-10-10", end_date: null }, { start_date: null, end_date: "2026-10-01" });
    assert.equal(validateHomeworkDates(ok), null);
  });

  // ── 6) Türetilmiş randevu durumu + sayaçlar ───────────────────────────────
  const NOW = new Date("2026-09-27T09:00:00Z"); // İstanbul 12:00
  await t("durum: geçmiş + bekliyor → sonuc_girilmedi", () =>
    assert.equal(deriveAppointmentStatus("bekliyor", "2026-09-27T08:00:00Z", NOW), "sonuc_girilmedi"));
  await t("durum: gelecek + bekliyor → bekliyor", () =>
    assert.equal(deriveAppointmentStatus(null, "2026-09-27T10:00:00Z", NOW), "bekliyor"));
  await t("durum: tamamlandı/iptal değişmez", () => {
    assert.equal(deriveAppointmentStatus("tamamlandi", "2020-01-01T00:00:00Z", NOW), "tamamlandi");
    assert.equal(deriveAppointmentStatus("iptal", "2020-01-01T00:00:00Z", NOW), "iptal");
  });
  await t("durum: saatsiz bugün → bekliyor", () =>
    assert.equal(deriveAppointmentStatus("bekliyor", "2026-09-27", NOW), "bekliyor"));
  await t("upcomingCount: yalnız bekliyor && gelecek", () => {
    const c = countAppointments(
      [
        { status: "bekliyor", appointment_date: "2026-09-28T09:00:00Z" },
        { status: "tamamlandi", appointment_date: "2026-09-28T09:00:00Z" },
        { status: "iptal", appointment_date: "2026-09-29T09:00:00Z" },
        { status: "bekliyor", appointment_date: "2026-09-20T09:00:00Z" },
        { status: null, appointment_date: "2026-09-21T09:00:00Z" },
      ],
      NOW,
    );
    assert.equal(c.upcoming, 1);
    assert.equal(c.noResult, 2);
    assert.equal(c.completed, 1);
    assert.equal(c.cancelled, 1);
    assert.equal(c.total, 5);
  });

  // ── 7) Randevu PATCH / POST doğrulaması ───────────────────────────────────
  await t("PATCH: izin listesi (tenant_id/client_id/bilinmeyen düşer)", () => {
    const v = validateAppointmentPatch({ title: "T", tenant_id: "x", client_id: "y", foo: 1 }, null, NOW);
    assert.ok(v.ok);
    if (v.ok) assert.deepEqual(v.fields, { title: "T" });
  });
  await t("PATCH: geçersiz statü → 400", () => {
    const v = validateAppointmentPatch({ status: "done" }, null, NOW);
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.status, 400);
  });
  await t("PATCH: gelecekteki randevu tamamlandı → 409", () => {
    const v = validateAppointmentPatch({ status: "tamamlandi" }, { appointment_date: "2026-09-28T09:00:00Z" }, NOW);
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.status, 409);
      assert.equal(v.code, "APPOINTMENT_IN_FUTURE");
    }
  });
  await t("PATCH: geçmiş randevu tamamlandı → ok; gelecek iptal → ok", () => {
    assert.ok(validateAppointmentPatch({ status: "tamamlandi" }, { appointment_date: "2026-09-27T08:59:00Z" }, NOW).ok);
    assert.ok(validateAppointmentPatch({ status: "iptal" }, { appointment_date: "2026-12-01T09:00:00Z" }, NOW).ok);
  });
  await t("PATCH: boş gövde → 400", () => assert.equal(validateAppointmentPatch({}, null, NOW).ok, false));
  await t("POST: statü varsayılan bekliyor; gelecekte tamamlandı → 409", () => {
    const a = validateAppointmentCreate({ appointment_date: "2026-10-01T09:00:00Z", title: "S" }, NOW);
    assert.ok(a.ok);
    if (a.ok) assert.equal(a.fields.status, "bekliyor");
    const b = validateAppointmentCreate({ appointment_date: "2026-10-01T09:00:00Z", status: "tamamlandi" }, NOW);
    assert.equal(b.ok, false);
  });
  await t("isAppointmentInFuture: tarih-only yarın", () =>
    assert.equal(isAppointmentInFuture("2026-09-28", NOW), true));

  // ── 8) gorusme ilerletme (sunucu) ─────────────────────────────────────────
  await t("nextGorusme: gelecek aday asla yazılmaz", () =>
    assert.equal(nextGorusme(null, "2026-09-28", "2026-09-27"), null));
  await t("nextGorusme: daha eski aday geri almaz", () =>
    assert.equal(nextGorusme("2026-09-20", "2026-09-10", "2026-09-27"), null));
  await t("nextGorusme: yeni aday ilerletir; boşsa yazar", () => {
    assert.equal(nextGorusme("2026-09-20", "2026-09-25", "2026-09-27"), "2026-09-25");
    assert.equal(nextGorusme(null, "2026-09-25", "2026-09-27"), "2026-09-25");
  });
  await t("nextGorusme: eski GG.AA.YYYY metinle karşılaştırır", () => {
    assert.equal(nextGorusme("26.09.2026", "2026-09-25", "2026-09-27"), null);
    assert.equal(nextGorusme("20.09.2026", "2026-09-25", "2026-09-27"), "2026-09-25");
  });
  await t("nextGorusme: 01:30 TR randevu kendi gününe yazılır (UTC kayması yok)", () =>
    assert.equal(nextGorusme(null, "2026-09-26T22:30:00Z", "2026-09-27"), "2026-09-27"));
  await t("nextGorusme: bozuk mevcut metin ezilmez", () =>
    assert.equal(nextGorusme("yakında", "2026-09-25", "2026-09-27"), null));
  await t("advanceClientGorusme: koşullu yazım + gelecek randevu atlanır", async () => {
    const db = new FakeDb({ clients: [{ id: CLI, tenant_id: TEN, gorusme: "2026-09-01" }] });
    const r1 = await advanceClientGorusme(db.asClient(), TEN, CLI, "2026-09-28T09:00:00Z", NOW);
    assert.equal(r1, null);
    const r2 = await advanceClientGorusme(db.asClient(), TEN, CLI, "2026-09-26T22:30:00Z", NOW);
    assert.equal(r2, "2026-09-27");
    assert.equal(db.rows("clients")[0].gorusme, "2026-09-27");
    // Yarış: arada daha yeni tarih yazıldıysa ezilmez.
    db.rows("clients")[0].gorusme = "2026-09-10";
    db.hooks.beforeUpdate = () => { db.rows("clients")[0].gorusme = "2026-09-27"; };
    const r3 = await advanceClientGorusme(db.asClient(), TEN, CLI, "2026-09-20T09:00:00Z", NOW);
    assert.equal(r3, null);
    assert.equal(db.rows("clients")[0].gorusme, "2026-09-27");
  });

  // ── 9) Göreli süre / aktif durum / toplam ücret ───────────────────────────
  await t("goreleSure: gelecek → X gün sonra (bugün değil)", () =>
    assert.deepEqual(relativeDayInfo("2026-09-30", NOW), { kind: "future", days: 3 }));
  await t("goreleSure: bugün / dün / hafta", () => {
    assert.deepEqual(relativeDayInfo("2026-09-27", NOW), { kind: "today" });
    assert.deepEqual(relativeDayInfo("2026-09-26", NOW), { kind: "days", n: 1 });
    assert.deepEqual(relativeDayInfo("2026-09-13", NOW), { kind: "weeks", n: 2 });
  });
  await t("goreleSure: gece yarısı sonrası (TR 00:30) doğru gün", () =>
    assert.deepEqual(relativeDayInfo("2026-09-27", new Date("2026-09-26T21:30:00Z")), { kind: "today" }));
  await t("aktif durum takvim günü", () => {
    assert.equal(activityStatus(null, NOW), "yeni");
    assert.equal(activityStatus("2026-08-28", NOW), "aktif");
    assert.equal(activityStatus("2026-08-27", NOW), "takip");
    assert.equal(activityStatus("2026-06-01", NOW), "pasif");
  });
  await t("toplam ücret: charges + aktarılmamış seans; backfill çift sayılmaz", () => {
    const total = totalChargesAmount(
      [{ id: "s1", fee: 500 }, { id: "s2", fee: 300 }, { id: "s3", fee: null }],
      [{ amount: 500, source_session_id: "s1" }, { amount: "250", source_session_id: null }],
    );
    assert.equal(total, 500 + 250 + 300);
    assert.equal(totalChargesAmount([], []), null);
  });

  // ── 10) Silme önizlemesi (fake DB) ────────────────────────────────────────
  await t("delete-preview: tenant+client kapsamlı sayım + notlar", async () => {
    const db = new FakeDb({
      appointments: [
        { tenant_id: TEN, client_id: CLI },
        { tenant_id: TEN, client_id: CLI },
        { tenant_id: TEN, client_id: "other" },
        { tenant_id: "otherTenant", client_id: CLI },
      ],
      client_sessions: [{ tenant_id: TEN, client_id: CLI }],
      yasam_hafizasi_report_snapshots: [{ tenant_id: TEN, client_id: CLI }],
      client_notes: [{ tenant_id: TEN, client_id: CLI, notlar: '[{"id":"a","content":"A"},{"id":"b","content":"B"}]', saglik_notu: "x", adres: "", oneriler: null }],
    });
    const p = await collectDeletePreview(db.asClient(), TEN, CLI);
    const byKey = Object.fromEntries(p.counts.map((c) => [c.key, c.count]));
    assert.equal(byKey.appointments, 2);
    assert.equal(byKey.sessions, 1);
    assert.equal(byKey.memorySnapshots, 1);
    assert.equal(byKey.homeworks, 0);
    assert.equal(p.notes.noteCount, 2);
    assert.equal(p.notes.saglikNotu, true);
    assert.equal(p.notes.adres, false);
    assert.equal(p.partial, false);
    assert.deepEqual(nonZeroPreviewItems(p).map((x) => x.key), ["appointments", "sessions", "memorySnapshots"]);
    assert.deepEqual(p.unlinkedModules, ["Numeroloji", "Human Design", "Refleksoloji", "Biyoenerji"]);
    assert.equal(p.counts.length, DELETE_PREVIEW_TABLES.length);
  });
  await t("delete-preview: tablo hatası → partial (silme engellenmez)", async () => {
    const db = new FakeDb({});
    db.hooks.failTables = new Set(["client_gifts"]);
    const p = await collectDeletePreview(db.asClient(), TEN, CLI);
    assert.equal(p.partial, true);
    assert.equal(p.counts.find((c) => c.key === "legacyGifts")?.count, null);
  });

  // ── 11) Toplu silme: görünür kesişim ──────────────────────────────────────
  await t("toplu silme: aramayla gizlenen seçim budanır/silinmez", () => {
    const selected = new Set(["a", "b", "c"]);
    const visible = ["a", "c", "d"];
    assert.deepEqual(visibleSelection(selected, visible), ["a", "c"]);
    const pruned = pruneSelection(selected, visible);
    assert.deepEqual([...pruned].sort(), ["a", "c"]);
    const same = new Set(["a"]);
    assert.equal(pruneSelection(same, visible), same, "değişmezse aynı referans (render döngüsü yok)");
  });

  console.log(`\nDY-A harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})();
