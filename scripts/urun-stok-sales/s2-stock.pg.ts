/**
 * AŞAMA 2 / S2 — GERÇEK PostgreSQL + PostgREST entegrasyon testi (ephemeral, sentetik veri, prod'a SIFIR temas).
 *
 * PostgREST `db-max-rows = 1000` (Supabase varsayılanı) ile çalışır → sessiz kesilme gerçek koşulda üretilir.
 *
 *   STK-04 : eski tek sorgu >1000 satırı kesiyor (yeniden üretim); yeni readInventoryRowsPaged:
 *            boş / 1 / sayfa sınırı / sınır+1 / 1000 / 1001 / 2501 kayıt, aynı created_at, tekrar yok,
 *            eksik yok, tenant izolasyonu, stok>0 filtresi, toplam doğruluğu.
 *   STK-06 : inventory_sale_cancel_atomic — normal iptal; ürün silindikten sonra iptal (restored 0,
 *            item_count 1 → iade edilemeyen 1); ikinci iptal (already_cancelled, stok iki kez eklenmez);
 *            başka tenant satışı (45003); aynı client_id ile yeniden oluşturulmuş ürüne stok EKLENMEZ.
 *
 * Çalıştır: POSTGREST_BIN=<postgrest.exe> npx tsx scripts/urun-stok-sales/s2-stock.pg.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readInventoryRowsPaged } from "@/lib/urun-stok/pagedInventoryRead";

process.env.LC_ALL = "C";
process.env.LANG = "C";

const PORT = 54371;
const REST_PORT = 54372;
const PW = "testpw";
const JWT_SECRET = "s2-stock-local-only-secret-0123456789abcdef0123";
const DATA_DIR = path.join(os.tmpdir(), "s2-stock-pgdata");
const ROOT = process.cwd();
const readMig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
const TA = "11111111-1111-1111-1111-111111111111";
const TB = "22222222-2222-2222-2222-222222222222";
const U1 = "aaaaaaaa-0000-0000-0000-000000000001";

let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); }
};
const conn = () => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function jwt(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ role, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
const DOGALTAS_DDL = `create table public.dogaltas_inventory (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  name text not null, type text not null default '', adet double precision not null default 0, unit_cost_try double precision not null default 0,
  total_cost_try double precision not null default 0, adet_price double precision not null default 0);`;

async function seedOil(c: pg.Client, tenant: string, n: number, prefix: string, sameTime = true, stock = 5) {
  if (n <= 0) return;
  await c.query(
    `insert into oil_inventory(tenant_id, client_id, name, stock_base, cost_per_base, sale_per_base, created_at)
     select $1, $2 || g, $2 || lpad(g::text, 5, '0'), case when g % 7 = 0 then 0 else $4 end, 1, 2,
            case when $5 then '2026-10-21T10:00:00Z'::timestamptz else now() - (g || ' seconds')::interval end
       from generate_series(1, $3) g`,
    [tenant, prefix, n, stock, sameTime]);
}

async function main() {
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* yok */ }
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise();
  await epg.start();
  let rest: ChildProcess | null = null;
  const su = conn();
  await su.connect();
  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create role authenticator login noinherit password 'auth-local'; grant anon, authenticated, service_role to authenticator;
      grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(DOGALTAS_DDL);
    for (const f of ["20260627140000_oil_inventory.sql", "20260627150000_soap_cream_inventory.sql",
      "20260627160000_accessory_inventory.sql", "20260627170000_other_inventory.sql", "20270123000000_inventory_sales.sql"]) {
      await su.query(readMig(f));
    }
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);

    const bin = process.env.POSTGREST_BIN;
    if (!bin || !existsSync(bin)) throw new Error("POSTGREST_BIN gerekli (PostgREST max-rows davranışı için).");
    const conf = path.join(os.tmpdir(), "s2-stock-postgrest.conf");
    writeFileSync(conf, [`db-uri = "postgres://authenticator:auth-local@127.0.0.1:${PORT}/postgres"`, `db-schemas = "public"`,
      `db-anon-role = "anon"`, `db-max-rows = 1000`, `db-pool = 10`, `jwt-secret = "${JWT_SECRET}"`,
      `server-host = "127.0.0.1"`, `server-port = ${REST_PORT}`, `log-level = "error"`].join("\n"));
    rest = spawn(bin, [conf], { cwd: path.dirname(bin), stdio: "ignore" });
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { up = (await fetch(`http://127.0.0.1:${REST_PORT}/`, { headers: { Authorization: `Bearer ${jwt("service_role")}` } })).status < 500; } catch { /* bekle */ }
      if (!up) await sleep(250);
    }
    if (!up) throw new Error("PostgREST açılamadı");
    const db = new PostgrestClient(`http://127.0.0.1:${REST_PORT}`, { headers: { Authorization: `Bearer ${jwt("service_role")}` } }) as unknown as SupabaseClient;
    console.log("PG + PostgREST (db-max-rows=1000) hazır.\n");

    // ═════ STK-04 ═════
    const check = async (label: string, tenant: string, expected: number, extra?: { gtZero?: string; expectNames?: number }) => {
      const r = await readInventoryRowsPaged<{ id: string; name: string }>(db, "oil_inventory", tenant, "id, name, stock_base",
        { orderBy: "created_at", ascending: false, gtZero: extra?.gtZero });
      const ids = new Set(r.rows.map((x) => x.id));
      ok(!r.error && r.rows.length === expected && ids.size === expected, `${label}: ${r.rows.length}/${expected} satır, tekrar ${r.rows.length - ids.size}`);
      return r;
    };
    console.log("[STK-04-a] ESKİ tek sorgu (route'un eski hali) >1000 satırda SESSİZ kesiliyor");
    await seedOil(su, TA, 1001, "A_", true);
    const oldQ = await db.from("oil_inventory").select("*").eq("tenant_id", TA).order("created_at", { ascending: false, nullsFirst: false });
    ok(!oldQ.error && (oldQ.data ?? []).length === 1000, `eski sorgu hatasız döndü ama ${oldQ.data?.length}/1001 satır (1 ürün kayıp; hata yeniden üretildi)`);

    console.log("\n[STK-04-b] YENİ sayfalı okuma — sınır değerleri");
    await check("boş katalog (tenant B)", TB, 0);
    await seedOil(su, TB, 1, "B_", true);
    await check("1 kayıt", TB, 1);
    await su.query(`delete from oil_inventory where tenant_id=$1`, [TB]);
    await seedOil(su, TB, 500, "B_", true);
    await check("tam sayfa sınırı (500)", TB, 500);
    await seedOil(su, TB, 1, "B2_", true);
    await check("sayfa sınırı + 1 (501)", TB, 501);
    await su.query(`delete from oil_inventory where tenant_id=$1`, [TB]);
    await seedOil(su, TB, 1000, "B_", true);
    await check("tam max-rows (1000)", TB, 1000);
    await check("max-rows + 1 (1001, hepsi aynı created_at)", TA, 1001);
    await seedOil(su, TA, 1500, "A2_", false);
    const big = await check("2501 kayıt (karışık zaman damgası)", TA, 2501);
    const names = new Set(big.rows.map((x) => x.name));
    const all = (await su.query(`select name from oil_inventory where tenant_id=$1`, [TA])).rows.map((x) => x.name as string);
    ok(all.every((n) => names.has(n)), "DB'deki her ürün sonuçta var (eksik 0)");
    ok(big.rows.every((x) => x.name.startsWith("A")), "tenant izolasyonu: yalnız A tenant'ının satırları");
    const expectedPositive = Number((await su.query(`select count(*) n from oil_inventory where tenant_id=$1 and stock_base > 0`, [TA])).rows[0].n);
    await check(`stok>0 filtresi (katalog): ${expectedPositive}`, TA, expectedPositive, { gtZero: "stock_base" });
    const r1 = await readInventoryRowsPaged<{ id: string }>(db, "oil_inventory", TA, "id", { orderBy: "name" });
    const r2 = await readInventoryRowsPaged<{ id: string }>(db, "oil_inventory", TA, "id", { orderBy: "name" });
    ok(JSON.stringify(r1.rows) === JSON.stringify(r2.rows), "sıralama deterministik (iki okuma birebir aynı sıra)");
    const tenantBNames = (await readInventoryRowsPaged<{ name: string }>(db, "oil_inventory", TB, "name", { orderBy: "name" })).rows;
    ok(tenantBNames.length === 1000 && tenantBNames.every((x) => x.name.startsWith("B")), "tenant B okuması A satırı içermiyor");

    // ═════ STK-06 ═════
    console.log("\n[STK-06] Satış iptali ve silinmiş ürün");
    const mk = async (tenant: string, cid: string, stock: number) => (await su.query(
      `insert into oil_inventory(tenant_id, client_id, name, stock_base, cost_per_base, sale_per_base) values ($1,$2,$2,$3,10,15) returning id`,
      [tenant, cid, stock])).rows[0].id as string;
    const sell = async (tenant: string, key: string, lines: unknown[]) =>
      (await su.query(`select public.inventory_sale_create_atomic($1,$2,$3,'oil','',$4::jsonb) r`, [tenant, U1, key, JSON.stringify(lines)])).rows[0].r as { sale_id: string };
    const cancel = async (tenant: string, saleId: string) =>
      (await su.query(`select public.inventory_sale_cancel_atomic($1,$2,$3) r`, [tenant, saleId, U1])).rows[0].r as { already_cancelled: boolean; restored: number };
    const itemCount = async (tenant: string, saleId: string) =>
      Number(((await db.from("inventory_sales").select("item_count").eq("id", saleId).eq("tenant_id", tenant).maybeSingle()).data as { item_count: number } | null)?.item_count);
    const stockOf = async (id: string) => Number((await su.query(`select stock_base from oil_inventory where id=$1`, [id])).rows[0]?.stock_base);

    const p1 = await mk(TA, "cancel_normal", 10);
    const s1 = await sell(TA, "c1", [{ inventory_type: "oil", inventory_id: p1, quantity: 3 }]);
    let c = await cancel(TA, s1.sale_id);
    ok(!c.already_cancelled && c.restored === 1 && (await itemCount(TA, s1.sale_id)) === 1 && (await stockOf(p1)) === 10,
      "normal iptal: restored 1 = item_count 1 → iade edilemeyen 0; stok 7 → 10");

    const p2 = await mk(TA, "cancel_deleted", 10);
    const s2 = await sell(TA, "c2", [{ inventory_type: "oil", inventory_id: p2, quantity: 4 }]);
    await su.query(`delete from oil_inventory where id=$1`, [p2]);
    c = await cancel(TA, s2.sale_id);
    const ic2 = await itemCount(TA, s2.sale_id);
    const st2 = (await su.query(`select status from inventory_sales where id=$1`, [s2.sale_id])).rows[0].status;
    ok(!c.already_cancelled && c.restored === 0 && ic2 === 1 && st2 === "cancelled",
      `silinmiş ürün: iptal tamamlandı, restored 0, item_count 1 → iade edilemeyen ${ic2 - c.restored} (eski UI "stok geri eklendi" diyordu)`);
    ok((await su.query(`select count(*) n from oil_inventory where client_id='cancel_deleted'`)).rows[0].n === "0", "silinen ürün iptal yüzünden yeniden OLUŞMADI");
    const items2 = (await su.query(`select product_name_snapshot, line_sale_total from inventory_sale_items where sale_id=$1`, [s2.sale_id])).rows;
    ok(items2.length === 1 && items2[0].product_name_snapshot === "cancel_deleted" && Number(items2[0].line_sale_total) === 60, "satış geçmişi (snapshot) bozulmadı");

    c = await cancel(TA, s1.sale_id);
    ok(c.already_cancelled && c.restored === 0 && (await stockOf(p1)) === 10, "ikinci iptal: already_cancelled, stok İKİ KEZ eklenmedi (10)");

    const pb = await mk(TB, "cancel_b", 10);
    const sb = await sell(TB, "cb", [{ inventory_type: "oil", inventory_id: pb, quantity: 2 }]);
    let code: string | null = null;
    try { await cancel(TA, sb.sale_id); } catch (e) { code = (e as { code?: string }).code ?? null; }
    ok(code === "45003" && (await stockOf(pb)) === 8, "başka tenant satışı: 45003 (bulunamadı), B'nin stoğu değişmedi");
    ok(Number.isNaN(await itemCount(TA, sb.sale_id)), "A tenant'ı B satışının item_count'unu okuyamaz (route sayımı tenant filtreli)");

    const p3 = await mk(TA, "recreated", 10);
    const s3 = await sell(TA, "c3", [{ inventory_type: "oil", inventory_id: p3, quantity: 5 }]);
    await su.query(`delete from oil_inventory where id=$1`, [p3]);
    const p3b = await mk(TA, "recreated", 1); // aynı client_id ile YENİ ürün (yeni uuid)
    c = await cancel(TA, s3.sale_id);
    ok(c.restored === 0 && (await stockOf(p3b)) === 1, "aynı client_id ile yeniden oluşturulmuş ürüne stok EKLENMEDİ (yanlış ürüne iade yok)");
  } finally {
    await su.end().catch(() => {});
    if (rest) rest.kill();
    await epg.stop().catch(() => {});
    try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* yok */ }
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
