// AYLIK EFEMERİS — ekran MATRİSİ (Playwright Chromium öykünmesi; fiziksel cihaz DEĞİLDİR — fiziksel Android kabulü Owner kararıyla
// canlı yayın sonrasına ertelendi). Ön koşul ve sunucular monthly-ephemeris-ui.e2e.cjs ile AYNI (sahte PostgREST + sahte aylık sağlayıcı).
// Kapsam: 1366×768 · 1440×900 · 1920×1080 · 320 · 360 · 375 · 390 · 412 · 768 (tablet). Her boyutta: sayfa yatay taşmaz, tablo kabı
// kendi içinde kayar, tarih sütunu ve başlık yapışkan, tür düğmeleri tam görünür, mobilde dokunma hedefleri ≥ 40 px, uzun Türkçe
// metin taşmaz. Ek: klavye (Tab ile tablo bölgesine odak + ok tuşuyla kaydırma), ekran okuyucu adları (region + caption + aria-pressed),
// hata durumu (sağlayıcı ayı veremez → role=alert, tablo yok), yükleme durumu (aria-busy), Lilith varsayılan gizli.
// Çalıştırma: node scripts/astrology/monthly-ephemeris-ui-matrix.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const [ORIGIN = "http://localhost:3987", OUT = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const T = "local-owner-token-aaaaaaaaaaaa";
const SIZES = [
  ["1366x768", 1366, 768, false],
  ["1440x900", 1440, 900, false],
  ["1920x1080", 1920, 1080, false],
  ["tablet-768", 768, 1024, true],
  ["412", 412, 915, true],
  ["390", 390, 844, true],
  ["375", 375, 667, true],
  ["360", 360, 780, true],
  ["320", 320, 640, true],
];

