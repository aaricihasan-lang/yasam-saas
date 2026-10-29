/**
 * Satış Öncesi #4 — mükerrer satış: kalıcı satış denemesi İSTEMCİ harness'ı (DB yok, ağ yok, production'a SIFIR temas).
 *
 * Gerçek istemci kodu (lib/urun-stok/salesApi: submitCategorySale, submitSale, createCategorySale, kalıcı deneme
 * yardımcıları) sahte sessionStorage/localStorage + sahte /api/urun-stok/sales sunucusuyla çalışır. Sahte sunucu
 * gerçek sözleşmeyi taklit eder: UNIQUE(tenant, idempotency_key) → aynı anahtar = duplicate (yeni satış YOK);
 * katalog yalnız stoğu > 0 ürünleri döndürür. (Gerçek DB tekilliği pg-integration.mjs'de ayrıca doğrulanır.)
 *
 * Çalıştır: npx tsx scripts/urun-stok/sale-attempt-persist.harness.ts
 */
import {
  DUPLICATE_SALE_MESSAGE,
  PENDING_SALE_TTL_MS,
  clearPendingSaleAttempt,
  createCategorySale,
  loadPendingSaleAttempt,
  saleAttemptFor,
  savePendingSaleAttempt,
  submitCategorySale,
  submitSale,
  type SaleAttempt,
} from "@/lib/urun-stok/salesApi";

let pass = 0;
let fail = 0;
const ok = (c: unknown, m: string) => {
  if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); }
};

