// Ana panel merkez düzeni (2026-10-17) — UI davranış testleri (Playwright, yerel build, ağ-mock).
// Prod'a / dış ağa temas YOK: /api/* istekleri sentetik ZZ verisiyle karşılanır; 127.0.0.1 dışı abort.
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink + sahte env build + start);
//   UI_BASE=http://127.0.0.1:3931 node scripts/main-panel-centers/ui-main-panel.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3931";
const SHOTS = process.env.UI_SHOTS ?? "";
const ALL = ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
  "aromatherapy", "personal_archive", "belge_ceviri", "human_design", "digital_content", "cosmic_calendar", "cupping",
  "beslenme", "yasam_hafizasi", "astrology"];
const perms = (keys) => Object.fromEntries(ALL.map((k) => [k, keys.includes(k)]));
function makeUser(role, keys) {
  return {
    id: role === "admin" ? "00000000-0000-4000-8000-0000000000ad" : "00000000-0000-4000-8000-0000000000e1",
    email: `zz-${role}@example.invalid`, full_name: `ZZ ${role}`, name: `ZZ ${role}`, role, active: true,
    approval_status: "approved", package_type: "premium", membership_status: "active",
    tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: false, module_permissions: perms(keys),
  };
}
const OWNER = makeUser("admin", ALL);
const EXPECTED_SEVEN = [
  "Danışan Yolculuğu", "Yaşam Hafızası", "Ürün & Stok Merkezi", "Beden & Enerji Uygulamaları",
  "Doğal Destek & Rehber", "Dijital İçerik Merkezi", "Yaşam Analiz Merkezi",
];
const REMOVED = ["Doğaltaş", "Yaşam Takvimi / Kozmik Ajanda", "Yaşam Enerjisi Bilgi Sistemi", "Ayarlar & Güvenlik", "Enerji & Beden"];
const VIEWPORTS = [
  { width: 375, height: 812, tag: "375" }, { width: 390, height: 844, tag: "390" }, { width: 768, height: 1024, tag: "768" },
  { width: 1024, height: 768, tag: "1024" }, { width: 1366, height: 768, tag: "1366" }, { width: 1920, height: 1080, tag: "1920" },
];

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}

async function newPage(user, viewport = { width: 1366, height: 768 }) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 768 });
  const isOwner = user.role === "admin";
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, user);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    // Gökyüzü Atlası erişim yoklaması: yalnız sahip/astroloji yetkili → 200; diğerleri tek tip 404.
    if (url.pathname.endsWith("/astroloji/access")) {
      return route.fulfill(isOwner || user.module_permissions.astrology ? { status: 200, json: { ok: true } } : { status: 404, json: { error: "not_found" } });
    }
    if (url.pathname.startsWith("/api/beslenme")) { const a = isOwner || user.module_permissions.beslenme === true; return route.fulfill({ status: a ? 200 : 403, json: { ok: true, access: a } }); }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  return { ctx, page, pageErrors };
}

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
/** Ana Merkezler ızgarasındaki kart başlıkları (DOM sırası). */
async function homeCardTitles(page) {
  await page.waitForSelector("main h3", { timeout: 20000 });
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const label = [...document.querySelectorAll("p")].find((p) => p.textContent?.trim().toLowerCase() === "ana merkezler");
    const grid = label?.parentElement?.querySelector("div.grid");
    return grid ? [...grid.querySelectorAll("h3")].map((h) => h.textContent.trim()) : [];
  });
}
async function waitResolved(page) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
}

