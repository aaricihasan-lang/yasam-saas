// ============================================================
// I18N — Yedek & Aktarım: DİL BAĞIMSIZLIĞI + GERİ YÜKLEME SÖZLEŞMESİ gömülü PG harness'i
// (PGlite; ağ / sır / production YOK; yalnız SENTETİK veri).
//
// Uygulamanın KENDİ yedek hattı uçtan uca koşar: lib/backup/client (runBackup / runRestore, istemci orkestrasyonu)
// → lib/backup/service (route'ların iş mantığı) → lib/backup/engine → Supabase-js alt kümesi adaptörü → PGlite
// (`SET ROLE service_role`; user_locale_prefs GERÇEK migration'ı + GRANT'ları devrede).
//
//   [A] TR ortamında yedek ve EN ortamında yedek (aynı sabit saat) → dosya BAYT-BAYT aynı; manifest (tables hariç
//       her şey) ve şema bölümleri bayt-bayt aynı. Yedek hattı hiçbir dil girdisi okumaz (statik denetim).
//   [B] Golden: taban dalda (8c27e223a, i18n değişikliğinden ÖNCE) üretilen dosya ile bayt-bayt aynı.
//   [C] TR'de alınan yedek EN ortamında, EN'de alınan TR ortamında boş bir veritabanına geri yüklenir →
//       tablo başına satır sayısı + içerik hash'i kaynakla birebir. İkinci geri yükleme: hepsi already_present.
//   [D] Eski biçimler (1.0 / 2.0 / 2.1 sentetik fixture) normalize edilir ve geri yüklenir.
//   [E] Bozuk yedek reddi: JSON değil, manifest (format) bozuk, sürüm yanlış/yok, tables eksik, tablo bölümü bozuk.
//       registry_hash uyumsuzluğu: bilinçli olarak REDDEDİLMEZ (bilgi amaçlı; satırlar kolon izin listesiyle
//       doğrulanır) — davranış kilitlenir.
//   [F] Tenant izolasyonu: A yedeğinde B satırı yok; A dosyası B'ye yüklenince A'nın kimlikleri B'ye yazılamaz
//       (id_conflict_other_tenant), B'nin verisi A'ya sızmaz; sahte tenant_id / user_id zorlanır.
//   [G] Yetkisiz erişim: kullanıcı kimliği olmadan kullanıcı bazlı tablo okunmaz (fail-closed); lisanssız modül
//       atlanır; route'lar verifyUserRequest + demo kapısı taşır (statik).
//   [H] user_locale_prefs: yalnız oturumdaki kullanıcının satırı yedekte; geri yükleme mevcut dil tercihini
//       DEĞİŞTİRMEZ (yalnız ekleme); tercihi olmayan hesaba eklenir; geçersiz dil kodu DB'de reddedilir.
//
// Çalıştırma: npx tsx scripts/settings-backup-i18n/backup-locale.pg.harness.mts
//   Golden üretimi (yalnız taban dalda, bir kez): WRITE_GOLDEN=1 npx tsx …
// ============================================================
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBackup, runRestore, serializeBackupParts, type JsonFetcher, type JsonResponse } from "../../lib/backup/client";
import { normalizeBackupFile } from "../../lib/backup/format";
import {
  buildBackupPlan,
  handleBackupTableRequest,
  handleFullRestore,
  handleRestoreChunk,
  handleRestorePlan,
} from "../../lib/backup/service";
import { fetchTablePage, type RestoreContext } from "../../lib/backup/engine";
import { getRegistryEntry, REGISTRY_HASH } from "../../lib/backup/registry";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIX = join(ROOT, "scripts", "settings-backup-i18n", "fixtures");
const LOCALE_SQL = readFileSync(join(ROOT, "supabase", "migrations", "20280126000000_user_locale_prefs.sql"), "utf8");
const TABLES = ["clients", "client_notes", "user_locale_prefs"] as const;

let pass = 0;
let fail = 0;
const ok = (n: string, c: unknown, e: unknown = "") => {
  if (c) {
    pass++;
    console.log(`  ✓ ${n}`);
  } else {
    fail++;
    console.log(`  ✗ ${n} ${typeof e === "string" ? e : JSON.stringify(e).slice(0, 400)}`);
  }
};
const section = (s: string) => console.log(`\n${s}`);

