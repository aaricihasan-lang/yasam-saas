/**
 * ASTROLOJİ — TARİHSEL SAAT DİLİMİ (IANA backzone) harness'i (ATL-P1-01 / TZ-01 — 2026-10-20).
 *
 * ICU/Node Intl IANA "backzone" verisini kullanmaz → 1970 öncesi bazı bölgelerde (Kampala, Reykjavik, Oslo, ...) doğum
 * UTC'si 15–60 dk yanlış. Düzeltme: üretilmiş statik tablo (tzBackzoneOverlay.generated.ts; resmî IANA 2026e kaynağından
 * scripts/astrology/tz/gen-backzone-overlay.py) yalnız cutoff öncesi ofset kaynağıdır; sonrası Intl yoluyla birebir aynı.
 * Gerçek sağlayıcı / DB YOK.
 *
 *   A) 7 vaka (ATLAS-NATAL-1950-2026 bağımsız doğrulama) + İstanbul 1979-02-12 07:00 → 04:00Z.
 *   B) Tablodaki her bölgenin her geçişinin iki yanında yerel −1 dk / 0 / +1 dk → Python referansıyla birebir
 *      (kind, UTC, ofset); yeni gap/ambiguous örnekleri.
 *   C) Değişmezlik: 81 il + 973 ilçe + tablo dışı bölgeler 1880–2026 eski Intl yoluyla aynı; tablodaki bölgeler cutoff sonrası aynı.
 *   D) Tablo başlığı (sürüm, SHA-256, sayılar); Europe/Istanbul tabloda yok.
 *   E) Mevcut sabitler: Berlin gap/ambiguous, İstanbul LMT 1900 = 7016 sn (1,948889), Monrovia 1965 −2670 sn.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/tz01.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { offsetSecondsToDecimalHours, resolveAstroBirthTime, type AstroTimeResolution } from "@/lib/astrology/birth/timeResolution";
import { TZ_BACKZONE_META, TZ_BACKZONE_OVERLAY } from "@/lib/astrology/birth/tzBackzoneOverlay.generated";

const ROOT = join(__dirname, "..", "..");
const REF = JSON.parse(readFileSync(join(__dirname, "fixtures", "tz01-backzone-ref.json"), "utf8")) as { meta: Record<string, unknown>; cases: (string | number)[][] };

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

// ─── Eski (Intl-only) çözüm: düzeltme öncesi davranışın birebir kopyası — değişmezlik karşılaştırması için ───
function intlWall(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", era: "short" }).formatToParts(new Date(utcMs));
  const get = (k: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === k)?.value ?? "0");
  const era = parts.find((p) => p.type === "era")?.value ?? "AD";
  const d = new Date(0);
  d.setUTCFullYear(era === "BC" ? 1 - get("year") : get("year"), get("month") - 1, get("day"));
  d.setUTCHours(get("hour"), get("minute"), get("second"), 0);
  return d.getTime();
}
function oldResolve(naiveMs: number, tz: string): string {
  const offs = new Set<number>();
  for (const p of [-36, -12, 0, 12, 36]) offs.add(intlWall(naiveMs + p * 3_600_000, tz) - (naiveMs + p * 3_600_000));
  const valid = [...offs].map((o) => naiveMs - o).filter((u, i, a) => intlWall(u, tz) === naiveMs && a.indexOf(u) === i).sort((a, b) => a - b);
  if (valid.length === 0) return "gap";
  return valid.map((u) => `${new Date(u).toISOString()}|${(naiveMs - u) / 1000}`).join(",");
}
function sig(r: AstroTimeResolution): string {
  if (r.kind === "gap") return "gap";
  if (r.kind === "ok") return `${r.utcIso}|${r.offsetSeconds}`;
  if (r.kind === "ambiguous") return r.options.map((o) => `${o.utcIso}|${o.offsetSeconds}`).join(",");
  return `invalid:${r.reason}`;
}
const naiveParts = (ms: number) => {
  const iso = new Date(ms).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
};
function resolveNaive(ms: number, tz: string) {
  const { date, time } = naiveParts(ms);
  return resolveAstroBirthTime(date, time, tz);
}

t("A: 7 vaka (Kampala ×4, Reykjavik ×2, Oslo) backzone UTC + ofset; İstanbul 1979-02-12 07:00 → 04:00Z", () => {
  const cases: [string, string, string, string, string, number][] = [
    ["N0960", "1951-04-13", "20:36", "Africa/Kampala", "1951-04-13T17:51:00.000Z", 9900],
    ["N0961", "1951-10-27", "02:41", "Africa/Kampala", "1951-10-26T23:56:00.000Z", 9900],
    ["N0972", "1955-01-16", "20:52", "Atlantic/Reykjavik", "1955-01-16T21:52:00.000Z", -3600],
    ["N0973", "1955-07-23", "01:42", "Africa/Kampala", "1955-07-22T22:57:00.000Z", 9900],
    ["N0974", "1955-10-12", "02:57", "Africa/Kampala", "1955-10-12T00:12:00.000Z", 9900],
    ["N0978", "1961-04-16", "11:38", "Europe/Oslo", "1961-04-16T09:38:00.000Z", 7200],
    ["N0982", "1965-01-27", "15:33", "Atlantic/Reykjavik", "1965-01-27T16:33:00.000Z", -3600],
    ["IST-1979", "1979-02-12", "07:00", "Europe/Istanbul", "1979-02-12T04:00:00.000Z", 10800],
  ];
  for (const [id, d, tm, tz, utc, off] of cases) {
    const r = resolveAstroBirthTime(d, tm, tz);
    assert.equal(r.kind, "ok", `${id}: ${r.kind}`);
    if (r.kind === "ok") {
      assert.equal(r.utcIso, utc, id);
      assert.equal(r.offsetSeconds, off, id);
    }
  }
});

t("B: tablodaki her geçişin iki yanında yerel −1/0/+1 dk → Python referansıyla birebir (kind, UTC, ofset)", () => {
  let n = 0;
  const kinds: Record<string, number> = {};
  for (const c of REF.cases) {
    const [z, local, kind, u1, o1, u2, o2] = c as [string, number, string, number?, number?, number?, number?];
    const r = resolveNaive(local * 1000, z);
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    assert.equal(r.kind, kind, `${z} ${new Date(local * 1000).toISOString()}: ${r.kind} ≠ ${kind}`);
    if (r.kind === "ok") {
      assert.equal(r.utcIso, new Date(u1! * 1000).toISOString(), `${z} ${local}`);
      assert.equal(r.offsetSeconds, o1, `${z} ${local} ofset`);
    } else if (r.kind === "ambiguous") {
      assert.deepEqual(r.options.map((o) => [o.utcIso, o.offsetSeconds]), [[new Date(u1! * 1000).toISOString(), o1], [new Date(u2! * 1000).toISOString(), o2]], `${z} ${local}`);
    }
    n += 1;
  }
  assert.ok(n > 3000, `vaka sayısı ${n}`);
  console.log(`     ${n} vaka ${JSON.stringify(kinds)}`);
});

t("B: yeni gap/ambiguous örnekleri (Kampala 1948/1957 gap, Oslo 1959 gap + ambiguous)", () => {
  assert.equal(resolveAstroBirthTime("1948-01-01", "00:10", "Africa/Kampala").kind, "gap");
  assert.equal(resolveAstroBirthTime("1957-01-01", "00:10", "Africa/Kampala").kind, "gap");
  assert.equal(resolveAstroBirthTime("1959-03-15", "02:30", "Europe/Oslo").kind, "gap");
  const a = resolveAstroBirthTime("1959-09-20", "02:30", "Europe/Oslo");
  assert.equal(a.kind, "ambiguous");
  if (a.kind === "ambiguous") assert.deepEqual(a.options.map((o) => o.offsetSeconds), [7200, 3600]);
  const later = resolveAstroBirthTime("1959-09-20", "02:30", "Europe/Oslo", "later");
  assert.equal(later.kind, "ok");
});

t("C: 81 il + 973 ilçe + tablo dışı bölgeler 1880–2026 eski Intl yoluyla birebir; tablodaki bölgeler cutoff sonrası aynı", () => {
  const tr = [...readFileSync(join(ROOT, "lib/location/tr.ts"), "utf8").matchAll(/tz:\s*"([^"]+)"/g)].map((m) => m[1]);
  const districts = JSON.stringify(JSON.parse(readFileSync(join(ROOT, "lib/human-design/location/trDistricts.generated.json"), "utf8")));
  const distTz = [...districts.matchAll(/"(?:tz|timezone)":"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tr.length, 81);
  assert.equal(distTz.length, 973);
  const world = [...readFileSync(join(ROOT, "lib/location/world.ts"), "utf8").matchAll(/tz:\s*"([^"]+)"/g)].map((m) => m[1]);
  const g = JSON.parse(readFileSync(join(ROOT, "lib/location/server-data/global-cities.json"), "utf8")) as { locations: { tz: string }[] };
  const all = [...new Set([...tr, ...distTz, ...world, ...g.locations.map((x) => x.tz)])];
  const outside = all.filter((z) => !TZ_BACKZONE_OVERLAY[z]);
  assert.ok(new Set(tr).size >= 1 && !tr.some((z) => TZ_BACKZONE_OVERLAY[z]) && !distTz.some((z) => TZ_BACKZONE_OVERLAY[z]), "TR bölgeleri tabloda olmamalı");
  let n = 0;
  const step = 37 * 86_400_000 + 3_600_000 * 7 + 60_000 * 13; // deterministik, saat/gün kaydıran adım
  for (const z of [...new Set([...tr, ...distTz])]) {
    for (let ms = Date.UTC(1880, 0, 1, 0, 0); ms < Date.UTC(2026, 11, 31); ms += 9 * 86_400_000 + 3_600_000 * 5 + 60_000 * 7) {
      assert.equal(sig(resolveNaive(ms, z)), oldResolve(ms, z), `${z} ${new Date(ms).toISOString()}`);
      n += 1;
    }
  }
  for (const z of outside) {
    for (let ms = Date.UTC(1880, 0, 1, 1, 30); ms < Date.UTC(2026, 11, 31); ms += step) {
      assert.equal(sig(resolveNaive(ms, z)), oldResolve(ms, z), `${z} ${new Date(ms).toISOString()}`);
      n += 1;
    }
  }
  for (const [z, v] of Object.entries(TZ_BACKZONE_OVERLAY)) {
    for (let ms = v.cutoff * 1000 + 2 * 86_400_000; ms < Date.UTC(2026, 11, 31); ms += step) {
      assert.equal(sig(resolveNaive(ms, z)), oldResolve(ms, z), `${z} cutoff sonrası ${new Date(ms).toISOString()}`);
      n += 1;
    }
  }
  console.log(`     ${n} nokta; tablo dışı ${outside.length} bölge`);
});

t("D: tablo başlığı — IANA 2026e, SHA-256, 91 bölge / 721 geçiş; Europe/Istanbul yok; cutoff ≤ 1970", () => {
  assert.equal(TZ_BACKZONE_META.tzdataVersion, "2026e");
  assert.equal(TZ_BACKZONE_META.tarballSha256, "b26882805f26aac59d5b222978e6580484b834ccdc98be89df2f05a6dc53a652");
  assert.equal(TZ_BACKZONE_META.backzoneSha256, "9c965661692c07d241c758c41c6f1e9c082d0f77a193d9240228b995e2f1666f");
  assert.equal(Object.keys(TZ_BACKZONE_OVERLAY).length, TZ_BACKZONE_META.zoneCount);
  assert.equal(Object.values(TZ_BACKZONE_OVERLAY).reduce((s, v) => s + v.t.length, 0), TZ_BACKZONE_META.transitionCount);
  assert.equal(TZ_BACKZONE_META.zoneCount, 91);
  assert.ok(!TZ_BACKZONE_OVERLAY["Europe/Istanbul"] && !TZ_BACKZONE_OVERLAY["Asia/Istanbul"]);
  for (const v of Object.values(TZ_BACKZONE_OVERLAY)) assert.ok(v.cutoff <= Date.UTC(1970, 0, 1) / 1000);
  assert.deepEqual(REF.meta, { ...TZ_BACKZONE_META }, "referans fikstürü aynı üretimden");
});

t("E: mevcut sabitler — Berlin gap/ambiguous, İstanbul LMT 1900 7016 sn (1,948889), Monrovia 1965 −2670 sn", () => {
  assert.equal(resolveAstroBirthTime("2021-03-28", "02:30", "Europe/Berlin").kind, "gap");
  assert.equal(resolveAstroBirthTime("2021-10-31", "02:30", "Europe/Berlin").kind, "ambiguous");
  const ist = resolveAstroBirthTime("1900-01-01", "12:00", "Europe/Istanbul");
  assert.ok(ist.kind === "ok" && ist.offsetSeconds === 7016 && offsetSecondsToDecimalHours(ist.offsetSeconds) === 1.948889);
  const mon = resolveAstroBirthTime("1965-06-01", "12:00", "Africa/Monrovia");
  assert.ok(mon.kind === "ok" && mon.offsetSeconds === -2670, JSON.stringify(mon));
});

console.log(`\nastrology tz01 (backzone) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
