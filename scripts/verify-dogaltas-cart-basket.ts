/**
 * verify-dogaltas-cart-basket.ts
 *
 * Doğaltaş satış sepeti satır düzenleme/silme — saf state geçiş doğrulaması.
 * removeBasketItem / updateBasketItem / buildSaleRecord / basketTotals fonksiyonlarının
 * IMMUTABLE, satır-scoped ve deterministik olduğunu; toplamların ekleme/düzenleme/silme
 * sonrası birebir doğru hesaplandığını kanıtlar.
 *
 * Çalıştır:  npx tsx scripts/verify-dogaltas-cart-basket.ts
 */
import {
  type BasketItem,
  basketTotals,
  buildSaleRecord,
  computeLineTotal,
  computeRecordTotals,
  makeBasketUid,
  removeBasketItem,
  toSaleRecords,
  updateBasketItem,
} from "@/lib/urun-stok/dogaltasBasket";
import type { SaleRecord } from "@/lib/urun-stok/dogaltasStockLogic";

let pass = 0;
let fail = 0;
const fails: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    fails.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** Test ürünü kur: tek taş satırlı SaleRecord. */
function product(
  name: string,
  unit: number,
  qty: number,
  profitPct: number,
): SaleRecord {
  return buildSaleRecord({
    name,
    lines: [{ stone: name, type: "8 MM DİZİ", currency: "TRY", unit, qty }],
    profit_pct: profitPct,
    photos: [],
    timestamp: "2026-08-25 10:00:00",
  });
}

function item(uid: string, rec: SaleRecord): BasketItem {
  return { uid, record: rec };
}

// ——— Canonical hesaplama ———
console.log("\n[Canonical hesaplama]");
ok("computeLineTotal = unit*qty", computeLineTotal(120, 3) === 360);
{
  const rec = product("A", 100, 2, 50); // cost 200, sale 300
  ok("buildSaleRecord total_cost", approx(rec.total_cost, 200), `${rec.total_cost}`);
  ok("buildSaleRecord sale_price (%50 kâr)", approx(rec.sale_price, 300), `${rec.sale_price}`);
  ok("buildSaleRecord line_total türetildi", approx(rec.lines[0].line_total, 200));
  const t = computeRecordTotals(rec.lines, 50);
  ok("computeRecordTotals tutarlı", approx(t.total_cost, 200) && approx(t.sale_price, 300));
}

// ——— makeBasketUid stabil & çakışmasız ———
console.log("\n[Stabil uid]");
ok("makeBasketUid deterministik", makeBasketUid(1) === "cart-1" && makeBasketUid(2) === "cart-2");
ok("makeBasketUid çakışmasız", makeBasketUid(1) !== makeBasketUid(2));

// ——— Ortak fixture: A + B + C ———
const A = product("A", 100, 1, 100); // cost 100, sale 200
const B = product("B", 50, 4, 100); //  cost 200, sale 400
const C = product("C", 300, 1, 100); // cost 300, sale 600
const base: BasketItem[] = [item("cart-1", A), item("cart-2", B), item("cart-3", C)];

// TEST 1 — ortadaki B sil → A + C
console.log("\n[TEST 1] Ortadaki satırı sil (B) → A+C");
{
  const next = removeBasketItem(base, "cart-2");
  ok("B kaldırıldı", next.length === 2 && !next.some((i) => i.uid === "cart-2"));
  ok("A korundu", next[0].uid === "cart-1" && next[0].record === A);
  ok("C korundu", next[1].uid === "cart-3" && next[1].record === C);
  const t = basketTotals(next);
  ok("toplam maliyet A+C = 400", approx(t.totalCost, 400), `${t.totalCost}`);
  ok("toplam satış A+C = 800", approx(t.totalSale, 800), `${t.totalSale}`);
  ok("toplam kâr A+C = 400", approx(t.totalProfit, 400), `${t.totalProfit}`);
  ok("B'nin katkısı tamamen çıktı", !approx(basketTotals(base).totalSale, t.totalSale));
}

// TEST 2 — ilk satırı sil (A) → B + C
console.log("\n[TEST 2] İlk satırı sil (A) → B+C");
{
  const next = removeBasketItem(base, "cart-1");
  ok("A yok, B+C var", next.length === 2 && next[0].uid === "cart-2" && next[1].uid === "cart-3");
}