// ── Supabase-js alt kümesi (scripts/sifa-rehberi-v2/backup-v2.pg.harness.mjs ile aynı sözleşme) ──
type Row = Record<string, unknown>;
function makeDb(pg: PGlite): SupabaseClient {
  const ident = (s: string) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad ident ${s}`);
    return `"${s}"`;
  };
  function builder(table: string) {
    const st = {
      op: "select",
      cols: "*",
      count: false,
      head: false,
      where: [] as string[],
      params: [] as unknown[],
      order: [] as string[],
      limit: null as number | null,
      rows: null as Row[] | null,
      onConflict: "",
      returning: null as string | null,
    };
    const addParam = (v: unknown) => {
      st.params.push(v);
      return `$${st.params.length}`;
    };
    const b: Record<string, unknown> = {
      select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
        if (st.op === "upsert") {
          st.returning = cols;
          return b;
        }
        st.cols = cols;
        st.count = opts.count === "exact";
        st.head = !!opts.head;
        return b;
      },
      eq(c: string, v: unknown) {
        st.where.push(`${ident(c)}::text = ${addParam(String(v))}`);
        return b;
      },
      gt(c: string, v: unknown) {
        st.where.push(`${ident(c)}::text > ${addParam(String(v))}`);
        return b;
      },
      in(c: string, arr: unknown[]) {
        st.where.push(`${ident(c)}::text = ANY(${addParam(arr.map(String))}::text[])`);
        return b;
      },
      or(expr: string) {
        throw new Error(`desteklenmeyen or(): ${expr}`);
      },
      order(c: string, o: { ascending?: boolean } = {}) {
        st.order.push(`${ident(c)}::text ${o.ascending === false ? "DESC" : "ASC"}`);
        return b;
      },
      limit(n: number) {
        st.limit = n;
        return b;
      },
      upsert(rows: Row[], opts: { onConflict: string }) {
        st.op = "upsert";
        st.rows = rows;
        st.onConflict = opts.onConflict;
        return b;
      },
      update() {
        throw new Error("UPDATE yasak");
      },
      delete() {
        throw new Error("DELETE yasak");
      },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        return run().then(res, rej);
      },
    };
    async function run(): Promise<{ data: unknown; count?: number | null; error: { code: string; message: string } | null }> {
      try {
        if (st.op === "upsert") {
          const rows = st.rows ?? [];
          if (!rows.length) return { data: [], error: null };
          const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].map(ident);
          const conflict = st.onConflict.split(",").map((x) => ident(x.trim())).join(", ");
          const ret = st.returning ? st.returning.split(",").map((x) => ident(x.trim())).join(", ") : "1";
          const r = await pg.query(
            `INSERT INTO ${ident(table)} (${cols.join(", ")}) SELECT ${cols.join(", ")} FROM jsonb_populate_recordset(NULL::${ident(table)}, $1::jsonb) ON CONFLICT (${conflict}) DO NOTHING RETURNING ${ret}`,
            [JSON.stringify(rows)],
          );
          return { data: r.rows, error: null };
        }
        const where = st.where.length ? ` WHERE ${st.where.join(" AND ")}` : "";
        if (st.head && st.count) {
          const r = await pg.query<{ n: number }>(`SELECT count(*)::int n FROM ${ident(table)}${where}`, st.params);
          return { data: null, count: r.rows[0].n, error: null };
        }
        const cols = st.cols === "*" ? "*" : st.cols.split(",").map((x) => ident(x.trim())).join(", ");
        const sql = `SELECT ${cols} FROM ${ident(table)}${where}${st.order.length ? ` ORDER BY ${st.order.join(", ")}` : ""}${st.limit !== null ? ` LIMIT ${Number(st.limit)}` : ""}`;
        const r = await pg.query<Row>(sql, st.params);
        const data = r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
        return { data, count: st.count ? data.length : null, error: null };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return { data: null, count: null, error: { code: err.code ?? "XX000", message: err.message ?? "" } };
      }
    }
    return b;
  }
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

// ── Şema: user_locale_prefs GERÇEK migration; clients / client_notes legacy (repo dışı şema) → sentetik DDL ──
async function newDb(): Promise<{ pg: PGlite; db: SupabaseClient }> {
  const pg = new PGlite();
  for (const r of ["anon", "authenticated"]) await pg.exec(`CREATE ROLE ${r};`);
  await pg.exec(`CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role;`);
  await pg.exec(`
    CREATE TABLE public.users (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
    CREATE TABLE public.clients (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, ad text, soyad text, telefon text,
      created_at timestamptz NOT NULL DEFAULT now(), create_request_id text
    );
    CREATE TABLE public.client_notes (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, client_id uuid NOT NULL REFERENCES public.clients(id),
      content text, created_at timestamptz NOT NULL DEFAULT now()
    );
    GRANT SELECT, INSERT ON public.clients, public.client_notes TO service_role;
  `);
  await pg.exec(LOCALE_SQL.replace(/NOTIFY pgrst[^;]*;/, ""));
  await pg.exec("SET TimeZone = 'UTC'");
  return { pg, db: makeDb(pg) };
}
const asService = async <T,>(pg: PGlite, fn: () => Promise<T>): Promise<T> => {
  await pg.exec("SET ROLE service_role");
  try {
    return await fn();
  } finally {
    await pg.exec("RESET ROLE");
  }
};

const TA = "aaaaaaaa-0000-4000-8000-00000000000a";
const TB = "bbbbbbbb-0000-4000-8000-00000000000b";
const UA = "aaaaaaaa-1111-4000-8000-00000000000a";
const UA2 = "aaaaaaaa-2222-4000-8000-00000000000a";
const UB = "bbbbbbbb-1111-4000-8000-00000000000b";
const id = (p: string, n: number) => `${p}${String(n).padStart(4, "0")}-0000-4000-8000-000000000000`;
const NOW = new Date("2026-11-25T09:30:00.000Z");

async function seed(pg: PGlite) {
  await pg.query(`INSERT INTO users (id, tenant_id) VALUES ($1,$2),($3,$2),($4,$5)`, [UA, TA, UA2, UB, TB]);
  for (let i = 1; i <= 7; i++) {
    await pg.query(`INSERT INTO clients (id, tenant_id, ad, soyad, telefon, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
      id("c1a0", i), TA, `Danışan ${i} ÇĞİÖŞÜ`, i % 2 ? "Yılmaz" : "O'Brien \"x\"", i === 3 ? null : `0555 000 00 0${i}`, `2026-0${(i % 9) + 1}-1${i}T10:00:00.000Z`,
    ]);
    if (i <= 5) {
      await pg.query(`INSERT INTO client_notes (id, tenant_id, client_id, content, created_at) VALUES ($1,$2,$3,$4,$5)`, [
        id("c2a0", i), TA, id("c1a0", i), `Not ${i}: ğüşıöç — ✓ emoji 🌿 · satır\nikinci satır`, `2026-10-0${i}T08:00:00.000Z`,
      ]);
    }
  }
  // Başka tenant (B) — sızmamalı.
  for (let i = 1; i <= 3; i++) {
    await pg.query(`INSERT INTO clients (id, tenant_id, ad, soyad, created_at) VALUES ($1,$2,$3,$4,$5)`, [id("c1b0", i), TB, `B GİZLİ ${i}`, "B", "2026-05-01T00:00:00.000Z"]);
  }
  await pg.query(`INSERT INTO client_notes (id, tenant_id, client_id, content, created_at) VALUES ($1,$2,$3,$4,$5)`, [id("c2b0", 1), TB, id("c1b0", 1), "B GİZLİ NOT", "2026-05-02T00:00:00.000Z"]);
  // Dil tercihleri: A uzmanı EN, aynı tenant'taki A2 uzmanı TR (A2 yedeği A'ya karışmamalı), B uzmanı TR.
  await pg.query(`INSERT INTO user_locale_prefs (id, tenant_id, user_id, preferred_locale, created_at, updated_at) VALUES ($1,$2,$3,'en',$4,$4),($5,$2,$6,'tr',$4,$4),($7,$8,$9,'tr',$4,$4)`, [
    id("c3a0", 1), TA, UA, "2026-11-24T12:00:00.000Z", id("c3a0", 2), UA2, id("c3b0", 1), TB, UB,
  ]);
}

