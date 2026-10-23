/**
 * AŞAMA 2 / S2 — Ürün & Stok birim harness'ı (DB yok, ağ yok).
 *
 *   STK-05 : allowlist doğrulama — NaN / Infinity / metin / negatif / bilinmeyen alan / tenant_id /
 *            geçersiz birim / uzunluk / kesirli değerler / güncellemede client_id değişmez.
 *            Eski denylist davranışının yeniden üretimi (karşılaştırma için kod içinde).
 *   STK-06 : iptal sonucu mesajları (iade edilemeyen kalem, zaten iptal, başarısız, doğrulanamayan).
 *   US-008 : satış kaynağı etiketi Türkçe; ham "central" görünmez.
 *
 * Çalıştır: npx tsx scripts/urun-stok/s2-stock.harness.ts
 */
import { validateInventoryWrite, type InventoryCategory } from "@/lib/urun-stok/inventoryWriteValidation";
import { describeCancelOutcomes } from "@/lib/urun-stok/salesApi";
import { saleSourceLabel } from "@/lib/urun-stok/salesHistoryDb";

let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); }
};

// Eski route davranışı (main 48266370 öncesi S2): yalnız 3 alan atılıyordu.
const OLD_PROTECTED = new Set(["tenant_id", "id", "created_at"]);
const oldSanitize = (b: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(b).filter(([k]) => !OLD_PROTECTED.has(k)));

const oilBase = () => ({
  client_id: "oil_x", name: "LAVANTA", oil_type: "Uçucu Yağ", measure_type: "ML / Litre", base_unit: "ml",
  stock_base: 100, cost_per_base: 10, sale_per_base: 15, profit_pct: 50, bottle_volume: "10 ml",
  bottle_volume_custom: "", package_type: "damlalıklı şişe", photos: [], note: "",
});
const reject = (cat: InventoryCategory, body: Record<string, unknown>, mode: "create" | "update", field: string) => {
  const r = validateInventoryWrite(cat, body, mode);
  return !r.ok && r.field === field;
};

console.log("\n[STK-05-a] Eski davranış (yeniden üretim): denylist zararlı alanları geçiriyordu");
const evil = { ...oilBase(), stock_base: -50, cost_per_base: "abc", tenant_id: "BAŞKA", unknown_col: 1, updated_at: "1999" };
const oldOut = oldSanitize(evil);
ok(oldOut.stock_base === -50 && oldOut.cost_per_base === "abc" && "unknown_col" in oldOut && "updated_at" in oldOut,
  "eski sanitize: negatif stok, 'abc' maliyet, bilinmeyen kolon, updated_at geçiyordu (tenant_id yalnız atılıyordu)");

console.log("\n[STK-05-b] Yeni: geçerli kayıtlar kabul edilir (çalışan iş kuralları bozulmaz)");
let r = validateInventoryWrite("oil", oilBase(), "create");
ok(r.ok && r.clientId === "oil_x" && (r.ok && r.fields.stock_base === 100), "tam yağ kaydı (create)");
r = validateInventoryWrite("oil", { ...oilBase(), stock_base: 12.5, cost_per_base: 0.35, sale_per_base: 0.7 }, "create");
ok(r.ok, "kesirli stok / birim fiyat (12,5 ml; 0,35 ₺/ml) geçerli");
r = validateInventoryWrite("oil", { ...oilBase(), stock_base: 0, cost_per_base: 0, sale_per_base: 0, profit_pct: 0 }, "create");
ok(r.ok, "sıfır değerler geçerli");
r = validateInventoryWrite("oil", { ...oilBase(), stock_base: "12,5" }, "create");
ok(r.ok && r.fields.stock_base === 12.5, "virgüllü sayısal metin ('12,5') → 12.5");
r = validateInventoryWrite("accessory", { client_id: "acc_1", name: "TESPİH", product_group: "Tespih", product_model: "", material: "Akik", color: "", size_kind: "standart", size_detail: "", stock_qty: 3, cost_per_unit: 100, sale_per_unit: 250, profit_pct: 150, barcode: "", photos: ["data:image/png;base64,AA"], note: "" }, "create");
ok(r.ok, "tam aksesuar kaydı (stock_qty)");
r = validateInventoryWrite("soap_cream", { client_id: "sc_1", name: "SABUN", product_group: "Doğal Sabun", measure_type: "Gram / KG", base_unit: "gram", stock_base: 250.5, cost_per_base: 0.1, sale_per_base: 0.3, profit_pct: 200, packaging_type: "", net_amount: "100 g", expiry_date: "2027-01", lot_no: "L1", photos: [], note: "" }, "create");
ok(r.ok, "tam sabun-krem kaydı (gram)");
r = validateInventoryWrite("other", { client_id: "ot_1", name: "TÜTSÜ", product_group: "Ev Ürünü", sub_category: "", measure_type: "Adet", base_unit: "adet", stock_base: 5, cost_per_base: 5, sale_per_base: 12, profit_pct: 140, variation_kind: "özel", variation_detail: "", barcode: "", photos: [], note: "" }, "create");
ok(r.ok, "tam diğer kaydı (adet)");
r = validateInventoryWrite("oil", { name: "YENİ AD", expected_stock: 100, id: "x", client_id: "BAŞKA_ID" }, "update");
ok(r.ok && !("client_id" in r.fields) && !("expected_stock" in r.fields) && !("id" in r.fields), "güncellemede client_id / id / expected_stock DB alanına yazılmaz");
r = validateInventoryWrite("oil", { measure_type: "Gram / KG", base_unit: "ml" }, "update");
ok(r.ok, "güncellemede geçmişte tutarsız ölçü/birim kaydı düzenlenebilir (kilitlenmez)");

