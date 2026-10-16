// 2026-10-16 mükerrer danışan hatırlatması — gerçek tarayıcı (Playwright Chromium) uçtan uca. YEREL; sahte DB, Roxy YOK.
// Önkoşul: yerel `next dev` (3931, ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329)
//          + dev-fake-backend (54329). Profil oluşturma hiçbir hesaplama başlatmaz → sahte Roxy gerekmez.
// Çalıştırma: node scripts/astrology/dup-ui.e2e.cjs [genişlik] [yükseklik] [ekran-görüntüsü-klasörü]
//
//   Hazırlık (API): aynı kişi için 2 profil (2.si açık "farklı kişi" onayıyla) → çoklu eşleşme.
//   1 Form doldurulur (büyük harf ad) → "Danışanı Oluştur" → uyarı: başlık, 2 profil, tarih/saat/yer/analiz sayısı;
//     profil YAZILMADI; yatay taşma yok; pencere görünür alanda.
//   2 İptal et → pencere + form kapanır; kayıt sayısı aynı.
//   3 Mevcut danışana geç → Danışan Dosyası (#danisan/<id>) açılır; yeni profil yok.
//   4 Farklı kişi olarak devam et — ÇİFT TIKLAMA → yalnız 1 yeni profil.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { join } = require("node:path");

const [W = "1366", H = "860", SHOTS = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const tag = `${width}px`;
const BASE = "http://localhost:3931/admin/astroloji";
const API = "http://localhost:3931/api/admin/astroloji";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const api = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};

