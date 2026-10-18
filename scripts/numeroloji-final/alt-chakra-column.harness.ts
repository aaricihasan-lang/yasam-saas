/**
 * NUMEROLOJİ — FARKLI ÖZEL SAYI KOMBİNASYONLARI · ALTERNATİF ÇAKRA SÜTUNU + RESMÎ OMURGA SAYI KAYBI
 * (2026-10-18). Çalıştır: `npx tsx scripts/numeroloji-final/alt-chakra-column.harness.ts`
 *
 * Kanıtlar:
 *   A. Resmî Çakra Omurgası Ana Kulvar katkısı yapısal bileşenden gelir; [11,11,4] / [22,11,4] /
 *      özel kalan / çoklu özel sayı kayıpları giderildi; HASAN ARICI golden değişmedi.
 *   B. Eski (display-parse) davranışla tam tarama farkı YALNIZ kayıp sınıflarında.
 *   C. Yapısal destekler ekranda gösterilen sayılarla birebir (display tokenları ↔ yapı).
 *   D. Alternatif çakra sütunu: her kombinasyon bağımsız, varyantlar çift sayılmaz, "/0" yok,
 *      Ana = HY + PİN + alternatif; Yan = yalnız kendi katkısı; snapshot mutasyonu yok.
 */
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import {
  anaKulvarCakraDestekleri,
  hesaplaCakraSayiSol,
  hesaplaCakraHarfSag,
  hayatYoluCakraDestekleri,
  pinKoduCakraDestekleri,
  kulvarCakraDestekleri,
  kulvarSayisiCakraDestegi,
} from "@/lib/numeroloji/cakraOmurgasi";
import { findKulvarSpecialCombinationsDetailed } from "@/lib/numeroloji/alternativeCombinations";
import {
  alternativeChakraColumns,
  alternativeVariantSupports,
  alternativeChakraExclusionNote,
} from "@/lib/numeroloji/alternativeChakra";
import { SPECIAL_NUMBERS, reduceNumber, reduceToDigit, splitNameParts, turkishUpper, CHAKRA_LETTER_MAP, VOWELS } from "@/lib/numeroloji/ortak";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, detail?: unknown) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log(`  ✗ ${label}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}
function eq(a: unknown, b: unknown, label: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b });
}
const sortDesc = (xs: number[]) => [...xs].sort((a, b) => b - a);

// ── Sentetik isim parçası: istenen (sesli toplamı, sessiz toplamı) ham değerlerini üretir ──
const VOWEL_STEPS: [string, number][] = [["I", 9], ["O", 6], ["E", 5], ["U", 3], ["A", 1]];
const CONS_STEPS: [string, number][] = [["R", 9], ["H", 8], ["G", 7], ["F", 6], ["N", 5], ["D", 4], ["C", 3], ["B", 2], ["S", 1]];
function letters(target: number, steps: [string, number][]): string[] {
  const out: string[] = [];
  let rest = target;
  for (const [ch, v] of steps) while (rest >= v) { out.push(ch); rest -= v; }
  return out;
}
function word(vowelSum: number, consSum: number): string {
  const v = letters(vowelSum, VOWEL_STEPS);
  const c = letters(consSum, CONS_STEPS);
  const out: string[] = [];
  for (let i = 0; i < Math.max(v.length, c.length); i += 1) {
    if (c[i]) out.push(c[i]);
    if (v[i]) out.push(v[i]);
  }
  return out.join("") || "X"; // X: harf haritasında 6 ama sesli değil → yalnız sessiz; boş kelime olmaz
}
/** Ana bileşenleri (sesli) + Yan bileşenleri (sessiz) → (ad, soyad). Son parça soyad. */
function person(ana: number[], yan: number[]): [string, string] {
  const n = Math.max(ana.length, yan.length);
  const parts = Array.from({ length: n }, (_, i) => word(ana[i] ?? 0, yan[i] ?? 1));
  return [parts.slice(0, -1).join(" ") || parts[0], parts.length > 1 ? parts[parts.length - 1] : parts[0]];
}

// ── ESKİ (2026-10-18 öncesi) Ana Kulvar çakra kuralı — yalnız fark sınıflandırması için kopya ──
function oldSplit(display: string): [number | null, number | null] {
  const text = (display || "").trim().replace(/\s*\([^)]*\)\s*$/, "");
  if (!text) return [null, null];
  if (!text.includes("/")) { const n = Number(text); return Number.isFinite(n) ? [n, null] : [null, null]; }
  const [l, r] = text.split("/", 2);
  return [Number.isFinite(Number(l)) ? Number(l) : null, Number.isFinite(Number(r)) ? Number(r) : null];
}
function oldVowelWord(w: string): number {
  let t = 0;
  for (const ch of Array.from(turkishUpper(w))) if (VOWELS.has(ch)) t += CHAKRA_LETTER_MAP[ch] || 0;
  if (t === 0) return 0;
  if ([11, 22, 33].includes(t)) return 10;
  return reduceToDigit(t);
}
function oldAnaSupports(f: string, l: string): number[] {
  const nameVals = splitNameParts(f, l).map(oldVowelWord).filter(Boolean);
  const [left, right] = oldSplit(calcAnaKulvar(f, l).display);
  if (left !== null && SPECIAL_NUMBERS.has(left) && right !== null) {
    return right >= 1 && right <= 9 ? [10, right] : [10];
  }
  if (!nameVals.length) return [];
  const ak = reduceToDigit(nameVals.reduce((a, b) => a + b, 0));
  return ak >= 1 && ak <= 9 ? [...nameVals, ak] : nameVals;
}

console.log("A. Resmî omurga — sayı kaybı düzeltmeleri");
{
  // HASAN ARICI 14.02.1987 golden (kullanıcı notu s.2) — DEĞİŞMEZ
  eq(anaKulvarCakraDestekleri("Hasan", "ARICI"), [10, 2], "GOLD-01 HASAN Ana Kulvar 19/2 → [10,2]");
  const sol = hesaplaCakraSayiSol("Hasan", "ARICI", "14.02.1987");
  eq([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => sol[c]), [1, 3, 1, 0, 3, 0, 3, 0, 1, 1], "GOLD-02 HASAN sol sütun birebir");
  const m = hesaplaNumeroloji({ firstName: "Hasan", lastName: "ARICI", birthDate: "14.02.1987" });
  eq([m.anaKulvar.display, m.yanKulvar.display, m.hayatYolu.display], ["19/2", "8", "32/5"], "GOLD-03 HASAN ana hesap aynı");
  eq(m.cakraOmurgasi.harfler, hesaplaCakraHarfSag("Hasan", "ARICI"), "GOLD-04 harf sütunu aynı");

  const cases: { label: string; ana: number[]; want: number[]; display: string }[] = [
    { label: "[11,11,4]", ana: [11, 11, 4], want: [10, 10, 4], display: "11/11/4 (22/4)" },
    { label: "[22,11,4]", ana: [22, 11, 4], want: [10, 10, 4], display: "22/11/4 (33/4)" },
    { label: "tek özel 19/5", ana: [19, 5], want: [10, 5], display: "19/5" },
    { label: "22/4", ana: [22, 4], want: [10, 4], display: "22/4" },
    { label: "19/9 (5 parça)", ana: [19, 3, 3, 1, 2], want: [10, 9], display: "19/9 (22/6)" },
    { label: "özel kalan 11/19", ana: [11, 9, 1, 9], want: [10, 10], display: "11/19" },
    { label: "tüm özel 11/11 (22)", ana: [11, 11], want: [10, 10], display: "11/11 (22)" },
    { label: "tüm özel 19/22", ana: [19, 22], want: [10, 10], display: "19/22" },
    { label: "üç özel 11/11/11", ana: [11, 11, 11], want: [10, 10, 10], display: "11/11/11 (33)" },
    { label: "tek parça 19 (kalan yok)", ana: [19, 0], want: [10], display: "19" },
    { label: "tek parça 11 (kalan yok)", ana: [11, 0], want: [10], display: "11" },
    { label: "çift-özel 11/5 (mevcut)", ana: [5, 6], want: [10, 5], display: "11/5" },
    { label: "özel yok 7", ana: [6, 1], want: [6, 1, 7], display: "7" },
    { label: "toplam 19 (özel parça yok, mevcut)", ana: [9, 1, 9], want: [9, 1, 9, 1], display: "19" },
  ];
  for (const c of cases) {
    const [f, l] = person(c.ana, c.ana.map(() => 2));
    const a = calcAnaKulvar(f, l);
    eq(a.componentValues, c.ana, `A-${c.label} bileşenler (${f} ${l})`);
    eq(a.display, c.display, `A-${c.label} display DEĞİŞMEDİ`);
    eq(anaKulvarCakraDestekleri(f, l), c.want, `A-${c.label} çakra desteği`);
    ok(!/\/0(\D|$)/.test(a.display), `A-${c.label} sahte /0 yok`);
  }
}

console.log("B. Tam tarama — eski davranışla fark yalnız kayıp sınıflarında");
const VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 19, 22, 33];
const sweep: number[][] = [];
(function gen(prefix: number[], start: number, maxLen: number) {
  if (prefix.length >= 1 && prefix.length <= maxLen) sweep.push([...prefix]);
  if (prefix.length === maxLen) return;
  for (let i = start; i < VALS.length; i += 1) gen([...prefix, VALS[i]], i, maxLen);
})([], 0, 4);
{
  let changed = 0;
  let unexplained = 0;
  for (const comps of sweep) {
    if (!comps.some((v) => v > 0)) continue;
    const [f, l] = person(comps, comps.map(() => 2));
    const a = calcAnaKulvar(f, l);
    if (JSON.stringify(a.componentValues) !== JSON.stringify(comps)) continue;
    const yeni = anaKulvarCakraDestekleri(f, l);
    const eski = oldAnaSupports(f, l);
    const nz = comps.filter((v) => v > 0);
    const specials = nz.filter((v) => SPECIAL_NUMBERS.has(v));
    const rest = nz.filter((v) => !SPECIAL_NUMBERS.has(v));
    const restRed = rest.length ? reduceNumber(rest.reduce((x, y) => x + y, 0), true) : 0;
    // Yeni: hiçbir özel parça kaybolmaz; kalan varsa kaybolmaz.
    if (specials.length) {
      ok(yeni.filter((v) => v === 10).length === specials.length + (SPECIAL_NUMBERS.has(restRed) ? 1 : 0), "B-10 sayısı = özel sayı adedi", { comps, yeni });
      if (rest.length) ok(yeni.length === specials.length + 1, "B-kalan korunur", { comps, yeni });
      else ok(yeni.length === specials.length, "B-kalan yoksa ek destek yok", { comps, yeni });
    }
    if (JSON.stringify(yeni) !== JSON.stringify(eski)) {
      changed += 1;
      const lossClass =
        specials.length >= 2 || // çoklu özel sayı (ikinci özel/kalan kayboluyordu)
        (specials.length === 1 && rest.length > 0 && SPECIAL_NUMBERS.has(restRed)) || // özel kalan düşüyordu
        (specials.length === 1 && rest.length === 0) || // tek özel parça: 19 → [1,1], 11 → [10,1] tutarsızlığı
        (specials.length === 0 && eski.length === 1 && yeni.length === 2 && yeni[1] === 10); // ikili özel + özel kalan ("11/11") düşüyordu
      if (!lossClass) {
        unexplained += 1;
        console.log("   açıklanamayan fark", comps, { eski, yeni });
      }
    }
  }
  ok(unexplained === 0, "B-açıklanamayan fark YOK", { unexplained });
  ok(changed > 0, "B-kayıp sınıfları gerçekten düzeltildi", { changed });
  console.log(`   tarama: ${sweep.length} bileşen dizisi, değişen ${changed} (tamamı kayıp sınıfı)`);
}

console.log("C. Yapısal destek ↔ ekrandaki sayılar birebir");
{
  let checked = 0;
  for (const comps of sweep) {
    if (!comps.some((v) => v > 0)) continue;
    const [f, l] = person(comps, comps.map(() => 2));
    const a = calcAnaKulvar(f, l);
    if (JSON.stringify(a.componentValues) !== JSON.stringify(comps)) continue;
    const s = kulvarCakraDestekleri(comps);
    if (!s) continue;
    const main = a.display.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const tokens = main.split(/[/-]/).map(Number).filter((n) => Number.isFinite(n));
    const fromDisplay = tokens.map(kulvarSayisiCakraDestegi).filter((x): x is number => x !== null);
    // Tek parça özel (display "19") hariç tümünde display tokenları = yapısal destekler.
    eq(sortDesc(s), sortDesc(fromDisplay), `C-${JSON.stringify(comps)} display ${a.display}`);
    checked += 1;
  }
  console.log(`   ${checked} özel Ana Kulvar oluşumu doğrulandı`);
}

console.log("D. Alternatif çakra sütunu");
{
  // Owner ekranı: Ana 19/9 → alt 22/6 · Yan 22/19 → alt 22/11/8 + 33/8
  const [f, l] = person([19, 3, 3, 1, 2], [5, 3, 3, 22, 8]);
  const m = hesaplaNumeroloji({ firstName: f, lastName: l, birthDate: "14.02.1987" });
  eq([m.anaKulvar.display, m.yanKulvar.display], ["19/9 (22/6)", "22/19 (11/3)"], "D-OWNER ana/yan display (özet ekranında parantez gizlenir → 19/9, 22/19)");
  const anaCols = alternativeChakraColumns(m, "ana");
  const yanCols = alternativeChakraColumns(m, "yan");
  eq(anaCols.map((c) => c.path), ["22/6"], "D-OWNER Ana alternatifleri");
  eq(yanCols.map((c) => c.path), ["22/11/8", "33/8"], "D-OWNER Yan alternatifleri");
  eq(anaCols[0].altSupports, [10, 6], "D-22/6 katkı [10,6]");
  eq(yanCols.map((c) => c.altSupports), [[10, 10, 8], [10, 8]], "D-22/11/8 → [10,10,8], 33/8 → [10,8]");
  eq(yanCols.map((c) => c.variantCount), [2, 2], "D-Yan yollar 2'şer varyant (tek kez sayılır)");
  // Ana = HY + PİN + alternatif (resmî Ana katkısı çıkarılmış)
  const hy = hayatYoluCakraDestekleri("14.02.1987");
  const pin = pinKoduCakraDestekleri("14.02.1987");
  eq(anaCols[0].fixed, { hayatYolu: hy, pin }, "D-Ana sabit katkılar = HY + PİN");
  eq(anaCols[0].officialAnaSupports, [10, 9], "D-Resmî Ana katkısı 19/9 → [10,9]");
  const expected: Record<number, number> = {};
  for (let c = 1; c <= 10; c += 1) expected[c] = 0;
  for (const v of [...hy, ...pin, 10, 6]) expected[v] += 1;
  eq(anaCols[0].sayilar, expected, "D-Ana alternatif sayı sütunu");
  // Resmî omurga = HY + PİN + resmî Ana → alternatif sütun yalnız Ana katkısı kadar farklı
  const resmi = m.cakraOmurgasi.sayilar as Record<number, number>;
  const fark = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => anaCols[0].sayilar[c] - resmi[c]);
  eq(fark, [0, 0, 0, 0, 0, 1, 0, 0, -1, 0], "D-fark yalnız 9→6 (10 korunur)");
  eq(anaCols[0].harfler, m.cakraOmurgasi.harfler, "D-harf sütunu kayıttaki haliyle");
  // Yan: yalnız kendi katkısı; resmî omurgaya aktarım yok
  eq(yanCols[0].fixed, null, "D-Yan sabit katkı yok");
  eq(yanCols[0].harfler, null, "D-Yan harf sütunu yok");
  eq(Object.values(yanCols[0].sayilar).reduce((a, b) => a + b, 0), 3, "D-Yan 22/11/8 sütun toplam 3 destek");
  ok(alternativeChakraExclusionNote("yan").includes("dâhil değildir"), "D-Yan dahil edilmeyenler açıkça yazılı");

  // Snapshot mutasyonu yok (panel aç/kapa kayıt güncellemez — saf fonksiyon)
  const snap = JSON.parse(JSON.stringify(m));
  const before = JSON.stringify(snap);
  const deepFreeze = (o: unknown): unknown => {
    if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
    return o;
  };
  deepFreeze(snap);
  alternativeChakraColumns(snap, "ana");
  alternativeChakraColumns(snap, "yan");
  eq(JSON.stringify(snap), before, "D-snapshot değişmedi (donmuş nesne üzerinde çalışır)");

  // Eski kayıt: componentValues yok → alternatif yok (çökme yok)
  const legacy = JSON.parse(JSON.stringify(m));
  delete legacy.anaKulvar.componentValues;
  delete legacy.yanKulvar.componentValues;
  eq([alternativeChakraColumns(legacy, "ana").length, alternativeChakraColumns(legacy, "yan").length], [0, 0], "D-componentValues olmayan eski kayıt → panel yok");
  // Eski metodoloji HY gösterimi ("37/1") kayıttaki gibi okunur, yeniden hesaplanmaz
  const legacyHy = JSON.parse(JSON.stringify(m));
  legacyHy.hayatYolu.display = "37/1";
  eq(alternativeChakraColumns(legacyHy, "ana")[0].fixed?.hayatYolu, [3, 7, 1], "D-eski HY gösterimi kayıttan okunur");
  eq(alternativeChakraColumns(null, "ana"), [], "D-null motor güvenli");
}

{
  // Kombinasyon izolasyonu + varyant tutarlılığı + "/0" yok — tam tarama (≤5 bileşen)
  const sweep5: number[][] = [];
  (function gen(prefix: number[], start: number) {
    if (prefix.length >= 2) sweep5.push([...prefix]);
    if (prefix.length === 5) return;
    for (let i = start; i < VALS.length; i += 1) if (VALS[i] > 0) gen([...prefix, VALS[i]], i);
  })([], 0);
  let paths = 0;
  for (const comps of sweep5) {
    const combos = findKulvarSpecialCombinationsDetailed(comps);
    const cols = alternativeChakraColumns({ yanKulvar: { componentValues: comps } }, "yan");
    eq(cols.map((c) => c.path), combos.map((c) => c.path), `D-${JSON.stringify(comps)} sütun sayısı = alternatif sayısı (üst sınır yok)`);
    for (const combo of combos) {
      paths += 1;
      ok(!/\/0(\/|$)/.test(combo.path) && !combo.path.startsWith("0"), "D-yol sahte /0 içermez", { comps, path: combo.path });
      const sigs = new Set(combo.variants.map((v) => JSON.stringify(alternativeVariantSupports(v))));
      ok(sigs.size === 1, "D-aynı yolun tüm varyantları aynı katkı (çift sayım yok)", { comps, path: combo.path });
      const sup = alternativeVariantSupports(combo.variants[0]);
      const pathNums = combo.path.split("/").map(Number);
      eq(sortDesc(sup), sortDesc(pathNums.map((n) => kulvarSayisiCakraDestegi(n)!)), `D-${combo.path} katkı = yoldaki her sayı`);
      // Her varyant: kullanılan bileşen sayısı = bileşen sayısı (kayıp/çift kullanım yok)
      for (const v of combo.variants) {
        const used = [...v.groups.flatMap((g) => g.parts), ...v.remainderParts].sort((a, b) => a - b);
        eq(used, [...comps].sort((a, b) => a - b), `D-${combo.path} bileşenler tam bir kez kullanıldı`);
      }
    }
    // Bağımsızlık: her sütun yalnız kendi katkısı
    for (let i = 0; i < cols.length; i += 1) {
      const total = Object.values(cols[i].sayilar).reduce((a, b) => a + b, 0);
      ok(total === cols[i].altSupports.length, "D-sütun yalnız kendi katkısını içerir", { comps, path: cols[i].path });
    }
  }
  console.log(`   ${sweep5.length} bileşen dizisi, ${paths} alternatif yol doğrulandı`);
}

console.log("E. Gerçek isim senaryoları (2/3/4 parçalı, çift soyisim)");
{
  const people: [string, string][] = [
    ["Hasan", "ARICI"], ["Hasan Ali", "ARICI"], ["Hasan", "ARICI YILMAZ"], ["Hasan Ali", "ARICI YILMAZ"],
    ["Ayşe Nur", "KAYA"], ["Mehmet Emin", "ÖZTÜRK ŞAHİN"], ["Zeynep", "DEMİR"], ["İsmail", "KAYA"],
  ];
  for (const [f, l] of people) {
    const m = hesaplaNumeroloji({ firstName: f, lastName: l, birthDate: "14.02.1987" });
    for (const kind of ["ana", "yan"] as const) {
      const r = kind === "ana" ? m.anaKulvar : m.yanKulvar;
      const cols = alternativeChakraColumns(m, kind);
      eq(cols.map((c) => c.path), findKulvarSpecialCombinationsDetailed(r.componentValues ?? []).map((c) => c.path), `E-${f} ${l} ${kind} tüm alternatifler panelli`);
      for (const c of cols) ok(!c.path.includes("/0"), `E-${f} ${l} ${c.path} /0 yok`);
    }
    // Resmî sol sütun = HY + PİN + yapısal Ana
    const sol = hesaplaCakraSayiSol(f, l, "14.02.1987");
    const exp: Record<number, number> = {};
    for (let c = 1; c <= 10; c += 1) exp[c] = 0;
    for (const v of [...hayatYoluCakraDestekleri("14.02.1987"), ...pinKoduCakraDestekleri("14.02.1987"), ...anaKulvarCakraDestekleri(f, l)]) exp[v] += 1;
    eq(sol, exp, `E-${f} ${l} resmî sol sütun bileşimi`);
    eq(calcYanKulvar(f, l).display, m.yanKulvar.display, `E-${f} ${l} Yan display deterministik`);
  }
}

console.log(`\nalt-chakra-column harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
