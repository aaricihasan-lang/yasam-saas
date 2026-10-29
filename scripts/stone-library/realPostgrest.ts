/**
 * Test yardımcısı: GERÇEK PostgREST (POSTGREST_BIN) + yerel vekil. Uygulamanın Supabase adresi vekile verilir:
 *   /rest/v1/*  → gerçek PostgREST (service_role JWT ile)
 *   diğerleri   → test emülatörü (depolama vb., scripts/anamnez/testEnv)
 * Gerçek PostgREST, skaler jsonb dizisini doğrudan dizi döndürür (test shim'i [{ fn: değer }] döndürür); bu fark production
 * hatasını (29.10.2026, owner_images) gizlemişti. Yalnız 127.0.0.1; production'a sıfır temas.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import type pg from "pg";

export type RealPostgrest = { url: string; stop: () => Promise<void> };

function jwt(secret: string, role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role, exp: Math.floor(Date.now() / 1000) + 6 * 3600 });
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}

/**
 * su: testEnv süper kullanıcı bağlantısı · pgPort: testEnv Postgres portu · shimUrl: testEnv HTTP adresi (depolama)
 * restPort: PostgREST portu · proxyPort: uygulamaya verilecek Supabase adresinin portu.
 */
export async function startRealPostgrest(o: { bin: string; su: pg.Client; pgPort: number; shimUrl: string; restPort: number; proxyPort: number }): Promise<RealPostgrest> {
  const secret = `yerel-test-${o.restPort}-gizli-anahtar-0123456789abcdef`;
  await o.su.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then
      create role authenticator login noinherit password 'auth-local'; end if; end $$;
    grant anon, authenticated, service_role to authenticator;`);
  const conf = path.join(os.tmpdir(), `yerel-postgrest-${o.restPort}.conf`);
  writeFileSync(conf, [`db-uri = "postgres://authenticator:auth-local@127.0.0.1:${o.pgPort}/postgres"`, `db-schemas = "public"`, `db-anon-role = "anon"`,
    `jwt-secret = "${secret}"`, `server-host = "127.0.0.1"`, `server-port = ${o.restPort}`, `log-level = "error"`].join("\n"));
  const rest: ChildProcess = spawn(o.bin, [conf], { cwd: path.dirname(o.bin), stdio: "ignore" });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await new Promise<number>((res, rej) => http.get({ host: "127.0.0.1", port: o.restPort, path: "/", headers: { Authorization: `Bearer ${jwt(secret, "service_role")}` } },
      (r) => { r.resume(); res(r.statusCode ?? 0); }).on("error", rej))) < 500; } catch { /* bekle */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { rest.kill(); throw new Error("PostgREST açılamadı"); }
  const shim = new URL(o.shimUrl);
  const proxy = http.createServer((req, res) => {
    const isRest = (req.url ?? "").startsWith("/rest/v1");
    const headers = { ...req.headers } as Record<string, string>;
    delete headers.host;
    if (isRest) { headers.authorization = `Bearer ${jwt(secret, "service_role")}`; delete headers.apikey; }
    const out = http.request({ host: "127.0.0.1", port: isRest ? o.restPort : Number(shim.port), path: isRest ? (req.url ?? "").slice("/rest/v1".length) || "/" : req.url, method: req.method, headers },
      (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    out.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(out);
  });
  await new Promise<void>((r) => proxy.listen(o.proxyPort, "127.0.0.1", () => r()));
  return {
    url: `http://127.0.0.1:${o.proxyPort}`,
    stop: async () => {
      const closed = new Promise<void>((r) => proxy.close(() => r()));
      proxy.closeAllConnections();
      await closed;
      if (rest.exitCode === null && rest.signalCode === null) {
        const exited = new Promise<void>((r) => rest.once("exit", () => r()));
        rest.kill();
        await exited; // port serbest kalmadan yeniden başlatma yapılmasın (CI / Linux)
      }
    },
  };
}
