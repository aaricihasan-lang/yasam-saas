/**
 * GÖKYÜZÜ ATLASI — ORTAK ZAMAN KATMANI (lib/astrology/pro/time) testleri. Ağ / Roxy çağrısı / Python GEREKMEZ (CI'da çalışır).
 * Bağımsız referans: scripts/astrology/fixtures/pro-time/reference.json — skyfield 1.55 + JPL DE440, USNO tai-utc.dat, IERS
 * Leap_Second.dat; üreteç QA kanıt klasöründe (kanit/zaman/araclar/fixture_uret.py). Roxy satırları gece operasyonunun KAYITLI
 * yanıtlarıdır (yeni çağrı yok). Her ölçüm satırı "ÖLÇÜ" ile yazılır.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-time.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as Astronomy from "astronomy-engine";
import { lonAt as lillyLonAt } from "@/lib/astrology/horary/western/timeline";
import {
  DELTA_T_TABLE_LENGTH,
  DRIFT_1961_1971,
  LEAP_SECONDS,
  LEAP_TABLE_VALID_UNTIL_MS,
  TT_MINUS_TAI_SECONDS,
  deltaTModelSeconds,
  ephemerisTime,
  gastDegrees,
  isTimeScalesError,
  parseUtcIso,
  ramcDegrees,
  scalesFromUtc,
  taiMinusUtc,
  trueObliquityDeg,
  type TimeScales,
} from "@/lib/astrology/pro/time";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).stack ?? String(e)}\n`);
  }
}
const olcu = (s: string) => console.log(`  ÖLÇÜ ${s}`);
const REF = JSON.parse(readFileSync(join(process.cwd(), "scripts/astrology/fixtures/pro-time/reference.json"), "utf8")) as {
  leapJd: [number, number][];
  years: { utc: string; utcMs: number; basis: string; ttJd: number; deltaTSkyfieldAtUt1: number; lon: Record<string, number> }[];
  deltaT: [number, number][];
  dut1: { utcMs: number; dut1: number; deltaT: number; ttMinusUtc: number }[];
  ut1MinusUtc1961_1971: [string, number, number][];
  gast: { ut1Jd: number; ttJd: number; gastDeg: number }[];
  roxyHouses: { id: string; utcMs: number; lat: number; lon: number; mc: number; asc: number; dut1Skyfield: number | null }[];
};
const msOfJd = (jd: number) => (jd - 2440587.5) * 86_400_000;
const ok = (x: ReturnType<typeof scalesFromUtc>): TimeScales => {
  if (isTimeScalesError(x)) throw new Error(`beklenmeyen hata: ${x.error} ${x.detail}`);
  return x;
};
const arcsec = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) * 3600;
const R = Math.PI / 180;
const ramcFromMc = (mc: number, eps: number) => ((Math.atan2(Math.sin(mc * R) * Math.cos(eps * R), Math.cos(mc * R)) / R) % 360 + 360) % 360;
const AE: Record<string, Astronomy.Body> = {
  sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn, neptune: Astronomy.Body.Neptune,
};
const lonEph = (b: string, s: TimeScales) => Astronomy.Ecliptic(Astronomy.GeoVector(AE[b], ephemerisTime(s), true)).elon;
const lonLegacy = (b: string, utcMs: number) => Astronomy.Ecliptic(Astronomy.GeoVector(AE[b], Astronomy.MakeTime(new Date(utcMs)), true)).elon;

// Lilly (üretim) çıktısının başlangıç değerleri — pro katmanı HİÇ kullanılmadan önce (Z20 bağımsızlık testi).
const LILLY_PROBE = [Date.UTC(1950, 5, 1, 12), Date.UTC(2017, 0, 1), Date.UTC(2026, 9, 31, 7, 30), Date.UTC(2099, 11, 31)];
const LILLY_BODIES = ["sun", "moon", "mercury", "saturn"] as const;
const LILLY_BEFORE = LILLY_PROBE.flatMap((ms) => LILLY_BODIES.map((b) => lillyLonAt(b, ms)));
// Global ΔT'nin başlangıç değeri (izolasyon testi için): 2026-01-01 varsayılan Espenak–Meeus.
const EM_2026 = (() => { const x = Astronomy.MakeTime(new Date(Date.UTC(2026, 0, 1))); return (x.tt - x.ut) * 86400; })();

t("Z01 ölçek özdeşliği: TT − UTC = 32,184 + (TAI − UTC) — 1972, 2000, 2017, 2026 (IERS tablosu)", () => {
  for (const [iso, tai] of [["1972-06-01T00:00:00Z", 10], ["2000-01-01T12:00:00Z", 32], ["2017-01-01T00:00:00Z", 37], ["2026-10-31T00:00:00Z", 37]] as const) {
    const s = ok(scalesFromUtc(parseUtcIso(iso) as number));
    assert.equal(s.basis, "utc_leap_table");
    assert.equal(s.taiMinusUtcSeconds, tai);
    assert.ok(Math.abs((s.ttMs - s.utcMs) / 1000 - (TT_MINUS_TAI_SECONDS + tai)) < 1e-9);
    // ΔT = (TT − UTC) − DUT1
    const s2 = ok(scalesFromUtc(s.utcMs, { dut1Seconds: 0.25 }));
    assert.ok(Math.abs(s2.deltaTSeconds - (TT_MINUS_TAI_SECONDS + tai - 0.25)) < 1e-9);
  }
});

t("Z02 artık saniye tablosu = skyfield 1.55 yerleşik tablosu (27 adım + 1972 tabanı) ve IERS Bülten C 72 (2017 → 37 s)", () => {
  assert.equal(LEAP_SECONDS.length, 28);
  assert.equal(REF.leapJd.length, 27);
  for (const [jd, off] of REF.leapJd) {
    const row = LEAP_SECONDS.find(([ms]) => Math.abs(ms - msOfJd(jd)) < 1);
    assert.ok(row, `adım eksik: JD ${jd}`);
    assert.equal(row![1], off);
  }
  assert.equal(taiMinusUtc(LEAP_TABLE_VALID_UNTIL_MS - 1)!.seconds, 37);
  assert.equal(taiMinusUtc(LEAP_TABLE_VALID_UNTIL_MS), null);
});

t("Z03 1961–1971 USNO formülü: elle hesaplanan değerler ve 1972 sıçraması", () => {
  // 1968-02-01: 4,21317 + (39887 − 39126) × 0,002592 = 6,185682 s
  assert.ok(Math.abs(taiMinusUtc(Date.UTC(1968, 1, 1))!.seconds - 6.185682) < 1e-9);
  // 1961-01-01: 1,422818 + (37300 − 37300) × … = 1,422818
  assert.ok(Math.abs(taiMinusUtc(Date.UTC(1961, 0, 1))!.seconds - 1.422818) < 1e-9);
  const before = taiMinusUtc(Date.UTC(1972, 0, 1) - 1)!.seconds;
  const after = taiMinusUtc(Date.UTC(1972, 0, 1))!.seconds;
  olcu(`1971-12-31T23:59:59.999 TAI−UTC ${before.toFixed(6)} s → 1972-01-01 ${after} s (sıçrama ${(after - before).toFixed(6)} s; USNO tablosuyla tutarlı)`);
  assert.ok(Math.abs(after - before - 0.107758) < 1e-5);
  assert.equal(DRIFT_1961_1971.length, 13);
  assert.equal(taiMinusUtc(Date.UTC(1960, 11, 31)), null);
});

t("Z04 ΔT model tablosu ↔ skyfield (341 an, 1600–2600): fark ölçülür ve dönemine göre sınırlanır", () => {
  assert.equal(DELTA_T_TABLE_LENGTH, 1001);
  let maxObs = 0;
  let maxAll = 0;
  for (const [jd, ref] of REF.deltaT) {
    const ms = msOfJd(jd);
    const v = deltaTModelSeconds(ms);
    assert.ok(v !== null);
    const d = Math.abs(v! - ref);
    const y = new Date(ms).getUTCFullYear();
    if (y >= 1800 && y <= 2025) maxObs = Math.max(maxObs, d);
    maxAll = Math.max(maxAll, d);
  }
  olcu(`ΔT tablo − skyfield: 1800–2025 maks ${maxObs.toFixed(3)} s · 1600–2600 maks ${maxAll.toFixed(3)} s (yıllık doğrusal ara değer)`);
  assert.ok(maxObs <= 0.15, `gözlem dönemi farkı ${maxObs}`);
  assert.ok(maxAll <= 0.5, `tüm aralık farkı ${maxAll}`);
});

t("Z05 1973–2026 (200 an): artık saniye + skyfield DUT1 → ΔT ve TT−UTC skyfield ile birebir", () => {
  let mxD = 0;
  let mxT = 0;
  for (const r of REF.dut1) {
    const s = ok(scalesFromUtc(r.utcMs, { dut1Seconds: r.dut1 }));
    mxD = Math.max(mxD, Math.abs(s.deltaTSeconds - r.deltaT));
    mxT = Math.max(mxT, Math.abs((s.ttMs - s.utcMs) / 1000 - r.ttMinusUtc));
    assert.deepEqual(s.assumptions, []);
  }
  olcu(`ΔT fark maks ${mxD.toExponential(2)} s · TT−UTC fark maks ${mxT.toExponential(2)} s`);
  assert.ok(mxD < 1e-4 && mxT < 1e-4);
});

t("Z06 1961 öncesi: OTOMATİK UT1 kabulü YOK — politika zorunlu; 'reject' reddeder; 'civil_as_ut' açıkça işaretler", () => {
  const ms = Date.UTC(1950, 5, 1, 12);
  const a = scalesFromUtc(ms);
  assert.ok(isTimeScalesError(a) && a.error === "pre1961_policy_required");
  const b = scalesFromUtc(ms, { pre1961: "reject" });
  assert.ok(isTimeScalesError(b) && b.error === "pre1961_rejected");
  const c = ok(scalesFromUtc(ms, { pre1961: "civil_as_ut" }));
  assert.equal(c.basis, "pre1961_civil_ut");
  assert.ok(c.assumptions.includes("pre1961_civil_time_as_ut"));
  assert.equal(c.ut1UncertaintySeconds, null);
  assert.equal(c.deltaTSource, "model_table");
  const d = ok(scalesFromUtc(Date.UTC(1700, 0, 1), { pre1961: "civil_as_ut" }));
  assert.ok(d.assumptions.includes("historical_delta_t_model"));
  assert.ok(isTimeScalesError(scalesFromUtc(ms, { pre1961: "civil_as_ut", dut1Seconds: 0.1 })));
});

t("Z07 1961–1971: TT USNO formülünden; UT1 = UTC + 0 VARSAYIMI işaretli; belirsizlik 1961–1971 UT1−UTC ölçüsünden", () => {
  const s = ok(scalesFromUtc(Date.UTC(1966, 6, 1)));
  assert.equal(s.basis, "utc_drift_1961_1971");
  assert.ok(s.assumptions.includes("dut1_assumed_zero"));
  const maxDerived = Math.max(...REF.ut1MinusUtc1961_1971.map((x) => Math.abs(x[2])));
  olcu(`1961–1971 UT1−UTC (Morrison+ ΔT'den türetilmiş) maks ${maxDerived.toFixed(3)} s; katman sınırı ${s.ut1UncertaintySeconds} s`);
  assert.ok(s.ut1UncertaintySeconds !== null && s.ut1UncertaintySeconds >= maxDerived);
});

t("Z08 2027-06-28 sonrası: öngörü yolu işaretli; sınırda TT sıçraması < 0,5 s", () => {
  const s = ok(scalesFromUtc(Date.UTC(2050, 0, 1)));
  assert.equal(s.basis, "beyond_leap_table");
  assert.ok(s.assumptions.includes("future_leap_seconds_unknown") && s.assumptions.includes("future_delta_t_predicted"));
  assert.equal(s.deltaTClass, "predicted");
  const a = ok(scalesFromUtc(LEAP_TABLE_VALID_UNTIL_MS - 1));
  const b = ok(scalesFromUtc(LEAP_TABLE_VALID_UNTIL_MS));
  const jump = (b.ttMs - a.ttMs - 1) / 1000;
  olcu(`2027-06-28 sınırında TT sıçraması ${jump.toFixed(3)} s`);
  assert.ok(Math.abs(jump) < 0.5);
});

t("Z09 artık saniye anı: '23:59:60' reddedilir; 2016-12-31T23:59:59 → 2017-01-01T00:00:00 arasında TT 2 s ilerler", () => {
  const e = parseUtcIso("2016-12-31T23:59:60Z");
  assert.ok(typeof e !== "number" && e.error === "invalid_input");
  const a = ok(scalesFromUtc(parseUtcIso("2016-12-31T23:59:59Z") as number));
  const b = ok(scalesFromUtc(parseUtcIso("2017-01-01T00:00:00Z") as number));
  assert.equal(b.ttMs - a.ttMs, 2000);
  assert.ok(typeof parseUtcIso("2023-02-29T00:00:00Z") !== "number");
});

t("Z10 DUT1 doğrulaması: |DUT1| > 0,9 s ve NaN reddedilir; aralık 1599–2601 (tablo + 1 yıl tampon), dışı (1598, 2602) reddedilir", () => {
  assert.ok(isTimeScalesError(scalesFromUtc(Date.UTC(2000, 0, 1), { dut1Seconds: 0.95 })));
  assert.ok(isTimeScalesError(scalesFromUtc(Date.UTC(2000, 0, 1), { dut1Seconds: Number.NaN })));
  assert.ok(isTimeScalesError(scalesFromUtc(Date.UTC(1598, 11, 31), { pre1961: "civil_as_ut" })));
  assert.ok(isTimeScalesError(scalesFromUtc(Date.UTC(2602, 0, 1))));
  assert.ok(!isTimeScalesError(scalesFromUtc(Date.UTC(1599, 11, 31, 23), { pre1961: "civil_as_ut" })));
  assert.ok(!isTimeScalesError(scalesFromUtc(Date.UTC(2601, 0, 1, 1))));
});

t("Z11 politika TT'si = bağımsız referansın TT'si (8 yıl × 4 an): fark ≤ 1 ms (1850 ve 1900 için tablo ara değeri ≤ 0,15 s)", () => {
  for (const r of REF.years) {
    const s = ok(scalesFromUtc(r.utcMs, { pre1961: "civil_as_ut" }));
    assert.equal(s.basis, r.basis, r.utc);
    const d = Math.abs(s.ttMs - msOfJd(r.ttJd)) / 1000;
    const lim = s.deltaTSource === "model_table" ? 0.15 : 0.001;
    assert.ok(d <= lim, `${r.utc} TT farkı ${d} s`);
  }
});

// B5 (AŞAMA 4): Z12 ve Z13 artık ÖLÇÜ değil, kaynaklı kesin beklentilerle BAŞARISIZ olabilen testlerdir.
const MODEL_ERR = JSON.parse(readFileSync(join(process.cwd(), "scripts/astrology/fixtures/pro-time/model-error.json"), "utf8")) as {
  marginArcsec: number;
  bodyCeilingArcsec: Record<string, number | string>;
  rows: { utc: string; err: Record<string, number> }[];
};

t("Z12 MODEL hatası (zaman ölçeği elendi): aynı TT'de astronomy-engine ↔ DE440, 8 gövde × 32 an — kayıtlı hata + 0,3″ ve gövde tavanı (3.000 örnek × 1,5)", () => {
  assert.equal(MODEL_ERR.rows.length, REF.years.length);
  const per: Record<string, number> = {};
  const over: string[] = [];
  for (const [i, r] of REF.years.entries()) {
    const rec = MODEL_ERR.rows[i];
    assert.equal(rec.utc, r.utc, "fixture sırası");
    const tt = { ttMs: msOfJd(r.ttJd) } as TimeScales;
    for (const b of Object.keys(AE)) {
      const e = arcsec(lonEph(b, tt), r.lon[b]);
      per[b] = Math.max(per[b] ?? 0, e);
      const ceil = Math.min(rec.err[b] + MODEL_ERR.marginArcsec, Number(MODEL_ERR.bodyCeilingArcsec[b]));
      if (!(e <= ceil)) over.push(`${r.utc} ${b}: ${e.toFixed(3)}″ > tavan ${ceil.toFixed(3)}″ (kayıt ${rec.err[b]}″)`);
    }
  }
  olcu(`model hatası maks (″): ${Object.entries(per).map(([b, v]) => `${b} ${v.toFixed(2)}`).join(" · ")}`);
  assert.deepEqual(over, [], over.slice(0, 8).join(" | "));
});

t("Z13 ZAMAN DÖNÜŞÜMÜ (kaynaklı kesin beklenti) + ÖNCE/SONRA: TT−UTC IERS'ten tam; TT−UT1 skyfield ΔT ±0,1 s; eski yol = Espenak–Meeus; konum zinciri DE440 tavanında", () => {
  const J2000 = Date.UTC(2000, 0, 1, 12);
  // IERS Leap_Second.dat: TAI−UTC 1972-01-01 = 10 s, 2000 = 32 s, 2017 → = 37 s; TT − UTC = TAI − UTC + 32,184 s (SOFA).
  const IERS_TT_MINUS_UTC: Record<string, number> = { "1972": 42.184, "2000": 64.184, "2026": 69.184 };
  const lines: string[] = [];
  for (const [i, r] of REF.years.entries()) {
    const y = r.utc.slice(0, 4);
    const s = ok(scalesFromUtc(r.utcMs, { pre1961: "civil_as_ut" }));
    const ttMinusUtc = (s.ttMs - r.utcMs) / 1000;
    if (y in IERS_TT_MINUS_UTC && r.utc.includes("-01-01T")) {
      assert.ok(Math.abs(ttMinusUtc - IERS_TT_MINUS_UTC[y]) < 1e-6, `${r.utc} TT−UTC ${ttMinusUtc} ≠ IERS ${IERS_TT_MINUS_UTC[y]}`);
    }
    if (s.deltaTSource === "model_table") {
      // ΔT tablosu ↔ skyfield farkı Z04'te en çok 0,074 s ölçüldü → 0,1 s.
      const dT = (s.ttMs - s.ut1Ms) / 1000;
      assert.ok(Math.abs(dT - r.deltaTSkyfieldAtUt1) <= 0.1, `${r.utc} ΔT ${dT.toFixed(3)} s ↔ skyfield ${r.deltaTSkyfieldAtUt1.toFixed(3)} s`);
    }
    // Politikanın TT'si bağımsız referansın TT'si (fixture ttJd: skyfield/IERS/USNO ile ayrı üretildi).
    const dRefTT = Math.abs(s.ttMs - msOfJd(r.ttJd)) / 1000;
    assert.ok(dRefTT <= (s.deltaTSource === "model_table" ? 0.1 : 0.001), `${r.utc} TT ↔ referans ${dRefTT.toFixed(4)} s`);
    // ESKİ yol: MakeTime(UTC) = UT + global Espenak–Meeus ΔT (astronomy-engine `DeltaT_EspenakMeeus`) — "önce" sayılarının tanımı.
    const old = Astronomy.MakeTime(new Date(r.utcMs));
    assert.ok(Math.abs((old.tt - old.ut) * 86400 - Astronomy.DeltaT_EspenakMeeus(old.ut)) < 1e-6, "eski yol Espenak–Meeus değil");
    // KONUM ZİNCİRİ (UTC → ölçekler → ephemerisTime → konum) DE440'a karşı Z12 ile AYNI tavanı aşmamalı (Ay: 0,55″/s duyarlı).
    const rec = MODEL_ERR.rows[i];
    for (const b of ["moon", "sun", "mercury"] as const) {
      const e = arcsec(lonEph(b, s), r.lon[b]);
      const ceil = Math.min(rec.err[b] + MODEL_ERR.marginArcsec, Number(MODEL_ERR.bodyCeilingArcsec[b]));
      assert.ok(e <= ceil, `${r.utc} ${b} zincir hatası ${e.toFixed(3)}″ > tavan ${ceil.toFixed(3)}″`);
    }
    if (r.utc.includes("-01-01T")) {
      const dTT = (old.tt - (s.ttMs - J2000) / 86_400_000) * 86400;
      lines.push(`${y}: TT farkı (eski − yeni) ${dTT.toFixed(2)} s · Ay DE440 farkı eski ${arcsec(lonLegacy("moon", r.utcMs), r.lon.moon).toFixed(1)}″ → yeni ${arcsec(lonEph("moon", s), r.lon.moon).toFixed(1)}″`);
    }
  }
  for (const l of lines) olcu(l);
});

t("Z14 ephemerisTime: TT kesin; '.ut' gerçek UT1 değildir (belgelenmiş tuzak ölçülür); ışık zamanı tutarlılığı", () => {
  const s = ok(scalesFromUtc(Date.UTC(2026, 0, 1)));
  const e = ephemerisTime(s);
  assert.ok(Math.abs(e.tt * 86_400_000 + Date.UTC(2000, 0, 1, 12) - s.ttMs) < 0.01);
  const utErr = (e.ut * 86_400_000 + Date.UTC(2000, 0, 1, 12) - s.ut1Ms) / 1000;
  olcu(`ephemerisTime(2026).ut − UT1 = ${utErr.toFixed(2)} s (bu yüzden Dünya dönüşünde KULLANILMAZ)`);
  // "ut düzelt + tt ez" yaklaşımının ışık zamanı hatası (yalnız kanıt): Merkür
  const naive = new Astronomy.AstroTime((s.ut1Ms - Date.UTC(2000, 0, 1, 12)) / 86_400_000);
  naive.tt = e.tt;
  const dNaive = arcsec(Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Mercury, naive, true)).elon, Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Mercury, e, true)).elon);
  olcu(`'ut düzelt + tt ez' yolunun Merkür ışık-zamanı farkı ${dNaive.toFixed(3)}″ (sıfır olmadığı için kullanılmadı)`);
  assert.ok(dNaive > 0);
});

t("Z15 GAST: skyfield (UT1) ile ≤ 0,25″ (120 an, 1800–2100); kütüphane SiderealTime ile aynı formül; önbellek bağışıklığı", () => {
  let mx = 0;
  for (const g of REF.gast) {
    const s = { ut1Ms: msOfJd(g.ut1Jd), ttMs: msOfJd(g.ttJd) } as TimeScales;
    mx = Math.max(mx, arcsec(gastDegrees(s), g.gastDeg));
  }
  olcu(`GAST ↔ skyfield maks ${mx.toFixed(3)}″ (IAU 2000B ↔ 2000A + presesyon modeli farkı)`);
  assert.ok(mx <= 0.25);
  // Formül eşliği: global ΔT ile kurulmuş nesnede kütüphane SiderealTime ile birebir.
  const tm = Astronomy.MakeTime(new Date(Date.UTC(2011, 4, 5, 6, 7, 8)));
  const s = { ut1Ms: tm.ut * 86_400_000 + Date.UTC(2000, 0, 1, 12), ttMs: tm.tt * 86_400_000 + Date.UTC(2000, 0, 1, 12) } as TimeScales;
  assert.ok(arcsec(gastDegrees(s), Astronomy.SiderealTime(tm) * 15) < 1e-6);
  // Önbellek: aynı tt'li ama farklı ut'li nesneyle SiderealTime çağrılsa bile gastDegrees etkilenmez.
  const s2 = ok(scalesFromUtc(Date.UTC(2026, 0, 1)));
  const before = gastDegrees(s2);
  Astronomy.SiderealTime(ephemerisTime(s2));
  assert.equal(gastDegrees(s2), before);
});

t("Z16 Roxy dönem kuralı (220 KAYITLI yanıt, yeni çağrı yok): ortak katmanla RAMC ↔ Roxy MC'sinden türetilen RAMC", () => {
  const band: Record<string, number[]> = {};
  for (const c of REF.roxyHouses) {
    const y = new Date(c.utcMs).getUTCFullYear();
    // Sağlayıcı kuralının ölçülmüş modeli: 1973–2026 UTC + gerçek DUT1; 2027+ DUT1 = 0; 1972 öncesi UT.
    const opts = c.dut1Skyfield !== null && y <= 2025 ? { dut1Seconds: c.dut1Skyfield } : { pre1961: "civil_as_ut" as const };
    const s = ok(scalesFromUtc(c.utcMs, opts));
    // 1961–1971: sağlayıcı UT1 kabul ediyor (ölçüldü) → karşılaştırma ekseni UT1 = verilen an.
    const s1 = s.basis === "utc_drift_1961_1971" ? { ...s, ut1Ms: c.utcMs } : s;
    const d = arcsec(ramcDegrees(s1, c.lon), ramcFromMc(c.mc, trueObliquityDeg(s1)));
    const k = y < 1961 ? "<1961" : y < 1972 ? "1961–1971" : y <= 2025 ? "1972–2025" : y <= 2030 ? "2026–2030" : ">2030";
    (band[k] ??= []).push(d);
  }
  for (const [k, v] of Object.entries(band)) olcu(`${k}: n=${v.length} maks ${Math.max(...v).toFixed(2)}″`);
  for (const v of Object.values(band)) assert.ok(Math.max(...v) <= 2.5);
});

t("Z17 GLOBAL İZOLASYON: katman kullanıldıktan sonra astronomy-engine varsayılan ΔT'si (Lilly'nin kullandığı) DEĞİŞMEDİ", () => {
  const x = Astronomy.MakeTime(new Date(Date.UTC(2026, 0, 1)));
  const now = (x.tt - x.ut) * 86400;
  olcu(`varsayılan ΔT(2026-01-01) başta ${EM_2026.toFixed(3)} s, sonda ${now.toFixed(3)} s`);
  assert.ok(Math.abs(now - EM_2026) < 1e-9);
  assert.ok(Math.abs(EM_2026 - 75.05) < 0.1, "Espenak–Meeus varsayılanı bekleniyordu");
});

t("Z18 STATİK: lib/astrology/pro/** içinde SetDeltaTFunction çağrısı YOK; zaman modülü üretim motorlarını import etmez", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".ts")) files.push(p);
    }
  };
  walk(join(process.cwd(), "lib/astrology/pro"));
  for (const f of files) {
    const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/SetDeltaTFunction\s*\(/.test(src), `${f} SetDeltaTFunction çağırıyor`);
  }
  for (const f of files.filter((x) => x.replace(/\\/g, "/").includes("/pro/time/"))) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/from\s+["'](\.\.\/)+(horary|providers|birth|engine)\//.test(src) && !/@\/lib\/astrology\/(horary|providers|birth|engine)\//.test(src), `${f} üretim motoru import ediyor`);
  }
});

t("Z19 STATİK BAĞIMSIZLIK: üretim kodu (app/, lib/, components/) lib/astrology/pro/** import ETMEZ — izinli: pro modülleri ve bayrakla kapalı izole efemeris yüzeyi", () => {
  const ALLOWED = [/^lib\/astrology\/pro\//, /^app\/(admin\/)?astroloji\/efemeris\//, /^app\/api\/(admin\/)?astroloji\/efemeris\//, /^app\/admin\/astroloji\/_components\/ephemeris\//];
  const IMPORTS_PRO = /(from|import)\s*\(?\s*["'](@\/lib\/astrology\/pro\/|(\.\.\/)+pro\/|\.\/pro\/)/;
  const offenders: string[] = [];
  const walk = (rel: string) => {
    for (const f of readdirSync(join(process.cwd(), rel))) {
      if (f === "node_modules" || f.startsWith(".")) continue;
      const r = `${rel}/${f}`;
      if (statSync(join(process.cwd(), r)).isDirectory()) walk(r);
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(f) && !ALLOWED.some((x) => x.test(r)) && IMPORTS_PRO.test(readFileSync(join(process.cwd(), r), "utf8"))) offenders.push(r);
    }
  };
  for (const d of ["app", "lib", "components"]) {
    try {
      statSync(join(process.cwd(), d));
    } catch {
      continue;
    }
    walk(d);
  }
  assert.deepEqual(offenders, [], `pro katmanını import eden üretim dosyaları: ${offenders.join(", ")}`);
});

t("Z20 ÇALIŞMA ZAMANI BAĞIMSIZLIĞI: pro katmanı yoğun kullanıldıktan sonra Lilly `lonAt` (üretim) çıktısı bit düzeyinde AYNI", () => {
  for (let i = 0; i < 2000; i++) {
    const s = ok(scalesFromUtc(Date.UTC(1990, 0, 1) + i * 37_000_000, { pre1961: "civil_as_ut" }));
    Astronomy.GeoVector(Astronomy.Body.Mars, ephemerisTime(s), true);
    Astronomy.SiderealTime(ephemerisTime(s));
    gastDegrees(s);
  }
  // Önbelleği atlamak için ±1 ms komşu anlar önce hesaplanır; ardından aynı anlar yeniden istenir (Lilly önbelleği anahtarı ms).
  for (const ms of LILLY_PROBE) for (const b of LILLY_BODIES) lillyLonAt(b, ms + 1);
  const fresh = LILLY_PROBE.flatMap((ms) => LILLY_BODIES.map((b) => Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[b === "sun" ? "Sun" : b === "moon" ? "Moon" : b === "mercury" ? "Mercury" : "Saturn"], Astronomy.MakeTime(new Date(ms)), true)).elon));
  assert.deepEqual(fresh, LILLY_BEFORE, "Lilly'nin kullandığı varsayılan yol (MakeTime + global ΔT) değişti");
});

// ─── ephemerisTime kayan nokta sınırı (astronomy-engine 2.1.19 FromTerrestrialTime sonsuz döngüsü) ──────────────────────────────
// ÖNCEDEN TANIMLI ölçütler: (a) her an DÖNER; (b) |e.tt − TT| ≤ 4e-12 gün (iki kayan nokta adımı ≈ 0,35 µs); (c) kütüphanenin
// yakınsadığı her anda sonuç BİT DÜZEYİNDE aynı; (d) DE440: TT farkı 1961 öncesi ≤ 20 ms, 1972–2027-06 ≤ 1 ms (Z11); aynı TT'de konum
// Güneş ≤ 4″, Ay ≤ 9″, Merkür ≤ 25″ (Z12 gövde tavanları); GAST ≤ 0,25″ (Z15).
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const FP_CENTER_1955 = J2000_MS - 2 ** 14 * 86_400_000; // 1955-02-22T12:00:00Z
/** Kütüphane döngüsünün 60 adımla SINIRLI birebir kopyası — yalnız "kütüphane burada takılır mıydı?" sorusu için. */
const libraryWouldHang = (ttDays: number) => {
  let time = new Astronomy.AstroTime(ttDays);
  for (let i = 0; i < 60; i++) {
    const err = ttDays - time.tt;
    if (Math.abs(err) < 1e-12) return false;
    time = time.AddDays(err);
  }
  return true;
};
const ttDaysAt = (ms: number) => (ok(scalesFromUtc(ms, { pre1961: "civil_as_ut" })).ttMs - J2000_MS) / 86_400_000;
const FP_ERR_MAX_DAYS = 4e-12;

