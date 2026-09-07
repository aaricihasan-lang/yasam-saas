/**
 * NUMEROLOJİ FAZ 6 / ISSUE #2 — COMBINED SPECIAL DISPLAY (OWNER FINAL, düzeltilmiş).
 *
 * OWNER KESİN KURAL (presentation-only; canonical result/key/lookup DEĞİŞMEZ):
 *   Birden fazla gerçek component'in (≥2) DOĞRUDAN RAW TOPLAMI TAM 22 ya da 33 ise
 *   parantez gösterilir: (22) / (33). BAŞKA HİÇBİR DURUMDA parantez YOK.
 *   REDUCTION YOK — 44/8, 30/3, 38/11, 55/1 gibi indirgeme-tabanlı parantezler KALDIRILDI.
 *
 * Çalıştır:  npx tsx scripts/numeroloji-faz6/combined-reading-harness.ts
 */
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { combinedReadingDisplay } from "@/lib/numeroloji/ortak";
import { valueCandidatesFromResult } from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`  x ${label}${detail ? `  -> ${detail}` : ""}`); }
}
function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}

// Sesli-harf token'ları (Ana Kulvar): 11=AEE, 22=IIAU, 19=IIA, 33=IIIO.
const V: Record<number, string> = { 11: "AEE", 22: "IIAU", 19: "IIA", 33: "IIIO" };
const anaFor = (set: number[]) => calcAnaKulvar(set.map((v) => V[v]).join(" "), "");
const yanFor = (parts: string[]) => calcYanKulvar(parts.join(" "), "");
const C11 = "HC"; // ünsüz 8+3 = 11

// ── PARANTEZ VAR: raw sum tam 22/33 ─────────────────────────────────────────────
eq(anaFor([11, 11]).display, "11/11 (22)", "PAREN-22 [11,11] -> 11/11 (22)");
eq(anaFor([11, 11, 11]).display, "11/11/11 (33)", "PAREN-33 [11,11,11] -> 11/11/11 (33)");
eq(anaFor([11, 22]).display, "11/22 (33)", "PAREN-33 [11,22] -> 11/22 (33)");
eq(anaFor([22, 11]).display, "22/11 (33)", "PAREN-33 [22,11] -> 22/11 (33)");

// ── PARANTEZ YOK: raw sum 22/33 DEĞİL (reduction-tabanlı parantez KALDIRILDI) ─────
const noParen: { set: number[]; display: string }[] = [
  { set: [22, 22], display: "22/22" },
  { set: [11, 19], display: "11/19" },
  { set: [19, 11], display: "19/11" },
  { set: [19, 19], display: "19/19" },
  { set: [11, 33], display: "11/33" },
  { set: [33, 11], display: "33/11" },
  { set: [22, 33], display: "22/33" },
  { set: [11, 11, 22], display: "11/11/22" },
  { set: [11, 22, 22], display: "11/22/22" },
  { set: [11, 11, 11, 11], display: "11/11/11/11" },
];
for (const n of noParen) {
  const r = anaFor(n.set);
  eq(r.display, n.display, `NOPAREN ${JSON.stringify(n.set)} -> ${n.display}`);
  assert(!r.display.includes("("), `NOPAREN ${JSON.stringify(n.set)} parantez YOK`, r.display);
  assert(r.combinedReading === undefined, `NOPAREN ${JSON.stringify(n.set)} combinedReading yok`);
}

// ── REDUCTION-TABANLI PARANTEZLER KESİNLİKLE YOK ────────────────────────────────
{
  const allDisplays = [...noParen.map((n) => n.set), [11,11],[11,11,11],[11,22],[22,11]]
    .map((s) => anaFor(s).display).join(" | ");
  for (const bad of ["44/8", "30/3", "38/11", "55/1", "(11/11)"]) {
    assert(!allDisplays.includes(bad), `NO-REDUCTION: "${bad}" hiçbir display'de yok`, allDisplays);
  }
}

