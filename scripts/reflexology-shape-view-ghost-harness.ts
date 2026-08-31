/**
 * reflexology-shape-view-ghost-harness.ts
 *
 * Round-2 regresyon: Protokol Haritası atlas okuma/render/status + zombie fix.
 * GERÇEK üretim fonksiyonlarını çağırır (kopya mantık yok):
 *   isRenderableAtlasRegion, atlasRegionToDisplay, computeOrganStatus,
 *   organHasAtlasRegions, mergeOrganListsWithTombstones, deadOrganKeys.
 *
 * Prod kanıtına dayalı gerçek fixture:
 *   böbrek: free_draw × 2  / Taban
 *   kalp:   oval     × 2  / Taban
 *   karaciğer: rect  × 2  / Taban
 *   mesane: rect     × 2  / YAN   (Taban=0)
 *
 * Çalıştır: npx tsx scripts/reflexology-shape-view-ghost-harness.ts
 */
import {
  computeOrganStatus,
  atlasRegionToDisplay,
} from "@/app/refleksoloji/protokol-haritasi/lib/resolveDisplayRegions";
import {
  isRenderableAtlasRegion,
  organHasAtlasRegions,
} from "@/app/refleksoloji/protokol-haritasi/lib/atlasMatch";
import {
  mergeOrganListsWithTombstones,
  deadOrganKeys,
  normOrgan,
  markOrganDeleted,
  markOrganUpserted,
  type AtlasDocLike,
} from "@/lib/refleksoloji/atlasMerge";
import { listOrphanOrganList } from "@/app/refleksoloji/kayitli-atlas/lib/atlasManage";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import {
  emptyOrganEntry,
  type AtlasDocument,
  type StoredRegion,
} from "@/lib/atlasStorage";
import type { Region } from "@/app/refleksoloji/bolge-haritasi/types";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    fails.push(name);
    console.log(`  ❌ ${name}`);
  }
}

// ── Region üreticiler (tüm şekiller) ──
const oval = (id: string): StoredRegion => ({ id, shape: "oval", cx: 0.3, cy: 0.4, rx: 0.05, ry: 0.04 });
const rect = (id: string): StoredRegion => ({ id, shape: "rect", cx: 0.6, cy: 0.5, rx: 0.06, ry: 0.05 });
const freeDraw = (id: string): StoredRegion => ({
  id, shape: "free_draw",
  points: [{ x: 0.2, y: 0.2 }, { x: 0.25, y: 0.28 }, { x: 0.22, y: 0.35 }],
});
const thickLine = (id: string): StoredRegion => ({
  id, shape: "thick_line", x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.42, lineWidth: 0.004,
});

function organEntry(regions: StoredRegion[], view: "taban" | "yan_ic" = "taban") {
  const e = emptyOrganEntry();
  for (const r of regions) e[view].sol.push(r);
  return e;
}

// Gerçek prod kabul fixture'ı
const atlas: AtlasDocument = {
  _meta: { version: "1", updated_at: "2026-08-25T14:39:26.354Z" } as AtlasDocument["_meta"],
  ["böbrek"]: organEntry([freeDraw("bo1"), freeDraw("bo2")], "taban"),
  ["kalp"]: organEntry([oval("ka1"), oval("ka2")], "taban"),
  ["karaciğer"]: organEntry([rect("kc1"), rect("kc2")], "taban"),
  ["mesane"]: organEntry([rect("me1"), rect("me2")], "yan_ic"),
};

const st = (name: string, view: "taban" | "yan_ic") => computeOrganStatus(atlas, name, 0, view);

console.log("=== A) SHAPE — tüm geçerli şekiller geçerli/renderlanabilir ===");
check("A1 oval renderable", isRenderableAtlasRegion({ ...oval("x"), organ: "k", footSide: "left", view: "taban" } as Region));
check("A2 rect renderable", isRenderableAtlasRegion({ ...rect("x"), organ: "k", footSide: "left", view: "taban" } as Region));
check("A3 free_draw renderable", isRenderableAtlasRegion({ ...freeDraw("x"), organ: "k", footSide: "left", view: "taban" } as Region));
check("A4 thick_line renderable", isRenderableAtlasRegion({ ...thickLine("x"), organ: "k", footSide: "left", view: "taban" } as Region));
check("A5 bozuk oval (rx yok) renderable DEĞİL", !isRenderableAtlasRegion({ id: "b", shape: "oval", cx: 0.1, cy: 0.1, organ: "k", footSide: "left", view: "taban" } as Region));
check("A6 boş free_draw renderable DEĞİL", !isRenderableAtlasRegion({ id: "b", shape: "free_draw", points: [], organ: "k", footSide: "left", view: "taban" } as Region));