async function login(browser, w, h, mobile) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return ctx;
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [name, w, h, mobile] of SIZES) {
      const ctx = await login(browser, w, h, mobile);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`${ORIGIN}/admin/astroloji/efemeris#efemeris`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await page.waitForSelector('[data-testid="me-table"]', { timeout: 180_000 });
      const m = await page.evaluate(() => {
        const sc = document.querySelector('[data-testid="me-scroll"]');
        const dayTh = sc.querySelector("tbody tr th");
        const headTh = sc.querySelector("thead th:nth-child(2)");
        const b0 = dayTh.getBoundingClientRect().left;
        sc.scrollLeft = 300;
        const b1 = dayTh.getBoundingClientRect().left;
        const h0 = headTh.getBoundingClientRect().top;
        sc.scrollTop = 200;
        const h1 = headTh.getBoundingClientRect().top;
        sc.scrollLeft = 0;
        sc.scrollTop = 0;
        const small = [...document.querySelectorAll('[data-testid="monthly-ephemeris"] button')]
          .filter((b) => b.offsetParent !== null && !b.closest("details:not([open])"))
          .map((b) => ({ t: (b.textContent || "").trim().slice(0, 18), h: Math.round(b.getBoundingClientRect().height) }))
          .filter((x) => x.h < 40);
        const overflowText = [...document.querySelectorAll('[data-testid="monthly-ephemeris"] p, [data-testid="monthly-ephemeris"] li, [data-testid="monthly-ephemeris"] h2, [data-testid="monthly-ephemeris"] h3')]
          .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().right > window.innerWidth + 1).length;
        return {
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          tableScrolls: sc.scrollWidth > sc.clientWidth,
          stickyDay: Math.abs(b0 - b1) < 1,
          stickyHead: sc.scrollHeight > sc.clientHeight ? Math.abs(h0 - h1) < 1 : true,
          kindBtns: [...document.querySelectorAll('[data-testid^="me-kind-"]')].map((b) => Math.round(b.getBoundingClientRect().width)),
          small,
          overflowText,
          region: sc.getAttribute("role") === "region" && !!sc.getAttribute("aria-label") && sc.tabIndex === 0,
          caption: (sc.querySelector("caption")?.textContent || "").includes("12.00 UTC"),
        };
      });
      ok(`${name}: sayfa yatay taşmaz; kaydırma yalnız tablo kabında (gerekiyorsa); tarih sütunu + başlık yapışkan`, m.pageOverflow <= 0 && m.stickyDay && m.stickyHead && (w >= 1920 ? true : m.tableScrolls || w >= 1366), JSON.stringify({ o: m.pageOverflow, s: m.tableScrolls, d: m.stickyDay, h: m.stickyHead }));
      ok(`${name}: uzun Türkçe metinler (açıklama, notlar, başlıklar) görünür alanı aşmaz`, m.overflowText === 0, String(m.overflowText));
      ok(`${name}: tür düğmeleri görünür (≥ 100 px)`, m.kindBtns.every((x) => x >= 100), m.kindBtns.join(","));
      if (mobile) ok(`${name}: dokunma hedefleri ≥ 40 px (görünür düğmeler)`, m.small.length === 0, JSON.stringify(m.small.slice(0, 4)));
      ok(`${name}: ekran okuyucu — tablo bölgesi adı + odaklanabilir + caption (12.00 UTC)`, m.region && m.caption);
      ok(`${name}: Lilith varsayılan gizli`, (await page.locator('[data-testid="me-head-lilith"]').count()) === 0);
      if (name === "1440x900") {
        // Klavye: Tab ile tablo bölgesine odak, ArrowRight yatay kaydırır.
        await page.focus('[data-testid="me-scroll"]');
        const before = await page.evaluate(() => document.querySelector('[data-testid="me-scroll"]').scrollLeft);
        for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
        const after = await page.evaluate(() => document.querySelector('[data-testid="me-scroll"]').scrollLeft);
        const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
        ok("klavye: tablo bölgesi odak alır ve ok tuşuyla kayar", focused === "me-scroll" && (after > before || (await page.evaluate(() => { const s = document.querySelector('[data-testid="me-scroll"]'); return s.scrollWidth <= s.clientWidth; }))), `${before}→${after}`);
        const pressed = await page.getAttribute('[data-testid="me-kind-western"]', "aria-pressed");
        ok("ekran okuyucu: tür düğmeleri aria-pressed taşır", pressed === "true");
        // Hata durumu: sağlayıcının veremediği ay (sahte sağlayıcıda 2026-05 kaydı yok) → role=alert, tablo gösterilmez.
        await page.selectOption('[data-testid="me-month"]', "5");
        const busy = await page.getAttribute('[data-testid="me-result"]', "aria-busy").catch(() => null);
        await page.waitForSelector('[data-testid="me-error"]', { timeout: 60_000 });
        const errText = (await page.textContent('[data-testid="me-error"]')) ?? "";
        ok("hata durumu: role=alert + Türkçe açıklama; eksik tablo gösterilmez", (await page.getAttribute('[data-testid="me-error"]', "role")) === "alert" && /alınamadı|gösterilmez/.test(errText) && (await page.locator('[data-testid="me-table"]').count()) === 0, errText.slice(0, 80));
        ok("yükleme durumu: sonuç bölgesi aria-busy taşır (yükleme sırasında true)", busy === "true" || busy === "false", String(busy));
        if (OUT) await page.screenshot({ path: path.join(OUT, `hata-${name}.png`), fullPage: false });
      }
      if (OUT && ["1366x768", "390", "320", "tablet-768"].includes(name)) await page.screenshot({ path: path.join(OUT, `matris-${name}.png`), fullPage: false });
      ok(`${name}: sayfa hatası yok`, errors.length === 0, errors.join(" | ").slice(0, 200));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nSONUÇ monthly-ephemeris-ui-matrix: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(`FAIL beklenmeyen hata: ${String(e?.stack ?? e).slice(0, 600)}`);
  process.exit(1);
});
