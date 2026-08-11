/**
 * HD Danışmanlık F2.1 · Draft Editability + Canonical Evidence UX — statik & güvenlik harness
 * ================================================================================
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. Yeni additif migration (RPC) + service + route +
 * UI + tip metinleri denetlenir; F1/F1.1/F1.2 merged migration DEĞİŞMEZLİĞİ (LF-sha256)
 * regresyon olarak sabitlenir. Migration/production APPLY YOK. Herhangi bir FAIL → exit 1.
 *
 * Çalıştır:  npx tsx scripts/hd-consultation/f2-1-draft-edit-harness.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");
const stripSql = (s) => s.replace(/^\s*--.*$/gm, "");
const stripTs = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const shaLF = (p) => createHash("sha256").update(read(p).replace(/\r\n/g, "\n"), "utf8").digest("hex");

const M = "supabase/migrations/";
const NEW = `${M}20260930000000_hd_consultation_edit_draft.sql`;
const FDN = `${M}20260925000000_hd_consultation_layer_foundation.sql`;
const COR = `${M}20260926000000_hd_consultation_create_bundle_fix.sql`;
const F12 = `${M}20260928000000_hd_consultation_hash_helper_acl_fix.sql`;

// F1/F1.1/F1.2 merged migration kanonik LF-sha256 (DEĞİŞMEZ olmalı).
const FDN_SHA = "604f12ce61c054f071f47ecf1a19a1dbcc8e9fb1b3e60a71eee2ab521fcd7d9e";
const COR_SHA = "af072e5a26ddda624b2354fb316a83cfb912b0ac4ae8f740e6ed75f8c815f481";
const F12_SHA = "9a04d6c7c784481fb61608016119a479c0d48511b325c00d409a47888dd9749d";

const F = {
  migration: NEW,
  service: "lib/human-design/consultation/admin/consultationAdminService.ts",
  types: "lib/human-design/consultation/admin/consultationAdminTypes.ts",
  errHttp: "lib/human-design/consultation/admin/consultationErrorHttp.ts",
  editInput: "lib/human-design/consultation/editInput.ts",
  createInput: "lib/human-design/consultation/createInput.ts",
  routeId: "app/api/admin/hd/consultation/[id]/route.ts",
  routeEvidence: "app/api/admin/hd/consultation/canonical-evidence/route.ts",
  routeMain: "app/api/admin/hd/consultation/route.ts",
  workspace: "app/admin/hd-danismanlik/ConsultationWorkspace.tsx",
};
const raw = {};
for (const [k, p] of Object.entries(F)) raw[k] = read(p);
const mig = stripSql(raw.migration);
const svc = stripTs(raw.service);
const editIn = stripTs(raw.editInput);
const rId = stripTs(raw.routeId);
const rEv = stripTs(raw.routeEvidence);
const ws = stripTs(raw.workspace);

let pass = 0, fail = 0; const fails = [];
const check = (d, c) => { if (c) pass++; else { fail++; fails.push(d); console.log(`  FAIL  ${d}`); } };

console.log("── A: Migration / RPC (additif; DDL yok; SECURITY DEFINER; ACL) ──");
check("A1. yeni migration mevcut + BEGIN/COMMIT", /BEGIN;/.test(raw.migration) && /COMMIT;/.test(raw.migration));
check("A2. rpc_hd_consultation_edit_draft tanımı (CREATE OR REPLACE FUNCTION)", /CREATE OR REPLACE FUNCTION public\.rpc_hd_consultation_edit_draft\(/.test(mig));
check("A3. SECURITY DEFINER + SET search_path=public", /SECURITY DEFINER SET search_path = public/.test(mig));
check("A4. dinamik SQL / EXECUTE format YOK", !/EXECUTE\s+format|EXECUTE\s+'|EXECUTE\s+"/.test(mig));
check("A5. tablo/kolon/index/constraint DDL YOK (CREATE TABLE / ALTER TABLE / CREATE INDEX / ADD CONSTRAINT / DROP)",
  !/CREATE TABLE|ALTER TABLE|CREATE\s+(UNIQUE\s+)?INDEX|ADD CONSTRAINT|DROP TABLE|DROP INDEX|DROP CONSTRAINT/i.test(mig));
check("A6. seed/DML YOK (INSERT yalnız izinli RPC hedef tabloları; standalone seed yok)",
  (() => {
    const allowed = new Set([
      "hd_consultation_sections", "hd_consultation_questions", "hd_consultation_conditions",
      "hd_consultation_evidence", "hd_content_audit_events",
    ]);
    const targets = [...mig.matchAll(/INSERT INTO public\.(\w+)/g)].map((m) => m[1]);
    return targets.length > 0 && targets.every((t) => allowed.has(t));
  })());
check("A7. EXECUTE ACL: public/anon/authenticated REVOKE",
  /REVOKE ALL ON FUNCTION public\.rpc_hd_consultation_edit_draft\([^)]*\) FROM PUBLIC;/.test(mig)
  && /FROM anon;/.test(mig) && /FROM authenticated;/.test(mig));
check("A8. yalnız service_role GRANT EXECUTE", /GRANT EXECUTE ON FUNCTION public\.rpc_hd_consultation_edit_draft\([^)]*\) TO service_role;/.test(mig));
check("A9. hash helper ACL'sine DOKUNULMAZ (hd_consultation_canonical_hash yok)", !/hd_consultation_canonical_hash/.test(mig));
check("A10. one-active index DOKUNULMAZ", !/hd_cc_one_active_per_entity_uidx/.test(mig));
check("A11. exact imza (uuid,uuid,integer,jsonb,jsonb,jsonb)", /rpc_hd_consultation_edit_draft\(uuid,uuid,integer,jsonb,jsonb,jsonb\)/.test(mig));

console.log("── B: Draft-only guard (fail-loud) ──");
check("B1. status <> 'draft' → RAISE (yalnız taslak)", /v_status <> 'draft'/.test(mig) && /HD_CONSULTATION_NOT_DRAFT/.test(mig));
check("B2. archived → ayrı RAISE", /v_status = 'archived'/.test(mig) && /archived içerik düzenlenemez/.test(mig));
check("B3. expert notes güvenlik ağı (RESTRICT'ten önce temiz kod)", /hd_consultation_expert_notes/.test(mig) && /HD_CONSULTATION_HAS_EXPERT_NOTES/.test(mig));

console.log("── C: Concurrency / version ──");
check("C1. content FOR UPDATE kilidi", /FROM public\.hd_consultation_contents WHERE id = p_content_id FOR UPDATE/.test(mig));
check("C2. expected_version stale reject", /p_expected_version IS NULL OR p_expected_version <> v_cur/.test(mig) && /stale version/.test(mig));
check("C3. content.version +1", /v_new := v_cur \+ 1/.test(mig) && /SET version = v_new/.test(mig));

console.log("── D: Canonical pin korunumu ──");
check("D1. canonical_content_id/version/hash UPDATE edilmez (pin dokunulmaz)",
  !/SET[^;]*canonical_content_(id|version|hash)/.test(mig));
check("D2. is_ai_generated edit ile değişmez (yalnız version update)", !/SET[^;]*is_ai_generated/.test(mig));
check("D3. client pin/version spoof yok (edit RPC pin parametresi almaz)", !/p_canonical_content_id|p_canonical_content_hash|p_repin/.test(mig));

console.log("── E: Nested body parity (F1.1 create ile aynı sözleşme) ──");
check("E1. content_id kapsamında delete (evidence/questions/conditions/sections)",
  /DELETE FROM public\.hd_consultation_evidence   WHERE content_id = p_content_id/.test(mig)
  && /DELETE FROM public\.hd_consultation_questions/.test(mig)
  && /DELETE FROM public\.hd_consultation_conditions/.test(mig)
  && /DELETE FROM public\.hd_consultation_sections/.test(mig));
check("E2. content satırı SİLİNMEZ", !/DELETE FROM public\.hd_consultation_contents/.test(mig));
check("E3. section INSERT ... RETURNING id (client section_id GÖNDERMEZ)", /INSERT INTO public\.hd_consultation_sections[\s\S]*RETURNING id INTO v_sec_id/.test(mig));
check("E4. client_ref zorunlu + duplicate reddi", /client_ref zorunlu/.test(mig) && /duplicate client_ref/.test(mig));
check("E5. nested questions/conditions/evidence GERÇEK v_sec_id'ye bağlanır", /VALUES \(p_content_id, v_sec_id,/.test(mig));
check("E6. condition canonical registry doğrulaması (create ile aynı)", /hd_canonical_entities e/.test(mig) && /canonical registry ile doğrulanamadı/.test(mig));
check("E7. content-düzeyi (section_id NULL) questions/conditions", /VALUES \(p_content_id, NULL,/.test(mig));
check("E8. ikinci doğrulama motoru YOK (registry SQL create ile aynı; TS resolver reuse)", /CASE \(v_child->>'condition_kind'\)/.test(mig));

console.log("── F: Validation (create ile parite) ──");
check("F1. condition_kind whitelist (4)", /NOT IN \('type_is','authority_is','has_channel','has_gate'\)/.test(mig));
check("F2. editInput duplicate/empty clientRef + empty body reddi",
  /duplicate clientRef/.test(editIn) && /clientRef zorunlu/.test(editIn) && /bodyText boş olamaz/.test(editIn));
check("F3. expectedVersion pozitif int zorunlu", /expectedVersion \(pozitif tam sayı\) zorunlu/.test(editIn));
check("F4. section_kind/usage_scope whitelist DB CHECK'lerine güvenir (create input tipleri reuse)",
  /HdConsultationSectionCreateInput/.test(raw.editInput) && /from "\.\/createInput"/.test(raw.editInput));

console.log("── G: Atomiklik / audit ──");
check("G1. tek fonksiyon = tek txn (BEGIN...COMMIT içinde tek CREATE FUNCTION)", (raw.migration.match(/CREATE OR REPLACE FUNCTION/g) || []).length === 1);
check("G2. audit aynı txn (INSERT INTO hd_content_audit_events)", /INSERT INTO public\.hd_content_audit_events/.test(mig));
check("G3. audit action 'updated' + resource consultation_content", /'updated', 'consultation_content'/.test(mig));
check("G4. audit tam metin YOK (yalnız changed_fields + sayımlar)",
  /changed_fields[\s\S]*'sections','questions','conditions','evidence'/.test(mig)
  && /section_count[\s\S]*question_count[\s\S]*condition_count[\s\S]*evidence_count/.test(mig)
  && !/body_text.*audit|audit.*body_text/.test(mig));
check("G5. RETURN deterministik (content_id + version + section_map + sayımlar; tam body YOK)",
  /RETURN jsonb_build_object\([\s\S]*'content_id'[\s\S]*'section_map'[\s\S]*'evidence_count'/.test(mig));

console.log("── H: Service / API PUT + Canonical Evidence GET ──");
check("H1. editDraftConsultation → yalnız rpc_hd_consultation_edit_draft", /db\.rpc\("rpc_hd_consultation_edit_draft"/.test(svc));
check("H2. edit doğrudan tablo UPDATE/DELETE/INSERT YAPMAZ",
  !/\.from\("hd_consultation_(sections|questions|conditions|evidence)"\)\.(update|delete|insert)/.test(svc));
check("H3. edit actor guard'dan (p_actor_admin_id: actorAdminId)", /p_actor_admin_id: actorAdminId/.test(svc));
check("H4. edit expected_version RPC'ye geçer", /p_expected_version: input\.expectedVersion/.test(svc));
check("H5. PUT route mevcut + verifyAdminRequest ilk + guard.response",
  /export async function PUT\(/.test(rId) && /const guard = await verifyAdminRequest\(req\)/.test(rId) && /if \(!guard\.ok\) return guard\.response/.test(rId));
check("H6. PUT actor gövdeden ALINMAZ (guard.adminId geçer)", /editDraftConsultation\(guard\.db, guard\.adminId/.test(rId));
check("H7. PATCH sözleşmesi KIRILMAZ (is_ai_generated + repin hâlâ var)", /rpc_hd_consultation_update|updateConsultation/.test(rId) && /repin/.test(rId));
check("H8. hard DELETE route YOK ([id] route'ta DELETE handler yok)", !/export async function DELETE\(/.test(rId));
check("H9. canonical-evidence GET route + admin auth + entityId scoped",
  /export async function GET\(/.test(rEv) && /verifyAdminRequest/.test(rEv) && /entityId/.test(rEv) && /getCanonicalEvidencePool/.test(rEv));
check("H10. pool entity→canonical content→hd_content_evidence→passages→sources",
  /hd_canonical_content/.test(svc) && /hd_content_evidence/.test(svc) && /hd_source_passages/.test(svc) && /hd_sources/.test(svc));
check("H11. pool cross-entity sızıntı yok (content_id = canonicalContentId ile scope)", /eq\("content_id", canonicalContentId\)/.test(svc));
check("H12. rights resolver REUSE (ikinci engine yok)", /resolveEffectiveRights/.test(svc) && /evaluateProductRights/.test(svc) && !/function resolveEffectiveRights/.test(raw.service));
check("H13. pool effective rights + override + relation + locator taşınır", /effective:/.test(svc) && /hasOverride/.test(svc) && /canonicalRelationType/.test(svc) && /locatorLabel/.test(svc));
check("H14. pool tam original/source metni taşımaz", !/original_text|report_text|general_description/.test(raw.service));
check("H15. pool canonical yoksa boş havuz (deny-by-omission)", /canonicalContentId: null, candidates: \[\]/.test(svc));
check("H16. NOT_DRAFT/HAS_EXPERT_NOTES kodları + 409 map + Türkçe mesaj",
  /NOT_DRAFT/.test(raw.types) && /HAS_EXPERT_NOTES/.test(raw.types)
  && /case "NOT_DRAFT":\s*\n?\s*case "HAS_EXPERT_NOTES": return 409;/.test(raw.errHttp)
  && /Yalnız taslak içerik düzenlenebilir/.test(raw.errHttp));
check("H17. edit ham DB error sızdırmaz (classify + generic mesaj)", /classifyRpcError\(error\)/.test(svc) && /Taslak düzenlenemedi/.test(svc));

console.log("── I: UI draft edit / evidence UX / no out-of-scope ──");
check("I1. draft → DraftBodyEditor (editable)", /DraftBodyEditor/.test(ws) && /isDraft \?/.test(ws));
check("I2. published/archived → ReadOnlyBody + immutable açıklama", /ReadOnlyBody/.test(ws) && /salt-okunurdur/.test(ws));
check("I3. explicit Kaydet (PUT) + autosave YOK", /hdSend<\{ version: number \}>\("PUT", `consultation\/\$\{detail\.id\}`/.test(ws) && !/autosave|setInterval|debounce/i.test(ws));
check("I4. dirty-state göstergesi", /dirty/.test(ws) && /Kaydedilmemiş değişiklik/.test(ws));
check("I5. unsaved navigation uyarısı (beforeunload)", /addEventListener\("beforeunload"/.test(ws));
check("I6. section add/remove + q/c/e edit (BodyEditor reuse; SectionEditor)", /BodyEditor/.test(ws) && /SectionEditor/.test(ws) && /EvidenceEditor/.test(ws));
check("I7. evidence picker iki sekme: Canonical (default) + Global", /Canonical Kanıtlar/.test(ws) && /Tüm HD Kaynaklarında Ara/.test(ws) && /useState<"canonical" \| "global">\("canonical"\)/.test(ws));
check("I8. canonical havuz otomatik kopya değil (onPick ile açık ekleme)", /onPick\(\{/.test(ws) && /consultation\/canonical-evidence\?entityId=/.test(ws));
check("I9. eski 'değiştirilemez' turuncu notu KALDIRILDI (draft için)", !/oluşturulduktan sonra değiştirilemez/.test(raw.workspace));
check("I10. canlı AI drafting YOK", !/openai|anthropic|\bclaude\b|\bgpt\b|summariz|auto-?draft|ai-?draft/i.test(ws));
check("I11. F3/entitlement/Bilgileri Getir/Word/session KODU YOK", !/entitlement|Bilgileri Getir|\bdocx\b|report snapshot|\bsession\b/i.test(ws));
check("I12. hard delete UI YOK (hiç DELETE çağrısı yok; yalnız POST archive)",
  !/hdSend[^)]*"DELETE"/i.test(ws) && !/method:\s*"DELETE"/i.test(ws) && /"POST", `consultation\/\$\{contentId\}\/archive`/.test(ws));

console.log("── J: Regresyon — F1/F1.1/F1.2 merged migration DEĞİŞMEZLİĞİ ──");
check("J1. F1 foundation LF-sha256 sabit", shaLF(FDN) === FDN_SHA);
check("J2. F1.1 create bundle LF-sha256 sabit", shaLF(COR) === COR_SHA);
check("J3. F1.2 hash helper acl LF-sha256 sabit", shaLF(F12) === F12_SHA);
check("J4. mevcut 6 RPC yeni migration'da yeniden tanımlanmaz (yalnız edit_draft)",
  !/rpc_hd_consultation_(create|update|publish|archive|entitlement_grant|entitlement_revoke)\b/.test(mig));

console.log(`\nf2-1-draft-edit-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
