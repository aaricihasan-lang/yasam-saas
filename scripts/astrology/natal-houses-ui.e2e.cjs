// Gökyüzü Atlası — #643 Natal 8 ev sistemi ARAYÜZ testi (Aşama 3). YEREL; sahte DB + sahte sağlayıcı (gerçek Roxy / DB YOK).
// Önkoşul: dev-fake-backend <fake> (FAKE_ROXY_CERT/KEY + FAKE_NATAL_REAL_GOLDEN=1 + FAKE_ROXY_RELABEL=1) ve yerel next sunucusu
//   (next dev --webpack; ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, ROXY_API_KEY=local-fake-roxy-key,
//    ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2, NODE_EXTRA_CA_CERTS=<cert>).
// Çalıştırma: node scripts/astrology/natal-houses-ui.e2e.cjs <origin> <genişlik> <yükseklik> [ekran-görüntüsü-klasörü]
// Ölçer: yatay taşma, ana öğelerin üst üste binmesi, iç kaydırma; Natal 8'li seçicinin sırası ve yalnız Natal'a uygulanması;
// ortak 4'lü seçicinin korunması ve bağımsızlığı; kutup / yüksek enlem / saat bilinmiyor bildirimleri; sonuç ekranında doğru ev
// sistemi + kaynak satırı + gezegen yorumu gizliliği; Natal+Sinastri+Solar Return özetleri. Tarayıcı öykünmesidir; fiziksel cihaz DEĞİL.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { mkdirSync } = require("node:fs");

const [ORIGIN = "http://localhost:3997", W = "1440", H = "900", OUT = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 768;
const BASE = `${ORIGIN}/admin/astroloji`;
const API = `${ORIGIN}/api/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const HDR = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}`, origin: ORIGIN };
const tag = `${width}px`;
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const api = async (path, body, method) => {
  const r = await fetch(`${API}${path}`, { method: method ?? (body ? "POST" : "GET"), headers: HDR, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* boş */
  }
  return { status: r.status, json };
};
const NATAL_ORDER = ["placidus", "whole-sign", "equal", "koch", "regiomontanus", "campanus", "porphyry", "alcabitius"];
const SHARED_ORDER = ["placidus", "whole-sign", "equal", "koch"];

/** Sayfa içi ölçüm: yatay taşma; görünür ve ölçülen öğeler arasında üst üste binme; kaydırılabilir iç kutular. */
function measureInPage(sels) {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const overflow = Math.max(0, de.scrollWidth - vw);
  const rects = [];
  for (const s of sels) {
    for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") rects.push({ s, r: { l: r.left, t: r.top, r: r.right, b: r.bottom } });
    }
  }
  const overlaps = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r;
      const b = rects[j].r;
      const ix = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const iy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (ix > 1 && iy > 1) overlaps.push(`${rects[i].s} × ${rects[j].s}`);
    }
  const outside = rects.filter((x) => x.r.l < -0.5 || x.r.r > vw + 0.5).map((x) => x.s);
  const inner = [];
  for (const el of document.querySelectorAll("[data-testid=atlas-natal-house-fields], [data-testid=atlas-technique-settings], [data-testid=atlas-params-card]")) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) inner.push(el.getAttribute("data-testid"));
  }
  return { overflow, overlaps: [...new Set(overlaps)], outside: [...new Set(outside)], inner };
}

