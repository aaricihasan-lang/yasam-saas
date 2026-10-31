/**
 * GÖKYÜZÜ ATLASI — DERECE GEÇİŞLERİ motoru testleri (lib/astrology/pro/degrees). Ücretli çağrı YOK; ağ YOK.
 * Bağımsız referans: scripts/astrology/fixtures/pro-degrees/ref-degree-crossings-2026-11-01.json (JPL DE440 / skyfield 1.55; ortalama
 * düğüm ve Lahiri ayanamsa Swiss Ephemeris 2.10.03 — yalnız test referansı). Üretici: ref_degree_crossings.py (aynı klasör).
 *
 * ÖNCEDEN TANIMLI TOLERANSLAR (sonuçlara bakılmadan; #645 accuracy.ts sınırlarından):
 *   • Eşleşen her geçiş: |Δt (TT)| ≤ max(motorun beyan ettiği uncertaintySec, 2 s). (uncertaintySec = 2 × LOCAL_LIMITS boylam / |hız|.)
 *   • Eşleşmeyen geçiş (bir tarafta var, diğerinde yok) YALNIZ "istasyon sınırı" ise kabul: ±10 gün içinde bir istasyonda cismin
 *     boylamı dereceden ≤ 2 × LOCAL_LIMITS boylam + 5″ uzakta (iki motorun döngü tepesi derecenin iki yanında kalabilir — model farkı).
 *     Bu vakalar AYRI sayılır ve yazdırılır; toplamın %0,5'ini aşarsa FAIL.
 *   • Yayımlanmış değer (USNO ekinoks/gündönümü, dakika duyarlığı): |Δt| ≤ uncertaintySec + 60 s.
 *
 * BİLİNEN BAĞIMLILIK HATASI (#647 ortak zaman katmanı → astronomy-engine 2.1.19 AstroTime.FromTerrestrialTime): yakınsama koşulu
 * |err| < 1e-12 gün, TT ile UT'nin J2000 ± 2^k gün sınırının iki yanına düştüğü anlarda kayan nokta adımı (1,8e-12 gün) yüzünden HİÇ
 * sağlanmaz → sonsuz döngü. 1920–2150'de tek pencere: 1955-02-22 11:59:29,5 – 12:00:00,6 UTC (D8 ölçer). Bu harness pencerelerin
 * tarama ızgarasını GRID_OFFSET_MS kadar kaydırır (ızgara tam 12:00 UTC'ye düşmesin). Ürün düzeltmesi #647'dedir (QA 04/07 raporu).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-degree-crossings.harness.ts
 */
