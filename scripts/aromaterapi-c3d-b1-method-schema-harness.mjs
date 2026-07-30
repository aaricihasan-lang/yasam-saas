// ============================================================
// Aromaterapi C3D-B1 — Katalog + Üretim/Elde Ediliş ŞEMA temeli harness'i
//
// SALT-OKUNUR / STATİK. DB'ye bağlanmaz, SQL çalıştırmaz. Migration'ın kilitli
// C3D-B1 sözleşmesine uyduğunu, legacy Oils'e dokunmadığını ve kapsam sınırlarını
// doğrular. FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
let pass = 0, fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function read(rel) { const p = resolve(ROOT, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; }

const MIG_DIR = "supabase/migrations";
const migFiles = existsSync(resolve(ROOT, MIG_DIR))
  ? readdirSync(resolve(ROOT, MIG_DIR)).filter((f) => /catalog_method_foundation\.sql$/.test(f))
  : [];
const MIG_REL = migFiles.length ? `${MIG_DIR}/${migFiles[0]}` : "";
const M = MIG_REL ? read(MIG_REL) : "";
const SQL = M.replace(/^\s*--[^\n]*$/gm, ""); // yorumsuz DDL

// ============================================================
console.log("\n[B1-A] Timestamp ve kapsam");
// ============================================================
check("A01 tek catalog_method_foundation migration", migFiles.length === 1, `bulunan: ${migFiles.length}`);
check("A02 tek transaction (BEGIN + COMMIT)", /^BEGIN;/m.test(M) && /^COMMIT;/m.test(M));
check("A03 IF EXISTS / IF NOT EXISTS / CREATE OR REPLACE YOK",
  !/IF\s+(NOT\s+)?EXISTS/i.test(SQL) && !/CREATE\s+OR\s+REPLACE/i.test(SQL));
check("A04 DO / sessiz exception yok", !/^\s*DO\b/im.test(SQL) && !/EXCEPTION\s+WHEN/i.test(SQL));

// ============================================================
console.log("\n[B1-B] Takson Türkçe/yaygın ad");
// ============================================================
check("B01 primary_common_name_tr kolonu (nullable, default yok)",
  /ADD COLUMN primary_common_name_tr text;/.test(SQL));
check("B02 blank + <=200 guard", /primary_common_name_tr IS NULL[\s\S]{0,120}char_length\(btrim\(primary_common_name_tr\)\)\s*<=\s*200/.test(SQL));
check("B03 tenant-içi unique DEĞİL", !/UNIQUE[^\n]*primary_common_name_tr/i.test(SQL));
check("B04 backfill/UPDATE/seed yok (taxa)", !/UPDATE\s+public\.aromatherapy_plant_taxa/i.test(SQL));
check("B05 arama index eklenmemiş (bu faz)", !/CREATE INDEX[^\n]*primary_common_name_tr/i.test(SQL));

// ============================================================
console.log("\n[B1-C] Source-passage candidate key");
// ============================================================
check("C01 (tenant_id, source_id, id) candidate key",
  /ADD CONSTRAINT aromatherapy_source_passages_tenant_source_id_unique UNIQUE \(tenant_id, source_id, id\)/.test(SQL));
check("C02 source_passages içeriğini değiştiren DML yok",
  !/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.aromatherapy_source_passages/i.test(SQL));

// ============================================================
console.log("\n[B1-D] Method series");
// ============================================================
check("D01 series tablosu", /CREATE TABLE public\.aromatherapy_preparation_method_series/.test(SQL));
check("D02 preparation_category YOK", !/preparation_category/.test(SQL));
check("D03 method_kind allowlist", /method_kind IN \(\s*'faithful_source',\s*'editorial',\s*'expert'\s*\)/.test(SQL));
check("D04 faithful_source → source zorunlu",
  /method_kind <> 'faithful_source' OR source_id IS NOT NULL/.test(SQL));
check("D05 passage → source coupling", /passage_id IS NULL OR source_id IS NOT NULL/.test(SQL));
check("D06 method_lang mevcut dil regex deseni", /method_lang ~ '\^\[A-Za-z0-9\]\+\(-\[A-Za-z0-9\]\+\)\*\$'/.test(SQL));
check("D07 prep FK (tenant_id, preparation_id) RESTRICT",
  /FOREIGN KEY \(tenant_id, preparation_id\)[\s\S]{0,120}aromatherapy_preparations \(tenant_id, id\)[\s\S]{0,40}ON DELETE RESTRICT/.test(SQL));
check("D08 source FK (tenant_id, source_id) RESTRICT",
  /FOREIGN KEY \(tenant_id, source_id\)[\s\S]{0,120}aromatherapy_sources \(tenant_id, id\)[\s\S]{0,40}ON DELETE RESTRICT/.test(SQL));
check("D09 passage-source composite FK (tenant_id, source_id, passage_id)",
  /FOREIGN KEY \(tenant_id, source_id, passage_id\)[\s\S]{0,160}aromatherapy_source_passages \(tenant_id, source_id, id\)[\s\S]{0,40}ON DELETE RESTRICT/.test(SQL));
check("D10 tenant candidate key (tenant_id, id)",
  /aromatherapy_prep_method_series_tenant_id_unique UNIQUE \(tenant_id, id\)/.test(SQL));
check("D11 immutable identity BEFORE UPDATE trigger",
  /BEFORE UPDATE ON public\.aromatherapy_preparation_method_series/.test(SQL) &&
  /aromatherapy_method_series_no_update/.test(SQL));
check("D12 list index (tenant_id, preparation_id, method_kind, created_at)",
  /aromatherapy_prep_method_series_list_idx[\s\S]{0,120}\(tenant_id, preparation_id, method_kind, created_at\)/.test(SQL));
check("D13 series RLS + policy yok + service_role SELECT-only",
  /aromatherapy_preparation_method_series ENABLE ROW LEVEL SECURITY/.test(SQL) &&
  /REVOKE ALL PRIVILEGES ON TABLE public\.aromatherapy_preparation_method_series FROM anon, authenticated, PUBLIC/.test(SQL) &&
  /GRANT SELECT ON TABLE public\.aromatherapy_preparation_method_series TO service_role/.test(SQL) &&
  !/CREATE POLICY[^\n]*method_series/i.test(SQL));

// ============================================================
console.log("\n[B1-E] Method revisions");
// ============================================================
check("E01 revisions tablosu", /CREATE TABLE public\.aromatherapy_preparation_method_revisions/.test(SQL));
check("E02 revision > 0", /CHECK \(revision > 0\)/.test(SQL));
check("E03 material_state allowlist", /material_state IN \('fresh', 'dried', 'other'\)/.test(SQL));
check("E04 method_text non-blank + <=8000", /btrim\(method_text\) <> ''[\s\S]{0,40}char_length\(method_text\) <= 8000/.test(SQL));
check("E05 tüm optional text bounded (>=8 CHECK)",
  (SQL.match(/char_length\((plant_part_used|equipment|amount_ratio|solvent_carrier|duration_text|temperature_text|filtration|resting|storage|quality_notes|safety_notes)\)/g) || []).length >= 8);
check("E06 steps IMMUTABLE validation helper + CHECK",
  /CREATE FUNCTION public\.aromatherapy_method_steps_valid\(p jsonb\)[\s\S]{0,80}IMMUTABLE/.test(SQL) &&
  /CHECK \(\s*public\.aromatherapy_method_steps_valid\(steps\)\s*\)/.test(SQL));
check("E07 steps: exact anahtar order/text + order pozitif tam sayı + tekrarsız + bounded",
  /k <> ALL \(ARRAY\['order', 'text'\]\)/.test(SQL) &&
  /\(elem ->> 'order'\) !~ '\^\[1-9\]\[0-9\]\*\$'/.test(SQL) &&
  /count\(\*\) = count\(DISTINCT \(elem ->> 'order'\)\)/.test(SQL) &&
  /char_length\(elem ->> 'text'\) > 2000/.test(SQL) &&
  /char_length\(p::text\) <= 8000/.test(SQL));
check("E08 note_hash SHA-256 regex", /note_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(SQL));
check("E09 status allowlist", /status IN \('draft', 'verified', 'archived'\)/.test(SQL));
check("E10 unique revision (tenant_id, series_id, revision)",
  /aromatherapy_prep_method_rev_natural_key UNIQUE \(tenant_id, series_id, revision\)/.test(SQL));
check("E11 tek verified partial unique index",
  /aromatherapy_prep_method_rev_verified_uidx[\s\S]{0,120}\(tenant_id, series_id\)[\s\S]{0,40}WHERE status = 'verified'/.test(SQL));
check("E12 tenant candidate key (tenant_id, id)",
  /aromatherapy_prep_method_rev_tenant_id_unique UNIQUE \(tenant_id, id\)/.test(SQL));
check("E13 series FK (tenant_id, series_id) RESTRICT",
  /FOREIGN KEY \(tenant_id, series_id\)[\s\S]{0,120}aromatherapy_preparation_method_series \(tenant_id, id\)[\s\S]{0,40}ON DELETE RESTRICT/.test(SQL));
check("E14 content immutability guard (yalnız status/updated_at) + DELETE reddi",
  /aromatherapy_method_revision_guard/.test(SQL) &&
  /TG_OP = 'DELETE'[\s\S]{0,80}AROMA_METHOD_REVISION_IMMUTABLE/.test(SQL) &&
  /NEW\.method_text IS DISTINCT FROM OLD\.method_text/.test(SQL) &&
  /NEW\.note_hash IS DISTINCT FROM OLD\.note_hash/.test(SQL) &&
  !/NEW\.status IS DISTINCT FROM OLD\.status/.test(SQL));
check("E15 guard BEFORE UPDATE OR DELETE",
  /BEFORE UPDATE OR DELETE ON public\.aromatherapy_preparation_method_revisions/.test(SQL));
check("E16 updated_at mevcut set_updated_at trigger deseni",
  /EXECUTE FUNCTION public\.set_updated_at\(\)/.test(SQL));
check("E17 revisions RLS + policy yok + service_role SELECT-only",
  /aromatherapy_preparation_method_revisions ENABLE ROW LEVEL SECURITY/.test(SQL) &&
  /REVOKE ALL PRIVILEGES ON TABLE public\.aromatherapy_preparation_method_revisions FROM anon, authenticated, PUBLIC/.test(SQL) &&
  /GRANT SELECT ON TABLE public\.aromatherapy_preparation_method_revisions TO service_role/.test(SQL));

// ============================================================
console.log("\n[B1-F] Mutation / privilege sınırı");
// ============================================================
check("F01 seed / veri DML yok",
  !/INSERT INTO/i.test(SQL) && !/\bUPDATE\s+public\./i.test(SQL) && !/DELETE FROM/i.test(SQL));
check("F02 writer/generic RPC yok (yalnız trigger/validation fonksiyonları)",
  !/aromatherapy_(create|update|delete)_/i.test(SQL));
check("F03 content_audit_events'e dokunulmadı", !/aromatherapy_content_audit_events|content_delete_tombstones/.test(SQL));
check("F04 claim tabloları/RPC dokunulmadı", !/aromatherapy_claim/.test(SQL));
check("F05 plant_taxa/preparations privilege DARALTILMADI",
  !/REVOKE[^\n]*aromatherapy_(plant_taxa|preparations)[^\n]*service_role/i.test(SQL) &&
  !/GRANT SELECT ON TABLE public\.aromatherapy_(plant_taxa|preparations)/i.test(SQL));

// ============================================================
console.log("\n[B1-G] Legacy Yağlar dokunulmadı");
// ============================================================
check("G01 aromatherapy_oils dokunulmadı", !/aromatherapy_oils/.test(SQL));
check("G02 Katalog↔Oils eşleştirme/import/link yok", !/oils.*(link|import|sync|map)/i.test(SQL));

// ============================================================
console.log("\n[B1-H] Kapsam guard — git değişiklik kümesi");
// ============================================================
let changed = [];
try {
  const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  changed = out.split("\n").map((l) => l.slice(3).trim()).filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1].trim() : l)).map((l) => l.replace(/^"(.*)"$/, "$1"));
} catch (e) { bad("H00 git status alınamadı", String(e)); }
const migCh = changed.filter((f) => f.startsWith("supabase/migrations/"));
const oldMig = migCh.filter((f) => !/catalog_method_foundation\.sql$/.test(f));
const appLib = changed.filter((f) => f.startsWith("app/") || f.startsWith("lib/"));
const pkg = changed.filter((f) => /package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(f));
const oils = changed.filter((f) => /oils/i.test(f));
const allowed = (f) =>
  /^supabase\/migrations\/[0-9]+_aromatherapy_catalog_method_foundation\.sql$/.test(f) ||
  f === "scripts/aromaterapi-c3d-b1-method-schema-harness.mjs";
const outside = changed.filter((f) => !allowed(f));
check("H01 exact 2 dosya", changed.length === 2, `${changed.length}: ${changed.join(",")}`);
check("H02 tek yeni migration (eski migration değişmedi)", migCh.length === 1 && oldMig.length === 0, oldMig.join(","));
check("H03 app/lib değişikliği = 0", appLib.length === 0, appLib.join(","));
check("H04 package/lockfile = 0", pkg.length === 0, pkg.join(","));
check("H05 oils dosyası değişmedi = 0", oils.length === 0, oils.join(","));
check("H06 kapsam dışı dosya = 0", outside.length === 0, outside.join(","));

console.log(`\n──────────── C3D-B1 HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) { console.log("Başarısızlar:\n  - " + failures.join("\n  - ")); process.exit(1); }
console.log("Tüm C3D-B1 sözleşme kontrolleri geçti.\n");
