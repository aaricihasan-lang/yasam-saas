/**
 * UZMAN PROFİLİ (F2) — GÖRSEL SİLME: uyarı metni + expert_profiles HATA YOLU HARNESS
 * Gerçek Next route handler'ları (workspace assets + design, profile/logo) + gerçek migration'lar (20271227000000 +
 * 20271228000000 + 20280102000000) + yerel embedded-postgres + PostgREST şimi + Storage emülatörü (scripts/anamnez/testEnv).
 * Şimin önüne HATA ENJEKSİYON vekili konur: yalnız `GET /rest/v1/expert_profiles` istekleri seçilen arıza ile yanıtlanır,
 * diğer her şey şime aynen iletilir. Production'a SIFIR temas (127.0.0.1); veriler sentetik (@example.test).
 *
 * Kapsam:
 *  M  409 uyarı metni: yalnız tasarım → F2 öncesi metin BİREBİR ("önce tasarımdan kaldırın.", `where` yalnız tasarım girdileri);
 *     yalnız rapor logosu → "önce rapor logosundan kaldırın."; ikisi birden → "önce tasarımdan ve rapor logosundan kaldırın."
 *  F  expert_profiles sorgusu beklenmeyen hata verirse (500 JSON / 502 HTML / 503 / bağlantı kopması / bozuk JSON / beklenmeyen
 *     biçim): yanıt güvenli 500 (sabit metin + opak ref; iç ayrıntı yok), görsel SİLİNMEZ (DB satırı deleted_at NULL +
 *     iki Storage nesnesi yerinde), günlükte kişisel veri yok; arıza kalkınca AYNI silme 200.
 * Çalıştır: npx tsx scripts/profile/delete-guard.harness.ts
 */
import Module from "node:module";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, seedAnamnez, startAnamnezTestEnv, type Seed, type TestEnv } from "../anamnez/testEnv";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Auth = { id?: string; token?: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const MIGS = ["20271227000000_expert_workspace_designs_prefs.sql", "20271228000000_expert_workspace_assets_access.sql", "20280102000000_expert_profiles.sql"]
  .map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("boş port alınamadı"))));
    });
  });
}

// ── Hata enjeksiyon vekili ─────────────────────────────────────────────────
type Fault = "http500" | "html502" | "http503" | "reset" | "badjson" | "shape_string" | "shape_empty" | "shape_array1";
let fault: Fault | null = null;
let injected = 0;
function startFaultProxy(upstream: string, port: number): Promise<http.Server> {
  const up = new URL(upstream);
  const srv = http.createServer((req, res) => {
    const target = req.url ?? "/";
    if (fault && req.method === "GET" && target.startsWith("/rest/v1/expert_profiles")) {
      injected++;
      req.resume();
      switch (fault) {
        case "http500": res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ code: "XX000", message: "internal error", details: null, hint: null })); return;
        case "html502": res.writeHead(502, { "content-type": "text/html" }); res.end("<html><body><h1>502 Bad Gateway</h1></body></html>"); return;
        case "http503": res.writeHead(503, { "content-type": "application/json", "retry-after": "0" }); res.end(JSON.stringify({ message: "upstream timeout" })); return;
        case "reset": setTimeout(() => req.socket.destroy(), 50); return;
        case "badjson": res.writeHead(200, { "content-type": "application/json" }); res.end("{\"logo_source\": \"cust"); return;
        case "shape_string": res.writeHead(200, { "content-type": "application/json" }); res.end("\"beklenmeyen\""); return;
        case "shape_empty": res.writeHead(200, { "content-type": "application/json" }); res.end("[{}]"); return;
        case "shape_array1": res.writeHead(200, { "content-type": "application/json" }); res.end("[[\"custom\"]]"); return;
      }
    }
    const p = http.request({ hostname: up.hostname, port: up.port, path: target, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    p.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(p);
  });
  return new Promise((resolve) => srv.listen(port, "127.0.0.1", () => resolve(srv)));
}

