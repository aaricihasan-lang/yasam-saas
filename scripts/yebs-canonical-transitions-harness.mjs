// ============================================================
// YEBS API-TX (TX-C) — CANONICAL LIFECYCLE TRANSITIONS statik sözleşme harness'i
//
// STATİK KAYNAK-SÖZLEŞMESİ doğrulayıcısı. Canlı DB'ye BAĞLANMAZ; migration
// production'a UYGULANMAZ. Migration + service + route metinlerinin güvenlik/
// sözleşme değişmezlerini, exact state machine'leri, EXECUTE ACL'yi, timestamp
// çakışmasını ve A0–A5 protected migration blob'larının SAME kaldığını denetler.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TS = "20260916000000";
const BASENAME = `${TS}_yebs_canonical_transitions.sql`;
const MIGRATION = resolve(ROOT, "supabase/migrations", BASENAME);

let pass = 0, fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function stripSqlComments(src) {
  return src.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n");
}
function git(args) {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }); }
  catch { return ""; }
}

console.log("\n[TX-C] yebs_canonical_transitions sözleşmesi (statik)\n");

if (!existsSync(MIGRATION)) {
  bad("migration dosyası mevcut", MIGRATION);
  console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(1);
}
const raw = readFileSync(MIGRATION, "utf8");
const sql = stripSqlComments(raw);
ok(`migration okunabildi: ${BASENAME}`);

// --- BEGIN/COMMIT ---
check("BEGIN; ile başlar", /^\s*BEGIN;/m.test(sql));
check("COMMIT; ile biter", /COMMIT;\s*$/.test(sql.trim() + "\n"));

// --- Yıkıcı/riskli DDL yok ---
check("CREATE TABLE yok", !/CREATE\s+TABLE/i.test(sql));
check("ALTER TABLE yok", !/ALTER\s+TABLE/i.test(sql));
check("CREATE TRIGGER yok", !/CREATE\s+TRIGGER/i.test(sql));
check("CREATE POLICY yok", !/CREATE\s+POLICY/i.test(sql));
check("DROP yok", !/\bDROP\b/i.test(sql));
check("CREATE OR REPLACE yok (fail-closed CREATE FUNCTION)", !/CREATE\s+OR\s+REPLACE/i.test(sql));
check("tablo grant'ı DEĞİŞTİRİLMEZ (ON TABLE yok)", !/ON\s+TABLE\s+public\.yebs_/i.test(sql));
check("dynamic SQL yok (EXECUTE format)", !/EXECUTE\s+format/i.test(sql));
check("quote_ident yok", !/quote_ident/i.test(sql));
check("fiziksel DELETE yok", !/DELETE\s+FROM/i.test(sql));

// --- Entity RPC sözleşmeleri ---
const ENTITIES = [
  { fn: "yebs_transition_tradition_with_audit", table: "yebs_traditions", type: "tradition", idp: "p_tradition_id", group: "A" },
  { fn: "yebs_transition_school_with_audit", table: "yebs_schools", type: "school", idp: "p_school_id", group: "A" },
  { fn: "yebs_transition_concept_with_audit", table: "yebs_concepts", type: "concept", idp: "p_concept_id", group: "A" },
  { fn: "yebs_transition_source_with_audit", table: "yebs_sources", type: "source", idp: "p_source_id", group: "B" },
  { fn: "yebs_transition_claim_with_audit", table: "yebs_claims", type: "claim", idp: "p_claim_id", group: "C" },
  { fn: "yebs_transition_concept_relation_with_audit", table: "yebs_concept_relations", type: "concept_relation", idp: "p_relation_id", group: "C" },
];

// Fonksiyon gövdesini ($$...$$) ismine göre çıkar.
function bodyOf(fn) {
  const re = new RegExp(
    `CREATE FUNCTION public\\.${fn}\\s*\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`,
  );
  const m = sql.match(re);
  return m ? m[1] : "";
}
// Fonksiyon başlığı (CREATE FUNCTION ... AS $$ arası): SECURITY DEFINER / search_path
// / RETURNS gövdeden ÖNCE geldiği için ayrı çıkarılır.
function headerOf(fn) {
  const re = new RegExp(`CREATE FUNCTION public\\.${fn}\\s*\\([\\s\\S]*?AS \\$\\$`);
  const m = sql.match(re);
  return m ? m[0] : "";
}
function norm(s) { return s.toLowerCase().replace(/\s+/g, " "); }

