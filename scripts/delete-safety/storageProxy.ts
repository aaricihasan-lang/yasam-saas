/**
 * SİLME GÜVENLİĞİ testleri için yerel Supabase önü (yalnız 127.0.0.1; production'a SIFIR temas):
 *   /storage/v1/object/list/<bucket>  → storage.objects tablosundan klasör/dosya listesi
 *   DELETE /storage/v1/object/<bucket> → storage.objects satır silme
 *   diğer her şey                      → PostgREST shim'ine aktarılır
 */
import http from "node:http";
import type pg from "pg";

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => { s += c; });
    req.on("end", () => resolve(s));
  });
}

/** /storage/v1 → storage.objects tablosu (list + remove); diğer her şey PostgREST shim'ine. */
export async function startProxy(shimUrl: string, su: pg.Client, fixedPort = 0) {
  const shim = new URL(shimUrl);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/storage/v1/object/list/")) {
      const bucket = decodeURIComponent(url.pathname.slice("/storage/v1/object/list/".length));
      const body = JSON.parse((await readBody(req)) || "{}") as { prefix?: string; limit?: number; offset?: number };
      const prefix = (body.prefix ?? "").replace(/\/$/, "");
      const base = prefix ? `${prefix}/` : "";
      const rows = (await su.query(`select id, name from storage.objects where bucket_id = $1 and name like $2 order by name`,
        [bucket, `${base}%`])).rows as { id: string; name: string }[];
      const seen = new Set<string>();
      const out: { name: string; id: string | null }[] = [];
      for (const r of rows) {
        const rest = r.name.slice(base.length);
        const slash = rest.indexOf("/");
        if (slash >= 0) {
          const folder = rest.slice(0, slash);
          if (!seen.has(folder)) { seen.add(folder); out.push({ name: folder, id: null }); }
        } else out.push({ name: rest, id: r.id });
      }
      const page = out.slice(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? 100));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(page));
      return;
    }
    if (url.pathname.startsWith("/storage/v1/object/") && req.method === "DELETE") {
      const bucket = decodeURIComponent(url.pathname.slice("/storage/v1/object/".length));
      const body = JSON.parse((await readBody(req)) || "{}") as { prefixes?: string[] };
      const r = await su.query(`delete from storage.objects where bucket_id = $1 and name = any($2) returning name`, [bucket, body.prefixes ?? []]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r.rows));
      return;
    }
    const fwd = http.request(
      { host: shim.hostname, port: shim.port, path: req.url, method: req.method, headers: req.headers },
      (up) => { res.writeHead(up.statusCode ?? 500, up.headers); up.pipe(res); },
    );
    req.pipe(fwd);
  });
  await new Promise<void>((resolve) => server.listen(fixedPort, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}
