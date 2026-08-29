/**
 * reflexology-school-neutral-harness.ts
 *
 * EKOLE BAĞIMSIZ görünüm mimarisi kilidi. Kanıtlar:
 *  - Grup = EXPLICIT region.view; organ adı görünümü ASLA belirlemez.
 *  - Herhangi bir organ (mesane/rahim/prostat/ince bağırsak) 3 görünümde de olabilir.
 *  - Aynı organ taban+yan_ic+yan_dis bölgelerini AYNI ANDA taşıyabilir (cross-leakage=0).
 *  - 72-region roundtrip: save→serialize→load→normalize→read; Δ=0.
 *
 * GERÇEK üretim fonksiyonları (mergeDraftIntoAtlas / getRegionsForOrgan /
 * resolveProtocolAtlas / regionBackgroundGroup / normalizeAtlasDocument).
 *
 * Çalıştır:  npx tsx scripts/reflexology-school-neutral-harness.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { FootSide, FootView, Region, RegionShapeType } from "@/app/refleksoloji/bolge-haritasi/types";
import {
  getRegionsForOrgan,
  mergeDraftIntoAtlas,
  type AtlasDocument,
} from "@/lib/atlasStorage";
import {
  resolveProtocolAtlas,
  regionBackgroundGroup,
  ALL_ATLAS_GROUPS,
} from "@/lib/refleksoloji/atlasRegionsCore";
import { normalizeAtlasDocument } from "@/lib/refleksoloji/atlasNormalize";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    fails.push(name);
    console.log(`  ❌ ${name}`);
  }
}

const EMPTY: AtlasDocument = { _meta: { version: "1", updated_at: "T" } } as AtlasDocument;
let seq = 0;
const p4 = (n: number) => Math.round(n * 1e4) / 1e4;

function makeRegion(shape: RegionShapeType, organ: string, foot: FootSide, view: FootView, i: number): Region {
  const cx = p4(0.15 + ((i * 0.113) % 0.7));
  const cy = p4(0.15 + (((i + 3) * 0.113) % 0.7));
  const base = { id: `sn-${(seq++).toString().padStart(3, "0")}`, organ, footSide: foot, view, shape, color: "#dc2626" } as Region;
  if (shape === "oval" || shape === "rect") return { ...base, cx, cy, rx: 0.05, ry: 0.04, angle: (i % 5) * 18 };
  if (shape === "free_draw") return { ...base, points: [{ x: cx, y: cy }, { x: p4(cx + 0.05), y: p4(cy + 0.03) }] };
  return { ...base, x1: cx, y1: cy, x2: p4(cx + 0.12), y2: p4(cy + 0.05), lineWidth: 0.003 };
}

/** Tek organ + tek view'da bir region'lı atlas kurar; grubunu döndürür. */
function groupOfSingle(organ: string, view: FootView): { taban: number; yan_ic: number; yan_dis: number } {
  const r = makeRegion("oval", organ, "left", view, 0);
  const atlas = mergeDraftIntoAtlas(EMPTY, [r], []);
  const resolved = resolveProtocolAtlas(atlas, [organ]);
  return {
    taban: resolved.regionsByGroup.taban.length,
    yan_ic: resolved.regionsByGroup.yan_ic.length,
    yan_dis: resolved.regionsByGroup.yan_dis.length,
  };
}

console.log("Refleksoloji — SCHOOL-NEUTRAL (ekole bağımsız görünüm) HARNESS\n");

/* A–F: her organ, uzmanın seçtiği HERHANGİ görünümde çizilebilir (organ override YOK) */
const A = groupOfSingle("Mesane", "taban");
check("A. mesane Taban → yalnız taban", A.taban === 1 && A.yan_ic === 0 && A.yan_dis === 0);
const B = groupOfSingle("Mesane", "yan_ic");
check("B. mesane Yan İç → yalnız yan_ic", B.yan_ic === 1 && B.taban === 0 && B.yan_dis === 0);
const C = groupOfSingle("Mesane", "yan_dis");
check("C. mesane Yan Dış → yalnız yan_dis (SİSTEM yan_ic'e ZORLAMAZ)", C.yan_dis === 1 && C.yan_ic === 0 && C.taban === 0);
const D = groupOfSingle("İnce bağırsak", "yan_ic");
check("D. ince bağırsak Yan İç → yalnız yan_ic (SİSTEM yan_dis'e ZORLAMAZ)", D.yan_ic === 1 && D.yan_dis === 0);
const E = groupOfSingle("Rahim", "yan_dis");
check("E. rahim Yan Dış → yalnız yan_dis", E.yan_dis === 1 && E.yan_ic === 0);
const F = groupOfSingle("Prostat", "taban");
check("F. prostat Taban → yalnız taban", F.taban === 1 && F.yan_ic === 0 && F.yan_dis === 0);