// Grup bazlı state machine (from,to) matrisleri.
const ALLOWED = {
  A: [
    ["draft", "verified"], ["verified", "approved"], ["verified", "draft"],
    ["approved", "verified"], ["published", "approved"],
  ],
  B: [
    ["draft", "verified"], ["verified", "approved"], ["verified", "draft"],
    ["approved", "verified"], ["published", "approved"],
    ["draft", "archived"], ["verified", "archived"], ["approved", "archived"],
    ["published", "archived"], ["archived", "draft"],
  ],
  C: [
    ["draft", "under_review"], ["under_review", "needs_verification"], ["under_review", "draft"],
    ["needs_verification", "under_review"], ["needs_verification", "draft"],
    ["verified", "needs_verification"], ["approved", "verified"], ["published", "approved"],
    ["draft", "archived"], ["under_review", "archived"], ["needs_verification", "archived"],
    ["verified", "archived"], ["approved", "archived"], ["published", "archived"],
    ["archived", "draft"],
  ],
};
// Bu fazda KESİN kapalı olması gereken kritik geçişler (A7 / yasak).
const FORBIDDEN = {
  A: [["approved", "published"], ["draft", "approved"], ["draft", "published"], ["verified", "published"], ["published", "draft"], ["published", "verified"]],
  B: [["approved", "published"], ["verified", "published"], ["archived", "verified"], ["archived", "approved"], ["archived", "published"]],
  C: [["needs_verification", "verified"], ["verified", "approved"], ["approved", "published"], ["archived", "under_review"], ["archived", "verified"], ["archived", "approved"], ["archived", "published"]],
};
function pairStr(from, to) {
  return `(v_from = '${from}' and p_target_status = '${to}')`;
}

