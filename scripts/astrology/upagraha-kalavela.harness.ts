/**
 * ATL-B01 (30.10.2026) — Kala, Mrityu, Ardhaprahara, Yamaghantaka: BPHS sırasıyla (yöneticisiz parça SONDA) yerel hesap.
 * Ağ / sağlayıcı çağrısı YOK. Fixture'lar (scripts/astrology/fixtures/kala-vela/, sentetik kişiler):
 *   • denetim-200.json — 30.10 büyük denetimin 200 haritası: servis teknik verisi + doğum gövdesi + denetimin BPHS referansı
 *     (NASA/JPL DE440 + Skyfield yükselen, Swiss Ephemeris gün doğumu; denetim karşılaştırıcısı `kars-vedik.csv`).
 *   • yeni-454-ref.json — 454 YENİ vaka (81 il × gündüz/gece, 30 dünya şehri, tarihsel, DST sınırı, gün doğumu/batımı yakını) ve aynı
 *     bağımsız yığınla üretilmiş BPHS referansı (QA C:/YasamSistemi-QA/ATL-B01-UPAGRAHA-2026-10-30/araclar/ref_kalavela.py).
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as AE from "astronomy-engine";
import { applyBphsKalaVela, birthUtcMs, computeKalaVela, KALA_VELA_GULIKA_TOLERANCE, tropicalAscendant, type KalaVelaId } from "@/lib/astrology/engine/upagrahaKalaVela";
import { vedicUpagraha } from "@/lib/astrology/engine/vedicNoktaTechniques";
import { calcInputHash } from "@/lib/astrology/engine/inputHash";
import { projectRoxyVedicUpagraha, ROXY_VEDIC_UPAGRAHA } from "@/lib/astrology/providers/roxy/vedicNoktalar";
import { NAKSHATRAS } from "@/lib/astrology/model/vedic";
import { UPAGRAHA_SCHOOL_NOTE, UPAGRAHA_SCHOOL_NOTE_BPHS, upagrahaSchoolNote, type VedicUpagrahaTechnical } from "@/lib/astrology/model/vedicNoktalar";
import { legacyMethodNotes } from "@/lib/astrology/legacyMethod";
import { vedicNoktaReport } from "@/lib/astrology/report/vedicNoktalarReport";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
const FX = path.join(__dirname, "fixtures", "kala-vela");
const dang = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
const FOUR = ["kala", "mrityu", "ardhaprahara", "yamaghantaka"] as const;
const LORD: Record<string, string> = { kala: "sun", mrityu: "mars", ardhaprahara: "mercury", yamaghantaka: "jupiter", gulika: "saturn" };
/** Bağımsız yığınla (DE440 / Swiss) boylam toleransı, |enlem| < 58°: gün doğumu algoritması farkı birkaç saniye → yükselende ≲ 0,03°. */
const REF_TOL = 0.05;
/** Denetimin önceden sabitlediği zaman tabanlı upagraha toleransı (gün doğumu ±1 dk → lagna ±0,3°). */
const AUDIT_TOL = 0.5;
/** Bileşen ölçütü (her enlem): parça başlangıç anı (iki gün doğumu/batımı algoritması arası) ve AYNI anda yükselen. */
const START_TOL_S = 10;
const ASC_TOL = 0.01;

