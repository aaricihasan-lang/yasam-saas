// YENİ ANALİZ ÜST ŞERİDİ (2026-10-30, Owner sadeleştirmesi) — yalnız "Danışan Seç" + "Analizi Başlat"; "Teknik Seç" ve
// "Ayarları Gözden Geçir" kartları YOK; plan ayrıntıları küçük "Plan" düğmesinde; çakışma / taşma ölçümü; Batı listesinde Horary girişi.
// YEREL; sahte DB (dev-fake-backend). Önkoşul: next sunucusu ASTROLOGY_MODULE_ENABLED=true + NEXT_PUBLIC_SUPABASE_URL=<fake>.
// Çalıştırma: node scripts/astrology/yeniAnalizSerit-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const [ORIGIN = "http://localhost:3971", OUT = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const T = "local-owner-token-aaaaaaaaaaaa";
const VIEWPORTS = [
  ["320", 320, 640],
  ["390", 390, 844],
  ["768", 768, 1024],
  ["1366", 1366, 768],
  ["1536", 1536, 864],
];
async function login(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return ctx;
}
/** Kutu ölçümü: görünür, ekran içinde, kırpılmıyor, metni taşmıyor; iki kutu çakışmıyor. */
const box = (loc) =>
  loc.evaluate((n) => {
    const r = n.getBoundingClientRect();
    let clipped = false;
    for (let p = n.parentElement; p; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== "visible") {
        const pr = p.getBoundingClientRect();
        if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) clipped = true;
      }
    }
    const overflowText = [n, ...n.querySelectorAll("*")].some((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && getComputedStyle(e).textOverflow !== "ellipsis" && e.clientWidth > 0);
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, vw: document.documentElement.clientWidth, clipped, overflowText, shown: r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== "hidden" };
  });
