/**
 * NUMEROLOJİ — ANA/YAN KULVAR FARKLI ÖZEL SAYI KOMBİNASYONLARI (OWNER FINAL MODEL).
 *
 * PURE helper `findKulvarSpecialCombinations` doğrular. Canonical engine'e DOKUNMAZ.
 * Owner örneği + Ana synthetic + target-set + disjoint + no-double-count + dedupe +
 * permutation-normalization + canonical-exclusion + no-truncation + perf.
 *
 * Çalıştır:  npx tsx scripts/numeroloji-faz6/kulvar-alternative-combinations-harness.ts
 */
import {
  findKulvarSpecialCombinations,
  findKulvarSpecialCombinationsDetailed,
} from "@/lib/numeroloji/alternativeCombinations";
import { SPECIAL_NUMBERS } from "@/lib/numeroloji/ortak";
import { hesaplaNumeroloji } from "@/lib/numeroloji";
import {
  kulvarAlternativePaths,
  kulvarAlternativeProvenance,
} from "@/app/numeroloji/utils/numerolojiPlainMetin";
import { valueCandidatesFromResult } from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`  x ${label}${detail ? `  -> ${detail}` : ""}`); }
}
function eqArr(actual: string[], expected: string[], label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}

// ── OWNER-YAN-01: gerçek Yan components ──────────────────────────────────────────
{
  const alts = findKulvarSpecialCombinations([5, 3, 3, 22, 8]);
  eqArr(alts, ["22/11/8", "33/8"], "OWNER-YAN-01 [5,3,3,22,8] -> 22/11/8, 33/8");
  assert(!alts.includes("22/19"), "OWNER-YAN-01 canonical 22/19 HARİÇ");
  assert(!alts.includes("11/3"), "OWNER-YAN-01 legacy 11/3 YOK");
  assert(!alts.some((p) => p.includes("(")), "OWNER-YAN-01 parantez syntax YOK");
  assert(new Set(alts).size === alts.length, "OWNER-YAN-01 duplicate path YOK");
}

// ── ANA synthetic (owner section 16-17) ─────────────────────────────────────────
eqArr(findKulvarSpecialCombinations([11, 11]), ["22"], "ANA-ALT-01 [11,11] -> 22");
eqArr(findKulvarSpecialCombinations([11, 11, 11]), ["22/11", "33"], "ANA-ALT-02 [11,11,11] -> 22/11, 33");
eqArr(findKulvarSpecialCombinations([11, 11, 22]), ["22/22", "33/11"], "ANA-ALT-03 [11,11,22] -> 22/22, 33/11");

// ── TARGET SET DETECTION (11/19/22/33) ──────────────────────────────────────────
eqArr(findKulvarSpecialCombinations([3, 8, 9]), ["11/9"], "TARGET-11 [3,8,9] -> 11/9");
eqArr(findKulvarSpecialCombinations([11, 8]), ["19"], "TARGET-19 [11,8] -> 19");
eqArr(findKulvarSpecialCombinations([11, 22]), ["33"], "TARGET-33 [11,22] -> 33");
// 22 target: pair-only bare array = canonical → boş; ek component'le alternatif olur:
eqArr(findKulvarSpecialCombinations([10, 12]), [], "TARGET-22-bare [10,12] canonical == 22 → boş");
eqArr(findKulvarSpecialCombinations([10, 12, 7]), ["19/1", "22/7"], "TARGET-22 [10,12,7] -> 19/1, 22/7");

// ── CANONICAL PATH EXCLUSION ────────────────────────────────────────────────────
{
  const owner = findKulvarSpecialCombinations([5, 3, 3, 22, 8]);
  assert(!owner.includes("22/19"), "EXCL canonical 22/19 alternatiflerde yok");
  // pair-only special == canonical:
  eqArr(findKulvarSpecialCombinations([5, 6]), [], "EXCL [5,6] derived 11 == canonical → boş");
}

