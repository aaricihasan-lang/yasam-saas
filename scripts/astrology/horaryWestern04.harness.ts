/**
 * GÖKYÜZÜ ATLASI — H-04 (2026-10-28): Lilly orb varyantları, 5° klasik ev etkisi, tek taraflı / karşılıklı yaklaşma.
 * Yeni ücretli sağlayıcı çağrısı YOK. Beklenen sonuçlar üretim fonksiyonundan TÜRETİLMEZ:
 *   • Swiss Ephemeris 2.10.04 + DE441 (astro.com swetest; fixtures/horary-western/swetest-h04-2026-10-28.json + ham metin):
 *     her olay için T−1 sa / T / T+1 sa boylam ve hız. Kimin noktaya doğru hareket ettiği YER DEĞİŞTİRME yöntemiyle (yalnız bir
 *     gövdeyi 1 saat ilerletince açı hatası küçülüyor mu) bağımsız hesaplanır.
 *   • Lilly Christian Astrology 1647: s. 107 (orb tablosu + platik örnek, görsel), s. 110 (ayrılma örnekleri, OCR), s. 112 (kabul
 *     örnekleri, görsel), Kitap III Regiomontanus kutupları (OCR), Kitap III gezegen saati örneği (OCR), s. 107–108 yaklaşma türleri.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horaryWestern04.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Astronomy from "astronomy-engine";
import { PROFILE_DOROTHEAN_EGYPTIAN, PROFILE_LILLY_1647, PROFILE_LILLY_1647_ALT_ORBS, receptionsOf } from "@/lib/astrology/horary/western/calc";
import { buildWesternHoraryChart, planetaryHour } from "@/lib/astrology/horary/western/chart";
import { houseOf, lillyHouseOfVirtue, regiomontanusCusps, risingLongitude } from "@/lib/astrology/horary/western/houses";
import { ORB_VARIANTS, moietyLimit, type ClassicalPlanet } from "@/lib/astrology/horary/western/tables";
import { STATION_SPEED, analyzePair, classifyApproach, findPerfections, findStations, lonAt, speedAt, type Body } from "@/lib/astrology/horary/western/timeline";

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
const n360 = (x: number) => ((x % 360) + 360) % 360;

type Row = { t: string; body: string; lon: number; speed: number };
const SWE = JSON.parse(readFileSync(join(__dirname, "fixtures", "horary-western", "swetest-h04-2026-10-28.json"), "utf8")) as Record<string, { centerUtc: string; rows: Row[] }>;
const NAME: Record<string, Body> = { Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn" };
const sweAt = (id: string, body: Body, k: 0 | 1 | 2) => SWE[id].rows.filter((r) => NAME[r.body] === body)[k];

/** BAĞIMSIZ beklenti: SE konumlarından, yer değiştirme yöntemiyle kimin noktaya doğru gittiği + Lilly s. 107–108 türü. */
function expectFromSE(id: string, a: Body, b: Body, angle: number) {
  const a0 = sweAt(id, a, 0), a1 = sweAt(id, a, 1), a2 = sweAt(id, a, 2);
  const b0 = sweAt(id, b, 0), b1 = sweAt(id, b, 1), b2 = sweAt(id, b, 2);
  const targets = angle === 0 || angle === 180 ? [angle] : [angle, 360 - angle];
  const err = (la: number, lb: number, tg: number) => w180(la - lb - tg);
  // T−1 sa ile T+1 sa arasında işaret değiştiren hedef (kesinleşme bu aralıkta).
  const tg = targets.find((x) => Math.sign(err(a0.lon, b0.lon, x)) !== Math.sign(err(a2.lon, b2.lon, x)) && Math.abs(err(a0.lon, b0.lon, x)) < 5);
  assert.ok(tg !== undefined, `${id}: SE verisinde ±1 sa içinde kesinleşme yok`);
  const f0 = Math.abs(err(a0.lon, b0.lon, tg!));
  // Yalnız bir gövde 1 dakika ilerler (SE konumları arasında doğrusal ara değer; 1 saatlik adım küçük göreli hızda noktayı aşabilir).
  const step = (p0: number, p1: number) => p0 + w180(p1 - p0) / 60;
  const aToward = Math.abs(err(step(a0.lon, a1.lon), b0.lon, tg!)) < f0 && Math.abs(a1.speed) * 3600 > 2;
  const bToward = Math.abs(err(a0.lon, step(b0.lon, b1.lon), tg!)) < f0 && Math.abs(b1.speed) * 3600 > 2;
  const approach = aToward && bToward ? "mutual" : aToward ? "a" : bToward ? "b" : "none";
  const sup = ["saturn", "jupiter", "mars"], inf = ["venus", "mercury", "moon"];
  let lilly: string;
  if (approach === "mutual") lilly = "direct_and_retrograde";
  else if (approach === "none") lilly = "station_unresolved";
  else if (a1.speed < 0 && b1.speed < 0) lilly = "both_retrograde";
  else {
    const mover = approach === "a" ? a : b;
    const other = mover === a ? b : a;
    lilly = sup.includes(mover) && inf.includes(other) ? "superior_overtakes_inferior_unresolved" : "direct_swifter_to_slower";
  }
  return { approach, aToward, bToward, lilly, f0, speeds: [a1.speed, b1.speed] };
}
function libEvent(a: Body, b: Body, angle: number, centerIso: string) {
  const c = Date.parse(centerIso);
  const ev = findPerfections(a, b, c - 6 * 3_600_000, c + 6 * 3_600_000).filter((p) => p.angle === angle);
  assert.equal(ev.length, 1, `${a}–${b} ${angle} ${centerIso}: kütüphane olayı`);
  return ev[0];
}

