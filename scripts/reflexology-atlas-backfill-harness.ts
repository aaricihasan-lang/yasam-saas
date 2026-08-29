/**
 * reflexology-atlas-backfill-harness.ts
 *
 * LEGACY belge normalizasyonu (backfill) kilidi + storage MERGE audit (§24).
 *
 * Kanıtlar:
 *  - legacy {taban,yan} → explicit {taban,yan_ic,yan_dis} KAYIPSIZ
 *    (region count / IDs / geometry / foot side değişmez; legacy "yan" bucket → 0)
 *  - mevcut production davranışı: mesane/rahim/prostat yan → yan_ic; diğer yan → yan_dis
 *  - IDEMPOTENT: normalize(normalize(doc)) == normalize(doc)
 *  - MIXED (taban+yan+yan_ic/yan_dis) güvenli işlenir
 *  - duplicate region.id dedup (explicit bucket kazanır)
 *  - bilinmeyen organ legacy yan → deterministik hedef (yan_dis)
 *  - §24 MERGE: tek view'a save diğer view bucket'ını SİLMEZ (mergeDraftIntoAtlas)
 *
 * Çalıştır:  npx tsx scripts/reflexology-atlas-backfill-harness.ts
 */
import type { Region } from "@/app/refleksoloji/bolge-haritasi/types";
import {
  getRegionsForOrgan,
  mergeDraftIntoAtlas,
  mergeAtlasDocuments,
  type AtlasDocument,
  type StoredRegion,
} from "@/lib/atlasStorage";
import {
  normalizeAtlasDocument,
  countLegacyYanEntries,
  legacyYanTarget,
} from "@/lib/refleksoloji/atlasNormalize";

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

const oval = (id: string, cx: number): StoredRegion => ({ id, shape: "oval", cx, cy: 0.4, rx: 0.05, ry: 0.04, color: "#c00" });
const bucket = (regs: StoredRegion[] = [], sag: StoredRegion[] = []) => ({ sol: regs, sag });

// ── LEGACY belge: {taban, yan} ─────────────────────────────────────────────────
function legacyDoc(): unknown {
  return {
    _meta: { version: "1", updated_at: "2026-01-01T00:00:00.000Z" },
    "Mesane": { taban: bucket([oval("me-t1", 0.3)]), yan: bucket([oval("me-y1", 0.4), oval("me-y2", 0.5)]) },
    "İnce bağırsak": { taban: bucket(), yan: bucket([oval("in-y1", 0.4)], [oval("in-y2", 0.6)]) },
    "Böbrek": { taban: bucket([oval("bo-t1", 0.35)]), yan: bucket() },
  };
}

function totalRegions(doc: AtlasDocument, organs: string[]): number {
  return organs.reduce((n, o) => n + getRegionsForOrgan(doc, o).length, 0);
}
function idsOf(doc: AtlasDocument, organs: string[]): Set<string> {
  return new Set(organs.flatMap((o) => getRegionsForOrgan(doc, o).map((r) => r.id)));
}

console.log("Refleksoloji — ATLAS BACKFILL + MERGE AUDIT HARNESS\n");

const ORGANS = ["Mesane", "İnce bağırsak", "Böbrek"];
const legacy = legacyDoc();
check("fixture: legacy yan bucket sayısı = 3", countLegacyYanEntries(legacy) === 3);

const norm = normalizeAtlasDocument(legacy);

/* 1. KAYIPSIZ: region count / IDs korunur (Mesane 3 + İnce bağırsak 2 + Böbrek 1 = 6) */
check("1a. region count Δ=0 (6)", totalRegions(norm, ORGANS) === 6);
const legacyIds = new Set(["me-t1", "me-y1", "me-y2", "in-y1", "in-y2", "bo-t1"].filter(Boolean));
// (bo-t1 taban; toplam farklı id = 6)
const afterIds = idsOf(norm, ORGANS);
check("1b. tüm region ID'leri korunur (6 uniq)", afterIds.size === 6 && [...legacyIds].every((id) => afterIds.has(id)));

