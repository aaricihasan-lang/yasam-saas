/**
 * FAZ1 Final Hardening / PAKET BACKUP — yedek / geri yükleme / dışa aktarım harness'i.
 * Çalıştırma: npx tsx scripts/final-hardening/backup.harness.ts
 *
 * DB/ağ YOK: sayfa başına en fazla N satır döndüren (PostgREST max-rows benzetimi) sahte DB.
 * Kapsam:
 *  - registry kapsam: migration CREATE TABLE + .hardening/prod-tables.md + kod `.from()` → sınıflandırılmamış = FAIL
 *  - generated kolon izin listesinde = FAIL; FK döngüsü / eksik ebeveyn / migration FK'si registry'de yok = FAIL
 *  - schema.generated.ts migration'larla senkron (drift = FAIL)
 *  - 1000-satır sınırlı DB ile >2500 satır roundtrip + tablo hash eşitliği; 300-satır sınırıyla da (kısa sayfa ≠ bitti)
 *  - tekrar restore → hepsi already_present; v2.1 + support_messages kabul (400 yok)
 *  - saldırgan: sahte tenant_id / bilinmeyen kolon / başka tenant FK / başka tenant storage yolu /
 *    lisanssız modül / üyelik pasif / başka tenant id çakışması; UPDATE/DELETE hiç çağrılmaz
 *  - Word arşivi: tam metin, UUID gizli, bütçe aşımı dürüst hata
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BACKUP_REGISTRY,
  getRegistryEntry,
  isExportable,
  isOperationalBackupTable,
  topologicalOrder,
} from "../../lib/backup/registry";
import { denyColumnsFor, PROD_GENERATED_COLUMNS, restoreAllowlist } from "../../lib/backup/columns";
import { MIGRATION_SCHEMA } from "../../lib/backup/schema.generated";
import { exportTableAll, fetchTablePage, restoreChunk, type RestoreContext } from "../../lib/backup/engine";
import {
  buildBackupPlan,
  handleBackupTableRequest,
  handleFullRestore,
  handleRestoreChunk,
  handleRestorePlan,
} from "../../lib/backup/service";
import { runBackup, runRestore, serializeBackupParts, type JsonFetcher } from "../../lib/backup/client";
import { chunkRows, normalizeBackupFile, sortSelfReferencing } from "../../lib/backup/format";
import { findForeignStoragePath } from "../../lib/backup/storagePaths";
import { buildArchiveDocx, WordBudgetError, WORD_RECORD_BUDGET } from "../../lib/backup/wordExport";
import { SYSTEM_NUTRITION_TENANT_ID } from "../../lib/beslenme/systemTenant";
import { parseMigrationsWithDynamic } from "./backup-schema-parse";
import { renderSchemaModule } from "./backup-schema-gen";

const ROOT = process.cwd();
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

// ─── Sahte DB ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type TableDef = {
  columns: Set<string> | null;
  generated: Record<string, (r: Row) => unknown>;
  pk: string[];
  check?: (r: Row) => boolean;
};

/** Legacy (repo dışı şemalı) tablolar için sahte kolon setleri. */
const LEGACY_COLUMNS: Record<string, string[]> = {
  clients: ["id", "tenant_id", "ad", "soyad", "telefon", "notlar", "gorusme", "created_at", "updated_at"],
  client_notes: ["id", "tenant_id", "client_id", "notlar", "saglik_notu", "adres", "oneriler", "created_at"],
  appointments: ["id", "tenant_id", "client_id", "appointment_date", "status", "note", "created_at"],
  client_stone_photos: ["id", "tenant_id", "client_id", "stone_id", "image_url", "file_path", "created_at"],
  client_stones: ["id", "tenant_id", "client_id", "stone_name", "stone_date", "created_at"],
  bioenergy_chakras: ["id", "tenant_id", "name", "element", "created_at", "updated_at", "origin_type", "origin_label", "origin_source_id", "origin_transfer_batch_id", "transferred_at"],
  healing_guides: ["id", "tenant_id", "title", "images", "created_at", "updated_at"],
  stones: ["id", "tenant_id", "stone_name", "images", "general_info", "created_at", "updated_at"],
};

class FakeDb {
  tables = new Map<string, Row[]>();
  defs = new Map<string, TableDef>();
  cap: number;
  forbidden: string[] = [];
  upsertCalls = 0;
  ignoreDupViolations = 0;
  generatedWrites = 0;
  constructor(cap: number) {
    this.cap = cap;
  }
  def(table: string): TableDef {
    let d = this.defs.get(table);
    if (!d) {
      const schema = MIGRATION_SCHEMA[table];
      const cols = schema ? new Set(schema.columns) : LEGACY_COLUMNS[table] ? new Set(LEGACY_COLUMNS[table]) : null;
      const gen: Record<string, (r: Row) => unknown> = {};
      for (const g of [...(schema?.generated ?? []), ...(PROD_GENERATED_COLUMNS[table] ?? [])]) {
        gen[g] = (r) => `gen:${String(r.name ?? r.title ?? r.id ?? "")}`.toLowerCase();
      }
      d = { columns: cols, generated: gen, pk: getRegistryEntry(table)?.pk.slice() ?? ["id"] };
      this.defs.set(table, d);
    }
    return d;
  }
  rows(table: string): Row[] {
    let r = this.tables.get(table);
    if (!r) {
      r = [];
      this.tables.set(table, r);
    }
    return r;
  }
  seed(table: string, rows: Row[]) {
    const d = this.def(table);
    for (const r of rows) {
      const full = { ...r };
      for (const [g, fn] of Object.entries(d.generated)) full[g] = fn(full);
      this.rows(table).push(full);
    }
  }
  from(table: string) {
    return new FakeQuery(this, table);
  }
}

