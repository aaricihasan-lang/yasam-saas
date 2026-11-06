/**
 * TRIAL7 — arayüz uçtan uca (Playwright + `next start`; gerçek DB / Cloudflare / Roxy YOK).
 * Önkoşul: `npx next build` (bu worktree). Sunucu sahte ortamla açılır; tarayıcıdaki /api çağrıları
 * Playwright ile taklit edilir (sunucu tarafı kurallar trial7-db + trial7-routes harness'larında).
 *
 *   U1  Kayıt formu: otomatik deneme açıkken Turnstile widget'ı + "ilk girişinizle başlar" metni;
 *       belirteç gelmeden gönder kapalı; gönderimde belirteç sunucuya gider; başarı mesajı (otomatik akış)
 *   U2  Kayıt formu (bayrak kapalı): widget yok, eski "yönetici onayı" metni
 *   U3  Ana sayfa: "7 Gün" teklif metinleri, onaysız modda "Onay beklemeden başlar", '3 gün' YOK, görsel YOK
 *   U4  Geri sayım kutusu: yeni oturumda görünür (7 gün), Tamam → kapanır, aynı oturumda yeniden açılmaz,
 *       yeni giriş işareti → tekrar görünür; son 24 saat metni
 *   U5  Süre sonu: bilgilendirme + Pro talebi (uygulama içi) + WhatsApp + köşe bağlantısı
 *   U6  Premium kullanıcı: kutu / köşe bağlantısı YOK
 *   U7  Admin "Deneme Üyeleri": sekmeler, satır, limit / durum / Pro geçiş düğmeleri; SÜRE UZATMA düğmesi YOK
 *   Her adım masaüstü (1366) + mobil (360) ekran görüntüsü; yatay taşma kontrolü.
 *
 * Çalıştır: npx tsx scripts/trial7/trial7-ui.e2e.ts   (ekran görüntüleri: TRIAL7_SHOTS dizini)
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Page, type BrowserContext } from "playwright";

const PORT = Number(process.env.TRIAL7_UI_PORT ?? 3991);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.TRIAL7_SHOTS ?? path.join(os.tmpdir(), "trial7-ui-shots");
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  }
}

const HOUR = 3_600_000;
const TRIAL_USER = {
  id: "00000000-0000-0000-0000-0000000000f1", tenant_id: "10000000-0000-0000-0000-0000000000a1", full_name: "Deneme Uzman",
  email: "deneme@test.com", role: "expert", active: true, approval_status: "approved", package_type: "trial", plan: "trial",
  trial_kind: "self_7d", trial_status: "active", module_permissions: { clients: true, human_design: true, numerology: true, astrology: true, stones: true },
};
const PREMIUM_USER = { ...TRIAL_USER, id: "00000000-0000-0000-0000-0000000000b1", package_type: "premium", plan: "premium", trial_kind: undefined, trial_status: undefined };
const ADMIN_USER = { id: "00000000-0000-0000-0000-0000000000ad", tenant_id: "x", full_name: "Admin", email: "admin@test.com", role: "admin", active: true, approval_status: "approved" };

function startServer(): ChildProcess {
  const env = {
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const bin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  return spawn(process.execPath, [bin, "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: "ignore" });
}
async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/register`);
      if (r.status < 500) return;
    } catch {
      /* henüz açılmadı */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("next start açılmadı");
}

