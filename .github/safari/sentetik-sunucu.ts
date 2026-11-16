/**
 * #804 GEÇİCİ — GERÇEK SAFARI için SENTETİK ARKA UÇ (repoya girmez; runner'da scripts/workspace/.safari-sunucu.ts olarak koşar).
 * Gerçek Safari'de Playwright'ın istek yakalama mekanizması yok → API'ler GERÇEK bir yerel HTTP sunucusundan verilir:
 *   127.0.0.1:8080 → /api/* sentetik (bellekte), diğer her şey → next start (127.0.0.1:3984) vekil.
 * Kişisel Dijital Ofis uçları: scripts/workspace/ui-personal-backend.ts (GERÇEK sunucu modülleri: processImage, parça yükleme,
 * tasarım geçişleri). Profilim + rapor logosu uçları (yalnız MOD=f2): GERÇEK lib/profile/schema + logoSchema doğrulaması,
 * ui-logo.harness.ts ile aynı kurallar. Production / Supabase / ağ teması YOK; tüm veriler sentetik.
 * Test denetimi: POST /__test/sifirla {senaryo}, GET /__test/durum, POST /__test/enjekte {tur, status, json, assetId?}.
 */
import http from "node:http";
import sharp from "sharp";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";

const PORT = Number(process.env.SUNUCU_PORT ?? 8080);
const UPSTREAM = Number(process.env.UPSTREAM_PORT ?? 3984);
const MOD = process.env.MOD === "f2" ? "f2" : "main";
const REPORT = "rapor logosu (Ayarlar › Profilim)";

type Senaryo = "uzman" | "demo" | "erisim-kapali" | "yonetici";
const kullanici = (s: Senaryo) => ({
  id: "00000000-0000-4000-8000-0000000000f2", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz", name: "Ayşe",
  role: s === "yonetici" ? "admin" : "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "aaaaaaaa-0000-4000-8000-0000000000f2", is_demo_account: s === "demo",
  module_permissions: { clients: true, numerology: true, human_design: true },
});

