// WT9 — Doğaltaş ÇOKLU KAYNAK: UI davranış testleri (Playwright, yerel build, ağ-mock; prod'a SIFIR temas).
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink + sahte env build + start);
//   node scripts/wt9/ui-wt9.mjs   (UI_BASE ile port; ONLY=testSourcesView,… ile alt küme)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const PERMS = Object.fromEntries(["stones", "stok", "clients", "appointments"].map((k) => [k, true]));
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: PERMS,
};
const MOBILE = { width: 390, height: 844, tag: "mobil" };
const WEB = { width: 1280, height: 900, tag: "web" };
const VIEWPORTS = [MOBILE, WEB];
const STONE_ID = "f0000000-0000-4000-8000-000000000091";
const AHMET_ID = "a9000000-0000-4000-8000-000000000001";
const NEW_ID = "a9000000-0000-4000-8000-000000000002";

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

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
        return route.fulfill({ status: r.status, json: r.json ?? {} });
      }
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  return { ctx, page, calls, pageErrors };
}

function stoneRow(over = {}) {
  return {
    id: STONE_ID, tenant_id: TENANT, stone_name: "ZZ Akik", primary_source_name: "Kristal Şifa Kitabı",
    short_description: "Kristal kısa", general_info: "Kristal genel bilgi (birincil).", source_note: "Kristal Şifa kitabı",
    physical_effects: "Birincil fiziksel etkiler.", spiritual_effects: "Birincil ruhsal.", other_effects: null, warning_text: null,
    warning_tags: ["Su ile temizlenmez"], feng_shui: "Birincil feng", meditation: null, care: "Birincil bakım", application: null,
    chakras: ["Kök Çakra"], assignments: { Burçlar: [["Koç"]] }, images: [], created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z",
    ...over,
  };
}
const FIELDS = ["short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects", "feng_shui", "meditation", "care", "application", "warning_text"];
function view(row, isPrimary, id, name, sortOrder) {
  const fields = Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? null]));
  fields.chakras = row.chakras ?? null;
  return { id, name, isPrimary, sortOrder, fields, updatedAt: row.updated_at ?? null };
}
function extraRow(id, name, over = {}) {
  return { id, tenant_id: TENANT, stone_id: STONE_ID, source_name: name, sort_order: 1, created_at: "2026-10-02T09:00:00.000Z", updated_at: "2026-10-02T09:00:00.000Z",
    ...Object.fromEntries(FIELDS.map((f) => [f, null])), chakras: null, ...over };
}

/** Durumlu sahte API: kaynak ekle/düzenle/sil gerçekten listeyi değiştirir. */
function sourcesApi({ withExtra = true, primary = {} } = {}) {
  let row = stoneRow(primary);
  let extras = withExtra ? [extraRow(AHMET_ID, "Ahmet Hoca Eğitim Notu", { physical_effects: "Ahmet: mide kramplarında rahatlatır.", general_info: "Ahmet genel." })] : [];
  const writes = [];
  const list = () => [view(row, true, "primary", row.primary_source_name ?? null, -1), ...extras.map((e) => view(e, false, e.id, e.source_name, e.sort_order))];
  const routes = [
    ["GET", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/sources$`), () => ({ status: 200, json: { ok: true, sources: list(), schemaMissing: false } })],
    ["POST", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/sources$`), (_r, _u, body) => {
      writes.push({ m: "POST", path: "sources", body });
      const created = extraRow(NEW_ID, body.source_name, { sort_order: extras.length + 1 });
      extras.push(created);
      return { status: 201, json: { ok: true, source: created } };
    }],
    ["PATCH", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/sources/[^/]+$`), (_r, url, body) => {
      const sid = url.pathname.split("/").pop();
      writes.push({ m: "PATCH", path: `sources/${sid}`, body });
      if (sid === "primary") {
        row = { ...row, ...body, ...(body.source_name !== undefined ? { primary_source_name: body.source_name } : {}) };
        delete row.source_name;
        return { status: 200, json: { ok: true, row } };
      }
      const e = extras.find((x) => x.id === sid);
      Object.assign(e, body);
      return { status: 200, json: { ok: true, source: e } };
    }],
    ["DELETE", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/sources/[^/]+$`), (_r, url) => {
      const sid = url.pathname.split("/").pop();
      writes.push({ m: "DELETE", path: `sources/${sid}` });
      extras = extras.filter((x) => x.id !== sid);
      return { status: 200, json: { ok: true, id: sid } };
    }],
    ["GET", new RegExp(`^/api/dogaltas/stones/${STONE_ID}$`), () => ({ status: 200, json: { ok: true, row } })],
    ["PATCH", new RegExp(`^/api/dogaltas/stones/${STONE_ID}$`), (_r, _u, body) => {
      writes.push({ m: "PATCH", path: "stone", body });
      row = { ...row, ...body };
      return { status: 200, json: { ok: true, id: STONE_ID, row } };
    }],
    ["GET", /^\/api\/dogaltas\/stone-sources\/names/, () => ({ status: 200, json: { ok: true, names: ["Ahmet Hoca Eğitim Notu", "Kendi Ders Notlarım", "Kristal Şifa Kitabı", "X Yayınları"] } })],
  ];
  return { routes, writes, getRow: () => row, getExtras: () => extras };
}

