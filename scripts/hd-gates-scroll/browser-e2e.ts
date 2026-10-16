/**
 * HD canlı geri bildirim — GERÇEK TARAYICI: tam ekran analizde tek dikey scroll + Sistem Yorumu Kapılar.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-gates-scroll/browser-e2e.ts [-- --out <klasör>]
 *
 * Veri: yerel gömülü PG + GERÇEK route handler'ları + sahte Roxy (kayıtlı fixture). Next sunucusuna Roxy
 * anahtarı verilmez → tarayıcıda Roxy çağrısı yapılamaz (istekler ayrıca izlenir).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { FIXTURE, TA, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-gates-scroll-browser");
const PORT = 3988;
const APP = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean; ua?: string };
const DEVICES: Device[] = [
  { name: "masaüstü 1366", viewport: { width: 1366, height: 900 }, mobile: false },
  { name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" },
];

/** Görünür, DİKEY olarak gerçekten kaydırılabilir öğeler (document dahil). */
async function verticalScrollers(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.scrollingElement as HTMLElement;
    const docStyle = getComputedStyle(document.documentElement);
    if (doc.scrollHeight > doc.clientHeight + 1 && docStyle.overflowY !== "hidden" && getComputedStyle(document.body).overflowY !== "hidden") out.push("document");
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const s = getComputedStyle(el);
      if (!/(auto|scroll)/.test(s.overflowY)) continue;
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || s.visibility === "hidden") continue;
      out.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`);
    }
    return out;
  });
}

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54418, dirName: "hd-gates-scroll-browser-pgdata", httpPort: 54523 });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  const external: string[] = [];
  let browserRoxy = 0;
  try {
    const U: Auth = await mkUser(su, "GS", TA, { human_design: true, clients: true, hd_system_reading: true });
    const routes = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
    };
    const created = await callRoute(routes.journey.POST, "POST", U, {
      action: "create_new", ad: "Deniz", soyad: "Kaya", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(),
    });
    const hd = String(created.json.hd_client_id);
    const c = await callRoute(routes.roxy.POST, "POST", U, { client_id: hd, location_id: "client" });
    const chartId = String(c.json.id);
    ok(created.status === 200 && c.json.ok === true && roxy.state.calls === 1, "tohum: danışan + 1 kayıtlı Roxy analizi (sahte Roxy, yalnız tohumda)", { c: c.json });
    roxy.restore();
    const seedCalls = roxy.state.calls;
    const rawGates = (JSON.parse(FIXTURE) as Json).gates as Array<{ gate: number; gateDescription: string }>;
    const uniqueGates = [...new Set(rawGates.map((g) => g.gate))].sort((a, b) => a - b);

    const user: Json = {
      id: U.id, tenant_id: TA, full_name: "ZZ_HDGS", email: "zz.hdgs@example.test", role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false,
      module_permissions: { human_design: true, clients: true, hd_system_reading: true },
    };
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    for (const d of DEVICES) {
      section(d.name);
      const ctx = await browser.newContext({ viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", ...(d.ua ? { userAgent: d.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([u, tok]) => {
        localStorage.setItem("yasam_user", u as string);
        localStorage.setItem("yasam_session_token", tok as string);
      }, [JSON.stringify(user), U.token!]);
      const page = await ctx.newPage();
      page.on("request", (r) => {
        const u = r.url();
        if (/\/api\/hd\/charts\/roxy/.test(u)) browserRoxy++;
        if (!/^(https?:\/\/(127\.0\.0\.1|localhost)|data:|blob:|about:)/.test(u)) external.push(u);
      });
      page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));

      await page.goto(`${APP}/human-design/danisanlar/${hd}`);
      const item = page.locator(`[data-hd-history-item$=":${chartId}"]`);
      await item.waitFor({ timeout: 90_000 });
      // Sayfayı biraz aşağı kaydır → kapanınca aynı konuma dönmeli.
      await item.scrollIntoViewIfNeeded();
      const maxY = await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
      const targetY = Math.max(0, Math.min(250, maxY));
      await page.evaluate((y) => window.scrollTo(0, y), targetY);
      const yBefore = await page.evaluate(() => window.scrollY);
      const pageScrollers = await verticalScrollers(page);

      const openModal = async () => {
        await item.getByRole("button", { name: "Analizi Aç" }).click();
        const dlg = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
        await dlg.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 60_000 });
        return dlg;
      };
      const dlg = await openModal();

      const ov = await page.evaluate(() => [getComputedStyle(document.documentElement).overflowY, getComputedStyle(document.body).overflowY]);
      ok(ov[0] === "hidden" && ov[1] === "hidden", `${d.name}: modal açıkken arka sayfa kilitli (html/body overflow hidden)`, ov);
      const scrollers = await verticalScrollers(page);
      ok(scrollers.length === 1 && scrollers[0]!.includes("overflow-y-auto"), `${d.name}: modal içinde TEK dikey scroll alanı (document dahil değil)`, { scrollers, pageBefore: pageScrollers });

      await page.mouse.move(d.viewport.width / 2, d.viewport.height / 2);
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(300);
      const yDuring = await page.evaluate(() => window.scrollY);
      ok(yDuring === yBefore, `${d.name}: tekerlek arka sayfayı kaydırmaz`, { yBefore, yDuring });

      const tb = dlg.locator("[data-hd-toolbar]");
      const tbTop0 = (await tb.boundingBox())!.y;
      const bottom = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="hd-computed-detay-title"] .overflow-y-auto')!;
        el.scrollTop = el.scrollHeight;
        return { top: el.scrollTop, ch: el.clientHeight, sh: el.scrollHeight };
      });
      await page.waitForTimeout(200);
      const tbTop1 = (await tb.boundingBox())!.y;
      ok(Math.abs(tbTop0 - tbTop1) < 1 && tbTop0 >= -0.5 && tbTop0 < 2, `${d.name}: Word / Sil / Kapat çubuğu üstte sabit`, { tbTop0, tbTop1 });
      ok(bottom.top + bottom.ch >= bottom.sh - 2, `${d.name}: içerik en alta kadar kaydırılabilir`, bottom);
      const tbBtns = await tb.evaluate((n, w) => Array.from(n.querySelectorAll("button")).every((b) => { const r = b.getBoundingClientRect(); return r.right <= w + 0.5 && r.left >= -0.5; }), d.viewport.width);
      ok(tbBtns && (await tb.getByRole("button", { name: "Kapat" }).isVisible()) && (await tb.getByRole("button", { name: /Sil/ }).isVisible()), `${d.name}: araç çubuğu düğmeleri ekranda`);
      const noH = await page.evaluate(() => { const el = document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="hd-computed-detay-title"] .overflow-y-auto')!; return el.scrollWidth <= el.clientWidth + 1; });
      ok(noH, `${d.name}: modal içeriğinde yatay taşma yok`);

      // Sistem Yorumu → Kapılar
      await dlg.getByRole("tab", { name: "Sistem Yorumu" }).click();
      const sr = dlg.locator("[data-hd-system-reading]");
      await sr.waitFor({ timeout: 30_000 });
      ok(await sr.getByText(`Kapılar (${uniqueGates.length})`, { exact: true }).isVisible(), `${d.name}: 'Kapılar (${uniqueGates.length})' bölümü görünür`);
      ok(await sr.getByText(`Aktivasyonlar (${rawGates.length})`, { exact: true }).isVisible(), `${d.name}: 'Aktivasyonlar (${rawGates.length})' korunur`);
      await sr.getByText(`Kapılar (${uniqueGates.length})`, { exact: true }).click();
      const order = await sr.locator("[data-hd-sr-gate]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-hd-sr-gate"))));
      ok(JSON.stringify(order) === JSON.stringify(uniqueGates), `${d.name}: kapılar benzersiz ve 1→64 sıralı`, order);
      const first = uniqueGates[0]!;
      await sr.locator(`[data-hd-sr-gate="${first}"]`).click();
      const expected = rawGates.find((g) => g.gate === first)!.gateDescription.slice(0, 40);
      const firstFold = sr.locator("[data-hd-sr-gates] > details", { has: page.locator(`[data-hd-sr-gate="${first}"]`) });
      ok((await firstFold.innerText()).includes(expected), `${d.name}: ${first}. Kapı açılınca kayıtlı Roxy kapı açıklaması görünür`);
      ok((await dlg.locator("[data-hd-sr-gates]").locator("[data-hd-sr-gate-empty]").count()) === 0, `${d.name}: kayıtlı açıklaması olan kapılarda boş durum yok`);
      ok((await verticalScrollers(page)).length === 1, `${d.name}: Sistem Yorumu açıkken de tek dikey scroll`);
      await page.screenshot({ path: path.join(OUT, `kapilar-${d.name}.png`) });

      // Kapat → kilit kalkar, konum korunur
      await tb.getByRole("button", { name: "Kapat" }).click();
      await dlg.waitFor({ state: "detached", timeout: 10_000 });
      const after = await page.evaluate(() => ({ y: window.scrollY, h: getComputedStyle(document.documentElement).overflowY, b: getComputedStyle(document.body).overflowY, inlineH: document.documentElement.style.overflow, inlineB: document.body.style.overflow }));
      ok(after.h !== "hidden" && after.b !== "hidden" && after.inlineH === "" && after.inlineB === "", `${d.name}: Kapat sonrası sayfa kaydırması geri gelir`, after);
      ok(after.y === yBefore, `${d.name}: Kapat sonrası önceki scroll konumu korunur`, { yBefore, y: after.y });

      // ESC ile kapatma da temizler
      const dlg2 = await openModal();
      await page.keyboard.press("Escape");
      await dlg2.waitFor({ state: "detached", timeout: 10_000 });
      const afterEsc = await page.evaluate(() => ({ y: window.scrollY, inlineH: document.documentElement.style.overflow, inlineB: document.body.style.overflow }));
      ok(afterEsc.inlineH === "" && afterEsc.inlineB === "" && afterEsc.y === yBefore, `${d.name}: ESC ile kapatma da kilidi kaldırır, konum korunur`, afterEsc);
      await ctx.close();
    }

    section("Genel");
    ok(browserRoxy === 0 && roxy.state.calls === seedCalls, "tarayıcı testinde Roxy çağrısı 0", { browserRoxy });
    ok(external.length === 0 && roxy.state.external.length === 0, "harici ağ isteği yok", external.slice(0, 5));
    ok(errors.length === 0, "sayfa JS hatası yok", errors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD KAPILAR + SCROLL TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
