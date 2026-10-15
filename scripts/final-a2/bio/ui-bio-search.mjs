// FINAL-A2 — Biyoenerji genel arama: Enerji Bedenleri + Seanslar vurgu/kaydırma ve uygulama-içi
// çıkış sorusu (Playwright, yerel build, ağ-mock). Prod'a / dış ağa temas YOK: /api/* istekleri
// sentetik ZZ verisiyle karşılanır; 127.0.0.1 dışı her istek abort edilir (scripts/wt8/ui-wt8.mjs deseni).
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink + sahte env build + start);
//   UI_BASE=http://127.0.0.1:3911 node scripts/final-a2/bio/ui-bio-search.mjs
//   (ONLY=testListHighlight,testExitGuard ile alt küme)
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
    const entry = { method: req.method(), path: url.pathname, search: url.search, body };
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

const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));
const highlightCount = (page) => page.evaluate(() => globalThis.CSS?.highlights?.get("yasam-search-hit")?.size ?? 0);
/** İlk vurgu aralığı görünür alanda mı (ilk eşleşmeye kaydırma kanıtı) + metni. */
const firstHighlightInView = (page) => page.evaluate(() => {
  const h = globalThis.CSS?.highlights?.get("yasam-search-hit");
  if (!h) return { inView: false, text: "", top: null };
  const ranges = [...h].filter((r) => { const b = r.getBoundingClientRect(); return b.width > 0 || b.height > 0; });
  ranges.sort((a, b) => (a.compareBoundaryPoints(Range.START_TO_START, b)));
  const r = ranges[0];
  if (!r) return { inView: false, text: "", top: null };
  const b = r.getBoundingClientRect();
  return { inView: b.top >= 0 && b.bottom <= window.innerHeight, text: r.toString(), top: Math.round(b.top) };
});

// ── Sentetik veri ──────────────────────────────────────────────────────────────────────────
const EB_ID = uid("e", 41);
const EB_OTHER = uid("e", 42);
const SE_ID = uid("5", 51);
const SE_OTHER = uid("5", 52);
const LONG = "ZZ uzun açıklama metni enerji katmanını anlatır. ".repeat(60);
const EB_ROWS = [
  { id: EB_OTHER, tenant_id: TENANT, source_uid: "ZZ Astral Beden", genel_tanim: "ZZ başka kayıt", gorevi: "", bozulma: "", onerilen_taslar: "", not_text: "", created_at: "2026-10-01T09:00:00.000Z" },
  { id: EB_ID, tenant_id: TENANT, source_uid: "ZZ Eterik Beden", genel_tanim: LONG, gorevi: LONG, bozulma: "Mide bölgesinde düğüm; MİDE ekşimesi ve mide kasılması.", onerilen_taslar: "ZZ taş", not_text: "", created_at: "2026-10-02T09:00:00.000Z" },
];
const SE_ROWS = [
  { id: SE_OTHER, tenant_id: TENANT, title: "ZZ Seans Diğer", category: "ZZ", content: "ZZ başka", source: "", note: "", created_at: "2026-10-01T09:00:00.000Z" },
  { id: SE_ID, tenant_id: TENANT, title: "ZZ Seans Mide", category: "ZZ", content: `${LONG}\nSeans sonunda mide gevşedi; MİDE rahatladı.`, source: "", note: "Not: mide takibi.", created_at: "2026-10-02T09:00:00.000Z" },
];
const hitOf = (section, sectionLabel, id, title, field, label) => ({
  section, sectionLabel, id, title, matchedField: field, matchedFieldLabel: label, snippet: "…mide…",
  href: `/dashboard/biyoenerji/${section}?q=${encodeURIComponent(title)}`,
});
const SEARCH_SECTIONS = [
  { key: "enerji-bedenleri", label: "Enerji Bedenleri", total: 1, hits: [hitOf("enerji-bedenleri", "Enerji Bedenleri", EB_ID, "ZZ Eterik Beden", "bozulma", "Bozulma")] },
  { key: "seanslar", label: "Biyoenerji Seansları", total: 1, hits: [hitOf("seanslar", "Biyoenerji Seansları", SE_ID, "ZZ Seans Mide", "content", "İçerik")] },
  { key: "sembol-dili", label: "Sembol Dili", total: 1, hits: [{ section: "sembol-dili", sectionLabel: "Sembol Dili", id: uid("e", 9), title: "ZZ Sembol", matchedField: "meaning", matchedFieldLabel: "Anlam", snippet: "…mide…", href: `/dashboard/biyoenerji/sembol-dili/${uid("e", 9)}` }] },
];