/* 2. LEGACY yan → doğru explicit hedef (mevcut production davranışı) */
const meYanIc = getRegionsForOrgan(norm, "Mesane", { view: "yan_ic" });
const meYanDis = getRegionsForOrgan(norm, "Mesane", { view: "yan_dis" });
check("2a. mesane legacy yan → yan_ic (2 region)", meYanIc.length === 2 && meYanDis.length === 0);
const inYanDis = getRegionsForOrgan(norm, "İnce bağırsak", { view: "yan_dis" });
const inYanIc = getRegionsForOrgan(norm, "İnce bağırsak", { view: "yan_ic" });
check("2b. ince bağırsak legacy yan → yan_dis (2 region, sol+sag)", inYanDis.length === 2 && inYanIc.length === 0);
check("2c. legacyYanTarget: mesane/rahim/prostat=yan_ic, diğer=yan_dis",
  legacyYanTarget("Mesane") === "yan_ic" && legacyYanTarget("Rahim") === "yan_ic" &&
  legacyYanTarget("Prostat") === "yan_ic" && legacyYanTarget("İnce bağırsak") === "yan_dis" &&
  legacyYanTarget("Bilinmeyen Organ") === "yan_dis");

/* 3. geometry + foot side korunur */
const me1 = getRegionsForOrgan(norm, "Mesane").find((r) => r.id === "me-y1");
check("3a. geometry korunur (me-y1 cx=0.4)", me1?.cx === 0.4 && me1?.shape === "oval");
const inSag = getRegionsForOrgan(norm, "İnce bağırsak").find((r) => r.id === "in-y2");
check("3b. foot side korunur (in-y2 = right/sag)", inSag?.footSide === "right" && inSag?.view === "yan_dis");

/* 4. legacy "yan" bucket kalmadı */
check("4. normalize sonrası legacy yan bucket sayısı = 0", countLegacyYanEntries(norm) === 0);

/* 5. IDEMPOTENT */
const norm2 = normalizeAtlasDocument(norm);
check("5. idempotent: normalize(normalize(doc)) == normalize(doc)",
  JSON.stringify(norm2) === JSON.stringify(norm));

/* 6. MIXED (taban + yan + yan_ic/yan_dis aynı organda) + duplicate id dedup */
const mixed = {
  _meta: { version: "1", updated_at: "T" },
  "Mesane": {
    taban: bucket([oval("mx-t", 0.3)]),
    yan_ic: bucket([oval("mx-shared", 0.45)]),          // explicit (kazanır)
    yan_dis: bucket([oval("mx-dis", 0.55)]),
    yan: bucket([oval("mx-shared", 0.99), oval("mx-legacy", 0.4)]), // shared → dedup; legacy → yan_ic
  },
};
const mixedNorm = normalizeAtlasDocument(mixed);
const mxIds = getRegionsForOrgan(mixedNorm, "Mesane").map((r) => r.id).sort();
check("6a. mixed: duplicate id dedup (mx-shared 1 kez)",
  mxIds.filter((id) => id === "mx-shared").length === 1);
check("6b. mixed: region set = {mx-t, mx-shared, mx-dis, mx-legacy}",
  JSON.stringify(mxIds) === JSON.stringify(["mx-dis", "mx-legacy", "mx-shared", "mx-t"]));
const mxSharedView = getRegionsForOrgan(mixedNorm, "Mesane").find((r) => r.id === "mx-shared")?.view;
check("6c. mixed: explicit yan_ic korunur (mx-shared view=yan_ic, cx=0.45 explicit kazandı)",
  mxSharedView === "yan_ic" && getRegionsForOrgan(mixedNorm, "Mesane").find((r) => r.id === "mx-shared")?.cx === 0.45);
