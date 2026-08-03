/**
 * HD Danışmanlık F1 · Migration + RPC statik & F0B-parite harness
 * ===============================================================
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. Gerçek migration SQL metni okunur; F0B
 * TypeScript enum/union'ları import edilir (parite). RPC davranışı DB'siz
 * çalıştırılamayacağı için SÖZLEŞME statik olarak (fonksiyon gövdesi yapıları)
 * denetlenir. Herhangi bir FAIL → exit 1.
 *
 * Çalıştır:  npx tsx scripts/hd-consultation/f1-migration-harness.mjs
 */
import { readFileSync } from "node:fs";
import {
  HD_CONSULTATION_STATUSES,
  HD_SECTION_KINDS,
  HD_USAGE_SCOPES,
  HD_CONDITION_KINDS,
  HD_ENTITLEMENT_SCOPE_KINDS,
} from "@/lib/human-design/consultation/types";
import { HD_EVIDENCE_RELATION_TYPES } from "@/lib/human-design/knowledge-system/contracts";

const MIGRATION = "supabase/migrations/20260925000000_hd_consultation_layer_foundation.sql";
const sqlRaw = readFileSync(`${process.cwd()}/${MIGRATION}`, "utf8");
// Yorum satırlarını soy (kelime aramasıyla sahte PASS engellenir).
const sql = sqlRaw.replace(/^\s*--.*$/gm, "");

let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) pass++;
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}
/** `CHECK (<col> IN ( 'a','b',... ))` içindeki tırnak değerleri çıkarır.
 *  CHECK'e anchor'lanır (komşu sütun CHECK'ine kaymayı engeller). */
