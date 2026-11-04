/* eslint-disable @typescript-eslint/no-require-imports */
// Natal premium çark görünümü — UI e2e (2026-11-04). Kayıtlı Natal analizi (sahte arka uç "Ali natal (gerçek kayıt)") üzerinde:
//   Temel/Profesyonel geçişi (ağ isteği 0), açı toplam/çizili sayıları, nokta seçimi, tercih kalıcılığı, Semboller sekmesi,
//   sembol yazı tipi, açı çizgisi filtresi (nitelik / odak gövde / sıfırla), yatay taşma yok, sayfa hatası yok; ekran görüntüleri.
// Ön koşul: FAKE_NATAL_REAL_GOLDEN=1 dev-fake-backend.ts <fake> + next dev --webpack (ASTROLOGY_MODULE_ENABLED=true,
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, SUPABASE_SERVICE_ROLE_KEY=local-fake, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-fake).
// Çalıştırma: node scripts/astrology/natal-premium-ui.e2e.cjs http://localhost:3991 1366 768 <çıktı klasörü> [dark]
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync } = require("node:fs");

const [ORIGIN = "http://localhost:3991", W = "1366", H = "768", OUT = "", SCHEME = "light"] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const tag = `${width}${SCHEME === "dark" ? "-koyu" : ""}`;
const BASE = `${ORIGIN}/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";

let pass = 0;
let fail = 0;
const results = [];
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else fail++;
  results.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? "✓" : "✗"} ${name}${!cond && detail ? ` — ${detail}` : ""}`);
}