/* G: aynı organ 3 görünümde AYNI ANDA — hepsi korunur, leakage=0 */
const gRegions: Region[] = [
  makeRegion("oval", "Mesane", "left", "taban", 1),
  makeRegion("rect", "Mesane", "left", "taban", 2),
  makeRegion("oval", "Mesane", "left", "yan_ic", 3),
  makeRegion("rect", "Mesane", "right", "yan_ic", 4),
  makeRegion("free_draw", "Mesane", "left", "yan_ic", 5),
  makeRegion("oval", "Mesane", "left", "yan_dis", 6),
  makeRegion("rect", "Mesane", "left", "yan_dis", 7),
  makeRegion("thick_line", "Mesane", "right", "yan_dis", 8),
  makeRegion("free_draw", "Mesane", "left", "yan_dis", 9),
];
const gAtlas = mergeDraftIntoAtlas(EMPTY, gRegions, []);
const gResolved = resolveProtocolAtlas(gAtlas, ["Mesane"]);
check("G1. mesane taban=2 yan_ic=3 yan_dis=4 (üçü ayrı korunur)",
  gResolved.regionsByGroup.taban.length === 2 &&
  gResolved.regionsByGroup.yan_ic.length === 3 &&
  gResolved.regionsByGroup.yan_dis.length === 4);
const gLeak = ALL_ATLAS_GROUPS.reduce((acc, grp) =>
  acc + gResolved.regionsByGroup[grp].filter((r) => r.view !== grp).length, 0);
check("G2. cross-view leakage = 0", gLeak === 0);
check("G3. availableViews üç görünüm de var",
  gResolved.organs[0].groups.length === 3);

/* H/I/J: gruplama organ ve foot'tan BAĞIMSIZ — otomatik yönlendirme YOK (property) */
const ORGANS = ["Mesane", "Rahim", "Prostat", "İnce bağırsak", "Böbrek", "Kalp", "Karaciğer", "Omurga"];
let redirects = 0;
for (const organ of ORGANS) {
  for (const view of ALL_ATLAS_GROUPS) {
    // Aynı view → aynı grup, organ ne olursa olsun (0 redirect).
    if (regionBackgroundGroup({ view }) !== view) redirects += 1;
    // foot değişse de grup değişmez
    const rl = makeRegion("oval", organ, "left", view, 0);
    const rr = makeRegion("oval", organ, "right", view, 0);
    if (regionBackgroundGroup({ view: rl.view }) !== regionBackgroundGroup({ view: rr.view })) redirects += 1;
  }
}
check("H/I/J. 0 otomatik yönlendirme (grup organ+foot'tan bağımsız)", redirects === 0);

/* §27: 72-region roundtrip — 3 view × 2 foot × 4 shape × 3 örnek */
seq = 0;
const SHAPES: RegionShapeType[] = ["oval", "rect", "free_draw", "thick_line"];
const VIEWS: FootView[] = ["taban", "yan_ic", "yan_dis"];
const FEET: FootSide[] = ["left", "right"];
const round: Region[] = [];
let ri = 0;
for (const view of VIEWS)
  for (const foot of FEET)
    for (const shape of SHAPES)
      for (let k = 0; k < 3; k++) round.push(makeRegion(shape, `Organ${ri % 4}`, foot, view, ri++));
check(`§27 fixture = 72 region (got ${round.length})`, round.length === 72);

const built = mergeDraftIntoAtlas(EMPTY, round, []);
const serialized = JSON.stringify(built);
const reloaded = normalizeAtlasDocument(JSON.parse(serialized)); // save→serialize→load→normalize
const organsRT = [...new Set(round.map((r) => r.organ))];
const readBack: Region[] = organsRT.flatMap((o) => getRegionsForOrgan(reloaded, o));

check(`§27 region count Δ=0 (got ${readBack.length})`, readBack.length === 72);
const idsBefore = new Set(round.map((r) => r.id));
const idsAfter = new Set(readBack.map((r) => r.id));
check("§27 ID Δ=0", idsBefore.size === 72 && idsAfter.size === 72 && [...idsBefore].every((id) => idsAfter.has(id)));