// ── A) Owner ana panel: 7 merkez, kaldırılan kartlar yok, yerleşim, dişli ───────────────────
async function testOwnerHome() {
  for (const vp of VIEWPORTS) {
    const g = `A-owner-home-${vp.tag}`;
    const { ctx, page, pageErrors } = await newPage(OWNER, vp);
    await page.goto(BASE + "/", { waitUntil: "load" });
    const titles = await homeCardTitles(page);
    ok(g, "tam 7 merkez kartı, beklenen sırada", JSON.stringify(titles) === JSON.stringify(EXPECTED_SEVEN), JSON.stringify(titles));
    for (const r of REMOVED) ok(g, `bağımsız kart yok: ${r}`, !titles.includes(r));
    ok(g, "yatay taşma yok", await noHScroll(page));
    const gear = page.getByTestId("home-settings-gear");
    ok(g, "dişli görünür", await gear.isVisible());
    ok(g, "dişli aria-label=Ayarlar + href=/settings",
      (await gear.getAttribute("aria-label")) === "Ayarlar" && (await gear.getAttribute("href")) === "/settings");
    const gb = await gear.boundingBox();
    const minTap = vp.width < 640 ? 40 : 36;
    ok(g, `dişli dokunma alanı ≥ ${minTap}px`, gb && gb.width >= minTap - 0.5 && gb.height >= minTap - 0.5, JSON.stringify(gb));
    // Üst satırdaki diğer düğmelerle çakışma yok (dil · zil · dişli · çıkış).
    const boxes = await page.evaluate(() => {
      const gearEl = document.querySelector('[data-testid="home-settings-gear"]');
      const row = gearEl?.parentElement;
      return row ? [...row.children].map((c) => { const r = c.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; }).filter((b) => b.w > 0) : [];
    });
    let overlap = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) overlap = true;
    }
    ok(g, `üst satır düğmeleri çakışmıyor (${boxes.length} öğe)`, boxes.length >= 3 && !overlap, JSON.stringify(boxes));
    ok(g, "dişli viewport içinde", gb && gb.x >= 0 && gb.x + gb.width <= vp.width + 0.5);
    // Kart ızgarası: hiçbir kart viewport dışına taşmaz.
    const cardsInView = await page.evaluate((w) => {
      const label = [...document.querySelectorAll("p")].find((p) => p.textContent?.trim().toLowerCase() === "ana merkezler");
      const grid = label?.parentElement?.querySelector("div.grid");
      return grid ? [...grid.children].every((c) => { const r = c.getBoundingClientRect(); return r.left >= -0.5 && r.right <= w + 0.5; }) : false;
    }, vp.width);
    ok(g, "kartlar viewport içinde", cardsInView);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-owner-${vp.tag}.png`, fullPage: false });
    ok(g, "sayfa hatası yok", pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
}

// ── B) Dişli: tooltip (hover + klavye odağı) ve tıklama ────────────────────────────────────
async function testGear() {
  const g = "B-gear";
  const { ctx, page } = await newPage(OWNER, { width: 1366, height: 768 });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await homeCardTitles(page);
  const gear = page.getByTestId("home-settings-gear");
  const tip = gear.locator("span[aria-hidden]").filter({ hasText: "Ayarlar" });
  const opacity = () => tip.evaluate((el) => Number(getComputedStyle(el).opacity));
  ok(g, "tooltip başlangıçta gizli", (await opacity()) === 0);
  await gear.hover();
  await page.waitForTimeout(300);
  ok(g, "hover → 'Ayarlar' tooltip görünür", (await opacity()) === 1 && (await tip.textContent()) === "Ayarlar");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/gear-hover.png`, clip: { x: 900, y: 0, width: 466, height: 200 } });
  await page.mouse.move(10, 700);
  await page.waitForTimeout(300);
  ok(g, "hover bitince tooltip gizlenir", (await opacity()) === 0);
  // Klavye: Tab ile dişliye ulaş.
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await gear.evaluate((el) => el === document.activeElement);
  }
  await page.waitForTimeout(300);
  ok(g, "Tab ile dişliye odaklanılır", reached);
  ok(g, "klavye odağında tooltip görünür", reached && (await opacity()) === 1);
  ok(g, "odak halkası görünür (ring)", reached && (await gear.evaluate((el) => getComputedStyle(el).boxShadow !== "none")));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/settings$/, { timeout: 15000 }).catch(() => {});
  ok(g, "Enter → /settings açılır", page.url().endsWith("/settings"));
  await page.waitForTimeout(1500);
  const txt = await bodyText(page);
  ok(g, "Ayarlar ekranı içerik gösterir (yetki reddi yok)", !/Yetkiniz Bulunmuyor/.test(txt) && txt.length > 100, txt.slice(0, 200));
  await ctx.close();
  // Mobil dokunma → /settings
  const m = await newPage(OWNER, { width: 375, height: 812 });
  await m.page.goto(BASE + "/", { waitUntil: "load" });
  await homeCardTitles(m.page);
  await m.page.getByTestId("home-settings-gear").tap();
  await m.page.waitForURL(/\/settings$/, { timeout: 15000 }).catch(() => {});
  ok("B-gear-mobil", "dokunma → /settings açılır", m.page.url().endsWith("/settings"));
  await m.ctx.close();
}

