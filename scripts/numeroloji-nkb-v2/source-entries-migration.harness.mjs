/**
 * NKB-V2-L3 — numerology_knowledge_source_entries migration statik doğrulama harness'ı.
 * Salt-okuma: migration SQL'ini okur, L2'de kilitlenen exact şema/güvenlik sözleşmesini
 * YAPISAL olarak kanıtlar (yalnız kelime-arama DEĞİL: kolon tipi/nullability/default,
 * constraint tanımı, FK hedef+ON DELETE, index kolonları, RLS/grant, trigger, yasaklar).
 * DB'ye BAĞLANMAZ, SQL ÇALIŞTIRMAZ.
 *
 * Çalıştır: node scripts/numeroloji-nkb-v2/source-entries-migration.harness.mjs
 * FAIL > 0 → exit 1, FAIL = 0 → exit 0.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(HERE, "..", "..", "supabase", "migrations");
const FILENAME = "20260816000000_numerology_knowledge_source_entries.sql";
const MIGRATION = join(MIG_DIR, FILENAME);

const sql = readFileSync(MIGRATION, "utf8");
// Yorumları çıkar: yasak-kontroller yalnız GERÇEK ifadelere baksın (header yorumundaki
// "entry_kind/INSERT/COMMENT ON/FORCE RLS" gibi sözler yanlış-pozitif üretmesin).
const code = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const T = "public.numerology_knowledge_source_entries";
const migrations = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));

let pass = 0, fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
  if (ok) pass++; else fail++;
}

// Kolon satırı yakalayıcı (CREATE TABLE gövdesinden)
const bodyMatch = code.match(/CREATE TABLE public\.numerology_knowledge_source_entries\s*\(([\s\S]*?)\n\);/i);
const tableBody = bodyMatch ? bodyMatch[1] : "";
const colLine = (name) => (tableBody.split("\n").find((l) => new RegExp(`^\\s*${name}\\s`, "i").test(l)) || "").trim();

// ---- 1-2: filename / timestamp ----
check("1 migration exact filename/timestamp mevcut", sql.length > 0 && FILENAME === "20260816000000_numerology_knowledge_source_entries.sql");
check("2 timestamp (20260816000000) başka migration ile çakışmıyor",
  migrations.filter((f) => f.startsWith("20260816000000")).length === 1);

// ---- 3-5: transaction ----
const noBlank = code.split("\n").map((l) => l.trim()).filter(Boolean);
check("3 BEGIN ilk executable statement", noBlank[0] === "BEGIN;");
check("4 COMMIT son executable statement", noBlank[noBlank.length - 1] === "COMMIT;");
check("5 tek transaction (tek BEGIN; + tek COMMIT;)",
  (code.match(/^BEGIN;$/gm) || []).length === 1 && (code.match(/^COMMIT;$/gm) || []).length === 1);

// ---- 6-11: fail-closed preamble ----
check("6 fail-closed DO preamble var (DO $$ ... RAISE EXCEPTION)", /DO \$\$[\s\S]*RAISE EXCEPTION/i.test(code));
check("7 üç parent tablo varlık kontrolü var", /to_regclass\('public\.numerology_knowledge_records'\)/i.test(code) && /to_regclass\('public\.numerology_sources'\)/i.test(code) && /to_regclass\('public\.numerology_record_sources'\)/i.test(code));
check("8 yeni tablo YOKLUK kontrolü var (IS NOT NULL → RAISE)", /to_regclass\('public\.numerology_knowledge_source_entries'\)\s+IS NOT NULL/i.test(code));
check("9 knowledge parent UNIQUE (tenant_id,id) kolon-kimlik kontrolü var", /relname = 'numerology_knowledge_records'[\s\S]*?ARRAY\['id','tenant_id'\]/i.test(code));
check("10 source parent UNIQUE (tenant_id,id) kolon-kimlik kontrolü var", /relname = 'numerology_sources'[\s\S]*?ARRAY\['id','tenant_id'\]/i.test(code));
check("11 set_updated_at varlık kontrolü var", /proname = 'set_updated_at'[\s\S]*?RAISE EXCEPTION/i.test(code));

// ---- 12-13: tek yeni tablo + exact ad ----
check("12 tek CREATE TABLE (yeni tablo)", (code.match(/CREATE TABLE /gi) || []).length === 1);
check("13 exact tablo adı", new RegExp(`CREATE TABLE ${T.replace(/\./g, "\\.")}\\s*\\(`, "i").test(code));

// ---- 14-17: 9 kolon exact + tip/nullability/default ----
const cols = ["id","tenant_id","knowledge_record_id","source_id","body","display_order","include_in_analysis","created_at","updated_at"];
check("14 exact dokuz kolon mevcut", cols.every((c) => colLine(c) !== "") && tableBody.split("\n").filter((l)=>/^\s*(id|tenant_id|knowledge_record_id|source_id|body|display_order|include_in_analysis|created_at|updated_at)\s/i.test(l)).length === 9);
check("15 kolon tipleri exact",
  /^id\s+uuid/i.test(colLine("id")) && /^tenant_id\s+uuid/i.test(colLine("tenant_id")) &&
  /^knowledge_record_id\s+uuid/i.test(colLine("knowledge_record_id")) && /^source_id\s+uuid/i.test(colLine("source_id")) &&
  /^body\s+text/i.test(colLine("body")) && /^display_order\s+integer/i.test(colLine("display_order")) &&
  /^include_in_analysis\s+boolean/i.test(colLine("include_in_analysis")) &&
  /^created_at\s+timestamptz/i.test(colLine("created_at")) && /^updated_at\s+timestamptz/i.test(colLine("updated_at")));
check("16 nullability exact (source_id NULLABLE; diğerleri NOT NULL)",
  /NOT NULL/i.test(colLine("id")) && /NOT NULL/i.test(colLine("tenant_id")) && /NOT NULL/i.test(colLine("knowledge_record_id")) &&
  !/NOT NULL/i.test(colLine("source_id")) &&
  /NOT NULL/i.test(colLine("body")) && /NOT NULL/i.test(colLine("display_order")) && /NOT NULL/i.test(colLine("include_in_analysis")) &&
  /NOT NULL/i.test(colLine("created_at")) && /NOT NULL/i.test(colLine("updated_at")));
check("17 defaults exact (id gen_random_uuid, display_order 0, include_in_analysis false, ts now())",
  /DEFAULT gen_random_uuid\(\)/i.test(colLine("id")) && /DEFAULT 0\b/i.test(colLine("display_order")) &&
  /DEFAULT false\b/i.test(colLine("include_in_analysis")) && /DEFAULT now\(\)/i.test(colLine("created_at")) && /DEFAULT now\(\)/i.test(colLine("updated_at")));

// ---- 18: yasak kolonlar yok ----
check("18 yasak kolonlar yok (entry_kind/source_text/expert_note/editorial_note/canonical_text/is_primary/actor_id/status/is_published/deleted_at)",
  !/\bentry_kind\b/i.test(code) && !/\bsource_text\b/i.test(code) && !/\bexpert_note\b/i.test(code) && !/\beditorial_note\b/i.test(code) &&
  !/\bcanonical_text\b/i.test(code) && !/\bis_primary\b/i.test(code) && !/\bactor_id\b/i.test(code) &&
  !/\bis_published\b/i.test(code) && !/\bdeleted_at\b/i.test(code) && !/\bstatus\b/i.test(code));

// ---- 19-21: PK / UNIQUE / yasak unique ----
check("19 PK exact (pkey PRIMARY KEY (id))", /CONSTRAINT numerology_knowledge_source_entries_pkey\s+PRIMARY KEY \(id\)/i.test(code));
check("20 UNIQUE (tenant_id, id) exact", /CONSTRAINT numerology_knowledge_source_entries_tenant_id_unique\s+UNIQUE \(tenant_id, id\)/i.test(code));
check("21 yasak knowledge/source unique YOK",
  !/UNIQUE\s*\([^)]*knowledge_record_id[^)]*source_id[^)]*\)/i.test(code) &&
  !/UNIQUE\s*\(\s*knowledge_record_id\s*,\s*source_id\s*\)/i.test(code));

// ---- 22-23: CHECK'ler ----
check("22 body trim CHECK exact", /CONSTRAINT numerology_knowledge_source_entries_body_chk\s+CHECK \(btrim\(body\) <> ''\)/i.test(code));
check("23 display_order CHECK exact", /CONSTRAINT numerology_knowledge_source_entries_display_order_chk\s+CHECK \(display_order >= 0\)/i.test(code));

// ---- 24-25: FK'ler ----
check("24 knowledge FK exact (tenant_id,knowledge_record_id → knowledge_records(tenant_id,id) ON DELETE CASCADE)",
  /CONSTRAINT numerology_knowledge_source_entries_record_fk\s+FOREIGN KEY \(tenant_id, knowledge_record_id\)\s+REFERENCES public\.numerology_knowledge_records \(tenant_id, id\)\s+ON DELETE CASCADE/i.test(code));
check("25 source FK exact (tenant_id,source_id → sources(tenant_id,id) ON DELETE RESTRICT)",
  /CONSTRAINT numerology_knowledge_source_entries_source_fk\s+FOREIGN KEY \(tenant_id, source_id\)\s+REFERENCES public\.numerology_sources \(tenant_id, id\)\s+ON DELETE RESTRICT/i.test(code));
check("25b FK'lerde ON UPDATE / MATCH FULL yok (varsayılan)", !/ON UPDATE/i.test(code) && !/MATCH FULL/i.test(code));

// ---- 26: mevcut tablolara ALTER yok ----
check("26 mevcut tablolara (knowledge_records/sources/record_sources) ALTER YOK",
  !/ALTER TABLE\s+public\.numerology_knowledge_records\b/i.test(code) &&
  !/ALTER TABLE\s+public\.numerology_sources\b/i.test(code) &&
  !/ALTER TABLE\s+public\.numerology_record_sources\b/i.test(code));

// ---- 27-29: index'ler ----
check("27 record index exact", /CREATE INDEX numerology_knowledge_source_entries_record_idx\s+ON public\.numerology_knowledge_source_entries \(tenant_id, knowledge_record_id, display_order, id\)/i.test(code));
check("28 source partial index exact (WHERE source_id IS NOT NULL)", /CREATE INDEX numerology_knowledge_source_entries_source_idx\s+ON public\.numerology_knowledge_source_entries \(tenant_id, source_id\)\s+WHERE source_id IS NOT NULL/i.test(code));
check("29 include_in_analysis index YOK", !/CREATE INDEX[^;]*include_in_analysis/i.test(code));

// ---- 30-34: RLS / grant / trigger ----
check("30 RLS enabled", /ALTER TABLE public\.numerology_knowledge_source_entries ENABLE ROW LEVEL SECURITY/i.test(code));
check("31 FORCE RLS YOK", !/FORCE ROW LEVEL SECURITY/i.test(code));
check("32 policy YOK (CREATE POLICY yok)", !/CREATE POLICY/i.test(code));
check("33 anon/authenticated/PUBLIC REVOKE exact", /REVOKE ALL ON TABLE public\.numerology_knowledge_source_entries FROM anon, authenticated, PUBLIC/i.test(code));
check("34 service_role GRANT exact", /GRANT\s+ALL ON TABLE public\.numerology_knowledge_source_entries TO service_role/i.test(code));
check("35 updated_at trigger exact (BEFORE UPDATE, set_updated_at)",
  /CREATE TRIGGER trg_numerology_knowledge_source_entries_updated_at\s+BEFORE UPDATE ON public\.numerology_knowledge_source_entries\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.set_updated_at\(\)/i.test(code));

// ---- 36-38: fonksiyon/RPC/SECURITY DEFINER yok ----
check("36 set_updated_at yeniden tanımlanmıyor (CREATE [OR REPLACE] FUNCTION yok)", !/CREATE\s+(OR REPLACE\s+)?FUNCTION/i.test(code));
check("37 SECURITY DEFINER YOK", !/SECURITY DEFINER/i.test(code));
check("38 yeni RPC/procedure YOK (CREATE PROCEDURE yok)", !/CREATE\s+(OR REPLACE\s+)?PROCEDURE/i.test(code));

// ---- 39-41: DML/backfill/IF NOT EXISTS/COMMENT yok ----
check("39 INSERT/UPDATE...SET/DELETE FROM/MERGE (DML/backfill) YOK",
  !/INSERT\s+INTO/i.test(code) && !/\bUPDATE\s+[\w".]+\s+SET\b/i.test(code) && !/DELETE\s+FROM/i.test(code) && !/MERGE\s+INTO/i.test(code) && !/UPSERT/i.test(code));
// Yasak = DDL idempotency (CREATE ... IF NOT EXISTS / ADD ... IF NOT EXISTS). PL/pgSQL
// fail-closed guard'ı "IF NOT EXISTS (SELECT ...)" (paren ile) MEŞRUDUR ve yasak değildir.
check("40 DDL IF NOT EXISTS YOK (PL/pgSQL 'IF NOT EXISTS (' guard'ı hariç)", !/IF NOT EXISTS(?!\s*\()/i.test(code));
check("41 COMMENT ON YOK", !/COMMENT ON/i.test(code));

// ---- 42-46: veri/çoklu-not/nullable/default/boş ----
check("42 mevcut tablo VERİSİNE dokunulmuyor (DML yok → korunuyor)", !/INSERT\s+INTO/i.test(code) && !/DELETE\s+FROM/i.test(code) && !/\bUPDATE\s+[\w".]+\s+SET\b/i.test(code));
check("43 aynı knowledge/source altında çoklu note DB engellemez (yasak unique yok)",
  !/UNIQUE\s*\(\s*knowledge_record_id\s*,\s*source_id\s*\)/i.test(code) && !/UNIQUE\s*\([^)]*source_id[^)]*section_key/i.test(code));
check("44 source_id nullable (NOT NULL değil)", /^source_id\s+uuid\s*,?\s*$/i.test(colLine("source_id")) || (!/NOT NULL/i.test(colLine("source_id")) && /^source_id\s+uuid/i.test(colLine("source_id"))));
check("45 include_in_analysis default false", /include_in_analysis\s+boolean\s+NOT NULL DEFAULT false/i.test(code));
check("46 tablo BOŞ başlar (hiç INSERT yok)", !/INSERT\s+INTO/i.test(code));

// ---- 47-48: SQL güvenliği / timestamp guard uyumu ----
check("47 SQL statement güvenliği (yalnız BEGIN/DO/CREATE/ALTER-yeni/REVOKE/GRANT/COMMIT)",
  !/\bTRUNCATE\b/i.test(code) && !/\bDROP\b/i.test(code) && !/\bGRANT\b.*\banon\b/i.test(code));
check("48 migration timestamp guard uyumu (YYYYMMDDHHMMSS_ad.sql biçimi)",
  /^\d{14}_[a-z0-9_]+\.sql$/.test(FILENAME));

// ---- 49-51: fail-closed DO-block name[]/text[] tip-güvenliği (PROD-HOTFIX) ----
// pg_attribute.attname `name` tipindedir; array_agg(attname) → name[]. Literal ARRAY[...]
// → text[]. `name[] = text[]` PostgreSQL'de belirsiz operatördür (ERROR 42883) ve migration
// apply sırasında fail-closed guard'ı patlatır. İki tarafı da text[]'e eşitlemek zorunludur.
check("49 DO-block attname aggregate ::text cast'li (2 kez: knowledge + sources)",
  (code.match(/array_agg\(a\.attname::text\s+ORDER BY\s+a\.attname\)/gi) || []).length === 2);
check("50 DO-block literal kolon dizisi ::text[] cast'li (2 kez: knowledge + sources)",
  (code.match(/ARRAY\['id','tenant_id'\]::text\[\]/gi) || []).length === 2);
check("51 bare name[] = text[] karşılaştırması YOK (attname agg ::text'siz VEYA literal ::text[]'siz kalmadı)",
  !/array_agg\(a\.attname\s+ORDER BY/i.test(code) && !/ARRAY\['id','tenant_id'\](?!::text\[\])/i.test(code));

console.log("\n============================================================");
const total = pass + fail;
console.log(`TOTAL ${total}`);
console.log(`PASS  ${pass}`);
console.log(`FAIL  ${fail}`);
console.log("============================================================");
process.exit(fail > 0 ? 1 : 0);
