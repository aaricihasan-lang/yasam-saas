/**
 * HD Danışmanlık F1.1 · Atomik Create Bundle — statik & parite harness
 * ====================================================================
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. Corrective migration SQL metni + F0B/F1.1
 * TypeScript create-input sözleşmesi (parite). Herhangi bir FAIL → exit 1.
 *
 * Çalıştır:  npx tsx scripts/hd-consultation/f1-1-create-bundle-harness.mjs
 */
import { readFileSync } from "node:fs";
import { validateConsultationCreateInput } from "@/lib/human-design/consultation/createInput";

const ROOT = process.cwd();
const CORR = "supabase/migrations/20260926000000_hd_consultation_create_bundle_fix.sql";
const MERGED = "supabase/migrations/20260925000000_hd_consultation_layer_foundation.sql";
const raw = readFileSync(`${ROOT}/${CORR}`, "utf8");
const sql = raw.replace(/^\s*--.*$/gm, "");            // yorum-strip (sahte PASS engeli)
const merged = readFileSync(`${ROOT}/${MERGED}`, "utf8");
// create fonksiyon gövdesi (yeni)
const fn = /CREATE OR REPLACE FUNCTION public\.rpc_hd_consultation_create[\s\S]*?\$fn\$([\s\S]*?)\$fn\$/.exec(sql)?.[1] || "";
const sig = /rpc_hd_consultation_create\(([\s\S]*?)\) RETURNS/.exec(sql)?.[1] || "";

let pass = 0, fail = 0; const fails = [];
function check(d, c) { if (c) pass++; else { fail++; fails.push(d); console.log(`  FAIL  ${d}`); } }

console.log("── A: migration sözleşmesi & kapsam ──");
check("A1. corrective migration mevcut", raw.length > 0);
check("A2. merged migration DEĞİŞMEDİ (eski 8-param create + p_evidence duruyor)",
  /rpc_hd_consultation_create\(\s*[\s\S]*?p_evidence\s+jsonb[\s\S]*?\)\s*RETURNS uuid/.test(merged));