type Filter = { kind: "eq" | "in" | "gt"; col: string; val: unknown };

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private orderCol: string | null = null;
  private lim: number | null = null;
  private cols = "*";
  private head = false;
  private count = false;
  private upsertRows: Row[] | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.cols = cols;
    this.head = !!opts?.head;
    this.count = opts?.count === "exact";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ kind: "in", col, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ kind: "gt", col, val });
    return this;
  }
  order(col: string) {
    this.orderCol = col;
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  upsert(rows: Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.upsertRows = rows;
    this.upsertOpts = opts;
    return this;
  }
  update() {
    this.db.forbidden.push(`update:${this.table}`);
    throw new Error("UPDATE yasak");
  }
  delete() {
    this.db.forbidden.push(`delete:${this.table}`);
    throw new Error("DELETE yasak");
  }
  insert() {
    this.db.forbidden.push(`insert-nonidempotent:${this.table}`);
    throw new Error("insert yerine upsert(ignoreDuplicates) bekleniyor");
  }
  private match(r: Row): boolean {
    return this.filters.every((f) => {
      if (f.kind === "eq") return r[f.col] === f.val;
      if (f.kind === "in") return (f.val as unknown[]).map(String).includes(String(r[f.col]));
      return r[f.col] !== null && r[f.col] !== undefined && cmp(r[f.col], f.val) > 0;
    });
  }
  private colError(cols: string[]): unknown {
    const d = this.db.def(this.table);
    if (!d.columns) return null;
    const known = new Set([...d.columns, ...Object.keys(d.generated)]);
    for (const c of cols) if (!known.has(c)) return { code: "42703", message: `column ${c} does not exist` };
    return null;
  }
  private exec(): { data: unknown; error: unknown; count?: number | null } {
    const d = this.db.def(this.table);
    if (this.upsertRows) {
      this.db.upsertCalls++;
      if (this.upsertOpts.ignoreDuplicates !== true) this.db.ignoreDupViolations++;
      const conflict = (this.upsertOpts.onConflict ?? "id").split(",");
      const all = this.db.rows(this.table);
      // Statement-level: kolon hatası / generated yazımı / check ihlali → tüm ifade düşer
      for (const r of this.upsertRows) {
        const err = this.colError(Object.keys(r));
        if (err) return { data: null, error: err };
        for (const g of Object.keys(d.generated)) {
          if (g in r) {
            this.db.generatedWrites++;
            return { data: null, error: { code: "428C9", message: `cannot insert into generated column ${g}` } };
          }
        }
        if (d.check && !d.check(r)) return { data: null, error: { code: "23514", message: "check violation" } };
      }
      const inserted: Row[] = [];
      for (const r of this.upsertRows) {
        const exists = all.some((x) => conflict.every((c) => String(x[c]) === String(r[c])));
        if (exists) continue;
        const full = { ...r };
        for (const [g, fn] of Object.entries(d.generated)) full[g] = fn(full);
        all.push(full);
        inserted.push(full);
      }
      const cols = this.cols === "*" ? null : this.cols.split(",").map((c) => c.trim());
      return {
        data: inserted.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { ...r })),
        error: null,
      };
    }
    const cols = this.cols === "*" ? null : this.cols.split(",").map((c) => c.trim());
    if (cols) {
      const err = this.colError(cols);
      if (err) return { data: null, error: err };
    }
    let rows = this.db.rows(this.table).filter((r) => this.match(r));
    if (this.head) return { data: null, error: null, count: this.count ? rows.length : null };
    if (this.orderCol) {
      const oc = this.orderCol;
      rows = rows.slice().sort((a, b) => cmp(a[oc], b[oc]));
    }
    const lim = Math.min(this.lim ?? Number.MAX_SAFE_INTEGER, this.db.cap);
    rows = rows.slice(0, lim);
    return {
      data: rows.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { ...r })),
      error: null,
    };
  }
  then<A = { data: unknown; error: unknown }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    try {
      return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
    } catch (e) {
      return Promise.reject(e).then(onfulfilled, onrejected);
    }
  }
}

const asDb = (f: FakeDb) => f as unknown as SupabaseClient;

// ─── Fixture ──────────────────────────────────────────────────────────────────

const TA = "aaaaaaaa-0000-4000-8000-00000000000a";
const TB = "bbbbbbbb-0000-4000-8000-00000000000b";
const UA = "aaaaaaaa-1111-4000-8000-00000000000a";
let seq = 0;
function uid(prefix: string): string {
  seq++;
  const n = seq.toString(16).padStart(12, "0");
  return `${prefix.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${n}`;
}

const ALL_MODULES = {
  clients: true, appointments: true, numerology: true, stones: true, stok: true, sifa_rehberi: true,
  energy_body: true, reflexology: true, aromatherapy: true, personal_archive: true, human_design: true,
  cupping: true, beslenme: true, cosmic_calendar: true,
};
const ctxA = (over: Partial<RestoreContext> = {}): RestoreContext => ({
  tenantId: TA,
  userId: UA,
  role: "expert",
  modulePermissions: ALL_MODULES,
  membershipActive: true,
  ...over,
});