const mxLegacyView = getRegionsForOrgan(mixedNorm, "Mesane").find((r) => r.id === "mx-legacy")?.view;
check("6d. mixed: legacy yan → yan_ic (mesane)", mxLegacyView === "yan_ic");
check("6e. mixed: idempotent", JSON.stringify(normalizeAtlasDocument(mixedNorm)) === JSON.stringify(mixedNorm));

/* 7. §24 MERGE: tek view'a save diğer view'ı SİLMEZ (mergeDraftIntoAtlas) */
const base = mergeDraftIntoAtlas(
  { _meta: { version: "1", updated_at: "T" } } as AtlasDocument,
  [
    ...[0, 1, 2].map((i) => ({ id: `ic-${i}`, organ: "Mesane", footSide: "left", view: "yan_ic", shape: "oval", cx: 0.3, cy: 0.4, rx: 0.05, ry: 0.04 } as Region)),
    ...[0, 1, 2, 3].map((i) => ({ id: `dis-${i}`, organ: "Mesane", footSide: "left", view: "yan_dis", shape: "oval", cx: 0.5, cy: 0.5, rx: 0.05, ry: 0.04 } as Region)),
  ],
  [],
);
check("7a. base: mesane yan_ic=3, yan_dis=4",
  getRegionsForOrgan(base, "Mesane", { view: "yan_ic" }).length === 3 &&
  getRegionsForOrgan(base, "Mesane", { view: "yan_dis" }).length === 4);
// incoming: yalnız yan_ic'e +1 (mevcut base'e ekle → mergeDraftIntoAtlas base'i okur)
const afterSave = mergeDraftIntoAtlas(base, [
  { id: "ic-new", organ: "Mesane", footSide: "left", view: "yan_ic", shape: "oval", cx: 0.31, cy: 0.41, rx: 0.05, ry: 0.04 } as Region,
], []);
check("7b. yan_ic'e +1 sonrası yan_ic=4 VE yan_dis=4 KORUNUR (partial update leakage YOK)",
  getRegionsForOrgan(afterSave, "Mesane", { view: "yan_ic" }).length === 4 &&
  getRegionsForOrgan(afterSave, "Mesane", { view: "yan_dis" }).length === 4);

/* 8. §24 mergeAtlasDocuments: 3-view bucket yapısı server-merge'de bozulmaz.
   GERÇEKÇİ: doclar mergeDraftIntoAtlas ile kurulur (organUpdatedAt damgası → hydrate yolu). */
const EMPTY_DOC = { _meta: { version: "1", updated_at: "T" } } as AtlasDocument;
const r = (id: string, organ: string, view: Region["view"], cx: number): Region =>
  ({ id, organ, footSide: "left", view, shape: "oval", cx, cy: 0.4, rx: 0.05, ry: 0.04 } as Region);
const serverDoc = mergeDraftIntoAtlas(EMPTY_DOC, [
  r("s-t", "Mesane", "taban", 0.3), r("s-ic", "Mesane", "yan_ic", 0.4), r("s-dis", "Mesane", "yan_dis", 0.5),
], []);
const localDoc = mergeDraftIntoAtlas(EMPTY_DOC, [r("l-t", "Böbrek", "taban", 0.3)], []);
const merged = mergeAtlasDocuments(serverDoc, localDoc);
check("8. mergeAtlasDocuments: mesane 3-view sağlam + böbrek (yerel-özel) korunur",
  getRegionsForOrgan(merged, "Mesane", { view: "yan_ic" }).length === 1 &&
  getRegionsForOrgan(merged, "Mesane", { view: "yan_dis" }).length === 1 &&
  getRegionsForOrgan(merged, "Mesane", { view: "taban" }).length === 1 &&
  getRegionsForOrgan(merged, "Böbrek").length === 1);

console.log(`\n──────── SONUÇ: ${pass}/${pass + fail} PASS ────────`);
if (fail > 0) {
  console.error(`\n${fail} test BAŞARISIZ:\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log("✅ ATLAS BACKFILL + MERGE — tüm testler geçti.");
