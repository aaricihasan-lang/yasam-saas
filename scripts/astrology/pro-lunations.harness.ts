/**
 * GÖKYÜZÜ ATLASI — AY EVRELERİ ve TUTULMALAR (lib/astrology/pro/lunations). Ağ çağrısı YOK; sağlayıcı (Roxy) YOK.
 *
 * Bağımsız referanslar (fixtures/pro-lunations/ref-lunations-2026-11-01.json; üretici ref_lunations.py):
 *   • JPL DE440 (skyfield 1.55): Ay evreleri (almanac.moon_phases) ve Ay tutulmaları (eclipselib) — 1920–2150.
 *   • Swiss Ephemeris 2.10.03 MOSHIER (dosyasız): Ay ve Güneş tutulmaları (lun_eclipse_when, sol_eclipse_when_glob).
 *   • Yayımlanmış değerler (motordan bağımsız): NASA Eclipse (Espenak) tepe anları, USNO Ay evreleri.
 *
 * TOLERANSLAR (sonuçlardan ÖNCE, konum hata sınırlarından türetildi; bkz. lunations/phases.ts positionErrorArcsec):
 *   • Evre anı (TT): 1920–2100 → (Ay 9″ + Güneş 4″) / en düşük göreli hız ~10°/gün ≈ 31 s → 40 s; 2101–2150 → Ay 150″ (ölçümsüz,
 *     temkinli) → 400 s. UT farkı ayrıca: TT toleransı + 60 s (2025 sonrası ΔT öngörü modelleri farkı).
 *   • Tutulma tepe anı (TT): 120 s. Tür: birebir; İSTİSNA yalnız (a) Ay: referans umbral büyüklüğü 0 ya da 1 sınırına 0,005'ten yakın
 *     (gölge büyütme kuralı) · (b) Güneş: referans "melez" (kütüphanede melez tür yok) — ikisi de MODEL FARKI olarak listelenir, gizlenmez.
 *   • Yayımlanmış değerler: evre 60 s (USNO dakika çözünürlüğü), tutulma 120 s.
 *   • Ay tutulması TEMAS anları: 180 s önceden tanımlıydı; ölçümde aşıldı (en büyük 414 s, sistematik) → modül bunları VERMİYOR (L9).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-lunations.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findLunarEclipses, findLunarPhases, findSolarEclipses, ttToUtcMs, type LunarPhaseEvent } from "@/lib/astrology/pro/lunations";
import { isTimeScalesError, scalesFromUtc } from "@/lib/astrology/pro/time";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).message}\n`);
  }
}
type Ref = {
  phasesDe440: [number, number, number][];
  lunarDe440: [number, number, number, number][];
  lunarSwe: { kind: string; peakTt: number; contactsTt: (number | null)[] }[];
  solarSwe: { kind: string; peakTt: number }[];
};
const REF = JSON.parse(readFileSync(join(__dirname, "fixtures", "pro-lunations", "ref-lunations-2026-11-01.json"), "utf8")) as Ref;
/** skyfield almanac.moon_phases dizini (0 yeniay, 1 ilk dördün, 2 dolunay, 3 son dördün) — modülün sabitinden BAĞIMSIZ. */
const REF_PHASE_NAMES = ["new_moon", "first_quarter", "full_moon", "last_quarter"] as const;
const T0 = Date.UTC(1920, 0, 1);
const T1 = Date.UTC(2151, 0, 1);
const YEAR = (ms: number) => new Date(ms).getUTCFullYear();
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + "Z";

// Tam aralık bir kez hesaplanır (5 yıllık parçalar; ≈ 3 sn).
const PH: LunarPhaseEvent[] = [];
for (let y = 1920; y < 2151; y += 5) {
  const r = findLunarPhases(Date.UTC(y, 0, 1), Date.UTC(Math.min(y + 5, 2151), 0, 1));
  if (!r.ok) throw new Error(r.error);
  PH.push(...r.events);
}
const LE = findLunarEclipses(T0, T1);
const SE = findSolarEclipses(T0, T1);
if (!LE.ok || !SE.ok) throw new Error("tutulma araması");

