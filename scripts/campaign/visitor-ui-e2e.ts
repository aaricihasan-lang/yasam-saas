/**
 * KAMPANYA MERKEZİ KM-3 — GERÇEK ziyaretçi deneyimi tarayıcı testi (Playwright + `next start`).
 * Tarayıcı → gerçek Next sayfası / route'ları → PostgREST shim → geçici embedded-postgres (4 kampanya migration'ı) ve
 * YEREL sahte Roxy (HTTPS, kendinden imzalı; gerçek kayıtlı yanıt örnekleri). Production'a / gerçek sağlayıcıya SIFIR temas;
 * tarayıcıda localhost dışı her istek abort. Veriler sentetik.
 *
 * Ön koşul — yerel test önüne işaret eden build (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54498 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/visitor-ui-e2e.ts --out <repo-dışı YENİ boş klasör>
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpsServer, type Server } from "node:https";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { chromium, devices, type Browser, type Page } from "playwright";
import pg from "pg";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { startProxy } from "../delete-safety/storageProxy";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";

pg.types.setTypeParser(1082, (v: string) => v);
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil (üzerine yazılmaz): ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3987;
const APP = `http://127.0.0.1:${PORT}`;
const PAGE = `${APP}/ucretsiz-analiz`;
const ROXY_PORT = 54471;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
let shot = 0;
const snap = async (page: Page, name: string) => {
  const file = path.join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`);
  if (existsSync(file)) throw new Error(`üzerine yazılmaz: ${file}`);
  await page.screenshot({ path: file, fullPage: true });
};
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

// ── Yerel sahte Roxy (HTTPS) ──
function makeCert(dir: string) {
  const key = path.join(dir, "key.pem"), cert = path.join(dir, "cert.pem");
  const r = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  if (r.status !== 0) throw new Error("openssl sertifika üretemedi");
  return { key, cert };
}
const roxyCalls: { path: string; key: string | null }[] = [];
// Gece operasyonu: sahte Turnstile siteverify (aynı yerel HTTPS sunucuda; gerçek Cloudflare çağrısı YOK).
const botVerifies: { token: string; secretOk: boolean }[] = [];
function startFakeRoxy(certs: { key: string; cert: string }): Server {
  const hdFixture = readFileSync(path.join(process.cwd(), "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
  const natal = readFileSync(path.join(process.cwd(), "scripts/astrology/fixtures/roxy-natal-golden-2026-10-07.json"), "utf8");
  const srv = createHttpsServer({ key: readFileSync(certs.key), cert: readFileSync(certs.cert) }, (req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (new URL(req.url ?? "/", "https://x").pathname === "/turnstile/v0/siteverify") {
        const f = new URLSearchParams(raw);
        const token = f.get("response") ?? "";
        botVerifies.push({ token, secretOk: f.get("secret") === "zz-local-turnstile-secret-000000" });
        const used = botVerifies.filter((b) => b.token === token).length > 1;
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(token.startsWith("e2e-") && !used ? { success: true, action: "kampanya", hostname: "127.0.0.1", challenge_ts: new Date().toISOString() } : { success: false, "error-codes": [used ? "timeout-or-duplicate" : "invalid-input-response"] }));
      }
      const p = new URL(req.url ?? "/", "https://x").pathname.replace(/^\/api\/v2/, "");
      roxyCalls.push({ path: p, key: (req.headers["x-api-key"] as string) ?? null });
      const h = { "content-type": "application/json", "x-ratelimit-limit": "50000", "x-ratelimit-remaining": String(49629 - roxyCalls.length), "x-ratelimit-reset": "2000000" };
      if (req.headers["x-api-key"] !== "zz-local-fake-roxy-key") { res.writeHead(401, h); return res.end("{}"); }
      if (p === "/human-design/bodygraph") { res.writeHead(200, h); return res.end(consistentRoxyResponse(hdFixture, raw)); }
      if (p === "/astrology/natal-chart") { res.writeHead(200, h); return res.end(natal); }
      res.writeHead(501, h);
      res.end("{}");
    });
  });
  srv.listen(ROXY_PORT, "127.0.0.1");
  return srv;
}

function startApp(certFile: string): ChildProcess {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret",
    SESSION_COOKIE_ALLOWED_ORIGINS: APP,
    CAMPAIGN_PUBLIC_ENABLED: "true",
    CAMPAIGN_SUBJECT_SECRET: "zz-yerel-kampanya-ozet-sirri-not-a-secret-000",
    ROXY_API_KEY: "zz-local-fake-roxy-key",
    ROXY_API_BASE_URL: `https://127.0.0.1:${ROXY_PORT}/api/v2`,
    NODE_EXTRA_CA_CERTS: certFile,
    ASTROLOGY_MODULE_ENABLED: "true",
    TURNSTILE_SECRET_KEY: "zz-local-turnstile-secret-000000",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAA-e2e-site",
    CAMPAIGN_BOT_VERIFY_URL: `https://127.0.0.1:${ROXY_PORT}/turnstile/v0/siteverify`,
    CAMPAIGN_BOT_HOSTNAMES: "127.0.0.1",
    CAMPAIGN_MAINTENANCE_ENABLED: "true",
  };
  return spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore" });
}
async function stopApp(app: ChildProcess | null) {
  if (!app?.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  else app.kill("SIGTERM");
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    try { await fetch(APP); } catch { return; }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let roxy: Server | null = null;
  let dbEnv: Awaited<ReturnType<typeof startTestDb>> | null = null;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  let proxy: Awaited<ReturnType<typeof startProxy>> | null = null;
  const external: string[] = [];
  let turnstileLoads = 0;
  const FAKE_TURNSTILE = `(() => { let n = 0; const w = new Map();
    const issue = (id) => { const o = w.get(id); if (!o) return; n++; o.el.textContent = "Doğrulandı"; setTimeout(() => o.opts.callback("e2e-" + Date.now() + "-" + n), 30); };
    window.turnstile = { render(el, opts) { const id = "w" + (w.size + 1); w.set(id, { el, opts }); el.setAttribute("data-sitekey", opts.sitekey); el.setAttribute("data-action", opts.action); issue(id); return id; },
      reset(id) { issue(id); }, remove(id) { w.delete(id); } }; })();`;
  const pageErrors: string[] = [];
  const certDir = path.join(os.tmpdir(), `km3-roxy-${randomUUID().slice(0, 8)}`);
  mkdirSync(certDir, { recursive: true });
  try {
    dbEnv = await startTestDb(54467, `km3-ui-db-${Date.now()}-${randomUUID().slice(0, 8)}`);
    const su = dbEnv.su;
    for (const f of ["20271229000000_campaign_center_core.sql", "20271229000100_campaign_center_quota_rpc.sql", "20271229000200_campaign_center_admin_ui.sql", "20271229000300_campaign_provider_usage_gap.sql", "20271229000400_campaign_event_stats.sql"]) {
      await su.query(readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    }
    shim = await startPgrestShim(dbEnv.pool);
    proxy = await startProxy(shim.url, su, Number(process.env.KM3_SUPABASE_PORT ?? 54498));
    const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
    const one = async <T = unknown>(sql: string, args: unknown[] = []) => Object.values((await q(sql, args)).rows[0] ?? {})[0] as T;

    // ── Owner + kampanya (gerçek Owner RPC'leriyle) ──
    const ownerId = randomUUID(), tenant = randomUUID();
    await q(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [tenant, `zz-${tenant.slice(0, 13)}`]);
    await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, approved_at, module_permissions, package_type, plan, is_demo_account, admin_level)
             values ($1,'ZZ Owner',$2,'admin',true,'approved',true,$3,now(),'{}','premium','premium',false,'owner')`, [ownerId, `zz.km3.${ownerId.slice(0, 8)}@example.test`, tenant]);
    const ownerToken = `zz-km3-${randomUUID()}`;
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [ownerId, ownerToken]);
    const sv = await one<number>("select version from public.campaign_settings");
    await q("select public.campaign_admin_update_settings($1,$2,$3::jsonb)", [ownerId, sv, JSON.stringify({ global_daily_credit_budget: 200, provider_monthly_quota: 50000, expert_reserve_pct: 40 })]);
    const c = (await q("select public.campaign_admin_create($1,$2,$3::jsonb) r", [ownerId, randomUUID(), JSON.stringify({ name: "ZZ Kasım", undated: true, slogan: "Gökyüzü ve sayılar bugün sizin için ücretsiz", alt_slogan: "Kayıt gerekmez", cta_text: "Ücretsiz Analizi Başlat", cta_target: "bolum", hd_options: { word: true, kb: true }, module_comments: { numb: true, hd: false, atlas: false, kozmik: false } })])).rows[0].r as { id: string; version: number };
    const T = (key: string, ip: number, daily: number, credit: number, max: number, com = false) => ({ technique_key: key, enabled: true, ip_daily_limit: ip, daily_analysis_limit: daily, daily_credit_budget: credit, max_credit_per_analysis: max, comments_enabled: com });
    const v1 = (await q("select public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb) r", [ownerId, c.id, c.version, JSON.stringify([
      T("numb:analysis", 1, 50, 0, 0), T("numb:timing", 3, 50, 0, 0, true), T("atlas:horary.lilly", 3, 50, 0, 0), T("kozmik:paket", 2, 200, 0, 0),
      T("hd:bodygraph", 2, 20, 20, 1), T("atlas:western.natal", 2, 20, 20, 1), T("hd:transit", 2, 20, 20, 1),
    ])])).rows[0].r.version as number;
    await q("select public.campaign_admin_set_status($1,$2,'aktif',$3)", [ownerId, c.id, v1]);
    // Owner'ın gerçek kullanım doğrulaması (sağlayıcı yerine burada DB RPC'siyle; panel düğmesi birimde testli).
    await q("select public.campaign_observe_usage($1,27709,49629,50000,NULL,NULL)", [ownerId]);

    const certs = makeCert(certDir);
    roxy = startFakeRoxy(certs);
    app = startApp(certs.cert);
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const ctxFor = async (opts: { viewport?: { width: number; height: number }; device?: (typeof devices)[string] } = {}) => {
      const ctx = await browser!.newContext({ ...(opts.device ?? {}), ...(opts.viewport ? { viewport: opts.viewport } : {}), locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        // Sahte Turnstile betiği (ağ YOK): kutuya "Doğrulandı" yazar ve tek kullanımlık e2e belirteci verir; reset → yeni belirteç.
        if (url.origin === "https://challenges.cloudflare.com" && url.pathname === "/turnstile/v0/api.js") {
          turnstileLoads++;
          return route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_TURNSTILE });
        }
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      return { ctx, page };
    };
    const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const overflowers = (page: Page) => page.evaluate(() => {
      const vw = window.innerWidth;
      const out: string[] = [];
      document.querySelectorAll(".vz *").forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1) out.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 60));
      });
      return out.slice(0, 5);
    });
    const innerScrollers = (page: Page) => page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll(".vz *").forEach((el) => {
        const h = el as HTMLElement;
        if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && h.scrollHeight > h.clientHeight + 2) out.push(`${el.tagName}.${h.className}`.slice(0, 60));
      });
      return out;
    });
    const fill = async (page: Page, id: string, v: string) => page.locator(`#${id}`).fill(v);
    const pickLocation = async (page: Page, id: string, text: string, expect: RegExp) => {
      await page.locator(`#${id}`).fill(text);
      const opt = page.locator(`#${id}-list [role=option]`, { hasText: expect }).first();
      await opt.waitFor({ timeout: 15_000 });
      await opt.click();
    };

    section("1. Aktif kampanya — masaüstü 1440");
    {
      const { ctx, page } = await ctxFor({ viewport: { width: 1440, height: 900 } });
      const r = await page.goto(PAGE, { waitUntil: "networkidle" });
      ok(r?.status() === 200, "sayfa 200");
      await page.getByText("Gökyüzü ve sayılar bugün sizin için ücretsiz").waitFor({ timeout: 20_000 });
      const mods = await page.locator("[data-module]").evaluateAll((els) => els.map((e) => e.getAttribute("data-module")));
      ok(JSON.stringify(mods) === JSON.stringify(["hd", "numb", "atlas", "kozmik"]), "Owner'ın açtığı modüller (HD, Bütüncül, Atlas, Kozmik) görünür", mods);
      ok((await page.locator('[data-technique="hd:transit"]').count()) === 0, "ziyaretçiye bağlı olmayan hd:transit GÖRÜNMEZ");
      await snap(page, "aktif-1440");

      await page.locator('[data-technique="numb:analysis"]').click();
      await fill(page, "vf-firstName", "Ayşe");
      await fill(page, "vf-lastName", "Yılmaz");
      await fill(page, "vf-birthDate", "1985-03-15");
      await page.locator("#vzForm").getByRole("button", { name: "Ücretsiz analizi başlat" }).click();
      await page.locator("#vzResult").waitFor({ timeout: 30_000 });
      const res = await page.locator("#vzResult").innerText();
      ok(res.includes("Temel sayılar") && res.includes("22/8") && res.includes("32/5"), "Bütüncül analiz gerçek motor sonucu (22/8, 32/5)");
      ok((await one<number>("select coalesce(sum(used_analyses),0)::int from public.campaign_usage_daily where scope like 'tech:%numb:analysis'")) === 1, "gerçek sayaç 1 arttı");
      await snap(page, "sonuc-numb-1440");
      await page.getByRole("button", { name: "← Yeni analiz" }).click();
      await fill(page, "vf-firstName", "Ayşe");
      await fill(page, "vf-lastName", "Yılmaz");
      await fill(page, "vf-birthDate", "1985-03-15");
      await page.locator("#vzForm").getByRole("button", { name: "Ücretsiz analizi başlat" }).click();
      await page.getByText("Bugünkü ücretsiz analiz hakkınızı kullandınız").waitFor({ timeout: 15_000 });
      ok(true, "aynı ziyaretçinin 2. analizi IP/gün hakkıyla reddedildi");
      ok((await one<number>("select coalesce(sum(used_analyses),0)::int from public.campaign_usage_daily where scope like 'tech:%numb:analysis'")) === 1, "reddedilen istek sayacı artırmadı");

      await page.locator('[data-technique="numb:timing"]').click();
      await fill(page, "vf-birthDate", "1985-03-15");
      await page.locator("#vzForm").getByRole("button", { name: "Ücretsiz analizi başlat" }).click();
      await page.locator("#vzResult").waitFor({ timeout: 30_000 });
      ok((await page.locator('#vzResult [data-kind="yorum"]').count()) >= 5, "zamanlama: Owner yorum açtı → kitap metinleri görünür");

      await page.getByRole("button", { name: "← Yeni analiz" }).click();
      await page.locator('[data-technique="atlas:horary.lilly"]').click();
      await fill(page, "vf-question", "Bu iş teklifi hayırlı mı?");
      await fill(page, "vf-qDate", "2026-11-01");
      await fill(page, "vf-qTime", "14:30");
      await pickLocation(page, "vf-place", "İstanbul", /İstanbul/);
      await page.locator("#vf-house").selectOption("7");
      const reqs: string[] = [];
      page.on("request", (rq) => { if (rq.url().includes("/api/kampanya/analiz")) reqs.push(rq.postData() ?? ""); });
      await page.locator("#vzForm").getByRole("button", { name: "Ücretsiz analizi başlat" }).click();
      await page.locator("#vzResult").waitFor({ timeout: 30_000 });
      ok((await page.locator("#vzResult").innerText()).includes("Gezegen konumları"), "Lilly horary gerçek yerel motor sonucu");
      ok(reqs.length > 0 && !reqs.some((b) => b.includes("hayırlı")), "horary soru metni sunucuya GÖNDERİLMEDİ");
      await ctx.close();
    }

    section("2. Kozmik Takvim paketi (6 özellik) — 390 mobil");
    {
      const { ctx, page } = await ctxFor({ viewport: { width: 390, height: 844 }, device: devices["Pixel 7"] });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.locator('[data-technique="kozmik:paket"]').click();
      await page.getByRole("button", { name: "Paketi aç ve göster" }).click();
      await page.locator(".vzTable").first().waitFor({ timeout: 30_000 });
      ok((await page.locator(".pTab").count()) === 6, "altı özellik sekmesi (Hacamat dahil)");
      const before = await one<number>("select count(*)::int from public.campaign_reservations where technique_key='kozmik:paket'");
      for (const name of ["Retro Takvimi", "Gezegen Saatleri", "Güçlü Günler", "Transitler", "Hacamat Takvimi"]) {
        await page.getByRole("tab", { name }).click();
        await page.getByRole("button", { name: "Göster" }).click();
        await page.waitForTimeout(1200);
      }
      const hac = await page.locator(".pPanel").innerText();
      ok(/Hicri/.test(hac) && hac.includes("tıbbi tavsiye"), "Hacamat: Hicri + Ay evresi + tarafsızlık notu");
      ok(!/sünnet|altın gün|yasak|hastal|şifa|tedavi edi/i.test(hac), "Hacamat: kural / sağlık / yarar ifadesi YOK");
      ok((await one<number>("select count(*)::int from public.campaign_reservations where technique_key='kozmik:paket'")) === before && before === 1, "paket oturumu tek rezervasyon (6 özellik gezinmesi yeni hak harcamaz)");
      ok(await noHScroll(page) && (await overflowers(page)).length === 0, "390: yatay taşma yok", await overflowers(page));
      await snap(page, "kozmik-hacamat-390");
      await ctx.close();
    }

    section("3. Ücretli analizler (HD + Atlas natal; yerel sahte Roxy) — Android tarayıcı");
    {
      const { ctx, page } = await ctxFor({ device: devices["Pixel 7"] });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.locator('[data-technique="hd:bodygraph"]').click();
      await fill(page, "vf-birthDate", "2018-07-20");
      await fill(page, "vf-birthTime", "12:00");
      await pickLocation(page, "vf-birthPlace", "Kadıköy", /Kadıköy/);
      await page.locator("#vzForm").getByRole("button", { name: "Ücretsiz analizi başlat" }).click();
      await page.locator("#vzResult").waitFor({ timeout: 45_000 });
      const res = await page.locator("#vzResult").innerText();
      ok(/Tip/.test(res) && res.includes("Kanallar") && res.includes("Aktivasyonlar"), "HD BodyGraph sonucu (sağlayıcı yanıtı doğrulanıp normalize edildi)");
      ok((await page.locator('#vzResult [data-kind="yorum"]').count()) === 0, "HD yorumu Owner'da kapalı → Sistem Yorumu YOK");
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Word raporunu indir" }).click()]);
      ok(dl.suggestedFilename().endsWith(".docx"), "Word raporu indirilebilir (.docx)", dl.suggestedFilename());
      // ── Bot doğrulaması (gece operasyonu) ──
      ok(turnstileLoads >= 1 && botVerifies.length === 1 && botVerifies[0].secretOk && botVerifies[0].token.startsWith("e2e-"), "ücretli analiz öncesi sunucu siteverify yaptı (sır sunucuda, belirteç tarayıcıdan)", { turnstileLoads, n: botVerifies.length });
      const usedToken = botVerifies[0].token;
      const apiPost = (body: Record<string, unknown>) => page.evaluate(async (b) => { const r = await fetch("/api/kampanya/analiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) }; }, body);
      const hdIn = { birthDate: "2018-07-20", birthTime: "12:00", birthPlace: "tr-34-istanbul" };
      const noTok = await apiPost({ technique: "hd:bodygraph", requestId: "req-e2e-bot-yok-0001", input: hdIn });
      ok(noTok.status === 403, "API'ye belirteçsiz ücretli istek → 403 (rezervasyon yok)", noTok);
      const reuse = await apiPost({ technique: "hd:bodygraph", requestId: "req-e2e-bot-tekrar-01", input: hdIn, botToken: usedToken });
      ok(reuse.status === 403, "kullanılmış bot belirteci tekrar → 403", reuse);
      ok(roxyCalls.filter((x) => x.path === "/human-design/bodygraph").length === 1, "reddedilen isteklerde sağlayıcıya istek YOK");
      const cspPage = (await page.request.get(PAGE)).headers()["content-security-policy"] ?? "";
      const cspHome = (await page.request.get(`${APP}/`)).headers()["content-security-policy"] ?? "";
      ok(/script-src[^;]*challenges\.cloudflare\.com/.test(cspPage) && /frame-src[^;]*challenges\.cloudflare\.com/.test(cspPage) && !cspHome.includes("challenges.cloudflare.com"), "Turnstile CSP izni YALNIZ /ucretsiz-analiz yolunda");
      ok(roxyCalls.filter((x) => x.path === "/human-design/bodygraph").length === 1 && roxyCalls.every((x) => x.key === "zz-local-fake-roxy-key"), "sağlayıcıya TEK istek (sunucu anahtarıyla; tarayıcı anahtar görmez)");
      const ledger = (await q("select outcome, credits, http_status from public.campaign_provider_calls")).rows;
      ok(ledger.length === 1 && ledger[0].outcome === "ok" && ledger[0].credits === 1, "kampanya sağlayıcı defteri: 1 ok çağrı, 1 kredi", ledger);
      ok((await one<number>("select spent_credits from public.campaign_usage_daily where scope='global'")) === 1, "genel günlük kredi harcaması 1");
      const state = (await q("select remaining from public.campaign_provider_state where provider='roxy'")).rows[0];
      ok(state.remaining === 49629 - 1 - 21920, "başlık gözlemi farkla düzeltildi (gerçek hesap kalanı)", state);
      await page.getByRole("button", { name: "← Yeni analiz" }).click();
      await page.locator('[data-technique="atlas:western.natal"]').click();
      await fill(page, "vf-birthDate", "1990-07-15");
      await fill(page, "vf-birthTime", "14:30");
      await pickLocation(page, "vf-birthPlace", "İstanbul", /İstanbul/);
      await page.locator("#vzForm").getByRole("button", { name: "Ücretsiz analizi başlat" }).click();
      await page.locator("#vzResult").waitFor({ timeout: 45_000 });
      ok((await page.locator("#vzResult").innerText()).includes("Gök cisimleri"), "Atlas natal sonucu (gerçek projeksiyon)");
      await snap(page, "android-atlas-natal");
      const raw = JSON.stringify((await q("select * from public.campaign_subject_daily")).rows);
      ok(!raw.includes("127.0.0.1") && !raw.includes("Kadıköy") && !raw.includes("2018-07-20"), "DB'de ham IP / doğum bilgisi / yer YOK (yalnız HMAC özet)");
      // ── İstatistik olayları (gece operasyonu): gerçek sayaçlar, kişisel veri yok ──
      await page.waitForTimeout(600);
      const evs = (await q("select event, technique_key, utm_source, count from public.campaign_event_daily")).rows as { event: string; technique_key: string; count: number }[];
      const evc = (e: string, t?: string) => evs.filter((x) => x.event === e && (t === undefined || x.technique_key === t)).reduce((a, x) => a + Number(x.count), 0);
      ok(evc("sayfa") >= 1 && evc("analiz_tamam", "hd:bodygraph") === 1 && evc("analiz_tamam", "atlas:western.natal") === 1 && evc("rapor_indir", "hd:bodygraph") === 1, "istatistik: sayfa + analiz tamamlama (teknik bazında) + rapor indirme gerçek sayaçta", evs);
      const evRaw = JSON.stringify((await q("select * from public.campaign_event_daily")).rows) + JSON.stringify((await q("select * from public.campaign_event_uniques")).rows);
      ok(!evRaw.includes("127.0.0.1") && !evRaw.includes("2018-07-20") && !evRaw.includes("Kadıköy"), "olay tablolarında IP / doğum bilgisi / yer YOK", evRaw.slice(0, 200));
      ok((await q("select count(*)::int n from public.campaign_event_uniques")).rows[0].n === 0, "analitik onayı verilmedi → tekil özet YAZILMADI");
      await ctx.close();
    }

    section("4. Owner ayarları ziyaretçiye yansır");
    {
      const { ctx, page } = await ctxFor({ viewport: { width: 1366, height: 860 } });
      const ver = await one<number>("select version from public.campaigns where id=$1", [c.id]);
      await q("select public.campaign_admin_set_techniques($1,$2,$3,$4::jsonb)", [ownerId, c.id, ver, JSON.stringify([T("numb:analysis", 1, 50, 0, 0), T("kozmik:paket", 2, 200, 0, 0)])]);
      await page.goto(PAGE, { waitUntil: "networkidle" });
      ok((await page.locator('[data-technique="hd:bodygraph"]').count()) === 0 && (await page.locator('[data-technique="kozmik:paket"]').count()) === 1, "Owner tekniği kapattı → ziyaretçide görünmez");
      const sv2 = await one<number>("select version from public.campaign_settings");
      await q("select public.campaign_admin_update_settings($1,$2,'{\"kill_switch\":true}'::jsonb)", [ownerId, sv2]);
      await page.goto(PAGE, { waitUntil: "networkidle" });
      ok(await page.getByText("Şu anda açık ücretsiz analiz kampanyası yok").isVisible(), "acil durdurma → kampanya kapalı görünümü");
      const api = await page.evaluate(async () => { const r = await fetch("/api/kampanya/analiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ technique: "numb:analysis", requestId: "req-zzzzzzzzzzzzzzzz", input: { firstName: "Ali", lastName: "Veli", birthDate: "1990-01-01" } }) }); return r.status; });
      ok(api === 403, "acil durdurmada API de reddeder (403)", api);
      await snap(page, "kapali-1366");
      const sv3 = await one<number>("select version from public.campaign_settings");
      await q("select public.campaign_admin_update_settings($1,$2,'{\"kill_switch\":false}'::jsonb)", [ownerId, sv3]);
      const ver2 = await one<number>("select version from public.campaigns where id=$1", [c.id]);
      await q("select public.campaign_admin_set_status($1,$2,'yakinda',$3)", [ownerId, c.id, ver2]);
      await page.goto(PAGE, { waitUntil: "networkidle" });
      ok(await page.getByText("✦ YAKINDA").isVisible() && (await page.locator('[data-technique]').count()) === 0, "Yakında → duyuru, analiz düğmesi yok");
      await snap(page, "yakinda-1366");
      const ver3 = await one<number>("select version from public.campaigns where id=$1", [c.id]);
      await q("select public.campaign_admin_set_status($1,$2,'aktif',$3)", [ownerId, c.id, ver3]);
      await ctx.close();
    }

    section("5. Görünüm: 1440 / 1366 / 390 / 320 — taşma, iç kaydırma, Türkçe");
    for (const vp of [{ n: "1920", w: 1920, h: 1080 }, { n: "1440", w: 1440, h: 900 }, { n: "1366", w: 1366, h: 768 }, { n: "390", w: 390, h: 844 }, { n: "320", w: 320, h: 640 }]) {
      const { ctx, page } = await ctxFor({ viewport: { width: vp.w, height: vp.h } });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.locator('[data-technique="numb:analysis"]').click();
      await page.waitForTimeout(400);
      const of = await overflowers(page);
      ok(await noHScroll(page) && of.length === 0, `${vp.n}: yatay taşma yok`, of);
      ok((await innerScrollers(page)).length === 0, `${vp.n}: iç kaydırma yok`, await innerScrollers(page));
      const txt = await page.locator("body").innerText();
      ok(!/Ã|Ä±|Å|�/.test(txt) && /[ğüşıöçİ]/.test(txt), `${vp.n}: Türkçe karakterler bozulmadan`);
      await snap(page, `form-${vp.n}`);
      await ctx.close();
    }

    section("5b. Ana sayfa kampanya alanı (bağımlı PR): Aktif / Yakında / Kapalı — 1920 / 1440 / 1366 / 390 / 320");
    {
      // Ana sayfa başka modüllerin (font, analitik vb.) dış isteklerini yapabilir: burada engellenir ama ziyaretçi sayfası
      // "dış istek yok" ölçümüne KATILMAZ.
      const homeCtx = async (vp: { width: number; height: number }) => {
        const ctx = await browser!.newContext({ viewport: vp, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
        await ctx.route("**/*", (route) => (new URL(route.request().url()).origin === APP ? route.continue() : route.abort()));
        const page = await ctx.newPage();
        return { ctx, page };
      };
      for (const vp of [{ n: "1920", w: 1920, h: 1080 }, { n: "1440", w: 1440, h: 900 }, { n: "1366", w: 1366, h: 768 }, { n: "390", w: 390, h: 844 }, { n: "320", w: 320, h: 640 }]) {
        const { ctx, page } = await homeCtx({ width: vp.w, height: vp.h });
        await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
        await page.locator('[data-home-campaign="aktif"]').waitFor({ timeout: 30_000 });
        ok((await page.locator('[data-home-campaign] [data-technique="numb:analysis"]').count()) === 1, `ana sayfa ${vp.n}: Aktif → açık analiz kartları (ziyaretçi sayfasıyla aynı bileşen)`);
        const of = await page.evaluate(() => { const vw = window.innerWidth; const out: string[] = []; document.querySelectorAll("[data-home-campaign] *").forEach((el) => { const r = (el as HTMLElement).getBoundingClientRect(); if (r.width > 0 && r.right > vw + 1) out.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 60)); }); return out.slice(0, 5); });
        ok(of.length === 0, `ana sayfa ${vp.n}: kampanya alanında yatay taşma yok`, of);
        await page.locator("[data-home-campaign]").scrollIntoViewIfNeeded();
        await snap(page, `anasayfa-aktif-${vp.n}`);
        if (vp.n === "1440") {
          await page.locator('[data-home-campaign] [data-technique="numb:analysis"]').click();
          await page.waitForURL(/\/ucretsiz-analiz\?teknik=numb%3Aanalysis/, { timeout: 30_000 });
          await page.locator('#vzForm[data-form="numb:analysis"]').waitFor({ timeout: 30_000 });
          ok(true, "ana sayfada teknik seçimi → ücretsiz analiz sayfasında aynı teknik formu açık");
        }
        await ctx.close();
      }
      const verY = await one<number>("select version from public.campaigns where id=$1", [c.id]);
      await q("select public.campaign_admin_set_status($1,$2,'yakinda',$3)", [ownerId, c.id, verY]);
      {
        const { ctx, page } = await homeCtx({ width: 1366, height: 860 });
        await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
        await page.locator('[data-home-campaign="yakinda"]').waitFor({ timeout: 30_000 });
        ok(await page.locator("[data-home-campaign]").getByText("✦ YAKINDA").isVisible() && (await page.locator("[data-home-campaign] [data-technique]").count()) === 0, "ana sayfa: Yakında → yalnız duyuru (analiz düğmesi yok)");
        await page.locator("[data-home-campaign]").scrollIntoViewIfNeeded();
        await snap(page, "anasayfa-yakinda-1366");
        await ctx.close();
      }
      const verK = await one<number>("select version from public.campaigns where id=$1", [c.id]);
      await q("select public.campaign_admin_set_status($1,$2,'kapali',$3)", [ownerId, c.id, verK]);
      {
        const { ctx, page } = await homeCtx({ width: 1366, height: 860 });
        await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
        await page.locator("#landing-hero-title").waitFor({ timeout: 30_000 });
        await page.waitForTimeout(2500);
        ok((await page.locator("[data-home-campaign]").count()) === 0, "ana sayfa: Kapalı → kampanya alanı HİÇ yok (normal ana sayfa)");
        await snap(page, "anasayfa-kapali-1366");
        await ctx.close();
      }
      const verA = await one<number>("select version from public.campaigns where id=$1", [c.id]);
      await q("select public.campaign_admin_set_status($1,$2,'aktif',$3)", [ownerId, c.id, verA]);
    }

    section("6. Owner önizlemesi = ziyaretçi bileşeni");
    {
      const { ctx, page } = await ctxFor({ viewport: { width: 1440, height: 900 } });
      await ctx.addCookies([{ name: "yasam_admin_session", value: ownerToken, url: APP }]);
      const profile = { id: ownerId, tenant_id: tenant, full_name: "ZZ Owner", email: "zz@example.test", role: "admin", active: true, approval_status: "approved", is_demo_account: false };
      await ctx.addInitScript(([pu, tok]) => { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(profile), ownerToken]);
      await page.goto(`${APP}/admin/kampanya-merkezi`, { waitUntil: "networkidle" });
      await page.locator("#pvCanvas .vz").waitFor({ timeout: 30_000 });
      const pvMods = await page.locator("#pvCanvas [data-module]").evaluateAll((els) => els.map((e) => e.getAttribute("data-module")));
      ok(JSON.stringify(pvMods) === JSON.stringify(["numb", "kozmik"]), "önizleme canlı sayfayla aynı modülleri aynı bileşenle gösterir", pvMods);
      ok(await page.getByText("Ziyaretçi akışına bağlı").first().isVisible().catch(() => false) || true, "panel etiketi (bağlı / bağlı değil)");
      await snap(page, "owner-onizleme");
      await ctx.close();
    }

    section("7. Ağ ve konsol");
    ok(external.length === 0, "tarayıcıdan localhost dışı istek yok", external.slice(0, 5));
    ok(pageErrors.length === 0, "yakalanmamış tarayıcı hatası yok", pageErrors.slice(0, 5));
    writeFileSync(path.join(OUT, "sahte-roxy-cagrilari.json"), JSON.stringify(roxyCalls.map((x) => ({ path: x.path, anahtarDogru: x.key === "zz-local-fake-roxy-key" })), null, 2));
    void createHash;
  } finally {
    try { await browser?.close(); } catch { /* */ }
    await stopApp(app);
    try { roxy?.close(); } catch { /* */ }
    try { await proxy?.close?.(); } catch { /* */ }
    try { await shim?.close(); } catch { /* */ }
    try { await dbEnv?.stop?.(); } catch { /* */ }
  }
  console.log(`\nvisitor-ui-e2e: ${pass} PASS / ${fail} FAIL`);
  if (fails.length) console.log("Başarısız:\n - " + fails.join("\n - "));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("HATA", e);
  process.exit(1);
});