const card = (page, title) => page.locator("button", { hasText: title }).first();
const tabs = (page) => page.getByTestId("stone-source-tab");

// ── A) Görüntüleme: kaynak sekmeleri, metinlerin hangi kaynağa ait olduğu ─────────────
async function testSourcesView() {
  for (const vp of VIEWPORTS) {
    const g = `A-kaynak-gorunum-${vp.tag}`;
    const api = sourcesApi();
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("stone-sources-bar").waitFor({ timeout: 15000 });
      await sleep(600);
      const names = await tabs(page).allInnerTexts();
      ok(g, "2 kaynak sekmesi (birincil önce)", names.length === 2 && /Kristal Şifa Kitabı/.test(names[0]) && /Ahmet Hoca/.test(names[1]), names.join("|"));
      ok(g, "birincil seçili", (await tabs(page).first().getAttribute("aria-selected")) === "true");
      ok(g, "açıklama: metinler hangi kaynağa ait", /Kristal Şifa Kitabı/.test(await page.getByTestId("stone-source-hint").innerText()));
      ok(g, "birincil metin görünür", (await card(page, "Fiziksel").innerText()).includes("Birincil fiziksel etkiler."));
      await tabs(page).nth(1).click();
      await sleep(400);
      ok(g, "Ahmet sekmesi → Ahmet'in metni", (await card(page, "Fiziksel").innerText()).includes("Ahmet: mide kramplarında rahatlatır."));
      ok(g, "Ahmet sekmesinde birincil metin GÖRÜNMEZ (karışmaz)", !(await page.locator("main").innerText()).includes("Birincil fiziksel etkiler."));
      ok(g, "açıklama Ahmet'e döner", /Ahmet Hoca Eğitim Notu/.test(await page.getByTestId("stone-source-hint").innerText()));
      ok(g, "taşa özgü ad ortak kalır", (await page.locator("main").innerText()).includes("ZZ Akik"));
      ok(g, "düzenleme modu dışında ekle/sil yok", (await page.getByTestId("stone-source-add").count()) === 0 && (await page.getByTestId("stone-source-delete").count()) === 0);
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── B) Arama: eşleşen kaynak otomatik açılır, sekmede eşleşme sayısı, sarı vurgu ──────
async function testSourcesSearch() {
  for (const vp of VIEWPORTS) {
    const g = `B-kaynak-arama-${vp.tag}`;
    const api = sourcesApi();
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}?q=${encodeURIComponent("MİDE")}`, { waitUntil: "load" });
      await page.getByTestId("stone-sources-bar").waitFor({ timeout: 15000 });
      await sleep(1500);
      ok(g, "yalnız ek kaynakta eşleşme → o kaynak otomatik seçildi", (await tabs(page).nth(1).getAttribute("aria-selected")) === "true");
      ok(g, "sekmede eşleşme sayısı", /🔍\s*1/.test(await tabs(page).nth(1).innerText()) && (await tabs(page).first().getByTestId("stone-source-hits").count()) === 0);
      const marks = await page.locator("main mark").allInnerTexts();
      const hc = await page.evaluate(() => globalThis.CSS?.highlights?.get("yasam-search-hit")?.size ?? 0);
      ok(g, "WT8 sarı vurgu korunur (kaynak metninde)", marks.some((m) => /mide/i.test(m)) || hc > 0, JSON.stringify({ marks, hc }));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── C) Düzenleme: yeni kaynak, öneriler, aynı ad, alan düzenleme, ad, silme ───────────
async function testSourcesEdit() {
  for (const vp of VIEWPORTS) {
    const g = `C-kaynak-duzenle-${vp.tag}`;
    const api = sourcesApi();
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("stone-sources-bar").waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
      await page.getByTestId("stone-source-add").waitFor({ timeout: 5000 });
      await page.getByTestId("stone-source-add").click();
      const dlg = page.getByTestId("stone-source-dialog");
      await dlg.waitFor({ timeout: 5000 });
      await sleep(400);
      const opts = await page.getByTestId("stone-source-suggestions").locator("option").evaluateAll((els) => els.map((e) => e.value));
      ok(g, "öneriler: uzmanın kendi adları, bu taşta zaten olanlar hariç", opts.includes("Kendi Ders Notlarım") && opts.includes("X Yayınları") && !opts.includes("Kristal Şifa Kitabı") && !opts.includes("Ahmet Hoca Eğitim Notu"), opts.join("|"));
      await page.getByTestId("stone-source-name-input").fill("kristal  şifa KİTABI");
      await page.getByTestId("stone-source-save").click();
      await sleep(300);
      ok(g, "aynı kaynak adı (Türkçe büyük-küçük + boşluk) reddedilir, istek YOK", /zaten var/.test(await dlg.innerText()) && !api.writes.some((w) => w.m === "POST"));
      await page.getByTestId("stone-source-name-input").fill("Kendi Ders Notlarım");
      await page.getByTestId("stone-source-save").click();
      await sleep(800);
      ok(g, "yeni kaynak → tek POST {source_name}", api.writes.filter((w) => w.m === "POST").length === 1 && api.writes.find((w) => w.m === "POST").body.source_name === "Kendi Ders Notlarım");
      ok(g, "yeni kaynak sekmesi eklendi ve seçildi", (await tabs(page).count()) === 3 && (await tabs(page).nth(2).getAttribute("aria-selected")) === "true");
      ok(g, "diğer kaynakların içeriğine dokunulmadı (yazma yok)", !api.writes.some((w) => w.path === "stone") && api.getRow().physical_effects === "Birincil fiziksel etkiler.");
      // yeni kaynakta alan doldur → KAYNAĞA yazılır (taşa değil)
      await card(page, "Fiziksel").click();
      const ta = page.locator("textarea").first();
      await ta.waitFor({ timeout: 5000 });
      await ta.fill("Kendi notum: fiziksel.");
      await page.getByRole("button", { name: /Kaydet \/ Güncelle/ }).click();
      await sleep(800);
      const pw = api.writes.filter((w) => w.m === "PATCH");
      ok(g, "ek kaynak alanı → PATCH /sources/<id> (taş satırı DEĞİL)", pw.length === 1 && pw[0].path === `sources/${NEW_ID}` && pw[0].body.physical_effects === "Kendi notum: fiziksel.", JSON.stringify(pw));
      ok(g, "kaydedilen metin seçili kaynakta görünür", (await card(page, "Fiziksel").innerText()).includes("Kendi notum: fiziksel."));
      // birincile geç → alan düzenle → taşa yazılır
      await tabs(page).first().click();
      await sleep(300);
      await card(page, "Fiziksel").click();
      await page.locator("textarea").first().fill("Birincil güncel.");
      await page.getByRole("button", { name: /Kaydet \/ Güncelle/ }).click();
      await sleep(800);
      const sw = api.writes.filter((w) => w.path === "stone");
      ok(g, "birincil kaynak alanı → mevcut taş PATCH'i", sw.length === 1 && sw[0].body.physical_effects === "Birincil güncel.", JSON.stringify(sw));
      ok(g, "birincil düzenleme ek kaynağı değiştirmedi", api.getExtras().find((e) => e.id === NEW_ID).physical_effects === "Kendi notum: fiziksel.");
      // ad düzenle (Ahmet)
      await tabs(page).nth(1).click();
      await page.getByTestId("stone-source-rename").click();
      await page.getByTestId("stone-source-name-input").fill("Ahmet Hoca Eğitim Notları");
      await page.getByTestId("stone-source-save").click();
      await sleep(700);
      ok(g, "kaynak adı düzenlendi (PATCH source_name)", api.writes.some((w) => w.path === `sources/${AHMET_ID}` && w.body.source_name === "Ahmet Hoca Eğitim Notları") && /Ahmet Hoca Eğitim Notları/.test(await tabs(page).nth(1).innerText()));
      // sil (Ahmet) — onaylı
      await page.getByTestId("stone-source-delete").click();
      for (let k = 0; k < 2; k++) {
        const okBtn = page.getByTestId("confirm-ok");
        if (await okBtn.count()) { await okBtn.click(); await sleep(400); }
      }
      await sleep(600);
      ok(g, "ek kaynak silindi (onaylı DELETE), diğerleri duruyor", api.writes.some((w) => w.m === "DELETE" && w.path === `sources/${AHMET_ID}`) && (await tabs(page).count()) === 2);
      ok(g, "silme sonrası birincil seçili, taş duruyor", (await tabs(page).first().getAttribute("aria-selected")) === "true" && (await page.locator("main").innerText()).includes("ZZ Akik"));
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── D) Tek kaynaklı / eski kayıt: silinemez, adı belirtilmemiş ───────────────────────
async function testSingleSource() {
  for (const vp of VIEWPORTS) {
    const g = `D-tek-kaynak-${vp.tag}`;
    const api = sourcesApi({ withExtra: false, primary: { primary_source_name: null } });
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("stone-sources-bar").waitFor({ timeout: 15000 });
      await sleep(500);
      ok(g, "eski kayıt: 'Kaynak belirtilmemiş' tek sekme", (await tabs(page).count()) === 1 && /Kaynak belirtilmemiş/.test(await tabs(page).first().innerText()));
      await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
      await page.getByTestId("stone-source-delete").waitFor({ timeout: 5000 });
      ok(g, "taşın tek kaynağı silinemez (buton pasif + açıklama)", (await page.getByTestId("stone-source-delete").isDisabled()) && /tek kaynağı silinemez/.test(await page.getByTestId("stone-sources-bar").innerText()));
      ok(g, "'Kaynak adı ver' sunulur", /Kaynak adı ver/.test(await page.getByTestId("stone-source-rename").innerText()));
      await page.getByTestId("stone-source-rename").click();
      await page.getByTestId("stone-source-name-input").fill("Kristal Şifa Kitabı");
      await page.getByTestId("stone-source-save").click();
      await sleep(700);
      ok(g, "birincile ad verildi → PATCH /sources/primary", api.writes.some((w) => w.path === "sources/primary" && w.body.source_name === "Kristal Şifa Kitabı") && /Kristal Şifa Kitabı/.test(await tabs(page).first().innerText()));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── E) Yeni taş formu: kaynak alanı + kendi öneriler ─────────────────────────────────
async function testCreateForm() {
  for (const vp of VIEWPORTS) {
    const g = `E-yeni-tas-kaynak-${vp.tag}`;
    const posts = [];
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ["GET", /^\/api\/dogaltas\/stone-sources\/names/, () => ({ status: 200, json: { ok: true, names: ["Kristal Şifa Kitabı", "Kendi Ders Notlarım"] } })],
      ["POST", /^\/api\/dogaltas\/stones$/, (_r, _u, body) => { posts.push(body); return { status: 200, json: { ok: true, id: STONE_ID } }; }],
      ["*", /^\/api\/dogaltas\/duplicate-check/, () => ({ status: 200, json: { ok: true, duplicates: [], exists: false, matches: [] } })],
    ] });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-kayit`, { waitUntil: "load" });
      await page.locator("button").filter({ hasText: /Yeni|Kayıt|Ekle/ }).first().click({ timeout: 15000 });
      const input = page.getByTestId("primary_source_name");
      await input.waitFor({ timeout: 15000 });
      await sleep(800);
      const opts = await page.locator("#stone-primary-source-options option").evaluateAll((els) => els.map((e) => e.value));
      ok(g, "Bilgi Kaynağı alanı + kendi öneriler", opts.join("|") === "Kristal Şifa Kitabı|Kendi Ders Notlarım", opts.join("|"));
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

const ALL = { testSourcesView, testSourcesSearch, testSourcesEdit, testSingleSource, testCreateForm };
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(ALL);
try {
  for (const k of only) await ALL[k]();
} catch (e) {
  ok("runner", "beklenmeyen hata", false, e);
} finally {
  await browser?.close();
}
console.log(`\nWT9 UI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
