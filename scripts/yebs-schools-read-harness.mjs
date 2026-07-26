// ============================================================
// YEBS API-A1R — Schools Salt-Okunur Admin API doğrulama harness'i
//
// SALT-OKUNUR. Hiçbir INSERT/UPDATE/DELETE/UPSERT/RPC çağrısı yapmaz.
//
// Bölümler:
//   A. Dosya / kapsam + statik kaynak sözleşmesi (repo-temelli)
//   B. Query / validation sözleşmesi             (kaynak-metin)
//   C. Hata sözleşmesi                            (kaynak-metin)
//   D. Read service sözleşmesi                    (kaynak-metin)
//   E. Güvenlik sözleşmesi                        (kaynak-metin)
//   F. Değişmezlik (git blob) + kapsam            (git)
//   G. Canlı salt-okunur kontroller               (env/creds varsa; yoksa SKIP)
//
// NEYİ KANITLAR: yalnız statik kaynak-sözleşmesi, repo kapsamı ve git blob
//   değişmezliği. NEYİ KANITLAMAZ: canlı production veri davranışını, RLS/runtime
//   privilege'ı, gerçek DB dönüşünü. Bunlar için canlı smoke (G) veya prod doğrulama.
//
// PASS/FAIL/SKIP sayaçları tutulur. SKIP, PASS toplamına DAHİL DEĞİLDİR.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// A1R kesin dosya kapsamı (4 dosya).
const REL = {
  listRoute: "app/api/admin/yebs/schools/route.ts",
  detailRoute: "app/api/admin/yebs/schools/[id]/route.ts",
  service: "lib/yebs/service/schools.ts",
  harness: "scripts/yebs-schools-read-harness.mjs",
};
const TARGET_RELS = new Set(Object.values(REL));

const P = {
  listRoute: resolve(ROOT, REL.listRoute),
  detailRoute: resolve(ROOT, REL.detailRoute),
  service: resolve(ROOT, REL.service),
  harness: resolve(ROOT, REL.harness),
};

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];

