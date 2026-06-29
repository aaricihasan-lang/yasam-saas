// FAZ 2A — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// AE provider smoke harness: gerçek astronomy-engine sağlayıcısıyla ham boylam
// üretir ve doğrular. Gate/line/type/authority/profile/center/channel YOKTUR.
// Çalıştırma:  npx tsx scripts/hd-engine-ae-smoke.ts

import {
  runHdEngineSkeleton,
  AstronomyEnginePlanetLongitudeProvider,
} from "../lib/human-design/engine";
import type { HdBirthInput } from "../lib/human-design/engine";

const SAMPLE: HdBirthInput = {
  date: "1990-05-15",
  time: "14:30",
  timezone: "Europe/Istanbul",
  location: { lat: 41.0082, lon: 28.9784 },
};

function main(): void {
  const provider = new AstronomyEnginePlanetLongitudeProvider();
  const output = runHdEngineSkeleton(SAMPLE, provider);

  const positions = output.personalityPositions;
  const count = positions.length;
  const allInRange = positions.every(
    (p) => p.longitude >= 0 && p.longitude < 360,
  );

  console.log("FAZ 2A — AE provider smoke, not HD chart");
  console.log(
    JSON.stringify(
      {
        metadata: provider.metadata,
        utcIso: output.utcIso,
        personalityJulianDay: output.personalityJulianDay,
        bodyCount: count,
        allLongitudesInRange: allInRange,
        positions,
      },
      null,
      2,
    ),
  );

  // ── Sağlamalar (gate/line YOK; yalnız altyapı kontrolü) ──
  const errors: string[] = [];
  if (count !== 13) errors.push(`Beklenen 13 cisim, gelen ${count}.`);
  if (!allInRange) errors.push("En az bir boylam 0–360 aralığı dışında.");

  if (errors.length > 0) {
    console.error("CHECK BAŞARISIZ:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }

  console.log(
    "\nCHECK: 13 cisim OK, tüm boylamlar 0 <= lon < 360 OK. (Gate/line hesaplanmadı.)",
  );
}

main();
