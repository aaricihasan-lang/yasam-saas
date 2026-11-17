#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-J — F2 KATALOG MANİFESTİ üreticisi / denetleyicisi.
 *
 * Gerçek migration zincirini geçici embedded-postgres'te production sırasıyla uygular (prod'daki Supabase varsayılan
 * yetkileri — pg_default_acl, 17.11 salt-okunur okundu — taklit edilir) ve her doğrusal aşamadan sonra F2'nin
 * oluşturduğu / değiştirdiği nesnelerin "katalog satırlarını" çıkarır:
 *   fn  | ad(imza) | md5(gövde, \r normalize) | SECURITY DEFINER | proconfig (search_path) | api(anon/authenticated) | service_role
 *   trg | tablo.tetikleyici | fonksiyon | etkin | md5(tanım)
 *   tbl | tablo | RLS | api | service_role SIUD
 *   col | tablo.kolon | tür | NOT NULL
 * Üretilenler (repo'ya commit edilir, CI `--denetle` ile güncelliğini doğrular):
 *   - scripts/giris-guvenligi/f2-preflight.sql   → SALT-OKUNUR ön kontrol (her migration için karar satırı)
 *   - scripts/giris-guvenligi/f2-postflight-check.sql içindeki "KATALOG MANİFESTİ" bölümü (son aşama satır satır)
 *
 * Kullanım: node scripts/giris-guvenligi/f2-katalog.mjs --uret | --denetle
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { F2_STAGES, LOCK_FILE } from "./f2-migration-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nm = path.join(root, "node_modules");
const MIGDIR = path.join(root, "supabase", "migrations");
const PRE_SQL = path.join(root, "scripts", "giris-guvenligi", "f2-preflight.sql");
const POST_SQL = path.join(root, "scripts", "giris-guvenligi", "f2-postflight-check.sql");
const MAN_BEGIN = "-- >>> KATALOG MANİFESTİ (üretici: scripts/giris-guvenligi/f2-katalog.mjs --uret — elle değiştirmeyin)";
const MAN_END = "-- <<< KATALOG MANİFESTİ";

const F = (n) => `scripts/final-hardening/fixtures/${n}`;
const M = (n) => `supabase/migrations/${n}`;
const BASE = [F("session-model-fixture.sql"), F("session-f2a-fixture.sql"), F("session-f2b-fixture.sql"),
  F("session-f2c-fixture.sql"), F("session-f2d-fixture.sql"),
  M("20270129000200_user_sessions_expiry_touch.sql"), M("20271003200000_session_model_v2.sql"), M("20271003200100_admin_audit_session_actions.sql")];

/** Production'daki Supabase varsayılan yetkileri (postgres rolünün public şemasında oluşturduğu nesneler). */
const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated, service_role;`;

/** F2 dosyalarını ayrıştırarak nesne listesi: tür, ad, ilk aşama, F2 mi oluşturdu (created) yoksa önceden var mı (modified). */
export function objectList() {
  const files = fs.readdirSync(MIGDIR).filter((f) => /^20280103\d{6}_.*\.sql$/.test(f)).sort();
  const stageOf = (f) => F2_STAGES.find((s) => s.file === f.slice(0, 14));
  const objs = new Map();
  const add = (kind, name, lvl) => { const k = `${kind}:${name}`; if (!objs.has(k)) objs.set(k, { kind, name, lvl }); };
  for (const f of files) {
    if (f.startsWith(LOCK_FILE)) continue;
    const lvl = stageOf(f).level;
    const t = fs.readFileSync(path.join(MIGDIR, f), "utf8").replace(/--[^\n]*/g, "");
    for (const m of t.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)/gi)) add("fn", m[1].toLowerCase(), lvl);
    for (const m of t.matchAll(/CREATE\s+TRIGGER\s+([a-z0-9_]+)/gi)) add("trg", m[1].toLowerCase(), lvl);
    for (const m of t.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z0-9_]+)/gi)) add("tbl", m[1].toLowerCase(), lvl);
    // ALTER TABLE … ; ifadesi içindeki BÜTÜN "ADD COLUMN" kolonları (çoklu ADD dahil).
    for (const m of t.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?public\.([a-z0-9_]+)([^;]*);/gi)) {
      for (const c of m[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)/gi)) {
        add("col", `${m[1].toLowerCase()}.${c[1].toLowerCase()}`, lvl);
      }
    }
  }
  // F2 tablolarının tüm kolonları ayrıca 'tbl' satırları üzerinden alınır (aşağıdaki SQL).
  return [...objs.values()].sort((a, b) => (a.kind + a.name).localeCompare(b.kind + b.name));
}

/** Katalog satırı SQL'i — üretici, postflight ve preflight AYNI metni kullanır (aynı özet). `obj(kind,name,lvl)` CTE'si verilir. */
export const LINES_SQL = `
fnl AS (
  SELECT o.lvl, 'fn|' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')|'
         || md5(replace(p.prosrc, chr(13), '')) || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '-')
         || '|api=' || (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text
         || '|svc=' || CASE WHEN p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype THEN '*'
                            ELSE has_function_privilege('service_role', p.oid, 'EXECUTE')::text END AS line
    FROM obj o JOIN pg_catalog.pg_proc p ON p.proname = o.name
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE o.kind = 'fn'),
trl AS (
  SELECT o.lvl, 'trg|' || c.relname || '.' || g.tgname || '|' || p.proname || '|' || g.tgenabled::text || '|'
         || md5(pg_catalog.pg_get_triggerdef(g.oid)) AS line
    FROM obj o JOIN pg_catalog.pg_trigger g ON g.tgname = o.name AND NOT g.tgisinternal
    JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_proc p ON p.oid = g.tgfoid
   WHERE o.kind = 'trg'),
tbl AS (
  SELECT o.lvl, 'tbl|' || c.relname || '|rls=' || c.relrowsecurity::text
         || '|api=' || (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
                        OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))::text
         || '|svc=' || has_table_privilege('service_role', c.oid, 'SELECT')::text || ',' || has_table_privilege('service_role', c.oid, 'INSERT')::text
         || ',' || has_table_privilege('service_role', c.oid, 'UPDATE')::text || ',' || has_table_privilege('service_role', c.oid, 'DELETE')::text AS line
    FROM obj o JOIN pg_catalog.pg_class c ON c.relname = o.name AND c.relkind = 'r'
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE o.kind = 'tbl'),
cll AS (
  SELECT o.lvl, 'col|' || c.relname || '.' || a.attname || '|' || pg_catalog.format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text AS line
    FROM obj o JOIN pg_catalog.pg_class c ON c.relkind = 'r' AND (
           (o.kind = 'tbl' AND c.relname = o.name) OR (o.kind = 'col' AND c.relname = split_part(o.name, '.', 1)))
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
         AND (o.kind = 'tbl' OR a.attname = split_part(o.name, '.', 2))),
