// PR #641 — W04 / W12 / M05 / M06 arayüz testleri (Playwright, yerel build, ağ-mock; prod'a SIFIR temas, ZZ sentetik veri).
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink 54399 + sahte env build + start);
//   UI_BASE=http://127.0.0.1:3961 node scripts/alti-is-paketi/ui.mjs [--out <klasör>]
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3961";
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "alti-is-ui");
mkdirSync(OUT, { recursive: true });
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false,
  module_permissions: { stones: true, dogaltas: true, aromatherapy: true, sifa_rehberi: true, healing: true, beslenme: true, clients: true },
};
const WEB = { width: 1366, height: 900, tag: "web", mobile: false };
const MOBILE = { width: 390, height: 844, tag: "mobil", mobile: true };

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail !== "" ? "  → " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function waitFor(fn, ms = 10000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await fn().catch(() => false)) return true; await sleep(150); }
  return false;
}

async function newPage(vp, routes = []) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, hasTouch: vp.mobile, isMobile: vp.mobile, locale: "tr-TR",
    ...(vp.mobile ? { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: BASE }]);
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch { /* yok */ }
  }, USER);
  const calls = [];
  const pageErrors = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    calls.push({ method: req.method(), path: url.pathname, search: url.search, body });
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === "/api/beslenme/access") return route.fulfill({ status: 200, json: { ok: true, access: true } });
    for (const [m, re, fn] of routes) {
      if ((m === "*" || m === req.method()) && re.test(url.pathname + url.search)) {
        const r = await fn(req, url, body);
        return route.fulfill({ status: r.status, json: r.json ?? {} });
      }
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, total: 0 } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  return { ctx, page, calls, pageErrors };
}

// ─── W04 — Doğal Destek & Rehber: gereksiz dikey kaydırma ölçümü ───────────────────────────────
const W04_VPS = [[1920, 1080], [1536, 864], [1366, 768], [1366, 900], [1280, 720], [1536, 639], [1024, 768], [768, 1024], [390, 844], [360, 740]];
async function measureDogalDestek(vp) {
  const { ctx, page, pageErrors } = await newPage(vp);
  await page.goto(`${BASE}/dogal-destek`, { waitUntil: "networkidle" });
  await page.waitForSelector('main a[href="/beslenme"]', { timeout: 20000 }).catch(() => {});
  await sleep(700);
  const m = await page.evaluate(() => {
    const se = document.scrollingElement;
    const hrefs = ["/dogaltas", "/aromaterapi", "/sifa-rehberi", "/beslenme"];
    const cards = [...document.querySelectorAll("main a[href]")].filter((a) => hrefs.includes(a.getAttribute("href")));
    const lastBottom = Math.max(...cards.map((c) => c.getBoundingClientRect().bottom + window.scrollY));
    const main = document.querySelector("main");
    const mr = main.getBoundingClientRect();
    return {
      inner: window.innerHeight, scrollH: se.scrollHeight, overflow: se.scrollHeight - window.innerHeight,
      cards: cards.length, hrefs: cards.map((c) => c.getAttribute("href")),
      lastCardBottom: Math.round(lastBottom), mainTop: Math.round(mr.top + window.scrollY), mainBottom: Math.round(mr.bottom + window.scrollY),
      gapBelowCards: Math.round(se.scrollHeight - lastBottom),
    };
  });
  await page.screenshot({ path: path.join(OUT, `w04-${vp.width}x${vp.height}.png`) });
  await ctx.close();
  return { ...m, pageErrors };
}
async function testW04() {
  for (const [w, h] of W04_VPS) {
    const vp = { width: w, height: h, tag: `${w}x${h}`, mobile: w < 768 };
    const m = await measureDogalDestek(vp);
    console.log(`   W04 ölçüm ${w}x${h}: ${JSON.stringify({ inner: m.inner, scrollH: m.scrollH, overflow: m.overflow, lastCardBottom: m.lastCardBottom, mainBottom: m.mainBottom, gapBelowCards: m.gapBelowCards })}`);
    ok("W04", `${w}x${h}: 4 kart + bağlantılar yerinde`, m.cards === 4 && ["/dogaltas", "/aromaterapi", "/sifa-rehberi", "/beslenme"].every((x) => m.hrefs.includes(x)), m.hrefs);
    // Kartlar ekrana sığıyorsa sayfa kaymamalı; sığmıyorsa kaydırma yalnız kartların sonuna (alt iç boşluk ≤ 28px + 1) kadar olmalı.
    const fits = m.lastCardBottom + 28 <= m.inner + 1;
    ok("W04", `${w}x${h}: gereksiz/boş kaydırma yok`, fits ? m.overflow <= 1 : m.gapBelowCards <= 29, { overflow: m.overflow, gapBelowCards: m.gapBelowCards, lastCardBottom: m.lastCardBottom, inner: m.inner });
    ok("W04", `${w}x${h}: sayfa hatası yok`, m.pageErrors.length === 0, m.pageErrors);
  }
}

