/**
 * FAZ 3B / Adım 1 — VOC karşılaştırma harness'i (AE vs Swiss Ephemeris).
 *   1A: burç girişi/çıkışı (ingress) zaman + ad uyumu.
 *   1B: VOC başlangıç/bitiş/süre + son aspect gezegen/tür + aspectsiz pencere.
 *
 * Çalıştır:  node scripts/cosmic-validation/voidmoon/compare_voc.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (n) => {
  const p = join(HERE, n);
  if (!existsSync(p)) { console.error(`HATA: ${n} yok. Önce üreticileri çalıştırın.`); process.exit(1); }
  return JSON.parse(readFileSync(p, "utf-8"));
};
const ms = (iso) => Date.parse(iso);
const minDiff = (a, b) => Math.abs(ms(a) - ms(b)) / 60000;

const MATCH_WIN_MIN = 90;   // aynı periyodu eşleştirme (enter'a göre)
const ING_TOL_MIN = 2;      // ingress tolerans (getMoonSignPeriod ~1 dk)
const VOC_TOL_MIN = 2;      // VOC başlangıç/bitiş tolerans

function main() {
  const aeFile = process.argv[2] || "ae-voc.json"; // ör: compare_voc.mjs ae-prod-voc.json
  const ae = load(aeFile).voc;
  const swe = load("swe-voc.json").voc;
  console.log(`=== VOID OF COURSE: ${aeFile} vs Swiss Ephemeris ===`);
  console.log(`AE ${ae.length} periyot | SWE ${swe.length} periyot`);

  // SWE'yi enter zamanına göre eşleştir
  const used = new Set();
  let matched = 0, signMis = 0, nextSignMis = 0;
  let enterDiffs = [], exitDiffs = [], vocStartDiffs = [], vocEndDiffs = [], durDiffs = [];
  let lastBodyMis = 0, lastTypeMis = 0, noAspMis = 0;
  let aeOnlyNoAsp = 0, sweNoAsp = 0, cross = 0;
  const samples = [];

  for (const a of ae) {
    let best = -1, bd = Infinity;
    swe.forEach((s, i) => { if (used.has(i)) return; const d = minDiff(a.enterUTC, s.enterUTC); if (d < bd) { bd = d; best = i; } });
    if (best < 0 || bd > MATCH_WIN_MIN) { samples.push(`AE-only ${a.sign}→${a.nextSign} @${a.enterUTC}`); continue; }
    used.add(best); matched++;
    const s = swe[best];
    enterDiffs.push(minDiff(a.enterUTC, s.enterUTC));
    exitDiffs.push(minDiff(a.exitUTC, s.exitUTC));
    vocStartDiffs.push(minDiff(a.vocStartUTC, s.vocStartUTC));
    vocEndDiffs.push(minDiff(a.vocEndUTC, s.vocEndUTC));
    durDiffs.push(Math.abs(a.durationMin - s.durationMin));
    if (a.sign !== s.sign) { signMis++; if (samples.length < 8) samples.push(`SIGN ${a.enterUTC} AE=${a.sign} SWE=${s.sign}`); }
    if (a.nextSign !== s.nextSign) nextSignMis++;
    if ((a.lastAspectBody ?? "") !== (s.lastAspectBody ?? "")) { lastBodyMis++; if (samples.length < 8) samples.push(`BODY ${a.enterUTC} AE=${a.lastAspectBody} SWE=${s.lastAspectBody}`); }
    if ((a.lastAspectType ?? "") !== (s.lastAspectType ?? "")) lastTypeMis++;
    if (a.noAspect !== s.noAspect) noAspMis++;
    if (a.noAspect) aeOnlyNoAsp++;
    if (s.noAspect) sweNoAsp++;
    if (a.crosses0_360) cross++;
  }
  const sweOnly = swe.length - used.size;

  const stat = (arr) => {
    if (!arr.length) return { max: 0, mean: 0 };
    return { max: Math.max(...arr), mean: arr.reduce((x, y) => x + y, 0) / arr.length };
  };
  const sEnter = stat(enterDiffs), sExit = stat(exitDiffs), sVS = stat(vocStartDiffs), sVE = stat(vocEndDiffs), sDur = stat(durDiffs);
  const secOrMin = (m) => (m < 1 ? `${(m * 60).toFixed(1)}sn` : `${m.toFixed(2)}dk`);

  console.log(`Eşleşen ${matched} | AE-only ${ae.length - matched} | SWE-only ${sweOnly}`);
  console.log("");
  console.log("── 1A: BURÇ GİRİŞİ (ingress) ──");
  console.log(`  burç adı uyumu      : ${matched - signMis}/${matched}`);
  console.log(`  sonraki burç uyumu  : ${matched - nextSignMis}/${matched}`);
  console.log(`  giriş (enter) max|Δ|: ${secOrMin(sEnter.max)} · ort ${secOrMin(sEnter.mean)}  (tol ${ING_TOL_MIN}dk)`);
  console.log(`  çıkış (exit)  max|Δ|: ${secOrMin(sExit.max)} · ort ${secOrMin(sExit.mean)}  (tol ${ING_TOL_MIN}dk)`);
  console.log("");
  console.log("── 1B: VOC PENCERESİ ──");
  console.log(`  VOC başlangıç max|Δ|: ${secOrMin(sVS.max)} · ort ${secOrMin(sVS.mean)}  (tol ${VOC_TOL_MIN}dk)`);
  console.log(`  VOC bitiş     max|Δ|: ${secOrMin(sVE.max)} · ort ${secOrMin(sVE.mean)}  (tol ${VOC_TOL_MIN}dk)`);
  console.log(`  süre          max|Δ|: ${secOrMin(sDur.max)}`);
  console.log(`  son aspect gezegeni  : ${matched - lastBodyMis}/${matched} uyumlu`);
  console.log(`  son aspect türü      : ${matched - lastTypeMis}/${matched} uyumlu`);
  console.log(`  aspectsiz pencere    : AE ${aeOnlyNoAsp} · SWE ${sweNoAsp} (uyumsuz ${noAspMis})`);
  console.log(`  0/360 (Balık→Koç)    : ${cross} periyot test edildi`);

  // TR dönüşüm sağlaması: bir örnekte TR = UTC+3 mü
  const sample = ae.find(v => v.vocStartTR && v.vocStartUTC);
  let trOk = false;
  if (sample) trOk = Math.abs((Date.parse(sample.vocStartTR) - Date.parse(sample.vocStartUTC))) < 1000;
  console.log(`  TR dönüşümü (=UTC+3) : ${trOk ? "DOĞRU" : "İNCELE"}`);

  if (samples.length) { console.log("\nörnekler:"); samples.slice(0, 8).forEach(s => console.log("  " + s)); }

  const ingPass = sEnter.max <= ING_TOL_MIN && sExit.max <= ING_TOL_MIN && signMis === 0 && nextSignMis === 0;
  const vocPass = sVS.max <= VOC_TOL_MIN && sVE.max <= VOC_TOL_MIN && lastBodyMis === 0 && lastTypeMis === 0 && noAspMis === 0;
  console.log("\n=== GENEL ===");
  console.log(`  1A ingress : ${ingPass ? "GEÇTİ" : "İNCELE"}`);
  console.log(`  1B VOC     : ${vocPass ? "GEÇTİ" : "İNCELE"}`);
  console.log(`  TR dönüşüm : ${trOk ? "GEÇTİ" : "İNCELE"}`);

  writeFileSync(join(HERE, "voc-report.json"), JSON.stringify({
    matched, sweOnly, aeOnly: ae.length - matched,
    ingress: { signMis, nextSignMis, enter: sEnter, exit: sExit },
    voc: { vocStart: sVS, vocEnd: sVE, dur: sDur, lastBodyMis, lastTypeMis, noAspMis, aeNoAsp: aeOnlyNoAsp, sweNoAsp, cross },
    trOk,
  }, null, 1), "utf-8");
  console.log(`\nAyrıntı -> ${join(HERE, "voc-report.json")}`);
}

main();
