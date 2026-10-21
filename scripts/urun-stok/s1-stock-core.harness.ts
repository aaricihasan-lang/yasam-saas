/**
 * AŞAMA 2 / S1 — Stok çekirdeği İSTEMCİ harness'ı (DB yok, ağ yok, production'a SIFIR temas).
 *
 * Gerçek istemci katmanını (lib/urun-stok/*InventoryDb.ts, liveStockLogic.applyStockDelta,
 * salesApi.saleAttemptFor) sahte localStorage + sahte fetch ile çalıştırır. Sahte sunucu PATCH'i
 * GERÇEK sunucu yardımcısı applyGuardedInventoryPatch ile (bellek içi tablo üzerinde) işler.
 *
 *   BUG-021: silinen kayıt eski önbellekten POST ile geri oluşmuyor; bekleyen yerel kayıt kaybolmuyor;
 *            eski (durumsuz) önbellek karantinaya alınıp bildiriliyor; tenant ayrımı.
 *   STK-01 : ad/fiyat düzenlemesi stoğu yazmıyor; stok değişikliği expected_stock ile; çakışma → conflict.
 *   BUG-019: Canlı Stok "− Sat" satış ucuna gidiyor (mutlak stok PATCH'i YOK).
 *   STK-03 : aynı deneme aynı anahtar; yeni deneme yeni anahtar.
 *
 * Çalıştır: npx tsx scripts/urun-stok/s1-stock-core.harness.ts
 */
import { applyGuardedInventoryPatch } from "@/lib/urun-stok/guardedStockPatch";
import type { SupabaseClient } from "@supabase/supabase-js";

// ───────────────────────── sahte tarayıcı ortamı ─────────────────────────
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
const storage = new MemStorage();
const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
g.localStorage = storage;

const TA = "11111111-1111-1111-1111-111111111111";
const TB = "22222222-2222-2222-2222-222222222222";
function login(tenant: string) {
  storage.setItem("yasam_user", JSON.stringify({ id: "u-" + tenant.slice(0, 4), role: "expert", tenant_id: tenant }));
  storage.setItem("yasam_session_token", "test-token");
}

// ───────────────────────── sahte sunucu ─────────────────────────
type Row = Record<string, unknown> & { id: string; tenant_id: string };
const TABLES: Record<string, { table: string; stockCol: string }> = {
  "/api/urun-stok/yag": { table: "oil_inventory", stockCol: "stock_base" },
  "/api/urun-stok/sabun-krem": { table: "soap_cream_inventory", stockCol: "stock_base" },
  "/api/urun-stok/aksesuar": { table: "accessory_inventory", stockCol: "stock_qty" },
  "/api/urun-stok/diger": { table: "other_inventory", stockCol: "stock_base" },
};
const db: Record<string, Row[]> = { oil_inventory: [], soap_cream_inventory: [], accessory_inventory: [], other_inventory: [] };
let serverTenant = TA;
let uuidSeq = 0;
const newUuid = () => `00000000-0000-0000-0000-${String(++uuidSeq).padStart(12, "0")}`;
type Call = { method: string; path: string; body?: Record<string, unknown> };
let calls: Call[] = [];
const sales: { key: string; lines: unknown[]; tenant: string }[] = [];

