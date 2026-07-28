// ============================================================
// YEBS API-A1W — yebs_create_school_with_audit STATİK SÖZLEŞME harness'i
//
// STATİK KAYNAK-SÖZLEŞMESİ doğrulayıcısı. Gerçek runtime davranışını TEK BAŞINA
// kanıtlamaz; migration metninin güvenlik/sözleşme değişmezlerini + git blob
// değişmezliğini + phase-aware timestamp çakışmasını + merkezî migration guard
// uyumunu denetler.
//
// Canlı DB'ye BAĞLANMAZ; migration production'a UYGULANMAZ.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { analyzeMigrations, LEGACY_ALLOWLIST, scanRealMigrationBasenames } from "./migration-timestamp-guard-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");
const CREATE_SCHOOL_RE = /^([0-9]{14})_yebs_create_school_with_audit\.sql$/;

let pass = 0, fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function stripSqlComments(src) {
  return src.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n");
}

console.log("\n[A1W-RPC] yebs_create_school_with_audit sözleşmesi (statik)");

// --- Migration dosyasını keşfet (dinamik timestamp) ---
const localCreateSchool = readdirSync(MIG_DIR).filter((f) => CREATE_SCHOOL_RE.test(f));
check("yerelde tam 1 create-school migration", localCreateSchool.length === 1, localCreateSchool.join(", "));
if (localCreateSchool.length !== 1) {
  console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(1);
}
const BASENAME = localCreateSchool[0];
const TS = CREATE_SCHOOL_RE.exec(BASENAME)[1];
const CANONICAL_REL = `supabase/migrations/${BASENAME}`;
const MIGRATION = resolve(MIG_DIR, BASENAME);
ok(`migration bulundu: ${BASENAME} (ts=${TS})`);

const raw = readFileSync(MIGRATION, "utf8");
const sql = stripSqlComments(raw);

// --- Fonksiyon gövdesi ---
const bodyMatch = sql.match(/AS\s+\$\$([\s\S]*?)\$\$\s*;/);
const fnBody = bodyMatch ? bodyMatch[1] : "";
check("fonksiyon gövdesi ($$...$$) bulundu", fnBody.length > 0);

// --- Merkezî migration timestamp guard uyumu (yeni migration dahil) ---
try {
  const real = scanRealMigrationBasenames();
  const r = analyzeMigrations(real, LEGACY_ALLOWLIST);
  check(`merkezî timestamp guard: gerçek repo PASS (${real.length} .sql, yeni migration dahil)`, r.ok === true,
    r.ok ? "" : r.errors.map((e) => e.message).join(" | "));
} catch (e) { bad("merkezî guard entegrasyonu", String(e && e.message)); }

// --- Phase-aware timestamp çakışma kontrolü ---
// A1W migration HENÜZ merge EDİLMEDİ → origin/main'de bu TS ile FARKLI dosya olmamalı;
// canonical path da henüz origin/main'de OLMAYABİLİR (pre-merge). Gerçek çakışma:
// aynı TS + farklı dosya adı (herhangi ref/worktree).
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
const sigRe = /CREATE\s+FUNCTION\s+public\.yebs_create_school_with_audit\s*\(\s*p_actor_admin_id\s+uuid\s*,\s*p_request_id\s+uuid\s*,\s*p_operation_id\s+uuid\s*,\s*p_tradition_id\s+uuid\s*,\s*p_slug\s+text\s*,\s*p_name_tr\s+text\s*,\s*p_native_name\s+text\s+DEFAULT\s+NULL\s*,\s*p_native_language_tag\s+text\s+DEFAULT\s+NULL\s*,\s*p_native_script_code\s+text\s+DEFAULT\s+NULL\s*,\s*p_reason\s+text\s+DEFAULT\s+NULL\s*\)/i;
check("exact signature (10 param sıralı+tipli)", sigRe.test(sql));
check("composite return type (RETURNS public.yebs_schools)", /RETURNS\s+public\.yebs_schools/i.test(sql));
check("LANGUAGE plpgsql", /LANGUAGE\s+plpgsql/i.test(sql));
check("SECURITY DEFINER", /\bSECURITY\s+DEFINER\b/i.test(sql));
check("sabit search_path = pg_catalog, public", /SET\s+search_path\s*=\s*pg_catalog\s*,\s*public/i.test(sql));

// --- Schema qualification ---
check("schema-qualified public.users", /\bpublic\.users\b/.test(sql));
check("schema-qualified public.yebs_schools", /\bpublic\.yebs_schools\b/.test(sql));
check("schema-qualified public.yebs_traditions", /\bpublic\.yebs_traditions\b/.test(sql));
check("schema-qualified public.yebs_audit_events", /\bpublic\.yebs_audit_events\b/.test(sql));