t("Z21 REGRESYON 1955-02-22 11:59:29,000 – 12:00:01,000 UTC (her 1 ms, 32.001 an): ephemerisTime döner, |tt hatası| ≤ 4e-12 gün; kütüphane bu pencerede takılırdı", () => {
  let hangs = 0;
  let worst = 0;
  const t0 = Date.now();
  for (let ms = FP_CENTER_1955 - 31_000; ms <= FP_CENTER_1955 + 1_000; ms++) {
    const s = ok(scalesFromUtc(ms, { pre1961: "civil_as_ut" }));
    const tt = (s.ttMs - J2000_MS) / 86_400_000;
    if (libraryWouldHang(tt)) hangs++;
    const e = ephemerisTime(s);
    worst = Math.max(worst, Math.abs(e.tt - tt));
  }
  const dur = Date.now() - t0;
  olcu(`32.001 an: kütüphanenin takılacağı ${hangs} an; ephemerisTime en büyük |tt hatası| ${worst.toExponential(2)} gün (${(worst * 86_400e6).toFixed(3)} µs); süre ${dur} ms`);
  olcu(`12:00:00.000 kütüphane: ${libraryWouldHang(ttDaysAt(FP_CENTER_1955)) ? "TAKILIRDI" : "yakınsardı"}; yeni yol döndü`);
  assert.ok(hangs > 1000, `pencere hatayı kapsamıyor (${hangs})`);
  assert.ok(worst <= FP_ERR_MAX_DAYS, `tt hatası ${worst}`);
});