/** applyGuardedInventoryPatch'in kullandığı PostgREST alt kümesinin bellek içi karşılığı. */
function fakeSupabase(): SupabaseClient {
  const from = (table: string) => {
    const rows = db[table];
    const filters: [string, unknown][] = [];
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
    let mode: "update" | "select" = "select";
    let patch: Record<string, unknown> = {};
    const b = {
      update(f: Record<string, unknown>) { mode = "update"; patch = f; return b; },
      select() { return b; },
      eq(k: string, v: unknown) { filters.push([k, v]); return b; },
      maybeSingle() {
        const r = rows.find(match);
        return Promise.resolve({ data: r ? { ...r } : null, error: null });
      },
      then(res: (v: { data: unknown; error: null }) => unknown) {
        if (mode === "update") {
          const hit = rows.filter(match);
          for (const r of hit) Object.assign(r, patch);
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(res);
        }
        return Promise.resolve({ data: rows.filter(match), error: null }).then(res);
      },
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

async function serve(path: string, init: { method?: string; body?: string } = {}): Promise<{ status: number; json: unknown }> {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
  calls.push({ method, path, body });
  const base = path.split("?")[0];
  const t = TABLES[base];
  if (t) {
    const rows = db[t.table];
    if (method === "GET") return { status: 200, json: { ok: true, rows: rows.filter((r) => r.tenant_id === serverTenant) } };
    if (method === "POST") {
      const cid = String(body!.client_id);
      if (rows.some((r) => r.tenant_id === serverTenant && r.client_id === cid)) {
        return { status: 500, json: { ok: false, error: "duplicate key" } };
      }
      const row: Row = { ...body!, id: newUuid(), tenant_id: serverTenant };
      rows.push(row);
      return { status: 200, json: { ok: true, id: row.id } };
    }
    if (method === "DELETE") {
      const id = new URL("http://x" + path).searchParams.get("id");
      const i = rows.findIndex((r) => r.id === id && r.tenant_id === serverTenant);
      if (i < 0) return { status: 404, json: { ok: false, error: "yok" } };
      rows.splice(i, 1);
      return { status: 200, json: { ok: true, id } };
    }
    if (method === "PATCH") {
      const { id, ...rest } = body!;
      const fields: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
      const r = await applyGuardedInventoryPatch({
        db: fakeSupabase(), table: t.table, stockColumn: t.stockCol, tenantId: serverTenant,
        id: String(id), fields, body: body!,
      });
      if (!r.ok) return { status: r.response.status, json: await r.response.json() };
      return { status: 200, json: { ok: true, id } };
    }
  }
  if (base === "/api/urun-stok/sales/catalog") {
    const products = db.oil_inventory.filter((r) => r.tenant_id === serverTenant && Number(r.stock_base) > 0).map((r) => ({
      inventory_type: "oil", inventory_id: r.id, client_id: r.client_id, name: r.name, subtitle: "",
      stock: r.stock_base, unit: "ml", measure_type: "", cost_per_unit: r.cost_per_base, sale_per_unit: r.sale_per_base, profit_pct: 0, photo_count: 0,
    }));
    return { status: 200, json: { ok: true, products } };
  }
  if (base === "/api/urun-stok/sales" && method === "POST") {
    const key = String(body!.idempotency_key);
    const dup = sales.find((s) => s.key === key && s.tenant === serverTenant);
    if (dup) return { status: 200, json: { ok: true, duplicate: true, sale_id: "sale-" + key, sale: { total_sale: 0 } } };
    const lines = body!.lines as { inventory_id: string; quantity: number }[];
    let total = 0;
    for (const ln of lines) {
      const r = db.oil_inventory.find((x) => x.id === ln.inventory_id && x.tenant_id === serverTenant)!;
      r.stock_base = Number(r.stock_base) - ln.quantity; // sunucu tarafı atomik düşüm (RPC karşılığı)
      total += Number(r.sale_per_base) * ln.quantity;
    }
    sales.push({ key, lines, tenant: serverTenant });
    return { status: 200, json: { ok: true, duplicate: false, sale_id: "sale-" + key, sale: { total_sale: total } } };
  }
  return { status: 404, json: { ok: false, error: "bilinmeyen uç " + path } };
}

g.fetch = async (path: string, init?: { method?: string; body?: string }) => {
  const r = await serve(path, init);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
};

// ───────────────────────── test yardımcıları ─────────────────────────
let pass = 0;
let fail = 0;
const ok = (c: unknown, label: string) => {
  if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}`); }
};
const posts = (path: string) => calls.filter((c) => c.method === "POST" && c.path === path);
const patches = (path: string) => calls.filter((c) => c.method === "PATCH" && c.path === path);

function oilItem(id: string, name: string, stock: number, cost = 10, sale = 15) {
  return {
    id, name, oilType: "Esans", measureType: "ML / Litre" as const, stockBase: stock, baseUnit: "ml" as const,
    costPerBase: cost, salePerBase: sale, profitPct: 50, bottleVolume: "", bottleVolumeCustom: "", packageType: "",
    photos: [] as string[], note: "",
  };
}
function serverOil(tenant: string, clientId: string, name: string, stock: number, cost = 10, sale = 15): Row {
  const row: Row = {
    id: newUuid(), tenant_id: tenant, client_id: clientId, name, oil_type: "Esans", measure_type: "ML / Litre",
    base_unit: "ml", stock_base: stock, cost_per_base: cost, sale_per_base: sale, profit_pct: 50,
    bottle_volume: "", bottle_volume_custom: "", package_type: "", photos: [], note: "",
  };
  db.oil_inventory.push(row);
  return row;
}
function resetWorld() {
  storage.clear();
  for (const k of Object.keys(db)) db[k] = [];
  calls = [];
  sales.length = 0;
  serverTenant = TA;
  login(TA);
}

async function main() {
  const oilDb = await import("@/lib/urun-stok/oilInventoryDb");
  const oilLogic = await import("@/lib/urun-stok/oilStockLogic");
  const accDb = await import("@/lib/urun-stok/accessoryInventoryDb");
  const live = await import("@/lib/urun-stok/liveStockLogic");
  const salesApi = await import("@/lib/urun-stok/salesApi");

  // ═════════ BUG-021 ═════════
  console.log("\n[BUG-021-a] Silme sonrası yeniden yükleme: kayıt geri OLUŞMAZ");
  resetWorld();
  serverOil(TA, "oil_keep", "KALAN", 100);
  serverOil(TA, "oil_del", "SİLİNECEK", 50);
  let r = await oilDb.loadOilInventoryForTenant(TA); // ilk yükleme: önbellek = DB, durum kaydı oluşur
  ok(r.items.length === 2, "ilk yükleme 2 kayıt");
  const del = await oilDb.deleteOilInventoryItems(TA, r.items.filter((x) => x.id === "oil_del"));
  ok(del.ok && del.deleted === 1, "silme başarılı");
  calls = [];
  r = await oilDb.loadOilInventoryForTenant(TA);
  ok(posts("/api/urun-stok/yag").length === 0, "yeniden yüklemede POST YOK (eski hata: silinen kayıt POST ile geri oluşuyordu)");
  ok(!db.oil_inventory.some((x) => x.client_id === "oil_del"), "sunucuda silinen kayıt YOK");
  ok(!oilLogic.loadOilInventory().some((x) => x.id === "oil_del"), "önbellekte silinen kayıt YOK");

  console.log("\n[BUG-021-b] Başka cihazda silinen kayıt bu cihazın eski önbelleğinden geri OLUŞMAZ");
  resetWorld();
  serverOil(TA, "oil_x", "X", 10);
  serverOil(TA, "oil_y", "Y", 20);
  await oilDb.loadOilInventoryForTenant(TA); // B cihazı daha önce yüklemiş (önbellek + durum)
  db.oil_inventory = db.oil_inventory.filter((x) => x.client_id !== "oil_y"); // A cihazı sildi
  calls = [];
  r = await oilDb.loadOilInventoryForTenant(TA);
  ok(posts("/api/urun-stok/yag").length === 0, "POST YOK");
  ok(r.items.length === 1 && r.items[0].id === "oil_x", "liste yalnız sunucudaki kayıt");
  ok(!oilLogic.loadOilInventory().some((x) => x.id === "oil_y"), "önbellekten de düştü");

  console.log("\n[BUG-021-c] Bu cihazda oluşturulup buluta YAZILAMAMIŞ kayıt kaybolmaz → sonraki yüklemede yüklenir");
  resetWorld();
  await oilDb.loadOilInventoryForTenant(TA);
  const offline = oilItem("oil_new", "ÇEVRİMDIŞI", 30);
  oilDb.markOilPendingSync(TA, offline.id); // sayfa: önbelleğe yazmadan önce işaretler
  oilLogic.saveOilInventory([offline]); // bulut yazımı başarısız oldu (ör. ağ yok)
  calls = [];
  r = await oilDb.loadOilInventoryForTenant(TA);
  ok(posts("/api/urun-stok/yag").length === 1, "bekleyen kayıt POST ile yüklendi");
  ok(db.oil_inventory.some((x) => x.client_id === "oil_new" && x.stock_base === 30), "sunucuda oluştu (stok 30)");
  calls = [];
  await oilDb.loadOilInventoryForTenant(TA);
  ok(posts("/api/urun-stok/yag").length === 0, "ikinci yüklemede tekrar POST yok (bekleyen temizlendi)");

  console.log("\n[BUG-021-d] Bekleyen kayıt yüklenemezse önbellekte KALIR (sessiz kayıp yok)");
  resetWorld();
  await oilDb.loadOilInventoryForTenant(TA);
  const off2 = oilItem("oil_fail", "YÜKLENEMEYEN", 5);
  oilDb.markOilPendingSync(TA, off2.id);
  oilLogic.saveOilInventory([off2]);
  const realFetch = g.fetch as typeof fetch;
  g.fetch = async (path: string, init?: { method?: string; body?: string }) => {
    if ((init?.method ?? "GET") === "POST") return { ok: false, status: 503, json: async () => ({ ok: false, error: "geçici" }) };
    return (realFetch as unknown as (p: string, i?: unknown) => Promise<unknown>)(path, init);
  };
  r = await oilDb.loadOilInventoryForTenant(TA);
  g.fetch = realFetch;
  ok(r.items.some((x) => x.id === "oil_fail"), "listede görünmeye devam ediyor");
  ok(oilLogic.loadOilInventory().some((x) => x.id === "oil_fail"), "önbellekte duruyor");
  calls = [];
  r = await oilDb.loadOilInventoryForTenant(TA);
  ok(posts("/api/urun-stok/yag").length === 1 && db.oil_inventory.some((x) => x.client_id === "oil_fail"), "ağ dönünce yüklendi");

  console.log("\n[BUG-021-e] Eski (durumsuz) önbellek: belirsiz kayıt yeniden OLUŞTURULMAZ, SİLİNMEZ, bildirilir");
  resetWorld();
  serverOil(TA, "oil_live", "CANLI", 10);
  storage.setItem("oil_inventory_active_tenant_v1", TA);
  oilLogic.saveOilInventory([oilItem("oil_live", "CANLI", 10), oilItem("oil_ghost", "HAYALET", 7)]); // eski sürümün önbelleği
  calls = [];
  r = await oilDb.loadOilInventoryForTenant(TA);
  ok(posts("/api/urun-stok/yag").length === 0, "POST YOK (eski davranış: HAYALET geri oluşurdu)");
  ok(r.items.length === 1 && r.items[0].id === "oil_live", "liste sunucu gerçeği");
  const raw = JSON.parse(storage.getItem("oil_inventory__legacy_quarantine_v1__raw") ?? "{}");
  ok(Array.isArray(raw.items) && raw.items.some((x: { id: string }) => x.id === "oil_ghost"), "ham kayıt cihazda karantinada saklı (silinmedi)");
  const notice = oilDb.takeOilQuarantineNotice(TA);
  ok(notice.length === 1 && notice[0] === "HAYALET", "kullanıcıya adıyla bildiriliyor");
  ok(oilDb.takeOilQuarantineNotice(TA).length === 0, "bildirim bir kez");

  console.log("\n[BUG-021-f] Tenant ayrımı: A'nın bekleyen kaydı B oturumunda yüklenmez");
  resetWorld();
  await oilDb.loadOilInventoryForTenant(TA);
  const aItem = oilItem("oil_a", "A-ÖZEL", 3);
  oilDb.markOilPendingSync(TA, aItem.id);
  oilLogic.saveOilInventory([aItem]);
  login(TB);
  serverTenant = TB;
  calls = [];
  r = await oilDb.loadOilInventoryForTenant(TB);
  ok(posts("/api/urun-stok/yag").length === 0, "B oturumunda A'nın kaydı POST edilmedi");
  ok(!db.oil_inventory.some((x) => x.tenant_id === TB && x.client_id === "oil_a"), "B tenant'ında A kaydı yok");

  console.log("\n[BUG-021-g] Başka cihazda silinmiş kaydı düzenleme yeniden OLUŞTURMAZ");
  resetWorld();
  await oilDb.loadOilInventoryForTenant(TA);
  calls = [];
  const up = await oilDb.upsertOilInventoryItem(TA, oilItem("oil_gone", "GİTTİ", 4), { mode: "update", stock: { expected: 4 } });
  ok(!up.ok && up.notFound === true, "notFound döndü");
  ok(posts("/api/urun-stok/yag").length === 0, "POST YOK");

  console.log("\n[BUG-021-h] Aynı desen aksesuar kategorisinde (stock_qty)");
  resetWorld();
  db.accessory_inventory.push({ id: newUuid(), tenant_id: TA, client_id: "acc_del", name: "TESPİH", stock_qty: 3, cost_per_unit: 1, sale_per_unit: 2, profit_pct: 0, photos: [] });
  const accItems = (await accDb.loadAccessoryInventoryForTenant(TA)).items;
  await accDb.deleteAccessoryInventoryItems(TA, accItems);
  calls = [];
  const accAfter = await accDb.loadAccessoryInventoryForTenant(TA);
  ok(posts("/api/urun-stok/aksesuar").length === 0 && accAfter.items.length === 0, "aksesuar: silinen geri oluşmadı");

  // ═════════ STK-01 (istemci sözleşmesi) ═════════
  console.log("\n[STK-01-a] Ad/fiyat düzenlemesi stoğu YAZMAZ (araya giren satış korunur)");
  resetWorld();
  const row = serverOil(TA, "oil_s", "STOK", 100);
  await oilDb.loadOilInventoryForTenant(TA);
  row.stock_base = 95; // başka cihazdan atomik satış
  calls = [];
  let u = await oilDb.upsertOilInventoryItem(TA, { ...oilItem("oil_s", "STOK YENİ AD", 100) }, { mode: "update", stock: { expected: 100 } });
  const pb = patches("/api/urun-stok/yag")[0]?.body ?? {};
  ok(u.ok && !("stock_base" in pb), "stok değişmediği için PATCH gövdesinde stock_base YOK");
  ok(row.stock_base === 95 && row.name === "STOK YENİ AD", "satış korundu (95), ad güncellendi");

  console.log("\n[STK-01-b] Bayat stokla mutlak stok yazımı reddedilir (409), hiçbir alan yazılmaz");
  calls = [];
  u = await oilDb.upsertOilInventoryItem(TA, { ...oilItem("oil_s", "BAŞKA AD", 110) }, { mode: "update", stock: { expected: 100 } });
  ok(!u.ok && u.conflict === true, "conflict döndü");
  ok(row.stock_base === 95 && row.name === "STOK YENİ AD", "stok 95 ve ad DEĞİŞMEDİ");
  u = await oilDb.upsertOilInventoryItem(TA, { ...oilItem("oil_s", "BAŞKA AD", 105) }, { mode: "update", stock: { expected: 95 } });
  ok(u.ok && row.stock_base === 105, "güncel beklenen değerle yazım başarılı (95 → 105)");

  console.log("\n[STK-01-c] expected_stock olmadan stok PATCH'i sunucuda reddedilir (korumasız yol yok)");
  const raw428 = await serve("/api/urun-stok/yag", { method: "PATCH", body: JSON.stringify({ id: row.id, stock_base: 1 }) });
  ok(raw428.status === 428 && row.stock_base === 105, "428 + stok değişmedi");
  const rawNeg = await serve("/api/urun-stok/yag", { method: "PATCH", body: JSON.stringify({ id: row.id, stock_base: -5, expected_stock: 105 }) });
  ok(rawNeg.status === 400 && row.stock_base === 105, "negatif stok 400");
  serverTenant = TB;
  const rawX = await serve("/api/urun-stok/yag", { method: "PATCH", body: JSON.stringify({ id: row.id, stock_base: 1, expected_stock: 105 }) });
  serverTenant = TA;
  ok(rawX.status === 404 && row.stock_base === 105, "başka tenant → 404 (stok sızdırmaz, yazmaz)");

  console.log("\n[STK-01-d] Canlı Stok '+ Ekle': önbellek değil ekrandaki DB değeri; değiştiyse conflict");
  resetWorld();
  const lr = serverOil(TA, "oil_l", "CANLI", 40);
  await oilDb.loadOilInventoryForTenant(TA);
  oilLogic.saveOilInventory([oilItem("oil_l", "CANLI", 999)]); // bozuk/bayat önbellek: hesaba KATILMAMALI
  const liveRow = { id: "oil:oil_l", category: "oil" as const, stockAmount: 40, unitLabel: "ml", name: "CANLI", groupLabel: "" };
  let d = await live.applyStockDelta(liveRow as never, 10, TA, false);
  ok(d.ok && lr.stock_base === 50, "40 + 10 = 50 (önbellekteki 999 kullanılmadı)");
  lr.stock_base = 45; // arada satış
  d = await live.applyStockDelta(liveRow as never, 10, TA, false); // ekran hâlâ 40 gösteriyor
  ok(!d.ok && d.conflict === true && lr.stock_base === 45, "bayat ekran → conflict, satış ezilmedi (45)");

  // ═════════ BUG-019 + STK-03 (Canlı Stok satış) ═════════
  console.log("\n[BUG-019] Canlı Stok '− Sat' satış ucuna gider, mutlak stok PATCH'i yapmaz");
  resetWorld();
  const sr = serverOil(TA, "oil_sell", "SATILIK", 100, 10, 15);
  calls = [];
  const sellRow = { id: "oil:oil_sell", category: "oil" as const, stockAmount: 100, unitLabel: "ml", name: "SATILIK", groupLabel: "" };
  const key1 = salesApi.saleAttemptFor(null, "oil:oil_sell|-5");
  d = await live.applyStockDelta(sellRow as never, -5, TA, false, key1.key);
  ok(d.ok && posts("/api/urun-stok/sales").length === 1, "satış POST /api/urun-stok/sales");
  ok(patches("/api/urun-stok/yag").length === 0, "envantere mutlak stok PATCH'i YOK");
  ok(sr.stock_base === 95 && sales.length === 1, "stok sunucuda düştü + satış kaydı var (rapora düşer)");
  ok(typeof d.message === "string" && d.message.includes("75,00"), `kaydedilen tutar kullanıcıya bildirildi (${d.message})`);
  const sb = posts("/api/urun-stok/sales")[0].body as { lines: Record<string, unknown>[] };
  ok(!("markup_pct" in sb.lines[0]), "markup gönderilmedi → sunucu ürünün satış fiyatını kullanır");

  console.log("\n[STK-03] Tekrar deneme aynı anahtar → ikinci satış YOK; yeni deneme ayrı satış");
  const again = salesApi.saleAttemptFor(key1, "oil:oil_sell|-5");
  ok(again.key === key1.key, "aynı imza → aynı anahtar");
  d = await live.applyStockDelta({ ...sellRow, stockAmount: 95 } as never, -5, TA, false, again.key);
  ok(d.ok && sales.length === 1 && sr.stock_base === 95, "tekrar istek duplicate: satış 1, stok 95");
  const fresh = salesApi.saleAttemptFor(null, "oil:oil_sell|-5");
  ok(fresh.key !== key1.key, "başarıdan sonra (ref sıfırlanınca) yeni anahtar");
  d = await live.applyStockDelta({ ...sellRow, stockAmount: 95 } as never, -5, TA, false, fresh.key);
  ok(d.ok && sales.length === 2 && sr.stock_base === 90, "yeni bilinçli satış ayrı işlem: satış 2, stok 90");
  ok(salesApi.saleAttemptFor(key1, "farklı-sepet").key !== key1.key, "sepet değişince yeni anahtar");

  console.log("\n[DEMO] Demo hesapta sunucuya hiçbir yazma isteği gitmez");
  resetWorld();
  serverOil(TA, "oil_demo", "DEMO", 10);
  oilLogic.saveOilInventory([oilItem("oil_demo", "DEMO", 10)]);
  calls = [];
  d = await live.applyStockDelta({ id: "oil:oil_demo", category: "oil", stockAmount: 10, unitLabel: "ml", name: "DEMO", groupLabel: "" } as never, -2, TA, true);
  ok(d.ok && calls.length === 0, "demo: yalnız yerel önizleme, ağ çağrısı 0");

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
