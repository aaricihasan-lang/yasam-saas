/**
 * reflexology-side-view-harness.ts
 *
 * YAN İÇ / YAN DIŞ anatomik harita ayrımı regresyon kilidi.
 *
 * Bug: ProtocolFootMap yan görünümde `resolveAtlasBackgroundKey(footView, null)`
 * kullandığından (organ bilgisi yok) DAİMA yan_dis arka planına düşüyordu. Oysa
 * mesane/rahim/prostat YAN İÇ (klinik_yan_ic.png), diğer yan organlar YAN DIŞ
 * (klinik_yan_dis.png) üzerinde çizilir. Böylece yan_ic bölgeleri yanlış anatomik
 * arka plana (yan_dis) sızıyordu — SALES BLOCKER anatomik doğruluk hatası.
 *
 * Fix: protokol UI görünümü artık `AtlasBackgroundGroup` (taban/yan_ic/yan_dis);
 * gruplama TEK kaynaktan (`resolveProtocolAtlas` → `regionBackgroundGroup` =
 * view + isInnerYanOrgan, Word raporuyla AYNI çekirdek). Her bölge yalnız kendi
 * grubunun arka planında render edilir.
 *
 * GERÇEK üretim fonksiyonlarını çağırır (kopya iş kuralı YOK). Storage modeli
 * değişmez (view hâlâ taban|yan); grup organ kimliğinden TÜRETİLİR → migration YOK.
 *
 * Çalıştır:  npx tsx scripts/reflexology-side-view-harness.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { FootSide, FootView, Region, RegionShapeType } from "@/app/refleksoloji/bolge-haritasi/types";
import { mergeDraftIntoAtlas, type AtlasDocument } from "@/lib/atlasStorage";
import {
  resolveProtocolAtlas,
  regionBackgroundGroup,
  ALL_ATLAS_GROUPS,
  type AtlasBackgroundGroup,
} from "@/lib/refleksoloji/atlasRegionsCore";
import { isInnerYanOrgan } from "@/app/refleksoloji/bolge-haritasi/utils/atlasBackground";

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

/** availableViews — resolveProtocolViews app helper'ının SAF eşdeğeri (loadAtlas hariç). */
function availableViewsOf(atlas: AtlasDocument, organNames: string[]): AtlasBackgroundGroup[] {
  const resolved = resolveProtocolAtlas(atlas, organNames);
  return ALL_ATLAS_GROUPS.filter((g) => resolved.organs.some((o) => o.byGroup[g] > 0));
}

/* ---------------- 60-region fixture: 20 taban / 20 yan_ic / 20 yan_dis ---------------- */
const SHAPES: RegionShapeType[] = ["oval", "rect", "free_draw", "thick_line"];
const TABAN_ORGANS = ["Karaciğer", "Böbrek", "Kalp", "Mide"];
const YAN_IC_ORGANS = ["Mesane", "Rahim", "Prostat"]; // isInnerYanOrgan = true
const YAN_DIS_ORGANS = ["İnce bağırsak", "Omurga", "Diz", "Omuz"]; // isInnerYanOrgan = false

let seq = 0;
const rid = (t: string) => `sv-${t}-${(seq++).toString().padStart(3, "0")}`;
const p4 = (n: number) => Math.round(n * 1e4) / 1e4;

function makeRegion(shape: RegionShapeType, organ: string, footSide: FootSide, view: FootView, i: number): Region {
  const cx = p4(0.15 + ((i * 0.113) % 0.7));
  const cy = p4(0.15 + (((i + 3) * 0.113) % 0.7));
  const base = { id: rid(`${organ}-${shape}`), organ, footSide, view, shape, color: "#dc2626" } as Region;
  if (shape === "oval" || shape === "rect") return { ...base, cx, cy, rx: 0.05, ry: 0.04, angle: (i % 5) * 18 };
  if (shape === "free_draw") return { ...base, points: [{ x: cx, y: cy }, { x: p4(cx + 0.05), y: p4(cy + 0.03) }] };
  return { ...base, x1: cx, y1: cy, x2: p4(cx + 0.12), y2: p4(cy + 0.05), lineWidth: 0.003 };
}