(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "tr-TR", timezoneId: "Europe/Istanbul", deviceScaleFactor: width < 768 ? 2 : 1, colorScheme: SCHEME === "dark" ? "dark" : "light" });
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
  page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
  let apiCalls = [];
  page.on("request", (r) => {
    if (/\/api\//.test(r.url())) apiCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  const shot = async (name, full = false) => {
    if (!OUT) return;
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: full });
  };
  const svgAttr = (a) => page.locator("svg[data-natal-mode]:visible").first().getAttribute(a);

  // Arşiv → danışan dosyası → kayıtlı Natal
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=archive]", { timeout: 180000 });
  await page.locator("[data-portal=archive]").first().click();
  await page.waitForSelector("[data-testid=astro-archive-list]", { timeout: 90000 });
  await page.locator("[data-testid=astro-archive-list] [title='Danışan dosyasını aç']").first().click();
  await page.waitForSelector("[data-testid=astro-saved-analyses] [data-saved-item]", { timeout: 90000 });
  await page.locator("[data-testid=astro-saved-analyses] [data-saved-item]", { hasText: "Ali natal" }).first().click();
  await page.waitForSelector("[data-testid=natal-wheel-controls]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));

  ok("Natal araç çubuğu ve görünüm katmanlı çark görünür", await page.locator("svg[data-natal-mode]:visible").count() > 0);
  ok("varsayılan görünüm Profesyonel", (await svgAttr("data-natal-mode")) === "pro");
  ok("derece cetveli çizili (348 çentik)", (await page.locator("svg[data-natal-mode]:visible [data-testid=natal-degree-ruler] line[data-deg]").count()) === 348);
  const totalPro = Number(await svgAttr("data-aspects-total"));
  const drawnPro = Number(await svgAttr("data-aspects-drawn"));
  const countsTxt = (await page.locator("[data-testid=natal-aspect-counts]").innerText()).replace(/\s+/g, " ");
  ok("araç çubuğu sayıları çarkla aynı (toplam / çizili ayrı)", countsTxt.includes(`Açı listesi: ${totalPro}`) && countsTxt.includes(`çarkta çizili: ${drawnPro}`), countsTxt);
  ok("çizilen ≤ toplam (KAD–GAD ekseni çizilmez)", drawnPro <= totalPro && totalPro > 0, `${drawnPro}/${totalPro}`);
  const fontOk = await page.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('20px "Yasam Natal Sembol"', "⚷");
    return document.fonts.check('20px "Yasam Natal Sembol"', "⚷");
  });
  ok("sembol yazı tipi yüklendi (⚷)", fontOk);
  await shot("1-profesyonel");
  await shot("1-profesyonel-tam", true);

  // Temel'e geç: ağ isteği yok, çizili açı azalır
  apiCalls = [];
  await page.locator("[data-testid=natal-mode-basic]").click();
  await page.waitForTimeout(700);
  const drawnBasic = Number(await svgAttr("data-aspects-drawn"));
  ok("Temel görünüm etkin", (await svgAttr("data-natal-mode")) === "basic");
  ok("Temel: daha az çizgi, toplam aynı", drawnBasic < drawnPro && Number(await svgAttr("data-aspects-total")) === totalPro, `${drawnBasic} < ${drawnPro}`);
  ok("Temel: ev derecesi yazıları yok, ASC/MC levhası var", (await page.locator("svg[data-natal-mode]:visible [data-cusp-degree]").count()) === 0 && (await page.locator("svg[data-natal-mode]:visible [data-angle=ASC]").count()) === 1);
  await shot("2-temel");

  // Nokta seçimi (Temel'in kendi seçimi): Vertex + Şans Noktası aç
  await page.locator("[data-testid=natal-point-vertex]").click();
  await page.locator("[data-testid=natal-point-fortune]").click();
  await page.waitForTimeout(500);
  ok("Vertex + Şans Noktası çarkta", (await page.locator("svg[data-natal-mode]:visible [data-point=vertex]").count()) === 1 && (await page.locator("svg[data-natal-mode]:visible [data-point=fortune]").count()) === 1);
  await shot("3-temel-noktalar");
  // Profesyonel'e dön, Kiron'u kapat
  await page.locator("[data-testid=natal-mode-pro]").click();
  await page.locator("[data-testid=natal-point-chiron]").click();
  await page.waitForTimeout(500);
  ok("Profesyonel'e dönüşte kendi seçimi (Vertex kapalı) + Kiron gizli", (await page.locator("svg[data-natal-mode]:visible [data-point=vertex]").count()) === 0 && (await page.locator("svg[data-natal-mode]:visible [data-body=chiron]").count()) === 0);
  // Açı çizgisi filtresi (Profesyonel; Kiron gizli): yalnız çizim süzülür, toplam aynı, sayaç = çark
  const drawnNow = Number(await svgAttr("data-aspects-drawn"));
  await page.locator("[data-testid=natal-filter-challenging]").click();
  await page.waitForTimeout(400);
  const drawnNoHard = Number(await svgAttr("data-aspects-drawn"));
  const redLines = await page.locator('svg[data-natal-mode]:visible line[data-aspect][stroke="#dc2626"]').count();
  const cTxt = (await page.locator("[data-testid=natal-aspect-counts]").innerText()).replace(/\s+/g, " ");
  ok(
    "filtre: Zorlayıcı kapalı → kırmızı çizgi yok, toplam aynı, sayaç = çark",
    drawnNoHard < drawnNow && redLines === 0 && Number(await svgAttr("data-aspects-total")) === totalPro && cTxt.includes(`çarkta çizili: ${drawnNoHard}`),
    `${drawnNoHard}/${drawnNow} kırmızı=${redLines} · ${cTxt}`,
  );
  await page.locator("[data-testid=natal-filter-challenging]").click();
  await page.locator("[data-testid=natal-filter-focus]").selectOption("sun");
  await page.waitForTimeout(400);
  const focusAspects = await page.locator("svg[data-natal-mode]:visible line[data-aspect]").evaluateAll((ls) => ls.map((l) => l.getAttribute("data-aspect")));
  ok(
    "filtre: Odak = Güneş → yalnız Güneş açıları + glif halkası",
    focusAspects.length > 0 && focusAspects.every((x) => /^sun-|-sun-/.test(x)) && (await page.locator('svg[data-natal-mode]:visible [data-body=sun][data-focus="1"]').count()) === 1,
    focusAspects.join(","),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("6-filtre-odak-gunes");
  await page.locator("[data-testid=natal-filter-reset]").click();
  await page.waitForTimeout(400);
  ok(
    "filtre: Tümünü göster → önceki çizim sayısı, sıfırla düğmesi kaybolur",
    Number(await svgAttr("data-aspects-drawn")) === drawnNow && (await page.locator("[data-testid=natal-filter-reset]").count()) === 0,
  );

  // Uygulama geneli oturum yoklaması (GET /api/auth/session; zaman / odak tetikli) görünümle ilgisizdir → ayrı kayıt.
  const astroOrWrite = apiCalls.filter((c) => /astrolog|astro|roxy/i.test(c) || !c.startsWith("GET "));
  ok("görünüm / nokta değişimleri astroloji / sağlayıcı / yazma isteği üretmedi", astroOrWrite.length === 0, astroOrWrite.join(", "));
  if (apiCalls.length) console.log(`    (bilgi: görünümle ilgisiz istekler: ${apiCalls.join(", ")})`);

  // Tercih kalıcı (yalnız tarayıcı)
  await page.locator("[data-testid=natal-point-chiron]").click();
  await page.locator("[data-testid=natal-mode-basic]").click();
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => localStorage.getItem("atlas.natalWheel.v1"));
  ok("tercih localStorage'da (mode=basic)", !!stored && JSON.parse(stored).mode === "basic", stored ?? "");

  // Semboller sekmesi
  const tabByName = page.getByRole("tab", { name: /Semboller/ });
  if ((await tabByName.count()) > 0 && (await tabByName.first().isVisible())) await tabByName.first().click();
  else await page.getByText("Semboller", { exact: true }).first().click();
  await page.waitForSelector("[data-testid=natal-symbol-guide]", { timeout: 20000 });
  ok("Semboller rehberi açılır", await page.locator("[data-testid=natal-symbol-guide]").isVisible());
  await page.locator("[data-testid=natal-symbol-guide]").scrollIntoViewIfNeeded();
  await shot("4-semboller");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("yatay taşma yok", overflow <= 0, `${overflow}px`);
  await page.locator("[data-testid=natal-mode-pro]").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot("5-profesyonel-son");
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  if (OUT) writeFileSync(`${OUT}/${tag}-sonuc.json`, JSON.stringify({ results, totalPro, drawnPro, drawnBasic }, null, 1));
  await browser.close();
  console.log(`\nnatal-premium-ui [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("natal-premium-ui çöktü:", e);
  process.exit(1);
});