t("L0 referans bütünlüğü: evre / Ay tutulması / Güneş tutulması SAYILARI üç kaynakta birebir (11.428 / 532 / 521)", () => {
  assert.equal(PH.length, REF.phasesDe440.length);
  assert.equal(PH.length, 11428);
  assert.equal(LE.events.length, REF.lunarDe440.length);
  assert.equal(LE.events.length, REF.lunarSwe.length);
  assert.equal(SE.events.length, REF.solarSwe.length);
  assert.equal(SE.events.length, 521);
});

t("L1 Ay evreleri ↔ JPL DE440: sıra ve evre türü birebir; TT farkı ≤ 40 s (1920–2100) / ≤ 400 s (2101–2150)", () => {
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < PH.length; i++) {
    const [p, refTt] = REF.phasesDe440[i];
    assert.equal(PH[i].phase, REF_PHASE_NAMES[p], `${i} ${iso(PH[i].ms)}`);
    const d = Math.abs(PH[i].ttMs - refTt) / 1000;
    if (YEAR(PH[i].ms) <= 2100) mA = Math.max(mA, d);
    else mB = Math.max(mB, d);
  }
  console.log(`  en büyük |ΔTT|: 1920–2100 ${mA.toFixed(2)} s · 2101–2150 ${mB.toFixed(2)} s`);
  assert.ok(mA <= 40, `1920–2100 ${mA}`);
  assert.ok(mB <= 400, `2101–2150 ${mB}`);
});

t("L2 Ay evreleri UT ↔ DE440 (UT1): fark ≤ TT toleransı + 60 s (2025 sonrası ΔT öngörü modelleri farkı ayrı bütçe)", () => {
  let m = 0;
  for (let i = 0; i < PH.length; i++) {
    const d = Math.abs(PH[i].ms - REF.phasesDe440[i][2]) / 1000;
    const lim = (YEAR(PH[i].ms) <= 2100 ? 40 : 400) + 60;
    assert.ok(d <= lim, `${iso(PH[i].ms)} ${d}`);
    m = Math.max(m, d);
  }
  console.log(`  en büyük |ΔUT| ${m.toFixed(2)} s`);
});

t("L3 beyan edilen belirsizlik dürüst: her evrede uncertaintySec ≥ DE440'a göre gerçek |ΔTT|", () => {
  let worst = Infinity;
  for (let i = 0; i < PH.length; i++) {
    const d = Math.abs(PH[i].ttMs - REF.phasesDe440[i][1]) / 1000;
    assert.ok(PH[i].uncertaintySec >= d, `${iso(PH[i].ms)} beyan ${PH[i].uncertaintySec} < gerçek ${d}`);
    worst = Math.min(worst, PH[i].uncertaintySec - d);
  }
  console.log(`  en dar pay ${worst.toFixed(1)} s`);
});

t("L4 Ay tutulmaları ↔ DE440 ve Swiss: tepe |ΔTT| ≤ 120 s; tür birebir (yalnız umbral büyüklüğü 0/1 sınırına < 0,005 olanlar model farkı)", () => {
  const K = ["penumbral", "partial", "total"];
  let mD = 0;
  let mS = 0;
  const model: string[] = [];
  LE.events.forEach((e, i) => {
    const [k, tt, umb] = REF.lunarDe440[i];
    const s = REF.lunarSwe[i];
    mD = Math.max(mD, Math.abs(e.peakTtMs - tt) / 1000);
    mS = Math.max(mS, Math.abs(e.peakTtMs - s.peakTt) / 1000);
    const nearBoundary = Math.abs(umb) < 0.005 || Math.abs(umb - 1) < 0.005;
    for (const [refKind, src] of [[K[k], "DE440"], [s.kind, "Swiss"]] as const) {
      if (refKind === e.kind) continue;
      assert.ok(nearBoundary, `${iso(e.peakMs)} biz ${e.kind} ≠ ${src} ${refKind} (umbral ${umb})`);
      model.push(`${iso(e.peakMs).slice(0, 10)} biz=${e.kind} ${src}=${refKind} umbral=${umb.toFixed(4)}`);
    }
  });
  console.log(`  tepe |ΔTT| DE440 ${mD.toFixed(1)} s · Swiss ${mS.toFixed(1)} s · model farkı ${model.length}: ${model.join(" | ")}`);
  assert.ok(mD <= 120 && mS <= 120);
});

