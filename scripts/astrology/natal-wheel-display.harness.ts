/**
 * NATAL ÇARK GÖRÜNÜM KATMANI harness'i — 2026-11-04 (feat/natal-premium-visual-audit).
 *
 *   • `display` verilmeyen NatalWheel çıktısı önceki sürümle BAYT-AYNI (golden natal; diğer teknikler etkilenmez).
 *   • Derece cetveli: 348 çentik (her 1°; 0° burç sınırları ayrı kalın çizgi), 10° = 24, 5° = 36, 1° = 288; her çentik ve
 *     gezegen işareti gerçek boylamında (çark geometrisinden geri hesap, ≤1e-6°).
 *   • Temel / Profesyonel: AYNI teknik veri (dondurulmuş nesne, değişmez); Temel yalnız 10 gezegen arası başlıca açılar,
 *     Profesyonel listedeki tüm açılar; KAD–GAD ekseni çizilmez; gizlenen noktanın açıları çizilmez; toplam ≠ çizilen.
 *   • Vertex / Şans Noktası yalnız teknik veride varsa çizilir (saat bilinmiyor → maskelenmiş → yok).
 *   • Tam Burç'ta gerçek ASC–DSC / MC–IC ekseni ayrıca çizilir; Placidus'ta ek eksen yok.
 *   • Sembol çakışması: itmeden sonra glifler arası en küçük açı ≥ 7.4° (golden + Çumra referansı, tüm nokta seçimleri).
 *   • Tercih ayrıştırma bozuk değerde varsayılana döner; görünüm modülleri ağ / sağlayıcı / kayıt çağrısı içermez.
 * Gerçek sağlayıcı / DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/natal-wheel-display.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NatalWheel, { type NatalWheelDisplay } from "@/app/admin/astroloji/_components/NatalWheel";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { maskTimeDependent } from "@/lib/astrology/view/natalView";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import {
  aspectCounts,
  availablePoints,
  BASIC_ASPECT_TYPES,
  DEFAULT_POINTS,
  DEFAULT_PREFS,
  extraPointsFor,
  hiddenBodiesFor,
  isAspectDrawn,
  isNodeAxis,
  parsePrefs,
  PLANET_IDS,
  type NatalPointSelection,
  type NatalWheelMode,
} from "@/lib/astrology/view/natalWheelDisplay";

const ROOT = join(__dirname, "..", "..");
const FIX = join(__dirname, "fixtures");

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message.split("\n").join("\n    ")}`);
  }
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

const golden = (() => {
  const raw = JSON.parse(readFileSync(join(FIX, "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const p = projectRoxyNatal(raw.response ?? raw, { houseSystem: "placidus", nodeType: "true" });
  if (!p.ok) throw new Error("golden projeksiyon başarısız");
  return deepFreeze(p.value.technical as NatalTechnical);
})();
const cumra = deepFreeze(JSON.parse(readFileSync(join(FIX, "natal-display", "cumra-1987-swisseph-ref.json"), "utf8")).technical as NatalTechnical);

/** display öncesi sürümün sha256'sı (f3bdd9ac NatalWheel, golden natal, react-dom bu depodaki sürüm). */
const BASELINE = {
  plain: "63ef282b198ccebb6c2b1ba70986042fb9b22f4943a227dd3a84c4339ad9950a",
  tinted: "b6e207376c95b76a1e82896626035c8288e487743a8f7f39e92c494399a2aaa2",
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function display(t: NatalTechnical, mode: NatalWheelMode, points: NatalPointSelection = DEFAULT_POINTS[mode]): NatalWheelDisplay {
  return { mode, hiddenBodies: hiddenBodiesFor(points), extraPoints: extraPointsFor(t, points) };
}
function render(t: NatalTechnical, d?: NatalWheelDisplay) {
  return renderToStaticMarkup(createElement(NatalWheel, { technical: t, tinted: true, display: d }));
}
const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;

// Çark geometrisi (NatalWheel ile aynı sabitler): x = C + r cos((180 + lon − asc)°), y = C − r sin(...)
const C = 302;
function lonOf(x: number, y: number, asc: number) {
  const a = (Math.atan2(-(y - C), x - C) * 180) / Math.PI;
  return (((a - 180 + asc) % 360) + 360) % 360;
}
const angDist = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
};

