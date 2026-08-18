// ============================================================
// Aromaterapi FAZ 2 — oil_type filter contract birim testi
//
// Gerçek parseListParams doğrulama motorunu (lib/aromaterapi/service/readValidation)
// UI OIL_TYPES ile BİREBİR 6-değerli oil_type allowlist'i üzerinde test eder:
//   - 6 geçerli tip (essential/carrier/maceration/hydrosol/resin/absolute) KABUL
//   - arbitrary tip (banana vb.) REJECT → AROMA_INVALID_FILTER
//   - geçerli ama 0-kayıtlı tip validation'da HATA DEĞİLDİR (equals set edilir; route
//     boş envelope döner — 0-result = normal boş durum, 400 değil).
// FAIL → process.exit(1).  tsx ile: npx tsx scripts/aromaterapi-filter-contract.test.ts
// ============================================================

import { parseListParams } from "../lib/aromaterapi/service/readValidation";

// UI OIL_TYPES ile birebir (aynı 6 değer route OILS_LIST_SPEC allowlist'inde de var).
const SPEC = {
  sorts: { name: { column: "name", ascending: true } },
  filters: {
    type: {
      column: "oil_type",
      allow: ["essential", "carrier", "maceration", "hydrosol", "resin", "absolute"],
    },
  },
} as const;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("Aromaterapi FAZ 2 — oil_type filter contract\n");

// A) 6 geçerli tip KABUL → ok:true, equals.oil_type = tip (validation error YOK).
for (const t of ["essential", "carrier", "maceration", "hydrosol", "resin", "absolute"]) {
  const r = parseListParams(new URLSearchParams(`type=${t}`), SPEC);
  check(`allowlist KABUL: ${t}`, r.ok === true && r.ok && r.value.equals.oil_type === t,
    r.ok ? `equals=${JSON.stringify(r.value.equals)}` : `code=${r.code}`);
}

// B) arbitrary tip REJECT → AROMA_INVALID_FILTER (rastgele oil_type kabul edilmez).
for (const bad of ["banana", "xyz", "ESSENTIAL", "hidrosol"]) {
  const r = parseListParams(new URLSearchParams(`type=${bad}`), SPEC);
  check(`allowlist REJECT: ${bad} → AROMA_INVALID_FILTER`,
    r.ok === false && !r.ok && r.code === "AROMA_INVALID_FILTER",
    r.ok ? "beklenmedik ok:true" : `code=${r.code}`);
}

// C/D/E) hydrosol/resin/absolute geçerli tip: validation PASS eder → route boş kayıtta
//   normal boş envelope döner (0-result = empty state, HATA DEĞİL). Burada validation'ın
//   bu tipleri reddetmediğini (ok:true) doğrularız; DB sonucu (0/N) route katmanının işi.
for (const t of ["hydrosol", "resin", "absolute"]) {
  const r = parseListParams(new URLSearchParams(`type=${t}&page=1&limit=24`), SPEC);
  check(`${t} geçerli tip: validation error YOK (0-result normal boş durum)`,
    r.ok === true && r.ok && r.value.equals.oil_type === t && r.value.limit === 24);
}

// Boş type param → filtresiz (skip); hata değil.
const none = parseListParams(new URLSearchParams("type="), SPEC);
check("boş type param → filtresiz (hata değil)", none.ok === true && none.ok && !("oil_type" in none.value.equals));

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");
