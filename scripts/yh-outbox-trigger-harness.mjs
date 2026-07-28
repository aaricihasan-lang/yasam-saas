/**
 * Yaşam Hafızası™ — BF-11C Pilot Doğaltaş Outbox Trigger harness.
 * ====================================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, AĞ'SIZ. Gerçek migration SQL'i METİN olarak
 * okunur; sözleşme invariant'ları exact/regex ile denetlenir. Sahte PASS üretmemek
 * için SQL yorumları ÖNCE strip edilir (header/DOĞRULAMA blokları anahtar kelime
 * eşleşmesine karışmaz).
 *
 * Çalıştır (repo kökünden):  npx tsx scripts/yh-outbox-trigger-harness.mjs
 * Herhangi bir FAIL → exit 1. Son satır: `yh-outbox-trigger-harness: X/X PASS`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// GERÇEK BF-11A durum makinesi (stale-event sözleşmesi doğrulaması; kopya YOK).
import { decideComplete, decideFail } from "../lib/yasam-hafizasi/outbox/outboxState.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const MIG_NAME = "20260822000000_yasam_hafizasi_dogaltas_outbox_trigger.sql";
const MIG_PATH = join(repo, "supabase/migrations", MIG_NAME);

// ─── Test altyapısı ──────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const fails = [];
const cats = {};
function check(cat, desc, cond) {
  cats[cat] = (cats[cat] ?? 0) + 1;
  if (cond) pass += 1;
  else {
    fail += 1;
    fails.push(`[${cat}] ${desc}`);
    console.error(`  FAIL  [${cat}] ${desc}`);
  }
}

// ─── SQL yükle + yorum strip ─────────────────────────────────────────────────
const RAW = readFileSync(MIG_PATH, "utf8");
function stripSql(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}
const BODY = stripSql(RAW);
const count = (re) => (BODY.match(re) ?? []).length;
// INSERT ... ON CONFLICT ifadesinin DO UPDATE bölümü (RETURN öncesine kadar).
const doUpdateSeg = (() => {
  const i = BODY.indexOf("DO UPDATE");
  if (i < 0) return "";
  const j = BODY.indexOf("IF TG_OP", i);
  return j < 0 ? BODY.slice(i) : BODY.slice(i, j);
})();
// INSERT kolon listesi (enqueue) — PII/payload sızıntısı denetimi.
const insertColsSeg = (() => {
  const m = BODY.match(/INSERT\s+INTO\s+public\.yasam_hafizasi_outbox(?:\s+AS\s+\w+)?\s*\(([^)]*)\)/i);
  return m ? m[1] : "";
})();

// ═══════════════ A — MIGRATION KİMLİĞİ VE KAPSAM ═══════════════
check("A", "1 migration filename doğru", (() => {
  try { readFileSync(MIG_PATH); return true; } catch { return false; }
})());
check("A", "2 tek BEGIN", count(/\bBEGIN\b/g) - count(/\bBEGIN\s*\n/g) >= 0 && (RAW.match(/^BEGIN;/m) ?? []).length === 1);
check("A", "3 tek COMMIT", (RAW.match(/^COMMIT;/m) ?? []).length === 1);
check("A", "4 tam bir CREATE TRIGGER", count(/CREATE\s+TRIGGER/gi) === 1);
check("A", "5 trigger public.stones üzerinde", /CREATE\s+TRIGGER\s+yh_outbox_stones_enqueue_trg[\s\S]*?ON\s+public\.stones/i.test(BODY));
check("A", "6 stones DIŞINDA trigger yok", (() => {
  const ons = [...BODY.matchAll(/CREATE\s+TRIGGER\s+\w+[\s\S]*?ON\s+([a-z_.]+)/gi)].map((m) => m[1].toLowerCase());
  return ons.length === 1 && ons[0] === "public.stones";
})());
check("A", "7 yalnız izinli nesneler (1 function + 1 trigger; başka CREATE TABLE/VIEW/INDEX yok)",
  count(/CREATE\s+OR\s+REPLACE\s+FUNCTION/gi) === 1 &&
  count(/CREATE\s+TABLE/gi) === 0 && count(/CREATE\s+VIEW/gi) === 0 &&
  count(/CREATE\s+INDEX/gi) === 0 && count(/CREATE\s+SEQUENCE/gi) === 0);
check("A", "8 source registry / CRUD dosyası referansı yok", !/YH_INDEX_SOURCES|sources\.ts|from\(/.test(BODY));

// ═══════════════ B — TRIGGER FUNCTION ═══════════════
check("B", "9 exact function adı yh_outbox_enqueue", /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.yh_outbox_enqueue\s*\(\s*\)/i.test(BODY));
check("B", "10 RETURNS trigger", /RETURNS\s+trigger/i.test(BODY));
check("B", "11 INSERT/UPDATE → operation 'upsert'", /TG_OP\s*=\s*'INSERT'\s+OR\s+TG_OP\s*=\s*'UPDATE'[\s\S]*?v_operation\s*:=\s*'upsert'/i.test(BODY));
check("B", "12 DELETE → operation 'delete'", /TG_OP\s*=\s*'DELETE'[\s\S]*?v_operation\s*:=\s*'delete'/i.test(BODY));
check("B", "13 INSERT/UPDATE NEW.id + NEW.tenant_id", /v_source_id\s*:=\s*NEW\.id/i.test(BODY) && /v_tenant_id\s*:=\s*NEW\.tenant_id/i.test(BODY));
check("B", "14 DELETE OLD.id + OLD.tenant_id (korunur)", /v_source_id\s*:=\s*OLD\.id/i.test(BODY) && /v_tenant_id\s*:=\s*OLD\.tenant_id/i.test(BODY));
check("B", "15 source_key literal 'dogaltas:stones' trigger arg", /EXECUTE\s+FUNCTION\s+public\.yh_outbox_enqueue\(\s*'dogaltas:stones'\s*,\s*'stones'\s*\)/i.test(BODY));
check("B", "16 source_table = TG_TABLE_NAME (gerçek tablo)", /source_table[\s\S]*?TG_TABLE_NAME|VALUES\s*\([\s\S]*?TG_TABLE_NAME/i.test(BODY));
check("B", "17 schema-qualified outbox + sequence", /public\.yasam_hafizasi_outbox\b/.test(BODY) && /nextval\(\s*'public\.yasam_hafizasi_outbox_event_version_seq'\s*\)/.test(BODY));
check("B", "18 SECURITY DEFINER", /SECURITY\s+DEFINER/i.test(BODY));
check("B", "19 sabit güvenli search_path", /SET\s+search_path\s*=\s*public\s*,\s*pg_catalog/i.test(BODY));
check("B", "20 desteklenmeyen TG_OP fail-closed (RAISE)", /ELSE\s+RAISE\s+EXCEPTION[^;]*desteklenmeyen\s+TG_OP/i.test(BODY));
check("B", "21 source_id null fail-closed (RAISE)", /IF\s+v_source_id\s+IS\s+NULL\s+THEN\s+RAISE\s+EXCEPTION/i.test(BODY));
check("B", "22 tenant_id null fail-closed (RAISE)", /IF\s+v_tenant_id\s+IS\s+NULL\s+THEN\s+RAISE\s+EXCEPTION/i.test(BODY));
check("B", "23 source_table uyuşmazlığı fail-closed (RAISE)", /TG_TABLE_NAME\s+IS\s+DISTINCT\s+FROM\s+v_expect_table\s+THEN\s+RAISE\s+EXCEPTION/i.test(BODY));
check("B", "24 source_key eksik fail-closed (RAISE)", /v_source_key\s+IS\s+NULL[\s\S]*?RAISE\s+EXCEPTION[^;]*source_key/i.test(BODY));
check("B", "24b TG_TABLE_SCHEMA public değilse fail-closed (RAISE)", /TG_TABLE_SCHEMA\s+IS\s+DISTINCT\s+FROM\s+'public'\s+THEN\s+RAISE\s+EXCEPTION/i.test(BODY));

// ═══════════════ C — COALESCING / event_version (processing-claim korumalı) ═══════════════
const caseProcessing = (field, elseVal) =>
  new RegExp(`${field}\\s*=\\s*CASE\\s+WHEN\\s+o\\.status\\s*=\\s*'processing'\\s+THEN\\s+o\\.${field.replace(/[^a-z_]/g, "")}\\s+ELSE\\s+${elseVal}\\s+END`, "i");
check("C", "25 INSERT alias AS o (mevcut satır referansı)", /INSERT\s+INTO\s+public\.yasam_hafizasi_outbox\s+AS\s+o\b/i.test(BODY));
check("C", "26 ON CONFLICT (source_key, source_id) DO UPDATE", /ON\s+CONFLICT\s*\(\s*source_key\s*,\s*source_id\s*\)\s+DO\s+UPDATE/i.test(BODY));
check("C", "27 event_version = nextval(seq) KOŞULSUZ (her olayda artar)", /event_version\s*=\s*nextval\(\s*'public\.yasam_hafizasi_outbox_event_version_seq'\s*\)/i.test(doUpdateSeg));
check("C", "28 operation/source_table/tenant_id = EXCLUDED (yeni olay kanıtı, koşulsuz)", /operation\s*=\s*EXCLUDED\.operation/i.test(doUpdateSeg) && /source_table\s*=\s*EXCLUDED\.source_table/i.test(doUpdateSeg) && /tenant_id\s*=\s*EXCLUDED\.tenant_id/i.test(doUpdateSeg));
check("C", "29 updated_at = now() (koşulsuz)", /updated_at\s*=\s*now\(\)/i.test(doUpdateSeg));
check("C", "30 status: processing KORUNUR, aksi 'pending'", caseProcessing("status", "'pending'").test(doUpdateSeg));
check("C", "31 attempts: processing KORUNUR, aksi 0", caseProcessing("attempts", "0").test(doUpdateSeg));
check("C", "32 available_at: processing KORUNUR, aksi now()", caseProcessing("available_at", "now\\(\\)").test(doUpdateSeg));
check("C", "33 locked_at: processing KORUNUR, aksi NULL", caseProcessing("locked_at", "NULL").test(doUpdateSeg));
check("C", "34 locked_by: processing KORUNUR, aksi NULL", caseProcessing("locked_by", "NULL").test(doUpdateSeg));
check("C", "35 last_error: processing KORUNUR, aksi NULL", caseProcessing("last_error", "NULL").test(doUpdateSeg));
check("C", "36 processed_at: processing KORUNUR, aksi NULL", caseProcessing("processed_at", "NULL").test(doUpdateSeg));
check("C", "37 DO UPDATE'te status-filtreli WHERE yok (koşulluluk CASE ile; satır her zaman coalesce)", !/\bWHERE\b/i.test(doUpdateSeg));

// ═══════════════ D — GÜVENLİK ═══════════════
check("D", "35 payload snapshot / jsonb saklama yok", !/payload|jsonb|to_jsonb|row_to_json/i.test(BODY));
check("D", "36 INSERT kolonları yalnız kimlik/olay (PII/content yok)", (() => {
  const cols = insertColsSeg.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean).sort();
  const expect = ["operation", "source_id", "source_key", "source_table", "tenant_id"].sort();
  return JSON.stringify(cols) === JSON.stringify(expect);
})());
check("D", "37 HTTP / network / pg_net yok", !/pg_net|http_|net\.http|extensions\.http|https?:\/\//i.test(BODY));
check("D", "38 index tablosuna yazma yok", !/yasam_hafizasi_index/i.test(BODY));
check("D", "39 source FK / ALTER TABLE / REFERENCES yok", !/ALTER\s+TABLE/i.test(BODY) && !/FOREIGN\s+KEY/i.test(BODY) && !/REFERENCES/i.test(BODY));
check("D", "40 anon/authenticated EXECUTE revoked", /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.yh_outbox_enqueue\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i.test(BODY));
check("D", "41 anon/authenticated'a EXECUTE GRANT edilmiyor", !/GRANT\s+EXECUTE[\s\S]*?(anon|authenticated)/i.test(BODY));
check("D", "42 trigger AFTER + FOR EACH ROW (satır seviyesi atomik)", /AFTER\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.stones\s+FOR\s+EACH\s+ROW/i.test(BODY));

// ═══════════════ E — YASAK KAPSAM ═══════════════
const migFiles = readdirSync(join(repo, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
const tsCount = (ts) => migFiles.filter((f) => f.startsWith(ts)).length;
check("E", "43 migration timestamp benzersiz (20260822000000 tek)", tsCount("20260822000000") === 1);
check("E", "44 outbox INSERT yalnız 1 (function içi enqueue; seed/manuel event yok)", count(/INSERT\s+INTO\s+public\.yasam_hafizasi_outbox/gi) === 1);
check("E", "45 DELETE/UPDATE/TRUNCATE DML (seed/backfill) yok", !/\bTRUNCATE\b/i.test(BODY) && !/DELETE\s+FROM\s+public\./i.test(BODY) && !/UPDATE\s+public\.\w+\s+SET/i.test(BODY.replace(/DO\s+UPDATE[\s\S]*?event_version[^;]*/i, "")));
check("E", "46 BF-11B worker dosyası değişmemiş (marker)", (() => {
  try {
    const w = readFileSync(join(repo, "lib/inngest/functions/yhOutboxWorker.ts"), "utf8");
    return /import\s+"server-only"/.test(w) && /YH_OUTBOX_CRON\s*=\s*"\*\s\*\s\*\s\*\s\*"/.test(w) && /YH_OUTBOX_RETRIES\s*=\s*0/.test(w);
  } catch { return false; }
})());
check("E", "47 package.json değişmemiş (inngest ^4.5.0 marker)", (() => {
  try { return /"inngest":\s*"\^4\.5\.0"/.test(readFileSync(join(repo, "package.json"), "utf8")); } catch { return false; }
})());
check("E", "48 BF-11A outbox migration referans sözleşmesi korunuyor (UNIQUE(source_key, source_id) hâlâ var)", (() => {
  try {
    const m = readFileSync(join(repo, "supabase/migrations/20260815000000_yasam_hafizasi_outbox.sql"), "utf8");
    return /UNIQUE\s*\(source_key,\s*source_id\)/.test(m);
  } catch { return false; }
})());

