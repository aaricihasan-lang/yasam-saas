/**
 * Yaşam Hafızası™ — BF-11D6 reconcile enqueue migration STATİK SÖZLEŞME harness.
 * ====================================================================
 * DB'SİZ, AĞ'SIZ. Migration SQL metnini + BF-11C trigger SQL'ini okur; fail-closed
 * güvenlik ve BF-11C ON CONFLICT paritesini statik doğrular. FAIL → exit 1.
 *
 * Çalıştır (repo kökünden):  node scripts/yh-reconcile-enqueue-migration-harness.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const MIG = readFileSync(join(root, "supabase/migrations/20260901000000_yasam_hafizasi_reconcile_enqueue.sql"), "utf8");
const TRIG = readFileSync(join(root, "supabase/migrations/20260825000000_yasam_hafizasi_dogaltas_outbox_trigger.sql"), "utf8");

let pass = 0, fail = 0; const fails = [];
const check = (c, d, cond) => { if (cond) pass++; else { fail++; fails.push(`[${c}] ${d}`); console.error(`  FAIL [${c}] ${d}`); } };

// ─── Timestamp / tanım tekilliği ──────────────────────────────────────────────
check("mig", "timestamp 20260901000000 (unique, en son > 20260830)", MIG.includes("20260901000000_yasam_hafizasi_reconcile_enqueue"));
check("mig", "function bir kez tanımlı", (MIG.match(/CREATE OR REPLACE FUNCTION public\.yh_outbox_reconcile_enqueue/g) || []).length === 1);
check("mig", "BEGIN/COMMIT sarımı", /^\s*BEGIN;/m.test(MIG) && /COMMIT;/.test(MIG));

// ─── Güvenlik boilerplate ─────────────────────────────────────────────────────
check("sec", "SECURITY DEFINER", /SECURITY DEFINER/.test(MIG));
check("sec", "sabit search_path", /SET search_path = public, pg_catalog/.test(MIG));
check("sec", "PUBLIC/anon/authenticated REVOKE", /REVOKE ALL ON FUNCTION public\.yh_outbox_reconcile_enqueue\([^)]*\)\s*FROM PUBLIC, anon, authenticated/.test(MIG));
check("sec", "service_role GRANT", /GRANT EXECUTE ON FUNCTION public\.yh_outbox_reconcile_enqueue\([^)]*\)\s*TO service_role/.test(MIG));

// ─── Allowlist / parametre fail-closed ────────────────────────────────────────
check("allow", "source_key allowlist dogaltas:stones", /p_source_key IS DISTINCT FROM 'dogaltas:stones'[\s\S]*?RAISE EXCEPTION/.test(MIG));
check("allow", "source_table allowlist stones", /p_source_table IS DISTINCT FROM 'stones'[\s\S]*?RAISE EXCEPTION/.test(MIG));
check("allow", "operation yalnız upsert", /p_operation IS DISTINCT FROM 'upsert'[\s\S]*?RAISE EXCEPTION/.test(MIG));
check("allow", "source_id null → RAISE", /p_source_id IS NULL[\s\S]*?RAISE EXCEPTION/.test(MIG));
check("allow", "tenant_id null → RAISE", /p_tenant_id IS NULL[\s\S]*?RAISE EXCEPTION/.test(MIG));

// ─── Tenant reddi ─────────────────────────────────────────────────────────────
check("tenant", "demo tenant 40f842a0 reddi", /40f842a0-e3e8-448c-8971-9a938e1faccb/.test(MIG) && /demo tenant reddedildi/.test(MIG));
check("tenant", "sentetik ADMIN_LIBRARY aa8b960b reddi", /aa8b960b-f4f1-4e5b-89f5-109bc030c147/.test(MIG) && /sentetik tenant reddedildi/.test(MIG));
check("tenant", "tenants mevcut+aktif kontrolü (PII yok)", /FROM public\.tenants/.test(MIG) && /t\.status/.test(MIG) && /tenant bulunamadi/.test(MIG) && /tenant aktif degil/.test(MIG));
check("tenant", "tenants select yalnız id/status (PII kolonu yok)", !/tenants[\s\S]{0,120}(name|email|phone|adres)/i.test(MIG));

// ─── Kaynak exact eşleşme ─────────────────────────────────────────────────────
check("src", "stones exact id+tenant varlık", /FROM public\.stones[\s\S]*?s\.id = p_source_id AND s\.tenant_id = p_tenant_id/.test(MIG));
check("src", "eşleşme yoksa RAISE", /stones id\+tenant eslesmesi yok/.test(MIG));

// ─── Outbox identity mismatch koruması ────────────────────────────────────────
check("id", "mevcut outbox FOR UPDATE", /FROM public\.yasam_hafizasi_outbox AS o[\s\S]*?FOR UPDATE/.test(MIG));
check("id", "source_table/tenant mismatch → RAISE (overwrite yok)", /source_table IS DISTINCT FROM p_source_table[\s\S]*?tenant_id IS DISTINCT FROM p_tenant_id[\s\S]*?RAISE EXCEPTION/.test(MIG) && /overwrite yasak/.test(MIG));

// ─── ON CONFLICT + event_version + processing koruması ────────────────────────
check("conflict", "ON CONFLICT (source_key, source_id)", /ON CONFLICT \(source_key, source_id\) DO UPDATE/.test(MIG));
check("conflict", "event_version nextval sequence", /event_version = nextval\('public\.yasam_hafizasi_outbox_event_version_seq'\)/.test(MIG));
check("conflict", "processing status korunur", /status\s*=\s*CASE WHEN o\.status = 'processing' THEN o\.status\s*ELSE 'pending' END/.test(MIG));
check("conflict", "processing attempts korunur", /attempts\s*=\s*CASE WHEN o\.status = 'processing' THEN o\.attempts\s*ELSE 0\s*END/.test(MIG));
check("conflict", "processing locked_at korunur", /locked_at\s*=\s*CASE WHEN o\.status = 'processing' THEN o\.locked_at\s*ELSE NULL\s*END/.test(MIG));
check("conflict", "processing locked_by korunur", /locked_by\s*=\s*CASE WHEN o\.status = 'processing' THEN o\.locked_by\s*ELSE NULL\s*END/.test(MIG));
check("conflict", "non-processing available_at reset", /available_at\s*=\s*CASE WHEN o\.status = 'processing' THEN o\.available_at\s*ELSE now\(\)\s*END/.test(MIG));

// ─── Güvenli return + outcome ─────────────────────────────────────────────────
check("ret", "outcome inserted/coalesced/preserved", /'inserted'/.test(MIG) && /'coalesced_pending'/.test(MIG) && /'preserved_processing'/.test(MIG));
check("ret", "RETURNS TABLE güvenli teknik alanlar", /RETURNS TABLE \([\s\S]*?event_version bigint[\s\S]*?outcome\s+text/.test(MIG));

// ─── Yasaklı yüzeyler ─────────────────────────────────────────────────────────
check("safe", "dynamic SQL yok (EXECUTE format)", !/EXECUTE\s+format|EXECUTE\s+'|USING\s+/i.test(MIG));
check("safe", "yasam_hafizasi_index'e yazma yok", !/INSERT INTO public\.yasam_hafizasi_index|UPDATE public\.yasam_hafizasi_index|DELETE FROM public\.yasam_hafizasi_index/.test(MIG));
check("safe", "trigger create/replace yok", !/CREATE TRIGGER|CREATE OR REPLACE FUNCTION public\.yh_outbox_enqueue|DROP TRIGGER/.test(MIG));
check("safe", "başka source_key hardcode yok", !/refleksoloji:|sifa_rehberi:|biyoenerji:|aromaterapi:|kisisel_arsiv:|dogaltas:(minerals|knowledge|combinations)/.test(MIG));
check("safe", "arbitrary table lookup yok (yalnız tenants/stones/outbox/seq)", !/FROM public\.(?!tenants|stones|yasam_hafizasi_outbox)/.test(MIG));

// ─── BF-11C TRIGGER PARİTESİ (ON CONFLICT SET bloğu) ──────────────────────────
function conflictSet(sql) {
  const m = sql.match(/ON CONFLICT \(source_key, source_id\) DO UPDATE\s*SET([\s\S]*?);/);
  if (!m) return null;
  // normalize: yorum satırlarını at, boşlukları sadeleştir
  return m[1].split("\n").filter((l) => !l.trim().startsWith("--")).join(" ").replace(/\s+/g, " ").trim();
}
const migSet = conflictSet(MIG);
const trigSet = conflictSet(TRIG);
check("parity", "trigger ON CONFLICT SET okunabildi", trigSet !== null);
check("parity", "enqueue ON CONFLICT SET okunabildi", migSet !== null);
// EXCLUDED alanları + processing CASE davranışı birebir olmalı (source-özel farklar hariç normalize).
const keyClauses = [
  "operation = EXCLUDED.operation",
  "source_table = EXCLUDED.source_table",
  "tenant_id = EXCLUDED.tenant_id",
  "status = CASE WHEN o.status = 'processing' THEN o.status ELSE 'pending' END",
  "attempts = CASE WHEN o.status = 'processing' THEN o.attempts ELSE 0 END",
  "locked_at = CASE WHEN o.status = 'processing' THEN o.locked_at ELSE NULL END",
  "locked_by = CASE WHEN o.status = 'processing' THEN o.locked_by ELSE NULL END",
  "last_error = CASE WHEN o.status = 'processing' THEN o.last_error ELSE NULL END",
  "processed_at = CASE WHEN o.status = 'processing' THEN o.processed_at ELSE NULL END",
];
for (const kc of keyClauses) {
  check("parity", `ON CONFLICT parite: ${kc}`, migSet && trigSet && migSet.includes(kc) && trigSet.includes(kc));
}

console.log("");
if (fail > 0) { console.error(`yh-reconcile-enqueue-migration-harness: ${pass}/${pass + fail} PASS — ${fail} FAIL`); for (const f of fails) console.error("  - " + f); process.exit(1); }
console.log(`yh-reconcile-enqueue-migration-harness: ${pass}/${pass} PASS`);
