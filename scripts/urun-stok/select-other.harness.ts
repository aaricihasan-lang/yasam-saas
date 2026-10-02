/**
 * ÜRÜN & STOK — "Diğer" serbest metin HARNESS (SAF; DB/ağ yok).
 *   - splitOtherValue / composeOtherValue: trim, boşluk sadeleştirme, 60 sınır, tr-TR büyük/küçük harf,
 *     eski literal "Diğer" round-trip, liste dışı (eski) değerin düzenlemede doğru yüklenmesi
 *   - checkFreeTextFields (sunucu): kırpma + 80 sınır, string dışı değerlere dokunmama
 *   - stok mantığı: serbest yağ türüyle addOrUpdateOilItem baseUnit/dönüşüm KORUNUR;
 *     serbest Doğaltaş türü isDizi + addOrUpdateInventoryItem
 *   - statik: ölçü tipi / birim alanlarında serbest giriş YOK; route'larda yalnız etiket kolonları
 * Çalıştır: npx tsx scripts/urun-stok/select-other.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  checkFreeTextFields,
  composeOtherValue,
  isOtherOption,
  normalizeOtherText,
  OTHER_TEXT_MAX,
  splitOtherValue,
} from "../../lib/urun-stok/selectOther";
import { addOrUpdateOilItem, OIL_TYPES, PACKAGE_TYPES } from "../../lib/urun-stok/oilStockLogic";
import { PRODUCT_GROUPS as SC_GROUPS, PACKAGING_TYPES } from "../../lib/urun-stok/soapCreamStockLogic";
import { MATERIALS, PRODUCT_GROUPS as AK_GROUPS } from "../../lib/urun-stok/accessoryStockLogic";
import { PRODUCT_GROUPS as OT_GROUPS } from "../../lib/urun-stok/otherStockLogic";
import { addOrUpdateInventoryItem, isDizi, STONE_TYPES, turkishUpper } from "../../lib/urun-stok/dogaltasStockLogic";
import { DEMO_OIL_INV } from "../../lib/demo/demoUrunStok";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. split ────────────────────────────────────────────────────────────────
section("1. splitOtherValue");
ok(eq(splitOtherValue("Sabit Yağ", OIL_TYPES), { select: "Sabit Yağ", custom: "" }), "listede olan değer → aynen");
ok(eq(splitOtherValue("  sabit yağ ", OIL_TYPES), { select: "Sabit Yağ", custom: "" }), "büyük/küçük harf + boşluk duyarsız eşleşme (tr-TR)");
ok(eq(splitOtherValue("Hidrosol", OIL_TYPES), { select: "Diğer", custom: "Hidrosol" }), "liste dışı değer → Diğer + metin (düzenleme bug'ı)");
ok(eq(splitOtherValue("Diğer", OIL_TYPES), { select: "Diğer", custom: "" }), "eski literal 'Diğer' → Diğer, metin boş");
ok(eq(splitOtherValue("DİĞER", OIL_TYPES), { select: "Diğer", custom: "" }), "'DİĞER' (tr-TR) = 'Diğer'");
ok(eq(splitOtherValue("diğer", PACKAGE_TYPES), { select: "diğer", custom: "" }), "küçük harfli liste ('diğer') korunur");
ok(eq(splitOtherValue("amber cam şişe", PACKAGE_TYPES), { select: "diğer", custom: "amber cam şişe" }), "ambalaj liste dışı → diğer + metin");
ok(eq(splitOtherValue("", OIL_TYPES), { select: OIL_TYPES[0], custom: "" }) && eq(splitOtherValue(null, MATERIALS), { select: MATERIALS[0], custom: "" }), "boş/null → ilk seçenek");
ok(eq(splitOtherValue("12 MM DİZİ", [...STONE_TYPES, "DİĞER"], "DİĞER"), { select: "DİĞER", custom: "12 MM DİZİ" }), "Doğaltaş serbest tür → DİĞER + metin");
ok(eq(splitOtherValue("X", ["A", "B"]), { select: "X", custom: "" }), "listede 'Diğer' yoksa değer olduğu gibi (davranış değişmez)");
ok(isOtherOption("diğer") && isOtherOption(" DİĞER ") && !isOtherOption("Uçucu Yağ"), "isOtherOption tr-TR");

// ── 2. compose ──────────────────────────────────────────────────────────────
section("2. composeOtherValue");
ok(composeOtherValue("Uçucu Yağ", "yok sayılır", OIL_TYPES) === "Uçucu Yağ", "Diğer dışı seçim → seçim aynen (metin yok sayılır)");
ok(composeOtherValue("Diğer", "  Hidrosol  ", OIL_TYPES) === "Hidrosol", "trim");
ok(composeOtherValue("Diğer", "Gül \n  suyu\t hidrosol", OIL_TYPES) === "Gül suyu hidrosol", "boşluk sadeleştirme");
ok(composeOtherValue("Diğer", "x".repeat(100), OIL_TYPES).length === OTHER_TEXT_MAX && OTHER_TEXT_MAX === 60, "60 karakter sınırı");
ok(composeOtherValue("Diğer", "   ", OIL_TYPES) === "Diğer" && composeOtherValue("diğer", "", PACKAGE_TYPES) === "diğer", "boş metin → literal Diğer (eski veri uyumlu)");
ok(composeOtherValue("Diğer", "sabit YAĞ", OIL_TYPES) === "Sabit Yağ", "listedeki bir seçenekle aynı metin → o seçenek");
ok(composeOtherValue("DİĞER", "12 mm dizi", [...STONE_TYPES, "DİĞER"], "DİĞER") === "12 mm dizi" && turkishUpper(composeOtherValue("DİĞER", "12 mm dizi", [...STONE_TYPES, "DİĞER"], "DİĞER")) === "12 MM DİZİ", "Doğaltaş: compose + turkishUpper");
ok(normalizeOtherText(" a  b ") === "a b", "normalizeOtherText");
// Round-trip: split(compose(...)) her durumda formu aynı geri kurar.
for (const [list, sel, txt] of [
  [OIL_TYPES, "Diğer", "Hidrosol"], [OIL_TYPES, "Diğer", ""], [OIL_TYPES, "Sabit Yağ", ""],
  [PACKAGE_TYPES, "diğer", "amber cam"], [SC_GROUPS, "Diğer", "Dudak balmı"], [PACKAGING_TYPES, "diğer", "teneke"],
  [AK_GROUPS, "Diğer", "Halhal"], [MATERIALS, "diğer", "pirinç"], [OT_GROUPS, "Diğer", "Kırtasiye"],
] as Array<[readonly string[], string, string]>) {
  const stored = composeOtherValue(sel, txt, list);
  const back = splitOtherValue(stored, list);
  ok(back.select === sel && back.custom === txt, `round-trip ${sel}+"${txt}" → "${stored}"`, back);
}
ok([OIL_TYPES, PACKAGE_TYPES, SC_GROUPS, PACKAGING_TYPES, AK_GROUPS, MATERIALS, OT_GROUPS].every((l) => l.some((o) => isOtherOption(o))), "tüm etiket listelerinde 'Diğer' seçeneği var");

// ── 3. Sunucu sınırı ────────────────────────────────────────────────────────
section("3. checkFreeTextFields (sunucu)");
const r1 = checkFreeTextFields({ oil_type: "  Hidrosol ", name: " X ", stock_base: 5 }, ["oil_type", "package_type"]);
ok(r1.ok && r1.body.oil_type === "Hidrosol" && r1.body.name === " X " && r1.body.stock_base === 5 && !("package_type" in r1.body), "yalnız listedeki string alanlar kırpılır; diğerleri aynen");
ok(checkFreeTextFields({ oil_type: "x".repeat(80) }, ["oil_type"]).ok, "80 karakter → kabul");
const r2 = checkFreeTextFields({ oil_type: "x".repeat(81) }, ["oil_type"]);
ok(!r2.ok && r2.field === "oil_type", "81 karakter → ret (400)");
ok(checkFreeTextFields({ type: ` ${"y".repeat(80)} ` }, ["type"]).ok, "kırpma sonrası 80 → kabul");
ok(checkFreeTextFields({ material: null, product_group: 3 }, ["material", "product_group"]).ok, "string dışı değerlere dokunulmaz");

// ── 4. Stok mantığı korunur ─────────────────────────────────────────────────
section("4. Stok mantığı (birim/dönüşüm korunur)");
const oil = addOrUpdateOilItem([], {
  name: "GÜL SUYU", oilType: composeOtherValue("Diğer", "Hidrosol", OIL_TYPES), measureType: "ML / Litre", stockQty: 1.5, inputUnit: "litre",
  costTotal: 600, salePriceTotal: 1200, profitPct: 100, bottleVolume: "100 ml", bottleVolumeCustom: "", packageType: composeOtherValue("diğer", "amber cam şişe", PACKAGE_TYPES),
  photos: [], note: "", deltaMode: true,
});
ok(oil.ok, "serbest yağ türüyle kayıt eklenir", oil);
if (oil.ok) {
  const it = oil.items[0];
  ok(it.oilType === "Hidrosol" && it.packageType === "amber cam şişe", "serbest etiketler saklandı");
  ok(it.baseUnit === "ml" && it.stockBase === 1500, `baseUnit ml + 1.5 L → 1500 ml (${it.baseUnit} ${it.stockBase})`);
  ok(Math.abs(it.costPerBase - 0.4) < 1e-9, `birim maliyet ml bazında (${it.costPerBase})`);
  const upd = addOrUpdateOilItem(oil.items, {
    id: it.id, name: it.name, oilType: "Hidrosol", measureType: "ML / Litre", stockQty: 200, inputUnit: "ml", costTotal: 80, salePriceTotal: 160, profitPct: 100,
    bottleVolume: "100 ml", bottleVolumeCustom: "", packageType: "amber cam şişe", photos: [], note: "", deltaMode: true,
  });
  ok(upd.ok && upd.items[0].stockBase === 1700 && upd.items[0].baseUnit === "ml", "güncelleme: delta ml bazında (1700)");
}
const bad = addOrUpdateOilItem([], {
  name: "X", oilType: "Hidrosol", measureType: "Adet", stockQty: 5, inputUnit: "ml", costTotal: 0, salePriceTotal: 0, profitPct: 0,
  bottleVolume: "10 ml", bottleVolumeCustom: "", packageType: "kavanoz", photos: [], note: "", deltaMode: true,
});
ok(!bad.ok, "ölçü tipi / birim uyumsuzluğu hâlâ reddediliyor (serbest tür bunu etkilemez)");

ok(isDizi(turkishUpper("12 mm dizi")) && isDizi("12 MM DİZİ") && !isDizi("BİLEKLİK") && !isDizi("DİĞER"), "isDizi serbest türlerde (DİZİ içeren → dizi)");
const stone = addOrUpdateInventoryItem([], { name: "SİTRİN", type: "12 MM DİZİ", stokIn: 3, diziTlIn: 300, diziUsdIn: 0, diziEurIn: 0, usdRateIn: 0, eurRateIn: 0, adetTlIn: 0, pendingPhotos: [] });
ok(stone.ok && stone.items[0].type === "12 MM DİZİ" && stone.items[0].adet === 3, "serbest DİZİ türüyle Doğaltaş kaydı", stone);
const stone2 = addOrUpdateInventoryItem([], { name: "AMETİST", type: "BİLEKLİK", stokIn: 2, diziTlIn: 0, diziUsdIn: 0, diziEurIn: 0, usdRateIn: 0, eurRateIn: 0, adetTlIn: 150, pendingPhotos: [] });
ok(stone2.ok && stone2.items[0].type === "BİLEKLİK" && stone2.items[0].adet_price === 150, "serbest adet türüyle Doğaltaş kaydı", stone2);

// ── 5. Demo fixture ─────────────────────────────────────────────────────────
section("5. Demo fixture");
const hid = DEMO_OIL_INV.find((o) => o.oilType === "Hidrosol");
ok(!!hid && eq(splitOtherValue(hid.oilType, OIL_TYPES), { select: "Diğer", custom: "Hidrosol" }) && hid.baseUnit === "ml", "demo: serbest yağ türü örneği (Hidrosol) Diğer olarak yüklenir");

// ── 6. Statik ───────────────────────────────────────────────────────────────
section("6. Statik — birim alanları serbest girişe kapalı");
const pages: Record<string, string[]> = {
  "app/urun-stok/yag/page.tsx": ["oilType", "packageType"],
  "app/urun-stok/sabun-krem/page.tsx": ["productGroup", "packagingType"],
  "app/urun-stok/aksesuar/page.tsx": ["productGroup", "material"],
  "app/urun-stok/diger/page.tsx": ["productGroup"],
  "app/urun-stok/dogaltas/page.tsx": ["stoneType"],
};
for (const [p, fields] of Object.entries(pages)) {
  const src = read(p);
  const uses = [...src.matchAll(/<SelectWithOther[\s\S]*?value=\{(\w+)\}/g)].map((m) => m[1]);
  ok(eq(uses.sort(), [...fields].sort()), `${p}: SelectWithOther yalnız ${fields.join(", ")}`, uses);
  ok(!uses.some((u) => /measure|unit|sizeKind|bottle/i.test(u)), `${p}: ölçü tipi / birim / şişe hacmi serbest girişe açılmadı`);
  ok(/composeOtherValue\(/.test(src), `${p}: kaydetmede composeOtherValue`);
  if (p !== "app/urun-stok/dogaltas/page.tsx") ok(/splitOtherValue\(/.test(src), `${p}: loadToForm'da splitOtherValue`);
}
const routes: Record<string, string[]> = {
  "app/api/urun-stok/yag/route.ts": ["oil_type", "package_type"],
  "app/api/urun-stok/sabun-krem/route.ts": ["product_group", "packaging_type"],
  "app/api/urun-stok/aksesuar/route.ts": ["product_group", "material"],
  "app/api/urun-stok/diger/route.ts": ["product_group"],
  "app/api/dogaltas/inventory/route.ts": ["type"],
};
for (const [p, keys] of Object.entries(routes)) {
  const src = read(p);
  const m = /const FREE_TEXT_KEYS = (\[[^\]]*\]) as const;/.exec(src);
  ok(!!m && eq(JSON.parse(m[1]), keys), `${p}: FREE_TEXT_KEYS = ${keys.join(", ")}`, m?.[1]);
  ok((src.match(/checkFreeTextFields\(body, FREE_TEXT_KEYS\)/g) ?? []).length === 2, `${p}: POST + PATCH sınır kontrolü`);
}
const comp = read("app/urun-stok/SelectWithOther.tsx");
ok(/maxLength=\{OTHER_TEXT_MAX\}/.test(comp) && /aria-label=/.test(comp) && /min-h-\[42px\]/.test(comp), "SelectWithOther: maxLength 60 + aria-label + ≥42px");

console.log(`\nurun-stok select-other harness: ${pass} PASS / ${fail} FAIL`);
if (fail) {
  console.error("FAIL:\n - " + fails.join("\n - "));
  process.exit(1);
}
