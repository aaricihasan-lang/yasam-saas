/* eslint-disable @typescript-eslint/no-require-imports */
// Gökyüzü Atlası — V3 KOMPAKT ANALİZ SEÇİCİ arayüz testi (2026-11-05). YEREL; sahte DB + sahte sağlayıcı (gerçek Roxy / DB YOK).
// Önkoşul: dev-fake-backend <fake> (FAKE_PICKER_SEED=1 FAKE_NATAL_REAL_GOLDEN=1 FAKE_ROXY_RELABEL=1 FAKE_ROXY_CERT/KEY) ve yerel next
//   (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, ROXY_API_KEY=local-fake-roxy-key,
//    ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2, NODE_EXTRA_CA_CERTS=<cert>).
// Çalıştırma: node scripts/astrology/atlas-picker-ui.e2e.cjs <origin> <genişlik> <yükseklik> [ekran-klasörü]
// Ölçer: şerit / ok yok; başlık = seçici; liste YALNIZ etkin profilin (kimlik) analizleri — aynı adlı ikinci Ali ve Ayşe karışmaz;
// kayıtlı ↔ kaydedilmemiş ↔ teknikler arası geçişler doğru kaydı açar; seçim sağlayıcı / hesap / kayıt isteği üretmez; sekme kapatma
// ve kaydedilmemiş taslak uyarısı korunur; telefonda alt panel (arka sayfa kilitli, geri tuşu yalnız paneli kapatır) + "⋯" işlemleri;
// klavye; uzun ad; arama; yatay taşma yok. Tarayıcı öykünmesidir; fiziksel cihaz DEĞİL.
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync } = require("node:fs");

