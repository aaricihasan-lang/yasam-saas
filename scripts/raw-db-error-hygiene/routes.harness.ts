/**
 * REF-03 / ARO-02 / NAT-AROMA-F1 — ham veritabanı hata mesajı istemciye DÖNMEZ.
 * GERÇEK route + GERÇEK Postgres (embedded; PROD'A SIFIR TEMAS). Hata, ilgili tablo kasıtlı olarak
 * KURULMADAN tetiklenir (Postgres "relation ... does not exist") → yanıtta tablo adı / Postgres metni
 * olmamalı; sabit güvenli mesaj + ref dönmeli.
 * Çalıştır: npx tsx scripts/raw-db-error-hygiene/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, seedStonesUser, startWt9TestEnv } from "../wt9/wt9TestEnv";
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
const H0 = harness("raw-db-error-hygiene/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 400)), done: () => H0.done() };
const LEAK = /does not exist|relation|aromatherapy_reference|reflexology_protocols|PGRST|42P01|column|constraint/i;

(async () => {
  const env = await startWt9TestEnv({ port: 54645, dirName: "raw-db-error-hygiene-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const origError = console.error;
  const logged: string[] = [];
  console.error = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
  try {
    const U = await seedStonesUser(su, "RAW");
    await su.query(`update users set module_permissions = '{"aromatherapy":true}'::jsonb where id=$1`, [U.id]);
    const aroma = await import("../../app/api/aromaterapi/reference/route");
    const r = await aroma.GET(new NextRequest("http://localhost/api/aromaterapi/reference", { method: "GET", headers: { "x-user-id": U.id, "x-session-token": U.token } }));
    const body = await r.text();
    H.ok(r.status === 500 && !LEAK.test(body) && /"ref"/.test(body), "ARO-02: tablo hatasında yanıt sabit mesaj + ref; Postgres/tablo adı YOK", body);
    H.ok(logged.some((l) => /route=aromaterapi\/reference/.test(l)), "ARO-02: teknik ayrıntı yalnız sunucu logunda (ref ile)");

    const A = await seedStonesUser(su, "RAWADM", { role: "admin" });
    const imp = await import("../../app/api/admin/refleksoloji/protocols/import/route");
    const r2 = await imp.POST(new NextRequest("http://localhost/api/admin/refleksoloji/protocols/import", {
      method: "POST", headers: { "content-type": "application/json", "x-admin-id": A.id, "x-session-token": A.token },
      body: JSON.stringify({ rows: [{ tenant_id: A.tenant, source_uid: "zz-1", title: "ZZ Protokol" }] }),
    }));
    const b2 = await r2.text();
    // reflexology_protocols tablosu kasıtlı yok → INSERT gerçekten DB hatası üretir.
    H.ok(r2.status === 500 && !LEAK.test(b2) && /"ref"/.test(b2), `REF-03: admin içe aktarma DB hatasında sabit mesaj + ref, ham mesaj YOK (HTTP ${r2.status})`, b2);
    H.ok(logged.some((l) => /route=admin\/refleksoloji\/protocols\/import/.test(l)), "REF-03: teknik ayrıntı yalnız sunucu logunda");
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    console.error = origError;
    await env.stop();
    H.done();
  }
})();