t("Z22 BİT DÜZEYİNDE AYNI: kütüphanenin yakınsadığı anlarda ephemerisTime = FromTerrestrialTime (20.000 an 1920–2150 + 1955 penceresi)", () => {
  let n = 0;
  const check = (ms: number) => {
    const s = ok(scalesFromUtc(ms, { pre1961: "civil_as_ut" }));
    const tt = (s.ttMs - J2000_MS) / 86_400_000;
    if (libraryWouldHang(tt)) return;
    const lib = Astronomy.AstroTime.FromTerrestrialTime(tt);
    const mine = ephemerisTime(s);
    assert.ok(Object.is(lib.ut, mine.ut) && Object.is(lib.tt, mine.tt), `${new Date(ms).toISOString()} ut ${lib.ut}/${mine.ut} tt ${lib.tt}/${mine.tt}`);
    n++;
  };
  const a = Date.UTC(1920, 0, 1);
  const span = Date.UTC(2151, 0, 1) - a;
  // Deterministik yarı-rastgele (altın oran dizisi) → ms çözünürlüğünde dağınık anlar.
  for (let i = 0; i < 20_000; i++) check(a + Math.floor(((i * 0.6180339887498949) % 1) * span));
  for (let ms = FP_CENTER_1955 - 31_000; ms <= FP_CENTER_1955 + 1_000; ms += 7) check(ms);
  olcu(`bit düzeyinde aynı: ${n} an`);
  assert.ok(n > 22_000);
});