const [ORIGIN = "http://localhost:3991", W = "1366", H = "768", OUT = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const phone = width < 640;
const BASE = `${ORIGIN}/admin/astroloji`;
const API = `${ORIGIN}/api/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const HDR = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}`, origin: ORIGIN };
const tag = `${width}`;
const results = [];
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  results.push({ name: n, ok: !!c, detail: x });
  console.log(`  ${c ? "✓" : "✗"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
// Seçimde YASAK istekler: hesap (/engine/run), kayıt (POST /analyses), not / Bilgi Bankası yazma, her türlü PATCH/PUT/DELETE.
// POST /api/admin/astroloji/workspace = getWorkspace (gövdeli OKUMA; sağlayıcı çağrılmaz — route.ts) → izinli, ayrıca sayılır.
const FORBIDDEN = /\/engine\/run|POST \/api\/admin\/astroloji\/(analyses|notes|kb)|PATCH|PUT|DELETE/;
const api = async (path) => {
  const r = await fetch(`${API}${path}`, { headers: HDR });
  return { status: r.status, json: await r.json().catch(() => null) };
};

(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  // ── Sentetik profiller (sunucudan, kimlikle) ──
  const prof = await api(`/profiles?view=archive&sort=name_asc&limit=100&offset=0`);
  const all = prof.json?.profiles ?? prof.json?.items ?? [];
  const alis = all.filter((p) => p.label === "Ali Örnek — natal");
  // Profilin TÜM kayıtlı analizleri (sunucu sayfa sınırı 100 → sayfalanır).
  const listOf = async (pid) => {
    const out = { analyses: [], total: 0 };
    for (let off = 0; off < 2000; off += 100) {
      const j = (await api(`/analyses?profileId=${pid}&offset=${off}&limit=100`)).json;
      out.total = j.total;
      out.analyses.push(...j.analyses);
      if (!j.hasMore || j.analyses.length === 0) break;
    }
    return out;
  };
  const withTotals = [];
  for (const a of alis) withTotals.push({ id: a.id, list: await listOf(a.id) });
  const ali1 = withTotals.find((x) => x.list.analyses.some((y) => y.title === "Ali natal (gerçek kayıt)"));
  const ali2 = withTotals.find((x) => x.list.analyses.some((y) => /İKİNCİ ALİ/.test(y.title)));
  const ayse = all.find((p) => p.label === "Ayşe Deneme — natal");
  ok("tohum: aynı adlı iki ayrı 'Ali Örnek — natal' profili + Ayşe", alis.length === 2 && !!ali1 && !!ali2 && ali1.id !== ali2.id && !!ayse, `${alis.length} Ali`);
  const ali1Titles = ali1.list.analyses.map((a) => a.title);
  const ali2Titles = ali2.list.analyses.map((a) => a.title);

  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "tr-TR", timezoneId: "Europe/Istanbul", deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone });
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
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 240)));
  page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
  let reqs = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) reqs.push(`${r.method()} ${u.pathname}${u.search}`);
  });
  const shot = async (name) => {
    if (!OUT) return;
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
  };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const trigger = page.locator("[data-testid=atlas-picker-trigger]:visible").first();
  const headline = async () => (await page.locator("[data-testid=atlas-picker-headline]:visible").first().innerText()).replace(/\s+/g, " ").trim();
  const panel = page.locator("[data-testid=atlas-picker-panel]");
  const openPicker = async () => {
    if ((await panel.count()) === 0) await trigger.click();
    await panel.first().waitFor({ state: "visible", timeout: 15000 });
    // kayıtlı liste yüklenirken panel bunu açıkça söyler; sayım testleri yükleme bitince yapılır
    await page.waitForFunction(() => !document.querySelector("[data-testid=atlas-picker-panel][data-loading]"), null, { timeout: 30000 });
    await page.waitForTimeout(200);
  };
  const options = () => page.locator("[data-testid=atlas-picker-panel] [role=option]");
  const optionTexts = async () => (await options().allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const pick = async (sel) => {
    await openPicker();
    const o = page.locator(`[data-testid=atlas-picker-panel] [role=option]${sel}`).first();
    await o.scrollIntoViewIfNeeded();
    await o.click();
    await page.waitForTimeout(400);
    // seçilen kayıt yüklenene kadar (dev derlemesi yavaş olabilir)
    await page.waitForFunction(() => !/Analiz yükleniyor/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(500);
  };
  const pickSaved = (id) => pick(`[data-picker-ref="saved:${id}"]`);
  const idByTitle = (list, re) => list.analyses.find((a) => re.test(a.title))?.id;
  const openClientFile = async (pid) => {
    await page.goto(`${BASE}#danisan/${pid}`, { waitUntil: "load", timeout: 180000 });
    await page.waitForSelector("[data-testid=astro-saved-analyses] [data-saved-item]", { timeout: 120000 });
    await page.waitForTimeout(600);
  };
  // Yeni Analiz: teknik, kendi sistem sekmesinde (Batı / Vedik / KP) seçilir.
  const checkTechnique = async (t) => {
    const sys = t.split(".")[0];
    const tab = page.locator(`[data-testid=atlas-system-dials] [data-system='${sys}']:visible`).first();
    if ((await tab.count()) && (await tab.getAttribute("aria-selected")) !== "true") {
      await tab.click();
      await page.waitForTimeout(400);
    }
    await page.locator(`button[data-technique='${t}']:visible`).first().click();
    await page.waitForTimeout(300);
  };
  const openSavedFromFile = async (id) => {
    const item = page.locator(`[data-testid=astro-saved-analyses] [data-saved-item="${id}"]`).first();
    for (let i = 0; i < 10 && (await item.count()) === 0; i++) {
      const more = page.locator("[data-testid=astro-analyses-more]").first();
      if (!(await more.count())) break;
      await more.click();
      await page.waitForTimeout(900);
    }
    await item.scrollIntoViewIfNeeded();
    await item.click();
    await page.waitForSelector("[data-testid=astro-saved-analysis], [data-testid=astro-saved-analysis-error]", { timeout: 90000 });
    await page.waitForSelector("[data-testid=atlas-picker-trigger]", { timeout: 30000 });
    await page.waitForTimeout(900);
  };

  // ═════════ A. KAYITLI MOD ═════════
  await openClientFile(ali1.id);
  const natalId = idByTitle(ali1.list, /gerçek kayıt/);
  await openSavedFromFile(natalId);
  ok("eski kayıtlı analiz şeridi yok", (await page.locator("[data-testid=astro-saved-tabs]").count()) === 0);
  ok("‹ › analiz okları yok", (await page.locator('[aria-label="Önceki analiz"], [aria-label="Sonraki analiz"]').count()) === 0);
  ok("başlık = seçici (Natal · tarih · kayıt adı)", /^Natal · \d\d\.\d\d\.\d{4} · Ali natal \(gerçek kayıt\)$/.test(await headline()), await headline());
  ok("danışan satırı profil adı", /ali örnek — natal/.test((await page.locator("[data-testid=atlas-picker-client]:visible").first().innerText()).toLocaleLowerCase("tr")));
  ok("kapalıyken liste yok", (await panel.count()) === 0);
  const hdr = await page.locator("[data-testid=atlas-desk-header]").first().boundingBox();
  // Ölçüt: telefonda tek satır (≤ 64 px); masaüstünde eski başlık + "KAYITLI ANALİZLER" şeridi toplamından (≈ 110 + 55 px) kısa.
  // 05.11 (owner: 768 / 1024 sadeleştirme): künye tek satır → telefon tek satır (≤ 64 px), tablet + masaüstü ≤ 140 px
  // (önce 768 / 1024 187 px; eski başlık + şerit ≈ 165 px).
  ok(`başlık kompakt (${phone ? "≤ 64" : "≤ 140"} px)`, hdr && hdr.height <= (phone ? 64 : 140), `${Math.round(hdr?.height ?? -1)}px`);
  if (!phone) {
    const tg = page.locator("[data-testid=atlas-desk-meta-toggle]:visible").first();
    const metaTxt = await page.locator("#atlas-desk-header-details").first().innerText();
    ok("künye tek satırda tam metin DOM'da (Placidus, danışan, kayıt)", /Placidus/.test(metaTxt) && /Danışan/.test(metaTxt) && /kayıt/.test(metaTxt), metaTxt.replace(/\s+/g, " ").slice(0, 80));
    await tg.click();
    await page.waitForTimeout(300);
    const hOpen = (await page.locator("[data-testid=atlas-desk-header]").first().boundingBox()).height;
    ok("Künye ▾ açılınca tam künye (çipler) görünür", (await page.locator("[data-testid=atlas-desk-meta-toggle]:visible").first().getAttribute("aria-expanded")) === "true" && (await page.locator("ul[data-testid=atlas-chart-meta]:visible").count()) === 1, `${Math.round(hOpen)}px`);
    await page.locator("[data-testid=atlas-desk-meta-toggle]:visible").first().click();
    await page.waitForTimeout(300);
    ok("Künye ▴ ile tekrar tek satır", Math.round((await page.locator("[data-testid=atlas-desk-header]").first().boundingBox()).height) === Math.round(hdr.height));
  }
  ok("yatay taşma yok (kapalı)", (await overflow()) <= 0, `${await overflow()}px`);
  await shot("1-kayitli-kapali");

  reqs = [];
  await openPicker();
  const t1 = await optionTexts();
  ok("liste = Ali #1'in kayıtlı analiz sayısı (sunucu toplamı)", t1.length === ali1.list.total, `${t1.length}/${ali1.list.total}`);
  ok("aynı adlı İKİNCİ Ali'nin kayıtları yok", !t1.some((t) => /İKİNCİ ALİ/.test(t)));
  ok("Ayşe'nin (ayrıntısında 'Ali Örnek' geçen) kaydı yok", !t1.some((t) => /AYŞE/.test(t)));
  ok("uzman (başka tenant) kaydı yok", !t1.some((t) => /Uzman natal/.test(t)));
  const fams = await page.locator("[data-testid=atlas-picker-panel] [data-picker-family]").evaluateAll((els) => els.map((e) => e.getAttribute("data-picker-family")));
  ok("teknik grupları sırayla", JSON.stringify(fams) === JSON.stringify(["natal", "zaman", "iliski", "vedik", "kp"].filter((f) => fams.includes(f))) && fams.length >= 4, fams.join(","));
  const pb = await panel.first().boundingBox();
  ok("liste ekran içinde", pb && pb.y >= 0 && pb.y + pb.height <= height + 1 && pb.x >= 0 && pb.x + pb.width <= width + 1, JSON.stringify(pb && { y: Math.round(pb.y), h: Math.round(pb.height) }));
  ok(`panel türü ${phone ? "alt panel" : "açılır liste"}`, (await panel.first().getAttribute("data-mode")) === (phone ? "sheet" : "popover"));
  const minH = await options().evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().height)));
  ok(`satır ≥ 44 px`, minH >= 44, `${Math.round(minH)}px`);
  const sc = await page.locator("[data-testid=atlas-picker-list]").evaluate((l) => ({ sh: l.scrollHeight, ch: l.clientHeight }));
  ok("uzun liste kendi içinde kayar", sc.sh > sc.ch || t1.length < 8, `${sc.sh}>${sc.ch}`);
  ok("yatay taşma yok (açık)", (await overflow()) <= 0);
  if (phone) ok("telefon: arka sayfa kaydırması kilitli", (await page.evaluate(() => document.body.style.overflow)) === "hidden");
  await shot("2-liste-acik");
  // en uzun adlı kayıt: kırpılır, taşmaz
  const longRef = `saved:${idByTitle(ali1.list, /çok uzun başlıklı/)}`;
  const longBox = await page.locator(`[data-picker-ref="${longRef}"]`).boundingBox();
  ok("en uzun kayıt adı satıra sığar (taşma yok)", !!longBox && longBox.x + longBox.width <= width + 1);
  // son satıra ulaşılır
  await page.locator("[data-testid=atlas-picker-list]").evaluate((l) => (l.scrollTop = l.scrollHeight));
  await page.waitForTimeout(150);
  const lastB = await options().last().boundingBox();
  const listB = await page.locator("[data-testid=atlas-picker-list]").boundingBox();
  ok("son analize ulaşılır", lastB && listB && lastB.y + lastB.height <= listB.y + listB.height + 1);
  if (phone) await shot("3-uzun-liste-sonu");
  // arama
  await page.locator("[data-testid=atlas-picker-search]").fill("solar");
  await page.waitForTimeout(200);
  const sTexts = await optionTexts();
  const solarN = ali1.list.analyses.filter((a) => a.technique === "western.solar_return" || a.technique === "western.solar_arc").length;
  ok("arama 'solar' yalnız Solar return / arc (sunucu listesindeki sayı kadar)", sTexts.length === solarN && solarN >= 2 && sTexts.every((t) => /^Solar (return|arc)/.test(t)), `${sTexts.length}/${solarN}`);
  await shot("4-arama");
  await page.locator("[data-testid=atlas-picker-search]").fill("zzzz-yok");
  await page.waitForTimeout(150);
  ok("eşleşmeyen arama: boş liste bildirimi", (await options().count()) === 0 && /Eşleşen analiz yok/.test(await page.locator("[data-testid=atlas-picker-list]").innerText()));
  await page.locator("[data-testid=atlas-picker-search]").fill("");
  ok("liste açma/arama hiçbir API isteği üretmedi (liste önbellekte)", reqs.filter((r) => !/GET \/api\/auth\/session/.test(r)).length === 0, reqs.join(", "));

  if (phone) await page.keyboard.press("Escape").catch(() => {});
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // uzun adlı kaydı seç → başlık taşmaz. (Bu SENTETİK kayıt boş anlık görüntüyle tohumlandığı için sunucu açamaz → hata yolu:
  // seçici yine görünür kalmalı, başka analize geçilebilmeli.)
  await pick(`[data-picker-ref="${longRef}"]`);
  await page.waitForTimeout(800);
  const tb = await trigger.boundingBox();
  ok("uzun adlı analiz başlıkta kısalır, düğmelerin üzerine binmez", tb && tb.x + tb.width <= width && (await overflow()) <= 0, `${Math.round(tb?.x + tb?.width)}/${width}`);
  ok("kayıt açılamazsa (sunucu hatası) seçici görünür kalır", (await page.locator("[data-testid=astro-saved-analysis-error]").count()) === 1 && (await trigger.isVisible()) && /çok uzun başlıklı/.test(await headline()));
  await shot("5-uzun-ad-kapali");
  await pickSaved(natalId);
  await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  ok("hata ekranından seçiciyle başka analize geçilir", (await page.locator("[data-testid=astro-saved-analysis]").count()) === 1 && /gerçek kayıt/.test(await headline()));

  // ── Danışan A → B (aynı ad) → A ──
  await openClientFile(ali2.id);
  await openSavedFromFile(idByTitle(ali2.list, /İKİNCİ ALİ natal/));
  await openPicker();
  const t2 = await optionTexts();
  ok("Ali #2: yalnız kendi 2 analizi", t2.length === ali2.list.total && t2.length === 2 && t2.every((t) => /İKİNCİ ALİ/.test(t)), t2.join(" | "));
  ok("Ali #2: Ali #1 kayıtları yok", !t2.some((t) => /gerçek kayıt|Sentetik liste|Vimshottari|solar return/.test(t)));
  ok("Ali #2: 8'den az analizde arama kutusu yok", (await page.locator("[data-testid=atlas-picker-search]").count()) === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await openClientFile(ayse.id);
  await openSavedFromFile((await listOf(ayse.id)).analyses[0].id);
  await openPicker();
  const t3 = await optionTexts();
  ok("Ayşe: yalnız kendi kaydı (adında 'Ali Örnek' geçse de)", t3.length === 1 && /AYŞE/.test(t3[0]), t3.join(" | "));
  await page.keyboard.press("Escape");
  await openClientFile(ali1.id);
  await openSavedFromFile(natalId);
  await openPicker();
  ok("Ali #1'e dönüş: liste yine yalnız Ali #1", (await optionTexts()).length === ali1.list.total && !(await optionTexts()).some((t) => /İKİNCİ|AYŞE/.test(t)));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── Telefon: ⋯ menüsü + geri tuşu ──
  if (phone) {
    const menu = page.locator("[data-testid=atlas-desk-menu-toggle]:visible").first();
    ok("telefon: işlemler kapalıyken gizli", !(await page.locator("[data-testid=atlas-desk-header-actions]").first().isVisible()));
    await menu.click();
    await page.waitForTimeout(250);
    const actTxt = await page.locator("[data-testid=atlas-desk-header-actions]").first().innerText();
    ok("telefon: ⋯ içinde Word / PDF / Teknik Ekle / Odak modu / Sistem yorumu", /Word/.test(actTxt) && /PDF/.test(actTxt) && /Teknik Ekle/.test(actTxt) && /Odak modu/.test(actTxt) && /yorum/i.test(actTxt), actTxt.replace(/\s+/g, " ").slice(0, 160));
    ok("telefon: ⋯ açıkken künye görünür", await page.locator("#atlas-desk-header-details").first().isVisible());
    ok("telefon: ⋯ açıkken yatay taşma yok", (await overflow()) <= 0);
    await shot("6-islem-menusu");
    await menu.click();
    // geri tuşu: yalnız paneli kapatır, sayfa aynı kalır
    await openPicker();
    await page.goBack();
    await page.waitForTimeout(700);
    ok("telefon: geri tuşu alt paneli kapatır", (await panel.count()) === 0);
    ok("telefon: geri tuşundan sonra aynı analiz ekranında", (await page.locator("[data-testid=astro-saved-analysis]").count()) === 1 && /Natal/.test(await headline()));
    ok("telefon: panel kapanınca sayfa kaydırma geri açılır", (await page.evaluate(() => document.body.style.overflow)) === "");
    await openPicker();
    await page.locator("[data-testid=atlas-picker-scrim]").click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);
    ok("telefon: arka plana dokununca panel kapanır", (await panel.count()) === 0);
    await openPicker();
    await pickSaved(idByTitle(ali1.list, /KP dasha/));
    // (KP dasha kaydı SENTETİK boş anlık görüntülü → sunucu açamaz; kayıtlı görünüm ya da hata görünümü — ikisinde de seçici yerinde)
    ok("telefon: seçimden sonra panel kapanır ve sayfa aynı kalır", (await panel.count()) === 0 && /^KP dasha/.test(await headline()) && (await page.locator("[data-testid=astro-saved-analysis], [data-testid=astro-saved-analysis-error]").count()) === 1);
    await page.waitForTimeout(400);
    await page.goBack();
    await page.waitForTimeout(900);
    ok("telefon: seçimden sonra geri tuşu bir önceki ekrana gider (fazladan geçmiş girdisi yok)", (await page.locator("[data-testid=astro-saved-analysis]").count()) === 0, page.url());
    await openClientFile(ali1.id);
    await openSavedFromFile(natalId);
  } else {
    ok("masaüstü: ⋯ menüsü yok, işlemler görünür", !(await page.locator("[data-testid=atlas-desk-menu-toggle]").first().isVisible()) && (await page.locator("[data-testid=atlas-desk-header-actions]").first().isVisible()));
    // klavye
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    ok("klavye: ↓ listeyi açar", (await panel.count()) === 1);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    ok("klavye: Esc kapatır, odak seçiciye döner", (await panel.count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "atlas-picker-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const firstFocus = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") || document.activeElement?.getAttribute("data-picker-ref"));
    ok("klavye: Enter açar, odak aramada / seçili satırda", firstFocus === "atlas-picker-search" || /^saved:/.test(firstFocus ?? ""), String(firstFocus));
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-picker-ref"));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    ok("klavye: ↓↓ Enter bir analiz seçer", !!focused && (await panel.count()) === 0, String(focused));
    ok("erişilebilirlik: tetikleyici aria-haspopup=listbox + aria-expanded", (await trigger.getAttribute("aria-haspopup")) === "listbox" && (await trigger.getAttribute("aria-expanded")) === "false");
    await pickSaved(natalId);
  }

  // ═════════ B. MASA MODU (kaydedilmemiş) ═════════
  reqs = [];
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 180000 });
  await page.locator("[data-portal=new]").first().click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1000);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${ali1.id}"]`).click();
  await page.waitForTimeout(1200);
  const TECHS = ["western.natal", "western.transit", "western.solar_return", "western.progression", "vedic.d1", "kp.chart"];
  for (const t of TECHS) await checkTechnique(t);
  // Progression: sahte sağlayıcının golden'ı yalnız 2026-10-07 hedef tarihi için var (başka tarih = bilinçli 501).
  await page.locator("[data-testid=atlas-system-dials] [data-system='western']:visible").first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator(`[data-technique-focus='western.progression']:visible`).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const td = page.locator('input[aria-label="Hedef tarih"]:visible').first();
  if (await td.count()) await td.fill("2026-10-07");
  await page.waitForTimeout(300);
  await page.locator("[data-testid=astro-run]:visible").first().click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 180000 });
  await page.waitForSelector("[data-testid=atlas-picker-trigger]", { timeout: 30000 });
  await page.waitForTimeout(1500);
  ok("masa: açık analiz şeridi yok", (await page.locator("[data-testid=astro-result-tabs]").count()) === 0);
  if (await page.locator("[data-testid=atlas-fail-indicator]").count()) console.log("    (bilgi: hesaplama hatası göstergesi görünür)");
  ok("masa: '+ Teknik Ekle' korunur", (await page.locator("[data-testid=atlas-add-technique-btn]").count()) === 1);
  await openPicker();
  const b1 = await optionTexts();
  const benchTechs = await page.locator("[data-testid=atlas-picker-panel] [data-picker-kind=bench]").evaluateAll((els) => els.map((e) => e.getAttribute("data-picker-technique")));
  const unsaved = benchTechs.length;
  ok("masa: 6 teknik hesaplandı (kaydedilmemiş)", TECHS.every((t) => benchTechs.includes(t)), benchTechs.join(","));
  ok("masa: liste = kayıtlı + kaydedilmemiş", b1.length === ali1.list.total + unsaved, `${b1.length} = ${ali1.list.total} + ${unsaved}`);
  ok("masa: kaydedilmemiş satırlar işaretli", (await page.locator("[data-testid=atlas-picker-panel] [data-picker-state=unsaved]").count()) === unsaved);
  ok("masa: açık sekme × yalnız masadaki sonuçlarda", (await page.locator("[data-testid=atlas-picker-panel] [data-picker-close]").count()) === unsaved);
  await shot("7-masa-liste");
  // ── Geçişler (masada, kaydedilmemiş): Natal → Transit → Solar Return → Progression → Vedik → KP → Natal ──
  const CHAIN = [["Transit", "western.transit", /^Transit/], ["Solar Return", "western.solar_return", /^Solar return/], ["Secondary Progression", "western.progression", /^Secondary progression/], ["Vedik", "vedic.d1", /^Vedik D1/], ["KP", "kp.chart", /^KP doğum haritası/], ["Natal", "western.natal", /^Natal/]];
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  let prevB = "Natal";
  for (const [name, t, re] of CHAIN) {
    reqs = [];
    await pick(`[data-picker-kind=bench][data-picker-technique='${t}']`);
    const h = await headline();
    const bad = reqs.filter((r) => FORBIDDEN.test(r));
    ok(`masa geçiş ${prevB} → ${name}: doğru sonuç (kaydedilmemiş)`, re.test(h) && /kaydedilmedi/.test(await trigger.innerText()) && (await page.locator("[data-testid=astro-desk-save]").count()) >= 1, h);
    ok(`masa geçiş ${prevB} → ${name}: hesap / sağlayıcı / kayıt isteği yok`, bad.length === 0, bad.join(", "));
    prevB = name;
  }
  // ── Tümünü kaydet → aynı zincir KAYITLI analizlerle ──
  await openPicker();
  const savedRefsBefore = new Set(await page.locator("[data-testid=atlas-picker-panel] [data-picker-kind=saved]").evaluateAll((els) => els.map((e) => e.getAttribute("data-picker-ref"))));
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  if (phone) {
    await page.locator("[data-testid=atlas-desk-menu-toggle]:visible").first().click();
    await page.waitForTimeout(250);
  }
  await page.locator("[data-testid=astro-desk-save]:visible").first().click();
  await page.waitForSelector("[data-testid=atlas-save-batch]", { timeout: 60000 });
  await page.locator("[data-testid=atlas-save-batch-confirm]").click();
  await page.waitForFunction(() => /başarıyla kaydedildi/.test(document.querySelector("[data-testid=astro-saved-notice]")?.textContent ?? ""), null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  if (phone && (await page.locator("[data-testid=atlas-desk-menu-toggle][aria-expanded=true]").count())) await page.locator("[data-testid=atlas-desk-menu-toggle]:visible").first().click();
  await openPicker();
  const newSaved = await page.locator("[data-testid=atlas-picker-panel] [data-picker-kind=saved]").evaluateAll((els) => els.map((e) => ({ ref: e.getAttribute("data-picker-ref"), t: e.getAttribute("data-picker-technique") })));
  const fresh = newSaved.filter((x) => !savedRefsBefore.has(x.ref));
  ok("kaydet: 6 yeni kayıtlı analiz listede; kaydedilmemiş satır kalmadı (tek satır)", TECHS.every((t) => fresh.some((x) => x.t === t)) && (await page.locator("[data-testid=atlas-picker-panel] [data-picker-kind=bench]").count()) === 0, `${fresh.length} yeni`);
  ok("kaydet: kayıtlı satırlar masadaki sekmeyi de bilir (data-picker-open)", (await page.locator("[data-testid=atlas-picker-panel] [data-picker-kind=saved][data-picker-open]").count()) === 6);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  // Masa kipinde: masada açık kayıtlı satır seçilince eski şerit gibi MASA SEKMESİNE geçilir (değişmez kayıt açılmaz)
  reqs = [];
  await pick(`[data-picker-ref="${fresh.find((x) => x.t === "western.transit").ref}"]`);
  ok("masa kipinde masada açık kayıtlı satır → masa sekmesi (istek yok)", (await page.locator("[data-testid=astro-saved-analysis]").count()) === 0 && /^Transit/.test(await headline()) && reqs.filter((r) => /GET \/api\/admin\/astroloji\/analyses\/[0-9a-f-]{36}/.test(r)).length === 0, await headline());
  // Kayıtlı kipe geç ("Kayıtlı analizi aç") → zincir değişmez kayıtlarla
  if (phone && (await page.locator("[data-testid=atlas-desk-menu-toggle][aria-expanded=false]:visible").count())) await page.locator("[data-testid=atlas-desk-menu-toggle]:visible").first().click();
  await page.locator("[data-testid=astro-open-saved]:visible").first().click();
  await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
  await page.waitForTimeout(800);
  ok("'Kayıtlı analizi aç' masadaki etkin sonucun değişmez kaydını açar (Transit)", /^Transit/.test(await headline()));
  // zincir Natal'dan başlasın (açılan kayıt Transit — aynı satırı yeniden seçmek bilinçli olarak işlem yapmaz)
  await pick(`[data-picker-ref="${fresh.find((x) => x.t === "western.natal").ref}"]`);
  let prevS = "Natal";
  for (const [name, t, re] of CHAIN) {
    const ref = fresh.find((x) => x.t === t)?.ref ?? "yok";
    reqs = [];
    await pick(`[data-picker-ref="${ref}"]`);
    const h = await headline();
    const id = ref.slice("saved:".length);
    const fetched = reqs.filter((r) => /GET \/api\/admin\/astroloji\/analyses\/[0-9a-f-]{36}/.test(r));
    const bad = reqs.filter((r) => FORBIDDEN.test(r));
    ok(`kayıtlı geçiş ${prevS} → ${name}: doğru kayıt`, re.test(h) && (await page.locator("[data-testid=astro-saved-analysis]").count()) === 1 && fetched.length > 0 && fetched.every((r) => r.includes(id)), `${h} · beklenen …${id.slice(-8)} · okunan ${fetched.map((r) => "…" + r.split("/analyses/")[1].slice(-8)).join(",")} · kayıtlı=${await page.locator("[data-testid=astro-saved-analysis]").count()}`);
    ok(`kayıtlı geçiş ${prevS} → ${name}: hesap / sağlayıcı / kayıt isteği yok`, bad.length === 0, bad.join(", "));
    prevS = name;
  }
  await shot("8-kayitli-zincir-son");
  // Yeni masa: natal + transit (kaydedilmemiş) — kayıtlı ↔ kaydedilmemiş, taslak uyarısı, sekme kapatma
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 180000 });
  await page.locator("[data-portal=new]").first().click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1000);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${ali1.id}"]`).click();
  await page.waitForTimeout(1200);
  await checkTechnique("western.natal");
  await checkTechnique("western.transit");
  await page.locator("[data-testid=astro-run]:visible").first().click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 180000 });
  await page.waitForTimeout(1500);
  // kaydedilmemiş → kayıtlı → kaydedilmemiş
  reqs = [];
  await pickSaved(natalId);
  ok("kaydedilmemiş → kayıtlı: kayıtlı analiz açıldı", (await page.locator("[data-testid=astro-saved-analysis]").count()) === 1 && /gerçek kayıt/.test(await headline()));
  await pick("[data-picker-kind=bench][data-picker-technique='western.transit']");
  ok("kayıtlı → kaydedilmemiş: masadaki transit açıldı (bellekten)", (await page.locator("[data-testid=astro-desk-save]").count()) >= 1 && /^Transit/.test(await headline()) && /kaydedilmedi/.test(await trigger.innerText()));
  ok("kayıtlı ↔ kaydedilmemiş geçişleri hesap / sağlayıcı / kayıt isteği üretmedi", reqs.filter((r) => FORBIDDEN.test(r)).length === 0, reqs.filter((r) => /engine|POST/.test(r)).join(", "));
  // kaydedilmemiş taslak uyarısı (Kendi Yorumum) → kayıtlıya geçerken sorulur
  const noteTab = page.getByRole("tab", { name: /Kendi Yorumum/ });
  if ((await noteTab.count()) > 0 && (await noteTab.first().isVisible())) await noteTab.first().click();
  else await page.getByText("Kendi Yorumum", { exact: true }).first().click();
  await page.locator("textarea:visible").first().fill("Test taslağı — kaydedilmedi");
  await page.waitForTimeout(400);
  ok("taslak yazıldı (kaydedilmemiş değişiklik rozeti)", (await page.locator("[data-testid=astro-note-dirty]:visible").count()) > 0);
  await shot("9-taslak-yazildi");
  await pickSaved(natalId);
  await shot("9b-taslak-gecis");
  ok("taslak varken kayıtlıya geçiş: kaydedilmemiş değişiklik uyarısı", await page.locator("[data-testid=atlas-unsaved-dialog]").isVisible());
  await page.locator("[data-testid=atlas-unsaved-stay]").click();
  await page.waitForTimeout(500);
  ok("uyarıda 'kal': masa ve taslak korunur", /^Transit/.test(await headline()) && (await page.locator("textarea:visible").first().inputValue()) === "Test taslağı — kaydedilmedi");
  // "Kaydetmeden Çık": geçiş yapılır, YENİ kayıt oluşmaz, kaydedilmemiş SONUÇ masada kalır (yalnız taslak gider — bilinçli seçim)
  const totalBeforeDiscard = (await listOf(ali1.id)).total;
  reqs = [];
  await pickSaved(natalId);
  await page.locator("[data-testid=atlas-unsaved-discard]").click();
  await page.waitForTimeout(1500);
  ok("'Kaydetmeden Çık': kayıtlı analize geçildi", (await page.locator("[data-testid=astro-saved-analysis]").count()) === 1 && /gerçek kayıt/.test(await headline()));
  ok("'Kaydetmeden Çık': kayıt sayısı değişmedi, kayıt isteği yok", (await listOf(ali1.id)).total === totalBeforeDiscard && reqs.filter((r) => /POST \/api\/admin\/astroloji\/analyses\b/.test(r)).length === 0);
  await pick("[data-picker-kind=bench][data-picker-technique='western.transit']");
  ok("kaydedilmemiş transit sonucu masada duruyor (kaybolmadı)", /^Transit/.test(await headline()) && /kaydedilmedi/.test(await trigger.innerText()));
  // aynı teknikte farklı kayda geçiş: masadaki transit (kaydedilmemiş) → daha önce kaydedilen transit (kayıtlı)
  await openPicker();
  const savedTr = await page.locator("[data-testid=atlas-picker-panel] [role=option][data-picker-kind=saved][data-picker-technique='western.transit']").evaluateAll((els) => els.map((e) => e.getAttribute("data-picker-ref")));
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  const trRef = savedTr.find((r) => fresh.some((x) => x.ref === r)) ?? savedTr[0];
  await pick(`[data-picker-ref="${trRef}"]`);
  ok("aynı teknik: kaydedilmemiş transit → kayıtlı transit (ayrı kayıt, tarihli)", (await page.locator("[data-testid=astro-saved-analysis]").count()) === 1 && /^Transit \(tek an\) · \d\d\.\d\d\.\d{4}/.test(await headline()), await headline());
  await pick("[data-picker-kind=bench][data-picker-technique='western.transit']");
  // taslağı yeniden yaz (sonraki sekme kapatma testleri için)
  const noteTab2 = page.getByRole("tab", { name: /Kendi Yorumum/ });
  if ((await noteTab2.count()) > 0 && (await noteTab2.first().isVisible())) await noteTab2.first().click();
  else await page.getByText("Kendi Yorumum", { exact: true }).first().click();
  await page.locator("textarea:visible").first().fill("Test taslağı — kaydedilmedi");
  await page.waitForTimeout(400);
  // sekme kapatma (taslaklı → uyarı)
  await openPicker();
  await page.locator("[data-testid=atlas-picker-panel] [data-picker-close*='western.transit']").first().click();
  await page.waitForTimeout(400);
  ok("taslaklı sekmeyi kapatma: uyarı sorulur", await page.locator("[data-testid=atlas-unsaved-dialog]").isVisible());
  await page.locator("[data-testid=atlas-unsaved-stay]").click();
  await page.waitForTimeout(300);
  await page.locator("textarea:visible").first().fill("");
  await page.waitForTimeout(400);
  await openPicker();
  await page.locator("[data-testid=atlas-picker-panel] [data-picker-close*='western.transit']").first().click();
  await page.waitForTimeout(600);
  await openPicker();
  ok("taslaksız sekme kapatıldı: listeden kalktı", (await page.locator("[data-testid=atlas-picker-panel] [data-picker-kind=bench][data-picker-technique='western.transit']").count()) === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // ── 500 kayıtlık ilk yükleme sınırı (520 kayıtlı sentetik profil): eksik liste açıkça yazılır, "Daha fazla yükle" tamamlar
  const many = (await api(`/profiles?limit=30&offset=0&sort=recent&q=${encodeURIComponent("Çok Kayıtlı")}`)).json.profiles[0];
  if (many) {
    const manyList = await listOf(many.id);
    await openClientFile(many.id);
    await openSavedFromFile(manyList.analyses[0].id);
    await openPicker();
    const part = await page.locator("[data-testid=atlas-picker-partial]").innerText().catch(() => "");
    ok("500 sınırı: ilk yüklemede 500 / 520 ve 'Daha fazla yükle'", (await options().count()) === 500 && /500 \/ 520/.test(part) && (await page.locator("[data-testid=atlas-picker-more]").count()) === 1, `${await options().count()} · ${part.replace(/\s+/g, " ")}`);
    await page.locator("[data-testid=atlas-picker-more]").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=atlas-picker-panel] [role=option]").length === 520, null, { timeout: 30000 }).catch(() => {});
    ok("500 sınırı: 'Daha fazla yükle' sonrası 520 / 520, uyarı kalkar", (await options().count()) === 520 && (await page.locator("[data-testid=atlas-picker-more]").count()) === 0, String(await options().count()));
    await page.locator("[data-testid=atlas-picker-search]").fill("Çok kayıt 517");
    await page.waitForTimeout(200);
    ok("500 sınırı: sonradan yüklenen kayıt aramada bulunur", (await options().count()) === 1);
    await page.keyboard.press("Escape").catch(() => {});
  } else ok("500 sınırı tohumu bulundu", false, "FAKE_PICKER_SEED=1 tohumunda 'Çok Kayıtlı Örnek' yok");

  // ── Künye uyarısı her genişlikte görünür: saat bilinmeyen sentetik profil → "Saat bilinmiyor · evler gizli"
  const tu = (await api(`/profiles?limit=30&offset=0&sort=recent&q=${encodeURIComponent("Saat bilinmeyen")}`)).json.profiles[0];
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 180000 });
  await page.locator("[data-portal=new]").first().click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1000);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Saat bilinmeyen");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${tu.id}"]`).click();
  await page.waitForTimeout(1200);
  await checkTechnique("western.natal");
  await page.locator("[data-testid=astro-run]:visible").first().click();
  await page.waitForSelector("[data-testid=atlas-picker-trigger]", { timeout: 180000 });
  await page.waitForTimeout(1500);
  const warnChip = page.locator("[data-testid=atlas-desk-header-primary]:visible", { hasText: "Saat bilinmiyor" });
  ok("künye uyarısı ('Saat bilinmiyor') menü açılmadan görünür", (await warnChip.count()) === 1, phone ? "telefon" : "masaüstü");
  await shot("10-saat-bilinmiyor-uyari");
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  ok("yatay taşma yok (son)", (await overflow()) <= 0);

  await browser.close();
  if (OUT) writeFileSync(`${OUT}/${tag}-sonuc.json`, JSON.stringify({ pass, fail, results, ali1: ali1.id, ali2: ali2.id, ali1Titles, ali2Titles }, null, 1));
  console.log(`\natlas-picker-ui [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("atlas-picker-ui çöktü:", e);
  process.exit(1);
});
