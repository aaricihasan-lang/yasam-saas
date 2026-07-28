// ============================================================
// YEBS API-A2 — Concept + Label MUTATION route/service sözleşme harness'i
//
// SALT-OKUNUR. Route/service kaynak sözleşmesi + A0/A1 migration git-blob
// değişmezliği + kapsam denetimi. Hiçbir mutation/RPC çağrısı YAPMAZ.
// FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const REL = {
  conceptsRoute: "app/api/admin/yebs/concepts/route.ts",
  conceptDetail: "app/api/admin/yebs/concepts/[id]/route.ts",
  labelsRoute: "app/api/admin/yebs/concepts/[id]/labels/route.ts",
  labelItem: "app/api/admin/yebs/concepts/[id]/labels/[labelId]/route.ts",
  conceptMut: "lib/yebs/service/conceptMutations.ts",
  labelMut: "lib/yebs/service/conceptLabelMutations.ts",
};
const P = Object.fromEntries(Object.entries(REL).map(([k, v]) => [k, resolve(ROOT, v)]));

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const skipped = (n, w) => { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));
const read = (p) => readFileSync(p, "utf8");

console.log("\n[A] Dosya kapsamı (6 kod dosyası)");
check("hedef dosyalar mevcut", Object.values(P).every(existsSync),
  Object.entries(P).filter(([, p]) => !existsSync(p)).map(([k]) => k).join(", "));

const S = {};
try { for (const [k, p] of Object.entries(P)) S[k] = read(p); ok("kaynaklar okunabildi"); }
catch (e) { bad("kaynak okunamadı", String(e && e.message)); }

