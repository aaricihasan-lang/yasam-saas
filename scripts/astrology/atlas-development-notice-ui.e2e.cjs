// Gökyüzü Atlası — satış öncesi geliştirme bilgilendirmesi (05.11.2026): gerçek tarayıcı uçtan uca (Playwright Chromium).
// YEREL: next dev + dev-fake-backend (sahte PostgREST). Gerçek DB / sağlayıcı YOK; ROXY_API_KEY verilmez.
// Önkoşul: next sunucusu ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, SUPABASE_SERVICE_ROLE_KEY=<sahte>.
// Çalıştırma: node scripts/astrology/atlas-development-notice-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   F1 ilk giriş: pencere açılır, owner metni birebir, odak Tamam'da, arka plan inert, Esc / Tab / dış tıklama kapatmaz
//   F2 Tamam: kapanır, kapanış hiçbir ağ isteği üretmez, Atlas kullanılabilir (Yeni Analiz → Natal, Analiz Arşivi → kayıtlı Natal)
//   F3 aynı giriş: Atlas görünümleri, Gökyüzü Araçları sayfası, geri / ileri → yeniden açılmaz; kendiliğinden açılma döngüsü yok
//   F4 çıkış + yeniden giriş (bağlantıyla ve tarayıcı geri tuşuyla) → yeniden açılır; yenileme yeni giriştir → açılır
//   F5 owner kabuğu (/admin/astroloji) ve Atlas yetkisi olmayan kullanıcı → pencere yok
//   G  görsel: 1366×768, 390×844, 320×568 × gündüz / gece (prefers-color-scheme) — taşma yok, metin kesilmiyor, buton ≥ 44 px
// Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const [ORIGIN = "http://localhost:3989", OUT = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const OWNER = { id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "owner@example.test", role: "admin", active: true, module_permissions: {} };
const OWNER_TOKEN = "local-owner-token-aaaaaaaaaaaa";
const EXPERT = { id: "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e", tenant_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", full_name: "Uzman", email: "expert@example.test", role: "expert", active: true, module_permissions: {} };
const EXPERT_TOKEN = "local-expert-token-eeeeeeeeeee";

// Owner onaylı metin — bileşenden BAĞIMSIZ kopya.
const TITLE = "Gökyüzü Atlası — Bilgilendirme";
const P1 = "Bu modül aktiftir. Mevcut hesaplamalar test edilmiştir ve şu anda kullanılabilir.";
const P2 = "Geliştirmelerimiz devam ediyor; yeni haritalar ve hesaplamalar aşamalı olarak eklenecektir.";

let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIALOG = '[data-testid="atlas-development-notice"] [role="dialog"]';
const OK_BTN = '[data-testid="atlas-development-notice-ok"]';

async function newCtx(browser, user, token, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...opts });
  await ctx.addInitScript(
    ([u, tk]) => {
      try {
        localStorage.setItem("yasam_user", JSON.stringify(u));
        localStorage.setItem("yasam_session_token", tk);
      } catch {}
      // Pencerenin kaç kez DOM'a eklendiğini sayar (açılma döngüsü denetimi).
      window.__noticeOpens = 0;
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches?.('[data-testid="atlas-development-notice"]')) window.__noticeOpens++;
      }).observe(document, { childList: true, subtree: true });
    },
    [user, token],
  );
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "yasam_admin_session", value: token, domain: host, path: "/" }]);
  return ctx;
}
const visible = (page) => page.locator(DIALOG).isVisible().catch(() => false);
async function waitAtlas(page) {
  await page.waitForSelector("main", { timeout: 60_000 });
  await page.waitForFunction(() => /Yeni Analiz/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 60_000 });
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ── F1–F4: owner hesabıyla uzman yüzeyi (/astroloji) ──────────────────────────────────────────────
    const ctx = await newCtx(browser, OWNER, OWNER_TOKEN);
    const page = await ctx.newPage();
    const reqs = [];
    page.on("request", (r) => reqs.push(r.url()));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(`${ORIGIN}/astroloji`, { waitUntil: "domcontentloaded" });
    await waitAtlas(page);
    await page.waitForSelector(DIALOG, { timeout: 30_000 }).catch(() => {});
    ok("F1 ilk girişte pencere açılır", await visible(page));
    const d = page.locator(DIALOG);
    ok("F1 başlık birebir", (await d.locator("h2").innerText()).trim() === TITLE);
    const ps = (await d.locator("p").allInnerTexts()).map((s) => s.trim());
    ok("F1 iki paragraf birebir ve başka metin yok", ps.length === 2 && ps[0] === P1 && ps[1] === P2, JSON.stringify(ps));
    ok("F1 tek buton: Tamam", (await d.locator("button").count()) === 1 && (await d.locator("button").innerText()).trim() === "Tamam");
    ok("F1 aria-modal + başlık/açıklama bağları", (await d.getAttribute("aria-modal")) === "true" && !!(await d.getAttribute("aria-labelledby")) && !!(await d.getAttribute("aria-describedby")));
    ok("F1 odak Tamam'da", await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "atlas-development-notice-ok"));
    ok("F1 arka plan inert", await page.evaluate(() => [...document.body.children].filter((e) => !e.matches('[data-testid="atlas-development-notice"]') && e.tagName !== "SCRIPT").every((e) => e.inert)));
    await page.keyboard.press("Escape");
    await sleep(300);
    ok("F1 Esc kapatmaz", await visible(page));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    ok("F1 Tab / Shift+Tab odağı pencerede tutar", await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "atlas-development-notice-ok"));
    await page.mouse.click(10, 10);
    await sleep(300);
    ok("F1 dış tıklama kapatmaz", await visible(page));
    const hashBefore = await page.evaluate(() => location.hash);
    await page.mouse.click(300, 200, { force: true }).catch(() => {});
    await sleep(500);
    ok("F1 arka plandaki karta tıklama işlenmez", (await page.evaluate(() => location.hash)) === hashBefore && (await visible(page)));
    if (OUT) await page.screenshot({ path: path.join(OUT, "F1-acik-1366.png") });

    // F2 — Tamam: kapanış ağ isteği üretmez. Uygulamanın yüklemeden ~5 sn sonraki kendi oturum yoklaması (GET /api/auth/session,
    // tıklamasız kontrol penceresinde de görülür) ölçümü karıştırmasın diye ölçüm o yoklamadan SONRA yapılır.
    await page.waitForRequest((r) => r.url().includes("/api/auth/session"), { timeout: 15_000 }).catch(() => {});
    await sleep(1500);
    const n0 = reqs.length;
    await page.click(OK_BTN);
    await sleep(1500);
    const after = reqs.slice(n0);
    ok("F2 Tamam ile kapanır", !(await visible(page)));
    ok("F2 kapanış hiçbir ağ isteği üretmez (Roxy / API dahil)", after.length === 0, after.join(" | "));
    ok("F2 arka plan yeniden etkileşimli", await page.evaluate(() => [...document.body.children].every((e) => !e.inert)));
    ok("F2 sayfa kaydırması geri geldi", await page.evaluate(() => document.body.style.overflow !== "hidden"));

    // F2 — Atlas kullanılabilir: Yeni Analiz → Natal
    await page.getByRole("button", { name: /^Yeni Analiz/ }).first().click();
    await page.waitForFunction(() => location.hash === "#yeni-analiz", null, { timeout: 20_000 });
    await page.getByText("Natal", { exact: true }).first().click();
    await sleep(800);
    ok("F2 Yeni Analiz açılır, Natal tekniği seçilebilir", /Doğum anındaki gökyüzü/.test(await page.locator("main").innerText()));
    if (OUT) await page.screenshot({ path: path.join(OUT, "F2-yeni-analiz-natal.png") });
    // Natal sonucunu aç: seed danışan (Ali Örnek) + Natal (Placidus, gerçek düğüm) → önbellekteki sonuç (0 sağlayıcı isteği).
    const ali = await page.evaluate(async () => {
      const u = JSON.parse(localStorage.getItem("yasam_user"));
      const r = await fetch("/api/astroloji/profiles?q=Ali&limit=5", { headers: { "x-user-id": u.id, "x-session-token": localStorage.getItem("yasam_session_token") ?? "" } });
      const j = await r.json();
      return (j.profiles ?? []).find((x) => x.label.startsWith("Ali Örnek"))?.id ?? null;
    });
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
    await sleep(900);
    await page.locator("[data-testid=atlas-client-panel] [data-client-option]", { hasText: "Ali Örnek" }).first().click();
    await sleep(1200);
    const engineBefore = reqs.filter((u) => /\/engine\/run/.test(u)).length;
    await page.locator("button[data-technique='western.natal']").first().click();
    await sleep(1500);
    await page.getByRole("button", { name: /Analizi Başlat/ }).first().click();
    await page.waitForFunction(() => location.hash === "#analiz-sonucu", null, { timeout: 60_000 }).catch(() => {});
    await sleep(1500);
    const resText = await page.locator("main").innerText();
    ok("F2 Natal analizi açılır (sonuç ekranı, Natal sekmesi)", (await page.evaluate(() => location.hash)) === "#analiz-sonucu" && /ANALİZ SONUCU/i.test(resText) && /Natal/.test(resText), ali ?? "seed yok");
    ok("F2 Natal açılışı yeni hesap istemedi (önbellek)", /0 yeni|hazır|önceden/i.test(resText) || reqs.filter((u) => /\/engine\/run/.test(u)).length - engineBefore <= 1);
    if (OUT) await page.screenshot({ path: path.join(OUT, "F2-natal-sonuc.png") });
    // Diğer Atlas görünümleri
    for (const [btn, hash] of [["Analiz Arşivi", "#analiz-arsivi"], ["Bilgi Bankası", "#bilgi-bankasi"]]) {
      await page.goto(`${ORIGIN}/astroloji`, { waitUntil: "domcontentloaded" });
      await waitAtlas(page);
      await page.waitForSelector(DIALOG, { timeout: 30_000 });
      await page.click(OK_BTN);
      await page.getByRole("button", { name: new RegExp(`^${btn}`) }).first().click();
      await page.waitForFunction((h) => location.hash === h, hash, { timeout: 20_000 }).catch(() => {});
      ok(`F2 ${btn} görünümüne geçilir`, (await page.evaluate(() => location.hash)) === hash && !(await visible(page)));
    }
    ok("F3 Atlas içi gezinmede pencere yeniden açılmaz", !(await visible(page)));
    if (OUT) await page.screenshot({ path: path.join(OUT, "F2-kayitli-natal.png") });

    // F3 — aynı giriş: görünümler (hash), geri / ileri, Gökyüzü Araçları sayfası (tam sayfa geçiş) ve oradan Atlas'a dönüş
    await page.goto(`${ORIGIN}/astroloji`, { waitUntil: "domcontentloaded" });
    await waitAtlas(page);
    await page.waitForSelector(DIALOG, { timeout: 30_000 });
    await page.click(OK_BTN);
    const opensBefore = await page.evaluate(() => window.__noticeOpens);
    await page.getByRole("button", { name: /^Yeni Analiz/ }).first().click();
    await page.waitForFunction(() => location.hash === "#yeni-analiz", null, { timeout: 20_000 });
    await page.goBack();
    await sleep(800);
    await page.getByRole("button", { name: /^Analiz Arşivi/ }).first().click();
    await page.waitForFunction(() => location.hash === "#analiz-arsivi", null, { timeout: 20_000 });
    await page.goBack();
    await sleep(800);
    await page.goForward();
    await sleep(800);
    ok("F3 Atlas görünümleri + tarayıcı geri / ileri (aynı belge) yeniden açmaz", !(await visible(page)) && (await page.evaluate(() => window.__noticeOpens)) === opensBefore);
    await page.goBack();
    await sleep(800);
    await page.locator('a[href="/astroloji/efemeris"]').first().click();
    await page.waitForURL(/\/astroloji\/efemeris/, { timeout: 30_000 });
    await page.waitForFunction(() => /Tarih aralığına göre gökyüzü hesapları/.test(document.body.innerText), null, { timeout: 60_000 });
    await sleep(2000);
    ok("F3 Gökyüzü Araçları sayfasına (tam sayfa) geçiş yeniden açmaz", !(await visible(page)));
    if (OUT) await page.screenshot({ path: path.join(OUT, "F3-gokyuzu-araclari.png") });
    const back = page.locator('main a[href^="/astroloji"]:not([href^="/astroloji/efemeris"]), header a[href^="/astroloji"]:not([href^="/astroloji/efemeris"])').first();
    const backHref = (await back.count()) ? await back.getAttribute("href") : null;
    if (backHref) {
      await back.click();
      await page.waitForURL((u) => !u.pathname.startsWith("/astroloji/efemeris"), { timeout: 30_000 });
      await waitAtlas(page);
      await sleep(2000);
    }
    ok("F3 Gökyüzü Araçları → Atlas menü bağlantısıyla dönüş yeniden açmaz", !!backHref && !(await visible(page)), backHref ?? "bağlantı yok");
    const opensMid = await page.evaluate(() => window.__noticeOpens);
    await sleep(5000);
    ok("F3 açılma döngüsü yok (5 sn içinde yeni pencere eklenmedi)", (await page.evaluate(() => window.__noticeOpens)) === opensMid && !(await visible(page)));
    // BİLGİ (PASS/FAIL sayılmaz): doğrudan adresle girilip Gökyüzü Araçları'ndan TARAYICI GERİ tuşuyla dönülürse belge yeniden
    // yüklenebilir (bfcache yoksa); kalıcı kayıt kullanılmadığı için bu durumda pencere yeniden açılabilir.
    await page.locator('a[href="/astroloji/efemeris"]').first().click().catch(() => {});
    await page.waitForURL(/\/astroloji\/efemeris/, { timeout: 30_000 }).catch(() => {});
    await sleep(1500);
    await page.goBack();
    await waitAtlas(page);
    await sleep(2000);
    console.log(`BİLGİ Gökyüzü Araçları → tarayıcı geri: pencere ${(await visible(page)) ? "YENİDEN AÇILDI" : "açılmadı"}`);
    if (await visible(page)) await page.click(OK_BTN);

    // F4 — Atlas'tan çıkış + yeniden giriş
    await page.getByRole("link", { name: /Yaşam Analiz Merkezi/ }).first().click();
    await page.waitForURL(/\/life-analysis/, { timeout: 30_000 });
    await sleep(1500);
    ok("F4 Atlas dışında pencere yok", !(await visible(page)));
    await page.locator('a[href="/astroloji"]').last().click();
    await page.waitForURL(/\/astroloji$/, { timeout: 30_000 });
    await page.waitForSelector(DIALOG, { timeout: 30_000 }).catch(() => {});
    ok("F4 bağlantıyla yeniden girişte pencere yeniden açılır", await visible(page));
    await page.click(OK_BTN);
    await page.getByRole("link", { name: /Yaşam Analiz Merkezi/ }).first().click();
    await page.waitForURL(/\/life-analysis/, { timeout: 30_000 });
    await sleep(1000);
    await page.goBack();
    await page.waitForURL(/\/astroloji/, { timeout: 30_000 });
    await page.waitForSelector(DIALOG, { timeout: 30_000 }).catch(() => {});
    ok("F4 tarayıcı geri ile Atlas'a dönüş yeni giriştir → açılır", await visible(page));
    await page.click(OK_BTN);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitAtlas(page);
    await page.waitForSelector(DIALOG, { timeout: 30_000 }).catch(() => {});
    ok("F4 sayfa yenileme yeni giriştir → açılır (kalıcı kayıt yok)", await visible(page));
    await page.click(OK_BTN);
    const stored = await page.evaluate(() => JSON.stringify({ ls: Object.keys(localStorage).filter((k) => !["yasam_user", "yasam_session_token"].includes(k) && /atlas|notice|bilgi/i.test(k)), ss: Object.keys(sessionStorage).filter((k) => /atlas|notice|bilgi/i.test(k)), ck: document.cookie.split(";").filter((c) => /atlas|notice|bilgi/i.test(c)) }));
    ok("F4 tarayıcı depolamasına / çereze kayıt yazılmadı", stored === JSON.stringify({ ls: [], ss: [], ck: [] }), stored);
    ok("F JS hatası yok", errors.length === 0, errors.join(" | "));
    await ctx.close();

    // ── F5: owner kabuğu ve yetkisiz kullanıcı ───────────────────────────────────────────────────────
    const ctxA = await newCtx(browser, OWNER, OWNER_TOKEN);
    const pa = await ctxA.newPage();
    await pa.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "domcontentloaded" });
    await waitAtlas(pa);
    await sleep(2500);
    ok("F5 owner kabuğu (/admin/astroloji) pencere göstermez (yalnız uzman yüzeyi)", !(await visible(pa)));
    await ctxA.close();
    const ctxE = await newCtx(browser, EXPERT, EXPERT_TOKEN);
    const pe = await ctxE.newPage();
    await pe.goto(`${ORIGIN}/astroloji`, { waitUntil: "domcontentloaded" });
    await sleep(8000);
    ok("F5 Atlas yetkisi olmayan kullanıcıya pencere gösterilmez", !(await visible(pe)), (await pe.locator("body").innerText()).slice(0, 80).replace(/\n/g, " "));
    await ctxE.close();

    // ── G: görsel ölçüm ───────────────────────────────────────────────────────────────────────────────
    for (const [w, h] of [[1366, 768], [390, 844], [320, 568]]) {
      for (const scheme of ["light", "dark"]) {
        const c = await newCtx(browser, OWNER, OWNER_TOKEN, { viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 500, hasTouch: w < 500, deviceScaleFactor: w < 500 ? 2 : 1 });
        const p = await c.newPage();
        await p.goto(`${ORIGIN}/astroloji`, { waitUntil: "domcontentloaded" });
        await waitAtlas(p);
        await p.waitForSelector(DIALOG, { timeout: 30_000 });
        await sleep(600);
        const m = await p.evaluate((sel) => {
          const dlg = document.querySelector(sel);
          const r = dlg.getBoundingClientRect();
          const btn = dlg.querySelector("button").getBoundingClientRect();
          const cs = (el) => getComputedStyle(el);
          const body = dlg.querySelector("[id]:not(h2)");
          const clipped = [...dlg.querySelectorAll("h2,p,button")].some((el) => el.scrollWidth > el.clientWidth + 1);
          return {
            inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            hScroll: document.documentElement.scrollWidth > innerWidth,
            clipped,
            bodyFits: body.scrollHeight <= body.clientHeight + 1,
            btnH: Math.round(btn.height),
            btnW: Math.round(btn.width),
            bg: cs(dlg).backgroundColor,
            text: cs(dlg.querySelector("p")).color,
            title: cs(dlg.querySelector("h2")).color,
            w: Math.round(r.width),
          };
        }, DIALOG);
        const tag = `${w}×${h} ${scheme === "dark" ? "gece" : "gündüz"}`;
        ok(`G ${tag}: pencere görünür alanda, yatay kaydırma yok`, m.inView && !m.hScroll, JSON.stringify({ w: m.w }));
        ok(`G ${tag}: metin taşmıyor / kesilmiyor`, !m.clipped && m.bodyFits);
        ok(`G ${tag}: Tamam ≥ 44 px yüksek, rahat genişlik`, m.btnH >= 44 && m.btnW >= 120, `${m.btnW}×${m.btnH}`);
        ok(`G ${tag}: zemin beyaz, metin koyu (okunur)`, m.bg === "rgb(255, 255, 255)" && /rgb\((51|30|15), (65|41|23), (85|59|42)\)/.test(m.text) && m.title === "rgb(255, 255, 255)", `${m.bg} / ${m.text} / başlık ${m.title}`);
        if (OUT) await p.screenshot({ path: path.join(OUT, `G-${w}x${h}-${scheme === "dark" ? "gece" : "gunduz"}.png`) });
        await p.click(OK_BTN);
        await sleep(300);
        ok(`G ${tag}: Tamam ile kapanır`, !(await visible(p)));
        await c.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("HATA", e);
  process.exit(1);
});
