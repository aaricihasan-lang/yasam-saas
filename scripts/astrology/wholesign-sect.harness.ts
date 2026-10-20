/**
 * ASTROLOJİ — WHOLE SIGN SECT / ŞANS NOKTASI harness'i (ATL-P2-05 — 2026-10-20).
 *
 * Kaynak: GERÇEK whole-sign sağlayıcı yanıtları (ATLAS-1000 + ATLAS-NATAL-1950-2026 bağımsız doğrulamaları; sentetik kişiler):
 * natal 253 + solar return 75. Bağımsız referans: pyswisseph 2.10.03 geometrik Güneş irtifası (kanit/ga/ws_sect_pof_test.csv).
 * Gerçek sağlayıcı çağrısı YOK.
 *
 *   A) MC'den Güneş irtifası bağımsız referansla ≤0,03° (328/328, kutup dahil).
 *   B) Projeksiyon sonrası whole-sign sect = geometrik sect (328/328); sağlayıcının yanlış verdiği 31 vaka düzeltilir;
 *      PoF konum + whole-sign ev doğru sect'le formülden.
 *   C) Sağlayıcının sect'i doğruysa PoF konum/burç/ev sağlayıcıyla birebir (konvansiyon tutarlılığı).
 *   D) Placidus natal (golden) PoF + sect sağlayıcıdan AYNEN (dokunulmaz).
 *   E) Önbellek: whole-sign birimleri yeni adaptör sürümüyle (eski yanlış satırlar yeniden kullanılmaz); diğer ev
 *      sistemleri eski sürümde (önbellek ve girdi özeti değişmez).
 *   F) Lunar return whole-sign (gerçek örnek yok): sentetik — solar return yanıtı lunar kalıbına çevrilir, aynı düzeltme.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/wholesign-sect.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTechnique, type CalcUnit } from "@/lib/astrology/engine/techniques";
import { projectRoxyReturn } from "@/lib/astrology/providers/roxy/timing";
import { sunAltitudeFromMc } from "@/lib/astrology/providers/roxy/sect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Case = { file: string; technique: "western.natal" | "western.solar_return"; body: J; raw: J; lat: number; sunAltRef: number; sunAltRefKind: "swe" | "mc"; geo: "day" | "night"; roxyWs: "day" | "night" };
const FIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "wholesign-sect-pof.json"), "utf8")) as { cases: Case[] };
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));

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

const n360 = (x: number) => ((x % 360) + 360) % 360;
const dArc = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const chartOf = (c: Case) => (c.technique === "western.natal" ? c.raw : c.raw.chart);
const lonOf = (c: Case, name: string) => chartOf(c).planets.find((p: J) => p.name === name).longitude as number;

function project(c: Case, raw: J = c.raw) {
  const def = getTechnique(c.technique)!;
  const opts = c.technique === "western.natal" ? { houseSystem: "whole-sign", nodeType: c.body.nodeType } : { returnYear: c.body.returnYear, houseSystem: "whole-sign", returnLocationId: null };
  const r = def.project({ body: c.body } as unknown as CalcUnit, structuredClone(raw), opts);
  assert.ok(r.ok, `${c.file}: ${!r.ok ? r.errors.join("; ") : ""}`);
  const tech = r.technical as J;
  return (c.technique === "western.natal" ? tech.points : tech.chart.points).partOfFortune as J;
}
function expectedPof(c: Case, sect: "day" | "night") {
  const asc = chartOf(c).ascendant.longitude as number;
  const sun = lonOf(c, "Sun");
  const moon = lonOf(c, "Moon");
  const lon = n360(sect === "day" ? asc + moon - sun : asc + sun - moon);
  return { lon, house: ((Math.floor(lon / 30) - Math.floor(n360(asc) / 30) + 12) % 12) + 1 };
}

t("A: MC'den Güneş irtifası bağımsız referansla ≤0,03° (natal swe / dönüş MC; kutup dahil)", () => {
  let worst = 0;
  for (const c of FIX.cases) {
    const ch = chartOf(c);
    const alt = sunAltitudeFromMc(lonOf(c, "Sun"), ch.midheaven.longitude, c.lat);
    worst = Math.max(worst, Math.abs(alt - c.sunAltRef));
    assert.ok(Math.abs(alt - c.sunAltRef) <= 0.03, `${c.file}: ${alt} vs ${c.sunAltRef}`);
  }
  assert.equal(FIX.cases.length, 328);
  console.log(`     maks irtifa farkı ${worst.toFixed(4)}°`);
});

t("B: projeksiyon sonrası whole-sign sect = geometrik (328/328); 31 sağlayıcı hatası düzeltilir; PoF + ev formülden", () => {
  let fixed = 0;
  for (const c of FIX.cases) {
    const p = project(c);
    assert.equal(p.sect, c.geo, `${c.file} ${c.technique} sect`);
    const e = expectedPof(c, c.geo);
    assert.ok(dArc(p.longitude, e.lon) < 1e-9, `${c.file} PoF boylam`);
    assert.equal(p.house, e.house, `${c.file} PoF ev`);
    assert.equal(p.sign, ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"][Math.floor(e.lon / 30)]);
    assert.ok(Math.abs(p.degreeInSign - (e.lon % 30)) < 1e-9);
    if (c.roxyWs !== c.geo) fixed += 1;
  }
  assert.equal(fixed, 31);
});

t("C: sağlayıcının sect'i doğruysa PoF konum/burç/ev sağlayıcıyla birebir", () => {
  let n = 0;
  for (const c of FIX.cases.filter((x) => x.roxyWs === x.geo)) {
    const p = project(c);
    const rp = chartOf(c).partOfFortune;
    assert.ok(dArc(p.longitude, rp.longitude) < 1e-6, `${c.file}: ${p.longitude} vs ${rp.longitude}`);
    assert.equal(p.house, rp.house, `${c.file} ev`);
    assert.equal(p.sect, rp.sect);
    n += 1;
  }
  assert.equal(n, 297);
});

t("D: Placidus natal (golden) — PoF ve sect sağlayıcıdan AYNEN", () => {
  const raw = NATAL_GOLDEN.response ?? NATAL_GOLDEN;
  assert.equal(raw.houseSystem, "placidus");
  for (const sect of ["day", "night"] as const) {
    const r2 = structuredClone(raw);
    r2.partOfFortune.sect = sect; // sağlayıcı ne derse o: Placidus'ta yeniden hesap YOK
    const r = getTechnique("western.natal")!.project({} as CalcUnit, r2, { houseSystem: "placidus", nodeType: raw.birthDetails?.nodeType ?? "true" });
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    const p = (r.technical as J).points.partOfFortune;
    assert.equal(p.sect, sect);
    assert.equal(p.longitude, raw.partOfFortune.longitude);
    assert.equal(p.house, raw.partOfFortune.house);
  }
});

t("E: önbellek — whole-sign birimleri yeni adaptör sürümü; Placidus/Koch/Eşit eski sürüm ve aynı girdi özeti", () => {
  const birth = { birthDate: "1990-07-15", birthTime: "14:30:00", latitude: 41.0082, longitude: 28.9784, utcOffsetSeconds: 10800 };
  const ctx = { birth, birthUtc: "1990-07-15T11:30:00Z", partner: null } as J;
  const natal = getTechnique("western.natal")!;
  for (const hs of ["placidus", "koch", "equal"]) assert.equal(natal.units(ctx, { houseSystem: hs, nodeType: "true" })[0].adapterVersion, "astro-roxy-natal-1", hs);
  assert.notEqual(natal.units(ctx, { houseSystem: "whole-sign", nodeType: "true" })[0].adapterVersion, "astro-roxy-natal-1");
  const sr = getTechnique("western.solar_return")!;
  assert.equal(sr.units(ctx, { returnYear: 2026, houseSystem: "placidus", returnLocationId: null })[0].adapterVersion, "astro-roxy-solar-return-1");
  assert.notEqual(sr.units(ctx, { returnYear: 2026, houseSystem: "whole-sign", returnLocationId: null })[0].adapterVersion, "astro-roxy-solar-return-1");
  // Transit çift halka çerçevesi: whole-sign natal bağlamı natal tekniğiyle AYNI anahtar (önbellek eşleşir).
  const tr = getTechnique("western.transit")!;
  const ctxHashes = tr.contextUnits!(ctx, { nodeType: "true", atUtc: "2026-10-20T09:00" }).map((u) => u.inputHash);
  for (const hs of ["placidus", "whole-sign"]) assert.ok(ctxHashes.includes(natal.units(ctx, { houseSystem: hs, nodeType: "true" })[0].inputHash), `transit çerçevesi ${hs}`);
});

t("F: lunar return whole-sign (sentetik) — aynı sect/PoF düzeltmesi; Placidus dönüşte sağlayıcı aynen", () => {
  const c = FIX.cases.find((x) => x.technique === "western.solar_return" && x.roxyWs !== x.geo)!;
  const raw = structuredClone(c.raw);
  raw.lunarReturnDate = raw.solarReturnDate;
  raw.natalMoonPosition = raw.natalSunPosition;
  delete raw.solarReturnDate;
  delete raw.solarReturnYear;
  delete raw.natalSunPosition;
  const r = projectRoxyReturn(raw, "lunar", { houseSystem: "whole-sign", returnYear: null, returnDate: null });
  assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
  const p = (r.technical as J).chart.points.partOfFortune;
  assert.equal(p.sect, c.geo);
  assert.ok(dArc(p.longitude, expectedPof(c, c.geo).lon) < 1e-9);
  const plac = structuredClone(raw);
  plac.chart.houseSystem = "placidus";
  const rp = projectRoxyReturn(plac, "lunar", { houseSystem: "placidus", returnYear: null, returnDate: null });
  assert.ok(rp.ok, !rp.ok ? rp.errors.join("; ") : "");
  assert.equal((rp.technical as J).chart.points.partOfFortune.sect, c.roxyWs, "Placidus'ta sağlayıcı değeri aynen");
});

console.log(`\nastrology whole-sign sect/PoF harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
