/**
 * STK-01-DT — Doğaltaş stoğu (dogaltas_inventory.adet) kayıp güncelleme düzeltmesi.
 * GERÇEK route (/api/dogaltas/inventory) + GERÇEK istemci kütüphanesi (dogaltasInventoryDb / liveStockLogic)
 * + GERÇEK Postgres (embedded, 127.0.0.1). PROD'A SIFIR TEMAS; ZZ_* sentetik veri.
 *
 * R) Route sözleşmesi (atomik karşılaştır-ve-yaz; Ürün&Stok'un diğer kategorileriyle aynı yardımcı):
 *   R1 stok eklenirken satış → 409, satış korunur; tazeleme sonrası 12 (doğru)
 *   R2 iki cihaz aynı anda stok girişi → TAM biri 200, diğeri 409 (ezilme yok)
 *   R3 stok azalırken ikinci işlem (iki eşzamanlı düşüş) → TAM biri geçer
 *   R4 fiyat değişikliği (stok yazmayan) beklenen değer olmadan çalışır
 *   R5 başka tenant → 404, veri değişmez · R6 beklenen değer yok (eski arayüz) → 428, veri değişmez
 * C) İstemci kütüphanesi → gerçek route (ekranın kullandığı fonksiyonlar):
 *   C1 ekran stok ekleme: bayat taban → conflict, DB değişmez; taze taban → 12
 *   C2 iki cihaz +5 / +2 (taban 10) → biri conflict; tazeleyip yeniden deneyen → 17 (kayıp yok)
 *   C3 ekranda olmayan kaydı başka cihaz oluşturmuş (taban 0, DB 4) → conflict, EZME YOK
 *   C4 yeni kayıt oluşturma etkilenmez · C5 Canlı Stok "+ Ekle" eşzamanlı → biri conflict, kayıp yok
 *   C6 JSON içe aktarma sırasında stok değişti → açık hata, o kayıt ezilmez
 * Çalıştır: npx tsx scripts/stk01-dogaltas-cas/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, seedStonesUser, startWt9TestEnv, type Wt9User } from "../wt9/wt9TestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("stk01-dogaltas-cas/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 300)), done: () => H0.done() };
const DDL = `
create table public.dogaltas_inventory (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text not null, type text not null default '',
  adet double precision not null default 0, dizi_icerik double precision not null default 0, dizi_price double precision not null default 0,
  adet_price double precision not null default 0, dizi_price_usd double precision not null default 0, dizi_price_eur double precision not null default 0,
  photos jsonb not null default '[]'::jsonb, usd_rate double precision not null default 0, eur_rate double precision not null default 0,
  total_cost_try double precision not null default 0, unit_cost_try double precision not null default 0,
  created_at timestamptz default now(), updated_at timestamptz default now());
grant select, insert, update, delete on public.dogaltas_inventory to service_role;`;

/** Tarayıcı ortamı taklidi: istemci kütüphanesi oturumu localStorage'dan okur, göreli /api/* çağırır. */
function installBrowserShim(user: Wt9User, routeMod: Record<string, (req: NextRequest) => Promise<Response>>) {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() };
  g.window = globalThis;
  g.document = { documentElement: { getAttribute: () => null }, cookie: "" };
  store.set("yasam_user", JSON.stringify({ id: user.id, email: "zz@example.test", role: "expert", tenant_id: user.tenant, module_permissions: { stones: true, stok: true }, approval_status: "approved", active: true }));
  store.set("yasam_session_token", user.token);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("/api/dogaltas/inventory")) {
      const method = (init?.method ?? "GET").toUpperCase();
      return routeMod[method]!(new NextRequest(`http://localhost${url}`, { method, headers: init?.headers, body: init?.body as BodyInit | undefined }));
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

(async () => {
  const env = await startWt9TestEnv({ port: 54655, dirName: "stk01-dogaltas-cas-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(DDL);
    const A = await seedStonesUser(su, "STKA");
    const X = await seedStonesUser(su, "STKX");
    await su.query(`update users set module_permissions = '{"stones":true,"stok":true}'::jsonb where id = any($1::uuid[])`, [[A.id, X.id]]);
    const route = await import("../../app/api/dogaltas/inventory/route");
    const patch = (u: Wt9User, body: Record<string, unknown>) => route.PATCH(new NextRequest("http://localhost/api/dogaltas/inventory", {
      method: "PATCH", headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: JSON.stringify(body),
    }));
    const mk = async (tenant: string, adet: number, name = "ZZ Ametist", type = "8 MM") =>
      (await su.query(`insert into dogaltas_inventory(tenant_id, name, type, adet, adet_price) values ($1,$2,$3,$4,10) returning id`, [tenant, name, type, adet])).rows[0].id as string;
    const adetOf = async (id: string) => Number((await su.query(`select adet from dogaltas_inventory where id=$1`, [id])).rows[0].adet);
    const sale = (id: string, qty: number) => su.query(`update dogaltas_inventory set adet = adet - $2 where id=$1`, [id, qty]); // satış RPC'siyle aynı atomik delta

    // ── R1 ──
    const r1 = await mk(A.tenant, 10, "ZZ R1");
    await sale(r1, 3);
    let r = await patch(A, { id: r1, adet: 15, expected_stock: 10 });
    const j1 = (await r.json()) as { code?: string; current_stock?: number };
    H.ok(r.status === 409 && j1.code === "stock_conflict" && j1.current_stock === 7 && (await adetOf(r1)) === 7, "R1: stok eklenirken satış → 409 + güncel stok 7; satış KORUNDU", { status: r.status, j1 });
    r = await patch(A, { id: r1, adet: 12, expected_stock: 7 });
    H.ok(r.status === 200 && (await adetOf(r1)) === 12, "R1b: tazeleme sonrası yeniden deneme → 12 (doğru sonuç)");
    // ── R2 ──
    const r2 = await mk(A.tenant, 10, "ZZ R2");
    const [a2, b2] = await Promise.all([patch(A, { id: r2, adet: 15, expected_stock: 10 }), patch(A, { id: r2, adet: 12, expected_stock: 10 })]);
    const f2 = await adetOf(r2);
    H.ok(JSON.stringify([a2.status, b2.status].sort()) === "[200,409]" && (f2 === 15 || f2 === 12), `R2: iki cihaz aynı anda → tam biri 200, diğeri 409 (son ${f2})`, [a2.status, b2.status]);
    // ── R3 ──
    const r3 = await mk(A.tenant, 10, "ZZ R3");
    const [a3, b3] = await Promise.all([patch(A, { id: r3, adet: 7, expected_stock: 10 }), patch(A, { id: r3, adet: 6, expected_stock: 10 })]);
    const f3 = await adetOf(r3);
    H.ok(JSON.stringify([a3.status, b3.status].sort()) === "[200,409]" && (f3 === 7 || f3 === 6), `R3: stok azalırken ikinci işlem → tam biri geçer (son ${f3})`, [a3.status, b3.status]);
    // ── R4 ──
    r = await patch(A, { id: r3, adet_price: 11 });
    H.ok(r.status === 200 && Number((await su.query(`select adet_price from dogaltas_inventory where id=$1`, [r3])).rows[0].adet_price) === 11 && (await adetOf(r3)) === f3, "R4: fiyat değişikliği beklenen stok olmadan çalışır, stok değişmez");
    // ── R5 ──
    const xRow = await mk(X.tenant, 4, "ZZ X");
    r = await patch(A, { id: xRow, adet: 99, expected_stock: 4 });
    H.ok(r.status === 404 && (await adetOf(xRow)) === 4, "R5: başka uzmanın stok satırı güncellenemez (404), veri aynı", r.status);
    r = await patch(A, { id: xRow, adet_price: 1 });
    H.ok(r.status === 404, "R5b: başka uzmanın satırında fiyat da değiştirilemez (404)", r.status);
    // ── R6 ──
    r = await patch(A, { id: r1, adet: 50 });
    const j6 = (await r.json()) as { code?: string; error?: string };
    H.ok(r.status === 428 && j6.code === "stock_expected_required" && /yenileyip/.test(String(j6.error)) && (await adetOf(r1)) === 12, "R6: eski arayüz (beklenen stok yok) → 428 + 'sayfayı yenileyin', veri DEĞİŞMEZ", { status: r.status, j6 });

    // ── C) istemci kütüphanesi → gerçek route ──
    installBrowserShim(A, route as unknown as Record<string, (req: NextRequest) => Promise<Response>>);
    const lib = await import("../../lib/urun-stok/dogaltasInventoryDb");
    const live = await import("../../lib/urun-stok/liveStockLogic");
    const item = (name: string, type: string, adet: number) => ({ name, type, adet, dizi_icerik: 0, dizi_price: 0, adet_price: 10, dizi_price_usd: 0, dizi_price_eur: 0, photos: [], usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 0 });

    const c1 = await mk(A.tenant, 10, "ZZ C1");
    await sale(c1, 3);
    let u = await lib.upsertDogaltasInventoryItem(A.tenant, item("ZZ C1", "8 MM", 15) as never, 10);
    H.ok(!u.ok && u.conflict === true && (await adetOf(c1)) === 7, "C1: ekran bayat tabanla (10) yazar → conflict, satış korunur (7)", u);
    u = await lib.upsertDogaltasInventoryItem(A.tenant, item("ZZ C1", "8 MM", 12) as never, 7);
    H.ok(u.ok && !u.created && (await adetOf(c1)) === 12, "C1b: tazelenmiş tabanla → 12", u);

    const c2 = await mk(A.tenant, 10, "ZZ C2");
    const [u1, u2] = await Promise.all([
      lib.upsertDogaltasInventoryItem(A.tenant, item("ZZ C2", "8 MM", 15) as never, 10),
      lib.upsertDogaltasInventoryItem(A.tenant, item("ZZ C2", "8 MM", 12) as never, 10),
    ]);
    const loser = !u1.ok ? { add: 5 } : { add: 2 };
    H.ok([u1, u2].filter((x) => x.ok).length === 1 && [u1, u2].filter((x) => x.conflict).length === 1, "C2: iki cihaz +5 / +2 → biri yazar, diğeri conflict (sessiz ezilme yok)", [u1, u2]);
    const fresh2 = await adetOf(c2);
    u = await lib.upsertDogaltasInventoryItem(A.tenant, item("ZZ C2", "8 MM", fresh2 + loser.add) as never, fresh2);
    H.ok(u.ok && (await adetOf(c2)) === 17, "C2b: çakışan cihaz tazeleyip yeniden kaydeder → 17 (iki giriş de korundu)", await adetOf(c2));

    const c3 = await mk(A.tenant, 4, "ZZ C3");
    u = await lib.upsertDogaltasInventoryItem(A.tenant, item("ZZ C3", "8 MM", 6) as never, 0);
    H.ok(!u.ok && u.conflict === true && (await adetOf(c3)) === 4, "C3: ekranda olmayan kaydı başka cihaz oluşturmuş (taban 0, DB 4) → conflict, EZME YOK", u);

    u = await lib.upsertDogaltasInventoryItem(A.tenant, item("ZZ C4 YENİ", "8 MM", 9) as never, 0);
    const c4 = (await su.query(`select adet from dogaltas_inventory where tenant_id=$1 and name='ZZ C4 YENİ'`, [A.tenant])).rows;
    H.ok(u.ok && u.created && c4.length === 1 && Number(c4[0].adet) === 9, "C4: yeni kayıt oluşturma etkilenmez", u);

    const c5 = await mk(A.tenant, 10, "ZZ C5", "10 MM");
    const row = { id: `dogaltas:${"zz c5"}|${"10 mm"}`, category: "dogaltas", name: "ZZ C5", groupLabel: "10 MM", stockAmount: 10, unitLabel: "adet" } as never;
    const [l1, l2] = await Promise.all([live.applyStockDelta(row, 4, A.tenant, false), live.applyStockDelta(row, 1, A.tenant, false)]);
    const f5 = await adetOf(c5);
    H.ok([l1, l2].filter((x) => x.ok).length === 1 && [l1, l2].filter((x) => (x as { conflict?: boolean }).conflict).length === 1 && (f5 === 14 || f5 === 11),
      `C5: Canlı Stok '+ Ekle' iki eşzamanlı → biri yazar, diğeri 'stok değişti' (son ${f5})`, [l1, l2]);

    const c6 = await mk(A.tenant, 10, "ZZ C6");
    const realFetch = globalThis.fetch;
    let injected = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!injected && String(input).startsWith("/api/dogaltas/inventory") && (init?.method ?? "GET") === "PATCH") { injected = true; await sale(c6, 2); }
      return realFetch(input, init);
    }) as typeof fetch;
    const imp = await lib.upsertDogaltasInventoryFromJson(A.tenant, [{ name: "ZZ C6", type: "8 MM", adet: 5 } as never]);
    globalThis.fetch = realFetch;
    const c6adet = await adetOf(c6);
    H.ok(injected && !imp.ok && /içe aktarma sırasında/.test((imp as { error: string }).error) && c6adet === 8,
      `C6: içe aktarma sırasında satış oldu → açık hata, satış ezilmedi (adet ${c6adet})`, imp);
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();