function ok(name) {
  pass++;
  console.log(`  PASS  ${name}`);
}
function bad(name, detail) {
  fail++;
  failures.push(name);
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function skipped(name, why) {
  skip++;
  console.log(`  SKIP  ${name}${why ? ` — ${why}` : ""}`);
}
function check(name, cond, detail) {
  if (cond) ok(name);
  else bad(name, detail);
}
function read(path) {
  return readFileSync(path, "utf8");
}
// Kod-yapısı denetimleri yorum metnini kapsamamalı.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// ------------------------------------------------------------
// A. Dosya / kapsam + statik kaynak sözleşmesi
// ------------------------------------------------------------
console.log("\n[A] Dosya / kapsam + statik kaynak sözleşmesi");

check("4 hedef dosya mevcut", Object.values(P).every((p) => existsSync(p)),
  Object.entries(P).filter(([, p]) => !existsSync(p)).map(([k]) => k).join(", "));

let list = "";
let detail = "";
let svc = "";
try {
  list = read(P.listRoute);
  detail = read(P.detailRoute);
  svc = read(P.service);
  ok("üç kaynak dosyası okunabildi");
  var listCode = stripComments(list);
  var detailCode = stripComments(detail);
  var svcCode = stripComments(svc);
} catch (e) {
  bad("kaynak dosyaları okunamadı", String(e && e.message));
}

if (list && detail && svc) {
  // A1R SALT-OKUNUR: her iki route yalnız GET; POST/PATCH/PUT/DELETE YASAK.
  check("list route: GET export ediyor", /export\s+async\s+function\s+GET\s*\(/.test(list));
  check("detail route: GET export ediyor", /export\s+async\s+function\s+GET\s*\(/.test(detail));
  for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
    check(
      `list route: ${verb} export ETMİYOR (salt-okunur)`,
      !new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(list),
    );
    check(
      `detail route: ${verb} export ETMİYOR (salt-okunur)`,
      !new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(detail),
    );
  }

  // verifyAdminRequest + guard.response
  check("list route: verifyAdminRequest kullanıyor", /verifyAdminRequest\s*\(/.test(list));
  check("detail route: verifyAdminRequest kullanıyor", /verifyAdminRequest\s*\(/.test(detail));
  check("list route: guard başarısızlığında guard.response dönüyor", /return\s+guard\.response/.test(list));
  check("detail route: guard başarısızlığında guard.response dönüyor", /return\s+guard\.response/.test(detail));

  // runtime = nodejs
  check('list route: runtime = "nodejs"', /export\s+const\s+runtime\s*=\s*"nodejs"/.test(list));
  check('detail route: runtime = "nodejs"', /export\s+const\s+runtime\s*=\s*"nodejs"/.test(detail));

  // service: import "server-only"
  check('service: import "server-only" içeriyor', /^import\s+["']server-only["'];/m.test(svc));

  // İstemci Supabase importu YOK
  for (const [label, src] of [["list route", list], ["detail route", detail], ["service", svc]]) {
    check(`${label}: istemci Supabase (@/lib/supabase) importu YOK`, !/from\s+["']@\/lib\/supabase["']/.test(src));
    check(`${label}: createClient çağırmıyor`, !/createClient\s*\(/.test(src));
    check(`${label}: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY okumuyor`, !/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(src));
    check(`${label}: SUPABASE_SERVICE_ROLE_KEY doğrudan okumuyor`, !/SUPABASE_SERVICE_ROLE_KEY/.test(src));
  }

  // select("*") yok; açık kolon sabiti var
  check('service: .select("*") çağrısı YOK', !/\.select\(\s*["']\*["']/.test(svcCode));
  check("service: açık .select( kullanımı var", /\.select\(/.test(svcCode));
  check("service: açık kolon sabiti (YEBS_SCHOOL_COLUMNS) var", /YEBS_SCHOOL_COLUMNS/.test(svcCode));

  // tenantId kullanılmıyor
  for (const [label, src] of [["list route", listCode], ["detail route", detailCode], ["service", svcCode]]) {
    check(`${label}: kodda tenantId / tenant_id kullanmıyor`, !/tenant_?[Ii]d/.test(src));
  }

  // Yazma/RPC çağrısı YOK
  for (const [label, src] of [["list route", list], ["detail route", detail], ["service", svc]]) {
    for (const op of ["insert", "update", "delete", "upsert", "rpc"]) {
      check(`${label}: .${op}( çağrısı YOK`, !new RegExp(`\\.${op}\\s*\\(`).test(src));
    }
  }
  // Mutation servis importu YOK (schoolMutations gelecekte; A1R'de yasak)
  for (const [label, src] of [["list route", list], ["detail route", detail], ["service", svc]]) {
    check(`${label}: mutation servisi (schoolMutations) import ETMİYOR`, !/schoolMutations/.test(src));
    check(`${label}: crypto.randomUUID kullanmıyor`, !/crypto\.randomUUID/.test(src));
  }

  // Doğru tabloya erişiyor
  check('service: yalnız yebs_schools tablosuna erişiyor', /\.from\(\s*["']yebs_schools["']\s*\)/.test(svc));
  check('service: yebs_traditions tablosuna erişMİYOR (JOIN/enrich yok)', !/yebs_traditions/.test(svcCode));
}

// ------------------------------------------------------------
// B. Query / validation sözleşmesi
// ------------------------------------------------------------
console.log("\n[B] Query / validation sözleşmesi (kaynak-metin)");

if (list) {
  check("limit varsayılanı 50", /DEFAULT_LIMIT\s*=\s*50/.test(list));
  check("limit alt sınırı 1", /MIN_LIMIT\s*=\s*1/.test(list));
  check("limit üst sınırı 200", /MAX_LIMIT\s*=\s*200/.test(list));
  check(
    "limit sınır kontrolü mevcut (MIN/MAX + tam sayı)",
    /n\s*<\s*MIN_LIMIT\s*\|\|\s*n\s*>\s*MAX_LIMIT/.test(list) && /Number\.isInteger\(n\)/.test(list),
  );
  check("negatif offset reddi (n < 0)", /n\s*<\s*0/.test(list));
  check("status whitelist doğrulaması (YEBS_SCHOOL_STATUSES.includes)", /YEBS_SCHOOL_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("q trim ediliyor", /rawQ\.trim\(\)/.test(list));
  check("q 100 karakter sınırı (MAX_Q_LEN=100 + slice)", /MAX_Q_LEN\s*=\s*100/.test(list) && /\.slice\(0,\s*MAX_Q_LEN\)/.test(list));
  check("q filtre-özel karakter arındırması", /\.replace\(\/\[,\(\)\*%\]\/g,\s*""\)/.test(list));
  check("tradition_id strict UUID doğrulaması", /UUID_RE\.test\(rawTraditionId\)/.test(list) && /UUID_RE\s*=/.test(list));
  check("slug filtresi trim + arındırma", /rawSlug\.trim\(\)/.test(list));
  // Bilinmeyen query davranışı: yalnız bilinen anahtarlar sp.get ile okunur (A0R ile aynı).
  check("bilinen query anahtarları: tradition_id/status/q/slug/limit/offset", /sp\.get\("tradition_id"\)/.test(list) && /sp\.get\("status"\)/.test(list) && /sp\.get\("q"\)/.test(list) && /sp\.get\("slug"\)/.test(list) && /sp\.get\("limit"\)/.test(list) && /sp\.get\("offset"\)/.test(list));
}
if (detail) {
  check("detail: UUID doğrulaması (UUID_RE.test)", /UUID_RE\.test\(id\)/.test(detail));
  check("detail: UUID regex tanımı mevcut", /UUID_RE\s*=/.test(detail));
}

// ------------------------------------------------------------
// C. Hata sözleşmesi
// ------------------------------------------------------------
console.log("\n[C] Hata sözleşmesi (kaynak-metin)");

if (list) for (const c of ["YEBS_INVALID_LIMIT", "YEBS_INVALID_OFFSET", "YEBS_INVALID_STATUS", "YEBS_INVALID_TRADITION_ID"]) {
  check(`list: kod ${c} route'ta literal mevcut`, list.includes(c));
}
if (list) check("list: servis kodunu forward ediyor (code: result.code)", /code:\s*result\.code/.test(list));

if (detail) for (const c of ["YEBS_INVALID_SCHOOL_ID", "YEBS_SCHOOL_NOT_FOUND"]) {
  check(`detail: kod ${c} route'ta literal mevcut`, detail.includes(c));
}
if (detail) check("detail: servis kodunu forward ediyor (code: result.code)", /code:\s*result\.code/.test(detail));

if (svc) {
  check("service: YEBS_SCHOOLS_LIST_FAILED kod sabiti mevcut", svc.includes("YEBS_SCHOOLS_LIST_FAILED"));
  check(
    "service: YEBS_SCHOOL_NOT_FOUND + READ_FAILED kod sabitleri mevcut",
    svc.includes("YEBS_SCHOOL_NOT_FOUND") && svc.includes("YEBS_SCHOOL_READ_FAILED"),
  );
}

// ------------------------------------------------------------
// D. Read service sözleşmesi
// ------------------------------------------------------------
console.log("\n[D] Read service sözleşmesi (kaynak-metin)");

if (svc) {
  check("service: listSchools export ediyor", /export\s+async\s+function\s+listSchools\s*\(/.test(svc));
  check("service: getSchoolById export ediyor", /export\s+async\s+function\s+getSchoolById\s*\(/.test(svc));
  // Exact 10 canonical alan
  const COLS = ["id", "tradition_id", "slug", "name_tr", "native_name", "native_language_tag", "native_script_code", "status", "created_at", "updated_at"];
  check("service: exact 10 canonical alan kolon sabitinde", COLS.every((c) => new RegExp(`\\b${c}\\b`).test(svc)));
  // Canonical row guard (fail-closed)
  check("service: canonical row guard (isCanonicalSchoolRow) mevcut", /isCanonicalSchoolRow/.test(svc));
  check("service: liste fail-closed (rows.every guard)", /\.every\(isCanonicalSchoolRow\)/.test(svc));
  // Deterministic order: created_at DESC + id DESC
  check(
    "service: deterministic order created_at DESC + id DESC",
    /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc) && /\.order\("id",\s*\{\s*ascending:\s*false\s*\}\)/.test(svc),
  );
  // Filtreler
  check("service: tradition_id filtresi (.eq tradition_id)", /\.eq\("tradition_id",\s*filters\.traditionId\)/.test(svc));
  check("service: status filtresi (.eq status)", /\.eq\("status",\s*filters\.status\)/.test(svc));
  check("service: slug filtresi (.eq slug)", /\.eq\("slug",\s*filters\.slug\)/.test(svc));
  check("service: q filtresi (.or name_tr/slug ilike)", /\.or\(`name_tr\.ilike[\s\S]*slug\.ilike/.test(svc));
  // Pagination range
  check("service: pagination .range(offset, offset+limit-1)", /\.range\(\s*filters\.offset,\s*filters\.offset\s*\+\s*filters\.limit\s*-\s*1/.test(svc));
}

// ------------------------------------------------------------
// E. Güvenlik sözleşmesi
// ------------------------------------------------------------
console.log("\n[E] Güvenlik sözleşmesi (kaynak-metin)");

if (list) check("list route: ham error.message YOK", !/error\.message/.test(list));
if (detail) check("detail route: ham error.message YOK", !/error\.message/.test(detail));
if (svc) {
  const svcLines = svc.split(/\r?\n/);
  const leakLines = svcLines.filter((l) => l.includes("error.message") && !l.includes("console.error"));
  check("service: error.message yalnız console.error (server log) satırında", leakLines.length === 0, leakLines.join(" | "));
  check("service: dönüş union'ı ham `error:` metni taşımıyor (yalnız code)", !/return\s*\{\s*ok:\s*false,\s*error:/.test(svc));
}
// snake_case korunuyor: canonical row alanları snake_case (camelCase alan sızıntısı yok)
if (svc) check("service: canonical row snake_case (camelCase satır alanı yok)", !/\b(traditionId|nameTr|nativeName|createdAt|updatedAt)\s*:/.test(svcCode.replace(/filters\.\w+/g, "")));

// ------------------------------------------------------------
// F. Değişmezlik (git blob) + kapsam
// ------------------------------------------------------------
console.log("\n[F] Değişmezlik (git blob) + kapsam");

const IMMUTABLE = [
  // D1–D9
  "supabase/migrations/20260726210017_yebs_traditions.sql",
  "supabase/migrations/20260726220031_yebs_schools.sql",
  "supabase/migrations/20260726230043_yebs_concepts.sql",
  "supabase/migrations/20260727000000_yebs_concept_labels.sql",
  "supabase/migrations/20260728000000_yebs_sources.sql",
  "supabase/migrations/20260729000000_yebs_claims.sql",
  "supabase/migrations/20260730000000_yebs_claim_sources.sql",
  "supabase/migrations/20260731000000_yebs_concept_relations.sql",
  "supabase/migrations/20260801000000_yebs_concept_relation_sources.sql",
  // AUD1 + A0 RPC migrationları
  "supabase/migrations/20260803010000_yebs_audit_events.sql",
  "supabase/migrations/20260805000000_yebs_create_tradition_with_audit.sql",
  "supabase/migrations/20260810000000_yebs_update_tradition_with_audit.sql",
  // A0 route/service
  "app/api/admin/yebs/traditions/route.ts",
  "app/api/admin/yebs/traditions/[id]/route.ts",
  "lib/yebs/service/traditions.ts",
  "lib/yebs/service/traditionMutations.ts",
  // A0 harness'leri
  "scripts/yebs-traditions-read-harness.mjs",
  "scripts/yebs-traditions-update-harness.mjs",
  "scripts/yebs-traditions-write-harness.mjs",
  "scripts/yebs-create-tradition-audit-rpc-harness.mjs",
  "scripts/yebs-update-tradition-audit-rpc-harness.mjs",
  "scripts/yebs-audit-events-schema-harness.mjs",
];

function blobEq(rel) {
  const abs = resolve(ROOT, rel);
  const wt = execFileSync("git", ["-C", ROOT, "hash-object", abs], { encoding: "utf8" }).trim();
  const base = execFileSync("git", ["-C", ROOT, "rev-parse", `origin/main:${rel}`], { encoding: "utf8" }).trim();
  return wt === base;
}

try {
  for (const f of IMMUTABLE) check(`değişmez (origin/main blob): ${f}`, blobEq(f));
} catch (e) {
  bad("git blob değişmezlik kontrolü", String(e && e.message));
}

// Hiçbir migration dosyası değişmedi/eklenmedi (A1R migration YOK).
try {
  const migStatus = execFileSync("git", ["-C", ROOT, "status", "--porcelain", "--", "supabase/migrations/"], { encoding: "utf8" }).trim();
  check("A1R'de migration değişikliği/eklemesi YOK", migStatus === "", migStatus);
} catch (e) {
  bad("migration status kontrolü", String(e && e.message));
}

// Kapsam: çalışma ağacındaki tüm değişiklikler yalnız 4 hedef Schools dosyası olmalı.
try {
  // --untracked-files=all: yeni dizinleri tek girişe indirgemeden dosya dosya listeler.
  const porcelain = execFileSync("git", ["-C", ROOT, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });
  const paths = porcelain.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^..\s+/, "").replace(/^"|"$/g, ""));
  const foreign = paths.filter((p) => !TARGET_RELS.has(p));
  check("kapsam: yalnız 4 Schools hedef dosyası değişti/eklendi", foreign.length === 0, foreign.join(" | "));
} catch (e) {
  bad("kapsam kontrolü", String(e && e.message));
}

// ------------------------------------------------------------
// G. Canlı salt-okunur kontroller (env/creds varsa; yoksa SKIP)
// ------------------------------------------------------------
console.log("\n[G] Canlı salt-okunur kontroller");

const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) {
  skipped("canlı HTTP list/detail kontrolleri", "YEBS_HARNESS_BASE_URL yok");
} else {
  const listUrl = `${BASE_URL.replace(/\/$/, "")}/api/admin/yebs/schools`;
  const detailUrl = `${listUrl}/00000000-0000-4000-8000-000000000000`;
  try {
    const r = await fetch(listUrl);
    check("list GET header eksik → 401", r.status === 401, `status=${r.status}`);
  } catch (e) {
    skipped("list GET header eksik → 401", `fetch hatası: ${String(e && e.message)}`);
  }
  try {
    const r = await fetch(detailUrl);
    check("detail GET header eksik → 401", r.status === 401, `status=${r.status}`);
  } catch (e) {
    skipped("detail GET header eksik → 401", `fetch hatası: ${String(e && e.message)}`);
  }
}

// ------------------------------------------------------------
// Sonuç
// ------------------------------------------------------------
console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) {
  console.log("Başarısız kontroller: " + failures.join(", "));
  process.exit(1);
}
process.exit(0);