// ── NO DOUBLE COUNT / DISJOINT ──────────────────────────────────────────────────
eqArr(findKulvarSpecialCombinations([3, 8, 8]), ["11/8"], "DISJOINT [3,8,8] -> 11/8 (aynı 3 iki 11'de kullanılamaz)");
{
  // İki AYRIK özel grup aynı yolda + 11+8=19 türevi (helper TÜM valid yolları bulur):
  //   19/11/3 = {11,8}->19 + kalan 11 korunur + remainder 3
  //   22/11   = {11,11}->22 + kalan {3,8}->11 (remainder yok)
  //   33      = {11,11,3,8}->33
  const alts = findKulvarSpecialCombinations([11, 11, 3, 8]);
  eqArr(alts, ["19/11/3", "22/11", "33"], "MULTI-SPECIAL [11,11,3,8] -> 19/11/3, 22/11, 33");
}

// ── DEDUPE / PERMUTATION NORMALIZATION ──────────────────────────────────────────
{
  const alts = findKulvarSpecialCombinations([5, 3, 3, 22, 8]);
  // Farklı index seçimleri (ali+demir vs arıcı+demir vs 5+3+3) hepsi 22/11/8 → tek kez:
  assert(alts.filter((p) => p === "22/11/8").length === 1, "DEDUPE 22/11/8 tek kez");
  assert(!alts.includes("11/22/8"), "NORMALIZE ascending permutation yok (11/22/8)");
}

// ── NO SILENT TRUNCATION: tüm unique yollar döner ───────────────────────────────
{
  // [11,11,11,11]: canonical 11/11/11/11; alternatifler 22'li/33'lü/44? gruplar
  const alts = findKulvarSpecialCombinations([11, 11, 11, 11]);
  // beklenen unique: 22/22 ; 33/11 ; 22/11/11 ; (44 özel değil)
  eqArr(alts, ["22/11/11", "22/22", "33/11"], "NO-TRUNC [11,11,11,11] tüm unique yollar");
}

// ── PERF: 10 component < makul süre, çökme yok ──────────────────────────────────
{
  const big = [5, 3, 3, 22, 8, 5, 3, 3, 22, 8];
  const alts = findKulvarSpecialCombinations(big);
  assert(Array.isArray(alts), "PERF 10-component dizi döner (guard/çökme yok)", String(alts.length) + " yol");
  assert(new Set(alts).size === alts.length, "PERF 10-component dedupe tutarlı");
}

// ── EDGE: yetersiz component ────────────────────────────────────────────────────
eqArr(findKulvarSpecialCombinations([]), [], "EDGE boş -> []");
eqArr(findKulvarSpecialCombinations([9]), [], "EDGE tek component -> []");
eqArr(findKulvarSpecialCombinations([1, 2]), [], "EDGE özel yol yok -> []");

