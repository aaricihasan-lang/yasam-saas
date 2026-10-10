// WT5 — Aromaterapi + Doğaltaş + Biyoenerji UX: UI davranış testleri (Playwright, yerel build, ağ-mock).
// Prod'a / dış ağa temas YOK: /api/* istekleri burada sentetik ZZ verisiyle karşılanır; 127.0.0.1 dışı abort.
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink + sahte env build + start);
//   node scripts/wt5/ui-wt5.mjs   (UI_BASE ile port değiştirilebilir)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

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
const VIEWPORTS = [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }];
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
  const ctx = await browser.newContext({ viewport });
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
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

// ── A) Aromaterapi: tekrar eden üst modül şeridi YOK ───────────────────────────────────────
async function testAromaNav() {
  const subs = ["/aromaterapi/yaglar", "/aromaterapi/karisim-olusturucu", "/aromaterapi/bilgi-kayitlari",
    "/aromaterapi/kaynaklar", "/aromaterapi/katalog", "/aromaterapi/bilgi-bankasi", "/aromaterapi/bilgi-bankasi/sozluk"];
  for (const vp of VIEWPORTS) {
    const g = `A-aroma-nav-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/aromaterapi\/blends/, () => ({ status: 200, json: { ok: true, rows: [] } })],
    ] });
    try {
      await page.goto(`${BASE}/aromaterapi`, { waitUntil: "load" });
      await sleep(1500);
      const hubCards = await page.locator('a[href="/aromaterapi/yaglar"]').count();
      ok(g, "ana ekran: alt modül kartları duruyor", hubCards >= 1, `cards=${hubCards}`);
      for (const p of subs) {
        await page.goto(`${BASE}${p}`, { waitUntil: "load" });
        await sleep(1800);
        const navCount = await page.locator('nav[aria-label="Aromaterapi bölümleri"]').count();
        const back = await page.locator('a[href="/aromaterapi"]').count();
        const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
        ok(g, `${p}: tekrar eden üst şerit YOK`, navCount === 0, `nav=${navCount}`);
        ok(g, `${p}: Aromaterapi'ye dönüş bağlantısı + başlık var`, back >= 1 && h1.length > 0, `back=${back} h1=${h1}`);
        ok(g, `${p}: yatay sayfa taşması yok`, await noHScroll(page));
      }
      ok(g, "JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── B) Yağ detayı sekmeleri: mobilde hepsi görünür, sarar, yatay kaydırma yok ───────────────
const OIL_ID = uid("c", 1);
// Gerçek AromatherapyOil şekli: lib/demo/demoAromaterapi fixture'ından üretilmiş ZZ kopya (scripts/wt5/fixtures/oil.json).
const OIL = JSON.parse(readFileSync(new URL("./fixtures/oil.json", import.meta.url), "utf8"));
async function testOilTabs() {
  for (const vp of VIEWPORTS) {
    const g = `B-oil-tabs-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", new RegExp(`^/api/aromaterapi/oils/${OIL_ID}$`), () => ({ status: 200, json: { ok: true, oil: OIL } })],
      ["GET", /^\/api\/aromaterapi\/oils/, () => ({ status: 200, json: { ok: true, rows: [{ id: OIL_ID, name: "ZZ Lavanta" }] } })],
    ] });
    try {
      await page.goto(`${BASE}/aromaterapi/yaglar/${OIL_ID}`, { waitUntil: "load" });
      const nav = page.getByTestId("oil-detail-tabs");
      await nav.waitFor({ timeout: 15000 });
      const info = await nav.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const btns = [...el.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
        return {
          n: btns.length,
          allInside: btns.every((b) => b.left >= r.left - 1 && b.right <= r.right + 1 && b.right <= window.innerWidth + 1),
          scrollOk: el.scrollWidth <= el.clientWidth + 1,
          rows: new Set(btns.map((b) => Math.round(b.top))).size,
          dir: getComputedStyle(el).flexDirection,
          minH: Math.min(...btns.map((b) => b.height)),
        };
      });
      ok(g, "9 sekmenin TAMAMI görünür alanda", info.n === 9 && info.allInside, JSON.stringify(info));
      ok(g, "sekme şeridinde yatay kaydırma yok", info.scrollOk);
      if (vp.tag === "mobil") {
        ok(g, "mobilde 2+ satıra sarar", info.rows >= 2, `rows=${info.rows}`);
        ok(g, "dokunma hedefi ≥ 40px", info.minH >= 39, `minH=${info.minH}`);
      } else {
        ok(g, "webde dikey kenar çubuğu korunur", info.dir === "column", info.dir);
      }
      ok(g, "üst modül şeridi YOK", (await page.locator('nav[aria-label="Aromaterapi bölümleri"]').count()) === 0);
      ok(g, "yatay sayfa taşması yok", await noHScroll(page));
      const labels = await nav.locator("button").allInnerTexts();
      await nav.locator("button").nth(8).click();
      ok(g, "son sekmeye (Notlar) doğrudan dokunulabilir", /Notlar/.test(labels[8] ?? ""), labels.join("|"));
      ok(g, "JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── C) Karışım "Kopyala": ad sorulur, (Kopya) eklenmez, çakışma engellenir ─────────────────
function blend(id, name) {
  return {
    id, tenant_id: TENANT, name, notes: "", carrier_oil_id: null, carrier_oil_name: "Badem", carrier_photosensitivity_status: "none",
    carrier_contraindications: "", carrier_safety_notes: "", bottle_ml: 30, dilution_percent: 2, drops_per_ml: 20, total_drops: 12,
    items: [{ oil_id: OIL_ID, oil_name: "ZZ Lavanta", drops: 12, photosensitivity_status: "none" }], is_active: true,
    created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z",
  };
}
async function testBlendCopy() {
  for (const vp of VIEWPORTS) {
    const g = `C-blend-copy-${vp.tag}`;
    const saved = [blend(uid("d", 1), "ZZ Rahatlama (Kopya)"), blend(uid("d", 2), "ZZ Rahatlama 2")];
    const posts = [];
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/aromaterapi\/blends/, () => ({ status: 200, json: { ok: true, rows: saved } })],
      ["POST", /^\/api\/aromaterapi\/blends$/, (_r, _u, body) => {
        posts.push(body);
        const created = blend(uid("d", 9), String(body?.name ?? ""));
        saved.push(created);
        return { status: 200, json: { ok: true, blend: created } };
      }],
    ] });
    try {
      await page.goto(`${BASE}/aromaterapi/karisim-olusturucu`, { waitUntil: "load" });
      const copyBtn = page.getByRole("button", { name: "Kopyala" }).first();
      await copyBtn.waitFor({ timeout: 15000 });
      await copyBtn.click();
      const dlg = page.getByTestId("blend-copy-dialog");
      await dlg.waitFor({ timeout: 5000 });
      const input = page.getByTestId("blend-copy-name");
      const suggested = await input.inputValue();
      ok(g, "Kopyala → ad penceresi (anında kayıt YOK)", posts.length === 0);
      ok(g, "öneri '(Kopya)' içermez ve çakışmaz", !/Kopya/i.test(suggested) && suggested === "ZZ Rahatlama 3", suggested);
      await input.fill("zz rahatlama 2");
      await dlg.getByRole("button", { name: "Kopyala" }).click();
      await sleep(400);
      ok(g, "mevcut adla çakışan ad reddedilir (kayıt yok)", posts.length === 0 && /zaten var/.test(await dlg.innerText()));
      await input.fill("");
      await dlg.getByRole("button", { name: "Kopyala" }).click();
      await sleep(300);
      ok(g, "boş ad reddedilir", posts.length === 0);
      await input.fill("ZZ Akşam Karışımı");
      await dlg.getByRole("button", { name: "Kopyala" }).dblclick();
      await sleep(1500);
      ok(g, "kullanıcının verdiği adla TEK kayıt", posts.length === 1 && posts[0]?.name === "ZZ Akşam Karışımı", JSON.stringify(posts.map((p) => p?.name)));
      ok(g, "içerik kopyalandı (yağlar/ölçüler)", posts[0]?.items?.length === 1 && posts[0]?.bottle_ml === 30);
      ok(g, "pencere kapandı", (await page.getByTestId("blend-copy-dialog").count()) === 0);
      // Vazgeç akışı
      await page.getByRole("button", { name: "Kopyala" }).first().click();
      await page.getByTestId("blend-copy-dialog").getByRole("button", { name: "Vazgeç" }).click();
      ok(g, "Vazgeç → kayıt yok", posts.length === 1 && (await page.getByTestId("blend-copy-dialog").count()) === 0);
      ok(g, "JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── D) "Ajanda & Randevu Merkezi" ───────────────────────────────────────────────────────────
async function testNaming() {
  for (const vp of VIEWPORTS) {
    const g = `D-naming-${vp.tag}`;
    const { page, ctx } = await newPage({ viewport: vp });
    try {
      await page.goto(`${BASE}/danisan-yolculugu`, { waitUntil: "load" });
      await page.getByText("Ajanda & Randevu Merkezi").first().waitFor({ timeout: 15000 });
      const t = await bodyText(page);
      ok(g, "kart adı 'Ajanda & Randevu Merkezi'", /Ajanda & Randevu Merkezi/.test(t));
      ok(g, "'Danışan Takip' görünmüyor", !/Danışan Takip\b/.test(t));
      const card = page.locator('a[href="/danisan-yolculugu/takip"]').first();
      ok(g, "kart aynı rotaya gider", (await card.innerText()).includes("Ajanda & Randevu Merkezi"));
      ok(g, "yatay taşma yok", await noHScroll(page));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── E) Biyoenerji genel arama (UI) ────────────────────────────────────────────────────────
async function testBioSearch() {
  for (const vp of VIEWPORTS) {
    const g = `E-bio-search-${vp.tag}`;
    const many = Array.from({ length: 25 }, (_, i) => ({
      section: "sembol-dili", sectionLabel: "Sembol Dili", id: uid("e", i + 10), title: `ZZ Sembol ${i + 1}`,
      matchedField: "meaning", matchedFieldLabel: "Anlam", snippet: "…mide ile ilgili…", href: `/dashboard/biyoenerji/sembol-dili/${uid("e", i + 10)}`,
    }));
    const { page, ctx, calls, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/biyoenerji\/search/, (_r, url) => {
        const q = url.searchParams.get("q") ?? "";
        if (/zzyok/i.test(q)) return { status: 200, json: { ok: true, query: q, total: 0, sections: [] } };
        return { status: 200, json: { ok: true, query: q, total: 27, sections: [
          { key: "bilincalti-sebepleri", label: "Bilinçaltı Sebepleri", total: 1, hits: [{ section: "bilincalti-sebepleri", sectionLabel: "Bilinçaltı Sebepleri", id: uid("e", 1), title: "ZZ Mide Ağrısı", matchedField: "title", matchedFieldLabel: "Başlık", snippet: "", href: `/dashboard/biyoenerji/bilincalti-sebepleri/${uid("e", 1)}` }] },
          { key: "cakralar", label: "Çakralar", total: 1, hits: [{ section: "cakralar", sectionLabel: "Çakralar", id: uid("e", 2), title: "ZZ Solar Pleksus", matchedField: "organs", matchedFieldLabel: "Organlar", snippet: "…mide, karaciğer…", href: `/dashboard/biyoenerji/cakralar/${uid("e", 2)}` }] },
          { key: "sembol-dili", label: "Sembol Dili", total: 25, hits: many },
        ] } };
      }],
    ] });
    try {
      await page.goto(`${BASE}/dashboard/biyoenerji`, { waitUntil: "load" });
      const input = page.getByTestId("bio-global-search");
      await input.waitFor({ timeout: 15000 });
      const box = await input.boundingBox();
      const firstCard = await page.locator('a[href^="/dashboard/biyoenerji/"]').first().boundingBox();
      ok(g, "arama alanı ana ekranın üstünde (bölüm kartlarından önce)", Boolean(box && firstCard) && box.y < firstCard.y, JSON.stringify({ box, firstCard }));
      await input.fill("MİDE");
      await page.getByTestId("bio-global-results").waitFor({ timeout: 8000 });
      const req = calls.filter((c) => c.path === "/api/biyoenerji/search").pop();
      ok(g, "istek: yalnız q (tenant istemciden gitmez) + oturum başlıkları", req && new URL(BASE + req.path + req.search).searchParams.get("q") === "MİDE" && !/tenant/i.test(req.search) && req.headers["x-session-token"] === "zz-local-fake-token");
      const t = await page.getByTestId("bio-global-results").innerText();
      ok(g, "farklı alt bölümlerden sonuç + bölüm adları", /Bilinçaltı Sebepleri/.test(t) && /Çakralar/.test(t) && /Sembol Dili/.test(t) && /ZZ Mide Ağrısı/.test(t));
      ok(g, "çok sonuç: toplam ve bölüm sayımı", /27 sonuç/.test(t) && /3 bölüm/.test(t));
      ok(g, "eşleşen alan + önizleme", /Organlar:/.test(t) && /mide, karaciğer/.test(t));
      ok(g, "yatay taşma yok", await noHScroll(page));
      await input.fill("zzyok");
      await page.getByTestId("bio-global-empty").waitFor({ timeout: 8000 });
      ok(g, "0 sonuç mesajı", /sonuç bulunamadı/.test(await page.getByTestId("bio-global-empty").innerText()));
      await input.fill("m");
      await sleep(800);
      ok(g, "tek harf → arama yapılmaz, sonuç alanı temiz", (await page.getByTestId("bio-global-results").count()) === 0 && (await page.getByTestId("bio-global-empty").count()) === 0);
      await input.fill("mide");
      await page.getByTestId("bio-global-results").waitFor({ timeout: 8000 });
      await page.getByTestId("bio-global-hit").filter({ hasText: "ZZ Solar Pleksus" }).click();
      await page.waitForURL(/\/dashboard\/biyoenerji\/cakralar\//, { timeout: 8000 }).catch(() => {});
      ok(g, "sonuca dokununca ilgili kayda gider", page.url().includes(`/dashboard/biyoenerji/cakralar/${uid("e", 2)}`), page.url());
      ok(g, "JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
  // ?q= ile bölüm araması açılır (detay rotası olmayan bölüm)
  {
    const g = "E-bio-section-q";
    const { page, ctx, calls } = await newPage({ viewport: VIEWPORTS[0], routes: [] });
    try {
      await page.goto(`${BASE}/dashboard/biyoenerji/enerji-bedenleri?q=${encodeURIComponent("Eterik Beden")}`, { waitUntil: "load" });
      await sleep(2500);
      const listCall = calls.find((c) => c.path === "/api/biyoenerji/energy-bodies" && /search=/.test(c.search));
      ok(g, "Enerji Bedenleri ?q= ile aranarak açılır", Boolean(listCall) && /Eterik/.test(decodeURIComponent(listCall.search)), calls.map((c) => c.path + c.search).join(" | ").slice(0, 300));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── F) Doğaltaş Detay Arama "Kontrol edildi" ───────────────────────────────────────────────
const STONES = Array.from({ length: 6 }, (_, i) => ({
  id: uid("f", i + 1), tenant_id: TENANT, stone_name: `ZZ Taş ${i + 1}${i < 4 ? " Ametist" : ""}`,
  short_description: "Kalp çakrası için sentetik kayıt", chakras: ["Kalp"], images: [], updated_at: "2026-10-01T09:00:00.000Z",
}));
async function testChecked() {
  for (const vp of VIEWPORTS) {
    const g = `F-kontrol-edildi-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/dogaltas\/stones\?/, (_r, url) => {
        const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr-TR");
        const rows = STONES.filter((s) => !q || s.stone_name.toLocaleLowerCase("tr-TR").includes(q) || s.short_description.toLocaleLowerCase("tr-TR").includes(q));
        const mode = url.searchParams.get("mode") ?? "list";
        if (mode === "count") return { status: 200, json: { ok: true, count: rows.length } };
        return { status: 200, json: { ok: true, rows, count: rows.length } };
      }],
      ["POST", /^\/api\/dogaltas\/stones\/condition-search$/, (_r, _u, body) => {
        const chakra = (body?.conditions ?? []).find((c) => c.type === "chakra")?.value;
        const rows = chakra ? STONES.slice(0, 3) : [];
        return { status: 200, json: { ok: true, rows, total: rows.length, capped: false } };
      }],
      ["GET", /^\/api\/dogaltas\/stone-exclusions/, () => ({ status: 200, json: { ok: true, stoneIds: [] } })],
    ] });
    const cardOf = (name) => page.locator("a", { hasText: name }).first();
    const badgeCount = (name) => page.locator("a", { hasText: name }).first().getByTestId("search-checked-badge").count();
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi`, { waitUntil: "load" });
      const search = page.locator('input[type="search"], input[type="text"]').first();
      await search.waitFor({ timeout: 15000 });
      await search.fill("Ametist");
      await cardOf("ZZ Taş 1 Ametist").waitFor({ timeout: 10000 });
      await sleep(800);
      const orderBefore = await page.locator("h3").allInnerTexts();
      ok(g, "çok sonuç", (await page.locator("a", { hasText: "Ametist" }).count()) >= 4);
      ok(g, "başta hiçbirinde etiket yok", (await page.getByTestId("search-checked-badge").count()) === 0);
      for (const n of [1, 2]) {
        await cardOf(`ZZ Taş ${n} Ametist`).click();
        await page.waitForURL(/dogaltas-listesi\/f/, { timeout: 10000 }).catch(() => {});
        await sleep(600);
        await page.goBack();
        await cardOf("ZZ Taş 1 Ametist").waitFor({ timeout: 10000 });
        await sleep(900);
      }
      ok(g, "1. açıldı → 'Kontrol edildi'", (await badgeCount("ZZ Taş 1 Ametist")) === 1);
      ok(g, "2. açıldı → 'Kontrol edildi'", (await badgeCount("ZZ Taş 2 Ametist")) === 1);
      ok(g, "bakılmayan 3. sonuçta etiket yok", (await badgeCount("ZZ Taş 3 Ametist")) === 0);
      ok(g, "etiket metni", /Kontrol edildi/.test(await page.getByTestId("search-checked-badge").first().innerText()));
      const orderAfter = await page.locator("h3").allInnerTexts();
      ok(g, "sıralama/sonuç DEĞİŞMEDİ", JSON.stringify(orderBefore) === JSON.stringify(orderAfter));
      ok(g, "arama metni korundu", (await search.inputValue()) === "Ametist");
      // Yeni arama bağlamı → temiz
      await search.fill("ZZ Taş");
      await sleep(1500);
      ok(g, "yeni arama → işaretler sıfır (başka bağlam)", (await page.getByTestId("search-checked-badge").count()) === 0);
      await search.fill("Ametist");
      await sleep(1500);
      ok(g, "önceki aramaya dönünce işaretler geri gelir", (await page.getByTestId("search-checked-badge").count()) === 2);
      await search.fill("");
      await sleep(1500);
      ok(g, "arama temizlenince etiket gösterilmez", (await page.getByTestId("search-checked-badge").count()) === 0);
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", pageErrors.filter((e) => !/Failed to fetch|aborted/i.test(e)).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── G) Kombinasyon detay bilgi mimarisi ────────────────────────────────────────────────────
const ISSUE = "ZZ Uyku Sorunu";
const LONG_NOTE = "ZZ uzun not. ".repeat(80) + "Notta Ametist geçiyor.";
const COMBO_ROWS = [
  { id: uid("a", 1), tenant_id: TENANT, source_id: "s", issue: ISSUE, description: "ZZ amaç", variant_index: 1, source: "ZZ Kaynak Kitap",
    stones_text: "Ametist, Lepidolit, Eskitaş", notes_text: LONG_NOTE, notes_text_2: null, notes_text_3: null, created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z" },
  { id: uid("a", 2), tenant_id: TENANT, source_id: "s", issue: ISSUE, description: null, variant_index: 2, source: "ZZ Kaynak 2",
    stones_text: Array.from({ length: 18 }, (_, i) => `Taş${i + 1}`).join(", ") + ", Ametist", notes_text: "Kısa not", notes_text_2: null, notes_text_3: null, created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z" },
];
async function testCombo() {
  for (const vp of VIEWPORTS) {
    const g = `G-kombinasyon-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/dogaltas\/combinations/, () => ({ status: 200, json: { ok: true, rows: COMBO_ROWS } })],
      ["GET", /^\/api\/dogaltas\/inventory/, () => ({ status: 200, json: { ok: true, rows: [
        { name: "Ametist", adet: 3, unit_cost_try: 50 }, { name: "Taş1", adet: 10, unit_cost_try: 5 },
      ] } })],
      ["GET", /^\/api\/dogaltas\/stones\?/, () => ({ status: 200, json: { ok: true, rows: [
        ...["Ametist", "Lepidolit", ...Array.from({ length: 18 }, (_, i) => `Taş${i + 1}`)].map((n, i) => ({ id: uid("b", i + 1), tenant_id: TENANT, stone_name: n })),
      ] } })],
    ] });
    try {
      await page.goto(`${BASE}/dogaltas/kombinasyonlar/${encodeURIComponent(ISSUE)}`, { waitUntil: "load" });
      await page.getByTestId("combo-stone-legend").first().waitFor({ timeout: 15000 });
      const t = await bodyText(page);
      ok(g, "başlık: 'Bu Kombinasyon İçin Gereken Taşlar'", /Bu Kombinasyon İçin Gereken Taşlar/.test(t));
      // WT8 owner kararı: tek sade bölüm — stokta olan yeşil, olmayan nötr; "kayıtlı değil"/Eksik bölümü YOK.
      ok(g, "lejant yalnız yeşilin anlamı: Stokta var (WT8)", /Stokta var/.test(t) && !/Taş Listenizde kayıtlı değil/.test(t));
      ok(g, "stokta olan (✓) + stokta olmayan nötr; kayıtsız (⚠) ayrımı YOK (WT8)", (await page.getByTestId("combo-chip-in").count()) >= 2 && (await page.getByTestId("combo-chip-out").count()) >= 2 && (await page.getByTestId("combo-chip-ghost").count()) === 0);
      const struck = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).textDecorationLine.includes("line-through")).length);
      ok(g, "üstü çizili metin YOK", struck === 0, `struck=${struck}`);
      ok(g, "ayrı 'Eksik' bölümü YOK (WT8)", !/STOKTA OLMAYAN \(EKSİK\) TAŞLAR/.test(t) && !/stoğunuzda bulunmayan/.test(t));
      ok(g, "Kaynak / Notlar bölümleri ayrı", /ZZ Kaynak Kitap/.test(t) && /Notlar|NOTLAR/.test(t));
      ok(g, "uzun not + uzun taş listesi tam (veri kaybı yok)", t.includes("Notta Ametist geçiyor.") && /Taş18/.test(t) && /Eskitaş/.test(t));
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── H) Doğaltaş modalları: backdrop kapatır, içerik/scroll kapatmaz, Kapat kapatır ─────────
async function testDrawer() {
  for (const vp of VIEWPORTS) {
    const g = `H-tas-detay-drawer-${vp.tag}`;
    const rows = STONES.slice(0, 3).map((s) => ({ ...s, chakras: ["Kalp"], description: "ZZ uzun açıklama. ".repeat(120) }));
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["POST", /^\/api\/dogaltas\/stones\/condition-search$/, (_r, _u, body) => {
        const has = (body?.conditions ?? []).length > 0;
        return { status: 200, json: { ok: true, rows: has ? rows : [], total: has ? 3 : 0, capped: false,
          suggestions: { chakra: [{ name: "Kalp", count: 3 }], astrology: [], organ: [], stone_name: [], mineral: [] } } };
      }],
    ] });
    try {
      await page.goto(`${BASE}/dogaltas/kombinasyon-olustur`, { waitUntil: "load" });
      await sleep(2500);
      // Koşul: tür = Çakra, değer = Kalp → "Taşları Tara"
      const sel = page.locator("section select:visible").first();
      const chakraValue = await sel.evaluate((el) => [...el.options].find((o) => /Çakra/.test(o.text))?.value ?? "");
      await sel.selectOption(chakraValue);
      await page.locator('section input[type="text"]:visible').first().fill("Kalp");
      await page.keyboard.press("Escape"); // öneri listesi düğmeyi örtmesin
      const scan = page.locator("button:visible", { hasText: "Taşları Tara" });
      if (await scan.count()) await scan.first().click(); // webde arama koşul değişince otomatik çalışır
      await sleep(1500);
      const result = page.getByRole("button", { name: /ZZ Taş 1/ }).first();
      await result.waitFor({ timeout: 8000 });
      await result.click();
      const panel = page.getByTestId("stone-detail-drawer-panel");
      await panel.waitFor({ timeout: 5000 });
      const closeOnTop = await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="stone-detail-drawer-panel"] header button');
        if (!btn) return false;
        const r = btn.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === btn;
      });
      ok(g, "Kapat (×) düğmesi üst çubuk tarafından örtülmüyor", closeOnTop);
      // içerik + scroll → kapanmaz
      await panel.click({ position: { x: 20, y: 120 } });
      await panel.evaluate((el) => { const s = [...el.querySelectorAll("*")].find((n) => n.scrollHeight > n.clientHeight + 10); if (s) s.scrollTop = 400; });
      await page.mouse.wheel(0, 400);
      await sleep(400);
      ok(g, "içeriğe dokunma / kaydırma → AÇIK kalır", (await panel.count()) === 1);
      // backdrop: panel dışındaki alan
      const pb = await panel.boundingBox();
      const pt = vp.tag === "mobil" ? { x: 195, y: Math.max(10, (pb?.y ?? 100) / 2) } : { x: 40, y: 400 };
      ok(g, "mobilde üstte dokunulabilir karartılmış alan var", vp.tag !== "mobil" || (pb?.y ?? 0) >= 60, JSON.stringify(pb));
      await page.mouse.click(pt.x, pt.y);
      await sleep(500);
      ok(g, "backdrop'a dokunma → kapanır", (await panel.count()) === 0);
      // Kapat düğmesi
      await result.click();
      await panel.waitFor({ timeout: 5000 });
      await panel.getByRole("button", { name: /Kapat|Close/ }).first().click();
      await sleep(400);
      ok(g, "Kapat düğmesi → kapanır", (await panel.count()) === 0);
      ok(g, "sayfa durumu korunur (sonuçlar hâlâ listede)", (await result.count()) === 1);
      ok(g, "JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

const ALL = { testAromaNav, testOilTabs, testBlendCopy, testNaming, testBioSearch, testChecked, testCombo, testDrawer };
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(ALL);
try {
  for (const k of only) await ALL[k]();
} catch (e) {
  ok("runner", "beklenmeyen hata", false, e);
} finally {
  await browser?.close();
}
console.log(`\nWT5 UI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
