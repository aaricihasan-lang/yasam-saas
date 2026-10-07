// Fake Supabase origin (54399) for local UI tests.
//  - Records EVERY request; browser requests carry an Origin header (server-side ones do not).
//  - Server-side only: answers the admin-shell session check (touch_active_session + users role)
//    so /admin pages render with the test admin token. Everything else → 401 42501.
import http from "node:http";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000ad";
const TOKEN = "zz-local-fake-token";
const log = [];
http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const u = new URL(req.url, "http://127.0.0.1");
      const send = (s, b, h = {}) => { res.writeHead(s, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", ...h }); res.end(JSON.stringify(b)); };
      if (u.pathname === "/__log") return send(200, log);
      if (u.pathname === "/__reset") { log.length = 0; return send(200, { ok: true }); }
      log.push({ method: req.method, path: u.pathname, search: u.search, origin: req.headers.origin ?? null });
      const fromBrowser = !!req.headers.origin;
      if (!fromBrowser && u.pathname === "/rest/v1/rpc/touch_active_session") {
        const a = JSON.parse(raw || "{}");
        return send(200, a.p_token === TOKEN ? ADMIN_ID : null);
      }
      if (!fromBrowser && u.pathname === "/rest/v1/users" && u.searchParams.get("id") === `eq.${ADMIN_ID}`) {
        const row = { id: ADMIN_ID, role: "admin", active: true };
        return send(200, String(req.headers.accept ?? "").includes("vnd.pgrst.object") ? row : [row]);
      }
      return send(401, { code: "42501", message: "permission denied (fake)" });
    });
  })
  .listen(54399, "127.0.0.1", () => console.log("fake supabase sink on 54399"));
