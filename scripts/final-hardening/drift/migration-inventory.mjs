#!/usr/bin/env node
/**
 * DB-01 (AŞAMA 1, owner: YAPALIM) — repo ↔ production migration envanteri. Ağ/DB YOK.
 *
 * Production'da migration geçmişi kısmi (SQL Editor ile elle uygulandı; `supabase db push` yok),
 * bu yüzden "hangi migration uygulandı?" sorusu migration'ın OLUŞTURDUĞU nesnelerin varlığıyla
 * yanıtlanır. Üç mod:
 *
 *   --emit-sql            Salt-okunur sorgu üretir (yalnız katalog; kullanıcı verisi OKUNMAZ).
 *                         Owner Supabase SQL Editor'da (veya read-only psql) çalıştırır; tek hücre JSON.
 *   --static [--csv]      Repo statik envanteri: migration başına iz nesneleri + yeniden çalıştırma riski.
 *   --emit-recorded-sql   Production migration KAYIT listesini (supabase_migrations.schema_migrations)
 *                         döndüren salt-okunur sorgu (yalnız sürüm + ad; SQL gövdeleri döndürülmez).
 *   --classify <probe.json> [--recorded <recorded.json>] [--csv]
 *   --recorded <recorded.json> (probe olmadan da çalışır)
 *                         Kayıt + katalog kanıtıyla sınıflandırma. KAYIT YOKLUĞU TEK BAŞINA "uygulanmadı"
 *                         DEĞİLDİR: bu projede migration'ların önemli kısmı SQL Editor ile elle uygulandı
 *                         (kayıt oluşturmaz). Etiketler kanıt düzeyini söyler, kesin hüküm vermez.
 *
 * İz nesnesi kuralları (güçlü kanıt): CREATE TABLE / VIEW / INDEX / POLICY / TRIGGER ve
 * ALTER TABLE … ADD COLUMN. Fonksiyonlar ZAYIF kanıttır (aynı ad birçok migration'da yeniden
 * tanımlanır) → yalnız tek migration'da tanımlanan fonksiyon iz sayılır. Sonradan DROP edilen
 * nesneler iz listesinden çıkarılır.
 *
 * Kullanım: node scripts/final-hardening/drift/migration-inventory.mjs --emit-sql > inventory-probe.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const dir = path.join(root, "supabase", "migrations");

const ID = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QN = String.raw`(?:${ID}\s*\.\s*)?${ID}`;
const unq = (s) => s.replace(/"/g, "").trim();
const split = (q) => {
  const parts = unq(q).split(/\s*\.\s*/);
  return parts.length === 2 ? { schema: parts[0].toLowerCase(), name: parts[1].toLowerCase() } : { schema: "public", name: parts[0].toLowerCase() };
};

/** Yorumları ve $$ gövdelerini dışarıda bırakarak üst düzey DDL'i tarar. */
function stripSql(sql) {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "$$BODY$$");
}