lines AS (SELECT lvl, line FROM fnl UNION ALL SELECT lvl, line FROM trl UNION ALL SELECT lvl, line FROM tbl UNION ALL SELECT lvl, line FROM cll)`;

const objValues = (objs) => objs.map((o) => `('${o.kind}', '${o.name}', ${o.lvl})`).join(",\n  ");
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

async function generate() {
  const { default: EP } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
  const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;
  const objs = objectList();
  const files = fs.readdirSync(MIGDIR).filter((f) => /^20280103\d{6}_.*\.sql$/.test(f)).sort();
  const linear = files.filter((f) => !f.startsWith(LOCK_FILE));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2j-man-"));
  const port = 52000 + Math.floor(Math.random() * 2000);
  const s = new EP({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
  const stages = [];
  const q = `WITH obj(kind, name, lvl) AS (VALUES\n  ${objValues(objs)}\n),${LINES_SQL}\nSELECT lvl, line FROM lines ORDER BY line`;
  try {
    await s.initialise();
    await s.start();
    const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
    await c.connect();
    c.on("notice", () => {});
    await c.query(BOOT);
    for (const f of BASE) await c.query(fs.readFileSync(path.join(root, f), "utf8"));
    const base = (await c.query(q)).rows;
    for (const f of linear) {
      await c.query(fs.readFileSync(path.join(MIGDIR, f), "utf8"));
      const lvl = F2_STAGES.find((x) => x.file === f.slice(0, 14)).level;
      const rows = (await c.query(q)).rows.filter((r) => r.lvl <= lvl).map((r) => r.line);
      stages.push({ lvl, hash: md5(rows.join("\n")), lines: rows });
    }
    await c.end();
    // Önceden var olan (F2'nin değiştirdiği) fonksiyonların F2 ÖNCESİ gövdeleri: prod ile karşılaştırma için.
    stages.base = base.filter((r) => r.line.startsWith("fn|")).map((r) => r.line);
  } finally {
    await s.stop().catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* geçici */ }
  }
  return { objs, stages };
}

function renderPreflight({ objs, stages }) {
  const finalLvl = stages[stages.length - 1].lvl;
  const hashes = stages.map((st) => `(${st.lvl}, '${st.hash}')`).join(", ");
  const fps = F2_STAGES.filter((x) => stages.some((st) => st.lvl === x.level))
    .map((x) => `(${x.level}, '${x.file}', ${x.fp})`).join(",\n    ");
  const baseFns = (stages.base ?? []).map((l) => `('${l.replace(/'/g, "''")}')`).join(",\n    ") || "(NULL)";
  return `-- GİRİŞ GÜVENLİĞİ F2 — production ÖN KONTROLÜ (SALT-OKUNUR; hiçbir migration uygulamaz, hiçbir şey yazmaz).
-- ÜRETİLMİŞ DOSYA: scripts/giris-guvenligi/f2-katalog.mjs --uret (elle değiştirmeyin). Tek SELECT; READ ONLY transaction içinde
-- çalıştırın: BEGIN READ ONLY; \\i scripts/giris-guvenligi/f2-preflight.sql ; ROLLBACK;
-- Her F2 migration'ı için tek satır: on_kontrol|<sürüm>|<KARAR>|<ayrıntı>. Kararlar:
--   UYGULANABİLİR · ZATEN UYGULANMIŞ · YENİDEN UYGULAMA YASAK · SIRA HATASI · ŞEMA SAPMASI · İNSAN İNCELEMESİ GEREKLİ
-- Kaynaklar: kayıt (auth_f2_schema_level gövdesi), katalog parmak izleri, aşama bazında katalog özeti (fonksiyon imza+gövde+
-- SECURITY DEFINER+search_path+yetki, tetikleyici, tablo RLS/yetki, kolon), migration geçmişi (supabase_migrations).
WITH obj(kind, name, lvl) AS (VALUES
  ${objValues(objs)}
),${LINES_SQL},
expected(lvl, hash) AS (VALUES ${hashes}),
fps(lvl, file, present) AS (VALUES
    ${fps}
),
reg AS (
  SELECT max(substring(p.prosrc FROM '([0-9]+)')::int) AS lvl
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'auth_f2_schema_level'),
cur AS (SELECT coalesce(max(lvl) FILTER (WHERE present), -1) AS fp,
               string_agg(lpad(lvl::text, 6, '0'), ',' ORDER BY lvl) FILTER (WHERE NOT present
                 AND lvl < (SELECT coalesce(max(f2.lvl) FILTER (WHERE f2.present), -1) FROM fps f2)) AS gaps
          FROM fps),
actual AS (SELECT e.lvl, md5(coalesce((SELECT string_agg(l.line, E'\\n' ORDER BY l.line) FROM lines l WHERE l.lvl <= e.lvl), '')) AS hash
             FROM expected e),
basefn(line) AS (VALUES
    ${baseFns}
),
state AS (
  SELECT (SELECT lvl FROM reg) AS reg, c.fp, c.gaps,
         CASE WHEN c.fp < 0 THEN (SELECT count(*) FROM lines l WHERE l.line LIKE 'fn|%' AND l.line NOT IN (SELECT line FROM basefn)
                                     AND split_part(split_part(l.line, '|', 2), '(', 1) IN (SELECT name FROM obj WHERE kind = 'fn' AND lvl = 0)) = 0
                                  AND NOT EXISTS (SELECT 1 FROM lines l WHERE l.line NOT LIKE 'fn|%')
              ELSE (SELECT a.hash = e.hash FROM actual a JOIN expected e USING (lvl) WHERE a.lvl = c.fp) END AS catalog_ok,
         (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL) AS has_ledger,
         has_table_privilege('service_role', 'public.user_sessions', 'INSERT') AS svc_insert
    FROM cur c),
ledger AS (SELECT version FROM supabase_migrations.schema_migrations WHERE version LIKE '20280103%'),
appl AS (SELECT f.file AS version FROM fps f CROSS JOIN state s WHERE f.lvl <= s.fp
         UNION SELECT '${LOCK_FILE}' FROM state s WHERE NOT s.svc_insert AND s.fp >= 100),
ledger_diff AS (
  SELECT (SELECT string_agg(version, ',' ORDER BY version) FROM (SELECT version FROM appl EXCEPT SELECT version FROM ledger) a) AS missing,
         (SELECT string_agg(version, ',' ORDER BY version) FROM (SELECT version FROM ledger EXCEPT SELECT version FROM appl) b) AS extra),
verdict AS (
  SELECT f.file, f.lvl,
    CASE
      WHEN s.gaps IS NOT NULL THEN 'ŞEMA SAPMASI|eksik ara aşama(lar): ' || s.gaps
      WHEN (s.reg IS NULL AND s.fp >= 0) OR (s.reg IS NOT NULL AND s.reg <> s.fp) THEN
        'İNSAN İNCELEMESİ GEREKLİ|kayıt=' || coalesce(s.reg::text, 'yok') || ' katalog=' || s.fp
      WHEN s.catalog_ok IS NOT TRUE THEN 'ŞEMA SAPMASI|katalog ' || CASE WHEN s.fp < 0 THEN 'F2 öncesi' ELSE lpad(s.fp::text, 6, '0') END
                                         || ' aşamasının beklenen özetiyle uyuşmuyor (gövde/imza/yetki/tetikleyici/kolon)'
      WHEN f.lvl < s.fp THEN 'YENİDEN UYGULAMA YASAK|daha yeni aşama ' || lpad(s.fp::text, 6, '0') || ' uygulanmış'
      WHEN f.lvl = s.fp THEN 'ZATEN UYGULANMIŞ|son aşama; yeniden uygulama gereksiz'
      WHEN f.lvl = (SELECT min(f3.lvl) FROM fps f3 WHERE f3.lvl > s.fp) THEN
        CASE WHEN (SELECT missing IS NULL AND extra IS NULL FROM ledger_diff) THEN 'UYGULANABİLİR|sıradaki aşama'
             ELSE 'İNSAN İNCELEMESİ GEREKLİ|sıradaki aşama ama migration geçmişi katalogla uyuşmuyor' END
      ELSE 'SIRA HATASI|önce ' || (SELECT min(f3.file) FROM fps f3 WHERE f3.lvl > s.fp) || ' uygulanmalı'
    END AS v
    FROM fps f CROSS JOIN state s)
SELECT 'on_kontrol|' || file || '|' || v FROM verdict
UNION ALL
SELECT 'on_kontrol|${LOCK_FILE}|' || CASE
    WHEN NOT s.svc_insert THEN 'ZATEN UYGULANMIŞ|service_role user_sessions INSERT kapalı'
    WHEN s.fp < 100 THEN 'SIRA HATASI|000100 gerekli'
    WHEN s.fp < ${finalLvl} OR s.catalog_ok IS NOT TRUE THEN 'SIRA HATASI|tüm doğrusal zincir + kod yayını + canlı doğrulama SONRASI en son uygulanır'
    WHEN NOT (SELECT missing IS NULL AND extra IS NULL FROM ledger_diff) THEN 'İNSAN İNCELEMESİ GEREKLİ|migration geçmişi katalogla uyuşmuyor'
    ELSE 'UYGULANABİLİR|YALNIZ yeni kod production''da ve canlı doğrulama PASS ise (eski kodla admin web girişi kesilir)' END
  FROM state s
UNION ALL
SELECT 'gecmis|' || CASE WHEN d.missing IS NULL AND d.extra IS NULL THEN 'UYUMLU' ELSE 'UYUMSUZ' END
       || '|katalogda var gecmiste yok=' || coalesce(d.missing, '-') || '|gecmiste var katalogda yok=' || coalesce(d.extra, '-') FROM ledger_diff d
UNION ALL
SELECT 'durum|kayıt=' || coalesce(s.reg::text, 'yok') || '|katalog=' || s.fp || '|katalog_ozeti=' || coalesce(s.catalog_ok::text, 'bilinmiyor')
       || '|gecmis_tablosu=' || s.has_ledger || '|svc_insert=' || s.svc_insert FROM state s
UNION ALL
SELECT 'bilgi|F2 öncesi gövde farkı|' || split_part(l.line, '|', 2) FROM lines l
 WHERE (SELECT fp FROM state) < 0 AND l.line LIKE 'fn|%' AND l.line NOT IN (SELECT line FROM basefn)
   AND split_part(split_part(l.line, '|', 2), '(', 1) IN (SELECT name FROM obj WHERE kind = 'fn')
ORDER BY 1;
`;
}