t("Z23 1920–2150 TÜM 2^k gün sınırları (k = 0…15, ±; 31 sınır × ±120 s, 7 ms adım): ephemerisTime her anda döner, |tt hatası| ≤ 4e-12 gün", () => {
  const lines: string[] = [];
  let total = 0;
  for (let k = 0; k <= 15; k++) {
    for (const sg of [-1, 1]) {
      const c = J2000_MS + sg * 2 ** k * 86_400_000;
      if (c < Date.UTC(1920, 0, 1) || c >= Date.UTC(2151, 0, 1)) continue;
      let hangs = 0;
      let worst = 0;
      for (let ms = c - 120_000; ms <= c + 120_000; ms += 7) {
        const s = ok(scalesFromUtc(ms, { pre1961: "civil_as_ut" }));
        const tt = (s.ttMs - J2000_MS) / 86_400_000;
        if (libraryWouldHang(tt)) hangs++;
        worst = Math.max(worst, Math.abs(ephemerisTime(s).tt - tt));
        total++;
      }
      assert.ok(worst <= FP_ERR_MAX_DAYS, `2^${k}${sg > 0 ? "+" : "−"} hata ${worst}`);
      if (hangs || k >= 13) lines.push(`2^${k}${sg > 0 ? "+" : "−"} ${new Date(c).toISOString().slice(0, 10)}: kütüphane takılırdı ${hangs}; en büyük |tt hatası| ${worst.toExponential(1)} gün`);
    }
  }
  for (const l of lines) olcu(l);
  olcu(`toplam ${total} an`);
});