t("L5 Güneş tutulmaları ↔ Swiss: tepe |ΔTT| ≤ 120 s; tür birebir (yalnız Swiss 'melez' → model farkı); merkezi olmayan tam/halkalı doğru", () => {
  let m = 0;
  let hybrid = 0;
  let nonCentral = 0;
  SE.events.forEach((e, i) => {
    const s = REF.solarSwe[i];
    m = Math.max(m, Math.abs(e.peakTtMs - s.peakTt) / 1000);
    if (e.centrality === "non_central") nonCentral++;
    if (s.kind === "hybrid") {
      assert.ok(e.kind === "total" || e.kind === "annular", `${iso(e.peakMs)} melez → ${e.kind}`);
      hybrid++;
      return;
    }
    assert.equal(e.kind, s.kind, `${iso(e.peakMs)} (eksen ${e.axisDistanceKm} km, ${e.centrality})`);
  });
  console.log(`  tepe |ΔTT| ${m.toFixed(1)} s · melez (model farkı) ${hybrid} · merkezi olmayan ${nonCentral}`);
  assert.ok(m <= 120);
  assert.equal(nonCentral, 12);
});

t("L6 yayımlanmış değerler (motordan bağımsız): NASA tutulma tepe anları ≤ 120 s, USNO evre anları ≤ 60 s", () => {
  const near = (list: { ms: number }[], target: number) => list.reduce((a, b) => (Math.abs(b.ms - target) < Math.abs(a.ms - target) ? b : a));
  const solar = SE.events.map((e) => ({ ...e, ms: e.peakMs }));
  const lunar = LE.events.map((e) => ({ ...e, ms: e.peakMs }));
  const checks: [string, { ms: number; kind?: string }, number, string | null, number][] = [
    ["2017-08-21 tam Güneş (NASA greatest 18:25:32 UT)", near(solar, Date.UTC(2017, 7, 21, 18, 25, 32)), Date.UTC(2017, 7, 21, 18, 25, 32), "total", 120],
    ["2024-04-08 tam Güneş (NASA greatest 18:17 UT)", near(solar, Date.UTC(2024, 3, 8, 18, 17, 20)), Date.UTC(2024, 3, 8, 18, 17, 20), "total", 120],
    ["2022-11-08 tam Ay (NASA greatest 10:59:11 UT)", near(lunar, Date.UTC(2022, 10, 8, 10, 59, 11)), Date.UTC(2022, 10, 8, 10, 59, 11), "total", 120],
    ["2025-03-14 tam Ay (NASA greatest 06:58:43 UT)", near(lunar, Date.UTC(2025, 2, 14, 6, 58, 43)), Date.UTC(2025, 2, 14, 6, 58, 43), "total", 120],
    ["2000-01-06 yeniay (USNO 18:14 UT)", near(PH.filter((p) => p.phase === "new_moon"), Date.UTC(2000, 0, 6, 18, 14)), Date.UTC(2000, 0, 6, 18, 14), null, 60],
    ["2024-01-11 yeniay (USNO 11:57 UT)", near(PH.filter((p) => p.phase === "new_moon"), Date.UTC(2024, 0, 11, 11, 57)), Date.UTC(2024, 0, 11, 11, 57), null, 60],
    ["2024-01-25 dolunay (USNO 17:54 UT)", near(PH.filter((p) => p.phase === "full_moon"), Date.UTC(2024, 0, 25, 17, 54)), Date.UTC(2024, 0, 25, 17, 54), null, 60],
  ];
  for (const [name, ev, ref, kind, tol] of checks) {
    const d = Math.abs(ev.ms - ref) / 1000;
    assert.ok(d <= tol, `${name}: ${iso(ev.ms)} fark ${d.toFixed(0)} s`);
    if (kind) assert.equal(ev.kind, kind, name);
  }
});

t("L7 aralık sınırları [t0, t1) ve 0°/360° (yeniay): olaydan 1 dk önce başlayan aralık içerir, 1 dk sonra başlayan içermez", () => {
  const nm = PH.find((p) => p.phase === "new_moon" && YEAR(p.ms) === 2030)!;
  const inc = findLunarPhases(nm.ms - 60_000, nm.ms + 86_400_000);
  const exc = findLunarPhases(nm.ms + 60_000, nm.ms + 86_400_000);
  assert.ok(inc.ok && exc.ok);
  assert.ok(inc.events.some((e) => e.phase === "new_moon" && Math.abs(e.ms - nm.ms) < 1000));
  assert.ok(!exc.events.some((e) => e.phase === "new_moon"));
  const only = findLunarPhases(Date.UTC(2030, 0, 1), Date.UTC(2031, 0, 1), ["full_moon"]);
  assert.ok(only.ok && only.events.length >= 12 && only.events.every((e) => e.phase === "full_moon"));
  // Kronolojik ve ardışık evreler 90° sırasıyla (atlama/çift kök yok)
  for (let i = 1; i < PH.length; i++) {
    assert.ok(PH[i].ms > PH[i - 1].ms);
    assert.equal(REF_PHASE_NAMES.indexOf(PH[i].phase), (REF_PHASE_NAMES.indexOf(PH[i - 1].phase) + 1) % 4, iso(PH[i].ms));
  }
});

