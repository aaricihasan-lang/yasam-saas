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
import { alignCompositeAngles, projectRoxyComposite, ROXY_COMPOSITE } from "@/lib/astrology/providers/roxy/timing";
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

console.log(`\nastrology composite angles harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
