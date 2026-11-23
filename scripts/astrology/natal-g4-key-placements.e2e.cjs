/* eslint-disable @typescript-eslint/no-require-imports */
// G4 — Natal Özet: Güneş / Ay / Yükselen kartları — GERÇEK uygulama ekranında UI e2e (2026-11-23). Yerel sahte arka uç (gerçek DB /
// Roxy YOK). Arşivden açılan kayıtlı Natal ("Ali natal", saat biliniyor) + "G2 saat bilinmiyor natal" (FAKE_NATAL_G2_SEED=1):
//   • Özet açılınca kartlar görünür ve panelin İLK öğesi; değerler kayıtlı analizin teknik verisiyle birebir (API'den okunur);
//   • geniş panelde üç kart yan yana, dar panelde / telefonda alt alta; kart metni kesilmez, sayfa yatay taşmaz;
//   • Temel / Profesyonel değişiminde kartlar aynı; saat bilinmiyorken Güneş ≈ + 12:00 notu, Ay belirsiz (burç / derece yok),
//     Yükselen bilinmiyor; "Açısal noktalar" ve "Dağılım özeti" yerinde; görünüm değişiminde astroloji ağ isteği yok.
// Ön koşul: natal-g2-labels.e2e.cjs ile aynı (FAKE_NATAL_REAL_GOLDEN=1 FAKE_NATAL_G2_SEED=1 dev-fake-backend + next dev; sunucuyu
//   `env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE` ile açın).
// Çalıştırma: node scripts/astrology/natal-g4-key-placements.e2e.cjs http://localhost:3991 1440 900 <çıktı klasörü>
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync } = require("node:fs");

const [ORIGIN = "http://localhost:3991", W = "1440", H = "900", OUT = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 768;
const BASE = `${ORIGIN}/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const MOON_TXT = "Ay'ın kesin burcu ve derecesi, doğum saati bilinmediği için doğrulanamıyor.";
const SIGN_TR = { aries: "Koç", taurus: "Boğa", gemini: "İkizler", cancer: "Yengeç", leo: "Aslan", virgo: "Başak", libra: "Terazi", scorpio: "Akrep", sagittarius: "Yay", capricorn: "Oğlak", aquarius: "Kova", pisces: "Balık" };
const fmt = (deg) => {
  const d = Math.floor(deg + 1e-9);
  const m = Math.min(59, Math.floor((deg - d) * 60 + 1e-9));
  return `${d}°${String(m).padStart(2, "0")}′`;
};

let pass = 0;
let fail = 0;
const results = [];
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else fail++;
  results.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? "✓" : "✗"} ${name}${!cond && detail ? ` — ${String(detail).slice(0, 300)}` : ""}`);
}