/** Bölüm listesi mock'u: count / lastCreated / distinct / liste (search süzgeci başlık+alanlarda). */
function listRoute(rows, titleKey) {
  return (_r, url) => {
    const sp = url.searchParams;
    const search = (sp.get("search") ?? "").toLocaleLowerCase("tr-TR");
    const filtered = search ? rows.filter((r) => Object.values(r).some((v) => typeof v === "string" && v.toLocaleLowerCase("tr-TR").includes(search))) : rows;
    if (sp.get("count")) return { status: 200, json: { ok: true, count: filtered.length } };
    if (sp.get("lastCreated")) return { status: 200, json: { ok: true, lastCreatedAt: rows[rows.length - 1].created_at } };
    if (sp.get("distinct")) return { status: 200, json: { ok: true, categories: ["ZZ"] } };
    void titleKey;
    return { status: 200, json: { ok: true, rows: filtered } };
  };
}

function baseRoutes() {
  return [
    ["GET", /^\/api\/biyoenerji\/search/, (_r, url) => ({ status: 200, json: { ok: true, query: url.searchParams.get("q") ?? "", total: 3, sections: SEARCH_SECTIONS } })],
    ["GET", /^\/api\/biyoenerji\/energy-bodies(\?|$)/, listRoute(EB_ROWS, "source_uid")],
    ["GET", /^\/api\/biyoenerji\/sessions(\?|$)/, listRoute(SE_ROWS, "title")],
  ];
}

async function openSearch(page, term = "mide") {
  await page.goto(`${BASE}/dashboard/biyoenerji`, { waitUntil: "load" });
  const input = page.getByTestId("bio-global-search");
  await input.waitFor({ timeout: 20000 });
  await input.fill(term);
  await page.getByTestId("bio-global-results").waitFor({ timeout: 10000 });
  await sleep(400);
  return input;
}
const exitDialog = (page) => page.getByTestId("bio-search-exit-dialog");