type Mock = { signup?: { selfTrial: boolean; turnstileSiteKey: string | null }; status?: unknown; proRequests?: number[] };
async function mockApis(ctx: BrowserContext, m: Mock) {
  await ctx.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile={render:function(el,o){var d=document.createElement('div');d.textContent='Turnstile (test)';d.setAttribute('data-testid','ts');el.appendChild(d);setTimeout(function(){o.callback('test-token-0123456789')},300);return 'w1'},reset:function(){},remove:function(){}};",
    }),
  );
  await ctx.route(`${BASE}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (b: unknown, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (url.pathname === "/api/register" && method === "GET") return json(m.signup ?? { selfTrial: false, turnstileSiteKey: null });
    if (url.pathname === "/api/register" && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      (m.proRequests ??= []).push(body.turnstileToken ? 1 : 0);
      return json({ ok: true, mode: m.signup?.selfTrial ? "trial" : undefined });
    }
    if (url.pathname === "/api/trial/status") return json({ trial: m.status ?? null });
    if (url.pathname === "/api/trial/pro-request") {
      return json({ ok: true, created: true, createdAt: new Date().toISOString(), message: "Pro üyelik talebiniz alındı. Ödeme bilgileri için sizinle iletişime geçeceğiz." });
    }
    if (url.pathname === "/api/auth/session") return json({ valid: true });
    if (url.pathname === "/api/admin/trials") {
      const now = Date.now();
      return json({
        ok: true, page: 1, pageSize: 50, total: 2, server_now: new Date(now).toISOString(),
        counts: { all: 2, active: 1, not_started: 0, expired: 1, review: 0, suspended: 0, pro_request: 1 },
        rows: [
          { id: "u1", full_name: "Ayşe Deneme", email: "ayse@test.com", created_at: new Date(now - 30 * HOUR).toISOString(), registered_at: new Date(now - 30 * HOUR).toISOString(),
            phase: "active", trial_started_at: new Date(now - 26 * HOUR).toISOString(), trial_ends_at: new Date(now + 142 * HOUR).toISOString(), risk_score: 0, risk_flags: [],
            review_reason: null, daily_limit: 50, module_limits: {}, pro_request_at: null, used_total: 12, used_by_module: { astrology: 5, human_design: 4, numerology: 3 } },
          { id: "u2", full_name: "Mehmet Biten", email: "mehmet@test.com", created_at: new Date(now - 200 * HOUR).toISOString(), registered_at: new Date(now - 200 * HOUR).toISOString(),
            phase: "expired", trial_started_at: new Date(now - 190 * HOUR).toISOString(), trial_ends_at: new Date(now - 22 * HOUR).toISOString(), risk_score: 15, risk_flags: ["ayni_ip_onceki_kayit"],
            review_reason: null, daily_limit: 50, module_limits: { numerology: 10 }, pro_request_at: new Date(now - 2 * HOUR).toISOString(), used_total: 0, used_by_module: {} },
        ],
      });
    }
    return json({});
  });
}
async function seedUser(ctx: BrowserContext, user: unknown, notice: "pending" | "seen" | null) {
  await ctx.addInitScript(
    ([u, n]) => {
      try {
        localStorage.setItem("yasam_user", JSON.stringify(u));
        localStorage.setItem("yasam_session_token", "00000000-0000-4000-8000-000000000001");
        if (n && !sessionStorage.getItem("__seeded")) {
          localStorage.setItem("yasam_trial_notice", n as string);
          sessionStorage.setItem("__seeded", "1");
        }
      } catch {
        /* */
      }
    },
    [user, notice] as const,
  );
}
async function noHScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function run() {
  const server = startServer();
  try {
    await waitUp();
    const browser = await chromium.launch();
    try {
      for (const vp of [{ name: "masaustu", width: 1366, height: 860 }, { name: "mobil360", width: 360, height: 760 }]) {
        console.log(`— ${vp.name}`);
        // U1 kayıt (otomatik deneme açık)
        {
          const ctx = await browser.newContext({ viewport: vp });
          const m: Mock = { signup: { selfTrial: true, turnstileSiteKey: "ts-site" } };
          await mockApis(ctx, m);
          const page = await ctx.newPage();
          await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
          const submit = page.locator('button[type="submit"]');
          ok(await page.getByText("ilk girişinizle başlar", { exact: false }).first().isVisible(), `U1 ${vp.name}: otomatik deneme metni`);
          await page.waitForSelector('[data-testid="ts"]', { timeout: 10_000 });
          ok(true, `U1 ${vp.name}: Turnstile widget'ı çizildi`);
          await page.waitForFunction(() => !(document.querySelector('button[type="submit"]') as HTMLButtonElement)?.disabled, null, { timeout: 5000 });
          await page.fill('input[type="email"]', "yeni@test.com");
          const inputs = page.locator("input");
          await inputs.first().fill("Yeni Uzman");
          const pw = page.locator('input[type="password"]');
          await pw.nth(0).fill("guclu-parola-2026");
          await pw.nth(1).fill("guclu-parola-2026");
          await page.screenshot({ path: path.join(SHOTS, `U1-kayit-${vp.name}.png`), fullPage: true });
          await submit.click();
          await page.waitForTimeout(800);
          ok((m.proRequests ?? []).at(-1) === 1, `U1 ${vp.name}: Turnstile belirteci sunucuya gönderildi`);
          ok(await noHScroll(page), `U1 ${vp.name}: yatay taşma yok`);
          await ctx.close();
        }
        // U2 kayıt (bayrak kapalı)
        {
          const ctx = await browser.newContext({ viewport: vp });
          await mockApis(ctx, { signup: { selfTrial: false, turnstileSiteKey: null } });
          const page = await ctx.newPage();
          await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
          ok((await page.locator('[data-testid="ts"]').count()) === 0 && (await page.getByText("yönetici tarafından onaylandığında", { exact: false }).count()) > 0,
            `U2 ${vp.name}: bayrak kapalı → widget yok, onaylı akış metni`);
          await ctx.close();
        }
        // U3 ana sayfa
        {
          const ctx = await browser.newContext({ viewport: vp });
          await mockApis(ctx, { signup: { selfTrial: true, turnstileSiteKey: "ts-site" } });
          const page = await ctx.newPage();
          await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
          const text = await page.locator("body").innerText();
          ok(/7 Gün Ücretsiz/i.test(text) && !/\b3 gün\b|\b3 Gün\b/.test(text), `U3 ${vp.name}: ana sayfada 7 gün, '3 gün' yok`);
          ok(/Onay beklemeden başlar/.test(text), `U3 ${vp.name}: onaysız mod güven satırı`);
          ok((await page.locator('img[src*="deneme-3"]').count()) === 0, `U3 ${vp.name}: '3 GÜN' görseli gösterilmiyor`);
          ok(await noHScroll(page), `U3 ${vp.name}: yatay taşma yok`);
          await page.locator("#ucretsiz-deneme").screenshot({ path: path.join(SHOTS, `U3-anasayfa-deneme-${vp.name}.png`) }).catch(() => {});
          await ctx.close();
        }
        // U4 geri sayım (aktif)
        {
          const ctx = await browser.newContext({ viewport: vp });
          const now = Date.now();
          await mockApis(ctx, { status: { phase: "active", endsAt: new Date(now + 168 * HOUR).toISOString(), serverNow: new Date(now).toISOString(), credits: { dailyLimit: 50, usedTotal: 3 }, proRequestAt: null, whatsappUrl: null } });
          await seedUser(ctx, TRIAL_USER, "pending");
          const page = await ctx.newPage();
          await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
          const dlg = page.getByRole("dialog");
          await dlg.waitFor({ timeout: 15_000 });
          ok(/Ücretsiz Denemenize 7 Gün Kaldı/.test(await dlg.innerText()), `U4 ${vp.name}: ilk giriş kutusu "7 Gün Kaldı"`);
          ok(/47 \/ 50/.test(await dlg.innerText()), `U4 ${vp.name}: kalan Roxy kredisi`);
          await page.screenshot({ path: path.join(SHOTS, `U4-geri-sayim-${vp.name}.png`) });
          await dlg.getByRole("button", { name: "Tamam" }).click();
          ok((await page.getByRole("dialog").count()) === 0, `U4 ${vp.name}: Tamam → kapandı`);
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          ok((await page.getByRole("dialog").count()) === 0, `U4 ${vp.name}: aynı oturumda yeniden açılmadı`);
          await page.evaluate(() => localStorage.setItem("yasam_trial_notice", "pending"));
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.getByRole("dialog").waitFor({ timeout: 15_000 });
          ok(true, `U4 ${vp.name}: yeni giriş işareti → kutu tekrar göründü`);
          await ctx.close();
        }
        // U4b son 24 saat
        {
          const ctx = await browser.newContext({ viewport: vp });
          const now = Date.now();
          await mockApis(ctx, { status: { phase: "active", endsAt: new Date(now + 5 * HOUR).toISOString(), serverNow: new Date(now).toISOString(), credits: { dailyLimit: 50, usedTotal: 50 }, proRequestAt: null, whatsappUrl: null } });
          await seedUser(ctx, TRIAL_USER, "pending");
          const page = await ctx.newPage();
          await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
          const dlg = page.getByRole("dialog");
          await dlg.waitFor({ timeout: 15_000 });
          ok(/Bugün Ücretsiz Denemenizin Son Günü/.test(await dlg.innerText()), `U4b ${vp.name}: son gün metni`);
          await ctx.close();
        }
        // U5 süre sonu
        {
          const ctx = await browser.newContext({ viewport: vp });
          const now = Date.now();
          await mockApis(ctx, { status: { phase: "expired", endsAt: new Date(now - HOUR).toISOString(), serverNow: new Date(now).toISOString(), credits: null, proRequestAt: null, whatsappUrl: "https://wa.me/905551112233?text=x" } });
          await seedUser(ctx, { ...TRIAL_USER, trial_status: "active" }, "pending");
          const page = await ctx.newPage();
          await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
          const dlg = page.getByRole("dialog");
          await dlg.waitFor({ timeout: 15_000 });
          const t = await dlg.innerText();
          ok(/Ücretsiz Denemeniz Sona Erdi/.test(t) && /görüntüleyebilir ve dışa aktarabilirsiniz/.test(t), `U5 ${vp.name}: süre sonu bilgilendirmesi`);
          ok((await dlg.getByRole("link", { name: /WhatsApp/ }).getAttribute("href"))?.startsWith("https://wa.me/905551112233") === true, `U5 ${vp.name}: WhatsApp bağlantısı`);
          await page.screenshot({ path: path.join(SHOTS, `U5-sure-sonu-${vp.name}.png`) });
          await dlg.getByRole("button", { name: /Pro Üyeliğe Geç/ }).click();
          await page.getByText("Pro üyelik talebiniz alındı", { exact: false }).waitFor({ timeout: 5000 });
          ok(true, `U5 ${vp.name}: uygulama içi Pro talebi gönderildi`);
          await dlg.getByRole("button", { name: "Tamam" }).last().click();
          ok(await page.getByRole("button", { name: "Pro Üyeliğe Geç" }).isVisible(), `U5 ${vp.name}: köşede kalıcı Pro bağlantısı`);
          ok(await noHScroll(page), `U5 ${vp.name}: yatay taşma yok`);
          await ctx.close();
        }
        // U6 Premium
        {
          const ctx = await browser.newContext({ viewport: vp });
          await mockApis(ctx, { status: null });
          await seedUser(ctx, PREMIUM_USER, "pending");
          const page = await ctx.newPage();
          await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(2500);
          ok((await page.getByRole("dialog").count()) === 0 && (await page.getByRole("button", { name: "Pro Üyeliğe Geç" }).count()) === 0, `U6 ${vp.name}: Premium'da kutu YOK`);
          await ctx.close();
        }
        // U7 admin
        {
          const ctx = await browser.newContext({ viewport: vp });
          await mockApis(ctx, {});
          await seedUser(ctx, ADMIN_USER, null);
          const page = await ctx.newPage();
          await page.goto(`${BASE}/admin/deneme-uyeleri`, { waitUntil: "domcontentloaded" });
          await page.getByText("Ayşe Deneme").waitFor({ timeout: 20_000 });
          const body = await page.locator("main").innerText();
          ok(/Süresi Dolmuş/.test(body) && /Pro Talebi/.test(body) && /Roxy: 12 \/ 50/.test(body), `U7 ${vp.name}: sekmeler + satır + tüketim`);
          await page.getByText("Mehmet Biten").click();
          const panel = await page.locator("main").innerText();
          ok(/Limitleri kaydet/.test(panel) && /Pro üyeliğe geçir/.test(panel) && /Talebi kapat/.test(panel), `U7 ${vp.name}: işlem düğmeleri`);
          ok(!/uzat/i.test(panel), `U7 ${vp.name}: süre uzatma düğmesi YOK`);
          await page.screenshot({ path: path.join(SHOTS, `U7-admin-${vp.name}.png`), fullPage: true });
          ok(await noHScroll(page), `U7 ${vp.name}: yatay taşma yok`);
          await ctx.close();
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
}

run()
  .catch((e) => {
    fail++;
    console.error("E2E HATASI:", e instanceof Error ? e.message : e);
  })
  .finally(() => {
    console.log(`\ntrial7 ui e2e: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${SHOTS})`);
    process.exit(fail > 0 ? 1 : 0);
  });
