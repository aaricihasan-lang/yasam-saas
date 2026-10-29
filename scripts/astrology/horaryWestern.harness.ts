/**
 * GÖKYÜZÜ ATLASI — HORARY-W-01 (2026-10-18): Klasik Batı Horary hesap katmanı testleri (ÜRÜNE BAĞLI DEĞİL).
 *
 * Kaynaklar:
 *   • GERÇEK Roxy: depodaki natal golden (fixtures/roxy-natal-golden-2026-10-07.json; /astrology/natal-chart, tropikal,
 *     Placidus). Yeni Roxy çağrısı YOK.
 *   • BAĞIMSIZ: astronomy-engine 2.1.19 (gerçek kesinleşme anları, Ay burç girişi) — "sentetik olay" olarak işaretli;
 *     Roxy aylık açı uçlarının gerçek yanıt biçimi henüz doğrulanmadı.
 *   • Tablo sağlama toplamları (Mısır terimleri = küçük yıllar).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horaryWestern.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Astronomy from "astronomy-engine";
import { CLASSICAL_PLANETS, DOMICILE, EXALTATION, SIGNS, TERMS, faceRuler, signOf, type ClassicalPlanet } from "@/lib/astrology/horary/western/tables";
import {
  PROFILE_DOROTHEAN_EGYPTIAN,
  PROFILE_LILLY_1647,
  aspectState,
  considerations,
  essentialDignity,
  inViaCombusta,
  isDayChart,
  moonContext,
  partOfFortune,
  reception,
  signOnlyDignity,
  solarPhase,
  wrap180,
  type MoonEvent,
} from "@/lib/astrology/horary/western/calc";

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

type RoxyPlanet = { name: string; longitude: number; speed: number; dignity?: string; isRetrograde: boolean };
const NATAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8")) as {
  planets: RoxyPlanet[];
  ascendant: { longitude: number };
  partOfFortune: { longitude: number; sect: string };
  aspects: { planet1: string; planet2: string; type: string; orb: number; isApplying: boolean }[];
};
const NAME: Record<string, ClassicalPlanet> = { Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn" };
const ANGLE: Record<string, number> = { CONJUNCTION: 0, SEXTILE: 60, SQUARE: 90, TRINE: 120, OPPOSITION: 180, SEMI_SEXTILE: 30, SEMI_SQUARE: 45, SESQUIQUADRATE: 135, QUINCUNX: 150 };
const P = (n: string) => NATAL.planets.find((x) => x.name === n)!;

const BODY: Record<string, Astronomy.Body> = { sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars, jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn };
const lonAt = (id: string, ms: number) => Astronomy.Ecliptic(Astronomy.GeoVector(BODY[id], Astronomy.MakeTime(new Date(ms)), true)).elon;
const speedAt = (id: string, ms: number) => wrap180(lonAt(id, ms + 3_600_000) - lonAt(id, ms - 3_600_000)) * 12;

/** astronomy-engine ile Ay–gezegen kesinleşmeleri [t0, t1] (1 dk çözünürlük, ikiye bölme). */
function moonPerfections(t0: number, t1: number, bodies: string[], angles: number[]): MoonEvent[] {
  const out: MoonEvent[] = [];
  const STEP = 20 * 60_000;
  for (const b of bodies) {
    for (const ang of angles) {
      for (const target of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
        const f = (ms: number) => wrap180(lonAt("moon", ms) - lonAt(b, ms) - target);
        for (let a = t0; a < t1; a += STEP) {
          const z = Math.min(a + STEP, t1);
          const fa = f(a);
          const fz = f(z);
          if (Math.sign(fa) !== Math.sign(fz) && Math.abs(fa - fz) < 90) {
            let lo = a;
            let hi = z;
            for (let i = 0; i < 40 && hi - lo > 1000; i++) {
              const m = (lo + hi) / 2;
              if (Math.sign(f(m)) === Math.sign(fa)) lo = m;
              else hi = m;
            }
            out.push({ atUtc: new Date((lo + hi) / 2).toISOString(), body: b, angle: ang });
          }
        }
      }
    }
  }
  return out;
}
function moonIngressAfter(ms: number): number {
  const s0 = Math.floor(lonAt("moon", ms) / 30);
  let a = ms;
  while (Math.floor(lonAt("moon", a + 3_600_000) / 30) === s0) a += 3_600_000;
  let lo = a;
  let hi = a + 3_600_000;
  while (hi - lo > 1000) {
    const m = (lo + hi) / 2;
    if (Math.floor(lonAt("moon", m) / 30) === s0) lo = m;
    else hi = m;
  }
  return hi;
}