// ── END-TO-END: gerçek engine (owner input) + metadata + lookup güvenliği ───────
{
  const out = hesaplaNumeroloji({ firstName: "Hasan ALİ", lastName: "ARICI YILMAZ DEMİR", birthDate: "14.02.1982" });
  const y = out.yanKulvar, a = out.anaKulvar;

  // Canonical DEĞİŞMEZ:
  assert(y.display === "22/19 (11/3)", "E2E YAN canonical display 22/19 (11/3)", y.display);
  assert(y.key === "19", "E2E YAN canonical key 19", y.key);
  assert(a.display === "19/9", "E2E ANA canonical display 19/9", a.display);
  assert(a.key === "9", "E2E ANA canonical key 9", a.key);

  // componentValues metadata:
  eqArr((y.componentValues || []).map(String), ["5", "3", "3", "22", "8"], "E2E YAN componentValues [5,3,3,22,8]");

  // Alternatifler (result üstünden):
  eqArr(kulvarAlternativePaths(y), ["22/11/8", "33/8"], "E2E YAN alternatives -> 22/11/8, 33/8");
  eqArr(kulvarAlternativePaths(a), ["22/6"], "E2E ANA alternatives -> 22/6");

  // Provenance (variant-complete):
  const prov = kulvarAlternativeProvenance(y);
  const yan22 = prov.find((p) => p.path === "22/11/8");
  const yan33 = prov.find((p) => p.path === "33/8");
  assert(!!yan22 && yan22.variants.length >= 2, "E2E YAN 22/11/8 >=2 variant", JSON.stringify(yan22));
  assert(!!yan33 && yan33.variants.length >= 2, "E2E YAN 33/8 >=2 variant", JSON.stringify(yan33));
  assert(
    !!yan22 && yan22.variants.some((v) => v.lines.join(" ").includes("3+8 → 11")) &&
      yan22.variants.some((v) => v.lines.join(" ").includes("5+3+3 → 11")),
    "E2E YAN 22/11/8 hem '3+8 → 11' hem '5+3+3 → 11' yolları korunur",
    JSON.stringify(yan22)
  );

  // KNOWLEDGE LOOKUP GÜVENLİĞİ: alternatif değerler (11,33,8,22/11/8) ASLA aday DEĞİL; key 19 korunur.
  const cand = valueCandidatesFromResult(y);
  assert(cand.includes("19"), "E2E YAN lookup canonical key 19 aday", JSON.stringify(cand));
  assert(!cand.includes("22/11/8") && !cand.includes("33/8"), "E2E YAN lookup alternatif YOL aday DEĞİL", JSON.stringify(cand));
  // İfade/Hayat kulvar değil → alternatif yok:
  eqArr(kulvarAlternativePaths(out.ifadeSayisi), [], "E2E İfade (kulvar değil) alternatif yok");
  eqArr(kulvarAlternativePaths(out.hayatYolu), [], "E2E Hayat (kulvar değil) alternatif yok");
}

// ── PROVENANCE COMPLETENESS (owner patch) ───────────────────────────────────────
// Bir variant'ın değer-bazlı imzası (yalnız değerler; index permutation'a duyarsız).
function variantSig(v: { groups: { sum: number; parts: number[] }[]; remainderParts: number[] }): string {
  const g = v.groups.map((x) => [...x.parts].sort((a, b) => a - b).join("+")).sort();
  const r = [...v.remainderParts].sort((a, b) => a - b).join("+");
  return `${g.join("|")}#${r}`;
}
// Variant'taki tüm kullanılan değerler (gruplar + remainder) = giriş multiseti mi? (no double-use)
function valuesConserved(input: number[], v: { groups: { parts: number[] }[]; remainderParts: number[] }): boolean {
  const used = [...v.groups.flatMap((g) => g.parts), ...v.remainderParts].sort((a, b) => a - b);
  const inp = [...input].filter((x) => x > 0).sort((a, b) => a - b);
  return JSON.stringify(used) === JSON.stringify(inp);
}
function detailPath(comps: number[], path: string) {
  return findKulvarSpecialCombinationsDetailed(comps).find((d) => d.path === path);
}

