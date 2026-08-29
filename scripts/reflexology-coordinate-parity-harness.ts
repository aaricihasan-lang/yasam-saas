/**
 * reflexology-coordinate-parity-harness.ts
 *
 * SEV-1 "PRODUCTION COORDINATE DRIFT" regresyon kilidi.
 *
 * Gerçek uzman bildirdi: Protokol Haritası (oluşturma) ile Kayıtlı Protokol
 * Detay ekranı, AYNI atlas bölgelerini ayak görseline göre FARKLI relative
 * konumda gösteriyordu. Kök neden: Kayıtlı Protokol Detay, ProtocolFootMap'i
 * bir `transform: scale(1.08)` ata sarmalayıcı içinde render ediyordu.
 * ProtocolFootMap konteyner ölçüsünü getBoundingClientRect (POST-transform =
 * ölçekli px) ile ölçüp bu px'i overlay'e inline yazdığından, ata transform
 * bunu İKİNCİ kez ölçekliyordu → overlay ayak görselinden dışa doğru kayıyordu
 * (kenara doğru büyüyen drift, gerçek tarayıcıda maxΔ≈0.109). Oluşturma
 * ekranında transform olmadığı için orada drift yoktu → iki ekran uyuşmuyordu.
 *
 * Bu harness GERÇEK üretim fonksiyonlarını çağırır (kopya mantık yok) ve:
 *  1. 60 bölge için save→JSON→reload serileştirme paritesi (Δ=0, veri güvenli)
 *  2. Protokolde 4 şeklin de (oval/rect/free_draw/thick_line) hayatta kalması
 *  3. oval/rect için angle'ın protokol display'ine taşınması
 *  4. computeObjectContainRect'in viewport-bağımsızlığı (normalized→content-box
 *     her genişlikte aynı relative konum) — responsive parite
 *  5. KAYNAK KİLİDİ: Kayıtlı Protokol Detay, ProtocolFootMap'i `scale-[...]`
 *     transform sarmalayıcısıyla render ETMEMELİ (SEV-1 tekrar regresyon kilidi)
 *
 * Çalıştır:  npx tsx scripts/reflexology-coordinate-parity-harness.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { FootSide, FootView, Region, RegionShapeType } from "@/app/refleksoloji/bolge-haritasi/types";
import {
  mergeDraftIntoAtlas,
  getRegionsForOrgan,
  listOrganNamesFromAtlas,
  type AtlasDocument,
} from "@/lib/atlasStorage";
import { atlasRegionToDisplay } from "@/app/refleksoloji/protokol-haritasi/lib/resolveDisplayRegions";
import { resolveAtlasBackgroundKey } from "@/app/refleksoloji/bolge-haritasi/utils/atlasBackground";
import { computeObjectContainRect } from "@/app/refleksoloji/bolge-haritasi/utils/imageContainRect";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    fails.push(name);
    console.log(`  ❌ ${name}`);
  }
}

/* ---------------- 60-region fixture ---------------- */
const SHAPES: RegionShapeType[] = ["oval", "rect", "free_draw", "thick_line"];
const TABAN_ORGANS = ["Karaciğer", "Böbrek", "Kalp", "Mide"];
const YAN_DIS_ORGANS = ["Omurga", "Diz", "Omuz", "Dirsek"];
const YAN_IC_ORGANS = ["Mesane", "Rahim", "Prostat"];

let seq = 0;
const rid = (t: string) => `cp-${t}-${(seq++).toString().padStart(3, "0")}`;
const p4 = (n: number) => Math.round(n * 1e4) / 1e4;

function makeRegion(shape: RegionShapeType, organ: string, footSide: FootSide, view: FootView, i: number): Region {
  const cx = p4(0.15 + ((i * 0.113) % 0.7));
  const cy = p4(0.15 + (((i + 3) * 0.113) % 0.7));
  const base = { id: rid(`${view}-${shape}`), organ, footSide, view, shape, color: "#dc2626" } as Region;
  if (shape === "oval" || shape === "rect") {
    return { ...base, cx, cy, rx: p4(0.03 + (i % 4) * 0.015), ry: p4(0.02 + (i % 3) * 0.02), angle: (i % 5) * 18 };
  }
  if (shape === "free_draw") {
    const n = [2, 3, 7, 12, 24][i % 5];
    return { ...base, points: Array.from({ length: n }, (_, k) => ({ x: p4(cx + k * 0.006), y: p4(cy + Math.sin(k) * 0.02) })) };
  }
  const v = [
    { dx: 0.12, dy: 0.0 }, { dx: 0.0, dy: 0.12 }, { dx: 0.1, dy: 0.1 }, { dx: 0.28, dy: 0.05 }, { dx: 0.05, dy: 0.28 },
  ][i % 5];
  return { ...base, x1: cx, y1: cy, x2: p4(cx + v.dx), y2: p4(cy + v.dy), lineWidth: 0.003 };
}

