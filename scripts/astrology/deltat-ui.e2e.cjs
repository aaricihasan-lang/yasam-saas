// ΔT BİLGİ NOTU (owner kararı 24.10.2026) — ekran regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı.
// Önkoşul: dev-fake-backend (+ FAKE_ROXY_CERT/KEY) ve yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true; bkz. stale-tz-ui.e2e.cjs).
// Çalıştırma: node scripts/astrology/deltat-ui.e2e.cjs <origin> <fake-backend.log> [genişlik] [yükseklik]
//   • API ile sentetik 1750 doğumlu profil açılır (gelecek doğum tarihi ürün tarafından kabul edilirse 2150 de).
//   • Ekran: profil hazırlık alanında doğum notu görünür (1800 öncesi / 2100 sonrası), yatay taşma yok; normal profilde not yok.
//   • Sağlayıcıya istek yapılmaz. Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const { chromium } = require("playwright");
const [ORIGIN = "http://localhost:3931", LOG = "", W = "1366", H = "860"] = process.argv.slice(2);
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${W}px] ${n}${x ? ` — ${x}` : ""}`);
};
const hits = () => (LOG ? (fs.readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : 0);
const API = `${ORIGIN}/api/admin/astroloji`;
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const HDR = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const api = async (p, b) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: HDR, body: b ? JSON.stringify(b) : undefined });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};

(async () => {
  const find = async (q) => (await api(`/profiles?q=${encodeURIComponent(q)}`)).j?.profiles?.[0]?.id ?? null;
  const mk = async (label, birthDate) => (await api("/profiles", { label, birthDate, birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" })).j?.profile?.id ?? (await find(label));
  const past = await mk("TEST · ΔT 1750", "1750-03-10");
  const future = await mk("TEST · ΔT 2150", "2150-03-10");
  const ali = await find("Ali Örnek");
  ok("tohum: 1750 sentetik profil + normal profil", !!past && !!ali);
  console.log(`bilgi: 2150 doğum profili ${future ? "açıldı" : "ürün tarafından kabul edilmedi (gelecek doğum) — yalnız 1750 sınanır"}`);
  const h0 = hits();
  const browser = await chromium.launch();
  const w = Number(W);
  const ctx = await browser.newContext({ viewport: { width: w, height: Number(H) }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, is_super_admin: true }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const pick = async (q, pid) => {
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill(q);
    await page.waitForTimeout(900);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
    await page.waitForTimeout(1500);
  };
  const noteText = async () => {
    await page.waitForSelector("[data-testid=atlas-delta-t-birth]", { timeout: 30000 }).catch(() => undefined);
    const n = page.locator("[data-testid=atlas-delta-t-birth]");
    return (await n.count()) && (await n.first().isVisible()) ? await n.first().innerText() : "";
  };
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  try {
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await pick("ΔT 1750", past);
    const t1 = await noteText();
    ok("1750 doğum: hazırlık alanında ΔT notu görünür", /Uzak tarih notu/.test(t1) && /1800 öncesi/.test(t1) && /tarihsel gözlem kayıtlarından tahmin edilir/.test(t1), t1.slice(0, 140));
    ok("not temkinli: hata/kesinlik dili yok, marka yok", t1 !== "" && !/hatalı|yanlış|etkilenmez|roxy/i.test(t1));
    ok("1750: yatay taşma yok", await noOverflow());
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/deltat-1750-${W}.png`, fullPage: true });
    if (future) {
      await pick("ΔT 2150", future);
      const t2 = await noteText();
      ok("2150 doğum: 2100 sonrası notu", /2100 sonrası/.test(t2) && /öngörüye dayanır/.test(t2), t2.slice(0, 140));
      ok("2150: yatay taşma yok", await noOverflow());
    }
    await pick("Ali Örnek", ali);
    await page.waitForTimeout(2500);
    ok("normal (1990) profil: ΔT notu yok", (await page.locator("[data-testid=atlas-delta-t-birth]").count()) === 0);
  } catch (e) {
    ok("ekran akışı hatasız", false, String(e).slice(0, 200));
  }
  await browser.close();
  ok("sağlayıcıya 0 istek", hits() === h0, `${hits() - h0}`);
  console.log(`\ndeltat ui e2e [${W}px]: ${pass} PASS / ${fail} FAIL (gerçek sağlayıcı çağrısı yok)`);
  process.exit(fail ? 1 : 0);
})();