for (const e of ENTITIES) {
  const body = bodyOf(e.fn);
  const header = norm(headerOf(e.fn));
  const n = norm(body);
  check(`[${e.fn}] tanımlı`, body.length > 0);
  check(`[${e.fn}] SECURITY DEFINER`, /security definer/.test(header));
  check(`[${e.fn}] search_path pg_catalog,public`, /set search_path = pg_catalog, public/.test(header));
  check(`[${e.fn}] RETURNS public.${e.table}`, new RegExp(`returns public\\.${e.table}`).test(header));
  check(`[${e.fn}] FOR UPDATE (row lock)`, /for update/.test(n));
  check(`[${e.fn}] expected_updated_at zorunlu`, /p_expected_updated_at is null/.test(n));
  check(`[${e.fn}] stale koruması`, /is distinct from p_expected_updated_at/.test(n));
  check(`[${e.fn}] reason zorunlu (btrim)`, /btrim\(p_reason\)/.test(n) && /length\(p_reason\) > 2000/.test(n));
  check(`[${e.fn}] no-op reddi (STATUS_NOOP)`, /status_noop/.test(n));
  check(`[${e.fn}] audit changed_fields=['status']`, /array\['status'\]::text\[\]/.test(n));
  check(`[${e.fn}] audit entity_type='${e.type}'`, new RegExp(`'${e.type}'`).test(body));
  check(`[${e.fn}] no dynamic/DELETE (gövde)`, !/execute format/.test(n) && !/delete from/.test(n));
  check(`[${e.fn}] 'publish' action ÜRETİLMEZ (→published kapalı)`, !/v_action := 'publish'/.test(n));
  check(`[${e.fn}] 'transition' action var`, /v_action := 'transition'/.test(n));

  // İzinli geçişler mevcut
  for (const [from, to] of ALLOWED[e.group]) {
    check(`[${e.fn}] izinli ${from}→${to}`, n.includes(pairStr(from, to)));
  }
  // Yasak/A7-kapalı geçişler ALLOWLIST'te YOK
  for (const [from, to] of FORBIDDEN[e.group]) {
    check(`[${e.fn}] KAPALI ${from}→${to}`, !n.includes(pairStr(from, to)));
  }

  // EXECUTE ACL — tam signature
  const sig = "uuid, uuid, uuid, uuid, timestamptz, text, text";
  const aclScope = sql;
  for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
    const re = new RegExp(`REVOKE ALL ON FUNCTION public\\.${e.fn}\\(\\s*${sig}\\s*\\) FROM ${role};`);
    check(`[${e.fn}] REVOKE ${role}`, re.test(aclScope));
  }
  const grantRe = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${e.fn}\\(\\s*${sig}\\s*\\) TO service_role;`);
  check(`[${e.fn}] GRANT EXECUTE service_role`, grantRe.test(aclScope));
}

// --- Archive/unpublish/unarchive action doğruluğu (Grup B/C) ---
for (const e of ENTITIES.filter((x) => x.group !== "A")) {
  const n = norm(bodyOf(e.fn));
  check(`[${e.fn}] archive action`, /v_action := 'archive'/.test(n));
  check(`[${e.fn}] unpublish action`, /v_action := 'unpublish'/.test(n));
  check(`[${e.fn}] unarchive metadata`, /transition_kind', 'unarchive'/.test(n) || /'transition_kind', 'unarchive'/.test(n));
}
// Grup A archive/unarchive İÇERMEZ
for (const e of ENTITIES.filter((x) => x.group === "A")) {
  const n = norm(bodyOf(e.fn));
  check(`[${e.fn}] archive action YOK (Grup A)`, !/v_action := 'archive'/.test(n));
  check(`[${e.fn}] 'archived' hedefi YOK (Grup A)`, !/p_target_status = 'archived'/.test(n));
}

// --- Timestamp çakışma kapısı ---
const localSame = readdirSync(resolve(ROOT, "supabase/migrations")).filter((f) => f.startsWith(TS));
check("yerel migrations'ta tek 20260916 dosyası", localSame.length === 1, localSame.join(", "));

const refs = git(["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"])
  .split(/\r?\n/).filter(Boolean);
let tsCollision = "";
for (const ref of refs) {
  const tree = git(["ls-tree", "-r", "--name-only", ref]);
  const hits = tree.split(/\r?\n/).filter((p) => /supabase\/migrations\//.test(p) && p.includes(`/${TS}_`));
  for (const h of hits) {
    const b = h.split("/").pop();
    if (b !== BASENAME) tsCollision += `${ref}:${h} `;
  }
}
check("hiçbir ref'te 20260916 farklı-dosya çakışması yok", tsCollision === "", tsCollision);

// --- A0–A5 protected migration blob'ları SAME (origin/main'e göre diff yok) ---
const PROTECTED = [
  "20260726210017_yebs_traditions.sql", "20260726220031_yebs_schools.sql",
  "20260726230043_yebs_concepts.sql", "20260727000000_yebs_concept_labels.sql",
  "20260728000000_yebs_sources.sql", "20260729000000_yebs_claims.sql",
  "20260730000000_yebs_claim_sources.sql", "20260731000000_yebs_concept_relations.sql",
  "20260801000000_yebs_concept_relation_sources.sql", "20260803010000_yebs_audit_events.sql",
  "20260805000000_yebs_create_tradition_with_audit.sql", "20260810000000_yebs_update_tradition_with_audit.sql",
  "20260814000000_yebs_create_school_with_audit.sql", "20260821000000_yebs_update_school_with_audit.sql",
  "20260822000000_yebs_concept_mutations.sql", "20260823000000_yebs_concept_label_mutations.sql",
  "20260826000000_yebs_source_mutations.sql", "20260828000000_yebs_claim_mutations.sql",
  "20260902000000_yebs_claim_source_mutations.sql", "20260907000000_yebs_concept_relation_mutations.sql",
  "20260908000000_yebs_concept_relation_source_mutations.sql",
];
const changed = git(["diff", "--name-only", "origin/main", "--"]).split(/\r?\n/).filter(Boolean);
let protViol = "";
for (const p of PROTECTED) {
  const full = `supabase/migrations/${p}`;
  if (changed.some((c) => c.replace(/\\/g, "/") === full)) protViol += `${p} `;
}
check("A0–A5 protected migration'lar SAME (origin/main diff yok)", protViol === "", protViol);

// --- Route + service statik kontrolleri ---
const ROUTES = [
  "app/api/admin/yebs/traditions/[id]/transition/route.ts",
  "app/api/admin/yebs/schools/[id]/transition/route.ts",
  "app/api/admin/yebs/concepts/[id]/transition/route.ts",
  "app/api/admin/yebs/sources/[id]/transition/route.ts",
  "app/api/admin/yebs/claims/[id]/transition/route.ts",
  "app/api/admin/yebs/relations/[id]/transition/route.ts",
];
for (const r of ROUTES) {
  const p = resolve(ROOT, r);
  check(`route mevcut: ${r}`, existsSync(p), p);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  check(`[${r}] verifyAdminRequest`, /verifyAdminRequest\(req\)/.test(src));
  check(`[${r}] POST handler`, /export async function POST/.test(src));
  check(`[${r}] parseTransitionBody (strict allowlist)`, /parseTransitionBody\(/.test(src));
  check(`[${r}] transitionErrorResponse map`, /transitionErrorResponse\(/.test(src));
  check(`[${r}] status:200 canonical row`, /\{ ok: true, row: result\.row \}, \{ status: 200 \}/.test(src));
  check(`[${r}] PATCH ile status açılmıyor`, !/export async function PATCH/.test(src));
}

const VAL = resolve(ROOT, "lib/yebs/service/transitionValidation.ts");
if (existsSync(VAL)) {
  const src = readFileSync(VAL, "utf8");
  check("[validation] 422 status kullanılmıyor", !/status: 422/.test(src));
  check("[validation] stale/noop/invalid → 409", /status: 409/.test(src));
  check("[validation] not-found → 404", /status: 404/.test(src));
  check("[validation] admin → 403 (maskeli)", /YEBS_ADMIN_FORBIDDEN/.test(src) && /status: 403/.test(src));
  check("[validation] strict RFC3339 + takvim", /isValidExpectedUpdatedAt/.test(src));
} else {
  bad("transitionValidation.ts mevcut", VAL);
}

console.log(`\n== TX-C SONUC: ${pass} PASS / ${fail} FAIL ==`);
if (fail > 0) {
  console.log("FAIL: " + failures.join(" | "));
  process.exit(1);
}
