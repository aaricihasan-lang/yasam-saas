// 2026-10-19 Gökyüzü Atlası "Yakında" bilgilendirme şeridi + görünümü — gerçek tarayıcı (Playwright Chromium).
// YEREL: next dev + dev-fake-backend (sahte PostgREST). Gerçek DB / sağlayıcı YOK; ROXY_API_KEY verilmez.
// Çalıştırma: node scripts/astrology/coming-soon-ui.e2e.cjs <origin> <genişlik> <yükseklik> [ekran-görüntüsü-klasörü]
//   S1 ana ekran: dört kart + altında ince "Yakında" şeridi; kart ölçüleri yazdırılır (taban karşılaştırması için)
//   S2 şerit → #yakinda; 10 bölüm, her birinde "GELİŞTİRİLİYOR"; onaylı tüm teknik adları; "Değerlendiriliyor" yok;
//      adlar arasında "·" yok; geliştirme süreci notları; sağlayıcı adı yok
//   S3 Yakında görünümünde hiçbir /api isteği ve sağlayıcı isteği yok; analiz / kayıt tetiklenmez
//   S4 klavye: bölüm başlığı Enter ile kapanır / açılır; odak işareti
//   S5 geri / ileri, yenileme ve doğrudan #yakinda bağlantısı; "Ana ekrana dön"
//   S6 regresyon: Yeni Analiz, Analiz Arşivi, Bilgi Bankası, Son Çalışmalar, Yeni doğum profili (kaydetmeden), Analiz Merkezi bağlantısı
//   S7 yatay taşma yok; metin kesilmiyor
// Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const [ORIGIN = "http://localhost:3961", W = "1366", H = "860", OUT = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const BASE = `${ORIGIN}/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const tag = `${width}×${height}`;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};