const OWNER = [5, 3, 3, 22, 8];
{
  const det = findKulvarSpecialCombinationsDetailed(OWNER);
  // PROV-01: owner path count = 2, doğru path'ler
  eqArr(det.map((d) => d.path), ["22/11/8", "33/8"], "PROV-01 owner paths = [22/11/8, 33/8]");

  // PROV-04: numeric path TEK KEZ (duplicate yok)
  assert(new Set(det.map((d) => d.path)).size === det.length, "PROV-04 numeric path tekil (duplicate yok)");

  const p22 = detailPath(OWNER, "22/11/8")!;
  const p33 = detailPath(OWNER, "33/8")!;

  // PROV-02: 22/11/8 iki gerçek varyant — 3+8→11 kalan 5+3, ve 5+3+3→11 kalan 8
  assert(p22.variants.length === 2, "PROV-02 22/11/8 tam 2 variant", String(p22.variants.length));
  assert(
    p22.variants.some((v) => variantSig(v) === "22|3+8#3+5") &&
      p22.variants.some((v) => variantSig(v) === "22|3+3+5#8"),
    "PROV-02 22/11/8 iki değer-gruplayışı (3+8→11 / 5+3+3→11) korunur",
    JSON.stringify(p22.variants.map(variantSig))
  );

  // PROV-03: 33/8 iki gerçek varyant — 3+22+8→33 kalan 5+3, ve 5+3+3+22→33 kalan 8
  assert(p33.variants.length === 2, "PROV-03 33/8 tam 2 variant", String(p33.variants.length));
  assert(
    p33.variants.some((v) => variantSig(v) === "3+8+22#3+5") &&
      p33.variants.some((v) => variantSig(v) === "3+3+5+22#8"),
    "PROV-03 33/8 iki değer-gruplayışı korunur",
    JSON.stringify(p33.variants.map(variantSig))
  );

  // PROV-05: permutation dedupe — aynı değer-gruplayışı iki kez saklanmaz
  assert(new Set(p22.variants.map(variantSig)).size === p22.variants.length, "PROV-05 22/11/8 variant permutation dedupe");
  assert(new Set(p33.variants.map(variantSig)).size === p33.variants.length, "PROV-05 33/8 variant permutation dedupe");

  // PROV-06: farklı gerçek gruplayış korunur (>=2 distinct)
  assert(new Set(p22.variants.map(variantSig)).size >= 2, "PROV-06 22/11/8 >=2 distinct grouping");

  // PROV-07: variant içinde source değeri tekrar kullanılmaz (multiset korunur)
  assert(det.every((d) => d.variants.every((v) => valuesConserved(OWNER, v))), "PROV-07 no double-use (multiset korunur)");

  // PROV-08: remainder provenance doğru — hem [5,3]→8 hem [8]→8 varyantı var
  assert(
    p22.variants.some((v) => v.remainderParts.slice().sort().join(",") === "3,5" && v.remainderValue === 8) &&
      p22.variants.some((v) => v.remainderParts.join(",") === "8" && v.remainderValue === 8),
    "PROV-08 remainder provenance (hem 5+3→8 hem 8→8)"
  );

  // PROV-09: deterministic ordering — iki çağrı birebir aynı
  const a1 = JSON.stringify(findKulvarSpecialCombinationsDetailed(OWNER));
  const a2 = JSON.stringify(findKulvarSpecialCombinationsDetailed(OWNER));
  assert(a1 === a2, "PROV-09 deterministic ordering (iki çağrı identik)");

  // PROV-10: canonical 22/19 HARİÇ
  assert(!det.some((d) => d.path === "22/19"), "PROV-10 canonical 22/19 hariç");
}

// PROV [11,11,11]: numeric path'ler tekil; permutation duplicate variant YOK
{
  const det = findKulvarSpecialCombinationsDetailed([11, 11, 11]);
  eqArr(det.map((d) => d.path), ["22/11", "33"], "PROV-11a [11,11,11] paths = [22/11, 33]");
  const p2211 = detailPath([11, 11, 11], "22/11")!;
  const p33b = detailPath([11, 11, 11], "33")!;
  // Üç 11 değer-bazlı ayırt edilemez → 22/11 tek variant (permutation dedupe)
  assert(p2211.variants.length === 1, "PROV-11b 22/11 tek variant (11'ler permutation dup)", String(p2211.variants.length));
  assert(p33b.variants.length === 1, "PROV-11c 33 tek variant", String(p33b.variants.length));
}

// PROV [11,11,22]: farklı gerçek gruplayışlar korunur, path'ler tekil
{
  const det = findKulvarSpecialCombinationsDetailed([11, 11, 22]);
  eqArr(det.map((d) => d.path), ["22/22", "33/11"], "PROV-12a [11,11,22] paths = [22/22, 33/11]");
  assert(new Set(det.map((d) => d.path)).size === det.length, "PROV-12b [11,11,22] path tekil");
  const p2222 = detailPath([11, 11, 22], "22/22")!;
  // 22/22: {11,11}->22 + mevcut 22 → değer-bazlı tek gruplayış
  assert(p2222.variants.length >= 1 && p2222.variants.every((v) => valuesConserved([11, 11, 22], v)), "PROV-12c 22/22 variant multiset korunur");
}