function checkInValues(colToken) {
  const re = new RegExp("CHECK \\(" + colToken + " IN \\(([\\s\\S]*?)\\)", "m");
  const m = re.exec(sql);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
function sameSet(a, b) {
  const A = new Set(a), B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
}

const TABLES = [
  "hd_consultation_contents", "hd_consultation_sections", "hd_consultation_questions",
  "hd_consultation_conditions", "hd_consultation_evidence", "hd_consultation_expert_notes",
  "hd_consultation_entitlements", "hd_consultation_sessions", "hd_client_reports",
];
const RPCS = [
  "rpc_hd_consultation_create", "rpc_hd_consultation_update", "rpc_hd_consultation_publish",
  "rpc_hd_consultation_archive", "rpc_hd_consultation_entitlement_grant", "rpc_hd_consultation_entitlement_revoke",
];

console.log("── A: 9 tablo + fail-fast (IF NOT EXISTS yok) ──");
for (const t of TABLES) {
  check(`A.${t}: CREATE TABLE mevcut`, new RegExp(`CREATE TABLE public\\.${t} \\(`).test(sql));
  check(`A.${t}: fail-fast (IF NOT EXISTS yok)`, !new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`).test(sql));
}
check("A. tablo sayısı = 9", TABLES.length === 9);

console.log("── B: structured rights additif kolonlar ──");
check("B1. hd_sources.translation_allowed", /ADD COLUMN IF NOT EXISTS translation_allowed\s+boolean NOT NULL DEFAULT false/.test(sql));
check("B2. hd_sources.quotation_allowed", /ADD COLUMN IF NOT EXISTS quotation_allowed\s+boolean NOT NULL DEFAULT false/.test(sql));
check("B3. hd_sources.quotation_word_limit", /ADD COLUMN IF NOT EXISTS quotation_word_limit integer/.test(sql));
check("B4. quotation_word_limit > 0 CHECK", /quotation_word_limit IS NULL OR quotation_word_limit > 0/.test(sql));
check("B5. passages translation_allowed_override", /translation_allowed_override\s+boolean/.test(sql));
check("B6. passages quotation_allowed_override", /quotation_allowed_override\s+boolean/.test(sql));
check("B7. passages quotation_word_limit_override", /quotation_word_limit_override integer/.test(sql));
check("B8. passages override > 0 CHECK", /quotation_word_limit_override IS NULL OR quotation_word_limit_override > 0/.test(sql));

console.log("── C: F0B PARİTE (SQL CHECK ↔ TS union) ──");
const sqlStatus = checkInValues("status");
check("C1. status parite (draft/published/archived)", sqlStatus && sameSet(sqlStatus.filter((v)=>["draft","published","archived"].includes(v)), HD_CONSULTATION_STATUSES) && sameSet(HD_CONSULTATION_STATUSES, ["draft","published","archived"]));
check("C2. section_kind parite (9)", sameSet(checkInValues("section_kind"), HD_SECTION_KINDS));
check("C3. usage_scope parite", sameSet(checkInValues("usage_scope"), HD_USAGE_SCOPES));
check("C4. condition_kind parite", sameSet(checkInValues("condition_kind"), HD_CONDITION_KINDS));
check("C5. relation_type parite", sameSet(checkInValues("relation_type"), HD_EVIDENCE_RELATION_TYPES));
check("C6. scope_kind parite", sameSet(checkInValues("scope_kind"), HD_ENTITLEMENT_SCOPE_KINDS));

console.log("── D: canonical iz + entity composite FK ──");
check("D1. entity composite FK → hd_canonical_entities(id,entity_kind,canonical_key)", /REFERENCES public\.hd_canonical_entities \(id, entity_kind, canonical_key\) ON DELETE RESTRICT/.test(sql));
check("D2. canonical_content_id/version/hash üçlüsü", /canonical_content_id\b/.test(sql) && /canonical_content_version\b/.test(sql) && /canonical_content_hash\b/.test(sql));
check("D3. hash 64-hex format CHECK", /canonical_content_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(sql));
check("D4. canonical triplet birlikte-null/dolu CHECK", /hd_cc_canonical_triplet_chk/.test(sql));
check("D5. entity_kind/canonical_key GENERATED DEĞİL", !/entity_kind\s+text GENERATED/.test(sql) && !/canonical_key\s+text GENERATED/.test(sql));
check("D6. published → human_approved + canonical bağı CHECK", /hd_cc_published_chk[\s\S]*?human_approved_at IS NOT NULL AND canonical_content_id IS NOT NULL/.test(sql));

console.log("── E: unique / partial unique / FK yönleri ──");
check("E1. entity başına tek aktif content", /hd_cc_one_active_per_entity_uidx[\s\S]*?WHERE status <> 'archived'/.test(sql));
check("E2. content içinde section_kind tek (aktif)", /hd_cs_one_kind_per_content_uidx[\s\S]*?WHERE status <> 'archived'/.test(sql));
check("E3. evidence (section,passage,relation) unique", /UNIQUE \(section_id, passage_id, relation_type\)/.test(sql));
check("E4. section başına tek primary evidence", /hd_cev_one_primary_per_section_uidx[\s\S]*?WHERE is_primary/.test(sql));
check("E5. entitlement aktif duplicate engeli", /hd_cent_active_unique_uidx[\s\S]*?WHERE revoked_at IS NULL/.test(sql));
check("E6. evidence passage FK RESTRICT", /hd_cev_passage_fk[\s\S]*?REFERENCES public\.hd_source_passages \(id\) ON DELETE RESTRICT/.test(sql));
check("E7. section→content CASCADE", /hd_cs_content_fk[\s\S]*?ON DELETE CASCADE/.test(sql));
check("E8. entitlement all_hd/entity invariant CHECK", /hd_cent_scope_entity_chk/.test(sql));
check("E9. entitlement 'active' boolean YOK", !/\bactive\s+boolean/.test(sql));

console.log("── F: born-locked RLS/ACL (9/9) ──");
check("F1. ENABLE ROW LEVEL SECURITY (lock loop)", /ENABLE ROW LEVEL SECURITY/.test(sql));
check("F2. lock loop 9 tabloyu listeler", TABLES.every((t) => new RegExp(`'${t}'`).test(sql)));
check("F3. anon REVOKE ALL", /REVOKE ALL ON TABLE public\.%I FROM anon/.test(sql));
check("F4. authenticated REVOKE ALL", /REVOKE ALL ON TABLE public\.%I FROM authenticated/.test(sql));
check("F5. service_role yalnız SELECT (I/U/D yok)", /GRANT SELECT ON TABLE public\.%I TO service_role/.test(sql) && !/GRANT SELECT, INSERT.*TO service_role/.test(sql));
check("F6. CREATE POLICY = 0", !/CREATE POLICY/i.test(sql));
check("F7. FORCE ROW LEVEL yok", !/FORCE ROW LEVEL SECURITY/i.test(sql));

console.log("── G: 6 RPC · SECURITY DEFINER · search_path · EXECUTE ACL ──");
for (const r of RPCS) check(`G.${r}: fonksiyon mevcut`, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${r}\\(`).test(sql));
check("G. SECURITY DEFINER x6", (sql.match(/SECURITY DEFINER/g) || []).length === 6);
check("G. SET search_path = public x6", (sql.match(/SET search_path = public\b/g) || []).length === 6);
check("G. GRANT EXECUTE ... service_role (ACL loop)", /GRANT EXECUTE ON FUNCTION public\.%s TO service_role/.test(sql));
check("G. EXECUTE anon/authenticated REVOKE", /REVOKE ALL ON FUNCTION public\.%s FROM anon/.test(sql) && /REVOKE ALL ON FUNCTION public\.%s FROM authenticated/.test(sql));
check("G. ACL loop 6 RPC imzası listeler", RPCS.every((r) => new RegExp(r + "\\(").test(sql)));

console.log("── H: RPC davranış sözleşmesi (statik) ──");
function fnBody(name) {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$fn\\$([\\s\\S]*?)\\$fn\\$`).exec(sql);
  return m ? m[1] : "";
}
const create = fnBody("rpc_hd_consultation_create");
const update = fnBody("rpc_hd_consultation_update");
const publish = fnBody("rpc_hd_consultation_publish");
const archive = fnBody("rpc_hd_consultation_archive");
const grant = fnBody("rpc_hd_consultation_entitlement_grant");
const revoke = fnBody("rpc_hd_consultation_entitlement_revoke");

check("H1. actor_admin_id 1. parametre (payload'dan değil)", /rpc_hd_consultation_create\(\s*[\r\n ]*p_actor_admin_id\s+uuid/.test(sql));
check("H2. create: entity_kind/key canonical entity'den", /FROM public\.hd_canonical_entities WHERE id = p_entity_id/.test(create));
check("H3. create: sections/questions/conditions/evidence jsonb loop", ["p_sections","p_questions","p_conditions","p_evidence"].every((p)=>create.includes(p)));
check("H4. create: audit aynı txn", /hd_content_audit_events/.test(create) && /'created'/.test(create));
check("H5. create: condition canonical registry doğrulaması", /condition_value canonical registry ile doğrulanamadı/.test(create));
check("H6. update: expected_version stale reject", /stale version/.test(update) && /p_expected_version/.test(update));
check("H7. update: FOR UPDATE (kör overwrite yok)", /FOR UPDATE/.test(update));
check("H8. publish: canonical published+human_approved kapısı", /status = 'published' AND human_approved_at IS NOT NULL/.test(publish));
check("H9. publish: en az bir aktif section", /en az bir aktif section/.test(publish));
check("H10. publish: her section evidence gereksinimi", /en az bir evidence gerekir/.test(publish));
check("H11. publish: client_report rights default-deny", /private_report_use_allowed[\s\S]*?IS DISTINCT FROM true/.test(publish));
check("H12. publish: expert_guide rights default-deny", /internal_use_allowed_override[\s\S]*?expert_delivery_allowed_override/.test(publish));
check("H13. publish: rights_status engel kontrolü", /rights_status_override, src\.rights_status\) IN \('restricted'/.test(publish));
check("H14. archive: hard delete YOK (DELETE FROM yok)", !/DELETE FROM/.test(archive) && /status = 'archived'/.test(archive) && /archived_at = now\(\)/.test(archive));
check("H15. grant: all_hd/entity invariant", /all_hd için entity_id NULL/.test(grant) && /entity için entity_id zorunlu/.test(grant));
check("H16. grant: aktif duplicate engeli", /aktif entitlement zaten var/.test(grant));
check("H17. revoke: idempotent", /v_revoked IS NOT NULL THEN RETURN/.test(revoke));
check("H18. tüm RPC audit yazıyor", [create,update,publish,archive,grant,revoke].every((b)=>/hd_content_audit_events/.test(b)));

console.log("── I: güvenlik · sızıntı · kapsam ──");
check("I1. audit context TAM METİN yok (body_text/report_text)", !/context[\s\S]{0,120}(body_text|report_text|original_text|translation_text)/.test(sql));
check("I2. RPC gövdelerinde dinamik SQL yok (EXECUTE/format)", ![create,update,publish,archive,grant,revoke].some((b)=>/\bEXECUTE\b|format\(/.test(b)));
check("I3. legacy human_design_reports DOKUNULMAZ (referans yok)", !/human_design_reports/.test(sql));
check("I4. hd_canonical_content MODIFY yok (yalnız FK/SELECT)", !/ALTER TABLE public\.hd_canonical_content|UPDATE public\.hd_canonical_content|INSERT INTO public\.hd_canonical_content|DELETE FROM public\.hd_canonical_content/.test(sql));
check("I5. engine/compute referansı yok", !/computeHumanDesignChart|engine\/compute/.test(sql));
check("I6. seed/Manifestör yok", !/Manifest[oö]r/i.test(sql) && !/INSERT INTO public\.hd_canonical_entities/.test(sql) && !/INSERT INTO public\.hd_sources\b/.test(sql));
check("I7. destructive DOWN yok (DROP TABLE yok)", !/DROP TABLE/i.test(sql));
check("I8. açık BEGIN/COMMIT", /^BEGIN;/m.test(sql) && /^COMMIT;/m.test(sql));
check("I9. audit resource_kind mevcut 6 değer KORUNUR", ["canonical_content","source","source_passage","original_text","faithful_translation","content_evidence"].every((v)=>new RegExp(`'${v}'`).test(sql)));
check("I10. audit resource_kind danışmanlık additif", ["consultation_content","consultation_section","consultation_entitlement"].every((v)=>new RegExp(`'${v}'`).test(sql)));
check("I11. mevcut centralContent* API/persistence değişmedi (bu migration onlara dokunmaz)", !/centralContentPersistence|app\/api\/admin\/hd/.test(sql));

console.log(`\nf1-migration-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