/**
 * Tablo özeti: satır sayısı + içerik hash'i (kanonik JSON, kimliğe göre sıralı). Kullanıcı bazlı tablo
 * (user_locale_prefs) yalnız yedeği alan uzmanın satırıyla karşılaştırılır (yedek kapsamı = okuma kapsamı).
 */
async function digest(pg: PGlite, tenant: string, user: string = tenant === TA ? UA : UB): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of TABLES) {
    const userCond = t === "user_locale_prefs" ? " and user_id::text = $2" : " and $2::text is not null";
    const r = await pg.query<{ n: number; h: string }>(
      `select count(*)::int n, md5(coalesce(string_agg((to_jsonb(x) - 'updated_at')::text, '|' order by x.id::text), '')) h from public.${t} x where tenant_id::text = $1${userCond}`,
      [tenant, user],
    );
    out[t] = `${r.rows[0].n}:${r.rows[0].h}`;
  }
  return out;
}

/**
 * Route'ların iş mantığına giden fetcher. `locale` yalnız isteğe işlenir (NEXT_LOCALE çerezi + Accept-Language) —
 * hattın hiçbir parçası okumaz; bu, kullanıcının ekran dilinin yedek dosyasına SIZAMAYACAĞINI uçtan uca gösterir.
 * Plan, sentetik şemadaki 3 tabloya daraltılır (diğer 162 tablo bu gömülü DB'de yok); excluded listesi aynen kalır.
 */