// Sunucu günlüklerini yakala (kişisel veri denetimi; çıktı yine yazılır).
const logged: string[] = [];
for (const k of ["log", "error", "warn", "info"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a))).join(" ");
    if (!line.startsWith("  ✓") && !line.startsWith("  ✗") && !line.startsWith("\n[")) logged.push(line);
    orig(...args);
  };
}

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: await freePort(), dirName: "profile-delete-guard-pgdata", extraSql: MIGS });
  const proxyPort = await freePort();
  const proxy = await startFaultProxy(env.url, proxyPort);
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${proxyPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.REQUIRE_DB_SUPER_ADMIN_MARKER = "true";
  process.env.EXPERT_WORKSPACE_DESIGN_ENABLED = "true";
  process.env.EXPERT_WORKSPACE_ROLLOUT_ALL = "true";
  const seed: Seed = await seedAnamnez(env.su);
  // Demo vitrini KENDİ tenant'ına (aksi hâlde TA demo tenant sayılır; logo.harness ile aynı düzen).
  const TD = "dddddddd-0000-4000-8000-00000000d0f2";
  await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ_DELETE_GUARD_DEMO_TENANT')`, [TD]);
  await env.su.query(`update public.users set tenant_id=$1 where id=$2`, [TD, seed.users.DEMO.id]);
  console.log(`embedded-postgres + PostgREST şimi + Storage emülatörü + arıza vekili hazır (vekil → ${env.url}).`);

  try {
    const logoRoute = await import("../../app/api/settings/profile/logo/route");
    const startRoute = await import("../../app/api/settings/workspace/assets/uploads/route");
    const chunkRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/chunks/[index]/route");
    const completeRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/complete/route");
    const assetRoute = await import("../../app/api/settings/workspace/assets/[assetId]/route");
    const designRoute = await import("../../app/api/settings/workspace/design/route");
    const { REPORT_LOGO_REF } = await import("../../lib/workspace/assets");
    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };

    async function call(handler: unknown, method: string, auth: Auth, opts: { body?: unknown; raw?: Uint8Array; params?: Record<string, string> } = {}): Promise<{ status: number; json: Json; text: string }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      let body: BodyInit | undefined;
      if (opts.raw) { headers["content-type"] = "application/octet-stream"; headers["content-length"] = String(opts.raw.length); body = Buffer.from(opts.raw); }
      else if (opts.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opts.body); }
      const req = new NextRequest("http://localhost/api/test", { method, headers, body });
      const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
      const text = await res.clone().text();
      let json: Json = {};
      try { json = JSON.parse(text) as Json; } catch { json = {}; }
      return { status: res.status, json, text };
    }
    async function upload(a: Auth, bytes: Buffer, fileName: string): Promise<string> {
      const s = await call(startRoute.POST, "POST", a, { body: { kind: "logo", fileName, mimeType: "image/png", size: bytes.length } });
      if (s.status !== 200) throw new Error(`upload start ${s.status} ${JSON.stringify(s.json)}`);
      const { uploadId, chunkSize, chunkCount } = s.json as { uploadId: string; chunkSize: number; chunkCount: number };
      for (let i = 0; i < chunkCount; i++) {
        const c = await call(chunkRoute.PUT, "PUT", a, { raw: bytes.subarray(i * chunkSize, Math.min(bytes.length, (i + 1) * chunkSize)), params: { uploadId, index: String(i) } });
        if (c.status !== 200) throw new Error(`chunk ${c.status}`);
      }
      const done = await call(completeRoute.POST, "POST", a, { params: { uploadId } });
      if (done.status !== 200) throw new Error(`complete ${done.status} ${JSON.stringify(done.json)}`);
      return done.json.asset.id as string;
    }
    const png = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r, g: 90, b: 60, alpha: 1 } } }).png().toBuffer();
    const del = (assetId: string) => call(assetRoute.DELETE, "DELETE", asA, { params: { assetId }, body: { confirm: true } });
    const lget = () => call(logoRoute.GET, "GET", asA);
    const lput = (body: unknown) => call(logoRoute.PUT, "PUT", asA, { body });
    const objects = (id: string) => [...(env.storage.objects.get("expert-workspace")?.keys() ?? [])].filter((k) => k.startsWith(`${seed.TA}/${U.A.id}/${id}/`));
    const deletedAt = async (id: string) => { const r = (await env.su.query(`select deleted_at from public.expert_workspace_assets where id=$1`, [id])).rows; return r.length ? (r[0].deleted_at as Date | null) : "YOK"; };
    const intact = async (id: string) => objects(id).length === 2 && (await deletedAt(id)) === null;

    section("Hazırlık: sentetik logolar (mevcut yükleme akışıyla)");
    const D = await upload(asA, await png(800, 300, 10), "tasarim.png");   // yalnız tasarımda
    const R = await upload(asA, await png(600, 200, 40), "rapor.png");     // yalnız rapor logosu
    const DR = await upload(asA, await png(500, 500, 80), "ikisi.png");    // geçmiş tasarım + rapor logosu
    const X = await upload(asA, await png(400, 400, 120), "serbest.png");  // hiçbir yerde (arıza senaryoları)
    const X2 = await upload(asA, await png(420, 300, 160), "serbest2.png"); // hiçbir yerde (arıza sonrası ikinci silme)
    ok([D, R, DR, X, X2].every((x) => typeof x === "string"), "5 görsel yüklendi");
    const dget = async () => (await call(designRoute.GET, "GET", asA)).json.design;
    const design = (extra: Json) => ({ layout: "B", text: { useGreeting: true }, ...extra });
    let dv = (await dget()).version;
    const ap1 = await call(designRoute.POST, "POST", asA, { body: { action: "apply", expectedVersion: dv, draft: design({ logo: { assetId: DR } }) } });
    dv = ap1.json.design.version;
    const ap2 = await call(designRoute.POST, "POST", asA, { body: { action: "apply", expectedVersion: dv, draft: design({ logo: { assetId: D } }) } });
    ok(ap1.status === 200 && ap2.status === 200, "tasarım: önce DR uygulandı (→ geçmiş 1), sonra D uygulandı");
    const c1 = await lput({ source: "custom", assetId: R, expectedVersion: (await lget()).json.version });
    ok(c1.status === 200 && c1.json.logo.assetId === R, "rapor logosu = R", c1.json);

    section("M  409 uyarı metni (sunucu)");
    const mD = await del(D);
    ok(mD.status === 409 && mD.json.code === "asset_in_use" && JSON.stringify(mD.json.where) === JSON.stringify(["uygulanan tasarım"]), "yalnız tasarım: where F2 öncesiyle aynı biçimde (rapor girdisi yok)", mD.json);
    ok(mD.json.error === "Bu görsel kullanılıyor (uygulanan tasarım); önce tasarımdan kaldırın.", "yalnız tasarım: mesaj main ile BİREBİR", mD.json.error);
    const mR = await del(R);
    ok(mR.status === 409 && JSON.stringify(mR.json.where) === JSON.stringify([REPORT_LOGO_REF]), "yalnız rapor logosu: where = [rapor logosu girdisi]", mR.json);
    ok(mR.json.error === "Bu görsel kullanılıyor (rapor logosu (Ayarlar › Profilim)); önce rapor logosundan kaldırın.", "yalnız rapor logosu: yeni açıklama", mR.json.error);
    // DR'yi rapor logosu yap → hem geçmiş tasarım hem rapor logosu.
    const c2 = await lput({ source: "custom", assetId: DR, expectedVersion: (await lget()).json.version });
    ok(c2.status === 200, "rapor logosu = DR");
    const mDR = await del(DR);
    ok(mDR.status === 409 && JSON.stringify(mDR.json.where) === JSON.stringify(["geçmiş tasarım 1", REPORT_LOGO_REF]), "tasarım + rapor logosu: where iki girdi", mDR.json);
    ok(mDR.json.error === "Bu görsel kullanılıyor (geçmiş tasarım 1, rapor logosu (Ayarlar › Profilim)); önce tasarımdan ve rapor logosundan kaldırın.", "tasarım + rapor logosu: iki yeri anlatan metin", mDR.json.error);
    ok((await intact(D)) && (await intact(R)) && (await intact(DR)), "409 durumlarında üç görsel de yerinde (satır + 2 nesne)");

    section("F  expert_profiles beklenmeyen hata → silme YOK, güvenli 500");
    const logStart = logged.length;
    const faults: Fault[] = ["http500", "html502", "http503", "reset", "badjson", "shape_string", "shape_empty", "shape_array1"];
    for (const fl of faults) {
      fault = fl;
      const before = injected;
      const r = await del(X);
      fault = null;
      const keys = Object.keys(r.json).sort().join(",");
      ok(injected > before, `${fl}: arıza expert_profiles sorgusuna enjekte edildi (${injected - before} istek)`);
      ok(r.status === 500 && r.json.ok === false && r.json.error === "İşlem sırasında bir hata oluştu." && typeof r.json.ref === "string" && keys === "error,ok,ref", `${fl}: yanıt 500 + sabit güvenli metin + opak ref (başka alan yok)`, { s: r.status, j: r.json });
      ok(!/expert_profiles|Profil okunamadı|logo_source|XX000|internal error|Bad Gateway|SyntaxError|rest\/v1|\.webp|example\.test/i.test(r.text) && !r.text.includes(U.A.id) && !r.text.includes(X), `${fl}: yanıtta iç ayrıntı / kimlik yok`, r.text);
      ok(await intact(X), `${fl}: görsel SİLİNMEDİ (deleted_at NULL + 2 Storage nesnesi)`, { obj: objects(X).length, del: await deletedAt(X) });
    }
    const faultLogs = logged.slice(logStart);
    const apiErr = faultLogs.filter((l) => l.includes("[api-error]"));
    ok(apiErr.length === faults.length && apiErr.every((l) => l.includes("action=delete")), "her arıza tek [api-error] günlük satırı (route/action/ref)", apiErr.length);
    const pii = [U.A.id, U.A.token, "zz.anamnez.a@example.test", "ZZ_ANAMNEZ_A", X, "serbest.png", ".webp", `${seed.TA}/${U.A.id}`];
    ok(faultLogs.every((l) => pii.every((p) => !l.includes(p))), "arıza günlüklerinde kullanıcı kimliği / belirteç / e-posta / ad / görsel kimliği / dosya adı / yol yok", faultLogs.slice(0, 4));

    section("F  arıza kalkınca aynı silme normal çalışır");
    const ok1 = await del(X);
    ok(ok1.status === 200 && ok1.json.ok === true, "arıza kalktı → aynı görsel silindi (200)", ok1.json);
    ok(objects(X).length === 0 && (await deletedAt(X)) !== null, "silinen görselin nesneleri kaldırıldı, satır deleted_at ile işaretlendi");
    const ok2 = await del(X2);
    ok(ok2.status === 200 && objects(X2).length === 0, "ikinci serbest görsel de silinir");
    const after = await del(D);
    ok(after.status === 409 && after.json.error === "Bu görsel kullanılıyor (uygulanan tasarım); önce tasarımdan kaldırın.", "arıza sonrası koruma aynen sürer (D → 409, eski metin)");
    ok(injected >= faults.length, "toplam enjekte istek", injected);
  } finally {
    proxy.closeAllConnections();
    await new Promise((r) => proxy.close(() => r(null)));
    await env.stop();
  }
  console.log(`\nprofile delete-guard harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error("FAIL:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