type RefOut = { ok: boolean; isDay: boolean; weekday: number; ayanamsa: number; points: Record<string, { longitude: number; part: number; startJd: number; ayanamsaAtStart: number }> };
type AuditCase = {
  testId: string;
  body: { date: string; time: string; timezone: number; latitude: number; longitude: number };
  service: VedicUpagrahaTechnical;
  auditRef: Record<string, { ref: number; auditDurum: string }>;
  ref: RefOut;
};
const jdMs = (jd: number) => (jd - 2440587.5) * 86400_000;
/** Bağımsız referansla karşılaştırma: başlangıç farkı (sn), aynı anda yükselen farkı (°), boylam farkı (°), parça no eşit mi. */
function vsRef(k: Extract<ReturnType<typeof computeKalaVela>, { ok: true }>, r: RefOut, id: KalaVelaId, lat: number, lon: number) {
  const rp = r.points[id];
  const p = k.points[id];
  const dt = Math.abs(Date.parse(p.startUtc) - jdMs(rp.startJd)) / 1000;
  const asc = Math.abs(dang(tropicalAscendant(jdMs(rp.startJd), lat, lon) - rp.ayanamsaAtStart, rp.longitude));
  return { dt, asc, dl: Math.abs(dang(p.longitude, rp.longitude)), part: p.part === rp.part };
}
const audit: AuditCase[] = JSON.parse(fs.readFileSync(path.join(FX, "denetim-200.json"), "utf8"));
const bodyOf = (c: AuditCase) => ({ date: c.body.date, time: c.body.time, offsetHours: c.body.timezone, latitude: c.body.latitude, longitude: c.body.longitude });

/** Ekliptik noktası (sidereal + ayanamsa = tropikal) o anda doğu ufkunda YÜKSELİYOR mu (1 dk sonra irtifa artıyor)? */
function isRising(tropLon: number, utcMs: number, lat: number, lon: number): boolean {
  const alt = (ms: number) => {
    const tt = AE.MakeTime(new Date(ms));
    const R = Math.PI / 180;
    const eps = AE.e_tilt(tt).tobl * R;
    const l = tropLon * R;
    const ra = Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l));
    const dec = Math.asin(Math.sin(eps) * Math.sin(l));
    const H = (AE.SiderealTime(tt) * 15 + lon) * R - ra;
    return Math.asin(Math.sin(lat * R) * Math.sin(dec) + Math.cos(lat * R) * Math.cos(dec) * Math.cos(H)) / R;
  };
  return Math.abs(alt(utcMs)) < 0.01 && alt(utcMs + 60_000) > alt(utcMs);
}

// ─── 1 · Kök neden: servis = "yöneticisiz parça Satürn'den hemen sonra" + parça başı ─────────────────────────────────
t("kök neden: yerel Gulika servisinkine ≤ tolerans (198/198) ve servis 4 noktası 'Satürn'den sonra yöneticisiz' sırasıyla birebir (792/792)", () => {
  let g = 0;
  let h = 0;
  let n = 0;
  let maxG = 0;
  let maxH = 0;
  for (const c of audit) {
    if (c.service.timeBased.length === 0) continue;
    n++;
    const k = computeKalaVela({ ...bodyOf(c), ayanamsaDegrees: c.service.frame.ayanamsaDegrees });
    assert.ok(k.ok, c.testId);
    if (!k.ok) continue;
    const sv = Object.fromEntries(c.service.timeBased.map((p) => [p.id, p.longitude]));
    const dg = Math.abs(dang(k.points.gulika.longitude, sv.gulika));
    maxG = Math.max(maxG, dg);
    if (dg <= KALA_VELA_GULIKA_TOLERANCE) g++;
    const seq: (string | null)[] = [];
    for (const l of k.lords.slice(0, 7)) {
      seq.push(l);
      if (l === "saturn") seq.push(null);
    }
    const st = Date.parse(k.segmentStartUtc);
    const len = (Date.parse(k.segmentEndUtc) - st) / 8;
    const birth = birthUtcMs(c.body.date, c.body.time, c.body.timezone)!;
    for (const id of FOUR) {
      const at = st + seq.indexOf(LORD[id]) * len;
      const ay = c.service.frame.ayanamsaDegrees + ((at - birth) / 86400_000) * (50.29 / 3600 / 365.25);
      const d = Math.abs(dang(tropicalAscendant(at, c.body.latitude, c.body.longitude) - ay, sv[id]));
      maxH = Math.max(maxH, d);
      if (d <= 0.01) h++;
    }
  }
  console.log(`     ${n} harita · Gulika ${g}/${n} (en büyük ${maxG.toFixed(4)}°) · servis sırası ${h}/${n * 4} (en büyük ${maxH.toFixed(4)}°)`);
  assert.equal(n, 198);
  assert.equal(g, n);
  assert.equal(h, n * 4);
});

// ─── 2 · Denetimin 200 haritası: düzeltilmiş değerler ↔ bağımsız BPHS referansları ──────────────────────────────────
t("denetim tekrarı (a): denetimin KAYITLI referansı + denetimin kendi toleransı (0,5°) — 419 FARK ölçümünün tamamı", () => {
  let measured = 0;
  let okRef = 0;
  let prevFark = 0;
  let fixed = 0;
  let polarRefError = 0;
  const bad: string[] = [];
  for (const c of audit) {
    const r = applyBphsKalaVela(c.service, bodyOf(c), NAKSHATRAS);
    assert.ok(r.ok, c.testId);
    if (!r.ok) continue;
    if ("unchanged" in r) {
      assert.equal(c.service.timeBased.length, 0, `${c.testId}: yalnız kısmi sonuç değişmeden kalır`);
      continue;
    }
    const got = Object.fromEntries(r.technical.timeBased.map((p) => [p.id, p.longitude]));
    for (const [id, a] of Object.entries(c.auditRef)) {
      measured++;
      if (a.auditDurum === "FARK") prevFark++;
      const d = Math.abs(dang(got[id], a.ref));
      if (d <= AUDIT_TOL) {
        okRef++;
        if (a.auditDurum === "FARK") fixed++;
        continue;
      }
      // Denetim karşılaştırıcısının upagraha bölümü yükseleni doğu ufku denetimi OLMADAN alıyordu (karsilastir_vedik.py asc_at);
      // kutup ötesinde bu BATAN noktadır. Ürün değeri doğu ufkunda yükselen nokta olmalı ve referanstan tam 180° farklı olmalı.
      if (Math.abs(d - 180) <= AUDIT_TOL && Math.abs(c.body.latitude) > 66) {
        const k = computeKalaVela({ ...bodyOf(c), ayanamsaDegrees: c.service.frame.ayanamsaDegrees });
        assert.ok(k.ok);
        if (k.ok) {
          const p = k.points[id as KalaVelaId];
          assert.ok(isRising(p.longitude + c.service.frame.ayanamsaDegrees, Date.parse(p.startUtc), c.body.latitude, c.body.longitude), `${c.testId} ${id} yükselen değil`);
          if (a.auditDurum === "FARK") polarRefError++;
          continue;
        }
      }
      bad.push(`${c.testId}.${id} ${got[id]} ↔ ${a.ref.toFixed(3)} (${d.toFixed(3)}°)`);
    }
  }
  console.log(`     ölçüm ${measured} · referansla eşleşen ${okRef} · önceki FARK ${prevFark} → giderilen ${fixed} · denetim referansının kutup hatası (ürün doğu ufkunda yükselen noktayı veriyor) ${polarRefError} · açık ${bad.length}`);
  assert.equal(measured, 990);
  assert.equal(prevFark, 419);
  assert.deepEqual(bad, []);
  assert.equal(fixed + polarRefError, 419);
});

t("denetim tekrarı (b): standart atmosferli bağımsız referans — 198 harita × 5 nokta; başlangıç ≤ 10 sn, aynı anda yükselen ≤ 0,01°", () => {
  let n = 0;
  let maxDt = 0;
  let maxAsc = 0;
  let maxDl = 0;
  const bad: string[] = [];
  for (const c of audit) {
    if (!c.ref.ok) {
      assert.equal(c.service.timeBased.length, 0, `${c.testId}: referans hesaplayamadıysa servis de kısmi`);
      continue;
    }
    const k = computeKalaVela({ ...bodyOf(c), ayanamsaDegrees: c.service.frame.ayanamsaDegrees });
    assert.ok(k.ok && k.isDay === c.ref.isDay && k.weekday === c.ref.weekday, c.testId);
    if (!k.ok) continue;
    for (const id of Object.keys(LORD) as KalaVelaId[]) {
      n++;
      const v = vsRef(k, c.ref, id, c.body.latitude, c.body.longitude);
      maxDt = Math.max(maxDt, v.dt);
      maxAsc = Math.max(maxAsc, v.asc);
      maxDl = Math.max(maxDl, v.dl);
      if (!v.part || v.dt > START_TOL_S || v.asc > ASC_TOL) bad.push(`${c.testId}.${id} ${v.dt.toFixed(1)}sn ${v.asc.toFixed(4)}°`);
    }
  }
  console.log(`     nokta ${n} · en büyük: başlangıç farkı ${maxDt.toFixed(1)} sn · aynı anda yükselen ${maxAsc.toFixed(4)}° · boylam ${maxDl.toFixed(4)}° · açık ${bad.length}`);
  assert.equal(n, 990);
  assert.deepEqual(bad, []);
});

t("koruma: Gulika, Mandi, Güneş türevli 5 nokta, çerçeve, impliedSun AYNEN; yalnız 4 noktanın boylam/burç/nakshatra alanları değişir", () => {
  let changed = 0;
  let same = 0;
  for (const c of audit) {
    const r = applyBphsKalaVela(c.service, bodyOf(c), NAKSHATRAS);
    assert.ok(r.ok);
    if (!r.ok || "unchanged" in r) continue;
    const out = r.technical;
    assert.deepEqual(out.sunBased, c.service.sunBased);
    assert.deepEqual(out.frame, c.service.frame);
    assert.equal(out.impliedSun, c.service.impliedSun);
    assert.equal(out.schema, c.service.schema);
    for (const id of ["gulika", "mandi"]) assert.deepEqual(out.timeBased.find((p) => p.id === id), c.service.timeBased.find((p) => p.id === id));
    assert.deepEqual(out.timeBased.map((p) => p.id), c.service.timeBased.map((p) => p.id));
    for (const p of out.timeBased) {
      if (!(FOUR as readonly string[]).includes(p.id)) continue;
      const L = p.longitude;
      assert.equal(p.rashi, ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"][Math.floor(L / 30)]);
      assert.ok(Math.abs(p.degreeInRashi - (L % 30)) < 0.006);
      assert.equal(p.nakshatraIndex, Math.min(26, Math.floor(L / (360 / 27))) + 1);
      assert.equal(p.nakshatra, NAKSHATRAS[p.nakshatraIndex - 1]);
      assert.equal(p.pada, Math.min(4, Math.floor((L % (360 / 27)) / (360 / 108)) + 1));
      const before = c.service.timeBased.find((q) => q.id === p.id)!;
      if (Math.abs(dang(L, before.longitude)) > 0.011) changed++;
      else same++;
    }
    assert.deepEqual(out.kalaVela?.method, "bphs_part_start");
  }
  console.log(`     4 nokta: değişen ${changed} · servisle aynı kalan ${same}`);
  assert.equal(changed, 418);
});

// ─── 3 · Yeni bağımsız vakalar ─────────────────────────────────────────────────────────────────────────────────────
type NewCase = { id: string; kategori: string; date: string; time: string; offsetSeconds: number; lat: number; lon: number; ref: RefOut };
const fresh: NewCase[] = JSON.parse(fs.readFileSync(path.join(FX, "yeni-454-ref.json"), "utf8"));
t("yeni 454 vaka: gündüz/gece, Vedik gün, parça no eşit; başlangıç ≤ 10 sn ve aynı anda yükselen ≤ 0,01° (her enlem); |enlem| < 58° boylam ≤ 0,05°", () => {
  const byCat = new Map<string, { n: number; ok: number }>();
  const matrix = new Set<string>();
  const bad: string[] = [];
  let pts = 0;
  let high = 0;
  const mx = { dt: 0, asc: 0, low: 0, high: 0 };
  for (const c of fresh) {
    assert.ok(c.ref.ok, c.id);
    const k = computeKalaVela({ date: c.date, time: c.time, offsetHours: c.offsetSeconds / 3600, latitude: c.lat, longitude: c.lon, ayanamsaDegrees: c.ref.ayanamsa });
    const s = byCat.get(c.kategori) ?? { n: 0, ok: 0 };
    s.n++;
    let good = k.ok && k.isDay === c.ref.isDay && k.weekday === c.ref.weekday;
    if (k.ok) {
      matrix.add(`${k.weekday}-${k.isDay ? "G" : "N"}`);
      const lowLat = Math.abs(c.lat) < 58;
      for (const id of Object.keys(LORD) as KalaVelaId[]) {
        pts++;
        const v = vsRef(k, c.ref, id, c.lat, c.lon);
        mx.dt = Math.max(mx.dt, v.dt);
        mx.asc = Math.max(mx.asc, v.asc);
        if (lowLat) mx.low = Math.max(mx.low, v.dl);
        else {
          high++;
          mx.high = Math.max(mx.high, v.dl);
        }
        if (!v.part || v.dt > START_TOL_S || v.asc > ASC_TOL || (lowLat && v.dl > REF_TOL)) {
          good = false;
          bad.push(`${c.id}.${id} ${v.dt.toFixed(1)}sn ${v.asc.toFixed(4)}° ${v.dl.toFixed(3)}°`);
        }
      }
    }
    if (good) s.ok++;
    else bad.push(c.id);
    byCat.set(c.kategori, s);
  }
  console.log(`     ${[...byCat].map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(" · ")} · nokta ${pts} · gün×gündüz/gece ${matrix.size}/14`);
  console.log(`     en büyük: başlangıç ${mx.dt.toFixed(1)} sn · aynı anda yükselen ${mx.asc.toFixed(4)}° · boylam |enlem|<58° ${mx.low.toFixed(4)}° · |enlem|≥58° (${high} nokta) ${mx.high.toFixed(4)}°`);
  assert.equal(matrix.size, 14);
  assert.deepEqual(bad, []);
});

t("yeni vakalar: her hesaplanan nokta parça başlangıcında DOĞU ufkunda yükselen derece (kutup yakını dahil)", () => {
  let n = 0;
  for (const c of fresh) {
    const k = computeKalaVela({ date: c.date, time: c.time, offsetHours: c.offsetSeconds / 3600, latitude: c.lat, longitude: c.lon, ayanamsaDegrees: c.ref.ayanamsa });
    if (!k.ok) continue;
    for (const p of Object.values(k.points)) {
      assert.ok(isRising(p.longitude + c.ref.ayanamsa, Date.parse(p.startUtc), c.lat, c.lon), `${c.id} ${p.id}`);
      n++;
    }
  }
  assert.equal(n, fresh.length * 5);
});

t("BPHS parça sırası: 7 gün × gündüz/gece yönetici tablosu (Panchanga Yamaganda = Jüpiter, Gulika kāla = Satürn parçası)", () => {
  // Klasik Panchanga gündüz tabloları (Pazar = 0): Yamaganda ve Gulika kāla parça no.
  const YG = [5, 4, 3, 2, 1, 7, 6];
  const GK = [7, 6, 5, 4, 3, 2, 1];
  const seen = new Set<number>();
  for (const c of fresh) {
    const k = computeKalaVela({ date: c.date, time: c.time, offsetHours: c.offsetSeconds / 3600, latitude: c.lat, longitude: c.lon, ayanamsaDegrees: c.ref.ayanamsa });
    if (!k.ok) continue;
    assert.equal(k.lords[7], null, "8. parça yöneticisiz");
    assert.equal(new Set(k.lords.slice(0, 7)).size, 7);
    if (k.isDay) {
      seen.add(k.weekday);
      assert.equal(k.points.yamaghantaka.part, YG[k.weekday], `${c.id} Yamaganda`);
      assert.equal(k.points.gulika.part, GK[k.weekday], `${c.id} Gulika kāla`);
    } else assert.equal(k.lords[0], ["jupiter", "venus", "saturn", "sun", "moon", "mars", "mercury"][k.weekday], `${c.id} gece 1. parça = 5. gün yöneticisi`);
  }
  assert.equal(seen.size, 7);
});

// ─── 4 · Ürün yolu: teknik projeksiyonu, kapı, sürüm, eski kayıt ──────────────────────────────────────────────────────
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "golden", "vedic-upagraha.json"), "utf8"));
const unit = vedicUpagraha.units({ birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 } } as never, { ayanamsa: "lahiri" })[0];
t("teknik projeksiyonu (gerçek servis yanıtı): 4 nokta BPHS, Gulika/Mandi/Güneş türevliler servisle aynı, kalaVela işareti var", () => {
  assert.deepEqual(unit.body, golden.body);
  const p = vedicUpagraha.project(unit, golden.response, { ayanamsa: "lahiri" });
  assert.ok(p.ok, JSON.stringify(p));
  if (!p.ok) return;
  const base = projectRoxyVedicUpagraha(golden.response, { ayanamsa: "lahiri" });
  assert.ok(base.ok);
  if (!base.ok) return;
  const tt = p.technical as VedicUpagrahaTechnical;
  assert.deepEqual(tt.sunBased, base.technical.sunBased);
  for (const id of ["gulika", "mandi"]) assert.deepEqual(tt.timeBased.find((x) => x.id === id), base.technical.timeBased.find((x) => x.id === id));
  assert.equal(tt.kalaVela?.method, "bphs_part_start");
  assert.equal(p.projectionVersion, "vedic-upagraha-proj-2");
  const k = computeKalaVela({ date: "1990-07-15", time: "14:30:00", offsetHours: 3, latitude: 41.0082, longitude: 28.9784, ayanamsaDegrees: base.technical.frame.ayanamsaDegrees });
  assert.ok(k.ok);
  if (k.ok) for (const id of FOUR) assert.ok(Math.abs(dang(tt.timeBased.find((x) => x.id === id)!.longitude, k.points[id].longitude)) < 0.006, id);
  console.log(`     1990-07-15 Pazar gündüz: ${FOUR.map((id) => `${id} ${base.technical.timeBased.find((x) => x.id === id)!.longitude}→${tt.timeBased.find((x) => x.id === id)!.longitude}`).join(", ")}`);
});

t("kapı: yerel Gulika servisten sapıyorsa ya da gün doğumu yoksa değer ÜRETİLMEZ; kısmi sonuç (kutup) değişmez", () => {
  const c = audit.find((x) => x.service.timeBased.length > 0)!;
  const bent = { ...c.service, timeBased: c.service.timeBased.map((p) => (p.id === "gulika" ? { ...p, longitude: (p.longitude + 0.5) % 360 } : p)) };
  const r = applyBphsKalaVela(bent, bodyOf(c), NAKSHATRAS);
  assert.equal(r.ok, false);
  const polar = applyBphsKalaVela(c.service, { ...bodyOf(c), latitude: 89.5, date: "2001-06-21" }, NAKSHATRAS);
  assert.equal(polar.ok, false);
  const part = audit.find((x) => x.service.timeBased.length === 0)!;
  const pr = applyBphsKalaVela(part.service, bodyOf(part), NAKSHATRAS);
  assert.ok(pr.ok && "unchanged" in pr && pr.technical === part.service);
});

t("sürüm: adaptör -2 → önbellek anahtarı -1 kayıtlarından FARKLI (eski hesaplar yenileriyle karışmaz)", () => {
  assert.equal(ROXY_VEDIC_UPAGRAHA.adapter, "astro-roxy-vedic-upagraha-2");
  assert.equal(ROXY_VEDIC_UPAGRAHA.projection, "vedic-upagraha-proj-2");
  assert.equal(unit.adapterVersion, "astro-roxy-vedic-upagraha-2");
  const old = calcInputHash({ provider: unit.provider, providerApiVersion: unit.providerApiVersion, adapterVersion: "astro-roxy-vedic-upagraha-1", endpoint: unit.endpoint, lang: unit.lang, body: unit.body });
  assert.notEqual(unit.inputHash, old);
  assert.equal(unit.inputHash, calcInputHash({ provider: unit.provider, providerApiVersion: unit.providerApiVersion, adapterVersion: unit.adapterVersion, endpoint: unit.endpoint, lang: unit.lang, body: unit.body }));
});