function makeFetcher(pg: PGlite, db: SupabaseClient, ctx: RestoreContext, locale: "tr" | "en", log: string[] = []): JsonFetcher {
  return async (url, init) => {
    const headers = { cookie: `NEXT_LOCALE=${locale}`, "accept-language": locale === "en" ? "en-GB,en;q=0.9" : "tr-TR,tr;q=0.9" };
    log.push(`${init?.method ?? "GET"} ${url} ${headers.cookie}`);
    const u = new URL(url, "http://local");
    const reply = (status: number, json: unknown): JsonResponse => ({ ok: status >= 200 && status < 300, status, json: JSON.parse(JSON.stringify(json)) });
    return asService(pg, async () => {
      if (u.pathname === "/api/settings/backup") {
        const plan = buildBackupPlan(ctx.tenantId, NOW);
        return reply(200, { ...plan, tables: plan.tables.filter((t) => (TABLES as readonly string[]).includes(t.table)) });
      }
      if (u.pathname === "/api/settings/backup/table") {
        const r = await handleBackupTableRequest(db, ctx.tenantId, u.searchParams.get("name"), u.searchParams.get("cursor"), ctx.userId);
        return reply(r.status, r.body);
      }
      if (u.pathname === "/api/settings/backup/files") return reply(200, { ok: true, files: [] });
      if (u.pathname === "/api/settings/restore") {
        const r = handleRestorePlan(ctx, (init?.body ?? {}) as Record<string, unknown>);
        return reply(r.status, r.body);
      }
      if (u.pathname === "/api/settings/restore/chunk") {
        const r = await handleRestoreChunk(db, ctx, (init?.body ?? {}) as Record<string, unknown>);
        return reply(r.status, r.body);
      }
      return reply(404, { ok: false, error: "yok" });
    });
  };
}

const ctxA: RestoreContext = { tenantId: TA, userId: UA, role: "expert", modulePermissions: { clients: true }, membershipActive: true };
const ctxB: RestoreContext = { tenantId: TB, userId: UB, role: "expert", modulePermissions: { clients: true }, membershipActive: true };
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const manifestOf = (s: string): string => {
  const o = JSON.parse(s) as Record<string, unknown>;
  const { tables, ...head } = o;
  const schema = Object.fromEntries(Object.entries(tables as Record<string, Record<string, unknown>>).map(([k, v]) => [k, { ...v, rows: undefined, columns: [...new Set(((v.rows as Row[]) ?? []).flatMap((r) => Object.keys(r)))].sort() }]));
  return JSON.stringify({ head, schema });
};

// ════════════════════════════════════════════════════════════════════════════
const src = await newDb();
await seed(src.pg);
const srcDigest = await digest(src.pg, TA);

