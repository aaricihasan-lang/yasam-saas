/**
 * Premium Word Arşivi harness'i (Ayarlar › Dışa Aktarım). Ağ / sır / production YOK; sahte DB.
 *   npx tsx scripts/settings-export/archive.harness.ts
 *
 * A ZIP yazıcısı (gerçek okuyucu: JSZip + CRC; Türkçe adlar; yol güvenliği)
 * B Seçenek doğrulama + Europe/Istanbul gün sınırları
 * C Kayıt dökümü parçaları: büyük veri (12.000 tavanı yok), parça bütçesi, numaralandırma, danışan adları,
 *   danışan / tarih süzgeci, Atlas uzman izolasyonu
 * D Parça ucu güvenliği: kapsam dışı iş, başka tenant / başka danışan / yabancı yol, bozuk durum
 * E Yürütücü: yeniden deneme, 429, eksik veri → BAŞARISIZ, iptal, BENİOKU / ARŞİV-RAPORU
 * F Denetim kaydı: yalnız sayılar / modül anahtarları (ad, kimlik, içerik YOK)
 * G Gerçek rapor üreticileri: Danışan dosyası, Numeroloji kaydı, HD (v1 snapshot), Android / yetki kuralları
 */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZipWriter, crc32, safeFileName } from "../../lib/archive/zip";
import { istanbulDayStartIso, normalizeArchiveOptions } from "../../lib/archive/scope";
// "server-only" yalnız bu süreçte boş modüle yönlendirilir (Next dışı çalıştırma; anamnez harness'ı ile aynı yöntem).
// Sunucu modülleri bu yüzden main() içinde dinamik içe aktarılır.
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
type DataMod = typeof import("../../lib/archive/server/data");
type HandlersMod = typeof import("../../lib/archive/server/handlers");
let buildDataPart: DataMod["buildDataPart"];
let planModuleData: DataMod["planModuleData"];
let PART_MAX_RECORDS: number;
let handleArchiveAudit: HandlersMod["handleArchiveAudit"];
let handleArchiveClients: HandlersMod["handleArchiveClients"];
let handleArchivePart: HandlersMod["handleArchivePart"];
let handleArchivePlan: HandlersMod["handleArchivePlan"];
import type { ArchiveCtx } from "../../lib/archive/server/reports";
import { runArchive, type PartResponse } from "../../lib/archive/client";
import type { ArchiveJob, ArchiveOptions, ArchivePlanResponse } from "../../lib/archive/types";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${name}: ${(e as Error).message}`);
  }
}

// ─── Sahte DB (kullanılan Supabase alt kümesi) ────────────────────────────────
type Row = Record<string, unknown>;
type F =
  | { k: "eq" | "gt" | "gte" | "lt"; c: string; v: unknown }
  | { k: "in"; c: string; v: unknown[] }
  | { k: "notnull"; c: string }
  | { k: "or"; fn: (r: Row) => boolean };
const cmp = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

class FakeDb {
  tables: Record<string, Row[]> = {};
  inserts: { table: string; row: Row }[] = [];
  writes: string[] = [];
  signed: string[] = [];
  rows(t: string) {
    return (this.tables[t] ??= []);
  }
  from(table: string) {
    return new Q(this, table);
  }
  storage = {
    from: (bucket: string) => ({
      createSignedUrl: async (path: string, ttl: number) => {
        this.signed.push(`${bucket}:${path}:${ttl}`);
        return { data: { signedUrl: `https://storage.test/${bucket}/${path}?ttl=${ttl}` }, error: null };
      },
      download: async () => ({ data: null, error: { message: "yok" } }),
    }),
  };
  rpc() {
    return Promise.resolve({ data: { allowed: true }, error: null });
  }
}

