/**
 * GÖKYÜZÜ ATLASI — WT-01 PROFESYONEL EV SİSTEMLERİ (2026-10-31): Regiomontanus · Campanus · Porphyry · Alcabitius.
 * ÜRÜNE BAĞLI DEĞİL; sağlayıcı çağrısı YOK (gerçek Roxy karşılaştırması ayrı: pro-houses-roxy.harness.ts, önbellekten).
 *
 * Bağımsız referanslar:
 *   • fixtures/pro-houses/swe-houses-armc-small.json — pyswisseph 2.10.03 `houses_armc(armc, lat, eps, hsys)` (Swiss Ephemeris
 *     saf geometri; depo dışı araç, yalnız sayısal çıktı). 610 çerçeve × 4 sistem. Büyük ızgara (38.160 çerçeve) ortam değişkeni
 *     PRO_HOUSES_BIG=<yol> ile (QA kanıt klasörü).
 *   • crosscheck.ts — ikinci bağımsız uygulama (kapalı formül ↔ vektör).
 *   • Mevcut Lilly Regiomontanus (horary/western/houses.ts) — birebir aynı sonuç beklenir.
 *
 * Toleranslar (gerekçe docs/astrology/pro/ev-sistemleri.md §5):
 *   • Geometri (aynı RAMC/ε/φ): ≤ 0,01″ (çift duyarlıklı trigonometri; kutup sınırına 0,5°'den yakın olmayan ızgara). Sınıra
 *     ≤ 0,5° vakalarda ≤ 1″ (atan/asin koşullanması kötüleşir).
 *   • İç çapraz test: ≤ 1e-7°.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-houses.harness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PRO_HOUSE_SYSTEMS, computeHousesAt, computeHousesFromFrame, eclToEq, placeBodies, timeSensitivity, type ProHouseSystem, type ProHouses } from "@/lib/astrology/houses/engine";
import { crosscheckCusps } from "@/lib/astrology/pro/houses/crosscheck";
import { regiomontanusCusps, skyFrameAt, polarLimit } from "@/lib/astrology/horary/western/houses";
import { birthHouses } from "@/lib/astrology/pro/houses/birth";

let pass = 0;
let fail = 0;
const rows: string[] = [];
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).message}\n`);
  }
}
const d180 = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const arcsec = (x: number) => x * 3600;
type SweCase = { ramc: number; latitude: number; obliquity: number; asc: number; mc: number } & Partial<Record<ProHouseSystem | "placidus", number[] | null>>;
const FX = join(__dirname, "fixtures", "pro-houses");
const SMALL = JSON.parse(readFileSync(join(FX, "swe-houses-armc-small.json"), "utf8")) as { tool: string; cases: SweCase[] };

function compareSet(label: string, cases: SweCase[]) {
  for (const sys of PRO_HOUSE_SYSTEMS) {
    let n = 0;
    let max = 0;
    let maxNear = 0;
    let nNear = 0;
    let worst = "";
    let polar = 0;
    for (const c of cases) {
      const r = computeHousesFromFrame(sys, { ramc: c.ramc, obliquity: c.obliquity, latitude: c.latitude });
      if (!r.ok) {
        assert.equal(r.error, "polar_latitude", `${sys} beklenmeyen hata ${r.detail}`);
        assert.ok(Math.abs(c.latitude) >= polarLimit(c.obliquity), `${sys} kutup dışı hata φ=${c.latitude}`);
        polar++;
        continue;
      }
      const ref = c[sys];
      assert.ok(ref && ref.length === 12, `${sys} referans yok`);
      const near = polarLimit(c.obliquity) - Math.abs(c.latitude) <= 0.5;
      for (let k = 0; k < 12; k++) {
        const dd = arcsec(d180(r.cusps[k], ref![k]));
        if (near) {
          maxNear = Math.max(maxNear, dd);
        } else if (dd > max) {
          max = dd;
          worst = `φ=${c.latitude} RAMC=${c.ramc} ε=${c.obliquity} ev ${k + 1}`;
        }
      }
      near ? nNear++ : n++;
    }
    rows.push(`| ${label} | ${sys} | ${n} + ${nNear} sınır | ${max.toExponential(2)}″ | ${maxNear.toExponential(2)}″ | ${polar} | ${worst} |`);
    assert.ok(max <= 0.01, `${sys} en büyük fark ${max}″ > 0,01″ (${worst})`);
    assert.ok(maxNear <= 1, `${sys} sınır bölgesi ${maxNear}″ > 1″`);
  }
}

async function main() {
  await t("A1 pyswisseph küçük ızgara (610 çerçeve × 4 sistem) — saf geometri ≤0,01″ (sınır ≤1″)", () => compareSet("küçük", SMALL.cases));

  const big = process.env.PRO_HOUSES_BIG;
  if (big && existsSync(big)) {
    await t("A2 pyswisseph büyük ızgara (φ −66…66 adım 0,5°, 48 RAMC, 3 ε)", () => compareSet("büyük", (JSON.parse(readFileSync(big, "utf8")) as { cases: SweCase[] }).cases));
  } else console.log("SKIP A2 büyük ızgara (PRO_HOUSES_BIG tanımlı değil) — sayılmaz");

  await t("A3 Regiomontanus: yeni motor = mevcut Lilly regiomontanusCusps (birebir)", () => {
    for (const c of SMALL.cases) {
      const r = computeHousesFromFrame("regiomontanus", c);
      const l = regiomontanusCusps(c.ramc, c.latitude, c.obliquity);
      if (!Array.isArray(l)) {
        assert.equal(r.ok, false);
        continue;
      }
      assert.ok(r.ok);
      for (let k = 0; k < 12; k++) assert.ok(d180(r.cusps[k], l[k]) < 1e-12);
    }
  });

  await t("A4 iç çapraz test: engine ↔ crosscheck (4 sistem, φ −66…66 adım 1°, RAMC 0…359 adım 7°) ≤1e-7°", () => {
    let max = 0;
    for (const sys of PRO_HOUSE_SYSTEMS)
      for (let lat = -66; lat <= 66; lat += 1)
        for (let ramc = 0.37; ramc < 360; ramc += 7)
          for (const obliquity of [23.0, 23.4393, 24.0]) {
            const f = { ramc, latitude: lat, obliquity };
            const r = computeHousesFromFrame(sys, f);
            if (!r.ok) continue;
            const x = crosscheckCusps(sys, f);
            for (let k = 0; k < 12; k++) max = Math.max(max, d180(r.cusps[k], x[k]));
          }
    rows.push(`| iç çapraz | 4 sistem | 4×133×52×3 | ${(max * 3600).toExponential(2)}″ | — | — | — |`);
    assert.ok(max <= 1e-7, `fark ${max}°`);
  });

  await t("B1 özellik: karşı cusp = cusp + 180° (6 çift, 4 sistem)", () => {
    for (const sys of PRO_HOUSE_SYSTEMS)
      for (const c of SMALL.cases) {
        const r = computeHousesFromFrame(sys, c);
        if (!r.ok) continue;
        for (let k = 0; k < 6; k++) assert.ok(d180(r.cusps[k + 6], r.cusps[k] + 180) < 1e-9);
      }
  });

  await t("B2 özellik: 4 sistemde cusp 1 = ASC, cusp 10 = MC; ASC/MC = Swiss ascmc", () => {
    for (const c of SMALL.cases)
      for (const sys of PRO_HOUSE_SYSTEMS) {
        const r = computeHousesFromFrame(sys, c);
        if (!r.ok) continue;
        assert.ok(d180(r.cusps[0], c.asc) * 3600 < 0.01 && d180(r.cusps[9], c.mc) * 3600 < 0.01, `${sys} φ=${c.latitude}`);
      }
  });

  await t("B3 özellik: Porphyry kadranları ekliptikte tam üç eşit parça", () => {
    for (const c of SMALL.cases) {
      const r = computeHousesFromFrame("porphyry", c) as ProHouses;
      if (!r.ok) continue;
      const span = (a: number, b: number) => (((b - a) % 360) + 360) % 360;
      for (const [a, b, cc, dd] of [[9, 10, 11, 0], [0, 1, 2, 3]]) {
        const s1 = span(r.cusps[a], r.cusps[b]);
        assert.ok(Math.abs(s1 - span(r.cusps[b], r.cusps[cc])) < 1e-9 && Math.abs(s1 - span(r.cusps[cc], r.cusps[dd])) < 1e-9);
      }
    }
  });

  await t("B4 özellik: Alcabitius ara cusp'ların sağ açıklıkları DSA/NSA'yı üçe böler", () => {
    for (const c of SMALL.cases) {
      const r = computeHousesFromFrame("alcabitius", c);
      if (!r.ok) continue;
      const ra = r.cusps.map((x) => eclToEq(x, c.obliquity).ra);
      const fwd = (a: number, b: number) => (((b - a) % 360) + 360) % 360;
      const dsa = fwd(c.ramc, ra[0]);
      assert.ok(Math.abs(fwd(c.ramc, ra[10]) - dsa / 3) < 1e-7 && Math.abs(fwd(ra[10], ra[11]) - dsa / 3) < 1e-7, `φ=${c.latitude} RAMC=${c.ramc}`);
      const nsa = fwd(ra[0], ra[3]);
      assert.ok(Math.abs(nsa - (180 - dsa)) < 1e-7 && Math.abs(fwd(ra[0], ra[1]) - nsa / 3) < 1e-7);
    }
  });

  await t("B5 özellik: ekvatorda (φ=0) Campanus = Regiomontanus (ilk dikey = ekvator)", () => {
    for (let ramc = 0; ramc < 360; ramc += 5) {
      const a = computeHousesFromFrame("campanus", { ramc, latitude: 0, obliquity: 23.44 }) as ProHouses;
      const b = computeHousesFromFrame("regiomontanus", { ramc, latitude: 0, obliquity: 23.44 }) as ProHouses;
      for (let k = 0; k < 12; k++) assert.ok(d180(a.cusps[k], b.cusps[k]) < 1e-9);
    }
  });

  await t("B6 özellik: cusp'lar saat yönünün tersine sıralı (ardışık yaylar > 0, toplam 360°) — tüm ızgara", () => {
    for (const sys of PRO_HOUSE_SYSTEMS)
      for (const c of SMALL.cases) {
        const r = computeHousesFromFrame(sys, c);
        if (!r.ok) continue;
        let tot = 0;
        for (let k = 0; k < 12; k++) {
          const s = (((r.cusps[(k + 1) % 12] - r.cusps[k]) % 360) + 360) % 360;
          assert.ok(s > 0 && s < 180, `${sys} φ=${c.latitude} RAMC=${c.ramc} ev ${k + 1} yay ${s}`);
          tot += s;
        }
        assert.ok(Math.abs(tot - 360) < 1e-9);
      }
  });

  await t("B7 güney yarımküre simetrisi: φ → −φ ve RAMC → RAMC+180 iken cusp'lar +180° (4 sistem)", () => {
    for (const sys of PRO_HOUSE_SYSTEMS)
      for (const lat of [5, 23, 41, 55, 65])
        for (let ramc = 3; ramc < 360; ramc += 31) {
          const a = computeHousesFromFrame(sys, { ramc, latitude: lat, obliquity: 23.44 }) as ProHouses;
          const b = computeHousesFromFrame(sys, { ramc: ramc + 180, latitude: -lat, obliquity: 23.44 }) as ProHouses;
          for (let k = 0; k < 12; k++) assert.ok(d180(b.cusps[k], a.cusps[k] + 180) < 1e-8, `${sys} φ=${lat} ev ${k + 1}`);
        }
  });

  await t("C1 kutup: |φ| ≥ 90° − ε → 4 sistemde polar_latitude (sessiz yedek YOK); sınırın hemen içi hesaplanır", () => {
    for (const sys of PRO_HOUSE_SYSTEMS) {
      for (const lat of [66.57, -66.57, 70, -80, 89.9, 90, -90]) {
        const r = computeHousesFromFrame(sys, { ramc: 10, latitude: lat, obliquity: 23.4393 });
        assert.ok(!r.ok && r.error === "polar_latitude", `${sys} φ=${lat}`);
      }
      const ok = computeHousesFromFrame(sys, { ramc: 10, latitude: 66.56, obliquity: 23.4393 });
      assert.ok(ok.ok && ok.warnings.includes("near_polar_limit") && ok.warnings.includes("high_latitude"), `${sys} 66.56`);
    }
  });

  await t("C2 geçersiz girdi: NaN, |φ|>90, ε dışı, bilinmeyen sistem → invalid_input", () => {
    for (const f of [{ ramc: NaN, latitude: 0, obliquity: 23.4 }, { ramc: 0, latitude: 91, obliquity: 23.4 }, { ramc: 0, latitude: 0, obliquity: 30 }, { ramc: 0, latitude: Infinity, obliquity: 23.4 }]) {
      const r = computeHousesFromFrame("campanus", f);
      assert.ok(!r.ok && r.error === "invalid_input");
    }
    const u = computeHousesFromFrame("placidus" as ProHouseSystem, { ramc: 0, latitude: 0, obliquity: 23.4 });
    assert.ok(!u.ok && u.error === "invalid_input");
    const v = computeHousesAt("porphyry", NaN, 0, 0);
    assert.ok(!v.ok && v.error === "invalid_input");
    const w = computeHousesAt("porphyry", Date.UTC(2000, 0, 1), 41, 29, { dut1Seconds: 1.5 });
    assert.ok(!w.ok && w.error === "invalid_input");
    const z = computeHousesAt("porphyry", Date.UTC(2000, 0, 1), 41, 29, { dut1Seconds: 0.3 });
    assert.ok(z.ok && z.timeScale === "ut1_from_dut1");
  });

  await t("C3 0°/360° normalizasyonu: RAMC 359,99999 / 0 / −0,00001 / 720 aynı sonuç; tüm cusp'lar [0,360)", () => {
    for (const sys of PRO_HOUSE_SYSTEMS) {
      const base = computeHousesFromFrame(sys, { ramc: 0, latitude: 41, obliquity: 23.44 }) as ProHouses;
      for (const ramc of [360, 720, -360]) {
        const r = computeHousesFromFrame(sys, { ramc, latitude: 41, obliquity: 23.44 }) as ProHouses;
        for (let k = 0; k < 12; k++) assert.ok(d180(r.cusps[k], base.cusps[k]) < 1e-9);
      }
      for (const ramc of [359.99999, -0.00001, 0.00001]) {
        const r = computeHousesFromFrame(sys, { ramc, latitude: 41, obliquity: 23.44 }) as ProHouses;
        assert.ok(r.cusps.every((x) => x >= 0 && x < 360) && r.frame.ramc >= 0 && r.frame.ramc < 360);
        for (let k = 0; k < 12; k++) assert.ok(d180(r.cusps[k], base.cusps[k]) < 0.001);
      }
    }
  });

  await t("D1 ev yerleşimi: cusp üzerindeki gövde o eve; sarma (Balık 29° → Koç 1°); nearCusp toleransı", () => {
    const cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
    const p = placeBodies(cusps, [{ id: "a", lon: 350 }, { id: "b", lon: 5 }, { id: "c", lon: 19.9999 }, { id: "d", lon: 349.999999 }, { id: "e", lon: 360 + 20 }, { id: "f", lon: -10 }]);
    assert.deepEqual(p.map((x) => x.house), [1, 1, 1, 12, 2, 1]);
    assert.equal(p[0].nearCusp, true);
    assert.equal(p[1].nearCusp, false);
    assert.equal(p[2].nearCusp, true);
    assert.equal(p[3].nearCusp, true);
    assert.throws(() => placeBodies([1, 2], []));
  });

  await t("D2 doğum saati belirsizliği: ±4 dk → ASC kayması ≈ ±1° mertebesinde ve cusp yakınındaki gövde 'unstable'", () => {
    const ms = Date.UTC(1990, 6, 15, 12, 0, 0);
    const r = computeHousesAt("regiomontanus", ms, 41.0082, 28.9784) as ProHouses;
    const near = { id: "test", lon: r.cusps[0] + 0.2 };
    const far = { id: "uzak", lon: r.cusps[0] + 15 };
    const s = timeSensitivity("regiomontanus", ms, 41.0082, 28.9784, [near, far], 4);
    assert.ok(s.ok && s.maxCuspShift > 0.5 && s.maxCuspShift < 5, `kayma ${s.maxCuspShift}`);
    assert.deepEqual(s.unstableBodies.map((b) => b.id), ["test"]);
  });

  await t("E1 doğum girdisi: Berlin DST geri alma (2016-10-30 02:30 iki kez yaşandı) → ambiguous, iki seçenek; boşluk → gap", () => {
    const a = birthHouses({ system: "campanus", date: "2016-10-30", time: "02:30", timeZone: "Europe/Berlin", latitude: 52.52, longitude: 13.405 });
    assert.equal(a.kind, "ambiguous");
    if (a.kind === "ambiguous") assert.equal(a.options.length, 2);
    const g = birthHouses({ system: "campanus", date: "2016-03-27", time: "02:30", timeZone: "Europe/Berlin", latitude: 52.52, longitude: 13.405 });
    assert.equal(g.kind, "gap");
    const ok = birthHouses({ system: "campanus", date: "2016-10-30", time: "02:30", timeZone: "Europe/Berlin", dstChoice: "later", latitude: 52.52, longitude: 13.405 });
    assert.ok(ok.kind === "ok" && ok.houses.ok && ok.confidence.flags.includes("dst_choice_applied"));
    const old = birthHouses({ system: "porphyry", date: "1890-05-01", time: "12:00", timeZone: "Europe/Istanbul", latitude: 41, longitude: 29 });
    assert.ok(old.kind === "ok" && old.confidence.flags.includes("historical_timezone"));
    const bad = birthHouses({ system: "porphyry", date: "1990-02-30", time: "12:00", timeZone: "Europe/Istanbul", latitude: 41, longitude: 29 });
    assert.equal(bad.kind, "invalid");
    const pol = birthHouses({ system: "alcabitius", date: "1990-06-21", time: "12:00", timeZone: "Europe/Oslo", latitude: 69.65, longitude: 18.96 });
    assert.ok(pol.kind === "ok" && !pol.houses.ok && pol.houses.error === "polar_latitude");
  });

  await t("E2 çerçeve: computeHousesAt = skyFrameAt (Lilly) + computeHousesFromFrame", () => {
    const ms = Date.UTC(2026, 9, 31, 1, 2, 3);
    const sky = skyFrameAt(ms, -33.87, 151.21);
    assert.ok(!("error" in sky));
    for (const sys of PRO_HOUSE_SYSTEMS) {
      const a = computeHousesAt(sys, ms, -33.87, 151.21) as ProHouses;
      const b = computeHousesFromFrame(sys, { ramc: sky.ramc, obliquity: sky.obliquity, latitude: -33.87 }) as ProHouses;
      assert.deepEqual(a.cusps, b.cusps);
    }
  });

  await t("F1 performans: 4 sistem × 100.000 çerçeve < 4 sn", () => {
    const t0 = performance.now();
    let s = 0;
    for (const sys of PRO_HOUSE_SYSTEMS) for (let i = 0; i < 100_000; i++) {
      const r = computeHousesFromFrame(sys, { ramc: (i * 13.7) % 360, latitude: ((i * 7.3) % 130) - 65, obliquity: 23.44 });
      if (r.ok) s += r.cusps[1];
    }
    const ms = performance.now() - t0;
    rows.push(`| performans | 4 sistem | 400.000 çerçeve | ${ms.toFixed(0)} ms | — | — | — |`);
    assert.ok(ms < 4000 && s > 0, `${ms} ms`);
  });

  console.log("\n| Küme | Sistem | Çerçeve | En büyük fark | Sınır (≤0,5°) en büyük | Kutup reddi | En kötü vaka |\n|---|---|---|---|---|---|---|\n" + rows.join("\n"));
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
void main();