async function main() {
  // ── Tablolar ───────────────────────────────────────────────────────────────────────────────
  await t("W1 tablolar: 7 klasik gezegen; ev yöneticileri (Güneş/Ay 1, diğerleri 2 burç); yücelme burçları tekil; zarar/düşüş karşıt burç", () => {
    for (const p of CLASSICAL_PLANETS) assert.equal(SIGNS.filter((s) => DOMICILE[s] === p).length, p === "sun" || p === "moon" ? 1 : 2, p);
    assert.equal(new Set(CLASSICAL_PLANETS.map((p) => EXALTATION[p].sign)).size, 7);
    assert.deepEqual([essentialDignity("mars", 100, true, PROFILE_LILLY_1647).fall, essentialDignity("venus", 15, true, PROFILE_LILLY_1647).detriment], [true, true]);
  });

  await t("W2 terimler: her burçta 5 dilim, artan, 30'da biter, 5 yıldızın her biri bir kez; MISIR terimleri gezegen toplamı = küçük yıllar (Satürn 57, Jüpiter 79, Mars 66, Venüs 82, Merkür 76) — bağımsız sağlama", () => {
    for (const v of ["egyptian", "lilly"] as const) {
      for (const s of SIGNS) {
        const row = TERMS[v][s];
        assert.equal(row.length, 5, `${v} ${s}`);
        assert.equal(row[4][1], 30);
        for (let i = 1; i < 5; i++) assert.ok(row[i][1] > row[i - 1][1]);
        assert.deepEqual(row.map((x) => x[0]).sort(), ["jupiter", "mars", "mercury", "saturn", "venus"], `${v} ${s}`);
      }
    }
    const tot = (v: "egyptian" | "lilly") => {
      const m: Record<string, number> = {};
      for (const s of SIGNS) TERMS[v][s].reduce((prev, [p, end]) => ((m[p] = (m[p] ?? 0) + end - prev), end), 0);
      return m;
    };
    assert.deepEqual(tot("egyptian"), { jupiter: 79, venus: 82, mercury: 76, mars: 66, saturn: 57 });
    const pt = tot("lilly");
    assert.equal(Object.values(pt).reduce((a, b) => a + b, 0), 360);
    console.log(`  bilgi: Lilly terim toplamları ${JSON.stringify(pt)} — sağlama toplamı yok; 12/12 satır CA s. 104 tıpkıbasımıyla teyitli (10-19)`);
    // W-02: tablo 10-19'da tıpkıbasımdan teyit edildi → "doğrulanamadı" işareti kalktı; ad "ptolemaic" → "lilly".
    assert.ok(!PROFILE_LILLY_1647.unverified.some((x) => x.startsWith("terms:")));
    assert.deepEqual(TERMS.lilly.aries.slice(0, 2), [["jupiter", 6], ["venus", 14]]);
  });

  await t("W3 yüzler: Kalde sırası Koç 0° Mars → Balık 20° Mars (36 dekan; 36 = 5×7+1 → zincir kapanır)", () => {
    const at = (s: string, k: number) => faceRuler(SIGNS.indexOf(s as never) * 30 + k * 10 + 5);
    assert.deepEqual([at("aries", 0), at("aries", 1), at("aries", 2)], ["mars", "sun", "venus"]);
    assert.deepEqual([at("leo", 0), at("leo", 1), at("leo", 2)], ["saturn", "jupiter", "mars"]);
    assert.deepEqual([at("pisces", 0), at("pisces", 1), at("pisces", 2)], ["saturn", "jupiter", "mars"]);
  });

  await t("W4 asalet puanı (Lilly): Güneş Koç 19° gündüz = yücelme 4 + üçlü 3 + yüz 1 = 8; Mars Yengeç 10° gece = düşüş −4 + üçlü(Lilly su: Mars) 3 = −1; Dorothean su gece Mars aynı, Mısır terimi Venüs", () => {
    const s = essentialDignity("sun", 19, true, PROFILE_LILLY_1647);
    assert.deepEqual([s.exaltation, s.triplicity, s.term, s.face, s.score], [true, true, false, true, 8]);
    const m = essentialDignity("mars", 100, false, PROFILE_LILLY_1647);
    assert.deepEqual([m.fall, m.triplicity, m.peregrine, m.score, m.rulers.term], [true, true, false, -1, "jupiter"]);
    const md = essentialDignity("mars", 100, false, PROFILE_DOROTHEAN_EGYPTIAN);
    assert.deepEqual([md.triplicity, md.rulers.term], [true, "venus"]);
    // Peregrine: hiçbir asalet yok → −5 (Lilly).
    const pe = essentialDignity("saturn", 5, true, PROFILE_LILLY_1647); // Koç 5°: Satürn düşüşte, terim Jüpiter, yüz Mars
    assert.deepEqual([pe.fall, pe.peregrine, pe.score], [true, true, -9]);
  });

  await t("W5 kabul: Venüs Koç'ta + Mars Boğa'da = ev yöneticiliğiyle karşılıklı kabul; tek yönlü kabul ayrı", () => {
    const r = reception({ id: "venus", lon: 10 }, { id: "mars", lon: 40 }, true, PROFILE_LILLY_1647);
    assert.equal(r.mutual, true);
    assert.ok(r.aReceivedBy.includes("domicile") && r.bReceivedBy.includes("domicile"));
    const one = reception({ id: "venus", lon: 10 }, { id: "mars", lon: 70 }, true, PROFILE_LILLY_1647);
    assert.equal(one.mutual, false);
  });

  // ── GERÇEK Roxy golden ile çapraz denetim ─────────────────────────────────────────────────────
  await t("W6 GERÇEK Roxy natal: sect = Güneş ufkun üstünde (ASC'den hesap) = Roxy partOfFortune.sect; Şans noktası 'gece ters' formülü = Roxy boylamı (≤1e-6°); Lilly formülü gündüzde aynı", () => {
    const sun = P("Sun").longitude;
    const moon = P("Moon").longitude;
    const asc = NATAL.ascendant.longitude;
    const day = isDayChart(sun, asc);
    assert.equal(day ? "day" : "night", NATAL.partOfFortune.sect);
    const pof = partOfFortune(asc, sun, moon, day, "sect_reversed");
    assert.ok(Math.abs(wrap180(pof - NATAL.partOfFortune.longitude)) < 1e-6, `${pof} ≠ ${NATAL.partOfFortune.longitude}`);
    assert.equal(partOfFortune(asc, sun, moon, day, "lilly_same"), pof, "gündüz haritasında iki formül aynı");
    assert.notEqual(partOfFortune(asc, sun, moon, false, "sect_reversed"), partOfFortune(asc, sun, moon, false, "lilly_same"), "gece haritasında farklı → EĞİTMEN kararı");
  });

  await t("W7 GERÇEK Roxy natal: 7 klasik gezegende burç-bazlı asalet sınıfı = Roxy `dignity` (Roxy terim/üçlü/yüz VERMEZ)", () => {
    for (const [n, id] of Object.entries(NAME)) assert.equal(signOnlyDignity(id, P(n).longitude), P(n).dignity, n);
  });

  await t("W8 GERÇEK Roxy natal: klasik gezegenler arası her açıda yaklaşan/ayrılan (konum + günlük hızdan) = Roxy isApplying; |orb| = Roxy orb", () => {
    let n = 0;
    for (const a of NATAL.aspects) {
      if (!NAME[a.planet1] || !NAME[a.planet2]) continue;
      const p1 = P(a.planet1);
      const p2 = P(a.planet2);
      const st = aspectState({ id: a.planet1, lon: p1.longitude, speed: p1.speed }, { id: a.planet2, lon: p2.longitude, speed: p2.speed }, ANGLE[a.type]);
      assert.ok(Math.abs(Math.abs(st.orb) - a.orb) < 1e-6, `${a.planet1}-${a.planet2} ${a.type} orb ${st.orb} ≠ ${a.orb}`);
      assert.equal(st.applying, a.isApplying, `${a.planet1}-${a.planet2} ${a.type}`);
      n++;
    }
    assert.ok(n >= 8, `yalnız ${n} klasik açı`);
    console.log(`  bilgi: ${n} klasik açı Roxy ile birebir`);
  });

  // ── Bağımsız efemeris ─────────────────────────────────────────────────────────────────────────
  await t("W9 BAĞIMSIZ (astronomy-engine): doğrusal 'kesinleşmeye kalan süre' yalnız TAHMİNDİR — Ay açılarında gerçek kesinleşmeden sapma ölçülür ve raporlanır; kesinleşme anı için olay verisi gerekir", () => {
    const t0 = Date.parse("2026-10-07T09:00:00Z");
    const ev = moonPerfections(t0, t0 + 2.5 * 86_400_000, ["sun", "mercury", "venus", "mars", "jupiter", "saturn"], [0, 60, 90, 120, 180]);
    assert.ok(ev.length > 0);
    let worstMin = 0;
    for (const e of ev) {
      const st = aspectState({ id: "moon", lon: lonAt("moon", t0), speed: speedAt("moon", t0) }, { id: e.body, lon: lonAt(e.body, t0), speed: speedAt(e.body, t0) }, e.angle);
      if (st.linearDaysToExact === null) continue;
      const errMin = Math.abs(st.linearDaysToExact * 1440 - (Date.parse(e.atUtc) - t0) / 60_000);
      worstMin = Math.max(worstMin, errMin);
    }
    console.log(`  bilgi: 2,5 gün içinde ${ev.length} Ay kesinleşmesi; doğrusal tahminin en büyük sapması ${worstMin.toFixed(0)} dk`);
    assert.ok(worstMin > 1, "sapma sıfır değil → doğrusal değer 'kesinleşme anı' diye sunulamaz");
  });

  await t("W10 SENTETİK OLAY (astronomy-engine, gerçek Roxy değil): Ay'ın son/sonraki açısı ve boşlukta Ay — 30 dk adımlı işaret taramasıyla aynı sonuç; 3 sabit an + bulunan ilk BOŞLUKTA an", () => {
    // Boşlukta bir an bul: ardışık burç girişlerinden 3 saat önce (bağımsız tarama karar verir; liste yalnız aday üretir).
    const cands = ["2026-10-07T09:00:00Z", "2026-03-15T00:00:00Z", "2027-01-20T18:30:00Z"];
    let probe = Date.parse("2026-10-07T09:00:00Z");
    for (let k = 0; k < 12; k++) {
      const ing = moonIngressAfter(probe);
      cands.push(new Date(ing - 3 * 3_600_000).toISOString());
      probe = ing + 3_600_000;
    }
    let vocSeen = 0;
    for (const iso of cands) {
      const t0 = Date.parse(iso);
      const ingress = moonIngressAfter(t0);
      const events = moonPerfections(t0 - 3 * 86_400_000, ingress + 3_600_000, PROFILE_LILLY_1647.voc.bodies, PROFILE_LILLY_1647.voc.aspects);
      const ctx = moonContext(events, iso, new Date(ingress).toISOString(), PROFILE_LILLY_1647);
      assert.equal(signOf(lonAt("moon", ingress + 60_000)), ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"][(Math.floor(lonAt("moon", t0) / 30) + 1) % 12]);
      // Kaba tarama: [t0, giriş) içinde herhangi bir kesinleşme (işaret değişimi) var mı?
      let any = false;
      for (const b of PROFILE_LILLY_1647.voc.bodies) {
        for (const ang of PROFILE_LILLY_1647.voc.aspects) {
          for (const tg of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
            const f = (ms: number) => wrap180(lonAt("moon", ms) - lonAt(b, ms) - tg);
            for (let ms = t0; ms < ingress && !any; ms += 60_000 * 30) {
              const z = Math.min(ms + 60_000 * 30, ingress);
              if (Math.sign(f(ms)) !== Math.sign(f(z)) && Math.abs(f(ms) - f(z)) < 90) any = true;
            }
          }
        }
      }
      assert.equal(ctx.voidOfCourse, !any, iso);
      if (ctx.next) assert.ok(Date.parse(ctx.next.atUtc) > t0 && Date.parse(ctx.next.atUtc) < ingress);
      if (ctx.last) assert.ok(Date.parse(ctx.last.atUtc) <= t0);
      if (ctx.voidOfCourse) vocSeen++;
      console.log(`  bilgi: ${iso} → Ay ${ctx.voidOfCourse ? "BOŞLUKTA" : `sonraki: ${ctx.next!.body} ${ctx.next!.angle}°`}; burç girişi ${new Date(ingress).toISOString().slice(0, 16)}Z`);
    }
    assert.ok(vocSeen > 0, "en az bir boşlukta Ay örneği sınanmalı");
  });

  await t("W11 sınırlar: cazimi 17′ / yanma 8°30′ AYNI BURÇ / ışın altı 17° (Lilly CA s. 113); Via Combusta 195°–225° yarı açık; dikkat noktaları (ASC <3° / ≥27°, Ay via combusta, Satürn 1/7)", () => {
    const P1 = PROFILE_LILLY_1647;
    assert.equal(solarPhase(100.28, 100, P1).phase, "cazimi");
    assert.equal(solarPhase(100.3, 100, P1).phase, "combust");
    assert.equal(solarPhase(108.5, 100, P1).phase, "combust");
    assert.equal(solarPhase(108.51, 100, P1).phase, "under_beams");
    assert.equal(solarPhase(117.01, 100, P1).phase, "free");
    // W-02 düzeltmesi (CA s. 113 "in the same Signe"): Balık 25° ↔ Koç 2° (7°) farklı burç → yanık DEĞİL, ışın altı.
    assert.equal(solarPhase(355, 2, P1).phase, "under_beams", "0° Koç üzerinden sarma + burç şartı");
    assert.equal(solarPhase(357, 359, P1).phase, "combust", "aynı burçta sarmasız");
    assert.deepEqual([inViaCombusta(194.99, P1), inViaCombusta(195, P1), inViaCombusta(224.99, P1), inViaCombusta(225, P1)], [false, true, true, false]);
    assert.deepEqual(considerations({ asc: 2.9, moon: 200, saturnHouse: 7 }, P1), ["asc_early", "moon_via_combusta", "saturn_in_7"]);
    assert.deepEqual(considerations({ asc: 57.5, moon: 29.5, saturnHouse: 1 }, P1), ["asc_late", "moon_last_degree", "saturn_in_1"]);
    assert.deepEqual(considerations({ asc: 45, moon: 100, saturnHouse: 4 }, P1), []);
  });

  console.log(`\nastrology horary-western harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
