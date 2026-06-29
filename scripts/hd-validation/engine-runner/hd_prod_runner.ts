// FAZ 2D — HD Engine doğrulama koşucusu (PRODUCTION engine).
//
// golden-dataset/cases/ içindeki GERÇEK (status='real', compareEligible!==false,
// *.example.json / *.template.json HARİÇ) vakaları okur ve her biri için:
//   localDateTimeToUtc → AE provider → solveDesignTimeUtc → buildChartActivations
// zincirini çalıştırıp 26 aktivasyon (personality+design gate/line) üretir.
//
// YALNIZCA gate/line. type/authority/center/channel/profile/cross ÜRETİLMEZ.
// Çıktı: engine-runner/hd-chart.json
// Çalıştır:  npx tsx scripts/hd-validation/engine-runner/hd_prod_runner.ts
//
// scripts/ Next.js bundle'ına girmez; production'a dokunmaz.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  localDateTimeToUtc,
  solveDesignTimeUtc,
  buildChartActivations,
  AstronomyEnginePlanetLongitudeProvider,
  type HdBirthInput,
} from "../../../lib/human-design/engine";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(HERE, "..", "golden-dataset", "cases");
const OUT_PATH = join(HERE, "hd-chart.json");

type GoldenCase = {
  caseId: string;
  status?: "real" | "example";
  compareEligible?: boolean;
  input: HdBirthInput & {
    location: { city?: string; country?: string; lat: number; lon: number };
  };
};

/** Yalnız gerçek + karşılaştırmaya uygun vakaları seç. */
function isRealCase(file: string, c: GoldenCase): boolean {
  if (file.endsWith(".example.json") || file.endsWith(".template.json")) return false;
  if (c.status === "example") return false;
  if (c.compareEligible === false) return false;
  return true;
}

function main(): void {
  const provider = new AstronomyEnginePlanetLongitudeProvider();

  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  const realCharts: unknown[] = [];
  let skipped = 0;

  for (const file of files) {
    const raw = readFileSync(join(CASES_DIR, file), "utf-8");
    const c = JSON.parse(raw) as GoldenCase;

    if (!isRealCase(file, c)) {
      skipped += 1;
      console.log(`  [skip] ${file} (example/template/non-eligible)`);
      continue;
    }

    // Temiz HdBirthInput kur (case.input fazladan city/country taşıyabilir).
    const input: HdBirthInput = {
      date: c.input.date,
      time: c.input.time,
      timezone: c.input.timezone,
      location: { lat: c.input.location.lat, lon: c.input.location.lon },
    };

    const birthUtc = localDateTimeToUtc(input);
    const { designUtc, daysBeforeBirth } = solveDesignTimeUtc({ birthUtc, provider });
    const chart = buildChartActivations({ birthUtc, designUtc, provider });

    realCharts.push({
      caseId: c.caseId,
      birthUtcIso: birthUtc.toISOString(),
      designUtcIso: designUtc.toISOString(),
      daysBeforeBirth,
      mandalaOffsetStatus: "validated",
      total: chart.total,
      boundaryCount: chart.boundaryCount,
      activations: chart.activations.map((a) => ({
        body: a.body,
        side: a.side,
        longitude: a.longitude,
        gate: a.gate,
        line: a.line,
        boundaryFlag: a.boundaryFlag,
      })),
    });
    console.log(`  [ok]   ${file} → ${chart.total} aktivasyon`);
  }

  const out = {
    engine: "PRODUCTION lib/human-design/engine (AE provider + 88° solver + doğrulanmış mandala)",
    calibrationStatus: "validated",
    realCaseCount: realCharts.length,
    skippedCount: skipped,
    charts: realCharts,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");
  console.log(
    `\nGerçek vaka: ${realCharts.length}, atlanan: ${skipped}. Çıktı → ${OUT_PATH}`,
  );
  if (realCharts.length === 0) {
    console.log(
      "NOT: Gerçek golden vaka yok → compare NO_GOLDEN_CASES verecek (beklenen).",
    );
  }
}

main();
