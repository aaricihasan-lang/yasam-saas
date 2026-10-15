// FINAL-A3 sahte Supabase (54399) — scripts/pre-sale-a2b/ui/fake-supabase-sink.mjs'in üst kümesi.
// Yalnız sunucu tarafı admin kabuk kontrolüne (touch_active_session + users) senaryo token'larıyla yanıt verir:
//   zz-local-fake-token        → geçerli admin (orijinal sink ile aynı)
//   zz-a3-transient-token-0001 → touch_active_session 503 (geçici DB/RPC hatası)
//   zz-a3-expert-token-000001  → aktif oturum ama sahibi UZMAN (açık red)
//   zz-a3-users-down-token-01  → oturum aktif, users sorgusu 503
// Diğer her şey → 401 42501. Dış ağ / prod YOK.
import http from "node:http";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000ad";
const EXPERT_ID = "00000000-0000-4000-8000-0000000000e1";
const USERS_DOWN_ID = "00000000-0000-4000-8000-0000000000d0";
const SESSIONS = {
  "zz-local-fake-token": ADMIN_ID,
  "zz-a3-expert-token-000001": EXPERT_ID,
  "zz-a3-users-down-token-01": USERS_DOWN_ID,
};
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
        if (a.p_token === "zz-a3-transient-token-0001") return send(503, { message: "upstream unavailable (fake)" });
        return send(200, SESSIONS[a.p_token] ?? null);
      }
      if (!fromBrowser && u.pathname === "/rest/v1/users") {
        const id = String(u.searchParams.get("id") ?? "").replace(/^eq\./, "");
        if (id === USERS_DOWN_ID) return send(503, { message: "upstream unavailable (fake)" });
        const row = id === ADMIN_ID ? { id, role: "admin", active: true } : id === EXPERT_ID ? { id, role: "expert", active: true } : null;
        const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
        if (!row) return single ? send(406, { code: "PGRST116", message: "0 rows" }) : send(200, []);
        return send(200, single ? row : [row]);
      }
      return send(401, { code: "42501", message: "permission denied (fake)" });
    });
  })
  .listen(54399, "127.0.0.1", () => console.log("fake supabase sink A3 on 54399"));