class MemStorage {
  m = new Map<string, string>();
  broken = false;
  getItem(k: string) { if (this.broken) throw new Error("SecurityError"); return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { if (this.broken) throw new Error("QuotaExceeded"); this.m.set(k, String(v)); }
  removeItem(k: string) { if (this.broken) throw new Error("SecurityError"); this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
const g = globalThis as unknown as Record<string, unknown>;
const local = new MemStorage();
const session = new MemStorage();
g.window = globalThis;
g.localStorage = local;
g.sessionStorage = session;
const TA = "11111111-1111-1111-1111-111111111111";
const TB = "22222222-2222-2222-2222-222222222222";
function login(user: string, tenant: string) {
  local.setItem("yasam_user", JSON.stringify({ id: user, role: "expert", tenant_id: tenant }));
  local.setItem("yasam_session_token", "test-token");
}

// ───────── sahte sunucu ─────────
const PRODUCT_UUID = "00000000-0000-4000-8000-000000000001";
type Product = { tenant: string; clientId: string; uuid: string; stock: number; type: string };
let products: Product[] = [];
let sales: { tenant: string; key: string; lines: { inventory_id: string; quantity: number }[] }[] = [];
let dropResponseAfterCommit = false;
const tenantNow = () => JSON.parse(local.getItem("yasam_user") ?? "{}").tenant_id as string;
g.fetch = async (path: string, init?: { method?: string; body?: string }) => {
  const tenant = tenantNow();
  if (path.startsWith("/api/urun-stok/sales/catalog")) {
    const list = products.filter((p) => p.tenant === tenant && p.stock > 0).map((p) => ({ inventory_type: p.type, inventory_id: p.uuid, client_id: p.clientId, name: p.clientId, subtitle: "" }));
    return new Response(JSON.stringify({ ok: true, products: list }), { status: 200 });
  }
  if (path === "/api/urun-stok/sales" && init?.method === "POST") {
    const b = JSON.parse(init.body ?? "{}") as { idempotency_key: string; lines: { inventory_id: string; quantity: number }[] };
    const prev = sales.find((s) => s.tenant === tenant && s.key === b.idempotency_key);
    if (prev) return new Response(JSON.stringify({ ok: true, duplicate: true, sale_id: `sale-${sales.indexOf(prev)}` }), { status: 200 });
    for (const l of b.lines) {
      const p = products.find((x) => x.uuid === l.inventory_id && x.tenant === tenant);
      if (!p || p.stock < l.quantity) return new Response(JSON.stringify({ ok: false, error: "Yetersiz stok." }), { status: 409 });
    }
    for (const l of b.lines) products.find((x) => x.uuid === l.inventory_id)!.stock -= l.quantity;
    sales.push({ tenant, key: b.idempotency_key, lines: b.lines });
    if (dropResponseAfterCommit) { dropResponseAfterCommit = false; throw new TypeError("Failed to fetch"); } // sunucu kaydetti, yanıt kayboldu
    return new Response(JSON.stringify({ ok: true, duplicate: false, sale_id: `sale-${sales.length - 1}` }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: false, error: "yok" }), { status: 404 });
};
function reset(stock = 10) {
  session.clear(); session.broken = false;
  products = [{ tenant: TA, clientId: "oil_a", uuid: PRODUCT_UUID, stock, type: "oil" }];
  sales = [];
  dropResponseAfterCommit = false;
  login("u-a", TA);
}
const lines = (q = 1) => [{ clientId: "oil_a", quantity: q }];

async function main() {
  console.log("[1] Yanıt kaybı → aynı ekranda tekrar deneme");
  reset();
  dropResponseAfterCommit = true;
  let r = await submitCategorySale({ category: "oil", lines: lines(2), current: null });
  ok(!r.res.ok && sales.length === 1, "ilk gönderim sunucuda kaydedildi ama yanıt kayboldu (UI başarısız görür)");
  r = await submitCategorySale({ category: "oil", lines: lines(2), current: r.attempt });
  ok(r.res.ok && r.res.duplicate && sales.length === 1 && products[0].stock === 8, "tekrar deneme → duplicate; satış 1, stok bir kez düştü (10→8)");

  console.log("[2] Sayfa yenileme (bellek içi deneme kayboldu) → aynı sepet");
  reset();
  dropResponseAfterCommit = true;
  await submitCategorySale({ category: "oil", lines: lines(1), current: null });
  r = await submitCategorySale({ category: "oil", lines: lines(1), current: null }); // yenileme: ref = null
  ok(r.res.ok && r.res.duplicate && sales.length === 1, "yenileme sonrası aynı sepet → sessionStorage'daki anahtar → duplicate, ikinci satış YOK");
  ok(DUPLICATE_SALE_MESSAGE.includes("ikinci kez kaydedilmedi"), "kullanıcıya 'zaten kaydedilmişti' mesajı gösterilir");

  console.log("[3] İlk (kayıp) satış stoğu 0'a indirdi → tekrar deneme");
  reset(3);
  dropResponseAfterCommit = true;
  const a3 = await submitCategorySale({ category: "oil", lines: lines(3), current: null });
  ok(products[0].stock === 0 && a3.attempt?.resolved?.length === 1, "stok 0; çözülmüş DB satırı denemeyle saklandı");
  const old = await createCategorySale({ category: "oil", idempotencyKey: a3.attempt!.key, lines: lines(3) });
  ok(!old.ok && /stokta bulunamadı/.test(old.error ?? ""), `ESKİ davranış yeniden üretildi: katalog yolu sahte hata verir ("${old.error}")`);
  r = await submitCategorySale({ category: "oil", lines: lines(3), current: null });
  ok(r.res.ok && r.res.duplicate && sales.length === 1, "YENİ: saklanan satırlarla sunucuya ulaşır → duplicate (sahte hata yok, ikinci satış yok)");

  console.log("[4] Bilinçli yeni satış bozulmaz");
  reset();
  r = await submitCategorySale({ category: "oil", lines: lines(1), current: null });
  ok(r.res.ok && !r.res.duplicate && r.attempt === null && loadPendingSaleAttempt("category:oil") === null, "başarılı satış → bekleyen deneme silindi");
  r = await submitCategorySale({ category: "oil", lines: lines(1), current: r.attempt });
  ok(r.res.ok && !r.res.duplicate && sales.length === 2, "aynı içerikli İKİNCİ bilinçli satış → yeni anahtar, 2 satış");
  dropResponseAfterCommit = true;
  await submitCategorySale({ category: "oil", lines: lines(1), current: null });
  r = await submitCategorySale({ category: "oil", lines: lines(2), current: null });
  ok(r.res.ok && !r.res.duplicate && sales.length === 4, "kayıp yanıttan sonra FARKLI sepet → yeni satış (engellenmez)");

  console.log("[5] Süre, kapsam ve kullanıcı izolasyonu");
  reset();
  const att: SaleAttempt = { signature: JSON.stringify(lines(1)), key: "sale_eski" };
  savePendingSaleAttempt("category:oil", att, Date.now() - PENDING_SALE_TTL_MS - 1000);
  ok(loadPendingSaleAttempt("category:oil") === null, "30 dk'dan eski deneme kullanılmaz (silinir)");
  savePendingSaleAttempt("category:oil", att);
  ok(loadPendingSaleAttempt("category:oil")?.key === "sale_eski" && loadPendingSaleAttempt("category:accessory") === null, "ekran kapsamı ayrı (oil denemesi aksesuar ekranında kullanılmaz)");
  login("u-b", TB);
  ok(loadPendingSaleAttempt("category:oil") === null, "başka kullanıcı/tenant aynı sekmede önceki kullanıcının anahtarını kullanamaz");
  login("u-a", TA);
  clearPendingSaleAttempt("category:oil");
  ok(loadPendingSaleAttempt("category:oil") === null, "temizleme çalışır");

  console.log("[6] Eşzamanlı çift gönderim (bağlantı dönünce iki istek)");
  reset();
  const first = saleAttemptFor(null, JSON.stringify(lines(1)));
  savePendingSaleAttempt("category:oil", first);
  const [x, y] = await Promise.all([
    submitCategorySale({ category: "oil", lines: lines(1), current: first }),
    submitCategorySale({ category: "oil", lines: lines(1), current: null }),
  ]);
  ok(x.res.ok && y.res.ok && sales.length === 1 && [x.res.duplicate, y.res.duplicate].filter(Boolean).length === 1, "aynı anahtarla iki istek → tek satış, biri duplicate");

  console.log("[7] Merkezî satış (submitSale) ve Canlı Stok");
  reset();
  dropResponseAfterCommit = true;
  const central = [{ inventory_type: "oil" as const, inventory_id: PRODUCT_UUID, quantity: 1 }];
  await submitSale({ scope: "central", source: "central", lines: central, current: null });
  const c2 = await submitSale({ scope: "central", source: "central", lines: central, current: null });
  ok(c2.res.ok && c2.res.duplicate && sales.length === 1, "merkezî satış: yenileme sonrası aynı sepet → duplicate");
  // Canlı Stok kartı: panel kapat/aç = bellek içi deneme null; aynı ürün+miktar kalıcı anahtarı bulur.
  const live = "live:oil:oil_a";
  const k1 = saleAttemptFor(null, "oil:oil_a|-2");
  savePendingSaleAttempt(live, k1);
  const cardRefAfterReopen = null as SaleAttempt | null; // open() bellek içi denemeyi sıfırlar
  const reopened = saleAttemptFor(cardRefAfterReopen ?? loadPendingSaleAttempt(live), "oil:oil_a|-2");
  ok(reopened.key === k1.key, "Canlı Stok: panel kapatılıp açılınca aynı satış anahtarı korunur");
  ok(saleAttemptFor(loadPendingSaleAttempt(live), "oil:oil_a|-3").key !== k1.key, "Canlı Stok: farklı miktar → yeni anahtar");

  console.log("[8] Depolama erişilemez (gizli mod / engelli) → eski bellek içi davranış, hata yok");
  reset();
  session.broken = true;
  let threw = false;
  try {
    dropResponseAfterCommit = true;
    const b1 = await submitCategorySale({ category: "oil", lines: lines(1), current: null });
    const b2 = await submitCategorySale({ category: "oil", lines: lines(1), current: b1.attempt });
    ok(b2.res.ok && b2.res.duplicate && sales.length === 1, "depolama yokken aynı ekranda tekrar deneme yine duplicate (bellek içi)");
  } catch { threw = true; }
  ok(!threw, "depolama hatası satış akışını bozmaz");

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