// --- Gövdede COMMIT/ROLLBACK yok ---
check("fonksiyon gövdesinde COMMIT YOK", !/\bCOMMIT\b/i.test(fnBody));
check("fonksiyon gövdesinde ROLLBACK YOK", !/\bROLLBACK\b/i.test(fnBody));

// --- Required param null reddi ---
check("YEBS_REQUEST_ID_REQUIRED (p_request_id IS NULL)", /p_request_id\s+IS\s+NULL[\s\S]{0,80}YEBS_REQUEST_ID_REQUIRED/i.test(sql));
check("YEBS_OPERATION_ID_REQUIRED", /p_operation_id\s+IS\s+NULL[\s\S]{0,80}YEBS_OPERATION_ID_REQUIRED/i.test(sql));
check("YEBS_TRADITION_ID_REQUIRED", /p_tradition_id\s+IS\s+NULL[\s\S]{0,80}YEBS_TRADITION_ID_REQUIRED/i.test(sql));

// --- Canonical validation (D2 CHECK ile birebir) ---
check("slug NULL/regex D2 ile birebir → INVALID_SCHOOL_INPUT",
  /p_slug\s+IS\s+NULL\s+OR\s+p_slug\s*!~\s*'\^\[a-z\]\[a-z0-9_\]\*\$'[\s\S]{0,80}YEBS_INVALID_SCHOOL_INPUT/i.test(sql));
check("name_tr NULL/btrim boş → INVALID_SCHOOL_INPUT",
  /p_name_tr\s+IS\s+NULL\s+OR\s+btrim\(p_name_tr\)\s*=\s*''[\s\S]{0,80}YEBS_INVALID_SCHOOL_INPUT/i.test(sql));
check("native coupling (IS NULL <> IS NULL)", /\(p_native_name\s+IS\s+NULL\)\s*<>\s*\(p_native_language_tag\s+IS\s+NULL\)/i.test(sql));
check("native_name btrim non-empty", /btrim\(p_native_name\)\s*=\s*''/i.test(sql));
check("BCP-47 CHECK birebir", /p_native_language_tag\s*!~\s*'\^\[A-Za-z\]\{2,3\}\(-\[A-Za-z0-9\]\{2,8\}\)\*\$'/i.test(sql));
check("ISO-15924 CHECK birebir", /p_native_script_code\s*!~\s*'\^\[A-Z\]\[a-z\]\{3\}\$'/i.test(sql));

// --- Reason FIDELITY (normalize YOK; özgün p_reason) ---
check("reason opsiyonel + fidelity: p_reason IS NOT NULL guard + btrim boş + length(p_reason)>2000 → REASON_INVALID",
  /p_reason\s+IS\s+NOT\s+NULL[\s\S]{0,60}btrim\(p_reason\)\s*=\s*''[\s\S]{0,40}length\(p_reason\)\s*>\s*2000[\s\S]{0,80}YEBS_REASON_INVALID/i.test(sql));