console.log("\n=== A') BÖBREK free_draw — Atlas bulundu (2) [KÖK BUG] ===");
const bo = st("böbrek", "taban");
check("A'1 böbrek found=true (free_draw artık düşmüyor)", bo.found);
check("A'2 böbrek total=2", bo.regionCount === 2);
check("A'3 böbrek Taban current=2", bo.currentViewRegionCount === 2);
check("A'4 organHasAtlasRegions(böbrek) = true", organHasAtlasRegions(atlas, "böbrek"));
check("A'5 kalp(oval) found & total=2", st("kalp", "taban").found && st("kalp", "taban").regionCount === 2);
check("A'6 karaciğer(rect) found & total=2", st("karaciğer", "taban").found && st("karaciğer", "taban").regionCount === 2);

console.log("\n=== A'') RENDER DTO — geometri kaybolmuyor ===");
const dtoFree = atlasRegionToDisplay({ ...freeDraw("f"), organ: "böbrek", footSide: "left", view: "taban" } as Region);
check("A''1 free_draw DTO points korunur (3 nokta)", !!dtoFree && dtoFree.shape === "free_draw" && (dtoFree.points?.length ?? 0) === 3);
const dtoLine = atlasRegionToDisplay({ ...thickLine("t"), organ: "x", footSide: "left", view: "taban" } as Region);
check("A''2 thick_line DTO x1/y1/x2/y2 korunur", !!dtoLine && dtoLine.shape === "thick_line" && dtoLine.x1 === 0.1 && dtoLine.y2 === 0.42);
const dtoRect = atlasRegionToDisplay({ ...rect("r"), organ: "x", footSide: "left", view: "taban" } as Region);
check("A''3 rect DTO cx/cy/rx/ry korunur (regresyon yok)", !!dtoRect && dtoRect.shape === "rect" && dtoRect.cx === 0.6 && dtoRect.rx === 0.06);

console.log("\n=== B) VIEW — mesane yalnız YAN'da; global VAR, Taban current=0 ===");
const meTaban = st("mesane", "taban");
const meYan = st("mesane", "yan_ic");
check("B1 mesane global found=true (Taban açıkken bile)", meTaban.found);
check("B2 mesane total=2", meTaban.regionCount === 2);
check("B3 mesane Taban current=0", meTaban.currentViewRegionCount === 0);
check("B4 mesane availableViews = [yan]", meTaban.availableViews.length === 1 && meTaban.availableViews[0] === "yan_ic");
check("B5 mesane Taban açıkken 'Atlas bulunamadı' listesine GİRMEZ (found=true)", meTaban.found === true);
check("B6 mesane Yan current=2", meYan.currentViewRegionCount === 2);

console.log("\n=== 7) Gerçekten olmayan organ → Atlas bulunamadı ===");
const dalak = st("dalak", "taban");
check("7-1 dalak found=false", !dalak.found);
check("7-2 dalak total=0 & availableViews boş", dalak.regionCount === 0 && dalak.availableViews.length === 0);

console.log("\n=== D) GHOST / ZOMBIE — tombstone-farkında organ listesi ===");
// D1: sunucuda UAT-Bolge-Test var, local'de yok, TOMBSTONE var → dirilmez.
const metaTomb = { tombstones: { "uat-bolge-test": "2026-08-25T15:00:00.000Z" }, organUpdatedAt: {} };
const d1 = mergeOrganListsWithTombstones(["böbrek", "UAT-Bolge-Test"], ["böbrek"], metaTomb);
check("D1 tombstone'lu UAT-Bolge-Test hydrate sonrası DİRİLMEZ", !d1.includes("UAT-Bolge-Test"));
check("D1' gerçek organ (böbrek) korunur", d1.includes("böbrek"));

// D2: tombstone YOK → mevcut ürün davranışı (bölgesiz organ korunur).
const d2 = mergeOrganListsWithTombstones(["böbrek", "UAT-Bolge-Test"], [], { tombstones: {}, organUpdatedAt: {} });
check("D2 tombstone yoksa organ korunur (bilinçli bölgesiz organ bozulmaz)", d2.includes("UAT-Bolge-Test"));

// D3: silindikten SONRA yeniden eklendiyse (upd > tomb) → yaşar.
const metaReadd = { tombstones: { "böbrek": "2026-08-25T10:00:00.000Z" }, organUpdatedAt: { "böbrek": "2026-08-25T12:00:00.000Z" } };
check("D3 silme sonrası yeniden eklenen organ yaşar", mergeOrganListsWithTombstones(["böbrek"], [], metaReadd).includes("böbrek"));
check("D3' deadOrganKeys re-add'i ölü saymaz", !deadOrganKeys(metaReadd).has("böbrek"));

// D4: kanonik duplicate — KARACİĞER + karaciğer tek satır.
const d4 = mergeOrganListsWithTombstones(["KARACİĞER"], ["karaciğer"], { tombstones: {}, organUpdatedAt: {} });
check("D4 KARACİĞER + karaciğer → dropdown tek kanonik organ", d4.length === 1);

