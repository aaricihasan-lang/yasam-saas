/**
 * KZM-TZ-01 — lib/location/tz.ts (Kozmik Takvim, Kampanya Kozmik, planlayıcı) IANA 2026f doğruluk düzeneği.
 *
 * Beklenen değerler BAĞIMSIZ referanstan hesaplanır: scripts/location/fixtures/iana-2026f-kozmik.json
 * (IANA tzdata 2026f kaynak metni → scripts/astrology/tz/tzcomp.py; üretici scripts/location/gen-tz-reference.py).
 * TS çekirdeği (lib/time/tzdb) beklenen değer üretmek için KULLANILMAZ.
 *
 *   npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/location/tz-iana-2026f.harness.ts
 *   KZM_TZ_MODULE=<eski tz.ts yolu> npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/location/tz-iana-2026f.harness.ts   → eski kodun hangi denetimde düştüğünü gösterir
 *
 * Kapsam (2026-01-01 … 2100-12-31): ofset (3 saatte bir + her geçişin ±1 sn/±1 dk/±1 sa), gösterim (HH:mm, YYYY-MM-DD HH:mm),
 * her takvim gününün yerel gün penceresi (23/24/25 saat, ay/yıl geçişi, gece yarısı geçişleri, 2100-12-31), duvar saati →
 * UTC (normal / boşluk / çakışma), gezegen saatleri + seçili saat + gün yöneticisi (motor DEĞİŞMEZ), kampanya Kozmik
 * gezegen saatleri, İstanbul sabit UTC+3 regresyonu, geçersiz bölge.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { getPlanetaryHour, getPlanetaryHoursForDate, locationDayAnchor, getDayRuler } from "../../lib/cosmic/planetary-hours";

type TzModule = typeof import("../../lib/location/tz");
type Ref = { tzdataVersion: string; range: [number, number]; zones: Record<string, [number, number][]> };

const ROOT = path.resolve(__dirname, "..", "..");
const REF: Ref = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "iana-2026f-kozmik.json"), "utf8"));

let pass = 0, fail = 0;
const failures: string[] = [];
function check(cond: boolean, label: string, detail = ""): void {
  if (cond) pass++;
  else { fail++; failures.push(label); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}
const section = (t: string) => console.log(`\n── ${t}`);

// ── Bağımsız referans: geçiş tablosundan ofset / duvar saati / yerel saat adayları ─────────────────────────────
function refOffsetSec(z: string, utcSec: number): number {
  const rows = REF.zones[z];
  let lo = 0, hi = rows.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rows[m][0] <= utcSec) lo = m; else hi = m - 1; }
  return rows[lo][1];
}
/** Naif yerel saniye → bu yerel saatin yaşandığı UTC saniyeleri (artan). */
function refCandidates(z: string, naiveSec: number): number[] {
  const rows = REF.zones[z], out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const t = naiveSec - rows[i][1], a = rows[i][0], b = i + 1 < rows.length ? rows[i + 1][0] : Infinity;
    if (t >= a && t < b) out.push(t);
  }
  return out.sort((x, y) => x - y);
}
/** Boşluğa düşen naif yerel saat için geçiş ÖNCESİ ofset (RFC 5545 yorumu). */
function refGapBeforeOffset(z: string, naiveSec: number): number {
  const rows = REF.zones[z];
  for (let i = 1; i < rows.length; i++) {
    const T = rows[i][0], prev = rows[i - 1][1], next = rows[i][1];
    if (next > prev && naiveSec >= T + prev && naiveSec < T + next) return prev;
  }
  throw new Error(`boşluk bulunamadı ${z} ${naiveSec}`);
}
/** Yerel günün ilk anı: duvar saati ≥ naif gece yarısı olan ilk UTC saniyesi. */
function refDayStart(z: string, naiveSec: number): number {
  const rows = REF.zones[z];
  let best = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i][0], b = i + 1 < rows.length ? rows[i + 1][0] : Infinity;
    const t = Math.max(a, naiveSec - rows[i][1]);
    if (t < b) best = Math.min(best, t);
  }
  return best;
}
const p2 = (n: number) => String(n).padStart(2, "0");
function refWallStr(z: string, utcMs: number): { hm: string; full: string } {
  const sec = Math.floor(utcMs / 1000), d = new Date((sec + refOffsetSec(z, sec)) * 1000);
  const hm = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  return { hm, full: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${hm}` };
}

const FOCUS = ["America/Havana", "America/Winnipeg", "America/Vancouver", "America/Edmonton", "Africa/Casablanca", "Africa/El_Aaiun"];
const CONTROL = ["Europe/Istanbul", "Europe/Berlin", "Europe/London", "America/New_York", "America/Santiago", "Asia/Tokyo", "Asia/Kathmandu", "Pacific/Apia"];
const MIDNIGHT = ["America/Asuncion", "Africa/Cairo", "Asia/Beirut", "Asia/Gaza", "Australia/Lord_Howe"];
const ALL = [...FOCUS, ...CONTROL, ...MIDNIGHT];
const COORD: Record<string, [number, number]> = {
  "America/Havana": [23.133, -82.383], "America/Winnipeg": [49.8844, -97.147], "America/Vancouver": [49.2827, -123.1207],
  "America/Edmonton": [53.5461, -113.4938], "Africa/Casablanca": [33.5883, -7.6114], "Africa/El_Aaiun": [27.1536, -13.2033],
  "Europe/Istanbul": [41.0082, 28.9784], "Europe/Berlin": [52.52, 13.405], "Europe/London": [51.5074, -0.1278],
  "America/New_York": [40.7128, -74.006], "America/Santiago": [-33.4489, -70.6693], "Asia/Tokyo": [35.6762, 139.6503],
  "Asia/Kathmandu": [27.7172, 85.324], "Pacific/Apia": [-13.8333, -171.7667],
};
const START = Date.UTC(2026, 0, 1), END = Date.UTC(2101, 0, 1);

async function main() {
  const modPath = process.env.KZM_TZ_MODULE ? path.resolve(process.env.KZM_TZ_MODULE) : path.join(ROOT, "lib", "location", "tz.ts");
  const tz: TzModule = await import(pathToFileURL(modPath).href);
  console.log(`KZM-TZ-01 — modül: ${path.relative(ROOT, modPath)} · referans IANA ${REF.tzdataVersion} · çalışma ortamı tz ${process.versions.tz ?? "?"}`);
  check(REF.tzdataVersion === "2026f", "referans IANA 2026f", REF.tzdataVersion);

  // 1) Ofset + gösterim
  section("1. Ofset ve gösterim (2026–2100, 3 saatte bir + her geçişin çevresi)");
  for (const z of ALL) {
    let n = 0, badOff = 0, badHm = 0, badFull = 0, ex = "";
    const probe = (ms: number) => {
      n++;
      const want = refOffsetSec(z, Math.floor(ms / 1000)) / 60;
      const got = tz.getTimeZoneOffsetMinutes(new Date(ms), z);
      if (got !== Math.round(want)) { badOff++; if (!ex) ex = `${new Date(ms).toISOString()} ${got}≠${want}`; }
      const w = refWallStr(z, ms);
      if (tz.formatInTimeZone(new Date(ms), z) !== w.hm) badHm++;
      if (tz.formatDateTimeInTimeZone(new Date(ms), z) !== w.full) badFull++;
    };
    for (let t = START; t < END; t += 3 * 3_600_000) probe(t);
    for (const [ts] of REF.zones[z]) {
      const ms = ts * 1000;
      if (ms < START || ms >= END) continue;
      for (const d of [-3_600_000, -60_000, -1000, 0, 1000, 60_000, 3_600_000]) probe(ms + d);
    }
    check(badOff === 0, `ofset ${z}`, `${badOff}/${n} ${ex}`);
    check(badHm === 0, `HH:mm ${z}`, `${badHm}/${n}`);
    check(badFull === 0, `YYYY-MM-DD HH:mm ${z}`, `${badFull}/${n}`);
  }

  // 2) Yerel gün penceresi (her takvim günü)
  section("2. Gün penceresi — her gün 2026-01-01 … 2100-12-31 (23/24/25 saat, ay/yıl geçişi, gece yarısı geçişi)");
  const dayLen: Record<string, Record<string, number>> = {};
  for (const z of ALL) {
    let n = 0, bad = 0, gaps = 0, ex = "";
    const lens: Record<string, number> = {};
    let prevEnd = -1, contiguous = true;
    for (let d = START; d < END; d += 86_400_000) {
      const D = new Date(d), y = D.getUTCFullYear(), m = D.getUTCMonth(), dd = D.getUTCDate();
      const r = tz.getZonedDayRange(y, m, dd, z);
      const ws = refDayStart(z, d / 1000) * 1000, we = refDayStart(z, d / 1000 + 86400) * 1000;
      n++;
      if (r.start.getTime() !== ws || r.end.getTime() !== we) { bad++; if (!ex) ex = `${D.toISOString().slice(0, 10)} ${r.start.toISOString()}→${new Date(ws).toISOString()}`; }
      if (refCandidates(z, d / 1000).length === 0) gaps++;
      if (prevEnd !== -1 && prevEnd !== r.start.getTime()) contiguous = false;
      prevEnd = r.end.getTime();
      const h = String((r.end.getTime() - r.start.getTime()) / 3_600_000);
      lens[h] = (lens[h] ?? 0) + 1;
    }
    dayLen[z] = lens;
    check(bad === 0, `gün penceresi ${z}`, `${bad}/${n} ${ex}`);
    check(contiguous, `ardışık pencereler bitişik ${z}`);
    if (gaps) console.log(`  · ${z}: gece yarısı boşluğa düşen ${gaps} gün (gün başı = geçiş anı)`);
  }
  console.log(`  · gün uzunlukları (saat → gün): ${JSON.stringify(Object.fromEntries(Object.entries(dayLen).filter(([, v]) => Object.keys(v).length > 1)))}`);
  const last = tz.getZonedDayRange(2100, 11, 31, "Europe/Istanbul");
  check(last.start.toISOString() === "2100-12-30T21:00:00.000Z" && last.end.toISOString() === "2100-12-31T21:00:00.000Z", "İstanbul 2100-12-31 son gün penceresi", `${last.start.toISOString()} ${last.end.toISOString()}`);

  // 3) Duvar saati → UTC (normal, boşluk, çakışma) + durum
  section("3. Duvar saati → UTC (her geçişin ±3 saati 15 dk adım + her 7. günün 00:00/12:00/23:59)");
  for (const z of ALL) {
    let n = 0, bad = 0, badKind = 0, nGap = 0, nOv = 0, ex = "";
    const probe = (naiveMs: number) => {
      const D = new Date(naiveMs);
      const got = tz.zonedWallTimeToUtc(D.getUTCFullYear(), D.getUTCMonth(), D.getUTCDate(), D.getUTCHours(), D.getUTCMinutes(), z).getTime();
      const c = refCandidates(z, naiveMs / 1000);
      const want = (c.length ? c[0] : naiveMs / 1000 - refGapBeforeOffset(z, naiveMs / 1000)) * 1000;
      n++;
      if (c.length === 0) nGap++; else if (c.length > 1) nOv++;
      if (got !== want) { bad++; if (!ex) ex = `${D.toISOString().slice(0, 16)} ${new Date(got).toISOString()}≠${new Date(want).toISOString()} (aday ${c.length})`; }
      if (typeof tz.zonedWallTimeKind === "function") {
        const k = tz.zonedWallTimeKind(D.getUTCFullYear(), D.getUTCMonth(), D.getUTCDate(), D.getUTCHours(), D.getUTCMinutes(), z);
        if (k !== (c.length === 0 ? "gap" : c.length > 1 ? "overlap" : "ok")) badKind++;
      } else badKind++;
    };
    for (const [ts, off] of REF.zones[z]) {
      const ms = ts * 1000;
      if (ms < START || ms >= END) continue;
      const wall0 = Math.floor((ms + off * 1000) / 900_000) * 900_000;
      for (let k = -12; k <= 12; k++) probe(wall0 + k * 900_000);
    }
    for (let d = START; d < END; d += 7 * 86_400_000) for (const h of [0, 12 * 60, 23 * 60 + 59]) probe(d + h * 60_000);
    check(bad === 0, `duvar→UTC ${z}`, `${bad}/${n} (boşluk ${nGap}, çakışma ${nOv}) ${ex}`);
    check(badKind === 0, `duvar saati durumu ok/gap/overlap ${z}`, `${badKind}/${n}`);
  }

  // 4) Ayırt edici altın örnekler (eski Intl/ICU 2026a yolu bunlarda yanlış)
  section("4. Ayırt edici örnekler (Havana / Winnipeg / Casablanca / Vancouver / Edmonton / El Aaiún)");
  const gold: [string, [number, number, number, number, number], string][] = [
    ["America/Havana", [2026, 11, 1, 10, 0], "2026-12-01T14:00:00.000Z"],
    ["America/Winnipeg", [2026, 11, 1, 10, 0], "2026-12-01T15:00:00.000Z"],
    ["America/Vancouver", [2026, 11, 1, 10, 0], "2026-12-01T17:00:00.000Z"],
    ["America/Edmonton", [2026, 11, 1, 10, 0], "2026-12-01T16:00:00.000Z"],
    ["Africa/Casablanca", [2026, 9, 20, 10, 0], "2026-10-20T10:00:00.000Z"],
    ["Africa/El_Aaiun", [2026, 9, 20, 10, 0], "2026-10-20T10:00:00.000Z"],
    ["Europe/Istanbul", [2026, 11, 1, 10, 0], "2026-12-01T07:00:00.000Z"],
  ];
  for (const [z, [y, m, d, h, mi], iso] of gold) {
    const want = refCandidates(z, Date.UTC(y, m, d, h, mi) / 1000)[0] * 1000;
    check(new Date(want).toISOString() === iso, `referans tutarlılığı ${z} ${iso}`);
    check(tz.zonedWallTimeToUtc(y, m, d, h, mi, z).toISOString() === iso, `seçili saat UTC ${z} ${y}-${m + 1}-${d} ${h}:${p2(mi)} → ${iso}`, tz.zonedWallTimeToUtc(y, m, d, h, mi, z).toISOString());
  }
  const hv = tz.getZonedDayRange(2026, 11, 1, "America/Havana");
  check(hv.start.toISOString() === "2026-12-01T04:00:00.000Z" && hv.end.toISOString() === "2026-12-02T04:00:00.000Z", "Havana 2026-12-01 gün penceresi 04:00Z–04:00Z", `${hv.start.toISOString()}–${hv.end.toISOString()}`);
  const hvGap = tz.getZonedDayRange(2028, 2, 12, "America/Havana"); // 00:00 −5 → 01:00 −4 (IANA Cuba kuralı, 0:00s)
  check(hvGap.start.toISOString() === "2028-03-12T05:00:00.000Z" && hvGap.end.toISOString() === "2028-03-13T04:00:00.000Z", "Havana 2028-03-12 (gece yarısı boşluğu, 23 saat) gün başı = geçiş anı", `${hvGap.start.toISOString()}–${hvGap.end.toISOString()}`);
  const ny = tz.zonedWallTimeToUtc(2026, 2, 8, 2, 30, "America/New_York"), be = tz.zonedWallTimeToUtc(2026, 2, 29, 2, 30, "Europe/Berlin");
  check(ny.toISOString() === "2026-03-08T07:30:00.000Z" && be.toISOString() === "2026-03-29T01:30:00.000Z", "boşluk yönü tutarlı: New York 02:30 → 03:30 EDT, Berlin 02:30 → 03:30 CEST", `${ny.toISOString()} ${be.toISOString()}`);
  const ov = tz.zonedWallTimeToUtc(2026, 10, 1, 1, 30, "America/New_York");
  check(ov.toISOString() === "2026-11-01T05:30:00.000Z", "çakışma: New York 2026-11-01 01:30 → ilk an (EDT)", ov.toISOString());

  // 5) Gezegen saatleri (motor değişmez; yalnız ofset/gün/gösterim girdileri)
  section("5. Gezegen saatleri, seçili saat, gün yöneticisi, gün doğumu/batımı gösterimi");
  for (const z of [...FOCUS, ...CONTROL]) {
    const [lat, lon] = COORD[z];
    const refOff = (dd: Date) => refOffsetSec(z, Math.floor(dd.getTime() / 1000)) / 60;
    const nowOff = (dd: Date) => tz.getTimeZoneOffsetMinutes(dd, z);
    let n = 0, badSlot = 0, badShow = 0, badRuler = 0, badSel = 0, badNow = 0;
    for (let d = Date.UTC(2026, 0, 1); d < Date.UTC(2101, 0, 1); d += 37 * 86_400_000) {
      const D = new Date(d), y = D.getUTCFullYear(), m = D.getUTCMonth(), dd = D.getUTCDate();
      const aR = locationDayAnchor(y, m, dd, refOff), nR = locationDayAnchor(y, m, dd + 1, refOff);
      const aN = locationDayAnchor(y, m, dd, nowOff), nN = locationDayAnchor(y, m, dd + 1, nowOff);
      const sR = getPlanetaryHoursForDate(aR, lat, lon, refOff(aR), refOff(nR)), sN = getPlanetaryHoursForDate(aN, lat, lon, nowOff(aN), nowOff(nN));
      n++;
      if (sR.length !== sN.length || sR.some((s, i) => s.start.getTime() !== sN[i].start.getTime() || s.planet.name !== sN[i].planet.name)) badSlot++;
      if (sN.some((s) => tz.formatInTimeZone(s.start, z) !== refWallStr(z, s.start.getTime()).hm)) badShow++;
      if (getDayRuler(aN, nowOff(aN)).name !== getDayRuler(aR, refOff(aR)).name) badRuler++;
      for (const hm of [0, 5 * 60 + 30, 12 * 60, 18 * 60 + 45, 23 * 60 + 45]) {
        const naive = Date.UTC(y, m, dd) + hm * 60_000, c = refCandidates(z, naive / 1000);
        if (c.length !== 1) continue;
        const tgtN = tz.zonedWallTimeToUtc(y, m, dd, Math.floor(hm / 60), hm % 60, z), tgtR = new Date(c[0] * 1000);
        const pN = getPlanetaryHour(tgtN, lat, lon, nowOff(tgtN)), pR = getPlanetaryHour(tgtR, lat, lon, refOff(tgtR));
        if (pN.aktifGezegen.name !== pR.aktifGezegen.name || pN.hourStart.getTime() !== pR.hourStart.getTime()) badSel++;
        if (pN.gunDogumuStr !== pR.gunDogumuStr || pN.gunBatimiStr !== pR.gunBatimiStr) badShow++;
        const qN = getPlanetaryHour(tgtR, lat, lon, nowOff(tgtR));
        if (qN.aktifGezegen.name !== pR.aktifGezegen.name || qN.hourStart.getTime() !== pR.hourStart.getTime()) badNow++;
      }
    }
    check(badSlot === 0, `24 dilim UTC + gezegen ${z}`, `${badSlot}/${n}`);
    check(badShow === 0, `dilim / gün doğumu-batımı gösterimi ${z}`, `${badShow}`);
    check(badRuler === 0, `gün yöneticisi ${z}`, `${badRuler}/${n}`);
    check(badSel === 0, `seçili saatin gezegen saati ${z}`, `${badSel}`);
    check(badNow === 0, `"şimdi" gezegen saati ${z}`, `${badNow}`);
  }

  // 6) Kampanya Kozmik gezegen saatleri (runner, ürün kod yolu)
  section("6. Kampanya Kozmik — gezegen saatleri tablosu");
  const { kozmikPaket } = await import("../../lib/campaign/visitor/runners/kozmik");
  for (const [z, [y, m, d]] of [["America/Havana", [2026, 12, 1]], ["America/Winnipeg", [2026, 12, 1]], ["Africa/Casablanca", [2026, 10, 20]], ["Europe/Istanbul", [2026, 12, 1]]] as const) {
    const [lat, lon] = COORD[z];
    const place = { id: `test-${z}`, label: z, timezone: z, latitude: lat, longitude: lon };
    const out = await kozmikPaket.run({ now: new Date(Date.UTC(2026, 10, 18, 12)) } as never, { feature: "hours", year: y, month: m, day: d, place } as never);
    const res = (out as { ok: boolean; result?: { blocks: { type: string; rows?: string[][] }[] } });
    const rows = res.result?.blocks.find((b) => b.type === "table")?.rows ?? [];
    const refOff = (dd: Date) => refOffsetSec(z, Math.floor(dd.getTime() / 1000)) / 60;
    const a = locationDayAnchor(y, m - 1, d, refOff), nx = locationDayAnchor(y, m - 1, d + 1, refOff);
    const want = getPlanetaryHoursForDate(a, lat, lon, refOff(a), refOff(nx)).map((s) => [s.planet.name, refWallStr(z, s.start.getTime()).hm, refWallStr(z, s.end.getTime()).hm]);
    const got = rows.map((r) => [r[2], r[3], r[4]]);
    check(rows.length === 24 && JSON.stringify(got) === JSON.stringify(want), `kampanya gezegen saatleri ${z} ${y}-${m}-${d}`, `ilk satır ${JSON.stringify(got[0])} beklenen ${JSON.stringify(want[0])}`);
  }

  // 7) Geçersiz bölge — eski güvenli düşüş (UTC) korunur; tablo adı Intl tanımasa da geçerli
  section("7. Geçersiz bölge ve geçerlilik");
  check(tz.isValidTimeZone("America/Havana") && tz.isValidTimeZone("Europe/Istanbul") && tz.isValidTimeZone("UTC"), "geçerli adlar");
  check(!tz.isValidTimeZone("") && !tz.isValidTimeZone("Mars/Olympus") && !tz.isValidTimeZone("Europe/Istanbul; DROP"), "geçersiz adlar");
  check(tz.getTimeZoneOffsetMinutes(new Date(Date.UTC(2026, 5, 1)), "Mars/Olympus") === 0 && tz.formatInTimeZone(new Date(Date.UTC(2026, 5, 1, 9, 5)), "Mars/Olympus") === "09:05", "geçersiz bölge → UTC (eski davranış)");
  let threw = false;
  try { tz.formatInTimeZone(new Date(NaN), "Europe/Istanbul"); } catch (e) { threw = e instanceof RangeError; }
  check(threw, "geçersiz an → RangeError (eski Intl davranışı)");

  console.log(`\nKZM-TZ-01 tz.ts IANA 2026f: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(`Başarısız: ${failures.slice(0, 40).join(" | ")}`); process.exit(1); }
}
main().catch((e) => { console.error(e); console.log(`KZM-TZ-01 tz.ts IANA 2026f: ${pass} PASS / ${fail + 1} FAIL`); process.exit(1); });
