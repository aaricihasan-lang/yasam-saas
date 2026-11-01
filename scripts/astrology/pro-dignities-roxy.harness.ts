/**
 * GÖKYÜZÜ ATLASI — WT-02 (2026-10-31): klasik asalet katmanının GERÇEK Roxy natal verisiyle çevrimdışı regresyonu.
 * Fixture: fixtures/pro-dignities/roxy-natal-sentetik-2026-10-31.json (194 sentetik doğum, merkezi defter WT-02; bu test
 * YENİ ÇAĞRI YAPMAZ). Karşılaştırılan: Roxy `dignity` (burç düzeyi), `partOfFortune.sect`, `partOfFortune.longitude`.
 * Roxy'de almuten / puan / kabul ucu YOKTUR → bunlar Roxy ile karşılaştırılmaz; yalnız Roxy konumlarıyla çalıştırılır.
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-dignities-roxy.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLASSICAL_PLANETS, type ClassicalPlanet } from "@/lib/astrology/horary/western/tables";
import { PROFILE_LILLY_1647, essentialDignity, partOfFortune, signOnlyDignity } from "@/lib/astrology/horary/western/calc";
import { natalEssential } from "@/lib/astrology/pro/dignities/essential";
import { almutenOfDegree } from "@/lib/astrology/pro/dignities/almuten";
import { natalSect } from "@/lib/astrology/pro/dignities/accidentalNatal";
import { buildNatalDignities } from "@/lib/astrology/pro/dignities/natal";

type P = { lon: number; speed: number; retro: boolean; dignity: string; house: number };
type C = { id: string; kind: string; request: { date: string; time: string; latitude: number; longitude: number }; roxy: { sect: string; asc: number; mc: number; cusps: number[]; pof: number; planets: Record<ClassicalPlanet, P> } };
const fx = JSON.parse(readFileSync(join(__dirname, "fixtures", "pro-dignities", "roxy-natal-sentetik-2026-10-31.json"), "utf8")) as { cases: C[] };
const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

let pass = 0;
let fail = 0;
const out: string[] = [];
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    out.push(`PASS\t${name}`);
  } catch (e) {
    fail++;
    out.push(`FAIL\t${name}\t${(e as Error).message.split("\n")[0]}`);
  }
}

t(`X01 Vaka sayısı 194 (rastgele 150 + sınır 24 + sect 20)`, () => {
  assert.equal(fx.cases.length, 194);
});
t("X02 Sect: bizim geometrik Güneş irtifası kuralı = Roxy partOfFortune.sect (194/194; 20 sect vakası |h| ≤ 0,89°, 19u 50′ içinde)", () => {
  const bad: string[] = [];
  let near = 0;
  for (const c of fx.cases) {
    const utc = Date.parse(`${c.request.date}T${c.request.time}Z`);
    const s = natalSect({ utcMs: utc, latitude: c.request.latitude, longitude: c.request.longitude, sunLon: c.roxy.planets.sun.lon, asc: c.roxy.asc });
    assert.ok(!("error" in s));
    if ("error" in s) continue;
    if (s.nearHorizon) near++;
    if (s.day !== (c.roxy.sect === "day")) bad.push(`${c.id} alt=${s.sunAltitude.toFixed(4)}`);
  }
  out.push(`INFO\tX02 ufka yakın (|h|<50′) vaka: ${near}`);
  assert.equal(bad.length, 0, bad.join("; "));
  assert.equal(near, 19);
});
t("X03 Roxy dignity ↔ burç düzeyi sınıf: tam uyum, TEK fark Merkür Balık (hem zarar hem düşüş; Roxy 'fall', signOnlyDignity 'detriment' öncelikli)", () => {
  let same = 0;
  let dual = 0;
  const other: string[] = [];
  for (const c of fx.cases)
    for (const p of CLASSICAL_PLANETS) {
      const r = c.roxy.planets[p];
      const ours = signOnlyDignity(p, r.lon);
      if (r.dignity === ours) same++;
      else {
        const e = natalEssential(p, r.lon, true, "lilly-1647").essential;
        if (p === "mercury" && r.dignity === "fall" && e.detriment && e.fall) dual++;
        else other.push(`${c.id} ${p} roxy=${r.dignity} biz=${ours}`);
      }
    }
  out.push(`INFO\tX03 aynı ${same}, çift-durum (Merkür Balık) ${dual}, açıklanamayan ${other.length}`);
  assert.equal(other.length, 0, other.join("; "));
  assert.equal(same + dual, 194 * 7);
});
t("X04 Şans noktası: partOfFortune(ASC, ☉, ☽, Roxy sect, 'sect_reversed') = Roxy pof (≤1e-6°, 194/194)", () => {
  for (const c of fx.cases) {
    const r = c.roxy;
    const v = partOfFortune(r.asc, r.planets.sun.lon, r.planets.moon.lon, r.sect === "day", "sect_reversed");
    assert.ok(Math.abs(wrap180(v - r.pof)) < 1e-6, c.id);
  }
});
t("X05 Roxy isRetrograde = (hız < 0) — 1.358 satır", () => {
  for (const c of fx.cases) for (const p of CLASSICAL_PLANETS) assert.equal(c.roxy.planets[p].retro, c.roxy.planets[p].speed < 0, `${c.id} ${p}`);
});
t("X06 Birleşik natal rapor 194 haritada hatasız; Lilly asal skor = calc.ts; Lord of Geniture hep var", () => {
  for (const c of fx.cases) {
    const r = c.roxy;
    const day = r.sect === "day";
    const rep = buildNatalDignities({ positions: Object.fromEntries(CLASSICAL_PLANETS.map((p) => [p, { lon: r.planets[p].lon, speed: r.planets[p].speed }])) as Record<ClassicalPlanet, { lon: number; speed: number }>, asc: r.asc, mc: r.mc, houses: { system: "roxy", cusps: r.cusps }, isDay: day, northNode: null, prenatalSyzygy: null, school: "lilly-1647" });
    for (const pl of rep.planets) assert.equal(pl.essential.score, essentialDignity(pl.planet, r.planets[pl.planet].lon, day, PROFILE_LILLY_1647).score);
    assert.ok(rep.lordOfGenitureLilly);
    assert.equal(rep.cuspAlmutens!.items.length, 12);
  }
});
t("X07 Duyarlılık: Roxy konumu ±δ kaydırıldığında asal sonuç / almuten yalnız sınıra < δ olan gezegenlerde değişir (δ = 20″, Ay 70″)", () => {
  let flips = 0;
  let near = 0;
  for (const c of fx.cases) {
    const day = c.roxy.sect === "day";
    for (const p of CLASSICAL_PLANETS) {
      const d = (p === "moon" ? 70 : 20) / 3600;
      const lon = c.roxy.planets[p].lon;
      const e0 = natalEssential(p, lon, day, "lilly-1647", "school", (d * 60) * 1.0001);
      if (e0.boundary.near) near++;
      for (const s of [-d, d]) {
        const e1 = natalEssential(p, lon + s, day, "lilly-1647");
        const changed = JSON.stringify(e1.essential) !== JSON.stringify(e0.essential) || JSON.stringify(almutenOfDegree(lon + s, day, "lilly-1647").winners) !== JSON.stringify(almutenOfDegree(lon, day, "lilly-1647").winners);
        if (changed) {
          flips++;
          assert.equal(e0.boundary.near, true, `${c.id} ${p} değişti ama sınır yakını işaretlenmedi`);
        }
      }
    }
  }
  out.push(`INFO\tX07 kaydırmada değişen ${flips}; δ içinde sınır yakını satır ${near}`);
});

console.log(out.join("\n"));
console.log(`\npro-dignities-roxy: ${pass} geçti, ${fail} kaldı`);
if (fail) process.exit(1);