// Sentetik görseller: yatay / dikey / kare / şeffaf (alfa) — aynı tohum her iki modda.
async function fikstur() {
  const duz = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r, g: 107, b: 90, alpha: 1 } } }).png().toBuffer();
  const seffaf = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="110" fill="#0f6b5a"/></svg>`) }]).png().toBuffer();
  return [["yatay.png", await duz(600, 200, 15)], ["dikey.png", await duz(200, 600, 120)], ["kare.png", await duz(400, 400, 200)], ["seffaf.png", seffaf]] as const;
}

let senaryo: Senaryo = "uzman";
let ws: WorkspaceMock;
let ids: Record<string, string> = {};
let profil: Record<string, unknown> = {};
let surum = 1;
let logo: { source: "none" | "workspace" | "custom"; assetId: string | null } = { source: "none", assetId: null };
const silmeler: { id: string; status: number }[] = [];
const yazmalar: { yol: string; yontem: string; status: number }[] = [];
let enjekte: { logoPut?: { status: number; json: unknown }; silme?: { status: number; json: unknown }; silmeId?: string } = {};
let lp: typeof import("../../lib/profile/schema") | null = null;
let ls: typeof import("../../lib/profile/logoSchema") | null = null;

async function sifirla(s: Senaryo) {
  senaryo = s;
  ws = createWorkspaceMock({ enabled: s !== "erisim-kapali", demo: s === "demo" });
  ids = {};
  if (s !== "erisim-kapali") for (const [ad, b] of await fikstur()) ids[ad] = await ws.seedAsset("logo", b, ad, "image/png");
  logo = s === "erisim-kapali" ? { source: "custom", assetId: "11111111-1111-4111-8111-111111111111" } : { source: "none", assetId: null };
  surum = 1; silmeler.length = 0; yazmalar.length = 0; enjekte = {};
  if (MOD === "f2") {
    lp = await import("../../lib/profile/schema");
    ls = await import("../../lib/profile/logoSchema");
    profil = { ...lp.EMPTY_PROFILE, title: "Refleksoloji Uzmanı", organization: "Ayşe Yılmaz Yaşam Merkezi", reportBrandingEnabled: true };
  }
}

const govdeOku = (req: http.IncomingMessage) => new Promise<Buffer>((res, rej) => {
  const p: Buffer[] = []; req.on("data", (d) => p.push(d)); req.on("end", () => res(Buffer.concat(p))); req.on("error", rej);
});
const json = (res: http.ServerResponse, status: number, v: unknown) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(v)); };

const varliklar = async () => {
  const r = await ws.handle("GET", "/api/settings/workspace/assets", new URLSearchParams(), null);
  return ((r.json as { assets?: { id: string }[] })?.assets ?? []).map((a) => a.id);
};
const logoDurum = async () => {
  if (logo.source === "none") return "none";
  if (senaryo === "erisim-kapali") return "access_off";
  return logo.assetId && (await varliklar()).includes(logo.assetId) ? "ok" : "missing";
};
const profilGorunum = async () => ({ ok: true, profile: { ...profil, logoSource: logo.source, logoAssetId: logo.assetId }, version: surum, updatedAt: "2026-11-17T09:00:00.000Z", account: { fullName: "Ayşe Yılmaz", email: "ayse.yilmaz@example.invalid" }, readOnly: senaryo === "demo", demo: senaryo === "demo" });
const logoGorunum = async () => ({ ok: true, logo: { source: logo.source, assetId: logo.source === "custom" ? logo.assetId : null, status: await logoDurum() }, workspace: { access: senaryo !== "erisim-kapali", logoAssetId: null }, checkFailed: false, brandingEnabled: true, readOnly: senaryo === "demo", demo: senaryo === "demo" });

async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const p = url.pathname, m = req.method ?? "GET";
  const body = m === "GET" || m === "HEAD" ? null : await govdeOku(req);
  const kaydet = (status: number) => { if (m !== "GET") yazmalar.push({ yol: p, yontem: m, status }); };
  const yaz = (status: number, v: unknown) => { kaydet(status); json(res, status, v); };
  const k = kullanici(senaryo);
  if (p === "/api/auth/session") return json(res, 200, { valid: true });
  if (p === "/api/auth/profile") return json(res, 200, { profile: k });
  if (p.endsWith("/astroloji/access")) return json(res, 404, { error: "not_found" });
  if (p.startsWith("/api/beslenme")) return json(res, 403, { ok: true, access: false });
  if (MOD === "f2" && p === "/api/settings/profile") {
    if (m === "GET") return json(res, 200, await profilGorunum());
    if (senaryo === "demo") return yaz(403, { ok: false, demo: true, error: "Demo hesabı salt okunurdur." });
    const b = JSON.parse(body?.toString() || "{}");
    const ev = lp!.parseExpectedVersion(b.expectedVersion), pp = lp!.parseProfilePatch(b.profile);
    if (!ev.ok || !pp.ok) return yaz(400, { ok: false, error: "Geçersiz." });
    if (ev.value !== surum) return yaz(409, { ...(await profilGorunum()), ok: false, code: "VERSION_CONFLICT", error: "Profiliniz başka bir sekmede değişti." });
    profil = { ...profil, ...pp.value }; surum++;
    return yaz(200, await profilGorunum());
  }
  if (MOD === "f2" && p === "/api/settings/profile/logo") {
    if (m === "GET") return json(res, 200, await logoGorunum());
    if (senaryo === "demo") return yaz(403, { ok: false, demo: true, error: "Demo hesabı salt okunurdur." });
    if (enjekte.logoPut) { const r = enjekte.logoPut; enjekte.logoPut = undefined; return yaz(r.status, r.json); }
    const b = JSON.parse(body?.toString() || "{}");
    const sel = ls!.parseLogoSelection(b);
    if (!sel.ok) return yaz(400, { ok: false, error: sel.error, path: sel.path });
    if (sel.value.source !== "none" && senaryo === "erisim-kapali") return yaz(403, { ok: false, code: "LOGO_ACCESS_OFF", error: "Erişim kapalı." });
    // Sahiplik: yalnız BU kullanıcının görsel kümesindeki kimlik (başka tenant / kullanıcı görseli → 400, gerçek sunucu kuralı).
    if (sel.value.source === "custom" && !(await varliklar()).includes(sel.value.assetId!)) return yaz(400, { ok: false, code: "LOGO_ASSET_INVALID", error: "Logo bulunamadı veya kullanılamıyor. Listeden yeniden seçin." });
    if (sel.expectedVersion !== surum) return yaz(409, { ...(await logoGorunum()), ok: false, code: "VERSION_CONFLICT", error: "Profiliniz başka bir sekmede değişti." });
    logo = { source: sel.value.source, assetId: sel.value.assetId }; surum++;
    return yaz(200, await logoGorunum());
  }
  if (p.startsWith("/api/settings/workspace")) {
    const am = /^\/api\/settings\/workspace\/assets\/([0-9a-f-]{36})$/.exec(p);
    if (am && m === "DELETE") {
      if (enjekte.silme && (!enjekte.silmeId || enjekte.silmeId === am[1])) {
        const r = enjekte.silme; enjekte.silme = undefined; silmeler.push({ id: am[1], status: r.status }); return yaz(r.status, r.json);
      }
      // F2 kuralı (lib/workspace/assets.ts): rapor logosunda kullanılan görsel silinmez → 409 asset_in_use.
      if (MOD === "f2" && logo.source === "custom" && logo.assetId === am[1]) {
        silmeler.push({ id: am[1], status: 409 });
        return yaz(409, { ok: false, code: "asset_in_use", error: `Bu görsel kullanılıyor (${REPORT}); önce rapor logosundan kaldırın.`, where: [REPORT] });
      }
    }
    const r = await ws.handle(m, p, url.searchParams, body);
    if (am && m === "DELETE") silmeler.push({ id: am[1], status: r.status });
    kaydet(r.status);
    if (r.body) { res.writeHead(r.status, { "content-type": r.contentType ?? "application/octet-stream", "cache-control": "private, no-store" }); return res.end(r.body); }
    return json(res, r.status, r.json);
  }
  return json(res, 200, { ok: true, rows: [], items: [], count: 0, messages: [] });
}

function vekil(req: http.IncomingMessage, res: http.ServerResponse) {
  const up = http.request({ host: "127.0.0.1", port: UPSTREAM, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${PORT}` } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}

void (async () => {
await sifirla("uzman");
http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/__test/sifirla" && req.method === "POST") { const b = JSON.parse((await govdeOku(req)).toString() || "{}"); await sifirla(b.senaryo ?? "uzman"); return json(res, 200, { ok: true, senaryo, ids }); }
    if (url.pathname === "/__test/durum") return json(res, 200, { mod: MOD, senaryo, ids, varliklar: await varliklar(), assetCount: ws.assetCount, logo, surum, silmeler, yazmalar });
    if (url.pathname === "/__test/enjekte" && req.method === "POST") { const b = JSON.parse((await govdeOku(req)).toString() || "{}"); (enjekte as Record<string, unknown>)[b.tur] = { status: b.status, json: b.json }; if (b.assetId) enjekte.silmeId = b.assetId; return json(res, 200, { ok: true }); }
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return vekil(req, res);
  } catch (e) {
    json(res, 500, { ok: false, error: String(e).slice(0, 300) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`SENTETIK-SUNUCU hazır mod=${MOD} :${PORT} → :${UPSTREAM}`));
})();