console.log("\n[STK-05-c] Yeni: geçersiz değerler reddedilir");
ok(reject("oil", { ...oilBase(), stock_base: -50 }, "create", "stock_base"), "negatif stok → 400");
ok(reject("oil", { ...oilBase(), cost_per_base: "abc" }, "create", "cost_per_base"), "'abc' maliyet → 400");
ok(reject("oil", { ...oilBase(), sale_per_base: Number.NaN }, "create", "sale_per_base"), "NaN → 400");
ok(reject("oil", { ...oilBase(), stock_base: Number.POSITIVE_INFINITY }, "create", "stock_base"), "Infinity → 400");
ok(reject("oil", { ...oilBase(), stock_base: "Infinity" }, "create", "stock_base"), "'Infinity' metni → 400");
ok(reject("oil", { ...oilBase(), stock_base: null }, "create", "stock_base"), "null (JSON'da NaN/Infinity) → 400");
ok(reject("oil", { ...oilBase(), stock_base: "" }, "create", "stock_base"), "boş metin → 400");
ok(reject("oil", { ...oilBase(), stock_base: "1e999" }, "create", "stock_base"), "taşan sayı (1e999) → 400");
ok(reject("oil", { ...oilBase(), stock_base: 2e9 }, "create", "stock_base"), "üst sınır aşımı → 400");
ok(validateInventoryWrite("oil", { ...oilBase(), profit_pct: -10 }, "create").ok, "negatif kâr % mevcut sözleşmede geçerli (arayüz kabul ediyor) → kabul");
ok(reject("oil", { ...oilBase(), profit_pct: -2e6 }, "create", "profit_pct"), "kâr % büyüklük sınırı aşımı → 400");
ok(reject("oil", { ...oilBase(), profit_pct: "NaN" }, "create", "profit_pct"), "kâr % 'NaN' → 400");
ok(reject("oil", { ...oilBase(), tenant_id: "BAŞKA" }, "create", "tenant_id"), "tenant_id istemciden → 400");
ok(reject("oil", { ...oilBase(), unknown_col: 1 }, "create", "unknown_col"), "bilinmeyen kolon → 400");
ok(reject("oil", { ...oilBase(), updated_at: "1999-01-01" }, "update", "updated_at"), "updated_at istemciden → 400");
ok(reject("oil", { ...oilBase(), created_at: "1999-01-01" }, "update", "created_at"), "created_at istemciden → 400");
ok(reject("oil", { ...oilBase(), measure_type: "Kova" }, "create", "measure_type"), "geçersiz ölçü tipi → 400");
ok(reject("oil", { ...oilBase(), base_unit: "litre" }, "create", "base_unit"), "geçersiz birim → 400");
ok(reject("oil", { ...oilBase(), measure_type: "Gram / KG", base_unit: "ml" }, "create", "base_unit"), "yeni kayıtta ölçü ↔ birim uyumsuz → 400");
ok(reject("oil", { ...oilBase(), name: "   " }, "create", "name"), "boş ürün adı → 400");
ok(reject("oil", { ...oilBase(), name: "x".repeat(201) }, "create", "name"), "çok uzun ürün adı → 400");
ok(reject("oil", { ...oilBase(), oil_type: "x".repeat(81) }, "create", "oil_type"), "çok uzun tür etiketi → 400");
ok(reject("oil", { ...oilBase(), name: 123 }, "create", "name"), "metin alanına sayı → 400");
ok(reject("oil", { ...oilBase(), photos: "data:x" }, "create", "photos"), "fotoğraf dizi değil → 400");
ok(reject("oil", { ...oilBase(), photos: [1] }, "create", "photos"), "fotoğraf öğesi metin değil → 400");
ok(reject("oil", { ...oilBase(), photos: Array(21).fill("a") }, "create", "photos"), "fotoğraf sayısı üst sınırı → 400");
ok(reject("oil", { ...oilBase(), client_id: "" }, "create", "client_id"), "client_id'siz oluşturma → 400");
ok(reject("accessory", { ...oilBase(), client_id: "a" }, "create", "oil_type"), "kategoriye ait olmayan alan (aksesuarda oil_type) → 400");
ok(reject("oil", { name: "" }, "update", "name"), "güncellemede boş ad → 400");