section("[A] TR / EN ortamında yedek → dosya bayt-bayt aynı");
const logTr: string[] = [];
const logEn: string[] = [];
const bTr = await runBackup(makeFetcher(src.pg, src.db, ctxA, "tr", logTr));
const bEn = await runBackup(makeFetcher(src.pg, src.db, ctxA, "en", logEn));
const fileTr = serializeBackupParts(bTr.file).join("");
const fileEn = serializeBackupParts(bEn.file).join("");
ok("TR yedeği tamam (complete=true, 3 tablo)", bTr.file.complete && Object.keys(bTr.file.tables).length === 3, bTr.incomplete);
ok("EN yedeği tamam (complete=true, 3 tablo)", bEn.file.complete && Object.keys(bEn.file.tables).length === 3, bEn.incomplete);
ok("istekler gerçekten farklı dil çereziyle gitti", logTr.every((l) => l.endsWith("NEXT_LOCALE=tr")) && logEn.every((l) => l.endsWith("NEXT_LOCALE=en")) && logTr.length === logEn.length);
ok("TR ve EN dosyası BAYT-BAYT aynı", fileTr === fileEn, `${sha(fileTr)} ≠ ${sha(fileEn)}`);
ok("manifest + şema bölümü bayt-bayt aynı", manifestOf(fileTr) === manifestOf(fileEn));
ok("dosya adı dil bağımsız (yasam-yedek-YYYY-MM-DD.json)", bTr.fileName === bEn.fileName && /^yasam-yedek-\d{4}-\d{2}-\d{2}\.json$/.test(bTr.fileName), bTr.fileName);
const headTr = JSON.parse(fileTr) as Record<string, unknown>;
ok("manifest makine alanları: format/version/registry_hash/scope", headTr.format === "yasam-sistemi-backup" && headTr.version === "3.0" && headTr.registry_hash === REGISTRY_HASH && headTr.scope === "database_records_only");
ok(
  "satır sayıları: clients 7, client_notes 5, user_locale_prefs 1 (yalnız oturumdaki uzman)",
  bTr.file.tables.clients.row_count === 7 && bTr.file.tables.client_notes.row_count === 5 && bTr.file.tables.user_locale_prefs.row_count === 1,
  Object.fromEntries(Object.entries(bTr.file.tables).map(([k, v]) => [k, v.row_count])),
);

section("[B] Golden (taban dal 8c27e223a) ile bayt-bayt aynı");
const GOLDEN = join(FIX, "golden-backup-v3.json");
if (process.env.WRITE_GOLDEN === "1") {
  mkdirSync(FIX, { recursive: true });
  writeFileSync(GOLDEN, fileTr, "utf8");
  writeFileSync(join(FIX, "golden-backup-v3.sha256"), `${sha(fileTr)}  golden-backup-v3.json\n`, "utf8");
  console.log(`  (golden yazıldı: ${sha(fileTr)})`);
}
ok("golden dosyası var", existsSync(GOLDEN));
if (existsSync(GOLDEN)) {
  const golden = readFileSync(GOLDEN, "utf8");
  const recorded = readFileSync(join(FIX, "golden-backup-v3.sha256"), "utf8").split(/\s+/)[0];
  ok("golden kendi kayıtlı SHA-256'sıyla aynı (fixture bozulmamış)", sha(golden) === recorded);
  ok("bugünkü TR dosyası == golden (bayt-bayt)", fileTr === golden, `${sha(fileTr)} ≠ ${sha(golden)}`);
  ok("bugünkü EN dosyası == golden (bayt-bayt)", fileEn === golden);
  ok("manifest/şema == golden", manifestOf(fileEn) === manifestOf(golden));
}