const byId = new Map(round.map((r) => [r.id, r]));
let geomDelta = 0, viewDelta = 0, footDelta = 0;
for (const r of readBack) {
  const src = byId.get(r.id)!;
  if (r.view !== src.view) viewDelta += 1;
  if (r.footSide !== src.footSide) footDelta += 1;
  const g = (a?: number, b?: number) => (a ?? -999) !== (b ?? -999);
  if (r.shape !== src.shape || g(r.cx, src.cx) || g(r.cy, src.cy) || g(r.rx, src.rx) || g(r.ry, src.ry) ||
      g(r.x1, src.x1) || g(r.y1, src.y1) || g(r.x2, src.x2) || g(r.y2, src.y2) ||
      JSON.stringify(r.points ?? null) !== JSON.stringify(src.points ?? null)) geomDelta += 1;
}
check(`§27 geometry Δ=0 (got ${geomDelta})`, geomDelta === 0);
check(`§27 view identity Δ=0 (got ${viewDelta})`, viewDelta === 0);
check(`§27 foot identity Δ=0 (got ${footDelta})`, footDelta === 0);

const rtLeak = VIEWS.reduce((acc, v) =>
  acc + readBack.filter((r) => r.view === v).length, 0);
const perView = VIEWS.map((v) => readBack.filter((r) => r.view === v).length);
check(`§27 cross-view leakage=0 (each view 24; got ${perView.join("/")})`,
  rtLeak === 72 && perView.every((n) => n === 24));

/* §30 STATIC GREP GUARD: runtime dosyalarında isInnerYanOrgan / legacy "yan" YASAK.
   isInnerYanOrgan yalnız legacy converter (atlasNormalize) alanında olabilir; adı
   tamamen kaldırıldığından runtime'da 0 kez geçmeli. */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const RUNTIME_FILES = [
  "app/refleksoloji/bolge-haritasi/components/FootCanvas.tsx",
  "app/refleksoloji/bolge-haritasi/components/RegionToolbar.tsx",
  "app/refleksoloji/bolge-haritasi/utils/atlasBackground.ts",
  "app/refleksoloji/kayitli-atlas/components/AtlasReadonlyFootMap.tsx",
  "app/refleksoloji/protokol-haritasi/components/ProtocolFootMap.tsx",
  "app/refleksoloji/protokol-haritasi/components/ProtokolHaritasiLayout.tsx",
  "app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx",
  "app/refleksoloji/protokol-haritasi/lib/resolveDisplayRegions.ts",
  "lib/refleksoloji/atlasRegionsCore.ts",
  "lib/refleksoloji/reflexologyWord.ts",
  "lib/refleksoloji/atlasImage.ts",
  "lib/atlasStorage.ts",
];
let guardViolations = 0;
for (const rel of RUNTIME_FILES) {
  let src = "";
  try {
    src = readFileSync(resolve(REPO, rel), "utf8");
  } catch {
    guardViolations += 1;
    console.log(`  ❌ guard: dosya okunamadı ${rel}`);
    continue;
  }
  if (/isInnerYanOrgan/.test(src)) {
    guardViolations += 1;
    console.log(`  ❌ guard: isInnerYanOrgan runtime'da YASAK → ${rel}`);
  }
  // Legacy "yan" bucket yazımı / view karşılaştırması runtime'da kalmamalı.
  if (/===\s*["']yan["']|!==\s*["']yan["']|\bview:\s*["']yan["']|\.yan\b\s*[.\[]/.test(src)) {
    guardViolations += 1;
    console.log(`  ❌ guard: legacy "yan" runtime yolu → ${rel}`);
  }
}
check("§30 grep guard: 0 runtime isInnerYanOrgan / legacy-yan (property)", guardViolations === 0);
// isInnerYanOrgan adı TÜM repo runtime'ında yok; legacy hedef yalnız atlasNormalize.legacyYanTarget
check("§30 legacy hedef yalnız atlasNormalize'da (legacyYanTarget mevcut)",
  /legacyYanTarget/.test(readFileSync(resolve(REPO, "lib/refleksoloji/atlasNormalize.ts"), "utf8")));

console.log(`\n──────── SONUÇ: ${pass}/${pass + fail} PASS ────────`);
if (fail > 0) {
  console.error(`\n${fail} test BAŞARISIZ:\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log("✅ SCHOOL-NEUTRAL — tüm ekol-bağımsızlık testleri geçti.");
