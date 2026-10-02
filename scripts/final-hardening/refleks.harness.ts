/**
 * FAZ1 FINAL HARDENING — PAKET REFLEKS harness'i (tsx; DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/refleks.harness.ts
 *
 * Kapsar:
 *   A. Not-başına doğrulama (FA-03): bozuk not tüm batch'i düşürmez; değişmemiş not yazılmaz
 *   B. İstemci çekirdeği: tombstone/outbox birleştirme, yalnız kirli push, sonuç uygulama
 *   C. Uçtan uca (sahte tarayıcı + sahte sunucu): kalıcı outbox, "yeniden yükleme"
 *      simülasyonu (not dirilmez), sunucu-önce silme, kullanıcı değişiminde A≠B,
 *      çıkışta runtime reset + bekleyen iş varken önbellek KORUNUR
 *   D. Eski (v1) veri: kanıtlı benimseme / karantina / bırak — otomatik silme YOK
 *   E. Atlas: içerik hash'i (_meta.updated_at hariç), boş push yok, sunucu 409 kararları,
 *      açılışta PUT yok, eski atlas karantinası + açık içe aktarma
 *   F. Word: boş atlas + organlar → iki ad + eksik notu; kısmi eşleşme
 *   G. Protokol: CAS kararı, eski kopya sınıflandırma, slug, UUID kimlik
 *   E2. P1-5 Atlas lost update: base snapshot + 3-yollu organ birleştirme, çakışmada yerel
 *       korunur + otomatik PUT yok + kullanıcı kararı, çevrimdışı düzenleme, bayat hook state,
 *       LWW yedeği, survivor damgası, kota
 *   E3. P1-5 gerçek route: protokol expected+silinmiş → 409 (diriltme yok); not create
 *       mevcut uid → kör upsert yok (conflict/unchanged)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { Document, Packer } from "docx";
import JSZip from "jszip";
import type { NoteAttachment, SavedClinicalNote } from "@/app/refleksoloji/notlar/types";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: unknown, detail = ""): void {
  try {
    assert.ok(cond);
    pass += 1;
    console.log(`  ✅ ${name}`);
  } catch {
    fail += 1;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string): void {
  console.log(`\n──────── ${t} ────────`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Sahte tarayıcı ortamı (modüller window/localStorage'ı ÇAĞRI anında okur) ──
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  get length() {
    return this.map.size;
  }
  keys() {
    return [...this.map.keys()];
  }
}
const ls = new MemoryStorage();
const win = new EventTarget() as EventTarget & { localStorage: MemoryStorage };
win.localStorage = ls;
(globalThis as unknown as { window: unknown }).window = win;
(globalThis as unknown as { localStorage: unknown }).localStorage = ls;

// ─── Sahte sunucu (notes + atlas) ────────────────────────────────────────────
type Snap = { updated_at: string; raw_json: unknown };
let clock = 0;
const tick = () => new Date(Date.UTC(2026, 8, 27, 10, 0, 0) + (clock += 1000)).toISOString();

const serverNotes = new Map<string, Map<string, Snap>>(); // tenant → uid → snap
const serverAtlas = new Map<string, { updated_at: string; document: unknown; organ_list: string[] }>();
let offline = false;
const requestLog: string[] = [];

const USERS: Record<string, { id: string; tenant_id: string }> = {
  A: { id: "user-a", tenant_id: "tenant-a" },
  B: { id: "user-b", tenant_id: "tenant-b" },
  C: { id: "user-c", tenant_id: "tenant-c" },
};
function tenantOf(uid: string | null): string | null {
  const u = Object.values(USERS).find((x) => x.id === uid);
  return u?.tenant_id ?? null;
}
function login(key: keyof typeof USERS, extra: Record<string, unknown> = {}) {
  ls.setItem("yasam_user", JSON.stringify({ ...USERS[key], role: "expert", ...extra }));
  ls.setItem("yasam_session_token", `tok-${key}`);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const tenant = tenantOf(headers["x-user-id"] ?? null);
  requestLog.push(`${method} ${url}`);
  if (url.startsWith("/api/auth")) return json({ ok: true });
  if (offline) throw new TypeError("Failed to fetch");
  if (!tenant) return json({ ok: false }, 401);

  const { prepareNoteSyncBatch } = await import("@/lib/refleksoloji/notesSyncBatch");
  const { reconcileNoteSync } = await import("@/lib/refleksoloji/notesConcurrency");
  const { decideAtlasPut } = await import("@/lib/refleksoloji/atlasSyncCore");

  if (url === "/api/refleksoloji/notes") {
    const rows = serverNotes.get(tenant) ?? new Map<string, Snap>();
    serverNotes.set(tenant, rows);
    if (method === "GET") {
      const notes = [...rows.values()].map((r) => ({ ...(r.raw_json as object), baseUpdatedAt: r.updated_at }));
      return json({ ok: true, notes });
    }
    const body = JSON.parse(String(init?.body ?? "{}"));
    const prepared = prepareNoteSyncBatch(body);
    if (!prepared.ok) return json({ ok: false, error: prepared.error.message }, prepared.error.status);
    const r = await reconcileNoteSync(makeNotesStore(rows).store, prepared.valid, prepared.deletions, tick(), prepared.rejected);
    return json({ ok: r.conflicts === 0 && r.rejected === 0, ...r }, r.conflicts > 0 ? 409 : 200);
  }

  if (url === "/api/refleksoloji/atlas") {
    const cur = serverAtlas.get(tenant) ?? null;
    if (method === "GET") {
      return json({ ok: true, document: cur?.document ?? null, organ_list: cur?.organ_list ?? [], updated_at: cur?.updated_at ?? null });
    }
    const body = JSON.parse(String(init?.body ?? "{}"));
    const d = decideAtlasPut({
      current: cur,
      expected: typeof body.expected_updated_at === "string" ? body.expected_updated_at : null,
      incomingDocument: body.document ?? {},
      incomingOrganList: body.organ_list ?? [],
      allowEmpty: body.allow_empty === true,
    });
    if (d.kind === "conflict") return json({ ok: false, code: d.code }, 409);
    const updated_at = tick();
    serverAtlas.set(tenant, { updated_at, document: body.document ?? {}, organ_list: body.organ_list ?? [] });
    return json({ ok: true, updated_at });
  }
  return json({ ok: false }, 404);
}
(globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;

function makeNotesStore(rows: Map<string, Snap>) {
  let writes = 0;
  const store = {
    async getManyByUid(uids: string[]) {
      const m = new Map<string, Snap>();
      for (const u of uids) {
        const r = rows.get(u);
        if (r) m.set(u, r);
      }
      return m;
    },
    async casUpdate(uid: string, expected: string, fields: Record<string, unknown>, now: string) {
      const r = rows.get(uid);
      if (!r || r.updated_at !== expected) return null;
      writes++;
      const next = { updated_at: now, raw_json: fields.raw_json };
      rows.set(uid, next);
      return next;
    },
    async getByUid(uid: string) {
      return rows.get(uid) ?? null;
    },
    async createNote(uid: string, fields: Record<string, unknown>, now: string) {
      // P1-5: ON CONFLICT DO NOTHING (route ile aynı) — mevcut satır ezilmez.
      if (rows.has(uid)) return null;
      writes++;
      const next = { updated_at: now, raw_json: fields.raw_json };
      rows.set(uid, next);
      return next;
    },
    async deleteNote(uid: string, expected: string | null) {
      const r = rows.get(uid);
      if (r && (!expected || r.updated_at === expected)) {
        rows.delete(uid);
        writes++;
        return { deleted: 1, existsAfter: null };
      }
      return { deleted: 0, existsAfter: rows.get(uid) ?? null };
    },
  };
  return { store, writes: () => writes };
}

// ─── P1-5 (E3): gerçek route'lar için bellek-içi sahte Supabase (yalnız bu harness) ──
type DbRow = Record<string, unknown>;
class RouteDb {
  tables: Record<string, DbRow[]> = {};
  writes: string[] = [];
  from(table: string) {
    return new RouteQuery(this, table);
  }
}
class RouteQuery {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private preds: Array<(r: DbRow) => boolean> = [];
  private payload: DbRow | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private mode: "many" | "maybe" | "single" = "many";
  constructor(private db: RouteDb, private table: string) {}
  select() { return this; }
  insert(p: DbRow) { this.op = "insert"; this.payload = p; return this; }
  update(p: DbRow) { this.op = "update"; this.payload = p; return this; }
  upsert(p: DbRow, o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = "upsert"; this.payload = p; this.upsertOpts = o; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) {
    const [col, jsonKey] = c.split("->>");
    this.preds.push((r) => (jsonKey ? String((r[col] as DbRow | undefined)?.[jsonKey] ?? "") : r[col]) === v);
    return this;
  }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  private exec(): { data: unknown; error: unknown } {
    const rows = (this.db.tables[this.table] ??= []);
    let affected: DbRow[] = [];
    if (this.op === "insert") {
      const row = { id: `row-${rows.length + 1}`, ...this.payload };
      rows.push(row);
      affected = [row];
      this.db.writes.push(`insert:${this.table}`);
    } else if (this.op === "upsert") {
      const cols = (this.upsertOpts.onConflict ?? "id").split(",").map((x) => x.trim());
      const existing = rows.find((r) => cols.every((c) => r[c] === this.payload?.[c]));
      if (existing) {
        if (!this.upsertOpts.ignoreDuplicates) {
          Object.assign(existing, this.payload);
          affected = [existing];
          this.db.writes.push(`upsert-update:${this.table}`);
        }
      } else {
        const row = { id: `row-${rows.length + 1}`, ...this.payload };
        rows.push(row);
        affected = [row];
        this.db.writes.push(`upsert-insert:${this.table}`);
      }
    } else {
      affected = rows.filter((r) => this.preds.every((f) => f(r)));
      if (this.op === "update") {
        for (const r of affected) Object.assign(r, this.payload);
        if (affected.length) this.db.writes.push(`update:${this.table}`);
      }
      if (this.op === "delete") this.db.tables[this.table] = rows.filter((r) => !affected.includes(r));
    }
    const data = affected.map((r) => ({ ...r }));
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    if (this.mode === "single") return data[0] ? { data: data[0], error: null } : { data: null, error: { message: "no rows" } };
    return { data, error: null };
  }
  then<T>(res: (v: { data: unknown; error: unknown }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.exec()).then(res, rej);
  }
}

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const SVG = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
function att(dataUrl: string, mimeType: string, fileName = "a.png"): NoteAttachment {
  return { id: `att-${fileName}`, displayName: fileName, fileName, mimeType, size: 10, dataUrl };
}
function note(id: string, over: Record<string, unknown> = {}): SavedClinicalNote {
  return {
    id,
    title: `Not ${id}`,
    date: "2026-09-27",
    content: `içerik ${id}`,
    attachments: [] as NoteAttachment[],
    createdAt: "2026-09-27T09:00:00.000Z",
    updatedAt: "2026-09-27T09:00:00.000Z",
    ...over,
  } as SavedClinicalNote;
}

async function main(): Promise<void> {
  const { prepareNoteSyncBatch } = await import("@/lib/refleksoloji/notesSyncBatch");
  const { reconcileNoteSync } = await import("@/lib/refleksoloji/notesConcurrency");
  const { NOTE_LIMITS, checkNoteAttachmentFile, NOTE_ATTACHMENT_ACCEPT } = await import("@/lib/refleksoloji/notesValidation");
  const core = await import("@/lib/refleksoloji/notesClientCore");
  const scoped = await import("@/lib/refleksoloji/scopedStorage");
  const atlasCore = await import("@/lib/refleksoloji/atlasSyncCore");
  const protoCore = await import("@/lib/refleksoloji/protocolSyncCore");
  const { slugifyTr } = await import("@/lib/refleksoloji/slug");

  // ── A ────────────────────────────────────────────────────────────────────
  section("A. Not-başına doğrulama (FA-03)");
  {
    const prepared = prepareNoteSyncBatch({
      notes: [
        note("good", { attachments: [att(PNG, "image/png")], dirty: true, syncRejected: "x" }),
        note("svg", { attachments: [att(SVG, "image/svg+xml", "x.svg")] }),
        note("long", { title: "a".repeat(NOTE_LIMITS.MAX_TITLE_LEN + 1) }),
      ],
      deleted_uids: ["gone", { uid: "gone2", expected_updated_at: "V1" }],
    });
    ok("hazırlık ok (tüm batch 422 DEĞİL)", prepared.ok);
    if (prepared.ok) {
      ok("1 geçerli not", prepared.valid.length === 1 && prepared.valid[0].uid === "good");
      ok("2 reddedilen not (svg + uzun başlık)", prepared.rejected.length === 2);
      ok("red nedeni Türkçe", prepared.rejected.some((r) => /İzin verilmeyen dosya türü/.test(r.reason)));
      const raw = prepared.valid[0].fields.raw_json as Record<string, unknown>;
      ok("raw_json istemci bayraklarını taşımaz", !("dirty" in raw) && !("syncRejected" in raw) && !("baseUpdatedAt" in raw));
      ok("silmeler ayrıştırıldı", prepared.deletions.length === 2 && prepared.deletions[1].expectedUpdatedAt === "V1");

      const rows = new Map<string, Snap>();
      const s = makeNotesStore(rows);
      const r = await reconcileNoteSync(s.store, prepared.valid, [], "T1", prepared.rejected);
      ok("geçerli not oluşturuldu", r.results.some((x) => x.uid === "good" && x.outcome === "created"));
      ok("reddedilenler sonuçta 'rejected'", r.results.filter((x) => x.outcome === "rejected").length === 2 && r.rejected === 2);
      ok("reddedilen not DB'ye yazılmadı", !rows.has("svg") && !rows.has("long"));
    }
    const env = prepareNoteSyncBatch({ notes: Array.from({ length: NOTE_LIMITS.MAX_NOTES + 1 }, (_, i) => note(`n${i}`)) });
    ok("not sayısı zarfı aşımı → 413", !env.ok && env.error.status === 413);

    // Değişmemiş not yazılmaz
    const rows = new Map<string, Snap>([["same", { updated_at: "V5", raw_json: note("same") }]]);
    const s = makeNotesStore(rows);
    const p2 = prepareNoteSyncBatch({ notes: [note("same", { baseUpdatedAt: "V5", updatedAt: "2026-09-27T12:00:00.000Z" })] });
    if (p2.ok) {
      const r2 = await reconcileNoteSync(s.store, p2.valid, [], "T2");
      ok("aynı içerik + aynı base → 'unchanged'", r2.results[0]?.outcome === "unchanged");
      ok("unchanged → hiçbir satır yeniden yazılmadı", s.writes() === 0 && rows.get("same")?.updated_at === "V5");
    }
    const p3 = prepareNoteSyncBatch({ notes: [note("same", { baseUpdatedAt: "V5", content: "yeni" })] });
    if (p3.ok) {
      const r3 = await reconcileNoteSync(s.store, p3.valid, [], "T3");
      ok("içerik değişti → CAS 'updated'", r3.results[0]?.outcome === "updated" && s.writes() === 1);
    }

    ok("istemci ön-kontrol: svg reddedilir", !checkNoteAttachmentFile({ name: "x.svg", type: "image/svg+xml", size: 10 }).ok);
    ok("istemci ön-kontrol: docx reddedilir", !checkNoteAttachmentFile({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 }).ok);
    const heic = checkNoteAttachmentFile({ name: "foto.HEIC", type: "", size: 10 });
    ok("istemci ön-kontrol: türsüz HEIC uzantıdan çözülür", heic.ok && heic.mime === "image/heic");
    ok("istemci ön-kontrol: 5MB → Türkçe boyut hatası", (() => {
      const r = checkNoteAttachmentFile({ name: "b.pdf", type: "application/pdf", size: 5 * 1024 * 1024 });
      return !r.ok && /en fazla 4 MB/.test(r.message);
    })());
    ok("accept listesi görsel+pdf, svg yok", /\.pdf/.test(NOTE_ATTACHMENT_ACCEPT) && !/svg/.test(NOTE_ATTACHMENT_ACCEPT));
  }

  // ── B ────────────────────────────────────────────────────────────────────
  section("B. İstemci çekirdeği: tombstone/outbox birleştirme");
  {
    type N = import("@/app/refleksoloji/notlar/types").SavedClinicalNote;
    const L = (id: string, o: Partial<N> = {}) => note(id, o) as unknown as N;
    const local: N[] = [
      L("synced-clean", { baseUpdatedAt: "S1" }),
      L("remote-deleted", { baseUpdatedAt: "S2" }),
      L("never-synced", { dirty: true }),
      L("dirty-local", { baseUpdatedAt: "S3", dirty: true, content: "yerel düzenleme" }),
      L("remote-deleted-dirty", { baseUpdatedAt: "S4", dirty: true }),
    ];
    const server: N[] = [
      L("synced-clean", { baseUpdatedAt: "S1b", content: "sunucu yeni" }),
      L("dirty-local", { baseUpdatedAt: "S3" }),
      L("tombstoned", { baseUpdatedAt: "S9" }),
    ];
    const merged = core.mergeNotesWithServer(local, server, new Set(["tombstoned"]));
    const ids = merged.map((n) => n.id);
    ok("outbox'taki (silinmiş) not dirilmez", !ids.includes("tombstoned"));
    ok("base'li + temiz + sunucuda yok → düşer (uzaktan silinmiş)", !ids.includes("remote-deleted"));
    ok("hiç senkronlanmamış not korunur", ids.includes("never-synced"));
    ok("kirli yerel not sunucu sürümünü ezmez, korunur", merged.find((n) => n.id === "dirty-local")?.content === "yerel düzenleme");
    ok("temiz not sunucu sürümüne güncellenir", merged.find((n) => n.id === "synced-clean")?.content === "sunucu yeni");
    const rdd = merged.find((n) => n.id === "remote-deleted-dirty");
    ok("uzaktan silinmiş ama kirli → düzenleme korunur, base düşer", !!rdd && !rdd.baseUpdatedAt && rdd.dirty === true);

    const push = core.selectNotesToPush([
      L("a", { dirty: true }),
      L("b"),
      L("c", { dirty: true, syncRejected: "bozuk" }),
    ]);
    ok("yalnız kirli + reddedilmemiş push edilir", push.length === 1 && push[0].id === "a");
    ok("gönderim biçiminde bayrak yok", !("dirty" in core.toWireNote(L("a", { dirty: true }))));

    const sent = new Map([["a", "2026-09-27T09:00:00.000Z"], ["c", "old-version"]]);
    const applied = core.applySyncResults(
      [L("a", { dirty: true }), L("c", { dirty: true }), L("r", { dirty: true })],
      [{ uid: "x", expected_updated_at: null, queuedAt: "t" }, { uid: "y", expected_updated_at: "Y1", queuedAt: "t" }],
      [
        { uid: "a", outcome: "created", updated_at: "V1" },
        { uid: "c", outcome: "updated", updated_at: "V2" },
        { uid: "r", outcome: "rejected", reason: "İzin verilmeyen dosya türü" },
        { uid: "x", outcome: "deleted" },
        { uid: "y", outcome: "delete-conflict", server_updated_at: "Y2", server: note("y") },
      ],
      new Map([...sent, ["r", "2026-09-27T09:00:00.000Z"]]),
      (raw) => raw as N,
    );
    const byId = new Map(applied.notes.map((n) => [n.id, n]));
    ok("created → base set + kirli temizlendi", byId.get("a")?.baseUpdatedAt === "V1" && !byId.get("a")?.dirty);
    ok("uçuşta yeniden düzenlenen not KİRLİ kalır", byId.get("c")?.dirty === true && byId.get("c")?.baseUpdatedAt === "V2");
    ok("rejected → rozet nedeni işaretlendi", byId.get("r")?.syncRejected === "İzin verilmeyen dosya türü");
    ok("deleted → outbox'tan çıktı", !applied.outbox.some((d) => d.uid === "x"));
    ok("delete-conflict → sunucu sürümü geri yüklendi", byId.get("y")?.baseUpdatedAt === "Y2" && !applied.outbox.some((d) => d.uid === "y"));
  }

  // ── C ────────────────────────────────────────────────────────────────────
  section("C. Uçtan uca: outbox + yeniden yükleme + A≠B + çıkış");
  const noteStorage = await import("@/app/refleksoloji/notlar/lib/noteStorage");
  const notesSync = await import("@/app/refleksoloji/notlar/lib/notesSync");
  const { resetReflexologyRuntime } = await import("@/lib/refleksoloji/runtimeReset");
  const { clearYasamUser } = await import("@/lib/auth/yasamUser");
  const { getReflexologySyncStatus } = await import("@/lib/refleksoloji/syncStatus");
  {
    login("A");
    const n1 = { ...note(noteStorage.newNoteId()), dirty: true };
    const bad = { ...note(noteStorage.newNoteId(), { attachments: [att(SVG, "image/svg+xml", "x.svg")] }), dirty: true };
    ok("yeni not kimliği UUID", /^[0-9a-f-]{36}$/.test(n1.id));
    notesSync.saveNotesAndSync([n1, bad]);
    const out = await notesSync.flushNotesNow();
    const aRows = serverNotes.get("tenant-a")!;
    ok("geçerli not sunucuya ulaştı (bozuk not batch'i düşürmedi)", aRows.has(n1.id));
    ok("bozuk not sunucuda yok", !aRows.has(bad.id));
    ok("flush sonucu 'rejected' durumu", out.status === "rejected");
    const localA = noteStorage.loadNotesFromStorage();
    ok("bozuk not rozetle işaretli + kirli", !!localA.find((n) => n.id === bad.id)?.syncRejected);
    ok("geçerli not temiz + base'li", !!localA.find((n) => n.id === n1.id && n.baseUpdatedAt && !n.dirty));
    ok("sync rozeti hata mesajı Türkçe", /eşitlenemedi/.test(getReflexologySyncStatus().message));

    // İkinci flush: yalnız kirli notlar gider (temiz not yeniden yazılmaz, reddedilen tekrar gönderilmez)
    requestLog.length = 0;
    const out2 = await notesSync.flushNotesNow();
    ok("bekleyen iş yok → istek atılmaz (noop)", out2.status === "noop" && requestLog.length === 0);

    // Çevrimdışı silme → kalıcı outbox
    offline = true;
    const del = await notesSync.deleteNoteWithSync(n1.id);
    ok("çevrimdışı silme → 'queued' + Türkçe mesaj", del.ok && del.state === "queued" && /bağlantı/.test(del.message ?? ""));
    ok("outbox KALICI (localStorage'da)", noteStorage.loadNotesOutbox().some((d) => d.uid === n1.id));
    ok("sunucuda hâlâ var (henüz silinmedi)", aRows.has(n1.id));

    // "Sayfa yenileme" simülasyonu: modül durumu sıfır, sunucu GET notu hâlâ döndürüyor
    resetReflexologyRuntime();
    offline = false;
    await notesSync.hydrateAndMergeNotes();
    ok("yeniden yüklemede silinen not DİRİLMEDİ", !noteStorage.loadNotesFromStorage().some((n) => n.id === n1.id));
    await sleep(800); // hydrate sonrası bekleyen outbox gönderilir
    ok("bağlantı gelince silme sunucuya ulaştı", !aRows.has(n1.id));
    ok("outbox boşaldı", noteStorage.loadNotesOutbox().length === 0);

    // Sunucu-önce silme (çevrimiçi)
    const n2 = { ...note(noteStorage.newNoteId()), dirty: true };
    notesSync.saveNotesAndSync([...noteStorage.loadNotesFromStorage(), n2]);
    await notesSync.flushNotesNow();
    const del2 = await notesSync.deleteNoteWithSync(n2.id);
    ok("çevrimiçi silme → sunucu onayı 'deleted'", del2.ok && del2.state === "deleted" && !aRows.has(n2.id));

    // Kapsam A≠B
    const aKey = scoped.scopedKey({ tenantId: "tenant-a", userId: "user-a" }, "notes");
    const bKey = scoped.scopedKey({ tenantId: "tenant-b", userId: "user-b" }, "notes");
    ok("kapsamlı anahtar biçimi", aKey === "refleks:v2:tenant-a:user-a:notes");
    ok("A ve B anahtarları farklı", aKey !== bKey);
    login("B");
    ok("B, A'nın notlarını GÖRMEZ", noteStorage.loadNotesFromStorage().length === 0);
    ok("A'nın verisi kendi anahtarında duruyor", ls.getItem(aKey) !== null);

    // Çıkış: runtime reset — bekleyen debounce PUT'u iptal edilir
    login("A");
    notesSync.saveNotesAndSync([...noteStorage.loadNotesFromStorage(), { ...note(noteStorage.newNoteId()), dirty: true }]);
    requestLog.length = 0;
    clearYasamUser(); // 500ms debounce içinde çıkış
    await sleep(800);
    ok("çıkış sonrası bekleyen not PUT'u GİTMEDİ (runtime reset)", !requestLog.some((r) => r === "PUT /api/refleksoloji/notes"));
    ok("bekleyen iş varken A önbelleği SİLİNMEDİ (veri kaybı yok)", ls.getItem(aKey) !== null);
    ok("oturum anahtarları temizlendi", ls.getItem("yasam_user") === null);

    // Bekleyen iş yoksa önbellek temizlenir
    login("C");
    const nc = { ...note(noteStorage.newNoteId()), dirty: true };
    notesSync.saveNotesAndSync([nc]);
    await notesSync.flushNotesNow();
    const cKey = scoped.scopedKey({ tenantId: "tenant-c", userId: "user-c" }, "notes");
    ok("C notu senkron", serverNotes.get("tenant-c")?.has(nc.id) === true && ls.getItem(cKey) !== null);
    clearYasamUser();
    ok("bekleyen iş yok → C v2 önbelleği çıkışta temizlendi", ls.getItem(cKey) === null);
    ok("sync rozeti sıfırlandı", getReflexologySyncStatus().state === "idle");

    // Demo: çıkışta koşulsuz temizlik; eski v1 anahtarlarına dokunulmaz
    ls.setItem("yasam-refleksoloji-notlar-v1", JSON.stringify([note("legacy-keep")]));
    login("B", { is_demo_account: true });
    noteStorage.saveNotesToStorage([{ ...note("demo-note"), dirty: true }]);
    clearYasamUser();
    ok("demo çıkışı: demo v2 verisi temizlendi", ls.getItem(bKey) === null);
    ok("demo çıkışı: sahipsiz eski v1 anahtarı SİLİNMEDİ", ls.getItem("yasam-refleksoloji-notlar-v1") !== null);
    ls.removeItem("yasam-refleksoloji-notlar-v1");

    // Kapsamsız (tenant yok) → bellek-içi, senkron yok
    ls.setItem("yasam_user", JSON.stringify({ id: "no-tenant", role: "expert" }));
    ls.setItem("yasam_session_token", "tok-x");
    noteStorage.saveNotesToStorage([note("mem-only")]);
    ok("tenant yoksa localStorage'a yazılmaz (bellek-içi)", !ls.keys().some((k) => k.includes("mem-only") || k.startsWith("refleks:v2:") && k.includes("no-tenant")));
    const { isReflexSyncEligible } = await import("@/lib/refleksoloji/reflexStore");
    ok("tenant yoksa senkron uygun değil", !isReflexSyncEligible());
    clearYasamUser();
  }

  // ── D ────────────────────────────────────────────────────────────────────
  section("D. Eski (v1) notlar: kanıtlı benimseme + karantina (otomatik silme YOK)");
  {
    type N = import("@/app/refleksoloji/notlar/types").SavedClinicalNote;
    const L = (id: string, o: Partial<N> = {}) => note(id, o) as unknown as N;
    const cls = core.classifyLegacyNotes(
      [
        L("same", { baseUpdatedAt: "S1" }),
        L("edited", { baseUpdatedAt: "S2", content: "eşitlenmemiş düzenleme" }),
        L("never"),
        L("elsewhere", { baseUpdatedAt: "Z1" }),
        L("slug-collide", { content: "başka not" }),
      ],
      [L("same", { baseUpdatedAt: "S1" }), L("edited", { baseUpdatedAt: "S2" }), L("slug-collide", { baseUpdatedAt: "Q1" })],
    );
    ok("aynı içerik → identical", cls.identical.map((n) => n.id).includes("same"));
    ok("id+base eşleşen + düzenlenmiş → adopt (kirli)", cls.adopt.length === 1 && cls.adopt[0].id === "edited" && cls.adopt[0].dirty === true);
    ok("hiç senkronlanmamış → karantina", cls.quarantine.some((n) => n.id === "never"));
    ok("aynı id farklı içerik (kanıt yok) → karantina", cls.quarantine.some((n) => n.id === "slug-collide"));
    ok("başka sunucuda senkronlu → bırak (silme yok)", cls.leave.length === 1 && cls.leave[0].id === "elsewhere");

    // Uçtan uca
    serverNotes.set("tenant-a", new Map([["same", { updated_at: "S1", raw_json: note("same") }], ["edited", { updated_at: "S2", raw_json: note("edited") }]]));
    ls.setItem(
      scoped.LEGACY_REFLEX_KEYS.notes,
      JSON.stringify([
        note("same", { baseUpdatedAt: "S1" }),
        note("edited", { baseUpdatedAt: "S2", content: "eşitlenmemiş düzenleme" }),
        note("never", { content: "422 yüzünden hiç gitmedi" }),
        note("elsewhere", { baseUpdatedAt: "Z1" }),
      ]),
    );
    login("A");
    const r = await notesSync.hydrateAndMergeNotes();
    ok("karantina sayısı 1", r?.quarantineCount === 1);
    const local = noteStorage.loadNotesFromStorage();
    ok("kanıtlı düzenleme benimsendi (kirli)", local.find((n) => n.id === "edited")?.content === "eşitlenmemiş düzenleme");
    ok("karantinadaki not OTOMATİK yüklenmedi", !local.some((n) => n.id === "never"));
    const legacyLeft = JSON.parse(ls.getItem(scoped.LEGACY_REFLEX_KEYS.notes) ?? "[]") as Array<{ id: string }>;
    ok("eski anahtarda yalnız 'bırak' kaydı kaldı (silinmedi)", legacyLeft.length === 1 && legacyLeft[0].id === "elsewhere");
    ok("karantina anahtarında 'never' duruyor", (ls.getItem(scoped.LEGACY_QUARANTINE_KEYS.notes) ?? "").includes("422 yüzünden"));
    await sleep(800);
    ok("benimsenen düzenleme CAS ile sunucuya gitti", (serverNotes.get("tenant-a")!.get("edited")?.raw_json as { content?: string })?.content === "eşitlenmemiş düzenleme");

    // Açık kullanıcı kararı: içe aktar → yeni kimlikle
    const imp = notesSync.importQuarantinedNotesToAccount();
    ok("içe aktar: 1 not", imp.ok && imp.imported === 1);
    const imported = noteStorage.loadNotesFromStorage().find((n) => n.content === "422 yüzünden hiç gitmedi");
    ok("içe aktarılan not YENİ UUID + kirli", !!imported && imported.id !== "never" && imported.dirty === true);
    ok("karantina boşaldı", ls.getItem(scoped.LEGACY_QUARANTINE_KEYS.notes) === null);
    await notesSync.flushNotesNow();
    ok("içe aktarılan not sunucuya ulaştı", !!imported && serverNotes.get("tenant-a")!.has(imported.id));
    clearYasamUser();
  }

  // ── E ────────────────────────────────────────────────────────────────────
  section("E. Atlas: hash, boş push, sunucu 409, açılışta PUT yok, karantina");
  {
    const region = { id: "r1", shape: "oval", cx: 0.3, cy: 0.4, rx: 0.05, ry: 0.05, angle: 0 };
    const entry = (sol: unknown[] = [region]) => ({ taban: { sol, sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } });
    const docA = { _meta: { version: "1", updated_at: "2026-01-01T00:00:00.000Z" }, Mide: entry() };
    const docB = { _meta: { version: "1", updated_at: "2026-09-27T00:00:00.000Z" }, Mide: entry() };
    ok("hash _meta.updated_at'i YOK SAYAR", atlasCore.atlasContentHash(docA, ["Mide"]) === atlasCore.atlasContentHash(docB, ["Mide"]));
    ok("hash bölge değişimini yakalar", atlasCore.atlasContentHash(docA, ["Mide"]) !== atlasCore.atlasContentHash({ ...docA, Mide: entry([{ ...region, cx: 0.5 }]) }, ["Mide"]));
    ok("hash organ listesi sırasından bağımsız", atlasCore.atlasContentHash(docA, ["A", "B"]) === atlasCore.atlasContentHash(docA, ["B", "A"]));

    const empty = { _meta: { version: "1", updated_at: "x" } };
    ok("boş + mezar taşsız belge → GÖNDERİLMEZ", atlasCore.planAtlasPush(empty, [], null).send === false);
    const deletedAll = { _meta: { version: "1", updated_at: "x", tombstones: { mide: "2026-09-27T00:00:00.000Z" } } };
    const planDel = atlasCore.planAtlasPush(deletedAll, [], null);
    ok("bilinçli son-organ silme → allow_empty ile gönderilir", planDel.send === true && planDel.allowEmpty === true);
    const h = atlasCore.atlasContentHash(docA, ["Mide"]);
    ok("içerik tabanla aynı → gönderilmez", atlasCore.planAtlasPush(docB, ["Mide"], h).send === false);

    const cur = { updated_at: "U1", document: docA, organ_list: ["Mide"] };
    const base = { incomingDocument: docA, incomingOrganList: ["Mide"], allowEmpty: false };
    ok("satır yok → insert", atlasCore.decideAtlasPut({ current: null, expected: null, ...base }).kind === "insert");
    const d1 = atlasCore.decideAtlasPut({ current: cur, expected: null, ...base });
    ok("satır var + expected null → 409 ATLAS_BASE_REQUIRED", d1.kind === "conflict" && d1.code === "ATLAS_BASE_REQUIRED");
    const d2 = atlasCore.decideAtlasPut({ current: cur, expected: "U0", ...base });
    ok("stale expected → 409 ATLAS_STALE", d2.kind === "conflict" && d2.code === "ATLAS_STALE");
    const d3 = atlasCore.decideAtlasPut({ current: cur, expected: "U1", incomingDocument: empty, incomingOrganList: [], allowEmpty: false });
    ok("dolu → boş (allow_empty yok) → 409 ATLAS_EMPTY_OVERWRITE", d3.kind === "conflict" && d3.code === "ATLAS_EMPTY_OVERWRITE");
    ok("dolu → boş (allow_empty) → update", atlasCore.decideAtlasPut({ current: cur, expected: "U1", incomingDocument: deletedAll, incomingOrganList: [], allowEmpty: true }).kind === "update");
    ok("doğru expected → update", atlasCore.decideAtlasPut({ current: cur, expected: "U1", ...base }).kind === "update");

    // Uçtan uca: açılışta PUT yok
    const atlasStorage = await import("@/lib/atlasStorage");
    const atlasSync = await import("@/lib/refleksolojiAtlasSync");
    serverAtlas.set("tenant-a", { updated_at: "U1", document: docA, organ_list: ["Mide"] });
    login("A");
    requestLog.length = 0;
    atlasSync.scheduleAtlasSync(); // hidrasyon ÖNCESİ planlama
    await sleep(800);
    ok("hidrasyon bitmeden PUT gitmez", !requestLog.some((r) => r.startsWith("PUT /api/refleksoloji/atlas")));
    await atlasStorage.hydrateAndMergeAtlas();
    await sleep(800);
    ok("açılış/hidrasyon sonrası otomatik PUT YOK (içerik aynı)", !requestLog.some((r) => r.startsWith("PUT /api/refleksoloji/atlas")));
    ok("hidrasyon sunucu belgesini yerele getirdi", atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas()).includes("Mide"));

    // Kullanıcı eylemi → PUT (expected = sunucu sürümü)
    const withKalp = { ...atlasStorage.loadAtlas(), Kalp: entry([{ ...region, id: "r2" }]) } as ReturnType<typeof atlasStorage.loadAtlas>;
    atlasStorage.saveAtlas(withKalp);
    await sleep(800);
    ok("kullanıcı eylemi → tek PUT gönderildi", requestLog.filter((r) => r.startsWith("PUT /api/refleksoloji/atlas")).length === 1);
    ok("sunucu yeni organı aldı (CAS geçti)", Object.keys((serverAtlas.get("tenant-a")!.document as object)).includes("Kalp"));
    requestLog.length = 0;
    await atlasStorage.hydrateAndMergeAtlas();
    await sleep(800);
    ok("ikinci açılışta da PUT yok", !requestLog.some((r) => r.startsWith("PUT")));

    // Eski (v1) atlas: kanıtlanamayan organ → karantina, otomatik yükleme yok
    ls.setItem(scoped.LEGACY_REFLEX_KEYS.atlas, JSON.stringify({ _meta: { version: "1", updated_at: "x" }, Dalak: entry([{ ...region, id: "legacy-r" }]) }));
    ls.setItem(scoped.LEGACY_REFLEX_KEYS.organs, JSON.stringify(["Dalak"]));
    const hr = await atlasStorage.hydrateAndMergeAtlas();
    ok("eski atlas karantinaya alındı (1 organ)", hr?.quarantineCount === 1);
    ok("karantinadaki organ hesaba OTOMATİK eklenmedi", !atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas()).includes("Dalak"));
    ok("eski v1 anahtarları (karantinaya taşındıktan sonra) kaldırıldı", ls.getItem(scoped.LEGACY_REFLEX_KEYS.atlas) === null);
    requestLog.length = 0;
    const imp = atlasStorage.importQuarantinedAtlasToAccount();
    await sleep(800);
    ok("açık içe aktarma → organ eklendi + PUT", imp.ok && atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas()).includes("Dalak") && requestLog.some((r) => r.startsWith("PUT")));
    ok("sunucu mevcut organları korudu (Mide/Kalp)", ["Mide", "Kalp", "Dalak"].every((k) => Object.keys(serverAtlas.get("tenant-a")!.document as object).includes(k)));

    // Sunucuyla birebir aynı eski atlas → karantinasız bırakılır
    ok(
      "eski atlas sunucuyla aynı → 'identical' (karantina yok)",
      atlasCore.classifyLegacyAtlas({ document: docA, organ_list: ["Mide"] }, { document: docB, organ_list: ["Mide"] }) === "identical",
    );
    // Boş/hidrasyonsuz belge sunucuyu ezmez (istemci kuralı)
    ls.removeItem(scoped.scopedKey({ tenantId: "tenant-a", userId: "user-a" }, "atlas"));
    ls.removeItem(scoped.scopedKey({ tenantId: "tenant-a", userId: "user-a" }, "organs"));
    requestLog.length = 0;
    await atlasSync.flushAtlasNow();
    ok("boş yerel atlas → PUT yok (sunucu ezilmez)", !requestLog.some((r) => r.startsWith("PUT")));
    clearYasamUser();
  }

  // ── E2 ───────────────────────────────────────────────────────────────────
  section("E2. P1-5 Atlas lost update: base snapshot + 3-yollu birleştirme + çakışma");
  {
    const atlasStorage = await import("@/lib/atlasStorage");
    const atlasSync = await import("@/lib/refleksolojiAtlasSync");
    const mergeLib = await import("@/lib/refleksoloji/atlasMerge");
    type Doc = ReturnType<typeof atlasStorage.loadAtlas>;
    const reg = (id: string, cx = 0.3) => ({ id, shape: "oval", cx, cy: 0.4, rx: 0.05, ry: 0.05, angle: 0 });
    const ent = (...rs: unknown[]) => ({ taban: { sol: rs, sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } });
    const draft = (id: string, organ: string, cx = 0.5) =>
      ({ id, organ, footSide: "left", view: "taban", shape: "oval", cx, cy: 0.5, rx: 0.05, ry: 0.05 }) as never;
    const ids = (doc: unknown, organ: string) =>
      atlasStorage.getRegionsForOrgan(doc as Doc, organ).map((r) => r.id).sort().join(",");
    const putCount = () => requestLog.filter((r) => r.startsWith("PUT /api/refleksoloji/atlas")).length;
    const srv = () => serverAtlas.get("tenant-c")!;
    const srvDoc = () => srv().document as Record<string, unknown>;
    /** B cihazı: sunucu belgesini doğrudan değiştirir (sürüm ilerler). */
    const deviceB = (mut: (doc: Record<string, unknown>) => void, organs?: string[]) => {
      const cur = structuredClone(srv());
      mut(cur.document as Record<string, unknown>);
      serverAtlas.set("tenant-c", { updated_at: tick(), document: cur.document, organ_list: organs ?? cur.organ_list });
    };
    const T0 = "2026-09-27T09:00:00.000Z";
    serverAtlas.set("tenant-c", {
      updated_at: "C1",
      document: { _meta: { version: "1", updated_at: T0, tombstones: {}, organUpdatedAt: { mide: T0, kalp: T0 } }, Mide: ent(reg("m1")), Kalp: ent(reg("k1")) },
      organ_list: ["Kalp", "Mide"],
    });
    login("C");
    const changedEvents: number[] = [];
    win.addEventListener(atlasStorage.ATLAS_CHANGED_EVENT, () => changedEvents.push(Date.now()));
    await atlasStorage.hydrateAndMergeAtlas();
    ok("hidrasyon: base belgesi saklandı (3-yollu birleştirme tabanı)", ids(atlasSync.loadAtlasBase()?.doc, "Mide") === "m1");

    // (a) normal kaydet → 200 + base güncel
    requestLog.length = 0;
    atlasStorage.saveAtlas(atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [draft("m2", "Mide")], []));
    const ra = await atlasSync.flushAtlasNow();
    const baseA = atlasSync.loadAtlasBase();
    ok("(a) normal kaydet → PUT 200 (tek istek)", ra.status === "ok" && putCount() === 1);
    ok("(a) base güncel: updated_at = sunucu sürümü, belge = gönderilen", baseA?.updated_at === srv().updated_at && ids(baseA?.doc, "Mide") === "m1,m2");

    // (b) stale: B sunucuda Kalp'i değiştirir + Dalak ekler; A yalnız Mide'yi değiştirir
    deviceB((d) => {
      d.Kalp = ent(reg("k1"), reg("k2"));
      d.Dalak = ent(reg("d1"));
    }, ["Dalak", "Kalp", "Mide"]);
    const staleHookState = atlasStorage.loadAtlas(); // (f) için: bayat hook state (Dalak YOK)
    changedEvents.length = 0;
    requestLog.length = 0;
    atlasStorage.saveAtlas(atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [draft("m3", "Mide")], []));
    const rb = await atlasSync.flushAtlasNow();
    ok("(b) stale PUT → 409 → çakışmasız birleşme → TEK otomatik retry → ok", rb.status === "ok" && putCount() === 2);
    ok("(b) sunucuda A+B birlikte: Mide(A) + Kalp(B) + Dalak(B)", ids(srvDoc(), "Mide") === "m1,m2,m3" && ids(srvDoc(), "Kalp") === "k1,k2" && ids(srvDoc(), "Dalak") === "d1");
    ok("(b) yerel: A'nın organı korundu + B'nin organları alındı", ids(atlasStorage.loadAtlas(), "Mide") === "m1,m2,m3" && ids(atlasStorage.loadAtlas(), "Dalak") === "d1");
    ok("(b) organ listesi birleşti (Dalak)", atlasStorage.loadOrganList().includes("Dalak") && srv().organ_list.includes("Dalak"));
    ok("(b) çakışma yok + durum 'synced'", atlasSync.getAtlasConflict() === null && getReflexologySyncStatus().state === "synced");

    // (f) bayat hook state sunucu-only organları düşürmez
    ok("(f) birleştirme 'refleks:atlas-changed' yayınladı (hook state yeniden yüklenir)", changedEvents.length >= 1);
    ok("(f) eski davranış (bayat state'e taslak) Dalak'ı DÜŞÜRÜRDÜ — kontrol", ids(atlasStorage.mergeDraftIntoAtlas(staleHookState, [draft("m5", "Mide")], []), "Dalak") === "");
    const fresh = atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [draft("m5", "Mide")], []);
    ok("(f) depodan güncel atlasa taslak → Dalak korunur", ids(fresh, "Dalak") === "d1" && ids(fresh, "Mide").includes("m5"));
    const hookSrc = fs.readFileSync(path.join(process.cwd(), "app/refleksoloji/bolge-haritasi/hooks/useAtlasWorkspace.ts"), "utf8");
    ok("(f) hook: handleSave loadAtlas() üzerinden + atlas-changed dinleyicisi", /mergeDraftIntoAtlas\(loadAtlas\(\)/.test(hookSrc) && /addEventListener\(ATLAS_CHANGED_EVENT/.test(hookSrc));

    // (c) aynı organ iki cihazda farklı → çakışma; yerel bozulmaz; otomatik PUT yok
    deviceB((d) => {
      d.Mide = ent(reg("m1"), reg("mB"));
    });
    const serverMideB = ids(srvDoc(), "Mide");
    requestLog.length = 0;
    atlasStorage.saveAtlas(atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [draft("m4", "Mide")], []));
    const rc = await atlasSync.flushAtlasNow();
    await sleep(800);
    ok("(c) çakışma → status 'conflict', otomatik retry YOK (tek PUT)", rc.status === "conflict" && putCount() === 1);
    ok("(c) çakışma mesajı birebir", getReflexologySyncStatus().state === "conflict" && getReflexologySyncStatus().message === atlasSync.ATLAS_CONFLICT_MESSAGE);
    ok("(c) çakışan organ listesi = [Mide]", JSON.stringify(atlasSync.getAtlasConflict()?.organs) === JSON.stringify(["Mide"]));
    ok("(c) yerel Mide BOZULMADI (A'nın sürümü)", ids(atlasStorage.loadAtlas(), "Mide") === "m1,m2,m3,m4");
    ok("(c) sunucu Mide B'nin sürümü (ezilmedi)", ids(srvDoc(), "Mide") === serverMideB);
    // yeniden yükleme: çakışma kalıcı (taban ilerletilmedi) — yine otomatik PUT yok
    requestLog.length = 0;
    await atlasStorage.hydrateAndMergeAtlas();
    await sleep(800);
    ok("(c) yeniden yüklemede çakışma yeniden tespit edilir, yerel korunur, PUT yok",
      atlasSync.getAtlasConflict()?.organs.includes("Mide") === true && ids(atlasStorage.loadAtlas(), "Mide") === "m1,m2,m3,m4" && putCount() === 0);
    // "Benim sürümümü gönder" → taze expected ile PUT
    requestLog.length = 0;
    const pushed = await atlasStorage.pushLocalAtlasVersion();
    ok("(c) 'Benim sürümümü gönder' → taze expected ile tek PUT başarılı", pushed === true && putCount() === 1 && ids(srvDoc(), "Mide") === "m1,m2,m3,m4");
    ok("(c) çözüm sonrası çakışma temiz + synced", atlasSync.getAtlasConflict() === null && getReflexologySyncStatus().state === "synced");

    // "Sunucu sürümünü al": Kalp'te çakışma; yerel-özel (çakışmasız) yeni organ yine gönderilir
    deviceB((d) => {
      d.Kalp = ent(reg("kB"));
    });
    atlasStorage.saveAtlas(atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [draft("kA", "Kalp"), draft("b1", "Böbrek")], []));
    await atlasSync.flushAtlasNow();
    ok("(c2) Kalp çakışması tespit edildi", atlasSync.getAtlasConflict()?.organs.includes("Kalp") === true);
    const adopted = await atlasStorage.adoptServerAtlasVersion();
    ok("(c2) 'Sunucu sürümünü al' → yerel Kalp = sunucu (B)", adopted === true && ids(atlasStorage.loadAtlas(), "Kalp") === "kB");
    ok("(c2) çakışmasız yerel değişiklik (Böbrek) korunup sunucuya gitti", ids(srvDoc(), "Böbrek") === "b1" && ids(srvDoc(), "Kalp") === "kB");

    // (d) taze (stale olmayan) PUT → doğrudan 200
    requestLog.length = 0;
    atlasStorage.saveAtlas(atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [draft("m6", "Mide")], []));
    const rd = await atlasSync.flushAtlasNow();
    ok("(d) taze PUT → 200, tek istek, GET yok", rd.status === "ok" && putCount() === 1 && !requestLog.some((r) => r.startsWith("GET")));

    // (e) çevrimdışı düzenleme + yeniden yükleme → kayıp yok
    offline = true;
    atlasStorage.saveAtlas(atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [draft("m9", "Mide")], []));
    const re1 = await atlasSync.flushAtlasNow();
    const reh = await atlasStorage.hydrateAndMergeAtlas();
    ok("(e) çevrimdışı: PUT başarısız, hidrasyon null, yerel m9 duruyor", re1.status !== "ok" && reh === null && ids(atlasStorage.loadAtlas(), "Mide").includes("m9"));
    offline = false;
    deviceB((d) => {
      d.Dalak = ent(reg("d1"), reg("d2"));
    });
    requestLog.length = 0;
    await atlasStorage.hydrateAndMergeAtlas(); // "sayfa yenileme" (çevrim içi)
    await sleep(800);
    ok("(e) yeniden yükleme yerel çevrimdışı düzenlemeyi EZMEDİ (m9) + B'nin değişikliği alındı",
      ids(atlasStorage.loadAtlas(), "Mide").includes("m9") && ids(atlasStorage.loadAtlas(), "Dalak") === "d1,d2");
    ok("(e) açılışta otomatik PUT yok (FA-13); eşitlenmemiş uyarısı", putCount() === 0 && getReflexologySyncStatus().state === "conflict");
    await atlasSync.flushAtlasNow();
    ok("(e) kullanıcı 'yeniden dene' → sunucu m9 + d2'yi birlikte taşır", ids(srvDoc(), "Mide").includes("m9") && ids(srvDoc(), "Dalak") === "d1,d2");

    // (e2) belgesiz eski taban (önceki sürüm istemci) → LWW; kaybeden yerel yedeklenir
    const scopeC = { tenantId: "tenant-c", userId: "user-c" };
    const baseKey = scoped.scopedKey(scopeC, "atlas-base");
    const legacyBase = JSON.parse(ls.getItem(baseKey) ?? "{}") as Record<string, unknown>;
    ls.setItem(baseKey, JSON.stringify({ updated_at: legacyBase.updated_at, hash: "eski-hash" }));
    const localNow = atlasStorage.loadAtlas();
    const lMeta = localNow._meta as { organUpdatedAt?: Record<string, string> };
    lMeta.organUpdatedAt = { ...(lMeta.organUpdatedAt ?? {}), kalp: "2026-01-01T00:00:00.000Z" };
    (localNow as Record<string, unknown>).Kalp = ent(reg("kLocalOld"));
    scoped.writeScopedJson(scopeC, "atlas", localNow);
    deviceB((d) => {
      d.Kalp = ent(reg("kServerNew"));
      (d._meta as { organUpdatedAt: Record<string, string> }).organUpdatedAt.kalp = "2026-09-30T00:00:00.000Z";
    });
    await atlasStorage.hydrateAndMergeAtlas();
    const backup = atlasStorage.loadAtlasConflictBackup();
    ok("(e2) base belgesi yok → LWW: sunucunun daha yeni Kalp'i kazandı", ids(atlasStorage.loadAtlas(), "Kalp") === "kServerNew");
    ok("(e2) kaybeden yerel Kalp 'atlas-conflict-backup' anahtarına yedeklendi",
      backup.length >= 1 && ids({ _meta: {}, ...backup[backup.length - 1].organs }, "Kalp") === "kLocalOld");

    // (g) hayatta kalan organUpdatedAt doğru taraftan
    const S1 = "2026-09-01T00:00:00.000Z";
    const S2 = "2026-09-02T00:00:00.000Z";
    const mk = (organ: Record<string, unknown>, upd: Record<string, string>) => ({ _meta: { organUpdatedAt: upd }, ...organ });
    const g1 = mergeLib.mergeAtlasThreeWay(mk({ Mide: ent(reg("s")) }, { mide: S2 }), mk({ Mide: ent(reg("l")) }, { mide: S1 }), null);
    ok("(g) LWW sunucu yeni → içerik + damga sunucudan", ids(g1.document, "Mide") === "s" && g1.document._meta?.organUpdatedAt?.mide === S2);
    const g2 = mergeLib.mergeAtlasThreeWay(mk({ Mide: ent(reg("s")) }, { mide: S1 }), mk({ Mide: ent(reg("l")) }, { mide: S2 }), null);
    ok("(g) LWW yerel yeni → içerik + damga yerelden; kayıp yedeği yok", ids(g2.document, "Mide") === "l" && g2.document._meta?.organUpdatedAt?.mide === S2 && Object.keys(g2.lostLocal).length === 0);
    const gBase = mk({ Mide: ent(reg("b")) }, { mide: "2026-08-01T00:00:00.000Z" });
    const g3 = mergeLib.mergeAtlasThreeWay(mk({ Mide: ent(reg("s")) }, { mide: S2 }), mk({ Mide: ent(reg("l")) }, { mide: S1 }), gBase);
    ok("(g) 3-yollu çakışma: yerel korunur + damga YEREL (sunucunun daha yeni damgası yapışmaz)",
      g3.conflicts.join() === "Mide" && ids(g3.document, "Mide") === "l" && g3.document._meta?.organUpdatedAt?.mide === S1);
    const g4 = mergeLib.mergeAtlasThreeWay(mk({ Mide: ent(reg("s")) }, { mide: S1 }), mk({ Mide: ent(reg("b")) }, { mide: S2 }), gBase);
    ok("(g) 3-yollu yalnız sunucu değişti: sunucu içeriği + sunucu damgası", g4.conflicts.length === 0 && ids(g4.document, "Mide") === "s" && g4.document._meta?.organUpdatedAt?.mide === S1);
    const g5 = mergeLib.mergeAtlasThreeWay(mk({}, {}), mk({ Mide: ent(reg("b")) }, { mide: S1 }), gBase, S2);
    ok("(g) 3-yollu sunucu sildi + yerel değişmedi → silinir + mezar taşı", ids(g5.document, "Mide") === "" && typeof g5.document._meta?.tombstones?.mide === "string");

    // Kota: birleşim yazılamazsa yerel/taban DOKUNULMAZ, otomatik PUT yok
    deviceB((d) => {
      d.Mide = ent(reg("mQuota"));
    });
    const localBefore = ls.getItem(scoped.scopedKey(scopeC, "atlas"));
    const baseBefore = ls.getItem(baseKey);
    atlasStorage.saveAtlas(atlasStorage.mergeDraftIntoAtlas(atlasStorage.loadAtlas(), [draft("q1", "Kalp")], []));
    const localSaved = ls.getItem(scoped.scopedKey(scopeC, "atlas"));
    const origSet = ls.setItem.bind(ls);
    ls.setItem = (k: string, v: string) => {
      if (k.includes(":atlas") || k.includes(":organs")) throw new Error("QuotaExceededError");
      origSet(k, v);
    };
    requestLog.length = 0;
    const rq = await atlasSync.flushAtlasNow();
    ls.setItem = origSet;
    ok("(kota) yazılamayan birleşim → conflict, retry yok, yerel aynen", rq.status === "conflict" && putCount() === 1 && ls.getItem(scoped.scopedKey(scopeC, "atlas")) === localSaved);
    ok("(kota) taban ilerletilmedi", ls.getItem(baseKey) === baseBefore && localBefore !== null);
    clearYasamUser();
  }

  // ── E3 ───────────────────────────────────────────────────────────────────
  section("E3. P1-5 Protokol diriltme yok + not create kör ezme yok (gerçek route)");
  {
    const STUB = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "userGuard.cjs");
    const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
    const orig = M._resolveFilename;
    M._resolveFilename = function (req: string, ...rest: unknown[]) {
      if (req === "@/lib/auth/userGuard") return STUB;
      return orig.call(this, req, ...rest);
    };
    const db = new RouteDb();
    (globalThis as Record<string, unknown>).__HDAY_GUARD__ = () => ({
      ok: true,
      db,
      tenantId: "tenant-r",
      userId: "user-r",
      is_demo_account: false,
      profile: { role: "admin" }, // trackUsage no-op (telemetri bu testin konusu değil)
    });
    const protoRoute = await import("@/app/api/refleksoloji/protocols/by-uid/[uid]/route");
    const notesRoute = await import("@/app/api/refleksoloji/notes/route");
    const call = async (handler: (r: NextRequest, c: { params: Promise<{ uid: string }> }) => Promise<Response>, url: string, method: string, body: unknown, uid = "") => {
      const r = new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const res = await handler(r, { params: Promise.resolve({ uid }) });
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };

    // (h) expected verildi + satır silinmiş → 409 PROTOCOL_DELETED, insert YOK
    db.tables.reflexology_protocols = [];
    const protoBody = { title: "Migren", target_problem: "baş", organs: "Beyin", application_notes: null, raw_json: { id: "p1", title: "Migren", updatedAt: "V2" } };
    const h1 = await call(protoRoute.PUT, "/api/refleksoloji/protocols/by-uid/p1", "PUT", { ...protoBody, expected_updated_at: "V1" }, "p1");
    ok("(h) expected + silinmiş protokol → 409 PROTOCOL_DELETED", h1.status === 409 && h1.json.code === "PROTOCOL_DELETED");
    ok("(h) silinen protokol DİRİLMEDİ (insert yok)", db.tables.reflexology_protocols.length === 0 && !db.writes.includes("insert:reflexology_protocols"));
    const h2 = await call(protoRoute.PUT, "/api/refleksoloji/protocols/by-uid/p2", "PUT", { ...protoBody, raw_json: { id: "p2", updatedAt: "V1" } }, "p2");
    ok("(h) expected YOK + satır yok → insert (geriye dönük)", h2.status === 200 && h2.json.created === true && db.tables.reflexology_protocols.length === 1);
    db.tables.reflexology_protocols.push({ id: "row-p3", tenant_id: "tenant-r", source_uid: "p3", raw_json: { id: "p3", updatedAt: "V1" } });
    const h3 = await call(protoRoute.PUT, "/api/refleksoloji/protocols/by-uid/p3", "PUT", { ...protoBody, raw_json: { id: "p3", updatedAt: "V2" }, expected_updated_at: "V1" }, "p3");
    ok("(h) expected eşleşen mevcut satır → 200 update", h3.status === 200 && h3.json.updated === 1);
    ok("(h) saf karar: expected var → PROTOCOL_DELETED; yok → insert",
      protoCore.decideProtocolMissingRow("V1").kind === "conflict" && protoCore.decideProtocolMissingRow(null).kind === "insert");

    // (i) not create: mevcut uid → kör upsert YOK (farklı içerik → conflict; aynı → unchanged)
    db.tables.reflexology_notes = [{
      id: "row-n1", tenant_id: "tenant-r", source_uid: "n1", updated_at: "S1",
      raw_json: { ...note("n1"), content: "sunucu metni" },
    }];
    const i1 = await call(notesRoute.PUT, "/api/refleksoloji/notes", "PUT", { notes: [note("n1", { content: "başka cihaz metni" })] });
    const i1r = (i1.json.results as Array<Record<string, unknown>>)[0];
    ok("(i) mevcut uid + farklı içerik → 409 conflict (server döner)", i1.status === 409 && i1r.outcome === "conflict" && i1r.server_updated_at === "S1");
    ok("(i) sunucu notu EZİLMEDİ", (db.tables.reflexology_notes[0].raw_json as { content: string }).content === "sunucu metni" && db.tables.reflexology_notes[0].updated_at === "S1");
    const i2 = await call(notesRoute.PUT, "/api/refleksoloji/notes", "PUT", { notes: [note("n1", { content: "sunucu metni" })] });
    const i2r = (i2.json.results as Array<Record<string, unknown>>)[0];
    ok("(i) mevcut uid + aynı içerik → unchanged (idempotent yeniden deneme)", i2.status === 200 && i2r.outcome === "unchanged" && i2r.updated_at === "S1");
    const i3 = await call(notesRoute.PUT, "/api/refleksoloji/notes", "PUT", { notes: [note("n2")] });
    ok("(i) yeni uid → created", i3.status === 200 && (i3.json.results as Array<Record<string, unknown>>)[0].outcome === "created" && db.tables.reflexology_notes.length === 2);
    M._resolveFilename = orig;
  }

  // ── F ────────────────────────────────────────────────────────────────────
  section("F. Word: seçilen organlar her zaman + eksik notu");
  {
    const { buildSingleReport, reflexologyHeaders, reflexologyFooters } = await import("@/lib/refleksoloji/reflexologyWord");
    const { resolveProtocolAtlas } = await import("@/lib/refleksoloji/atlasRegionsCore");
    const docXml = async (children: Awaited<ReturnType<typeof buildSingleReport>>) => {
      const doc = new Document({ sections: [{ properties: { titlePage: true }, headers: reflexologyHeaders(), footers: reflexologyFooters(), children }] });
      const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
      return zip.file("word/document.xml")!.async("string");
    };
    const organs = ["Mide", "Karaciğer"];
    const emptyAtlas = { _meta: { version: "1", updated_at: "x" } } as never;
    const x1 = await docXml(
      await buildSingleReport({ index: 0, title: "Sindirim", description: null, notes: null, organs, createdAt: "2026-09-27T10:00:00Z", resolved: resolveProtocolAtlas(emptyAtlas, organs) }, "27 Eylül 2026"),
    );
    ok("boş atlas: 'Mide' belgede", x1.includes("Mide"));
    ok("boş atlas: 'Karaciğer' belgede (Türkçe karakter bozulmadı)", x1.includes("Karaciğer"));
    ok("boş atlas: 'Seçilen Organlar' bölümü var", x1.includes("Seçilen Organlar"));
    ok("boş atlas: eksik organ notu var", x1.includes("Atlas bölgesi bulunmayan organlar"));
    ok("boş atlas: bilgilendirme notu korundu", x1.includes("Bilgilendirme"));

    const region = { id: "w1", shape: "oval", cx: 0.3, cy: 0.4, rx: 0.05, ry: 0.05, angle: 0 };
    const partial = {
      _meta: { version: "1", updated_at: "x" },
      Mide: { taban: { sol: [region], sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } },
    } as never;
    const x2 = await docXml(
      await buildSingleReport({ index: 0, title: "Sindirim", description: null, notes: null, organs, createdAt: "2026-09-27T10:00:00Z", resolved: resolveProtocolAtlas(partial, organs) }, "27 Eylül 2026"),
    );
    ok("kısmi eşleşme: atlas tablosu başlığı (Bölge Sayısı) var", x2.includes("Bölge Sayısı"));
    const missingIdx = x2.indexOf("Atlas bölgesi bulunmayan organlar");
    ok("kısmi eşleşme: eksik notunda yalnız Karaciğer", missingIdx > 0 && x2.slice(missingIdx, missingIdx + 600).includes("Karaciğer") && !x2.slice(missingIdx, missingIdx + 600).includes("Mide"));
  }

  // ── G ────────────────────────────────────────────────────────────────────
  section("G. Protokol: CAS, eski kopya, slug, kimlik");
  {
    ok("expected yok → kabul (geriye dönük)", protoCore.decideProtocolCas(null, "V1").ok);
    ok("sunucu sürümü yok (eski kayıt) → kabul", protoCore.decideProtocolCas("V1", null).ok);
    ok("eşleşen sürüm → kabul", protoCore.decideProtocolCas("V1", "V1").ok);
    ok("farklı sürüm → PROTOCOL_STALE", !protoCore.decideProtocolCas("V1", "V2").ok);
    ok("raw_json.updatedAt okunur", protoCore.protocolRowVersion({ updatedAt: "V9" }) === "V9");

    const legacy = [
      { id: "migren", title: "Migren", description: "baş", organs: ["Beyin", "Karaciğer"], notes: "n" },
      { id: "farkli", title: "Farklı", description: "", organs: ["Mide"], notes: "" },
      { id: "yok", title: "Yok", description: "", organs: ["Kalp"], notes: "" },
    ];
    const rows = [
      { source_uid: "migren", title: "Migren", target_problem: "baş", organs: "Beyin | Karaciğer", application_notes: "n" },
      { source_uid: "farkli", title: "Farklı (başka hesap)", target_problem: null, organs: "Mide", application_notes: null },
    ];
    const c = protoCore.classifyLegacyProtocols(legacy, rows);
    ok("aynı source_uid + aynı içerik → benimse", c.adopt.length === 1 && c.adopt[0].id === "migren");
    ok("farklı içerik / sunucuda yok → karantina", c.quarantine.map((p) => p.id).sort().join(",") === "farkli,yok");

    ok("slug 'ı' düşmez", slugifyTr("Işık Ağrısı") === "isik-agrisi");
    ok("slug İ/Ş/Ç/Ö/Ü/Ğ", slugifyTr("İŞÇÖÜĞ ığ") === "iscoug-ig");
    const { createProtocolId, slugifyTitle } = await import("@/app/refleksoloji/protokol-haritasi/lib/protocolStorage");
    ok("yeni protokol kimliği UUID (başlık slug'ı değil)", /^[0-9a-f-]{36}$/.test(createProtocolId("Migren", new Set())));
    ok("slugifyTitle Türkçe-güvenli", slugifyTitle("Sırt ağrısı") === "sirt-agrisi");
  }

  // ── Scoped storage birim ──────────────────────────────────────────────────
  section("H. Kapsamlı depo birim");
  {
    const kv = scoped.createMemoryStore();
    const sA = scoped.resolveReflexScope({ id: "u1", tenant_id: "t1" })!;
    ok("kapsam çözümü", sA.tenantId === "t1" && sA.userId === "u1");
    ok("tenant yok → kapsam yok", scoped.resolveReflexScope({ id: "u1" }) === null);
    scoped.writeScopedJson(sA, "notes-outbox", [{ uid: "x" }], kv);
    ok("outbox dolu → bekleyen iş var", scoped.hasPendingReflexWork(sA, kv));
    ok("bekleyen iş varken temizlik yapılmaz", scoped.clearScopedReflexCache(sA, kv).cleared === false);
    ok("force (demo) → temizlenir", scoped.clearScopedReflexCache(sA, kv, { force: true }).cleared === true && kv.length === 0);
  }

  console.log(`\n──────── SONUÇ: ${pass} PASS / ${fail} FAIL ────────`);
  if (fail > 0) {
    console.error(`BAŞARISIZ:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log("✅ REFLEKS harness — tüm testler geçti.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