if (Object.keys(S).length === 6) {
  console.log("\n[B] Auth + actor güvenliği (tüm mutation route'ları)");
  for (const [k, verbs] of [["conceptsRoute", ["POST"]], ["conceptDetail", ["PATCH"]], ["labelsRoute", ["POST"]], ["labelItem", ["PATCH", "DELETE"]]]) {
    check(`${k}: verifyAdminRequest`, /verifyAdminRequest\s*\(/.test(S[k]));
    check(`${k}: guard.response`, /return\s+guard\.response/.test(S[k]));
    check(`${k}: actor guard.adminId'den (adminId destructure)`, /const \{ adminId, db \} = guard/.test(S[k]));
    for (const v of verbs) check(`${k}: ${v} export`, new RegExp(`export\\s+async\\s+function\\s+${v}\\s*\\(`).test(S[k]));
  }

  console.log("\n[C] Body allowlist + spoof reddi");
  check("concept create allowlist (5 anahtar)", /ALLOWED_BODY_KEYS = \[\s*"tradition_id",\s*"school_id",\s*"slug",\s*"concept_type",\s*"reason",\s*\]/.test(S.conceptsRoute));
  {
    const m = S.conceptsRoute.match(/ALLOWED_BODY_KEYS = \[([^\]]*)\]/);
    check("concept create allowlist status/actor/request/operation İÇERMİYOR",
      m !== null && !/status|actor_admin_id|request_id|operation_id/.test(m[1]));
  }
  check("concept update allowlist (4 anahtar)", /PATCH_ALLOWED_KEYS = \[\s*"expected_updated_at",\s*"reason",\s*"slug",\s*"concept_type",\s*\]/.test(S.conceptDetail));
  check("concept update: tradition_id/school_id/status allowlist DIŞI", !/PATCH_ALLOWED_KEYS[\s\S]*?(tradition_id|school_id|"status")/.test(S.conceptDetail));
  check("label create allowlist (7 anahtar)", /ALLOWED_BODY_KEYS = \[\s*"language_tag",\s*"script_code",\s*"label",\s*"label_kind",\s*"transliteration_scheme",\s*"is_primary",\s*"reason",\s*\]/.test(S.labelsRoute));
  check("label update allowlist (8 anahtar, concept_id YOK)", /PATCH_ALLOWED_KEYS = \[\s*"expected_updated_at",\s*"reason",\s*"language_tag",\s*"script_code",\s*"label",\s*"label_kind",\s*"transliteration_scheme",\s*"is_primary",\s*\]/.test(S.labelItem));
  check("label update: concept_id patch-dışı", !/PATCH_ALLOWED_KEYS[\s\S]*?concept_id/.test(S.labelItem));
  check("label delete allowlist (yalnız expected+reason)", /DELETE_ALLOWED_KEYS = \["expected_updated_at", "reason"\]/.test(S.labelItem));
  for (const k of ["conceptsRoute", "conceptDetail", "labelsRoute", "labelItem"]) {
    check(`${k}: unknown key → invalid body`, /if \(!allowed\.has\(key\)\) return invalid/.test(S[k]));
    check(`${k}: non-object/array reddi`, /Array\.isArray\(body\)/.test(S[k]));
  }

  console.log("\n[D] Strict UUID + strict timestamp");
  const UUID_RE_SRC = /const UUID_RE =\s*\/\^\[0-9a-f\]\{8\}/;
  for (const k of ["conceptsRoute", "conceptDetail", "labelsRoute", "labelItem"])
    check(`${k}: strict UUID regex`, UUID_RE_SRC.test(S[k]));
  check("concept update: strict expected_updated_at + takvim", /isValidExpectedUpdatedAt/.test(S.conceptDetail) && /daysInMonth/.test(S.conceptDetail));
  check("label item: strict expected_updated_at + takvim", /isValidExpectedUpdatedAt/.test(S.labelItem) && /daysInMonth/.test(S.labelItem));
  check("label item: iki UUID (concept + label) doğrulama", /validateIds\(id, labelId\)/.test(S.labelItem));

  console.log("\n[E] Service: RPC yalnız SECURITY DEFINER üzerinden + ayrı UUID");
  for (const [k, fns] of [["conceptMut", ["yebs_create_concept_with_audit", "yebs_update_concept_with_audit"]],
                          ["labelMut", ["yebs_create_concept_label_with_audit", "yebs_update_concept_label_with_audit", "yebs_delete_concept_label_with_audit"]]]) {
    check(`${k}: server-only`, /import "server-only"/.test(S[k]));
    check(`${k}: doğrudan insert/update/delete/upsert YOK`, !/\.(insert|update|delete|upsert)\s*\(/.test(S[k]));
    check(`${k}: request_id ≠ operation_id (iki ayrı randomUUID)`, /const requestId = crypto\.randomUUID\(\);\s*const operationId = crypto\.randomUUID\(\);/.test(S[k]));
    for (const fn of fns) check(`${k}: ${fn} rpc çağrısı`, new RegExp(`\\.rpc\\("${fn}"`).test(S[k]));
    check(`${k}: ham hata sınıflandırma Set.has (includes/regex yok)`, /\.has\(msg as/.test(S[k]) && !/\.includes\(msg/.test(S[k]));
    check(`${k}: canonical row guard`, /isCanonical\w*Row/.test(S[k]));
  }
  check("label mutations: exact RPC param (p_transliteration_scheme, p_is_primary)", /p_transliteration_scheme: input\.transliterationScheme,\s*p_is_primary: input\.isPrimary/.test(S.labelMut));

  console.log("\n[F] Exact public hata matrisi (map + HTTP)");
  // 403 admin forbidden (var/yok sızmaz)
  for (const k of ["conceptsRoute", "conceptDetail", "labelsRoute", "labelItem"])
    check(`${k}: ADMIN → YEBS_ADMIN_FORBIDDEN 403`, /YEBS_ADMIN_FORBIDDEN"[\s\S]*?status:\s*403/.test(S[k]));
  check("concept dup → 409", /YEBS_CONCEPT_DUPLICATE[\s\S]*?status:\s*409/.test(S.conceptsRoute));
  check("parent school → 404", /YEBS_PARENT_SCHOOL_NOT_FOUND[\s\S]*?status:\s*404/.test(S.conceptsRoute));
  check("label primary conflict → 409", /YEBS_LABEL_PRIMARY_CONFLICT[\s\S]*?status:\s*409/.test(S.labelsRoute));
  check("label dup → 409", /YEBS_LABEL_DUPLICATE[\s\S]*?status:\s*409/.test(S.labelsRoute));
  check("concept status locked → 409", /YEBS_CONCEPT_STATUS_LOCKED[\s\S]*?status:\s*409/.test(S.conceptDetail));
  check("label stale → 409", /YEBS_LABEL_STALE_UPDATE[\s\S]*?status:\s*409/.test(S.labelItem));
  check("delete label 200 + row wrapper", /deleteConceptLabel[\s\S]*?ok: true, row: result\.row \}, \{ status: 200 \}/.test(S.labelItem));
  check("create 201 wrapper (concept)", /ok: true, row: result\.row \}, \{ status: 201 \}/.test(S.conceptsRoute));

  console.log("\n[G] Ham DB mesajı / kullanıcı verisi sızmıyor");
  for (const k of ["conceptMut", "labelMut"]) {
    check(`${k}: error.message yalnız console.error (client'a değil)`, /console\.error\([^)]*error\.message/.test(S[k]));
    check(`${k}: dönen kod sabit union (message döndürmüyor)`, !/return \{ ok: false, code: error\.message/.test(S[k]));
  }
}

console.log("\n[H] A0/A1 + temel şema migration git-blob DEĞİŞMEZLİĞİ");
const FROZEN = [
  "supabase/migrations/20260726210017_yebs_traditions.sql",
  "supabase/migrations/20260726220031_yebs_schools.sql",
  "supabase/migrations/20260726230043_yebs_concepts.sql",
  "supabase/migrations/20260727000000_yebs_concept_labels.sql",
  "supabase/migrations/20260803010000_yebs_audit_events.sql",
  "supabase/migrations/20260805000000_yebs_create_tradition_with_audit.sql",
  "supabase/migrations/20260810000000_yebs_update_tradition_with_audit.sql",
  "supabase/migrations/20260814000000_yebs_create_school_with_audit.sql",
  "supabase/migrations/20260821000000_yebs_update_school_with_audit.sql",
  "app/api/admin/yebs/schools/route.ts",
  "app/api/admin/yebs/schools/[id]/route.ts",
  "app/api/admin/yebs/traditions/route.ts",
  "app/api/admin/yebs/traditions/[id]/route.ts",
  "lib/yebs/service/schools.ts",
  "lib/yebs/service/schoolMutations.ts",
  "lib/yebs/service/traditions.ts",
  "lib/yebs/service/traditionMutations.ts",
  "lib/auth/adminGuard.ts",
];
function gitBlob(ref, path) {
  try { return execFileSync("git", ["rev-parse", `${ref}:${path}`], { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch { return null; }
}
let driftFound = false;
for (const rel of FROZEN) {
  const base = gitBlob("origin/main", rel);
  const head = gitBlob("HEAD", rel);
  if (base === null) { skipped(`blob ${rel}`, "origin/main'de yok"); continue; }
  if (base !== head) { bad(`DEĞİŞMEZLİK ihlali: ${rel}`, `origin/main=${base} HEAD=${head}`); driftFound = true; }
}
if (!driftFound) ok("A0/A1 + temel şema + adminGuard blob'ları origin/main ile AYNI");

console.log("\n[I] Migration timestamp aday tekilliği");
check("concept migration 20260822000000 mevcut", existsSync(resolve(ROOT, "supabase/migrations/20260822000000_yebs_concept_mutations.sql")));
check("label migration 20260823000000 mevcut", existsSync(resolve(ROOT, "supabase/migrations/20260823000000_yebs_concept_label_mutations.sql")));

console.log("\n[J] Canlı salt-okunur (env varsa)");
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const base = BASE_URL.replace(/\/$/, "");
  const cid = "00000000-0000-4000-8000-000000000000";
  const cases = [
    ["POST concepts header eksik → 401", `${base}/api/admin/yebs/concepts`, "POST"],
    ["PATCH concept header eksik → 401", `${base}/api/admin/yebs/concepts/${cid}`, "PATCH"],
    ["POST labels header eksik → 401", `${base}/api/admin/yebs/concepts/${cid}/labels`, "POST"],
    ["DELETE label header eksik → 401", `${base}/api/admin/yebs/concepts/${cid}/labels/${cid}`, "DELETE"],
  ];
  for (const [name, url, method] of cases) {
    try {
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: "{}" });
      check(name, r.status === 401, `status=${r.status}`);
    } catch (e) { skipped(name, `fetch hatası: ${String(e && e.message)}`); }
  }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