// ═══════════════ F — STALE-EVENT SÖZLEŞMESİ ULAŞILABİLİRLİĞİ (gerçek outboxState) ═══════════════
// Trigger processing satırında status='processing' + locked_by KORUR ve event_version'ı
// ARTIRIR. Böylece in-flight worker'ın complete/fail RPC'si (claimed_version < current)
// BF-11A stale dalına ULAŞIR → requeued_newer_event. Aşağıda gerçek BF-11A durum makinesi
// bu sözleşmeyi doğrular (değişmediğini de kanıtlar).
check("F", "49 complete stale (claimed<current) → requeued_newer_event", decideComplete(5, 6) === "requeued_newer_event");
check("F", "50 fail stale (claimed<current) → requeued_newer_event", decideFail({ attempts: 1, claimedVersion: 5, currentVersion: 6 }).disposition === "requeued_newer_event");
check("F", "51 complete eşit sürüm → succeeded (sözleşme değişmedi)", decideComplete(6, 6) === "succeeded");
check("F", "52 trigger processing-KORU + event_version-ARTIR birlikte (stale dalını mümkün kılar)",
  caseProcessing("status", "'pending'").test(doUpdateSeg) &&
  /locked_by\s*=\s*CASE\s+WHEN\s+o\.status\s*=\s*'processing'\s+THEN\s+o\.locked_by/i.test(doUpdateSeg) &&
  /event_version\s*=\s*nextval/i.test(doUpdateSeg));

// ─── Özet ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log("");
console.log("── Kategori dağılımı ──");
for (const c of Object.keys(cats).sort()) console.log(`  ${c}: ${cats[c]} assertion`);
console.log("");
if (fail > 0) {
  console.error(`yh-outbox-trigger-harness: ${pass}/${total} PASS  (${fail} FAIL)`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`yh-outbox-trigger-harness: ${pass}/${total} PASS`);