// D5: local'de silinmiş (tombstoned) ama server bayat kopya taşıyor → dirilmez.
const metaDead = { tombstones: { "eskiorgan": "2026-08-25T15:00:00.000Z" }, organUpdatedAt: {} };
check("D5 server bayat kopyası tombstoned organı diriltemez",
  !mergeOrganListsWithTombstones(["eskiOrgan", "kalp"], [], metaDead).some((o) => o.toLocaleLowerCase("tr") === "eskiorgan"));

console.log("\n=== E) GERÇEK KABUL FIXTURE (prod) ===");
check("E-böbrek free_draw 2 Taban → bulundu(2)", st("böbrek", "taban").found && st("böbrek", "taban").regionCount === 2);
check("E-kalp oval 2 Taban → bulundu(2)", st("kalp", "taban").found && st("kalp", "taban").regionCount === 2);
check("E-karaciğer rect 2 Taban → bulundu(2)", st("karaciğer", "taban").found && st("karaciğer", "taban").regionCount === 2);
const meAcc = st("mesane", "taban");
check("E-mesane global bulundu(2), Taban current=0, Yan current=2",
  meAcc.found && meAcc.regionCount === 2 && meAcc.currentViewRegionCount === 0 && st("mesane", "yan_ic").currentViewRegionCount === 2);

console.log("\n=== F) GHOST-ONLY ORGAN YÖNETİMİ + SİLME (yeni ürün akışı) ===");
// F1: orphan tespiti — organ_list'te var, atlas'ta yok → orphan listesinde.
const orphanList = ["böbrek", "kalp", "karaciğer", "mesane", "UAT-Bolge-Test"];
const orphans = listOrphanOrganList(atlas, orphanList);
check("F1 UAT-Bolge-Test orphan listesinde görünür", orphans.includes("UAT-Bolge-Test"));
check("F1' gerçek atlas organları orphan listesine DÜŞMEZ (böbrek/kalp/karaciğer/mesane)",
  !["böbrek", "kalp", "karaciğer", "mesane"].some((o) => orphans.includes(o)) && orphans.length === 1);

// F2: silme simülasyonu — markOrganDeleted mezar taşı yazar → dead sayılır.
const doc: AtlasDocLike = { _meta: { tombstones: {}, organUpdatedAt: {} } };
markOrganDeleted(doc, "UAT-Bolge-Test", "2026-08-25T15:00:00.000Z");
check("F2 silme sonrası canonical tombstone oluşur",
  deadOrganKeys(doc._meta).has(organKey("UAT-Bolge-Test")));

// F3: stale server/local kopyası hydrate'te DİRİLMEZ.
const afterDelete = mergeOrganListsWithTombstones(["UAT-Bolge-Test", "kalp"], ["UAT-Bolge-Test"], doc._meta);
check("F3 stale kopya hydrate sonrası UAT-Bolge-Test'i diriltemez", !afterDelete.includes("UAT-Bolge-Test"));
check("F3' orphan silindikten sonra artık orphan listesinde de yok",
  !listOrphanOrganList(atlas, mergeOrganListsWithTombstones(["UAT-Bolge-Test"], [], doc._meta)).includes("UAT-Bolge-Test"));

// F4: kullanıcı aynı organı BİLİNÇLİ yeniden oluşturursa → tombstone geçersiz, yaşar.
markOrganUpserted(doc, "UAT-Bolge-Test", "2026-08-25T16:00:00.000Z");
check("F4 yeniden oluşturulan organ (daha yeni damga) tombstone'u geçersiz kılar",
  !deadOrganKeys(doc._meta).has(organKey("UAT-Bolge-Test")) &&
    mergeOrganListsWithTombstones(["UAT-Bolge-Test"], [], doc._meta).includes("UAT-Bolge-Test"));

// F5: NFD/NFC tombstone identity — AYNI canonical key.
check("F5 normOrgan tek kanonik kaynak (NFD karaciğer == NFC KARACİĞER)",
  normOrgan("karaciğer".normalize("NFD")) === normOrgan("KARACİĞER"));
const docNfd: AtlasDocLike = { _meta: { tombstones: {}, organUpdatedAt: {} } };
markOrganDeleted(docNfd, "karaciğer".normalize("NFD"), "2026-08-25T15:00:00.000Z");
check("F5' NFD tombstone, NFC KARACİĞER organ listesini de öldürür (canonical)",
  !mergeOrganListsWithTombstones(["KARACİĞER"], [], docNfd._meta).some(
    (o) => organKey(o) === organKey("karaciğer"),
  ));

console.log(`\n──────── SONUÇ: ${pass}/${pass + fail} PASS ────────`);
if (fail > 0) {
  console.log("BAŞARISIZ:", fails.join(" | "));
  process.exit(1);
}
console.log("✅ Shape/View/Ghost regresyon testleri geçti.");