// ── A) Enerji Bedenleri + Seanslar: terim sarı + ilk eşleşmeye kaydırma; geri → ek soru YOK ──
async function testListHighlight() {
  const cases = [
    { key: "enerji-bedenleri", title: "ZZ Eterik Beden", id: EB_ID, api: "/api/biyoenerji/energy-bodies", minHits: 3 },
    { key: "seanslar", title: "ZZ Seans Mide", id: SE_ID, api: "/api/biyoenerji/sessions", minHits: 3 },
  ];
  for (const vp of VIEWPORTS) {
    for (const c of cases) {
      const g = `A-${c.key}-${vp.tag}`;
      const { page, ctx, calls, pageErrors } = await newPage({ viewport: vp, routes: baseRoutes() });
      try {
        const input = await openSearch(page);
        const link = page.getByTestId("bio-global-hit").filter({ hasText: c.title }).first();
        const href = await link.getAttribute("href");
        const u = new URL(href, BASE);
        ok(g, "sonuç bağlantısı: q=<kayıt adı> + hq=<terim> + rid", u.pathname === `/dashboard/biyoenerji/${c.key}` && u.searchParams.get("q") === c.title && u.searchParams.get("hq") === "mide" && u.searchParams.get("rid") === c.id, href);
        await link.click();
        await page.waitForURL(new RegExp(`/${c.key}\\?`), { timeout: 15000 });
        await page.getByTestId("bio-search-context").waitFor({ timeout: 15000 });
        await sleep(1500);
        ok(g, "kayıt otomatik seçildi (SEÇİLİ KAYIT = aranan kayıt)", (await page.getByText("SEÇİLİ KAYIT").count()) > 0 && (await page.locator("h3").filter({ hasText: c.title }).count()) > 0);
        const hc = await highlightCount(page);
        ok(g, `terimin TÜM geçişleri sarı (>= ${c.minHits})`, hc >= c.minHits, `count=${hc}`);
        const cnt = await page.getByTestId("bio-search-match-count").innerText().catch(() => "");
        ok(g, "eşleşme sayısı gösterilir", /\d+ eşleşme/.test(cnt), cnt);
        const first = await firstHighlightInView(page);
        ok(g, "ilk eşleşme görünür alana kaydırıldı", first.inView && /mide/i.test(first.text), JSON.stringify(first));
        const listInput = page.locator('input[type="search"]').first();
        ok(g, "bölüm liste süzgeci (?q=kayıt adı) çalışmaya devam ediyor", (await listInput.inputValue()) === c.title, await listInput.inputValue());
        const apiCalls = calls.filter((x) => x.path === c.api);
        ok(g, "liste API'sine hq/rid GİTMEZ (yalnız istemci vurgusu)", apiCalls.length > 0 && apiCalls.every((x) => !/[?&](hq|rid)=/.test(x.search)));
        ok(g, "liste API süzgeci kayıt adıyla", apiCalls.some((x) => new URLSearchParams(x.search).get("search") === c.title), apiCalls.map((x) => x.search).join(" | "));
        // GERİ → aynı arama, ek soru YOK
        await page.goBack();
        await page.getByTestId("bio-global-results").waitFor({ timeout: 10000 });
        await sleep(800);
        ok(g, "sonuç → geri: aynı arama sonuçları, çıkış sorusu YOK", (await input.inputValue()) === "mide" && (await exitDialog(page).count()) === 0);
        ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
      } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
    }
  }
}