export function parseMigration(sql) {
  const raw = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const s = stripSql(sql);
  const objs = [];
  const add = (kind, schema, name, extra = null) => objs.push({ kind, schema, name, extra });
  for (const m of s.matchAll(new RegExp(String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QN})`, "gi"))) {
    const q = split(m[1]); add("table", q.schema, q.name);
  }
  for (const m of s.matchAll(new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QN})`, "gi"))) {
    const q = split(m[1]); add("view", q.schema, q.name);
  }
  for (const m of s.matchAll(new RegExp(String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${ID})\s+ON\s+(?:ONLY\s+)?(${QN})`, "gi"))) {
    const t = split(m[2]); add("index", t.schema, unq(m[1]).toLowerCase(), t.name);
  }
  for (const m of s.matchAll(new RegExp(String.raw`\bCREATE\s+POLICY\s+(${ID})\s+ON\s+(${QN})`, "gi"))) {
    const t = split(m[2]); add("policy", t.schema, unq(m[1]), t.name);
  }
  for (const m of s.matchAll(new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(${ID})[\s\S]*?\bON\s+(${QN})`, "gi"))) {
    const t = split(m[2]); add("trigger", t.schema, unq(m[1]).toLowerCase(), t.name);
  }
  for (const m of s.matchAll(new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QN})([^;]*)`, "gi"))) {
    const t = split(m[1]);
    for (const c of m[2].matchAll(new RegExp(String.raw`\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${ID})\s+(?!CONSTRAINT\b)`, "gi"))) {
      const col = unq(c[1]).toLowerCase();
      if (["constraint", "primary", "unique", "foreign", "check", "exclude"].includes(col)) continue;
      add("column", t.schema, col, t.name);
    }
  }
  for (const m of raw.matchAll(new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(${QN})\s*\(`, "gi"))) {
    const q = split(m[1]); add("function", q.schema, q.name);
  }
  const drops = [];
  for (const m of s.matchAll(new RegExp(String.raw`\bDROP\s+(TABLE|VIEW|MATERIALIZED\s+VIEW|INDEX|FUNCTION|TRIGGER|POLICY)\s+(?:IF\s+EXISTS\s+)?(${QN})(?:\s+ON\s+(${QN}))?`, "gi"))) {
    const kind = m[1].toLowerCase().replace(/materialized\s+view/, "view");
    const q = split(m[2]);
    drops.push({ kind, schema: q.schema, name: kind === "policy" ? unq(m[2]) : q.name, extra: m[3] ? split(m[3]).name : null });
  }
  for (const m of s.matchAll(new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QN})[^;]*?\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(${ID})`, "gi"))) {
    const t = split(m[1]); drops.push({ kind: "column", schema: t.schema, name: unq(m[2]).toLowerCase(), extra: t.name });
  }

  // Yeniden çalıştırma riski (sezgisel; kesin değil).
  const risks = [];
  if (/\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(s)) risks.push("CREATE TABLE (IF NOT EXISTS yok)");
  if (/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?!IF\s+NOT\s+EXISTS)/i.test(s)) risks.push("CREATE INDEX (IF NOT EXISTS yok)");
  if (/\bCREATE\s+POLICY\b/i.test(s) && !/\bDROP\s+POLICY\s+IF\s+EXISTS\b/i.test(s)) risks.push("CREATE POLICY (önce DROP POLICY IF EXISTS yok)");
  if (/\bCREATE\s+FUNCTION\b/i.test(s)) risks.push("CREATE FUNCTION (OR REPLACE yok)");
  if (/\bCREATE\s+TRIGGER\b/i.test(s) && !/\bDROP\s+TRIGGER\s+IF\s+EXISTS\b/i.test(s)) risks.push("CREATE TRIGGER (önce DROP yok)");
  if (/\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/i.test(s)) risks.push("ADD COLUMN (IF NOT EXISTS yok)");
  if (/\bADD\s+CONSTRAINT\b/i.test(s) && !/\bpg_constraint\b/i.test(raw) && !/\bDROP\s+CONSTRAINT\s+IF\s+EXISTS\b/i.test(s)) risks.push("ADD CONSTRAINT (koruma yok)");
  if (/\bINSERT\s+INTO\b/i.test(s) && !/\bON\s+CONFLICT\b/i.test(s) && !/\bWHERE\s+NOT\s+EXISTS\b/i.test(s)) risks.push("INSERT (ON CONFLICT yok)");
  if (/\b(UPDATE\s+(?:ONLY\s+)?[A-Za-z_"][^;]*\bSET\b|DELETE\s+FROM)\b/i.test(s)) risks.push("veri değiştiren UPDATE/DELETE");
  if (/\bTRUNCATE\b/i.test(s)) risks.push("TRUNCATE");
  if (/\bDROP\s+(TABLE|COLUMN)\b/i.test(s)) risks.push("DROP TABLE/COLUMN (veri kaybı)");
  if (/\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i.test(s)) risks.push("ALTER COLUMN TYPE");
  return { objs, drops, risks };
}

export function buildInventory() {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const parsed = files.map((f) => ({ file: f, ...parseMigration(fs.readFileSync(path.join(dir, f), "utf8")) }));
  const key = (o) => `${o.kind}|${o.schema}|${o.name}|${o.extra ?? ""}`;
  const fnCount = new Map();
  for (const p of parsed) for (const o of new Set(p.objs.filter((x) => x.kind === "function").map((x) => `${x.schema}.${x.name}`))) {
    fnCount.set(o, (fnCount.get(o) ?? 0) + 1);
  }
  const rows = [];
  parsed.forEach((p, i) => {
    const later = parsed.slice(i + 1).flatMap((q) => q.drops);
    const droppedLater = new Set(later.map((d) => (d.kind === "policy" || d.kind === "column" || d.kind === "trigger" ? key(d) : `${d.kind}|${d.schema}|${d.name}|`)));
    const seen = new Set();
    const markers = [];
    for (const o of p.objs) {
      const k = key(o);
      if (seen.has(k)) continue;
      seen.add(k);
      if (o.kind === "function" && fnCount.get(`${o.schema}.${o.name}`) > 1) continue; // zayıf iz
      const dk = o.kind === "policy" || o.kind === "column" || o.kind === "trigger" ? k : `${o.kind}|${o.schema}|${o.name}|`;
      if (droppedLater.has(dk)) continue;
      if (o.schema !== "public" && o.schema !== "storage") continue;
      markers.push(o);
    }
    rows.push({ file: p.file, version: p.file.slice(0, 14), markers, risks: p.risks, redefinedFunctions: p.objs.filter((o) => o.kind === "function" && fnCount.get(`${o.schema}.${o.name}`) > 1).length });
  });
  return rows;
}

const lit = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);

export function emitProbeSql(rows) {
  const values = rows.flatMap((r) => r.markers.map((o) => `(${lit(r.file)},${lit(o.kind)},${lit(o.schema)},${lit(o.name)},${lit(o.extra)})`));
  return `-- DB-01 migration envanter sorgusu — YALNIZ KATALOG (pg_catalog / pg_policies / information_schema).