section("[C] Çapraz dil geri yükleme (boş veritabanına) → satır sayısı + içerik hash'i birebir");
for (const [made, restoreIn, text] of [["TR", "en", fileTr], ["EN", "tr", fileEn]] as const) {
  const dst = await newDb();
  await dst.pg.query(`INSERT INTO users (id, tenant_id) VALUES ($1,$2)`, [UA, TA]);
  const norm = normalizeBackupFile(JSON.parse(text));
  ok(`${made} dosyası ${restoreIn.toUpperCase()} ortamında normalize edildi`, norm.ok);
  if (!norm.ok) continue;
  const r1 = await runRestore(norm.backup, makeFetcher(dst.pg, dst.db, ctxA, restoreIn));
  ok(`${made}→${restoreIn.toUpperCase()}: durum COMPLETE`, r1.status === "COMPLETE", r1);
  const ins = Object.fromEntries(r1.tables.map((t) => [t.table, t.inserted]));
  ok(`${made}→${restoreIn.toUpperCase()}: eklenen 7/5/1`, ins.clients === 7 && ins.client_notes === 5 && ins.user_locale_prefs === 1, ins);
  const d = await digest(dst.pg, TA);
  ok(`${made}→${restoreIn.toUpperCase()}: satır sayısı + içerik hash'i kaynakla birebir`, JSON.stringify(d) === JSON.stringify(srcDigest), { d, srcDigest });
  const r2 = await runRestore(norm.backup, makeFetcher(dst.pg, dst.db, ctxA, restoreIn));
  ok(`${made}→${restoreIn.toUpperCase()}: ikinci geri yükleme hepsi already_present (çoğalma yok)`, r2.status === "COMPLETE" && r2.tables.every((t) => t.inserted === 0 && t.already_present === t.expected));
  ok(`${made}→${restoreIn.toUpperCase()}: ikinci geri yüklemeden sonra hash değişmedi`, JSON.stringify(await digest(dst.pg, TA)) === JSON.stringify(srcDigest));
  await dst.pg.close();
}

section("[D] Eski biçimler (1.0 / 2.0 / 2.1) — sentetik fixture");
const legacyRows = JSON.parse(fileTr).tables as Record<string, { rows: Row[] }>;
for (const v of ["1.0", "2.0", "2.1"]) {
  const legacy: Record<string, unknown> = { version: v, tenant_id: TA, exported_at: "2026-01-01T00:00:00.000Z", tables: Object.fromEntries(Object.entries(legacyRows).map(([k, x]) => [k, x.rows])) };
  const p = join(FIX, `legacy-backup-v${v}.json`);
  if (process.env.WRITE_GOLDEN === "1") writeFileSync(p, JSON.stringify(legacy), "utf8");
  ok(`legacy v${v} fixture var`, existsSync(p));
  if (!existsSync(p)) continue;
  const norm = normalizeBackupFile(JSON.parse(readFileSync(p, "utf8")));
  ok(`legacy v${v} normalize: ok + 3 tablo + 13 satır`, norm.ok && Object.keys(norm.backup.tables).length === 3 && Object.values(norm.backup.tables).reduce((s, r) => s + r.length, 0) === 13);
  if (!norm.ok) continue;
  const dst = await newDb();
  await dst.pg.query(`INSERT INTO users (id, tenant_id) VALUES ($1,$2)`, [UA, TA]);
  const r = await runRestore(norm.backup, makeFetcher(dst.pg, dst.db, ctxA, v === "2.0" ? "en" : "tr"));
  ok(`legacy v${v} geri yükleme COMPLETE + hash birebir`, r.status === "COMPLETE" && JSON.stringify(await digest(dst.pg, TA)) === JSON.stringify(srcDigest), r.status);
  await dst.pg.close();
}

section("[E] Bozuk yedek reddi");
const good = JSON.parse(fileTr) as Record<string, unknown>;
const reject = (name: string, input: unknown) => {
  const r = normalizeBackupFile(input);
  ok(`reddedildi: ${name}`, !r.ok, r.ok ? "kabul edildi" : "");
  return r;
};
reject("JSON nesnesi değil (dizi)", [1, 2]);
reject("JSON nesnesi değil (null)", null);
reject("manifest bozuk: format yanlış", { ...good, format: "baska-sistem" });
reject("manifest bozuk: format yok", { ...good, format: undefined });
reject("sürüm yanlış (9.9)", { ...good, version: "9.9" });
reject("sürüm yok", { ...good, version: undefined });
reject("sürüm sayı (3)", { ...good, version: 3 });
reject("tables yok", { ...good, tables: undefined });
reject("tables dizi", { ...good, tables: [] });
{
  const r = normalizeBackupFile({ ...good, tables: { clients: "bozuk", client_notes: { rows: "x" } } });
  ok("bozuk tablo bölümleri satır üretmez, eksik işaretlenir", r.ok && Object.values(r.backup.tables).every((x) => x.length === 0) && r.backup.incompleteTables.length === 2);
}
{
  let threw = false;
  try {
    JSON.parse(fileTr.slice(0, Math.floor(fileTr.length / 2)));
  } catch (e) {
    threw = e instanceof SyntaxError;
  }
  ok("yarım kalmış dosya JSON.parse'ta SyntaxError (arayüz 'geçerli JSON değil' der)", threw);
}
{
  const r = normalizeBackupFile({ ...good, registry_hash: "0000000000000000" });
  ok("registry_hash uyumsuz: bilinçli KABUL (bilgi amaçlı; kolon izin listesi korur) — davranış kilitli", r.ok && r.backup.registryHash === "0000000000000000");
}
{
  const r = await asService(src.pg, () => handleFullRestore(src.db, ctxA, { ...good, version: "9.9" }));
  ok("sunucu tek-gövde geri yükleme de bozuk sürümü 400 ile reddeder", r.status === 400);
}