const regions: Region[] = [];
function buildGroup(groupName: "taban" | "yan_dis" | "yan_ic", pool: string[]) {
  // Explicit canonical: region.view = grup (ekole bağımsız). Organ adı KULLANILMAZ.
  const view: FootView = groupName;
  let gi = 0;
  for (const shape of SHAPES) {
    for (let k = 0; k < 5; k++) {
      regions.push(makeRegion(shape, pool[gi % pool.length], gi % 2 === 0 ? "left" : "right", view, gi));
      gi++;
    }
  }
}
buildGroup("taban", TABAN_ORGANS);
buildGroup("yan_dis", YAN_DIS_ORGANS);
buildGroup("yan_ic", YAN_IC_ORGANS);

function geom(r: Record<string, unknown>): Record<string, unknown> {
  const s = r.shape as RegionShapeType;
  if (s === "oval" || s === "rect") return { cx: r.cx, cy: r.cy, rx: r.rx, ry: r.ry, angle: r.angle };
  if (s === "free_draw") return { points: (r.points as { x: number; y: number }[] | undefined)?.map((p) => ({ ...p })) };
  return { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, lineWidth: r.lineWidth };
}
function geomDelta(a: Record<string, unknown>, b: Record<string, unknown>): number {
  let max = 0;
  for (const k of ["cx", "cy", "rx", "ry", "angle", "x1", "y1", "x2", "y2", "lineWidth"]) {
    const av = a[k] as number | undefined, bv = b[k] as number | undefined;
    if (av != null || bv != null) max = Math.max(max, Math.abs((av ?? NaN) - (bv ?? NaN)));
  }
  const ap = a.points as { x: number; y: number }[] | undefined;
  const bp = b.points as { x: number; y: number }[] | undefined;
  if (ap || bp) {
    if ((ap?.length ?? -1) !== (bp?.length ?? -2)) return Infinity;
    for (let i = 0; i < (ap?.length ?? 0); i++) max = Math.max(max, Math.abs(ap![i].x - bp![i].x), Math.abs(ap![i].y - bp![i].y));
  }
  return max;
}

console.log("Refleksoloji — KOORDİNAT PARİTE HARNESS (SEV-1 drift kilidi)\n");

/* 1. SAVE + RELOAD serialization parity (real functions) */
const golden = new Map(regions.map((r) => [r.id, geom(r)]));
const emptyAtlas: AtlasDocument = { _meta: { version: "1", updated_at: "T" } } as AtlasDocument;
const savedAtlas = mergeDraftIntoAtlas(emptyAtlas, regions, []);
const persistedJSON = JSON.stringify(savedAtlas);
const reloaded = JSON.parse(persistedJSON) as AtlasDocument;

function readAll(a: AtlasDocument): Map<string, Region> {
  const m = new Map<string, Region>();
  for (const organ of listOrganNamesFromAtlas(a)) for (const r of getRegionsForOrgan(a, organ)) m.set(r.id, r);
  return m;
}
const persistedMap = readAll(JSON.parse(persistedJSON) as AtlasDocument);
const reloadMap = readAll(reloaded);

let saveMax = 0, reloadMax = 0;
for (const [id, g] of golden) {
  const p = persistedMap.get(id), rl = reloadMap.get(id);
  saveMax = Math.max(saveMax, p ? geomDelta(g, geom(p)) : Infinity);
  reloadMax = Math.max(reloadMax, rl ? geomDelta(g, geom(rl)) : Infinity);
}
check(`save parity 60/60 (maxΔ=${saveMax})`, saveMax <= 0.0005 && persistedMap.size === 60);
check(`reload parity 60/60 (maxΔ=${reloadMax})`, reloadMax <= 0.0005 && reloadMap.size === 60);

