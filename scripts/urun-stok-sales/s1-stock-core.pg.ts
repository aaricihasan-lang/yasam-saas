/**
 * AŞAMA 2 / S1 — Stok çekirdeği GERÇEK PostgreSQL + PostgREST entegrasyon testi.
 *
 * Ephemeral yerel Postgres (embedded-postgres) + yerel PostgREST; production'a SIFIR temas, sentetik veri.
 * Şema: repo envanter migration'ları + 20270123000000_inventory_sales.sql (gerçek RPC'ler).
 * Sunucu yolu: GERÇEK applyGuardedInventoryPatch (route'ların kullandığı) PostgREST üzerinden çalışır.
 *
 *   STK-01 : eski koşulsuz yazımın satışı ezdiğinin kanıtı; karşılaştır-ve-yaz; RPC satır kilidi
 *            altında gerçek eşzamanlılık; 20 paralel yazımdan tek kazanan; 4 tablo; tenant izolasyonu.
 *   STK-02 : rastgele fiyat matrisi — ekran (saleLinePrice) == RPC'nin kaydettiği tutar; eski gönderim
 *            (markup 0) ile uyuşmazlığın kanıtı.
 *   STK-03 : aynı anahtar → tek satış; eski davranış (her denemede yeni anahtar) → çift satış kanıtı.
 *   BUG-019: hızlı satış satırı (markup yok) RPC ile kaydedilir, satış geçmişinde görünür.
 *
 * Çalıştır: POSTGREST_BIN=<postgrest.exe yolu> npx tsx scripts/urun-stok-sales/s1-stock-core.pg.ts
 * POSTGREST_BIN yoksa PostgREST gerektiren bölümler ATLANDI olarak raporlanır (PASS sayılmaz).
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { applyGuardedInventoryPatch } from "@/lib/urun-stok/guardedStockPatch";
import { saleLinePrice } from "@/lib/urun-stok/salePricing";

process.env.LC_ALL = "C";
process.env.LANG = "C";

const PORT = 54361;
const REST_PORT = 54362;
const PW = "testpw";
const JWT_SECRET = "s1-stock-core-local-only-secret-0123456789abcdef";
const DATA_DIR = path.join(os.tmpdir(), "s1-stock-core-pgdata");
const ROOT = process.cwd();
const readMig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");

const TA = "11111111-1111-1111-1111-111111111111";
const TB = "22222222-2222-2222-2222-222222222222";
const U1 = "aaaaaaaa-0000-0000-0000-000000000001";

let pass = 0;
let fail = 0;
let skipped = 0;
const ok = (c: unknown, l: string) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); }
};
const conn = () => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function jwt(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role, exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

async function addOil(c: pg.Client, tenant: string, stock: number, cost: number, sale: number) {
  return (await c.query(
    `insert into oil_inventory(tenant_id, client_id, name, stock_base, cost_per_base, sale_per_base, profit_pct)
     values ($1,$2,$3,$4,$5,$6,0) returning id`,
    [tenant, "oil_" + randomUUID(), "Ürün " + Math.random().toString(36).slice(2, 7), stock, cost, sale])).rows[0].id as string;
}
const stockOf = async (c: pg.Client, table: string, col: string, id: string) =>
  Number((await c.query(`select ${col} from ${table} where id=$1`, [id])).rows[0][col]);
const callCreate = (c: pg.Client, key: string, lines: unknown[], tenant = TA) =>
  c.query(`select public.inventory_sale_create_atomic($1,$2,$3,'test','',$4::jsonb) r`, [tenant, U1, key, JSON.stringify(lines)]);

async function guarded(db: SupabaseClient, table: string, col: string, tenant: string, id: string, body: Record<string, unknown>) {
  const fields = { ...body, updated_at: new Date().toISOString() };
  const r = await applyGuardedInventoryPatch({ db, table, stockColumn: col, tenantId: tenant, id, fields, body });
  if (r.ok) return { status: 200, json: { ok: true } as Record<string, unknown> };
  return { status: r.response.status, json: (await r.response.json()) as Record<string, unknown> };
}

async function waitRest(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${REST_PORT}/`, { headers: { Authorization: `Bearer ${jwt("service_role")}` } });
      if (r.status < 500) return true;
    } catch { /* henüz açılmadı */ }
    await sleep(250);
  }
  return false;
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
                    create role authenticator login noinherit password 'auth-local';
                    grant anon, authenticated, service_role to authenticator;
                    grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(DOGALTAS_DDL);
    for (const f of ["20260627140000_oil_inventory.sql", "20260627150000_soap_cream_inventory.sql",
      "20260627160000_accessory_inventory.sql", "20260627170000_other_inventory.sql", "20270123000000_inventory_sales.sql"]) {
      await su.query(readMig(f));
    }
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);
    console.log("embedded-postgres + şema hazır.");

    // ── PostgREST ──
    const bin = process.env.POSTGREST_BIN;
    let db: SupabaseClient | null = null;
    if (bin && existsSync(bin)) {
      const conf = path.join(os.tmpdir(), "s1-stock-core-postgrest.conf");
      writeFileSync(conf, [
        `db-uri = "postgres://authenticator:auth-local@127.0.0.1:${PORT}/postgres"`,
        `db-schemas = "public"`, `db-anon-role = "anon"`, `db-max-rows = 1000`, `db-pool = 25`,
        `jwt-secret = "${JWT_SECRET}"`, `server-host = "127.0.0.1"`, `server-port = ${REST_PORT}`, `log-level = "error"`,
      ].join("\n"));
      rest = spawn(bin, [conf], { cwd: path.dirname(bin), stdio: "ignore" });
      if (await waitRest()) {
        db = new PostgrestClient(`http://127.0.0.1:${REST_PORT}`, {
          headers: { Authorization: `Bearer ${jwt("service_role")}` },
        }) as unknown as SupabaseClient;
        console.log("PostgREST hazır.\n");
      } else console.error("PostgREST açılamadı.");
    }

    if (!db) {
      skipped++;
      console.log("\n[ATLANDI] PostgREST yok → STK-01 sunucu yolu testleri çalışmadı (PASS sayılmaz).");
    } else {
      // ═════ STK-01 ═════
      console.log("[STK-01-1] ESKİ davranışın kanıtı: koşulsuz mutlak yazım araya giren satışı ezer");
      const a = await addOil(su, TA, 100, 10, 15);
      await callCreate(su, "old-1", [{ inventory_type: "oil", inventory_id: a, quantity: 5 }]); // 100 → 95
      await db.from("oil_inventory").update({ stock_base: 110 }).eq("id", a).eq("tenant_id", TA); // eski PATCH: 100 + 10
      const lost = await stockOf(su, "oil_inventory", "stock_base", a);
      ok(lost === 110, `eski yol: stok 110 (doğrusu 105) → satış EZİLDİ (hata yeniden üretildi; gerçek: ${lost})`);

      console.log("\n[STK-01-2] YENİ: bayat beklenen değer → 409, hiçbir alan yazılmaz; güncel değer → yazılır");
      const b = await addOil(su, TA, 100, 10, 15);
      await callCreate(su, "new-1", [{ inventory_type: "oil", inventory_id: b, quantity: 5 }]); // 100 → 95
      let r = await guarded(db, "oil_inventory", "stock_base", TA, b, { stock_base: 110, expected_stock: 100, name: "YENİ AD" });
      ok(r.status === 409 && r.json.code === "stock_conflict" && r.json.current_stock === 95, `409 stock_conflict, current_stock=95 (gerçek: ${r.status} ${r.json.current_stock})`);
      const afterConflict = (await su.query(`select stock_base, name from oil_inventory where id=$1`, [b])).rows[0];
      ok(Number(afterConflict.stock_base) === 95 && afterConflict.name !== "YENİ AD", "stok 95 korundu, ad da yazılmadı");
      r = await guarded(db, "oil_inventory", "stock_base", TA, b, { stock_base: 105, expected_stock: 95 });
      ok(r.status === 200 && (await stockOf(su, "oil_inventory", "stock_base", b)) === 105, "güncel beklenen (95) ile 105 yazıldı");
      r = await guarded(db, "oil_inventory", "stock_base", TA, b, { stock_base: 1 });
      ok(r.status === 428 && (await stockOf(su, "oil_inventory", "stock_base", b)) === 105, "expected_stock yok → 428, yazılmadı");
      r = await guarded(db, "oil_inventory", "stock_base", TA, b, { name: "SADECE AD" });
      ok(r.status === 200 && (await stockOf(su, "oil_inventory", "stock_base", b)) === 105, "stoksuz düzenleme stoğa dokunmadı");
      const frac = await addOil(su, TA, 0.1 + 0.2, 10, 15); // 0.30000000000000004 — double eşitliği kayıpsız mı?
      const fracRead = (await db.from("oil_inventory").select("stock_base").eq("id", frac).single()).data as { stock_base: number };
      r = await guarded(db, "oil_inventory", "stock_base", TA, frac, { stock_base: 5, expected_stock: fracRead.stock_base });
      ok(r.status === 200, `kesirli stok (${fracRead.stock_base}) okunup aynen gönderilince eşleşiyor`);

      console.log("\n[STK-01-3] GERÇEK EŞZAMANLILIK: satış RPC'si satırı kilitliyken gelen yazım beklenir, sonra 409");
      const cId = await addOil(su, TA, 100, 10, 15);
      const tx = conn();
      await tx.connect();
      await tx.query("begin");
      await tx.query(`select public.inventory_sale_create_atomic($1,$2,'lock-1','test','',$3::jsonb)`,
        [TA, U1, JSON.stringify([{ inventory_type: "oil", inventory_id: cId, quantity: 7 }])]); // FOR UPDATE + 100→93 (commit edilmedi)
      let settled = false;
      const pending = guarded(db, "oil_inventory", "stock_base", TA, cId, { stock_base: 110, expected_stock: 100 }).then((x) => { settled = true; return x; });
      await sleep(700);
      ok(!settled, "yazım satır kilidinde BEKLİYOR (satış işlemi sürerken)");
      await tx.query("commit");
      await tx.end();
      const late = await pending;
      ok(late.status === 409 && (await stockOf(su, "oil_inventory", "stock_base", cId)) === 93, `kilit bırakılınca 409; stok 93 (satış korundu) (gerçek: ${late.status})`);

      const dId = await addOil(su, TA, 100, 10, 15);
      const tx2 = conn();
      await tx2.connect();
      await tx2.query("begin");
      await tx2.query(`select public.inventory_sale_create_atomic($1,$2,'lock-2','test','',$3::jsonb)`,
        [TA, U1, JSON.stringify([{ inventory_type: "oil", inventory_id: dId, quantity: 7 }])]);
      const pending2 = guarded(db, "oil_inventory", "stock_base", TA, dId, { stock_base: 110, expected_stock: 100 });
      await sleep(400);
      await tx2.query("rollback");
      await tx2.end();
      const r2 = await pending2;
      ok(r2.status === 200 && (await stockOf(su, "oil_inventory", "stock_base", dId)) === 110, "satış geri alınırsa (rollback) yazım başarılı: 110");

      console.log("\n[STK-01-4] 20 paralel '+ Ekle' aynı beklenen değerle → yalnız 1 kazanır");
      const eId = await addOil(su, TA, 50, 10, 15);
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
        guarded(db!, "oil_inventory", "stock_base", TA, eId, { stock_base: 50 + i + 1, expected_stock: 50 })));
      const wins = results.filter((x) => x.status === 200).length;
      const conflicts = results.filter((x) => x.status === 409).length;
      ok(wins === 1 && conflicts === 19, `1 başarı + 19 çakışma (gerçek: ${wins}/${conflicts})`);

      console.log("\n[STK-01-5] Dört envanter tablosu (stock_base / stock_qty)");
      const soap = (await su.query(`insert into soap_cream_inventory(tenant_id, client_id, name, stock_base) values ($1,'sc1','SABUN',10) returning id`, [TA])).rows[0].id;
      const acc = (await su.query(`insert into accessory_inventory(tenant_id, client_id, name, stock_qty) values ($1,'ac1','TESPİH',10) returning id`, [TA])).rows[0].id;
      const oth = (await su.query(`insert into other_inventory(tenant_id, client_id, name, stock_base) values ($1,'ot1','DİĞER',10) returning id`, [TA])).rows[0].id;
      for (const [t, col, id] of [["soap_cream_inventory", "stock_base", soap], ["accessory_inventory", "stock_qty", acc], ["other_inventory", "stock_base", oth]] as const) {
        const bad = await guarded(db, t, col, TA, id, { [col]: 20, expected_stock: 9 });
        const good = await guarded(db, t, col, TA, id, { [col]: 20, expected_stock: 10 });
        ok(bad.status === 409 && good.status === 200 && (await stockOf(su, t, col, id)) === 20, `${t}: bayat → 409, güncel → 20`);
      }

      console.log("\n[STK-01-6] Tenant izolasyonu");
      const fId = await addOil(su, TA, 42, 10, 15);
      const cross = await guarded(db, "oil_inventory", "stock_base", TB, fId, { stock_base: 1, expected_stock: 42 });
      ok(cross.status === 404 && (await stockOf(su, "oil_inventory", "stock_base", fId)) === 42, "B tenant'ı A kaydına yazamaz (404)");
      const crossStale = await guarded(db, "oil_inventory", "stock_base", TB, fId, { stock_base: 1, expected_stock: 0 });
      ok(crossStale.status === 404 && crossStale.json.current_stock === undefined, "çakışma yanıtı başka tenant'ın stoğunu SIZDIRMAZ");
    }

    // ═════ STK-02 ═════
    console.log("\n[STK-02] Rastgele fiyat matrisi: ekrandaki tutar == RPC'nin kaydettiği tutar");
    let seed = 20261021;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    let newMismatch = 0;
    let oldMismatch = 0;
    let cases = 0;
    const pctKinds = ["empty", "zero", "positive"] as const;
    for (let i = 0; i < 360; i++) {
      const cost = Math.round(rnd() * 50000) / 100 || 0.01;            // 0,01 – 500 TL
      const sale = rnd() < 0.5 ? 0 : Math.round(rnd() * 90000) / 100;   // satış fiyatı yok / var
      const kind = pctKinds[i % 3];
      const pct = kind === "positive" ? Math.round(rnd() * 30000) / 100 : kind === "zero" ? 0 : null;
      const qty = rnd() < 0.5 ? Math.max(1, Math.round(rnd() * 20)) : Math.round(rnd() * 100000) / 100 || 1;
      const id = await addOil(su, TA, 1e7, cost, sale);
      const ui = saleLinePrice({ unitCost: cost, defaultUnitSale: sale, quantity: qty, markupPct: pct });
      const line: Record<string, unknown> = { inventory_type: "oil", inventory_id: id, quantity: qty };
      if (ui.markupToSend != null) line.markup_pct = ui.markupToSend;
      const res = (await callCreate(su, "m-" + i, [line])).rows[0].r as { items: { line_sale_total: string; line_cost_total: string }[] };
      const it = res.items[0];
      cases++;
      if (Number(it.line_sale_total) !== ui.lineSale || Number(it.line_cost_total) !== ui.lineCost) {
        newMismatch++;
        if (newMismatch <= 5) console.error(`    uyuşmazlık: cost=${cost} sale=${sale} pct=${pct} qty=${qty} ekran=${ui.lineSale}/${ui.lineCost} db=${it.line_sale_total}/${it.line_cost_total}`);
      }
      // ESKİ istemci: ekranda pct>0 ? maliyet×(1+pct) : satış fiyatı×miktar gösterip markup_pct=pct (0 dahil) gönderiyordu.
      const effPct = pct ?? 0;
      const oldShown = effPct > 0 ? cost * qty * (1 + effPct / 100) : sale * qty;
      const oldLine: Record<string, unknown> = { inventory_type: "oil", inventory_id: id, quantity: qty, markup_pct: effPct };
      const oldRes = (await callCreate(su, "o-" + i, [oldLine])).rows[0].r as { items: { line_sale_total: string }[] };
      if (Math.abs(Number(oldRes.items[0].line_sale_total) - oldShown) > 0.011) oldMismatch++;
    }
    ok(oldMismatch > 0, `ESKİ gönderim: ${oldMismatch}/${cases} satırda kayıt ≠ ekran (hata yeniden üretildi)`);
    ok(newMismatch === 0, `YENİ: ${cases} satırın tamamında kayıt == ekran (kuruş düzeyinde; uyuşmazlık ${newMismatch})`);

    // ═════ STK-03 ═════
    console.log("\n[STK-03] İdempotency");
    const g1 = await addOil(su, TA, 100, 10, 15);
    const lines = [{ inventory_type: "oil", inventory_id: g1, quantity: 3 }];
    await callCreate(su, "old-k1", lines);
    await callCreate(su, "old-k2", lines); // eski: ağ hatası sonrası tekrar → yeni anahtar
    ok((await stockOf(su, "oil_inventory", "stock_base", g1)) === 94, "ESKİ davranış: aynı sepet iki kez satıldı (100 → 94) (hata yeniden üretildi)");
    const g2 = await addOil(su, TA, 100, 10, 15);
    const l2 = [{ inventory_type: "oil", inventory_id: g2, quantity: 3 }];
    const first = (await callCreate(su, "same-key", l2)).rows[0].r as { duplicate: boolean };
    const second = (await callCreate(su, "same-key", l2)).rows[0].r as { duplicate: boolean };
    const cnt = Number((await su.query(`select count(*) n from inventory_sales where idempotency_key='same-key'`)).rows[0].n);
    ok(!first.duplicate && second.duplicate && cnt === 1 && (await stockOf(su, "oil_inventory", "stock_base", g2)) === 97,
      "YENİ: aynı anahtar → ikinci istek duplicate, tek satış, stok 97");
    await callCreate(su, "other-key", l2);
    ok((await stockOf(su, "oil_inventory", "stock_base", g2)) === 94, "yeni bilinçli satış (yeni anahtar) ayrı işlem: 94");

    // ═════ BUG-019 ═════
    console.log("\n[BUG-019] Hızlı satış satırı (markup yok) satış geçmişine yazılır");
    const h = await addOil(su, TA, 100, 10, 15);
    const qr = (await callCreate(su, "quick-1", [{ inventory_type: "oil", inventory_id: h, quantity: 4 }])).rows[0].r as { sale: { total_sale: string; status: string } };
    const hist = (await su.query(`select s.status, i.line_sale_total from inventory_sales s join inventory_sale_items i on i.sale_id=s.id where s.idempotency_key='quick-1' and s.tenant_id=$1`, [TA])).rows;
    ok(hist.length === 1 && hist[0].status === "completed" && Number(hist[0].line_sale_total) === 60 && Number(qr.sale.total_sale) === 60,
      "satış kaydı + satır (4 × 15 = 60) geçmişte; stok düşümü aynı işlemde");
  } finally {
    await su.end().catch(() => {});
    if (rest) rest.kill();
    await epg.stop().catch(() => {});
    try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* yok */ }
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL${skipped ? ` / ${skipped} bölüm ATLANDI` : ""}`);
  process.exit(fail || skipped ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