function renderPostflightSection({ objs, stages }) {
  const fin = stages[stages.length - 1];
  const exp = fin.lines.map((l) => `('${l.replace(/'/g, "''")}')`).join(",\n      ");
  return `${MAN_BEGIN}
-- Son aşamanın (${String(fin.lvl).padStart(6, "0")}) TAM katalog satırları: fonksiyon imzası + gövde özeti + SECURITY DEFINER + search_path +
-- API/service_role yetkisi, tetikleyiciler, F2 tabloları (RLS/yetki) ve kolonlar. Eksik, fazla (ör. eski overload) veya farklı her
-- satır FAIL'dir. Ayrıca kayıt düzeyi = ${fin.lvl}.
DO $f2man$
DECLARE
  v_missing text;
  v_extra   text;
  v_reg     integer;
BEGIN
  WITH obj(kind, name, lvl) AS (VALUES
  ${objValues(objs)}
  ),${LINES_SQL},
  exp(line) AS (VALUES
      ${exp}
  )
  SELECT (SELECT string_agg(e.line, ' ; ' ORDER BY e.line) FROM (SELECT line FROM exp EXCEPT SELECT line FROM lines) e),
         (SELECT string_agg(a.line, ' ; ' ORDER BY a.line) FROM (SELECT line FROM lines EXCEPT SELECT line FROM exp) a)
    INTO v_missing, v_extra;
  SELECT max(substring(p.prosrc FROM '([0-9]+)')::int) INTO v_reg FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'auth_f2_schema_level';
  IF v_missing IS NOT NULL OR v_extra IS NOT NULL OR v_reg IS DISTINCT FROM ${fin.lvl} THEN
    RAISE EXCEPTION 'F2 POSTFLIGHT KATALOG FAIL — kayıt=% (beklenen ${fin.lvl}) | beklenip bulunmayan/farklı: % | beklenmeyen: %',
      coalesce(v_reg::text, 'yok'), left(coalesce(v_missing, '-'), 3000), left(coalesce(v_extra, '-'), 3000);
  END IF;
  RAISE NOTICE 'F2 POSTFLIGHT KATALOG PASS (% satır)', ${fin.lines.length};
END $f2man$;
${MAN_END}`;
}

