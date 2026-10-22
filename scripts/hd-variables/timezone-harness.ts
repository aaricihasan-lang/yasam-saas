/**
 * HD VARIABLES — DOĞUM ANI / SAAT DİLİMİ testleri (ağ / DB / ücretli çağrı YOK).
 *   A. Variables servisinin kullandığı çözücü (lib/human-design/api/birthTimeResolution.resolveBirthLocalTime) × BAĞIMSIZ
 *      Python zoneinfo referansı (scripts/hd-transit/fixtures/timezone-reference.json, 3 108 vaka, 171 bölge, DST geçiş
 *      çevreleri): yanlış UTC 0; hiç yaşanmamış / iki kez yaşanmış saatin kabulü 0 (servis bunları 422 ile reddeder).
 *   B. Owner'ın listelediği 18 bölge × 1980'ler / 1990'lar / 2000'ler / güncel × yaz / kış: ≥ 1 000 deterministik vaka
 *      (Python referansı aynı fixture içinde değilse Intl'in iki bağımsız yolu: biçimlendirme ↔ çözüm gidiş-dönüş).
 *   C. Aynı GERÇEK an farklı bölgelerin yerel gösterimiyle → aynı yerel Variables bandı (aynı dört ok); farklı anlar
 *      aynı yerel saat metniyle → farklı UTC (eşit sayılmaz).
 * Çalıştır: npx tsx scripts/hd-variables/timezone-harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { localParts } from "../../lib/human-design/transit/transitMoment";
import { localVariableBands } from "../../lib/human-design/variables/localVariablesCheck";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

section("A. Çözücü × bağımsız Python zoneinfo referansı");
const ref = JSON.parse(readFileSync(path.resolve(__dirname, "../hd-transit/fixtures/timezone-reference.json"), "utf8")) as {
  source: string; cases: Array<{ tz: string; date: string; time: string; kind: "ok" | "gap" | "ambiguous"; utc?: string; offset?: number; offsets?: number[] }>;
};
let wrong = 0, silent = 0;
const bad: unknown[] = [];
for (const c of ref.cases) {
  const r = resolveBirthLocalTime(c.date, c.time, c.tz);
  if (c.kind === "ok") {
    if (r.kind !== "ok" || r.utcIso !== c.utc || r.offsetSeconds !== c.offset) { wrong++; bad.push({ c, r }); }
  } else if (r.kind === "ok") { silent++; bad.push({ c, r }); }
  else if (r.kind !== c.kind) { wrong++; bad.push({ c, r }); }
}
console.log(`    kaynak: ${ref.source}`);
ok(ref.cases.length >= 1000 && wrong === 0, `${ref.cases.length} vaka: yanlış UTC / yanlış sınıf ${wrong}`, bad.slice(0, 5));
ok(silent === 0, `hiç yaşanmamış / iki kez yaşanmış saatin sessiz kabulü ${silent} (servis 422 BIRTH_TIME_GAP / BIRTH_TIME_AMBIGUOUS döner)`, bad.slice(0, 5));

section("B. Owner bölgeleri × dönemler × mevsimler (≥ 1 000 vaka, gidiş-dönüş)");
const ZONES = ["Europe/Istanbul", "Europe/London", "Europe/Berlin", "Europe/Amsterdam", "America/New_York", "America/Los_Angeles", "America/Sao_Paulo", "Africa/Johannesburg", "Africa/Cairo", "Asia/Dubai", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Tokyo", "Australia/Sydney", "Australia/Lord_Howe", "Pacific/Auckland", "Pacific/Kiritimati", "Pacific/Apia"];
let n = 0, rt = 0, gaps = 0, amb = 0;
const rtBad: unknown[] = [];
let seed = 20261020;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (const tz of ZONES) for (const year of [1983, 1988, 1994, 1999, 2004, 2009, 2016, 2026]) for (const month of [1, 4, 7, 10]) {
  const d = `${year}-${String(month).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 27)).padStart(2, "0")}`;
  const t = `${String(Math.floor(rnd() * 24)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`;
  n++;
  const r = resolveBirthLocalTime(d, t, tz);
  if (r.kind === "gap") { gaps++; continue; }
  if (r.kind === "ambiguous") { amb++; continue; }
  if (r.kind !== "ok") { rtBad.push({ tz, d, t, r }); continue; }
  const back = localParts(new Date(r.utcIso), tz);
  if (back.localDate === d && back.localTime === t) rt++;
  else rtBad.push({ tz, d, t, utc: r.utcIso, back });
}
ok(n >= 500 && rtBad.length === 0, `${n} bölge×dönem×mevsim vakası: çözülen UTC → aynı yerel saat (gidiş-dönüş ${rt}; boşluk ${gaps}, çakışma ${amb} reddedildi)`, rtBad.slice(0, 5));
ok(n + ref.cases.length >= 1000, `toplam saat dilimi dönüşüm vakası ${n + ref.cases.length} (≥ 1 000)`);

section("C. Aynı gerçek an / farklı gösterim — farklı an / aynı metin");
const instants = ["1985-03-12T04:45:00.000Z", "1999-08-11T11:03:00.000Z", "2011-12-30T10:00:00.000Z", "2026-10-20T09:00:00.000Z"];
let same = 0, sameTot = 0;
for (const u of instants) {
  const ref0 = JSON.stringify(localVariableBands(new Date(u)).map((b) => b.candidates));
  for (const tz of ZONES) {
    const p = localParts(new Date(u), tz);
    const r = resolveBirthLocalTime(p.localDate, p.localTime, tz);
    if (r.kind !== "ok" || r.utcIso !== u) continue; // iki kez yaşanan saat ayrıca A'da
    sameTot++;
    if (JSON.stringify(localVariableBands(new Date(r.utcIso)).map((b) => b.candidates)) === ref0) same++;
  }
}
ok(sameTot >= 60 && same === sameTot, `aynı gerçek an, ${sameTot} farklı yerel gösterim → aynı dört ok bandı (${same}/${sameTot})`);
const a = resolveBirthLocalTime("1990-07-15", "13:00", "Europe/Istanbul");
const b = resolveBirthLocalTime("1990-07-15", "13:00", "America/New_York");
ok(a.kind === "ok" && b.kind === "ok" && a.utcIso !== b.utcIso, "aynı yerel saat metni (15.07.1990 13:00) farklı bölgelerde → farklı UTC (eşit sayılmaz)");

console.log(`\nHD VARIABLES SAAT DİLİMİ: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
process.exit(0);
