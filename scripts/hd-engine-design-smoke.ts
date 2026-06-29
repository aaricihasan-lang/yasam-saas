// FAZ 2B — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// 88° design solver smoke harness. localDateTimeToUtc → AE provider →
// solveDesignTimeUtc zincirini koşturur, JSON basar ve makullük kontrolü yapar.
// Gate/line/type/authority/profile/center/channel YOK.
// Çalıştırma:  npx tsx scripts/hd-engine-design-smoke.ts

import {
  localDateTimeToUtc,
  solveDesignTimeUtc,
  AstronomyEnginePlanetLongitudeProvider,
} from "../lib/human-design/engine";
import type { HdBirthInput } from "../lib/human-design/engine";

// Astronomik olarak doğru solar-arc gün aralığı.
// Güneş hızı 0.953–1.019°/gün → 88° ~86.4–92.3 günde taranır; küçük marj eklendi.
// NOT: bu aralık 88'in ETRAFINDA dar DEĞİLDİR; geniş olması 88 GÜN değil 88°
// çözüldüğünün kanıtıdır (bkz. Ocak↔Temmuz farkı).
const DAYS_MIN = 85;
const DAYS_MAX = 93;
const DELTA_TOL_ARCSEC = 1;

const CASES: ReadonlyArray<{ label: string; input: HdBirthInput }> = [
  {
    label: "Ocak (perihel — hızlı Güneş)",
    input: {
      date: "1990-01-15",
      time: "14:30",
      timezone: "Europe/Istanbul",
      location: { lat: 41.0082, lon: 28.9784 },
    },
  },
  {
    label: "Temmuz (afel — yavaş Güneş)",
    input: {
      date: "1990-07-15",
      time: "14:30",
      timezone: "Europe/Istanbul",
      location: { lat: 41.0082, lon: 28.9784 },
    },
  },
];

function main(): void {
  console.log("FAZ 2B — 88° design solver smoke, not HD chart");

  const provider = new AstronomyEnginePlanetLongitudeProvider();
  const errors: string[] = [];
  const daysByLabel: Record<string, number> = {};

  for (const { label, input } of CASES) {
    const birthUtc = localDateTimeToUtc(input);
    const result = solveDesignTimeUtc({ birthUtc, provider });
    daysByLabel[label] = result.daysBeforeBirth;

    console.log(`\n── ${label} ──`);
    console.log(
      JSON.stringify(
        {
          input,
          birthUtcIso: birthUtc.toISOString(),
          designUtcIso: result.designUtc.toISOString(),
          birthSunLongitude: result.birthSunLongitude,
          targetSunLongitude: result.targetSunLongitude,
          designSunLongitude: result.designSunLongitude,
          deltaArcsec: result.deltaArcsec,
          iterations: result.iterations,
          daysBeforeBirth: result.daysBeforeBirth,
          method: result.method,
        },
        null,
        2,
      ),
    );

    if (result.daysBeforeBirth < DAYS_MIN || result.daysBeforeBirth > DAYS_MAX) {
      errors.push(
        `${label}: daysBeforeBirth=${result.daysBeforeBirth.toFixed(4)} ` +
          `makul aralık [${DAYS_MIN}, ${DAYS_MAX}] dışında.`,
      );
    }
    if (result.deltaArcsec > DELTA_TOL_ARCSEC) {
      errors.push(
        `${label}: deltaArcsec=${result.deltaArcsec.toFixed(4)} > ${DELTA_TOL_ARCSEC}.`,
      );
    }
  }

  // 88° (88 GÜN DEĞİL) kanıtı: iki vakanın gün sayısı farklı olmalı.
  const labels = Object.keys(daysByLabel);
  const daySpread = Math.abs(daysByLabel[labels[0]] - daysByLabel[labels[1]]);
  console.log(
    `\n88°≠88gün kanıtı: |Ocak − Temmuz| = ${daySpread.toFixed(4)} gün ` +
      `(aynı olmaları GEREKMEZ; solar-arc Kepler hızına bağlıdır).`,
  );

  if (errors.length > 0) {
    console.error("\nCHECK BAŞARISIZ:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }

  console.log(
    `\nCHECK: her vaka deltaArcsec ≤ ${DELTA_TOL_ARCSEC}″ OK, ` +
      `daysBeforeBirth ∈ [${DAYS_MIN}, ${DAYS_MAX}] OK. (Gate/line hesaplanmadı.)`,
  );
}

main();
