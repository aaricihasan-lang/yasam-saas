// ============================================================
// YEBS API-AUD1 — yebs_audit_events append-only şema doğrulama harness'i
//
// SALT-OKUNUR / STATİK. Canlı DB'ye bağlanmaz, INSERT/UPDATE/DELETE yapmaz.
// (Bu fazda mutation RPC yoktur; service_role doğrudan insert edemez.)
//
// Migration dosya metni + git üzerinden D1–D9 değişmezliği doğrulanır.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIGRATION = resolve(ROOT, "supabase/migrations/20260803010000_yebs_audit_events.sql");

const D1_D9 = [
  "20260726210017_yebs_traditions.sql",
  "20260726220031_yebs_schools.sql",
  "20260726230043_yebs_concepts.sql",
  "20260727000000_yebs_concept_labels.sql",
  "20260728000000_yebs_sources.sql",
  "20260729000000_yebs_claims.sql",
  "20260730000000_yebs_claim_sources.sql",
  "20260731000000_yebs_concept_relations.sql",
  "20260801000000_yebs_concept_relation_sources.sql",
];

let pass = 0;
let fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }

// Yorumları çıkar (satır -- ve blok yok; SQL'de -- satır yorumu). CHECK denetimleri
// gerçek DDL üzerinde yapılmalı; açıklama yorumundaki kelimeler sayılmamalı.
function stripSqlComments(src) {
  return src
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

console.log("\n[AUD1] yebs_audit_events şema sözleşmesi");

if (!existsSync(MIGRATION)) {
  bad("migration dosyası mevcut", MIGRATION);
  console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(1);
}
const raw = readFileSync(MIGRATION, "utf8");
const sql = stripSqlComments(raw);
ok("migration dosyası okunabildi");

// --- Explicit transaction ---
check("explicit BEGIN;", /\bBEGIN\s*;/.test(sql));
check("explicit COMMIT;", /\bCOMMIT\s*;/.test(sql));

// --- Deterministik / fail-fast (yasak kalıplar) ---
check("IF NOT EXISTS YOK", !/IF\s+NOT\s+EXISTS/i.test(sql));
check("CREATE OR REPLACE YOK", !/CREATE\s+OR\s+REPLACE/i.test(sql));
check("DO bloğu YOK", !/\bDO\s+\$\$/i.test(sql));
// Dynamic SQL yok: EXECUTE 'string' / EXECUTE format(...) / quote_* yok.
// (Trigger'daki `EXECUTE FUNCTION` dinamik SQL DEĞİLDİR — ayrı tutulur.)
check("dynamic SQL YOK (EXECUTE '...' / format())", !/EXECUTE\s+('|format\s*\(|quote_)/i.test(sql));

// --- Yalnız beklenen nesneler ---
const createTables = (sql.match(/CREATE\s+TABLE\s+([a-z0-9_.]+)/gi) || []);
check("tam 1 CREATE TABLE", createTables.length === 1, createTables.join(", "));
check("tablo = public.yebs_audit_events", /CREATE\s+TABLE\s+public\.yebs_audit_events/i.test(sql));
const createFns = (sql.match(/CREATE\s+FUNCTION\s+([a-z0-9_.]+)/gi) || []);
check("tam 1 CREATE FUNCTION", createFns.length === 1, createFns.join(", "));
check("fonksiyon = public.yebs_audit_events_forbid_mutation", /CREATE\s+FUNCTION\s+public\.yebs_audit_events_forbid_mutation/i.test(sql));
const createTriggers = (sql.match(/CREATE\s+TRIGGER\s+([a-z0-9_]+)/gi) || []);
check("tam 1 CREATE TRIGGER", createTriggers.length === 1, createTriggers.join(", "));
const createIdx = (sql.match(/CREATE\s+INDEX\s+([a-z0-9_]+)/gi) || []);
check("tam 4 CREATE INDEX", createIdx.length === 4, createIdx.join(", "));

// --- D1–D9 ALTER/DROP edilmiyor (yalnız yebs_audit_events'e ALTER) ---
const alters = (sql.match(/ALTER\s+TABLE\s+[a-z0-9_.]+/gi) || []);
check("ALTER TABLE yalnız yebs_audit_events", alters.every((a) => /yebs_audit_events/i.test(a)), alters.join(" | "));
check("DROP ifadesi YOK", !/\bDROP\s+(TABLE|FUNCTION|TRIGGER|INDEX|COLUMN)/i.test(sql));
for (const t of ["yebs_traditions", "yebs_schools", "yebs_concepts", "yebs_concept_labels", "yebs_sources", "yebs_claims", "yebs_claim_sources", "yebs_concept_relations", "yebs_concept_relation_sources"]) {
  check(`D1-D9 tablosuna referans YOK (${t})`, !new RegExp(`\\b${t}\\b`).test(sql), "migration bu tabloya değiniyor");
}

// --- Yasak kolonlar / özellikler ---
check("tenant_id YOK", !/\btenant_id\b/i.test(sql));
check("updated_at kolonu YOK", !/\bupdated_at\b/i.test(sql));
check("set_updated_at YOK", !/set_updated_at/i.test(sql));
check("created_by/updated_by/deleted_by YOK", !/\b(created_by|updated_by|deleted_by)\b/i.test(sql));
check("ip_address YOK", !/\bip_address\b/i.test(sql));
check("user_agent YOK", !/\buser_agent\b/i.test(sql));
check("actor FK YOK (REFERENCES/FOREIGN KEY yok)", !/REFERENCES|FOREIGN\s+KEY/i.test(sql));

// --- Zorunlu kolonlar ---
for (const col of ["id", "occurred_at", "actor_admin_id", "actor_label_snapshot", "action", "entity_type", "entity_id", "outcome", "previous_state", "new_state", "changed_fields", "reason", "request_id", "operation_id", "error_code", "metadata"]) {
  check(`kolon mevcut: ${col}`, new RegExp(`^\\s*${col}\\s`, "m").test(sql));
}
check("actor_admin_id NOT NULL", /actor_admin_id\s+uuid\s+NOT NULL/i.test(sql));
check("request_id NOT NULL", /request_id\s+uuid\s+NOT NULL/i.test(sql));
check("operation_id NOT NULL", /operation_id\s+uuid\s+NOT NULL/i.test(sql));
check("changed_fields text[] NOT NULL DEFAULT ARRAY[]", /changed_fields\s+text\[\]\s+NOT NULL\s+DEFAULT\s+ARRAY\[\]::text\[\]/i.test(sql));
check("metadata jsonb NOT NULL DEFAULT '{}'", /metadata\s+jsonb\s+NOT NULL\s+DEFAULT\s+'\{\}'::jsonb/i.test(sql));
check("entity_id nullable (NOT NULL değil)", /entity_id\s+uuid\s*,/i.test(sql));

// --- RLS / policy ---
check("RLS ENABLE", /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql));
check("CREATE POLICY YOK", !/CREATE\s+POLICY/i.test(sql));

// --- Privilege modeli ---
check("REVOKE ALL FROM PUBLIC (tablo)", /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.yebs_audit_events\s+FROM\s+PUBLIC/i.test(sql));
check("REVOKE ALL FROM anon (tablo)", /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.yebs_audit_events\s+FROM\s+anon/i.test(sql));
check("REVOKE ALL FROM authenticated (tablo)", /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.yebs_audit_events\s+FROM\s+authenticated/i.test(sql));
check("REVOKE ALL FROM service_role (tablo)", /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.yebs_audit_events\s+FROM\s+service_role/i.test(sql));
check("service_role yalnız SELECT GRANT", /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.yebs_audit_events\s+TO\s+service_role/i.test(sql));
// service_role'e (ve genel olarak tabloya) INSERT/UPDATE/DELETE/TRUNCATE/ALL GRANT YOK
check("GRANT INSERT YOK", !/GRANT\s+[^;]*\bINSERT\b/i.test(sql));
check("GRANT UPDATE YOK", !/GRANT\s+[^;]*\bUPDATE\b/i.test(sql));
check("GRANT DELETE YOK", !/GRANT\s+[^;]*\bDELETE\b/i.test(sql));
check("GRANT TRUNCATE YOK", !/GRANT\s+[^;]*\bTRUNCATE\b/i.test(sql));
check("tabloya GRANT ALL YOK", !/GRANT\s+ALL\s+ON\s+TABLE/i.test(sql));

// --- Immutability trigger ---
check("BEFORE UPDATE OR DELETE trigger", /BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.yebs_audit_events/i.test(sql));
check("trigger FOR EACH ROW", /FOR\s+EACH\s+ROW/i.test(sql));
check("trigger fn RAISE EXCEPTION (reddet)", /RAISE\s+EXCEPTION/i.test(sql));
check("trigger fn sabit search_path", /SET\s+search_path\s*=/i.test(sql));
check("trigger fn EXECUTE tüm rollerden REVOKE",
  /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.yebs_audit_events_forbid_mutation\(\)\s+FROM\s+PUBLIC/i.test(sql)
  && /FROM\s+anon/i.test(sql) && /FROM\s+authenticated/i.test(sql) && /FROM\s+service_role/i.test(sql));
check("trigger fn'de dynamic SQL / satır-veri sızıntısı yok (sadece sabit metin)",
  !/RAISE\s+EXCEPTION[^;]*(NEW\.|OLD\.|%)/i.test(sql));

// --- CHECK kümeleri ---
const ACTIONS = ["create", "update", "remove", "verify", "reject", "transition", "publish", "unpublish", "archive", "hard_delete_attempt"];
check("action kümesi TAM (10)", ACTIONS.every((a) => new RegExp(`'${a}'`).test(sql)), "eksik action");
const ENTITIES = ["tradition", "school", "concept", "concept_label", "source", "claim", "claim_source", "concept_relation", "concept_relation_source"];
check("entity_type kümesi TAM (9)", ENTITIES.every((e) => new RegExp(`'${e}'`).test(sql)), "eksik entity_type");
check("outcome kümesi TAM (committed, rejected)", /'committed'/.test(sql) && /'rejected'/.test(sql));

// --- Coupling & JSON object checks ---
check("outcome/error_code coupling (committed→NULL, rejected→NOT NULL)",
  /outcome\s*=\s*'committed'\s+AND\s+error_code\s+IS\s+NULL/i.test(sql)
  && /outcome\s*=\s*'rejected'\s+AND\s+error_code\s+IS\s+NOT\s+NULL/i.test(sql));
check("error_code stabil YEBS biçim CHECK (^YEBS_)", /error_code\s*~\s*'\^YEBS_/i.test(sql));
check("previous_state JSON object CHECK", /previous_state[^)]*jsonb_typeof\(previous_state\)\s*=\s*'object'/i.test(sql));
check("new_state JSON object CHECK", /new_state[^)]*jsonb_typeof\(new_state\)\s*=\s*'object'/i.test(sql));
check("metadata JSON object CHECK", /jsonb_typeof\(metadata\)\s*=\s*'object'/i.test(sql));
check("changed_fields NULL/boş eleman CHECK",
  /array_remove\(changed_fields,\s*NULL\)/i.test(sql) && /''\s*<>\s*ALL\s*\(\s*changed_fields\s*\)/i.test(sql));
check("committed → entity_id NOT NULL CHECK", /outcome\s*<>\s*'committed'\s+OR\s+entity_id\s+IS\s+NOT\s+NULL/i.test(sql));
check("actor_label_snapshot boş-değil + uzunluk sınırı", /btrim\(actor_label_snapshot\)\s*<>\s*''/i.test(sql) && /length\(actor_label_snapshot\)\s*<=/i.test(sql));

// --- Required indexes ---
check("index: entity (entity_type, entity_id, occurred_at DESC)", /CREATE\s+INDEX[^;]*\(entity_type,\s*entity_id,\s*occurred_at\s+DESC\)/i.test(sql));
check("index: actor (actor_admin_id, occurred_at DESC)", /CREATE\s+INDEX[^;]*\(actor_admin_id,\s*occurred_at\s+DESC\)/i.test(sql));
check("index: request_id", /CREATE\s+INDEX[^;]*\(request_id\)/i.test(sql));
check("index: operation_id", /CREATE\s+INDEX[^;]*\(operation_id\)/i.test(sql));

// --- D1–D9 git değişmezliği (working tree'de değişiklik yok) ---
try {
  const changed = execFileSync("git", ["-C", ROOT, "status", "--porcelain=v1", "--", "supabase/migrations/"], { encoding: "utf8" });
  const d1d9Touched = changed.split(/\r?\n/).filter((l) => D1_D9.some((f) => l.includes(f)));
  check("git: D1–D9 migration dosyaları working tree'de değişmemiş", d1d9Touched.length === 0, d1d9Touched.join(" | "));
} catch (e) {
  bad("git D1–D9 değişmezlik kontrolü çalıştı", String(e && e.message));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