(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", extraHTTPHeaders: { "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN } });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  // Kayıtlı analizlerin teknik verisi (salt-okunur API) — kartların karşılaştırma kaynağı.
  const api = async (p) => (await ctx.request.get(`${ORIGIN}/api/admin/astroloji${p}`)).json().catch(() => null);
  const techOf = async (title) => {
    for (const p of (await api("/profiles"))?.profiles ?? []) {
      for (const a of (await api(`/analyses?profileId=${p.id}`))?.analyses ?? []) {
        if (a.technique !== "western.natal" || !String(a.title ?? "").includes(title)) continue;
        const full = (await api(`/analyses/${a.id}`))?.analysis;
        if (full) return full;
      }
    }
    return null;
  };
  const page = await ctx.newPage();
  const errors = [];
  const apiCalls = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  let track = false;
  page.on("request", (r) => track && /\/api\//.test(r.url()) && /astrolog/i.test(r.url()) && apiCalls.push(r.url().replace(ORIGIN, "")));
  const shot = async (name, el) => {
    if (!OUT) return;
    await page.waitForTimeout(250);
    if (el) await page.locator(el).first().screenshot({ path: `${OUT}/${width}-${name}.png` });
    else await page.screenshot({ path: `${OUT}/${width}-${name}.png` });
  };
  const openSaved = async (clientText, savedText) => {
    await page.goto(BASE, { waitUntil: "load", timeout: 300000 });
    await page.waitForSelector("[data-portal=archive]", { timeout: 300000 });
    await page.locator("[data-portal=archive]").first().click();
    await page.waitForSelector("[data-testid=astro-archive-list]", { timeout: 120000 });
    const rows = page.locator("[data-testid=astro-archive-list] [title='Danışan dosyasını aç']");
    await page
      .waitForFunction((c) => [...document.querySelectorAll("[data-testid=astro-archive-list] [title='Danışan dosyasını aç']")].some((e) => (e.closest("tr,li,article,[role=row]") || e.parentElement).innerText.includes(c)), clientText, { timeout: 60000 })
      .catch(() => {});
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      if ((await rows.nth(i).evaluate((e) => (e.closest("tr,li,article,[role=row]") || e.parentElement).innerText)).includes(clientText)) {
        await rows.nth(i).click();
        break;
      }
    }
    await page.waitForSelector("[data-testid=astro-saved-analyses] [data-saved-item]", { timeout: 120000 });
    await page.locator("[data-testid=astro-saved-analyses] [data-saved-item]", { hasText: savedText }).first().click();
    await page.waitForSelector("[data-testid=natal-key-placements]", { timeout: 120000 });
    await page.waitForTimeout(800);
  };
  const cards = () =>
    page.evaluate(() => {
      const box = [...document.querySelectorAll("[data-testid=natal-key-placements]")].find((e) => e.offsetParent !== null);
      if (!box) return null;
      const panel = box.parentElement;
      const els = [...box.querySelectorAll("[data-key]")];
      const grp = [...document.querySelectorAll("[data-testid=natal-group-details]")].find((e) => e.offsetParent !== null);
      const br = box.getBoundingClientRect();
      // Kaydırma kabı (yan panel ya da sayfa): kartlar açılışta kabın görünen üst bölgesinde mi
      let sc = box.parentElement;
      while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      const scTop = sc && sc !== document.body ? sc.getBoundingClientRect().top : 0;
      return {
        // Önünde yalnız sekme başlık satırı ("Özet …") olabilir; başka içerik yok.
        firstInPanel: [...panel.children].indexOf(box) === 0 || ([...panel.children].indexOf(box) === 1 && /^Özet/.test(panel.firstElementChild.innerText.trim())),
        beforeGroup: !grp || (box.compareDocumentPosition(grp) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        inView: br.top >= scTop - 1 && br.bottom <= window.innerHeight + 1,
        items: els.map((e) => {
          const r = e.getBoundingClientRect();
          return { key: e.dataset.key, status: e.dataset.status, sign: e.dataset.sign, degree: e.dataset.degree, text: e.innerText, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), clipped: [...e.querySelectorAll("*")].some((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow !== "visible") || e.scrollWidth > e.clientWidth + 1 };
        }),
        boxW: Math.round(box.getBoundingClientRect().width),
        hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        sections: [...panel.querySelectorAll("h4")].map((h) => h.textContent),
      };
    });
  const layoutOf = (c) => (new Set(c.items.map((i) => i.top)).size === 1 ? "yan-yana" : new Set(c.items.map((i) => i.left)).size === 1 ? "alt-alta" : "karışık");

  // ══════ 1. Saati bilinen Natal (arşivden) ══════
  const known = await techOf("Ali natal");
  ok("kayıtlı analiz verisi okundu (Ali natal)", !!known?.technical?.bodies);
  await openSaved("Ali", "Ali natal");
  let c = await cards();
  ok("Özet açılınca kartlar görünür ve Özet içeriğinin İLK öğesi (G2 grup alanından önce)", !!c && c.firstInPanel && c.beforeGroup, JSON.stringify(c && { first: c.firstInPanel, beforeGroup: c.beforeGroup, sections: c.sections }));
  if (!mobile) ok("masaüstü: kartlar açılışta kaydırmadan görünür", !!c && c.inView);
  if (c && known) {
    const t = known.technical;
    const sun = t.bodies.find((b) => b.id === "sun");
    const moon = t.bodies.find((b) => b.id === "moon");
    const asc = t.angles.ascendant;
    const want = [["sun", sun.sign, fmt(sun.degreeInSign)], ["moon", moon.sign, fmt(moon.degreeInSign)], ["asc", asc.sign, fmt(asc.degreeInSign)]];
    ok("değerler kayıtlı teknik veriyle birebir (Güneş / Ay / Yükselen burç + derece°dakika′)", JSON.stringify(c.items.map((i) => [i.key, i.sign, i.degree])) === JSON.stringify(want), JSON.stringify({ got: c.items.map((i) => [i.key, i.sign, i.degree]), want }));
    ok("kart metni: sembol + Türkçe burç adı + derece (≈ yok)", c.items.every((i, k) => i.status === "exact" && i.text.includes(SIGN_TR[want[k][1]]) && i.text.includes(want[k][2]) && !i.text.includes("≈")), c.items.map((i) => i.text.replace(/\n/g, " ")).join(" | "));
    ok("Açısal noktalar ve Dağılım özeti bölümleri yerinde (kartlardan sonra)", c.sections.includes("Açısal noktalar") && c.sections.includes("Dağılım özeti"), c.sections.join(", "));
    const lay = layoutOf(c);
    // 19rem (304 px) eşiği: kap genişse üç kart aynı satırda, darsa alt alta; 2 + 1 dağılım YOK.
    ok(`yerleşim: ${lay} (kap ${c.boxW}px)`, c.boxW >= 304 ? lay === "yan-yana" : lay === "alt-alta", JSON.stringify(c.items.map((i) => [i.top, i.left, i.w])));
    if (!mobile) ok("masaüstü: üç kart yan yana", lay === "yan-yana", `${c.boxW}px`);
    ok("kart metni kesilmiyor; sayfa yatay taşmıyor", c.items.every((i) => !i.clipped) && !c.hScroll);
  }
  await shot("1-saatli-ekran");
  await shot("1-saatli-kartlar", "[data-testid=natal-key-placements] >> visible=true");
  // Temel / Profesyonel: kartlar aynı, ağ isteği yok
  track = true;
  const before = JSON.stringify((await cards())?.items.map((i) => [i.key, i.sign, i.degree, i.status]));
  for (const m of ["basic", "pro"]) {
    const btn = page.locator(`[data-testid=natal-mode-${m}]:visible`).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(400);
      const now = await cards();
      ok(`${m === "basic" ? "Temel" : "Profesyonel"} görünüm: kartlar görünür, değerler aynı`, !!now && JSON.stringify(now.items.map((i) => [i.key, i.sign, i.degree, i.status])) === before);
      if (m === "basic") await shot("2-temel-kartlar", "[data-testid=natal-key-placements] >> visible=true");
    } else ok(`${m} düğmesi bulunamadı`, false);
  }
  ok("görünüm değişiminde astroloji ağ isteği yok", apiCalls.length === 0, apiCalls.join(" | "));
  track = false;

  // ══════ 2. Saati bilinmeyen Natal (arşivden) ══════
  const unk = await techOf("G2 saat bilinmiyor");
  await openSaved("Ayşe", "G2 saat bilinmiyor");
  c = await cards();
  ok("saat bilinmiyor: kartlar Özet içeriğinin ilk öğesi (grup alanı ve uyarıdan önce)", !!c && c.firstInPanel && c.beforeGroup);
  if (c) {
    const [s, m, a] = c.items;
    const sun = unk?.technical?.bodies?.find((b) => b.id === "sun");
    const moon = unk?.technical?.bodies?.find((b) => b.id === "moon");
    ok("Güneş: ≈ + kayıtlı (12:00 varsayımı) değer + açık not", s.status === "assumed" && !!sun && s.sign === sun.sign && s.degree === fmt(sun.degreeInSign) && s.text.includes("≈") && s.text.includes("12:00 varsayımı"), s.text.replace(/\n/g, " "));
    ok("Ay: belirsiz — burç / derece YOK, Owner metni", m.status === "unknown" && m.sign === "" && m.degree === "" && m.text.includes("Belirsiz") && m.text.includes("doğrulanamıyor") && !/\d+°\d\d′/.test(m.text) && !(moon && m.text.includes(SIGN_TR[moon.sign])), m.text.replace(/\n/g, " "));
    ok("Yükselen: bilinmiyor (değer yok)", a.status === "unknown" && a.sign === "" && a.text.includes("Bilinmiyor") && !/\d+°\d\d′/.test(a.text), a.text.replace(/\n/g, " "));
    ok("saat bilinmiyor: kart metni kesilmiyor; sayfa yatay taşmıyor", c.items.every((i) => !i.clipped) && !c.hScroll);
    ok("saat bilinmiyor: Dağılım özeti yerinde", c.sections.includes("Dağılım özeti"), c.sections.join(", "));
    const banner = await page.locator("[data-testid=natal-time-unknown-banner]:visible").first().innerText().catch(() => "");
    ok("saat bilinmiyor: Owner'ın tam metni Özet'teki saat uyarısında", banner.includes(MOON_TXT), banner.slice(0, 160));
  }
  await shot("3-saatsiz-ekran");
  await shot("3-saatsiz-kartlar", "[data-testid=natal-key-placements] >> visible=true");
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  if (OUT) writeFileSync(`${OUT}/${width}-sonuc.json`, JSON.stringify({ pass, fail, results }, null, 1));
  console.log(`\nnatal-g4-key-placements e2e ${width}×${height}: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