function withSection(text, section) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const t = text.replace(/\r\n/g, "\n");
  const i = t.indexOf(MAN_BEGIN);
  const base = i >= 0 ? t.slice(0, i).replace(/\n+$/, "\n") : t.replace(/\n*$/, "\n");
  if (i >= 0 && t.indexOf(MAN_END, i) < 0) throw new Error("manifest bölüm sonu yok");
  return (base + "\n" + section + "\n").replace(/\n/g, eol);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const write = process.argv.includes("--uret");
  const g = await generate();
  const pre = renderPreflight(g);
  const post = withSection(fs.readFileSync(POST_SQL, "utf8"), renderPostflightSection(g));
  if (write) {
    fs.writeFileSync(PRE_SQL, pre);
    fs.writeFileSync(POST_SQL, post);
    console.log(`yazıldı: f2-preflight.sql, f2-postflight-check.sql (aşama ${g.stages.length}, son aşama satırı ${g.stages[g.stages.length - 1].lines.length})`);
  } else {
    const lf = (x) => x.split("\r\n").join("\n"); // git autocrlf: satır sonu farkı içerik farkı değildir
    const okPre = fs.existsSync(PRE_SQL) && lf(fs.readFileSync(PRE_SQL, "utf8")) === lf(pre);
    const okPost = lf(fs.readFileSync(POST_SQL, "utf8")) === lf(post);
    console.log(`f2-katalog denetimi: preflight ${okPre ? "güncel" : "ESKİ"} · postflight manifesti ${okPost ? "güncel" : "ESKİ"}`);
    console.log(`f2-katalog: ${okPre && okPost ? "1 PASS, 0 FAIL" : "0 PASS, 1 FAIL (--uret ile yeniden üretin)"}`);
    process.exit(okPre && okPost ? 0 : 1);
  }
}