-- Kullanıcı verisi OKUMAZ, hiçbir şeyi DEĞİŞTİRMEZ. Çıktı: tek hücre JSON (probe).
-- Üretim: node scripts/final-hardening/drift/migration-inventory.mjs --emit-sql
-- Sınıflandırma: node scripts/final-hardening/drift/migration-inventory.mjs --classify probe.json
SET TRANSACTION READ ONLY;
WITH m(file, kind, sch, name, extra) AS (VALUES
${values.join(",\n")}
)
SELECT jsonb_build_object(
  'format', 'yasam-migration-probe', 'version', 1, 'captured_at', now(),
  'server_version', current_setting('server_version'),
  'migrations_table', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  -- Ters yön (prod'da olup repoda olmayan): yalnız ad + tür (katalog metadata'sı).
  'public_relations', (SELECT jsonb_agg(jsonb_build_object('name', c.relname, 'kind', c.relkind::text) ORDER BY c.relname)
                         FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')),
  'markers', jsonb_agg(jsonb_build_object('file', m.file, 'kind', m.kind, 'schema', m.sch, 'name', m.name, 'extra', m.extra,
    'exists', CASE m.kind
      WHEN 'table'    THEN to_regclass(format('%I.%I', m.sch, m.name)) IS NOT NULL
      WHEN 'view'     THEN to_regclass(format('%I.%I', m.sch, m.name)) IS NOT NULL
      WHEN 'index'    THEN EXISTS (SELECT 1 FROM pg_catalog.pg_indexes i WHERE i.schemaname = m.sch AND i.indexname = m.name)
      WHEN 'policy'   THEN EXISTS (SELECT 1 FROM pg_catalog.pg_policies p WHERE p.schemaname = m.sch AND p.tablename = m.extra AND p.policyname = m.name)
      WHEN 'trigger'  THEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
                                    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                                   WHERE n.nspname = m.sch AND c.relname = m.extra AND t.tgname = m.name AND NOT t.tgisinternal)
      WHEN 'column'   THEN EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = m.sch AND c.table_name = m.extra AND c.column_name = m.name)
      WHEN 'function' THEN EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                                   WHERE n.nspname = m.sch AND p.proname = m.name)
    END))
) AS probe
FROM m;

