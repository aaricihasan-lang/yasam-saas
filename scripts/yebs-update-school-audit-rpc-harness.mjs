// ============================================================
// YEBS API-A1U — yebs_update_school_with_audit STATİK SÖZLEŞME harness'i
//
// STATİK KAYNAK-SÖZLEŞMESİ doğrulayıcısı. Gerçek runtime davranışını TEK BAŞINA
// kanıtlamaz; migration metninin güvenlik/sözleşme değişmezlerini + git blob
// değişmezliğini + cross-worktree timestamp çakışmasını denetler.
//
// Canlı DB'ye BAĞLANMAZ; migration production'a UYGULANMAZ.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TS = "20260821000000";
const BASENAME = `${TS}_yebs_update_school_with_audit.sql`;
const MIGRATION = resolve(ROOT, "supabase/migrations", BASENAME);

// A1U'nun DEĞİŞTİRMEDİĞİ dosyalar (blob değişmezlik). A1U'nun değiştirdikleri
// (schoolMutations.ts, schools/[id]/route.ts, write-harness, create-school harness)
// bilinçli olarak BURADA YOK.
const IMMUTABLE = [
  "supabase/migrations/20260726210017_yebs_traditions.sql",
  "supabase/migrations/20260726220031_yebs_schools.sql",
  "supabase/migrations/20260726230043_yebs_concepts.sql",
  "supabase/migrations/20260727000000_yebs_concept_labels.sql",
  "supabase/migrations/20260728000000_yebs_sources.sql",
  "supabase/migrations/20260729000000_yebs_claims.sql",
  "supabase/migrations/20260730000000_yebs_claim_sources.sql",
  "supabase/migrations/20260731000000_yebs_concept_relations.sql",
  "supabase/migrations/20260801000000_yebs_concept_relation_sources.sql",
  "supabase/migrations/20260803010000_yebs_audit_events.sql",
  "supabase/migrations/20260805000000_yebs_create_tradition_with_audit.sql",
  "supabase/migrations/20260810000000_yebs_update_tradition_with_audit.sql",
  // A1W create-school migration + write-gate: A1U'da DEĞİŞMEZ (create RPC + privilege korunur).
  "supabase/migrations/20260814000000_yebs_create_school_with_audit.sql",
  // A1R read servisi + A1W create collection route: A1U'da DEĞİŞMEZ.
  "lib/yebs/service/schools.ts",
  "app/api/admin/yebs/schools/route.ts",
  // Merkezî migration guard: A1U'da DEĞİŞMEZ.
  // NOT: yebs-schools-read-harness.mjs A1U kapsamında cerrahi güncellenir (detail
  // route artık PATCH export eder / updateSchool import eder) → IMMUTABLE'dan ÇIKARILDI.
  "scripts/migration-timestamp-guard-check.mjs",
];

let pass = 0, fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function stripSqlComments(src) {
  return src.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n");
}

console.log("\n[A1U-RPC] yebs_update_school_with_audit sözleşmesi (statik)");

if (!existsSync(MIGRATION)) {
  bad("migration dosyası mevcut", MIGRATION);
  console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(1);
}
const raw = readFileSync(MIGRATION, "utf8");
const sql = stripSqlComments(raw);
ok(`migration dosyası okunabildi: ${BASENAME}`);

// --- Fonksiyon gövdesi ---
const bodyMatch = sql.match(/AS\s+\$\$([\s\S]*?)\$\$\s*;/);
const fnBody = bodyMatch ? bodyMatch[1] : "";
check("fonksiyon gövdesi ($$...$$) bulundu", fnBody.length > 0);