t("L8 hatalı girdi ve desteklenmeyen tarih: açık hata, istisna yok (1919, 2151+, ters aralık, NaN, aşırı uzun, geçersiz evre)", () => {
  const bad: [number, number, string][] = [
    [Date.UTC(1919, 11, 1), Date.UTC(1920, 1, 1), "out_of_range"],
    [Date.UTC(2150, 11, 1), Date.UTC(2151, 1, 1), "out_of_range"],
    [Date.UTC(2000, 1, 1), Date.UTC(2000, 0, 1), "invalid_input"],
    [Number.NaN, Date.UTC(2000, 0, 1), "invalid_input"],
    [Date.UTC(1950, 0, 1), Date.UTC(1965, 0, 1), "range_too_large"],
  ];
  for (const [a, b, code] of bad) {
    const r = findLunarPhases(a, b);
    assert.ok(!r.ok && r.code === code, `${a} ${b}`);
  }
  const p = findLunarPhases(Date.UTC(2000, 0, 1), Date.UTC(2000, 2, 1), ["blue_moon" as never]);
  assert.ok(!p.ok && p.code === "invalid_input");
  const l = findLunarEclipses(Date.UTC(1900, 0, 1), Date.UTC(1910, 0, 1));
  assert.ok(!l.ok && l.code === "out_of_range");
  const s = findSolarEclipses(Date.UTC(2160, 0, 1), Date.UTC(2161, 0, 1));
  assert.ok(!s.ok && s.code === "out_of_range");
});

t("L9 temas anları ve örtülme çıktıda YOK (tolerans dışı ölçüldü; kural seçimi Owner'da) — ölçüm referansta korunur", () => {
  for (const e of LE.events) {
    assert.deepEqual(Object.keys(e).sort(), ["kind", "peakMs", "peakTtMs"]);
  }
  for (const e of SE.events) assert.deepEqual(Object.keys(e).sort(), ["axisDistanceKm", "centrality", "kind", "peakMs", "peakTtMs"]);
  assert.equal(REF.lunarSwe.filter((x) => x.contactsTt[0] !== null).length, 532, "Swiss temas referansı korunuyor");
});

t("L10 TT → UTC ters dönüşümü ortak zaman katmanıyla ±1 ms (1920, 1961–1971 kayması, artık saniye çevresi, 2026+, 2150)", () => {
  const pts = [Date.UTC(1920, 0, 1), Date.UTC(1965, 5, 1), Date.UTC(1972, 0, 1), Date.UTC(2016, 11, 31, 23, 59, 59, 500), Date.UTC(2017, 0, 1, 0, 0, 0, 500), Date.UTC(2030, 6, 1), Date.UTC(2150, 11, 31)];
  for (const u of pts) {
    const s = scalesFromUtc(u, { pre1961: "civil_as_ut" });
    assert.ok(!isTimeScalesError(s));
    assert.ok(Math.abs(ttToUtcMs(s.ttMs) - u) <= 1, new Date(u).toISOString());
  }
});

t("L11 statik bağımsızlık: modül #645 efemeris / #646 transit dosyalarını import ETMEZ; astronomy-engine SearchMoonPhase KULLANILMAZ", () => {
  const dir = join(__dirname, "..", "..", "lib", "astrology", "pro", "lunations");
  for (const f of ["phases.ts", "eclipses.ts", "index.ts"]) {
    const s = readFileSync(join(dir, f), "utf8");
    assert.ok(!/from\s+["'][^"']*\/(ephemeris|transits)\b/.test(s), f);
    assert.ok(!/SearchMoonPhase|SetDeltaTFunction/.test(s.replace(/\/\/[^\n]*/g, "")), f);
  }
});

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
