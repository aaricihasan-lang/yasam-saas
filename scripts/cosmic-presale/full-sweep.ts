/**
 * scripts/cosmic-presale/full-sweep.ts
 *
 * §22 TAM TARİH SWEEP + §18B sunrise/sunset bağımsız oracle.
 *
 * Desteklenen aralığın (2026-06-20 → 2050-12-31) TAMAMINI gün-gün tarar ve her üretim
 * motorunda crash / NaN / undefined / invalid Date / imkânsız dizi / invariant ihlali arar.
 *
 * NE TAM TARANIR (her gün, ~8960 gün):
 *   • getMoonPhase, getMoonSign, getSunSignInfo, getPlanetSigns (9 cisim), getHijriDate
 *   • getPlanetaryHoursForDate: 24 slot + süreklilik + Chaldean +1 + sunrise<sunset<nextSunrise
 * NE ÖRNEKLENİR (her 15 günde bir — ağır AE enumerasyonu, runtime için):
 *   • getUpcomingVoidMoonPeriods, getUpcomingEclipses/getAllEclipses, getLunarDistanceSnapshot,
 *     getActiveRetros, getUpcomingCosmicEvents
 * SUNRISE/SUNSET ORACLE (§18B): her 30 günde bir, üretim NOAA sunrise/sunset'i AE.SearchRiseSet
 *   (BAĞIMSIZ algoritma) ile karşılaştırılır → max delta raporlanır.
 *
 * Çalıştırma: npx tsx scripts/cosmic-presale/full-sweep.ts
 */
import * as AE from "astronomy-engine";
import { getMoonPhase, getMoonSign } from "../../lib/cosmic/moon";
import { getSunSignInfo, getPlanetSigns } from "../../lib/cosmic/planets";
import { getHijriDate } from "../../lib/cosmic/hijri";
import { getPlanetaryHoursForDate } from "../../lib/cosmic/planetary-hours";
import { getActiveRetros } from "../../lib/cosmic/retro";
import { getUpcomingVoidMoonPeriods } from "../../lib/cosmic/voidMoon";
import { getLunarDistanceSnapshot } from "../../lib/cosmic/lunarOrbit";
import { getUpcomingEclipses } from "../../lib/cosmic/eclipses";
import { getUpcomingCosmicEvents } from "../../lib/cosmic/events";
import { SUPPORT_START, SUPPORT_END } from "../../lib/cosmic/dateRange";

const LAT = 41.0082, LON = 28.9784, TZ = 180;
const observer = new AE.Observer(LAT, LON, 0);

let daysSwept = 0, sampled = 0;
const errors: string[] = [];
const push = (m: string) => { if (errors.length < 40) errors.push(m); };

const finite = (n: number) => Number.isFinite(n);
const badStr = (s: unknown) => typeof s !== "string" || s.trim() === "";

let riseSamples = 0, riseMaxDeltaSec = 0, riseSumDeltaSec = 0, setMaxDeltaSec = 0, setSumDeltaSec = 0;
let riseOracleFails = 0;

const start = new Date(SUPPORT_START.getFullYear(), SUPPORT_START.getMonth(), SUPPORT_START.getDate());
const end = new Date(SUPPORT_END.getFullYear(), SUPPORT_END.getMonth(), SUPPORT_END.getDate());

console.log(`\n=== §22 Tam Tarih Sweep ${start.toISOString().slice(0,10)} → ${end.toISOString().slice(0,10)} ===`);

