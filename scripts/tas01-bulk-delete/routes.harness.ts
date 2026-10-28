/**
 * TAS-01 — Doğaltaş toplu silme: istemci parçaları ağ geçidi URL sınırına takılmaz.
 * GERÇEK route + GERÇEK Postgres (embedded; PostgREST taklidi URL sınırı 16 KB = Supabase önü).
 * PROD'A SIFIR TEMAS; ZZ_* sentetik veri.
 *
 * 0) kök neden kanıtı: tek istekte 1000 kimlik → URL ~37 KB → ağ geçidi 414 → silme olmaz (görünür hata)
 * 1) BULK_CHUNK = 150 → her parça sınırın altında; 1000 seçili taş istemci döngüsüyle TAMAMEN silinir
 * 2) her istek tek DELETE (istek başına atomik); başka uzmanın taşları silinmez (tenant)
 * 3) mineral toplu silme aynı parça boyutuyla
 * Çalıştır: npx tsx scripts/tas01-bulk-delete/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, seedStonesUser, startWt9TestEnv, type Wt9User } from "../wt9/wt9TestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import { BULK_CHUNK, chunkIds } from "../../lib/dogaltas/dogaltasApi";
import { DOGALTAS_IN_CHUNK } from "../../lib/dogaltas/fetchAllRows";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("tas01-bulk-delete/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 400)), done: () => H0.done() };
const req = (url: string, u: Wt9User, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: "POST", headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: JSON.stringify(body),
});

(async () => {
  H.ok(BULK_CHUNK === 150 && BULK_CHUNK === DOGALTAS_IN_CHUNK, "U: istemci parça boyutu proje kuralıyla aynı (150)");
  const parts = chunkIds(Array.from({ length: 1000 }, (_, i) => String(i)));
  H.ok(parts.length === 7 && parts.every((p) => p.length <= 150) && parts.flat().length === 1000, "U: 1000 kimlik → 7 parça (≤150), kayıp yok");

  const env = await startWt9TestEnv({ port: 54639, dirName: "tas01-bulk-delete-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    const T = await seedStonesUser(su, "T1T");
    const X = await seedStonesUser(su, "T1X");
    await su.query(`create table if not exists public.minerals (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text);
                    grant select, insert, update, delete on public.minerals to service_role;`);
    const seed = async (tenant: string, n: number, table = "stones") => (await su.query(
      table === "stones"
        ? `insert into stones(tenant_id, stone_name, images) select $1, 'ZZ T01 ' || g, '[]'::jsonb from generate_series(1,$2) g returning id`
        : `insert into minerals(tenant_id, name) select $1, 'ZZ M ' || g from generate_series(1,$2) g returning id`, [tenant, n])).rows.map((r) => r.id as string);
    const tIds = await seed(T.tenant, 1000);
    const xIds = await seed(X.tenant, 5);
    const route = await import("../../app/api/dogaltas/stones/bulk-delete/route");
    const mroute = await import("../../app/api/dogaltas/minerals/bulk-delete/route");
    const count = async (tenant: string, table = "stones") => Number((await su.query(`select count(*)::int n from ${table} where tenant_id=$1`, [tenant])).rows[0].n);

    // ── 0) kök neden ──

    let r = await route.POST(req("/api/dogaltas/stones/bulk-delete", T, { ids: tIds }));
    // Ön okuma 150'lik parçalarla geçer; DELETE isteği (~37 KB URL) HTTP katmanında (istek satırı > 16 KB)
    // reddedilir ve PostgREST işleyicisine hiç ulaşmaz (env.stats.deletes = 0).
    H.ok(r.status === 500 && env.stats.deletes === 0 && (await count(T.tenant)) === 1000,
      "0: tek istekte 1000 kimlik → DELETE isteği URL sınırında reddedilir → silme yok, hata görünür (eski 1000'lik parça)", { status: r.status, stats: env.stats });

    // ── 1/2) istemci döngüsü (deleteStones ile aynı: sıralı parçalar) ──
    const deleted: string[] = [];
    let maxUrl = 0;
    for (const chunk of chunkIds([...tIds, ...xIds])) {
      const before = env.stats.maxUrl;
      r = await route.POST(req("/api/dogaltas/stones/bulk-delete", T, { ids: chunk }));
      const b = (await r.json()) as { ok?: boolean; deletedIds?: string[] };
      maxUrl = Math.max(maxUrl, env.stats.maxUrl, before);
      if (r.status !== 200 || !b.ok) { H.ok(false, "parça silinemedi", { status: r.status, b }); break; }
      deleted.push(...(b.deletedIds ?? []));
    }
    H.ok(deleted.length === 1000 && (await count(T.tenant)) === 0, `1: 1000 seçili taş 150'lik parçalarla TAMAMEN silindi (${deleted.length})`);
    H.ok(maxUrl < 16384, `1b: en uzun istek URL'i sınırın altında (${maxUrl} B < 16384)`);
    H.ok((await count(X.tenant)) === 5 && !deleted.some((id) => xIds.includes(id)), "2: başka uzmanın taşları silinmedi (seçime karışsa bile)");

    // ── 3) mineral ──
    const mIds = await seed(T.tenant, 400, "minerals");
    let mDeleted = 0;
    for (const chunk of chunkIds(mIds)) {
      r = await mroute.POST(req("/api/dogaltas/minerals/bulk-delete", T, { ids: chunk }));
      const b = (await r.json()) as { ok?: boolean; deleted?: number };
      if (r.status !== 200 || !b.ok) { H.ok(false, "mineral parçası silinemedi", { status: r.status, b }); break; }
      mDeleted += b.deleted ?? 0;
    }
    H.ok(mDeleted === 400 && (await count(T.tenant, "minerals")) === 0, `3: 400 mineral parçalarla silindi (${mDeleted})`);
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();