function seedSource(db: FakeDb) {
  const clientsA: Row[] = [];
  for (let i = 0; i < 2600; i++) {
    clientsA.push({ id: uid("c1"), tenant_id: TA, ad: `Danışan ${i}`, soyad: "Şahin", telefon: null, notlar: "ı ğ ü ş ö ç", created_at: "2026-09-01T10:00:00Z" });
  }
  db.seed("clients", clientsA);
  db.seed("clients", [{ id: uid("cb"), tenant_id: TB, ad: "B danışanı", soyad: "X", created_at: "2026-09-01T10:00:00Z" }]);
  db.seed(
    "client_notes",
    clientsA.slice(0, 120).map((c) => ({ id: uid("n1"), tenant_id: TA, client_id: c.id, notlar: "{}", saglik_notu: "iyi", created_at: "2026-09-02T10:00:00Z" })),
  );
  db.seed(
    "appointments",
    clientsA.slice(0, 60).map((c) => ({ id: uid("a1"), tenant_id: TA, client_id: c.id, appointment_date: "2026-09-27T07:00:00Z", status: "bekliyor" })),
  );
  const chakras = Array.from({ length: 12 }, (_, i) => ({ id: uid("ch"), tenant_id: TA, name: `Çakra ${i}`, element: "su" }));
  db.seed("bioenergy_chakras", chakras);
  const blocks: Row[] = [];
  for (let i = 0; i < 1400; i++) {
    blocks.push({ id: uid("bk"), tenant_id: TA, chakra_id: chakras[i % 12].id, section_key: "genel", block_type: "text", sort_order: i, source_excerpt: `metin ${i}` });
  }
  db.seed("bioenergy_chakra_blocks", blocks);
  const sheets = Array.from({ length: 3 }, (_, i) => ({ id: uid("sh"), tenant_id: TA, sheet_name: `S${i}`, display_title: `Sayfa ${i}`, headers: ["A", "B"], sort_order: i, is_active: true }));
  db.seed("aromatherapy_reference_sheets", sheets);
  const sheetB = { id: uid("sb"), tenant_id: TB, sheet_name: "SB", display_title: "B", headers: [], sort_order: 0, is_active: true };
  db.seed("aromatherapy_reference_sheets", [sheetB]);
  const refRows: Row[] = [];
  for (let i = 0; i < 1200; i++) refRows.push({ id: uid("rr"), sheet_id: sheets[i % 3].id, row_index: i, cells: { "0": `a${i}`, "1": `b${i}` }, is_header: false });
  db.seed("aromatherapy_reference_rows", refRows);
  db.seed("aromatherapy_reference_rows", [{ id: uid("rb"), sheet_id: sheetB.id, row_index: 0, cells: {}, is_header: false }]);
  const guides = Array.from({ length: 5 }, (_, i) => ({ id: uid("hg"), tenant_id: TA, title: `Rehber ${i}`, images: [{ id: "i1", file_path: `healing-guides/${TA}/g/x.png` }] }));
  db.seed("healing_guides", guides);
  db.seed(
    "healing_guide_sections",
    Array.from({ length: 30 }, (_, i) => ({ id: uid("hs"), guide_id: guides[i % 5].id, section_type: "not", mode: "text", title: `B${i}`, note: "n", sort_order: i })),
  );
  db.seed("stones", Array.from({ length: 10 }, (_, i) => ({ id: uid("st"), tenant_id: TA, stone_name: `Taş ${i}`, images: [{ id: "x", name: "a", file_path: `catalog/${TA}/p${i}.png` }] })));
  db.seed("aromatherapy_oils", Array.from({ length: 5 }, (_, i) => ({ id: uid("oi"), tenant_id: TA, name: `Lavanta ${i}`, oil_type: "essential", is_active: true })));
  db.seed("support_messages", [{ id: uid("sm"), user_id: UA, tenant_id: TA, subject: "Soru", message: "Merhaba", priority: "normal", status: "open" }]);
  db.seed("human_design_clients", [{ id: uid("hc"), tenant_id: TA, user_id: UA, name: "HD danışan" }]);
}

