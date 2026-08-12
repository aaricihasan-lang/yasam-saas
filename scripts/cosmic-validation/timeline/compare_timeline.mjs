/**
 * Gunluk exact-aspect TIMELINE — KARSILASTIRMA HARNESS'i.
 *
 * timeline-prod.json (PRODUCTION getZonedDayRange + getExactAspectsInRange) ile
 * swe-timeline.json (BAGIMSIZ Swiss Ephemeris + Python zoneinfo) kiyaslar:
 *   1) PENCERE dogrulugu  : startIso/endIso/durationHours birebir esit mi (getZonedDayRange vs zoneinfo)
 *   2) DST uzunlugu       : Istanbul=24s, Berlin/NY ilkbahar=23s, sonbahar=25s
 *   3) SET COMPLETENESS   : her gun icin missing=0 & extra=0 (kacirma/fazla yok)
 *   4) ZAMAN uyumu        : eslesen olaylarda max |Dt| (Ay<=1dk hedef)
 *   5) TZ MEMBERSHIP       : ayni UTC instant farkli tz'de farkli yerel gune dusuyor
 *
 * En kucuk uyumsuzlukta exit 1.
 *
 * Calistir (once iki ureticiyi):
 *   python scripts/cosmic-validation/timeline/swe_timeline.py
 *   npx tsx scripts/cosmic-validation/timeline/zoned_day_runner.ts
 *   node   scripts/cosmic-validation/timeline/compare_timeline.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

function load(name) {
  const p = join(HERE, name);
  if (!existsSync(p)) { console.error(`HATA: ${name} yok. Once ureticileri calistirin.`); process.exit(1); }
  return JSON.parse(readFileSync(p, "utf-8"));
}

const key = (e) => `${e.bodyA}|${e.bodyB}|${e.angle}`;
const localDate = (iso, tz) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const localTime = (iso, tz) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

// Beklenen DST gun uzunluklari (saat)
const EXPECTED_DUR = {
  "normal-ist": 24, "moon-heavy-ist": 24, "inner-ist": 24, "outer-slow-ist": 24,
  "mercury-retro-ist": 24, "boundary-ist": 24, "boundary-ny": 24,
  "dst-spring-berlin": 23, "dst-fall-berlin": 25, "dst-spring-ny": 23, "dst-fall-ny": 25,
};

function matchDay(prodDay, sweDay) {
  // (bodyA,bodyB,angle) bazinda en yakin zaman eslesmesi (tek gun icinde cift+aci genelde tekil)
  const prodByKey = new Map();
  for (const e of prodDay.events) {
    if (!prodByKey.has(key(e))) prodByKey.set(key(e), []);
    prodByKey.get(key(e)).push(e);
  }
  const matchedProd = new Set();
  const matched = [], missing = [];
  for (const s of sweDay.events) {
    const cands = prodByKey.get(key(s)) || [];
    let best = null, bestDt = Infinity, bestIdx = -1;
    cands.forEach((p, idx) => {
      if (matchedProd.has(`${key(s)}#${idx}`)) return;
      const dt = Math.abs(p.jd - s.jd);
      if (dt < bestDt) { best = p; bestDt = dt; bestIdx = idx; }
    });
    if (best && bestDt <= 0.5) {
      matchedProd.add(`${key(s)}#${bestIdx}`);
      matched.push({ key: key(s), dtMin: (best.jd - s.jd) * 1440, includesMoon: s.bodyA === "Moon" || s.bodyB === "Moon", sweIso: s.iso, prodIso: best.iso });
    } else {
      missing.push({ key: key(s), iso: s.iso });
    }
  }
  const extra = [];
  for (const [k, list] of prodByKey) {
    list.forEach((p, idx) => { if (!matchedProd.has(`${k}#${idx}`)) extra.push({ key: k, iso: p.iso }); });
  }
  return { matched, missing, extra };
}

function main() {
  const prod = load("timeline-prod.json");
  const swe = load("swe-timeline.json");
  const prodById = new Map(prod.days.map((d) => [d.id, d]));

  let fail = 0;
  let maxMoonDtSec = 0, maxAnyDtSec = 0;
  let totalMatched = 0, totalMissing = 0, totalExtra = 0;

  console.log("=== GUNLUK TIMELINE — PRODUCTION vs Swiss Ephemeris + zoneinfo ===\n");
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("fixture", 20) + pad("pencere", 9) + pad("sure", 7) + pad("olay p/s", 10) + pad("miss/extra", 12) + "maxDt");
  console.log("-".repeat(74));

  for (const s of swe.days) {
    const p = prodById.get(s.id);
    if (!p) { console.log(`${pad(s.id, 20)} PROD YOK`); fail++; continue; }

    // 1) Pencere birebir
    const winOk = p.startIso === s.startIso && p.endIso === s.endIso;
    // 2) DST uzunlugu
    const durProdOk = Math.abs(p.durationHours - (EXPECTED_DUR[s.id] ?? p.durationHours)) < 1e-6;
    const durMatch = Math.abs(p.durationHours - s.durationHours) < 1e-6;
    // 3) completeness + 4) zaman
    const { matched, missing, extra } = matchDay(p, s);
    totalMatched += matched.length; totalMissing += missing.length; totalExtra += extra.length;
    let dayMaxDt = 0;
    for (const m of matched) {
      const sec = Math.abs(m.dtMin * 60);
      dayMaxDt = Math.max(dayMaxDt, sec);
      maxAnyDtSec = Math.max(maxAnyDtSec, sec);
      if (m.includesMoon) maxMoonDtSec = Math.max(maxMoonDtSec, sec);
    }
    const ok = winOk && durProdOk && durMatch && missing.length === 0 && extra.length === 0;
    if (!ok) fail++;
    console.log(
      pad(s.id, 20) + pad(winOk ? "OK" : "FARK", 9) +
      pad(`${p.durationHours}s`, 7) + pad(`${p.count}/${s.count}`, 10) +
      pad(`${missing.length}/${extra.length}`, 12) +
      `${dayMaxDt.toFixed(1)}sn ${ok ? "" : "✗"}`,
    );
    if (missing.length) missing.slice(0, 5).forEach((m) => console.log(`      MISSING ${m.key} @ ${m.iso}`));
    if (extra.length) extra.slice(0, 5).forEach((m) => console.log(`      EXTRA   ${m.key} @ ${m.iso}`));
    if (!winOk) console.log(`      pencere prod[${p.startIso}..${p.endIso}) swe[${s.startIso}..${s.endIso})`);
  }

  // 5) TZ membership: ayni UTC instant, Istanbul vs New York yerel gun/saat
  console.log("\n=== TZ MEMBERSHIP: ayni fiziksel an, farkli yerel gun ===");
  const ny = prodById.get("boundary-ny"), ist = prodById.get("boundary-ist");
  let membershipShown = 0;
  if (ny && ist) {
    const istInstants = new Set(ist.events.map((e) => e.iso));
    // NY 11 Agu penceresinde olup Istanbul 11 Agu penceresinde OLMAYAN olaylar:
    const onlyNY = ny.events.filter((e) => !istInstants.has(e.iso));
    for (const e of onlyNY.slice(0, 4)) {
      const dNy = localDate(e.iso, "America/New_York"), tNy = localTime(e.iso, "America/New_York");
      const dIst = localDate(e.iso, "Europe/Istanbul"), tIst = localTime(e.iso, "Europe/Istanbul");
      const diff = dNy !== dIst ? "  ← farkli yerel gun" : "";
      console.log(`  ${e.iso}  ${e.bodyA} ${e.aspect} ${e.bodyB}  | NY ${dNy} ${tNy} | IST ${dIst} ${tIst}${diff}`);
      membershipShown++;
    }
  }
  const membershipOk = membershipShown > 0;
  if (!membershipOk) { console.log("  UYARI: membership ornegi bulunamadi"); }

  // ─── Genel hukum ───────────────────────────────────────────────────────────────
  console.log("\n=== GENEL ===");
  console.log(`  Gun sayisi                    : ${swe.days.length}`);
  console.log(`  Eslesen olay                  : ${totalMatched}`);
  console.log(`  SET COMPLETENESS (miss/extra) : ${totalMissing}/${totalExtra} ${totalMissing === 0 && totalExtra === 0 ? "→ TAM" : "→ EKSIK/FAZLA ✗"}`);
  console.log(`  Ay zaman uyumu                : max ${maxMoonDtSec.toFixed(1)} sn ${maxMoonDtSec <= 60 ? "(<=60sn OK)" : "✗ >60sn"}`);
  console.log(`  Tum siniflar zaman            : max ${maxAnyDtSec.toFixed(1)} sn`);
  console.log(`  DST pencere uzunluklari       : ${fail === 0 ? "beklenen (23/24/25s)" : "kontrol et"}`);
  console.log(`  TZ membership                 : ${membershipOk ? "GOSTERILDI (ayni an, farkli yerel gun)" : "YOK"}`);

  if (maxMoonDtSec > 60) fail++;
  if (!membershipOk) fail++;

  console.log(`\nSONUC: ${fail === 0 ? "TUM KONTROLLER GECTI ✓" : `${fail} KONTROL BASARISIZ ✗`}`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
