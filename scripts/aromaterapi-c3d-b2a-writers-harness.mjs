// ============================================================
// Aromaterapi C3D-B2A — Katalog yazarları + method backend migration harness'i
//
// SALT-OKUNUR / STATİK. DB'ye bağlanmaz, SQL çalıştırmaz. Yeni migration'ın kilitli
// C3D-B2A sözleşmesine (7 SECURITY DEFINER writer, write-gate, audit reuse, no-DELETE,
// legacy Oils/claims dokunulmazlığı, C3D-B1 değişmezliği) uyduğunu doğrular.
// FAIL → process.exit(1).
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
function count(re, s) { return (s.match(re) || []).length; }

const MIG_DIR = "supabase/migrations";
const migFiles = existsSync(resolve(ROOT, MIG_DIR))
  ? readdirSync(resolve(ROOT, MIG_DIR)).filter((f) => /catalog_method_writers\.sql$/.test(f))
  : [];
const MIG_REL = migFiles.length ? `${MIG_DIR}/${migFiles[0]}` : "";
const M = MIG_REL ? read(MIG_REL) : "";
const SQL = M.replace(/^\s*--[^\n]*$/gm, ""); // yorumsuz DDL

const RPCS = [
  "aromatherapy_create_plant_taxon_with_audit",
  "aromatherapy_update_plant_taxon_with_audit",
  "aromatherapy_create_preparation_with_audit",
  "aromatherapy_update_preparation_with_audit",
  "aromatherapy_create_method_series_with_first_revision",
  "aromatherapy_append_method_revision",
  "aromatherapy_transition_method_revision_status",
];

// ============================================================
console.log("\n[B2A-A] Migration kimliği ve kapsam");
// ============================================================
check("A01 tek catalog_method_writers migration", migFiles.length === 1, `bulunan: ${migFiles.length}`);
check("A02 timestamp 20260915000000 (20260914000000 origin/main'de hd_central_content ile çakıştı)",
  /^20260915000000_/.test(migFiles[0] || ""), migFiles[0]);
check("A03 tek transaction (BEGIN + COMMIT)", /^BEGIN;/m.test(M) && /^COMMIT;/m.test(M));
check("A04 CREATE OR REPLACE / DROP / DDL IF (NOT) EXISTS YOK",
  !/CREATE\s+OR\s+REPLACE/i.test(SQL) &&
  !/\bDROP\s+/i.test(SQL) &&
  !/CREATE\s+(TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS/i.test(SQL));
check("A05 DO bloğu / EXCEPTION WHEN yok (fail-fast, native propagation)",
  !/^\s*DO\b/im.test(SQL) && !/EXCEPTION\s+WHEN/i.test(SQL));

// ============================================================
console.log("\n[B2A-B] 7 writer RPC + güvenlik sözleşmesi");
// ============================================================
for (const fn of RPCS) {
  check(`B:${fn} CREATE FUNCTION`, new RegExp(`CREATE FUNCTION public\\.${fn}\\(`).test(SQL));
  check(`B:${fn} GRANT EXECUTE yalnız service_role`,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(`).test(SQL));
  check(`B:${fn} REVOKE service_role EXECUTE (least-privilege)`,
    new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([\\s\\S]*?\\) FROM service_role`).test(SQL));
}
check("B08 tam 7 SECURITY DEFINER", count(/SECURITY DEFINER/g, SQL) === 7, String(count(/SECURITY DEFINER/g, SQL)));
check("B09 tam 7 SET search_path = pg_catalog, public",
  count(/SET search_path = pg_catalog, public/g, SQL) === 7, String(count(/SET search_path = pg_catalog, public/g, SQL)));
check("B10 tam 7 GRANT EXECUTE (service_role)", count(/GRANT EXECUTE ON FUNCTION/g, SQL) === 7);
// Function REVOKE'ları tek-satır "... ) FROM <role>;"; tablo REVOKE'ları
// "FROM anon, authenticated, PUBLIC;" (virgüllü) → yalnız fonksiyonları sayar.
check("B11 her RPC PUBLIC/anon/authenticated REVOKE",
  count(/FROM PUBLIC;/g, SQL) === 7 &&
  count(/FROM anon;/g, SQL) === 7 &&
  count(/FROM authenticated;/g, SQL) === 7,
  `PUBLIC=${count(/FROM PUBLIC;/g, SQL)} anon=${count(/FROM anon;/g, SQL)} auth=${count(/FROM authenticated;/g, SQL)}`);
check("B12 anon/authenticated/PUBLIC'e GRANT EXECUTE YOK",
  !/GRANT EXECUTE ON FUNCTION[^\n]*TO (anon|authenticated|PUBLIC)/i.test(SQL));

// ============================================================
console.log("\n[B2A-C] Write-gate: plant_taxa + preparations SELECT-only");
// ============================================================
for (const t of ["aromatherapy_plant_taxa", "aromatherapy_preparations"]) {
  check(`C:${t} service_role REVOKE ALL`,
    new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t}\\s+FROM service_role`).test(SQL));
  check(`C:${t} service_role GRANT SELECT`,
    new RegExp(`GRANT\\s+SELECT\\s+ON TABLE public\\.${t}\\s+TO service_role`).test(SQL));
  check(`C:${t} anon/authenticated/PUBLIC REVOKE`,
    new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t}\\s+FROM anon, authenticated, PUBLIC`).test(SQL));
}
check("C05 plant_taxa/preparations'a INSERT/UPDATE/DELETE/ALL GRANT YOK (service_role)",
  !/GRANT\s+(ALL|INSERT|UPDATE|DELETE|TRUNCATE)[^\n]*aromatherapy_(plant_taxa|preparations)[^\n]*service_role/i.test(SQL));