for (let cur = new Date(start); cur.getTime() <= end.getTime(); cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)) {
  daysSwept++;
  const noon = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12, 0, 0);
  const tag = cur.toISOString().slice(0, 10);
  try {
    const mp = getMoonPhase(noon);
    if (badStr(mp?.name) || badStr(mp?.emoji)) push(`${tag}: moonPhase boş`);
    const ms = getMoonSign(noon);
    if (badStr(ms?.name)) push(`${tag}: moonSign boş`);
    const ss = getSunSignInfo(noon);
    if (badStr(ss?.name)) push(`${tag}: sunSign boş`);
    const ps = getPlanetSigns(noon);
    if (!Array.isArray(ps) || ps.length !== 9) push(`${tag}: planetSigns ${ps?.length}`);
    else for (const p of ps) if (p.outOfRange || badStr(p.sign)) push(`${tag}: ${p.key} outOfRange/boş`);
    const hj = getHijriDate(noon);
    if (badStr(hj) || hj === "—") push(`${tag}: hijri boş/—`);

    // Gezegen saati değişmezleri (her gün)
    const slots = getPlanetaryHoursForDate(cur, LAT, LON, TZ, TZ);
    if (slots.length !== 24) push(`${tag}: ${slots.length} slot`);
    else {
      const rise = slots[0]!.start.getTime(), set = slots[11]!.end.getTime(), nextRise = slots[23]!.end.getTime();
      if (!finite(rise) || !finite(set) || !finite(nextRise)) push(`${tag}: sunrise/set NaN`);
      if (!(rise < set && set < nextRise)) push(`${tag}: sunrise<sunset<nextRise ihlali`);
      for (let i = 0; i < 23; i++) {
        if (Math.abs(slots[i+1]!.start.getTime() - slots[i]!.end.getTime()) > 2) { push(`${tag}: slot ${i} gap`); break; }
        if ((slots[i+1]!.chaldeanIdx - slots[i]!.chaldeanIdx + 7) % 7 !== 1) { push(`${tag}: slot ${i} Chaldean`); break; }
      }
    }
  } catch (e) {
    push(`${tag}: THROW ${(e as Error).message}`);
  }

  // ── Örneklenen ağır motorlar (her 15 günde bir) ──
  if (daysSwept % 15 === 0) {
    sampled++;
    try {
      const voc = getUpcomingVoidMoonPeriods(noon, 4);
      if (!Array.isArray(voc)) push(`${tag}: VOC dizi değil`);
      const lun = getLunarDistanceSnapshot(noon);
      if (lun && !finite(lun.distanceKm)) push(`${tag}: lunar mesafe NaN`);
      const ecl = getUpcomingEclipses(noon, 3);
      if (!Array.isArray(ecl)) push(`${tag}: eclipse dizi değil`);
      const retro = getActiveRetros(noon);
      if (!Array.isArray(retro)) push(`${tag}: retro dizi değil`);
      const evt = getUpcomingCosmicEvents(noon, 5);
      if (!Array.isArray(evt)) push(`${tag}: events dizi değil`);
    } catch (e) {
      push(`${tag}: SAMPLE THROW ${(e as Error).message}`);
    }
  }

  // ── Sunrise/sunset bağımsız oracle (her 30 günde bir) ──
  if (daysSwept % 30 === 0) {
    try {
      const slots = getPlanetaryHoursForDate(cur, LAT, LON, TZ, TZ);
      if (slots.length === 24) {
        const prodRise = slots[0]!.start;
        const prodSet = slots[11]!.end;
        const dayStartUtc = new Date(Date.UTC(cur.getFullYear(), cur.getMonth(), cur.getDate(), 0, 0, 0));
        const aeRise = AE.SearchRiseSet(AE.Body.Sun, observer, +1, dayStartUtc, 1);
        const aeSet = AE.SearchRiseSet(AE.Body.Sun, observer, -1, dayStartUtc, 1);
        if (aeRise && aeSet) {
          riseSamples++;
          const dR = Math.abs(aeRise.date.getTime() - prodRise.getTime()) / 1000;
          const dS = Math.abs(aeSet.date.getTime() - prodSet.getTime()) / 1000;
          riseMaxDeltaSec = Math.max(riseMaxDeltaSec, dR); riseSumDeltaSec += dR;
          setMaxDeltaSec = Math.max(setMaxDeltaSec, dS); setSumDeltaSec += dS;
        } else riseOracleFails++;
      }
    } catch { riseOracleFails++; }
  }
}

console.log(`Taranan gün (TAM): ${daysSwept}`);
console.log(`Örneklenen gün (ağır motorlar, 1/15): ${sampled}`);
console.log(`\n=== §18B Sunrise/Sunset Bağımsız Oracle (üretim NOAA vs AE.SearchRiseSet) ===`);
console.log(`Örnek: ${riseSamples} gün (1/30) · oracle-fail: ${riseOracleFails}`);
if (riseSamples > 0) {
  console.log(`Sunrise Δ: max ${riseMaxDeltaSec.toFixed(1)}s · ort ${(riseSumDeltaSec/riseSamples).toFixed(1)}s`);
  console.log(`Sunset  Δ: max ${setMaxDeltaSec.toFixed(1)}s · ort ${(setSumDeltaSec/riseSamples).toFixed(1)}s`);
}
// NOAA ↔ AE farkı normalde < ~90 sn (algoritma + kırılma farkı). Eşik 180 sn.
const oracleOk = riseSamples > 0 && riseMaxDeltaSec < 180 && setMaxDeltaSec < 180;

console.log(`\n=== SWEEP HATALARI: ${errors.length} ===`);
for (const e of errors) console.error("  ✗ " + e);

const pass = errors.length === 0 && oracleOk;
console.log(`\n=== SONUÇ: ${pass ? "✅ SWEEP TEMİZ + ORACLE UYUMLU" : "❌ SORUN VAR"} ===`);
process.exit(pass ? 0 : 1);
