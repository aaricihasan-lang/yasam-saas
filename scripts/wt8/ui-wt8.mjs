// WT8 — Doğaltaş + Aromaterapi + Biyoenerji + Bildirim UX yeniden test kapanışı: UI davranış testleri
// (Playwright, yerel build, ağ-mock). Prod'a / dış ağa temas YOK: /api/* istekleri sentetik ZZ verisiyle
// karşılanır; 127.0.0.1 dışı her istek abort edilir.
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink + sahte env build + start);
//   node scripts/wt8/ui-wt8.mjs   (UI_BASE ile port; ONLY=testDrawer,testBio … ile alt küme)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const PERMS = Object.fromEntries(
  ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
    "aromatherapy", "personal_archive", "human_design", "digital_content", "cosmic_calendar", "cupping", "beslenme", "yasam_hafizasi"]
    .map((k) => [k, true]),
);
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: PERMS,
};
const MOBILE = { width: 390, height: 844, tag: "mobil" };
const WEB = { width: 1280, height: 900, tag: "web" };
const VIEWPORTS = [MOBILE, WEB];
const uid = (p, i) => `${p}0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage({ routes = [], viewport }) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 768 });
  const calls = [];
  const pageErrors = [];
  await ctx.addInitScript((u) => {
    try {
      if (sessionStorage.getItem("zz_seeded")) return;
      sessionStorage.setItem("zz_seeded", "1");
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const entry = { method: req.method(), path: url.pathname, search: url.search, body, headers: req.headers() };
    calls.push(entry);
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    for (const [m, re, fn] of routes) {
      if ((m === "*" || m === req.method()) && re.test(url.pathname + url.search)) {
        const r = await fn(req, url, body);
        entry.status = r.status;
        return route.fulfill({ status: r.status, json: r.json ?? {} });
      }
    }
    entry.status = 200;
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  return { ctx, page, calls, pageErrors };
}

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const highlightCount = (page) => page.evaluate(() => globalThis.CSS?.highlights?.get("yasam-search-hit")?.size ?? 0);
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

/** Sentetik taş satırı (StoneListItemExtended şekli). */
function stone(i, extra = {}) {
  return {
    id: uid("f", i), tenant_id: TENANT, stone_name: `ZZ Taş ${i}`, short_description: "ZZ sentetik kısa açıklama",
    general_info: null, chakras: [], images: [], updated_at: "2026-10-01T09:00:00.000Z", ...extra,
  };
}

// ── A) Doğaltaş taş detay paneli (Kombinasyon Oluştur → taş tara → detay) ─────────────────
const LONG_GENERAL = "ZZ uzun genel bilgi cümlesi. ".repeat(160) + "Kalp çakrası dengelenir. kalp ritmi sakinleşir. KALP enerjisi açılır.";
async function openBuilderDrawer(page) {
  await page.goto(`${BASE}/dogaltas/kombinasyon-olustur`, { waitUntil: "load" });
  await sleep(2500);
  const sel = page.locator("section select:visible").first();
  const chakraValue = await sel.evaluate((el) => [...el.options].find((o) => /Çakra/.test(o.text))?.value ?? "");
  await sel.selectOption(chakraValue);
  await page.locator('section input[type="text"]:visible').first().fill("Kalp");
  await page.keyboard.press("Escape");
  const scan = page.locator("button:visible", { hasText: "Taşları Tara" });
  if (await scan.count()) await scan.first().click();
  await sleep(1500);
}
function builderRoutes(rows) {
  return [
    ["POST", /^\/api\/dogaltas\/stones\/condition-search$/, (_r, _u, body) => {
      const conds = body?.conditions ?? [];
      const chakra = conds.find((c) => c.type === "chakra")?.value ?? "";
      const has = conds.length > 0;
      const out = has ? (/zzbaşka/i.test(chakra) ? [] : rows) : [];
      return { status: 200, json: { ok: true, rows: out, total: out.length, capped: false,
        suggestions: { chakra: [{ name: "Kalp", count: rows.length }], astrology: [], organ: [], stone_name: [], mineral: [] } } };
    }],
  ];
}
async function testDrawer() {
  for (const vp of VIEWPORTS) {
    const g = `A-tas-detay-paneli-${vp.tag}`;
    const rows = [1, 2, 3].map((i) => stone(i, { chakras: ["Kalp"], general_info: LONG_GENERAL }));
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: builderRoutes(rows) });
    try {
      await openBuilderDrawer(page);
      const result = page.getByRole("button", { name: /ZZ Taş 1/ }).first();
      await result.waitFor({ timeout: 8000 });
      const panel = page.getByTestId("stone-detail-drawer-panel");
      const open = async () => { await result.click(); await panel.waitFor({ timeout: 5000 }); await sleep(400); };
      const isOpen = async () => (await panel.count()) === 1;
      await open();
      const pb = await panel.boundingBox();
      if (vp.tag === "mobil") {
        ok(g, "mobil: panelin ÜSTÜNDE dokunulabilir karartılmış alan (≥40px)", pb.y >= 40, JSON.stringify(pb));
        ok(g, "mobil: panelin ALTINDA dokunulabilir karartılmış alan (≥40px)", vp.height - (pb.y + pb.height) >= 40, JSON.stringify(pb));
        ok(g, "mobil: panel yatayda ekranda (taşma yok)", pb.x >= 0 && pb.x + pb.width <= vp.width + 1);
      }
      // içerik + metin + buton dokunuşu → açık kalır
      await panel.click({ position: { x: 30, y: Math.min(140, pb.height - 20) } });
      await sleep(200);
      ok(g, "içeriğe/metne dokunma → AÇIK kalır", await isOpen());
      // panel içi kaydırma → açık
      const content = panel.locator("div.overflow-y-auto").first();
      await content.evaluate((el) => { el.scrollTop = 600; });
      await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
      await page.mouse.wheel(0, 500);
      await sleep(300);
      ok(g, "panel içinde kaydırma → AÇIK kalır", await isOpen());
      // içerikte başlayıp dışarıda biten sürükleme → açık
      await page.mouse.move(pb.x + 40, pb.y + pb.height / 2);
      await page.mouse.down();
      await page.mouse.move(pb.x + 40, vp.tag === "mobil" ? vp.height - 8 : pb.y + pb.height / 2, { steps: 6 });
      if (vp.tag !== "mobil") await page.mouse.move(20, pb.y + pb.height / 2, { steps: 6 });
      await page.mouse.up();
      await sleep(300);
      ok(g, "içerikten dışarı sürükleme (kaydırma hareketi) → AÇIK kalır", await isOpen());
      // Kapat
      await panel.getByRole("button", { name: /Kapat|Close/ }).first().click();
      await sleep(300);
      ok(g, "Kapat düğmesi → kapanır", !(await isOpen()));
      if (vp.tag === "mobil") {
        await open();
        const b1 = await panel.boundingBox();
        await page.mouse.click(vp.width / 2, Math.max(6, b1.y / 2));
        await sleep(400);
        ok(g, "ÜST karartılmış alana dokunma → kapanır", !(await isOpen()));
        await open();
        const b2 = await panel.boundingBox();
        await page.mouse.click(vp.width / 2, Math.min(vp.height - 6, b2.y + b2.height + (vp.height - b2.y - b2.height) / 2));
        await sleep(400);
        ok(g, "ALT karartılmış alana dokunma → kapanır", !(await isOpen()));
        await open();
        const b3 = await panel.boundingBox();
        await page.touchscreen.tap(vp.width / 2, Math.min(vp.height - 6, b3.y + b3.height + 20));
        await sleep(400);
        ok(g, "ALT alana dokunmatik tap → kapanır", !(await isOpen()));
      } else {
        await open();
        await page.mouse.click(40, 400);
        await sleep(400);
        ok(g, "web: panel dışındaki karartılmış alana tıklama → kapanır (regresyon)", !(await isOpen()));
        await open();
        await page.mouse.click(40, 880);
        await sleep(400);
        ok(g, "web: alt-sol karartılmış alan → kapanır", !(await isOpen()));
      }
      ok(g, "sayfa durumu korunur (sonuçlar listede)", (await result.count()) === 1);
      // Arama vurgusu: panelde tüm "Kalp" geçişleri + ilk eşleşmeye kaydırma
      await open();
      await sleep(600);
      const hc = await highlightCount(page);
      ok(g, "panelde aranan değerin TÜM geçişleri vurgulu (Kalp/kalp/KALP ≥ 3 + çakra)", hc >= 4, `count=${hc}`);
      const scrolled = await panel.locator("div.overflow-y-auto").first().evaluate((el) => el.scrollTop);
      ok(g, "panel açılınca ilk eşleşmeye kaydırıldı (uzun metnin sonunda)", scrolled > 200, `scrollTop=${scrolled}`);
      await panel.locator("div.overflow-y-auto").first().evaluate((el) => { el.scrollTop = 0; });
      await sleep(500);
      const back = await panel.locator("div.overflow-y-auto").first().evaluate((el) => el.scrollTop);
      ok(g, "kullanıcı sonra serbestçe yukarı kaydırabilir (zorla geri kaydırma yok)", back < 50, `scrollTop=${back}`);
      await page.keyboard.press("Escape");
      await sleep(300);
      ok(g, "panel kapanınca vurgu temizlenir", (await highlightCount(page)) === 0);
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── B) "Kontrol edildi" — Doğaltaş ailesi ─────────────────────────────────────────────────
const isCheckedBadgeVisible = async (loc) => {
  const b = loc.getByTestId("search-checked-badge");
  if ((await b.count()) === 0) return false;
  return b.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height >= 16 && cs.visibility !== "hidden" && parseFloat(cs.fontSize) >= 11 && /Kontrol edildi/.test(el.textContent ?? "");
  });
};
async function testCheckedBuilder() {
  for (const vp of VIEWPORTS) {
    const g = `B1-kontrol-edildi-kombinasyon-olustur-${vp.tag}`;
    const rows = [1, 2, 3, 4].map((i) => stone(i, { chakras: ["Kalp"] }));
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: builderRoutes(rows) });
    try {
      await openBuilderDrawer(page);
      const card = (n) => page.getByTestId("builder-result-card").filter({ hasText: `ZZ Taş ${n}` }).first();
      await card(1).waitFor({ timeout: 8000 });
      const order0 = await page.getByTestId("builder-result-card").locator("h3").allInnerTexts();
      ok(g, "başta etiket yok", (await page.getByTestId("search-checked-badge").count()) === 0);
      for (const n of [1, 3]) {
        await card(n).getByRole("button", { name: new RegExp(`ZZ Taş ${n}`) }).first().click();
        await page.getByTestId("stone-detail-drawer-panel").waitFor({ timeout: 5000 });
        await page.keyboard.press("Escape");
        await sleep(300);
      }
      ok(g, "açılan 1. sonuç 'Kontrol edildi' (belirgin)", await isCheckedBadgeVisible(card(1)));
      ok(g, "açılan 3. sonuç 'Kontrol edildi'", await isCheckedBadgeVisible(card(3)));
      ok(g, "açılmayan 2. ve 4. sonuçta etiket yok", (await card(2).getByTestId("search-checked-badge").count()) === 0 && (await card(4).getByTestId("search-checked-badge").count()) === 0);
      const order1 = await page.getByTestId("builder-result-card").locator("h3").allInnerTexts();
      ok(g, "sıralama DEĞİŞMEDİ", JSON.stringify(order0) === JSON.stringify(order1));
      // yeni koşul → temiz
      await page.locator('section input[type="text"]:visible').first().fill("Kalp2");
      await page.keyboard.press("Escape");
      const scan = page.locator("button:visible", { hasText: "Taşları Tara" });
      if (await scan.count()) await scan.first().click();
      await sleep(1800);
      ok(g, "yeni arama bağlamı → işaret yok", (await page.getByTestId("search-checked-badge").count()) === 0);
      await page.locator('section input[type="text"]:visible').first().fill("Kalp");
      await page.keyboard.press("Escape");
      if (await scan.count()) await scan.first().click();
      await sleep(1800);
      ok(g, "önceki aramaya dönünce işaretler geri gelir (WT5 ile uyumlu)", (await page.getByTestId("search-checked-badge").count()) === 2);
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

async function testCheckedStones() {
  const STONES = Array.from({ length: 6 }, (_, i) => stone(i + 1, { stone_name: `ZZ Taş ${i + 1}${i < 4 ? " Ametist" : ""}` }));
  for (const vp of VIEWPORTS) {
    const g = `B2-kontrol-edildi-tas-listesi-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/dogaltas\/stones\?/, (_r, url) => {
        const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr-TR");
        const rows = STONES.filter((s) => !q || s.stone_name.toLocaleLowerCase("tr-TR").includes(q));
        if ((url.searchParams.get("mode") ?? "list") === "count") return { status: 200, json: { ok: true, count: rows.length } };
        return { status: 200, json: { ok: true, rows, count: rows.length } };
      }],
      ["GET", /^\/api\/dogaltas\/stone-exclusions/, () => ({ status: 200, json: { ok: true, stoneIds: [] } })],
    ] });
    const cardOf = (name) => page.locator("a", { hasText: name }).first().locator("xpath=ancestor::div[contains(@class,'rounded-[18px]')][1]");
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi`, { waitUntil: "load" });
      const search = page.locator('input[type="search"], input[type="text"]').first();
      await search.waitFor({ timeout: 15000 });
      await search.fill("Ametist");
      await page.locator("a", { hasText: "ZZ Taş 1 Ametist" }).first().waitFor({ timeout: 10000 });
      await sleep(800);
      await page.locator("a", { hasText: "ZZ Taş 2 Ametist" }).first().click();
      await page.waitForURL(/dogaltas-listesi\/f/, { timeout: 10000 }).catch(() => {});
      await sleep(500);
      await page.goBack();
      await page.locator("a", { hasText: "ZZ Taş 1 Ametist" }).first().waitFor({ timeout: 10000 });
      await sleep(900);
      ok(g, "bakılan sonuç 'Kontrol edildi' (belirgin)", await isCheckedBadgeVisible(cardOf("ZZ Taş 2 Ametist")));
      ok(g, "bakılmayan sonuçta etiket yok", (await cardOf("ZZ Taş 1 Ametist").getByTestId("search-checked-badge").count()) === 0);
      const accent = await cardOf("ZZ Taş 2 Ametist").evaluate((el) => getComputedStyle(el).borderLeftColor);
      ok(g, "kart vurgusu alarm (kırmızı) değil", !/rgb\((2[2-5]\d), (\d{1,2}|1[0-2]\d), /.test(accent), accent);
      ok(g, "arama metni korundu", (await search.inputValue()) === "Ametist");
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

async function testCheckedMinerals() {
  const MINERALS = Array.from({ length: 5 }, (_, i) => ({
    id: uid("b", i + 1), tenant_id: TENANT, source_id: "s", name: `ZZ Mineral ${i + 1}${i < 3 ? " Demir" : ""}`,
    aciklama: "ZZ açıklama", kategori: "ZZ Kategori", created_at: "2026-10-01T09:00:00.000Z",
  }));
  for (const vp of VIEWPORTS) {
    const g = `B3-kontrol-edildi-mineraller-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/dogaltas\/minerals\?/, (_r, url) => {
        const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr-TR");
        const rows = MINERALS.filter((m) => !q || m.name.toLocaleLowerCase("tr-TR").includes(q));
        if (url.searchParams.get("mode") === "count") return { status: 200, json: { ok: true, count: rows.length } };
        return { status: 200, json: { ok: true, rows } };
      }],
    ] });
    const card = (name) => page.locator("article", { hasText: name }).first();
    try {
      await page.addInitScript(() => { try { localStorage.setItem("yasam-mineral-viewed-search-results", JSON.stringify(["b0000000-0000-4000-8000-000000000001"])); } catch {} });
      await page.goto(`${BASE}/dogaltas/mineral-listesi`, { waitUntil: "load" });
      const search = page.locator('input[type="search"], input[type="text"]').first();
      await search.waitFor({ timeout: 15000 });
      await search.fill("Demir");
      await card("ZZ Mineral 1 Demir").waitFor({ timeout: 10000 });
      await sleep(900);
      ok(g, "eski bağlamsız localStorage işareti TAŞINMAZ (temiz başlar)", (await page.getByTestId("search-checked-badge").count()) === 0);
      await card("ZZ Mineral 2 Demir").locator("a").last().click();
      await page.waitForURL(/mineral-listesi\/b/, { timeout: 10000 }).catch(() => {});
      await sleep(600);
      await page.goBack();
      await card("ZZ Mineral 1 Demir").waitFor({ timeout: 10000 });
      await sleep(900);
      ok(g, "bakılan mineral 'Kontrol edildi'", await isCheckedBadgeVisible(card("ZZ Mineral 2 Demir")));
      ok(g, "bakılmayan mineralde etiket yok", (await card("ZZ Mineral 3 Demir").getByTestId("search-checked-badge").count()) === 0);
      await search.fill("ZZ");
      await sleep(1500);
      ok(g, "yeni arama → işaret yok", (await page.getByTestId("search-checked-badge").count()) === 0);
      await search.fill("Demir");
      await sleep(1500);
      ok(g, "önceki aramaya dönünce işaret geri gelir", (await page.getByTestId("search-checked-badge").count()) === 1);
      const legacy = await page.evaluate(() => localStorage.getItem("yasam-mineral-viewed-search-results"));
      ok(g, "eski localStorage listesi temizlendi", legacy === null, String(legacy));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

async function testCheckedCombinations() {
  const ROWS = ["ZZ Uyku Sorunu", "ZZ Uyku Kalitesi", "ZZ Baş Ağrısı"].map((issue, i) => ({
    id: uid("a", i + 1), tenant_id: TENANT, source_id: "s", issue, description: null, variant_index: 1, source: "ZZ Kaynak",
    stones_text: "Ametist", notes_text: "ZZ not", notes_text_2: null, notes_text_3: null, created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z",
  }));
  for (const vp of VIEWPORTS) {
    const g = `B4-kontrol-edildi-kombinasyonlar-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/dogaltas\/combinations/, () => ({ status: 200, json: { ok: true, rows: ROWS, count: ROWS.length } })],
    ] });
    const card = (name) => page.locator("article", { hasText: name }).first();
    try {
      await page.goto(`${BASE}/dogaltas/kombinasyonlar`, { waitUntil: "load" });
      const search = page.locator('input[type="search"], input[type="text"]').first();
      await search.waitFor({ timeout: 15000 });
      await search.fill("Uyku");
      await card("ZZ Uyku Sorunu").waitFor({ timeout: 10000 });
      await sleep(600);
      await card("ZZ Uyku Kalitesi").locator("a").last().click();
      await page.waitForURL(/kombinasyonlar\/ZZ/, { timeout: 10000 }).catch(() => {});
      await sleep(800);
      await page.goBack();
      await card("ZZ Uyku Sorunu").waitFor({ timeout: 10000 });
      await sleep(900);
      ok(g, "bakılan kombinasyon 'Kontrol edildi'", await isCheckedBadgeVisible(card("ZZ Uyku Kalitesi")));
      ok(g, "bakılmayanda etiket yok", (await card("ZZ Uyku Sorunu").getByTestId("search-checked-badge").count()) === 0);
      await search.fill("Baş");
      await sleep(800);
      ok(g, "yeni arama → işaret yok", (await page.getByTestId("search-checked-badge").count()) === 0);
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── C) Doğaltaş taş detayı: arama vurgusu ─────────────────────────────────────────────────
const FILLER = "ZZ dolgu cümlesi taş hakkında genel bilgi verir. ".repeat(60);
const DETAIL_STONE = stone(9, {
  stone_name: "ZZ Vurgu Taşı",
  short_description: "Kısa açıklama; eşleşme yok.",
  general_info: `${FILLER}Mide bölgesini rahatlatır. ${FILLER}Ayrıca MİDE ekşimesinde kullanılır ve mide yanmasına iyi gelir.`,
  physical_effects: `${FILLER}Sindirim: mide.`,
  spiritual_effects: "Eşleşme yok.",
});
async function testDetailHighlight() {
  for (const vp of VIEWPORTS) {
    const g = `C-tas-detay-vurgu-${vp.tag}`;
    const { page, ctx, pageErrors, calls } = await newPage({ viewport: vp, routes: [
      ["GET", new RegExp(`^/api/dogaltas/stones/${DETAIL_STONE.id}$`), () => ({ status: 200, json: { ok: true, row: DETAIL_STONE } })],
    ] });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${DETAIL_STONE.id}?q=${encodeURIComponent("mide")}`, { waitUntil: "load" });
      await page.getByText("ZZ Vurgu Taşı").first().waitFor({ timeout: 15000 });
      await sleep(1200);
      const marks = await page.locator("main mark").allInnerTexts();
      const midMarks = marks.filter((m) => /^m[iİı]de$/i.test(m.normalize("NFC")));
      ok(g, "genel bilgide 3 geçiş (Mide / MİDE / mide) + fiziksel 1 → hepsi <mark>", midMarks.length >= 4, JSON.stringify(marks));
      ok(g, "büyük/küçük + Türkçe İ eşleşmesi (MİDE vurgulu)", marks.some((m) => m === "MİDE"));
      ok(g, "240 karakterden sonraki geçişler de görünür (kısaltma yok)", marks.filter((m) => /m[iİ]de/i.test(m)).length >= 4);
      const cnt = (await page.getByTestId("search-match-count").innerText().catch(() => "")).trim();
      ok(g, "eşleşme sayısı gösterilir", /^\d+ eşleşme$/.test(cnt) && Number(cnt.split(" ")[0]) >= 4, cnt);
      const y = await page.evaluate(() => window.scrollY);
      const firstMarkTop = await page.locator("main mark", { hasText: /mide/i }).first().evaluate((el) => el.getBoundingClientRect().top);
      ok(g, "ilk eşleşmeye otomatik kaydırıldı (görünür alanda)", y > 100 && firstMarkTop > 0 && firstMarkTop < vp.height, `scrollY=${y} markTop=${firstMarkTop}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(600);
      ok(g, "kullanıcı serbestçe yukarı çıkabilir (zorla geri kaydırma yok)", (await page.evaluate(() => window.scrollY)) < 50);
      ok(g, "q sunucuya GİTMEZ (taş detay isteği q'suz)", calls.filter((c) => c.path.startsWith("/api/dogaltas/stones/")).every((c) => !/q=/.test(c.search)));
      // tek eşleşme senaryosu
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${DETAIL_STONE.id}?q=${encodeURIComponent("sindirim")}`, { waitUntil: "load" });
      await page.getByText("ZZ Vurgu Taşı").first().waitFor({ timeout: 15000 });
      await sleep(1200);
      const one = (await page.locator("main mark").allInnerTexts()).filter((m) => /sindirim/i.test(m));
      ok(g, "1 geçiş → 1 vurgu", one.length === 1, JSON.stringify(one));
      // okuyucu: ilk eşleşmeye kaydırır
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${DETAIL_STONE.id}?q=${encodeURIComponent("mide")}`, { waitUntil: "load" });
      await page.getByText("ZZ Vurgu Taşı").first().waitFor({ timeout: 15000 });
      await sleep(1000);
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── D) Kombinasyon detayı: tek sade bölüm, yeşil/nötr, yüzde yok ──────────────────────────
function comboRows(issue, variants) {
  return variants.map((stonesText, i) => ({
    id: uid("a", 50 + i), tenant_id: TENANT, source_id: "s", issue, description: null, variant_index: i + 1, source: "ZZ Kaynak",
    stones_text: stonesText, notes_text: "ZZ not; notta Kuvars geçer.", notes_text_2: null, notes_text_3: null,
    created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z",
  }));
}
async function comboCase(vp, label, variants, inventory) {
  const g = `D-kombinasyon-${label}-${vp.tag}`;
  const ISSUE = `ZZ ${label}`;
  const { page, ctx, pageErrors, calls } = await newPage({ viewport: vp, routes: [
    ["GET", /^\/api\/dogaltas\/combinations/, () => ({ status: 200, json: { ok: true, rows: comboRows(ISSUE, variants) } })],
    ["GET", /^\/api\/dogaltas\/inventory/, () => ({ status: 200, json: { ok: true, rows: inventory } })],
    ["GET", /^\/api\/urun-stok\//, () => ({ status: 200, json: { ok: true, rows: inventory } })],
  ] });
  try {
    await page.goto(`${BASE}/dogaltas/kombinasyonlar/${encodeURIComponent(ISSUE)}`, { waitUntil: "load" });
    await page.getByText("Bu Kombinasyon İçin Gereken Taşlar").first().waitFor({ timeout: 15000 });
    await sleep(1800);
    const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    ok(g, "tek ana bölüm: 'Bu Kombinasyon İçin Gereken Taşlar'", /Bu Kombinasyon İçin Gereken Taşlar/.test(t));
    ok(g, "'Stokta Olmayan (Eksik) Taşlar' bölümü YOK", !/STOKTA OLMAYAN|Eksik\) Taşlar|stoğunuzda bulunmayan/i.test(t));
    ok(g, "'Taş Listenizde kayıtlı değil' kavramı YOK", !/Taş Listenizde kayıtlı değil/.test(t) && (await page.getByTestId("combo-chip-ghost").count()) === 0);
    ok(g, "açıklamasız yüzde YOK ('%50 Kısmi', '%0 Eksik', '100% Tam')", !/\d+\s?%\s?(Kısmi|Eksik|Tam)|%\s?\d+\s?(Kısmi|Eksik|Tam)/.test(t));
    const struck = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).textDecorationLine.includes("line-through")).length);
    ok(g, "üstü çizili gösterim YOK", struck === 0);
    const outChips = page.getByTestId("combo-chip-out");
    const outStyles = await outChips.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor + "|" + getComputedStyle(el).borderColor));
    ok(g, "stokta olmayan çipler nötr (beyaz/gri, sarı/kırmızı yok)", outStyles.every((s) => /rgb\(255, 255, 255\)/.test(s)), outStyles.slice(0, 3).join(" ; "));
    const inChips = page.getByTestId("combo-chip-in");
    const inStyles = await inChips.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    ok(g, "stokta olan çipler yeşil", inStyles.every((s) => /rgb\(236, 253, 245\)|oklch/.test(s)), inStyles.slice(0, 3).join(" ; "));
    ok(g, "tüm taşlar gösterilir (veri kaybı yok)", variants.join(",").split(",").map((x) => x.trim()).every((n) => t.includes(n)));
    ok(g, "taş listesi tamamen çekilmez (ghost için gereksiz istek YOK)", !calls.some((c) => c.path === "/api/dogaltas/stones" || /^\/api\/dogaltas\/stones\?/.test(c.path + c.search)));
    ok(g, "yatay taşma yok", await noHScroll(page));
    ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    return { page, t, inCount: await inChips.count(), outCount: await outChips.count() };
  } catch (e) { ok(g, "senaryo çalıştı", false, e); return null; } finally { await ctx.close(); }
}
async function testCombo() {
  const inv = (names) => names.map((name) => ({ name, adet: 10, unit_cost_try: 20 }));
  const long = ["Akik", "Ametist", "Amazonit", "Aventurin", "Akuamarin", "Labradorit", "Lepidolit", "Malakit", "Obsidyen", "Oniks", "Opal", "Pirit", "Rodonit", "Sitrin", "Sodalit", "Turkuaz", "Turmalin", "Yeşim", "Zümrüt", "Hematit", "Karneol", "Kuvars"];
  for (const vp of VIEWPORTS) {
    await comboCase(vp, "hepsi-stokta", ["Ametist, Lepidolit, Sodalit"], inv(["Ametist", "Lepidolit", "Sodalit"]));
    await comboCase(vp, "hicbiri-stokta-yok", ["Ametist, Lepidolit, Sodalit"], []);
    await comboCase(vp, "karisik", ["Ametist, Lepidolit, Sodalit", "Ametist, Kuvars"], inv(["Ametist"]));
    await comboCase(vp, "uzun-liste", [long.join(", ")], inv(long.slice(0, 5)));
  }
}

// ── E) Aromaterapi Yeni Yağ: Kaydet her zaman tam görünür ─────────────────────────────────
async function saveButtonState(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-testid="new-oil-save"]');
    const bar = document.querySelector('[data-testid="new-oil-save-bar"]');
    if (!btn || !bar) return null;
    const r = btn.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      top: r.top, bottom: r.bottom, vh, docH: document.documentElement.scrollHeight, winH: window.innerHeight,
      inside: r.top >= 0 && r.bottom <= vh, clickable: hit === btn || btn.contains(hit),
    };
  });
}
async function testAromaSave() {
  const vps = [MOBILE, { width: 360, height: 640, tag: "android-kucuk" }, { width: 412, height: 780, tag: "android-webview" }, WEB];
  for (const vp of vps) {
    const g = `E-aroma-kaydet-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp });
    try {
      await page.goto(`${BASE}/aromaterapi/yaglar?view=new`, { waitUntil: "load" });
      await page.getByTestId("new-oil-save").waitFor({ timeout: 15000 });
      await sleep(800);
      let s = await saveButtonState(page);
      ok(g, "açılışta Kaydet TAMAMEN görünür", s?.inside, JSON.stringify(s));
      ok(g, "Kaydet tıklanabilir (üstünde başka katman yok)", s?.clickable, JSON.stringify(s));
      ok(g, "sayfa viewport'tan taşmıyor (dış kaydırma/jitter yok)", s && s.docH <= s.winH + 1, JSON.stringify(s));
      // formun sonuna kadar kaydır
      await page.evaluate(() => { document.querySelectorAll('[data-testid="new-oil-form"] .overflow-y-auto').forEach((el) => { el.scrollTop = el.scrollHeight; }); window.scrollTo(0, document.body.scrollHeight); });
      await sleep(400);
      s = await saveButtonState(page);
      ok(g, "sayfa sonunda Kaydet tam görünür", s?.inside && s?.clickable, JSON.stringify(s));
      const y = await page.evaluate(() => window.scrollY);
      ok(g, "pencere kaydırması yok (Kaydet yerinde sabit)", y === 0, `scrollY=${y}`);
      if (vp.width < 768) {
        // klavye açık simülasyonu: görünür yükseklik küçülür (Android WebView adjustResize)
        const input = page.locator('[data-testid="new-oil-form"] input[type="text"]').first();
        await input.click().catch(() => {});
        await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
        await sleep(500);
        s = await saveButtonState(page);
        ok(g, "klavye açık (kısa viewport) → Kaydet hâlâ tam görünür + tıklanabilir", s?.inside && s?.clickable, JSON.stringify(s));
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await sleep(400);
        s = await saveButtonState(page);
        ok(g, "klavye kapanınca Kaydet yerinde", s?.inside && s?.clickable, JSON.stringify(s));
      }
      // tıklama gerçekten işler (zorunlu alan uyarısı veya kayıt denemesi)
      await page.getByTestId("new-oil-save").click();
      await sleep(600);
      ok(g, "Kaydet tıklanınca tepki verir (doğrulama/kayıt)", (await page.locator("text=/zorunlu|gerekli|Kaydediliyor|ad/i").count()) > 0);
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── F) Biyoenerji genel arama: geri dönüş + çıkış sorusu + Kontrol edildi + vurgu ──────────
const SYM = (i) => ({
  section: "sembol-dili", sectionLabel: "Sembol Dili", id: uid("e", i + 10), title: `ZZ Sembol ${i + 1}`,
  matchedField: "meaning", matchedFieldLabel: "Anlam", snippet: "…mide ile ilgili…", href: `/dashboard/biyoenerji/sembol-dili/${uid("e", i + 10)}`,
});
const SYMBOL_ROW = (id, i) => ({
  id, tenant_id: TENANT, symbol: `ZZ Sembol ${i}`, title: "ZZ başlık", category: "ZZ",
  meaning: `${"ZZ uzun anlam metni sembolün dilini anlatır. ".repeat(70)}Mide bölgesinde düğüm. Bastırılmış öfke MİDE ile ilişkilenir; mide kasılması.`,
  source: "ZZ kaynak", created_at: "2026-10-01T09:00:00.000Z",
});
async function testBio() {
  for (const vp of VIEWPORTS) {
    const g = `F-bio-arama-${vp.tag}`;
    const many = Array.from({ length: 32 }, (_, i) => SYM(i));
    const { page, ctx, calls, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/biyoenerji\/search/, (_r, url) => {
        const q = url.searchParams.get("q") ?? "";
        return { status: 200, json: { ok: true, query: q, total: 33, sections: [
          { key: "cakralar", label: "Çakralar", total: 1, hits: [{ section: "cakralar", sectionLabel: "Çakralar", id: uid("e", 2), title: "ZZ Solar Pleksus", matchedField: "organs", matchedFieldLabel: "Organlar", snippet: "…mide, karaciğer…", href: `/dashboard/biyoenerji/cakralar/${uid("e", 2)}` }] },
          { key: "sembol-dili", label: "Sembol Dili", total: 32, hits: many },
        ] } };
      }],
      ["GET", /^\/api\/biyoenerji\/symbols\/e/, (_r, url) => {
        const id = url.pathname.split("/").pop();
        const i = Number(id.slice(-12)) - 9;
        return { status: 200, json: { ok: true, row: SYMBOL_ROW(id, i) } };
      }],
    ] });
    const hit = (title) => page.getByTestId("bio-global-hit").filter({ hasText: new RegExp(`${title}(?!\\d)`) }).first();
    const searchCalls = () => calls.filter((c) => c.path === "/api/biyoenerji/search").length;
    try {
      await page.goto(`${BASE}/dashboard/biyoenerji`, { waitUntil: "load" });
      const input = page.getByTestId("bio-global-search");
      await input.waitFor({ timeout: 15000 });
      const histStart = await page.evaluate(() => history.length);
      await input.fill("mide");
      await page.getByTestId("bio-global-results").waitFor({ timeout: 8000 });
      ok(g, "30+ sonuç listelendi", (await page.getByTestId("bio-global-hit").count()) >= 33);
      // listede aşağıdaki bir sonuca git (kaydırma konumu testi)
      const target = hit("ZZ Sembol 20");
      await target.scrollIntoViewIfNeeded();
      await sleep(300);
      const yBefore = await page.evaluate(() => window.scrollY);
      const callsBefore = searchCalls();
      await target.click();
      await page.waitForURL(/\/sembol-dili\/e/, { timeout: 10000 });
      ok(g, "detay URL'ine arama terimi taşındı (?q=mide)", /\?q=mide$/.test(page.url()), page.url());
      await page.getByTestId("bio-search-context").waitFor({ timeout: 10000 });
      await sleep(1200);
      const hc = await highlightCount(page);
      ok(g, "detayda TÜM geçişler vurgulu (Mide/MİDE/mide = 3)", hc >= 3, `count=${hc}`);
      const cntText = await page.getByTestId("bio-search-match-count").innerText().catch(() => "");
      ok(g, "eşleşme sayısı gösterilir", /\d+ eşleşme/.test(cntText), cntText);
      const dy = await page.evaluate(() => window.scrollY);
      ok(g, "detayda ilk eşleşmeye otomatik kaydırıldı", dy > 200, `scrollY=${dy}`);
      ok(g, "detay isteğine q GİTMEZ (tenant/erişim değişmez)", calls.filter((c) => c.path.startsWith("/api/biyoenerji/symbols/")).every((c) => !c.search.includes("q=")));
      // GERİ → aynı arama
      await page.goBack();
      await page.getByTestId("bio-global-results").waitFor({ timeout: 10000 });
      await sleep(900);
      ok(g, "geri → AYNI arama sonuçlarına döndü (ana ekrana değil)", (await input.inputValue()) === "mide" && (await page.getByTestId("bio-global-hit").count()) >= 33);
      ok(g, "geri dönüşte sunucuya yeniden arama isteği yok (sonuç listesi korunur)", searchCalls() === callsBefore, `${callsBefore}→${searchCalls()}`);
      const yAfter = await page.evaluate(() => window.scrollY);
      ok(g, "kaydırma konumu korundu", Math.abs(yAfter - yBefore) < 120, `${yBefore}→${yAfter}`);
      ok(g, "açılan sonuç 'Kontrol edildi'", await isCheckedBadgeVisible(hit("ZZ Sembol 20")));
      ok(g, "açılmayan sonuçta etiket yok", (await hit("ZZ Sembol 21").getByTestId("search-checked-badge").count()) === 0);
      // başka sonuç aç → geri → ilk işaret kalır
      await hit("ZZ Sembol 3").click();
      await page.waitForURL(/\/sembol-dili\/e/, { timeout: 10000 });
      await sleep(800);
      await page.goBack();
      await page.getByTestId("bio-global-results").waitFor({ timeout: 10000 });
      await sleep(800);
      ok(g, "ikinci açılan da işaretli + ilk işaret KALIR", (await isCheckedBadgeVisible(hit("ZZ Sembol 3"))) && (await isCheckedBadgeVisible(hit("ZZ Sembol 20"))));
      const order = await page.getByTestId("bio-global-hit").locator("span.truncate").allInnerTexts();
      ok(g, "sonuç sırası DEĞİŞMEDİ", order[0] === "ZZ Solar Pleksus" && order[1] === "ZZ Sembol 1" && order[20] === "ZZ Sembol 20", order.slice(0, 3).join("|"));
      // bir daha GERİ → çıkış sorusu
      await page.goBack();
      await page.getByTestId("bio-search-exit-dialog").waitFor({ timeout: 6000 });
      ok(g, "bir daha geri → 'Arama sonuçlarından çıkmak istiyor musunuz?'", /çıkmak istiyor musunuz/.test(await page.getByTestId("bio-search-exit-dialog").innerText()));
      await page.getByRole("button", { name: "Aramada Kal" }).click();
      await sleep(500);
      ok(g, "Aramada Kal → sonuçlar duruyor", (await page.getByTestId("bio-search-exit-dialog").count()) === 0 && (await page.getByTestId("bio-global-hit").count()) >= 33);
      await page.goBack();
      await page.getByTestId("bio-search-exit-dialog").waitFor({ timeout: 6000 });
      ok(g, "tekrar geri → soru tekrar (bir kez)", (await page.getByTestId("bio-search-exit-dialog").count()) === 1);
      await page.getByRole("button", { name: "Çık" }).click();
      await sleep(600);
      ok(g, "Çık → Biyoenerji ana ekranı (arama temiz, kartlar görünür)", (await input.inputValue()) === "" && (await page.getByTestId("bio-global-results").count()) === 0 && page.url().endsWith("/dashboard/biyoenerji"), page.url());
      const histEnd = await page.evaluate(() => history.length);
      ok(g, "geçmiş şişmedi (sonsuz guard döngüsü yok)", histEnd - histStart <= 4, `${histStart}→${histEnd}`);
      // Çık sonrası geri → normal akış (soru YOK)
      await page.goBack().catch(() => {});
      await sleep(700);
      ok(g, "Çık sonrası geri → soru tekrar ÇIKMAZ (normal geçmiş)", (await page.getByTestId("bio-search-exit-dialog").count()) === 0);
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
  // Temizle (X) → arama kaydı kapanır, geri normal akar
  {
    const g = "F-bio-temizle";
    const { page, ctx } = await newPage({ viewport: MOBILE, routes: [
      ["GET", /^\/api\/biyoenerji\/search/, (_r, url) => ({ status: 200, json: { ok: true, query: url.searchParams.get("q"), total: 1, sections: [{ key: "sembol-dili", label: "Sembol Dili", total: 1, hits: [SYM(0)] }] } })],
    ] });
    try {
      await page.goto(`${BASE}/dashboard/biyoenerji`, { waitUntil: "load" });
      const input = page.getByTestId("bio-global-search");
      await input.waitFor({ timeout: 15000 });
      await input.fill("mide");
      await page.getByTestId("bio-global-results").waitFor({ timeout: 8000 });
      await page.getByRole("button", { name: "Aramayı temizle" }).click();
      await sleep(800);
      ok(g, "X → arama temiz, URL'de q yok, soru yok", !page.url().includes("q=") && (await page.getByTestId("bio-search-exit-dialog").count()) === 0 && (await input.inputValue()) === "", page.url());
      await input.fill("kalp");
      await page.getByTestId("bio-global-results").waitFor({ timeout: 8000 });
      ok(g, "yeni arama → yeni sonuçlar + 'Kontrol edildi' yok", (await page.getByTestId("search-checked-badge").count()) === 0);
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── G) Bildirim / randevu paneli ──────────────────────────────────────────────────────────
function apptItems(n, longText = false) {
  const base = Date.now() + 20 * 60_000;
  return Array.from({ length: n }, (_, i) => ({
    id: uid("9", i + 1), title: longText ? `ZZ Uzun randevu başlığı ${i + 1} — ${"çok uzun açıklama metni ".repeat(6)}` : `ZZ Randevu ${i + 1}`,
    appointment_date: new Date(base + i * 60_000).toISOString(), status: "bekliyor", client_id: uid("c", i + 1),
    clientName: longText ? `ZZ Danışan Adı Soyadı Çok Uzun ${i + 1}` : `ZZ Danışan ${i + 1}`, canOpenClient: true,
  }));
}
async function panelGeometry(page) {
  return page.evaluate(() => {
    const p = document.querySelector('[data-testid="notification-panel"]');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const btns = [...p.querySelectorAll("button, a")];
    const list = p.querySelector('[data-testid="notification-panel-list"]');
    const centerHit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60));
    const lr = list?.getBoundingClientRect();
    const visibleBtns = btns.filter((b) => {
      const br = b.getBoundingClientRect();
      const cy = br.top + br.height / 2;
      const inList = list?.contains(b);
      // Liste içindeki buton: merkezi listenin görünür alanı dışındaysa panel içi kaydırmayla erişilir
      // (bir sonraki kontrol son butonu kaydırıp doğrular); içindeyse doğrudan tıklanabilir olmalı.
      if (inList && lr && (cy < lr.top || cy > lr.bottom)) return list.scrollHeight > list.clientHeight;
      const h = document.elementFromPoint(br.left + br.width / 2, cy);
      return h === b || b.contains(h);
    });
    return {
      top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height, vw, vh,
      inside: r.top >= 0 && r.left >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5,
      notClipped: Boolean(centerHit && p.contains(centerHit)),
      allButtonsReachable: visibleBtns.length === btns.length,
      listScrollable: list ? list.scrollHeight > list.clientHeight : false,
      fontPx: parseFloat(getComputedStyle(p.querySelector("li span") ?? p).fontSize),
    };
  });
}
async function testBell() {
  const pages = [
    { path: "/", tag: "ana-ekran" },
    { path: "/danisan-yolculugu", tag: "ust-cubuk" },
  ];
  const vps = [MOBILE, { width: 360, height: 640, tag: "mobil-kucuk" }, { width: 700, height: 800, tag: "web-dar" }, WEB];
  for (const pg of pages) {
    for (const vp of vps) {
      for (const scenario of [{ n: 6, long: true, tag: "cok-uzun" }, { n: 1, long: false, tag: "tek" }]) {
        const g = `G-bildirim-${pg.tag}-${vp.tag}-${scenario.tag}`;
        const posts = [];
        const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
          ["GET", /^\/api\/appointments\/notifications$/, () => ({ status: 200, json: { ok: true, items: apptItems(scenario.n, scenario.long) } })],
          ["POST", /^\/api\/appointments\/notifications\/state/, (_r, _u, body) => { posts.push(body); return { status: 200, json: { ok: true } }; }],
          ["GET", /^\/api\/dashboard\/summary/, () => ({ status: 200, json: { ok: true } })],
        ] });
        try {
          await page.goto(`${BASE}${pg.path}`, { waitUntil: "load" });
          const bell = page.getByRole("button", { name: "Bildirimler" }).first();
          await bell.waitFor({ timeout: 20000 });
          await page.waitForFunction(() => {
            const b = document.querySelector('button[aria-label="Bildirimler"] span');
            return Boolean(b && /\d/.test(b.textContent ?? ""));
          }, null, { timeout: 15000 }).catch(() => {});
          const badgeBefore = await bell.locator("span").count();
          await bell.click();
          await page.getByTestId("notification-panel").waitFor({ timeout: 5000 });
          await sleep(400);
          const geo = await panelGeometry(page);
          ok(g, "panel viewport içinde (sağ/sol/alt taşma yok)", geo?.inside, JSON.stringify(geo));
          ok(g, "panel kırpılmıyor / üstünü başka katman örtmüyor", geo?.notClipped, JSON.stringify(geo));
          ok(g, "panel üst bölgeye sıkışmıyor (yükseklik ≥ 160px veya içeriğin tamamı)", geo && (geo.height >= 160), JSON.stringify(geo));
          ok(g, "yazılar okunabilir (≥ 11px)", geo && geo.fontPx >= 11, String(geo?.fontPx));
          ok(g, "tüm aksiyon butonları erişilebilir", geo?.allButtonsReachable, JSON.stringify(geo));
          ok(g, "rozet vardı", badgeBefore >= 1);
          if (scenario.n > 3) ok(g, "çok bildirim → panel kendi içinde kayar", geo?.listScrollable, JSON.stringify(geo));
          // panel içi kaydırma + son bildirimin butonuna erişim
          const lastBtn = page.getByTestId("notification-panel").getByRole("button", { name: "Tamamlandı" }).last();
          await lastBtn.scrollIntoViewIfNeeded();
          const lb = await lastBtn.boundingBox();
          ok(g, "son bildirimin 'Tamamlandı' butonu görünür alana gelir", lb && lb.y >= 0 && lb.y + lb.height <= vp.height, JSON.stringify(lb));
          ok(g, "paneli açmak sunucuda durum DEĞİŞTİRMEZ (Tamamlandı/Tekrar gösterme yazılmaz)", posts.length === 0, JSON.stringify(posts));
          const remaining = await page.getByTestId("notification-panel").locator("li").count();
          ok(g, "açınca bildirimler listede KALIR (otomatik 'tümü işlendi' yok)", remaining === scenario.n, `li=${remaining}`);
          // dışarı tıklama kapatır
          await page.mouse.click(5, vp.height - 5);
          await sleep(300);
          ok(g, "dışarı dokunma → panel kapanır", (await page.getByTestId("notification-panel").count()) === 0);
          // tekrar aç → Tamamlandı tek kayıt yazar (iş mantığı aynı)
          await bell.click();
          await page.getByTestId("notification-panel").waitFor({ timeout: 5000 });
          await page.getByTestId("notification-panel").getByRole("button", { name: "Tamamlandı" }).first().click();
          await sleep(700);
          ok(g, "Tamamlandı → yalnız o bildirim için tek durum yazımı (mevcut davranış)", posts.length === 1 && posts[0]?.state === "done", JSON.stringify(posts));
          ok(g, "yatay sayfa taşması yok", await noHScroll(page));
          ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
        } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
      }
    }
  }
}