(async () => {
  const stamp = Date.now().toString(36);
  const name = `hasan arıcı ${stamp}`;
  const birth = { birthDate: "1987-02-14", birthTime: "21:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "trd-42-cumra" };
  const total = async () => (await api(`/profiles?q=${encodeURIComponent(stamp)}`)).json.total;
  const archiveTotal = async () => (await api(`/profiles?q=${encodeURIComponent(stamp)}&archived=1`)).json.total;
  const p1 = (await api("/profiles", { label: name, ...birth })).json.profile.id;
  const second = await api("/profiles", { label: name, ...birth });
  ok("hazırlık: aynı kişinin 2. profili API'de 409 DUPLICATE_PROFILE", second.status === 409 && second.json.code === "DUPLICATE_PROFILE");
  const p2 = (await api("/profiles", { label: name, ...birth, confirmDifferentPerson: [p1] })).json.profile.id;
  ok("hazırlık: açık onayla 2. profil (eski mükerrer durumu)", typeof p2 === "string" && p2 !== p1 && (await total()) === 2);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
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
  const posts = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/astroloji\/(profiles|engine)/.test(r.url())) posts.push(r.url().replace(/^.*\/astroloji/, ""));
  });

  const openAndFill = async () => {
    await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
    await page.getByRole("button", { name: /Yeni doğum profili/ }).first().click({ timeout: 120000 });
    const dlg = page.locator("[data-testid=atlas-profile-dialog]");
    await dlg.waitFor({ timeout: 60000 });
    await dlg.locator('input[placeholder^="ör. Ali"]').fill(`  HASAN ARICI ${stamp.toUpperCase()} `);
    await dlg.locator("[data-testid=birth-date-text]").fill("14.02.1987");
    await dlg.locator("[data-testid=birth-date-text]").blur();
    await dlg.locator('input[type="time"]').fill("21:00");
    if ((await dlg.locator("[data-testid=astro-location-il]").count()) === 0) await dlg.locator("[data-testid=astro-location-mode-tr]").click();
    await dlg.locator("[data-testid=astro-location-il]").selectOption("Konya");
    await dlg.locator("[data-testid=astro-location-ilce]").selectOption("trd-42-cumra");
    await page.waitForTimeout(300);
    posts.length = 0;
    await dlg.getByRole("button", { name: "Danışanı Oluştur" }).click();
    await page.locator("[data-testid=astro-duplicate-dialog]").waitFor({ timeout: 60000 });
    await page.waitForTimeout(300);
  };

  // ── 1) Uyarı
  await openAndFill();
  const dup = page.locator("[data-testid=astro-duplicate-dialog]");
  const head = await dup.locator("#astro-dup-title").innerText();
  ok("uyarı başlığı", /Bu doğum bilgileriyle kayıtlı 2 danışan bulundu\./.test(head), head);
  const items = dup.locator("[data-testid=astro-duplicate-item]");
  ok("iki tam eşleşme listelenir", (await items.count()) === 2);
  const t0 = await items.first().innerText();
  ok("ad / tarih / saat / yer / analiz sayısı görünür", t0.includes(name) && t0.includes("14.02.1987") && t0.includes("21:00") && t0.includes("Çumra, Konya, Türkiye") && /Kayıtlı analiz\s*0/.test(t0), t0.replace(/\s+/g, " ").slice(0, 160));
  ok("üç seçenek görünür", (await dup.locator("[data-testid=astro-duplicate-open]").count()) === 2 && (await dup.locator("[data-testid=astro-duplicate-continue]").isVisible()) && (await dup.locator("[data-testid=astro-duplicate-cancel]").isVisible()));
  ok("profil YAZILMADI (uyarı anında kayıt sayısı 2)", (await total()) === 2);
  ok("yalnız 1 POST /profiles; hiçbir hesaplama isteği yok", posts.length === 1 && posts[0] === "/profiles", posts.join(","));
  const box = await dup.locator("div.max-w-lg").boundingBox();
  ok("pencere görünür alanda (kırpılmamış)", !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify(box));
  ok("yatay taşma yok", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `dup-uyari-${width}.png`) });

  // ── 2) İptal
  await dup.locator("[data-testid=astro-duplicate-cancel]").click();
  await page.waitForTimeout(400);
  ok("İptal: uyarı + form kapanır (çıkış onayı sorulmaz)", (await dup.count()) === 0 && (await page.locator("[data-testid=atlas-profile-dialog]").count()) === 0);
  ok("İptal: kayıt sayısı aynı", (await total()) === 2);

  // ── 3) Mevcut danışana geç
  await openAndFill();
  await page.locator("[data-testid=astro-duplicate-item]").nth(1).locator("[data-testid=astro-duplicate-open]").click();
  await page.waitForTimeout(800);
  const hash = await page.evaluate(() => location.hash);
  const target = hash.replace("#danisan/", "");
  ok("Mevcut danışana geç: Danışan Dosyası açılır (#danisan/<id>)", /^#danisan\//.test(hash) && [p1, p2].includes(target), hash);
  await page.locator("[data-testid=astro-client-file]").waitFor({ timeout: 60000 }).catch(() => null);
  ok("Danışan Dosyası görünür; form kapalı", (await page.locator("[data-testid=astro-client-file]").count()) === 1 && (await page.locator("[data-testid=atlas-profile-dialog]").count()) === 0);
  ok("Mevcut danışana geç: yeni profil yok, hesaplama isteği yok", (await total()) === 2 && !posts.some((p) => p.startsWith("/engine")), posts.join(","));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `dup-mevcut-danisan-${width}.png`) });

  // ── 4) Farklı kişi olarak devam et — çift tıklama
  await openAndFill();
  const cont = page.locator("[data-testid=astro-duplicate-continue]");
  await cont.dblclick();
  await page.waitForTimeout(2500);
  ok("Farklı kişi: çift tıklamada yalnız 1 yeni profil (toplam 3)", (await total()) === 3, String(await total()));
  ok("Farklı kişi: uyarı kapanır, yeni profil seçili (form kapalı)", (await page.locator("[data-testid=astro-duplicate-dialog]").count()) === 0 && (await page.locator("[data-testid=atlas-profile-dialog]").count()) === 0);
  ok("eski profiller korunur (etkin 3, arşivli 0; p1/p2 duruyor)", (await archiveTotal()) === 0 && (await api(`/profiles/${p1}`)).status === 200 && (await api(`/profiles/${p2}`)).status === 200);
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));

  await browser.close();
  console.log(`\ndup-ui e2e [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
