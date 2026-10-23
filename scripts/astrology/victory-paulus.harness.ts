/**
 * ZAFER (VICTORY) LOTU — PAULUS YEREL HESABI (2026-10-23) harness'i. Gerçek sağlayıcı / DB YOK; kayıtlı GERÇEK yanıtlar (golden).
 * Kaynak (Hermetik lotlar): Paulus Alexandrinus, Introductory Matters (Greenbaum çev., Late Classical Astrology, ARHAT 2001) +
 * Olympiodorus: Zafer = gündüz Yükselen + Jüpiter − Ruh, gece ters. Sağlayıcı terimleri TERS sırada kullanıyor (sect ters).
 * Özdeşlik: gündüz Fortuna + Ruh = 2·ASC ve gece de 2·ASC ⇒ Paulus Zafer = Fortuna + Ruh − Zafer(sağlayıcı), mod 360 (kesin).
 *   A  gündüz / gece golden: yerel Zafer = SE Paulus referansı ≤0,001°; sağlayıcı değeri `localFrom` içinde; formül Paulus
 *   B  sağlayıcı yöntemi düzelirse (Paulus sırası): yerel hesap YOK, sağlayıcı değeri aynen (işaretsiz)
 *   C  fail-closed: Zafer formülü ne Paulus ne tam tersi → hata (değer üretilmez); Fortuna/Ruh sect dışı → hata
 *   D  eski kayıt (localFrom yok, traditional=false) gizli kalır; sağlayıcının Zafer yorum metni her durumda gizli
 *   E  özdeşliğin cebirsel kanıtı: rastgele 10.000 harita (ASC, Güneş, Ay, Jüpiter) × gündüz/gece
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/victory-paulus.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extraExpectOf, projectRoxyLots } from "@/lib/astrology/providers/roxy/extraPoints";
import { arcDiff, lotFormulaFor, lotPositionWithheld, n360, VICTORY_LOCAL_METHOD } from "@/lib/astrology/model/westernExtraPoints";
import { LOT_VICTORY_LOCAL_NOTE } from "@/lib/astrology/labels/extraPoints";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const GOLD = join(__dirname, "fixtures", "golden");
const G = (n: string) => JSON.parse(readFileSync(join(GOLD, `${n}.json`), "utf8")) as { body: J; response: J };
const REF = JSON.parse(readFileSync(join(__dirname, "fixtures", "extra-points-reference-swisseph.json"), "utf8"));
let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
const expectOf = (g: { body: J }) => extraExpectOf(g.body, "lots");
const proj = (name: string, mut?: (r: J) => void) => {
  const g = G(name);
  const r = structuredClone(g.response);
  mut?.(r);
  return projectRoxyLots(r, expectOf(g));
};
const vic = (p: J) => p.technical.lots.find((l: J) => l.id === "victory");

async function main() {
  await t("A gündüz (extra-lots) + gece (extra-lots-night): yerel Zafer = SE Paulus referansı ≤0,001°; formül Paulus; sağlayıcı değeri localFrom'da; gösterilir", () => {
    for (const [name, key] of [["extra-lots", "A"], ["extra-lots-night", "N"]] as const) {
      const p = proj(name);
      assert.ok(p.ok, JSON.stringify(!p.ok && p.errors));
      const v = vic(p);
      const provider = G(name).response.lots.find((x: J) => x.id === "victory");
      const exp = lotFormulaFor("victory", (p as J).technical.sect);
      assert.ok(arcDiff(v.longitude, REF.lots[key].paulus.victory) < 1e-3, `${name}: ${v.longitude} ≠ ${REF.lots[key].paulus.victory}`);
      assert.deepEqual([v.plus, v.minus, v.traditional], [exp.plus, exp.minus, true]);
      assert.equal(v.localFrom.method, VICTORY_LOCAL_METHOD);
      assert.ok(Math.abs(v.localFrom.providerLongitude - provider.longitude) < 1e-12);
      assert.deepEqual([v.localFrom.providerPlus, v.localFrom.providerMinus], [exp.minus, exp.plus]);
      assert.ok(Math.abs(v.degreeInSign - (v.longitude % 30)) < 1e-9 && v.sign);
      assert.equal(lotPositionWithheld(v), false, "yerel değer gösterilir");
      for (const id of ["fortune", "spirit", "eros", "necessity", "courage", "nemesis"]) {
        const l = (p as J).technical.lots.find((x: J) => x.id === id);
        assert.ok(!("localFrom" in l) && arcDiff(l.longitude, REF.lots[key].paulus[id]) < 1e-3, `${name} ${id} değişmedi`);
      }
    }
  });

  await t("B sağlayıcı Paulus sırasını kullanırsa (düzelirse): yerel hesap YOK, değer sağlayıcınınki, işaret yok", () => {
    const p = proj("extra-lots", (r) => {
      const L = Object.fromEntries(r.lots.map((l: J) => [l.id, l]));
      const paulus = n360(L.fortune.longitude + L.spirit.longitude - L.victory.longitude);
      Object.assign(L.victory, { longitude: paulus, degree: paulus % 30, sign: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"][Math.floor(paulus / 30)], formula: "Ascendant + Jupiter - Part of Spirit" });
    });
    assert.ok(p.ok, JSON.stringify(!p.ok && p.errors));
    const v = vic(p);
    assert.equal("localFrom" in v, false);
    assert.equal(v.traditional, true);
    assert.ok(arcDiff(v.longitude, REF.lots.A.paulus.victory) < 1e-3);
  });

  await t("C fail-closed: Zafer formülü Paulus çiftinin dışında → RED; Fortuna sect dışı → RED (yerel hesap yapılmaz)", () => {
    const a = proj("extra-lots", (r) => (r.lots.find((l: J) => l.id === "victory").formula = "Ascendant + Jupiter - Part of Fortune"));
    assert.equal(a.ok, false);
    const b = proj("extra-lots", (r) => (r.lots.find((l: J) => l.id === "fortune").formula = "Ascendant + Sun - Moon"));
    assert.equal(b.ok, false);
  });

  await t("D eski kayıt (localFrom yok, traditional=false) gizli; yorum metni (yalnız kimlik) gizli; not metni marka-nötr", () => {
    assert.equal(lotPositionWithheld({ id: "victory", traditional: false }), true);
    assert.equal(lotPositionWithheld({ id: "victory" }), true, "sağlayıcı Zafer yorum metni (yanlış burç) gösterilmez");
    assert.equal(lotPositionWithheld({ id: "victory", traditional: true, localFrom: { method: VICTORY_LOCAL_METHOD } }), false);
    assert.equal(lotPositionWithheld({ id: "nemesis", traditional: true }), false);
    assert.ok(LOT_VICTORY_LOCAL_NOTE.includes("Paulus") && !/roxy/i.test(LOT_VICTORY_LOCAL_NOTE));
  });

  await t("E özdeşlik: 10.000 rastgele harita × gündüz/gece — Fortuna + Ruh − Zafer(ters) = Zafer(Paulus) (kayan nokta ≤1e-9°)", () => {
    let s = 7;
    const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 360;
    for (let i = 0; i < 10000; i++) {
      const [asc, sun, moon, jup] = [r(), r(), r(), r()];
      for (const day of [true, false]) {
        const F = n360(day ? asc + moon - sun : asc + sun - moon);
        const S = n360(day ? asc + sun - moon : asc + moon - sun);
        const paulus = n360(day ? asc + jup - S : asc + S - jup);
        const reversed = n360(day ? asc + S - jup : asc + jup - S);
        assert.ok(arcDiff(n360(F + S - reversed), paulus) < 1e-9);
      }
    }
  });

  await t("F sect sınırı (GERÇEK 4 yanıt, 24.10; İstanbul, Güneş ufka ±3 dk): sağlayıcı sect = bağımsız geometrik ufuk; yerel Zafer = bağımsız Paulus ≤0,01″; formül yönü sect'e göre", () => {
    const DIR = join(GOLD, "..", "victory-sect");
    for (const n of ["lot-ist-dogus-3dk", "lot-ist-dogus+3dk", "lot-ist-batis-3dk", "lot-ist-batis+3dk"]) {
      const g = JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8")) as { body: J; response: J; expectIndependent: { sect: "day" | "night"; victoryPaulus: number } };
      const r = projectRoxyLots(g.response, extraExpectOf(g.body, "lots"));
      assert.ok(r.ok, `${n}: ${r.ok ? "" : r.errors.join("; ")}`);
      const tech = (r as J).technical;
      assert.equal(tech.sect, g.expectIndependent.sect, `${n}: sect`);
      const v = (tech.lots as J[]).find((l) => l.id === "victory");
      assert.ok(v.localFrom && v.localFrom.method === VICTORY_LOCAL_METHOD, `${n}: yerel Paulus`);
      assert.ok(Math.abs(arcDiff(v.longitude, g.expectIndependent.victoryPaulus)) * 3600 <= 0.01, `${n}: ${v.longitude} vs ${g.expectIndependent.victoryPaulus}`);
      const day = g.expectIndependent.sect === "day";
      assert.deepEqual([v.plus, v.minus], day ? ["jupiter", "spirit"] : ["spirit", "jupiter"], `${n}: yön`);
      assert.deepEqual([v.localFrom.providerPlus, v.localFrom.providerMinus], day ? ["spirit", "jupiter"] : ["jupiter", "spirit"], `${n}: sağlayıcının ters formülü izde`);
      assert.equal(lotPositionWithheld(v), false, `${n}: gösterilir`);
    }
  });

  console.log(`\nvictory-paulus harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main();