const overlap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [name, w, h] of VIEWPORTS) {
      const ctx = await login(browser, w, h);
      const page = await ctx.newPage();
      await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
      await page.locator('[data-portal="new"]').click({ timeout: 120000 });
      const plate = page.getByTestId("atlas-prep-plate");
      await plate.waitFor({ timeout: 60000 });
      const txt = await plate.innerText();
      ok(`${name}: "Teknik Seç" ve "Ayarları Gözden Geçir" kartı YOK`, !/Teknik Seç|Ayarları Gözden Geçir/.test(txt));
      const steps = page.locator('[data-testid="atlas-steps"] > li');
      const visibleSteps = [];
      for (let i = 0; i < (await steps.count()); i++) if ((await box(steps.nth(i))).shown) visibleSteps.push(i);
      ok(`${name}: üst şeritte ${w < 768 ? "1 kart (telefon: başlat alt konsolda)" : "2 kart"}`, visibleSteps.length === (w < 768 ? 1 : 2), String(visibleSteps.length));
      const hpw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${name}: yatay sayfa kaydırması yok`, hpw <= 0, String(hpw));
      if (OUT) await page.screenshot({ path: path.join(OUT, `${name}-1-bos.png`) });

      // Danışan seç (sentetik ilk danışan) + iki teknik.
      await page.getByTestId("atlas-client-trigger").first().click();
      const panel = page.getByTestId("atlas-client-panel");
      await panel.waitFor({ timeout: 30000 });
      await panel.getByRole("option").first().click().catch(async () => {
        await panel.locator("button").filter({ hasText: "Ali" }).first().click();
      });
      await page.getByTestId("atlas-birth-summary").waitFor({ timeout: 60000 });
      for (const id of ["western.natal", "western.transit"]) {
        const t = page.locator(`[data-technique="${id}"]`).first();
        if ((await t.getAttribute("aria-pressed")) !== "true") await t.click();
      }
      await page.waitForTimeout(1200);

      const client = await box(page.getByTestId("atlas-client-picker"));
      const nc = await box(page.getByTestId("atlas-new-client"));
      ok(`${name}: Danışan seçici ile "Yeni Danışan" çakışmıyor`, client.shown && nc.shown && !overlap(client, nc), JSON.stringify({ c: [client.l, client.r], n: [nc.l, nc.r] }));
      ok(`${name}: Danışan seçici en az 150 px`, client.w >= 150, String(Math.round(client.w)));
      ok(`${name}: "Yeni Danışan" ekran içinde, kırpılmıyor`, nc.l >= -0.5 && nc.r <= nc.vw + 0.5 && !nc.clipped && !nc.overflowText);
      const run = page.getByTestId("astro-run");
      ok(`${name}: tek görünür "Analizi Başlat" düğmesi`, (await run.count()) === 1);
      const rb = await box(run);
      ok(`${name}: başlat düğmesi ekran içinde, metni taşmıyor / kırpılmıyor`, rb.shown && rb.l >= -0.5 && rb.r <= rb.vw + 0.5 && !rb.clipped && !rb.overflowText, JSON.stringify(rb));
      ok(`${name}: başlat düğmesi ≥ 40 px yükseklik`, rb.h >= 40 - 0.5, String(Math.round(rb.h)));
      const toggle = page.getByTestId("atlas-plan-toggle");
      ok(`${name}: tek "Plan" ayrıntı düğmesi`, (await toggle.count()) === 1);
      const tb = await box(toggle);
      ok(`${name}: plan düğmesi başlat düğmesiyle çakışmıyor`, tb.shown && !overlap(tb, rb) && !tb.overflowText);
      if (w >= 768) {
        const runStep = await box(page.getByTestId("atlas-run-step"));
        const clientStep = await box(page.getByTestId("atlas-client-identity"));
        ok(`${name}: iki kart aynı satırda ve dengeli (başlat kartı ≥ %35)`, Math.abs(runStep.t - clientStep.t) < 1 && runStep.w / (runStep.w + clientStep.w) >= 0.35, `${Math.round(clientStep.w)} / ${Math.round(runStep.w)}`);
        const labels = page.locator('[data-testid="atlas-run-step"] span');
        let bad = 0;
        for (let i = 0; i < (await labels.count()); i++) {
          const lb = await box(labels.nth(i));
          if (lb.shown && overlap(lb, rb)) bad++;
        }
        ok(`${name}: başlat kartı metinleri düğmelerle çakışmıyor`, bad === 0, String(bad));
      }
      await toggle.click();
      ok(`${name}: plan düğmesi → plan ayrıntıları açılır`, await page.getByTestId("atlas-plan-details").isVisible());
      ok(`${name}: plan ayrıntılarında seçilen iki teknik`, (await page.locator('[data-testid="atlas-chosen"] [data-chip]').count()) === 2);
      if (OUT) await page.screenshot({ path: path.join(OUT, `${name}-2-secili-plan.png`) });
      await toggle.click();
      ok(`${name}: plan düğmesi → kapanır`, (await page.getByTestId("atlas-plan-details").count()) === 0);

      const entry = page.getByTestId("atlas-horary-entry");
      await entry.scrollIntoViewIfNeeded();
      const eb = await box(entry);
      ok(`${name}: Batı listesinde Horary girişi görünür, ekran içinde, metni taşmıyor`, eb.shown && eb.l >= -0.5 && eb.r <= eb.vw + 0.5 && !eb.overflowText);
      const natal = await box(page.locator('[data-technique-focus="western.natal"]').first().locator(".."));
      ok(`${name}: Horary satırı diğer tekniklerle aynı genişlikte`, Math.abs(eb.w - natal.w) < 1.5, `${Math.round(eb.w)} / ${Math.round(natal.w)}`);
      if (OUT) await entry.screenshot({ path: path.join(OUT, `${name}-3-horary-girisi.png`) });
      const before = await page.locator('[data-technique][aria-pressed="true"]').count();
      await entry.click();
      await page.getByTestId("horary-form").waitFor({ timeout: 60000 });
      ok(`${name}: Horary girişi → Horary ekranı`, page.url().endsWith("#horary-lilly"));
      ok(`${name}: Horary girişi seçili teknikleri değiştirmedi (önce ${before})`, before === 2);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nyeni analiz şerit UI e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
