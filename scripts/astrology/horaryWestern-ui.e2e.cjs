// HORARY-W (2026-10-29) — Batı Horary (William Lilly) önizleme ekranı (Playwright Chromium). YEREL; sahte DB (dev-fake-backend),
// sağlayıcı YOK (hesaplama yerel motor). Önkoşul: next sunucusu ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_ATLAS_HORARY_PREVIEW=1,
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake> + dev-fake-backend.
// Çalıştırma: node scripts/astrology/horaryWestern-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   • ana ekranda "HORARY — William Lilly" bağlantısı → #horary-lilly
//   • boş form → alan hatası, istek atılmaz; DEMO doldur → DEMO rozeti; "Haritayı Oluştur" → gerçek sonuç (çark, göstergeler, çizelge)
//   • ekrandaki UTC / göstergeler / çizelge satır sayısı aynı girdiyle doğrudan API yanıtıyla BİREBİR
//   • API hata uçları: geçersiz konum 400, ev 13 → 400, 1700 → 422; ekran: API hatası kullanıcıya okunur metin
//   • 1366×768, 1024×768, 768×1024, 390×844, 320×640: yatay taşma yok; ekran görüntüleri
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const [ORIGIN = "http://localhost:3961", OUT = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const api = async (b) => {
  const r = await fetch(`${ORIGIN}/api/admin/astroloji/horary/western`, { method: "POST", headers: H, body: JSON.stringify(b) });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const VIEWS = [
  ["masaustu", 1366, 768],
  ["tablet-yatay", 1024, 768],
  ["tablet-dikey", 768, 1024],
  ["mobil", 390, 844],
  ["mobil-dar", 320, 640],
];
const DEMO = { date: "2026-10-29", time: "14:30", locationId: "tr-34-istanbul", quesitedHouse: 7 };

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
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
};

(async () => {
  // API: gerçek hesaplama + hata uçları.
  const ref = await api(DEMO);
  ok("API DEMO girdisi 200 + sonuç", ref.s === 200 && ref.j?.ok === true && ref.j.result?.chart?.planets?.length === 7, `durum ${ref.s}`);
  ok("API geçersiz konum → 400 place", (await api({ ...DEMO, locationId: "yok-boyle-bir-yer" })).s === 400);
  const h13 = await api({ ...DEMO, quesitedHouse: 13 });
  ok("API ev 13 → 400 quesitedHouse", h13.s === 400 && h13.j?.field === "quesitedHouse");
  const old = await api({ ...DEMO, date: "1700-01-01" });
  ok("API 1700 → 422 OUT_OF_RANGE", old.s === 422 && old.j?.code === "OUT_OF_RANGE");
  const noAuth = await fetch(`${ORIGIN}/api/admin/astroloji/horary/western`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(DEMO) });
  ok("API oturumsuz → 404 (yetki kapısı)", noAuth.status === 404);

  const browser = await chromium.launch();
  try {
    // Akış (masaüstü).
    const ctx = await login(browser, 1366, 768);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    const link = page.getByTestId("atlas-horary-link");
    await link.waitFor({ timeout: 120000 });
    ok("ana ekranda Horary bağlantısı", await link.isVisible());
    await shot(page, "00-ana-ekran-baglanti");
    await link.click();
    await page.getByTestId("horary-form").waitFor({ timeout: 60000 });
    ok("bağlantı → #horary-lilly görünümü", page.url().endsWith("#horary-lilly"));
    await shot(page, "01-bos-form");

    let calls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/horary/western")) calls++;
    });
    await page.getByTestId("horary-submit").click();
    await page.getByTestId("horary-error").waitFor({ timeout: 10000 });
    ok("boş form → alan hatası, istek YOK", (await page.getByTestId("horary-error").innerText()).includes("tarih") && calls === 0);
    await shot(page, "02-eksik-veri-hatasi");

    await page.getByTestId("horary-demo").click();
    ok("DEMO doldur → DEMO rozeti", await page.getByTestId("horary-demo-badge").isVisible());
    await page.getByTestId("horary-submit").click();
    await page.getByTestId("horary-result").waitFor({ timeout: 60000 });
    const R = ref.j.result;
    const moment = await page.getByTestId("horary-moment").innerText();
    ok("ekrandaki UTC = API", moment.includes(R.question.utc.replace("T", " ").replace("Z", " UTC")), moment);
    const summary = await page.getByTestId("horary-summary").innerText();
    const TR = { saturn: "Satürn", jupiter: "Jüpiter", mars: "Mars", sun: "Güneş", venus: "Venüs", mercury: "Merkür", moon: "Ay" };
    ok("göstergeler = API", summary.includes(`Soran: ${TR[R.significators.querent]}`) || summary.includes(TR[R.significators.querent]), `${R.significators.querent}/${R.significators.quesited}`);
    ok("sorulan gösterge = API", summary.includes(TR[R.significators.quesited]));
    const wheelPaths = await page.getByTestId("horary-wheel").locator("svg").count();
    ok("çark çizildi (SVG)", wheelPaths >= 1);
    const rows = await page.getByTestId("horary-timeline").locator("li").count();
    ok("çizelge satır sayısı = API", rows === R.timeline.length, `${rows} / ${R.timeline.length}`);
    ok("DEMO girdisi sonuçta işaretli", (await page.getByTestId("horary-result").innerText()).includes("DEMO GİRDİSİ"));
    await shot(page, "03-sonuc-masaustu");

    await page.getByTestId("horary-planets").locator("summary").click();
    const trs = await page.getByTestId("horary-planets").locator("tbody tr").count();
    ok("Gezegenler bölümü açılır, 7 satır", trs === 7, String(trs));
    for (const id of ["horary-cusps", "horary-receptions", "horary-all-candidates", "horary-method"]) await page.getByTestId(id).locator("summary").click();
    ok("Ev başlangıçları 12 satır", (await page.getByTestId("horary-cusps").locator("li").count()) === 12);
    await shot(page, "04-ileri-ayrintilar-acik");

    // Sunucu hatası ekranda okunur metin: konum seçiliyken ev listesi dışı değer yok; tarihi 1700 yap.
    await page.getByTestId("horary-date").fill("1700-01-01");
    await page.getByTestId("horary-submit").click();
    await page.getByTestId("horary-error").waitFor({ timeout: 30000 });
    ok("aralık dışı tarih → ekranda hata metni", (await page.getByTestId("horary-error").innerText()).includes("1800"));
    await shot(page, "05-sunucu-hatasi");
    await ctx.close();

    // Görünümler: yatay taşma yok + ekran görüntüleri.
    for (const [name, w, h] of VIEWS) {
      const c = await login(browser, w, h);
      const p = await c.newPage();
      await p.goto(`${ORIGIN}/admin/astroloji#horary-lilly`, { waitUntil: "load", timeout: 240000 });
      await p.getByTestId("horary-form").waitFor({ timeout: 120000 });
      await p.getByTestId("horary-demo").click();
      await p.getByTestId("horary-submit").click();
      await p.getByTestId("horary-result").waitFor({ timeout: 60000 });
      await p.waitForTimeout(400);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(`${name} ${w}×${h}: yatay taşma yok`, over <= 1, `fazla ${over}px`);
      await shot(p, `10-${name}-${w}x${h}`);
      await c.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nastrology horary-western UI e2e: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
