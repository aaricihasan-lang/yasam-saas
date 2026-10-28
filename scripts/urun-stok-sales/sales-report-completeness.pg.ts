/**
 * Satış Öncesi Hata #3 — satış raporu eksiksizliği: GERÇEK PostgreSQL + PostgREST testi.
 * Ephemeral yerel Postgres (embedded-postgres) + PostgREST (db-max-rows = 1000, Supabase varsayılanı);
 * yalnız SENTETİK veri; production'a SIFIR temas. Portlar boş porttan seçilir (paralel oturumlarla çakışmaz).
 *
 * Gerçek kodu çalıştırır: lib/urun-stok/salesHistoryServer.readSalesHistoryPage (GET /api/urun-stok/sales çekirdeği).
 *   [R] ESKİ davranışın kanıtı: kalem sorgusu 1000 satırda sessizce kesiliyordu; offset sayfalamada araya
 *       giren satış bir kaydı iki kez saydırıyordu.
 *   [N] YENİ: 2.001 satış, aynı sayfada 1.000+ kalem, 5 kategori — eksiksiz, SQL ile aynı toplam, ISO sıralama,
 *       eşzamanlı ekleme/iptalde atlama/çift yok, kategori modu 1.000+ kalem, imleç doğrulama, tenant izolasyonu,
 *       kalem sayısı tutarsızlığı tespiti, offset modu geriye dönük uyum.
 *
 * Çalıştır: POSTGREST_BIN=<postgrest> npx tsx scripts/urun-stok-sales/sales-report-completeness.pg.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { readSalesHistoryPage, type SalesHistoryParams } from "@/lib/urun-stok/salesHistoryServer";

process.env.LC_ALL = "C";
process.env.LANG = "C";
const PW = "testpw";
const JWT_SECRET = "sales-report-completeness-local-only-secret-0123456789";
const DATA_DIR = path.join(os.tmpdir(), `sales-report-completeness-pgdata-${process.pid}`);
const ROOT = process.cwd();
const readMig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
const TA = "11111111-1111-1111-1111-111111111111";
const TB = "22222222-2222-2222-2222-222222222222";
const UA = "aaaaaaaa-0000-0000-0000-00000000000a";

let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((res, rej) => {
  const s = net.createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); });
});
function jwt(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ role, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
type Row = Record<string, unknown>;
const P = (o: Partial<SalesHistoryParams>): SalesHistoryParams => ({ limit: 200, offset: 0, cursor: null, status: null, inventoryType: null, ...o });

async function main() {
  const PORT = await freePort();
  const REST_PORT = await freePort();
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* yok */ }
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise();
  await epg.start();
  let rest: ChildProcess | null = null;
  const su = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
  await su.connect();
  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create role authenticator login noinherit password 'auth-local'; grant anon, authenticated, service_role to authenticator;
      grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(`create table public.dogaltas_inventory (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
      name text not null, type text not null default '', adet double precision not null default 0, unit_cost_try double precision not null default 0,
      total_cost_try double precision not null default 0, adet_price double precision not null default 0);`);
    for (const f of ["20260627140000_oil_inventory.sql", "20260627150000_soap_cream_inventory.sql", "20260627160000_accessory_inventory.sql",
      "20260627170000_other_inventory.sql", "20270123000000_inventory_sales.sql", "20271111000000_inventory_sales_list_visibility.sql"]) {
      await su.query(readMig(f));
    }
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);

    // ── Sentetik veri (yalnız bu geçici veritabanında) ──
    // A: 2.001 satış. sold_at 31.12.2025'ten itibaren; her 10 satış AYNI sold_at (eşitlikte id sırası testi).
    // En yeni 200 satış 6'şar kalem → ilk sayfada 1.200 kalem (> max-rows 1000). Diğerleri 1 kalem.
    // Kategoriler: çok kalemlilerde 5 kategori döner; tek kalemlilerin yarısı oil → oil > 1.000 kalem.
    // Her 50. satış iptal. B: 300 satış (izolasyon).
    await su.query(`
      insert into inventory_sales (tenant_id, created_by, source, status, idempotency_key, sold_at, item_count, cancelled_at)
      select $1::uuid, $2::uuid, 'central', case when g % 50 = 0 then 'cancelled' else 'completed' end, 'a-' || g,
             timestamptz '2025-12-31 22:00:00+00' + ((g / 10) * interval '37 minutes') + interval '123456 microseconds',
             case when g > 1801 then 6 else 1 end, case when g % 50 = 0 then now() end
      from generate_series(1, 2001) g`, [TA, UA]);
    await su.query(`
      insert into inventory_sales (tenant_id, created_by, source, status, idempotency_key, sold_at, item_count)
      select $1::uuid, $2::uuid, 'central', 'completed', 'b-' || g, timestamptz '2026-03-01 00:00:00+00' + g * interval '1 minute', 1
      from generate_series(1, 300) g`, [TB, UA]);
    await su.query(`
      insert into inventory_sale_items (sale_id, tenant_id, inventory_type, inventory_id, product_name_snapshot, quantity,
        unit_cost_snapshot, unit_sale_price_snapshot, line_cost_total, line_sale_total, line_profit, created_at)
      select s.id, s.tenant_id,
             case when s.item_count = 6 then (array['dogaltas','oil','soap_cream','accessory','other'])[1 + (k % 5)]
                  when (substr(s.idempotency_key, 3)::int % 2) = 0 then 'oil'
                  else (array['dogaltas','oil','soap_cream','accessory','other'])[1 + (substr(s.idempotency_key, 3)::int % 5)] end,
             gen_random_uuid(), 'Ürün ' || (k % 7), 1 + (k % 3), 10, 25, 10 * (1 + (k % 3)), 25 * (1 + (k % 3)), 15 * (1 + (k % 3)), s.sold_at
      from inventory_sales s cross join lateral generate_series(1, s.item_count) k`);
    await su.query(`update inventory_sales s set total_sale = x.ts, total_cost = x.tc, total_profit = x.ts - x.tc
      from (select sale_id, sum(line_sale_total) ts, sum(line_cost_total) tc from inventory_sale_items group by sale_id) x where x.sale_id = s.id`);
    const q1 = async (sql: string, args: unknown[] = []) => (await su.query(sql, args)).rows[0];

    // ── PostgREST (Supabase varsayılanı: db-max-rows = 1000) ──
    const bin = process.env.POSTGREST_BIN;
    if (!bin || !existsSync(bin)) throw new Error("POSTGREST_BIN gerekli (sessizce atlanmaz).");
    const conf = path.join(os.tmpdir(), `sales-report-completeness-postgrest-${process.pid}.conf`);
    writeFileSync(conf, [`db-uri = "postgres://authenticator:auth-local@127.0.0.1:${PORT}/postgres"`, `db-schemas = "public"`,
      `db-anon-role = "anon"`, `db-max-rows = 1000`, `db-pool = 10`, `jwt-secret = "${JWT_SECRET}"`,
      `server-host = "127.0.0.1"`, `server-port = ${REST_PORT}`, `log-level = "error"`].join("\n"));
    rest = spawn(bin, [conf], { cwd: path.dirname(bin), stdio: "ignore" });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { up = (await fetch(`http://127.0.0.1:${REST_PORT}/`, { headers: { Authorization: `Bearer ${jwt("service_role")}` } })).status < 500; } catch { /* bekle */ }
      if (!up) await sleep(250);
    }
    if (!up) throw new Error("PostgREST açılamadı");
    const db = new PostgrestClient(`http://127.0.0.1:${REST_PORT}`, { headers: { Authorization: `Bearer ${jwt("service_role")}` } }) as unknown as SupabaseClient;

    const readAll = async (base: Partial<SalesHistoryParams>, between?: (page: number) => Promise<void>) => {
      const sales: Row[] = []; const items: Row[] = []; const mismatch: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 1000; page++) {
        const r = await readSalesHistoryPage(db, TA, P({ ...base, cursor }));
        if (!r.ok) throw new Error(`okuma hatası: ${r.error}`);
        sales.push(...(r.sales as Row[])); items.push(...(r.items as Row[])); mismatch.push(...r.itemCountMismatch);
        if (!r.hasMore) return { sales, items, mismatch, pages: page + 1 };
        cursor = r.nextCursor;
        if (between) await between(page);
      }
      throw new Error("sayfalama bitmedi");
    };

    // ═════ [R] ESKİ davranışın kanıtı ═════
    console.log("\n[R] ESKİ davranış (hata yeniden üretildi)");
    const first200 = (await su.query(`select id from inventory_sales where tenant_id=$1 order by sold_at desc, id desc limit 200`, [TA])).rows.map((r) => r.id as string);
    const oldItems = await db.from("inventory_sale_items").select("id").in("sale_id", first200);
    const realItems = Number((await q1(`select count(*) n from inventory_sale_items where sale_id = any($1::uuid[])`, [first200])).n);
    ok(!oldItems.error && (oldItems.data ?? []).length === 1000 && realItems > 1000,
      `eski kalem sorgusu (range'siz .in) 1000'de SESSİZCE kesildi: ${(oldItems.data ?? []).length} / gerçek ${realItems}`);
    const oldPage = (from: number) => db.from("inventory_sales").select("id").eq("tenant_id", TA).eq("status", "completed")
      .order("sold_at", { ascending: false }).order("id", { ascending: false }).range(from, from + 199);
    const op1 = ((await oldPage(0)).data ?? []) as Row[];
    const tmp = (await q1(`insert into inventory_sales (tenant_id, created_by, idempotency_key, sold_at) values ($1,$2,'tmp-new', now() + interval '1 day') returning id`, [TA, UA])).id;
    const op2 = ((await oldPage(200)).data ?? []) as Row[];
    ok(op2[0]?.id === op1[op1.length - 1]?.id, "eski offset sayfalama: araya yeni satış girince bir kayıt İKİ KEZ okundu");
    await su.query(`delete from inventory_sales where id=$1`, [tmp]);

    // ═════ [N] YENİ okuma çekirdeği ═════
    console.log("\n[N1] Genel mod: 2.001 satış, aynı sayfada 1.000+ kalem — eksiksiz");
    const exp = await q1(`select count(*)::int n, sum(item_count)::int items from inventory_sales where tenant_id=$1 and status='completed'`, [TA]);
    const r = await readAll({ status: "completed" });
    ok(r.sales.length === exp.n && exp.n > 1900, `tamamlanmış satışların hepsi okundu: ${r.sales.length} = ${exp.n}`);
    ok(r.items.length === exp.items, `tüm kalemler okundu: ${r.items.length} = ${exp.items} (sayfa başı 1.000 tavanı aşıldı)`);
    const p1 = await readSalesHistoryPage(db, TA, P({ status: "completed" }));
    ok(p1.ok && (p1.items as Row[]).length > 1000, `ilk sayfa tek istekte ${p1.ok ? (p1.items as Row[]).length : "?"} kalem (eskiden 1000'de kesilirdi)`);
    ok(new Set(r.sales.map((s) => s.id)).size === r.sales.length && new Set(r.items.map((i) => i.id)).size === r.items.length, "hiçbir satış/kalem iki kez okunmadı");
    ok(r.mismatch.length === 0, "kalem sayısı tutarlılığı: uyuşmazlık yok");
    const tenantOfItems = Number((await q1(`select count(*) n from inventory_sale_items where id = any($1::uuid[]) and tenant_id <> $2`, [r.items.map((i) => i.id), TA])).n);
    const tenantOfSales = Number((await q1(`select count(*) n from inventory_sales where id = any($1::uuid[]) and tenant_id <> $2`, [r.sales.map((s) => s.id), TA])).n);
    ok(tenantOfItems === 0 && tenantOfSales === 0, "tenant izolasyonu: B kiracısının hiçbir satış/kalemi yok (SQL ile doğrulandı)");

    console.log("\n[N2] Toplamlar SQL ile aynı");
    const sums = await q1(`select sum(i.line_sale_total)::numeric s, sum(i.line_cost_total)::numeric c from inventory_sale_items i join inventory_sales s on s.id=i.sale_id where s.tenant_id=$1 and s.status='completed'`, [TA]);
    const gotS = r.items.reduce((a, i) => a + Number(i.line_sale_total), 0);
    const gotC = r.items.reduce((a, i) => a + Number(i.line_cost_total), 0);
    ok(Math.abs(gotS - Number(sums.s)) < 0.001 && Math.abs(gotC - Number(sums.c)) < 0.001, `ciro ${gotS} / maliyet ${gotC} = SQL ${sums.s} / ${sums.c}`);
    const byCat = (await su.query(`select i.inventory_type t, sum(i.line_sale_total)::numeric v from inventory_sale_items i join inventory_sales s on s.id=i.sale_id where s.tenant_id=$1 and s.status='completed' group by 1`, [TA])).rows;
    ok(byCat.length === 5 && byCat.every((c) => Math.abs(r.items.filter((i) => i.inventory_type === c.t).reduce((a, i) => a + Number(i.line_sale_total), 0) - Number(c.v)) < 0.001), "kategori dağılımı (5 kategori) SQL ile aynı");

    console.log("\n[N3] Sıralama gerçek tarih + eşitlikte kimlik");
    const ordered = r.sales.every((s, i) => i === 0 || (() => {
      const a = r.sales[i - 1], ta = new Date(String(a.sold_at)).getTime(), tb = new Date(String(s.sold_at)).getTime();
      return ta > tb || (ta === tb && String(a.id) > String(s.id));
    })());
    ok(ordered, "sold_at DESC, eşit sold_at'ta id DESC (sayfa sınırlarında da)");
    ok(String(r.sales[0].sold_at).includes(".123456"), `mikrosaniye hassasiyeti imleçte korunur (${String(r.sales[0].sold_at)})`);

    console.log("\n[N4] Okuma sırasında yeni satış + iptal → atlama/çift yok");
    const before = new Set((await su.query(`select id from inventory_sales where tenant_id=$1 and status='completed'`, [TA])).rows.map((x) => x.id as string));
    let cancelledId = "";
    const rc = await readAll({ status: "completed" }, async (page) => {
      if (page === 0) {
        await su.query(`insert into inventory_sales (tenant_id, created_by, idempotency_key, sold_at) values ($1,$2,'conc-new', now() + interval '2 days')`, [TA, UA]);
        cancelledId = (await q1(`select id from inventory_sales where tenant_id=$1 and status='completed' order by sold_at asc limit 1`, [TA])).id;
        await su.query(`update inventory_sales set status='cancelled', cancelled_at=now() where id=$1`, [cancelledId]);
      }
    });
    const got = new Set(rc.sales.map((s) => String(s.id)));
    const missing = [...before].filter((id) => id !== cancelledId && !got.has(id));
    ok(got.size === rc.sales.length, "eşzamanlı değişiklikte hiçbir satış iki kez okunmadı");
    ok(missing.length === 0, `eşzamanlı değişiklikte hiçbir mevcut satış ATLANMADI (eksik: ${missing.length})`);
    ok(!got.has(cancelledId), "okuma sırasında iptal edilen satış 'tamamlanmış' raporda yer almadı");

    console.log("\n[N5] Kategori modu: 1.000+ kalem (kalem bazlı imleç)");
    const oilN = Number((await q1(`select count(*) n from inventory_sale_items where tenant_id=$1 and inventory_type='oil'`, [TA])).n);
    const rk = await readAll({ inventoryType: "oil" });
    ok(oilN > 1000 && rk.items.length === oilN, `oil kalemleri eksiksiz: ${rk.items.length} = ${oilN}`);
    ok(new Set(rk.items.map((i) => i.id)).size === rk.items.length, "kategori modunda tekrar yok");
    const saleIdsOfOil = new Set(rk.items.map((i) => String(i.sale_id)));
    ok([...saleIdsOfOil].every((id) => rk.sales.some((s) => String(s.id) === id)), "her kalemin satış kaydı döndü");
    const pB = await readSalesHistoryPage(db, TB, P({ inventoryType: "oil" }));
    ok(pB.ok && (pB.items as Row[]).every((i) => !rk.items.some((x) => x.id === i.id)), "kategori modunda tenant izolasyonu");

    console.log("\n[N6] İmleç doğrulama (filtre enjeksiyonu yok)");
    const bad1 = await readSalesHistoryPage(db, TA, P({ cursor: "2026-01-01T00:00:00Z|x),id.gt.(0" }));
    const bad2 = await readSalesHistoryPage(db, TA, P({ cursor: "abc" }));
    ok(!bad1.ok && bad1.status === 400 && !bad2.ok && bad2.status === 400, "bozuk / enjeksiyonlu imleç → 400, sorgu çalışmaz");

    console.log("\n[N7] Kalem sayısı tutarsızlığı tespiti");
    const victim = first200[0];
    await su.query(`update inventory_sales set item_count = item_count + 1 where id=$1`, [victim]);
    const pm = await readSalesHistoryPage(db, TA, P({}));
    ok(pm.ok && pm.itemCountMismatch.includes(victim), "okunan kalem sayısı ≠ item_count → itemCountMismatch ile bildirildi");
    await su.query(`update inventory_sales set item_count = item_count - 1 where id=$1`, [victim]);

    console.log("\n[N8] Geriye dönük uyum (offset modu)");
    const po = await readSalesHistoryPage(db, TA, P({ limit: 50, offset: 0 }));
    ok(po.ok && (po.sales as Row[]).length === 50 && po.hasMore && po.nextCursor, "offset modu çalışıyor (+ nextCursor döner)");
  } finally {
    await su.end().catch(() => {});
    if (rest) rest.kill();
    await epg.stop().catch(() => {});
    try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* yok */ }
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
