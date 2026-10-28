/**
 * GÖKYÜZÜ ATLASI — HORARY-W-02 TEKNİK KABUL DENETİMİ (2026-10-28, owner talimatı). Yeni sağlayıcı çağrısı YOK.
 * Ekol ayrımı, doğrulanmamış değerlerin toplama girmemesi, kutup ötesi Regiomontanus (Swiss Ephemeris §6.4, 60 swetest referansı),
 * olay zamanı belirsizliği, yavaş çiftlerde eksiksizlik, geri hareket, sınıflandırma özellikleri ve olay sırası.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horaryWestern03.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Astronomy from "astronomy-engine";
import { accidentalDignity } from "@/lib/astrology/horary/western/accidental";
import { PROFILE_DOROTHEAN_EGYPTIAN, PROFILE_LILLY_1647, essentialDignity } from "@/lib/astrology/horary/western/calc";
import { buildWesternHoraryChart } from "@/lib/astrology/horary/western/chart";
import { polarLimit, regiomontanusCusps, regiomontanusCuspsBeyondPolar } from "@/lib/astrology/horary/western/houses";
import { CLASSICAL_PLANETS, type ClassicalPlanet } from "@/lib/astrology/horary/western/tables";
import { analyzePair, findIngresses, findPerfections, findStations, moonCourse } from "@/lib/astrology/horary/western/timeline";

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
const w180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
const AEB: Record<ClassicalPlanet, Astronomy.Body> = { sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars, jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn };
const L = (b: ClassicalPlanet, ms: number) => Astronomy.Ecliptic(Astronomy.GeoVector(AEB[b], Astronomy.MakeTime(new Date(ms)), true)).elon;
type PolarCase = { lat: number; lon: number; date: string; ut: string; ARMC: number } & Record<string, number | string>;
const POLAR = JSON.parse(readFileSync(join(__dirname, "fixtures", "horary-western", "swetest-regio-polar-2026-10-28.json"), "utf8")) as Record<string, PolarCase>;
const IST = { questionUtc: "2026-10-28T14:35:00Z", latitude: 41.0082, longitude: 28.9784 };

async function main() {
  // ── 1. Ekol ayrımı ─────────────────────────────────────────────────────────────────────────────
  await t("S1 dorothean-egyptian: Lilly puanı / radikallik / dikkat noktaları ÜRETİLMEZ (null/boş); devralınan Lilly eşikleri haritada listeli; koşullar yine görünür", () => {
    const c = buildWesternHoraryChart({ ...IST, profile: PROFILE_DOROTHEAN_EGYPTIAN });
    assert.ok(!("error" in c));
    if ("error" in c) return;
    assert.deepEqual([c.methodology.scoring, c.methodology.radicality, c.methodology.considerations], [null, null, null]);
    assert.deepEqual(c.methodology.inheritedFromLilly, ["combust", "combustSameSign", "underBeams", "cazimi", "viaCombusta", "voc", "ascEarly", "ascLate"]);
    assert.equal(c.radicality, null);
    assert.deepEqual(c.considerations, []);
    for (const p of c.planets) {
      assert.equal(p.essential.score, null, p.planet);
      assert.equal(p.accidental.total, null, p.planet);
      assert.equal(p.accidental.scheme, null);
      assert.ok(p.accidental.items.length > 0 && p.accidental.items.every((i) => i.points === null), p.planet);
      for (const m of p.mutualReception) assert.equal(m.points, null);
    }
    // Asalet KOŞULLARI (tablolar) profilin kendi tablosuyla: Mars Aslan 16°53′ gündüz → Dorothean ateş gündüz Güneş, Mısır terimi Satürn 11–18.
    const mars = c.planets.find((p) => p.planet === "mars")!;
    assert.deepEqual([mars.essential.rulers.triplicity, mars.essential.rulers.participating, mars.essential.rulers.term], ["sun", "saturn", "saturn"]);
  });

  await t("S2 lilly-1647: puan, radikallik (Lilly üçlüsü) ve dikkat noktaları üretilir; puan şeması beyan edilir; devralınan alan yok", () => {
    const c = buildWesternHoraryChart({ ...IST, profile: PROFILE_LILLY_1647 });
    assert.ok(!("error" in c));
    if ("error" in c) return;
    assert.deepEqual([c.methodology.scoring, c.methodology.radicality, c.methodology.considerations, c.methodology.inheritedFromLilly.length], ["lilly_ca115", "lilly_ca121", "lilly_ca121_123", 0]);
    assert.ok(c.radicality && c.planets.every((p) => typeof p.essential.score === "number" && typeof p.accidental.total === "number"));
    const mars = c.planets.find((p) => p.planet === "mars")!;
    // Lilly terimleri Aslan: Satürn 0–6, Merkür 6–13, Venüs 13–19 → Mars 16°53′ Venüs teriminde.
    assert.deepEqual([mars.essential.rulers.triplicity, mars.essential.rulers.participating, mars.essential.rulers.term], ["sun", null, "venus"]);
  });

  await t("S3 aynı gezegen, iki profil: asal puan Lilly'de sayı, Dorothean'da null — Lilly puan tablosu başka ekole SIZMAZ", () => {
    assert.equal(essentialDignity("sun", 19, true, PROFILE_LILLY_1647).score, 8);
    assert.equal(essentialDignity("sun", 19, true, PROFILE_DOROTHEAN_EGYPTIAN).score, null);
  });

  await t("S4 doğrulanmamış kalem toplama girmez: 1647 yıldız dereceleri açıkken Regulus kalemi listelenir (verified=false) ama toplam değişmez", () => {
    const pos = { saturn: 9.5, jupiter: 200, mars: 300, sun: 215.2, venus: 208, mercury: 229.6, moon: 68.3 } as Record<ClassicalPlanet, number>;
    const base = { planet: "jupiter" as const, lon: 144.2, speed: 0.12, house: 5, positions: { ...pos, jupiter: 144.2 }, northNode: null };
    const off = accidentalDignity({ ...base, stars: { mode: "none", orb: null } }, PROFILE_LILLY_1647);
    const on = accidentalDignity({ ...base, stars: { mode: "lilly1647", orb: 1 } }, PROFILE_LILLY_1647);
    const reg = on.items.find((i) => i.key === "regulus_1647");
    assert.ok(reg && reg.verified === false && reg.points === 6);
    assert.equal(on.total, off.total);
    assert.equal(on.excludedUnverified, 1);
  });

  // ── 3. Kutup ───────────────────────────────────────────────────────────────────────────────────
  await t("P1 kutup ötesi Regiomontanus (SE §6.4 MC↔IC kuralı) ↔ Swiss Ephemeris swetest: 60 an (±66/67/70/80/89°) → 60/60 ≤1″; takas yalnız MC ufuk altındayken", () => {
    let worst = 0;
    let swapped = 0;
    for (const [id, k] of Object.entries(POLAR)) {
      const [d, m, y] = String(k.date).split(".");
      const ms = Date.parse(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${k.ut}Z`);
      const eps = Astronomy.e_tilt(Astronomy.MakeTime(new Date(ms))).tobl;
      const r = regiomontanusCuspsBeyondPolar(k.ARMC, k.lat, eps);
      for (let i = 0; i < 12; i++) worst = Math.max(worst, Math.abs(w180(r.cusps[i] - (k[`house${i + 1}`] as number))) * 3600);
      if (r.mcIcSwapped) {
        swapped++;
        assert.ok(r.clockwise && Math.abs(k.lat) > polarLimit(eps), id);
      }
    }
    console.log(`  bilgi: en büyük fark ${worst.toFixed(3)}″; MC↔IC takası ${swapped}/60 (hepsi |φ| > 90° − ε)`);
    assert.ok(worst <= 1 && swapped === 14);
  });

  await t("P2 güvenlik engeli SÜRER: harita ve regiomontanusCusps |φ| ≥ 90° − ε'da hata döner; sınır altında iki fonksiyon aynı (takas yok)", () => {
    const eps = 23.4379;
    for (const lat of [66.6, 67, 70, 80, 89, -67, -89]) {
      const r = regiomontanusCusps(150, lat, eps);
      assert.ok(!Array.isArray(r) && r.error === "polar_latitude");
      const c = buildWesternHoraryChart({ questionUtc: "2026-12-21T12:00:00Z", latitude: lat, longitude: 10, profile: PROFILE_LILLY_1647 });
      assert.ok("error" in c && c.error === "polar_latitude");
    }
    for (const lat of [0, 41, 66, -54.8, -66]) for (const ramc of [0, 77, 150, 233, 359]) {
      const a = regiomontanusCusps(ramc, lat, eps) as number[];
      const b = regiomontanusCuspsBeyondPolar(ramc, lat, eps);
      assert.ok(!b.mcIcSwapped && !b.clockwise);
      for (let i = 0; i < 12; i++) assert.ok(Math.abs(w180(a[i] - b.cusps[i])) < 1e-6);
    }
  });

  // ── 4. Zamanlama ───────────────────────────────────────────────────────────────────────────────
  await t("T1 zaman belirsizliği efemeris farkından: Ay kesinleşmesi/girişi < 5 dk; Jüpiter–Satürn > 1 sa; istasyon > 1 dk (yüksek ivme); kök hassasiyeti ayrı (1 sn)", () => {
    const t0 = Date.parse("2026-11-03T00:00:00Z");
    const moon = findPerfections("moon", "saturn", t0, t0 + 30 * 86_400_000)[0];
    assert.ok(moon.uncertaintySec > 10 && moon.uncertaintySec < 300, String(moon.uncertaintySec));
    const ing = findIngresses("moon", t0, t0 + 3 * 86_400_000)[0];
    assert.ok(ing.uncertaintySec < 300);
    const js = findPerfections("jupiter", "saturn", Date.parse("2026-01-01T00:00:00Z"), Date.parse("2029-01-01T00:00:00Z"))[0];
    assert.ok(js && js.uncertaintySec > 3600, js && String(js.uncertaintySec));
    const st = findStations("mercury", Date.parse("2026-01-01T00:00:00Z"), Date.parse("2027-01-01T00:00:00Z"));
    assert.ok(st.every((s) => s.uncertaintySec > 60 && Number.isFinite(s.uncertaintySec)));
    console.log(`  bilgi: Ay–Satürn ±${moon.uncertaintySec.toFixed(0)} sn · Ay girişi ±${ing.uncertaintySec.toFixed(0)} sn · Jüpiter–Satürn ${js.angle}° ${js.atUtc} ±${(js.uncertaintySec / 3600).toFixed(1)} sa · Merkür istasyonu ±${(Math.min(...st.map((s) => s.uncertaintySec)) / 60).toFixed(0)}–${(Math.max(...st.map((s) => s.uncertaintySec)) / 60).toFixed(0)} dk`);
  });

  await t("T2 yavaş çiftlerde eksiksizlik (istasyon yakınında çift kök kaçmaz): Mars–Jüpiter, Jüpiter–Satürn, Venüs–Satürn 2026 — kütüphane ↔ bağımsız 1 saatlik tarama aynı sayı ve açı sırası", () => {
    const t0 = Date.parse("2026-01-01T00:00:00Z");
    const t1 = Date.parse("2027-01-01T00:00:00Z");
    for (const [a, b] of [["mars", "jupiter"], ["jupiter", "saturn"], ["venus", "saturn"]] as [ClassicalPlanet, ClassicalPlanet][]) {
      const lib = findPerfections(a, b, t0, t1).map((p) => p.angle);
      const brute: { ms: number; angle: number }[] = [];
      for (const ang of [0, 60, 90, 120, 180]) for (const tg of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
        let prev = w180(L(a, t0) - L(b, t0) - tg);
        for (let ms = t0 + 3_600_000; ms <= t1; ms += 3_600_000) {
          const cur = w180(L(a, ms) - L(b, ms) - tg);
          if (Math.sign(prev) !== Math.sign(cur) && Math.abs(prev - cur) < 90) brute.push({ ms, angle: ang });
          prev = cur;
        }
      }
      brute.sort((x, y) => x.ms - y.ms);
      assert.deepEqual(lib, brute.map((x) => x.angle), `${a}–${b}`);
      console.log(`  bilgi: ${a}–${b} 2026: ${lib.length} kesinleşme`);
    }
  });

  await t("T3 geri hareket: 2026 Merkür geri döneminde (24 Eki–13 Kas) Merkür–Güneş kavuşumu bulunur, Merkür hızı < 0; geri burç girişi işaretli (Venüs Akrep→Terazi)", () => {
    const p = findPerfections("mercury", "sun", Date.parse("2026-10-24T08:00:00Z"), Date.parse("2026-11-13T15:00:00Z")).filter((x) => x.angle === 0);
    assert.equal(p.length, 1);
    assert.ok(p[0].aSpeed < 0);
    const v = findIngresses("venus", Date.parse("2026-10-01T00:00:00Z"), Date.parse("2026-11-30T00:00:00Z"));
    assert.ok(v.some((g) => g.retrograde && g.from === "scorpio" && g.to === "libra"));
    console.log(`  bilgi: Merkür–Güneş iç kavuşum ${p[0].atUtc} (Merkür ${p[0].aSpeed.toFixed(3)}°/g)`);
  });

  await t("T4 sınıflandırma ÖZELLİKLERİ (Lilly CA s. 110–112 tanımları) 10 an × 3 çift: prohibition → üçüncü gezegen daha hızlı; frustration → yaklaşılan (ağır) gösterge üçüncüye yaklaşır; tümü a–b kesinleşmesinden önce ve sıralı", () => {
    const seen = { prohibition: 0, frustration: 0, faster_significator_elsewhere: 0 };
    for (let k = 0; k < 10; k++) {
      const ms = Date.parse("2026-02-01T06:00:00Z") + k * 31 * 86_400_000;
      for (const [a, b] of [["moon", "venus"], ["mercury", "mars"], ["sun", "jupiter"]] as [ClassicalPlanet, ClassicalPlanet][]) {
        const pa = analyzePair(a, b, ms, 60, () => []);
        if (!pa.perfection) {
          assert.equal(pa.interpositions.length, 0);
          continue;
        }
        let prev = -Infinity;
        const swift = pa.perfection.applier; // a–b kesinleşmesinde yaklaşan gösterge
        for (const i of pa.interpositions) {
          assert.ok(i.ms >= prev && i.ms < pa.perfection.ms);
          prev = i.ms;
          const sigSpeed = Math.abs(i.a === i.significator ? i.aSpeed : i.bSpeed);
          const thirdSpeed = Math.abs(i.a === i.third ? i.aSpeed : i.bSpeed);
          if (i.kind === "prohibition") assert.ok(thirdSpeed >= sigSpeed);
          else assert.ok(sigSpeed > thirdSpeed);
          if (i.kind === "frustration") assert.notEqual(i.significator, swift, "hüsran yalnız ağır (yaklaşılan) göstergede");
          if (i.kind === "faster_significator_elsewhere") assert.equal(i.significator, swift);
          seen[i.kind]++;
        }
      }
    }
    console.log(`  bilgi: ${JSON.stringify(seen)}`);
    assert.ok(seen.prohibition > 0);
  });

  await t("T5 Lilly s. 125 aktarma kabul şartı yalnız ev / üçlü / terim: yücelme ve yüz kabulü `judgement.ok` üretmez (s. 111 tanımı etkilenmez)", () => {
    const ms = Date.parse("2026-10-28T14:35:00Z");
    const ex = analyzePair("mars", "saturn", ms, 120, () => ["exaltation", "face"]);
    const tr = ex.translations.find((x) => x.by === "moon")!;
    assert.ok(tr.introduction && tr.judgement.receivedBy.length === 0 && tr.judgement.ok === false);
    const dom = analyzePair("mars", "saturn", ms, 120, () => ["term"]);
    const tr2 = dom.translations.find((x) => x.by === "moon")!;
    assert.ok(tr2.judgement.ok === true && tr2.judgement.receivedBy[0] === "term");
  });

  await t("T6 burç sınırında Ay: girişten 60 sn önce sonraki açılar girişten önce; 60 sn sonra burç değişmiş ve önceki burcun açıları sayılmaz", () => {
    const g = findIngresses("moon", Date.parse("2026-11-05T00:00:00Z"), Date.parse("2026-11-08T00:00:00Z"))[0];
    const before = moonCourse(g.ms - 60_000);
    const after = moonCourse(g.ms + 60_000);
    assert.notEqual(before.sign, after.sign);
    for (const e of before.nextInSign) assert.ok(e.ms < g.ms);
    for (const e of after.nextInSign) assert.ok(e.ms > g.ms + 60_000);
    assert.ok(Math.abs(Date.parse(before.ingressUtc) - g.ms) <= 1000);
  });

  await t("T7 tüm olay listeleri artan sırada; kesinleşme anında hedef açı hatası ≤1″ (Ptolemaik 5 açı, 7 gezegen çifti, 2026 Kasım)", () => {
    const t0 = Date.parse("2026-11-01T00:00:00Z");
    for (let i = 0; i < CLASSICAL_PLANETS.length; i++) for (let j = i + 1; j < CLASSICAL_PLANETS.length; j++) {
      const a = CLASSICAL_PLANETS[i];
      const b = CLASSICAL_PLANETS[j];
      const ev = findPerfections(a, b, t0, t0 + 30 * 86_400_000);
      for (let k = 1; k < ev.length; k++) assert.ok(ev[k].ms >= ev[k - 1].ms);
      for (const e of ev) {
        const sep = w180(L(a, e.ms) - L(b, e.ms));
        const err = Math.min(...[e.angle, -e.angle].map((x) => Math.abs(w180(sep - x))));
        assert.ok(err * 3600 <= 1, `${a}–${b} ${e.angle} ${e.atUtc} ${err * 3600}″`);
      }
    }
  });

  console.log(`\nastrology horary-western-03 (kabul denetimi) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