-- (İSTEĞE BAĞLI, ayrı çalıştırın) Supabase migration tablosu varsa kayıtlı sürümler:
-- SELECT jsonb_agg(version ORDER BY version) AS recorded_versions FROM supabase_migrations.schema_migrations;
`;
}

/** Kayıt listesini normalize eder: ["2026…", …] | [{version,name}] | [{recorded:[…]}] | {recorded:[…]}. */
export function parseRecorded(input) {
  let v = typeof input === "string" ? JSON.parse(input) : input;
  if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === "object" && !("version" in v[0])) v = Object.values(v[0])[0];
  if (v && !Array.isArray(v) && typeof v === "object") v = Object.values(v)[0];
  if (typeof v === "string") v = JSON.parse(v);
  if (!Array.isArray(v)) throw new Error("Geçersiz kayıt listesi");
  const map = new Map();
  for (const x of v) {
    const ver = String(typeof x === "object" && x ? x.version : x).trim();
    if (!/^\d{8,14}$/.test(ver)) continue;
    map.set(ver, typeof x === "object" && x ? (x.name ?? null) : null);
  }
  return map;
}

export function emitRecordedSql() {
  return `-- DB-01: production migration KAYIT listesi — salt-okunur; yalnız sürüm + ad (SQL gövdesi DÖNMEZ).
