/**
 * KİŞİSEL DİJİTAL OFİS (P4) — Owner görsel testi için YEREL önizleme sunucusu (yalnız 127.0.0.1).
 *
 * Yerel `next dev` sunucusunun önüne geçer; production'a, Supabase'e ve dış ağa HİÇBİR istek gitmez:
 *   - /api/settings/workspace/*  → ui-personal-backend.ts (gerçek şema, taslak/uygula/geçmiş, kontrast kapısı, P2 görsel hattı;
 *     veriler yalnız bu sürecin belleğinde tutulur, kapatınca silinir)
 *   - /api/auth/*                → sentetik "Owner (önizleme)" hesabı
 *   - diğer /api/*               → boş sentetik veri
 *   - sayfalar / statik dosyalar → yerel next dev
 * Kullanım:
 *   1) Sahte env ile `npx next dev --webpack -p 3952 -H 127.0.0.1` (scripts/pre-sale-a2b/ui/README.md)
 *   2) npx tsx scripts/workspace/ui-personal-preview.ts            (UPSTREAM=http://127.0.0.1:3952 PORT=3960)
 *   3) Tarayıcıda http://127.0.0.1:3960/__onizleme  → sahte oturum açılır ve ana sayfaya yönlendirilir.
 *      Demo hesap denemesi: /__onizleme?demo=1 · Bayrak kapalı görünümü: /__onizleme?kapali=1
 */
import http from "node:http";
import net from "node:net";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";

const UPSTREAM = new URL(process.env.UPSTREAM ?? "http://127.0.0.1:3952");
const PORT = Number(process.env.PORT ?? 3960);
const ALL = ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
  "aromatherapy", "personal_archive", "belge_ceviri", "human_design", "digital_content", "cosmic_calendar", "cupping",
  "beslenme", "yasam_hafizasi", "astrology"];
const user = (demo: boolean) => ({
  id: demo ? "00000000-0000-4000-8000-0000000000d1" : "00000000-0000-4000-8000-0000000000ad",
  email: "onizleme@example.invalid", full_name: demo ? "Demo Önizleme" : "Owner Önizleme", name: demo ? "Demo" : "Owner",
  role: demo ? "expert" : "admin", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: demo,
  module_permissions: Object.fromEntries(ALL.map((k) => [k, true])),
});

type PreviewMode = "owner" | "demo" | "off";
let mode = "owner" as PreviewMode;
const mocks: Record<PreviewMode, WorkspaceMock> = {
  owner: createWorkspaceMock({ enabled: true }),
  demo: createWorkspaceMock({ enabled: true, demo: true }),
  off: createWorkspaceMock({ enabled: false }),
};

const readBody = (req: http.IncomingMessage) => new Promise<Buffer>((ok) => { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });
const sendJson = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/__onizleme") {
    mode = url.searchParams.get("demo") === "1" ? "demo" : url.searchParams.get("kapali") === "1" ? "off" : "owner";
    const u = JSON.stringify(user(mode === "demo"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Önizleme</title><p>Yerel önizleme oturumu açılıyor…</p><script>localStorage.setItem("yasam_user", ${JSON.stringify(u)});localStorage.setItem("yasam_session_token","onizleme-yerel");location.replace("/");</script>`);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    const body = await readBody(req);
    if (url.pathname.startsWith("/api/settings/workspace")) {
      const r = await mocks[mode].handle(req.method ?? "GET", url.pathname, url.searchParams, body.length ? body : null);
      if (r.body) { res.writeHead(r.status, { "content-type": r.contentType ?? "application/octet-stream", "cache-control": "private, no-store" }); res.end(r.body); return; }
      return sendJson(res, r.status, r.json);
    }
    if (url.pathname === "/api/auth/session") return sendJson(res, 200, { valid: true });
    if (url.pathname === "/api/auth/profile") return sendJson(res, 200, { profile: user(mode === "demo") });
    return sendJson(res, 200, { ok: true, rows: [], items: [], count: 0 });
  }
  const up = http.request({ host: UPSTREAM.hostname, port: UPSTREAM.port, path: req.url, method: req.method, headers: { ...req.headers, host: UPSTREAM.host } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) sendJson(res, 502, { error: "Yerel next dev sunucusu çalışmıyor." }); });
  req.pipe(up);
});

// next dev HMR web soketi doğrudan yerel sunucuya aktarılır.
server.on("upgrade", (req, socket, head) => {
  const up = net.connect(Number(UPSTREAM.port), UPSTREAM.hostname, () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries({ ...req.headers, host: UPSTREAM.host }).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

server.listen(PORT, "127.0.0.1", () => console.log(`Kişisel Ofis yerel önizleme: http://127.0.0.1:${PORT}/__onizleme  (upstream ${UPSTREAM.href})`));
