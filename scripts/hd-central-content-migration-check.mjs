/**
 * HD-2D3/2D4 Merkezî İçerik + Audit — statik migration harness
 * ============================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. hd_central_content migration'ını denetler:
 * üç yeni içerik tablosu + HD-özel append-only audit + source_specific_note +
 * born-locked ACL (REVOKE-önce-GRANT) + published/tür CHECK'leri.
 *
 * Çalıştır (repo kökünden): node scripts/hd-central-content-migration-check.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}

const MIG_DIR = `${ROOT}/supabase/migrations`;
const files = readdirSync(MIG_DIR).filter((f) => /_hd_central_content\.sql$/.test(f));

console.log("── GRUP A: Dosya, transaction, timestamp ──");
check(`A1. Tam bir hd_central_content migration dosyası (${files.length})`, files.length === 1);
const NAME = files[0] ?? "";
const RAW = NAME ? readFileSync(`${MIG_DIR}/${NAME}`, "utf8") : "";
// Aktif SQL (yorumlar soyulur) + şema görünümü (string literal boşaltılır).
const BODY = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
const SCHEMA = BODY.replace(/'(?:[^']|'')*'/g, "''");
check("A2. 14-haneli timestamp prefix", /^\d{14}_hd_central_content\.sql$/.test(NAME));
check("A3. Tek BEGIN;", (BODY.match(/\bBEGIN\s*;/g) ?? []).length === 1);
check("A4. Tek COMMIT;", (BODY.match(/\bCOMMIT\s*;/g) ?? []).length === 1);
check("A5. BEGIN COMMIT'ten önce", BODY.indexOf("BEGIN") < BODY.indexOf("COMMIT"));
check("A6. Destructive DOWN yok (DROP TABLE/DROP SCHEMA/TRUNCATE yok)",
  !/DROP\s+TABLE/i.test(SCHEMA) && !/DROP\s+SCHEMA/i.test(SCHEMA) && !/\bTRUNCATE\b/i.test(SCHEMA));
check("A7. DO/EXCEPTION yok, ENUM yok, ON CONFLICT yok",
  !/\bDO\s+\$\$/i.test(SCHEMA) && !/EXCEPTION\s+WHEN/i.test(SCHEMA) && !/CREATE\s+TYPE/i.test(SCHEMA) && !/ON\s+CONFLICT/i.test(SCHEMA));
check("A8. Yeni set_updated_at fonksiyonu TANIMLANMIYOR (reuse)",
  !/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.set_updated_at/i.test(SCHEMA));

console.log("── GRUP B: source_specific_note (rights_note DEĞİL) ──");
check("B1. hd_source_passages'a source_specific_note additif eklenir",
  /ALTER TABLE public\.hd_source_passages\s+ADD COLUMN IF NOT EXISTS source_specific_note text/i.test(SCHEMA));
check("B2. source_specific_note rights_note'a dönüştürülmüyor (rights_note ADD/ALTER yok)",
  !/ADD COLUMN[^;]*rights_note/i.test(SCHEMA) && !/ALTER COLUMN\s+rights_note/i.test(SCHEMA));

console.log("── GRUP C: Yeni tablolar mevcut ──");
const created = [...SCHEMA.matchAll(/CREATE TABLE\s+public\.(\w+)/g)].map((m) => m[1]);
for (const t of ["hd_faithful_translations", "hd_canonical_content", "hd_content_evidence", "hd_content_audit_events"]) {
  check(`C.${t}: CREATE TABLE var`, created.includes(t));
}
check("C-glob. Kapsam dışı tablo (tenant/canonical identity/report) OLUŞTURULMUYOR",
  !/CREATE TABLE public\.(hd_canonical_entities|hd_canonical_types|hd_canonical_authorities|hd_canonical_gates|hd_canonical_channels|human_design_|hd_sources|hd_source_passages|hd_original_texts)\b/i.test(SCHEMA));

// Tablo blok ayıklayıcı — BODY (yorumlar soyulu, string literal'ler SAĞLAM) üzerinden;
// değer-CHECK regexleri ('draft'/'tr'/'supports' vb.) literalleri görebilsin.
// Blok sonu = CREATE TABLE'ın kapanışı: satır başında (indent) `);`.
function tableBlock(t) {
  const s = BODY.indexOf(`CREATE TABLE public.${t}`);
  if (s < 0) return "";
  const e = BODY.indexOf("\n);", s);
  return BODY.slice(s, e === -1 ? undefined : e + 3);
}
const FT = tableBlock("hd_faithful_translations");
const CC = tableBlock("hd_canonical_content");
const EV = tableBlock("hd_content_evidence");
const AU = tableBlock("hd_content_audit_events");

console.log("── GRUP D: Sadık çeviri (version-pin) ──");
check("D1. Composite version-pin FK → hd_original_texts(id, content_hash, language_tag, script_code)",
  /FOREIGN KEY \(original_text_id, source_content_hash, source_language_tag, source_script_code\)\s*REFERENCES public\.hd_original_texts \(id, content_hash, language_tag, script_code\)\s*ON DELETE RESTRICT/.test(FT));
check("D2. status draft/verified/archived", /status IN \('draft', 'verified', 'archived'\)/.test(FT));
check("D3. target_language_tag default 'tr'", /target_language_tag\s+text\s+NOT NULL DEFAULT 'tr'/.test(FT));
check("D4. translation_hash 64-hex CHECK", /translation_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(FT));
check("D5. revision > 0 + supersedes self-FK RESTRICT",
  /revision > 0/.test(FT) && /FOREIGN KEY \(supersedes_translation_id\)\s*REFERENCES public\.hd_faithful_translations \(id\) ON DELETE RESTRICT/.test(FT));
check("D6. UNIQUE(original_text_id, target_language_tag, revision)",
  /UNIQUE\s*\(original_text_id, target_language_tag, revision\)/.test(FT));
check("D7. Aynı özgün+dil için tek verified (partial unique index)",
  /CREATE UNIQUE INDEX hd_faithful_translations_one_verified_uidx[\s\S]*?WHERE status = 'verified'/.test(BODY));
check("D8. updated_at trigger set_updated_at reuse",
  /CREATE TRIGGER trg_hd_faithful_translations_updated_at[\s\S]*?EXECUTE FUNCTION public\.set_updated_at\(\)/.test(SCHEMA));
check("D9. tenant_id YOK", !/\btenant_id\b/.test(FT));

console.log("── GRUP E: Canonical içerik + tür + published ──");
check("E1. entity_id UNIQUE NOT NULL", /entity_id\s+uuid\s+NOT NULL/.test(CC) && /UNIQUE \(entity_id\)/.test(CC));
check("E2. Canonical composite FK ON DELETE RESTRICT",
  /FOREIGN KEY \(entity_id, entity_kind, canonical_key\)\s*REFERENCES public\.hd_canonical_entities \(id, entity_kind, canonical_key\)\s*ON DELETE RESTRICT/.test(CC));
check("E3. status draft/published", /status IN \('draft', 'published'\)/.test(CC));
check("E4. report_text + general_description kolonları", /\breport_text\b/.test(CC) && /\bgeneral_description\b/.test(CC));
for (const [kind, col] of [["Tip", "strategy_text"], ["Otorite", "decision_mechanism"], ["Kapı", "general_theme"], ["Kanal", "full_channel_text"]]) {
  check(`E5.${kind}: ${col} kolonu var`, new RegExp(`\\b${col}\\b`).test(CC));
}
check("E6. Tip signature/not_self + Otorite application/caution + Kanal hanging_gate kolonları",
  /\bsignature_text\b/.test(CC) && /\bnot_self_text\b/.test(CC) && /\bapplication_text\b/.test(CC) && /\bcaution_notes\b/.test(CC) && /\bhanging_gate_context\b/.test(CC));
check("E7. Published ortak CHECK (general_description + report_text + human_approved_at)",
  /status <> 'published'\s*OR \(btrim\(general_description\) <> '' AND btrim\(report_text\) <> '' AND human_approved_at IS NOT NULL\)/.test(CC));
check("E8. Published tür CHECK (tip→strategy / otorite→decision / kapi→theme / kanal→channel)",
  /entity_kind = 'tip'\s+AND btrim\(coalesce\(strategy_text/.test(CC) &&
  /entity_kind = 'otorite'\s+AND btrim\(coalesce\(decision_mechanism/.test(CC) &&
  /entity_kind = 'kapi'\s+AND btrim\(coalesce\(general_theme/.test(CC) &&
  /entity_kind = 'kanal'\s+AND btrim\(coalesce\(full_channel_text/.test(CC));
check("E9. Tür-dışı alan karışma CHECK'i (type_fields_exclusive)",
  /hd_canonical_content_type_fields_exclusive_chk/.test(CC) &&
  /entity_kind = 'tip'\s+AND decision_mechanism IS NULL/.test(CC) &&
  /entity_kind = 'kanal'\s+AND strategy_text IS NULL/.test(CC));
check("E10. version > 0 + tenant_id YOK", /version > 0/.test(CC) && !/\btenant_id\b/.test(CC));

console.log("── GRUP F: Evidence (CASCADE/RESTRICT) ──");
check("F1. content_id FK → hd_canonical_content ON DELETE CASCADE",
  /FOREIGN KEY \(content_id\) REFERENCES public\.hd_canonical_content \(id\) ON DELETE CASCADE/.test(EV));
check("F2. passage_id FK → hd_source_passages ON DELETE RESTRICT",
  /FOREIGN KEY \(passage_id\) REFERENCES public\.hd_source_passages \(id\) ON DELETE RESTRICT/.test(EV));
check("F3. relation_type allowlist supports/contradicts/school_specific/background",
  /relation_type IN \('supports', 'contradicts', 'school_specific', 'background'\)/.test(EV));
check("F4. UNIQUE(content_id, passage_id)", /UNIQUE\s*\(content_id, passage_id\)/.test(EV));
check("F5. is_primary + is_single_source + editorial_note + sort_order>=0",
  /\bis_primary\b/.test(EV) && /\bis_single_source\b/.test(EV) && /\beditorial_note\b/.test(EV) && /sort_order >= 0/.test(EV));

console.log("── GRUP G: HD-özel append-only audit ──");
check("G1. action allowlist created/updated/deleted/published",
  /action IN \('created', 'updated', 'deleted', 'published'\)/.test(AU));
check("G2. resource_kind allowlist (6 değer)",
  /resource_kind IN \(\s*'canonical_content', 'source', 'source_passage',\s*'original_text', 'faithful_translation', 'content_evidence'\s*\)/.test(AU));
check("G3. actor_admin_id NOT NULL + users FK YOK",
  /actor_admin_id\s+uuid\s+NOT NULL/.test(AU) && !/actor_admin_id[\s\S]*REFERENCES public\.users/i.test(AU));
check("G4. resource_id NOT NULL + içerik tablolarına FK YOK",
  /resource_id\s+uuid\s+NOT NULL/.test(AU) &&
  !/FOREIGN KEY \(resource_id\)/i.test(AU));
check("G5. canonical_entity_id yalnız registry'ye ON DELETE RESTRICT (varsa)",
  !/canonical_entity_id[\s\S]*REFERENCES/i.test(AU) ||
  /FOREIGN KEY \(canonical_entity_id\)\s*REFERENCES public\.hd_canonical_entities \(id\) ON DELETE RESTRICT/.test(AU));
check("G6. tenant_id / target_user_id YOK", !/\btenant_id\b/.test(AU) && !/\btarget_user_id\b/.test(AU));
check("G7. Tam-metin KOLONU YOK (original_text/translation_text/report_text/general_description tipli kolon yok; resource_kind etiketi hariç)",
  !/\b(original_text|translation_text|report_text|general_description)\s+text\b/i.test(AU));
check("G8. changed_fields text[] + context jsonb", /changed_fields\s+text\[\]/.test(AU) && /context\s+jsonb/.test(AU));
check("G9. APPEND-ONLY: updated_at YOK + update trigger YOK",
  !/\bupdated_at\b/.test(AU) && !/CREATE TRIGGER[^;]*hd_content_audit_events/i.test(SCHEMA));

console.log("── GRUP H: RLS + ACL matrisi ──");
const CONTENT_TABLES = ["hd_faithful_translations", "hd_canonical_content", "hd_content_evidence"];
const SOURCE_TABLES = ["hd_sources", "hd_source_passages", "hd_original_texts"];
for (const t of [...CONTENT_TABLES, "hd_content_audit_events"]) {
  check(`H.${t}: ENABLE RLS`, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(SCHEMA));
  check(`H.${t}: PUBLIC/anon/authenticated REVOKE ALL`,
    new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM PUBLIC`).test(SCHEMA) &&
    new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM anon`).test(SCHEMA) &&
    new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM authenticated`).test(SCHEMA));
}
// REVOKE-önce-GRANT (service_role) — içerik + kaynak + audit tablolarında.
for (const t of [...CONTENT_TABLES, ...SOURCE_TABLES, "hd_content_audit_events"]) {
  const r = SCHEMA.search(new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM service_role`));
  const g = SCHEMA.search(new RegExp(`GRANT [A-Z, ]+ ON TABLE public\\.${t} TO service_role`));
  check(`H2.${t}: REVOKE-before-GRANT (service_role)`, r >= 0 && g >= 0 && r < g);
}
// İçerik + kaynak tabloları: S/I/U/D
for (const t of [...CONTENT_TABLES, ...SOURCE_TABLES]) {
  check(`H3.${t}: service_role S/I/U/D`,
    new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\\.${t} TO service_role`).test(SCHEMA));
}
// Audit: yalnız S/I (UPDATE/DELETE YOK)
check("H4.audit: service_role yalnız SELECT, INSERT",
  /GRANT SELECT, INSERT ON TABLE public\.hd_content_audit_events TO service_role/.test(SCHEMA) &&
  !/GRANT[^;]*\b(UPDATE|DELETE)\b[^;]*hd_content_audit_events/i.test(SCHEMA));
check("H5. FORCE RLS yok, CREATE POLICY yok (policy 0)",
  !/FORCE ROW LEVEL SECURITY/i.test(SCHEMA) && !/CREATE POLICY/i.test(SCHEMA));
check("H6. Canonical identity tablolarına DELETE grant YOK / hiç dokunulmuyor",
  !/GRANT[^;]*\bDELETE\b[^;]*hd_canonical_(entities|types|authorities|gates|channels)/i.test(SCHEMA) &&
  !/hd_canonical_(entities|types|authorities|gates|channels)\s+FROM service_role/i.test(SCHEMA));
check("H7. GRANT ALL YOK, anon/authenticated'a GRANT YOK",
  !/GRANT ALL/i.test(SCHEMA) && !/GRANT[^;]*TO\s+anon/i.test(SCHEMA) && !/GRANT[^;]*TO\s+authenticated/i.test(SCHEMA));

console.log("── GRUP I: Seed / kapsam dışı yazma yok ──");
check("I1. Gerçek içerik seed YOK (INSERT INTO yok)", !/\bINSERT\s+INTO\b/i.test(SCHEMA));
check("I2. tenant_id migration gövdesinde YOK", !/\btenant_id\b/.test(SCHEMA));
check("I3. tenant/rapor tablolarına dokunma YOK",
  !/human_design_knowledge|human_design_reports|generated_content|edited_content/i.test(SCHEMA));
check("I4. UPDATE <tablo> SET / DELETE FROM veri ifadesi YOK",
  !/\bUPDATE\s+[\w."]+\s+SET\b/i.test(SCHEMA) && !/\bDELETE\s+FROM\b/i.test(SCHEMA));

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }
