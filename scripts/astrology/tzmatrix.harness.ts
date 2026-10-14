/**
 * ASTROLOJİ — TARİHSEL SAAT DİLİMİ MATRİSİ (çevrimdışı doğrulama; 2026-10-14).
 *
 * Girdi: scripts/astrology/fixtures/tzmatrix/*.json — her vaka için GERÇEK Roxy yanıtları (golden/tzmatrix-calls.ts):
 *   num  = ürün gövdesi (sayısal tarihsel ofset)   ·   iana = aynı gövde + IANA adı (Roxy'nin kendi tz çözümü)
 *   fs   = sabit yıldızlar (seçili dönemler)
 * Doğrulanan:
 *   1) Ürün ofseti = tzdata kurallarından ELLE yazılmış beklenti; gövde = girilen YEREL tarih/saat (UTC'ye çevrilmez).
 *   2) Tek UTC dönüşümü: utc = yerel − ofset (bir kez) ve Roxy'nin yankısı aynı yerel saat + ofset.
 *   3) Roxy'nin IANA çözümü = bizim sayısal ofsetimiz (iki BAĞIMSIZ tz uygulaması) → yanıtlar özdeş.
 *   4) Bağımsız astronomi (astronomy-engine; Roxy'den bağımsız): Güneş…Plüton boylamları, ASC/MC (GAST + gerçek
 *      eğiklik), Placidus ev başlangıçları (kendi yarı-yay yinelemesi), sabit yıldız boylamları (SIMBAD + presesyon).
 *   5) Hiç yaşanmamış / iki kez yaşanan saatler: ürün reddeder veya seçim ister (çağrı yok).
 * Her fark sınıflandırılır; açıklanamayan fark PASS SAYILMAZ.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/tzmatrix.harness.ts [--md çıktı.md]
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as A from "astronomy-engine";
import { productBirth, TZ_CASES, TZ_DIR, type TzCase } from "./golden/tzmatrix-calls";
import { buildNatalRequestBody } from "@/lib/astrology/providers/roxy/natal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const D = Math.PI / 180;
const norm = (x: number) => ((x % 360) + 360) % 360;
const dArc = (a: number, b: number) => (((a - b + 540) % 360) - 180) * 60; // yay dakikası

let pass = 0;
let fail = 0;
const rows: string[] = [];
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

function trueObliquity(time: A.AstroTime): number {
  // astronomy-engine: e_tilt (IAU 2006 ortalama eğiklik + nütasyon) — kütüphanede dışa açık.
  return (A as unknown as { e_tilt: (t: A.AstroTime) => { tobl: number } }).e_tilt(time).tobl;
}

function anglesAndCusps(utcIso: string, lat: number, lon: number) {
  const time = A.MakeTime(new Date(utcIso));
  const gast = A.SiderealTime(time);
  const eps = trueObliquity(time) * D;
  const ramc = norm(gast * 15 + lon);
  const r = ramc * D;
  const mc = norm(Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(eps)) / D);
  const asc = norm(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(eps) + Math.tan(lat * D) * Math.sin(eps))) / D);
  // Placidus (yarı-yay bölmesi): RA = RAMC + f·DSA (11, 12) ; RA = RAMC + 180 − f·NSA (2, 3). λ ↔ RA yinelemesi.
  const lonFromRa = (ra: number) => norm(Math.atan2(Math.sin(ra * D), Math.cos(ra * D) * Math.cos(eps)) / D);
  const placidus = (f: number, upper: boolean) => {
    let lam = upper ? norm(mc + 30 * f * 3) : norm(mc + 180 + 30 * (3 - f * 3));
    for (let i = 0; i < 100; i++) {
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam * D));
      const x = -Math.tan(lat * D) * Math.tan(dec);
      const dsa = Math.acos(Math.max(-1, Math.min(1, x))) / D;
      const nsa = 180 - dsa;
      const ra = upper ? ramc + f * dsa : ramc + 180 - f * nsa;
      const next = lonFromRa(norm(ra));
      if (Math.abs(dArc(next, lam)) < 1e-7) {
        lam = next;
        break;
      }
      lam = next;
    }
    return lam;
  };
  const c11 = placidus(1 / 3, true);
  const c12 = placidus(2 / 3, true);
  const c2 = placidus(2 / 3, false);
  const c3 = placidus(1 / 3, false);
  const cusps = [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12];
  return { asc, mc, cusps };
}

const BODIES: [string, A.Body][] = [
  ["Sun", A.Body.Sun],
  ["Moon", A.Body.Moon],
  ["Mercury", A.Body.Mercury],
  ["Venus", A.Body.Venus],
  ["Mars", A.Body.Mars],
  ["Jupiter", A.Body.Jupiter],
  ["Saturn", A.Body.Saturn],
  ["Uranus", A.Body.Uranus],
  ["Neptune", A.Body.Neptune],
  ["Pluto", A.Body.Pluto],
];
function planetLon(body: A.Body, utcIso: string): number {
  const time = A.MakeTime(new Date(utcIso));
  if (body === A.Body.Moon) return norm(A.EclipticGeoMoon(time).lon);
  return norm(A.Ecliptic(A.GeoVector(body, time, true)).elon);
}

type Fx = { case: TzCase; product: { tz: string; utcIso: string; locLabel: string }; body: J; response: J };
const load = (id: string, kind: string): Fx | null => {
  const p = join(TZ_DIR, `${id}.${kind}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Fx) : null;
};

// Tolerans (yay dakikası): astronomy-engine (VSOP87/ELP kısaltılmış) ile Roxy (JPL DE) arasındaki model farkı
// gezegenlerde ~0,1′ düzeyindedir; Plüton için kütüphane ±1′ hedefler. Açılar/evler aynı formülle → çok sıkı.
const TOL = { planet: 0.6, pluto: 1.5, moon: 0.6, angle: 0.15, cusp: 0.3 };
/**
 * Zaman ölçeği (UT1 − UTC, |fark| ≤ 0,9 sn) açıklaması: ASC/MC/ev ~0,25′/sn değişir. Ham fark toleransı aşarsa TEK bir
 * zaman kayması s (MC'den türetilir) aranır; |s| ≤ 1,0 sn ise ve bu kaymayla ASC + 12 ev başlangıcının TAMAMI ≤ 0,03′
 * kalıntıyla tutuyorsa fark "zaman ölçeği (UT1−UTC)" sınıfındadır. Tek parametre 13 sayıyı açıklamıyorsa → FAIL.
 */