// ══════════════════════════════════════════════════════════════════════════════
// OWNER FINAL SEMANTIC TEST LOCK — "NORMAL SAYILARDA ALTERNATIVE COMBINATION YOK"
// (TEST-ONLY regression hardening; production motor DEĞİŞMEZ. Owner final kararı:
//  alternatif tarama YALNIZ özel-sayı keşfidir; normal sayılar bağımsız kombine/
//  enumerate EDİLMEZ; özel grup bulununca kalan normal component'ler mevcut reducer
//  ile TEK değere sadeleşir, ayrı yollara BÖLÜNMEZ.)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fixture'ın gerçekten "normal-only" olduğunu motorun SPECIAL_NUMBERS politikasıyla
 * doğrular: hiçbir size>=2 subset'in RAW toplamı SPECIAL_NUMBERS'a (11/19/22/33) düşmemeli.
 * (Politika import edildiği için prompt'tan körlemesine set tanımlanmaz.)
 */
function anySpecialSubsetSizeGE2(comps: number[]): boolean {
  const c = comps.filter((v) => v > 0);
  const n = c.length;
  for (let m = 1; m < 1 << n; m++) {
    let sum = 0;
    let size = 0;
    for (let i = 0; i < n; i++) {
      if (m & (1 << i)) {
        sum += c[i];
        size += 1;
      }
    }
    if (size >= 2 && SPECIAL_NUMBERS.has(sum)) return true;
  }
  return false;
}

// ── FINAL-NORMAL: normal-only component'ler alternatif kombinasyon ÜRETMEZ ──────
// Her fixture ÖNCE policy ile "gerçekten normal-only" doğrulanır, SONRA motor []'a düşmeli.
const NORMAL_ONLY_FIXTURES: { name: string; comps: number[] }[] = [
  { name: "FINAL-NORMAL-01", comps: [1, 2] },
  { name: "FINAL-NORMAL-02", comps: [1, 2, 3] },
  { name: "FINAL-NORMAL-03", comps: [2, 4, 6] },
  { name: "FINAL-NORMAL-04", comps: [7, 9] },
  { name: "FINAL-NORMAL-05", comps: [4, 5] },
  { name: "FINAL-NORMAL-06", comps: [3, 5, 9] },
];
for (const { name, comps } of NORMAL_ONLY_FIXTURES) {
  // (self-check) fixture gerçekten normal-only mu? — özel subset varsa NEGATIVE test yapma.
  assert(
    !anySpecialSubsetSizeGE2(comps),
    `${name} fixture ${JSON.stringify(comps)} gerçekten normal-only (hiçbir size>=2 subset özel değil)`,
    "beklenmedik özel subset bulundu — bu fixture negative test olmamalı"
  );
  // (lock) normal-only components do not create alternative combinations.
  eqArr(
    findKulvarSpecialCombinations(comps),
    [],
    `${name} normal-only components alternatif kombinasyon üretmez ${JSON.stringify(comps)}`
  );
}

// ── FINAL-REMAINDER: özel grup bulununca kalan normal component'ler AYRI yollara ──
//    bölünmez; yalnız mevcut reducer ile TEK normal remainder üretilir. ───────────
// (1) Owner case: 22/11/8 · 3+8→11 varyantında kalan [5,3] TEK değere (8) indirgenir.
{
  const det = findKulvarSpecialCombinationsDetailed([5, 3, 3, 22, 8]);
  const p22 = det.find((d) => d.path === "22/11/8")!;
  const v38 = p22.variants.find((v) => variantSig(v) === "22|3+8#3+5");
  assert(!!v38, "FINAL-REMAINDER-01a owner 22/11/8 · 3+8→11 varyantı mevcut", JSON.stringify(p22.variants.map(variantSig)));
  assert(!!v38 && v38.groups.length === 2, "FINAL-REMAINDER-01b kalan ekstra gruba bölünmedi (yalnız 2 özel grup: {22},{3,8})", String(v38?.groups.length));
  assert(
    !!v38 && v38.remainderParts.slice().sort((a, b) => a - b).join("+") === "3+5" && v38.remainderValue === 8,
    "FINAL-REMAINDER-01c kalan [5,3] mevcut reducer ile TEK değere (8) sadeleşir, bölünmez",
    JSON.stringify(v38)
  );
  eqArr(det.map((d) => d.path), ["22/11/8", "33/8"], "FINAL-REMAINDER-01d owner path seti yalnız [22/11/8, 33/8] (normal grouping path YOK)");
}
// (2) Synthetic: {3,8}→11 özel grubu bulunur; kalan [4,5] TEK değere (9) indirgenir.
//     5/4, 4/5 gibi normal grouping veya normal-number branch ÜRETİLMEZ.
{
  const det = findKulvarSpecialCombinationsDetailed([3, 8, 4, 5]);
  eqArr(det.map((d) => d.path), ["11/9"], "FINAL-REMAINDER-02a [3,8,4,5] tek path 11/9 (normal grouping YOK)");
  const p = det.find((d) => d.path === "11/9")!;
  assert(p.variants.length === 1, "FINAL-REMAINDER-02b [3,8,4,5] 11/9 tek variant", String(p.variants.length));
  const v = p.variants[0];
  assert(v.groups.length === 1 && v.groups[0].sum === 11, "FINAL-REMAINDER-02c yalnız {3,8}→11 özel grubu (kalan ekstra gruba bölünmedi)", JSON.stringify(v.groups));
  assert(
    v.remainderParts.slice().sort((a, b) => a - b).join("+") === "4+5" && v.remainderValue === 9,
    "FINAL-REMAINDER-02d kalan [4,5] mevcut reducer ile TEK değere (9) sadeleşir, bölünmez",
    JSON.stringify(v)
  );
}

// ── FINAL-POSITIVE: negative/remainder lock motoru fazla kısıtlamadı (özel keşif korunur) ──
eqArr(findKulvarSpecialCombinations([5, 3, 3, 22, 8]), ["22/11/8", "33/8"], "FINAL-POSITIVE-01 owner special controls intact (22/11/8 + 33/8)");
eqArr(findKulvarSpecialCombinations([11, 11, 11]), ["22/11", "33"], "FINAL-POSITIVE-02 [11,11,11] special controls intact (22/11 + 33)");
eqArr(findKulvarSpecialCombinations([11, 11, 22]), ["22/22", "33/11"], "FINAL-POSITIVE-03 [11,11,22] special controls intact (22/22 + 33/11)");

// ── FINAL-DEDUPE: equal-value index/name permutations ÇOĞALTILMAZ (owner final) ──
{
  const p = detailPath([11, 11, 11], "22/11")!;
  assert(p.variants.length === 1, "FINAL-DEDUPE-01 [11,11,11] 22/11 variant count = 1 (11+11→22 değer-bazlı tek gruplayış)", String(p.variants.length));
}

// ── FINAL-GROUPING: farklı numeric grouping'ler aynı path altında KORUNUR (owner final) ──
{
  const p22 = detailPath([5, 3, 3, 22, 8], "22/11/8")!;
  const p33 = detailPath([5, 3, 3, 22, 8], "33/8")!;
  assert(
    p22.variants.some((v) => variantSig(v) === "22|3+8#3+5") &&
      p22.variants.some((v) => variantSig(v) === "22|3+3+5#8"),
    "FINAL-GROUPING-01 22/11/8: hem 3+8→11 hem 5+3+3→11 korunur",
    JSON.stringify(p22.variants.map(variantSig))
  );
  assert(
    p33.variants.some((v) => variantSig(v) === "3+8+22#3+5") &&
      p33.variants.some((v) => variantSig(v) === "3+3+5+22#8"),
    "FINAL-GROUPING-02 33/8: hem 3+22+8→33 hem 5+3+3+22→33 korunur",
    JSON.stringify(p33.variants.map(variantSig))
  );
}

console.log(`\nNUMEROLOJI — ANA/YAN FARKLI ÖZEL SAYI KOMBİNASYONLARI: ${pass} PASS - ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Owner örneği 22/11/8 + 33/8; canonical/legacy(11/3) hariç; disjoint + dedupe + normalize + no-trunc.");