// --- Phase-aware timestamp çakışma kontrolü ---
// Gerçek çakışma = AYNI timestamp öneki (TS) + FARKLI dosya adı/path (herhangi ref/worktree).
const CANONICAL_REL = `supabase/migrations/${BASENAME}`;
const localMatches = readdirSync(resolve(ROOT, "supabase/migrations")).filter((f) => f.startsWith(TS));
check(`yerelde tam 1 ${TS} migration (bu dosya)`, localMatches.length === 1 && localMatches[0] === BASENAME, localMatches.join(", "));
try {
  const originTree = execFileSync("git", ["-C", ROOT, "ls-tree", "-r", "--name-only", "origin/main", "--", "supabase/migrations/"], { encoding: "utf8" });
  const originTsFiles = originTree.split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l.startsWith("supabase/migrations/") && l.slice("supabase/migrations/".length).startsWith(TS));
  const originForeign = originTsFiles.filter((l) => l !== CANONICAL_REL);
  check(`origin/main'de ${TS} farklı dosya YOK`, originForeign.length === 0, originForeign.join(", "));
} catch (e) { bad("origin/main timestamp kontrolü", String(e && e.message)); }
try {
  const wt = execFileSync("git", ["-C", ROOT, "worktree", "list", "--porcelain"], { encoding: "utf8" });
  const paths = wt.split(/\r?\n/).filter((l) => l.startsWith("worktree ")).map((l) => l.slice("worktree ".length).trim());
  const foreign = [];
  for (const p of paths) {
    if (resolve(p) === ROOT) continue;
    const md = resolve(p, "supabase/migrations");
    if (!existsSync(md)) continue;
    for (const f of readdirSync(md)) if (f.startsWith(TS) && f !== BASENAME) foreign.push(`${p}:${f}`);
  }
  check(`başka worktree'de ${TS} farklı dosya YOK`, foreign.length === 0, foreign.join(" | "));
} catch (e) { bad("worktree timestamp kontrolü", String(e && e.message)); }