const FP_REF = JSON.parse(readFileSync(join(process.cwd(), "scripts/astrology/fixtures/pro-time/fp-boundaries-2026-11-01.json"), "utf8")) as {
  rows: { utcMs: number; ttJd: number; gastDeg: number; lon: Record<"sun" | "moon" | "mercury", number> }[];
};

t("Z24 DE440 (skyfield) sınır anlarında: TT dönüşümü + aynı TT'de konum + GAST (160 an; 1955 penceresi 67, diğer sınırlar 93)", () => {
  const LIM = { sun: 4, moon: 9, mercury: 25 } as const;
  const worst = { ttPre: 0, ttUtc: 0, sun: 0, moon: 0, mercury: 0, gast: 0 };
  let nTt = 0;
  for (const r of FP_REF.rows) {
    const refTtMs = msOfJd(r.ttJd);
    // (1) Dönüşüm: bizim TT ↔ skyfield TT (öngörü dönemi hariç; ΔT model farkı Z04/Z08'de ayrıca sınırlanır).
    if (r.utcMs < Date.UTC(2027, 5, 28)) {
      const s = ok(scalesFromUtc(r.utcMs, { pre1961: "civil_as_ut" }));
      const d = Math.abs(s.ttMs - refTtMs);
      if (r.utcMs < Date.UTC(1961, 0, 1)) {
        worst.ttPre = Math.max(worst.ttPre, d);
        assert.ok(d <= 20, `TT 1961 öncesi ${new Date(r.utcMs).toISOString()} ${d} ms`);
      } else {
        worst.ttUtc = Math.max(worst.ttUtc, d);
        assert.ok(d <= 1, `TT ${new Date(r.utcMs).toISOString()} ${d} ms`);
      }
      nTt++;
    }
    // (2) Konum: AYNI TT (skyfield) → ephemerisTime → astronomy-engine ↔ DE440.
    const e = ephemerisTime({ ttMs: refTtMs });
    for (const b of ["sun", "moon", "mercury"] as const) {
      const d = arcsec(Astronomy.Ecliptic(Astronomy.GeoVector(AE[b], e, true)).elon, r.lon[b]);
      worst[b] = Math.max(worst[b], d);
      assert.ok(d <= LIM[b], `${b} ${new Date(r.utcMs).toISOString()} ${d.toFixed(2)}″`);
    }
    // (3) GAST: yalnız 1961 öncesi satırlar (UT1 = an, iki tarafta da tanım aynı; sonrası DUT1 varsayımı farkı Z15'te).
    if (r.utcMs < Date.UTC(1961, 0, 1)) {
      const g = arcsec(gastDegrees({ ttMs: refTtMs, ut1Ms: r.utcMs }), r.gastDeg);
      worst.gast = Math.max(worst.gast, g);
      assert.ok(g <= 0.25, `GAST ${new Date(r.utcMs).toISOString()} ${g.toFixed(3)}″`);
    }
  }
  olcu(`TT farkı: 1961 öncesi en çok ${worst.ttPre.toFixed(3)} ms, 1972+ en çok ${worst.ttUtc.toFixed(3)} ms (${nTt} an)`);
  olcu(`aynı TT'de konum: Güneş ${worst.sun.toFixed(2)}″, Ay ${worst.moon.toFixed(2)}″, Merkür ${worst.mercury.toFixed(2)}″; GAST ${worst.gast.toFixed(3)}″`);
});

t("Z25 sessiz yanlış sonuç yok: TT sayı değilse (NaN/∞) ephemerisTime hata fırlatır (eski yol sonsuz döngüye girerdi)", () => {
  assert.throws(() => ephemerisTime({ ttMs: Number.NaN }), RangeError);
  assert.throws(() => ephemerisTime({ ttMs: Number.POSITIVE_INFINITY }), RangeError);
  // Takılma anında dönen nesne komşu anlarla sürekli: Ay boylamı 12:00:00.000 ± 1 ms farkı ≈ hız × 1 ms (< 0,01″).
  const at = (ms: number) => Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, ephemerisTime(ok(scalesFromUtc(ms, { pre1961: "civil_as_ut" }))), true)).elon;
  const d1 = arcsec(at(FP_CENTER_1955), at(FP_CENTER_1955 - 1));
  const d2 = arcsec(at(FP_CENTER_1955 + 1), at(FP_CENTER_1955));
  olcu(`Ay boylamı ±1 ms farkı: ${(d1 * 1000).toFixed(3)} / ${(d2 * 1000).toFixed(3)} mili-″`);
  assert.ok(d1 < 0.01 && d2 < 0.01);
});

console.log(`\nSONUÇ pro-time: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