console.log("\n[STK-06] İptal sonucu mesajları");
const old = "Satış iptal edildi, stok stoğa geri eklendi.";
let m = describeCancelOutcomes([{ ok: true, alreadyCancelled: false, restored: 0, itemCount: 1, notRestored: 1 }]);
ok(m !== old && /stoğa geri eklenemedi/.test(m) && /silindi/.test(m), `silinmiş ürün: "${m}"`);
m = describeCancelOutcomes([{ ok: true, alreadyCancelled: false, restored: 2, itemCount: 2, notRestored: 0 }]);
ok(/Satış iptal edildi, satılan miktarlar stoğa geri eklendi/.test(m), `normal iptal: "${m}"`);
m = describeCancelOutcomes([{ ok: true, alreadyCancelled: true, restored: 0, itemCount: 0, notRestored: 0 }]);
ok(/zaten iptal edilmişti/.test(m) && !/geri eklendi\./.test(m), `ikinci iptal: "${m}"`);
m = describeCancelOutcomes([{ ok: false, error: "x" }, { ok: true, restored: 1, itemCount: 1, notRestored: 0 }]);
ok(/1 iptal işlemi başarısız/.test(m) && /Satış iptal edildi/.test(m), `karma: "${m}"`);
m = describeCancelOutcomes([{ ok: true, restored: 0, itemCount: null, notRestored: null }]);
ok(/doğrulanamadı/.test(m) && !/geri eklendi/.test(m), `sayım okunamazsa sahte başarı yok: "${m}"`);
m = describeCancelOutcomes([{ ok: true, restored: 1, itemCount: 3, notRestored: 2 }, { ok: true, restored: 1, itemCount: 1, notRestored: 0 }]);
ok(/2 satış iptal edildi/.test(m) && /2 ürün/.test(m), `çoklu, kısmi iade: "${m}"`);

console.log("\n[US-008] Satış kaynağı etiketi");
ok(saleSourceLabel("central") === "Merkezi Satış", "central → Merkezi Satış (ham 'central' görünmez)");
ok(saleSourceLabel("oil") === "Yağ" && saleSourceLabel("soap_cream") === "Sabun / Krem" && saleSourceLabel("accessory") === "Tespih / Takı / Aksesuar" && saleSourceLabel("other") === "Diğer Ürünler" && saleSourceLabel("dogaltas") === "Doğaltaş", "kategori kaynakları Türkçe");
ok(saleSourceLabel("") === "—" && saleSourceLabel(null) === "—", "boş kaynak → —");
ok(saleSourceLabel("ozel_kaynak") === "ozel_kaynak", "bilinmeyen değer gizlenmez (olduğu gibi)");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