import assert from "node:assert/strict";
import * as Astronomy from "astronomy-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CROSSING_MAX_MS,
  CROSSING_MIN_MS,
  degreesInEverySign,
  findDegreeCrossings,
  type DegreeCrossing,
} from "@/lib/astrology/pro/degrees";
import { eraOf, LOCAL_LIMITS } from "@/lib/astrology/pro/ephemeris/accuracy";
import { findStations, zodiacLon } from "@/lib/astrology/pro/ephemeris/events";
import { localSpeed, wrap180 } from "@/lib/astrology/pro/ephemeris/local";
import type { EphemerisBody, Zodiac } from "@/lib/astrology/pro/ephemeris/types";
import { isTimeScalesError, scalesFromUtc } from "@/lib/astrology/pro/time";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).stack ?? String(e)}\n`);
  }
}
const olcu = (s: string) => console.log(`  ÖLÇÜ ${s}`);

const DAY = 86_400_000;
const UNIX_JD = 2440587.5;
const FX = join(process.cwd(), "scripts/astrology/fixtures/pro-degrees");
type RefWin = { body: EphemerisBody; zodiac: Zodiac; jdA: number; jdB: number; events: [number, number, number][] };
const REF = JSON.parse(readFileSync(join(FX, "ref-degree-crossings-2026-11-01.json"), "utf8")) as { meta: { degrees: number[] }; windows: RefWin[] };
const DEGREES = REF.meta.degrees;

const ttOf = (ms: number) => {
  const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  if (isTimeScalesError(s)) throw new Error(s.error);
  return s.ttMs;
};
/** #647 hatasından kaçınmak için tarama ızgarası kaydırması (1 sa 0 dk 1,234 s) — sonuçlar ızgaradan bağımsız olmalıdır (D5 kanıtlar). */
const GRID_OFFSET_MS = 3_601_234;
const lonLimitArcsec = (body: EphemerisBody, ms: number) => LOCAL_LIMITS[eraOf(new Date(ms).getUTCFullYear())][body]!.lon;

/** Pencereyi motorun izin verdiği parçalara bölerek çağır (yarı açık parçalar: birleşim = pencere). */
function crossingsOver(body: EphemerisBody, t0: number, t1: number, zodiac: Zodiac): DegreeCrossing[] {
  const out: DegreeCrossing[] = [];
  for (let a = t0 + GRID_OFFSET_MS; a < t1; a += 3650 * DAY) {
    const r = findDegreeCrossings(body, DEGREES, a, Math.min(a + 3650 * DAY, t1), zodiac);
    if (!r.ok) throw new Error(r.error);
    out.push(...r.events);
  }
  return out;
}

/** Harness'in KENDİ istasyon bulucusu (gerçek düğüm dahil; #645 findStations düğümlerde boş döner): ±10 gün, 1 sa adım. */
function stationLonsNear(body: EphemerisBody, ms: number, zodiac: Zodiac): number[] {
  if (body === "sun" || body === "moon" || body === "mean_node") return [];
  const out: number[] = [];
  const step = 3_600_000;
  let a = Math.max(CROSSING_MIN_MS, ms - 10 * DAY);
  let sa = Math.sign(localSpeed(body, a));
  for (let b = a + step; b <= Math.min(CROSSING_MAX_MS - 2 * step, ms + 10 * DAY); b += step) {
    const sb = Math.sign(localSpeed(body, b));
    if (sa !== sb) {
      let lo = a;
      let hi = b;
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2;
        if (Math.sign(localSpeed(body, m)) === sa) lo = m;
        else hi = m;
      }
      out.push(zodiacLon(body, (lo + hi) / 2, zodiac));
    }
    a = b;
    sa = sb;
  }
  return out;
}
const isStationBoundary = (body: EphemerisBody, ms: number, degree: number, zodiac: Zodiac) =>
  stationLonsNear(body, ms, zodiac).some((L) => Math.abs(wrap180(L - degree)) * 3600 <= 2 * lonLimitArcsec(body, ms) + 5);

async function main() {
  // ─── D0. Girdi doğrulama ────────────────────────────────────────────────────────────────────────────
  await t("D0 hatalı / desteklenmeyen girdi → açık hata kodu (istisna fırlatmaz)", () => {
    const a = Date.UTC(2026, 0, 1);
    const b = Date.UTC(2026, 6, 1);
    const code = (r: ReturnType<typeof findDegreeCrossings>) => (r.ok ? "ok" : r.code);
    assert.equal(code(findDegreeCrossings("mars", [], a, b)), "invalid_input");
    assert.equal(code(findDegreeCrossings("mars", [360], a, b)), "invalid_input");
    assert.equal(code(findDegreeCrossings("mars", [-0.1], a, b)), "invalid_input");
    assert.equal(code(findDegreeCrossings("mars", [Number.NaN], a, b)), "invalid_input");
    assert.equal(code(findDegreeCrossings("mars", Array.from({ length: 37 }, (_, i) => i), a, b)), "invalid_input");
    assert.equal(code(findDegreeCrossings("ceres" as EphemerisBody, [10], a, b)), "invalid_input");
    assert.equal(code(findDegreeCrossings("mars", [10], b, a)), "invalid_input");
    assert.equal(code(findDegreeCrossings("mars", [10], Number.NaN, b)), "invalid_input");
    assert.equal(code(findDegreeCrossings("mars", [10], Date.UTC(1919, 11, 31), b)), "out_of_range");
    assert.equal(code(findDegreeCrossings("mars", [10], Date.UTC(2150, 6, 1), Date.UTC(2151, 0, 2))), "out_of_range");
    assert.equal(code(findDegreeCrossings("mars", [10], a, a + 3661 * DAY)), "range_too_large");
    assert.equal(code(findDegreeCrossings("mars", [10], CROSSING_MAX_MS - 30 * DAY, CROSSING_MAX_MS)), "ok");
    assert.equal(code(findDegreeCrossings("mars", [10], CROSSING_MIN_MS, CROSSING_MIN_MS + 30 * DAY)), "ok");
  });

  // ─── D1. DE440 karşılaştırması (tüm pencereler) ──────────────────────────────────────────────────────
  await t("D1 DE440 geçişleri ↔ motor: eşleşen fark ≤ beyan; eşleşmeyen yalnız istasyon sınırı (≤ %0,5)", () => {
    let matched = 0;
    let boundary = 0;
    let refTotal = 0;
    const viol: string[] = [];
    const boundaryList: string[] = [];
    const worst: Record<string, { dt: number; ratio: number; n: number }> = {};
    for (const w of REF.windows) {
      const A = (w.jdA - UNIX_JD) * DAY;
      const B = (w.jdB - UNIX_JD) * DAY;
      const mine = crossingsOver(w.body, Math.max(CROSSING_MIN_MS, A - DAY), Math.min(CROSSING_MAX_MS, B + DAY), w.zodiac)
        .map((e) => ({ e, tt: ttOf(e.ms) }))
        .filter((x) => x.tt >= A + 2 * DAY && x.tt < B - 2 * DAY);
      const refs = w.events.filter(([, tt]) => tt >= A + 2 * DAY && tt < B - 2 * DAY);
      refTotal += refs.length;
      const used = new Set<number>();
      for (const [deg, tt, dir] of refs) {
        let best = -1;
        let bestD = Infinity;
        mine.forEach((x, i) => {
          if (used.has(i) || x.e.degree !== deg || (x.e.direction === "direct" ? 1 : -1) !== dir) return;
          const d = Math.abs(x.tt - tt);
          if (d < bestD && d < 5 * DAY) {
            bestD = d;
            best = i;
          }
        });
        const msApprox = tt - 70_000;
        if (best < 0) {
          if (isStationBoundary(w.body, msApprox, deg, w.zodiac)) {
            boundary++;
            boundaryList.push(`ref-only ${w.body} ${w.zodiac} ${deg}° ${new Date(msApprox).toISOString()} ${dir > 0 ? "D" : "R"}`);
          } else viol.push(`eşleşmedi (yalnız DE440): ${w.body} ${w.zodiac} ${deg}° ${new Date(msApprox).toISOString()} yön ${dir}`);
          continue;
        }
        used.add(best);
        matched++;
        const e = mine[best].e;
        const dtSec = bestD / 1000;
        const allow = Math.max(e.uncertaintySec, 2);
        const k = `${w.body}${w.zodiac === "tropical" ? "" : " (Lahiri)"}`;
        const cur = worst[k] ?? { dt: 0, ratio: 0, n: 0 };
        worst[k] = { dt: Math.max(cur.dt, dtSec), ratio: Math.max(cur.ratio, dtSec / allow), n: cur.n + 1 };
        if (dtSec > allow) viol.push(`${w.body} ${deg}° ${e.ut} Δ=${dtSec.toFixed(1)} s > ${allow.toFixed(1)} s`);
      }
      mine.forEach((x, i) => {
        if (used.has(i)) return;
        if (isStationBoundary(w.body, x.e.ms, x.e.degree, w.zodiac)) {
          boundary++;
          boundaryList.push(`motor-only ${w.body} ${w.zodiac} ${x.e.degree}° ${x.e.ut} ${x.e.direction === "direct" ? "D" : "R"}`);
        } else viol.push(`eşleşmedi (yalnız motor): ${w.body} ${w.zodiac} ${x.e.degree}° ${x.e.ut} ${x.e.direction}`);
      });
    }
    for (const [k, v] of Object.entries(worst)) olcu(`${k}: n=${v.n} en büyük |ΔTT|=${v.dt.toFixed(1)} s, fark/beyan en çok ${v.ratio.toFixed(3)}`);
    olcu(`eşleşen ${matched}, istasyon sınırı ${boundary}`);
    for (const s of boundaryList) olcu(`istasyon sınırı: ${s}`);
    assert.ok(matched >= refTotal * 0.995 && refTotal > 7000, `eşleşen ${matched} / referans ${refTotal}`);
    assert.ok(boundary <= matched * 0.005, `istasyon sınırı fazla: ${boundary}`);
    assert.deepEqual(viol.slice(0, 20), []);
  });

  // ─── D2. Retro tekrarı (çoklu kök) ──────────────────────────────────────────────────────────────────
  await t("D2 Plüton 300° (0° Kova) 2022–2025: 5 geçiş D/R/D/R/D, tek grup (pass 1..5)", () => {
    const r = findDegreeCrossings("pluto", [300], Date.UTC(2022, 0, 1), Date.UTC(2025, 0, 1));
    assert.ok(r.ok);
    assert.deepEqual(r.events.map((e) => e.direction[0]), ["d", "r", "d", "r", "d"]);
    assert.deepEqual(r.events.map((e) => `${e.pass}/${e.passCount}`), ["1/5", "2/5", "3/5", "4/5", "5/5"]);
    assert.deepEqual(r.events.map((e) => e.ut.slice(0, 10)), ["2023-03-23", "2023-06-11", "2024-01-21", "2024-09-01", "2024-11-19"]);
    assert.ok(r.events.every((e) => e.sign === 10 && e.degreeInSign === 0));
  });

  await t("D3 istasyon çevresi: derece istasyonun iki yanında geçilir — komşu adımlarda (a) ve AYNI tarama adımı içinde (b, istasyon bölmesi)", () => {
    // Retro istasyonu = boylam tepe noktası → altındaki derece önce direkt, sonra retro geçilir (direkt istasyonda tersi).
    // (a) derece istasyon boylamından 0,002° uzakta → iki geçiş genelde komşu adımlara düşer.
    // (b) motorun tarama ızgarası istasyonu bir adımın ORTASINA koyacak şekilde t0 seçilir ve derece = boylam(istasyon ± adım/8):
    //     iki geçiş (≈ istasyon ± adım/8) aynı adımın içindedir; adım uçlarında hız işareti farklı, net boylam farkı dereceyi KAPSAMAZ →
    //     yalnız istasyon bölmesi bulabilir.
    const STEP: Record<string, number> = { mercury: DAY / 2, venus: DAY / 2, mars: DAY / 2, jupiter: DAY, saturn: DAY };
    let checkedA = 0;
    let checkedB = 0;
    const check = (body: EphemerisBody, sMs: number, deg: number, t0: number, label: string) => {
      const r = findDegreeCrossings(body, [deg], t0, sMs + 20 * DAY);
      assert.ok(r.ok);
      const near = r.events.filter((e) => Math.abs(e.ms - sMs) < 15 * DAY);
      assert.equal(near.length, 2, `${label} ${body} ${new Date(sMs).toISOString()} ${deg}: ${near.length} geçiş`);
      assert.notEqual(near[0].direction, near[1].direction);
      assert.ok(near[0].ms < sMs && near[1].ms > sMs, `${label} ${body} istasyonu çevrelemiyor`);
      assert.deepEqual(near.map((e) => e.passCount), [2, 2]);
      return near;
    };
    for (const body of ["mercury", "venus", "mars", "jupiter", "saturn"] as const) {
      for (const s of findStations(body, Date.UTC(2020, 0, 1), Date.UTC(2026, 0, 1))) {
        if (s.kind !== "station") continue;
        const sign = s.direction === "retrograde" ? -1 : 1;
        check(body, s.ms, (((s.lon + sign * 0.002) % 360) + 360) % 360, s.ms - 20 * DAY, "(a)");
        checkedA++;
        const step = STEP[body];
        const t0 = s.ms - step / 2 - Math.round((20 * DAY) / step) * step;
        const near = check(body, s.ms, zodiacLon(body, s.ms + step / 8, "tropical"), t0, "(b)");
        const k0 = Math.floor((near[0].ms - t0) / step);
        const k1 = Math.floor((near[1].ms - t0) / step);
        assert.equal(k0, k1, `(b) ${body} ${s.ut}: geçişler aynı adımda değil`);
        checkedB++;
      }
    }
    olcu(`istasyon çevresi çift geçiş: (a) ${checkedA}, (b) aynı adım içinde ${checkedB} istasyon`);
    assert.ok(checkedA >= 30 && checkedB >= 30);
  });

  // ─── D4. 0°/360° ve yayımlanmış değerler ─────────────────────────────────────────────────────────────
  await t("D4 Güneş 0°/90°/180°/270° ↔ USNO ekinoks ve gündönümleri (yayımlanmış, dakika) + 0°/360° kenarı", () => {
    // USNO "Earth's Seasons" (UT, dakika): 2000-03-20 07:35, 2024-03-20 03:06, 2024-06-20 20:51, 2024-09-22 12:44, 2024-12-21 09:20.
    const pub: [number, number][] = [
      [0, Date.UTC(2000, 2, 20, 7, 35)],
      [0, Date.UTC(2024, 2, 20, 3, 6)],
      [90, Date.UTC(2024, 5, 20, 20, 51)],
      [180, Date.UTC(2024, 8, 22, 12, 44)],
      [270, Date.UTC(2024, 11, 21, 9, 20)],
    ];
    for (const [deg, ms] of pub) {
      const r = findDegreeCrossings("sun", [deg], ms - 5 * DAY, ms + 5 * DAY);
      assert.ok(r.ok && r.events.length === 1, `${deg}`);
      const e = r.events[0];
      const d = Math.abs(e.ms - ms) / 1000;
      olcu(`Güneş ${deg}° ${e.ut} USNO farkı ${d.toFixed(0)} s (izin ${(e.uncertaintySec + 60).toFixed(0)} s)`);
      assert.ok(d <= e.uncertaintySec + 60, `${deg}: ${d}`);
    }
    // 0°/360° kenarı: Ay 359,95° ile 0° arka arkaya, doğru sırada; ikisi de direkt.
    const m = findDegreeCrossings("moon", [0, 359.95], Date.UTC(2026, 0, 1), Date.UTC(2026, 3, 1));
    assert.ok(m.ok);
    for (let i = 0; i < m.events.length; i += 2) {
      assert.equal(m.events[i].degree, 359.95);
      assert.equal(m.events[i + 1].degree, 0);
      const gapMin = (m.events[i + 1].ms - m.events[i].ms) / 60_000;
      assert.ok(gapMin > 3 && gapMin < 8, `aralık ${gapMin} dk`);
    }
    assert.ok(m.events.every((e) => e.direction === "direct" && e.passCount === 1));
  });

  // ─── D5. Aralık sınırı ve parçalama ───────────────────────────────────────────────────────────────────
  await t("D5 [t0, t1) yarı açık: kenar dahil/haric; aralık nereden bölünürse bölünsün birleşim aynı", () => {
    const full = findDegreeCrossings("moon", degreesInEverySign(29), Date.UTC(2026, 0, 1), Date.UTC(2026, 6, 1));
    assert.ok(full.ok);
    const e = full.events[10];
    const cnt = (a: number, b: number) => {
      const r = findDegreeCrossings("moon", [e.degree], a, b);
      assert.ok(r.ok);
      return r.events.filter((x) => Math.abs(x.ms - e.ms) < 1000).length;
    };
    assert.equal(cnt(e.ms - 3_600_000, e.ms + 3_600_000), 1);
    assert.equal(cnt(e.ms + 1000, e.ms + 3_600_000), 0);
    assert.equal(cnt(e.ms - 3_600_000, e.ms - 1000), 0);
    for (const cut of [Date.UTC(2026, 1, 13, 7, 17), Date.UTC(2026, 3, 2, 23, 59, 59), e.ms + 7]) {
      const a = findDegreeCrossings("moon", degreesInEverySign(29), Date.UTC(2026, 0, 1), cut);
      const b = findDegreeCrossings("moon", degreesInEverySign(29), cut, Date.UTC(2026, 6, 1));
      assert.ok(a.ok && b.ok);
      const joined: string[] = [...a.events, ...b.events].map((x) => `${x.degree}@${Math.round(x.ms / 1000)}`);
      const whole: string[] = full.events.map((x) => `${x.degree}@${Math.round(x.ms / 1000)}`);
      assert.equal(joined.length, whole.length, `kesim ${new Date(cut).toISOString()}`);
      // ±1 s: kesim, ikiye bölme aralığını değiştirir (≤ 100 ms çözünürlük).
      joined.forEach((k, i) => assert.ok(Math.abs(+k.split("@")[1] - +whole[i].split("@")[1]) <= 1 && k.split("@")[0] === whole[i].split("@")[0]));
    }
  });

  // ─── D6. Alanlar ───────────────────────────────────────────────────────────────────────────────────
  await t("D6 degreesInEverySign, burç/burç-içi derece, tekrarlanan derece tekilleşir, zaman UTC ('Z')", () => {
    assert.deepEqual(degreesInEverySign(29).slice(0, 3), [29, 59, 89]);
    assert.equal(degreesInEverySign(29)[11], 359);
    const r = findDegreeCrossings("sun", [45.5, 45.5, 359.5], Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));
    assert.ok(r.ok);
    assert.equal(r.events.length, 2);
    assert.deepEqual(r.events.map((e) => [e.sign, e.degreeInSign]), [[11, 29.5], [1, 15.5]]);
    assert.ok(r.events.every((e) => e.ut.endsWith("Z") && e.speedDegPerDay > 0.9));
    const node = findDegreeCrossings("mean_node", [0], Date.UTC(1920, 0, 1), Date.UTC(1930, 0, 1));
    assert.ok(node.ok && node.events.every((e) => e.direction === "retrograde"));
  });

  await t("D7 statik bağımsızlık: motor fixture / Swiss / ağ kullanmaz; #645 dosyalarını yalnız içe aktarır", () => {
    const src = readFileSync(join(process.cwd(), "lib/astrology/pro/degrees/crossings.ts"), "utf8");
    assert.ok(!/fixtures|swisseph|skyfield|fetch\(|process\.env/.test(src.replace(/^\s*\/\/.*$/gm, "")));
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(imports.sort(), ["../ephemeris/accuracy", "../ephemeris/events", "../ephemeris/local", "../ephemeris/types"]);
  });

  await t("D8 #647 bağımlılık hatası ölçümü: FromTerrestrialTime yakınsamayan anlar (sınırlı kopya; gerçek fonksiyon çağrılmaz)", () => {
    // astronomy-engine 2.1.19 döngüsünün 60 adımla sınırlı birebir kopyası — gerçek fonksiyon bu anlarda DÖNMEZ (harness takılırdı).
    const J2000 = Date.UTC(2000, 0, 1, 12);
    const hangs = (ms: number) => {
      const tt = (ttOf(ms) - J2000) / DAY;
      let time = new Astronomy.AstroTime(tt);
      for (let i = 0; i < 60; i++) {
        const err = tt - time.tt;
        if (Math.abs(err) < 1e-12) return false;
        time = time.AddDays(err);
      }
      return true;
    };
    const c = Date.UTC(1955, 1, 22, 12);
    let n = 0;
    let tot = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let ms = c - 120_000; ms < c + 120_000; ms += 13) {
      tot++;
      if (!hangs(ms)) continue;
      n++;
      lo = Math.min(lo, ms);
      hi = Math.max(hi, ms);
    }
    olcu(`1955-02-22 12:00 UTC ±120 s: yakınsamayan ${n}/${tot} an${n ? ` (${new Date(lo).toISOString()} … ${new Date(hi).toISOString()})` : ""}; 12:00:00.000 → ${hangs(c) ? "TAKILIR" : "yakınsar"}`);
    olcu("ürün düzeltmesi #647 ephemerisTime'da (sınırlı yineleme önerisi QA 07); bu PR'da değiştirilmedi");
    // Tehlike yalnız TT/UT'nin 2^14 gün sınırını ayırdığı ≈ ΔT genişliğindeki pencerede olmalı (ölçüm: 11:59:29,5 – 12:00:00,6).
    if (n) assert.ok(lo >= c - 32_000 && hi <= c + 1_000, "beklenmeyen pencere");
  });

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
void main();
