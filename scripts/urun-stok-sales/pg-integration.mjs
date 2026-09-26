// GERÇEK PostgreSQL entegrasyon testi — Ürün & Stok satış çekirdeği (USM-001/003/004/005/008/009)
// Bağımsız EPHEMERAL yerel Postgres (embedded-postgres) — production'a SIFIR temas, sentetik veri.
// Şema: repo inventory migration'ları (oil/soap_cream/accessory/other) + sentetik dogaltas_inventory
//        + yeni 20270122000000_inventory_sales.sql (tablolar + atomik RPC'ler).
// Çalıştır: node scripts/urun-stok-sales/pg-integration.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.LC_ALL = "C";
process.env.LANG = "C";

// Satır-flush'lı log (arka planda tail edilebilir; stdout bloklu tamponu bypass).
const LOG = path.join(os.tmpdir(), "urun-stok-sales-harness.log");
try { rmSync(LOG, { force: true }); } catch {}
const flush = (s) => { try { appendFileSync(LOG, s + "\n"); } catch {} };
const _cl = console.log.bind(console);
const _ce = console.error.bind(console);
console.log = (...a) => { const s = a.map(String).join(" "); _cl(s); flush(s); };
console.error = (...a) => { const s = a.map(String).join(" "); _ce(s); flush("ERR " + s); };

const DATA_DIR = path.join(os.tmpdir(), "urun-stok-sales-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const PORT = 54331, PW = "testpw";
const ROOT = process.cwd();
const readMig = (f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const conn = (database = "postgres") => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database });

// dogaltas_inventory repo migration'ında YOK (temel/stone şemasından gelir). RPC'nin
// kullandığı kolonlarla sentetik olarak oluşturuyoruz.
const DOGALTAS_DDL = `
create table public.dogaltas_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  type text not null default '',
  adet double precision not null default 0,
  unit_cost_try double precision not null default 0,
  total_cost_try double precision not null default 0,
  adet_price double precision not null default 0
);`;

const TA = "11111111-1111-1111-1111-111111111111"; // tenant A
const TB = "22222222-2222-2222-2222-222222222222"; // tenant B
const U1 = "aaaaaaaa-0000-0000-0000-000000000001"; // kullanıcı
const U2 = "aaaaaaaa-0000-0000-0000-000000000002";