async function main() {
  // ── H-04-01 Orb varyantları ─────────────────────────────────────────────────────────────────────
  await t("O1 CA 1647 s. 107 iki sütun (tıpkıbasım görseli): birinci Satürn 10 / Jüpiter 12 / Mars 7°30′ / Güneş 17 / Venüs 8 / Merkür 7 / Ay 12°30′; ikinci 9 / 9 / 7 / 15 / 7 / 7 / 12; varsayılan birinci; sütunlar karışmaz", () => {
    assert.deepEqual(ORB_VARIANTS.lilly_ca107_primary, { saturn: 10, jupiter: 12, mars: 7.5, sun: 17, venus: 8, mercury: 7, moon: 12.5 });
    assert.deepEqual(ORB_VARIANTS.lilly_ca107_alternate, { saturn: 9, jupiter: 9, mars: 7, sun: 15, venus: 7, mercury: 7, moon: 12 });
    assert.equal(PROFILE_LILLY_1647.orbVariant, "lilly_ca107_primary");
    assert.equal(PROFILE_LILLY_1647_ALT_ORBS.orbVariant, "lilly_ca107_alternate");
    // Yanma 8°30′ = birinci sütundaki Güneş orbunun yarısı (CA s. 113 "moiety of his owne Orbs").
    assert.equal(ORB_VARIANTS.lilly_ca107_primary.sun / 2, PROFILE_LILLY_1647.combust);
  });

  await t("O2 Lilly'nin kendi örnekleri (sınır, kapsayıcı ≤): s. 107 platik üçgen ♀ Boğa 10° – ♄ Başak 18° (8° sapma) birinci sütun sınırı 5 + 4 = 9 içinde; ikinci sütunda 4°30′ + 3°30′ = 8 tam sınırda; s. 110 ☉–☽ ayrılması 7°30′ + 6° = 13°30′ (ikinci sütun) ve ♄–♃ 4°30′ + 4°30′ = 9 (ikinci sütun)", () => {
    const sep = Math.abs(w180(168 - 40 - 120));
    assert.equal(sep, 8);
    assert.equal(moietyLimit("venus", "saturn", ORB_VARIANTS.lilly_ca107_primary), 9);
    assert.equal(moietyLimit("venus", "saturn", ORB_VARIANTS.lilly_ca107_alternate), 8);
    assert.ok(sep <= moietyLimit("venus", "saturn", ORB_VARIANTS.lilly_ca107_primary) && sep <= moietyLimit("venus", "saturn", ORB_VARIANTS.lilly_ca107_alternate));
    assert.equal(moietyLimit("sun", "moon", ORB_VARIANTS.lilly_ca107_alternate), 13.5);
    assert.equal(moietyLimit("saturn", "jupiter", ORB_VARIANTS.lilly_ca107_alternate), 9);
    assert.equal(moietyLimit("sun", "moon", ORB_VARIANTS.lilly_ca107_primary), 14.75);
    // Sınırın hemen üstü/altı (kapsayıcı): 9,000 içinde, 9,001 dışında.
    assert.ok(9 <= moietyLimit("venus", "saturn") && !(9.001 <= moietyLimit("venus", "saturn")));
  });

  await t("O3 haritada varyant izlenebilir ve gerçekten farklı sonuç verir: İstanbul 2026-10-28 14:35Z birincil 10 / ikincil 9 açı; methodology.orbVariant + orbs değerleri saklanır; Dorothean profili orbu Lilly'den devralır ve bunu beyan eder", () => {
    const base = { questionUtc: "2026-10-28T14:35:00Z", latitude: 41.0082, longitude: 28.9784 };
    const p = buildWesternHoraryChart({ ...base, profile: PROFILE_LILLY_1647 });
    const q = buildWesternHoraryChart({ ...base, profile: PROFILE_LILLY_1647_ALT_ORBS });
    const d = buildWesternHoraryChart({ ...base, profile: PROFILE_DOROTHEAN_EGYPTIAN });
    assert.ok(!("error" in p) && !("error" in q) && !("error" in d));
    if ("error" in p || "error" in q || "error" in d) return;
    assert.deepEqual([p.methodology.orbVariant, q.methodology.orbVariant], ["lilly_ca107_primary", "lilly_ca107_alternate"]);
    assert.deepEqual(p.methodology.orbs, ORB_VARIANTS.lilly_ca107_primary);
    assert.deepEqual([p.aspects.length, q.aspects.length], [10, 9]);
    assert.ok(d.methodology.inheritedFromLilly.includes("orbVariant"));
    // Aynı an, aynı çift: sınır gerçekten varyanta göre değişiyor (orb değerleri dışında hiçbir şey farklı değil).
    for (const x of p.aspects) assert.ok(x.orb <= moietyLimit(x.a, x.b, ORB_VARIANTS.lilly_ca107_primary));
    for (const x of q.aspects) assert.ok(x.orb <= moietyLimit(x.a, x.b, ORB_VARIANTS.lilly_ca107_alternate));
    assert.deepEqual(p.cusps, q.cusps);
  });

  // ── H-04-02 5° klasik ev etkisi ─────────────────────────────────────────────────────────────────
  const EQ = Array.from({ length: 12 }, (_, i) => n360(15 + i * 30)); // cusp 1 = 15°, eşit 30° (sentetik)
  await t("V1 5° kuralı sınırları (sentetik eşit evler): cusp − 5° tam → sonraki ev; − 5,0001° → geometrik ev; − 4,9999° → sonraki; + 3° → kendi evi; geometrik ev HİÇBİR durumda değişmez", () => {
    const at = (lon: number) => lillyHouseOfVirtue(lon, EQ);
    for (let h = 1; h <= 12; h++) {
      const c = EQ[h - 1];
      const prev = h === 1 ? 12 : h - 1;
      assert.deepEqual([at(n360(c - 5)).geometricHouse, at(n360(c - 5)).virtueHouse, at(n360(c - 5)).shifted], [prev, h, true], `tam 5° h${h}`);
      assert.deepEqual([at(n360(c - 5.0001)).virtueHouse, at(n360(c - 5.0001)).shifted], [prev, false], `5,0001° h${h}`);
      assert.equal(at(n360(c - 4.9999)).virtueHouse, h);
      assert.deepEqual([at(n360(c + 3)).geometricHouse, at(n360(c + 3)).virtueHouse, at(n360(c + 3)).shifted], [h, h, false]);
      assert.equal(at(n360(c - 4)).geometricHouse, houseOf(n360(c - 4), EQ));
    }
  });

  await t("V2 0°/360° geçişi ve dar ev: cusp 1 = 0,5° iken 356° (4,5° önce) → 1. ev; 355,4° (5,1°) → 12. ev; iki cusp eşit uzaklıkta (8° genişliğinde ev, orta nokta) → belirsiz, geometrik ev korunur", () => {
    const W = Array.from({ length: 12 }, (_, i) => n360(0.5 + i * 30));
    assert.deepEqual([lillyHouseOfVirtue(356, W).geometricHouse, lillyHouseOfVirtue(356, W).virtueHouse], [12, 1]);
    assert.deepEqual([lillyHouseOfVirtue(355.4, W).geometricHouse, lillyHouseOfVirtue(355.4, W).virtueHouse], [12, 12]);
    const N = [0, 8, 60, 90, 120, 150, 180, 188, 240, 270, 300, 330];
    const mid = lillyHouseOfVirtue(4, N);
    assert.deepEqual([mid.geometricHouse, mid.virtueHouse, mid.ambiguous, mid.shifted], [1, 1, true, false]);
  });

  await t("V3 gerçek Regiomontanus haritası (İstanbul, 2026-10-28): 5° içinde ASC'nin üstündeki gezegen → geometrik 12, etki 1; arızi ev kalemi 12. ev −5 yerine 1. ev +5; Dorothean profilde (kural yok) geometrik ev kullanılır", () => {
    let hit: string | null = null;
    for (let m = 0; m < 1440 && !hit; m += 3) {
      const iso = new Date(Date.parse("2026-10-28T00:00:00Z") + m * 60_000).toISOString();
      const c = buildWesternHoraryChart({ questionUtc: iso, latitude: 41.0082, longitude: 28.9784, profile: PROFILE_LILLY_1647 });
      if ("error" in c) continue;
      const pl = c.planets.find((p) => p.house === 12 && p.houseVirtue?.virtueHouse === 1 && p.houseVirtue.distanceToNearestCusp > 2 && p.houseVirtue.distanceToNearestCusp < 4);
      if (!pl) continue;
      hit = `${iso} ${pl.planet} ${pl.houseVirtue!.distanceToNearestCusp.toFixed(2)}°`;
      // Bağımsız: ASC'ye uzaklık = cusp 1 − boylam (ekliptik).
      assert.ok(Math.abs(w180(c.cusps[0] - pl.lon) - pl.houseVirtue!.distanceToNearestCusp) < 1e-9);
      assert.ok(pl.accidental.items.some((i) => i.key === "house_1" && i.points === 5) && !pl.accidental.items.some((i) => i.key === "house_12"));
      assert.equal(c.methodology.accidentalHouseBasis, "virtue");
      const d = buildWesternHoraryChart({ questionUtc: iso, latitude: 41.0082, longitude: 28.9784, profile: PROFILE_DOROTHEAN_EGYPTIAN });
      assert.ok(!("error" in d));
      if ("error" in d) return;
      const dp = d.planets.find((p) => p.planet === pl.planet)!;
      assert.equal(dp.houseVirtue, null);
      assert.equal(dp.house, 12);
      assert.equal(d.methodology.accidentalHouseBasis, "geometric");
    }
    assert.ok(hit, "gün içinde 2–4° aralığında örnek bulunmalı");
    console.log(`  bilgi: ${hit}`);
  });

  await t("V4 Lilly'nin metin örneği (CA I ≈ s. 35–36, OCR): ♀ Balık 10°53′, 11. ev cusp'ı Balık 17°06′ → 6°13′ önce; Lilly ♀'yi '10. evde, 11. cusp yakınında ama evde değil' çizer → 5° dışında: etki evi de 10 (tutarlı)", () => {
    // Sıralı sentetik cusp'lar: 10. ev 320°, 11. ev Balık 17°06′ (347,1°), 12. ev 17°; karşı evler +180°.
    const c10 = 320, c11 = 330 + 17 + 6 / 60, c12 = 17, c1 = 47, c2 = 77, c3 = 107;
    const cusps = [c1, c2, c3, c10 - 180, c11 - 180, c12 + 180, c1 + 180, c2 + 180, c3 + 180, c10, c11, c12];
    const v = lillyHouseOfVirtue(330 + 10 + 53 / 60, cusps);
    assert.deepEqual([v.geometricHouse, v.virtueHouse, v.shifted], [10, 10, false]);
    assert.ok(Math.abs(v.distanceToNearestCusp - (6 + 13 / 60)) < 1e-9);
  });

  // ── H-04-03 Yaklaşma ────────────────────────────────────────────────────────────────────────────
  const CASES: [string, Body, Body, number, { approach: string; lilly: string }][] = [
    ["C1-sat-jup-120-both-direct", "saturn", "jupiter", 120, { approach: "b", lilly: "direct_swifter_to_slower" }],
    ["C2-sat-mer-180-both-retro", "saturn", "mercury", 180, { approach: "b", lilly: "both_retrograde" }],
    ["C3-sat-jup-120-mutual", "saturn", "jupiter", 120, { approach: "mutual", lilly: "direct_and_retrograde" }],
    ["C4-mer-sun-0-mutual", "mercury", "sun", 0, { approach: "mutual", lilly: "direct_and_retrograde" }],
    ["C5-mer-mar-180-station-before", "mercury", "mars", 180, { approach: "a", lilly: "both_retrograde" }],
    ["C6-mer-mar-120-role-change", "mercury", "mars", 120, { approach: "a", lilly: "direct_swifter_to_slower" }],
    ["C7-mar-ven-0-superior-overtakes", "mars", "venus", 0, { approach: "a", lilly: "superior_overtakes_inferior_unresolved" }],
  ];
  await t("A1 7 gerçek olay: Swiss Ephemeris DE441'den YER DEĞİŞTİRME yöntemiyle bağımsız yaklaşma rolü ve Lilly türü = kütüphane (aToward / bToward / approach / lillyApplication); kesinleşme SE'de ±1 sa içinde; kütüphane anı ile fark belirsizlik sınırında", () => {
    for (const [id, a, b, angle, want] of CASES) {
      const exp = expectFromSE(id, a, b, angle);
      assert.deepEqual({ approach: exp.approach, lilly: exp.lilly }, want, `${id} SE beklentisi (elle belirlenen ile)`);
      const lib = libEvent(a, b, angle, SWE[id].centerUtc);
      assert.deepEqual([lib.approach, lib.aToward, lib.bToward, lib.lillyApplication], [exp.approach, exp.aToward, exp.bToward, exp.lilly], id);
      assert.equal(lib.applier, exp.approach === "a" ? a : exp.approach === "b" ? b : null);
      // SE kesinleşme anı (doğrusal ara değer) ile kütüphane anı farkı ≤ belirsizlik.
      const a0 = sweAt(id, a, 0), a2 = sweAt(id, a, 2), b0 = sweAt(id, b, 0), b2 = sweAt(id, b, 2);
      const tg = [angle, 360 - angle].find((x) => Math.sign(w180(a0.lon - b0.lon - x)) !== Math.sign(w180(a2.lon - b2.lon - x)))!;
      const e0 = w180(a0.lon - b0.lon - tg), e2 = w180(a2.lon - b2.lon - tg);
      const seMs = Date.parse(SWE[id].centerUtc) - 3_600_000 + (e0 / (e0 - e2)) * 7_200_000;
      const diff = Math.abs(seMs - lib.ms) / 1000;
      assert.ok(diff <= lib.uncertaintySec, `${id}: SE ↔ kütüphane ${diff.toFixed(0)} sn > ±${lib.uncertaintySec.toFixed(0)} sn`);
      console.log(`  bilgi: ${id.padEnd(34)} SE hız ${exp.speeds.map((x) => x.toFixed(4)).join(" / ")} → ${exp.approach} · ${exp.lilly} · an farkı ${diff.toFixed(0)} sn (±${lib.uncertaintySec.toFixed(0)})`);
    }
  });

  await t("A2 Merkür–Güneş 4 Kasım 2026 iç kavuşumu (Lilly 3. türü, s. 107: ♂ doğrudan 15 Koç, ♀ geri 17 Koç): SE'de Güneş +1,002°/g doğrudan ve az derecede, Merkür −1,307°/g geri ve çok derecede → KARŞILIKLI; eski kural yalnız 'Merkür' diyordu", () => {
    const m0 = sweAt("C4-mer-sun-0-mutual", "mercury", 0), s0 = sweAt("C4-mer-sun-0-mutual", "sun", 0);
    assert.ok(s0.speed > 0 && m0.speed < 0 && s0.lon < m0.lon, "Güneş daha az derecede doğrudan, Merkür daha çok derecede geri");
    const lib = libEvent("mercury", "sun", 0, SWE["C4-mer-sun-0-mutual"].centerUtc);
    assert.deepEqual([lib.approach, lib.applier, lib.lillyApplication], ["mutual", null, "direct_and_retrograde"]);
    assert.ok(Math.abs(lib.aSpeed) > Math.abs(lib.bSpeed), "eski mutlak hız kuralı Merkür'ü seçerdi");
  });

  await t("A3 kesinleşmeden önce istasyon + rol değişimi: Merkür 2027-02-09 geri istasyonu (SE hız işareti ±1 sa ters) Merkür–Mars karşıtlığından (02-16) önce; Mars 2027-04-01 doğrudan istasyonu → soru anı 2027-03-25'te (SE) KARŞILIKLI yaklaşma, 2027-04-21 120° kesinleşmesinde YALNIZ Merkür (rol değişti)", () => {
    for (const [id, body] of [["C5s-mercury-station-R", "mercury"], ["C6s-mars-station-D", "mars"]] as const) {
      const r = SWE[id].rows;
      assert.ok(Math.sign(r[0].speed) !== Math.sign(r[2].speed), `${id}: SE ±1 sa içinde hız işareti değişmeli`);
      const st = findStations(body, Date.parse(SWE[id].centerUtc) - 86_400_000, Date.parse(SWE[id].centerUtc) + 86_400_000);
      assert.equal(st.length, 1);
      assert.ok(Math.abs(st[0].ms - Date.parse(SWE[id].centerUtc)) <= Math.max(3_600_000, st[0].uncertaintySec * 1000));
    }
    // Soru anı (SE): 2027-03-25 12:00Z — hedef 120° için hata işareti ve yer değiştirme (1 sa).
    const q = SWE["C6t0-mer-mar-question"].rows;
    const m0 = q.find((x) => x.body === "Mercury")!, a0 = q.find((x) => x.body === "Mars")!;
    const m1 = q.filter((x) => x.body === "Mercury")[1], a1 = q.filter((x) => x.body === "Mars")[1];
    const tg = [120, 240].reduce((best, x) => (Math.abs(w180(m0.lon - a0.lon - x)) < Math.abs(w180(m0.lon - a0.lon - best)) ? x : best));
    const f0 = Math.abs(w180(m0.lon - a0.lon - tg));
    const mToward = Math.abs(w180(m0.lon + w180(m1.lon - m0.lon) / 60 - a0.lon - tg)) < f0;
    const aToward = Math.abs(w180(m0.lon - (a0.lon + w180(a1.lon - a0.lon) / 60) - tg)) < f0;
    assert.ok(a0.speed < 0 && m0.speed > 0, "soru anında Mars geri, Merkür doğrudan");
    assert.deepEqual([mToward, aToward], [true, true], "soru anında karşılıklı");
    // Kütüphane (kendi efemerisi) soru anında AYNI 120° hedefine göre rolleri — SE beklentisiyle aynı olmalı.
    const t0 = Date.parse(SWE["C6t0-mer-mar-question"].centerUtc) - 3_600_000;
    const e = w180(lonAt("mercury", t0) - lonAt("mars", t0) - tg);
    const libRoles = classifyApproach("mercury", "mars", speedAt("mercury", t0), speedAt("mars", t0), Math.sign(e));
    assert.equal(libRoles.approach, "mutual", `kütüphane soru anı rolü: ${JSON.stringify(libRoles)}`);
    const lib = libEvent("mercury", "mars", 120, SWE["C6-mer-mar-120-role-change"].centerUtc);
    assert.equal(lib.approach, "a");
    console.log(`  bilgi: soru anı f=${f0.toFixed(2)}° karşılıklı → kesinleşmede tek taraflı (Merkür); Mars istasyonu ${new Date(Date.parse(SWE["C6s-mars-station-D"].centerUtc)).toISOString().slice(0, 16)}Z`);
  });

  await t("A4 üst gezegen alt gezegeni fiziksel yakalıyor: Mars–Venüs kavuşumu 2022-02-16 (SE: Mars 0,738 > Venüs 0,581°/g, ikisi doğrudan) → fiziksel olarak tek taraflı Mars; CA s. 108 'superiour Planets doe not apply to the inferiour' ile çeliştiği için Lilly türü ÇÖZÜLEMEZ (unresolved) — isim uydurulmaz", () => {
    const lib = libEvent("mars", "venus", 0, SWE["C7-mar-ven-0-superior-overtakes"].centerUtc);
    assert.deepEqual([lib.approach, lib.applier, lib.lillyApplication], ["a", "mars", "superior_overtakes_inferior_unresolved"]);
  });

  await t("A5 istasyon eşiği: |hız| ≤ 2″/gün gövde 'noktaya doğru' sayılmaz; eşik hız hatası sınırının 2 katı", () => {
    assert.ok(Math.abs(STATION_SPEED - 2 / 3600) < 1e-15);
  });

  // ── Engelleme / hüsran / refranation etkisi ─────────────────────────────────────────────────────
  await t("I1 karşılıklı ara olay sınıflandırılmaz: Venüs–Mars 90° (2026-10-10) öncesi Venüs–Ay 120° (2026-10-03, Venüs istasyon yakınında geri −0,005°/g, Ay +14°/g; SE'den bağımsız değil, kinematik) → kind 'unresolved', neden 'event_mutual'; eski kural 'prohibition' derdi", () => {
    const pa = analyzePair("venus", "mars", Date.parse("2026-10-01T06:00:00Z"), 60, () => []);
    const u = pa.interpositions.find((i) => i.third === "moon" && i.angle === 120 && i.atUtc.startsWith("2026-10-03"));
    assert.ok(u, "Venüs–Ay olayı bulunmalı");
    assert.deepEqual([u!.kind, u!.unresolvedReason, u!.approach], ["unresolved", "event_mutual", "mutual"]);
    // Eski kural: |Ay| > |Venüs| → applier = Ay = üçüncü → "prohibition".
    assert.ok(Math.abs(u!.a === "moon" ? u!.aSpeed : u!.bSpeed) > Math.abs(u!.a === "venus" ? u!.aSpeed : u!.bSpeed));
  });

  await t("I2 refranation değişmedi (istasyon + yerel minimum geometrisi; yaklaşma rolünden bağımsız) ve ışık aktarımı Ay örneği aynı kaldı (İstanbul 2026-10-28 Mars→Satürn)", () => {
    const st = findStations("mercury", Date.parse("2026-01-01T00:00:00Z"), Date.parse("2027-01-01T00:00:00Z")).filter((s) => s.kind === "retrograde");
    let seen = 0;
    for (const s of st) for (const o of ["sun", "venus", "mars", "jupiter", "saturn"] as ClassicalPlanet[]) {
      const pa = analyzePair("mercury", o, s.ms - 5 * 86_400_000, 40, () => []);
      if (pa.refranation) {
        seen++;
        assert.ok(pa.refranation.minOrb > 0 && pa.refranation.stations.length > 0);
      }
    }
    assert.equal(seen, 1);
    const tr = analyzePair("mars", "saturn", Date.parse("2026-10-28T14:35:00Z"), 120, () => []).translations.find((x) => x.by === "moon");
    assert.ok(tr && tr.introduction && tr.from === "mars" && tr.to === "saturn");
  });

  // ── Lilly tarihî örnekleri ──────────────────────────────────────────────────────────────────────
  await t("L1 CA s. 112 kabul örnekleri (tıpkıbasım görseli): ☉ Koç + ♂ Aslan = ev kabulü (karşılıklı); ♀ Koç + ☉ Boğa = gündüz üçlü kabulü (gece yok); ♀ Koç 24° + ♂ İkizler 16° = terim kabulü (karşılıklı)", () => {
    const P = PROFILE_LILLY_1647;
    assert.ok(receptionsOf(10, "mars", true, P).includes("domicile") && receptionsOf(130, "sun", true, P).includes("domicile"));
    assert.ok(receptionsOf(10, "sun", true, P).includes("triplicity") && receptionsOf(40, "venus", true, P).includes("triplicity"));
    assert.ok(!receptionsOf(10, "sun", false, P).includes("triplicity") && !receptionsOf(40, "venus", false, P).includes("triplicity"));
    assert.ok(receptionsOf(24, "mars", true, P).includes("term") && receptionsOf(76, "venus", true, P).includes("term"));
  });

  await t("L2 Lilly Kitap III Regiomontanus kutupları (OCR): 53° enlemde 11./3. ev kutbu 33°34′, 12./2. ev kutbu 48°59′ — bu kutuplarla doğan noktalar #591 cusp'larıyla ≤1′ yuvarlama içinde", () => {
    const lat = 53;
    const eps = 23.45;
    for (const ramc of [0, 47, 123, 250]) {
      const c = regiomontanusCusps(ramc, lat, eps) as number[];
      const c11 = risingLongitude(ramc + 30 - 90, 33 + 34 / 60, eps);
      const c12 = risingLongitude(ramc + 60 - 90, 48 + 59 / 60, eps);
      assert.ok(Math.abs(w180(c[10] - c11)) * 60 < 2.5 && Math.abs(w180(c[11] - c12)) * 60 < 2.5, `RAMC ${ramc}: ${(w180(c[10] - c11) * 60).toFixed(2)}′ ${(w180(c[11] - c12) * 60).toFixed(2)}′`);
    }
    const pole11 = (Math.atan(Math.tan((lat * Math.PI) / 180) * 0.5) * 180) / Math.PI;
    const pole12 = (Math.atan(Math.tan((lat * Math.PI) / 180) * Math.sin(Math.PI / 3)) * 180) / Math.PI;
    assert.ok(Math.abs(pole11 - (33 + 34 / 60)) * 60 < 1 && Math.abs(pole12 - (48 + 59 / 60)) * 60 < 1);
    console.log(`  bilgi: formül kutupları ${pole11.toFixed(4)}° / ${pole12.toFixed(4)}° ↔ Lilly 33°34′ / 48°59′`);
  });

  await t("L3 Lilly Kitap III gezegen saati örneği (OCR): Pazartesi 15 Mart 1647 Jülyen (= 25 Mart 1647 Gregoryen) Londra — günün yöneticisi Ay; sıra Ay→Satürn→Jüpiter→Mars; Lilly'nin sorduğu 9:30 (yerel görünür zaman) Mars saatinde; Lilly gün doğumu 5:47, saat ≈ 64 dk — farklar raporlanır", () => {
    const greg = Date.UTC(1647, 2, 25);
    assert.equal(new Date(greg).getUTCDay(), 1, "25.03.1647 Gregoryen = Pazartesi");
    const lat = 51.5;
    const lon = -0.13;
    const obs = new Astronomy.Observer(lat, lon, 0);
    // Yerel görünür zaman (LAT) = Güneş saat açısı + 12 sa.
    const latOf = (ms: number) => ((Astronomy.HourAngle(Astronomy.Body.Sun, new Date(ms), obs) + 12) % 24) * 60; // dk
    // 09:30 LAT'ı bul (dakika taraması).
    let q = greg;
    for (let m = 0; m < 1440; m++) {
      const ms = greg + m * 60_000;
      if (Math.abs(latOf(ms) - 570) < 0.5) {
        q = ms;
        break;
      }
    }
    const h = planetaryHour(q, lat, lon);
    assert.ok(h, "saat hesaplanmalı");
    assert.equal(h!.dayRuler, "moon");
    assert.equal(h!.hourNumber, 4);
    assert.equal(h!.hourRuler, "mars");
    const len = Date.parse(h!.endUtc) - Date.parse(h!.startUtc);
    const first = planetaryHour(Date.parse(h!.startUtc) - 3 * len + 60_000, lat, lon)!;
    assert.equal(first.hourRuler, "moon");
    const sunriseLat = latOf(Date.parse(first.startUtc));
    const lenMin = (Date.parse(h!.endUtc) - Date.parse(h!.startUtc)) / 60_000;
    console.log(`  bilgi: gün doğumu ${Math.floor(sunriseLat / 60)}:${String(Math.round(sunriseLat % 60)).padStart(2, "0")} LAT (Lilly 5:47) · saat ${lenMin.toFixed(1)} dk (Lilly 60–64) · 4. saat Mars`);
    assert.ok(Math.abs(sunriseLat - (5 * 60 + 47)) <= 12, "gün doğumu farkı ≤12 dk (Lilly tablosu: tek enlem, 3°'lik adım; tanım farkı)");
  });

  console.log(`\nastrology horary-western-04 (H-04) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