section("[F] Tenant izolasyonu");
ok("A yedeğinde B satırı yok", !fileTr.includes("B GİZLİ") && !fileTr.includes(TB));
ok("A yedeğinde aynı tenant'taki 2. uzmanın dil tercihi yok", !fileTr.includes(UA2));
{
  const before = await digest(src.pg, TB);
  const beforeA = await digest(src.pg, TA);
  const norm = normalizeBackupFile(JSON.parse(fileTr));
  if (norm.ok) {
    const r = await runRestore(norm.backup, makeFetcher(src.pg, src.db, ctxB, "en"));
    const cl = r.tables.find((t) => t.table === "clients");
    ok("A dosyası B'ye: A kimlikleri yazılmaz (id_conflict_other_tenant)", (cl?.failed.find((f) => f.code === "id_conflict_other_tenant")?.count ?? 0) === 7 && cl?.inserted === 0, cl);
    const pref = r.tables.find((t) => t.table === "user_locale_prefs");
    ok("A dosyası B'ye: B'nin dil tercihi korunur (zaten var / değişmez)", pref?.inserted === 0, pref);
    ok("A dosyası B'ye: plan notu 'başka hesaptan' (çapraz tenant)", r.notes.length === 1);
    const afterB = await digest(src.pg, TB);
    const afterA = await digest(src.pg, TA);
    ok("B verisi değişmedi (yalnız ekleme; A satırı B'ye geçmedi)", JSON.stringify(afterB) === JSON.stringify(before), { before, afterB });
    ok("A verisi değişmedi", JSON.stringify(afterA) === JSON.stringify(beforeA));
  }
  const pageB = await asService(src.pg, () => fetchTablePage(src.db, getRegistryEntry("clients")!, TB, null, { ownerUserId: UB }));
  ok("B yedeği A satırı döndürmez", pageB.rows.length === 3 && pageB.rows.every((r) => r.tenant_id === TB));
  // Sahte tenant_id / user_id'li satır → oturumdaki tenant/kullanıcıya zorlanır.
  const forged = await asService(src.pg, () =>
    handleRestoreChunk(src.db, ctxB, {
      table: "user_locale_prefs",
      rows: [{ id: id("c3f0", 1), tenant_id: TA, user_id: UA, preferred_locale: "de", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
    }),
  );
  const rowA = await src.pg.query<{ preferred_locale: string }>(`select preferred_locale from user_locale_prefs where user_id = $1`, [UA]);
  ok("sahte tenant_id/user_id ile A'nın dil tercihi değiştirilemez", rowA.rows[0]?.preferred_locale === "en", { forged: forged.body, rowA: rowA.rows });
}

section("[G] Yetkisiz erişim");
{
  const page = await asService(src.pg, () => fetchTablePage(src.db, getRegistryEntry("user_locale_prefs")!, TA, null, { ownerUserId: null }));
  ok("kullanıcı kimliği olmadan kullanıcı bazlı tablo okunmaz (fail-closed)", !page.ok && page.rows.length === 0, page);
  const bad = await asService(src.pg, () => handleBackupTableRequest(src.db, TA, "users", null, UA));
  ok("yedek dışı tablo (users) istenemez (400)", bad.status === 400);
  const bad2 = await asService(src.pg, () => handleBackupTableRequest(src.db, TA, "auth_recovery_codes", null, UA));
  ok("güvenlik tablosu (auth_recovery_codes) istenemez (400)", bad2.status === 400);
  const dst = await newDb();
  await dst.pg.query(`INSERT INTO users (id, tenant_id) VALUES ($1,$2)`, [UA, TA]);
  const norm = normalizeBackupFile(JSON.parse(fileTr));
  if (norm.ok) {
    const r = await runRestore(norm.backup, makeFetcher(dst.pg, dst.db, { ...ctxA, modulePermissions: {} }, "en"));
    ok("lisanssız modül (clients) atlanır, yazılmaz", r.skipped.some((s) => s.table === "clients" && s.action === "skip" && s.reason === "unlicensed") && (await dst.pg.query<{ n: number }>("select count(*)::int n from clients")).rows[0].n === 0);
  }
  await dst.pg.close();
  const routes = readdirSync(join(ROOT, "app", "api", "settings"), { recursive: true, withFileTypes: false } as never) as unknown as string[];
  const routeFiles = routes.filter((p) => /(backup|restore|archive)[\\/].*route\.ts$|^(backup|restore|archive)[\\/]route\.ts$/.test(String(p)));
  ok("yedek/geri yükleme/arşiv route'ları bulundu (≥8)", routeFiles.length >= 8, routeFiles);
  for (const f of routeFiles) {
    const s = readFileSync(join(ROOT, "app", "api", "settings", String(f)), "utf8");
    ok(`route kimlik doğrular: ${String(f).replace(/\\/g, "/")}`, /verifyUserRequest|requireArchiveCtx|archiveGuard|guardArchive/.test(s) || /from "@\/lib\/archive\/server\/http"/.test(s));
  }
}

section("[H] user_locale_prefs geri yükleme sözleşmesi");
{
  const entry = getRegistryEntry("user_locale_prefs");
  ok("registry: backup sınıfı, modülsüz, ownerScope user_id, naturalKey user_id", entry?.class === "backup" && entry.module === null && entry.naturalKey === "user_id" && !!entry.ownerScope && "column" in entry.ownerScope && entry.ownerScope.column === "user_id");
  const fileRow = (JSON.parse(fileTr).tables.user_locale_prefs.rows as Row[])[0];
  ok("yedekteki dil tercihi kanonik kod ('en'), çevrilmiş ad değil", fileRow?.preferred_locale === "en", fileRow);
  // Hedef hesapta tercih ZATEN var (tr) → geri yükleme değiştirmez.
  const dst = await newDb();
  await dst.pg.query(`INSERT INTO users (id, tenant_id) VALUES ($1,$2)`, [UA, TA]);
  await dst.pg.query(`INSERT INTO user_locale_prefs (tenant_id, user_id, preferred_locale) VALUES ($1,$2,'tr')`, [TA, UA]);
  const norm = normalizeBackupFile(JSON.parse(fileTr));
  if (norm.ok) {
    const r = await runRestore(norm.backup, makeFetcher(dst.pg, dst.db, ctxA, "tr"));
    const t = r.tables.find((x) => x.table === "user_locale_prefs");
    const now = await dst.pg.query<{ preferred_locale: string; n: number }>(`select preferred_locale, count(*) over ()::int n from user_locale_prefs where user_id = $1`, [UA]);
    ok("mevcut tercih (tr) geri yüklemede DEĞİŞMEZ (already_present, tek satır)", t?.already_present === 1 && t.inserted === 0 && now.rows.length === 1 && now.rows[0].preferred_locale === "tr", { t, rows: now.rows });
  }
  await dst.pg.close();
  // Geçersiz dil kodu → DB CHECK reddi, raporda başarısız.
  const bad = await asService(src.pg, () =>
    handleRestoreChunk(src.db, { ...ctxA, userId: "aaaaaaaa-3333-4000-8000-00000000000a" }, {
      table: "user_locale_prefs",
      rows: [{ id: id("c3e0", 1), tenant_id: TA, user_id: "x", preferred_locale: "xx", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
    }),
  );
  const rep = (bad.body as { report?: { inserted: number; failed: { code: string }[] } }).report;
  ok("geçersiz dil kodu ('xx') yazılmaz (raporda başarısız)", rep?.inserted === 0 && (rep?.failed.length ?? 0) > 0, rep);
}

await src.pg.close();
console.log(`\nbackup-locale.pg.harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
