// ============================================================
// YEBS API-AUD2 — atomik tradition create + audit RPC statik doğrulama harness'i
//
// SALT-OKUNUR / STATİK. Canlı DB'ye BAĞLANMAZ; INSERT/UPDATE/DELETE yapmaz.
// RPC migration production'a UYGULANMAZ. Yalnız migration dosya metni + git
// üzerinden D1–D9 ve API-AUD1 değişmezliği doğrulanır.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIGRATION = resolve(
  ROOT,
  "supabase/migrations/20260805000000_yebs_create_tradition_with_audit.sql",
);

// D1–D9 çekirdek migration dosyaları (değişmez olmalı).
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

// API-AUD1 audit migration dosyası (değişmez olmalı).
const AUD1 = "20260803010000_yebs_audit_events.sql";

let pass = 0;
let fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }

// SQL satır yorumlarını (-- ...) çıkar: CHECK denetimleri gerçek DDL üzerinde
// yapılmalı; açıklama yorumundaki kelimeler (ör. 'rejected', 'ALTER', 'update')
// yanlış eşleşmemeli.
function stripSqlComments(src) {
  return src
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

console.log("\n[AUD2] yebs_create_tradition_with_audit atomik RPC sözleşmesi");

if (!existsSync(MIGRATION)) {
  bad("migration dosyası mevcut", MIGRATION);
  console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(1);
}
const raw = readFileSync(MIGRATION, "utf8");
const sql = stripSqlComments(raw);
ok("migration dosyası okunabildi");

// Fonksiyon gövdesi ($$ ... $$) — COMMIT/ROLLBACK denetimi bu bölgede yapılır.
const bodyMatch = sql.match(/AS\s+\$\$([\s\S]*?)\$\$\s*;/);
const fnBody = bodyMatch ? bodyMatch[1] : "";
check("fonksiyon gövdesi ($$...$$) bulundu", fnBody.length > 0);

// --- Explicit transaction ---
check("explicit BEGIN;", /\bBEGIN\s*;/.test(sql));
check("explicit COMMIT;", /\bCOMMIT\s*;/.test(sql));

// --- Deterministik / fail-fast (yasak kalıplar) ---
check("IF NOT EXISTS YOK", !/IF\s+NOT\s+EXISTS/i.test(sql));
check("CREATE OR REPLACE YOK", !/CREATE\s+OR\s+REPLACE/i.test(sql));
check("DO bloğu YOK", !/\bDO\s+\$\$/i.test(sql));
check("dynamic SQL YOK (EXECUTE '...' / format() / quote_)", !/EXECUTE\s+('|format\s*\(|quote_)/i.test(sql));

// --- Yalnız beklenen nesneler ---
check("yeni tablo YOK (CREATE TABLE = 0)", (sql.match(/CREATE\s+TABLE\b/gi) || []).length === 0);
const createFns = (sql.match(/CREATE\s+FUNCTION\s+([a-z0-9_.]+)/gi) || []);
check("tam 1 CREATE FUNCTION", createFns.length === 1, createFns.join(", "));
check("fonksiyon = public.yebs_create_tradition_with_audit",
  /CREATE\s+FUNCTION\s+public\.yebs_create_tradition_with_audit\s*\(/i.test(sql));
check("başka RPC YOK (tek beklenen fonksiyon)",
  createFns.length === 1 && /yebs_create_tradition_with_audit/i.test(createFns[0] || ""));

// --- Şema-güvenliği / SECURITY DEFINER ---
check("SECURITY DEFINER", /\bSECURITY\s+DEFINER\b/i.test(sql));
check("sabit search_path (SET search_path = ...)", /SET\s+search_path\s*=/i.test(sql));
check("LANGUAGE plpgsql", /LANGUAGE\s+plpgsql/i.test(sql));

// --- Schema-qualified referanslar ---
check("schema-qualified public.users", /\bpublic\.users\b/.test(sql));
check("schema-qualified public.yebs_traditions", /\bpublic\.yebs_traditions\b/.test(sql));
check("schema-qualified public.yebs_audit_events", /\bpublic\.yebs_audit_events\b/.test(sql));

// --- Fonksiyon gövdesinde COMMIT/ROLLBACK / autonomous / dblink / http YOK ---
check("fonksiyon gövdesinde COMMIT YOK", !/\bCOMMIT\b/i.test(fnBody));
check("fonksiyon gövdesinde ROLLBACK YOK", !/\bROLLBACK\b/i.test(fnBody));
check("autonomous/dblink/http YOK", !/autonomous|dblink|http_|pg_background/i.test(sql));

// --- D1/AUD1 şema ALTER/DROP YOK (write-gate REVOKE/GRANT bir ALTER değildir) ---
check("ALTER TABLE YOK (şema değişikliği yok)", !/\bALTER\s+TABLE\b/i.test(sql));
check("DROP ifadesi YOK", !/\bDROP\s+(TABLE|FUNCTION|TRIGGER|INDEX|COLUMN|POLICY)/i.test(sql));
check("CREATE POLICY YOK", !/CREATE\s+POLICY/i.test(sql));
// Migration D2–D9 tablolarına DEĞİNMEZ (yalnız traditions + audit + users).
for (const t of ["yebs_schools", "yebs_concepts", "yebs_concept_labels", "yebs_sources", "yebs_claims", "yebs_claim_sources", "yebs_concept_relations", "yebs_concept_relation_sources"]) {
  check(`D2–D9 tablosuna referans YOK (${t})`, !new RegExp(`\\b${t}\\b`).test(sql), "migration bu tabloya değiniyor");
}

// --- Zorunlu operasyon parametreleri ---
check("param p_actor_admin_id", /\bp_actor_admin_id\s+uuid\b/i.test(sql));
check("param p_request_id", /\bp_request_id\s+uuid\b/i.test(sql));
check("param p_operation_id", /\bp_operation_id\s+uuid\b/i.test(sql));
check("param p_reason", /\bp_reason\s+text\b/i.test(sql));

// --- Yasak parametreler ---
check("actor label parametresi YOK", !/\bp_(actor_label|actor_label_snapshot|label)\b/i.test(sql));
check("actor email parametresi YOK", !/\bp_(actor_email|email)\b/i.test(sql));
check("status parametresi YOK", !/\bp_status\b/i.test(sql));
check("id parametresi YOK", !/\bp_id\b/i.test(sql));
check("created_at/updated_at parametresi YOK", !/\bp_(created_at|updated_at)\b/i.test(sql));
check("outcome/action/entity/error parametresi YOK",
  !/\bp_(outcome|action|entity_type|entity_id|error_code|new_state|previous_state|actor_label_snapshot)\b/i.test(sql));
check("generic jsonb payload parametresi YOK", !/\bp_[a-z_]+\s+jsonb\b/i.test(sql));

// --- Aktif admin doğrulaması (DB kontrolü) ---
check("aktif admin: public.users SELECT", /FROM\s+public\.users\b/i.test(sql));
check("admin role kontrolü ('admin')", /v_role\s+IS\s+DISTINCT\s+FROM\s+'admin'/i.test(sql));
check("admin active kontrolü", /v_active\s+IS\s+NOT\s+TRUE/i.test(sql));
check("YEBS_ADMIN_NOT_FOUND", /YEBS_ADMIN_NOT_FOUND/.test(sql));
check("YEBS_ADMIN_NOT_ACTIVE", /YEBS_ADMIN_NOT_ACTIVE/.test(sql));

// --- Actor label DB'den üretiliyor (çağıran veremez) ---
check("actor label DB e-postasından türetiliyor (v_email → v_actor_label)",
  /v_actor_label\s*:=\s*nullif\(\s*btrim\(\s*coalesce\(\s*v_email/i.test(sql));
check("actor label boş/uzun için sabit rol fallback", /v_actor_label\s*:=\s*'admin'/i.test(sql));
check("actor label snapshot'a hassas veri sokulmuyor (password/token/session param yok)",
  !/password|reset_token|session_token|auth_secret/i.test(sql));

// --- Input doğrulama sözleşmesi ---
check("YEBS_REQUEST_ID_REQUIRED", /YEBS_REQUEST_ID_REQUIRED/.test(sql));
check("YEBS_OPERATION_ID_REQUIRED", /YEBS_OPERATION_ID_REQUIRED/.test(sql));
check("YEBS_REASON_INVALID", /YEBS_REASON_INVALID/.test(sql));
check("YEBS_INVALID_TRADITION_INPUT", /YEBS_INVALID_TRADITION_INPUT/.test(sql));
check("reason uzunluk sınırı (<= 2000)", /length\(v_reason\)\s*>\s*2000/i.test(sql));
check("slug format doğrulaması (D1 birebir)", /v_slug\s*!~\s*'\^\[a-z\]\[a-z0-9_\]\*\$'/i.test(sql));
check("tradition_type kilitli küme doğrulaması",
  /'cultural_tradition'/.test(sql) && /'research_framework'/.test(sql) && /NOT\s+IN/i.test(sql));
check("native coupling doğrulaması (üçü NULL veya üçü dolu)",
  /\(v_native_name\s+IS\s+NULL\)\s*<>\s*\(v_lang\s+IS\s+NULL\)/i.test(sql));

// --- Kararlı hata kodları: SQLSTATE P0001 ---
check("RAISE EXCEPTION kontrollü SQLSTATE (P0001)", /USING\s+ERRCODE\s*=\s*'P0001'/i.test(sql));

// --- Sıra: önce canonical INSERT, sonra audit INSERT ---
const idxTrad = sql.indexOf("INSERT INTO public.yebs_traditions");
const idxAudit = sql.indexOf("INSERT INTO public.yebs_audit_events");
check("canonical INSERT mevcut (public.yebs_traditions)", idxTrad !== -1);
check("audit INSERT mevcut (public.yebs_audit_events)", idxAudit !== -1);
check("canonical INSERT, audit INSERT'ten ÖNCE", idxTrad !== -1 && idxAudit !== -1 && idxTrad < idxAudit);
check("canonical RETURNING * INTO v_created", /RETURNING\s+\*\s+INTO\s+v_created/i.test(sql));
check("çağıran id/status/timestamps INSERT etmiyor (kolon listesinde yok)",
  /INSERT\s+INTO\s+public\.yebs_traditions\s*\(\s*slug,\s*name_tr,\s*tradition_type,\s*native_name,\s*native_language_tag,\s*native_script_code\s*\)/i.test(sql));

// --- Audit satırı sözleşmesi ---
check("audit action = 'create'", /'create'/.test(sql));
check("audit entity_type = 'tradition'", /'tradition'/.test(sql));
check("audit outcome = 'committed'", /'committed'/.test(sql));
check("audit new_state = canonical row snapshot to_jsonb(v_created)", /to_jsonb\(v_created\)/i.test(sql));
check("audit previous_state NULL + new_state snapshot (sıra)",
  /'committed',\s*NULL,\s*to_jsonb\(v_created\)/i.test(sql));
check("audit error_code NULL + metadata '{}' (sıra)",
  /p_operation_id,\s*NULL,\s*'\{\}'::jsonb/i.test(sql));
check("audit entity_id = v_created.id", /v_created\.id/i.test(sql));
check("audit request_id yazılıyor (p_request_id)", /\bp_request_id\b/.test(sql));
check("audit operation_id yazılıyor (p_operation_id)", /\bp_operation_id\b/.test(sql));
check("audit reason yazılıyor (v_reason)", /\bv_reason\b/.test(sql));
// changed_fields = 6 kullanıcı-editable create alanı, sabit text[].
const CHANGED = ["slug", "name_tr", "tradition_type", "native_name", "native_language_tag", "native_script_code"];
check("changed_fields ARRAY[...]::text[] mevcut", /ARRAY\[[\s\S]*?\]::text\[\]/i.test(sql));
check("changed_fields = 6 editable alan (tam küme)",
  CHANGED.every((c) => new RegExp(`'${c}'`).test(sql)));

// --- Duplicate / hata modeli ---
check("unique_violation → YEBS_TRADITION_DUPLICATE",
  /WHEN\s+unique_violation\s+THEN[\s\S]{0,160}YEBS_TRADITION_DUPLICATE/i.test(sql));
check("check_violation → YEBS_INVALID_TRADITION_INPUT (ham mesaj sızmaz)",
  /WHEN\s+check_violation\s+THEN[\s\S]{0,160}YEBS_INVALID_TRADITION_INPUT/i.test(sql));
check("ham hata mesajında NEW./OLD./% (satır-veri) YOK",
  !/RAISE\s+EXCEPTION[^;]*(NEW\.|OLD\.|%)/i.test(sql));

// --- Bu fazda YOK: rejected audit / generic audit insert RPC ---
check("rejected audit YOK ('rejected' literali yok)", !/'rejected'/.test(sql));
check("generic audit insert RPC YOK (tek fonksiyon, adı sabit)",
  createFns.length === 1 && !/yebs_(insert|create)_audit\b/i.test(sql));

// --- Direct tradition write-gate (service_role) ---
check("write-gate: service_role INSERT/UPDATE/DELETE/TRUNCATE REVOKE",
  /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+TABLE\s+public\.yebs_traditions\s+FROM\s+service_role/i.test(sql));
check("service_role tradition SELECT korunuyor (SELECT/ALL revoke edilmiyor)",
  !/REVOKE\s+(ALL|SELECT)\b[^;]*ON\s+TABLE\s+public\.yebs_traditions\s+FROM\s+service_role/i.test(sql));
check("PUBLIC/anon/authenticated tradition kilidi yeniden doğrulanıyor",
  /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.yebs_traditions\s+FROM\s+PUBLIC/i.test(sql)
  && /FROM\s+anon/i.test(sql) && /FROM\s+authenticated/i.test(sql));

// --- EXECUTE privilege modeli ---
const fnSig = "public\\.yebs_create_tradition_with_audit\\s*\\(\\s*uuid,\\s*uuid,\\s*uuid,\\s*text,\\s*text,\\s*text,\\s*text,\\s*text,\\s*text,\\s*text\\s*\\)";
check("REVOKE ALL EXECUTE FROM PUBLIC (tam signature)",
  new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+FROM\\s+PUBLIC`, "i").test(sql));
check("REVOKE ALL EXECUTE FROM anon", new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+FROM\\s+anon`, "i").test(sql));
check("REVOKE ALL EXECUTE FROM authenticated", new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+FROM\\s+authenticated`, "i").test(sql));
check("REVOKE ALL EXECUTE FROM service_role", new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+FROM\\s+service_role`, "i").test(sql));
check("GRANT EXECUTE yalnız service_role",
  new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+TO\\s+service_role`, "i").test(sql));
check("EXECUTE anon/authenticated/PUBLIC'a GRANT edilmiyor",
  !/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+(anon|authenticated|PUBLIC)\b/i.test(sql));

// --- Endpoint / route dosyası eklenmiyor (kapsam dışı) ---
try {
  const changed = execFileSync("git", ["-C", ROOT, "status", "--porcelain=v1"], { encoding: "utf8" });
  const routeTouched = changed.split(/\r?\n/).filter((l) => /app[\\/]+api[\\/].*route\.ts/i.test(l));
  check("endpoint/route dosyası eklenmiyor", routeTouched.length === 0, routeTouched.join(" | "));
} catch (e) {
  bad("git route kontrolü çalıştı", String(e && e.message));
}

// --- D1–D9 + AUD1 değişmezliği (working tree blob == origin/main blob) ---
function blobUnchanged(fileRel) {
  const abs = resolve(ROOT, "supabase/migrations", fileRel);
  const worktreeHash = execFileSync("git", ["-C", ROOT, "hash-object", abs], { encoding: "utf8" }).trim();
  const baseHash = execFileSync("git", ["-C", ROOT, "rev-parse", `origin/main:supabase/migrations/${fileRel}`], { encoding: "utf8" }).trim();
  return { same: worktreeHash === baseHash, worktreeHash, baseHash };
}
try {
  for (const f of D1_D9) {
    const r = blobUnchanged(f);
    check(`D1–D9 değişmez: ${f}`, r.same, r.same ? "" : `${r.worktreeHash} != ${r.baseHash}`);
  }
  const a = blobUnchanged(AUD1);
  check(`API-AUD1 değişmez: ${AUD1}`, a.same, a.same ? "" : `${a.worktreeHash} != ${a.baseHash}`);
} catch (e) {
  bad("git blob değişmezlik kontrolü çalıştı", String(e && e.message));
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