// ── C) Merkez içleri (owner) ─────────────────────────────────────────────────────────────
async function testHubsOwner() {
  for (const vp of [{ width: 375, height: 812, tag: "375" }, { width: 1366, height: 768, tag: "1366" }]) {
    const g = `C-hubs-owner-${vp.tag}`;
    const { ctx, page, pageErrors } = await newPage(OWNER, vp);
    // Yaşam Analiz Merkezi → Kozmik Ajanda
    await page.goto(BASE + "/life-analysis", { waitUntil: "load" });
    await waitResolved(page);
    const cosmic = page.getByTestId("life-analysis-cosmic-card");
    ok(g, "Analiz Merkezi: Kozmik Ajanda kartı var", await cosmic.isVisible());
    let t = await bodyText(page);
    ok(g, "Analiz Merkezi: Numeroloji + Human Design korunur", t.includes("Numeroloji") && t.includes("Human Design"));
    ok(g, "Analiz Merkezi: Gökyüzü Atlası korunur", await page.getByTestId("life-analysis-atlas-card").isVisible());
    ok(g, "Analiz Merkezi: yatay taşma yok", await noHScroll(page));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/life-analysis-${vp.tag}.png`, fullPage: true });
    await cosmic.click();
    await page.waitForURL(/\/cosmic-calendar$/, { timeout: 15000 }).catch(() => {});
    await waitResolved(page);
    t = await bodyText(page);
    ok(g, "Kozmik Ajanda açılır (/cosmic-calendar, yetki reddi yok)", page.url().endsWith("/cosmic-calendar") && !/Yetkiniz Bulunmuyor/.test(t), page.url());
    // Doğal Destek & Rehber → Doğaltaş
    await page.goto(BASE + "/dogal-destek", { waitUntil: "load" });
    await waitResolved(page);
    const stone = page.locator('[data-support-card="Doğaltaş"]');
    ok(g, "Doğal Destek: Doğaltaş kartı var", await stone.isVisible());
    for (const n of ["Aromaterapi", "Şifa Rehberi", "Beslenme"]) ok(g, `Doğal Destek: ${n} korunur`, await page.locator(`[data-support-card="${n}"]`).isVisible());
    ok(g, "Doğal Destek: yatay taşma yok", await noHScroll(page));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/dogal-destek-${vp.tag}.png`, fullPage: true });
    await stone.click();
    await page.waitForURL(/\/dogaltas$/, { timeout: 15000 }).catch(() => {});
    await waitResolved(page);
    t = await bodyText(page);
    ok(g, "Doğaltaş açılır (/dogaltas, yetki reddi yok)", page.url().endsWith("/dogaltas") && !/Yetkiniz Bulunmuyor/.test(t), page.url());
    // Beden & Enerji Uygulamaları
    await page.goto(BASE + "/enerji-beden", { waitUntil: "load" });
    await waitResolved(page);
    t = await bodyText(page);
    ok(g, "Beden & Enerji: yeni başlık", t.includes("Beden & Enerji Uygulamaları") && !t.includes("Enerji & Beden"));
    for (const n of ["Biyoenerji", "Refleksoloji", "Kupa"]) ok(g, `Beden & Enerji: ${n} alt bölümü korunur`, t.includes(n));
    ok(g, "Beden & Enerji: yatay taşma yok", await noHScroll(page));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/enerji-beden-${vp.tag}.png`, fullPage: false });
    // Ürün & Stok bağımsız
    await page.goto(BASE + "/urun-stok", { waitUntil: "load" });
    await waitResolved(page);
    ok(g, "Ürün & Stok bağımsız açılır", !/Yetkiniz Bulunmuyor/.test(await bodyText(page)));
    // YEBS kaldırıldı
    const r = await page.goto(BASE + "/yebs", { waitUntil: "load" });
    ok(g, "/yebs artık yok (404)", r?.status() === 404, String(r?.status()));
    ok(g, "sayfa hatası yok", pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
}

// ── D) Uzman yetki izolasyonu (kart görünürlüğü + doğrudan URL) ─────────────────────────────
async function testExperts() {
  const cases = [
    { tag: "yalniz-kozmik", keys: ["cosmic_calendar"], home: ["Yaşam Analiz Merkezi"], cosmicCard: true, stoneCard: null,
      allow: ["/cosmic-calendar"], deny: ["/dogaltas", "/dogal-destek", "/urun-stok"] },
    { tag: "yalniz-dogaltas", keys: ["stones"], home: ["Doğal Destek & Rehber"], cosmicCard: false, stoneCard: true,
      allow: ["/dogaltas", "/dogal-destek"], deny: ["/cosmic-calendar", "/urun-stok"] },
    { tag: "numeroloji-aroma", keys: ["numerology", "aromatherapy"], home: ["Doğal Destek & Rehber", "Yaşam Analiz Merkezi"],
      cosmicCard: false, stoneCard: false, allow: ["/numeroloji", "/aromaterapi"], deny: ["/cosmic-calendar", "/dogaltas"] },
    { tag: "biyoenerji-stok", keys: ["energy_body", "stok"], home: ["Ürün & Stok Merkezi", "Beden & Enerji Uygulamaları"],
      cosmicCard: false, stoneCard: null, allow: ["/urun-stok", "/enerji-beden"], deny: ["/cosmic-calendar", "/dogaltas", "/dogal-destek"] },
  ];
  for (const c of cases) {
    const g = `D-uzman-${c.tag}`;
    const user = makeUser("expert", c.keys);
    const { ctx, page } = await newPage(user, { width: 390, height: 844 });
    await page.goto(BASE + "/", { waitUntil: "load" });
    const titles = await homeCardTitles(page);
    ok(g, `ana panel yalnız yetkili merkezler: ${c.home.join(", ")}`, JSON.stringify(titles) === JSON.stringify(c.home), JSON.stringify(titles));
    ok(g, "dişli uzmanda da var", await page.getByTestId("home-settings-gear").isVisible());
    await page.goto(BASE + "/life-analysis", { waitUntil: "load" });
    await waitResolved(page);
    ok(g, `Analiz Merkezi Kozmik kartı ${c.cosmicCard ? "görünür" : "gizli"}`, (await page.getByTestId("life-analysis-cosmic-card").count() > 0) === c.cosmicCard);
    if (c.stoneCard !== null) {
      await page.goto(BASE + "/dogal-destek", { waitUntil: "load" });
      await waitResolved(page);
      ok(g, `Doğal Destek Doğaltaş kartı ${c.stoneCard ? "görünür" : "gizli"}`, (await page.locator('[data-support-card="Doğaltaş"]').count() > 0) === c.stoneCard);
    }
    for (const p of c.allow) {
      await page.goto(BASE + p, { waitUntil: "load" });
      await waitResolved(page);
      ok(g, `doğrudan URL izinli: ${p}`, !/Yetkiniz Bulunmuyor/.test(await bodyText(page)));
    }
    for (const p of c.deny) {
      await page.goto(BASE + p, { waitUntil: "load" });
      await waitResolved(page);
      ok(g, `doğrudan URL reddedilir: ${p}`, /Yetkiniz Bulunmuyor/.test(await bodyText(page)));
    }
    await ctx.close();
  }
}

try {
  await testOwnerHome();
  await testGear();
  await testHubsOwner();
  await testExperts();
} catch (e) {
  fail++;
  console.log("❌ harness çöktü:", e);
} finally {
  await browser?.close();
}
console.log(`\nANA PANEL MERKEZLERİ UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