// Envantere satır ekleyip id döndüren yardımcılar
async function addOil(c, tenant, clientId, name, stock, cost, sale, pct = 0) {
  return (await c.query(
    `insert into oil_inventory(tenant_id, client_id, name, stock_base, cost_per_base, sale_per_base, profit_pct)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [tenant, clientId, name, stock, cost, sale, pct])).rows[0].id;
}
async function addAccessory(c, tenant, clientId, name, stock, cost, sale) {
  return (await c.query(
    `insert into accessory_inventory(tenant_id, client_id, name, stock_qty, cost_per_unit, sale_per_unit)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [tenant, clientId, name, stock, cost, sale])).rows[0].id;
}
async function addDogaltas(c, tenant, name, type, adet, unitCost, adetPrice) {
  return (await c.query(
    `insert into dogaltas_inventory(tenant_id, name, type, adet, unit_cost_try, adet_price)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [tenant, name, type, adet, unitCost, adetPrice])).rows[0].id;
}

const callCreate = (c, { tenant = TA, by = U1, key, source = "test", note = "", lines }) =>
  c.query(`select public.inventory_sale_create_atomic($1,$2,$3,$4,$5,$6::jsonb) r`,
    [tenant, by, key, source, note, JSON.stringify(lines)]);
const callCancel = (c, { tenant = TA, saleId, by = U1 }) =>
  c.query(`select public.inventory_sale_cancel_atomic($1,$2,$3) r`, [tenant, saleId, by]);

const errcode = async (p) => { try { await p; return null; } catch (e) { return e.code; } };

async function main() {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise();
  await epg.start();
  console.log("embedded-postgres başlatıldı (ephemeral).\n");

  const su = conn();
  await su.connect();
  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
                    grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(DOGALTAS_DDL);
    await su.query(readMig("20260627140000_oil_inventory.sql"));
    await su.query(readMig("20260627150000_soap_cream_inventory.sql"));
    await su.query(readMig("20260627160000_accessory_inventory.sql"));
    await su.query(readMig("20260627170000_other_inventory.sql"));
    await su.query(readMig("20270123000000_inventory_sales.sql"));
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);
    console.log("Şema + migration'lar uygulandı.\n");

    // ── B: MIGRATION / GÜVENLİK DOĞRULAMA ──
    console.log("[B] Migration & güvenlik");
    const rls = (await su.query(`select relname, relrowsecurity from pg_class where relname in ('inventory_sales','inventory_sale_items') order by relname`)).rows;
    ok(rls.length === 2 && rls.every(r => r.relrowsecurity), "RLS açık (sales + sale_items)");
    const priv = (await su.query(`select has_table_privilege('anon','public.inventory_sales','SELECT') a, has_table_privilege('authenticated','public.inventory_sale_items','INSERT') b`)).rows[0];
    ok(priv.a === false && priv.b === false, "anon/authenticated tablo yetkisi YOK");
    const fns = (await su.query(`select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'inventory_sale_%' order by proname`)).rows;
    ok(fns.length === 2 && fns.every(f => f.prosecdef), "2 RPC + hepsi SECURITY DEFINER");
    const gx = (await su.query(`select
        has_function_privilege('service_role','public.inventory_sale_create_atomic(uuid,uuid,text,text,text,jsonb)','EXECUTE') svc,
        has_function_privilege('anon','public.inventory_sale_create_atomic(uuid,uuid,text,text,text,jsonb)','EXECUTE') anon,
        has_function_privilege('authenticated','public.inventory_sale_cancel_atomic(uuid,uuid,uuid)','EXECUTE') auth`)).rows[0];
    ok(gx.svc === true && gx.anon === false && gx.auth === false, "EXECUTE yalnız service_role");
    // search_path kilidi
    const cfg = (await su.query(`select proconfig from pg_proc where proname='inventory_sale_create_atomic'`)).rows[0].proconfig || [];
    ok(cfg.some(c => c.startsWith("search_path=")), "search_path explicit set");

    const asSvc = async (fn) => { const c = conn(); await c.connect(); try { await c.query("set role service_role"); return await fn(c); } finally { await c.end(); } };

    // ── S1: TEMEL SATIŞ (oil) — stok düşer, snapshot + para doğru ──
    console.log("\n[S1] Temel satış (oil): cost 100, sale 150, qty 2");
    const oil1 = await addOil(su, TA, "oil_1", "Lavanta Yağı", 10, 100, 0, 0);
    await asSvc(c => callCreate(c, { key: "s1", lines: [{ inventory_type: "oil", inventory_id: oil1, quantity: 2, markup_pct: 50 }] }));
    const st1 = (await su.query(`select stock_base from oil_inventory where id=$1`, [oil1])).rows[0].stock_base;
    ok(st1 === 8, `stok 10 → 8 (gerçek: ${st1})`);
    const sale1 = (await su.query(`select * from inventory_sales where idempotency_key='s1' and tenant_id=$1`, [TA])).rows[0];
    ok(!!sale1, "satış kaydı oluştu");
    ok(Number(sale1.total_cost) === 200 && Number(sale1.total_sale) === 300 && Number(sale1.total_profit) === 100,
      `toplam cost=200 sale=300 profit=100 (gerçek: ${sale1.total_cost}/${sale1.total_sale}/${sale1.total_profit})`);
    const it1 = (await su.query(`select * from inventory_sale_items where sale_id=$1`, [sale1.id])).rows[0];
    ok(it1.product_name_snapshot === "Lavanta Yağı" && Number(it1.unit_cost_snapshot) === 100 && Number(it1.unit_sale_price_snapshot) === 150,
      "satır snapshot: ad + birim maliyet(100) + birim satış(150)");
    ok(Number(it1.markup_pct) === 50, `markup %50 (gerçek: ${it1.markup_pct})`);

    // ── S2: YETERSİZ STOK → 45002, rollback ──
    console.log("\n[S2] Yetersiz stok");
    const oil2 = await addOil(su, TA, "oil_2", "Nane Yağı", 2, 50, 0, 0);
    const code2 = await errcode(asSvc(c => callCreate(c, { key: "s2", lines: [{ inventory_type: "oil", inventory_id: oil2, quantity: 3, markup_pct: 20 }] })));
    ok(code2 === "45002", `insufficient_stock 45002 (gerçek: ${code2})`);
    const st2 = (await su.query(`select stock_base from oil_inventory where id=$1`, [oil2])).rows[0].stock_base;
    ok(st2 === 2, `stok değişmedi (rollback), 2 (gerçek: ${st2})`);
    const cnt2 = (await su.query(`select count(*)::int n from inventory_sales where idempotency_key='s2'`)).rows[0].n;
    ok(cnt2 === 0, "satış kaydı oluşmadı");

    // ── S3: CROSS-TENANT — B'nin envanterini A satamaz → 45001, rollback ──
    console.log("\n[S3] Cross-tenant satış engeli");
    const oilB = await addOil(su, TB, "oilb_1", "B Yağı", 5, 30, 0, 0);
    const oilA = await addOil(su, TA, "oila_1", "A Yağı", 5, 30, 0, 0);
    const code3 = await errcode(asSvc(c => callCreate(c, { tenant: TA, key: "s3", lines: [
      { inventory_type: "oil", inventory_id: oilA, quantity: 1, markup_pct: 10 },
      { inventory_type: "oil", inventory_id: oilB, quantity: 1, markup_pct: 10 },
    ] })));
    ok(code3 === "45001", `inventory_not_found 45001 (gerçek: ${code3})`);
    const stA = (await su.query(`select stock_base from oil_inventory where id=$1`, [oilA])).rows[0].stock_base;
    const stB = (await su.query(`select stock_base from oil_inventory where id=$1`, [oilB])).rows[0].stock_base;
    ok(stA === 5 && stB === 5, `iki envanter de değişmedi (A=${stA}, B=${stB}) — çok-satırlı rollback`);
    ok((await su.query(`select count(*)::int n from inventory_sales where idempotency_key='s3'`)).rows[0].n === 0, "satış oluşmadı");

    // ── S4: DUPLICATE LINE → 45010 ──
    console.log("\n[S4] Aynı ürün iki satır");
    const oil4 = await addOil(su, TA, "oil_4", "Tekrar Yağı", 10, 10, 0, 0);
    const code4 = await errcode(asSvc(c => callCreate(c, { key: "s4", lines: [
      { inventory_type: "oil", inventory_id: oil4, quantity: 1, markup_pct: 0 },
      { inventory_type: "oil", inventory_id: oil4, quantity: 1, markup_pct: 0 },
    ] })));
    ok(code4 === "45010", `duplicate_line 45010 (gerçek: ${code4})`);

    // ── S5: IDEMPOTENCY — aynı key iki kez → tek satış, stok bir kez düşer ──
    console.log("\n[S5] Idempotency");
    const oil5 = await addOil(su, TA, "oil_5", "Idem Yağı", 10, 20, 0, 0);
    const r5a = (await asSvc(c => callCreate(c, { key: "idem-1", lines: [{ inventory_type: "oil", inventory_id: oil5, quantity: 3, markup_pct: 0 }] }))).rows[0].r;
    const r5b = (await asSvc(c => callCreate(c, { key: "idem-1", lines: [{ inventory_type: "oil", inventory_id: oil5, quantity: 3, markup_pct: 0 }] }))).rows[0].r;
    ok(r5a.duplicate === false && r5b.duplicate === true, "1. çağrı yeni, 2. çağrı duplicate:true");
    ok(r5a.sale_id === r5b.sale_id, "aynı sale_id döner");
    const st5 = (await su.query(`select stock_base from oil_inventory where id=$1`, [oil5])).rows[0].stock_base;
    ok(st5 === 7, `stok yalnız 1 kez düştü: 10 → 7 (gerçek: ${st5})`);
    ok((await su.query(`select count(*)::int n from inventory_sales where idempotency_key='idem-1'`)).rows[0].n === 1, "tek satış kaydı");

    // ── S6: CONCURRENCY — stok=1, iki eşzamanlı satış → yalnız 1 başarılı ──
    console.log("\n[S6] Concurrency: stok=1, iki eşzamanlı satış");
    const oil6 = await addOil(su, TA, "oil_6", "Yarış Yağı", 1, 40, 0, 0);
    const cA = conn(); const cB = conn(); await cA.connect(); await cB.connect();
    await cA.query("set role service_role"); await cB.query("set role service_role");
    const pA = callCreate(cA, { key: "conc-A", lines: [{ inventory_type: "oil", inventory_id: oil6, quantity: 1, markup_pct: 0 }] });
    const pB = callCreate(cB, { key: "conc-B", lines: [{ inventory_type: "oil", inventory_id: oil6, quantity: 1, markup_pct: 0 }] });
    const settled = await Promise.allSettled([pA, pB]);
    await cA.end(); await cB.end();
    const okCount = settled.filter(s => s.status === "fulfilled").length;
    const failCodes = settled.filter(s => s.status === "rejected").map(s => s.reason.code);
    ok(okCount === 1, `tam olarak 1 başarılı (gerçek: ${okCount})`);
    ok(failCodes.length === 1 && failCodes[0] === "45002", `diğeri 45002 (gerçek: ${failCodes.join(",")})`);
    const st6 = (await su.query(`select stock_base from oil_inventory where id=$1`, [oil6])).rows[0].stock_base;
    ok(st6 === 0, `final stok = 0 (gerçek: ${st6})`);
    ok((await su.query(`select count(*)::int n from inventory_sales where idempotency_key in ('conc-A','conc-B')`)).rows[0].n === 1, "tek satış kaydı (lost-update yok)");

    // ── S7: CANCEL — stok iadesi + çift iptal güvenli ──
    console.log("\n[S7] İptal + çift iptal");
    const oil7 = await addOil(su, TA, "oil_7", "İptal Yağı", 5, 10, 0, 0);
    const r7 = (await asSvc(c => callCreate(c, { key: "s7", lines: [{ inventory_type: "oil", inventory_id: oil7, quantity: 2, markup_pct: 0 }] }))).rows[0].r;
    ok((await su.query(`select stock_base from oil_inventory where id=$1`, [oil7])).rows[0].stock_base === 3, "satış sonrası stok 5→3");
    await asSvc(c => callCancel(c, { saleId: r7.sale_id }));
    ok((await su.query(`select stock_base from oil_inventory where id=$1`, [oil7])).rows[0].stock_base === 5, "iptal sonrası stok 3→5");
    ok((await su.query(`select status from inventory_sales where id=$1`, [r7.sale_id])).rows[0].status === "cancelled", "status=cancelled");
    const r7b = (await asSvc(c => callCancel(c, { saleId: r7.sale_id }))).rows[0].r;
    ok(r7b.already_cancelled === true, "2. iptal already_cancelled:true");
    ok((await su.query(`select stock_base from oil_inventory where id=$1`, [oil7])).rows[0].stock_base === 5, "çift iptalde stok 5 kalır (7 DEĞİL)");

    // ── S8: SNAPSHOT KARARLILIĞI — ürün değişse de geçmiş sabit ──
    console.log("\n[S8] Tarihsel snapshot kararlılığı");
    const oil8 = await addOil(su, TA, "oil_8", "Lavanta Yağı", 5, 100, 0, 0);
    const r8 = (await asSvc(c => callCreate(c, { key: "s8", lines: [{ inventory_type: "oil", inventory_id: oil8, quantity: 1, unit_sale_price: 150 }] }))).rows[0].r;
    await su.query(`update oil_inventory set name='Organik Lavanta Yağı', cost_per_base=130 where id=$1`, [oil8]);
    const it8 = (await su.query(`select * from inventory_sale_items where sale_id=$1`, [r8.sale_id])).rows[0];
    ok(it8.product_name_snapshot === "Lavanta Yağı" && Number(it8.unit_cost_snapshot) === 100 && Number(it8.unit_sale_price_snapshot) === 150,
      "ürün ad/maliyet değişti ama satır snapshot SABİT (Lavanta / 100 / 150)");

    // ── S9: DOGALTAS + ACCESSORY yolları (farklı kolonlar) ──
    console.log("\n[S9] Dogaltas (adet) + Accessory (stock_qty) yolları");
    const dg = await addDogaltas(su, TA, "Ametist", "Küre", 10, 25, 40);
    const acc = await addAccessory(su, TA, "acc_1", "Tespih", 8, 15, 25);
    const r9 = (await asSvc(c => callCreate(c, { key: "s9", lines: [
      { inventory_type: "dogaltas", inventory_id: dg, quantity: 3 },
      { inventory_type: "accessory", inventory_id: acc, quantity: 2 },
    ] }))).rows[0].r;
    ok((await su.query(`select adet from dogaltas_inventory where id=$1`, [dg])).rows[0].adet === 7, "dogaltas adet 10→7");
    ok((await su.query(`select stock_qty from accessory_inventory where id=$1`, [acc])).rows[0].stock_qty === 6, "accessory stock_qty 8→6");
    const items9 = (await su.query(`select inventory_type, unit, unit_sale_price_snapshot from inventory_sale_items where sale_id=$1 order by inventory_type`, [r9.sale_id])).rows;
    // dogaltas default sale=40 (adet_price), accessory default sale=25 (sale_per_unit)
    ok(items9.find(i => i.inventory_type === "dogaltas").unit === "adet", "dogaltas birim=adet");
    ok(Number(items9.find(i => i.inventory_type === "dogaltas").unit_sale_price_snapshot) === 40, "dogaltas default satış = adet_price(40)");
    ok(Number(items9.find(i => i.inventory_type === "accessory").unit_sale_price_snapshot) === 25, "accessory default satış = sale_per_unit(25)");

    // ── S10: PARA / YUVARLAMA — float garbage yok ──
    console.log("\n[S10] Para/yuvarlama determinizmi");
    const oilM = await addOil(su, TA, "oil_m", "Ondalık Yağı", 100, 19.99, 0, 0);
    // 3 adet, markup 33.33% → unit_sale = round(19.99*1.3333,4); line hesapları 2 hane
    const rM = (await asSvc(c => callCreate(c, { key: "s10", lines: [{ inventory_type: "oil", inventory_id: oilM, quantity: 3, markup_pct: 33.33 }] }))).rows[0].r;
    const itM = (await su.query(`select * from inventory_sale_items where sale_id=$1`, [rM.sale_id])).rows[0];
    const lc = Number(itM.line_cost_total), ls = Number(itM.line_sale_total), lp = Number(itM.line_profit);
    ok(lc === 59.97, `line_cost = 19.99*3 = 59.97 (gerçek: ${lc})`);
    ok(Number.isInteger(Math.round(ls * 100)) && ls === Math.round(ls * 100) / 100, `line_sale 2 hane, float garbage yok (${ls})`);
    ok(Math.abs((ls - lc) - lp) < 0.005, `line_profit = sale - cost tutarlı (${lp})`);
    // Toplam = satırların toplamı
    const saleM = (await su.query(`select total_sale, total_cost, total_profit from inventory_sales where id=$1`, [rM.sale_id])).rows[0];
    ok(Number(saleM.total_sale) === ls && Number(saleM.total_cost) === lc, "satış toplamı = satır toplamları");

    // ── S11: unit_sale_price 0 + markup yok → maliyet fiyatı (kâr 0) ──
    console.log("\n[S11] Fiyat verilmezse maliyet (kâr 0)");
    const oilZ = await addOil(su, TA, "oil_z", "Sıfır Kâr", 5, 70, 0, 0);
    const rZ = (await asSvc(c => callCreate(c, { key: "s11", lines: [{ inventory_type: "oil", inventory_id: oilZ, quantity: 1 }] }))).rows[0].r;
    const itZ = (await su.query(`select * from inventory_sale_items where sale_id=$1`, [rZ.sale_id])).rows[0];
    ok(Number(itZ.unit_sale_price_snapshot) === 70 && Number(itZ.line_profit) === 0, "fiyat=maliyet(70), kâr=0");

    // ── S12: geçersiz miktar / tip ──
    console.log("\n[S12] Girdi doğrulama");
    const oilV = await addOil(su, TA, "oil_v", "Doğrulama", 5, 10, 0, 0);
    ok(await errcode(asSvc(c => callCreate(c, { key: "s12a", lines: [{ inventory_type: "oil", inventory_id: oilV, quantity: 0 }] }))) === "45012", "qty=0 → 45012");
    ok(await errcode(asSvc(c => callCreate(c, { key: "s12b", lines: [{ inventory_type: "oil", inventory_id: oilV, quantity: -1 }] }))) === "45012", "qty<0 → 45012");
    ok(await errcode(asSvc(c => callCreate(c, { key: "s12c", lines: [{ inventory_type: "bogus", inventory_id: oilV, quantity: 1 }] }))) === "45011", "geçersiz tip → 45011");
    ok(await errcode(asSvc(c => callCreate(c, { key: "s12d", lines: [] }))) === "45014", "boş satır → 45014");
    ok(await errcode(asSvc(c => callCreate(c, { key: "", lines: [{ inventory_type: "oil", inventory_id: oilV, quantity: 1 }] }))) === "45014", "boş idempotency → 45014");

    // ── S13: KATEGORİ FİLTRESİ (route sorgusu) + cross-tenant history izolasyonu ──
    console.log("\n[S13] Kategori geçmiş filtresi + cross-tenant izolasyon");
    const oilTB = await addOil(su, TB, "oiltb_hist", "TB Geçmiş Yağı", 5, 10, 0, 0);
    await asSvc((c) => callCreate(c, { tenant: TB, by: U2, key: "tb-hist-1", lines: [{ inventory_type: "oil", inventory_id: oilTB, quantity: 1, markup_pct: 0 }] }));
    // Route'un kategori modunda çalıştırdığı sorgu: items where tenant_id + inventory_type
    const taOil = (await su.query(`select inventory_type from inventory_sale_items where tenant_id=$1 and inventory_type='oil'`, [TA])).rows;
    ok(taOil.length > 0 && taOil.every((r) => r.inventory_type === "oil"), `TA 'oil' filtresi yalnız oil (${taOil.length} satır)`);
    const taAcc = (await su.query(`select inventory_type from inventory_sale_items where tenant_id=$1 and inventory_type='accessory'`, [TA])).rows;
    ok(taAcc.length > 0 && taAcc.every((r) => r.inventory_type === "accessory"), `TA 'accessory' filtresi yalnız accessory (${taAcc.length} satır)`);
    const taDog = (await su.query(`select inventory_type from inventory_sale_items where tenant_id=$1 and inventory_type='dogaltas'`, [TA])).rows;
    ok(taDog.length > 0 && taDog.every((r) => r.inventory_type === "dogaltas"), "TA 'dogaltas' filtresi yalnız dogaltas");
    // Cross-tenant: TA'nın oil geçmişi TB satışını İÇERMEZ
    const tbSaleIds = new Set((await su.query(`select id from inventory_sales where tenant_id=$1`, [TB])).rows.map((r) => r.id));
    const taOilSaleIds = (await su.query(`select distinct sale_id from inventory_sale_items where tenant_id=$1 and inventory_type='oil'`, [TA])).rows.map((r) => r.sale_id);
    ok(taOilSaleIds.every((id) => !tbSaleIds.has(id)), "TA kategori geçmişi TB satışını İÇERMEZ (cross-tenant)");
    const tbOil = (await su.query(`select tenant_id from inventory_sale_items where tenant_id=$1 and inventory_type='oil'`, [TB])).rows;
    ok(tbOil.length === 1, `TB oil geçmişi yalnız kendi satışı (${tbOil.length})`);
    // İptal edilen satışın satırı geçmişte kalır (status ile gösterilir)
    const cancelledStillListed = (await su.query(
      `select si.id from inventory_sale_items si join inventory_sales s on s.id=si.sale_id
       where si.tenant_id=$1 and si.inventory_type='oil' and s.status='cancelled'`, [TA])).rows;
    ok(cancelledStillListed.length >= 1, "iptal edilen satış satırı geçmişte kalır (status=cancelled)");

    console.log(`\n${"=".repeat(56)}`);
    console.log(JSON.stringify({ pass, fail, total: pass + fail }, null, 2));
    if (fail > 0) process.exitCode = 1;
  } catch (e) {
    console.error("HATA:", e.message, e.code || "", e.detail || "");
    process.exitCode = 1;
  } finally {
    await su.end();
    await epg.stop();
  }
}
main();
