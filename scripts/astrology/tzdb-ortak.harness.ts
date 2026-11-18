/**
 * ORTAK IANA 2026f KATMANI harness'i (HD-TZ-00 — 2026-11-17). Gerçek sağlayıcı / DB YOK.
 *
 *   A) Tek veri kaynağı: IANA tablosu ve backzone verisi yalnız lib/time/tzdb/*.generated.ts'te; Atlas eski yolları yalnız
 *      yönlendirme (veri içermez) ve AYNI nesneleri verir.
 *   B) Tek sürüm: TZDB_VERSION = tablo üst bilgisi = 2026f.
 *   C) Atlas dış arayüzü: timeResolution / zonedFormat dışa aktarımları ortak çekirdekteki fonksiyonların KENDİSİ.
 *   D) Çekirdek politikasız: boşluk → 0 aday, tek an → 1, çakışma → 2 (UTC'ye göre artan); seçim yapılmaz.
 *   E) backzone seçeneği: varsayılan açık (Atlas davranışı); kapalıyken IANA ana verisi (HD'nin bugünkü kaynağıyla aynı veri ailesi).
 *   F) Bu aşamada Human Design ortak katmana BAĞLANMAZ (HD dosyaları içe aktarmaz).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/tzdb-ortak.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as core from "@/lib/time/tzdb/core";
import * as fmt from "@/lib/time/tzdb/format";
import * as table from "@/lib/time/tzdb/ianaTable.generated";
import * as bz from "@/lib/time/tzdb/backzone.generated";
import * as oldTable from "@/lib/astrology/birth/tzIana.generated";
import * as oldBz from "@/lib/astrology/birth/tzBackzoneOverlay.generated";
import * as oldFmt from "@/lib/astrology/birth/zonedFormat";
import * as atlas from "@/lib/astrology/birth/timeResolution";

const ROOT = join(__dirname, "..", "..");
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
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(f)) out.push(p);
  }
  return out;
}
const SRC = ["lib", "app", "components"].flatMap((d) => walk(join(ROOT, d)));
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");

t("A: tek veri kaynağı — TZ_IANA_ZONES / TZ_BACKZONE_OVERLAY tanımı yalnız ortak katmanda; eski yollar yalnız yönlendirme ve AYNI nesne", () => {
  const defs = (re: RegExp) => SRC.filter((p) => re.test(readFileSync(p, "utf8"))).map(rel);
  assert.deepEqual(defs(/export const TZ_IANA_ZONES\b/), ["lib/time/tzdb/ianaTable.generated.ts"]);
  assert.deepEqual(defs(/export const TZ_BACKZONE_OVERLAY\b/), ["lib/time/tzdb/backzone.generated.ts"]);
  for (const f of ["lib/astrology/birth/tzIana.generated.ts", "lib/astrology/birth/tzBackzoneOverlay.generated.ts", "lib/astrology/birth/zonedFormat.ts"]) {
    const s = readFileSync(join(ROOT, f), "utf8");
    assert.ok(s.length < 600 && /YÖNLENDİRME \(HD-TZ-00\)/.test(s) && !/\[\[/.test(s), `${f} yalnız yönlendirme olmalı`);
  }
  assert.equal(oldTable.TZ_IANA_ZONES, table.TZ_IANA_ZONES);
  assert.equal(oldTable.TZ_IANA_LINKS, table.TZ_IANA_LINKS);
  assert.equal(oldTable.TZ_IANA_META, table.TZ_IANA_META);
  assert.equal(oldBz.TZ_BACKZONE_OVERLAY, bz.TZ_BACKZONE_OVERLAY);
  assert.equal(oldBz.TZ_BACKZONE_META, bz.TZ_BACKZONE_META);
});

t("B: tek sürüm kaynağı — TZDB_VERSION = tablo üst bilgisi = 2026f (kaynak paket SHA-256 01b4a91c…)", () => {
  assert.equal(core.TZDB_VERSION, "2026f");
  assert.equal(core.TZDB_VERSION, table.TZ_IANA_META.tzdataVersion);
  assert.equal(table.TZ_IANA_META.tarballSha256, "01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d");
  // tzdata sürümünü taşıyan başka bir üretilmiş tablo yok
  const versions = SRC.filter((p) => /tzdataVersion"\s*:\s*"20\d\d[a-z]"/.test(readFileSync(p, "utf8"))).map(rel).sort();
  assert.deepEqual(versions, ["lib/time/tzdb/backzone.generated.ts", "lib/time/tzdb/ianaTable.generated.ts"]);
});

t("C: Atlas dış arayüzü değişmedi — dışa aktarımlar ortak çekirdekteki fonksiyonların kendisi; politika fonksiyonları Atlas'ta", () => {
  assert.equal(atlas.isValidIanaTimeZone, core.isValidIanaTimeZone);
  assert.equal(atlas.wallClockAt, core.wallClockAt);
  assert.equal(atlas.utcOffsetSecondsAt, core.utcOffsetSecondsAt);
  assert.equal(oldFmt.formatZoned, fmt.formatZoned);
  assert.equal(oldFmt.formatZonedParts, fmt.formatZonedParts);
  assert.equal(oldFmt.isDisplayZone, fmt.isDisplayZone);
  for (const k of ["resolveAstroBirthTime", "normalizeTime", "isValidIsoDate", "offsetSecondsToDecimalHours"]) assert.equal(typeof (atlas as Record<string, unknown>)[k], "function", k);
});

t("D: çekirdek politikasız — boşluk 0, tek an 1, çakışma 2 aday (UTC'ye göre artan); Atlas earlier/later seçimini çekirdek yapmaz", () => {
  const naive = (s: string) => Date.parse(`${s}Z`);
  assert.deepEqual(core.localTimeCandidates(naive("2026-03-29T01:30:00"), "Europe/London"), []);
  assert.deepEqual(core.localTimeCandidates(naive("2026-11-10T12:00:00"), "America/Havana"), [{ utcMs: Date.parse("2026-11-10T16:00:00Z"), offsetSeconds: -14400 }]);
  assert.deepEqual(core.localTimeCandidates(naive("2026-10-25T01:30:00"), "Europe/London"), [
    { utcMs: Date.parse("2026-10-25T00:30:00Z"), offsetSeconds: 3600 },
    { utcMs: Date.parse("2026-10-25T01:30:00Z"), offsetSeconds: 0 },
  ]);
  // Atlas politikası aynı adaylardan: auto → ambiguous, earlier/later → seçim
  assert.equal(atlas.resolveAstroBirthTime("2026-10-25", "01:30", "Europe/London").kind, "ambiguous");
  const e = atlas.resolveAstroBirthTime("2026-10-25", "01:30", "Europe/London", "earlier");
  assert.ok(e.kind === "ok" && e.utcIso === "2026-10-25T00:30:00.000Z" && e.ambiguousResolved);
});

t("E: backzone seçeneği — varsayılan açık (Atlas); kapalıyken IANA ana verisi (Kampala 1951 +3, Reykjavik 1955 0); 1970 sonrası aynı", () => {
  const k = Date.parse("1951-04-13T17:51:00Z");
  assert.equal(core.utcOffsetSecondsAt(k, "Africa/Kampala"), 9900);
  assert.equal(core.utcOffsetSecondsAt(k, "Africa/Kampala", { backzone: true }), 9900);
  assert.equal(core.utcOffsetSecondsAt(k, "Africa/Kampala", { backzone: false }), 10800);
  const r = Date.parse("1955-01-16T20:52:00Z");
  assert.equal(core.utcOffsetSecondsAt(r, "Atlantic/Reykjavik"), -3600);
  assert.equal(core.utcOffsetSecondsAt(r, "Atlantic/Reykjavik", { backzone: false }), 0);
  for (const [z, iso, off] of [["America/Havana", "2026-11-10T16:00:00Z", -14400], ["America/Winnipeg", "2026-11-10T17:00:00Z", -18000], ["Africa/Casablanca", "2026-10-10T12:00:00Z", 0], ["Europe/Istanbul", "1900-01-01T10:03:04Z", 7016]] as const) {
    assert.equal(core.utcOffsetSecondsAt(Date.parse(iso), z), off, z);
    assert.equal(core.utcOffsetSecondsAt(Date.parse(iso), z, { backzone: false }), off, `${z} backzone kapalı`);
  }
  assert.deepEqual(core.localTimeCandidates(Date.parse("1951-04-13T20:36:00Z"), "Africa/Kampala", { backzone: false }), [{ utcMs: Date.parse("1951-04-13T17:36:00Z"), offsetSeconds: 10800 }]);
});

// HD-TZ (18.11.2026, Owner kararı): Human Design ortak katmana bağlandı. Sözleşme: YALNIZ çekirdek (lib/time/tzdb/core) ve YALNIZ
// iki giriş noktasından (doğum anı çözümü + transit anı); Atlas'ın zaman politikası modülleri (earlier/later seçimi) HD'ye girmez.
t("F: Human Design ortak katmana YALNIZ core üzerinden ve iki giriş noktasından bağlanır; Atlas zaman politikası modüllerini içe aktarmaz", () => {
  const hd = SRC.filter((p) => /^(lib\/human-design|app\/human-design|app\/api\/hd)\//.test(rel(p)));
  assert.ok(hd.length > 50, `HD dosya sayısı ${hd.length}`);
  const atlasPolicy = hd.filter((p) => /astrology\/birth\/(timeResolution|zonedFormat|tzIana)/.test(readFileSync(p, "utf8"))).map(rel);
  assert.deepEqual(atlasPolicy, []);
  const users = hd.filter((p) => /from\s+"[^"]*time\/tzdb[^"]*"/.test(readFileSync(p, "utf8"))).map(rel).sort();
  assert.deepEqual(users, ["lib/human-design/api/birthTimeResolution.ts", "lib/human-design/transit/transitMoment.ts"]);
  for (const p of users) {
    const imports = [...readFileSync(join(ROOT, p), "utf8").matchAll(/from\s+"([^"]*time\/tzdb[^"]*)"/g)].map((m) => m[1]);
    assert.ok(imports.length > 0 && imports.every((m) => /time\/tzdb\/core$/.test(m)), `${p}: ${imports.join(", ")}`);
  }
});

console.log(`\nortak tzdb (HD-TZ-00) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