(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  // ── Profiller (sahte DB) ──
  const list = await api("/profiles?limit=100");
  const profiles = list.json?.profiles ?? list.json?.items ?? [];
  const find = (prefix) => profiles.find((p) => String(p.label).startsWith(prefix))?.id ?? null;
  const ali = find("Ali Örnek");
  const partner = find("Sentetik B");
  const noTime = find("Saat bilinmeyen");
  const mk = async (label, locationId) => {
    const ex = find(label);
    if (ex) return ex;
    const r = await api("/profiles", { label, birthDate: "1979-09-03", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId });
    return r.json?.profile?.id ?? null;
  };
  const trondheim = await mk("Trondheim örnek (yüksek enlem)", "gn-3133880");
  const tromso = await mk("Tromsø örnek (kutup)", "gn-3133895");
  ok("profiller hazır (Ali, karşı taraf, saat bilinmeyen, Trondheim, Tromsø)", !!(ali && partner && noTime && trondheim && tromso), JSON.stringify({ ali, partner, noTime, trondheim, tromso }));

  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "tr-TR", timezoneId: "Europe/Istanbul", deviceScaleFactor: 1 });
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
  const SELS = ["[data-testid=atlas-natal-house-system]", "[data-testid=atlas-natal-classic-note]", "[data-testid=atlas-natal-shared-line]", "[data-testid=atlas-natal-polar]", "[data-testid=atlas-natal-high-lat]", "[data-testid=atlas-natal-time-unknown]", "[data-testid=atlas-method-note]", "select[aria-label='Ay düğümü']", "select[aria-label='Ev sistemi']"];
  const shot = async (name) => {
    await page.waitForTimeout(400);
    const m = await page.evaluate(measureInPage, SELS);
    ok(`${name}: yatay taşma yok`, m.overflow === 0, `${m.overflow}px`);
    ok(`${name}: ev sistemi alanları üst üste binmiyor`, m.overlaps.length === 0, m.overlaps.join(", "));
    ok(`${name}: alanlar ekran dışına taşmıyor`, m.outside.length === 0, m.outside.join(", "));
    ok(`${name}: Natal alanlarında iç kaydırma yok`, m.inner.filter((x) => x !== "atlas-technique-settings").length === 0, m.inner.join(", "));
    if (OUT) await page.screenshot({ path: `${OUT}/${width}-${name}.png`, fullPage: false });
  };
  const natalSel = () => page.locator("[data-testid=atlas-natal-house-system]:visible").first();

  const openNew = async () => {
    await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 180000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1200);
  };
  const pickClient = async (id, q) => {
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill(q);
    await page.waitForTimeout(900);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${id}"]`).click();
    await page.waitForTimeout(1200);
  };
  const check = async (id) => {
    await page.locator(`button[data-technique='${id}']`).first().click();
    await page.waitForTimeout(250);
  };
  const focus = async (id) => {
    await page.locator(`[data-technique-focus='${id}']`).first().click();
    await page.waitForTimeout(350);
    // Telefon: ayarlar odaktaki satırın içinde açılır; "Gelişmiş Ayarlar" (ev sistemi / düğüm) mevcut tasarımda KAPALI başlar → aç.
    const adv = page.locator("[data-testid=atlas-advanced]:visible").first();
    if ((await adv.count()) && !(await adv.evaluate((d) => d.open))) {
      await adv.locator("summary").first().click();
      await page.waitForTimeout(250);
    }
  };

  // ── A) Yalnız Natal + klasik sistem ──
  await openNew();
  await pickClient(ali, "Ali Örnek");
  await check("western.natal");
  await focus("western.natal");
  const opts = await natalSel().evaluate((s) => [...s.options].map((o) => o.value));
  ok("Natal seçicisi 8 sistem, mevcut 4'ün sırası korunmuş", JSON.stringify(opts) === JSON.stringify(NATAL_ORDER), opts.join(","));
  const groups = await natalSel().evaluate((s) => [...s.querySelectorAll("optgroup")].map((g) => g.label));
  ok("gruplar: Temel sistemler / Klasik sistemler", JSON.stringify(groups) === JSON.stringify(["Temel sistemler", "Klasik sistemler"]), groups.join(","));
  ok("Natal varsayılanı Placidus", (await natalSel().inputValue()) === "placidus");
  ok("Natal odakta ortak 4'lü seçici YOK (tekrar eden alan yok)", (await page.locator("select[aria-label='Ev sistemi']:visible").count()) === 0);
  await natalSel().selectOption("regiomontanus");
  await page.waitForTimeout(500);
  ok("klasik sistem notu görünür", await page.locator("[data-testid=atlas-natal-classic-note]:visible").isVisible());
  ok("teknik satırında Natal ev sistemi", /Regiomontanus/.test(await page.locator("[data-technique-house='western.natal']").first().innerText()));
  await shot("A-yalniz-natal-klasik");

  // ── B) Natal + Sinastri + Solar Return: bağımsızlık ──
  await check("western.synastry");
  await focus("western.synastry");
  await page.locator("select[aria-label='Karşı taraf profili']:visible").first().selectOption(partner);
  await check("western.solar_return");
  await focus("western.synastry");
  const sharedSel = page.locator("select[aria-label='Ev sistemi']:visible").first();
  const sOpts = await sharedSel.evaluate((s) => [...s.options].map((o) => o.value));
  ok("Sinastri: ortak seçici 4 sistem (klasik yok)", JSON.stringify(sOpts) === JSON.stringify(SHARED_ORDER), sOpts.join(","));
  ok("Sinastri odakta Natal'ın 8'li seçicisi YOK", (await page.locator("[data-testid=atlas-natal-house-system]:visible").count()) === 0);
  await sharedSel.selectOption("koch");
  await page.waitForTimeout(400);
  ok("ortak not Natal'ın ayrı seçildiğini söyler", /Natal'ın ev sistemi ayrı seçilir \(şu an Regiomontanus\)/.test(await page.locator("[data-testid=atlas-method-note]:visible").first().innerText()));
  await shot("B-sinastri-ortak-koch");
  await focus("western.natal");
  ok("ortak seçim Natal'ı değiştirmedi", (await natalSel().inputValue()) === "regiomontanus");
  const sharedLine = (await page.locator("[data-testid=atlas-natal-shared-line]:visible").first().innerText()).replace(/\s+/g, " ");
  ok("ortak satır: Solar return, Sinastri → Koch", /Solar return, Sinastri ortak ev sistemiyle hesaplanır: Koch/.test(sharedLine), sharedLine);
  await natalSel().selectOption("campanus");
  await page.waitForTimeout(400);
  await focus("western.solar_return");
  ok("Natal seçimi ortak seçimi değiştirmedi", (await page.locator("select[aria-label='Ev sistemi']:visible").first().inputValue()) === "koch");
  const houses = await page.locator("[data-testid=atlas-console-houses]").first().innerText().catch(() => "");
  ok("özet: Natal Campanus · diğer Batı Koch", /Natal: Campanus.*diğer Batı: Koch/.test(houses), houses);
  ok("teknik satırları: Sinastri/SR 'Koch · ortak'", /Koch · ortak/.test(await page.locator("[data-technique-house='western.synastry']").first().innerText()) && /Koch · ortak/.test(await page.locator("[data-technique-house='western.solar_return']").first().innerText()));
  await focus("western.natal");
  await shot("B-natal-sinastri-sr");
  // Hesap için ortak seçim Placidus'a döner: yerel sahte sağlayıcının golden Solar return yanıtı Placidus etiketli; Koch istenirse
  // projeksiyon "chart.houseSystem uyuşmuyor" ile HAKLI olarak reddeder (ürün hatası değil). Natal Campanus kalır.
  await focus("western.synastry");
  await page.locator("select[aria-label='Ev sistemi']:visible").first().selectOption("placidus");
  await page.waitForTimeout(400);
  await focus("western.natal");
  ok("ortak seçim Placidus'a dönünce Natal hâlâ Campanus", (await natalSel().inputValue()) === "campanus");

  // Plan (sunucu): seçim gövdeleri
  const plan = await api("/engine/plan", {
    profileId: ali,
    selections: [
      { technique: "western.natal", options: { houseSystem: "campanus", nodeType: "true" } },
      { technique: "western.synastry", options: { partnerProfileId: partner, houseSystem: "koch", nodeType: "true" } },
    ],
  });
  ok("plan: Natal Campanus + Sinastri Koch kabul (200)", plan.status === 200, String(plan.status));

  // Başlat → sonuç
  await page.locator("[data-testid=astro-run]:visible").first().click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 180000 });
  await page.waitForTimeout(1500);
  const tabSel = (id) => (mobile ? `[data-testid=astro-result-tabs-mobile] [data-tab-key-m^='${id}']` : `[data-tab-key^='${id}']`);
  const openTab = async (id) => {
    if (mobile && !(await page.locator(tabSel(id)).first().isVisible()) && (await page.locator("[data-testid=astro-result-tabs-more]").isVisible())) await page.locator("[data-testid=astro-result-tabs-more]").click();
    await page.locator(tabSel(id)).first().click();
    await page.waitForTimeout(900);
  };
  await openTab("western.natal");
  const head = await page.locator("body").innerText();
  ok("sonuç: Natal başlığında Campanus", /Natal[^\n]*Campanus/.test(head));
  ok("sonuç: kaynak satırı (Yaşam Sistemi klasik ev hesabı)", head.includes("Evler: Yaşam Sistemi klasik ev hesabı"));
  ok("sonuç: sağlayıcı adı görünmez", !/Roxy/i.test(head));
  await shot("C-sonuc-natal-campanus");
  const yorum = page.getByRole("tab", { name: /Yorum|Otomatik/ }).first();
  if (await yorum.count()) {
    await yorum.click();
    await page.waitForTimeout(700);
    ok("yorum: klasik sistem notu görünür", await page.locator("[data-testid=astro-local-houses-interp-note]").first().isVisible());
    const txt = await page.locator("body").innerText();
    ok("yorum: ev numaralı gezegen yorumu YOK", !/(Birinci|İkinci|Üçüncü|Dördüncü|Beşinci|Altıncı|Yedinci|Sekizinci|Dokuzuncu|Onuncu|On Birinci|On İkinci) Ev evinde/.test(txt));
    await shot("C2-sonuc-yorum");
  }
  await openTab("western.synastry");
  ok("sonuç: Sinastri Placidus (ortak seçim)", /Sinastri[^\n]*Placidus/.test(await page.locator("body").innerText()));
  await openTab("western.solar_return");
  ok("sonuç: Solar return Placidus (ortak seçim)", /Solar return[^\n]*Placidus/.test(await page.locator("body").innerText()));
  await openTab("western.natal");
  ok("sonuç: Natal hâlâ Campanus", /Natal[^\n]*Campanus/.test(await page.locator("body").innerText()));
  await shot("C3-sonuc-solar-return");

  // ── Aşama 4) Kaydet → kayıtlı (arşiv) analizi aç: ev hesabı satırı + canlı ile aynı klasik sistem notu; motor sürümü görünmez ──
  await page.locator("[data-testid=astro-desk-save]:visible").first().click();
  await page.waitForSelector("[data-testid=atlas-save-batch]", { timeout: 60000 });
  await page.locator("[data-testid=atlas-save-batch-confirm]").click();
  await page.waitForFunction(() => /başarıyla kaydedildi/.test(document.querySelector("[data-testid=astro-saved-notice]")?.textContent ?? ""), null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await openTab("western.natal");
  await page.locator("[data-testid=astro-open-saved]:visible").first().click();
  await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  const saved = (await page.locator("[data-testid=astro-saved-analysis]").first().innerText()).replace(/\s+/g, " ");
  ok("arşiv: kayıtlı Natal Campanus", /Campanus/.test(saved));
  ok("arşiv: 'Ev hesabı: Yaşam Sistemi klasik ev hesabı'", saved.includes("Ev hesabı: Yaşam Sistemi klasik ev hesabı"));
  ok("arşiv: motor sürümü / sağlayıcı adı görünmez", !/pro-houses|natal-local-houses|Roxy/i.test(saved));
  await shot("G-arsiv-natal-campanus");
  await page.getByRole("tab", { name: /Yorum|Otomatik/ }).first().click();
  await page.waitForTimeout(900);
  ok("arşiv yorum: klasik sistem notu görünür (canlı sonuçla aynı)", await page.locator("[data-testid=astro-local-houses-interp-note]:visible").first().isVisible());
  const savedYorum = await page.locator("[data-testid=astro-saved-analysis]").first().innerText();
  ok("arşiv yorum: ev numaralı gezegen yorumu YOK", !/(Birinci|İkinci|Üçüncü|Dördüncü|Beşinci|Altıncı|Yedinci|Sekizinci|Dokuzuncu|Onuncu|On Birinci|On İkinci) Ev evinde/.test(savedYorum));
  await shot("G2-arsiv-yorum");

  // ── D) Yüksek enlem / kutup / saat bilinmiyor ──
  for (const [id, q, sys, sel, name] of [
    [trondheim, "Trondheim", "porphyry", "atlas-natal-high-lat", "D-yuksek-enlem"],
    [tromso, "Tromsø", "regiomontanus", "atlas-natal-polar", "E-kutup"],
    [noTime, "Saat bilinmeyen", "alcabitius", "atlas-natal-time-unknown", "F-saat-bilinmiyor"],
  ]) {
    await openNew();
    await pickClient(id, q);
    await check("western.natal");
    await focus("western.natal");
    await natalSel().selectOption(sys);
    await page.waitForTimeout(1500);
    ok(`${name}: bildirim görünür`, await page.locator(`[data-testid=${sel}]:visible`).first().isVisible());
    if (name === "E-kutup") {
      const st = await page.locator("[data-testid=atlas-focus-status]").first().innerText().catch(() => "");
      ok("kutup: plan durumu engelli", /tanımsız|hesaplanamaz|engel/i.test(st), st);
      await natalSel().selectOption("whole-sign");
      await page.waitForTimeout(600);
      ok("kutup: Tam Burç seçilince bildirim kalkar", (await page.locator("[data-testid=atlas-natal-polar]:visible").count()) === 0);
      await natalSel().selectOption(sys);
    }
    await shot(name);
  }

  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  console.log(`\nSONUÇ [${tag}]: ${pass} PASS / ${fail} FAIL`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
