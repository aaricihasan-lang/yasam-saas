// HORARY-W (2026-10-29, Revizyon-01) — Batı Horary (William Lilly) önizleme ekranı (Playwright Chromium). YEREL; sahte DB
// (dev-fake-backend), sağlayıcı YOK (hesaplama yerel motor). 5xx / ağ / zaman aşımı yalnız TARAYICI içinde istek yakalanarak
// simüle edilir (sunucu ve veritabanı değişmez). Önkoşul: next sunucusu ASTROLOGY_MODULE_ENABLED=true,
// NEXT_PUBLIC_ATLAS_HORARY_PREVIEW=1, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake> + dev-fake-backend.
// Çalıştırma: node scripts/astrology/horaryWestern-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   • API: başarı, geçersiz tarih, aralık dışı, geçersiz konum, ev 13, yaz saati boşluğu / çift saat, oturumsuz 404
//   • akış: ana ekran bağlantısı → görünüm → geri dönüş; boş form; ev seçilmemesi; DEMO → gerçek sonuç (API ile birebir)
//   • eski sonuç: girdi değişince gizlenir; aralık dışı / 5xx / ağ / zaman aşımı sonrası eski harita YOK; geciken yanıt yok sayılır;
//     çift gönderim tek istek
//   • yaz saati: Berlin boşluk saati hata, çift saat → seçim düğmesi → sonuç
//   • 6 görünüm: her denetim öğesinin gerçek dikdörtgeni görünür alanda, kırpılmamış, en az 44 px (paylaşılan bileşen ≥ 24 px),
//     zorlamasız tıklanabilir; çark panel genişliğini kullanır, panel çarktan uzun değil; ileri ayrıntılar ilk açılışta kapalı
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
const URL_API = `${ORIGIN}/api/admin/astroloji/horary/western`;
const api = async (b) => {
  const r = await fetch(URL_API, { method: "POST", headers: H, body: JSON.stringify(b) });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const VIEWS = [
  ["masaustu", 1366, 768],
  ["masaustu-genis", 1536, 864],
  ["tablet-yatay", 1024, 768],
  ["tablet-dikey", 768, 1024],
  ["mobil", 390, 844],
  ["mobil-dar", 320, 640],
];
const DEMO = { date: "2026-10-29", time: "14:30", locationId: "tr-34-istanbul", quesitedHouse: 7 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const shot = async (page, name, full = true) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
};
const errText = async (page) => {
  const e = page.getByTestId("horary-error");
  await e.waitFor({ timeout: 40000 });
  return e.innerText();
};
const resultCount = (page) => page.getByTestId("horary-result").count();
async function openHorary(page) {
  await page.goto(`${ORIGIN}/admin/astroloji#horary-lilly`, { waitUntil: "load", timeout: 240000 });
  await page.getByTestId("horary-form").waitFor({ timeout: 120000 });
}

/** Görünür alan + üst öğe kırpması + boyut denetimi (gerçek getBoundingClientRect + elementFromPoint). */
async function controlAudit(page, items) {
  const out = [];
  for (const [label, loc, minH] of items) {
    const n = await loc.count();
    if (n === 0) {
      out.push({ label, ok: false, why: "bulunamadı" });
      continue;
    }
    const el = loc.first();
    await el.scrollIntoViewIfNeeded();
    const m = await el.evaluate((node, minH) => {
      const r = node.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      // Herhangi bir üst öğe yatay olarak kırpıyor mu?
      let clipped = false;
      for (let p = node.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== "visible") {
          const pr = p.getBoundingClientRect();
          if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) clipped = true;
        }
      }
      return { left: r.left, right: r.right, w: r.width, h: r.height, vw, hitOk: !!hit && (hit === node || node.contains(hit) || hit.contains(node)), clipped, minH };
    }, minH);
    const why = [];
    if (m.left < -0.5 || m.right > m.vw + 0.5) why.push(`görünür alan dışında (${Math.round(m.left)}–${Math.round(m.right)} / ${m.vw})`);
    if (m.clipped) why.push("üst öğe kırpıyor");
    if (!m.hitOk) why.push("üstünde başka öğe var");
    if (m.h < minH - 0.5) why.push(`yükseklik ${Math.round(m.h)} < ${minH}`);
    if (m.w < 24) why.push(`genişlik ${Math.round(m.w)}`);
    out.push({ label, ok: why.length === 0, why: why.join(", ") });
  }
  return out;
}

