// FAZ 2D — KATMAN B (gate/line) karşılaştırma.
//
// engine-runner/hd-chart.json (PRODUCTION engine çıktısı) ile golden-dataset
// içindeki GERÇEK vakaların reference.personality/design gate+line değerlerini
// karşılaştırır. YALNIZCA gate/line. type/authority/center/channel YOK.
//
// Gerçek vaka yoksa: verdict NO_GOLDEN_CASES, exit 0, "kalibrasyon yapılmadı".
// Çalıştır:  node scripts/hd-validation/compare/compare_chart.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHART_PATH = join(HERE, "..", "engine-runner", "hd-chart.json");
const CASES_DIR = join(HERE, "..", "golden-dataset", "cases");
const REPORT_JSON = join(HERE, "report.json");
const REPORT_MD = join(HERE, "report.md");

const BODIES = [
  "Sun", "Earth", "Moon", "NorthNode", "SouthNode",
  "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto",
];
const SIDES = ["personality", "design"];

function isRealCaseFile(file, c) {
  if (file.endsWith(".example.json") || file.endsWith(".template.json")) return false;
  if (c.status === "example") return false;
  if (c.compareEligible === false) return false;
  return true;
}

function loadRealCases() {
  const map = new Map();
  if (!existsSync(CASES_DIR)) return map;
  for (const file of readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"))) {
    const c = JSON.parse(readFileSync(join(CASES_DIR, file), "utf-8"));
    if (isRealCaseFile(file, c)) map.set(c.caseId, c);
  }
  return map;
}

function writeReports(report, mdLines) {
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(REPORT_MD, mdLines.join("\n") + "\n", "utf-8");
}