SET TRANSACTION READ ONLY;
SELECT jsonb_agg((to_jsonb(m) - 'statements' - 'created_by' - 'idempotency_key') ORDER BY m.version) AS recorded
FROM supabase_migrations.schema_migrations m;
`;
}

/** Kayıt ↔ repo öneki karşılaştırması (katalogdan bağımsız). */
export function compareRecorded(rows, recorded) {
  const byPrefix = new Map();
  for (const r of rows) byPrefix.set(r.version, [...(byPrefix.get(r.version) ?? []), r.file]);
  const recordedInRepo = [...recorded.keys()].filter((v) => byPrefix.has(v));
  return {
    recordedTotal: recorded.size,
    repoFiles: rows.length,
    repoPrefixes: byPrefix.size,
    recordedInRepo: recordedInRepo.length,
    recordedNotInRepo: [...recorded.keys()].filter((v) => !byPrefix.has(v)),
    repoPrefixesNotRecorded: [...byPrefix.keys()].filter((v) => !recorded.has(v)).length,
    ambiguousRecorded: recordedInRepo.filter((v) => byPrefix.get(v).length > 1).map((v) => ({ version: v, files: byPrefix.get(v) })),
  };
}

export function classify(rows, probe, recorded = null) {
  const p = typeof probe === "string" ? JSON.parse(probe) : (probe ?? { markers: [] });
  const obj = Array.isArray(p) ? p[0] : p;
  const pr = obj?.probe ? (typeof obj.probe === "string" ? JSON.parse(obj.probe) : obj.probe) : obj;
  const haveProbe = probe != null;
  const byFile = new Map();
  for (const mk of pr.markers ?? []) {
    if (!byFile.has(mk.file)) byFile.set(mk.file, []);
    byFile.get(mk.file).push(mk);
  }
  const repoRel = new Set(rows.flatMap((r) => r.markers.filter((o) => (o.kind === "table" || o.kind === "view") && o.schema === "public").map((o) => o.name)));
  classify.prodOnly = (pr.public_relations ?? []).filter((x) => !repoRel.has(x.name));
  return rows.map((r) => {
    const mk = byFile.get(r.file) ?? [];
    const yes = mk.filter((x) => x.exists === true).length;
    const evidence = !haveProbe ? "KATALOG YOK"
      : !r.markers.length ? "İZ YOK"
        : yes === mk.length && mk.length ? "NESNELER VAR"
          : yes === 0 ? "NESNELER YOK"
            : "KISMİ";
    const rec = recorded ? (recorded.has(r.version) ? "KAYITLI" : "KAYITSIZ") : null;
    // Hüküm (kanıt düzeyi): yalnız kayıt + nesne birlikteyse "uygulanmış"; kayıtsız + nesne yok → "uygulanmamış OLASI".
    const verdict =
      evidence === "NESNELER VAR" ? (rec === "KAYITLI" ? "UYGULANMIŞ (kayıt + katalog)" : rec === "KAYITSIZ" ? "ELLE UYGULANMIŞ OLASI (kayıt yok, nesneler var)" : "NESNELER VAR (kayıt bilinmiyor)")
        : evidence === "NESNELER YOK" ? (rec === "KAYITLI" ? "İNCELE: kayıtlı ama nesneler yok (sonradan değişmiş olabilir)" : "UYGULANMAMIŞ OLASI (kesin değil)")
          : evidence === "KISMİ" ? "İNCELE: kısmi nesne"
            : rec === "KAYITLI" ? "KAYITLI (katalogla doğrulanamaz)" : "BİLİNMİYOR";
    const status = rec ? `${rec} + ${evidence}` : evidence;
    return { ...r, status, verdict, recorded: rec, present: yes, total: mk.length, missing: mk.filter((x) => !x.exists).map((x) => `${x.kind}:${x.extra ? `${x.extra}.` : ""}${x.name}`) };
  });
}

function toCsv(rows, withStatus) {
  const head = ["migration", ...(withStatus ? ["durum", "hüküm (kanıt düzeyi)", "var/toplam", "eksik iz"] : []), "iz nesnesi sayısı", "iz nesneleri", "yeniden çalıştırma riski"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [head.join(";"), ...rows.map((r) => [
    r.file,
    ...(withStatus ? [r.status, r.verdict, `${r.present}/${r.total}`, r.missing.join(" | ")] : []),
    r.markers.length,
    r.markers.map((o) => `${o.kind}:${o.extra ? `${o.extra}.` : ""}${o.name}`).join(" | "),
    r.risks.join(" | "),
  ].map(esc).join(";"))].join("\n");
}

function main(argv) {
  const args = argv.slice(2);
  const rows = buildInventory();
  if (args.includes("--emit-sql")) { process.stdout.write(emitProbeSql(rows)); return 0; }
  if (args.includes("--emit-recorded-sql")) { process.stdout.write(emitRecordedSql()); return 0; }
  const recFile = args.includes("--recorded") ? args[args.indexOf("--recorded") + 1] : null;
  const recorded = recFile ? parseRecorded(fs.readFileSync(path.resolve(recFile), "utf8")) : null;
  if (args.includes("--classify") || recorded) {
    const f = args.includes("--classify") ? args[args.indexOf("--classify") + 1] : null;
    if (args.includes("--classify") && !f) { console.error("probe.json gerekli"); return 2; }
    const out = classify(rows, f ? fs.readFileSync(path.resolve(f), "utf8") : null, recorded);
    if (args.includes("--csv")) { console.log(toCsv(out, true)); return 0; }
    const by = {};
    for (const r of out) by[r.verdict] = (by[r.verdict] ?? 0) + 1;
    console.log(JSON.stringify({ summary: by, recorded: recorded ? compareRecorded(rows, recorded) : null,
      prodOnlyRelations: classify.prodOnly, rows: out.filter((r) => !/^UYGULANMIŞ \(kayıt/.test(r.verdict)) }, null, 2));
    return 0;
  }
  if (args.includes("--csv")) { console.log(toCsv(rows, false)); return 0; }
  const withMarkers = rows.filter((r) => r.markers.length).length;
  const risky = rows.filter((r) => r.risks.length).length;
  console.log(JSON.stringify({ migrations: rows.length, withMarkers, withoutMarkers: rows.length - withMarkers, rerunRisky: risky,
    markerTotal: rows.reduce((a, r) => a + r.markers.length, 0) }, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv));
}