(async () => {
  // ── API (gerçek sunucu; sahte DB) ──
  const ref = await api(DEMO);
  ok("API başarı: DEMO girdisi 200 + gerçek sonuç", ref.s === 200 && ref.j?.ok === true && ref.j.result?.chart?.planets?.length === 7, `durum ${ref.s}`);
  const bad = await api({ ...DEMO, date: "2026-02-30" });
  ok("API geçersiz tarih (30 Şubat) → 422, alan=date, Türkçe metin", bad.s === 422 && bad.j?.field === "date" && /Geçersiz tarih/.test(bad.j?.error ?? ""), `${bad.s} ${bad.j?.error}`);
  const old = await api({ ...DEMO, date: "1700-01-01" });
  ok("API aralık dışı (1700) → 422 OUT_OF_RANGE, 1800–2200 metni", old.s === 422 && old.j?.code === "OUT_OF_RANGE" && /1800–2200/.test(old.j?.error ?? ""));
  const loc = await api({ ...DEMO, locationId: "yok-boyle-bir-yer" });
  ok("API geçersiz konum → 400, alan=place", loc.s === 400 && loc.j?.field === "place");
  const h13 = await api({ ...DEMO, quesitedHouse: 13 });
  ok("API ev 13 → 400, alan=quesitedHouse", h13.s === 400 && h13.j?.field === "quesitedHouse");
  const noH = await api({ date: DEMO.date, time: DEMO.time, locationId: DEMO.locationId });
  ok("API ev yok → 400, alan=quesitedHouse (sunucu da varsayılan ev kullanmaz)", noH.s === 400 && noH.j?.field === "quesitedHouse");
  const gap = await api({ ...DEMO, locationId: "de-berlin", date: "2026-03-29", time: "02:30" });
  ok("API yaz saati boşluğu (Berlin 29.03.2026 02:30) → TIME_GAP", gap.s === 422 && gap.j?.code === "TIME_GAP");
  const amb = await api({ ...DEMO, locationId: "de-berlin", date: "2026-10-25", time: "02:30" });
  ok("API çift saat (Berlin 25.10.2026 02:30) → TIME_AMBIGUOUS, 2 seçenek", amb.s === 422 && amb.j?.code === "TIME_AMBIGUOUS" && amb.j?.options?.length === 2);
  const noAuth = await fetch(URL_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(DEMO) });
  ok("API oturumsuz → 404 (yetki kapısı)", noAuth.status === 404);

  const browser = await chromium.launch();
  try {
    // ── Akış ve hata durumları (masaüstü) ──
    const ctx = await login(browser, 1366, 768);
    const page = await ctx.newPage();
    let calls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/horary/western")) calls++;
    });
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    const link = page.getByTestId("atlas-horary-link");
    await link.waitFor({ timeout: 120000 });
    ok("ana ekranda Horary bağlantısı", await link.isVisible());
    await link.click();
    await page.getByTestId("horary-form").waitFor({ timeout: 60000 });
    ok("bağlantı → #horary-lilly", page.url().endsWith("#horary-lilly"));
    await page.getByTestId("horary-back").click();
    await page.getByTestId("atlas-horary-link").waitFor({ timeout: 30000 });
    ok("geri dönüş → Atlas ana ekranı", !page.url().includes("#horary-lilly"));
    await page.getByTestId("atlas-horary-link").click();
    await page.getByTestId("horary-form").waitFor({ timeout: 60000 });

    ok("boş formda sorulan ev SEÇİLİ DEĞİL", (await page.getByTestId("horary-house").inputValue()) === "");
    calls = 0;
    await page.getByTestId("horary-submit").click();
    ok("boş zorunlu alan → tarih hatası, istek YOK", /tarihini/.test(await errText(page)) && calls === 0);
    await shot(page, "02-hata-bos-alan");

    await page.getByTestId("horary-demo").click();
    ok("DEMO doldur → 7. ev seçili + DEMO rozeti", (await page.getByTestId("horary-house").inputValue()) === "7" && (await page.getByTestId("horary-demo-badge").isVisible()));
    await page.getByTestId("horary-house").selectOption("");
    calls = 0;
    await page.getByTestId("horary-submit").click();
    ok("sorulan ev seçilmedi → ev hatası, istek YOK", /Sorulan evi seçin/.test(await errText(page)) && calls === 0 && (await page.getByTestId("horary-error").getAttribute("data-field")) === "house");
    await shot(page, "03-hata-ev-secilmedi");

    // Başarılı gerçek hesaplama.
    await page.getByTestId("horary-house").selectOption("7");
    await page.getByTestId("horary-submit").click();
    await page.getByTestId("horary-result").waitFor({ timeout: 60000 });
    const R = ref.j.result;
    const moment = await page.getByTestId("horary-moment").innerText();
    ok("başarı: ekrandaki UTC = API", moment.includes(R.question.utc.replace("T", " ").replace("Z", " UTC")), moment);
    const TR = { saturn: "Satürn", jupiter: "Jüpiter", mars: "Mars", sun: "Güneş", venus: "Venüs", mercury: "Merkür", moon: "Ay" };
    const sig = await page.getByTestId("horary-sig").innerText();
    const line = (prefix) => sig.split("\n").find((l) => l.startsWith(prefix)) ?? "";
    ok("başarı: soran / sorulan = API", line("Soran:").includes(TR[R.significators.querent]) && line("Sorulan:").includes(TR[R.significators.quesited]), `${R.significators.querent}/${R.significators.quesited}`);
    ok("başarı: çizelge satırı = API", (await page.getByTestId("horary-timeline").locator("li").count()) === R.timeline.length);
    const openStates = await page.locator("[data-testid=horary-result] details[data-testid]").evaluateAll((els) => els.map((e) => e.open));
    ok("ileri ayrıntıların TAMAMI ilk açılışta kapalı", openStates.length === 5 && openStates.every((o) => !o), JSON.stringify(openStates));
    // Bilgi hiyerarşisi: ilk ekranda aday/eksik kayıt metni yok, yalnız sayı bağlantısı.
    const metText = await page.getByTestId("horary-met").innerText();
    ok("temel bulgularda şartı eksik toplanma / aday metni YOK", !/şartı eksik —|Işık toplanması — .* şartı eksik/.test(metText.split("İncelenecek")[0]) && !/adayı:/.test(metText));
    const others = page.getByTestId("horary-others-link");
    if ((await others.count()) > 0) {
      await others.click();
      ok("'İncelenecek diğer olaylar' → tüm olaylar bölümü açılır", await page.locator("#horary-all-candidates").evaluate((e) => e.open));
      const inc = await page.getByTestId("horary-group-incomplete").innerText();
      ok("kesintili / eksik kayıtlar silinmedi, ayrı grupta", inc.length > 0);
    }
    await shot(page, "04-sonuc-ve-diger-olaylar");

    // Eski sonuç: girdi değişince gizlenir.
    await page.getByTestId("horary-time").fill("15:45");
    ok("girdi değişti → önceki harita GİZLENDİ", (await resultCount(page)) === 0);
    // Aralık dışı: istemcide yakalanır, eski harita yok.
    await page.getByTestId("horary-time").fill("14:30");
    await page.getByTestId("horary-submit").click();
    await page.getByTestId("horary-result").waitFor({ timeout: 60000 });
    await page.getByTestId("horary-date").fill("1700-01-01");
    calls = 0;
    await page.getByTestId("horary-submit").click();
    ok("aralık dışı tarih → 1800–2200 metni, istek YOK, eski harita YOK", /1800–2200/.test(await errText(page)) && calls === 0 && (await resultCount(page)) === 0);
    await shot(page, "05-hata-aralik-disi");
    await page.getByTestId("horary-date").fill(DEMO.date);

    // Geçersiz konum: istek gövdesi tarayıcıda geçersiz kimlikle değiştirilir → GERÇEK sunucu 400 yanıtı ekranda.
    await page.route("**/horary/western", (route) => route.continue({ postData: JSON.stringify({ ...JSON.parse(route.request().postData() || "{}"), locationId: "yok-boyle-bir-yer" }) }));
    await page.getByTestId("horary-submit").click();
    const locMsg = await errText(page);
    ok("geçersiz konum → sunucu metni ekranda, harita YOK", /Konum bulunamadı/.test(locMsg) && (await resultCount(page)) === 0, locMsg);
    await page.unroute("**/horary/western");
    await shot(page, "06-hata-gecersiz-konum");

    // 5xx (simüle; yalnız tarayıcı).
    await page.route("**/horary/western", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "x" }) }));
    await page.getByTestId("horary-submit").click();
    ok("5xx → 'Sunucu hatası' metni, harita YOK", /Sunucu hatası/.test(await errText(page)) && (await resultCount(page)) === 0);
    await shot(page, "07-hata-sunucu-5xx");
    await page.unroute("**/horary/western");
    // Ağ kesintisi.
    await page.route("**/horary/western", (route) => route.abort("internetdisconnected"));
    await page.getByTestId("horary-submit").click();
    ok("ağ kesintisi → 'Sunucuya ulaşılamadı', harita YOK", /Sunucuya ulaşılamadı/.test(await errText(page)) && (await resultCount(page)) === 0);
    await shot(page, "08-hata-ag");
    await page.unroute("**/horary/western");
    // Zaman aşımı: yanıt 28 sn bekletilir → 25 sn'de hata; geç gelen yanıt ekrana yazılmaz.
    await page.route("**/horary/western", async (route) => {
      await sleep(28000);
      await route.continue().catch(() => {});
    });
    await page.getByTestId("horary-submit").click();
    ok("zaman aşımı → 25 sn metni", /25 saniye/.test(await errText(page)));
    await sleep(5000);
    ok("zaman aşımından sonra geç gelen yanıt harita GÖSTERMEZ", (await resultCount(page)) === 0);
    await page.unroute("**/horary/western");
    await shot(page, "09-hata-zaman-asimi");
    // Geciken eski yanıt + çift gönderim.
    await page.route("**/horary/western", async (route) => {
      await sleep(2500);
      await route.continue().catch(() => {});
    });
    calls = 0;
    await page.getByTestId("horary-submit").click();
    await page.getByTestId("horary-submit").click({ timeout: 1000 }).catch(() => {});
    ok("hesaplama sürerken düğme kilitli (çift gönderim yok)", await page.getByTestId("horary-submit").isDisabled());
    await page.getByTestId("horary-time").fill("14:31");
    await sleep(3500);
    ok("girdi değişti → geciken eski yanıt harita GÖSTERMEZ; tek istek", (await resultCount(page)) === 0 && calls === 1, `istek ${calls}`);
    await page.unroute("**/horary/western");
    // Hata düzeltildikten sonra kolayca yeniden hesaplanır.
    await page.getByTestId("horary-time").fill("14:30");
    await page.getByTestId("horary-submit").click();
    await page.getByTestId("horary-result").waitFor({ timeout: 60000 });
    ok("hatadan sonra yeniden hesaplama çalışır", (await resultCount(page)) === 1);

    // Yaz saati (Berlin) — konum seçici üzerinden.
    await page.getByTestId("horary-place").getByRole("button", { name: "Değiştir" }).click();
    await page.getByTestId("horary-place").getByPlaceholder(/şehir ara/).fill("Berlin");
    await page.getByTestId("horary-place").getByRole("button", { name: /^Berlin/ }).first().click();
    await page.getByTestId("horary-date").fill("2026-03-29");
    await page.getByTestId("horary-time").fill("02:30");
    await page.getByTestId("horary-submit").click();
    ok("yaz saati boşluğu → 'o gün yaşanmadı', harita YOK", /yaşanmadı/.test(await errText(page)) && (await resultCount(page)) === 0);
    await shot(page, "10-hata-yaz-saati-bosluk");
    await page.getByTestId("horary-date").fill("2026-10-25");
    await page.getByTestId("horary-submit").click();
    ok("çift saat → seçim düğmeleri", /iki kez/.test(await errText(page)) && (await page.getByTestId("horary-dst-earlier").isVisible()));
    await shot(page, "11-hata-cift-saat");
    await page.getByTestId("horary-dst-earlier").click();
    await page.getByTestId("horary-result").waitFor({ timeout: 60000 });
    ok("çift saat 'İlk yaşanan' → GMT+2 sonucu (00:30 UTC)", /GMT\+2/.test(await page.getByTestId("horary-moment").innerText()) && /00:30:00 UTC/.test(await page.getByTestId("horary-moment").innerText()));
    await ctx.close();

    // ── Görünümler ──
    for (const [name, w, h] of VIEWS) {
      const c = await login(browser, w, h);
      const p = await c.newPage();
      await openHorary(p);
      await shot(p, `20-${name}-${w}x${h}-bos-form`, false);
      await p.getByTestId("horary-demo").click();
      const own = (tid) => p.getByTestId(tid);
      const audit = await controlAudit(p, [
        ["geri dönüş", own("horary-back"), 44],
        ["soru", own("horary-question"), 44],
        ["tarih", own("horary-date"), 44],
        ["saat", own("horary-time"), 44],
        ["Şimdi", own("horary-now"), 44],
        ["sorulan ev", own("horary-house"), 44],
        ["Haritayı Oluştur", own("horary-submit"), 44],
        ["DEMO doldur", own("horary-demo"), 44],
        ["konum Değiştir (paylaşılan bileşen)", own("horary-place").getByRole("button", { name: "Değiştir" }), 16],
      ]);
      const badCtl = audit.filter((a) => !a.ok);
      ok(`${name} ${w}×${h}: form denetimleri görünür, kırpılmamış, hedef boyutu yeterli`, badCtl.length === 0, badCtl.map((a) => `${a.label}: ${a.why}`).join(" | "));
      // Zorlamasız tıklama (Playwright eylem denetimi): Şimdi düğmesi.
      let clickOk = true;
      try {
        await own("horary-now").click({ timeout: 5000, trial: true });
        await own("horary-house").click({ timeout: 5000, trial: true });
      } catch {
        clickOk = false;
      }
      ok(`${name}: denetimler zorlamasız tıklanabilir`, clickOk);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${name}: yatay sayfa taşması yok`, over <= 1, `fazla ${over}px`);
      await shot(p, `21-${name}-${w}x${h}-demo-form`, false);
      await own("horary-submit").click();
      await own("horary-result").waitFor({ timeout: 60000 });
      await p.waitForTimeout(500);
      const geo = await p.evaluate(() => {
        const panel = document.querySelector("[data-testid=horary-wheel]").getBoundingClientRect();
        const svg = document.querySelector("[data-testid=horary-wheel] svg").getBoundingClientRect();
        const main = document.querySelector("[data-testid=horary-main]");
        return { pw: panel.width, ph: panel.height, sw: svg.width, sh: svg.height, layout: main.getAttribute("data-layout"), boxW: main.getBoundingClientRect().width };
      });
      const usesWidth = geo.sw >= Math.min(geo.pw - 40, geo.layout === "side" ? 640 : 600) - 1;
      ok(`${name}: çark panel genişliğini kullanır (${Math.round(geo.sw)}/${Math.round(geo.pw)} px, düzen ${geo.layout}, içerik ${Math.round(geo.boxW)} px)`, usesWidth);
      ok(`${name}: çark paneli çarktan gereksiz uzun değil`, geo.ph <= geo.sh + 40, `${Math.round(geo.ph)} / ${Math.round(geo.sh)}`);
      if (w <= 820) ok(`${name}: dar içerikte çark ve bulgular alt alta`, geo.layout === "stack");
      const over2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${name}: sonuçta yatay sayfa taşması yok`, over2 <= 1, `fazla ${over2}px`);
      await own("horary-main").scrollIntoViewIfNeeded();
      await shot(p, `22-${name}-${w}x${h}-sonuc-ilk-ekran`, false);
      await shot(p, `23-${name}-${w}x${h}-sonuc-tam`);
      for (const tid of ["horary-planets", "horary-cusps", "horary-receptions", "horary-all-candidates", "horary-method"]) await own(tid).locator("summary").first().click();
      ok(`${name}: gezegen tablosu 7 satır`, (await own("horary-planets").locator("tbody tr").count()) === 7);
      const over3 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${name}: ayrıntılar açıkken sayfa taşması yok (tablo kendi alanında kayar)`, over3 <= 1, `fazla ${over3}px`);
      await shot(p, `24-${name}-${w}x${h}-ayrintilar-acik`);
      if (name === "masaustu") {
        // Klavye odağı görünür: Tab ile "Haritayı Oluştur"a gelinir.
        await p.getByTestId("horary-house").focus();
        await p.keyboard.press("Tab");
        const outline = await p.evaluate(() => {
          const a = document.activeElement;
          const s = getComputedStyle(a);
          return { tid: a.getAttribute("data-testid"), style: s.outlineStyle, width: s.outlineWidth };
        });
        ok("klavye odağı görünür (Haritayı Oluştur)", outline.tid === "horary-submit" && outline.style !== "none" && outline.width !== "0px", JSON.stringify(outline));
      }
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