t("eski kayıt: -1 sürümlü upagraha analizinde 'eski hesap sürümü' notu; -2 ve başka tekniklerde yok", () => {
  const n1 = legacyMethodNotes({ technique: "vedic.upagraha", adapterVersion: "astro-roxy-vedic-upagraha-1", houseSystem: null, revisions: [] });
  assert.deepEqual(n1.map((n) => n.code), ["upagraha_kala_vela"]);
  assert.ok(n1[0].text.includes("Gulika, Mandi ve Güneş türevli beş nokta değişmedi"));
  assert.ok(!/roxy/i.test(n1[0].text));
  assert.deepEqual(legacyMethodNotes({ technique: "vedic.upagraha", adapterVersion: "astro-roxy-vedic-upagraha-2", houseSystem: null, revisions: [] }), []);
  assert.deepEqual(legacyMethodNotes({ technique: "vedic.d1", adapterVersion: "astro-roxy-vedic-upagraha-1", houseSystem: null, revisions: [] }), []);
});

t("ekran + Word/PDF: yöntem notu kayda göre (yeni = BPHS notu, eski = önceki not AYNEN); marka-nötr", () => {
  const c = audit.find((x) => x.service.timeBased.length > 0)!;
  const r = applyBphsKalaVela(c.service, bodyOf(c), NAKSHATRAS);
  assert.ok(r.ok && !("unchanged" in r));
  if (!r.ok || "unchanged" in r) return;
  assert.equal(upagrahaSchoolNote(r.technical), UPAGRAHA_SCHOOL_NOTE_BPHS);
  assert.equal(upagrahaSchoolNote(c.service), UPAGRAHA_SCHOOL_NOTE);
  assert.ok(!/roxy/i.test(UPAGRAHA_SCHOOL_NOTE_BPHS));
  for (const want of ["BPHS", "yöneticisiz parça sondadır", "parçanın başlangıcında", "Yamaganda", "Satürn parçasının hemen ardına", "Uttara Kalamrita"]) assert.ok(UPAGRAHA_SCHOOL_NOTE_BPHS.includes(want), want);
  const lines = (tech: unknown) => {
    const out: string[] = [];
    const b = new Proxy({}, { get: (_o, k) => (...args: unknown[]) => { if (k === "p") out.push(String(args[0])); if (k === "table") out.push(JSON.stringify(args[1])); } });
    vedicNoktaReport(b as never, "vedic.upagraha", tech as never);
    return out;
  };
  const newDoc = lines(r.technical);
  const oldDoc = lines(c.service);
  assert.ok(newDoc.includes(UPAGRAHA_SCHOOL_NOTE_BPHS) && !newDoc.includes(UPAGRAHA_SCHOOL_NOTE));
  assert.ok(oldDoc.includes(UPAGRAHA_SCHOOL_NOTE) && !oldDoc.includes(UPAGRAHA_SCHOOL_NOTE_BPHS));
  // Word/PDF tablosundaki boylamlar = ekranın okuduğu teknik veri (aynı kaynak).
  const kala = r.technical.timeBased.find((p) => p.id === "kala")!;
  assert.ok(newDoc.some((l) => l.includes(`${kala.longitude.toFixed(2).replace(".", ",")}°`) || l.includes(`${kala.longitude}°`)), "kala boylamı raporda");
});

console.log(`\nupagraha-kalavela harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