// ── GENEL ALGORİTMA (helper; raw sum tabanlı, özel-ness DEĞİL) ───────────────────
eq(combinedReadingDisplay([11, 11]), "22", "ALG [11,11] raw22 -> 22");
eq(combinedReadingDisplay([11, 11, 11]), "33", "ALG [11,11,11] raw33 -> 33");
eq(combinedReadingDisplay([11, 22]), "33", "ALG [11,22] raw33 -> 33");
eq(combinedReadingDisplay([22, 11]), "33", "ALG [22,11] raw33 -> 33");
eq(combinedReadingDisplay([19, 3]), "22", "ALG [19,3] raw22 -> 22 (özel-ness kriter DEĞİL)");
eq(combinedReadingDisplay([19, 14]), "33", "ALG [19,14] raw33 -> 33");
eq(combinedReadingDisplay([10, 12]), "22", "ALG [10,12] raw22 -> 22");
eq(combinedReadingDisplay([22, 22]), "", "ALG [22,22] raw44 -> '' (reduction YOK)");
eq(combinedReadingDisplay([11, 19]), "", "ALG [11,19] raw30 -> ''");
eq(combinedReadingDisplay([19, 19]), "", "ALG [19,19] raw38 -> ''");
eq(combinedReadingDisplay([22, 33]), "", "ALG [22,33] raw55 -> ''");
// tek component / boş → parantez yok
eq(combinedReadingDisplay([22]), "", "ALG tek [22] -> '' (min 2 component)");
eq(combinedReadingDisplay([33]), "", "ALG tek [33] -> ''");
eq(combinedReadingDisplay([11]), "", "ALG tek [11] -> ''");
// raw 11/19 tek başına hedef değil
eq(combinedReadingDisplay([5, 6]), "", "ALG raw11 -> '' (11 hedef değil)");
eq(combinedReadingDisplay([10, 9]), "", "ALG raw19 -> '' (19 hedef değil)");

// ── KEY UNCHANGED (canonical) — snapshot ────────────────────────────────────────
const keySnapshot: Record<string, string> = {
  "[11,11]": "11", "[11,11,11]": "11", "[11,22]": "11", "[22,11]": "11", "[22,22]": "22",
  "[11,19]": "11", "[19,11]": "11", "[19,19]": "19", "[11,33]": "11", "[33,11]": "11",
  "[22,33]": "22", "[11,11,22]": "11", "[11,22,22]": "22", "[11,11,11,11]": "22",
};
for (const [k, expected] of Object.entries(keySnapshot)) {
  eq(anaFor(JSON.parse(k) as number[]).key, expected, `KEY-UNCHANGED ${k} = ${expected}`);
}

// ── LOOKUP SAFETY: combined (22/33) ASLA aday değil; canonical key aday ──────────
for (const set of [[11, 11], [11, 11, 11], [11, 22], [22, 11]]) {
  const r = anaFor(set);
  const cand = valueCandidatesFromResult(r);
  assert(!!r.combinedReading, `LOOKUP ${JSON.stringify(set)} combinedReading set`);
  assert(!cand.includes(r.combinedReading!), `LOOKUP-SAFE ${JSON.stringify(set)}: "${r.combinedReading}" aday DEĞİL`, JSON.stringify(cand));
  assert(cand.includes(r.key), `LOOKUP ${JSON.stringify(set)}: canonical key "${r.key}" aday`, JSON.stringify(cand));
}

// ── ANA / YAN PARİTE ─────────────────────────────────────────────────────────────
eq(anaFor([11, 11]).display, "11/11 (22)", "PARITY-ANA [11,11]");
eq(yanFor([C11, C11]).display, "11/11 (22)", "PARITY-YAN [11,11] (ünsüz)");

// ── MİXED (non-special var) DOKUNULMADI ─────────────────────────────────────────
{
  const mixed = calcAnaKulvar("AEE E O", ""); // [11,5,6] tek-özel
  eq(mixed.display, "11/11", "MIXED-UNTOUCHED [11,5,6] -> '11/11' (combined YOK)");
  assert(mixed.combinedReading === undefined, "MIXED-UNTOUCHED combinedReading yok");
}

console.log(`\nNUMEROLOJI FAZ 6 / COMBINED READING (raw 22/33): ${pass} PASS - ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Parantez yalnız >=2 component raw sum tam 22/33; reduction-tabanli paren yok; key/lookup canonical.");