function tableHash(rows: Row[], pk: string, drop: Set<string>): string {
  const norm = rows
    .map((r) => {
      const o: Row = {};
      for (const k of Object.keys(r).sort()) if (!drop.has(k)) o[k] = r[k];
      return o;
    })
    .sort((a, b) => cmp(a[pk], b[pk]));
  return createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

type PageLog = { table: string; rows: number; done: boolean };

function serviceFetcher(db: FakeDb, ctx: RestoreContext, log?: PageLog[]): JsonFetcher {
  return async (url, init) => {
    const u = new URL(url, "http://local");
    const body = init?.body !== undefined ? (JSON.parse(JSON.stringify(init.body)) as Record<string, unknown>) : {};
    let status = 200;
    let json: unknown;
    if (u.pathname === "/api/settings/backup") json = buildBackupPlan(ctx.tenantId, new Date("2026-09-26T22:30:00Z"));
    else if (u.pathname === "/api/settings/backup/table") {
      const r = await handleBackupTableRequest(asDb(db), ctx.tenantId, u.searchParams.get("name"), u.searchParams.get("cursor"));
      status = r.status;
      json = r.body;
      const b = r.body as { table: string; rows: Row[]; done: boolean };
      log?.push({ table: b.table, rows: b.rows.length, done: b.done });
    } else if (u.pathname === "/api/settings/restore") {
      const r = body.mode === "plan" ? handleRestorePlan(ctx, body) : await handleFullRestore(asDb(db), ctx, body.backup);
      status = r.status;
      json = r.body;
    } else if (u.pathname === "/api/settings/restore/chunk") {
      const r = await handleRestoreChunk(asDb(db), ctx, body);
      status = r.status;
      json = r.body;
    } else {
      status = 404;
      json = { error: "yok" };
    }
    return { ok: status < 400, status, json: JSON.parse(JSON.stringify(json)) };
  };
}

// ─── Kapsam yardımcıları ──────────────────────────────────────────────────────

function prodTableNames(): { names: string[]; patterns: RegExp[]; tenantTables: Set<string> } {
  const text = readFileSync(join(ROOT, ".hardening/prod-tables.md"), "utf8");
  const sec1 = text.split("## tenant_id kolonu OLAN")[1].split("## tenant_id OLMAYAN")[0].replace(/^[^\n]*\n/, "");
  const sec2 = text.split("## tenant_id OLMAYAN public tablolar")[1].split("## Önemli FK")[0];
  const names = new Set<string>();
  const tenantTables = new Set<string>();
  const patterns: RegExp[] = [];
  for (const m of sec1.matchAll(/(?:^|·)\s*([a-z_][a-z0-9_]*)\s/gm)) {
    names.add(m[1]);
    tenantTables.add(m[1]);
  }
  for (const part of sec2.split("·")) {
    const s = part.trim();
    const brace = /^([a-z_]+)\{([a-z_,]+)\}/.exec(s);
    if (brace) {
      for (const x of brace[2].split(",")) names.add(brace[1] + x);
      continue;
    }
    const star = /^([a-z_]+)\*/.exec(s);
    if (star) {
      patterns.push(new RegExp(`^${star[1]}`));
      continue;
    }
    const m = /^([a-z_][a-z0-9_]*)/.exec(s);
    if (m) names.add(m[1]);
  }
  return { names: [...names], patterns, tenantTables };
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
}

function codeFromTables(): string[] {
  const files: string[] = [];
  for (const d of ["app", "lib", "components", "hooks"]) walk(join(ROOT, d), files);
  const names = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(storage\s*\.\s*)?\.from\(\s*["'`]([a-z][a-z0-9_]*)["'`]\s*\)/g)) {
      if (m[1]) continue; // storage bucket
      if (!m[2].includes("_") && !["clients", "stones", "minerals", "combinations", "users", "tenants", "appointments"].includes(m[2])) continue;
      names.add(m[2]);
    }
  }
  return [...names].sort();
}

// ─── Testler ──────────────────────────────────────────────────────────────────

(async () => {
  // 1) Registry kapsam
  await t("registry: tablo adları tekil", () => {
    const seen = new Set<string>();
    for (const e of BACKUP_REGISTRY) {
      assert.ok(!seen.has(e.table), `tekrar: ${e.table}`);
      seen.add(e.table);
    }
  });

  const prod = prodTableNames();
  await t("registry: prod-tables.md'deki her tablo sınıflandırılmış", () => {
    assert.ok(prod.names.length > 150, `prod listesi ayrıştırılamadı (${prod.names.length})`);
    const missing = prod.names.filter((n) => !getRegistryEntry(n));
    assert.deepEqual(missing, [], `sınıflandırılmamış: ${missing.join(", ")}`);
  });
  await t("registry: prod wildcard (hd_canonical_*, yebs_*) kapsanıyor", () => {
    const mig = parseMigrationsWithDynamic(join(ROOT, "supabase/migrations"));
    for (const re of prod.patterns) {
      const fromMig = [...mig.keys()].filter((k) => re.test(k));
      assert.ok(fromMig.length > 0, `desen boş: ${re}`);
      for (const k of fromMig) assert.ok(getRegistryEntry(k), `sınıflandırılmamış: ${k}`);
    }
  });
  await t("registry: migration CREATE TABLE tablolarının hepsi sınıflandırılmış", () => {
    const mig = parseMigrationsWithDynamic(join(ROOT, "supabase/migrations"));
    const missing = [...mig.keys()].filter((n) => !getRegistryEntry(n));
    assert.deepEqual(missing, [], `sınıflandırılmamış: ${missing.join(", ")}`);
  });
  await t("registry: koddaki .from() tabloları sınıflandırılmış", () => {
    const names = codeFromTables();
    assert.ok(names.length > 80, `kod taraması şüpheli (${names.length})`);
    const missing = names.filter((n) => !getRegistryEntry(n));
    assert.deepEqual(missing, [], `sınıflandırılmamış: ${missing.join(", ")}`);
  });
  await t("registry: _bak_* excluded ve asla dışa aktarılmaz", () => {
    const baks = BACKUP_REGISTRY.filter((e) => e.table.startsWith("_bak_"));
    assert.equal(baks.length, 3);
    for (const e of baks) {
      assert.equal(e.class, "excluded");
      assert.ok(!isExportable(e));
      assert.ok(isOperationalBackupTable(e.table));
    }
    assert.ok(!buildBackupPlan(TA).tables.some((x) => x.table.startsWith("_bak_")));
  });
  await t("registry: prod'da tenant_id olan dışa aktarılabilir tablolar direct, olmayanlar child_of", () => {
    for (const e of BACKUP_REGISTRY.filter(isExportable)) {
      if (prod.tenantTables.has(e.table)) assert.equal(e.tenantScope, "direct", e.table);
      else if (prod.names.includes(e.table)) assert.equal(e.class, "child_of", e.table);
    }
  });
  await t("registry: generated kolon restore izin listesinde değil", () => {
    for (const e of BACKUP_REGISTRY.filter(isExportable)) {
      const allow = restoreAllowlist(e);
      const gen = new Set([
        ...(MIGRATION_SCHEMA[e.table]?.generated ?? []),
        ...(PROD_GENERATED_COLUMNS[e.table] ?? []),
        "search_tsv",
      ]);
      for (const g of gen) {
        assert.ok(denyColumnsFor(e).has(g), `${e.table}.${g} deny listesinde değil`);
        if (allow) assert.ok(!allow.includes(g), `${e.table}.${g} izin listesinde!`);
      }
    }
    // prod-doğrulanmış generated kolonların tablosu registry'de olmalı
    for (const tbl of Object.keys(PROD_GENERATED_COLUMNS)) assert.ok(getRegistryEntry(tbl), tbl);
  });
  await t("registry: keyset tek kolon + FK ebeveynleri bilinen tablolar + topolojik sıra", () => {
    const order = topologicalOrder().map((e) => e.table);
    const pos = new Map(order.map((n, i) => [n, i]));
    for (const e of BACKUP_REGISTRY.filter(isExportable)) {
      assert.equal(e.orderBy.length, 1, `${e.table} orderBy`);
      assert.ok(e.pk.filter((c) => c !== "tenant_id").length <= 1, `${e.table} pk`);
      for (const p of e.fkParents) {
        const pe = getRegistryEntry(p.table);
        assert.ok(pe, `${e.table}.${p.column} → bilinmeyen ${p.table}`);
        if (isExportable(pe!)) {
          if (p.table !== e.table) assert.ok(pos.get(p.table)! < pos.get(e.table)!, `${p.table} ${e.table}'den önce olmalı`);
        } else {
          assert.ok(p.optional, `${e.table}.${p.column}: yedek dışı ebeveyn (${p.table}) yalnız optional olabilir`);
        }
      }
      if (typeof e.tenantScope === "object") {
        const pe = getRegistryEntry(e.tenantScope.parent);
        assert.ok(pe && pe.tenantScope === "direct" && isExportable(pe), `${e.table} ebeveyni tenant'lı olmalı`);
      }
    }
  });
  await t("registry: FK döngüsü tespit edilir", () => {
    const a = { ...getRegistryEntry("clients")!, table: "x_a", fkParents: [{ column: "b_id", table: "x_b" }] };
    const b = { ...getRegistryEntry("clients")!, table: "x_b", fkParents: [{ column: "a_id", table: "x_a" }] };
    assert.throws(() => topologicalOrder([a, b]), /döngü/);
  });
  await t("registry: migration FK'leri (yedek tabloları arası) fkParents'ta", () => {
    const mig = parseMigrationsWithDynamic(join(ROOT, "supabase/migrations"));
    // Bilinçli istisnalar: composite (tenant, protocol, point) referansı non-id kolona (DB zorlar; satır
    // izolasyonunda fk_violation olarak raporlanır) ve aynı tabloya işaret eden selfRef'ler.
    const EXCEPT = new Set([
      "cupping_protocol_steps.ref_point_id",
      "cupping_protocol_steps.ref_technique_id",
    ]);
    const missing: string[] = [];
    for (const [name, tbl] of mig) {
      const e = getRegistryEntry(name);
      if (!e || !isExportable(e)) continue;
      for (const f of tbl.foreignKeys) {
        const pe = getRegistryEntry(f.refTable);
        if (!pe || !isExportable(pe)) continue;
        const idIdx = f.refColumns.indexOf("id");
        const col = idIdx >= 0 ? f.columns[idIdx] : f.columns[f.columns.length - 1];
        if (!col) continue;
        const key = `${name}.${col}`;
        if (EXCEPT.has(key)) continue;
        if (f.refTable === name && e.selfRef === col) continue;
        const covered =
          e.fkParents.some((p) => p.column === col && p.table === f.refTable) ||
          (typeof e.tenantScope === "object" && e.tenantScope.fk === col && e.tenantScope.parent === f.refTable);
        if (!covered) missing.push(`${key}→${f.refTable}`);
      }
    }
    assert.deepEqual(missing, []);
  });
  await t("schema.generated.ts migration'larla senkron", () => {
    const current = readFileSync(join(ROOT, "lib/backup/schema.generated.ts"), "utf8").replace(/\r\n/g, "\n");
    assert.equal(current, renderSchemaModule(ROOT), "npx tsx scripts/final-hardening/backup-schema-gen.ts ile yeniden üret");
  });

  // 2) Roundtrip (1000 ve 300 satır sınırı)
  for (const cap of [1000, 300]) {
    const src = new FakeDb(cap);
    seedSource(src);
    const log: PageLog[] = [];
    const backup = await runBackup(serviceFetcher(src, ctxA(), log));

    await t(`roundtrip cap=${cap}: tüm tablolar tamam + >2500 satır`, () => {
      assert.equal(backup.incomplete.length, 0, JSON.stringify(backup.incomplete));
      assert.equal(backup.file.complete, true);
      assert.equal(backup.file.tables.clients.row_count, 2600);
      assert.equal(backup.file.tables.clients.expected_count, 2600);
      assert.equal(backup.file.tables.bioenergy_chakra_blocks.row_count, 1400);
      assert.equal(backup.file.tables.aromatherapy_reference_rows.row_count, 1200);
      assert.equal(backup.file.tables.healing_guide_sections.row_count, 30);
      assert.equal(backup.fileName, "yasam-yedek-2026-09-27.json");
      assert.equal(backup.file.version, "3.0");
      assert.equal(backup.file.scope, "database_records_only");
      assert.equal(backup.file.files_included, false);
    });
    await t(`roundtrip cap=${cap}: başka tenant satırı sızmıyor`, () => {
      for (const [name, tbl] of Object.entries(backup.file.tables)) {
        for (const r of tbl.rows) {
          if ("tenant_id" in r) assert.equal(r.tenant_id, TA, name);
        }
      }
      assert.ok(!backup.file.tables.aromatherapy_reference_rows.rows.some((r) => r.cells && Object.keys(r.cells as object).length === 0));
    });
    await t(`roundtrip cap=${cap}: her tablo YALNIZ boş sayfada bitti`, () => {
      const byTable = new Map<string, PageLog[]>();
      for (const l of log) byTable.set(l.table, [...(byTable.get(l.table) ?? []), l]);
      for (const [name, pages] of byTable) {
        const last = pages[pages.length - 1];
        assert.equal(last.done, true, name);
        assert.equal(last.rows, 0, `${name} son sayfa boş olmalı`);
        assert.ok(pages.slice(0, -1).every((p) => !p.done), `${name} erken bitti`);
      }
      assert.ok((byTable.get("clients")?.length ?? 0) >= Math.ceil(2600 / Math.min(cap, 500)) + 1);
    });
    await t(`roundtrip cap=${cap}: dosya JSON parçaları geçerli`, () => {
      const parsed = JSON.parse(serializeBackupParts(backup.file).join("")) as { tables: Record<string, { rows: unknown[] }> };
      assert.equal(parsed.tables.clients.rows.length, 2600);
    });

    const dst = new FakeDb(cap);
    const norm = normalizeBackupFile(JSON.parse(serializeBackupParts(backup.file).join("")));
    assert.ok(norm.ok);
    const restored = await runRestore((norm as { ok: true; backup: never }).backup, serviceFetcher(dst, ctxA()));
    await t(`roundtrip cap=${cap}: restore COMPLETE + tablo hash eşitliği`, () => {
      assert.equal(restored.status, "COMPLETE", JSON.stringify(restored.tables.filter((r) => r.status !== "COMPLETE")));
      for (const name of Object.keys(backup.file.tables)) {
        const e = getRegistryEntry(name)!;
        if (e.exportOnly) continue;
        const pk = e.pk.find((c) => c !== "tenant_id") ?? "tenant_id";
        const drop = denyColumnsFor(e);
        const srcRows = src.rows(name).filter((r) => (e.tenantScope === "direct" ? r.tenant_id === TA : true));
        const srcScoped =
          typeof e.tenantScope === "object"
            ? srcRows.filter((r) => src.rows(e.tenantScope && typeof e.tenantScope === "object" ? e.tenantScope.parent : "").some((p) => p.id === r[(e.tenantScope as { fk: string }).fk] && p.tenant_id === TA))
            : srcRows;
        assert.equal(tableHash(dst.rows(name), pk, drop), tableHash(srcScoped, pk, drop), `hash ${name}`);
      }
      assert.equal(dst.rows("support_messages").length, 0, "support_messages geri yüklenmemeli");
      assert.ok(restored.skipped.some((d) => d.table === "support_messages" && d.action === "skip" && d.reason === "export_only"));
    });
    await t(`roundtrip cap=${cap}: generated kolon hiç yazılmadı, UPDATE/DELETE yok, ignoreDuplicates hep true`, () => {
      assert.equal(dst.generatedWrites, 0);
      assert.deepEqual(dst.forbidden, []);
      assert.equal(dst.ignoreDupViolations, 0);
      assert.ok(dst.upsertCalls > 0);
      assert.ok(dst.rows("aromatherapy_oils").every((r) => typeof r.search_norm === "string"));
    });

    const again = await runRestore((norm as { ok: true; backup: never }).backup, serviceFetcher(dst, ctxA()));
    await t(`roundtrip cap=${cap}: tekrar restore → hepsi already_present`, () => {
      assert.equal(again.status, "COMPLETE");
      const inserted = again.tables.reduce((s, r) => s + r.inserted, 0);
      assert.equal(inserted, 0);
      const present = again.tables.reduce((s, r) => s + r.already_present, 0);
      const expected = again.tables.reduce((s, r) => s + r.expected, 0);
      assert.equal(present, expected);
      assert.equal(dst.rows("clients").length, 2600);
    });
  }

  // 3) Eski sürümler
  await t("v2.1 + support_messages + bilinmeyen tablo → 200, uyarı + atla", async () => {
    const db = new FakeDb(1000);
    const cid = uid("v2");
    const r = await handleFullRestore(asDb(db), ctxA(), {
      version: "2.1",
      tenant_id: TA,
      tables: {
        clients: [{ id: cid, tenant_id: TA, ad: "Eski", soyad: "Yedek" }],
        support_messages: [{ id: uid("sm"), subject: "x", message: "y" }],
        ghost_table: [{ id: 1 }],
        _bak_users_modperm_20260926: [{ id: 1 }],
      },
    });
    assert.equal(r.status, 200);
    const body = r.body as { status: string; skipped: { table: string; reason: string }[]; summary: Record<string, { inserted: number }> };
    assert.equal(body.summary.clients.inserted, 1);
    const reasons = Object.fromEntries(body.skipped.map((s) => [s.table, s.reason]));
    assert.equal(reasons.support_messages, "export_only");
    assert.equal(reasons.ghost_table, "unknown_table");
    assert.equal(reasons._bak_users_modperm_20260926, "excluded");
    assert.equal(db.rows("support_messages").length, 0);
  });
  await t("sürüm doğrulama: 1.0 kabul, 3.0 format'sız ve 4.0 red", () => {
    assert.ok(normalizeBackupFile({ version: "1.0", tables: { clients: [] } }).ok);
    assert.ok(normalizeBackupFile({ version: "2.0", tables: {} }).ok);
    assert.ok(!normalizeBackupFile({ version: "3.0", tables: {} }).ok);
    assert.ok(!normalizeBackupFile({ version: "4.0", tables: {} }).ok);
    const v3 = normalizeBackupFile({ format: "yasam-sistemi-backup", version: "3.0", tables: { clients: { rows: [], complete: false, error: "x" } } });
    assert.ok(v3.ok && v3.backup.incompleteTables.length === 1);
  });

  // 4) Saldırgan durumlar
  const adv = new FakeDb(1000);
  const clientA = uid("ca");
  const clientB = uid("cb");
  adv.seed("clients", [{ id: clientA, tenant_id: TA, ad: "A" }, { id: clientB, tenant_id: TB, ad: "B" }]);
  const sheetB = uid("sb");
  adv.seed("aromatherapy_reference_sheets", [{ id: sheetB, tenant_id: TB, sheet_name: "B", display_title: "B", headers: [] }]);

  await t("sahte tenant_id sunucuda zorlanır", async () => {
    const id = uid("ft");
    const rep = await restoreChunk(asDb(adv), ctxA(), "clients", [{ id, tenant_id: TB, ad: "Sahte" }]);
    assert.equal(rep.inserted, 1);
    assert.equal(adv.rows("clients").find((r) => r.id === id)?.tenant_id, TA);
  });
  await t("bilinmeyen / enjeksiyon kolonu düşürülür ve raporlanır (legacy probe + explicit)", async () => {
    const id = uid("uk");
    const rep = await restoreChunk(asDb(adv), ctxA(), "clients", [{ id, ad: "K", evil_col: 1, "id,tenant_id": "x" }]);
    assert.equal(rep.inserted, 1);
    assert.ok(rep.dropped_columns.includes("evil_col"));
    assert.ok(rep.dropped_columns.includes("id,tenant_id"));
    const bid = uid("bl");
    const rep2 = await restoreChunk(asDb(adv), ctxA(), "aromatherapy_blends", [{ id: bid, name: "K", evil: true }]);
    assert.equal(rep2.inserted, 1);
    assert.deepEqual(rep2.dropped_columns, ["evil"]);
  });
  await t("generated kolon payload'a girmez", async () => {
    const id = uid("go");
    const rep = await restoreChunk(asDb(adv), ctxA(), "aromatherapy_oils", [{ id, name: "Gül", search_norm: "HACK", identity_norm: "HACK" }]);
    assert.equal(rep.inserted, 1);
    assert.equal(adv.generatedWrites, 0);
    assert.notEqual(adv.rows("aromatherapy_oils").find((r) => r.id === id)?.search_norm, "HACK");
  });
  await t("başka tenant FK ebeveyni → parent_missing", async () => {
    const rep = await restoreChunk(asDb(adv), ctxA(), "client_notes", [
      { id: uid("nb"), client_id: clientB, notlar: "x" },
      { id: uid("na"), client_id: clientA, notlar: "y" },
    ]);
    assert.equal(rep.parent_missing, 1);
    assert.equal(rep.inserted, 1);
    assert.equal(rep.status, "PARTIAL");
  });
  await t("child_of: başka tenant sayfasına satır → parent_missing", async () => {
    const rep = await restoreChunk(asDb(adv), ctxA(), "aromatherapy_reference_rows", [{ id: uid("rx"), sheet_id: sheetB, row_index: 0, cells: {} }]);
    assert.equal(rep.parent_missing, 1);
    assert.equal(rep.inserted, 0);
  });
  await t("SET NULL ebeveyni yoksa null yazılır (fk_nulled)", async () => {
    const id = uid("hx");
    const rep = await restoreChunk(asDb(adv), ctxA(), "human_design_charts", [{ id, client_id: uid("zz"), client_name: "X" }]);
    assert.equal(rep.inserted, 1);
    assert.equal(rep.fk_nulled, 1);
    assert.equal(adv.rows("human_design_charts").find((r) => r.id === id)?.client_id, null);
  });
  await t("başka tenant storage yolu reddedilir; kendi yolu / data: / dış URL kabul", async () => {
    const stoneA = uid("cs");
    adv.seed("client_stones", [{ id: stoneA, tenant_id: TA, client_id: clientA, stone_name: "Ametist" }]);
    const rep = await restoreChunk(asDb(adv), ctxA(), "client_stone_photos", [
      { id: uid("p1"), client_id: clientA, stone_id: stoneA, file_path: `${TB}/${clientA}/${stoneA}/x.png`, image_url: `${TB}/x.png` },
      { id: uid("p2"), client_id: clientA, stone_id: stoneA, file_path: `${TA}/../${TB}/x.png` },
      { id: uid("p3"), client_id: clientA, stone_id: stoneA, file_path: `${TA}/${clientA}/${stoneA}/ok.png`, image_url: `${TA}/${clientA}/${stoneA}/ok.png` },
    ]);
    assert.equal(rep.inserted, 1);
    assert.equal(rep.failed.find((f) => f.code === "foreign_storage_path")?.count, 2);
    const e = getRegistryEntry("stones")!;
    assert.ok(findForeignStoragePath(e, { images: [{ file_path: `catalog/${TB}/a.png` }] }, TA));
    assert.equal(findForeignStoragePath(e, { images: [{ file_path: `catalog/${TA}/a.png` }] }, TA), null);
    const hg = getRegistryEntry("healing_guides")!;
    assert.ok(
      findForeignStoragePath(hg, { images: [{ url: `https://x.supabase.co/storage/v1/object/public/stone-photos/healing-guides/${TB}/g/a.png` }] }, TA),
    );
    assert.equal(findForeignStoragePath(hg, { images: [{ url: "https://example.com/a.png" }] }, TA), null);
    const inv = getRegistryEntry("oil_inventory")!;
    assert.equal(findForeignStoragePath(inv, { photos: ["data:image/png;base64,AAAA"] }, TA), null);
  });
  await t("lisanssız modül ve üyelik pasif → skipped_unlicensed, yazım yok", async () => {
    const before = adv.upsertCalls;
    const rep = await restoreChunk(asDb(adv), ctxA({ modulePermissions: { clients: true } }), "bioenergy_chakras", [{ id: uid("c9"), name: "x" }]);
    assert.equal(rep.skipped_unlicensed, 1);
    assert.equal(rep.status, "SKIPPED");
    const rep2 = await restoreChunk(asDb(adv), ctxA({ membershipActive: false }), "clients", [{ id: uid("c8"), ad: "x" }]);
    assert.equal(rep2.skipped_unlicensed, 1);
    assert.equal(adv.upsertCalls, before);
    const admin = await restoreChunk(asDb(adv), ctxA({ role: "admin", modulePermissions: {} }), "bioenergy_chakras", [{ id: uid("c7"), name: "y" }]);
    assert.equal(admin.inserted, 1);
  });
  await t("başka tenant'ta aynı id → id_conflict_other_tenant, B satırı değişmez", async () => {
    const rep = await restoreChunk(asDb(adv), ctxA(), "clients", [{ id: clientB, ad: "Ele geçir" }]);
    assert.equal(rep.inserted, 0);
    assert.equal(rep.failed[0]?.code, "id_conflict_other_tenant");
    const b = adv.rows("clients").find((r) => r.id === clientB)!;
    assert.equal(b.tenant_id, TB);
    assert.equal(b.ad, "B");
  });
  await t("mevcut kayıt değiştirilmez (yalnız ekleme)", async () => {
    const rep = await restoreChunk(asDb(adv), ctxA(), "clients", [{ id: clientA, ad: "Üzerine yaz" }]);
    assert.equal(rep.already_present, 1);
    assert.equal(adv.rows("clients").find((r) => r.id === clientA)?.ad, "A");
  });
  await t("ifade hatası → satır satır izolasyon (bozuk satır tek başına düşer)", async () => {
    adv.def("minerals").check = (r) => r.name !== "BOZUK";
    adv.def("minerals").columns = new Set(["id", "tenant_id", "name"]);
    const rep = await restoreChunk(asDb(adv), ctxA(), "minerals", [
      { id: uid("m1"), name: "Kuvars" },
      { id: uid("m2"), name: "BOZUK" },
      { id: uid("m3"), name: "Pirit" },
    ]);
    assert.equal(rep.inserted, 2);
    assert.equal(rep.failed.find((f) => f.code === "check_violation")?.count, 1);
  });
  await t("parça içi tekrar eden id ve eksik pk raporlanır", async () => {
    const id = uid("dp");
    const rep = await restoreChunk(asDb(adv), ctxA(), "clients", [{ id, ad: "1" }, { id, ad: "2" }, { ad: "pk yok" }, "çöp"]);
    assert.equal(rep.inserted, 1);
    assert.ok(rep.failed.some((f) => f.code === "duplicate_in_backup"));
    assert.ok(rep.failed.some((f) => f.code === "missing_pk"));
    assert.ok(rep.failed.some((f) => f.code === "invalid_row"));
  });
  await t("singleton (reflexology_atlas): varsa zaten mevcut", async () => {
    const r1 = await restoreChunk(asDb(adv), ctxA(), "reflexology_atlas", [{ tenant_id: TB, document: { a: 1 } }]);
    assert.equal(r1.inserted, 1);
    assert.equal(adv.rows("reflexology_atlas")[0].tenant_id, TA);
    const r2 = await restoreChunk(asDb(adv), ctxA(), "reflexology_atlas", [{ document: { a: 2 } }]);
    assert.equal(r2.already_present, 1);
  });
  await t("SYSTEM besin tenant'ı: beslenme tabloları okunmaz/yazılmaz", async () => {
    const db = new FakeDb(1000);
    db.seed("nutrition_foods", [{ id: uid("nf"), tenant_id: SYSTEM_NUTRITION_TENANT_ID, name_tr: "Elma" }]);
    const page = await fetchTablePage(asDb(db), getRegistryEntry("nutrition_foods")!, SYSTEM_NUTRITION_TENANT_ID, null);
    assert.equal(page.rows.length, 0);
    const rep = await restoreChunk(asDb(db), ctxA({ tenantId: SYSTEM_NUTRITION_TENANT_ID }), "nutrition_foods", [{ id: uid("nx"), name_tr: "x" }]);
    assert.equal(rep.inserted, 0);
  });
  await t("dışa aktarım: yedek dışı tablo adı ve bozuk cursor reddedilir", async () => {
    const db = new FakeDb(1000);
    assert.equal((await handleBackupTableRequest(asDb(db), TA, "users", null)).status, 400);
    assert.equal((await handleBackupTableRequest(asDb(db), TA, "_bak_users_modperm_20260926", null)).status, 400);
    assert.equal((await handleBackupTableRequest(asDb(db), TA, "clients", "%%%")).status, 400);
  });
  await t("plan: çapraz tenant notu + topolojik sıra (clients önce)", () => {
    const r = handleRestorePlan(ctxA(), { tables: { client_notes: 1, clients: 1 }, source_tenant_id: TB });
    const b = r.body as { decisions: { table: string }[]; crossTenant: boolean; notes: string[] };
    assert.equal(b.decisions[0].table, "clients");
    assert.equal(b.crossTenant, true);
    assert.ok(b.notes.length === 1);
  });
  await t("chunkRows / sortSelfReferencing", () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({ id: String(i) }));
    const chunks = chunkRows(rows);
    assert.deepEqual(chunks.map((c) => c.rows.length), [200, 200, 50]);
    const big = chunkRows([{ id: "a", blob: "x".repeat(3_600_000) }, { id: "b" }]);
    assert.equal(big[0].oversized, true);
    const sorted = sortSelfReferencing([{ id: "c", p: "b" }, { id: "b", p: "a" }, { id: "a", p: null }], "id", "p");
    assert.deepEqual(sorted.map((r) => r.id), ["a", "b", "c"]);
  });

  // 5) Word arşivi
  await t("Word: tam metin, UUID gizli, tarih yerel saat, eksik bölüm görünür", async () => {
    const long = "Uzun metin ".repeat(80) + "SON";
    const entry = getRegistryEntry("client_sessions")!;
    const built = await buildArchiveDocx({
      title: "Test Arşivi",
      now: new Date("2026-09-26T22:30:00Z"),
      modules: [
        {
          key: "clients",
          label: "Danışan Yolculuğu",
          tables: [
            {
              entry,
              rows: [{ id: clientA, tenant_id: TA, client_id: clientB, title: "Seans Ğüşİ", notes: long, created_at: "2026-09-27T07:00:00Z", session_date: "2026-09-27" }],
              expected_count: 2,
              complete: false,
              error: "Sayım uyuşmazlığı",
            },
          ],
        },
      ],
    });
    const zip = await JSZip.loadAsync(built.buffer);
    const xml = await zip.file("word/document.xml")!.async("string");
    assert.ok(xml.includes("SON"), "tam metin");
    assert.ok(!xml.includes(clientB), "ham UUID olmamalı");
    assert.ok(!xml.includes(TA), "tenant id olmamalı");
    assert.ok(xml.includes("bağlantılı kayıt"));
    assert.ok(xml.includes("10:00"), "yerel saat");
    assert.ok(xml.includes("27.09.2026"));
    assert.ok(xml.includes("Seans Ğüşİ"));
    assert.ok(xml.includes("Eksik veya okunamayan"));
    assert.ok(xml.includes("okunabilir bir arşivdir"));
    assert.equal(built.incompleteTables.length, 1);
  });
  await t("Word: bütçe aşımı → WordBudgetError (sessiz kırpma yok)", async () => {
    const entry = getRegistryEntry("clients")!;
    const rows = Array.from({ length: WORD_RECORD_BUDGET + 1 }, (_, i) => ({ id: String(i), ad: "x" }));
    await assert.rejects(
      buildArchiveDocx({ title: "x", modules: [{ key: "clients", label: "x", tables: [{ entry, rows, expected_count: rows.length, complete: true, error: null }] }] }),
      (e: unknown) => e instanceof WordBudgetError && /modül bazlı/.test((e as Error).message),
    );
  });
  await t("exportTableAll: sayım uyuşmazlığında complete=false", async () => {
    const db = new FakeDb(1000);
    db.seed("clients", [{ id: uid("q1"), tenant_id: TA, ad: "x" }]);
    const e = getRegistryEntry("clients")!;
    const ok = await exportTableAll(asDb(db), e, TA);
    assert.equal(ok.complete, true);
    const trunc = await exportTableAll(asDb(db), e, TA, { maxRows: 0 });
    assert.equal(trunc.truncated, true);
    assert.equal(trunc.complete, false);
  });

  // 6) Statik: üyelik kapısı yedek/dışa aktarımda YOK; UI dürüst metin
  await t("backup/export route'larında üyelik kapısı yok", () => {
    for (const f of ["app/api/settings/backup/route.ts", "app/api/settings/backup/table/route.ts", "app/api/settings/export/route.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      assert.ok(src.includes("verifyUserRequest"), f);
      assert.ok(!/requireModuleAccess|hasMembershipAccess|MEMBERSHIP_INACTIVE/.test(src), `${f} üyelik kapısı içermemeli`);
    }
  });
  await t("UI: 'eksiksiz' yalnız tamlık kontrolü dalında; 'Tüm kayıtlar dahildir' yok", () => {
    const ui = readFileSync(join(ROOT, "app/settings/BackupSections.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const page = readFileSync(join(ROOT, "app/settings/page.tsx"), "utf8");
    for (const src of [ui, page]) {
      assert.ok(!/Tüm kayıtlar dahildir|Tüm kayıtlar tek belgede|Eksiksiz JSON|eksiksiz ve geri yüklenebilir/i.test(src));
    }
    const hits = ui.match(/eksiksiz/gi) ?? [];
    assert.equal(hits.length, 1);
    const idx = ui.search(/eksiksiz/i);
    assert.ok(ui.slice(Math.max(0, idx - 200), idx).includes("outcome.complete"), "eksiksiz yalnız complete dalında");
    assert.ok(ui.includes("fotoğraf ve dosyalar dahil değildir"));
    assert.ok(ui.includes("Yalnız eksik kayıtlar eklenir; mevcut kayıtlar değiştirilmez veya silinmez"));
  });

  console.log(`backup.harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error("harness çöktü:", e);
  process.exit(1);
});