check("reason FIDELITY: v_reason değişkeni YOK", !/v_reason/i.test(sql));
check("reason FIDELITY: nullif(btrim(coalesce(p_reason normalization YOK", !/nullif\(btrim\(coalesce\(p_reason/i.test(sql));
check("reason FIDELITY: p_reason := atama (yeniden yazma) YOK", !/p_reason\s*:=/.test(sql));

// --- Aktif admin + actor label ---
check("actor: public.users SELECT role/active/email", /SELECT\s+u\.role,\s*u\.active,\s*u\.email[\s\S]{0,120}FROM\s+public\.users/i.test(sql));
check("YEBS_ADMIN_NOT_FOUND", /YEBS_ADMIN_NOT_FOUND/.test(sql));
check("YEBS_ADMIN_NOT_ACTIVE (role/active)", /v_role\s+IS\s+DISTINCT\s+FROM\s+'admin'\s+OR\s+v_active\s+IS\s+NOT\s+TRUE[\s\S]{0,80}YEBS_ADMIN_NOT_ACTIVE/i.test(sql));
check("actor label DB e-postasından + fallback 'admin'", /v_actor_label\s*:=\s*nullif\(btrim\(coalesce\(v_email/i.test(sql) && /v_actor_label\s*:=\s*'admin'/i.test(sql));
check("actor label body'den ALINMIYOR (yalnız v_email)", !/p_actor_label|p_actor_email/i.test(sql));

// --- Parent tradition existence + FOR KEY SHARE + status gate YOK ---
check("parent existence: SELECT ... FROM public.yebs_traditions WHERE id = p_tradition_id",
  /FROM\s+public\.yebs_traditions\s+WHERE\s+id\s*=\s*p_tradition_id/i.test(sql));
check("parent lock: FOR KEY SHARE", /FOR\s+KEY\s+SHARE/i.test(sql));
check("parent not-found → YEBS_PARENT_TRADITION_NOT_FOUND", /NOT\s+FOUND[\s\S]{0,80}YEBS_PARENT_TRADITION_NOT_FOUND/i.test(sql));
check("parent STATUS GATE YOK (yebs_traditions.status okunmuyor)", !/yebs_traditions[\s\S]{0,120}status/i.test(sql) && !/t\.status|v_parent_status/i.test(sql));

// --- INSERT: yalnız 6 canonical alan; status yazılmıyor ---
const insBlock = sql.match(/INSERT\s+INTO\s+public\.yebs_schools[\s\S]*?RETURNING\s+\*\s+INTO\s+v_created/i)?.[0] || "";
check("INSERT yalnız 6 canonical alan (tradition_id/slug/name_tr/native trio)",
  /tradition_id,\s*slug,\s*name_tr,\s*native_name,\s*native_language_tag,\s*native_script_code/i.test(insBlock));
check("INSERT status/id/created_at/updated_at YAZMIYOR (DB default)", !/\b(status|created_at|updated_at)\b/i.test(insBlock) && !/\(\s*id\s*,/.test(insBlock));
check("INSERT RETURNING * INTO v_created", /RETURNING\s+\*\s+INTO\s+v_created/i.test(sql));

// --- Error mapping ---
check("unique_violation → YEBS_SCHOOL_DUPLICATE", /WHEN\s+unique_violation\s+THEN[\s\S]{0,160}YEBS_SCHOOL_DUPLICATE/i.test(sql));
check("foreign_key_violation → YEBS_PARENT_TRADITION_NOT_FOUND", /WHEN\s+foreign_key_violation\s+THEN[\s\S]{0,160}YEBS_PARENT_TRADITION_NOT_FOUND/i.test(sql));
check("check_violation → YEBS_INVALID_SCHOOL_INPUT", /WHEN\s+check_violation\s+THEN[\s\S]{0,160}YEBS_INVALID_SCHOOL_INPUT/i.test(sql));
check("ham hata mesajında NEW./OLD./% yok", !/RAISE\s+EXCEPTION[^;]*(NEW\.|OLD\.|%)/i.test(sql));

// --- Audit sözleşmesi ---
check("audit action='create'", /'create'/.test(sql));
check("audit entity_type='school'", /'school'/.test(sql));
check("audit outcome='committed'", /'committed'/.test(sql));
check("previous_state NULL + new_state to_jsonb(v_created)", /to_jsonb\(v_created\)/i.test(sql));
check("entity_id = v_created.id", /v_created\.id/i.test(sql));
// changed_fields sabit 6-array
const cfOrder = ["tradition_id", "slug", "name_tr", "native_name", "native_language_tag", "native_script_code"];
let cfSeq = true, last = -1;
for (const f of cfOrder) { const i = sql.indexOf(`'${f}'`); if (i === -1 || i < last) cfSeq = false; last = i; }
check("changed_fields exact 6 alan SABİT sırada", cfSeq && cfOrder.every((f) => new RegExp(`'${f}'`).test(sql)));
check("audit reason = özgün p_reason", /v_created\.id[\s\S]*?p_reason,\s*\n?\s*p_request_id/i.test(sql) || /changed_fields[\s\S]{0,400}p_reason,/i.test(sql));
check("error_code NULL + metadata '{}'", /p_operation_id,\s*NULL,\s*'\{\}'::jsonb/i.test(sql));

// --- Audit atomiklik ---
const updIdx = sql.indexOf("INSERT INTO public.yebs_schools");
const auditIdx = sql.indexOf("INSERT INTO public.yebs_audit_events");
const returnIdx = sql.lastIndexOf("RETURN v_created");
check("canonical INSERT audit INSERT'ten ÖNCE", updIdx !== -1 && auditIdx !== -1 && updIdx < auditIdx);
check("audit INSERT'ten RETURN'e kadar EXCEPTION handler YOK (yutulmuyor)",
  auditIdx !== -1 && returnIdx !== -1 && !/EXCEPTION/i.test(sql.slice(auditIdx, returnIdx)));

// --- Write-gate ---
check("write-gate: REVOKE ALL PRIVILEGES ON TABLE public.yebs_schools FROM service_role",
  /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE\s+public\.yebs_schools\s+FROM\s+service_role/i.test(sql));
check("write-gate: GRANT SELECT ON TABLE public.yebs_schools TO service_role",
  /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.yebs_schools\s+TO\s+service_role/i.test(sql));
check("write-gate: service_role'e GRANT INSERT/UPDATE/DELETE/ALL YOK",
  !/GRANT\s+(ALL|INSERT|UPDATE|DELETE)[\s\S]*?ON\s+TABLE\s+public\.yebs_schools\s+TO\s+service_role/i.test(sql));
check("PUBLIC/anon/authenticated tablo REVOKE",
  /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.yebs_schools\s+FROM\s+PUBLIC/i.test(sql) &&
  /FROM\s+anon/i.test(sql) && /FROM\s+authenticated/i.test(sql));

// --- Function EXECUTE privilege ---
const fnSig = "public\\.yebs_create_school_with_audit\\s*\\(\\s*uuid,\\s*uuid,\\s*uuid,\\s*uuid,\\s*text,\\s*text,\\s*text,\\s*text,\\s*text,\\s*text\\s*\\)";
for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
  check(`REVOKE ALL EXECUTE FROM ${role}`, new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+FROM\\s+${role}`, "i").test(sql));
}
check("GRANT EXECUTE yalnız service_role", new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${fnSig}\\s+TO\\s+service_role`, "i").test(sql));
check("EXECUTE anon/authenticated/PUBLIC'a GRANT edilmiyor", !/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+(anon|authenticated|PUBLIC)\b/i.test(sql));

// --- git blob değişmezliği (D1–D9/AUD1/A0/A1R read + guard) ---
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
  "app/api/admin/yebs/traditions/route.ts",
  "app/api/admin/yebs/traditions/[id]/route.ts",
  "lib/yebs/service/traditions.ts",
  "lib/yebs/service/traditionMutations.ts",
  "scripts/yebs-traditions-read-harness.mjs",
  "scripts/yebs-traditions-update-harness.mjs",
  "scripts/yebs-traditions-write-harness.mjs",
  "scripts/yebs-create-tradition-audit-rpc-harness.mjs",
  "scripts/yebs-update-tradition-audit-rpc-harness.mjs",
  "scripts/yebs-audit-events-schema-harness.mjs",
  // A1R read service + merkezî guard (A1W'de DEĞİŞMEZ).
  // NOT: app/api/admin/yebs/schools/[id]/route.ts artık A1U (Schools Update) fazına
  // aittir — A1U bu dosyaya PATCH ekler → IMMUTABLE listesinden ÇIKARILDI.
  "lib/yebs/service/schools.ts",
  "scripts/migration-timestamp-guard-check.mjs",
];
function blobEq(rel) {
  const abs = resolve(ROOT, rel);
  const wt = execFileSync("git", ["-C", ROOT, "hash-object", abs], { encoding: "utf8" }).trim();
  const base = execFileSync("git", ["-C", ROOT, "rev-parse", `origin/main:${rel}`], { encoding: "utf8" }).trim();
  return wt === base;
}
try {
  for (const f of IMMUTABLE) check(`değişmez (origin/main blob): ${f}`, blobEq(f));
} catch (e) { bad("git blob değişmezlik kontrolü", String(e && e.message)); }

// --- Bu fazın kapsamı: yalnız A1W (create) + A1U (update) hedef dosyaları ---
// A1W create kod/harness'i A1U fazında da izole çalıştırıldığından, kapsam kapısı
// A1U'nun onaylı dosyalarını da kapsar (aksi hâlde bu regresyon A1U worktree'sinde
// yanlış "yabancı dosya" verirdi). A1U dosyaları: update migration + update RPC harness
// + [id] PATCH route + schoolMutations updateSchool + write-harness PATCH assertion'ları.
try {
  const SCOPE_ALLOWED = new Set([
    // A1W (create)
    CANONICAL_REL,
    "app/api/admin/yebs/schools/route.ts",
    "lib/yebs/service/schoolMutations.ts",
    "scripts/yebs-create-school-audit-rpc-harness.mjs",
    "scripts/yebs-schools-write-harness.mjs",
    "scripts/yebs-schools-read-harness.mjs",
    // A1U (update)
    "supabase/migrations/20260821000000_yebs_update_school_with_audit.sql",
    "scripts/yebs-update-school-audit-rpc-harness.mjs",
    "app/api/admin/yebs/schools/[id]/route.ts",
  ]);
  const porcelain = execFileSync("git", ["-C", ROOT, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });
  // Porcelain: "XY PATH" (XY tam 2 kolon). trim() KULLANMA — " M" (modified) durumunu bozar.
  const paths = porcelain.split(/\r?\n/).filter((l) => l.length > 3).map((l) => {
    let p = l.slice(3);
    const a = p.indexOf(" -> ");
    if (a !== -1) p = p.slice(a + 4);
    return p.replace(/^"|"$/g, "");
  });
  const foreign = paths.filter((p) => !SCOPE_ALLOWED.has(p));
  check("kapsam: yalnız A1W+A1U hedef dosyaları değişti/eklendi", foreign.length === 0, foreign.join(" | "));
} catch (e) { bad("kapsam kontrolü", String(e && e.message)); }

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