// Owner onaylı metin (2026-10-18/19) — bileşenden BAĞIMSIZ kopya: bileşen bir adı düşürürse test yakalar.
const SECTIONS = [
  ["Klasik Batı Horary Ekolleri", ["William Lilly (1647)", "Guido Bonatti", "Sahl ibn Bishr", "Māshā'allāh", "Çağdaş Geleneksel Horary", "Modern Horary Yaklaşımları"]],
  ["Vedik Prashna Ekolleri", ["Genel Prashna Kundali", "Tajika Prashna", "Prashna Marga", "Ashtamangala Prashna", "Shatpanchasika"]],
  ["Yeni Batı Astrolojisi Haritaları ve Hesaplamaları", ["Arap Noktaları (Hermetik Lotlar)", "Gezegen Dönüş Haritaları (Satürn, Jüpiter, Mars, Venüs, Merkür)", "Yıllık Profeksiyonlar", "Asteroit Hesaplamaları (Ceres, Pallas, Juno, Vesta)", "Deklinasyon Paralelleri"]],
  ["Batı Astrolojisi Ek Hesaplama ve Takvim Ayrıntıları", ["Gerçek Lilith Varyantı", "Ayrıntılı Transit–Natal Açıları", "Ekliptik Geçişleri", "Aylık Gezegen Efemerisleri", "Aylık Açı Olayları", "Ayrıntılı Burç Geçişleri", "Ay Evreleri ve Ay Takvimi"]],
  ["Yeni Vedik Astroloji Hesaplamaları", ["Jaimini Arudha Padaları", "Upapada Lagna", "Chara Karaka", "Atmakaraka", "Darakaraka", "Bhava Bala", "Bhav Chalit", "Upagraha", "Graha Asta (Heliacal Doğuş ve Batış)"]],
  ["Vedik Panchanga ve Zaman Hesaplamaları", ["Ayrıntılı Panchanga", "Rahu Kaal", "Yamaganda", "Gulika", "Hora (Gezegen Saatleri)", "Choghadiya"]],
  ["Vedik Dasha ve Yoga Genişletmeleri", ["Güncel Vimshottari Dasha", "Sookshma Dasha", "Prana Dasha", "Ayrıntılı Yoga Tespiti", "Yoga ve Avastha Açıklamaları"]],
  ["Vedik Dosha ve Uyumluluk Hesaplamaları", ["Manglik Dosha", "Kalsarpa Dosha", "Sade Sati", "Kundli Eşleştirme", "Ashtakoot (Ashtakoota)", "Dashakoot", "Papasamyam"]],
  ["Vedik Transit ve Astronomik Hesaplama Ayrıntıları", ["Sidereal Gezegen Efemerisleri", "Aylık Vedik Transitler", "Aylık Gezegen Açıları", "Ay Açıları", "Deklinasyon Paralelleri", "Ekliptik Geçişleri"]],
  ["Diğer Astroloji Hesaplama İmkânları", ["Batı Astrolojisi Uyum Puanı", "Günlük, Haftalık, Aylık ve Yıllık Burç Yorumları", "Burç ve Gezegen Açıklamaları", "Vedik Günlük Birleşik Okuma", "Rashi ve Nakshatra Açıklamaları", "Astrolojik Zaman Çizelgesi", "Önemli Tarihler", "Dönem Özetleri"]],
];
const FIXED_TEXT = [
  "GÖKYÜZÜ ATLASI GENİŞLİYOR",
  "Yeni Haritalar — Geleneksel Astroloji Ekolleri — Yeni Hesaplamalar",
  "Yaşam Sistemi, farklı astroloji geleneklerini kendi hesaplama kurallarıyla aynı platformda buluşturmak için gelişmeye devam ediyor.",
  "Yeni astroloji haritaları, geleneksel Horary ekolleri, Vedik Prashna yöntemleri ve hesaplama altyapımızın sunduğu yeni imkânlar üzerinde çalışmalar yürütülüyor.",
  "Geleneksel asalet tabloları, reception (karşılıklı kabul), Ay'ın seyri, gezegen hareketleri, açı kesinleşmeleri ve ekollere özgü değerlendirme yöntemleri üzerinde çalışmalar sürdürülüyor.",
  "Soru anına dayalı Vedik haritalar ve farklı Prashna geleneklerinin kendilerine özgü hesaplama yöntemleri araştırılıyor.",
  "Bu başlıklar mevcut Natal ve Transit tekniklerinin genişletilmesi kapsamında ele alınmaktadır; aynı hesaplamalar yeni teknik adıyla tekrarlanmayacaktır.",
  "GELİŞTİRME SÜRECİ HAKKINDA",
  "Bu bölümde “Geliştiriliyor” ifadesi; araştırma, teknik uygunluk incelemesi, hesaplama doğrulaması, entegrasyon hazırlığı veya yazılım geliştirme aşamalarını kapsar.",
  "Listelenen tekniklerin tamamı henüz kullanıma açık değildir. Bazı başlıklar mevcut analizlerin genişletilmesine ilişkindir.",
  "Yeni özellikler, teknik doğrulamalar ve uzman değerlendirmeleri tamamlandıkça aşamalı olarak sunulacaktır.",
  "Kesin bir yayın tarihi taahhüt edilmemektedir.",
];
const STRIP_TEXT = ["YAKINDA", "Yeni Haritalar ve Astroloji Ekolleri", "Gökyüzü Atlası'na eklenecek yeni analizleri ve astroloji yöntemlerini keşfedin."];

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), fullPage: false });
};
async function openHome(page, hash = "") {
  await page.goto(`${BASE}${hash}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector(hash ? "[data-testid=atlas-coming-soon]" : "[data-portal=new]", { timeout: 120000 });
  // Modülün geri-tuşu taban kaydı (atlasDepth ≥ 1) Next geçmiş durumu hazır olunca eklenir; etkileşimden önce beklenir.
  await page.waitForFunction(() => (window.history.state?.atlasDepth ?? 0) >= 1, null, { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(600);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method() }));

  // ── S1 ana ekran ──
  await openHome(page);
  const geo = await page.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y + window.scrollY), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 };
    };
    const cards = [...document.querySelectorAll("[data-portal]")].map((el) => ({ key: el.getAttribute("data-portal"), ...r(el) }));
    const strip = document.querySelector("[data-testid=atlas-soon-strip]");
    const clipped = strip ? [...strip.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1 && getComputedStyle(s).overflow !== "visible") : null;
    return { cards, strip: strip ? r(strip) : null, stripText: strip?.innerText ?? "", clipped, docH: document.documentElement.scrollHeight, vh: window.innerHeight };
  });
  console.log(`  bilgi: kartlar ${JSON.stringify(geo.cards)} | şerit ${JSON.stringify(geo.strip)} | belge ${geo.docH} / görünür ${geo.vh}`);
  ok("S1 dört kart sırası aynen (new, archive, kb, recent)", geo.cards.map((c) => c.key).join() === "new,archive,kb,recent", geo.cards.map((c) => c.key).join());
  ok("S1 Yakında şeridi var", !!geo.strip);
  if (geo.strip) {
    const last = geo.cards[geo.cards.length - 1];
    ok("S1 şerit dördüncü kartın altında", geo.strip.y >= last.y + last.h - 1, `şerit y=${geo.strip.y}, kart4 alt=${last.y + last.h}`);
    ok("S1 şerit kartlardan ince (yükseklik < kart yüksekliğinin %75'i)", geo.strip.h < last.h * 0.75, `${geo.strip.h} / ${last.h}`);
    ok("S1 şerit metni (YAKINDA + alt başlık + açıklama)", STRIP_TEXT.every((t) => geo.stripText.includes(t)), geo.stripText.replace(/\s+/g, " "));
    ok("S1 şerit metni kesilmiyor", geo.clipped === false);
  }
  ok("S1 ana ekran yatay taşma yok", await noHScroll(page));
  await shot(page, "home");
  // Klavye: şerit odaklanabilir, odak işareti görünür
  await page.locator("[data-testid=atlas-soon-strip]").focus();
  const focusStyle = await page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute("data-testid") === "atlas-soon-strip" ? getComputedStyle(el).outlineStyle : "none";
  });
  ok("S4 şerit klavyeyle odaklanır ve odak işareti var", focusStyle !== "none", focusStyle);

  // ── S2/S3 Yakında görünümü (Enter ile açılır) ──
  const before = requests.length;
  await page.keyboard.press("Enter");
  await page.waitForSelector("[data-testid=atlas-coming-soon]", { timeout: 30000 });
  await page.waitForTimeout(1500);
  ok("S2 adres #yakinda", (await page.evaluate(() => window.location.hash)) === "#yakinda");
  const txt = await page.locator("[data-testid=atlas-coming-soon]").innerText();
  const sec = await page.evaluate(() =>
    [...document.querySelectorAll("[data-soon-section]")].map((d) => ({
      title: d.querySelector("summary")?.innerText ?? "",
      status: d.querySelector("[data-soon-status]")?.textContent ?? "",
      items: d.querySelector("[data-soon-items]")?.textContent ?? "",
    })),
  );
  ok("S2 on bölüm", sec.length === 10, String(sec.length));
  for (let i = 0; i < SECTIONS.length; i++) {
    const [title, items] = SECTIONS[i];
    const s = sec[i] ?? { title: "", status: "", items: "" };
    ok(`S2 bölüm ${i + 1} başlık "${title}"`, s.title.includes(`${i + 1}. ${title}`), s.title.replace(/\s+/g, " "));
    ok(`S2 bölüm ${i + 1} durum GELİŞTİRİLİYOR`, s.status.trim() === "GELİŞTİRİLİYOR", s.status);
    ok(`S2 bölüm ${i + 1} teknik adları tam ve uzun tireyle (${items.length})`, s.items === items.join(" — "), s.items);
  }
  ok("S2 sabit metinler tam (başlık, alt başlık, giriş, notlar, süreç)", FIXED_TEXT.every((t) => txt.includes(t)), FIXED_TEXT.filter((t) => !txt.includes(t)).join(" | "));
  ok("S2 'Değerlendiriliyor' yok", !/değerlendiriliyor/i.test(txt));
  ok("S2 teknik adları arasında '·' yok", !sec.some((s) => s.items.includes("·")));
  const brand = await page.evaluate(() => {
    const root = document.querySelector("[data-testid=atlas-coming-soon]");
    const out = [];
    if (/roxy/i.test(document.body.innerText)) out.push("metin");
    for (const el of root.querySelectorAll("*")) for (const a of ["title", "aria-label", "alt", "placeholder"]) if (/roxy/i.test(el.getAttribute(a) ?? "")) out.push(a);
    if (/roxy/i.test(root.innerHTML)) out.push("html");
    return out;
  });
  ok("S2 sağlayıcı adı (Roxy / RoxyAPI) yok — metin, öznitelik, HTML", brand.length === 0, brand.join(","));
  const during = requests.slice(before).filter((r) => !/\/_next\/|__nextjs|webpack|hot-update|favicon|\.(woff2?|css|js|png|webp|svg)(\?|$)/.test(r.url));
  // Uygulama geneli oturum katmanı (lib/auth/yasamUser.ts HttpOnly geçiş denetimi, GET /api/auth/session) sayfadan bağımsız,
  // zamanlamaya bağlı çalışır; Yakında görünümünden gelmez → ayrı raporlanır, diğer her istek yasaktır.
  const authLayer = during.filter((r) => /\/api\/auth\/session(\/cookie)?(\?|$)/.test(r.url));
  const nonAuth = during.filter((r) => !authLayer.includes(r));
  if (authLayer.length) console.log(`  bilgi: uygulama geneli oturum denetimi (Yakında'dan bağımsız): ${authLayer.map((r) => `${r.method} ${new URL(r.url).pathname}`).join(", ")}`);
  ok("S3 Yakında görünümü açılırken veri/API isteği yok (oturum katmanı hariç)", nonAuth.length === 0, nonAuth.map((r) => `${r.method} ${r.url}`).slice(0, 5).join(" | "));
  ok("S3 astroloji API isteği yok", !during.some((r) => /\/api\/admin\/astroloji|\/api\/astroloji/.test(r.url)));
  ok("S3 sağlayıcı isteği yok", !requests.some((r) => /roxy/i.test(r.url)));
  ok("S7 Yakında yatay taşma yok", await noHScroll(page));
  const clippedItems = await page.evaluate(() => [...document.querySelectorAll("[data-soon-items]")].filter((p) => p.scrollWidth > p.clientWidth + 1).length);
  ok("S7 teknik adları kesilmiyor", clippedItems === 0, String(clippedItems));
  ok("S2 analiz/kayıt düğmesi yok (yalnız 'Ana ekrana dön')", (await page.locator("[data-testid=atlas-coming-soon] button").count()) === 1);
  await shot(page, "soon");

  // ── S4 klavye: <details> ──
  const s1 = page.locator("[data-soon-section='1'] summary");
  await s1.focus();
  await page.keyboard.press("Enter");
  const closed = await page.evaluate(() => !document.querySelector("[data-soon-section='1']").open);
  await page.keyboard.press("Enter");
  const reopened = await page.evaluate(() => document.querySelector("[data-soon-section='1']").open);
  ok("S4 bölüm başlığı Enter ile kapanır ve yeniden açılır", closed && reopened);
  const sumOutline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  ok("S4 bölüm başlığında odak işareti", sumOutline !== "none", sumOutline);

  // ── S5 geri / ileri / yenileme / doğrudan bağlantı / ana ekrana dön ──
  console.log(`  bilgi: geçmiş ${await page.evaluate(() => JSON.stringify({ depth: history.state?.atlasDepth, len: history.length, hash: location.hash }))}`);
  await page.goBack();
  await page.waitForSelector("[data-portal=new]", { timeout: 30000 });
  ok("S5 geri → ana ekran", (await page.locator("[data-testid=atlas-hero]").count()) === 1);
  await page.goForward();
  await page.waitForSelector("[data-testid=atlas-coming-soon]", { timeout: 30000 });
  ok("S5 ileri → Yakında", true);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("[data-testid=atlas-coming-soon]", { timeout: 120000 }).catch(() => undefined);
  ok("S5 yenileme → Yakında açık", (await page.locator("[data-testid=atlas-coming-soon]").count()) === 1);
  await page.getByRole("button", { name: "Ana ekrana dön" }).click();
  await page.waitForSelector("[data-portal=new]", { timeout: 30000 });
  ok("S5 'Ana ekrana dön' → ana ekran", (await page.evaluate(() => window.location.hash)) === "");
  const direct = await ctx.newPage();
  await direct.goto(`${BASE}#yakinda`, { waitUntil: "load", timeout: 180000 });
  await direct.waitForSelector("[data-testid=atlas-coming-soon]", { timeout: 120000 }).catch(() => undefined);
  ok("S5 doğrudan #yakinda bağlantısı → Yakında", (await direct.locator("[data-testid=atlas-coming-soon]").count()) === 1);
  await direct.close();
  // Başka görünümlerin dışarıdan girişte ana ekrana dönme kuralı (UAT madde G) değişmedi:
  const other = await ctx.newPage();
  await other.goto(`${BASE}#bilgi-bankasi`, { waitUntil: "load", timeout: 180000 });
  await other.waitForSelector("[data-portal=new]", { timeout: 120000 }).catch(() => undefined);
  ok("S5 dışarıdan #bilgi-bankasi girişi hâlâ ana ekranı açar (mevcut kural)", (await other.locator("[data-testid=atlas-hero]").count()) === 1);
  await other.close();

  // ── S6 ana ekran regresyonu (kayıt oluşturmadan) ──
  const portalTo = { new: "#yeni-analiz", archive: "#analiz-arsivi", kb: "#bilgi-bankasi", recent: "#analiz-arsivi" };
  for (const [k, hash] of Object.entries(portalTo)) {
    await openHome(page);
    await page.locator(`[data-portal=${k}]`).click();
    await page.waitForTimeout(1200);
    ok(`S6 ${k} kartı → ${hash}`, (await page.evaluate(() => window.location.hash)) === hash);
  }
  await openHome(page);
  await page.getByRole("button", { name: "Yeni doğum profili" }).click();
  await page.waitForTimeout(1500);
  ok("S6 Yeni doğum profili → Yeni Analiz + Yeni Danışan formu (kaydedilmedi)", (await page.evaluate(() => window.location.hash)) === "#yeni-analiz" && (await page.getByText("Yeni Danışan").count()) > 0);
  await openHome(page);
  ok("S6 Yaşam Analiz Merkezi dönüş bağlantısı", (await page.locator("[data-testid=atlas-back-to-center]").getAttribute("href")) === "/life-analysis");
  const writes = requests.filter((r) => r.method !== "GET" && /\/api\/admin\/astroloji\/(analyses|profiles|engine)/.test(r.url));
  ok("S6 test boyunca analiz / profil / hesap yazma isteği yok", writes.length === 0, writes.map((r) => `${r.method} ${r.url}`).join(" | "));

  await browser.close();
  console.log(`\nastrology coming-soon UI [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
