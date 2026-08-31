/**
 * NUMEROLOJİ TIMING & DEVELOPMENT — golden harness (FAZ 4 / AŞAMA 2).
 *
 * Kaynak: kitap 1. seviye + kitap 2. seviye (canonical). Uydurma sonuç YOK.
 * Çalıştır:  tsx scripts/numeroloji-timing/harness.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  universalYear,
  universalMonth,
  universalDay,
  nominalPersonalYear,
  personalYear,
  personalMonth,
  personalDay,
  evreDonguFromAge,
  computeCycle,
  PERSONAL_MONTH_CATALOG,
  PERSONAL_DAY_CATALOG,
  UNIVERSAL_YEAR_CATALOG,
  PERSONAL_YEAR_CATALOG,
  EVRE_CATALOG,
  DONGU_CATALOG,
  type CalendarDate,
} from "@/lib/numeroloji/timing";
import {
  personalityEnergy,
  birthDayEnergyExactDay,
  yearChakra,
  maturityNumber,
  lifeLesson,
  destinyNumber,
  YEAR_CHAKRA_CATALOG,
  MATURITY_CATALOG,
  BIRTH_DAY_ENERGY_CATALOG,
} from "@/lib/numeroloji/development";
import { reduceKeepMaster11or22 } from "@/lib/numeroloji/timing/reduce";
import { hesaplaPinKodu } from "@/lib/numeroloji";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`);
  }
}
function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}
function completeN(cat: Record<number, string>, n: number, label: string) {
  let ok = true;
  for (let i = 1; i <= n; i++) if (!cat[i] || !cat[i].trim()) ok = false;
  assert(ok && Object.keys(cat).length === n, label, `entries=${Object.keys(cat).length}`);
}

const DOB = "18/02/1987";
const ref = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

// ── UNIVERSAL ────────────────────────────────────────────────────────────────
eq(universalYear(2024).value, 8, "UNIVERSAL-1  2024→8");
eq(universalYear(2025).value, 9, "UNIVERSAL-1b 2025→9");
// UNIVERSAL-DATE 23/01/2024 → yıl8, ay1, gün5, EvrenselGün5
eq(universalYear(2024).value, 8, "UNIVERSAL-DATE year8");
eq(universalMonth(2024, 1).value, 9, "UNIVERSAL-DATE EvrenselAy(8+1)=9");
eq(universalDay(2024, 1, 23).value, 5, "UNIVERSAL-DATE EvrenselGün(8+1+5→14→5)");

// ── PERSONAL YEAR (nominal/active split) ─────────────────────────────────────
eq(nominalPersonalYear(DOB, 2024).value, 1, "PY-NOMINAL 18/02/1987+2024→1");
eq(personalYear(DOB, ref(2024, 2, 17)).active.value, 9, "PY-ACTIVE-BEFORE 17/02/2024→9");
eq(personalYear(DOB, ref(2024, 2, 18)).active.value, 1, "PY-ACTIVE-START 18/02/2024→1");
eq(personalYear(DOB, ref(2025, 2, 17)).active.value, 1, "PY-ACTIVE-END 17/02/2025→1");
eq(personalYear(DOB, ref(2025, 2, 18)).active.value, 2, "PY-NEXT 18/02/2025→2");
{
  const py = personalYear(DOB, ref(2024, 1, 15));
  assert(py.nominal.value === 1 && py.active.value === 9, "PY-SPLIT Jan2024 nominal1 & active9 coexist",
    `nominal=${py.nominal.value} active=${py.active.value}`);
  eq(py.provenance, "SOURCE_SEMANTIC_SPLIT_PERSONAL_YEAR", "PY-SPLIT provenance");
}

// ── PERSONAL MONTH / DAY (use NOMINAL PY) ────────────────────────────────────
eq(personalMonth(DOB, ref(2024, 1, 15)).value, 2, "PM-1 Jan2024 nominalPY1+ay1→2");
eq(personalDay(DOB, ref(2024, 1, 23)).value, 8, "PD-1 23/01/2024 1+2+5→8");
completeN(PERSONAL_MONTH_CATALOG, 9, "PM-CATALOG 9/9");
completeN(PERSONAL_DAY_CATALOG, 9, "PD-CATALOG 9/9");
completeN(UNIVERSAL_YEAR_CATALOG, 9, "UY-CATALOG 9/9");
completeN(PERSONAL_YEAR_CATALOG, 9, "PY-CATALOG 9/9");

// ── EVRE / DÖNGÜ ─────────────────────────────────────────────────────────────
const ed = (age: number) => {
  const r = evreDonguFromAge(age);
  return [r.evreIndex, r.donguIndex];
};
eq(ed(9), [1, 9], "EVRE-AGE9  → Evre1/Döngü9");
eq(ed(10), [2, 1], "EVRE-AGE10 → Evre2/Döngü1");
eq(ed(18), [2, 9], "EVRE-AGE18 → Evre2/Döngü9");
eq(ed(19), [3, 1], "EVRE-AGE19 → Evre3/Döngü1");
eq(ed(27), [3, 9], "EVRE-AGE27 → Evre3/Döngü9");
eq(ed(28), [4, 1], "EVRE-AGE28 → Evre4/Döngü1");
eq(ed(36), [4, 9], "EVRE-AGE36 → Evre4/Döngü9");
eq(ed(37), [5, 1], "EVRE-AGE37 → Evre5/Döngü1");
eq(ed(45), [5, 9], "EVRE-AGE45 → Evre5/Döngü9");
eq(ed(46), [6, 1], "EVRE-AGE46 → Evre6/Döngü1");
eq(ed(73), [9, 1], "EVRE-AGE73 → Evre9/Döngü1");
eq(ed(81), [9, 9], "EVRE-AGE81 → Evre9/Döngü9 (LOCKED boundary)");
{
  const r0 = evreDonguFromAge(0);
  assert(r0.evreIndex === 1 && r0.donguIndex === 1 && r0.status === "SOURCE_BIRTH_YEAR_SPECIAL_CASE",
    "EVRE-AGE0 → Evre1/Döngü1 (SOURCE_BIRTH_YEAR_SPECIAL_CASE)");
  const r81 = evreDonguFromAge(81);
  assert(r81.status === undefined, "EVRE-AGE81 defined (no undefined status at 81)");
  const r82 = evreDonguFromAge(82);
  assert(r82.evreIndex === null && r82.donguIndex === null &&
    r82.status === "SOURCE_RULE_UNDEFINED_AFTER_81",
    "EVRE-AGE82 → undefined/source-safe (age > 81, no invented repeat)");
}
completeN(EVRE_CATALOG, 9, "EVRE-CATALOG 9/9");
completeN(DONGU_CATALOG, 9, "DONGU-CATALOG 9/9");
// PIN-EVRE: age45 → Evre5 → energy = PIN hane 5
{
  const bd = "28/03/1978";
  const cyc = computeCycle(bd, ref(2023, 4, 1)); // age 45
  const pin = hesaplaPinKodu(bd);
  assert(cyc.age === 45, "PIN-EVRE age45 (28/03/1978 @ 2023-04-01)", `age=${cyc.age}`);
  assert(cyc.evre?.index === 5 && cyc.evre?.energy === pin.k5,
    "PIN-EVRE Evre5 energy = PIN hane 5", `energy=${cyc.evre?.energy} k5=${pin.k5}`);
}

// ── YEAR CHAKRA ──────────────────────────────────────────────────────────────
eq(yearChakra(DOB, ref(2024, 6, 1)).value, 1, "YEAR-CHAKRA 18/02 + 2024 → 1");
{
  const yc = yearChakra(DOB, ref(2024, 6, 1)).value;
  const npy = nominalPersonalYear(DOB, 2024).value;
  assert(yc === npy, "YEAR-CHAKRA-SEMANTIC value equals nominal PY (1)", `yc=${yc} npy=${npy}`);
  assert(YEAR_CHAKRA_CATALOG[1] !== PERSONAL_YEAR_CATALOG[1],
    "YEAR-CHAKRA-SEMANTIC identity/catalog different");
}

// ── MATURITY ─────────────────────────────────────────────────────────────────
eq(maturityNumber("Sema", "Caylar", "29/03/1986").value, 1, "MATURITY 29/03/1986 SEMA CAYLAR → 1");
eq(reduceKeepMaster11or22(19), 1, "MATURITY-19 19 does NOT preserve → 1");
eq(reduceKeepMaster11or22(11), 11, "MATURITY-11 11 preserve");
eq(reduceKeepMaster11or22(22), 22, "MATURITY-22 22 preserve");
assert(Object.keys(MATURITY_CATALOG).length === 11 &&
  !!MATURITY_CATALOG["11/2"] && !!MATURITY_CATALOG["22/4"] && !MATURITY_CATALOG["33"],
  "MATURITY-CATALOG 1–9 + 11/2 + 22/4 (33 YOK)");

// ── BIRTH DAY ENERGY (exact 1–31) ────────────────────────────────────────────
completeN(BIRTH_DAY_ENERGY_CATALOG, 31, "BIRTHDAY-CATALOG 31/31");
{
  const b19 = birthDayEnergyExactDay("19/05/1990");
  assert(b19.value === 19 && b19.interpretation === BIRTH_DAY_ENERGY_CATALOG[19],
    "BIRTHDAY-19 exact day=19 (not reduced)", `value=${b19.value}`);
}

// ── PERSONALITY ENERGY ───────────────────────────────────────────────────────
eq(personalityEnergy("15/05/2019").value, 6, "PERSONALITY 15→6");
eq(personalityEnergy("29/03/1986").value, 2, "PERSONALITY-29 29→2");
eq(personalityEnergy("11/05/1990").value, 2, "PERSONALITY-11 11→2");
eq(personalityEnergy("22/05/1990").value, 4, "PERSONALITY-22 22→4");

// ── LIFE LESSON ──────────────────────────────────────────────────────────────
eq(lifeLesson("15/05/2019").value, 11, "LIFE-LESSON 6+5→11 preserve");
{
  const ll = lifeLesson("15/05/2019").value;
  const k5 = hesaplaPinKodu("15/05/2019").k5;
  assert(ll !== k5, "SEMANTIC-LIFE-LESSON Hayat Dersi(11) != PIN Yaşam Dersi(k5)", `ll=${ll} k5=${k5}`);
}

// ── DESTINY (Kader) ──────────────────────────────────────────────────────────
eq(destinyNumber("Mina", "").value, 1, "DESTINY-MINA raw19→1");
eq(destinyNumber("İpek", "Olgun").value, 11, "DESTINY-MASTER11 İpek Olgun → 11 preserve");
eq(reduceKeepMaster11or22(19), 1, "NO-19-MASTER new motors don't preserve 19");
eq(reduceKeepMaster11or22(33), 6, "NO-33-MASTER new motors don't preserve 33 (33→6)");

// ── NO-GLOBAL-DATE (engine source scan) ──────────────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "..", "..");
  const dirs = ["lib/numeroloji/timing", "lib/numeroloji/development"];
  const offenders: string[] = [];
  for (const d of dirs) {
    for (const f of readdirSync(resolve(root, d))) {
      if (!f.endsWith(".ts")) continue;
      const raw = readFileSync(resolve(root, d, f), "utf8");
      // Yorumları soy (yorumlarda "new Date() YOK" geçiyor — false positive olmasın).
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      if (/new Date\(|Date\.now|getFullYear|getMonth|getDate/.test(src)) offenders.push(`${d}/${f}`);
    }
  }
  assert(offenders.length === 0, "NO-GLOBAL-DATE engine has no internal current-date dependency",
    offenders.join(", "));
}

// ── LEAP BIRTHDAY ────────────────────────────────────────────────────────────
{
  const leap = personalYear("29/02/2000", ref(2023, 3, 1)); // 2023 non-leap
  assert(leap.active.status === "SOURCE_RULE_UNDEFINED_FOR_LEAP_BIRTHDAY",
    "LEAP-BIRTHDAY active status = SOURCE_RULE_UNDEFINED_FOR_LEAP_BIRTHDAY");
  assert(leap.nominal.value >= 1 && leap.nominal.value <= 9,
    "LEAP-BIRTHDAY nominal still computed (source-safe)", `nominal=${leap.nominal.value}`);
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\nNUMEROLOJİ TIMING HARNESS — ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