// --- Explicit transaction / fail-fast ---
check("explicit BEGIN;", /\bBEGIN\s*;/.test(sql));
check("explicit COMMIT;", /\bCOMMIT\s*;/.test(sql));
check("IF NOT EXISTS YOK", !/IF\s+NOT\s+EXISTS/i.test(sql));
check("CREATE OR REPLACE YOK", !/CREATE\s+OR\s+REPLACE/i.test(sql));
check("DO bloğu YOK", !/\bDO\s+\$\$/i.test(sql));
check("dynamic SQL YOK (EXECUTE '...' / format() / quote_)", !/EXECUTE\s+('|format\s*\(|quote_)/i.test(sql));
check("yeni tablo YOK", !/CREATE\s+TABLE\b/i.test(sql));
check("yeni trigger/index/policy YOK", !/CREATE\s+(TRIGGER|INDEX|POLICY)\b/i.test(sql));
check("ALTER TABLE YOK", !/\bALTER\s+TABLE\b/i.test(sql));
check("DROP YOK", !/\bDROP\s+(TABLE|FUNCTION|TRIGGER|INDEX|POLICY|COLUMN)/i.test(sql));
check("autonomous/dblink/http YOK", !/autonomous|dblink|http_|pg_background/i.test(sql));

// --- Tek fonksiyon / exact signature ---
const fns = (sql.match(/CREATE\s+FUNCTION\s+([a-z0-9_.]+)/gi) || []);
check("tam 1 CREATE FUNCTION", fns.length === 1, fns.join(", "));
check("fonksiyon = public.yebs_update_school_with_audit", /CREATE\s+FUNCTION\s+public\.yebs_update_school_with_audit\s*\(/i.test(sql));
const sigRe = /CREATE\s+FUNCTION\s+public\.yebs_update_school_with_audit\s*\(\s*p_actor_admin_id\s+uuid\s*,\s*p_request_id\s+uuid\s*,\s*p_operation_id\s+uuid\s*,\s*p_school_id\s+uuid\s*,\s*p_expected_updated_at\s+timestamptz\s*,\s*p_patch\s+jsonb\s*,\s*p_reason\s+text\s*\)/i;
check("exact signature (7 param sıralı+tipli)", sigRe.test(sql));
check("default parametre YOK", !/DEFAULT/i.test(sql.match(/CREATE\s+FUNCTION[\s\S]*?\)\s*RETURNS/i)?.[0] || ""));
check("composite return type (RETURNS public.yebs_schools)", /RETURNS\s+public\.yebs_schools/i.test(sql));
check("LANGUAGE plpgsql", /LANGUAGE\s+plpgsql/i.test(sql));
check("SECURITY DEFINER", /\bSECURITY\s+DEFINER\b/i.test(sql));
check("sabit search_path = pg_catalog, public", /SET\s+search_path\s*=\s*pg_catalog\s*,\s*public/i.test(sql));

// --- Schema qualification ---
check("schema-qualified public.users", /\bpublic\.users\b/.test(sql));
check("schema-qualified public.yebs_schools", /\bpublic\.yebs_schools\b/.test(sql));
check("schema-qualified public.yebs_audit_events", /\bpublic\.yebs_audit_events\b/.test(sql));
check("parent tablosu (yebs_traditions) OKUNMUYOR (reparent yok)", !/\bpublic\.yebs_traditions\b/.test(sql));

// --- Gövdede COMMIT/ROLLBACK yok ---
check("fonksiyon gövdesinde COMMIT YOK", !/\bCOMMIT\b/i.test(fnBody));
check("fonksiyon gövdesinde ROLLBACK YOK", !/\bROLLBACK\b/i.test(fnBody));

// --- Required param null reddi ---
check("YEBS_REQUEST_ID_REQUIRED (p_request_id IS NULL)", /p_request_id\s+IS\s+NULL[\s\S]{0,80}YEBS_REQUEST_ID_REQUIRED/i.test(sql));
check("YEBS_OPERATION_ID_REQUIRED", /p_operation_id\s+IS\s+NULL[\s\S]{0,80}YEBS_OPERATION_ID_REQUIRED/i.test(sql));
check("YEBS_SCHOOL_ID_REQUIRED", /p_school_id\s+IS\s+NULL[\s\S]{0,80}YEBS_SCHOOL_ID_REQUIRED/i.test(sql));
check("YEBS_EXPECTED_UPDATED_AT_REQUIRED", /p_expected_updated_at\s+IS\s+NULL[\s\S]{0,120}YEBS_EXPECTED_UPDATED_AT_REQUIRED/i.test(sql));
check("YEBS_EXPECTED_UPDATED_AT_INVALID üretilmiyor (typed cast sınırı)", !/YEBS_EXPECTED_UPDATED_AT_INVALID/.test(sql));

// --- reason ZORUNLU + FIDELITY (özgün p_reason korunur; normalize YOK) ---
check("reason zorunlu: p_reason NULL/btrim boş/length>2000 → YEBS_REASON_INVALID",
  /p_reason\s+IS\s+NULL[\s\S]{0,60}btrim\(p_reason\)\s*=\s*''[\s\S]{0,60}length\(p_reason\)\s*>\s*2000[\s\S]{0,80}YEBS_REASON_INVALID/i.test(sql));
check("reason FIDELITY: v_reason değişkeni YOK (normalize edilmiş kopya yok)", !/v_reason/i.test(sql));
check("reason FIDELITY: p_reason için nullif(btrim(coalesce())) normalization YOK", !/nullif\(btrim\(coalesce\(p_reason/i.test(sql));
check("reason FIDELITY: btrim yalnız boşluk denetimi (btrim(p_reason) = '' emptiness)", /btrim\(p_reason\)\s*=\s*''/i.test(sql));

// --- patch: object + boş değil + whitelist (5 anahtar) ---
check("patch NULL/non-object → YEBS_INVALID_PATCH", /p_patch\s+IS\s+NULL\s+OR\s+jsonb_typeof\(p_patch\)\s*<>\s*'object'[\s\S]{0,80}YEBS_INVALID_PATCH/i.test(sql));
check("boş object reddi ('{}'::jsonb)", /p_patch\s*=\s*'\{\}'::jsonb[\s\S]{0,80}YEBS_INVALID_PATCH/i.test(sql));
check("unknown-key reddi (jsonb_object_keys NOT IN whitelist)",
  /jsonb_object_keys\(p_patch\)[\s\S]{0,200}NOT\s+IN\s*\([\s\S]{0,200}YEBS_INVALID_PATCH/i.test(sql));
const ALLOWED = ["slug", "name_tr", "native_name", "native_language_tag", "native_script_code"];
check("exact allowed patch keys (5, whitelist)", ALLOWED.every((k) => new RegExp(`'${k}'`).test(sql)));
check("tradition_id patch whitelist DIŞI (reparent yok)", !/'tradition_id'/.test(sql));
check("status patch whitelist DIŞI (transition yok)", !/'status'/.test(sql));

// --- patch tip kontrolleri ---
check("required present → json string (null reddi)",
  /jsonb_exists\(p_patch,\s*'slug'\)[\s\S]{0,80}jsonb_typeof\(p_patch\s*->\s*'slug'\)\s*<>\s*'string'/i.test(sql)
  && /jsonb_exists\(p_patch,\s*'name_tr'\)[\s\S]{0,80}<>\s*'string'/i.test(sql));
check("nullable native present → string veya null",
  /native_name'\)[\s\S]{0,80}NOT\s+IN\s*\('string',\s*'null'\)/i.test(sql)
  && /native_language_tag'\)[\s\S]{0,80}NOT\s+IN\s*\('string',\s*'null'\)/i.test(sql)
  && /native_script_code'\)[\s\S]{0,80}NOT\s+IN\s*\('string',\s*'null'\)/i.test(sql));

// --- actor DB doğrulaması ---
check("actor: public.users SELECT role/active/email", /SELECT\s+u\.role,\s*u\.active,\s*u\.email[\s\S]{0,120}FROM\s+public\.users/i.test(sql));
check("YEBS_ADMIN_NOT_FOUND", /YEBS_ADMIN_NOT_FOUND/.test(sql));
check("YEBS_ADMIN_NOT_ACTIVE (role/active)", /v_role\s+IS\s+DISTINCT\s+FROM\s+'admin'\s+OR\s+v_active\s+IS\s+NOT\s+TRUE[\s\S]{0,80}YEBS_ADMIN_NOT_ACTIVE/i.test(sql));
check("actor label DB e-postasından + fallback 'admin'", /v_actor_label\s*:=\s*nullif\(btrim\(coalesce\(v_email/i.test(sql) && /v_actor_label\s*:=\s*'admin'/i.test(sql));
check("actor label body'den ALINMIYOR", !/p_actor_label|p_actor_email/i.test(sql));

// --- FOR UPDATE / not-found / status gate / concurrency ---
check("SELECT ... FOR UPDATE (hedef satır kilidi)", /FROM\s+public\.yebs_schools\s+WHERE\s+id\s*=\s*p_school_id\s+FOR\s+UPDATE/i.test(sql));
check("not-found → YEBS_SCHOOL_NOT_FOUND", /NOT\s+FOUND[\s\S]{0,80}YEBS_SCHOOL_NOT_FOUND/i.test(sql));
check("draft-only status gate → YEBS_SCHOOL_STATUS_LOCKED", /v_existing\.status\s+IS\s+DISTINCT\s+FROM\s+'draft'[\s\S]{0,80}YEBS_SCHOOL_STATUS_LOCKED/i.test(sql));
check("concurrency: updated_at IS DISTINCT FROM p_expected_updated_at → STALE",
  /v_existing\.updated_at\s+IS\s+DISTINCT\s+FROM\s+p_expected_updated_at[\s\S]{0,80}YEBS_SCHOOL_STALE_UPDATE/i.test(sql));

// --- Yeni canonical değerler (5 alan, jsonb_exists) ---
check("5 canonical yeni değer (jsonb_exists per alan)",
  ALLOWED.every((k) => new RegExp(`jsonb_exists\\(p_patch,\\s*'${k}'\\)`).test(sql)));
check("required omitted → mevcut değer (v_existing.slug/name_tr)",
  /v_slug\s*:=\s*v_existing\.slug/i.test(sql) && /v_name_tr\s*:=\s*v_existing\.name_tr/i.test(sql));
check("nullable explicit null → SQL NULL",
  /jsonb_typeof\(p_patch\s*->\s*'native_name'\)\s*=\s*'null'\s*THEN\s*v_native_name\s*:=\s*NULL/i.test(sql));

// --- D2 canonical validation uyumu ---
check("slug regex D2 ile birebir", /v_slug\s*!~\s*'\^\[a-z\]\[a-z0-9_\]\*\$'/i.test(sql));
check("name_tr btrim boş değil", /btrim\(v_name_tr\)\s*=\s*''/i.test(sql));
check("native coupling", /\(v_native_name\s+IS\s+NULL\)\s*<>\s*\(v_lang\s+IS\s+NULL\)/i.test(sql));
check("native_name btrim non-empty", /btrim\(v_native_name\)\s*=\s*''/i.test(sql));
check("BCP-47 CHECK birebir", /v_lang\s*!~\s*'\^\[A-Za-z\]\{2,3\}\(-\[A-Za-z0-9\]\{2,8\}\)\*\$'/i.test(sql));
check("ISO-15924 CHECK birebir", /v_script\s*!~\s*'\^\[A-Z\]\[a-z\]\{3\}\$'/i.test(sql));

// --- changed_fields: sabit sıra (5) + IS DISTINCT FROM + no-op ---
const cfOrder = ["slug", "name_tr", "native_name", "native_language_tag", "native_script_code"];
let cfSeq = true, lastIdx = -1;
for (const f of cfOrder) {
  const idx = sql.indexOf(`v_changed := v_changed || '${f}'`);
  if (idx === -1 || idx < lastIdx) cfSeq = false;
  lastIdx = idx;
}
check("changed_fields SABİT canonical sırada append (5 alan)", cfSeq);
const distinctCount = (fnBody.match(/IS\s+DISTINCT\s+FROM/gi) || []).length;
check("field karşılaştırmaları IS DISTINCT FROM (>=8: 5 alan + admin + status + concurrency)", distinctCount >= 8, `bulunan=${distinctCount}`);
check("changed_fields'e updated_at eklenmiyor", !/v_changed\s*:=\s*v_changed\s*\|\|\s*'updated_at'/i.test(sql));
check("changed_fields'e tradition_id/status eklenmiyor",
  !/v_changed\s*:=\s*v_changed\s*\|\|\s*'tradition_id'/i.test(sql) && !/v_changed\s*:=\s*v_changed\s*\|\|\s*'status'/i.test(sql));
check("no-op reddi UPDATE'ten ÖNCE (cardinality=0 → NO_CHANGES)",
  /cardinality\(v_changed\)\s*=\s*0[\s\S]{0,80}YEBS_SCHOOL_NO_CHANGES/i.test(sql));
const noopIdx = sql.indexOf("YEBS_SCHOOL_NO_CHANGES");
const updIdx = sql.indexOf("UPDATE public.yebs_schools");
check("no-op kontrolü UPDATE ifadesinden önce", noopIdx !== -1 && updIdx !== -1 && noopIdx < updIdx);

// --- UPDATE: yalnız 5 canonical alan ---
const updBlock = sql.match(/UPDATE\s+public\.yebs_schools[\s\S]*?RETURNING\s+\*\s+INTO\s+v_updated/i)?.[0] || "";
check("UPDATE yalnız 5 canonical alan SET",
  /SET\s+slug\s*=/.test(updBlock) && /name_tr\s*=/.test(updBlock)
  && /native_name\s*=/.test(updBlock) && /native_language_tag\s*=/.test(updBlock) && /native_script_code\s*=/.test(updBlock));
// Yalnız SET atama listesini denetle (WHERE id = ... yanlış eşleşmesin).
const setPart = updBlock.match(/SET([\s\S]*?)WHERE/i)?.[1] || "";
check("UPDATE tradition_id/status/id/created_at/updated_at SET ETMİYOR",
  setPart.length > 0 && !/\b(id|tradition_id|status|created_at|updated_at)\s*=/i.test(setPart));
check("UPDATE RETURNING * INTO v_updated", /RETURNING\s+\*\s+INTO\s+v_updated/i.test(sql));

// --- unique/check mapping ---
check("unique_violation → YEBS_SCHOOL_DUPLICATE", /WHEN\s+unique_violation\s+THEN[\s\S]{0,160}YEBS_SCHOOL_DUPLICATE/i.test(sql));
check("check_violation → YEBS_INVALID_SCHOOL_INPUT", /WHEN\s+check_violation\s+THEN[\s\S]{0,160}YEBS_INVALID_SCHOOL_INPUT/i.test(sql));
check("ham hata mesajında NEW./OLD./% yok", !/RAISE\s+EXCEPTION[^;]*(NEW\.|OLD\.|%)/i.test(sql));

// --- Audit sözleşmesi ---
check("audit action='update'", /'update'/.test(sql));
check("audit entity_type='school'", /'school'/.test(sql));
check("audit outcome='committed'", /'committed'/.test(sql));
check("previous_state = to_jsonb(v_existing)", /to_jsonb\(v_existing\)/i.test(sql));
check("new_state = to_jsonb(v_updated)", /to_jsonb\(v_updated\)/i.test(sql));
check("changed_fields = v_changed audit'e yazılıyor", /v_changed,/.test(sql));
check("error_code NULL + metadata '{}'", /p_operation_id,\s*NULL,\s*'\{\}'::jsonb/i.test(sql));
check("entity_id = v_updated.id", /v_updated\.id/i.test(sql));
check("request_id/operation_id/reason audit'e (reason = özgün p_reason)", /p_request_id,/.test(sql) && /p_operation_id,/.test(sql) && /v_changed,\s*p_reason,\s*p_request_id/i.test(sql));

// --- Audit insert yutulmuyor + atomiklik ---
const auditIdx = sql.indexOf("INSERT INTO public.yebs_audit_events");
const returnIdx = sql.lastIndexOf("RETURN v_updated");
check("canonical UPDATE audit INSERT'ten ÖNCE", updIdx !== -1 && auditIdx !== -1 && updIdx < auditIdx);
check("audit INSERT'ten RETURN'e kadar EXCEPTION handler YOK (yutulmuyor)",
  auditIdx !== -1 && returnIdx !== -1 && !/EXCEPTION/i.test(sql.slice(auditIdx, returnIdx)));

// --- Privilege modeli ---
const fnSig = "public\\.yebs_update_school_with_audit\\s*\\(\\s*uuid,\\s*uuid,\\s*uuid,\\s*uuid,\\s*timestamptz,\\s*jsonb,\\s*text\\s*\\)";
for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
  check(`REVOKE ALL EXECUTE FROM ${role}`, new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+FROM\\s+${role}`, "i").test(sql));
}
check("GRANT EXECUTE yalnız service_role", new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+TO\\s+service_role`, "i").test(sql));
check("EXECUTE anon/authenticated/PUBLIC'a GRANT edilmiyor", !/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+(anon|authenticated|PUBLIC)\b/i.test(sql));
check("tablo GRANT'ları genişletilmiyor (GRANT ... ON TABLE yok)", !/GRANT\s+[\s\S]*?\bON\s+TABLE\b/i.test(sql));
check("tablo REVOKE yok (write-gate A1W'de kurulu; A1U dokunmuyor)", !/REVOKE\s+[\s\S]*?\bON\s+TABLE\b/i.test(sql));

// --- git blob değişmezliği (A1U'nun dokunmadığı dosyalar) ---
function blobEq(rel) {
  const abs = resolve(ROOT, rel);
  const wt = execFileSync("git", ["-C", ROOT, "hash-object", abs], { encoding: "utf8" }).trim();
  const base = execFileSync("git", ["-C", ROOT, "rev-parse", `origin/main:${rel}`], { encoding: "utf8" }).trim();
  return wt === base;
}
try {
  for (const f of IMMUTABLE) check(`değişmez (origin/main blob): ${f}`, blobEq(f));
} catch (e) { bad("git blob değişmezlik kontrolü", String(e && e.message)); }

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
