// FAZ 0 — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// Smoke harness: iskelet motoru örnek bir girdiyle çalıştırıp JSON basar.
// Çalıştırma:  npx tsx scripts/hd-engine-smoke.ts

import { runHdEngineSkeleton } from "../lib/human-design/engine";
import type { HdBirthInput } from "../lib/human-design/engine";

const SAMPLE: HdBirthInput = {
  date: "1990-05-15",
  time: "14:30",
  timezone: "Europe/Istanbul",
  location: { lat: 41.0082, lon: 28.9784 },
};

function main(): void {
  const output = runHdEngineSkeleton(SAMPLE);
  // Tek satırlık bilgi + biçimli JSON.
  console.log("HD Engine FAZ 0 smoke — örnek çıktı (mock, production değil):");
  console.log(JSON.stringify(output, null, 2));
}

main();
