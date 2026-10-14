/**
 * BESLENME WORD — TÜM CİHAZLARDA GÖRÜNÜR + İNDİRİLİR (gerçek tarayıcı; yalnız 127.0.0.1; PRODUCTION'A SIFIR TEMAS).
 *
 * Owner kararı 2026-10-14: Beslenme plan Word indirmesi masaüstü web, mobil web, Android Chrome,
 * Android uygulaması (WebView), iPhone Safari ve tablette kullanılabilir olmalı. Word üretim mantığı
 * (downloadPlanWord + app/api/beslenme/plans/[id]/word) DEĞİŞMEDİ; yalnız "yalnız masaüstü" gizlemesi
 * kaldırıldı.
 *
 * Ortam: GERÇEK nutrition migration zinciri (scripts/dogal-destek-p2/beslenme/env.ts) + embed shim;
 * build'e gömülü Supabase adresi (127.0.0.1:54521) küçük bir HTTP yönlendiriciyle shim'e bağlanır.
 * Ön koşul: test env'li `next build` (bkz. scripts/mobile-files/ui.harness.ts başlığı).
 * Çalıştır: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 … npx tsx scripts/mobile-files/beslenme-word.ui.harness.ts
 *
 * NOT: Chromium cihaz emülasyonudur (UA + ekran + dokunmatik/pointer); gerçek cihaz DEĞİLDİR.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";
import { SERVICE_KEY } from "../anamnez/testEnv";
import { startBesDb } from "../dogal-destek-p2/beslenme/env";
import { startEmbedShim } from "../dogal-destek-p2/beslenme/pgrestEmbedShim";

const PORT = 3986;
const APP = `http://127.0.0.1:${PORT}`;
let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean; touch: boolean; ua?: string };
const DEVICES: Device[] = [
  { name: "masaüstü web", viewport: { width: 1366, height: 900 }, mobile: false, touch: false },
  { name: "Android Chrome (telefon)", viewport: { width: 390, height: 844 }, mobile: true, touch: true,
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" },
  { name: "Android uygulama (WebView)", viewport: { width: 390, height: 844 }, mobile: true, touch: true,
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36" },
  { name: "iPhone Safari (UA)", viewport: { width: 390, height: 844 }, mobile: true, touch: true,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" },
  { name: "Android tablet", viewport: { width: 1024, height: 768 }, mobile: true, touch: true,
    ua: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" },
];

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

async function main() {
  const db = await startBesDb({ port: 54633, dirName: "mf-beslenme-word-pgdata", includeNewMigration: true });
  const shim = await startEmbedShim(db.pool);
  // Build'e gömülü adres (54521) → embed shim yönlendiricisi.
  const target = new URL(shim.url);
  const proxy = http.createServer((req, res) => {
    const up = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((r) => proxy.listen(54521, "127.0.0.1", () => r()));

  const A = db.seed.users.A;
  const userRow = (await db.env.su.query(`select id, tenant_id, full_name, email, role, module_permissions from public.users where id=$1`, [A.id])).rows[0];
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);

    // Plan (gerçek API ile; 3 gün).
    const pr = await fetch(`${APP}/api/beslenme/plans`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": A.id, "x-session-token": A.token },
      body: JSON.stringify({ title: "ZZ Mobil Word Planı", start_date: "2026-10-20", end_date: "2026-10-22" }),
    });
    const pj = (await pr.json().catch(() => ({}))) as { plan?: { id: string } };
    ok(pr.status < 300 && !!pj.plan?.id, `plan oluşturuldu (HTTP ${pr.status})`, pj);
    const planId = pj.plan!.id;

    browser = await chromium.launch();
    for (const d of DEVICES) {
      console.log(`\n[${d.name}]`);
      const ctx = await browser.newContext({
        viewport: d.viewport, isMobile: d.mobile, hasTouch: d.touch, locale: "tr-TR", timezoneId: "Europe/Istanbul",
        acceptDownloads: true, ...(d.ua ? { userAgent: d.ua } : {}),
      });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const user = { ...userRow, active: true, approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false };
      await ctx.addInitScript(([u, tok]) => {
        localStorage.setItem("yasam_user", u as string);
        localStorage.setItem("yasam_session_token", tok as string);
      }, [JSON.stringify(user), A.token]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`${d.name}: ${e.message}`));
      await page.goto(`${APP}/beslenme/planlar/${planId}`);
      const btn = page.getByRole("button", { name: /Word İndir/ }).first();
      await btn.waitFor({ state: "attached", timeout: 60_000 }).catch(() => {});
      const env = await page.evaluate(() => ({
        coarse: matchMedia("(pointer: coarse)").matches,
        hoverNone: matchMedia("(hover: none)").matches,
        sw: document.documentElement.scrollWidth,
        iw: innerWidth,
      }));
      if (d.touch) ok(env.coarse && env.hoverNone, "dokunmatik ortam (pointer:coarse + hover:none) — eski kural burada gizliyordu", env);
      ok(await btn.isVisible(), "Word İndir GÖRÜNÜR");
      ok(env.sw <= env.iw + 1, `yatay taşma yok (${env.sw} ≤ ${env.iw})`);
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), btn.click()]);
      const p = await dl.path();
      const sig = p ? readFileSync(p).subarray(0, 2).toString("latin1") : "";
      ok(sig === "PK" && /\.docx$/i.test(dl.suggestedFilename()), `Word indirildi (${dl.suggestedFilename()}, PK)`);
      await ctx.close();
    }
    ok(pageErrors.length === 0, `sayfa JS hatası yok (${pageErrors.length})`, pageErrors);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await new Promise<void>((r) => proxy.close(() => r()));
    await shim.close().catch(() => {});
    await db.stop().catch(() => {});
  }
  console.log(`\nbeslenme-word UI harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.log("FAIL:", fails); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
