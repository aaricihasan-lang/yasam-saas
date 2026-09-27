/**
 * scripts/cosmic-presale/golden-verify.ts
 *
 * §19 GOLDEN DATASET doğrulaması — üretim motorunu BAĞIMSIZ (Swiss Ephemeris ile üretilmiş)
 * immutable referansa karşı kontrol eder. Değerlerden herhangi biri değişirse FAIL (regresyon guard).
 *
 * Kontrol edilenler (her an için):
 *   • getSunSignInfo → sunSign (SWE ile aynı olmalı)
 *   • getMoonSign    → moonSign (SWE ile aynı olmalı)
 *   • getActiveRetros→ retroActive kümesi (SWE hız işaretiyle aynı olmalı)
 *   • getMoonIllumination → SWE elongasyonundan beklenen aydınlanma (±5%)
 *
 * Çalıştırma: npx tsx scripts/cosmic-presale/golden-verify.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSunSignInfo, getPlanetSigns } from "../../lib/cosmic/planets";
import { getMoonSign, getMoonIllumination } from "../../lib/cosmic/moon";
import { getActiveRetros } from "../../lib/cosmic/retro";

const HERE = dirname(fileURLToPath(import.meta.url));
type Instant = { label: string; utc: string; sunSign: string; moonSign: string; sunMoonElongationDeg: number; retroActive: string[] };
const golden = JSON.parse(readFileSync(join(HERE, "golden-dataset.json"), "utf-8")) as { instants: Instant[] };

let failures = 0;
const eq = (cond: boolean, msg: string) => cond ? console.log("  ✓ " + msg) : (failures++, console.error("  ✗ " + msg));

console.log("\n=== §19 Golden Dataset (üretim ↔ bağımsız SWE referansı) ===");
for (const g of golden.instants) {
  const d = new Date(g.utc);
  console.log(`\n• ${g.label}`);
  eq(getSunSignInfo(d).name === g.sunSign, `Güneş burcu = ${g.sunSign} (üretim: ${getSunSignInfo(d).name})`);
  eq(getMoonSign(d).name === g.moonSign, `Ay burcu = ${g.moonSign} (üretim: ${getMoonSign(d).name})`);

  // Retro aktif kümesi: üretim getActiveRetros gün-bazlıdır; SWE anlık hız işaretiyle uyumlu olmalı.
  const prodRetro = new Set<string>(getActiveRetros(d).map(r => String(r.planet)));
  const goldRetro = new Set(g.retroActive);
  const setEq = prodRetro.size === goldRetro.size && [...goldRetro].every(p => prodRetro.has(p));
  eq(setEq, `Retro aktif = [${[...goldRetro].join(", ") || "—"}] (üretim: [${[...prodRetro].join(", ") || "—"}])`);

  // Aydınlanma: SWE elongasyonundan beklenen = (1-cos)/2*100 ; üretim getMoonIllumination ±5%.
  const expectedIllum = (1 - Math.cos(g.sunMoonElongationDeg * Math.PI / 180)) / 2 * 100;
  const prodIllum = getMoonIllumination(d);
  eq(Math.abs(prodIllum - expectedIllum) <= 5, `Aydınlanma ~${expectedIllum.toFixed(1)}% (üretim: ${prodIllum}%, elong ${g.sunMoonElongationDeg}°)`);

  // getPlanetSigns kapsam-içi hiçbir cismi outOfRange bırakmaz (Plüton dahil).
  eq(getPlanetSigns(d).every(p => !p.outOfRange), "9 cisim burcu hesaplandı (outOfRange yok)");
}

console.log(`\n=== SONUÇ: ${failures === 0 ? "✅ GOLDEN DATASET UYUMLU" : `❌ ${failures} SAPMA`} ===`);
process.exit(failures === 0 ? 0 : 1);
