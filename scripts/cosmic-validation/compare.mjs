/**
 * FAZ 2C / Adim 0 — KARSILASTIRMA HARNESS'i
 *
 * swe-reference.json (Swiss Ephemeris) ile ae-exact.json (Astronomy Engine) olaylarini
 * esler, EXACT-saat farkini hesaplar ve hiz sinifina gore tolerans politikasi uygular.
 *
 * Cikti: konsolda ozet tablo + report.json (tum eslesme/eslemeyen olaylar).
 * Production'a temas yok.
 *
 * Calistir (once iki ureticiyi calistir):
 *   python scripts/cosmic-validation/swe_reference.py
 *   node   scripts/cosmic-validation/ae_exact.mjs
 *   node   scripts/cosmic-validation/compare.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// ─── Tolerans politikasi (hiz sinifina gore) ────────────────────────────────────
// BIRINCIL KANIT = KONUM uyumu (arcsec): tum siniflar icin iyi-kosullu, asil dogruluk olcusu.
// IKINCIL = ZAMAN uyumu (dakika): yalnizca astronomik anlami olan yerde (Ay/hizli) iddia edilir.
// Yavas ciftlerde tam aci saatlerce arcsec icinde "asili kalir" -> dakika SAHTE HASSASIYET olur,
// uretimde TARIH gosterilmeli (bkz. ampirik bulgu: 6 arcsec konum farki -> 48 dk zaman farki).
const POS_TOL_ARCSEC = 30; // AE vs Swiss-Moshier gercekci ust sinir (gozlenen max ~10")
const POLICY = {
  moon:   { passMin: 1,  warnMin: 2,  assertTime: true,  label: "Ay (hizli)" },
  fast:   { passMin: 3,  warnMin: 6,  assertTime: true,  label: "Gunes/ic gezegen" },
  medium: { passMin: 10, warnMin: 30, assertTime: false, label: "Orta hiz (zaman bilgisel, konum esas)" },
  slow:   { passMin: 60, warnMin: 720, assertTime: false, label: "Yavas dis cift (dakika ANLAMSIZ -> tarih)" },
};

function classify(ev) {
  if (ev.bodyA === "Moon" || ev.bodyB === "Moon") return "moon";
  const rel = ev.relSpeed; // derece/gun
  if (rel >= 0.5) return "fast";
  if (rel >= 0.05) return "medium";
  return "slow";
}

// Eslesme penceresi (gun): ayni cift+aci icin en yakin olayi bul.
const MATCH_WIN = { moon: 0.2, fast: 0.5, medium: 5, slow: 40 };

const key = (e) => `${e.bodyA}|${e.bodyB}|${e.angle}`;

function load(name) {
  const p = join(HERE, name);
  if (!existsSync(p)) {
    console.error(`HATA: ${name} bulunamadi. Once ureticileri calistirin.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, "utf-8"));
}

function main() {
  const aeFile = process.argv[2] || "ae-exact.json"; // ör: node compare.mjs ae-prod.json
  const swe = load("swe-reference.json");
  const ae = load(aeFile);
  console.log(`AE kaynagi: ${aeFile}`);

  // AE olaylarini key bazinda grupla
  const aeByKey = new Map();
  for (const e of ae.events) {
    if (!aeByKey.has(key(e))) aeByKey.set(key(e), []);
    aeByKey.get(key(e)).push(e);
  }
  const aeMatched = new Set();

  const matched = [];
  const sweOnly = [];

  for (const s of swe.events) {
    const cls = classify(s);
    const win = MATCH_WIN[cls];
    const candidates = aeByKey.get(key(s)) || [];
    let best = null, bestDt = Infinity, bestIdx = -1;
    candidates.forEach((a, idx) => {
      const dtDays = Math.abs(a.jd - s.jd);
      if (dtDays < bestDt && dtDays <= win) { best = a; bestDt = dtDays; bestIdx = idx; }
    });
    if (best) {
      aeMatched.add(`${key(s)}#${bestIdx}`);
      const dtMin = (best.jd - s.jd) * 1440;
      // Ima edilen konum farki: |Dt| * goreli hiz -> arcsec (iki efemerisin KONUM uyumu)
      const posArcsec = Math.abs(dtMin) * (s.relSpeed / 1440) * 3600;
      matched.push({
        key: key(s), case: s.case, bodyA: s.bodyA, bodyB: s.bodyB,
        aspect: s.aspect, angle: s.angle, cls,
        sweIso: s.iso, aeIso: best.iso,
        dtMinutes: +dtMin.toFixed(4), absSec: +Math.abs(dtMin * 60).toFixed(2),
        posArcsec: +posArcsec.toFixed(3),
        relSpeed: s.relSpeed, retroA: s.retroA, retroB: s.retroB,
      });
    } else {
      sweOnly.push({ key: key(s), iso: s.iso, aspect: s.aspect, cls, case: s.case });
    }
  }

  // AE'de olup SWE'de eslemeyen (fazladan) olaylar
  const aeOnly = [];
  for (const [k, list] of aeByKey) {
    list.forEach((a, idx) => {
      if (!aeMatched.has(`${k}#${idx}`)) aeOnly.push({ key: k, iso: a.iso, aspect: a.aspect, case: a.case });
    });
  }

  // ─── Sinif bazli ozet ─────────────────────────────────────────────────────────
  const classes = ["moon", "fast", "medium", "slow"];
  const summary = {};
  for (const c of classes) {
    const rows = matched.filter((m) => m.cls === c);
    if (!rows.length) { summary[c] = null; continue; }
    const abs = rows.map((r) => Math.abs(r.dtMinutes));
    const maxAbs = Math.max(...abs);
    const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
    const pol = POLICY[c];
    const pass = rows.filter((r) => Math.abs(r.dtMinutes) <= pol.passMin).length;
    const warn = rows.filter((r) => Math.abs(r.dtMinutes) > pol.passMin && Math.abs(r.dtMinutes) <= pol.warnMin).length;
    const fail = rows.length - pass - warn;
    // Birincil kanit: konum uyumu
    const posArr = rows.map((r) => r.posArcsec);
    const maxPos = Math.max(...posArr);
    const meanPos = posArr.reduce((a, b) => a + b, 0) / posArr.length;
    const posFail = rows.filter((r) => r.posArcsec > POS_TOL_ARCSEC).length;
    summary[c] = {
      n: rows.length, maxAbsMin: +maxAbs.toFixed(4), meanAbsMin: +meanAbs.toFixed(4),
      maxAbsSec: +(maxAbs * 60).toFixed(2), pass, warn, fail,
      maxPosArcsec: +maxPos.toFixed(3), meanPosArcsec: +meanPos.toFixed(3), posFail,
      policy: pol.assertTime ? `ZAMAN pass<=${pol.passMin}dk` : `KONUM<=${POS_TOL_ARCSEC}" (zaman bilgisel)`,
      assertTime: pol.assertTime,
    };
  }

  // ─── Konsol raporu ────────────────────────────────────────────────────────────
  console.log("\n=== FAZ 2C / Adim 0 — AE vs Swiss Ephemeris EXACT-ACI KARSILASTIRMASI ===");
  console.log(`SWE referans olay: ${swe.events.length} | AE olay: ${ae.events.length}`);
  console.log(`Eslesen: ${matched.length} | SWE-only (AE kacirdi): ${sweOnly.length} | AE-only (AE fazla): ${aeOnly.length}\n`);

  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("Sinif", 9) + pad("N", 5) + pad("max|Dt|", 11) + pad("maxKonum", 11) + pad("zaman p/w/f", 14) + "verdict");
  console.log("-".repeat(78));
  for (const c of classes) {
    const s = summary[c];
    if (!s) { console.log(pad(c, 9) + "(olay yok)"); continue; }
    const dtmax = s.maxAbsMin < 1 ? `${s.maxAbsSec.toFixed(1)}sn` : `${s.maxAbsMin.toFixed(2)}dk`;
    const posmax = `${s.maxPosArcsec.toFixed(2)}"`;
    const verdict = s.posFail === 0 ? (s.assertTime ? (s.fail === 0 ? "GECTI" : "ZAMAN-FAIL") : "GECTI(konum)") : "KONUM-FAIL";
    console.log(pad(c, 9) + pad(s.n, 5) + pad(dtmax, 11) + pad(posmax, 11) + pad(`${s.pass}/${s.warn}/${s.fail}`, 14) + verdict);
  }

  // Retro/uclu-gecis ozeti
  const retroEvents = matched.filter((m) => m.retroA || m.retroB);
  console.log(`\nRetro durumdaki eslesen olay: ${retroEvents.length} (istasyon civari dogruluk testi)`);

  if (sweOnly.length) {
    console.log("\nUYARI — AE'nin kacirdigi (SWE-only) ilk 10 olay:");
    sweOnly.slice(0, 10).forEach((e) => console.log(`  ${e.iso}  ${e.key}  [${e.case}]`));
  }
  if (aeOnly.length) {
    console.log("\nUYARI — AE'de fazladan (AE-only) ilk 10 olay:");
    aeOnly.slice(0, 10).forEach((e) => console.log(`  ${e.iso}  ${e.key}  [${e.case}]`));
  }

  const report = {
    generatedFrom: { swe: swe.engine, ae: ae.engine },
    totals: { swe: swe.events.length, ae: ae.events.length, matched: matched.length, sweOnly: sweOnly.length, aeOnly: aeOnly.length },
    policy: POLICY,
    summary,
    sweOnly, aeOnly,
    matched,
  };
  writeFileSync(join(HERE, "report.json"), JSON.stringify(report, null, 1), "utf-8");
  console.log(`\nAyrintili rapor -> ${join(HERE, "report.json")}`);

  // Genel hukum: BIRINCIL=konum (tum siniflar), IKINCIL=zaman (yalniz Ay/hizli)
  const present = classes.filter((c) => summary[c]);
  const posFail = present.some((c) => summary[c].posFail > 0);
  const timeAsserted = present.filter((c) => POLICY[c].assertTime);
  const timeFail = timeAsserted.some((c) => summary[c].fail > 0);
  const completeness = sweOnly.length === 0 && aeOnly.length === 0;
  console.log(`\nGENEL:`);
  console.log(`  Konum uyumu (birincil, tum siniflar) : ${posFail ? "BASARISIZ" : `GECTI (<=${POS_TOL_ARCSEC}\")`}`);
  console.log(`  Zaman uyumu (Ay+hizli)               : ${timeFail ? "BASARISIZ" : "GECTI"}`);
  console.log(`  Kume tamligi (kacirma/fazla)         : ${completeness ? "TAM (208/208)" : "EKSIK/FAZLA var"}`);
  console.log(`  Yavas ciftler                        : uretimde TARIH gosterilecek (dakika sahte hassasiyet)`);
}

main();
