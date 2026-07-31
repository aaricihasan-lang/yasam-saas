/**
 * BF-11F-B — provisioning integrity migration STATİK SÖZLEŞME harness.
 * ====================================================================
 * DB'SİZ, AĞ'SIZ. Migration SQL metnini statik doğrular. FAIL → exit 1.
 * Çalıştır: node scripts/yh-provisioning-integrity-migration-harness.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = readFileSync(join(root, "supabase/migrations/20260910000000_provisioning_integrity.sql"), "utf8");

let pass = 0, fail = 0; const fails = [];
const ck = (c, d, cond) => { if (cond) pass++; else { fail++; fails.push(`[${c}] ${d}`); console.error(`  FAIL [${c}] ${d}`); } };

// ── timestamp / ordering ──
ck("mig", "timestamp 20260910000000", M.includes("20260910000000_provisioning_integrity"));
ck("mig", "audit foundation 20260903000000'dan sonra (bağımlılık notu)", /20260903000000/.test(M));
ck("mig", "BEGIN/COMMIT", /^\s*BEGIN;/m.test(M) && /COMMIT;/.test(M));

// ── baseline / mevcut nesne koruması ──
ck("safe", "baseline CREATE TABLE users YOK", !/CREATE TABLE (IF NOT EXISTS )?public\.users\b/i.test(M));
ck("safe", "baseline CREATE TABLE tenants YOK", !/CREATE TABLE (IF NOT EXISTS )?public\.tenants\b/i.test(M));
ck("safe", "admin_audit_log tablosu yeniden oluşturulmuyor", !/CREATE TABLE (IF NOT EXISTS )?public\.admin_audit_log/i.test(M));
ck("safe", "mevcut UNIQUE/PK/FK yeniden oluşturulmuyor", !/(CREATE UNIQUE INDEX|ADD CONSTRAINT).*(users_email_key|users_pkey|users_tenant_id_fkey|tenants_pkey|tenants_slug_key)/i.test(M));
ck("safe", "legacy password kolonuna INSERT/yazım YOK", !/\bpassword\b(?!_hash)/.test(M.replace(/--.*$/gm, "")) === false ? !/INSERT INTO public\.users\([^)]*\bpassword\b[^_]/i.test(M) : true);
ck("safe", "yasam_hafizasi_flags yazımı YOK (kod; yorum hariç)", !/(INSERT INTO|UPDATE|UPSERT)[^;]*yasam_hafizasi_flags/i.test(M));
ck("safe", "dynamic SQL (EXECUTE format) YOK", !/EXECUTE\s+format|EXECUTE\s+'/i.test(M));

// ── fail-closed schema gate ──
ck("gate", "users yoksa RAISE", /public\.users. IS NULL[\s\S]*?RAISE EXCEPTION/.test(M) || /to_regclass\('public\.users'\) IS NULL[\s\S]*?RAISE/.test(M));
ck("gate", "admin_audit_log yoksa RAISE (bağımlılık)", /to_regclass\('public\.admin_audit_log'\) IS NULL[\s\S]*?RAISE EXCEPTION/.test(M));
ck("gate", "users_email_key yoksa RAISE", /users_email_key[\s\S]*?RAISE EXCEPTION/.test(M));
ck("gate", "tenant FK yoksa RAISE", /tenant_id%tenants[\s\S]*?RAISE EXCEPTION/.test(M));
ck("gate", "tenants_slug_key yoksa RAISE", /tenants_slug_key[\s\S]*?RAISE EXCEPTION/.test(M));
ck("gate", "normalized email duplicate varsa RAISE", /lower\(btrim\(email\)\)[\s\S]*?count\(\*\)>1[\s\S]*?RAISE EXCEPTION/.test(M));
ck("gate", "invalid role varsa RAISE", /role NOT IN \('admin','expert'\)[\s\S]*?RAISE EXCEPTION/.test(M));

// ── normalized email unique + role CHECK (NULL invariant) ──
ck("uniq", "normalized email UNIQUE index lower(btrim(email))", /CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_uidx[\s\S]*?lower\(btrim\(email\)\)/.test(M));
ck("role", "role CHECK NULL invariant (IS NOT NULL AND allowlist)", /users_role_allowlist_chk[\s\S]*?CHECK \(role IS NOT NULL AND role IN \('admin','expert'\)\)/.test(M));
ck("role", "role CHECK: admin kabul (allowlist içerir)", /role IS NOT NULL AND role IN \('admin','expert'\)/.test(M) && /'admin'/.test(M));
ck("role", "role CHECK: expert kabul (allowlist içerir)", /role IN \('admin','expert'\)/.test(M));
ck("role", "role CHECK: null rol reddi (IS NOT NULL şartı zorunlu)", /CHECK \(role IS NOT NULL/.test(M));
ck("role", "role CHECK: başka rol reddi (allowlist yalnız admin/expert)", /role IN \('admin','expert'\)/.test(M) && !/role IN \('admin','expert','[a-z]/.test(M));

// ── provisioning_events ──
ck("pe", "provisioning_events tablo", /CREATE TABLE IF NOT EXISTS public\.provisioning_events/.test(M));
ck("pe", "request_id UNIQUE (idempotency)", /request_id\s+uuid\s+NOT NULL UNIQUE/.test(M));
ck("pe", "origin CHECK public_register/admin_create", /origin\s+IN \('public_register','admin_create'\)/.test(M));
ck("pe", "outcome CHECK provisioned/already_exists/conflict", /outcome IN \('provisioned','already_exists','conflict'\)/.test(M));
ck("pe", "FK ON DELETE SET NULL (audit kanıtı korunur)", /target_user_id[\s\S]*?ON DELETE SET NULL/.test(M) && /target_tenant_id[\s\S]*?ON DELETE SET NULL/.test(M));
ck("pe", "append-only trigger (update/delete engel)", /provisioning_events_prevent_mutation[\s\S]*?RAISE EXCEPTION/.test(M) && /BEFORE UPDATE ON public\.provisioning_events/.test(M) && /BEFORE DELETE ON public\.provisioning_events/.test(M));
ck("pe", "RLS enabled + service_role policy", /ALTER TABLE public\.provisioning_events ENABLE ROW LEVEL SECURITY/.test(M) && /service_role_provisioning_events/.test(M));
ck("pe", "REVOKE anon/authenticated/service_role + GRANT service_role SELECT,INSERT", /REVOKE ALL ON TABLE public\.provisioning_events FROM anon, authenticated, service_role/.test(M) && /GRANT SELECT, INSERT ON TABLE public\.provisioning_events TO service_role/.test(M));

// ── provision_expert RPC ──
ck("rpc", "CREATE OR REPLACE FUNCTION provision_expert(jsonb)", /CREATE OR REPLACE FUNCTION public\.provision_expert\(p_payload jsonb\)/.test(M));
ck("rpc", "SECURITY DEFINER + search_path pg_catalog ÖNCE", /SECURITY DEFINER/.test(M) && /SET search_path = pg_catalog, public/.test(M));
ck("sp", "provision_expert: public search_path'in İLK öğesi DEĞİL", !/provision_expert[\s\S]*?SET search_path = public\b/.test(M) && !/SET search_path = public,/.test(M));
ck("sp", "prevent_mutation trigger fn: SET search_path = pg_catalog", /provisioning_events_prevent_mutation\(\)\s*\nRETURNS trigger LANGUAGE plpgsql\s*\nSET search_path = pg_catalog/.test(M));
ck("sp", "hiçbir fonksiyonda 'public' ilk search_path öğesi değil", !/SET search_path = public(\b|,)/.test(M));
// Schema-qualification: gövdedeki tüm UYGULAMA nesneleri public.-nitelikli (builtin'ler pg_catalog-öncelikli çözülür).
ck("sp", "app nesneleri schema-qualified: users/tenants/admin_audit_log/provisioning_events yalnız public.", (() => {
  // provision_expert gövdesini izole et
  const body = (M.match(/AS \$fn\$([\s\S]*?)\$fn\$/) || [,""])[1];
  // Nitelenmemiş tablo referansı (FROM/INTO/UPDATE/INSERT INTO/JOIN) — public. olmadan users/tenants/admin_audit_log/provisioning_events
  const bad = /\b(FROM|INTO|UPDATE|JOIN|INSERT INTO)\s+(?!public\.)(users|tenants|admin_audit_log|provisioning_events)\b/i.test(body);
  return !bad;
})());
ck("rpc", "service_role-only EXECUTE (revoke public/anon/authenticated)", /REVOKE ALL ON FUNCTION public\.provision_expert\(jsonb\) FROM PUBLIC, anon, authenticated/.test(M) && /GRANT EXECUTE ON FUNCTION public\.provision_expert\(jsonb\) TO service_role/.test(M));
ck("rpc", "mode allowlist public/admin", /v_mode NOT IN \('public','admin'\)[\s\S]*?RAISE EXCEPTION/.test(M));
ck("rpc", "email lower(btrim())", /lower\(btrim\(coalesce\(p_payload->>'email',''\)\)\)/.test(M));
ck("rpc", "password_hash zorunlu", /password_hash zorunlu/.test(M));
ck("rpc", "public mode server-forced expert/false/pending", /v_role := 'expert'; v_active := false; v_approval := 'pending'/.test(M));
ck("rpc", "admin mode role admin/expert allowlist", /CASE WHEN \(p_payload->>'role'\) = 'admin' THEN 'admin' ELSE 'expert' END/.test(M));
ck("rpc", "admin actor_admin_id zorunlu", /admin mode actor_admin_id zorunlu/.test(M));
ck("rpc", "admin actor defense (role=admin + active)", /v_actor_role IS DISTINCT FROM 'admin' OR v_actor_active IS NOT TRUE[\s\S]*?RAISE EXCEPTION/.test(M));
ck("rpc", "module_permissions object doğrulaması", /jsonb_typeof\(v_modperms\) <> 'object'[\s\S]*?RAISE EXCEPTION/.test(M));
ck("rpc", "demo/sentetik tenant guard (üretilen)", /v_tenant_id IN \(c_demo, c_synth\)[\s\S]*?RAISE EXCEPTION/.test(M) && /40f842a0-e3e8-448c-8971-9a938e1faccb/.test(M) && /aa8b960b-f4f1-4e5b-89f5-109bc030c147/.test(M));
ck("rpc", "idempotency lookup (request_id)", /FROM public\.provisioning_events pe WHERE pe\.request_id = v_reqid/.test(M) && /idempotent_replay/.test(M));
ck("idem", "bind_digest hesaplanır (mode/role/active/approval/modperms)", /v_bind_digest := md5\([\s\S]*?v_mode[\s\S]*?v_role[\s\S]*?v_active[\s\S]*?v_approval[\s\S]*?md5\(v_modperms::text\)/.test(M));
ck("idem", "bind_digest e-posta/hash İÇERMEZ (PII yasağı)", (() => {
  const d = (M.match(/v_bind_digest := md5\(([\s\S]*?)\);/) || [,""])[1];
  return !/v_email|email|pwhash|password/i.test(d);
})());
ck("idem", "eşdeğerlik kapısı: origin + bind_digest + target email", /v_prior_origin IS NOT DISTINCT FROM v_origin[\s\S]*?bind_digest'\) IS NOT DISTINCT FROM v_bind_digest[\s\S]*?v_target_email = v_email/.test(M));
ck("idem", "farklı payload/silinmiş target → idempotency_key_conflict (MUTASYONSUZ)", /'outcome', 'idempotency_key_conflict'/.test(M));
ck("idem", "target email prior target_user_id üzerinden okunur", /SELECT lower\(btrim\(email\)\) INTO v_target_email FROM public\.users WHERE id = v_prior_uid/.test(M));
ck("idem", "conflict yolunda yeni event/audit/tenant/user INSERT YOK (return öncesi)", (() => {
  // conflict RETURN'dan önceki bloğun içinde INSERT olmamalı
  const seg = (M.match(/IF v_prior_found THEN([\s\S]*?)END IF;\s*\n\s*-- Duplicate/) || [,""])[1];
  return !/INSERT INTO/i.test(seg);
})());
ck("idem", "provisioning_events metadata bind_digest yazılır (replay için)", /jsonb_build_object\('mode', v_mode[\s\S]*?'bind_digest', v_bind_digest\)/.test(M));
ck("rpc", "email pre-check → already_exists (tenant oluşturmadan)", /SELECT id INTO v_existing FROM public\.users WHERE lower\(btrim\(email\)\) = v_email[\s\S]*?already_exists/.test(M));
ck("rpc", "slug race-safe bounded loop + UNIQUE otorite", /FOR i IN 1\.\.5 LOOP[\s\S]*?unique_violation[\s\S]*?CONTINUE/.test(M));
ck("rpc", "email yarışı → tenant DELETE (ORPHAN YOK)", /EXCEPTION WHEN unique_violation THEN[\s\S]*?DELETE FROM public\.tenants WHERE id = v_tenant_id/.test(M));
ck("rpc", "admin audit user_created (aynı transaction)", /INSERT INTO public\.admin_audit_log[\s\S]*?'user_created'/.test(M));
ck("rpc", "audit new_value PII-DIŞI (email/name yok)", !/admin_audit_log[\s\S]{0,400}(v_email|v_fullname)/.test(M));
ck("rpc", "provisioning_events yazımı (her mod)", /INSERT INTO public\.provisioning_events\(request_id, origin, outcome, target_user_id, target_tenant_id/.test(M));
ck("rpc", "expert INSERT module_permissions + trial", /IF v_role = 'expert' THEN[\s\S]*?module_permissions, tenant_id, plan, subscription_status, trial_started_at, trial_ends_at/.test(M));
ck("rpc", "admin INSERT DB default'lara bırakır (module/trial yok)", /ELSE[\s\S]*?INSERT INTO public\.users\([\s\S]*?role, active, approval_status, tenant_id\s*\)/.test(M));
ck("rpc", "return PII-DIŞI (email/name/hash yok)", !/RETURN jsonb_build_object[\s\S]{0,300}(v_email|v_fullname|v_pwhash|password)/.test(M));

console.log("");
if (fail > 0) { console.error(`yh-provisioning-integrity-migration-harness: ${pass}/${pass + fail} PASS — ${fail} FAIL`); for (const f of fails) console.error("  - " + f); process.exit(1); }
console.log(`yh-provisioning-integrity-migration-harness: ${pass}/${pass} PASS`);