// ── B/C) Uygulama içi bağlantı ile çıkış sorusu; geri sorusu; aynı bağlamda gereksiz soru yok ──
async function testExitGuard() {
  for (const vp of VIEWPORTS) {
    const g = `B-cikis-${vp.tag}`;
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: baseRoutes() });
    try {
      const input = await openSearch(page);
      const urlWithQ = page.url();
      // C: sorgu değiştirme → soru yok
      await input.fill("kalp");
      await sleep(900);
      ok(g, "sorgu değiştirme → soru YOK", (await exitDialog(page).count()) === 0);
      await input.fill("mide");
      await sleep(900);
      // B: bölüm kartı (menü) bağlantısı → soru
      const card = page.locator('a[href="/dashboard/biyoenerji/sembol-dili"]').first();
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await exitDialog(page).waitFor({ timeout: 6000 });
      ok(g, "bölüm kartına dokunma → 'Arama sonuçlarından çıkmak istiyor musunuz?'", /çıkmak istiyor musunuz/.test(await exitDialog(page).innerText()));
      ok(g, "soru açıkken sayfa DEĞİŞMEDİ", page.url() === urlWithQ || /\/dashboard\/biyoenerji\?q=mide$/.test(page.url()), page.url());
      await page.getByRole("button", { name: "Aramada Kal" }).click();
      await sleep(600);
      ok(g, "Aramada Kal → aynı sayfa, sonuçlar duruyor", (await exitDialog(page).count()) === 0 && /\/dashboard\/biyoenerji\?q=mide$/.test(page.url()) && (await page.getByTestId("bio-global-hit").count()) >= 3, page.url());
      // üst geri bağlantısı ("Enerji & Beden") da sorar
      await page.locator('a[href="/enerji-beden"]').first().click();
      await exitDialog(page).waitFor({ timeout: 6000 });
      ok(g, "'Enerji & Beden' bağlantısı → soru", (await exitDialog(page).count()) === 1);
      await page.getByRole("button", { name: "Aramada Kal" }).click();
      await sleep(400);
      // geri tuşu hâlâ soruyor
      await page.goBack();
      await exitDialog(page).waitFor({ timeout: 6000 });
      ok(g, "geri tuşu → soru (mevcut davranış korunur)", (await exitDialog(page).count()) === 1);
      await page.getByRole("button", { name: "Aramada Kal" }).click();
      await sleep(600);
      ok(g, "geri sorusunda Aramada Kal → sonuçlar duruyor", (await page.getByTestId("bio-global-hit").count()) >= 3 && /\?q=mide$/.test(page.url()), page.url());
      // Çık → seçilen sayfaya gidilir
      await card.click();
      await exitDialog(page).waitFor({ timeout: 6000 });
      await page.getByRole("button", { name: "Çık" }).click();
      await page.waitForURL(/\/dashboard\/biyoenerji\/sembol-dili$/, { timeout: 15000 });
      ok(g, "Çık → seçilen sayfaya gidildi", /\/dashboard\/biyoenerji\/sembol-dili$/.test(page.url()), page.url());
      // hedeften GERİ → arama kapalı, soru yok
      await page.goBack();
      await page.getByTestId("bio-global-search").waitFor({ timeout: 15000 });
      await sleep(900);
      ok(g, "Çık sonrası geri → arama kapalı, soru YOK", (await exitDialog(page).count()) === 0 && (await page.getByTestId("bio-global-results").count()) === 0 && !page.url().includes("q="), page.url());
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
  // C: sonuç aç + geri → ek soru yok; X ile temizleme → soru yok; sonuç yokken bağlantı serbest
  {
    const g = "C-ayni-baglam";
    const { page, ctx, pageErrors } = await newPage({ viewport: MOBILE, routes: [
      ...baseRoutes(),
      ["GET", /^\/api\/biyoenerji\/symbols\/e/, (_r, url) => ({ status: 200, json: { ok: true, row: { id: url.pathname.split("/").pop(), tenant_id: TENANT, symbol: "ZZ Sembol", title: "ZZ", category: "ZZ", meaning: "ZZ mide anlamı", source: "", created_at: "2026-10-01T09:00:00.000Z" } } })],
    ] });
    try {
      const input = await openSearch(page);
      await page.getByTestId("bio-global-hit").filter({ hasText: "ZZ Sembol" }).first().click();
      await page.waitForURL(/\/sembol-dili\/e/, { timeout: 15000 });
      ok(g, "sonuca dokunma → soru YOK, detaya gidildi", /\?q=mide$/.test(page.url()), page.url());
      await sleep(800);
      await page.goBack();
      await page.getByTestId("bio-global-results").waitFor({ timeout: 10000 });
      await sleep(800);
      ok(g, "detay → geri: ek soru YOK", (await exitDialog(page).count()) === 0);
      await page.getByRole("button", { name: "Aramayı temizle" }).click();
      await sleep(900);
      ok(g, "X ile temizleme → soru YOK, arama kapandı", (await exitDialog(page).count()) === 0 && (await input.inputValue()) === "" && !page.url().includes("q="), page.url());
      await page.locator('a[href="/dashboard/biyoenerji/sembol-dili"]').first().click();
      await page.waitForURL(/\/dashboard\/biyoenerji\/sembol-dili$/, { timeout: 15000 });
      ok(g, "arama kapalıyken bağlantı → soru YOK, doğrudan gidildi", (await exitDialog(page).count()) === 0);
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

const ALL = { testListHighlight, testExitGuard };
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(ALL);
try {
  for (const k of only) await ALL[k]();
} catch (e) {
  ok("runner", "beklenmeyen hata", false, e);
} finally {
  await browser?.close();
}
console.log(`\nFINAL-A2 BIO UI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