const MAX_TIMESCALE_SEC = 1.0;
const knownLimits: string[] = [];
const fixedLimits: string[] = [];
const hhmmss = (sec: number) => `${sec < 0 ? "−" : "+"}${Math.floor(Math.abs(sec) / 3600)}:${String(Math.floor((Math.abs(sec) % 3600) / 60)).padStart(2, "0")}:${String(Math.abs(sec) % 60).padStart(2, "0")}`;
const RESIDUAL = 0.03;

const md: string[] = [
  "| Vaka | Yer | Yerel giriş | IANA | Beklenen ofset | Ürün ofseti | UTC (tek dönüşüm) | Roxy IANA = ürün | ΔASC′ | ΔMC′ | max Δev′ | max Δgezegen′ | Sonuç |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
];

function hhmm(off: number) {
  const s = off < 0 ? "−" : "+";
  const a = Math.abs(off);
  const h = Math.floor(a + 1e-9);
  const totalSec = Math.round((a - h) * 3600);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${s}${h}:${String(m).padStart(2, "0")}${sec ? `:${String(sec).padStart(2, "0")}` : ""}`;
}

function main() {
  for (const c of TZ_CASES) {
    const pb = productBirth(c);
    if (c.expectReject) {
      t(`${c.id}: ürün ${c.expectReject} ile reddeder / seçim ister (çağrı yok)`, () => {
        assert.equal(pb.ok, false);
        if (!pb.ok) assert.equal(pb.code, c.expectReject);
        assert.equal(load(c.id, "num"), null, "reddedilen vaka için çağrı yapılmış");
      });
      md.push(`| ${c.id} | ${c.locationId} | ${c.date} ${c.time} | — | — | — | — | — | — | — | — | — | ✅ ${c.expectReject === "BIRTH_TIME_NONEXISTENT" ? "reddedildi (hiç yaşanmamış saat)" : "seçim istendi (iki kez yaşanan saat)"} |`);
      continue;
    }
    // "num" = ilk çağrı (dengeleme ÖNCESİ gövde olabilir); "lmt" = LMT dengelemesinden sonra ürünün güncel gövdesiyle
    // çağrı. Doğrulama HER ZAMAN güncel ürün gövdesine ait yanıtla yapılır.
    const old = load(c.id, "num");
    const lmtFx = load(c.id, "lmt");
    const num = lmtFx ?? old;
    const iana = load(c.id, "iana");
    let result = "PASS";
    let dAsc = NaN;
    let dMc = NaN;
    let dCusp = NaN;
    let dPl = NaN;
    let ianaSame = "—";
    let timescale = "";
    t(`${c.id}: ${c.note}`, () => {
      assert.ok(pb.ok, "ürün girdiyi reddetti");
      if (!pb.ok) return;
      assert.ok(num && iana, "fixture yok");
      if (!num || !iana) return;
      // 1) Ofset (tzdata beklentisi) + fixture gövdesi = ÜRÜNÜN GÜNCEL gövdesi
      const off = pb.birth.utcOffsetSeconds / 3600;
      assert.ok(Math.abs(off - c.expectOffset) < 1e-6, `ofset ${off} ≠ beklenen ${c.expectOffset}`);
      assert.deepEqual(num.body, JSON.parse(JSON.stringify(buildNatalRequestBody(pb.birth, { houseSystem: "placidus", nodeType: "true" }))), "fixture gövdesi güncel ürün gövdesi değil");
      const lmtSec = pb.birth.utcOffsetSeconds - Math.round(pb.birth.utcOffsetSeconds / 60) * 60;
      if (lmtSec === 0) {
        assert.equal(num.body.date, c.date, "gövde tarihi yerel değil");
        assert.equal(num.body.time, `${c.time}:00`, "gövde saati yerel değil (UTC'ye çevrilmiş olabilir)");
        assert.ok(Math.abs(num.body.timezone - off) < 1e-6);
      } else {
        // LMT dengelemesi: ofset dakikaya yuvarlanır, yerel saat aradaki saniye kadar kayar.
        assert.ok(Math.abs(num.body.timezone * 3600 - Math.round(pb.birth.utcOffsetSeconds / 60) * 60) < 0.01, "LMT: ofset dakikaya yuvarlanmamış");
      }
      // 2) Tek UTC dönüşümü: gövdedeki (yerel − ofset) = ürün UTC'si = (girilen yerel − tarihsel ofset), saniye hassas
      const bodyUtc = Date.parse(`${num.body.date}T${num.body.time}Z`) - Math.round(num.body.timezone * 3600) * 1000;
      assert.equal(new Date(bodyUtc).toISOString().slice(0, 19), pb.utcIso.slice(0, 19), "gövdeden çıkan UTC ürün UTC'sinden farklı");
      const localMs = Date.parse(`${c.date}T${c.time}:00Z`);
      assert.equal(new Date(localMs - pb.birth.utcOffsetSeconds * 1000).toISOString().slice(0, 19), pb.utcIso.slice(0, 19), "UTC tek dönüşümle türetilmiyor");
      const rd = num.response.birthDetails;
      assert.equal(rd.date, num.body.date);
      assert.equal(String(rd.time).slice(0, 8), String(num.body.time).slice(0, 8));
      assert.ok(Math.abs(rd.timezone - num.body.timezone) < 1e-4, `Roxy yankı ofseti ${rd.timezone}`);
      // 3) Roxy IANA çözümü (bağımsız tz uygulaması)
      const ri = iana.response.birthDetails.timezone;
      const same = JSON.stringify(num.response.planets) === JSON.stringify(iana.response.planets) && JSON.stringify(num.response.houses) === JSON.stringify(iana.response.houses);
      ianaSame = same ? "✅ özdeş" : `❌ Roxy ${hhmm(ri)}`;
      if (c.dst === "later") {
        // Bilinen ayar farkı: Roxy iki kez yaşanan saatte İLK oluşu seçer (belgeli); ürün uzman seçimini (ikinci) uygular.
        assert.ok(Math.abs(ri - 3) < 1e-6 && !same, "Roxy IANA ilk oluşu seçmeli (belge)");
        ianaSame = "⚠ ayar farkı (Roxy ilk oluşu seçer; ürün uzman seçimi)";
      } else if (lmtSec !== 0) {
        // Bilinen SAĞLAYICI HATASI (yalnız IANA yolu; ürün kullanmaz): LMT saniyesi atılır (İstanbul 1905 +1:56) ve
        // Monrovia 1965'te işaret TERS (+0:44 ≠ −0:44:30). Ürün sayısal ofset gönderir → ETKİLENMEZ.
        assert.ok(Math.abs(ri - off) >= 1e-4, "LMT vakasında Roxy IANA beklenmedik şekilde doğru — kısıt notunu güncelleyin");
        ianaSame = `⚠ Roxy IANA LMT hatası (Roxy ${hhmm(ri)} ≠ tzdata ${hhmm(off)}); ürün sayısal → etkilenmez`;
        knownLimits.push(`${c.id}: Roxy'nin IANA çözümü ${hhmm(ri)} (tzdata ${hhmm(off)}) — ürün bu yolu KULLANMAZ`);
      } else {
        assert.ok(Math.abs(ri - off) < 1e-4, `Roxy IANA ofseti ${ri} ≠ ürün ${off} — SAAT DİLİMİ FARKI`);
        assert.ok(same, "IANA ve sayısal yanıt farklı");
      }
      // 3b) LMT: dengeleme öncesi yanıt (varsa) kaymayı GÖSTERİR; güncel yanıt GÖSTERMEZ (dengelemenin kanıtı).
      if (lmtFx && old) {
        const ac0 = anglesAndCusps(pb.utcIso, pb.birth.latitude, pb.birth.longitude);
        const p1 = anglesAndCusps(new Date(Date.parse(pb.utcIso) + 1000).toISOString(), pb.birth.latitude, pb.birth.longitude);
        const before = dArc(old.response.midheaven.longitude, ac0.mc) / dArc(p1.mc, ac0.mc);
        assert.ok(Math.abs(before - lmtSec) <= 0.6, `dengeleme öncesi kayma ${before.toFixed(2)} sn ≠ beklenen ${lmtSec} sn`);
        fixedLimits.push(`${c.id}: dengeleme ÖNCESİ ${before.toFixed(2)} sn kayma (ASC ${dArc(old.response.ascendant.longitude, ac0.asc).toFixed(2)}′, MC ${dArc(old.response.midheaven.longitude, ac0.mc).toFixed(2)}′); SONRASI matris satırında`);
      }
      // 4) Bağımsız astronomi
      const utc = pb.utcIso;
      const ac = anglesAndCusps(utc, pb.birth.latitude, pb.birth.longitude);
      dAsc = dArc(num.response.ascendant.longitude, ac.asc);
      dMc = dArc(num.response.midheaven.longitude, ac.mc);
      assert.equal(num.response.houseSystem, "placidus");
      dCusp = Math.max(...(num.response.houses as J[]).map((h) => Math.abs(dArc(h.longitude, ac.cusps[h.number - 1]))));
      if (Math.abs(dAsc) > TOL.angle || Math.abs(dMc) > TOL.angle || dCusp > TOL.cusp) {
        const plus1 = anglesAndCusps(new Date(Date.parse(utc) + 1000).toISOString(), pb.birth.latitude, pb.birth.longitude);
        const sec = dMc / dArc(plus1.mc, ac.mc);
        assert.ok(Math.abs(sec) <= MAX_TIMESCALE_SEC, `ASC Δ=${dAsc.toFixed(3)}′ MC Δ=${dMc.toFixed(3)}′ → gereken zaman kayması ${sec.toFixed(2)} sn > ${MAX_TIMESCALE_SEC} sn: AÇIKLANAMAYAN FARK`);
        const sh = anglesAndCusps(new Date(Date.parse(utc) + sec * 1000).toISOString(), pb.birth.latitude, pb.birth.longitude);
        const rAsc = Math.abs(dArc(num.response.ascendant.longitude, sh.asc));
        const rCusp = Math.max(...(num.response.houses as J[]).map((h) => Math.abs(dArc(h.longitude, sh.cusps[h.number - 1]))));
        assert.ok(rAsc <= RESIDUAL && rCusp <= RESIDUAL, `${sec.toFixed(2)} sn kayma ASC/evleri açıklamıyor (kalıntı ASC ${rAsc.toFixed(3)}′, ev ${rCusp.toFixed(3)}′): AÇIKLANAMAYAN FARK`);
        timescale = `zaman ölçeği ${sec >= 0 ? "+" : ""}${sec.toFixed(2)} sn (kalıntı ≤ ${Math.max(rAsc, rCusp).toFixed(3)}′)`;
      }
      if (lmtSec !== 0) timescale = `${timescale ? `${timescale}; ` : ""}LMT dengelemesiyle (ofset dakikaya, yerel saat ${-lmtSec > 0 ? "+" : ""}${-lmtSec} sn)`;
      dPl = 0;
      for (const [name, b] of BODIES) {
        const p = (num.response.planets as J[]).find((x) => x.name === name);
        assert.ok(p, name);
        const d = Math.abs(dArc(p.longitude, planetLon(b, utc)));
        dPl = Math.max(dPl, d);
        const tol = name === "Pluto" ? TOL.pluto : name === "Moon" ? TOL.moon : TOL.planet;
        assert.ok(d <= tol, `${name} Δ=${d.toFixed(3)}′`);
      }
    });
    if (fail > 0 && rows.length < fail) result = "FAIL";
    rows.push(c.id);
    const off = pb.ok ? pb.birth.utcOffsetSeconds / 3600 : NaN;
    md.push(
      `| ${c.id} | ${pb.ok ? pb.locLabel : c.locationId} | ${c.date} ${c.time}${c.dst && c.dst !== "auto" ? ` (${c.dst === "earlier" ? "ilk" : "ikinci"})` : ""} | ${pb.ok ? pb.tz : "—"} | ${hhmm(c.expectOffset)} | ${hhmm(off)} | ${pb.ok ? pb.utcIso.slice(0, 16).replace("T", " ") : "—"} | ${ianaSame} | ${dAsc.toFixed(3)} | ${dMc.toFixed(3)} | ${dCusp.toFixed(3)} | ${dPl.toFixed(3)} | ${result === "PASS" ? "✅" : "❌"}${timescale ? ` ${timescale}` : ""} |`,
    );
  }

  // Sabit yıldızlar — dönemler arası (1750 → 2023): presesyon + öz hareket + aberasyon bağımsız referansla.
  const REF = JSON.parse(readFileSync(join(__dirname, "fixtures", "fixed-stars-reference-sefstars.json"), "utf8")).stars as Record<string, { raDeg: number; decDeg: number; pmRa: number; pmDec: number }>;
  const refLon = (id: string, utcIso: string) => {
    const st = REF[id];
    const time = A.MakeTime(new Date(utcIso));
    const yrs = time.tt / 365.25;
    const dec = st.decDeg + (st.pmDec / 3.6e6) * yrs;
    const ra = st.raDeg + ((st.pmRa / 3.6e6) * yrs) / Math.cos(st.decDeg * D);
    const u = [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
    const ev = A.BaryState(A.Body.Earth, time);
    const C = 173.1446326846693;
    const v = new A.Vector(u[0] + ev.vx / C, u[1] + ev.vy / C, u[2] + ev.vz / C, time);
    return norm(A.SphereFromVector(A.RotateVector(A.Rotation_EQJ_ECT(time), v)).lon);
  };
  const fsMd: string[] = ["| Vaka (dönem) | Yıldız | max |Δ| (yay dk.) | Regulus boylamı | Natal nokta tutarlılığı |", "|---|---|---|---|---|"];
  for (const c of TZ_CASES.filter((x) => x.fixedStars)) {
    const fs = load(c.id, "fs");
    const num = load(c.id, "num");
    t(`sabit yıldız ${c.id}: 43 yıldız boylamı bağımsız referansla uyumlu; temas noktaları natal yanıtla aynı`, () => {
      assert.ok(fs && num);
      if (!fs || !num) return;
      const pb = productBirth(c);
      assert.ok(pb.ok);
      if (!pb.ok) return;
      let max = 0;
      // 1750 için: öz hareket doğrusal modeli (SE ile aynı) 275 yılda Arcturus/Toliman gibi hızlı yıldızlarda büyür;
      // iki taraf aynı modeli kullandığından fark yine küçük kalmalı. Tolerans 0,2′ (1750), diğerleri 0,05′.
      const yrsFrom2000 = Math.abs(Number(c.date.slice(0, 4)) - 2000);
      const tol = 0.05 + 0.0008 * yrsFrom2000; // doğrusal öz hareket modeli farkı yakın/hızlı yıldızlarda (α Cen) yılla büyür
      for (const s of fs.response.stars as J[]) {
        const d = Math.abs(dArc(s.longitude, refLon(s.id, pb.utcIso)));
        max = Math.max(max, d);
        assert.ok(d <= tol, `${s.id} Δ=${d.toFixed(3)}′`);
      }
      const natal = new Map<string, number>((num.response.planets as J[]).map((p) => [p.name, p.longitude]));
      natal.set("ASC", num.response.ascendant.longitude);
      natal.set("MC", num.response.midheaven.longitude);
      let worst = 0;
      for (const s of fs.response.stars as J[]) for (const k of s.conjunctions as J[]) worst = Math.max(worst, Math.abs(dArc(k.pointLongitude, natal.get(k.point)!)) / 60);
      assert.ok(worst <= 1e-3, `natal nokta farkı ${worst}°`);
      const reg = (fs.response.stars as J[]).find((s) => s.id === "regulus");
      fsMd.push(`| ${c.id} | 43 | ${max.toFixed(3)} | ${reg.longitude.toFixed(4)}° | ✅ (≤ ${worst.toExponential(1)}°) |`);
    });
  }
  t("presesyon (1750 → 2023): Regulus boylam artışı ≈ 50,3″/yıl genel presesyon (± öz hareket)", () => {
    const a = load("eu-1750-paris-lmt", "fs")!.response.stars.find((s: J) => s.id === "regulus").longitude;
    const b = load("tr-2023-edirne-dayline", "fs")!.response.stars.find((s: J) => s.id === "regulus").longitude;
    const yrs = (Date.parse("2023-06-14T21:20:00Z") - Date.parse("1750-03-21T11:50:39Z")) / 3.15576e10;
    const rate = (((b - a + 540) % 360) - 180) * 3600 / yrs;
    assert.ok(rate > 49 && rate < 51.5, `${rate.toFixed(2)}″/yıl`);
  });

  if (knownLimits.length) console.log(`\nBİLİNEN SAĞLAYICI KISITLARI (yalnız Roxy IANA yolu; ürün kullanmaz):\n  ${knownLimits.join("\n  ")}`);
  const known = knownLimits.length;
  const out = process.argv.indexOf("--md");
  if (out > 0) writeFileSync(process.argv[out + 1], ["## Saat dilimi matrisi", "", ...md, "", "### Bilinen sağlayıcı kısıtları (ürün etkilenmez)", "", ...knownLimits.map((x) => `- ${x}`), "", "### LMT dengelemesi — öncesi/sonrası", "", ...fixedLimits.map((x) => `- ${x}`), "", "## Sabit yıldızlar — dönemler", "", ...fsMd, ""].join("\n"));
  console.log(`\nastrology tz matrix harness: ${pass} PASS / ${fail} FAIL (bilinen sağlayıcı kısıtı notu: ${known}; ürün etkilenmez)`);
  if (fail > 0) process.exit(1);
}

main();