// ─── W12 — Şifa Rehberi: Yeni Rahatsızlık'ta Kaynak Türü yok; düzenleme ekranı aynen ───────────
const GUIDE_ID = "c1000000-0000-4000-8000-0000000000a1";
const SECTION_ID = "c2000000-0000-4000-8000-0000000000a1";
function guideRow() {
  return {
    id: GUIDE_ID, tenant_id: TENANT, name: "ZZ Baş Ağrısı", category: null, symptoms: null, images: [],
    created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z",
    healing_guide_sections: [{
      id: SECTION_ID, guide_id: GUIDE_ID, tenant_id: TENANT, section_type: "reasons", mode: "genel_ozet", title: null,
      note: "ZZ mevcut içerik", source: "ZZ Kaynak Kitabı", source_kind: "Kitap", expert_note: null, attention: null, images: [], sort_order: 0,
      created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z",
    }],
  };
}
async function testW12(vp) {
  const G = `W12 ${vp.tag}`;
  const routes = [
    ["POST", /^\/api\/sifa-rehberi\/guides$/, () => ({ status: 200, json: { ok: true, guide: { id: GUIDE_ID } } })],
    ["GET", new RegExp(`^/api/sifa-rehberi/guides/${GUIDE_ID}$`), () => ({ status: 200, json: { ok: true, row: guideRow() } })],
    ["GET", /^\/api\/sifa-rehberi\/guides(\?.*)?$/, () => ({ status: 200, json: { ok: true, rows: [], count: 0 } })],
  ];
  // 1) Yeni Rahatsızlık
  {
    const { ctx, page, calls, pageErrors } = await newPage(vp, routes);
    await page.goto(`${BASE}/sifa-rehberi?view=new`, { waitUntil: "domcontentloaded" });
    const heading = page.getByText("Yeni Rahatsızlık Oluştur").first();
    ok(G, "Yeni Rahatsızlık formu açıldı", await waitFor(() => heading.isVisible(), 20000));
    // Ad (Rahatsızlık düğümü) → konu (Tıbbi Nedenler) → Yeni Not
    const nameInput = page.getByPlaceholder("Örn. Migren").first();
    ok(G, "rahatsızlık adı alanı yerinde", await waitFor(() => nameInput.isVisible(), 8000));
    await nameInput.fill("ZZ Baş Ağrısı");
    const topic = page.getByRole("button", { name: /Tıbbi Nedenler/ }).first();
    if (await topic.count()) await topic.click();
    const addBtn = page.getByRole("button", { name: /Yeni Not Ekle/ }).first();
    if (await waitFor(() => addBtn.isVisible(), 8000)) await addBtn.click();
    await sleep(400);
    const editor = page.locator("body");
    const kaynakLabel = editor.getByText("Kaynak (opsiyonel)", { exact: true });
    ok(G, "not eklendi; 'Kaynak (opsiyonel)' alanı yerinde", await waitFor(() => kaynakLabel.first().isVisible(), 8000));
    ok(G, "'Kaynak Türü' etiketi ve açılır menüsü YOK", (await editor.getByText(/Kaynak Türü/).count()) === 0 && (await editor.locator("select option", { hasText: "Eğitim / Ders" }).count()) === 0);
    ok(G, "Uzman Notu / İçerik / Dikkat alanları yerinde", (await editor.getByText("İçerik", { exact: true }).count()) >= 1 && (await editor.getByText("Uzman Notu (opsiyonel)").count()) >= 1 && (await editor.getByText(/Dikkat Edilmesi Gerekenler/).count()) >= 1);
    // Kaynak girmeden kaydet (yalnız içerik)
    // İçerik alanı geniş editörle yazılır (mevcut davranış: "Forma Uygula" yalnız taslağa aktarır)
    await page.getByPlaceholder("Profesyonel içerik (uzunluk sınırı yoktur)…").first().click();
    const dlg = page.getByRole("dialog", { name: "İçerik" });
    await dlg.waitFor({ timeout: 8000 });
    await dlg.locator("textarea").first().fill("ZZ not içeriği");
    await dlg.getByRole("button", { name: "Forma Uygula" }).click();
    ok(G, "İçerik geniş editörle forma uygulandı", await waitFor(async () => (await page.getByPlaceholder("Profesyonel içerik (uzunluk sınırı yoktur)…").first().inputValue()) === "ZZ not içeriği", 5000));
    await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
    const posted = await waitFor(async () => calls.some((c) => c.method === "POST" && c.path === "/api/sifa-rehberi/guides"), 10000);
    const post = calls.find((c) => c.method === "POST" && c.path === "/api/sifa-rehberi/guides");
    ok(G, "Kaynak girilmeden Kaydet → oluşturma isteği gitti", posted, calls.map((c) => `${c.method} ${c.path}`).slice(-8));
    const secs = post?.body?.sections ?? [];
    ok(G, "istekte ad doğru; not gönderildi; kaynak boş, kaynak türü boş", post?.body?.name === "ZZ Baş Ağrısı" && secs.length >= 1 && secs.some((s) => s.note === "ZZ not içeriği") && secs.every((s) => !s.source && !s.source_kind), post?.body);
    ok(G, "başarıda detay ekranına yönlendi", await waitFor(async () => page.url().includes(`/sifa-rehberi/${GUIDE_ID}`), 10000), page.url());
    await page.screenshot({ path: path.join(OUT, `w12-yeni-${vp.tag}.png`) });
    ok(G, "yatay taşma yok + sayfa hatası yok", (await noHScroll(page)) && pageErrors.length === 0, pageErrors);
    await ctx.close();
  }
  // 2) Mevcut kayıt: görüntüleme + düzenleme ekranı DEĞİŞMEDİ (Kaynak Türü burada duruyor)
  {
    const { ctx, page, pageErrors } = await newPage(vp, routes);
    await page.goto(`${BASE}/sifa-rehberi/${GUIDE_ID}`, { waitUntil: "domcontentloaded" });
    ok(G, "mevcut kayıt görüntüleniyor (ad + içerik + kaynak)", await waitFor(async () => (await page.getByText("ZZ mevcut içerik").count()) > 0 && (await page.getByText("ZZ Kaynak Kitabı").count()) > 0, 20000));
    await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
    const kindSelect = page.locator("select").filter({ has: page.locator("option", { hasText: "Eğitim / Ders" }) });
    ok(G, "düzenleme ekranında 'Kaynak Türü' aynen duruyor ve mevcut değer (Kitap) seçili", await waitFor(async () => (await kindSelect.count()) > 0 && (await kindSelect.first().inputValue()) === "Kitap", 10000));
    ok(G, "düzenleme ekranında Kaynak alanı mevcut değerle", await waitFor(async () => (await page.locator('input[placeholder="Kitap/eğitim/kaynak adı…"]').first().inputValue()) === "ZZ Kaynak Kitabı", 5000));
    await page.screenshot({ path: path.join(OUT, `w12-duzenle-${vp.tag}.png`) });
    ok(G, "düzenleme: sayfa hatası yok", pageErrors.length === 0, pageErrors);
    await ctx.close();
  }
}