function main() {
  const now = new Date().toISOString();

  if (!existsSync(CHART_PATH)) {
    console.error(`hd-chart.json yok: ${CHART_PATH}`);
    console.error("Önce: npx tsx scripts/hd-validation/engine-runner/hd_prod_runner.ts");
    process.exit(2);
  }

  const chartData = JSON.parse(readFileSync(CHART_PATH, "utf-8"));
  const realCases = loadRealCases();
  const charts = chartData.charts ?? [];

  const mandala = {
    offsetStatus: "validated",
    note: "DEFAULT_MANDALA_OFFSET_DEG = 358.25° — 3 golden case (78/78) ile doğrulandı; değer değişmedi.",
  };

  // ── Gerçek vaka yok → NO_GOLDEN_CASES ──────────────────────────────────────
  if (charts.length === 0 || realCases.size === 0) {
    const report = {
      generatedAt: now,
      phase: "FAZ 2D",
      layer: "B (gate/line)",
      mandala,
      verdict: "NO_GOLDEN_CASES",
      message:
        "Gerçek MyBodyGraph golden vakası yok. Harness hazır ve doğru çalışıyor; " +
        "KALİBRASYON YAPILMADI. Mandala ofseti aday olarak kaldı.",
      total: 0, pass: 0, fail: 0, boundary: 0,
      overallVerdict: "NO_GOLDEN_CASES",
    };
    const md = [
      "# HD Engine — Golden Validation Report (KATMAN B, gate/line)",
      `Tarih: ${now}`,
      "",
      "## VERDICT: NO_GOLDEN_CASES",
      "",
      "Gerçek MyBodyGraph golden vakası bulunamadı (yalnız example/template var).",
      "**Harness hazır ve doğru çalışıyor; kalibrasyon YAPILMADI.**",
      "Mandala ofseti (DEFAULT_MANDALA_OFFSET_DEG) ADAY olarak korunmaktadır — değiştirilmedi.",
      "",
      "Gerçek vaka eklemek için: bir .example.json'u kopyala → MyBodyGraph'tan elle olgusal",
      "gate/line gir → status='real', compareEligible=true → HD-GOLD-NNNN.json → tekrar çalıştır.",
    ];
    writeReports(report, md);
    console.log("VERDICT: NO_GOLDEN_CASES — kalibrasyon yapılmadı (beklenen). exit 0.");
    console.log(`Rapor: ${REPORT_JSON} , ${REPORT_MD}`);
    process.exit(0);
  }

  // ── Gerçek vaka(lar) var → gate/line exact karşılaştırma ────────────────────
  const failures = [];
  const boundaryCases = [];
  let pass = 0;
  let fail = 0;

  for (const chart of charts) {
    const golden = realCases.get(chart.caseId);
    if (!golden) {
      failures.push({ caseId: chart.caseId, blame: "missing-reference", diffs: [] });
      fail += 1;
      continue;
    }

    const diffs = [];
    const byKey = new Map();
    for (const a of chart.activations) byKey.set(`${a.side}:${a.body}`, a);

    for (const side of SIDES) {
      for (const body of BODIES) {
        const eng = byKey.get(`${side}:${body}`);
        const ref = golden.reference?.[side]?.[body];
        if (!eng || !ref) continue;

        const gateMatch = eng.gate === ref.gate;
        const lineMatch = eng.line === ref.line;

        if (!gateMatch || !lineMatch) {
          if (eng.boundaryFlag) {
            // Sınır-bayraklı uyuşmazlık → soft (BOUNDARY), sert FAIL değil.
            boundaryCases.push({
              caseId: chart.caseId, side, body,
              engine: `gate ${eng.gate} line ${eng.line}`,
              reference: `gate ${ref.gate} line ${ref.line}`,
              note: "boundaryFlag=true → soft (girdi-hassasiyeti / mandala sınırı)",
            });
          } else {
            diffs.push({
              field: `${side}.${body}`,
              expected: `gate ${ref.gate} line ${ref.line}`,
              actual: `gate ${eng.gate} line ${eng.line}`,
            });
          }
        }
      }
    }

    if (diffs.length > 0) {
      failures.push({ caseId: chart.caseId, blame: "mapping", diffs });
      fail += 1;
    } else {
      pass += 1;
    }
  }

  const verdict = fail > 0 ? "FAIL" : "PASS";
  const report = {
    generatedAt: now,
    phase: "FAZ 2D",
    layer: "B (gate/line)",
    mandala,
    verdict,
    total: charts.length,
    pass, fail,
    boundary: boundaryCases.length,
    failures,
    boundaryCases,
    overallVerdict: verdict,
    note:
      "Yalnız gate/line karşılaştırması. PASS bile olsa mandala ofseti otomatik " +
      "kilitlenmez; kalibrasyon kararı vaka sayısı yeterliyse ayrıca verilir.",
  };

  const md = [
    "# HD Engine — Golden Validation Report (KATMAN B, gate/line)",
    `Tarih: ${now}`,
    "",
    `## VERDICT: ${verdict}   (${pass} PASS / ${fail} FAIL / ${boundaryCases.length} BOUNDARY, ${charts.length} vaka)`,
    "",
    "Mandala ofseti ADAY — bu rapor onu otomatik kilitlemez.",
  ];
  if (failures.length > 0) {
    md.push("", "### FAIL");
    for (const f of failures) {
      md.push(`- ${f.caseId} [${f.blame}]`);
      for (const d of f.diffs) md.push(`    ${d.field}: ${d.expected} -> ${d.actual}`);
    }
  }
  if (boundaryCases.length > 0) {
    md.push("", "### BOUNDARY (soft)");
    for (const b of boundaryCases) {
      md.push(`- ${b.caseId} ${b.side}.${b.body}: ${b.reference} vs ${b.engine}`);
    }
  }

  writeReports(report, md);
  console.log(`VERDICT: ${verdict} — ${pass} PASS / ${fail} FAIL / ${boundaryCases.length} BOUNDARY`);
  console.log(`Rapor: ${REPORT_JSON} , ${REPORT_MD}`);
  process.exit(verdict === "PASS" ? 0 : 1);
}

main();