const regions: Region[] = [];
function buildGroup(view: FootView, pool: string[]) {
  let gi = 0;
  for (const shape of SHAPES) {
    for (let k = 0; k < 5; k++) {
      regions.push(makeRegion(shape, pool[gi % pool.length], gi % 2 === 0 ? "left" : "right", view, gi));
      gi++;
    }
  }
}
buildGroup("taban", TABAN_ORGANS); // 20 → taban
buildGroup("yan", YAN_IC_ORGANS); // 20 → yan_ic
buildGroup("yan", YAN_DIS_ORGANS); // 20 → yan_dis

const ATLAS = mergeDraftIntoAtlas({ _meta: { version: "1", updated_at: "T" } } as AtlasDocument, regions, []);
const ALL_ORGANS = [...TABAN_ORGANS, ...YAN_IC_ORGANS, ...YAN_DIS_ORGANS];

console.log("Refleksoloji — YAN İÇ / YAN DIŞ AYRIM HARNESS\n");

/* 1. Canonical unit mapping */
check("mesane → yan_ic", regionBackgroundGroup({ view: "yan", organ: "Mesane" }) === "yan_ic");
check("rahim → yan_ic", regionBackgroundGroup({ view: "yan", organ: "Rahim" }) === "yan_ic");
check("prostat → yan_ic", regionBackgroundGroup({ view: "yan", organ: "Prostat" }) === "yan_ic");
check("ince bağırsak → yan_dis", regionBackgroundGroup({ view: "yan", organ: "İnce bağırsak" }) === "yan_dis");
check("omurga → yan_dis", regionBackgroundGroup({ view: "yan", organ: "Omurga" }) === "yan_dis");
check("böbrek(taban) → taban", regionBackgroundGroup({ view: "taban", organ: "Böbrek" }) === "taban");
check("isInnerYanOrgan(mesane)=true", isInnerYanOrgan("Mesane"));
check("isInnerYanOrgan(ince bağırsak)=false", !isInnerYanOrgan("İnce bağırsak"));

/* 2. Full resolve — partition counts 20/20/20 */
const full = resolveProtocolAtlas(ATLAS, ALL_ORGANS);
check(`taban group = 20 (got ${full.regionsByGroup.taban.length})`, full.regionsByGroup.taban.length === 20);
check(`yan_ic group = 20 (got ${full.regionsByGroup.yan_ic.length})`, full.regionsByGroup.yan_ic.length === 20);
check(`yan_dis group = 20 (got ${full.regionsByGroup.yan_dis.length})`, full.regionsByGroup.yan_dis.length === 20);

/* 3. NEGATIVE: no region ever sits in a group != its own regionBackgroundGroup */
let crossContamination = 0;
for (const group of ALL_ATLAS_GROUPS) {
  for (const r of full.regionsByGroup[group]) {
    if (regionBackgroundGroup({ view: r.view, organ: r.organ }) !== group) crossContamination++;
    if (r.group !== group) crossContamination++;
  }
}
check(`negative: 0 cross-background regions (got ${crossContamination})`, crossContamination === 0);

/* 4. NEGATIVE: yan_ic organ never appears in yan_dis bucket and vice-versa */
const yanIcOrgansInDis = full.regionsByGroup.yan_dis.filter((r) => isInnerYanOrgan(r.organ)).length;
const yanDisOrgansInIc = full.regionsByGroup.yan_ic.filter((r) => !isInnerYanOrgan(r.organ)).length;
check(`negative: yan_ic organ in yan_dis bucket = 0 (got ${yanIcOrgansInDis})`, yanIcOrgansInDis === 0);
check(`negative: yan_dis organ in yan_ic bucket = 0 (got ${yanDisOrgansInIc})`, yanDisOrgansInIc === 0);

/* 5. NEGATIVE: taban never mixes into any yan bucket */
const tabanInYan =
  full.regionsByGroup.yan_ic.filter((r) => r.view === "taban").length +
  full.regionsByGroup.yan_dis.filter((r) => r.view === "taban").length;
check(`negative: taban region in yan buckets = 0 (got ${tabanInYan})`, tabanInYan === 0);

/* 6. 4 shapes present in each group + left/right coverage */
for (const g of ALL_ATLAS_GROUPS) {
  const shapes = new Set(full.regionsByGroup[g].map((r) => r.shape));
  check(`${g}: all 4 shapes render (${[...shapes].sort().join(",")})`, SHAPES.every((s) => shapes.has(s)));
  const sides = new Set(full.regionsByGroup[g].map((r) => r.footSide));
  check(`${g}: both feet present`, sides.has("left") && sides.has("right"));
}