function main() {
  console.log("natal-wheel-display harness");

  test("display yok → çıktı önceki sürümle bayt-aynı (düz + tinted)", () => {
    assert.equal(sha(renderToStaticMarkup(createElement(NatalWheel, { technical: golden }))), BASELINE.plain);
    assert.equal(sha(renderToStaticMarkup(createElement(NatalWheel, { technical: golden, tinted: true }))), BASELINE.tinted);
    const plain = renderToStaticMarkup(createElement(NatalWheel, { technical: golden }));
    assert.ok(!plain.includes("data-natal-mode") && !plain.includes("natal-degree-ruler") && plain.includes('viewBox="0 0 604 604"'));
  });

  test("derece cetveli: 348 çentik (10°=24, 5°=36, 1°=288), 12 kalın burç sınırı", () => {
    for (const mode of ["basic", "pro"] as const) {
      const svg = render(cumra, display(cumra, mode));
      assert.equal(count(svg, /data-deg="10"/g), 24);
      assert.equal(count(svg, /data-deg="5"/g), 36);
      assert.equal(count(svg, /data-deg="1"/g), 288);
      assert.equal(count(svg, /data-sign-boundary="/g), 12);
    }
  });

  test("derece cetveli ve gezegen işaretleri gerçek boylamda (geri hesap ≤1e-6°)", () => {
    for (const t of [golden, cumra]) {
      const asc = t.angles!.ascendant.longitude;
      const svg = render(t, display(t, "pro"));
      // cetvel: her çentiğin dış ucu R_SIGN_IN'de, boylamı tam derece
      const ticks = [...svg.matchAll(/<line x1="([\d.e-]+)" y1="([\d.e-]+)"[^>]*data-deg="(\d+)"/g)];
      assert.equal(ticks.length, 348);
      const lons = ticks.map((m) => lonOf(Number(m[1]), Number(m[2]), asc));
      for (const l of lons) assert.ok(angDist(l, Math.round(l)) < 1e-6, `çentik ${l}`);
      assert.equal(new Set(lons.map((l) => Math.round(l) % 360)).size, 348);
      for (const b of t.bodies) {
        const m = svg.match(new RegExp(`<g data-body="${b.id}"><line x1="([\\d.e-]+)" y1="([\\d.e-]+)"`));
        assert.ok(m, b.id);
        assert.ok(angDist(lonOf(Number(m![1]), Number(m![2]), asc), b.longitude) < 1e-6, b.id);
      }
    }
  });

  test("ASC/MC/DSC/IC levhası derecesi tablolarla aynı biçimde (dakika kesilir)", () => {
    const svg = render(cumra, display(cumra, "basic"));
    // Çumra referansı: ASC Terazi 9°49′53″, MC Yengeç 11°04′07″ → 9°49′ / 11°04′; DSC Koç 9°49′, IC Oğlak 11°04′
    assert.match(svg, /data-angle="ASC"[\s\S]*?♎︎<\/tspan> 9°49′/);
    assert.match(svg, /data-angle="MC"[\s\S]*?♋︎<\/tspan> 11°04′/);
    assert.match(svg, /data-angle="DSC"[\s\S]*?♈︎<\/tspan> 9°49′/);
    assert.match(svg, /data-angle="IC"[\s\S]*?♑︎<\/tspan> 11°04′/);
  });

  test("Temel: yalnız 10 gezegen arası başlıca açılar; Profesyonel: listedeki tüm açılar (KAD–GAD hariç)", () => {
    for (const t of [golden, cumra]) {
      const basic = render(t, display(t, "basic"));
      const pro = render(t, display(t, "pro"));
      const drawn = (svg: string) => [...svg.matchAll(/data-aspect="([a-z_]+)-([a-z_]+)-([a-z_]+)"/g)].map((m) => ({ a: m[1], b: m[2], type: m[3] }));
      const bs = drawn(basic);
      assert.ok(bs.length > 0);
      for (const a of bs) assert.ok(BASIC_ASPECT_TYPES.has(a.type as never) && PLANET_IDS.has(a.a as never) && PLANET_IDS.has(a.b as never), JSON.stringify(a));
      const expectBasic = t.aspects.filter((a) => BASIC_ASPECT_TYPES.has(a.type) && PLANET_IDS.has(a.a) && PLANET_IDS.has(a.b)).length;
      assert.equal(bs.length, expectBasic);
      const ps = drawn(pro);
      const nodeAxis = t.aspects.filter(isNodeAxis).length;
      assert.equal(ps.length, t.aspects.length - nodeAxis);
      assert.ok(!ps.some((a) => isNodeAxis(a as never)));
      // toplam ve çizilen ayrı öznitelik
      assert.match(pro, new RegExp(`data-aspects-total="${t.aspects.length}"`));
      assert.match(pro, new RegExp(`data-aspects-drawn="${ps.length}"`));
      assert.match(basic, new RegExp(`data-aspects-drawn="${bs.length}"`));
    }
    // Çumra referansı: 47 açı (sağlayıcı orb kuralı), 1 KAD–GAD ekseni
    assert.equal(cumra.aspects.length, 47);
    assert.deepEqual(aspectCounts(cumra.aspects, "pro", hiddenBodiesFor(DEFAULT_POINTS.pro)), { total: 47, drawn: 46 });
  });

  test("mod değişimi teknik veriyi değiştirmez (dondurulmuş nesne; iki mod art arda, JSON aynı)", () => {
    const before = JSON.stringify(cumra);
    for (const m of ["pro", "basic", "pro"] as const) render(cumra, display(cumra, m, { nodes: true, chiron: true, lilith: true, vertex: true, fortune: true }));
    assert.equal(JSON.stringify(cumra), before);
  });

  test("gizlenen noktanın gövdesi ve açı çizgileri çizilmez; gezegenler her zaman çizilir", () => {
    const pts = { nodes: false, chiron: false, lilith: false, vertex: false, fortune: false };
    const svg = render(cumra, display(cumra, "pro", pts));
    for (const id of ["north_node", "south_node", "chiron", "lilith"]) {
      assert.ok(!svg.includes(`data-body="${id}"`), id);
      assert.ok(!new RegExp(`data-aspect="[^"]*${id}`).test(svg), id);
    }
    for (const id of PLANET_IDS) assert.ok(svg.includes(`data-body="${id}"`), id);
    assert.equal(isAspectDrawn({ a: "sun", b: "chiron", type: "trine" }, "pro", hiddenBodiesFor(pts)), false);
  });

  test("Vertex / Şans Noktası: seçilince çizilir; saat bilinmiyorsa (maskeli) hiç çizilmez ve seçenek pasif", () => {
    const all = { nodes: true, chiron: true, lilith: true, vertex: true, fortune: true };
    const svg = render(cumra, display(cumra, "pro", all));
    assert.ok(svg.includes('data-point="vertex"') && svg.includes('data-point="fortune"'));
    assert.match(svg, /Vertex — Koç 28°44′/);
    assert.match(svg, /Şans Noktası — Balık 29°24′/);
    const masked = deepFreeze(maskTimeDependent(cumra as NatalTechnical));
    assert.deepEqual(extraPointsFor(masked, all), []);
    const av = availablePoints(masked);
    assert.equal(av.vertex, false);
    assert.equal(av.fortune, false);
    const ms = render(masked, display(masked, "pro", all));
    assert.ok(!ms.includes("data-point=") && !ms.includes("data-angle=") && !ms.includes("data-cusp-degree"));
    // varsayılan: Vertex / Şans Noktası zorla eklenmez
    assert.ok(!render(cumra, display(cumra, "pro")).includes("data-point="));
  });

  test("Profesyonel: ev başlangıç dereceleri (açı levhasına 8°'den yakın olmayan); Temel'de yok", () => {
    const pro = render(cumra, display(cumra, "pro"));
    const cds = [...pro.matchAll(/data-cusp-degree="(\d+)"/g)].map((m) => Number(m[1]));
    assert.ok(cds.length >= 6, String(cds));
    assert.ok(!cds.some((n) => [1, 4, 7, 10].includes(n)));
    // 6. ev Balık 14°01′10″ → 14°01′ (dakika kesilir; bağımsız SE değeri)
    assert.match(pro, /6\. ev başlangıcı — Balık 14°01′/);
    assert.ok(!render(cumra, display(cumra, "basic")).includes("data-cusp-degree"));
  });

  test("Tam Burç: gerçek ASC–DSC / MC–IC ekseni ayrıca çizilir; Placidus'ta ek eksen yok", () => {
    assert.ok(!render(cumra, display(cumra, "pro")).includes("data-axis="));
    const ws = deepFreeze({
      ...cumra,
      houseSystem: "whole-sign",
      houses: cumra.houses.map((h, i) => {
        const lon = (Math.floor(cumra.angles!.ascendant.longitude / 30) * 30 + i * 30) % 360;
        return { ...h, longitude: lon, degreeInSign: 0, sign: h.sign };
      }),
    } as NatalTechnical);
    const svg = render(ws, display(ws, "pro"));
    assert.equal(count(svg, /data-axis="/g), 4);
    const asc = ws.angles!.ascendant.longitude;
    const m = svg.match(/<line x1="([\d.e-]+)" y1="([\d.e-]+)"[^>]*data-axis="1"/);
    assert.ok(m && angDist(lonOf(Number(m[1]), Number(m[2]), asc), asc) < 1e-6);
    // display yokken Tam Burç çizimi eskisi gibi (ek eksen yok)
    assert.ok(!renderToStaticMarkup(createElement(NatalWheel, { technical: ws, tinted: true })).includes("data-axis="));
  });

  test("sembol çakışması: itmeden sonra glifler arası en küçük açı ≥ 7.4° (tüm nokta seçimleri)", () => {
    const sets: NatalPointSelection[] = [DEFAULT_POINTS.basic, DEFAULT_POINTS.pro, { nodes: true, chiron: true, lilith: true, vertex: true, fortune: true }];
    for (const t of [golden, cumra]) {
      const asc = t.angles!.ascendant.longitude;
      for (const pts of sets) {
        const svg = render(t, display(t, "pro", pts));
        // glif = her gövde / nokta grubundaki ilk <text> (R_GLYPH = 212)
        const glyphs = [...svg.matchAll(/<g data-(?:body|point)="[a-z_]+">(?:<line[^>]*><\/line>)+(?:<circle[^>]*><\/circle>)?<text x="([\d.e-]+)" y="([\d.e-]+)"/g)].map((m) =>
          lonOf(Number(m[1]), Number(m[2]), asc),
        );
        const expected = t.bodies.filter((b) => !hiddenBodiesFor(pts).has(b.id)).length + extraPointsFor(t, pts).length;
        assert.equal(glyphs.length, expected);
        let min = 360;
        for (let i = 0; i < glyphs.length; i++) for (let j = i + 1; j < glyphs.length; j++) min = Math.min(min, angDist(glyphs[i], glyphs[j]));
        assert.ok(min >= 7.4, `en küçük ayrım ${min.toFixed(2)}°`);
      }
    }
  });

  test("retro işareti ayrı renkli; ipucunda '(geri hareket)'", () => {
    const svg = render(cumra, display(cumra, "pro"));
    const retro = cumra.bodies.filter((b) => b.retrograde).length;
    assert.ok(retro > 0);
    assert.equal(count(svg, /data-retro="1"/g), retro);
    assert.match(svg, /Plüton — Akrep 9°\d\d′ ℞ \(geri hareket\)/);
  });

  test("tercih ayrıştırma: bozuk / eksik değer güvenle varsayılana döner", () => {
    assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs("{bozuk"), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs(JSON.stringify({ mode: "x", points: { pro: { vertex: "evet" } } })), DEFAULT_PREFS);
    const p = parsePrefs(JSON.stringify({ mode: "basic", points: { basic: { lilith: true } } }));
    assert.equal(p.mode, "basic");
    assert.equal(p.points.basic.lilith, true);
    assert.equal(p.points.basic.nodes, DEFAULT_POINTS.basic.nodes);
    assert.equal(DEFAULT_PREFS.mode, "pro");
  });

  test("statik: görünüm modülleri ağ / sağlayıcı / kayıt çağrısı içermez; yalnız Natal çağrıları display verir", () => {
    for (const f of ["lib/astrology/view/natalWheelDisplay.ts", "app/admin/astroloji/_components/NatalChartControls.tsx", "app/admin/astroloji/_components/NatalSymbolGuide.tsx"]) {
      const s = readFileSync(join(ROOT, f), "utf8");
      assert.ok(!/fetch\(|\/api\/|roxy|supabase|saveAnalysis/i.test(s), f);
    }
    const uses = [
      ...readFileSync(join(ROOT, "app/admin/astroloji/page.tsx"), "utf8").matchAll(/<NatalWheel [^>]*display=\{natalWheelDisplay\((\w+)/g),
      ...readFileSync(join(ROOT, "app/admin/astroloji/_components/SavedAnalyses.tsx"), "utf8").matchAll(/<NatalWheel [^>]*display=\{natalWheelDisplay\((\w+)/g),
    ].map((m) => m[1]);
    assert.deepEqual(uses, ["natalTech", "natal"]);
    for (const f of ["TimingPanels.tsx", "PlanetaryReturnPanel.tsx", "LocationPanels.tsx", "horary/WesternHoraryDesk.tsx"]) {
      assert.ok(!readFileSync(join(ROOT, "app/admin/astroloji/_components", f), "utf8").includes("display={"), f);
    }
  });

  console.log(`\nnatal-wheel-display harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main();
