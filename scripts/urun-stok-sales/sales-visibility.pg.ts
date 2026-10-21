/**
 * Satış Geçmişi "Satışı İptal Et" / "Listeden Sil" — GERÇEK PostgreSQL + PostgREST testi.
 * Ephemeral yerel Postgres; sentetik veri; production'a SIFIR temas.
 *
 * Gerçek kodu çalıştırır: lib/urun-stok/salesVisibilityServer.applySalesVisibility (route çekirdeği),
 * iptal için mevcut inventory_sale_cancel_atomic RPC'si.
 *
 * Çalıştır: POSTGREST_BIN=<postgrest.exe> npx tsx scripts/urun-stok-sales/sales-visibility.pg.ts
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
import { applySalesVisibility } from "@/lib/urun-stok/salesVisibilityServer";
import { isMissingVisibilityColumn } from "@/lib/urun-stok/salesVisibility";

process.env.LC_ALL = "C";
process.env.LANG = "C";
const PORT = 54381;
const REST_PORT = 54383;
const PW = "testpw";
const JWT_SECRET = "sales-visibility-local-only-secret-0123456789abcdef";
const DATA_DIR = path.join(os.tmpdir(), "sales-visibility-pgdata");
const ROOT = process.cwd();
const MIG = "20271108000000_inventory_sales_list_visibility.sql";
const readMig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
const TA = "11111111-1111-1111-1111-111111111111";
const TB = "22222222-2222-2222-2222-222222222222";
const UA = "aaaaaaaa-0000-0000-0000-00000000000a";
const UB = "bbbbbbbb-0000-0000-0000-00000000000b";

let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const conn = () => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
function jwt(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ role, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`;
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
    await su.query(`create table public.dogaltas_inventory (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
      name text not null, type text not null default '', adet double precision not null default 0, unit_cost_try double precision not null default 0,
      total_cost_try double precision not null default 0, adet_price double precision not null default 0);`);
    for (const f of ["20260627140000_oil_inventory.sql", "20260627150000_soap_cream_inventory.sql",
      "20260627160000_accessory_inventory.sql", "20260627170000_other_inventory.sql", "20270123000000_inventory_sales.sql"]) {
      await su.query(readMig(f));
    }
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);
    const bin = process.env.POSTGREST_BIN;
    if (!bin || !existsSync(bin)) throw new Error("POSTGREST_BIN gerekli.");
    const conf = path.join(os.tmpdir(), "sales-visibility-postgrest.conf");
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

    const product = async (table: string, tenant: string, cid: string, stock: number) => {
      const col = table === "accessory_inventory" ? "stock_qty" : "stock_base";
      return (await su.query(`insert into ${table}(tenant_id, client_id, name, ${col}${col === "stock_qty" ? ", cost_per_unit, sale_per_unit" : ", cost_per_base, sale_per_base"})
        values ($1,$2,$2,$3,10,15) returning id`, [tenant, cid, stock])).rows[0].id as string;
    };
    const stock = async (table: string, id: string) =>
      Number((await su.query(`select ${table === "accessory_inventory" ? "stock_qty" : "stock_base"} s from ${table} where id=$1`, [id])).rows[0]?.s);
    const sell = async (tenant: string, key: string, lines: unknown[]) =>
      ((await su.query(`select public.inventory_sale_create_atomic($1,$2,$3,'central','',$4::jsonb) r`, [tenant, UA, key, JSON.stringify(lines)])).rows[0].r as { sale_id: string }).sale_id;
    const cancel = async (tenant: string, id: string) =>
      (await su.query(`select public.inventory_sale_cancel_atomic($1,$2,$3) r`, [tenant, id, UA])).rows[0].r as { already_cancelled: boolean; restored: number };
    const sale = async (id: string) => (await su.query(`select status, hidden_at, hidden_by, total_sale, total_cost, item_count from inventory_sales where id=$1`, [id])).rows[0];
    const itemsHash = async (id: string) => JSON.stringify((await su.query(`select id, inventory_id, quantity, line_sale_total, line_cost_total, product_name_snapshot from inventory_sale_items where sale_id=$1 order by id`, [id])).rows);
    const netRevenue = async (tenant: string) => Number((await su.query(`select coalesce(sum(total_sale),0) n from inventory_sales where tenant_id=$1 and status='completed'`, [tenant])).rows[0].n);

    // ═════ Migration öncesi (kod production'a migration'sız giderse) ═════
    console.log("\n[0] Migration UYGULANMAMIŞ: eski davranış korunur, 'Listeden Sil' güvenle reddedilir");
    const o0 = await product("oil_inventory", TA, "o0", 10);
    const s0 = await sell(TA, "k0", [{ inventory_type: "oil", inventory_id: o0, quantity: 1 }]);
    const sel = await db.from("inventory_sales").select("id, hidden_at").eq("tenant_id", TA);
    ok(sel.error && isMissingVisibilityColumn(sel.error), `hidden_at SELECT hatası tanınıyor (${(sel.error as { code?: string })?.code})`);
    const base = await db.from("inventory_sales").select("id, status").eq("tenant_id", TA);
    ok(!base.error && (base.data ?? []).length === 1, "kolon olmadan liste sorgusu (geri düşüş) çalışıyor");
    const pre = await applySalesVisibility(db, TA, UA, [s0], "hide");
    ok(!pre.ok && pre.unavailable && (await stock("oil_inventory", o0)) === 9 && (await su.query(`select status from inventory_sales where id=$1`, [s0])).rows[0].status === "completed",
      "migration yokken gizleme: unavailable (503), satış ve stok değişmedi");

    // ═════ Migration ═════
    console.log("\n[M] Migration taslağı (iki kez — idempotent)");
    await su.query(readMig(MIG));
    await su.query(readMig(MIG));
    const cols = (await su.query(`select column_name, is_nullable from information_schema.columns where table_name='inventory_sales' and column_name in ('hidden_at','hidden_by') order by 1`)).rows;
    ok(cols.length === 2 && cols.every((c) => c.is_nullable === "YES"), "hidden_at + hidden_by NULL olabilir kolonlar");
    ok(Number((await su.query(`select count(*) n from inventory_sales where hidden_at is not null`)).rows[0].n) === 0, "mevcut satışların hepsi görünür kaldı");
    let chk: string | null = null;
    try { await su.query(`update inventory_sales set hidden_at = now() where id=$1`, [s0]); } catch (e) { chk = (e as { code?: string }).code ?? null; }
    ok(chk === "23514", "tutarlılık kısıtı: hidden_at tek başına yazılamaz (hidden_by zorunlu)");
    ok((await su.query(`select has_table_privilege('anon','public.inventory_sales','SELECT') a, has_table_privilege('authenticated','public.inventory_sales','UPDATE') b`)).rows[0].a === false, "istemci rollerine yeni yetki açılmadı");
    // PostgREST şema önbelleği: yazma (UPDATE) yeni kolonu ancak önbellek yenilenince tanır.
    // O ana kadar uç 503 döndürür (yukarıdaki [0] ile aynı güvenli davranış). Yenilenmeyi bekle.
    let cacheReady = false;
    for (let i = 0; i < 60 && !cacheReady; i++) {
      const probe = await db.from("inventory_sales").update({ hidden_at: null, hidden_by: null })
        .eq("id", "00000000-0000-0000-0000-000000000000").select("id");
      cacheReady = !probe.error;
      if (!cacheReady) { await su.query(`NOTIFY pgrst, 'reload schema'`); await sleep(500); }
    }
    ok(cacheReady, "PostgREST şema önbelleği yenilendi (yeni kolon yazılabilir)");

    // ═════ Senaryolar ═════
    console.log("\n[1–5] İptal ve listeden silme bağımsız");
    const o1 = await product("oil_inventory", TA, "o1", 10);
    const s1 = await sell(TA, "k1", [{ inventory_type: "oil", inventory_id: o1, quantity: 4 }]);
    let c = await cancel(TA, s1);
    ok(c.restored === 1 && (await stock("oil_inventory", o1)) === 10 && (await sale(s1)).status === "cancelled", "1) aktif satış iptal → stok 6 → 10");
    const o2 = await product("oil_inventory", TA, "o2", 10);
    const s2 = await sell(TA, "k2", [{ inventory_type: "oil", inventory_id: o2, quantity: 3 }]);
    const h2 = await itemsHash(s2);
    const rev0 = await netRevenue(TA);
    let r = await applySalesVisibility(db, TA, UA, [s2], "hide");
    const sv2 = await sale(s2);
    ok(r.ok && r.changed === 1 && (await stock("oil_inventory", o2)) === 7 && sv2.status === "completed" && sv2.hidden_at && sv2.hidden_by === UA,
      "2) aktif satış listeden silindi → stok 7 DEĞİŞMEDİ, durum completed, hidden_by kaydedildi");
    ok((await itemsHash(s2)) === h2 && (await netRevenue(TA)) === rev0, "2) satır snapshot'ları ve net ciro DEĞİŞMEDİ (gizli satış finansal toplamda kalır)");
    r = await applySalesVisibility(db, TA, UA, [s1], "hide");
    ok(r.ok && r.changed === 1 && (await stock("oil_inventory", o1)) === 10 && (await sale(s1)).status === "cancelled", "3) iptal edilmiş satış listeden silindi → stok ikinci kez ARTMADI (10)");
    c = await cancel(TA, s1);
    ok(c.already_cancelled && c.restored === 0 && (await stock("oil_inventory", o1)) === 10, "4) iptal edilmiş satış yeniden iptal → already_cancelled, stok 10");
    const o5 = await product("oil_inventory", TA, "o5", 10);
    const s5 = await sell(TA, "k5", [{ inventory_type: "oil", inventory_id: o5, quantity: 2 }]);
    await su.query(`delete from oil_inventory where id=$1`, [o5]);
    const o5b = await product("oil_inventory", TA, "o5", 1); // aynı client_id ile yeni ürün
    c = await cancel(TA, s5);
    ok(c.restored === 0 && (await stock("oil_inventory", o5b)) === 1 && Number((await su.query(`select count(*) n from oil_inventory where client_id='o5'`)).rows[0].n) === 1,
      "5) silinmiş ürüne iade yok; yeni ürün oluşmadı; aynı client_id'li yeni ürüne stok eklenmedi");

    console.log("\n[6–9] Kalıcılık, cihazlar arası, geri alma");
    const other = new PostgrestClient(`http://127.0.0.1:${REST_PORT}`, { headers: { Authorization: `Bearer ${jwt("service_role")}` } });
    const seen = await other.from("inventory_sales").select("id, hidden_at").eq("tenant_id", TA).eq("id", s2).single();
    ok(!seen.error && (seen.data as { hidden_at: string | null }).hidden_at, "6/7) gizleme sunucuda: başka bağlantı (cihaz) da gizli görüyor; yenilemede geri gelmez");
    const firstHidden = (await sale(s2)).hidden_at;
    r = await applySalesVisibility(db, TA, UA, [s2], "hide");
    ok(r.ok && r.changed === 0 && r.unchanged === 1 && String((await sale(s2)).hidden_at) === String(firstHidden), "14) aynı istek tekrar → değişiklik yok, ilk gizleme anı korundu");
    r = await applySalesVisibility(db, TA, UA, [s2], "unhide");
    const sv2b = await sale(s2);
    ok(r.ok && r.changed === 1 && sv2b.hidden_at === null && sv2b.hidden_by === null && (await stock("oil_inventory", o2)) === 7 && sv2b.status === "completed",
      "8/9) listeye geri alındı → stok 7 DEĞİŞMEDİ, durum completed");

    console.log("\n[10–11] Finans");
    const fin = (await su.query(`select
      coalesce(sum(total_sale) filter (where status='completed'),0) net, coalesce(sum(total_sale),0) brut,
      coalesce(sum(total_sale) filter (where status='completed' and hidden_at is not null),0) gizli_net
      from inventory_sales where tenant_id=$1`, [TA])).rows[0];
    await applySalesVisibility(db, TA, UA, [s2], "hide");
    const fin2 = Number((await su.query(`select coalesce(sum(total_sale) filter (where status='completed'),0) n from inventory_sales where tenant_id=$1`, [TA])).rows[0].n);
    ok(Number(fin.net) < Number(fin.brut) && fin2 === Number(fin.net), `11) net ciro (${fin.net}) iptalleri içermiyor (brüt ${fin.brut}); 10) gizleme net ciroyu değiştirmedi (${fin2})`);

    console.log("\n[12–15] Tenant, toplu, eşzamanlı, çok kategorili");
    const ob = await product("oil_inventory", TB, "ob", 10);
    const sb = await sell(TB, "kb", [{ inventory_type: "oil", inventory_id: ob, quantity: 1 }]);
    r = await applySalesVisibility(db, TA, UA, [sb], "hide");
    ok(r.ok && r.changed === 0 && r.notFound === 1 && (await sale(sb)).hidden_at === null, "12) A, B'nin satışını gizleyemez (bulunamadı); B değişmedi");
    const many: string[] = [];
    const ob2 = await product("oil_inventory", TA, "bulk", 1000);
    for (let i = 0; i < 150; i++) many.push(await sell(TA, `bulk${i}`, [{ inventory_type: "oil", inventory_id: ob2, quantity: 1 }]));
    const stBulk = await stock("oil_inventory", ob2);
    r = await applySalesVisibility(db, TA, UA, [...many, sb, "33333333-3333-3333-3333-333333333333"], "hide");
    ok(r.ok && r.changed === 150 && r.notFound === 2 && (await stock("oil_inventory", ob2)) === stBulk, "13) 152 kimlikli toplu işlem: 150 gizlendi, 2 bulunamadı, stok değişmedi");
    const target = many[0];
    await applySalesVisibility(db, TA, UA, [target], "unhide");
    const [x1, x2] = await Promise.all([applySalesVisibility(db, TA, UA, [target], "hide"), applySalesVisibility(db, TA, UB, [target], "hide")]);
    ok(x1.ok && x2.ok && x1.changed + x2.changed === 1, "14) iki eşzamanlı gizleme isteği → tek değişiklik");
    const om = await product("oil_inventory", TA, "multi_oil", 10);
    const sm = await product("soap_cream_inventory", TA, "multi_soap", 10);
    const am = await product("accessory_inventory", TA, "multi_acc", 10);
    const multi = await sell(TA, "kmulti", [
      { inventory_type: "oil", inventory_id: om, quantity: 2 },
      { inventory_type: "soap_cream", inventory_id: sm, quantity: 3 },
      { inventory_type: "accessory", inventory_id: am, quantity: 1 },
    ]);
    const mh = await itemsHash(multi);
    r = await applySalesVisibility(db, TA, UA, [multi], "hide");
    ok(r.ok && r.changed === 1 && (await sale(multi)).item_count === 3 && (await itemsHash(multi)) === mh, "15) çok kategorili satış bütün olarak gizlendi; 3 kalem aynen duruyor");
    c = await cancel(TA, multi);
    ok(c.restored === 3 && (await stock("oil_inventory", om)) === 10 && (await stock("soap_cream_inventory", sm)) === 10 && (await stock("accessory_inventory", am)) === 10,
      "15) aynı satışın iptali TÜM kategorilere iade etti (kısmi iptal yok)");
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