/* 7. Mixed protocol → two separate canvases (Mesane + İnce bağırsak) */
const mixed = resolveProtocolAtlas(ATLAS, ["Mesane", "İnce bağırsak"]);
check("mixed: yan_ic has ONLY mesane", mixed.regionsByGroup.yan_ic.every((r) => r.organ === "Mesane") && mixed.regionsByGroup.yan_ic.length > 0);
check("mixed: yan_dis has ONLY ince bağırsak", mixed.regionsByGroup.yan_dis.every((r) => r.organ === "İnce bağırsak") && mixed.regionsByGroup.yan_dis.length > 0);
check("mixed: taban empty", mixed.regionsByGroup.taban.length === 0);
check("mixed: availableViews = [yan_ic, yan_dis]",
  JSON.stringify(availableViewsOf(ATLAS, ["Mesane", "İnce bağırsak"])) === JSON.stringify(["yan_ic", "yan_dis"]));

/* 8. availableViews per scenario (empty-group behavior — no empty tab) */
check("only Böbrek(taban) → availableViews [taban]",
  JSON.stringify(availableViewsOf(ATLAS, ["Böbrek"])) === JSON.stringify(["taban"]));
check("only Mesane → availableViews [yan_ic]",
  JSON.stringify(availableViewsOf(ATLAS, ["Mesane"])) === JSON.stringify(["yan_ic"]));
check("Böbrek+Mesane → availableViews [taban, yan_ic] (no yan_dis)",
  JSON.stringify(availableViewsOf(ATLAS, ["Böbrek", "Mesane"])) === JSON.stringify(["taban", "yan_ic"]));

/* 9. Status semantics: byGroup counts feed correct "Yan İç/Yan Dış görünümünde N bölge" text */
const mesaneStatus = resolveProtocolAtlas(ATLAS, ["Mesane"]).organs[0];
check("status: Mesane found, byGroup.yan_ic>0, byGroup.yan_dis=0, byGroup.taban=0",
  mesaneStatus.found && mesaneStatus.byGroup.yan_ic > 0 && mesaneStatus.byGroup.yan_dis === 0 && mesaneStatus.byGroup.taban === 0);
check("status: Mesane groups = [yan_ic]", JSON.stringify(mesaneStatus.groups) === JSON.stringify(["yan_ic"]));

/* 10. Creation ↔ detail parity: shared pure resolver → identical output for same input */
const a = resolveProtocolAtlas(ATLAS, ALL_ORGANS);
const b = resolveProtocolAtlas(ATLAS, ALL_ORGANS);
check("creation/detail parity: resolver deterministic & identical",
  JSON.stringify(a.regionsByGroup) === JSON.stringify(b.regionsByGroup));

/* 11. SOURCE GUARD — ProtocolFootMap must NOT use resolveAtlasBackgroundKey(view, null) */
const here = dirname(fileURLToPath(import.meta.url));
const footMapSrc = readFileSync(
  resolve(here, "../app/refleksoloji/protokol-haritasi/components/ProtocolFootMap.tsx"),
  "utf8",
);
// strip comments so the explanatory note mentioning the old API doesn't false-positive
const codeOnly = footMapSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
check("source-guard: ProtocolFootMap does NOT import/call resolveAtlasBackgroundKey",
  !/resolveAtlasBackgroundKey/.test(codeOnly));
// and it must still keep the coordinate-drift fix (no scale wrapper on ProtocolFootMap in detail)
const detailSrc = readFileSync(
  resolve(here, "../app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx"),
  "utf8",
);
const idx = detailSrc.indexOf("<ProtocolFootMap");
const windowBefore = idx >= 0 ? detailSrc.slice(Math.max(0, idx - 400), idx) : "";
check("source-guard: coordinate-drift scale wrapper stays removed", idx >= 0 && !/scale-\[/.test(windowBefore));

/* ---------------- summary ---------------- */
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL  (toplam ${pass + fail})`);
console.log("Fixture: 60 bölge · 20 Taban / 20 Yan İç / 20 Yan Dış · 4 şekil · sol+sağ");
if (fail > 0) {
  console.log("\nBAŞARISIZ:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log("✅ YAN İÇ / YAN DIŞ AYRIM — ALL PASS");
