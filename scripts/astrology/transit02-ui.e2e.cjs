// TRANSİT-02 (2026-10-17) — Vedik Gochara ekran testi (Playwright Chromium). YEREL; sahte DB + sahte Roxy (KATI golden).
// Önkoşul: transit01-ui.e2e.cjs ile aynı yerel sunucu (next start + dev-fake-backend).
// Çalıştırma: node scripts/astrology/transit02-ui.e2e.cjs <genişlik> <yükseklik> <fake-backend.log> [android] [port]
//   Gochara: Lahiri + 07.10.2026 12:00 İstanbul (golden an) → ev şeridi, Türkçe teknik özet (9 graha), terimler,
//   ayanamsa derecesi; yatay taşma yok; konsol hatası yok; Word/PDF (API) indirilir. Fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");

const [W = "1366", H = "860", LOG = "", UA = "", PORT = "3941"] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const android = UA === "android";
const tag = `${width}px${android ? " Android-UA" : ""}`;
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/admin/astroloji`;
const API = `${ORIGIN}/api/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}`, origin: ORIGIN };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const api = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    /* ikili */
  }
  return { status: r.status, json, buf };
};

(async () => {
  const prof = await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`);
  const pid = prof.json?.profiles?.[0]?.id;
  ok("hazırlık: golden doğum profili", typeof pid === "string");
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    ...(android ? { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36" } : {}),
  });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("dialog", (d) => void d.dismiss());

  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
  await page.locator("[data-portal=new]").first().click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
  await page.waitForTimeout(1200);
  await page.locator("[data-system=vedic]").first().click();
  await page.waitForTimeout(400);
  await page.locator("button[data-technique='vedic.transit']").first().click();
  await page.locator("[data-technique-focus='vedic.transit']").first().click();
  await page.waitForTimeout(400);
  const settings = page.locator("[data-testid=atlas-technique-settings]").first();
  await settings.locator("input[type=radio]").nth(1).check();
  await settings.locator('input[aria-label="Gochara tarihi"]').fill("2026-10-07");
  await settings.locator('input[aria-label="Gochara saati"]').fill("12:00");
  await settings.locator('select[aria-label="Gochara saat dilimi"]').selectOption("Europe/Istanbul");
  await page.waitForTimeout(1500);
  const h0 = hits();
  await page.locator("[data-testid=astro-run]").click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 120000 });
  await page.waitForTimeout(1200);
  if (LOG) ok("Gochara hesabı ≤ 1 sağlayıcı isteği", hits() - h0 <= 1, String(hits() - h0));
  await page.waitForSelector("[data-testid=astro-vedic-transit-panel]", { timeout: 30000 });
  const head = (await page.locator("[data-testid=astro-vedic-transit-panel] p").first().textContent()) ?? "";
  // 24.10.2026: çerçeve derecesi DOĞUM anının Lahiri değeridir; transit konumları transit anının Lahiri değeriyle hesaplanır (etiket düzeltmesi).
  ok("başlık: sidereal Lahiri (sabit; transit anının Lahiri değeri, doğum anı derecesi natal için) + Janma Rashi + Lagna", /Lahiri/.test(head) && /transit anının Lahiri değeriyle/.test(head) && /doğum anı \d+°/.test(head) && !/sabit, \d+°/.test(head) && /Janma Rashi/.test(head), head.slice(0, 220));
  ok("ev şeridi (12 kutu)", (await page.locator("[data-testid=astro-vedic-transit-moonstrip] li").count()) === 12);
  const sm = page.locator("[data-testid=astro-vedic-transit-summary] [data-gochara-summary]");
  ok("Türkçe teknik özet: 9 graha", (await sm.count()) === 9, String(await sm.count()));
  const first = (await sm.first().textContent()) ?? "";
  ok("özet cümlesi Türkçe teknik terimlerle (Janma Rashi'den … ev · Lagna'dan … bhava · kaksha)", /Janma Rashi'den \d+\. ev/.test(first) && /Lagna'dan \d+\. bhava/.test(first) && /kaksha \d\/8/.test(first), first.slice(0, 120));
  ok("özette İngilizce anlatı yok", !/\b(the|transit of|is in)\b/i.test((await page.locator("[data-testid=astro-vedic-transit-summary]").textContent()) ?? ""));
  await page.locator("[data-testid=astro-vedic-transit-terms] summary").click();
  ok("Terimler açılır (Janma Rashi, Drishti, Kaksha, Bindu)", /Janma Rashi/.test((await page.locator("[data-testid=astro-vedic-transit-terms]").textContent()) ?? "") && /Bindu/.test((await page.locator("[data-testid=astro-vedic-transit-terms]").textContent()) ?? ""));
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok("sayfada yatay taşma yok", !over);

  const r = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: "vedic.transit", options: { ayanamsa: "lahiri", atUtc: "2026-10-07T09:00" } }] });
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: "vedic.transit", options: r.json.results[0].view.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  ok("Gochara kaydedildi", sv.status === 201, String(sv.status));
  if (sv.json?.analysisId) {
    const d = await api(`/analyses/${sv.json.analysisId}/report?format=docx`);
    const p = await api(`/analyses/${sv.json.analysisId}/report?format=pdf`);
    ok("Word (PK) + PDF (%PDF-) indirilir", d.status === 200 && d.buf.slice(0, 2).toString() === "PK" && p.status === 200 && p.buf.slice(0, 5).toString() === "%PDF-");
  }
  ok("konsol hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\ntransit02-ui [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