class Q implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private f: F[] = [];
  private ord: { c: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private cols = "*";
  private head = false;
  private countMode = false;
  private single = false;
  private ins: Row | null = null;
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  select(cols = "*", o?: { count?: string; head?: boolean }) {
    this.cols = cols;
    this.head = !!o?.head;
    this.countMode = o?.count === "exact";
    return this;
  }
  eq(c: string, v: unknown) {
    this.f.push({ k: "eq", c, v });
    return this;
  }
  gt(c: string, v: unknown) {
    this.f.push({ k: "gt", c, v });
    return this;
  }
  gte(c: string, v: unknown) {
    this.f.push({ k: "gte", c, v });
    return this;
  }
  lt(c: string, v: unknown) {
    this.f.push({ k: "lt", c, v });
    return this;
  }
  in(c: string, v: readonly unknown[]) {
    this.f.push({ k: "in", c, v: [...v] });
    return this;
  }
  not(c: string, op: string, v: unknown) {
    assert.equal(op, "is");
    assert.equal(v, null);
    this.f.push({ k: "notnull", c });
    return this;
  }
  or(expr: string) {
    const ks = /^([a-z_]+)\.gt\.([^,()]+),and\(\1\.eq\.\2,([a-z_]+)\.gt\.([^,()]+)\)$/.exec(expr);
    if (ks) {
      const [, a, va, b, vb] = ks;
      this.f.push({ k: "or", fn: (r) => cmp(r[a], va) > 0 || (String(r[a]) === va && cmp(r[b], Number(vb)) > 0) });
      return this;
    }
    const il = /^ad\.ilike\.%(.*)%,soyad\.ilike\.%(.*)%$/.exec(expr);
    if (!il) throw new Error(`or() desteklenmiyor: ${expr}`);
    const term = il[1].toLocaleLowerCase("tr-TR");
    this.f.push({ k: "or", fn: (r) => [r.ad, r.soyad].some((x) => String(x ?? "").toLocaleLowerCase("tr-TR").includes(term)) });
    return this;
  }
  is(c: string, v: null) {
    this.f.push({ k: "eq", c, v });
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.ord.push({ c, asc: o?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(a: number, b: number) {
    this.lim = b - a + 1;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  insert(row: Row) {
    this.ins = row;
    return this;
  }
  update() {
    this.db.writes.push(`update:${this.table}`);
    throw new Error("UPDATE yasak");
  }
  delete() {
    this.db.writes.push(`delete:${this.table}`);
    throw new Error("DELETE yasak");
  }
  upsert() {
    this.db.writes.push(`upsert:${this.table}`);
    throw new Error("UPSERT yasak");
  }
  private match(r: Row) {
    return this.f.every((x) => {
      if (x.k === "eq") return r[x.c] === x.v || (x.v === null && (r[x.c] === null || r[x.c] === undefined));
      if (x.k === "in") return x.v.map(String).includes(String(r[x.c]));
      if (x.k === "notnull") return r[x.c] !== null && r[x.c] !== undefined;
      if (x.k === "or") return x.fn(r);
      const c = cmp(r[x.c], x.v);
      return r[x.c] != null && (x.k === "gt" ? c > 0 : x.k === "gte" ? c >= 0 : c < 0);
    });
  }
  private exec() {
    if (this.ins) {
      if (this.table !== "security_events") this.db.writes.push(`insert:${this.table}`);
      this.db.inserts.push({ table: this.table, row: this.ins });
      this.db.rows(this.table).push(this.ins);
      return { data: null, error: null };
    }
    let rows = this.db.rows(this.table).filter((r) => this.match(r));
    if (this.head) return { data: null, error: null, count: rows.length };
    const total = rows.length;
    if (this.ord.length) {
      rows = rows.slice().sort((a, b) => {
        for (const o of this.ord) {
          const c = cmp(a[o.c], b[o.c]);
          if (c) return o.asc ? c : -c;
        }
        return 0;
      });
    }
    if (this.lim !== null) rows = rows.slice(0, this.lim);
    const pick = (r: Row) => {
      if (this.cols.trim() === "*") return { ...r };
      return Object.fromEntries(this.cols.split(",").map((c) => c.trim()).filter(Boolean).map((c) => [c, r[c]]));
    };
    if (this.single) return { data: rows[0] ? pick(rows[0]) : null, error: null };
    return { data: rows.map(pick), error: null, count: this.countMode ? total : null };
  }
  then<A = { data: unknown; error: unknown }, B = never>(
    ok?: ((v: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null,
    no?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    try {
      return Promise.resolve(this.exec()).then(ok, no);
    } catch (e) {
      return Promise.reject(e).then(ok, no);
    }
  }
}

// ─── Fikstür ──────────────────────────────────────────────────────────────────
const TA = "aaaaaaaa-0000-4000-8000-00000000000a";
const TB = "bbbbbbbb-0000-4000-8000-00000000000b";
const UA = "aaaaaaaa-1111-4000-8000-00000000000a";
const UA2 = "aaaaaaaa-2222-4000-8000-00000000000a";
let seq = 0;
/** Geçerli UUID (önek onaltılığa çevrilir → yol / kimlik doğrulayıcılarından geçer). */
const uid = (p: string) => `${Buffer.from(p).toString("hex").padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
const asDb = (d: FakeDb) => d as unknown as SupabaseClient;
const PROFILE = { role: "expert", module_permissions: { clients: true, numerology: true, human_design: true, astrology: true }, full_name: "Sentetik Uzman" };
const ctxOf = (db: FakeDb, over: Partial<ArchiveCtx> = {}): ArchiveCtx => ({ db: asDb(db), tenantId: TA, userId: UA, profile: PROFILE, isDemo: false, isAndroid: false, ...over });
const opt = (o: Partial<ArchiveOptions> = {}): ArchiveOptions => ({
  modules: ["clients"],
  clientIds: null,
  dateFrom: null,
  dateTo: null,
  include: { data: true, dossiers: false, reports: false, files: false, sensitive: false },
  ...o,
});

function seedClients(db: FakeDb, n: number, tenant = TA): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({ id: uid("c1"), tenant_id: tenant, ad: `Ayşe${i}`, soyad: "Öztürk", telefon: null, created_at: `2026-0${1 + (i % 9)}-15T10:00:00Z` });
  }
  db.rows("clients").push(...rows);
  return rows;
}

async function docXml(bytes: Uint8Array): Promise<string> {
  return (await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string"));
}

async function drain(db: FakeDb, module: string, o: ArchiveOptions, userId = UA) {
  const parts: { rows: number; xml: string; bytes: number }[] = [];
  let state = null as Parameters<typeof buildDataPart>[5];
  for (let g = 0; g < 1000; g++) {
    const r = await buildDataPart(asDb(db), TA, userId, module, o, state);
    if (r.buffer) parts.push({ rows: r.rows, xml: await docXml(r.buffer), bytes: r.buffer.length });
    assert.deepEqual(r.errors, []);
    if (!r.next) break;
    state = r.next;
  }
  return parts;
}

(async () => {
  ({ buildDataPart, planModuleData, PART_MAX_RECORDS } = await import("../../lib/archive/server/data"));
  ({ handleArchiveAudit, handleArchiveClients, handleArchivePart, handleArchivePlan } = await import("../../lib/archive/server/handlers"));
  console.log("\nA. ZIP");
  await t("ZIP gerçek okuyucuyla açılır; CRC, Türkçe UTF-8 adlar, aynı ad çakışması (2)", async () => {
    const z = new ZipWriter(new Date("2026-11-09T10:00:00Z"));
    const a = new TextEncoder().encode("ğüşiöç İĞÜŞÖÇ ı");
    const big = new Uint8Array(3_000_000).map((_, i) => i % 251);
    z.add("Yaşam Arşivi/Danışan Dosyaları/Ayşe Öztürk/rapor.docx", a);
    z.add("Yaşam Arşivi/Danışan Dosyaları/Ayşe Öztürk/rapor.docx", big);
    z.addText("Yaşam Arşivi/BENİOKU.txt", "Merhaba");
    const parts = z.finish();
    const buf = Buffer.concat(parts.map((p) => Buffer.from(p)));
    const zip = await JSZip.loadAsync(buf, { checkCRC32: true });
    const names = Object.keys(zip.files).sort();
    assert.deepEqual(names, ["Yaşam Arşivi/BENİOKU.txt", "Yaşam Arşivi/Danışan Dosyaları/Ayşe Öztürk/rapor (2).docx", "Yaşam Arşivi/Danışan Dosyaları/Ayşe Öztürk/rapor.docx"]);
    assert.equal(await zip.file("Yaşam Arşivi/Danışan Dosyaları/Ayşe Öztürk/rapor.docx")!.async("string"), "ğüşiöç İĞÜŞÖÇ ı");
    const back = await zip.file("Yaşam Arşivi/Danışan Dosyaları/Ayşe Öztürk/rapor (2).docx")!.async("uint8array");
    assert.equal(crc32(back), crc32(big));
    assert.equal(z.bytesWritten, buf.length);
  });
  await t("yol güvenliği: '..', mutlak yol, ters bölü, kontrol karakteri, Windows ayrılmış ad", () => {
    const z = new ZipWriter();
    const n = z.add("../../etc/pa\u0000ss\\wd:x?.txt", new Uint8Array([1]));
    assert.ok(!n.split("/").some((p) => p === ".." || p === "." || p === ""), n);
    assert.ok(!/[\\:?\u0000]/.test(n), n);
    assert.equal(safeFileName("CON"), "_CON");
    assert.equal(safeFileName("  ...gizli. "), "gizli");
    assert.ok(safeFileName("a".repeat(300) + ".docx").endsWith(".docx"));
  });

  console.log("\nB. Seçenekler ve tarih");
  await t("seçenek doğrulama: bilinmeyen modül, >100 danışan, bozuk / ters tarih, boş içerik reddedilir", () => {
    assert.equal(normalizeArchiveOptions({ modules: ["yok"] }).ok, false);
    assert.equal(normalizeArchiveOptions({ modules: [] }).ok, false);
    assert.equal(normalizeArchiveOptions({ modules: ["clients"], clientIds: Array.from({ length: 101 }, () => uid("cc")) }).ok, false);
    assert.equal(normalizeArchiveOptions({ modules: ["clients"], clientIds: ["x' or 1=1"] }).ok, false);
    assert.equal(normalizeArchiveOptions({ modules: ["clients"], dateFrom: "2026-02-30" }).ok, false);
    assert.equal(normalizeArchiveOptions({ modules: ["clients"], dateFrom: "2026-05-01", dateTo: "2026-04-01" }).ok, false);
    assert.equal(normalizeArchiveOptions({ modules: ["clients"], include: { data: false, dossiers: false, reports: false, files: false } }).ok, false);
    const ok = normalizeArchiveOptions({ modules: ["astrology", "clients", "clients"], dateFrom: "2026-01-01" });
    assert.ok(ok.ok && ok.options.modules.join() === "clients,astrology" && ok.options.include.files === false);
  });
  await t("Europe/Istanbul gün başlangıcı (2016 sonrası +03, 2015 yaz +03 / kış +02)", () => {
    assert.equal(istanbulDayStartIso("2026-11-09"), "2026-11-08T21:00:00.000Z");
    assert.equal(istanbulDayStartIso("2015-07-01"), "2015-06-30T21:00:00.000Z");
    assert.equal(istanbulDayStartIso("2015-01-15"), "2015-01-14T22:00:00.000Z");
  });

  console.log("\nC. Kayıt dökümü parçaları");
  const big = new FakeDb();
  const clientsBig = seedClients(big, 4200);
  seedClients(big, 3, TB);
  big.rows("client_sessions").push(...clientsBig.slice(0, 1700).map((c, i) => ({ id: uid("s1"), tenant_id: TA, client_id: c.id, title: `Seans ${i}`, notes: "Uzun not ".repeat(20), created_at: "2026-03-10T09:00:00Z" })));
  await t(`büyük veri: 4.200 danışan + 1.700 seans → ${PART_MAX_RECORDS}'lik bölümler, kayıpsız, 12.000 tavanı yok, başka tenant yok`, async () => {
    const plan = await planModuleData(asDb(big), TA, UA, "clients", opt());
    const expected = plan.tables.find((x) => x.entry.table === "clients")!.expected;
    assert.equal(expected, 4200);
    const parts = await drain(big, "clients", opt());
    const total = parts.reduce((s, p) => s + p.rows, 0);
    assert.equal(total, 5900, `toplam ${total}`);
    assert.ok(parts.length >= 4, `bölüm sayısı ${parts.length}`);
    assert.ok(parts.every((p) => p.rows <= PART_MAX_RECORDS && p.bytes < 4_000_000));
    const all = parts.map((p) => p.xml).join("\n");
    assert.ok(all.includes("Ayşe4199 Öztürk") && all.includes("Ayşe0 Öztürk"));
    assert.ok(!all.includes("bbbbbbbb"), "başka tenant sızdı");
    assert.ok(parts[1].xml.includes("önceki bölümden devam") && parts[1].xml.includes(`${PART_MAX_RECORDS + 1}. Ayşe`), "numaralandırma kesintisiz değil");
  });
  await t("bağlı kayıt: seansta danışan kimliği yerine 'Ad Soyad' yazılır (ref. kodu yok)", async () => {
    const parts = await drain(big, "clients", opt());
    const sess = parts.find((p) => p.xml.includes("Seanslar"))!.xml;
    assert.ok(sess.includes("Seans 0 — Ayşe0 Öztürk"), "kayıt başlığında danışan adı yok");
    assert.ok(!/Seanslar[\s\S]{0,4000}bağlantılı kayıt \(ref\./.test(sess.slice(sess.indexOf("Seanslar"))), "danışan ref. kodu kaldı");
  });
  await t("danışan süzgeci: yalnız seçili danışanların kayıtları; danışana bağsız tablolar kapsam dışı", async () => {
    const pick = [String(clientsBig[0].id), String(clientsBig[5].id)];
    const o = opt({ clientIds: pick });
    const plan = await planModuleData(asDb(big), TA, UA, "clients", o);
    assert.equal(plan.tables.find((x) => x.entry.table === "clients")!.expected, 2);
    assert.equal(plan.tables.find((x) => x.entry.table === "client_sessions")!.expected, 2);
    const parts = await drain(big, "clients", o);
    assert.equal(parts.reduce((s, p) => s + p.rows, 0), 4);
    const stones = await planModuleData(asDb(big), TA, UA, "stones", o);
    assert.ok(stones.tables.every((x) => x.skip !== null), "bağsız tablolar kapsam dışı olmalı");
  });
  await t("tarih süzgeci: yalnız aralıktaki kayıtlar (İstanbul günü, iki uç dahil)", async () => {
    const o = opt({ dateFrom: "2026-03-01", dateTo: "2026-03-31" });
    const plan = await planModuleData(asDb(big), TA, UA, "clients", o);
    const inMarch = clientsBig.filter((c) => String(c.created_at).startsWith("2026-03")).length;
    assert.equal(plan.tables.find((x) => x.entry.table === "clients")!.expected, inMarch);
    assert.equal(plan.tables.find((x) => x.entry.table === "client_sessions")!.expected, 1700);
    const edge = new FakeDb();
    edge.rows("clients").push(
      { id: uid("e1"), tenant_id: TA, ad: "Sınır", soyad: "Önce", created_at: "2026-02-28T20:59:59Z" },
      { id: uid("e1"), tenant_id: TA, ad: "Sınır", soyad: "İlk", created_at: "2026-02-28T21:00:00Z" },
      { id: uid("e1"), tenant_id: TA, ad: "Sınır", soyad: "Son", created_at: "2026-03-31T20:59:59Z" },
      { id: uid("e1"), tenant_id: TA, ad: "Sınır", soyad: "Sonra", created_at: "2026-03-31T21:00:00Z" },
    );
    const p2 = await planModuleData(asDb(edge), TA, UA, "clients", o);
    assert.equal(p2.tables.find((x) => x.entry.table === "clients")!.expected, 2);
  });
  await t("Atlas: kayıt dökümü yalnız oturumdaki uzmanın kayıtları (aynı tenant 2. uzman görünmez)", async () => {
    const db = new FakeDb();
    for (const [owner, n] of [[UA, 3], [UA2, 2]] as const) {
      for (let i = 0; i < n; i++) {
        db.rows("astro_kb_entries").push({ id: uid("ak"), tenant_id: TA, owner_user_id: owner, title: `${owner === UA ? "BENİM" : "BAŞKASININ"} KB ${i}`, body: "x", created_at: "2026-05-01T00:00:00Z" });
      }
    }
    const parts = await drain(db, "astrology", opt({ modules: ["astrology"] }));
    const xml = parts.map((p) => p.xml).join();
    assert.equal(parts.reduce((s, p) => s + p.rows, 0), 3);
    assert.ok(xml.includes("BENİM KB") && !xml.includes("BAŞKASININ"));
  });

  console.log("\nD. Parça ucu güvenliği");
  const sec = new FakeDb();
  const [cA, cB] = seedClients(sec, 2);
  const [cOther] = seedClients(sec, 1, TB);
  const goodAn = { id: uid("an"), tenant_id: TA, client_id: cA.id, image_url: "x", created_at: "2026-01-01T00:00:00Z" };
  const foreignAn = { id: uid("an"), tenant_id: TB, client_id: cOther.id, image_url: "x", created_at: "2026-01-01T00:00:00Z" };
  sec.rows("client_analyses").push(goodAn, foreignAn);
  const badPhoto = { id: uid("ph"), tenant_id: TA, client_id: cA.id, file_path: `${TB}/${cA.id}/x.jpg`, created_at: "2026-01-01T00:00:00Z" };
  sec.rows("client_stone_photos").push(badPhoto);
  const filesOpt = opt({ include: { data: false, dossiers: false, reports: false, files: true, sensitive: false } });
  await t("dosya: kendi satırı → 60 sn imzalı bağlantı (tenant önekli yol); herkese açık URL yok", async () => {
    const r = await handleArchivePart(ctxOf(sec), { options: filesOpt, job: { kind: "file", source: "analysis_image", rowId: goodAn.id } });
    assert.equal(r.kind, "json");
    const b = (r as unknown as { body: Record<string, unknown> }).body;
    assert.equal(b.ok, true);
    assert.equal(b.expires_in, 60);
    assert.ok(sec.signed.at(-1) === `client-analysis-images:${TA}/${cA.id}/${goodAn.id}.png:60`, sec.signed.at(-1));
  });
  await t("dosya: başka tenant satırı → 404; yabancı yol → 403; seçim dışı danışan → 404", async () => {
    const f = await handleArchivePart(ctxOf(sec), { options: filesOpt, job: { kind: "file", source: "analysis_image", rowId: foreignAn.id } });
    assert.equal((f as { status: number }).status, 404);
    const p = await handleArchivePart(ctxOf(sec), { options: filesOpt, job: { kind: "file", source: "stone_photo", rowId: badPhoto.id } });
    assert.equal((p as { status: number }).status, 403);
    const o = { ...filesOpt, clientIds: [String(cB.id)] };
    const s = await handleArchivePart(ctxOf(sec), { options: o, job: { kind: "file", source: "analysis_image", rowId: goodAn.id } });
    assert.equal((s as { status: number }).status, 404);
  });
  await t("kapsam dışı iş reddedilir: seçilmemiş modülün verisi / raporu, seçim dışı danışan dosyası, bozuk iş ve durum", async () => {
    const r1 = await handleArchivePart(ctxOf(sec), { options: opt(), job: { kind: "data", module: "stones" } });
    assert.equal((r1 as { status: number }).status, 403);
    const r2 = await handleArchivePart(ctxOf(sec), { options: opt({ include: { data: true, dossiers: false, reports: false, files: false, sensitive: false } }), job: { kind: "hd_report", reportId: uid("hr") } });
    assert.equal((r2 as { status: number }).status, 403);
    const dOpt = opt({ clientIds: [String(cA.id)], include: { data: false, dossiers: true, reports: false, files: false, sensitive: false } });
    const r3 = await handleArchivePart(ctxOf(sec), { options: dOpt, job: { kind: "client_dossier", clientId: cB.id } });
    assert.equal((r3 as { status: number }).status, 403);
    const r4 = await handleArchivePart(ctxOf(sec), { options: opt(), job: { kind: "client_dossier", clientId: "'; drop" } });
    assert.equal((r4 as { status: number }).status, 400);
    const r5 = await handleArchivePart(ctxOf(sec), { options: opt(), job: { kind: "data", module: "clients" }, state: "%%%" });
    assert.equal((r5 as { status: number }).status, 400);
    const r6 = await handleArchivePart(ctxOf(sec), { options: { modules: ["users"] }, job: { kind: "data", module: "users" } });
    assert.equal((r6 as { status: number }).status, 400);
  });
  await t("başka tenant'ın danışan dosyası istenemez (404); hiçbir uç veri yazmaz", async () => {
    const o = opt({ include: { data: false, dossiers: true, reports: false, files: false, sensitive: false } });
    const r = await handleArchivePart(ctxOf(sec), { options: o, job: { kind: "client_dossier", clientId: cOther.id } });
    assert.equal((r as { status: number }).status, 404);
    assert.deepEqual(sec.writes, []);
  });
  await t("danışan seçici: yalnız bu tenant; arama metni enjeksiyona kapalı", async () => {
    const r = await handleArchiveClients(ctxOf(sec), { q: "ayşe" });
    const b = (r as unknown as { body: { clients: { id: string }[] } }).body;
    assert.equal(b.clients.length, 2);
    assert.ok(!b.clients.some((c) => c.id === cOther.id));
    const inj = await handleArchiveClients(ctxOf(sec), { q: "a%,id.eq.x)" });
    assert.equal((inj as { status: number }).status, 200);
  });

  console.log("\nE. Yürütücü");
  const mkPlan = (jobs: ArchiveJob[]): ArchivePlanResponse => ({
    ok: true, version: 1, archive_id: uid("ar"), created_at: "2026-11-09T10:00:00.000Z", file_name: "yasam-arsiv-2026-11-09.zip",
    options: opt(), jobs, summary: [{ module: "clients", label: "Danışan Yolculuğu", records: 3, tables: [] }],
    excluded: [{ scope: "Doğaltaş › Taşlar", reason: "danışana bağlı olmayan kayıt" }], warnings: [],
  });
  const fileResp = (name: string, body: string, headers: Record<string, string> = {}): PartResponse => ({
    status: 200, isFile: true, header: (n) => (n === "X-Archive-File-Name" ? encodeURIComponent(name) : headers[n] ?? null),
    json: async () => ({}), bytes: async () => new TextEncoder().encode(body),
  });
  const jsonResp = (status: number, body: unknown, headers: Record<string, string> = {}): PartResponse => ({
    status, isFile: false, header: (n) => headers[n] ?? null, json: async () => body, bytes: async () => new Uint8Array(),
  });
  const noSleep = async () => undefined;
  await t("başarılı: veri bölümleri + rapor + dosya; BENİOKU ve ARŞİV-RAPORU; durum TAMAMLANDI", async () => {
    const plan = mkPlan([
      { kind: "data", module: "clients", label: "Danışan Yolculuğu — kayıt dökümü", folder: "Kayıt Dökümü (Word)/01 Danışan Yolculuğu", expected: 3 },
      { kind: "client_dossier", clientId: uid("c"), label: "Danışan dosyası — Ayşe", folder: "Danışan Dosyaları/Ayşe" },
      { kind: "file", source: "analysis_image", rowId: uid("f"), index: 0, label: "Analiz görseli.png", folder: "Fotoğraf ve Ekler/Ayşe/Analiz görselleri" },
    ]);
    let call = 0;
    const res = await runArchive(plan, {
      sleep: noSleep,
      postPart: async (body) => {
        const b = body as { job: ArchiveJob; state?: string | null };
        if (b.job.kind === "data") {
          call++;
          return call === 1 ? fileResp("Bölüm 1.docx", "a", { "X-Archive-Rows": "2", "X-Archive-Next": "s2" }) : fileResp("Bölüm 2.docx", "b", { "X-Archive-Rows": "1", "X-Archive-Next": "" });
        }
        if (b.job.kind === "file") return jsonResp(200, { ok: true, url: "https://storage.test/x", file_name: "Analiz görseli.png" });
        return fileResp("Ayşe — Tam Rapor.docx", "dossier");
      },
      getFile: async () => new Uint8Array([1, 2, 3]),
    });
    assert.equal(res.status, "complete");
    assert.deepEqual([res.counts.ok, res.counts.failed, res.counts.records, res.counts.files], [3, 0, 3, 4]);
    const zip = await JSZip.loadAsync(Buffer.concat(res.parts.map((p) => Buffer.from(p))));
    const names = Object.keys(zip.files);
    assert.ok(names.includes("Yaşam Arşivi 2026-11-09/Kayıt Dökümü (Word)/01 Danışan Yolculuğu/Bölüm 2.docx"), names.join("\n"));
    assert.ok(names.includes("Yaşam Arşivi 2026-11-09/Fotoğraf ve Ekler/Ayşe/Analiz görselleri/Analiz görseli.png"));
    const readme = await zip.file("Yaşam Arşivi 2026-11-09/BENİOKU.txt")!.async("string");
    assert.ok(readme.includes("TAMAMLANDI") && readme.includes("Geri yüklenemez") && readme.includes("Doğaltaş › Taşlar"), readme);
  });
  await t("eksik veri (okunan ≠ plan) BAŞARISIZ sayılır; durum EKSİK; rapor dosyasında yazılı", async () => {
    const plan = mkPlan([
      { kind: "data", module: "clients", label: "Danışan Yolculuğu — kayıt dökümü", folder: "K", expected: 5 },
      { kind: "client_dossier", clientId: uid("c"), label: "Danışan dosyası — Ali", folder: "D" },
    ]);
    const res = await runArchive(plan, {
      sleep: noSleep,
      postPart: async (body) => ((body as { job: ArchiveJob }).job.kind === "data" ? fileResp("B1.docx", "x", { "X-Archive-Rows": "4" }) : fileResp("Ali.docx", "y")),
      getFile: async () => new Uint8Array(),
    });
    assert.equal(res.status, "partial");
    assert.equal(res.counts.failed, 1);
    const zip = await JSZip.loadAsync(Buffer.concat(res.parts.map((p) => Buffer.from(p))));
    const rep = await zip.file("Yaşam Arşivi 2026-11-09/ARŞİV-RAPORU.txt")!.async("string");
    assert.ok(rep.includes("EKSİK") && rep.includes("4 / 5 kayıt"), rep);
  });
  await t("ağ hatası / 500 / 429 yeniden denenir (Retry-After); kalıcı hata → BAŞARISIZ, hiç başarı yoksa durum BAŞARISIZ", async () => {
    const plan = mkPlan([{ kind: "hd_report", reportId: uid("h"), label: "HD", folder: "R" }]);
    let n = 0;
    const waits: number[] = [];
    const ok = await runArchive(plan, {
      sleep: async (ms) => void waits.push(ms),
      postPart: async () => {
        n++;
        if (n === 1) throw new Error("ağ");
        if (n === 2) return jsonResp(429, { ok: false }, { "Retry-After": "7" });
        return fileResp("HD.docx", "x");
      },
      getFile: async () => new Uint8Array(),
    });
    assert.equal(ok.status, "complete");
    assert.ok(waits.includes(7000), waits.join());
    const bad = await runArchive(plan, { sleep: noSleep, postPart: async () => jsonResp(500, { ok: false }), getFile: async () => new Uint8Array() });
    assert.equal(bad.status, "failed");
    assert.equal(bad.counts.ok, 0);
  });
  await t("atlanan (yetki yok / Android HD) başarısız sayılmaz ama arşiv EKSİK işaretlenir ve raporda görünür; iptal → İPTAL", async () => {
    const plan = mkPlan([
      { kind: "hd_report", reportId: uid("h"), label: "HD raporu", folder: "R" },
      { kind: "client_dossier", clientId: uid("c"), label: "Dosya", folder: "D" },
    ]);
    const res = await runArchive(plan, {
      sleep: noSleep,
      postPart: async (b) => ((b as { job: ArchiveJob }).job.kind === "hd_report" ? jsonResp(200, { ok: false, skipped: true, error: "Android" }) : fileResp("d.docx", "d")),
      getFile: async () => new Uint8Array(),
    });
    assert.equal(res.status, "partial", "kullanıcıya ait içerik atlandıysa arşiv TAMAMLANDI gösterilmez");
    assert.equal(res.counts.skipped, 1);
    const ctrl = new AbortController();
    ctrl.abort();
    const c = await runArchive(plan, { signal: ctrl.signal, sleep: noSleep, postPart: async () => fileResp("x", "x"), getFile: async () => new Uint8Array() });
    assert.equal(c.status, "cancelled");
  });

  await t("büyük arşiv: cilt sınırında otomatik bölünür; her cilt geçerli ZIP; dosyalar kayıpsız; BENİOKU son ciltte", async () => {
    const jobs: ArchiveJob[] = Array.from({ length: 9 }, (_, i) => ({ kind: "client_dossier" as const, clientId: uid("cv"), label: `Dosya ${i}`, folder: "D" }));
    const plan = mkPlan(jobs);
    const vols: { index: number; fileName: string; parts: Uint8Array[] }[] = [];
    const res = await runArchive(plan, {
      sleep: noSleep,
      concurrency: 1,
      maxVolumeBytes: 250_000,
      onVolume: (v) => void vols.push(v),
      postPart: async (b) => fileResp(`${(b as { job: { label: string } }).job.label}.docx`, "x".repeat(100_000)),
      getFile: async () => new Uint8Array(),
    });
    assert.equal(res.status, "complete");
    assert.ok(res.volumes >= 3 && vols.length === res.volumes - 1, `cilt ${res.volumes}/${vols.length}`);
    assert.ok(res.fileName.endsWith(`-cilt-${res.volumes}.zip`) && vols[0].fileName.endsWith("-cilt-1.zip"));
    const names: string[] = [];
    for (const v of [...vols.map((x) => x.parts), res.parts]) {
      const z = await JSZip.loadAsync(Buffer.concat(v.map((p) => Buffer.from(p))), { checkCRC32: true });
      const n = Object.keys(z.files);
      assert.ok(Buffer.concat(v.map((p) => Buffer.from(p))).length <= 250_000 + 110_000, "cilt sınırı aşıldı");
      names.push(...n);
    }
    for (let i = 0; i < 9; i++) assert.ok(names.some((n) => n.endsWith(`/Dosya ${i}.docx`)), `Dosya ${i} kayıp`);
    assert.ok(names.filter((n) => n.endsWith("BENİOKU.txt")).length === 1);
  });
  await t("plan kısıtı (Android HD / yetki yok) → arşiv EKSİK; BENİOKU gerekçeyi yazar", async () => {
    const plan = { ...mkPlan([{ kind: "client_dossier", clientId: uid("c"), label: "Dosya", folder: "D" }]), restricted: [{ scope: "Human Design Word raporları", reason: "Android cihazda HD Word üretilmez" }] };
    const res = await runArchive(plan, { sleep: noSleep, postPart: async () => fileResp("d.docx", "d"), getFile: async () => new Uint8Array() });
    assert.equal(res.status, "partial");
    const zip = await JSZip.loadAsync(Buffer.concat(res.parts.map((p) => Buffer.from(p))));
    const readme = await zip.file("Yaşam Arşivi 2026-11-09/BENİOKU.txt")!.async("string");
    assert.ok(readme.includes("ALINAMAYAN") && readme.includes("Android"));
  });
  await t("görsel: doğrulanamayan yol varsa iş BAŞARISIZ (sessiz eksik yok)", async () => {
    const plan = mkPlan([{ kind: "media", table: "stones", rowId: uid("st"), label: "Taş", folder: "F" }]);
    const res = await runArchive(plan, {
      sleep: noSleep,
      postPart: async (b) => ((b as { index: number }).index === 0 ? jsonResp(200, { ok: true, url: "https://storage.test/x", file_name: "t (1).jpg", total: 1, rejected: 1 }) : jsonResp(200, { ok: true, empty: true, total: 1, rejected: 1 })),
      getFile: async () => new Uint8Array([1]),
    });
    assert.equal(res.counts.failed, 1);
    assert.ok(/doğrulanamadı/.test(res.outcomes[0].message ?? ""));
  });

  console.log("\nE2. Kayıt görselleri (kullanıcıya ait)");
  const med = new FakeDb();
  const [mc] = seedClients(med, 1);
  const png = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9]).toString("base64");
  const stockRow = { id: uid("oi"), tenant_id: TA, photos: [png, png], created_at: "2026-01-01T00:00:00Z" };
  const stoneRow = { id: uid("st"), tenant_id: TA, stone_name: "Ametist", images: [{ file_path: `catalog/${TA}/a.jpg` }, { file_path: `catalog/${TB}/yabanci.jpg` }], created_at: "2026-01-01T00:00:00Z" };
  const otherStone = { id: uid("st"), tenant_id: TB, stone_name: "B taşı", images: [{ file_path: `catalog/${TB}/b.jpg` }] };
  const guide = { id: uid("hg"), tenant_id: TA, title: "Rehber" };
  const foreignGuide = { id: uid("hg"), tenant_id: TB, title: "B" };
  const sect = { id: uid("hs"), guide_id: guide.id, title: "Bölüm", images: [{ file_path: `healing-guides/${TA}/s.jpg` }] };
  const foreignSect = { id: uid("hs"), guide_id: foreignGuide.id, title: "B", images: [{ file_path: `healing-guides/${TB}/s.jpg` }] };
  const wsMine = { id: uid("wa"), tenant_id: TA, user_id: UA, desktop_path: `${TA}/ofis.webp` };
  const wsOther = { id: uid("wa"), tenant_id: TA, user_id: UA2, desktop_path: `${TA}/ofis2.webp` };
  med.rows("oil_inventory").push(stockRow);
  med.rows("stones").push(stoneRow, otherStone);
  med.rows("healing_guides").push(guide, foreignGuide);
  med.rows("healing_guide_sections").push(sect, foreignSect);
  med.rows("expert_workspace_assets").push(wsMine, wsOther);
  (mc as Row).profile_image_url = `https://x.supabase.co/storage/v1/object/public/client-profile/${TA}/p.jpg`;
  const mOpt = opt({ modules: ["clients", "stones", "stok", "sifa_rehberi", "general"], include: { data: false, dossiers: false, reports: false, files: true, sensitive: false } });
  const part = (job: Record<string, unknown>, index = 0, c: ArchiveCtx = ctxOf(med), o: ArchiveOptions = mOpt) => handleArchivePart(c, { options: o, job, index });
  await t("gömülü stok fotoğrafı → dosya (gerçek bayt, görsel türü); sayısı doğru", async () => {
    const r = await part({ kind: "media", table: "oil_inventory", rowId: stockRow.id }, 1);
    assert.equal(r.kind, "file", JSON.stringify((r as { body?: unknown }).body));
    const f = r as { bytes: Uint8Array; contentType?: string; headers: Record<string, string>; fileName: string };
    assert.equal(f.contentType, "image/png");
    assert.equal(f.headers["X-Archive-Media-Total"], "2");
    assert.equal(Buffer.from(f.bytes).toString("hex"), "89504e470909");
    assert.ok(f.fileName.endsWith("(2).png"));
  });
  await t("taş kataloğu: kendi yolu → 60 sn imzalı bağlantı; aynı satırdaki yabancı yol reddedilir ve sayılır", async () => {
    const r = await part({ kind: "media", table: "stones", rowId: stoneRow.id });
    const b = (r as { body: Record<string, unknown> }).body;
    assert.equal(b.ok, true);
    assert.equal(b.total, 1);
    assert.equal(b.rejected, 1);
    assert.ok(med.signed.at(-1) === `dogaltas-photos:catalog/${TA}/a.jpg:60`, med.signed.at(-1));
  });
  await t("başka tenant'ın taşı / Şifa Rehberi bölümü → 404; kendi bölümü → imzalı bağlantı", async () => {
    assert.equal(((await part({ kind: "media", table: "stones", rowId: otherStone.id })) as { status: number }).status, 404);
    assert.equal(((await part({ kind: "media", table: "healing_guide_sections", rowId: foreignSect.id })) as { status: number }).status, 404);
    const ok = (await part({ kind: "media", table: "healing_guide_sections", rowId: sect.id })) as { body: Record<string, unknown> };
    assert.equal(ok.body.ok, true);
    assert.ok(med.signed.at(-1) === `stone-photos:healing-guides/${TA}/s.jpg:60`);
  });
  await t("Kişisel Ofis görseli kullanıcı bazlı: aynı tenant'taki başka kullanıcınınki → 404", async () => {
    assert.equal(((await part({ kind: "media", table: "expert_workspace_assets", rowId: wsOther.id })) as { status: number }).status, 404);
    const mine = (await part({ kind: "media", table: "expert_workspace_assets", rowId: wsMine.id })) as { body: Record<string, unknown> };
    assert.equal(mine.body.ok, true);
  });
  await t("profil fotoğrafı (kendi tenant önekli depolama URL'si) → imzalı bağlantı; danışan seçiminde yalnız seçili danışan", async () => {
    const r = (await part({ kind: "media", table: "clients", rowId: mc.id })) as { body: Record<string, unknown> };
    assert.equal(r.body.ok, true);
    assert.ok(med.signed.at(-1) === `client-profile:${TA}/p.jpg:60`, med.signed.at(-1));
    const filtered = await part({ kind: "media", table: "stones", rowId: stoneRow.id }, 0, ctxOf(med), { ...mOpt, clientIds: [String(mc.id)] });
    assert.equal((filtered as { status: number }).status, 403);
  });
  await t("plan: kullanıcı görselleri iş olarak listelenir; ortak kataloglar ayrı 'kapsam dışı' sınıflandırılır", async () => {
    const r = await handleArchivePlan(ctxOf(med), { options: mOpt });
    const plan = (r as unknown as { body: ArchivePlanResponse }).body;
    const media = plan.jobs.filter((j) => j.kind === "media") as Extract<ArchiveJob, { kind: "media" }>[];
    const tables = new Set(media.map((j) => j.table));
    for (const tname of ["oil_inventory", "stones", "healing_guide_sections", "expert_workspace_assets", "clients"]) assert.ok(tables.has(tname), `${tname} planda yok: ${[...tables].join()}`);
    assert.ok(!media.some((j) => j.rowId === otherStone.id || j.rowId === foreignSect.id || j.rowId === wsOther.id), "başka tenant / kullanıcı satırı planda");
    for (const s2 of ["Doğaltaş Kütüphanesi görselleri", "Mağaza ürün görselleri", "HD Hazır Eğitim Haritaları"]) assert.ok(plan.excluded.some((e) => e.scope === s2), s2);
  });

  console.log("\nF. Denetim kaydı");
  await t("plan 'başlatıldı' + sonuç kaydı: yalnız sayılar / modül anahtarları; danışan adı / kimliği yok", async () => {
    const db = new FakeDb();
    const cs = seedClients(db, 2);
    const o = { modules: ["clients"], clientIds: cs.map((c) => c.id), include: { data: true, dossiers: false, reports: false, files: false } };
    const r = await handleArchivePlan(ctxOf(db), { options: o });
    assert.equal((r as { status: number }).status, 200);
    const plan = (r as unknown as { body: ArchivePlanResponse }).body;
    const fin = await handleArchiveAudit(ctxOf(db), { archive_id: plan.archive_id, result: { status: "complete", ok: 1, failed: 0, skipped: 0, records: 2, bytes: 1234, duration_ms: 50, extra: "AYŞE" } });
    assert.equal((fin as { status: number }).status, 200);
    const ev = db.inserts.filter((x) => x.table === "security_events").map((x) => x.row);
    assert.equal(ev.length, 2);
    assert.ok(ev.every((e) => e.event_type === "data_archive_export" && e.severity === "low" && e.user_id === UA));
    const text = JSON.stringify(ev);
    for (const c of cs) assert.ok(!text.includes(String(c.id)) && !text.includes(String(c.ad)), "kişisel veri denetim kaydına girdi");
    assert.ok(!text.includes("AYŞE"));
    assert.equal((ev[0].metadata as { scope: { client_filter_count: number } }).scope.client_filter_count, 2);
    const bad = await handleArchiveAudit(ctxOf(db), { archive_id: plan.archive_id, result: { status: "tamam" } });
    assert.equal((bad as { status: number }).status, 400);
  });

  console.log("\nG. Gerçek rapor üreticileri (kayıtlı veriden; hesap / sağlayıcı çağrısı yok)");
  const rep = new FakeDb();
  const [rc] = seedClients(rep, 1);
  rep.rows("client_sessions").push({ id: uid("s"), tenant_id: TA, client_id: rc.id, session_date: "2026-03-01", title: "İlk seans", notes: "Seans notu ğüş", created_at: "2026-03-01T09:00:00Z" });
  rep.rows("client_notes").push({ id: uid("n"), tenant_id: TA, client_id: rc.id, notlar: "Genel not", saglik_notu: "SAĞLIK-NOTU-X", created_at: "2026-03-01T09:00:00Z" });
  const nrec = { id: uid("nr"), tenant_id: TA, client_id: rc.id, name: "Ayşe0", surname: "Öztürk", birth_date: "1990-02-28", created_at: "2026-04-01T10:00:00Z", analysis_data: { yasamYolu: 7 } };
  rep.rows("numerology_records").push(nrec);
  const dOpts = opt({ modules: ["clients", "numerology", "human_design", "astrology"], include: { data: false, dossiers: true, reports: true, files: false, sensitive: false } });
  await t("Danışan dosyası: DY Tam Rapor üreticisi; açılabilir Word; danışan adı, notlar ve bağlı Numeroloji kaydı içerikte", async () => {
    const r = await handleArchivePart(ctxOf(rep), { options: dOpts, job: { kind: "client_dossier", clientId: rc.id } });
    assert.equal(r.kind, "file", JSON.stringify((r as { body?: unknown }).body));
    const xml = await docXml((r as { bytes: Uint8Array }).bytes);
    assert.ok(xml.includes("Ayşe0") && xml.includes("Genel not") && xml.includes("Numeroloji — Kayıtlı Analiz"), `içerik eksik: ${xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1500)}`);
    assert.deepEqual(rep.writes, []);
  });
  await t("Numeroloji (bağlı + BAĞSIZ kayıt): modülün kendi Word üreticisi, kayıtlı snapshot; Zamanlama yok; hesap motoru çağrılmaz", async () => {
    const { hesaplaNumeroloji } = await import("../../lib/numeroloji");
    // Fikstür: kaydedilmiş analiz (test ortamında bir kez üretilir); rapor YALNIZ bu kayıtlı anlık görüntüden okunur.
    const motor = hesaplaNumeroloji({ firstName: "Elif", lastName: "Kaya", birthDate: "14.02.1987" });
    const loose = { id: uid("nl"), tenant_id: TA, client_id: null, name: "Elif", surname: "Kaya", birth_date: "1987-02-14", created_at: "2026-05-02T10:00:00Z", analysis_data: { version: 1, motor, summary: "KAYITLI-OZET-BAGSIZ" } };
    rep.rows("numerology_records").push(loose);
    // Yeniden hesap olmadığının kanıtı: kayıtlı anlık görüntüye motorun ASLA üretemeyeceği bir değer yazılır
    // (İfade Sayısı 4444). Rapor bu değeri gösterirse kaynak kayıttır; motor yeniden çalışsaydı gerçek değer çıkardı.
    // (geçerli aralıkta ama motorun bu isim/doğum için üretmediği İfade Sayısı → rapor kayıttaki değeri göstermeli).
    const realIfade = (motor as unknown as { ifadeSayisi: { display: string; key: string } }).ifadeSayisi;
    const savedIfade = realIfade.display === "5" ? 6 : 5;
    (loose.analysis_data.motor as unknown as Record<string, unknown>).ifadeSayisi = { ...realIfade, display: String(savedIfade), key: String(savedIfade) };
    const r = await handleArchivePart(ctxOf(rep), { options: dOpts, job: { kind: "numerology_record", clientId: null, recordId: loose.id } });
    assert.equal(r.kind, "file", JSON.stringify((r as { body?: unknown }).body));
    const xml = await docXml((r as { bytes: Uint8Array }).bytes);
    assert.ok((r as { fileName: string }).fileName.startsWith("Numeroloji — Elif Kaya"));
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const shown = /İFADE SAYISI (\d+)/.exec(text)?.[1];
    assert.ok(text.includes("Elif Kaya") && text.includes("KAYITLI-OZET-BAGSIZ"), `kayıtlı içerik yok: ${text.slice(0, 600)}`);
    assert.equal(Number(shown), savedIfade, `İfade Sayısı kayıttaki değer (${savedIfade}) değil, gösterilen ${shown} — yeniden hesap?`);
    assert.ok(!/Zamanlama &amp; Gelişim|Zamanlama & Gelişim/.test(xml), "Zamanlama bölümü arşive girmemeli");
    const linked = await handleArchivePart(ctxOf(rep), { options: dOpts, job: { kind: "numerology_record", clientId: rc.id, recordId: nrec.id } });
    assert.ok(linked.kind === "file" || (linked as unknown as { body: { skipped: boolean } }).body.skipped === true, JSON.stringify((linked as { body?: unknown }).body));
    const wrongClient = await handleArchivePart(ctxOf(rep), { options: dOpts, job: { kind: "numerology_record", clientId: rc.id, recordId: loose.id } });
    assert.equal((wrongClient as { status: number }).status, 404, "kayıt başka danışana bağlıymış gibi istenemez");
    const filtered = await handleArchivePart(ctxOf(rep), { options: { ...dOpts, clientIds: [String(rc.id)] }, job: { kind: "numerology_record", clientId: null, recordId: loose.id } });
    assert.equal((filtered as { status: number }).status, 403, "danışan seçiminde bağsız kayıt kapsam dışı");
    const noPerm = await handleArchivePart(ctxOf(rep, { profile: { role: "expert", module_permissions: { clients: true } } }), { options: dOpts, job: { kind: "numerology_record", clientId: null, recordId: loose.id } });
    assert.equal((noPerm as unknown as { body: { skipped: boolean } }).body.skipped, true);
    const other = await handleArchivePart(ctxOf(rep, { tenantId: TB }), { options: dOpts, job: { kind: "numerology_record", clientId: null, recordId: loose.id } });
    assert.equal((other as { status: number }).status, 404);
  });
  await t("HD profesyonel raporu (v1 snapshot): açılabilir Word; Android'de ATLANIR; başka tenant → 404", async () => {
    const { buildReportSnapshot } = await import("../../lib/human-design/reporting/reportSnapshot");
    const { buildPersonalKnowledgeStructure } = await import("../../lib/human-design/knowledge/personalKnowledge");
    const s = buildPersonalKnowledgeStructure({ type_code: "generator", authority_code: "sacral", gates: [5], channels: [] } as never);
    const rec = new Map<string, unknown>();
    for (const k of s.allKeys) rec.set(k, { meta: { contentId: "c", entityId: "e", entityKind: k.startsWith("tip_") ? "tip" : k.startsWith("otorite_") ? "otorite" : "kapi", canonicalKey: k, version: 1 }, content: { general_description: `ARŞİV::${k}`, report_text: "rt", strategy_text: null, signature_text: null, not_self_text: null, decision_mechanism: null, application_text: null, caution_notes: null, general_theme: null, full_channel_text: null, hanging_gate_context: null } });
    const snap = buildReportSnapshot({ generatedAt: "2026-08-23T10:00:00.000Z", readAt: "2026-08-23T10:00:00.000Z", client: { name: "Arşiv Danışanı" }, chart: { chartId: uid("ch"), source: "manual" }, structure: s, recordByKey: rec as never });
    const rid = uid("hr");
    rep.rows("human_design_reports").push({ id: rid, tenant_id: TA, client_id: null, title: "HD", report_kind: "canonical", snapshot: snap, created_at: "2026-08-23T10:00:00Z" });
    const ok = await handleArchivePart(ctxOf(rep), { options: dOpts, job: { kind: "hd_report", reportId: rid } });
    assert.equal(ok.kind, "file", JSON.stringify((ok as { body?: unknown }).body));
    const xml = await docXml((ok as { bytes: Uint8Array }).bytes);
    assert.ok(xml.includes("ARŞİV::tip_generator") && !/roxy/i.test(xml));
    const android = await handleArchivePart(ctxOf(rep, { isAndroid: true }), { options: dOpts, job: { kind: "hd_report", reportId: rid } });
    assert.equal((android as unknown as { body: { skipped: boolean } }).body.skipped, true);
    const other = await handleArchivePart(ctxOf(rep, { tenantId: TB }), { options: dOpts, job: { kind: "hd_report", reportId: rid } });
    assert.equal((other as { status: number }).status, 404);
  });
  await t("plan: danışan dosyası / Numeroloji / HD işleri listelenir; Android'de HD kısıtlı içerik olarak (arşiv EKSİK) yazılır", async () => {
    const r = await handleArchivePlan(ctxOf(rep), { options: dOpts });
    const plan = (r as unknown as { body: ArchivePlanResponse }).body;
    const kinds = plan.jobs.map((j) => j.kind);
    assert.ok(kinds.includes("client_dossier") && kinds.includes("numerology_record") && kinds.includes("hd_report"), kinds.join());
    const a = await handleArchivePlan(ctxOf(rep, { isAndroid: true }), { options: dOpts });
    const ap = (a as unknown as { body: ArchivePlanResponse }).body;
    assert.ok(!ap.jobs.some((j) => j.kind === "hd_report") && (ap.restricted ?? []).some((e) => /Android/.test(e.reason)));
  });

  console.log(`\narchive harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error("harness çöktü:", e);
  process.exit(1);
});
