/**
 * ASTROLOJİ — KOMPOZİT ASC/MC/EV TUTARLILIĞI harness'i (ATL-P2-06, 2026-10-20).
 *
 * Kaynak: 151 GERÇEK Roxy /astrology/composite-chart yanıtı (ATLAS-1000 bağımsız doğrulama, sentetik kişi çiftleri; yorum metinleri
 * ve açı listesi çıkarıldı) + bağımsız profesyonel referans Astrolog 8.00 kompozit değerleri (ASC, MC, 12 ev başlangıcı).
 * Gerçek Roxy çağrısı YOK.
 *
 *   A) 151/151: adaptör sonrası ASC, MC ve 12 ev başlangıcı Astrolog ile ≤ 3″; 1. ev = ASC, 10. ev = MC (Placidus).
 *   B) Tam olarak 14 çift çevrilir (önceden hatalı olanlar), 137 çift BİREBİR değişmez.
 *   C) Çevrilen çiftlerde gezegen evleri yeni ev başlangıçlarıyla tutarlı (gezegen boylamı evin içinde).
 *   D) Bütün-burç (sentetik): ASC +180°, evler 6 kaydırılır; MC korunur; tutarlı haritaya dokunulmaz; çözülemeyen tutarsızlık fail-closed.
 *   E) Sürüm: adapter/projection -2 (eski önbellek satırı yeniden kullanılmaz).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/composite-angles.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { alignCompositeAngles, projectRoxyComposite, ROXY_COMPOSITE, roxyCompositeMeta } from "@/lib/astrology/providers/roxy/timing";
import type { CompositeTechnical } from "@/lib/astrology/model/westernTiming";
import type { NatalHouse } from "@/lib/astrology/model/western";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Case = { pair: string; status: string; houseSystem: "placidus"; raw: J; astrolog: Record<string, number> };
const FIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "composite-151-astrolog.json"), "utf8")) as { cases: Case[] };

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
const arcsec = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180) * 3600;
const project = (c: Case) => projectRoxyComposite(structuredClone(c.raw), { houseSystem: c.houseSystem, nodeType: "true" });

t("A/B: 151 gerçek kompozit — ASC, MC, 12 ev Astrolog ile ≤3″; 1. ev = ASC, 10. ev = MC; tam 14 çevrilir, 137 değişmez", () => {
  assert.equal(FIX.cases.length, 151);
  let flipped = 0;
  let worst = 0;
  for (const c of FIX.cases) {
    const r = project(c);
    assert.ok(r.ok, `${c.pair}: ${!r.ok ? r.errors.join("; ") : ""}`);
    if (!r.ok) continue;
    const tt = r.technical as CompositeTechnical;
    const a = c.astrolog;
    const before = { asc: c.raw.compositeAscendant.longitude, mc: c.raw.compositeMidheaven.longitude };
    const changed = arcsec(tt.angles!.ascendant.longitude, before.asc) > 1;
    if (changed) flipped += 1;
    assert.equal(changed, c.status !== "PASS", `${c.pair}: yalnız önceden hatalı çiftler çevrilmeli`);
    assert.ok(arcsec(tt.angles!.midheaven.longitude, before.mc) < 1e-6, `${c.pair}: MC değişmemeli`);
    for (const [k, v] of [["asc", tt.angles!.ascendant.longitude], ["mc", tt.angles!.midheaven.longitude], ...tt.houses.map((h) => [`cusp${h.number}`, h.longitude] as [string, number])] as [string, number][]) {
      if (typeof a[k] !== "number") continue;
      const d = arcsec(v, a[k]);
      worst = Math.max(worst, d);
      assert.ok(d <= 3, `${c.pair} ${k}: ${d.toFixed(2)}″ > 3″`);
    }
    assert.ok(arcsec(tt.houses[0].longitude, tt.angles!.ascendant.longitude) < 1, `${c.pair}: 1. ev ≠ ASC`);
    assert.ok(arcsec(tt.houses[9].longitude, tt.angles!.midheaven.longitude) < 1, `${c.pair}: 10. ev ≠ MC`);
  }
  assert.equal(flipped, 14);
  console.log(`     en büyük fark ${worst.toFixed(3)}″`);
});

t("C: çevrilen çiftlerde gezegen ev numarası yeni ev başlangıçlarıyla tutarlı (151/151)", () => {
  const inHouse = (lon: number, houses: NatalHouse[], n: number) => {
    const s = houses[n - 1].longitude;
    const e = houses[n % 12].longitude;
    const span = (((e - s) % 360) + 360) % 360;
    return ((((lon - s) % 360) + 360) % 360) < span + 1e-9;
  };
  for (const c of FIX.cases) {
    const r = project(c);
    if (!r.ok) throw new Error(c.pair);
    const tt = r.technical as CompositeTechnical;
    for (const b of tt.bodies) if (b.house !== null) assert.ok(inHouse(b.longitude, tt.houses, b.house), `${c.pair} ${b.id} ev ${b.house}`);
  }
});

t("D: bütün-burç sentetik — ters yaydaki ASC +180°, evler 6 kaydırılır, MC korunur; tutarlı harita değişmez; çözülemeyen tutarsızlık fail-closed", () => {
  const pt = (l: number) => ({ longitude: l, sign: "aries" as const, degreeInSign: l % 30 });
  const ws = (ascLon: number): NatalHouse[] => Array.from({ length: 12 }, (_, i) => ({ number: i + 1, ...pt((Math.floor(ascLon / 30) * 30 + i * 30) % 360) }));
  // Ters yay: ASC 10° (Koç), MC 300° → (ASC−MC) mod 360 = 70 → tutarlı; ASC 190° → 250 → çevrilmeli.
  const errs: string[] = [];
  const ok = alignCompositeAngles(pt(10), pt(300), ws(10), [], "whole-sign", errs);
  assert.equal(ok.flipped, false);
  assert.deepEqual(errs, []);
  const bodies = [{ id: "sun", longitude: 200, sign: "libra", degreeInSign: 20, latitude: 0, house: 1, speed: 1, retrograde: false }] as CompositeTechnical["bodies"];
  const fx = alignCompositeAngles(pt(190), pt(300), ws(190), bodies, "whole-sign", errs);
  assert.equal(fx.flipped, true);
  assert.equal(fx.asc!.longitude, 10);
  assert.equal(fx.asc!.sign, "aries");
  assert.equal(fx.mc!.longitude, 300);
  assert.equal(fx.houses[0].longitude, 0);
  assert.equal(fx.houses[6].longitude, 180);
  assert.equal(bodies[0].house, 7, "gezegen evi n → n+6");
  const bad: string[] = [];
  const houses = ws(190).map((h) => ({ ...h, longitude: (h.longitude + 7) % 360 }));
  alignCompositeAngles(pt(190), pt(300), houses, [], "placidus", bad);
  assert.ok(bad.length > 0, "Placidus'ta 10. ev = MC sağlanamıyorsa hata");
});

t("E: sürüm — adapter/projection -2", () => {
  assert.equal(ROXY_COMPOSITE.adapter, "astro-roxy-composite-2");
  assert.equal(ROXY_COMPOSITE.projection, "composite-proj-2");
});

// ─── Bütün-burç kompozit ev başlangıçları (2026-10-20) ──────────────────────────────────────────────────────────────────────
// Sağlayıcı kompozit ev başlangıcını iki natal başlangıcın orta noktası verir → bütün-burçta 15°'lik başlangıçlar.
// Owner canlı vakası (20.10): ASC Başak 25°23′ (175,38°), MC İkizler 24°43′ (84,72°), 1. ev başlangıcı Başak 15°00′,
// Ay Başak 8°24′ "12. ev", Merkür Balık "6. ev". Bütün-burçta: 1. ev = Başak 0°, Ay 1. ev, Merkür 7. ev.
const wsRaw = (ascLon: number, mcLon: number, firstCusp: number, planets: Record<string, [number, number]>) => {
  const raw = structuredClone(FIX.cases[0].raw);
  raw.compositeAscendant = { longitude: ascLon };
  raw.compositeMidheaven = { longitude: mcLon };
  raw.compositeHouses = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, longitude: (firstCusp + i * 30) % 360 }));
  for (const p of raw.compositePlanets) {
    const o = planets[p.name];
    if (!o) continue;
    p.longitude = o[0];
    p.house = o[1];
    delete p.sign;
    delete p.degree;
  }
  return raw;
};

t("F: bütün-burç — owner vakası: ev başlangıçları burç başında, Ay 1. ev, Merkür 7. ev; ASC/MC/gezegen boylamı değişmez", () => {
  const raw = wsRaw(175.38, 84.72, 165, { Moon: [158.4, 12], Mercury: [340, 6] });
  const before = raw.compositePlanets.map((p: J) => [p.name, p.longitude]);
  const r = projectRoxyComposite(raw, { houseSystem: "whole-sign", nodeType: "true" });
  assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
  if (!r.ok) return;
  const tt = r.technical as CompositeTechnical;
  assert.equal(tt.angles!.ascendant.longitude, 175.38);
  assert.equal(tt.angles!.midheaven.longitude, 84.72);
  assert.deepEqual(tt.houses.map((h) => h.longitude), [150, 180, 210, 240, 270, 300, 330, 0, 30, 60, 90, 120]);
  assert.ok(tt.houses.every((h) => h.degreeInSign === 0));
  assert.equal(tt.houses[0].sign, "virgo");
  assert.equal(tt.bodies.find((b) => b.id === "moon")!.house, 1);
  assert.equal(tt.bodies.find((b) => b.id === "mercury")!.house, 7);
  for (const b of tt.bodies) assert.equal(b.house, ((Math.floor(b.longitude / 30) - 5 + 12) % 12) + 1, `${b.id}: ev = burç farkı`);
  for (const [name, lon] of before) assert.equal(raw.compositePlanets.find((p: J) => p.name === name).longitude, lon);
});

t("G: bütün-burç + ters yay — ASC +180° çevrilir, 15°'lik önceki-burç başlangıcı artık fail-closed DEĞİL, evler yeni ASC burcundan", () => {
  // ASC Terazi 10° (190°), MC 300° → çevrilir → ASC Koç 10°. Sağlayıcı 1. ev başlangıcı Başak 15° (önceki burç).
  const r = projectRoxyComposite(wsRaw(190, 300, 165, { Sun: [200, 1] }), { houseSystem: "whole-sign", nodeType: "true" });
  assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
  if (!r.ok) return;
  const tt = r.technical as CompositeTechnical;
  assert.equal(tt.angles!.ascendant.longitude, 10);
  assert.equal(tt.angles!.midheaven.longitude, 300);
  assert.equal(tt.houses[0].longitude, 0);
  assert.equal(tt.houses[6].longitude, 180);
  assert.equal(tt.bodies.find((b) => b.id === "sun")!.house, 7);
  for (const b of tt.bodies) assert.equal(b.house, ((Math.floor(b.longitude / 30) + 12) % 12) + 1, `${b.id}: ev = burç farkı`);
});

t("H: Placidus/Koch/Eşit sağlayıcı ev başlangıçları AYNEN; whole-sign dışı sürüm/anahtar değişmez", () => {
  for (const hs of ["placidus", "koch", "equal"] as const) {
    const raw = wsRaw(175.38, 84.72, 175.38, { Moon: [158.4, 12] });
    raw.compositeHouses[9].longitude = 84.72;
    const r = projectRoxyComposite(raw, { houseSystem: hs, nodeType: "true" });
    assert.ok(r.ok, `${hs}: ${!r.ok ? r.errors.join("; ") : ""}`);
    if (!r.ok) continue;
    const tt = r.technical as CompositeTechnical;
    assert.equal(tt.houses[0].longitude, 175.38, hs);
    assert.equal(tt.bodies.find((b) => b.id === "moon")!.house, 12, `${hs}: sağlayıcı evi korunur`);
    assert.deepEqual(roxyCompositeMeta(hs), ROXY_COMPOSITE);
  }
  assert.equal(roxyCompositeMeta("whole-sign").adapter, "astro-roxy-composite-ws-3");
  assert.equal(roxyCompositeMeta("whole-sign").projection, "composite-proj-ws-3");
  assert.equal(roxyCompositeMeta("whole-sign").endpoint, ROXY_COMPOSITE.endpoint);
});

console.log(`\nastrology composite angles harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