// ── G2) Bildirim rozeti: paneli açmak okundu YAPMAZ; yalnız açılan/işlenen bildirim ───────
async function testBellUnread() {
  for (const vp of VIEWPORTS) {
    const g = `G2-bildirim-rozet-${vp.tag}`;
    const posts = [];
    const handled = new Set();
    const items = apptItems(3);
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/appointments\/notifications$/, () => ({ status: 200, json: { ok: true, items: items.filter((i) => !handled.has(i.id)) } })],
      ["POST", /^\/api\/appointments\/notifications\/state/, (_r, _u, body) => { posts.push(body); handled.add(body?.appointmentId); return { status: 200, json: { ok: true } }; }],
    ] });
    const bell = () => page.getByRole("button", { name: "Bildirimler" }).first();
    const badge = async () => {
      const s = bell().locator("span");
      return (await s.count()) ? Number((await s.first().innerText()).trim()) : 0;
    };
    const waitBadge = async (n) => page.waitForFunction((want) => {
      const s = document.querySelector('button[aria-label="Bildirimler"] span');
      return (s ? Number((s.textContent ?? "").trim()) : 0) === want;
    }, n, { timeout: 10000 }).then(() => true).catch(() => false);
    const panel = () => page.getByTestId("notification-panel");
    const openPanel = async () => { await bell().click(); await panel().waitFor({ timeout: 5000 }); await sleep(300); };
    const closePanel = async () => { await page.keyboard.press("Escape"); await sleep(300); };
    const unreadFlags = () => panel().getByTestId("notification-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-unread")));
    try {
      await page.goto(`${BASE}/danisan-yolculugu`, { waitUntil: "load" });
      await bell().waitFor({ timeout: 20000 });
      ok(g, "başlangıç: 3 okunmamış → rozet 3", await waitBadge(3), String(await badge()));
      await openPanel();
      ok(g, "paneli açmak rozeti DEĞİŞTİRMEZ (hâlâ 3)", (await badge()) === 3, String(await badge()));
      ok(g, "panelde 3'ü de 'Yeni' (okunmamış) işaretli", JSON.stringify(await unreadFlags()) === JSON.stringify(["1", "1", "1"]));
      await closePanel();
      await openPanel();
      ok(g, "kapat/aç → hâlâ 3 okunmamış", (await badge()) === 3 && (await unreadFlags()).every((f) => f === "1"));
      // 1) bildirimi AÇ (randevu bağlantısı) → yalnız o görüldü
      await panel().getByTestId("notification-item").first().locator("a").first().click();
      await page.waitForURL(/\/dashboard\/ajanda\?randevu=/, { timeout: 10000 }).catch(() => {});
      await bell().waitFor({ timeout: 20000 });
      ok(g, "1 bildirim açıldı → rozet 2", await waitBadge(2), String(await badge()));
      await openPanel();
      const f1 = await unreadFlags();
      ok(g, "açılan 'Yeni' değil, kalan 2'si hâlâ okunmamış", JSON.stringify(f1) === JSON.stringify(["0", "1", "1"]), JSON.stringify(f1));
      await closePanel();
      await openPanel();
      ok(g, "kapat/aç → kalan 2 hâlâ okunmamış, rozet 2", (await badge()) === 2 && (await unreadFlags()).filter((f) => f === "1").length === 2);
      ok(g, "açmak/okumak sunucuya durum YAZMAZ", posts.length === 0, JSON.stringify(posts));
      // 2) bildirimi İŞLE (Tamamlandı) → mevcut semantik: tek 'done' kaydı, listeden düşer
      await panel().getByTestId("notification-item").nth(1).getByRole("button", { name: "Tamamlandı" }).click();
      await sleep(800);
      ok(g, "Tamamlandı → tek 'done' kaydı (semantik aynı)", posts.length === 1 && posts[0]?.state === "done" && posts[0]?.appointmentId === items[1].id, JSON.stringify(posts));
      ok(g, "işlenen düştü → rozet 1, kalan okunmamış korunur", (await badge()) === 1 && (await panel().getByTestId("notification-item").count()) === 2, `badge=${await badge()}`);
      // 3) Tekrar gösterme → 'muted' (semantik aynı)
      await panel().getByTestId("notification-item").last().getByRole("button", { name: "Tekrar gösterme" }).click();
      await sleep(800);
      ok(g, "Tekrar gösterme → tek 'muted' kaydı (semantik aynı)", posts.length === 2 && posts[1]?.state === "muted" && posts[1]?.appointmentId === items[2].id, JSON.stringify(posts));
      ok(g, "tüm okunmamışlar işlendi → rozet yok", (await badge()) === 0);
      // 4) yenileme: görüldü bilgisi cihazda kalıcı, işlenenler sunucudan gelmez
      await page.reload({ waitUntil: "load" });
      await bell().waitFor({ timeout: 20000 });
      await sleep(2500);
      ok(g, "yenilemeden sonra rozet 0 (açılan görüldü kalıcı, işlenenler gelmez)", (await badge()) === 0, String(await badge()));
      await openPanel();
      ok(g, "panelde yalnız açılmış (okunmuş) bildirim kalır", JSON.stringify(await unreadFlags()) === JSON.stringify(["0"]));
      const geo = await panelGeometry(page);
      ok(g, "WT8 responsive düzeltme korunur (viewport içinde, kırpılmıyor)", geo?.inside && geo?.notClipped, JSON.stringify(geo));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

const ALL = { testDrawer, testCheckedBuilder, testCheckedStones, testCheckedMinerals, testCheckedCombinations, testDetailHighlight, testCombo, testAromaSave, testBio, testBell, testBellUnread };
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(ALL);
try {
  for (const k of only) await ALL[k]();
} catch (e) {
  ok("runner", "beklenmeyen hata", false, e);
} finally {
  await browser?.close();
}
console.log(`\nWT8 UI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