check("A3. timestamp benzersiz ad (20260926 create_bundle_fix)", CORR.includes("20260926000000_hd_consultation_create_bundle_fix"));
check("A4. yalnız create kapsamı — CREATE OR REPLACE FUNCTION x1", (sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length === 1);
check("A5. yalnız create — CREATE TABLE yok", !/CREATE TABLE/.test(sql));
check("A6. diğer 5 RPC/ helper YENİDEN TANIMLANMIYOR", !/FUNCTION public\.(rpc_hd_consultation_update|rpc_hd_consultation_publish|rpc_hd_consultation_archive|rpc_hd_consultation_entitlement_grant|rpc_hd_consultation_entitlement_revoke|hd_consultation_canonical_hash)\b/.test(sql));
check("A7. eski 8-param imza DROP ediliyor (overload bırakmıyor)",
  /DROP FUNCTION public\.rpc_hd_consultation_create\(uuid, ?uuid, ?uuid, ?boolean, ?jsonb, ?jsonb, ?jsonb, ?jsonb\)/.test(sql));
check("A8. DROP TABLE yok (destructive DOWN yok)", !/DROP TABLE/i.test(sql));
check("A9. production DML/seed yok (mevcut veri INSERT/UPDATE yok — audit hariç fn içi)",
  !/INSERT INTO public\.hd_canonical|UPDATE public\.hd_canonical|INSERT INTO public\.hd_sources\b|DELETE FROM/.test(sql));
check("A10. dinamik SQL yok (fn gövdesinde EXECUTE/format yok)", !/\bEXECUTE\b|format\(/.test(fn));
check("A11. SECURITY DEFINER + search_path=public", /SECURITY DEFINER SET search_path = public/.test(sql));
check("A12. açık BEGIN/COMMIT", /^BEGIN;/m.test(sql) && /^COMMIT;/m.test(sql));

console.log("── B: EXECUTE ACL (yeni 7-param imza) ──");
const NEWSIG = "rpc_hd_consultation_create(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb)";
check("B1. REVOKE public/anon/authenticated", ["PUBLIC","anon","authenticated"].every(r => new RegExp(`REVOKE ALL ON FUNCTION public\\.${NEWSIG.replace(/[()]/g,"\\$&")} FROM ${r}`).test(sql)));
check("B2. GRANT EXECUTE service_role", new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${NEWSIG.replace(/[()]/g,"\\$&")} TO service_role`).test(sql));

console.log("── C: atomik nested create yapısı ──");
check("C1. yeni imza 7-param (top-level p_evidence YOK)", /p_sections/.test(sig) && /p_content_questions/.test(sig) && /p_content_conditions/.test(sig) && !/p_evidence/.test(sig));
check("C2. RETURNS jsonb (mapping+sayım için)", /\) RETURNS jsonb/.test(sql));
check("C3. section INSERT ... RETURNING id INTO v_sec_id", /INSERT INTO public\.hd_consultation_sections[\s\S]*?RETURNING id INTO v_sec_id/.test(fn));
check("C4. nested questions/conditions/evidence loop (v_sec->...)", /v_sec->'questions'/.test(fn) && /v_sec->'conditions'/.test(fn) && /v_sec->'evidence'/.test(fn));
check("C5. evidence GERÇEK section id'ye bağlanır (v_sec_id; istemci section_id YOK)",
  /INSERT INTO public\.hd_consultation_evidence[\s\S]*?v_content, v_sec_id,/.test(fn) && !/evidence[\s\S]{0,400}v_child->>'section_id'/.test(fn));
check("C6. client_ref zorunlu + trim boş reddi", /client_ref zorunlu \(trim boş olamaz\)/.test(fn));
check("C7. çağrı-içi duplicate client_ref reddi", /duplicate client_ref/.test(fn) && /v_ref = ANY\(v_refs\)/.test(fn));
check("C8. section_map + sayımlar döner", /'section_map', v_map/.test(fn) && /'section_count', v_n_sec/.test(fn) && /'evidence_count', v_n_e/.test(fn));
check("C9. content-düzeyi questions/conditions (section_id NULL)", /v_content, NULL, v_child->>'question_text'/.test(fn) && /v_content, NULL, v_child->>'condition_kind'/.test(fn));
check("C10. condition canonical registry doğrulaması (nested+content)", (fn.match(/canonical registry ile doğrulanamadı/g) || []).length >= 2);

console.log("── D: güvenlik regresyon (korunuyor) ──");
check("D1. actor_admin_id ayrı param (payload'dan değil)", /^\s*p_actor_admin_id\s+uuid/m.test(sig) && /p_actor_admin_id IS NULL THEN RAISE/.test(fn));
check("D2. canonical version DB'den FOR SHARE", /SELECT version INTO v_ccver FROM public\.hd_canonical_content[\s\S]*?FOR SHARE/.test(fn));
check("D3. canonical hash DB helper ile (payload'dan değil)", /v_cchash := public\.hd_consultation_canonical_hash\(p_canonical_content_id\)/.test(fn) && !/p_canonical_content_hash/.test(sql));
check("D4. status başlangıçta draft", /'draft', 1, COALESCE\(p_is_ai_generated, false\)/.test(fn));
check("D5. audit tam metin YOK (context yalnız sayım)", /jsonb_build_object\('section_count'/.test(fn) && !/context[\s\S]{0,120}(body_text|report_text|v_cchash)/.test(sql));
check("D6. section_id spoof imkânsız (imzada/child'da istemci section_id yok)", !/section_id/.test(sig) && !/v_child->>'section_id'/.test(fn));

console.log("── E: F0B/F1.1 TypeScript create-input paritesi ──");
check("E1. geçerli input → 0 problem", validateConsultationCreateInput({ entityId: "e", sections: [{ clientRef: "quick_reference_1", sectionKind: "quick_reference", bodyText: "m", usageScope: "both" }] }).length === 0);
check("E2. duplicate clientRef → problem", validateConsultationCreateInput({ entityId: "e", sections: [
  { clientRef: "a", sectionKind: "quick_reference", bodyText: "m", usageScope: "both" },
  { clientRef: "a", sectionKind: "client_explanation", bodyText: "m", usageScope: "both" }] }).some(p => p.includes("duplicate")));
check("E3. boş clientRef → problem", validateConsultationCreateInput({ entityId: "e", sections: [{ clientRef: "  ", sectionKind: "quick_reference", bodyText: "m", usageScope: "both" }] }).some(p => p.includes("clientRef")));
check("E4. boş bodyText → problem", validateConsultationCreateInput({ entityId: "e", sections: [{ clientRef: "x", sectionKind: "quick_reference", bodyText: "  ", usageScope: "both" }] }).some(p => p.includes("bodyText")));
check("E5. entityId yok → problem", validateConsultationCreateInput({ entityId: "", sections: [] }).some(p => p.includes("entityId")));
check("E6. SQL/TS client_ref modeli paritesi (SQL 'client_ref' + 'section_map')", /client_ref/.test(fn) && /section_map/.test(fn));

console.log(`\nf1-1-create-bundle-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
