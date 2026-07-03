#!/usr/bin/env node
/**
 * scripts/cosmic-validation/run-all.mjs
 * Kozmik Ajanda astronomik doğrulama orkestratörü — FAZ 4 / Adım 3 / P0.
 *
 * Mevcut harness dosyalarını (swe_*.py, prod_runner*.ts, compare_*.mjs, testset)
 * DEĞİŞTİRMEZ. Yalnız FAZ 2C/3A/3B/3C zincirlerini sırayla çağırır, compare
 * stdout'undan kararlı "sinyaller" çıkarır ve kilitli baseline
 * (run-all-baseline.json) ile karşılaştırır.
 *
 *   Sapma / adım hatası → exit 1
 *   Sapma yok           → exit 0
 *
 * Bayraklar:
 *   --engine-only        python (swe referans) adımlarını atla; mevcut swe-*.json
 *                        referansına karşı yalnız prod_runner + compare çalıştır.
 *   --faz=2c,3a,3b,3c    yalnız seçili harness'leri çalıştır (virgülle).
 *   --json               makine-okunur özet (yalnız JSON stdout) — CI için.
 *   --update-baseline    mevcut çıktıyı baseline olarak yaz; seçili harness'leri
 *                        mevcut baseline'a MERGE eder (bilinçli kilitleme adımı).
 *
 * Not: Bu dosya bir orkestratördür — hiçbir motor, production kodu, UI veya mevcut
 * doğrulama script'i BU DOSYA tarafından değiştirilmez; yalnız çağrılır.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, "run-all-baseline.json");
const PY = process.env.COSMIC_PY || "python";

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const ENGINE_ONLY = argv.includes("--engine-only");
const UPDATE      = argv.includes("--update-baseline");
const JSON_OUT    = argv.includes("--json");
const fazArg      = argv.find(a => a.startsWith("--faz="));
const SELECTED    = fazArg ? fazArg.slice(6).split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : null;

const say = (...a) => { if (!JSON_OUT) console.log(...a); };

// ── Sinyal yardımcıları (compare stdout'undan kararlı token çıkarımı) ────────
const g1 = (t, re) => { const m = t.match(re); return m ? m[1] : "MATCH-YOK"; };
const gj = (t, re, n) => { const m = t.match(re); return m ? m.slice(1, 1 + n).join("|") : "MATCH-YOK"; };

// ── Harness tanımları ───────────────────────────────────────────────────────
// Her harness: python(referans) → prod_runner(PRODUCTION engine) → compare.
// extract() yalnız compare'lerin stdout'una uygulanır.
const HARNESSES = [
  {
    id: "2c",
    name: "FAZ 2C — Aspect (exact + motion)",
    dir: HERE,
    engine: "lib/cosmic/exactAspects.ts + aspects.ts + aspectMotion.ts",
    steps: [
      { kind: "py",   file: "swe_reference.py", ref: true },
      { kind: "tsx",  file: "prod_runner.ts" },
      { kind: "node", file: "compare.mjs", args: ["ae-prod.json"], capture: true },
      { kind: "tsx",  file: "motion_runner.ts" },
      { kind: "node", file: "compare_motion.mjs", capture: true },
    ],
    extract: (t) => ({
      setTotal:  gj(t, /SWE referans olay:\s*(\d+)\s*\|\s*AE olay:\s*(\d+)/, 2),
      matched:   gj(t, /Eslesen:\s*(\d+)\s*\|\s*SWE-only[^:]*:\s*(\d+)\s*\|\s*AE-only[^:]*:\s*(\d+)/, 3),
      konum:     g1(t, /Konum uyumu[^:]*:\s*(\S+)/),
      zaman:     g1(t, /Zaman uyumu[^:]*:\s*(\S+)/),
      kume:      gj(t, /Kume tamligi[^:]*:\s*(\S+)\s*\((\d+\/\d+)\)/, 2),
      motSigned: gj(t, /signedSpeed[^:]*:\s*(\d+\/\d+)\s*\(uyumsuz:\s*(\d+)\)/, 2),
      motTotal:  gj(t, /totalPassCount[^:]*:\s*(\d+\/\d+)\s*\(uyumsuz:\s*(\d+)\)/, 2),
      motPass:   gj(t, /passNumber[^:]*:\s*(\d+\/\d+)\s*\(uyumsuz:\s*(\d+)\)/, 2),
      motGenel:  g1(t, /GENEL:\s*(GEÇTİ|GECTI|BAŞARISIZ|BASARISIZ)/),
    }),
  },
  {
    id: "3a",
    name: "FAZ 3A — Tutulma",
    dir: join(HERE, "eclipses"),
    engine: "lib/cosmic/eclipses.ts",
    steps: [
      { kind: "py",   file: "swe_eclipses.py", ref: true },
      { kind: "tsx",  file: "prod_runner.ts" },
      { kind: "node", file: "compare_eclipses.mjs", args: ["ae-prod-eclipses.json"], capture: true },
    ],
    extract: (t) => {
      const sets  = [...t.matchAll(/AE (\d+) \| SWE (\d+) \| eşleşen (\d+) \| AE-only (\d+)/g)];
      const types = [...t.matchAll(/tür uyumu (\d+\/\d+)/g)];
      const setStr = (m) => (m ? `${m[1]}|${m[2]}|${m[3]}|${m[4]}` : "MATCH-YOK");
      return {
        solarSet:  setStr(sets[0]),
        solarType: types[0] ? types[0][1] : "MATCH-YOK",
        lunarSet:  setStr(sets[1]),
        lunarType: types[1] ? types[1][1] : "MATCH-YOK",
        peak:      g1(t, /Peak zaman[^:]*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
        tur:       g1(t, /Tür uyumu \(hibrit hariç\)[^:]*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
      };
    },
  },
  {
    id: "3b",
    name: "FAZ 3B — Void of Course Moon",
    dir: join(HERE, "voidmoon"),
    engine: "lib/cosmic/voidMoon.ts",
    steps: [
      { kind: "py",   file: "swe_voc.py", ref: true },
      { kind: "tsx",  file: "prod_runner_voc.ts" },
      { kind: "node", file: "compare_voc.mjs", args: ["ae-prod-voc.json"], capture: true },
    ],
    extract: (t) => ({
      aspectsiz: gj(t, /aspectsiz pencere[^:]*:\s*AE (\d+) · SWE (\d+) \(uyumsuz (\d+)\)/, 3),
      ingress:   g1(t, /1A ingress\s*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
      voc:       g1(t, /1B VOC\s*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
      tr:        g1(t, /TR dönüşüm\s*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
    }),
  },
  {
    id: "3c",
    name: "FAZ 3C — Lunar Orbit",
    dir: join(HERE, "lunarorbit"),
    engine: "lib/cosmic/lunarOrbit.ts",
    steps: [
      { kind: "py",   file: "swe_lunarorbit.py", ref: true },
      { kind: "tsx",  file: "prod_runner_lunarorbit.ts" },
      { kind: "node", file: "compare_lunarorbit.mjs", args: ["ae-prod-lunarorbit.json"], capture: true },
    ],
    extract: (t) => ({
      supermoon: gj(t, /Supermoon \(AE\)\s*:\s*(\d+) \| AE-SWE etiket uyumsuz (\d+)/, 2),
      mesafe:    g1(t, /Mesafe[^:]*:\s*(GECTI|GEÇTİ|INCELE|İNCELE)/),
      apsis:     g1(t, /Apsis[^:]*:\s*(GECTI|GEÇTİ|INCELE|İNCELE)/),
      syzygy:    g1(t, /Syzygy[^:]*:\s*(GECTI|GEÇTİ|INCELE|İNCELE)/),
      cls:       g1(t, /Supermoon\/Micromoon etiket\s*:\s*(GECTI|GEÇTİ|INCELE|İNCELE)/),
    }),
  },
  {
    id: "5e1",
    name: "FAZ 5 P5e-1 — Timezone Render Smoke",
    dir: join(HERE, "global"),
    engine: "lib/location/tz.ts (Intl render helpers)",
    // py→prod→compare DEĞİL: tek node scripti (SWE'siz, saf Intl). ref adımı yok →
    // hem full hem --engine-only'de çalışır. Script fail'de exit 1 → stepFail yakalar.
    steps: [
      { kind: "node", file: "tz_render_smoke.mjs", capture: true },
    ],
    extract: (t) => ({
      smoke:       g1(t, /SONUÇ:\s*\S+\s+(PASS|FAIL)/),
      istMismatch: g1(t, /Istanbul regresyon uyumsuz sayısı:\s*(\d+)/),
    }),
  },
  {
    id: "5e2",
    name: "FAZ 5 P5e-2 — Global Tutulma (10 pilot şehir)",
    dir: join(HERE, "global"),
    engine: "lib/cosmic/eclipses.ts (getSolarCityVisibility + WORLD_LOCATIONS)",
    // py→prod→compare (3A ile aynı konvansiyon). --engine-only'de yalnız SWE (py) atlanır;
    // prod+compare cache'li swe-global-eclipses.json'a karşı koşar. Kompakt sinyaller:
    // PASS token + tam sayı sayaçlar (float maksimum YOK → pyswisseph sürümüne kırılgan değil).
    steps: [
      { kind: "py",   file: "swe_global_eclipses.py", ref: true },
      { kind: "tsx",  file: "prod_global_runner.ts" },
      { kind: "node", file: "compare_global_eclipses.mjs", capture: true },
    ],
    extract: (t) => ({
      cityCount:   gj(t, /PROD (\d+)\s*\/\s*SWE (\d+)/, 2),
      matched:     g1(t, /Eşleşen olay \/ marjinal\s*:\s*(\d+)/),
      marginal:    g1(t, /Eşleşen olay \/ marjinal\s*:\s*\d+\s*\/\s*(\d+)/),
      peak:        g1(t, /Peak zaman[^:]*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
      altitude:    g1(t, /Altitude[^:]*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
      obscuration: g1(t, /Obscuration[^:]*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
      visibility:  g1(t, /Görünürlük uyumu[^:]*:\s*(GEÇTİ|GECTI|İNCELE|INCELE)/),
      totalEvents: g1(t, /total olaylar hariç:\s*(\d+)/),
    }),
  },
];

// ── Adım çalıştırıcı (cwd-bağımsız; scriptler __file__/import.meta tabanlı) ──
function runStep(step, dir) {
  const scriptAbs = join(dir, step.file);
  const extra = (step.args || []).join(" ");
  const cmd =
    step.kind === "py"  ? `${PY} "${scriptAbs}" ${extra}` :
    step.kind === "tsx" ? `npx tsx "${scriptAbs}" ${extra}` :
                          `node "${scriptAbs}" ${extra}`;
  return spawnSync(cmd, {
    cwd: dir,
    encoding: "utf-8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
}

// ── Seçim doğrula ───────────────────────────────────────────────────────────
if (SELECTED) {
  const unknown = SELECTED.filter(s => !HARNESSES.some(h => h.id === s));
  if (unknown.length) { console.error(`Bilinmeyen faz: ${unknown.join(", ")} (geçerli: 2c,3a,3b,3c,5e1,5e2)`); process.exit(2); }
}
const selectedHarnesses = HARNESSES.filter(h => !SELECTED || SELECTED.includes(h.id));

say(`\n=== Kozmik Doğrulama run-all ${ENGINE_ONLY ? "(engine-only)" : "(full)"}${SELECTED ? " faz=" + SELECTED.join(",") : ""}${UPDATE ? " [BASELINE GÜNCELLEME]" : ""} ===`);

// ── Harness'leri sırayla çalıştır ───────────────────────────────────────────
const results = [];
for (const h of selectedHarnesses) {
  say(`\n━━━ ${h.name} ━━━`);
  say(`    engine: ${h.engine}`);
  let captured = "";
  let stepFail = null;
  for (const step of h.steps) {
    if (ENGINE_ONLY && step.ref) { say(`  · atla (engine-only): ${step.file}`); continue; }
    say(`  · çalıştır: ${step.file}${step.args ? " " + step.args.join(" ") : ""}`);
    const res = runStep(step, h.dir);
    if (res.error || res.status !== 0) {
      stepFail = { file: step.file, status: res.status ?? "spawn-error", tail: String(res.stderr || res.error?.message || "").trim().slice(-500) };
      break;
    }
    if (step.capture) captured += "\n" + (res.stdout || "");
  }
  if (stepFail) {
    say(`  ✗ ADIM HATASI: ${stepFail.file} (status=${stepFail.status})`);
    if (stepFail.tail) say(`    ${stepFail.tail.replace(/\n/g, "\n    ")}`);
    results.push({ id: h.id, name: h.name, engine: h.engine, stepFail, signals: null });
    continue;
  }
  const signals = h.extract(captured);
  results.push({ id: h.id, name: h.name, engine: h.engine, stepFail: null, signals });
  for (const [k, v] of Object.entries(signals)) say(`    ${k.padEnd(11)} = ${v}`);
}

// ── Baseline yaz (merge — seçili olmayan harness'leri korur) ─────────────────
if (UPDATE) {
  const existing = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) : {};
  const merged = {
    note: "Kozmik Ajanda kilitli doğrulama baseline'ı — run-all.mjs sinyalleri. Sapma = regresyon. Yalnız --update-baseline ile bilinçli güncellenir.",
    harnesses: { ...(existing.harnesses || {}) },
  };
  let wrote = 0;
  for (const r of results) if (r.signals) { merged.harnesses[r.id] = r.signals; wrote++; }
  writeFileSync(BASELINE_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  say(`\nBaseline güncellendi (${wrote} harness) -> ${BASELINE_PATH}`);
}

// ── Baseline ile diff ───────────────────────────────────────────────────────
const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) : null;
let anyDeviation = false;

for (const r of results) {
  if (r.stepFail) { r.ok = false; anyDeviation = true; r.deviations = [{ key: "(adım)", expected: "başarılı", actual: `hata: ${r.stepFail.file}` }]; continue; }
  const base = baseline?.harnesses?.[r.id];
  if (!base) { r.ok = false; anyDeviation = true; r.deviations = [{ key: "(baseline)", expected: "kayıt", actual: "yok — önce --update-baseline" }]; continue; }
  const devs = [];
  for (const k of new Set([...Object.keys(base), ...Object.keys(r.signals)])) {
    if (base[k] !== r.signals[k]) devs.push({ key: k, expected: base[k] ?? "(yok)", actual: r.signals[k] ?? "(yok)" });
  }
  r.ok = devs.length === 0;
  r.deviations = devs;
  if (!r.ok) anyDeviation = true;
}

// ── Rapor ───────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({
    mode: ENGINE_ONLY ? "engine-only" : "full",
    selected: SELECTED,
    updatedBaseline: UPDATE,
    ok: !anyDeviation,
    harnesses: results.map(r => ({ id: r.id, ok: r.ok, signals: r.signals, deviations: r.deviations || [] })),
  }, null, 2));
} else {
  say(`\n=== ÖZET ===`);
  for (const r of results) {
    say(`  ${r.ok ? "✅" : "❌"} ${r.id.toUpperCase().padEnd(4)} ${r.name}`);
    for (const d of (r.deviations || [])) say(`       SAPMA ${d.key}: beklenen "${d.expected}" · gerçek "${d.actual}"`);
  }
  say(`\nSONUÇ: ${anyDeviation ? "❌ SAPMA/HATA VAR (exit 1)" : "✅ TÜM HARNESS BASELINE İLE UYUMLU (exit 0)"}`);
}

process.exit(anyDeviation ? 1 : 0);
