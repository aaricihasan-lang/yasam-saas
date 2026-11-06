/**
 * GÖKYÜZÜ ATLASI — GÖKYÜZÜ ARAÇLARI istek katmanı testleri (lib/astrology/pro/lunations/request, pro/degrees/request,
 * pro/degrees/presets, lib/astrology/skyTools). Ücretli çağrı YOK; ağ YOK; DB YOK. Motorların kendi doğruluk testleri ayrıdır
 * (pro-lunations, pro-eclipse-contacts, pro-degree-crossings); burada yalnız gövde doğrulaması, sınırlar, motor çıktısının ekran
 * biçimine eksiksiz aktarımı, hazır kritik derece listeleri (owner kararı 01.11.2026) ve rotaların kapı/ayna kuralı denetlenir.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-sky-tools.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLunations, parseLunationRequest, type EclipseRow } from "@/lib/astrology/pro/lunations/request";
import { findLunarEclipses, findSolarEclipses } from "@/lib/astrology/pro/lunations/eclipses";
import { lunarEclipseContacts, solarEclipseGlobalContacts } from "@/lib/astrology/pro/lunations/contacts";
import { buildDegreeCrossings, MOON_MAX_RANGE_DAYS, parseDegreeRequest } from "@/lib/astrology/pro/degrees/request";
import { findDegreeCrossings } from "@/lib/astrology/pro/degrees/crossings";
import { CRITICAL_DEGREE_PRESETS } from "@/lib/astrology/pro/degrees/presets";
import { isProEphemerisEnabled } from "@/lib/astrology/pro/ephemeris/flags";
import { isSkyToolsEnabled } from "@/lib/astrology/skyTools";

const ROOT = join(__dirname, "..", "..");
let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").join("\n     ")}`);
  }
}
const okLun = (x: unknown) => {
  const r = parseLunationRequest(x);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.error));
  return r.value;
};
const okDeg = (x: unknown) => {
  const r = parseDegreeRequest(x);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.error));
  return r.value;
};

async function main() {
  await t("S01 ay isteği doğrulaması: tür, tarih biçimi, ters aralık, 1920–2150, evre listesi, aralık sınırları", () => {
    const bad = (x: unknown, code: string, field?: string) => {
      const r = parseLunationRequest(x);
      assert.ok(!r.ok, `kabul edilmemeliydi: ${JSON.stringify(x)}`);
      assert.equal(r.error.code, code);
      if (field) assert.equal(r.error.field, field);
    };
    bad({ start: "2026-01-01", end: "2026-02-01" }, "INVALID_INPUT", "kind");
    bad({ kind: "phases", start: "2026-02-30", end: "2026-03-01" }, "INVALID_INPUT", "start");
    bad({ kind: "phases", start: "2026-03-01", end: "2026-02-01" }, "INVALID_INPUT", "end");
    bad({ kind: "phases", start: "1919-12-31", end: "1920-02-01" }, "OUT_OF_RANGE");
    bad({ kind: "eclipses", start: "2150-01-01", end: "2151-01-01" }, "OUT_OF_RANGE");
    bad({ kind: "phases", start: "2026-01-01", end: "2036-12-31" }, "RANGE_TOO_LARGE");
    bad({ kind: "eclipses", start: "2000-01-01", end: "2051-01-01" }, "RANGE_TOO_LARGE");
    bad({ kind: "phases", start: "2026-01-01", end: "2026-02-01", phases: [] }, "INVALID_INPUT", "phases");
    bad({ kind: "phases", start: "2026-01-01", end: "2026-02-01", phases: ["blue_moon"] }, "INVALID_INPUT", "phases");
    assert.deepEqual(okLun({ kind: "phases", start: "2150-12-01", end: "2150-12-31" }).phases, ["new_moon", "first_quarter", "full_moon", "last_quarter"]);
    assert.deepEqual(okLun({ kind: "phases", start: "2026-01-01", end: "2026-02-01", phases: ["full_moon", "new_moon"] }).phases, ["new_moon", "full_moon"]);
  });

  await t("S02 ay evreleri: bitiş günü DAHİL, motor çıktısı eksiksiz ve kronolojik, yalnız seçilen evreler", () => {
    const r = buildLunations(okLun({ kind: "phases", start: "2026-11-01", end: "2027-02-28" }));
    assert.ok(r.ok && r.result.kind === "phases");
    const ph = r.result.phases;
    assert.ok(ph.length >= 16 && ph.length <= 18, `evre sayısı ${ph.length}`);
    for (let i = 1; i < ph.length; i++) assert.ok(ph[i].ms > ph[i - 1].ms);
    assert.ok(ph.every((p) => p.ms >= Date.UTC(2026, 10, 1) && p.ms < Date.UTC(2027, 2, 1)));
    assert.ok(ph.every((p) => Number.isFinite(p.moonLon) && p.uncertaintySec > 0));
    const only = buildLunations(okLun({ kind: "phases", start: "2026-11-01", end: "2027-02-28", phases: ["full_moon"] }));
    assert.ok(only.ok && only.result.kind === "phases" && only.result.phases.every((p) => p.phase === "full_moon") && only.result.phases.length === 4);
  });

  await t("S03 tutulmalar 2026–2028: motorla birebir (8 Ay + 6 Güneş), temas anları motor fonksiyonlarıyla aynı, sıralı", () => {
    const r = buildLunations(okLun({ kind: "eclipses", start: "2026-01-01", end: "2028-12-31" }));
    assert.ok(r.ok && r.result.kind === "eclipses");
    const t0 = Date.UTC(2026, 0, 1);
    const t1 = Date.UTC(2029, 0, 1);
    const L = findLunarEclipses(t0, t1);
    const S = findSolarEclipses(t0, t1);
    assert.ok(L.ok && S.ok);
    assert.equal(r.result.counts.moon, L.events.length);
    assert.equal(r.result.counts.sun, S.events.length);
    assert.equal(r.result.counts.moon, 8);
    assert.equal(r.result.counts.sun, 6);
    for (let i = 1; i < r.result.eclipses.length; i++) assert.ok(r.result.eclipses[i].peakMs > r.result.eclipses[i - 1].peakMs);
    for (const e of L.events) {
      const row: EclipseRow | undefined = r.result.eclipses.find((x) => x.body === "moon" && x.peakMs === e.peakMs);
      assert.ok(row && row.body === "moon" && row.kind === e.kind);
      const c = lunarEclipseContacts(e.peakTtMs);
      assert.ok(c && row.contacts);
      assert.equal(row.contacts.p1, c.p1.utcMs);
      assert.equal(row.contacts.p4, c.p4.utcMs);
      assert.equal(row.contacts.u2, c.u2?.utcMs ?? null);
      assert.ok(row.contacts.p1 < row.peakMs && row.peakMs < row.contacts.p4);
      if (row.kind === "total") assert.ok(row.contacts.u1 !== null && row.contacts.u2 !== null && row.contacts.u3 !== null && row.contacts.u4 !== null);
      if (row.kind === "penumbral") assert.ok(row.contacts.u1 === null && row.contacts.u2 === null);
    }
    for (const e of S.events) {
      const row: EclipseRow | undefined = r.result.eclipses.find((x) => x.body === "sun" && x.peakMs === e.peakMs);
      assert.ok(row && row.body === "sun" && row.kind === e.kind && row.centrality === e.centrality);
      const c = solarEclipseGlobalContacts(e.peakTtMs);
      assert.ok(c && row.contacts && row.contacts.begin === c.begin.utcMs && row.contacts.end === c.end.utcMs);
      assert.ok(row.contacts.begin < row.peakMs && row.peakMs < row.contacts.end);
    }
  });

  await t("S04 derece isteği doğrulaması: cisim, zodyak, derece listesi (1–36, 0≤d<360), tarih, 1920–2150, 10 yıl, Ay 400 gün", () => {
    const bad = (x: unknown, code: string, field?: string) => {
      const r = parseDegreeRequest(x);
      assert.ok(!r.ok, `kabul edilmemeliydi: ${JSON.stringify(x)}`);
      assert.equal(r.error.code, code);
      if (field) assert.equal(r.error.field, field);
    };
    const base = { body: "pluto", degrees: [300], start: "2022-01-01", end: "2024-12-31" };
    bad({ ...base, body: "chiron" }, "INVALID_INPUT", "body");
    bad({ ...base, zodiac: "draconic" }, "INVALID_INPUT", "zodiac");
    bad({ ...base, degrees: [] }, "INVALID_INPUT", "degrees");
    bad({ ...base, degrees: Array.from({ length: 37 }, (_, i) => i) }, "INVALID_INPUT", "degrees");
    bad({ ...base, degrees: [360] }, "INVALID_INPUT", "degrees");
    bad({ ...base, degrees: ["300"] }, "INVALID_INPUT", "degrees");
    bad({ ...base, start: "2024-13-01" }, "INVALID_INPUT", "start");
    bad({ ...base, start: "1919-06-01" }, "OUT_OF_RANGE");
    bad({ ...base, start: "2020-01-01", end: "2030-12-31" }, "RANGE_TOO_LARGE");
    bad({ ...base, body: "moon", start: "2026-01-01", end: "2027-02-05" }, "RANGE_TOO_LARGE");
    const v = okDeg({ ...base, body: "moon", degrees: [29, 0, 29], start: "2026-01-01", end: "2027-02-04" });
    assert.deepEqual(v.degrees, [0, 29]);
    assert.equal((Date.UTC(2027, 1, 4) - Date.UTC(2026, 0, 1)) / 86_400_000 + 1, MOON_MAX_RANGE_DAYS);
  });

  await t("S05 derece geçişleri: motorla birebir; Plüton 0° Kova 2022–2024 = 5 geçiş (1/5 … 5/5), bitiş günü dahil", () => {
    const r = buildDegreeCrossings(okDeg({ body: "pluto", degrees: [300], start: "2022-01-01", end: "2024-12-31" }));
    assert.ok(r.ok);
    const eng = findDegreeCrossings("pluto", [300], Date.UTC(2022, 0, 1), Date.UTC(2025, 0, 1));
    assert.ok(eng.ok);
    assert.deepEqual(r.result.events, eng.events);
    assert.equal(r.result.events.length, 5);
    assert.deepEqual(r.result.events.map((e) => `${e.pass}/${e.passCount}`), ["1/5", "2/5", "3/5", "4/5", "5/5"]);
    assert.deepEqual(r.result.events.map((e) => e.direction), ["direct", "retrograde", "direct", "retrograde", "direct"]);
  });

  await t("S06 hazır kritik derece listeleri (owner 01.11.2026): içerik, sınır (≤36), tekrar yok, motorla çalışır", () => {
    const by = Object.fromEntries(CRITICAL_DEGREE_PRESETS.map((p) => [p.id, p.degrees]));
    assert.deepEqual(by.anaretic, [29, 59, 89, 119, 149, 179, 209, 239, 269, 299, 329, 359]);
    assert.deepEqual(by.world_points, [0, 90, 180, 270]);
    assert.deepEqual(by.cardinal_classic, [0, 13, 26, 90, 103, 116, 180, 193, 206, 270, 283, 296]);
    assert.deepEqual(by.fixed_classic, [38, 39, 51, 52, 128, 129, 141, 142, 218, 219, 231, 232, 308, 309, 321, 322]);
    assert.deepEqual(by.mutable_classic, [64, 77, 154, 167, 244, 257, 334, 347]);
    for (const p of CRITICAL_DEGREE_PRESETS) {
      assert.ok(p.degrees.length >= 1 && p.degrees.length <= 36 && new Set(p.degrees).size === p.degrees.length, p.id);
      assert.ok(p.note.length > 10 && p.label.length > 3, p.id);
      const r = buildDegreeCrossings(okDeg({ body: "mars", degrees: p.degrees, start: "2026-11-01", end: "2027-10-31" }));
      assert.ok(r.ok, p.id);
    }
  });

  await t("S07 bayrak: Gökyüzü Araçları görünürlüğü = Profesyonel Efemeris bayrağı (aynı env; varsayılan AÇIK, yalnız tam '0' kapatır)", () => {
    for (const v of [undefined, "", "0", "true", "1", " 1", "yes"]) {
      const env = { ATLAS_PRO_EPHEMERIS_ENABLED: v } as unknown as NodeJS.ProcessEnv;
      assert.equal(isSkyToolsEnabled(env), isProEphemerisEnabled(env), String(v));
    }
    assert.equal(isSkyToolsEnabled({ ATLAS_PRO_EPHEMERIS_ENABLED: "1" } as unknown as NodeJS.ProcessEnv), true);
    // 02.11.2026 owner kararı: güvenlik/yetki kontrolleri sonrası varsayılan açık; "0" acil kapatma.
    assert.equal(isSkyToolsEnabled({} as unknown as NodeJS.ProcessEnv), true);
    assert.equal(isSkyToolsEnabled({ ATLAS_PRO_EPHEMERIS_ENABLED: "0" } as unknown as NodeJS.ProcessEnv), false);
    assert.equal(isProEphemerisEnabled({ ATLAS_PRO_EPHEMERIS_ENABLED: "0" } as unknown as NodeJS.ProcessEnv), false);
  });

  await t("S08 rotalar: kapı → bayrak (kapalıysa tek tip 404) → doğrulama → hız sınırı → yerel hesap; uzman yüzeyi birebir ayna", () => {
    for (const sub of ["ay", "derece"]) {
      const src = readFileSync(join(ROOT, `app/api/admin/astroloji/efemeris/${sub}/route.ts`), "utf8");
      const i = (re: RegExp) => {
        const m = re.exec(src);
        assert.ok(m, `${sub}: ${re}`);
        return m.index;
      };
      const gate = i(/await requireAstrologyAccess\(req\)/);
      const flag = i(/if \(!isProEphemerisEnabled\(\)\) return astrologyNotFoundResponse\(\);/);
      const parse = i(/const parsed = parse\w+Request\(b\.body\)/);
      const rate = i(/await hitDbRateLimit\(/);
      const build = i(/const r = build\w+\(parsed\.value\)/);
      assert.ok(gate < flag && flag < parse && parse < rate && rate < build, `${sub}: sıra`);
      assert.ok(!/callRoxy|readAstroRoxyConfig|insert|upsert/.test(src), `${sub}: sağlayıcı / yazma YOK`);
      assert.match(src, /export const maxDuration = 60;/);
      const mirror = readFileSync(join(ROOT, `app/api/astroloji/efemeris/${sub}/route.ts`), "utf8").replace(/\r\n/g, "\n").replace(/^\s*\/\/.*$/gm, "").trim();
      assert.equal(mirror, `export { POST } from "@/app/api/admin/astroloji/efemeris/${sub}/route";\nexport const runtime = "nodejs";\nexport const maxDuration = 60;`);
    }
  });

  console.log(`\nSONUÇ pro-sky-tools: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
void main();
