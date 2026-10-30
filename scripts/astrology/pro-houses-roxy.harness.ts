/**
 * GÖKYÜZÜ ATLASI — WT-01 PROFESYONEL EV SİSTEMLERİ: GERÇEK sağlayıcı ve bağımsız çerçeve karşılaştırması (2026-10-31).
 * Ağ çağrısı YOK: Roxy yanıtları depoya fixture olarak alındı (fixtures/pro-houses/roxy-houses-2026-10-31.json; 220 sentetik
 * vaka, /astrology/houses houseSystem=all, timezone=0). Toplama merkezi defterle yapıldı (QA ASTRO-GECE-4-MOTOR, WT-01).
 *
 * ÖNEMLİ: Roxy Regiomontanus/Campanus/Porphyry/Alcabitius SUNMAZ. Burada Roxy yalnız ORTAK alanlar (ASC, MC, ima ettiği RAMC)
 * için referanstır; dört sistemin cusp doğruluğu pro-houses.harness.ts (pyswisseph geometri) ile sınanır.
 *
 * Toleranslar (gerekçe docs/astrology/pro/ev-sistemleri.md §5):
 *   • Çerçeve: astronomy-engine GAST ↔ skyfield (IAU 2006/2000A) ≤ 0,5″ RAMC (1600–2500); gerçek eğiklik ≤ 0,5″.
 *   • ASC/MC: motor ↔ Roxy. DUT1 verilmezse (sivil UTC = UT1 kabulü) RAMC farkı ≤ 14,04″ (|UT1−UTC| ≤ 0,9 sn); DUT1 (skyfield IERS)
 *     verilince RAMC/MC ≤ 2″, ASC ≤ 5″. ASC farkı her vakada ∂ASC/∂RAMC × ΔRAMC + 0,5″ ile sınırlanır (yüksek enlemde türev büyük).
 *   • Roxy'nin ima ettiği RAMC ile motor ASC'si ↔ Roxy ASC ≤ 0,5″ (Roxy açılarının aynı geometriye uyumu).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-houses-roxy.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRO_HOUSE_SYSTEMS, computeHousesAt, computeHousesFromFrame, type ProHouses } from "@/lib/astrology/pro/houses/engine";
import { ascendantOf, ramcFromMc, skyFrameAt } from "@/lib/astrology/horary/western/houses";

let pass = 0;
let fail = 0;
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
const s180 = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
const FX = join(__dirname, "fixtures", "pro-houses");
type RCase = { id: string; group: string; date: string; time: string; latitude: number; longitude: number; dut1Skyfield: number; roxy: { asc: number; mc: number; placidus: number[]; koch: number[]; equal: number[] } };
const ROXY = (JSON.parse(readFileSync(join(FX, "roxy-houses-2026-10-31.json"), "utf8")) as { cases: RCase[] }).cases;
const SKY = (JSON.parse(readFileSync(join(FX, "skyfield-frame.json"), "utf8")) as { cases: { iso: string; utcMs: number; gastHours: number; trueObliquity: number }[] }).cases;
const msOf = (c: RCase) => Date.parse(`${c.date}T${c.time}Z`);

async function main() {
  await t("R0 fixture bütünlüğü: 220 vaka, 6 grup, tümünde ASC/MC + Placidus/Koch/Equal 12 cusp", () => {
    assert.equal(ROXY.length, 220);
    assert.deepEqual([...new Set(ROXY.map((c) => c.group))].sort(), ["G1", "G2", "G3", "G4", "G5", "G6"]);
    for (const c of ROXY) for (const k of ["placidus", "koch", "equal"] as const) assert.equal(c.roxy[k].length, 12, c.id);
  });

  await t("S1 çerçeve: astronomy-engine GAST ↔ skyfield (85 an, 1600–2500) ≤ 0,5″ RAMC; gerçek eğiklik ≤ 0,5″", () => {
    let maxG = 0;
    let maxE = 0;
    for (const c of SKY) {
      const f = skyFrameAt(c.utcMs, 0, 0);
      assert.ok(!("error" in f));
      maxG = Math.max(maxG, Math.abs(s180(f.ramc, c.gastHours * 15)) * 3600);
      maxE = Math.max(maxE, Math.abs(f.obliquity - c.trueObliquity) * 3600);
    }
    console.log(`  GAST en büyük ${maxG.toFixed(3)}″ · eğiklik en büyük ${maxE.toFixed(3)}″`);
    assert.ok(maxG <= 0.5 && maxE <= 0.5, `GAST ${maxG}″, ε ${maxE}″`);
  });

  await t("R1 Roxy açı tutarlılığı: Roxy MC'den ima edilen RAMC ile motor ASC ↔ Roxy ASC ≤ 0,5″ (220 vaka)", () => {
    let max = 0;
    for (const c of ROXY) {
      const f = skyFrameAt(msOf(c), c.latitude, c.longitude);
      assert.ok(!("error" in f));
      const ramcR = ramcFromMc(c.roxy.mc, f.obliquity);
      max = Math.max(max, Math.abs(s180(ascendantOf(ramcR, c.latitude, f.obliquity), c.roxy.asc)) * 3600);
    }
    console.log(`  en büyük ${max.toFixed(4)}″`);
    assert.ok(max <= 0.5, `${max}″`);
  });

  // R2: Ölçek farkı açıkça modellenir. Roxy 1972–2029'da girdiyi UTC, diğer yıllarda UT1 sayar; motor DUT1 verilmezse UT1 sayar.
  const r2 = (useDut1: boolean) => {
    let mMc = 0;
    let mAsc = 0;
    let mR = 0;
    const byGroup: Record<string, number> = {};
    for (const c of ROXY) {
      const r = computeHousesAt("porphyry", msOf(c), c.latitude, c.longitude, useDut1 ? { dut1Seconds: c.dut1Skyfield } : {}) as ProHouses & { sky: { ramc: number; obliquity: number } };
      assert.ok(r.ok, c.id);
      const dMc = Math.abs(s180(r.mc, c.roxy.mc)) * 3600;
      const dAsc = Math.abs(s180(r.asc, c.roxy.asc)) * 3600;
      const dR = Math.abs(s180(r.sky.ramc, ramcFromMc(c.roxy.mc, r.sky.obliquity))) * 3600;
      const h = 1e-4;
      const k = Math.abs(s180(ascendantOf(r.sky.ramc + h, c.latitude, r.sky.obliquity), ascendantOf(r.sky.ramc - h, c.latitude, r.sky.obliquity)) / (2 * h));
      assert.ok(dAsc <= k * dR + 0.5, `${c.id} ΔASC ${dAsc.toFixed(2)}″ > ${k.toFixed(2)}×${dR.toFixed(2)}″`);
      mMc = Math.max(mMc, dMc);
      mAsc = Math.max(mAsc, dAsc);
      mR = Math.max(mR, dR);
      byGroup[c.group] = Math.max(byGroup[c.group] ?? 0, dAsc);
    }
    console.log(`  MC en büyük ${mMc.toFixed(3)}″ · ASC en büyük ${mAsc.toFixed(3)}″ · RAMC en büyük ${mR.toFixed(3)}″ · grup ASC: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.toFixed(2)}″`).join(", ")}`);
    return { mMc, mAsc, mR };
  };
  await t("R2a motor ↔ Roxy, DUT1 VERİLMEDEN (sivil UTC = UT1 kabulü): RAMC farkı ≤ 0,9 sn × 15,04″/sn + 0,5″ = 14,04″; ASC farkı vaka bazında ∂ASC/∂RAMC × ΔRAMC ile sınırlı", () => {
    const { mR } = r2(false);
    assert.ok(mR <= 14.04, `RAMC ${mR}″`);
  });
  await t("R2b motor ↔ Roxy, DUT1 = skyfield IERS değeri ile: RAMC ≤ 2″, MC ≤ 2″, ASC ≤ 5″ (kalan = Roxy↔skyfield çerçeve farkı ≤ 1,76″ ölçüldü)", () => {
    const { mMc, mAsc, mR } = r2(true);
    assert.ok(mR <= 2 && mMc <= 2 && mAsc <= 5, `RAMC ${mR}″ MC ${mMc}″ ASC ${mAsc}″`);
  });

  await t("R3 dört sistem, Roxy ima edilen çerçevede: cusp 1/10 = Roxy ASC/MC (≤0,5″); tüm vakalar hesaplanır (|φ| ≤ 66,3)", () => {
    for (const c of ROXY) {
      const f = skyFrameAt(msOf(c), c.latitude, c.longitude);
      assert.ok(!("error" in f));
      const frame = { ramc: ramcFromMc(c.roxy.mc, f.obliquity), obliquity: f.obliquity, latitude: c.latitude };
      for (const sys of PRO_HOUSE_SYSTEMS) {
        const r = computeHousesFromFrame(sys, frame) as ProHouses;
        assert.ok(r.ok, `${c.id} ${sys}`);
        assert.ok(Math.abs(s180(r.cusps[0], c.roxy.asc)) * 3600 <= 0.5 && Math.abs(s180(r.cusps[9], c.roxy.mc)) * 3600 <= 0.5, `${c.id} ${sys}`);
      }
    }
  });

  await t("R4 sağlayıcı iç tutarlılığı: Roxy Equal cusp k = Roxy ASC + 30(k−1) (< 0,01″)", () => {
    for (const c of ROXY) for (let k = 0; k < 12; k++) assert.ok(Math.abs(s180(c.roxy.equal[k], c.roxy.asc + 30 * k)) * 3600 < 0.01, c.id);
  });

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
void main();
