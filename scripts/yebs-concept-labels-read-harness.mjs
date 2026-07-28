// ============================================================
// YEBS API-A2R — Concept Labels Salt-Okunur Admin API doğrulama harness'i
//
// SALT-OKUNUR statik kaynak-sözleşmesi denetimi. FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REL = {
  labelsRoute: "app/api/admin/yebs/concepts/[id]/labels/route.ts",
  service: "lib/yebs/service/concepts.ts",
};
const P = Object.fromEntries(Object.entries(REL).map(([k, v]) => [k, resolve(ROOT, v)]));

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const skipped = (n, w) => { skip++; console.log(`  SKIP  ${n}${w ? ` — ${w}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

console.log("\n[A] Dosya / kapsam");
check("hedef dosyalar mevcut", Object.values(P).every(existsSync));
let route = "", svc = "";
try { route = readFileSync(P.labelsRoute, "utf8"); svc = readFileSync(P.service, "utf8"); ok("kaynak okunabildi"); }
catch (e) { bad("kaynak okunamadı", String(e && e.message)); }

if (route && svc) {
  console.log("\n[B] HTTP fiil sözleşmesi (labels collection)");
  check("labels route GET export", /export\s+async\s+function\s+GET\s*\(/.test(route));
  check("labels route POST export (create)", /export\s+async\s+function\s+POST\s*\(/.test(route));
  for (const v of ["PUT", "PATCH", "DELETE"])
    check(`labels route ${v} export ETMİYOR`, !new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(route));
  check("verifyAdminRequest", /verifyAdminRequest\s*\(/.test(route));
  check("guard.response", /return\s+guard\.response/.test(route));
  check("runtime nodejs", /runtime\s*=\s*"nodejs"/.test(route));

  console.log("\n[C] Canonical 10-field label sözleşmesi (service)");
  check("YEBS_CONCEPT_LABEL_COLUMNS açık liste",
    /YEBS_CONCEPT_LABEL_COLUMNS\s*=\s*\n?\s*"id, concept_id, language_tag, script_code, label, label_kind, transliteration_scheme, is_primary, created_at, updated_at"/.test(svc));
  for (const f of ["id", "concept_id", "language_tag", "script_code", "label", "label_kind", "transliteration_scheme", "is_primary", "created_at", "updated_at"])
    check(`canonical alan guard: ${f}`, new RegExp(`o\\.${f}\\b`).test(svc));
  check("is_primary boolean guard", /typeof o\.is_primary === "boolean"/.test(svc));
  check("canonical fail-closed (every isCanonicalLabelRow)", /rows\.every\(isCanonicalLabelRow\)/.test(svc));

  console.log("\n[D] Parent concept not-found ayrımı");
  check("listConceptLabels parent varlık kontrolü", /listConceptLabels[\s\S]*?from\("yebs_concepts"\)[\s\S]*?\.eq\("id", conceptId\)/.test(svc));
  check("concept yoksa YEBS_CONCEPT_NOT_FOUND (boş dizi değil)", /if \(!concept\)\s*\{\s*return \{ ok: false, code: "YEBS_CONCEPT_NOT_FOUND" \}/.test(svc));
  check("route 404 CONCEPT_NOT_FOUND map", /YEBS_CONCEPT_NOT_FOUND[\s\S]*?status:\s*404/.test(route));
  check("invalid concept UUID → 400", /YEBS_INVALID_CONCEPT_ID[\s\S]*?status:\s*400/.test(route));

  console.log("\n[E] Deterministik 6-alan sıra");
  const orderSeq = [
    /\.order\("is_primary",\s*\{\s*ascending:\s*false\s*\}\)/,
    /\.order\("language_tag",\s*\{\s*ascending:\s*true\s*\}\)/,
    /\.order\("script_code",\s*\{\s*ascending:\s*true\s*\}\)/,
    /\.order\("label_kind",\s*\{\s*ascending:\s*true\s*\}\)/,
    /\.order\("created_at",\s*\{\s*ascending:\s*true\s*\}\)/,
    /\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)/,
  ];
  orderSeq.forEach((re, i) => check(`order[${i}] mevcut`, re.test(svc)));
  // sıra doğru mu (indeksler artan)
  const positions = orderSeq.map((re) => svc.search(re));
  check("6-alan sıra doğru dizilim", positions.every((p, i) => i === 0 || (p > positions[i - 1] && p >= 0)));

  console.log("\n[F] Pagination YOK + mutation YOK");
  check("labels listesinde .range/pagination YOK", !/export async function listConceptLabels[\s\S]*?\.range\(/.test(svc));
  check("service .rpc YOK", !/\.rpc\(/.test(svc));
}

console.log("\n[G] Canlı salt-okunur (env varsa)");
const BASE_URL = process.env.YEBS_HARNESS_BASE_URL;
if (!BASE_URL) skipped("canlı HTTP", "YEBS_HARNESS_BASE_URL yok");
else {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/admin/yebs/concepts/00000000-0000-4000-8000-000000000000/labels`;
  try { const r = await fetch(url); check("labels GET header eksik → 401", r.status === 401, `status=${r.status}`); }
  catch (e) { skipped("labels GET 401", `fetch hatası: ${String(e && e.message)}`); }
}

console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) { console.log("Başarısız: " + failures.join(", ")); process.exit(1); }
process.exit(0);