// ============================================================
console.log("\n[B2A-D] Audit reuse + method tabloları dokunulmazlığı");
// ============================================================
check("D01 audit YALNIZ content_audit_events'e INSERT",
  /INSERT INTO public\.aromatherapy_content_audit_events/.test(SQL));
check("D02 audit tablosu CREATE/ALTER edilmedi",
  !/CREATE TABLE public\.aromatherapy_content_audit_events/.test(SQL) &&
  !/ALTER TABLE public\.aromatherapy_content_audit_events/.test(SQL));
check("D03 entity_type yalnız plant_taxon/preparation/preparation_method",
  /'plant_taxon'/.test(SQL) && /'preparation'/.test(SQL) && /'preparation_method'/.test(SQL) &&
  !/'source_passage'|'passage_translation'|'editorial_note'|'glossary_term'/.test(SQL));
check("D04 method tablolarının privilege'ı DEĞİŞMEDİ (GRANT/REVOKE yok)",
  !/(GRANT|REVOKE)[^\n]*aromatherapy_preparation_method_(series|revisions)/i.test(SQL));
check("D05 method series/revision immutability trigger'ı YENİDEN tanımlanmadı",
  !/aromatherapy_method_(series_no_update|revision_guard|steps_valid)/.test(SQL));

// ============================================================
console.log("\n[B2A-E] note_hash + concurrency + status + identity-lock sözleşmeleri");
// ============================================================
check("E01 note_hash pgcrypto/digest ile ÜRETİLMEZ (yalnız format doğrular)",
  !/digest\(|pgcrypto|gen_salt|extensions\.crypt|crypt\(/i.test(SQL) &&
  count(/p_note_hash !~ '\^\[0-9a-f\]\{64\}\$'/g, SQL) >= 2);
check("E02 optimistic concurrency (expected_updated_at → AROMA_STALE)",
  /p_expected_updated_at IS NULL[\s\S]{0,120}AROMA_STALE/.test(SQL));
check("E03 append expected_latest_revision → AROMA_REVISION_STALE",
  /p_expected_latest_revision[\s\S]{0,160}AROMA_REVISION_STALE/.test(SQL));
check("E04 append no-op (aynı note_hash → yeni revision YOK)",
  /v_latest\.note_hash = p_note_hash[\s\S]{0,120}'noop', true/.test(SQL));
check("E05 preparation identity-lock (method varsa)",
  /AROMA_PREPARATION_IDENTITY_LOCKED/.test(SQL));
check("E06 faithful_source → source zorunlu token",
  /AROMA_FAITHFUL_SOURCE_REQUIRED/.test(SQL));
check("E07 passage/source mismatch token", /AROMA_PASSAGE_SOURCE_MISMATCH/.test(SQL));
check("E08 taxon/preparation status matrisi (draft→verified, verified→approved)",
  /v_old\.status = 'draft'\s+AND p_status = 'verified'/.test(SQL) &&
  /v_old\.status = 'verified'\s+AND p_status = 'approved'/.test(SQL) &&
  /AROMA_FORBIDDEN_STATUS_TRANSITION/.test(SQL));
check("E09 method status matrisi (draft→verified/archived, verified→archived)",
  /v_target\.status = 'draft'\s+AND p_target_status = 'verified'/.test(SQL) &&
  /v_target\.status = 'draft'\s+AND p_target_status = 'archived'/.test(SQL) &&
  /v_target\.status = 'verified'\s+AND p_target_status = 'archived'/.test(SQL));
check("E10 verify → önceki verified atomik archive + tek verified değişmezi",
  /SET status = 'archived'/.test(SQL) &&
  /SET status = p_target_status/.test(SQL) &&
  /correlation_id/.test(SQL));
check("E11 no-op audit üretmez (append/status same → RETURN önce)",
  /'noop', true[\s\S]*?RETURN/.test(SQL));
check("E12 reason: create opsiyonel / update-append-status zorunlu",
  count(/AROMA_REASON_INVALID/g, SQL) >= 7);

// ============================================================
console.log("\n[B2A-F] Yasaklar: DELETE/tombstone/purge/seed/claims/oils");
// ============================================================
check("F01 DELETE / tombstone / purge YOK",
  !/DELETE\s+FROM\s+public\.aromatherapy_(plant_taxa|preparations|preparation_method|content)/i.test(SQL) &&
  !/tombstone|purge/i.test(SQL));
check("F02 seed/gerçek veri INSERT yok (audit + method/catalog RPC içi hariç)",
  !/INSERT INTO public\.aromatherapy_(oils|claims|reference)/i.test(SQL));
check("F03 claim tabloları/RPC dokunulmadı", !/aromatherapy_claim/i.test(SQL));
check("F04 legacy Oils dokunulmadı", !/aromatherapy_oils|aromatherapy_reference/i.test(SQL));
check("F05 generic upsert/writer yok", !/\bUPSERT\b|ON CONFLICT/i.test(SQL));

// ============================================================
console.log("\n[B2A-G] Kapsam guard — git değişiklik kümesi");
// ============================================================
let changed = [];
try {
  const out = execSync("git status --porcelain -uall", { cwd: ROOT, encoding: "utf8" });
  changed = out.split("\n").map((l) => l.slice(3).trim()).filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1].trim() : l)).map((l) => l.replace(/^"(.*)"$/, "$1"));
} catch (e) { bad("G00 git status alınamadı", String(e)); }