// TEST 3 — son satırı sil (C) → A + B
console.log("\n[TEST 3] Son satırı sil (C) → A+B");
{
  const next = removeBasketItem(base, "cart-3");
  ok("C yok, A+B var", next.length === 2 && next[0].uid === "cart-1" && next[1].uid === "cart-2");
}

// TEST 4 — tek ürün sil → boş sepet, toplamlar sıfır
console.log("\n[TEST 4] Tek ürün sil → boş + sıfır toplam");
{
  const single: BasketItem[] = [item("cart-9", A)];
  const next = removeBasketItem(single, "cart-9");
  const t = basketTotals(next);
  ok("sepet boş", next.length === 0);
  ok("toplamlar sıfırlandı", approx(t.totalCost, 0) && approx(t.totalSale, 0) && approx(t.totalProfit, 0) && t.count === 0);
}

// TEST 5 — B düzenle (adet 4→2) → yalnız B değişir, A & C korunur
console.log("\n[TEST 5] B adet 4→2 düzenle → yalnız B güncellenir");
{
  const editedB = product("B", 50, 2, 100); // cost 100, sale 200
  const next = updateBasketItem(base, "cart-2", editedB);
  ok("B güncellendi (yeni referans)", next[1].record.total_cost === 100 && next[1].record.sale_price === 200);
  ok("A birebir korundu", next[0].record === A);
  ok("C birebir korundu", next[2].record === C);
  const t = basketTotals(next);
  // A(100/200) + B'(100/200) + C(300/600)
  ok("aggregate maliyet = 500", approx(t.totalCost, 500), `${t.totalCost}`);
  ok("aggregate satış = 1000", approx(t.totalSale, 1000), `${t.totalSale}`);
}

// TEST 11 — toplam maliyet/kâr/satış/ürün sayısı silme+düzenleme sonrası doğru
console.log("\n[TEST 11] Silme+düzenleme sonrası aggregate bütünlüğü");
{
  let s: BasketItem[] = base;
  s = removeBasketItem(s, "cart-1"); // B + C
  s = updateBasketItem(s, "cart-2", product("B", 50, 1, 100)); // B'=50/100
  const t = basketTotals(s);
  ok("ürün sayısı = 2", t.count === 2);
  ok("maliyet B'(50)+C(300)=350", approx(t.totalCost, 350), `${t.totalCost}`);
  ok("satış B'(100)+C(600)=700", approx(t.totalSale, 700), `${t.totalSale}`);
  ok("kâr = 350", approx(t.totalProfit, 350), `${t.totalProfit}`);
}

// TEST 12 — düzenleme/silme sırasında girdi dizisi mutate edilmez (immutability)
console.log("\n[TEST 12] Immutability — orijinal dizi/kayıtlar mutate edilmez");
{
  const snapshotLen = base.length;
  const snapshotBuid = base[1].uid;
  removeBasketItem(base, "cart-2");
  updateBasketItem(base, "cart-2", product("X", 1, 1, 0));
  ok("orijinal dizi uzunluğu değişmedi", base.length === snapshotLen);
  ok("orijinal uid'ler değişmedi", base[1].uid === snapshotBuid);
  ok("orijinal B kaydı değişmedi", base[1].record === B && B.sale_price === 400);
}

// Var olmayan uid — no-op güvenliği
console.log("\n[Güvenlik] Var olmayan uid");
{
  ok("remove bilinmeyen uid = değişmez uzunluk", removeBasketItem(base, "yok").length === base.length);
  const u = updateBasketItem(base, "yok", product("Z", 1, 1, 0));
  ok("update bilinmeyen uid = hiçbir satır değişmez", u.every((it, i) => it.record === base[i].record));
}

// toSaleRecords — commit için uid soyulur, sıra korunur
console.log("\n[Commit] toSaleRecords uid soyar, final sepeti verir");
{
  const s = removeBasketItem(base, "cart-2"); // A + C
  const recs = toSaleRecords(s);
  ok("2 kayıt, uid'siz düz SaleRecord", recs.length === 2 && recs[0] === A && recs[1] === C);
  ok("silinen B commit'e sızmaz", !recs.some((r) => r.name === "B"));
}

console.log(`\n──────── SONUÇ: ${pass} PASS / ${fail} FAIL ────────`);
if (fail > 0) {
  console.log("FAIL:\n - " + fails.join("\n - "));
  process.exit(1);
}
console.log("PASS — CART ROW EDIT/DELETE LOGIC OK");