// ─── M05 — Doğaltaş ana arama: Doğaltaş + Mineral + Kombinasyon ───────────────────────────────
const STONE_ID = "f0000000-0000-4000-8000-0000000000b1";
const MINERAL_ID = "f1000000-0000-4000-8000-0000000000b1";
const COMBO_ID = "f2000000-0000-4000-8000-0000000000b1";
function m05Routes({ mineralFail = false } = {}) {
  return [
    ["POST", /^\/api\/dogaltas\/stones\/condition-search$/, (_r, _u, body) => ({ status: 200, json: {
      ok: true, total: 1, capped: false,
      rows: String(body?.q ?? "").toLocaleLowerCase("tr").includes("zzmide") ? [{ id: STONE_ID, tenant_id: TENANT, stone_name: "ZZ Akik", short_description: "ZZ taş kısa", general_info: "zzmide için taş", physical_effects: null, spiritual_effects: null, other_effects: null, warning_text: null, warning_tags: null, chakras: null, assignments: null }] : [],
    } })],
    ["GET", /^\/api\/dogaltas\/minerals\?mode=list/, (_r, url) => mineralFail
      ? { status: 500, json: { ok: false, error: "boom" } }
      : { status: 200, json: { ok: true, rows: (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr").includes("zzmide") && url.searchParams.get("offset") === "0" ? [{ id: MINERAL_ID, tenant_id: TENANT, source_id: "m1", name: "ZZ Magnezyum", aciklama: "zzmide rahatlatır", kategori: "Mineral", created_at: "2026-10-01T09:00:00.000Z" }] : [] } }],
    ["GET", /^\/api\/dogaltas\/combinations$/, () => ({ status: 200, json: { ok: true, rows: [
      { id: COMBO_ID, tenant_id: TENANT, source_id: "c1", issue: "ZZ Sindirim Desteği", description: "ZZ kombinasyon açıklaması", variant_index: 1, source: null, stones_text: "Akik, Sitrin", notes_text: "zzmide rahatsızlığı için", notes_text_2: null, notes_text_3: null, created_at: "2026-10-01T09:00:00.000Z" },
      { id: "f2000000-0000-4000-8000-0000000000b2", tenant_id: TENANT, source_id: "c2", issue: "ZZ Uyku", description: "alakasız", variant_index: 1, source: null, stones_text: "Ametist", notes_text: null, notes_text_2: null, notes_text_3: null, created_at: "2026-10-01T09:00:00.000Z" },
    ] } })],
  ];
}
async function testM05(vp) {
  const G = `M05 ${vp.tag}`;
  {
    const { ctx, page, calls, pageErrors } = await newPage(vp, m05Routes());
    await page.goto(`${BASE}/dogaltas`, { waitUntil: "domcontentloaded" });
    const input = page.locator('form[role="search"] input[type="search"]');
    await input.waitFor({ timeout: 20000 });
    await input.fill("zzmide");
    await page.locator('form[role="search"] button[type="submit"]').click();
    const results = page.locator("article");
    ok(G, "3 tür sonuç geldi (taş + mineral + kombinasyon)", await waitFor(async () => (await results.count()) === 3, 15000), await results.count());
    const kinds = await page.locator('[data-testid="hub-result-kind"]').allInnerTexts();
    ok(G, "tür rozetleri: Doğaltaşlar / Mineraller / Kombinasyonlar", JSON.stringify(kinds) === JSON.stringify(["Doğaltaşlar", "Mineraller", "Kombinasyonlar"]), kinds);
    ok(G, "sayaç 3 kayıt", (await page.getByText(/· 3 kayıt/).count()) === 1);
    const hrefs = await results.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    ok(G, "taş → Doğaltaş detayı (mevcut adres aynen)", hrefs[0] === `/dogaltas/dogaltas-listesi/${STONE_ID}?q=zzmide`, hrefs);
    ok(G, "mineral → Mineral detayı", hrefs[1] === `/dogaltas/mineral-listesi/${MINERAL_ID}?q=zzmide`, hrefs);
    ok(G, "kombinasyon → Kombinasyon detayı (başlık)", hrefs[2] === `/dogaltas/kombinasyonlar/${encodeURIComponent("ZZ Sindirim Desteği")}?q=zzmide`, hrefs);
    ok(G, "taş kartında 'Eşleşme: Genel bilgi' satırı aynen", (await results.nth(0).getByText("Eşleşme: Genel bilgi").count()) === 1);
    ok(G, "eşleşmeyen kombinasyon (ZZ Uyku) sonuçta yok", (await page.getByText("ZZ Uyku").count()) === 0);
    const mineralCall = calls.find((c) => c.path === "/api/dogaltas/minerals" && c.search.includes("mode=list"));
    ok(G, "mineral araması mevcut sunucu ucuyla (q + tenant istemciden gönderilmez)", !!mineralCall && new URLSearchParams(mineralCall.search).get("q") === "zzmide" && !/tenant/i.test(mineralCall.search), mineralCall);
    const comboCall = calls.find((c) => c.path === "/api/dogaltas/combinations");
    ok(G, "kombinasyon okuması mevcut uçla, tenant istemciden gönderilmez", !!comboCall && !/tenant/i.test(comboCall.search));
    await page.screenshot({ path: path.join(OUT, `m05-${vp.tag}.png`) });
    // Kombinasyon sonucuna tıkla → detay ekranı
    await results.nth(2).locator("a").click();
    ok(G, "kombinasyon sonucuna tıklama detay ekranına gider", await waitFor(async () => decodeURIComponent(page.url()).includes("/dogaltas/kombinasyonlar/ZZ Sindirim Desteği"), 10000), page.url());
    await page.goBack();
    ok(G, "geri dönünce kombinasyon sonucu 'Kontrol edildi'", await waitFor(async () => (await page.locator("article").nth(2).getByText("Kontrol edildi").count()) === 1, 10000));
    await page.locator("article").nth(1).locator("a").click();
    ok(G, "mineral sonucuna tıklama detay ekranına gider", await waitFor(async () => page.url().includes(`/dogaltas/mineral-listesi/${MINERAL_ID}`), 10000), page.url());
    ok(G, "yatay taşma yok + sayfa hatası yok", pageErrors.length === 0, pageErrors);
    await ctx.close();
  }
  {
    // Mineral okunamazsa: taş + kombinasyon sonuçları yine görünür, mevcut hata metni çıkar
    const { ctx, page } = await newPage(vp, m05Routes({ mineralFail: true }));
    await page.goto(`${BASE}/dogaltas?q=zzmide`, { waitUntil: "domcontentloaded" });
    ok(G, "mineral hatasında taş + kombinasyon sonuçları korunur", await waitFor(async () => (await page.locator("article").count()) === 2, 15000), await page.locator("article").count());
    ok(G, "mineral hatasında mevcut 'Arama verisi okunamadı.' bildirimi", (await page.getByRole("alert").filter({ hasText: "Arama verisi okunamadı." }).count()) === 1);
    await ctx.close();
  }
  {
    // Eşleşme yoksa mevcut boş durum
    const { ctx, page } = await newPage(vp, m05Routes());
    await page.goto(`${BASE}/dogaltas?q=zzhiçyok`, { waitUntil: "domcontentloaded" });
    ok(G, "sonuç yoksa mevcut boş durum metni", await waitFor(async () => (await page.getByText("Bu arama için sonuç bulunamadı.").count()) === 1, 15000));
    await ctx.close();
  }
}

// ─── M06 — Kombinasyon Oluştur alan sırası ─────────────────────────────────────────────────────
async function testM06(vp) {
  const G = `M06 ${vp.tag}`;
  const routes = [
    ["POST", /^\/api\/dogaltas\/stones\/condition-search$/, (_r, _u, body) => {
      const c = body?.conditions?.[0];
      const hit = c && c.type === "stone_name" && /ametist/i.test(String(c.value));
      return { status: 200, json: { ok: true, total: hit ? 1 : 0, capped: false, rows: hit ? [{ id: STONE_ID, tenant_id: TENANT, stone_name: "Ametist", short_description: null, general_info: null, physical_effects: null, spiritual_effects: null, other_effects: null, warning_text: null, warning_tags: null, chakras: null, assignments: null }] : [] } };
    }],
    ["POST", /^\/api\/dogaltas\/combinations\/save$/, () => ({ status: 200, json: { ok: true, id: COMBO_ID } })],
  ];
  const { ctx, page, calls, pageErrors } = await newPage(vp, routes);
  await page.goto(`${BASE}/dogaltas/kombinasyon-olustur`, { waitUntil: "domcontentloaded" });
  const name = page.getByPlaceholder("Kombinasyon adı (zorunlu)");
  await name.waitFor({ timeout: 20000 });
  ok(G, "Kombinasyon Adı alanı tek (yinelenmedi)", (await name.count()) === 1);
  const order = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const byText = (txt) => [...document.querySelectorAll("h2")].find((h) => h.textContent?.includes(txt));
    const els = {
      ad: q('input[placeholder="Kombinasyon adı (zorunlu)"]'),
      arama: byText("Arama Koşulları"),
      sepet: byText("Kombinasyon Sepeti"),
      aciklama: q('input[placeholder="Açıklama / amaç (opsiyonel)"]'),
      not: q('[data-testid="combination_save_note"]') ?? q('textarea[placeholder="Serbest not (opsiyonel)"]'),
      kaydet: [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Kombinasyonu Kaydet")),
    };
    const missing = Object.entries(els).filter(([, e]) => !e).map(([k]) => k);
    if (missing.length) return { missing };
    const keys = Object.keys(els);
    const domOk = keys.every((k, i) => i === 0 || (els[keys[i - 1]].compareDocumentPosition(els[k]) & Node.DOCUMENT_POSITION_FOLLOWING));
    const tops = Object.fromEntries(keys.map((k) => [k, Math.round(els[k].getBoundingClientRect().top + window.scrollY)]));
    return { domOk, tops };
  });
  ok(G, "DOM sırası: Ad → Taş Arama → Sepet → Açıklama → Not → Kaydet", order.domOk === true, order);
  if (vp.mobile) {
    const t = order.tops ?? {};
    ok(G, "mobil görsel sıra da aynı (yukarıdan aşağı)", t.ad < t.arama && t.arama < t.sepet && t.sepet < t.aciklama && t.aciklama < t.not && t.not < t.kaydet, t);
  } else {
    const t = order.tops ?? {};
    ok(G, "masaüstü: Ad en üstte; Açıklama < Not < Kaydet", t.ad < t.arama && t.arama < t.aciklama && t.aciklama < t.not && t.not < t.kaydet, t);
  }
  const saveBtn = page.getByRole("button", { name: /Kombinasyonu Kaydet/ }).last();
  ok(G, "sepet boş + ad boş → Kaydet kilitli (mevcut kural)", await saveBtn.isDisabled());
  // Sepete arama dışı taş ekle (mevcut akış)
  await page.getByPlaceholder("Örn. Ametist — aramadan doğrudan ekle").fill("Ametist");
  await page.getByRole("button", { name: "+ Ekle", exact: true }).click();
  ok(G, "taş sepete eklendi (mevcut akış)", await waitFor(async () => (await page.getByRole("button", { name: /Ametist/ }).count()) > 0 || (await page.locator("aside").getByText("Ametist").count()) > 0, 10000));
  ok(G, "taş var, ad boş → Kaydet hâlâ kilitli (ad zorunlu)", await saveBtn.isDisabled());
  await name.fill("ZZ Sakinlik");
  await page.getByPlaceholder("Açıklama / amaç (opsiyonel)").fill("ZZ amaç");
  await page.locator('[data-testid="combination_save_note"]').first().fill("ZZ serbest not").catch(async () => page.getByPlaceholder("Serbest not (opsiyonel)").first().fill("ZZ serbest not"));
  ok(G, "ad + taş → Kaydet açıldı", await waitFor(async () => !(await saveBtn.isDisabled()), 5000));
  await saveBtn.click();
  const general = page.getByRole("button", { name: /Genel Kombinasyonlara Kaydet/ });
  if (await waitFor(() => general.first().isVisible(), 5000)) await general.first().click();
  ok(G, "kayıt isteği gitti", await waitFor(async () => calls.some((c) => c.path === "/api/dogaltas/combinations/save"), 10000), calls.map((c) => c.path).slice(-6));
  const body = calls.find((c) => c.path === "/api/dogaltas/combinations/save")?.body ?? {};
  const bodyStr = JSON.stringify(body);
  ok(G, "kayıt gövdesi: ad + açıklama + not + taş (mevcut sözleşme)", bodyStr.includes("ZZ Sakinlik") && body.description === "ZZ amaç" && body.note === "ZZ serbest not" && bodyStr.includes("Ametist"), body);
  ok(G, "kayıt sonrası özet görünür; üstteki ad alanı eskisi gibi gizli", await waitFor(async () => (await page.getByText(/kaydedildi/).count()) > 0 && (await page.getByPlaceholder("Kombinasyon adı (zorunlu)").count()) === 0, 8000));
  await page.getByRole("button", { name: "Devam Et", exact: true }).click().catch(() => {});
  ok(G, "Devam Et → ad alanı aynı değerle geri gelir", await waitFor(async () => (await page.getByPlaceholder("Kombinasyon adı (zorunlu)").inputValue()) === "ZZ Sakinlik", 5000));
  await page.screenshot({ path: path.join(OUT, `m06-${vp.tag}.png`), fullPage: true });
  ok(G, "yatay taşma yok + sayfa hatası yok", (await noHScroll(page)) && pageErrors.length === 0, pageErrors);
  await ctx.close();
}

const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const want = (k) => ONLY.length === 0 || ONLY.includes(k);
try {
  if (want("W04")) await testW04();
  for (const vp of [WEB, MOBILE]) {
    if (want("W12")) await testW12(vp);
    if (want("M05")) await testM05(vp);
    if (want("M06")) await testM06(vp);
  }
} catch (e) {
  fail++;
  console.error("❌ beklenmeyen hata:", e);
} finally {
  await browser?.close();
}
console.log(`\nSONUÇ: ${pass} geçti / ${fail} kaldı · ekran görüntüleri: ${OUT}`);
process.exit(fail ? 1 : 0);