const ALLOWED = new Set([
  `${MIG_DIR}/20260915000000_aromatherapy_catalog_method_writers.sql`,
  "lib/aromaterapi/service/methodCanonical.ts",
  "lib/aromaterapi/service/requestBody.ts",
  "lib/aromaterapi/service/catalogMethodMutations.ts",
  "lib/aromaterapi/service/catalogWriteHttp.ts",
  "app/api/aromaterapi/plant-taxa/route.ts",
  "app/api/aromaterapi/plant-taxa/[id]/route.ts",
  "app/api/aromaterapi/preparations/route.ts",
  "app/api/aromaterapi/preparations/[id]/route.ts",
  "app/api/aromaterapi/preparations/[id]/methods/route.ts",
  "app/api/aromaterapi/methods/[seriesId]/revisions/route.ts",
  "app/api/aromaterapi/methods/[seriesId]/revisions/[revisionId]/route.ts",
  "scripts/aromaterapi-c3d-b2a-writers-harness.mjs",
  "scripts/aromaterapi-c3d-b2a-canonical-hash.test.ts",
  "scripts/aromaterapi-c3d-b2a-api-contract-harness.mjs",
  "scripts/verify-aromatherapy-catalog-method-writers.sql",
]);
const outside = changed.filter((f) => !ALLOWED.has(f));
const oldMig = changed.filter((f) => f.startsWith(`${MIG_DIR}/`) && !/20260915000000_aromatherapy_catalog_method_writers\.sql$/.test(f));
const oils = changed.filter((f) => /oils/i.test(f));
const pkg = changed.filter((f) => /package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(f));
check("G01 kapsam dışı dosya = 0", outside.length === 0, outside.join(","));
check("G02 eski migration değişmedi (yalnız yeni)", oldMig.length === 0, oldMig.join(","));
check("G03 oils dosyası değişmedi = 0", oils.length === 0, oils.join(","));
check("G04 package/lockfile değişmedi = 0", pkg.length === 0, pkg.join(","));

// C3D-B1 migration blob değişmezliği (git working tree'de değişmemiş olmalı).
const b1Changed = changed.some((f) => /catalog_method_foundation\.sql$/.test(f));
check("G05 C3D-B1 foundation migration dokunulmadı", !b1Changed);

console.log(`\n──────────── C3D-B2A MIGRATION HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) { console.log("Başarısızlar:\n  - " + failures.join("\n  - ")); process.exit(1); }
console.log("Tüm C3D-B2A migration sözleşme kontrolleri geçti.\n");