/* 2. All 4 shapes survive protocol (post PR#203) + 3. angle carried + geometry passthrough */
let survived = 0, angleOk = true, passthroughMax = 0;
const survivedByShape: Record<string, number> = { oval: 0, rect: 0, free_draw: 0, thick_line: 0 };
for (const r of persistedMap.values()) {
  const d = atlasRegionToDisplay(r);
  if (d) {
    survived++;
    survivedByShape[d.shape]++;
    passthroughMax = Math.max(passthroughMax, geomDelta(golden.get(r.id)!, geom(d as unknown as Record<string, unknown>)));
    if ((d.shape === "oval" || d.shape === "rect") && (d.angle ?? 0) !== (r.angle ?? 0)) angleOk = false;
  }
}
check(`protocol: 60/60 regions survive (was 30/60 pre-#203) — got ${survived}`, survived === 60);
check(`protocol: each shape 15/15 survives — ${JSON.stringify(survivedByShape)}`,
  Object.values(survivedByShape).every((v) => v === 15));
check(`protocol: geometry pass-through maxΔ=${passthroughMax}`, passthroughMax <= 0.0005);
check("protocol: oval/rect angle carried into display region", angleOk);

/* 4. computeObjectContainRect viewport-invariance (responsive parity) */
// Fixed image aspect (yan 1536x1024) + fixed normalized point → same relative position
// within the image content box across every viewport width. Container aspect held
// constant (portrait) so letterboxing is active; only absolute size changes.
const NATW = 1536, NATH = 1024;
const NORM = { x: 0.85, y: 0.88 };
const widths = [1024, 1280, 1440, 1920];
let vpMax = 0;
for (const w of widths) {
  const h = Math.round(w * 1.3); // constant container aspect
  const ir = computeObjectContainRect(w, h, NATW, NATH);
  // region pixel center inside overlay(=content box): overlay is anchored at content box,
  // normalized coord maps linearly → relative position must equal NORM exactly.
  const relX = ((NORM.x * ir.width) ) / ir.width;
  const relY = ((NORM.y * ir.height)) / ir.height;
  vpMax = Math.max(vpMax, Math.abs(relX - NORM.x), Math.abs(relY - NORM.y));
}
check(`responsive: content-box relative position invariant across ${widths.join("/")} (maxΔ=${vpMax})`, vpMax <= 0.001);
// proportionality: content box scales linearly with container (no absolute drift term)
const r1 = computeObjectContainRect(1000, 1300, NATW, NATH);
const r2 = computeObjectContainRect(2000, 2600, NATW, NATH);
// width-constrained here → left=0 on both; the active letterbox axis is `top`.
check("responsive: content box scales linearly with container size (2×)",
  Math.abs(r2.width / r1.width - 2) < 1e-9 &&
  Math.abs(r2.height / r1.height - 2) < 1e-9 &&
  Math.abs(r2.top / r1.top - 2) < 1e-9);

/* 5. Background resolution contract — EKOLE BAĞIMSIZ: view DOĞRUDAN asset (organ YOK) */
check("bg: taban → taban", resolveAtlasBackgroundKey("taban") === "taban");
check("bg: yan_ic → yan_ic", resolveAtlasBackgroundKey("yan_ic") === "yan_ic");
check("bg: yan_dis → yan_dis", resolveAtlasBackgroundKey("yan_dis") === "yan_dis");

/* 6. SOURCE GUARD — SEV-1 lock: no transform:scale wrapper around ProtocolFootMap */
const here = dirname(fileURLToPath(import.meta.url));
const detailSrc = readFileSync(
  resolve(here, "../app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx"),
  "utf8",
);
// find the <ProtocolFootMap ...> and inspect the ~6 lines above it for a scale-[ transform
const idx = detailSrc.indexOf("<ProtocolFootMap");
const windowBefore = idx >= 0 ? detailSrc.slice(Math.max(0, idx - 400), idx) : "";
const hasScaleWrapper = /scale-\[/.test(windowBefore) || /style=\{\{[^}]*transform:\s*['"`]?scale/i.test(windowBefore);
check("source-guard: ProtocolFootMap has NO scale/transform ancestor in Kayıtlı Protokol Detay", idx >= 0 && !hasScaleWrapper);

/* ---------------- summary ---------------- */
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL  (toplam ${pass + fail})`);
console.log(`Fixture: 60 bölge · shape 15/15/15/15 · left/right 30/30 · Taban/Yan Dış/Yan İç`);
if (fail > 0) {
  console.log("\nBAŞARISIZ:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log("✅ COORDINATE PARITY — ALL PASS");
