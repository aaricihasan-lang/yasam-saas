// WT9 + Bilgi kaydı bazlı kaynak modeli — Doğaltaş: UI davranış testleri (Playwright, yerel build, ağ-mock; prod'a SIFIR temas).
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

/** Durumlu sahte API: kaynaklar + BİLGİ KAYITLARI (ekle/düzenle/sil, eski metin dönüşümü) gerçekten durumu değiştirir. */
function sourcesApi({ withExtra = true, primary = {}, entries: seedEntries = [] } = {}) {
  let row = stoneRow(primary);
  let extras = withExtra ? [extraRow(AHMET_ID, "Ahmet Hoca Eğitim Notu", { physical_effects: "Ahmet: mide kramplarında rahatlatır.", general_info: "Ahmet genel." })] : [];
  let entries = seedEntries.map((e, i) => ({ id: e.id ?? `e0000000-0000-4000-8000-00000000000${i}`, tenant_id: TENANT, stone_id: STONE_ID, sort_order: i, created_at: `2026-10-03T09:00:0${i}.000Z`, updated_at: null, ...e }));
  let seq = 100;
  const writes = [];
  const list = () => [view(row, true, "primary", row.primary_source_name ?? null, -1), ...extras.map((e) => view(e, false, e.id, e.source_name, e.sort_order))];
  const legacyCur = (origin, field) => (origin === "primary" ? row[field] : extras.find((x) => x.id === origin)?.[field]) ?? null;
  const legacyOrder = (origin) => (origin === "primary" ? -1000 : -999 + extras.findIndex((x) => x.id === origin));
  const routes = [
    ["GET", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/sources$`), () => ({ status: 200, json: { ok: true, sources: list(), schemaMissing: false } })],
    ["GET", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/entries$`), () => ({ status: 200, json: { ok: true, entries, schemaMissing: false } })],
    ["POST", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/entries$`), (_r, _u, body) => {
      writes.push({ m: "POST", path: "entries", body });
      const same = entries.filter((e) => e.field_key === body.field_key);
      const created = { id: `e0000000-0000-4000-8000-000000000${seq++}`, tenant_id: TENANT, stone_id: STONE_ID, field_key: body.field_key, content: body.content,
        source_name: body.source_name, sort_order: Math.max(-1, ...same.map((e) => e.sort_order)) + 1, created_at: new Date().toISOString(), updated_at: null };
      entries.push(created);
      return { status: 201, json: { ok: true, entry: created } };
    }],
    ["PATCH", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/entries/[^/]+$`), (_r, url, body) => {
      const eid = decodeURIComponent(url.pathname.split("/").pop());
      writes.push({ m: "PATCH", path: `entries/${eid}`, body });
      const lg = /^legacy:([^:]+):([a-z_]+)$/.exec(eid);
      if (lg) {
        if (legacyCur(lg[1], lg[2]) !== body.expected) return { status: 409, json: { ok: false, code: "conflict", error: "Bu bilgi başka bir oturumda değişmiş." } };
        const created = { id: `e0000000-0000-4000-8000-000000000${seq++}`, tenant_id: TENANT, stone_id: STONE_ID, field_key: lg[2], content: body.content ?? body.expected,
          source_name: body.source_name, sort_order: legacyOrder(lg[1]), created_at: new Date().toISOString(), updated_at: null };
        entries.push(created);
        if (lg[1] === "primary") row = { ...row, [lg[2]]: null }; else Object.assign(extras.find((x) => x.id === lg[1]), { [lg[2]]: null });
        return { status: 200, json: { ok: true, entry: created } };
      }
      const e = entries.find((x) => x.id === eid);
      if (!e) return { status: 404, json: { ok: false, error: "Kayıt bulunamadı." } };
      if ("content" in body) e.content = body.content;
      if ("source_name" in body) e.source_name = body.source_name;
      return { status: 200, json: { ok: true, entry: e } };
    }],
    ["DELETE", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/entries/[^/]+$`), (_r, url, body) => {
      const eid = decodeURIComponent(url.pathname.split("/").pop());
      writes.push({ m: "DELETE", path: `entries/${eid}`, body });
      const lg = /^legacy:([^:]+):([a-z_]+)$/.exec(eid);
      if (lg) {
        if (lg[1] === "primary") row = { ...row, [lg[2]]: null }; else Object.assign(extras.find((x) => x.id === lg[1]), { [lg[2]]: null });
        return { status: 200, json: { ok: true } };
      }
      entries = entries.filter((x) => x.id !== eid);
      return { status: 200, json: { ok: true, id: eid } };
    }],
    ["GET", new RegExp(`^/api/dogaltas/stones/${STONE_ID}$`), () => ({ status: 200, json: { ok: true, row } })],
    ["PATCH", new RegExp(`^/api/dogaltas/stones/${STONE_ID}$`), (_r, _u, body) => {
      writes.push({ m: "PATCH", path: "stone", body });
      row = { ...row, ...body };
      return { status: 200, json: { ok: true, id: STONE_ID, row } };
    }],
    ["*", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/sources`), (r) => {
      if (r.method() !== "GET") writes.push({ m: r.method(), path: "sources(yasak)" });
      return { status: 200, json: { ok: true, sources: list() } };
    }],
    ["GET", /^\/api\/dogaltas\/stone-sources\/names/, () => ({ status: 200, json: { ok: true, names: ["Ahmet Hoca Eğitim Notu", "Kendi Ders Notlarım", "Kristal Şifa Kitabı", "Mehmet Hoca"] } })],
  ];
  return { routes, writes, getRow: () => row, getExtras: () => extras, getEntries: () => entries };
}

const MEHMET_ENTRY = { id: "e0000000-0000-4000-8000-0000000000aa", field_key: "physical_effects", content: "Mehmet: aktif ENDOKRİN bezlerini destekler.", source_name: "Mehmet Hoca", sort_order: 0 };
const card = (page, title) => page.locator("button", { hasText: title }).first();
const chips = (page) => page.getByTestId("stone-source-chip");
const block = (scope, title) => scope.getByTestId("source-text-block").filter({ has: scope.locator(`h2:text-is("${title}"), h3:text-is("${title}")`) }).first();
const items = (loc) => loc.getByTestId("stone-entry");
const srcText = async (loc) => (await loc.getByTestId("stone-entry-source").allTextContents()).map((t) => t.replace(/^📖\s*Kaynak:\s*/, "").trim());
const editor = (page) => page.getByTestId("stone-entries-editor");
const erows = (page) => editor(page).getByTestId("stone-entry-row");
async function confirmAll(page) {
  for (let k = 0; k < 2; k++) {
    const okBtn = page.getByTestId("confirm-ok");
    if (await okBtn.count()) { await okBtn.click(); await sleep(400); }
  }
}

// ── A) Görüntüleme: her bilgi ayrı kayıt, her kaydın altında KENDİ kaynağı ─────────────────
async function testSourcesView() {
  for (const vp of VIEWPORTS) {
    const g = `A-bilgi-kaydi-gorunum-${vp.tag}`;
    const api = sourcesApi({ entries: [MEHMET_ENTRY] });
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 15000 });
      await sleep(900);
      if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/entries-gorunum-${vp.tag}.png`, fullPage: true });
      const fz = block(page, "Fiziksel Etkiler");
      const texts = await items(fz).allInnerTexts();
      ok(g, "Fiziksel Etkiler: 3 AYRI bilgi kaydı (eski birincil, eski Ahmet, yeni Mehmet) sırayla", (await items(fz).count()) === 3 && texts[0].includes("Birincil fiziksel etkiler.") && texts[1].includes("Ahmet: mide") && texts[2].includes("ENDOKRİN"), texts.join(" || "));
      ok(g, "her kaydın altında KENDİ kaynağı", JSON.stringify(await srcText(fz)) === JSON.stringify(["Kristal Şifa Kitabı", "Ahmet Hoca Eğitim Notu", "Mehmet Hoca"]), JSON.stringify(await srcText(fz)));
      ok(g, "metinler tek metinde birleşmedi", !texts.some((t) => t.includes("Birincil fiziksel") && t.includes("ENDOKRİN")));
      const care = block(page, "Bakım");
      ok(g, "tek kayıtlı alan da kaynağını gösterir (Bakım → Kristal)", (await items(care).count()) === 1 && JSON.stringify(await srcText(care)) === JSON.stringify(["Kristal Şifa Kitabı"]));
      const sum = await chips(page).allTextContents();
      ok(g, "kullanılan kaynaklar özeti (kayıt sayısıyla), taşın 'genel kaynak' varsayımı yok", sum.length === 3 && sum.some((t) => /Mehmet Hoca\s*1/.test(t)) && /bilgi kaydının/.test(await page.getByTestId("stone-source-hint").innerText()), sum.join("|"));
      await items(fz).nth(2).locator("button").click();
      await sleep(400);
      const body = await page.locator("body").innerText();
      ok(g, "kayda tıklayınca okuyucu: o bilginin metni + kaynağı", /Kaynak: Mehmet Hoca/.test(body) && body.includes("aktif ENDOKRİN bezlerini"));
      await page.keyboard.press("Escape");
      await sleep(300);
      ok(g, "düzenleme modu dışında düzenle/sil/ekle yok", (await page.getByTestId("stone-entry-edit").count()) === 0 && (await page.getByTestId("stone-entry-add").count()) === 0);
      ok(g, "yazma isteği YOK", api.writes.length === 0, JSON.stringify(api.writes));
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── B) Arama: yalnız bir kayıtta geçen kelime — eşleşen kayıt tam + vurgulu + kaynak rozeti ───
async function testSourcesSearch() {
  for (const vp of VIEWPORTS) {
    const g = `B-bilgi-kaydi-arama-${vp.tag}`;
    const api = sourcesApi({ entries: [MEHMET_ENTRY] });
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}?q=${encodeURIComponent("endokrin")}`, { waitUntil: "load" });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 15000 });
      await sleep(1600);
      const fz = block(page, "Fiziksel Etkiler");
      ok(g, "eşleşen bölüm işaretli", /Eşleşme|eşleşme|🔍/.test(await fz.innerText()));
      ok(g, "eşleşen kayıt (Mehmet) tam görünür + kaynağıyla", (await items(fz).nth(2).innerText()).includes("aktif ENDOKRİN bezlerini destekler.") && /Mehmet Hoca/.test(await items(fz).nth(2).textContent()));
      const mchip = chips(page).filter({ hasText: "Mehmet Hoca" });
      ok(g, "kaynak özetinde eşleşme rozeti yalnız Mehmet'te", (await mchip.getByTestId("stone-source-hits").count()) === 1 && (await page.getByTestId("stone-source-hits").count()) === 1);
      const marks = await page.locator("main mark").allInnerTexts();
      const hc = await page.evaluate(() => globalThis.CSS?.highlights?.get("yasam-search-hit")?.size ?? 0);
      ok(g, "WT8 sarı vurgu korunur", marks.some((m) => /endokr/i.test(m)) || hc > 0, JSON.stringify({ marks, hc }));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── C) Kayıt düzenleyici: ekle / ayrı düzenle / kaynağı düzenle / tek sil / eski kayıt dönüşümü / reload ──
async function testSourcesEdit() {
  for (const vp of VIEWPORTS) {
    const g = `C-bilgi-kaydi-crud-${vp.tag}`;
    const api = sourcesApi();
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
      await sleep(500);
      await block(page, "Fiziksel Etkiler").click();
      await editor(page).waitFor({ timeout: 5000 });
      ok(g, "Fiziksel Etkiler açılınca: Mevcut Kayıtlar (2 eski) + Yeni Bilgi formu", (await erows(page).count()) === 2 && (await editor(page).getByTestId("stone-entry-new").count()) === 1);
      const eb = await editor(page).boundingBox();
      ok(g, "düzenleyici ekrana sığıyor (yatay taşma yok)", eb.x >= -1 && eb.x + eb.width <= vp.width + 1 && (await noHScroll(page)));
      // kaynak zorunlu
      await editor(page).getByTestId("stone-entry-new-content").fill("AAA");
      await editor(page).getByTestId("stone-entry-new-source").fill("   ");
      await editor(page).getByTestId("stone-entry-add").click();
      await sleep(300);
      ok(g, "kaynaksız bilgi eklenmez (mesaj, istek YOK)", /Kaynak zorunludur/.test(await editor(page).innerText()) && !api.writes.some((w) => w.m === "POST"));
      const opts = await editor(page).getByTestId("stone-entry-source-suggestions").locator("option").evaluateAll((els) => els.map((e) => e.value));
      ok(g, "kaynak önerileri: uzmanın kendi kaynakları", opts.includes("Mehmet Hoca") && opts.includes("Kristal Şifa Kitabı"), opts.join("|"));
      // 1) A + B
      await editor(page).getByTestId("stone-entry-new-source").fill("Ahmet Hoca");
      await editor(page).getByTestId("stone-entry-add").click();
      await sleep(700);
      await editor(page).getByTestId("stone-entry-new-content").fill("BBB");
      await editor(page).getByTestId("stone-entry-new-source").fill("Mehmet Hoca");
      await editor(page).getByTestId("stone-entry-add").click();
      await sleep(700);
      const posts = api.writes.filter((w) => w.m === "POST");
      ok(g, "1: iki ayrı POST {field_key, content, source_name}", posts.length === 2 && posts[0].body.field_key === "physical_effects" && posts[0].body.content === "AAA" && posts[0].body.source_name === "Ahmet Hoca" && posts[1].body.content === "BBB" && posts[1].body.source_name === "Mehmet Hoca", JSON.stringify(posts));
      ok(g, "1: listede 4 kayıt, A ve B ayrı + kendi kaynaklarıyla, eklenme sırasında", (await erows(page).count()) === 4 && JSON.stringify((await srcText(editor(page))).slice(2)) === JSON.stringify(["Ahmet Hoca", "Mehmet Hoca"]));
      ok(g, "yeni bilgi formu temizlendi", (await editor(page).getByTestId("stone-entry-new-content").inputValue()) === "");
      const aId = api.getEntries().find((e) => e.content === "AAA").id, bId = api.getEntries().find((e) => e.content === "BBB").id;
      const rowA = editor(page).locator(`[data-testid="stone-entry-row"][data-entry-id="${aId}"]`);
      const rowB = editor(page).locator(`[data-testid="stone-entry-row"][data-entry-id="${bId}"]`);
      // 2) A düzenle
      await rowA.getByTestId("stone-entry-edit").click();
      ok(g, "2: Düzenle → yalnız A'nın metni + kaynağı editörde", (await rowA.getByTestId("stone-entry-edit-content").inputValue()) === "AAA" && (await rowA.getByTestId("stone-entry-edit-source").inputValue()) === "Ahmet Hoca");
      await rowA.getByTestId("stone-entry-edit-content").fill("AAA-GÜNCEL");
      await rowA.getByTestId("stone-entry-edit-save").click();
      await sleep(700);
      let last = api.writes.at(-1);
      ok(g, "2: PATCH /entries/<A> yalnız A; B aynen", last.path === `entries/${aId}` && last.body.content === "AAA-GÜNCEL" && api.getEntries().find((e) => e.id === bId).content === "BBB" && api.getEntries().find((e) => e.id === bId).source_name === "Mehmet Hoca");
      ok(g, "2: A listede aynı yerde (en alta atılmadı)", (await erows(page).nth(2).getAttribute("data-entry-id")) === aId && (await erows(page).nth(2).innerText()).includes("AAA-GÜNCEL"));
      // 3) A'nın kaynağı
      await rowA.getByTestId("stone-entry-edit").click();
      await rowA.getByTestId("stone-entry-edit-source").fill("Ahmet Eğitmen");
      await rowA.getByTestId("stone-entry-edit-save").click();
      await sleep(700);
      ok(g, "3: yalnız A'nın kaynağı değişti", api.getEntries().find((e) => e.id === aId).source_name === "Ahmet Eğitmen" && api.getEntries().find((e) => e.id === bId).source_name === "Mehmet Hoca" && JSON.stringify((await srcText(editor(page))).slice(2)) === JSON.stringify(["Ahmet Eğitmen", "Mehmet Hoca"]));
      // 4) B sil (onaylı)
      await rowB.getByTestId("stone-entry-delete").click();
      await sleep(300);
      await confirmAll(page);
      await sleep(600);
      ok(g, "4: B onaylı silindi (DELETE yalnız B), A duruyor", api.writes.some((w) => w.m === "DELETE" && w.path === `entries/${bId}`) && !api.getEntries().some((e) => e.id === bId) && api.getEntries().some((e) => e.id === aId) && (await erows(page).count()) === 3);
      // 9) eski kayıt düzenle → dönüşüm, sıra korunur
      const legacyRow = erows(page).first();
      await legacyRow.getByTestId("stone-entry-edit").click();
      ok(g, "9: eski kayıt düzenlemede kaynak önceden dolu", (await legacyRow.getByTestId("stone-entry-edit-source").inputValue()) === "Kristal Şifa Kitabı");
      await legacyRow.getByTestId("stone-entry-edit-content").fill("Birincil fiziksel etkiler. (gözden geçirildi)");
      await legacyRow.getByTestId("stone-entry-edit-save").click();
      await sleep(900);
      last = api.writes.filter((w) => w.m === "PATCH").at(-1);
      ok(g, "9: eski kayıt → PATCH legacy:primary + expected (eski metin doğrulaması)", last.path === "entries/legacy:primary:physical_effects" && last.body.expected === "Birincil fiziksel etkiler." && last.body.source_name === "Kristal Şifa Kitabı", JSON.stringify(last));
      ok(g, "9: dönüşen kayıt İLK sırada kaldı, diğerleri aynı", (await erows(page).first().innerText()).includes("(gözden geçirildi)") && (await erows(page).count()) === 3 && (await erows(page).nth(1).innerText()).includes("Ahmet: mide"));
      // kapat → kart → reload
      await editor(page).getByRole("button", { name: "Kapat" }).click();
      await sleep(400);
      ok(g, "düzenleyici kapandı, kart güncel kayıtları gösteriyor", (await editor(page).count()) === 0 && (await items(block(page, "Fiziksel Etkiler")).count()) === 3);
      ok(g, "taş satırına PATCH yok, kaynak tablosuna yazma yok (bilgi kayıtları ayrı)", !api.writes.some((w) => w.path === "stone" || w.path === "sources(yasak)"));
      await page.reload({ waitUntil: "load" });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 15000 });
      await sleep(800);
      const fz = block(page, "Fiziksel Etkiler");
      const t2 = await items(fz).allInnerTexts();
      ok(g, "8: yeniden yükleme sonrası kayıtlar + kaynaklar kalıcı", t2.length === 3 && t2[0].includes("(gözden geçirildi)") && t2[2].includes("AAA-GÜNCEL") && JSON.stringify(await srcText(fz)) === JSON.stringify(["Kristal Şifa Kitabı", "Ahmet Hoca Eğitim Notu", "Ahmet Eğitmen"]), t2.join(" || "));
      if (process.env.SHOT_DIR) {
        await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
        await sleep(400);
        await block(page, "Fiziksel Etkiler").click();
        await editor(page).waitFor({ timeout: 5000 });
        await page.screenshot({ path: `${process.env.SHOT_DIR}/entries-editor-${vp.tag}.png` });
      }
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── D) Eski tek kaynaklı / adsız kayıt: içerik aynen, "Kaynak belirtilmemiş", dönüşümde kaynak istenir ──
async function testSingleSource() {
  for (const vp of VIEWPORTS) {
    const g = `D-eski-kayit-${vp.tag}`;
    const api = sourcesApi({ withExtra: false, primary: { primary_source_name: null } });
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 15000 });
      await sleep(600);
      const fz = block(page, "Fiziksel Etkiler");
      ok(g, "eski metin tek kayıt, AYNEN", (await items(fz).count()) === 1 && (await items(fz).first().innerText()).includes("Birincil fiziksel etkiler."));
      ok(g, "adsız eski kayıt: 'Kaynak belirtilmemiş'", JSON.stringify(await srcText(fz)) === JSON.stringify(["Kaynak belirtilmemiş"]));
      await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
      await sleep(400);
      await block(page, "Fiziksel Etkiler").click();
      await editor(page).waitFor({ timeout: 5000 });
      await erows(page).first().getByTestId("stone-entry-edit").click();
      await erows(page).first().getByTestId("stone-entry-edit-save").click();
      await sleep(300);
      ok(g, "kaynaksız eski kaydı kaydetmek kaynak ister (istek YOK)", /Kaynak zorunludur/.test(await editor(page).innerText()) && !api.writes.length);
      await erows(page).first().getByTestId("stone-entry-edit-source").fill("Kristal Şifa Kitabı");
      await erows(page).first().getByTestId("stone-entry-edit-save").click();
      await sleep(800);
      ok(g, "kaynak verilince eski metin AYNEN gerçek kayda dönüştü", api.getEntries().length === 1 && api.getEntries()[0].content === "Birincil fiziksel etkiler." && api.getEntries()[0].source_name === "Kristal Şifa Kitabı" && api.getRow().physical_effects === null);
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

// ── F) Kombinasyon Oluştur taş paneli: bilgi kayıtları kendi kaynaklarıyla (salt-okunur), seçim/ekleme aynı ──
async function testBuilderDrawer() {
  for (const vp of VIEWPORTS) {
    const g = `F-kombinasyon-olustur-kaynak-${vp.tag}`;
    const api = sourcesApi({ primary: { chakras: ["Kök Çakra"], general_info: "Kristal genel bilgi (birincil)." } });
    const extra = api.getExtras()[0];
    extra.chakras = ["Kalp Çakrası"];
    extra.general_info = "Ahmet genel: kalp bölgesi.";
    // Gerçek sunucu gibi: ek kaynak çakrası eşleşen satıra birleşik search_chakras eklenir.
    const listRow = { ...api.getRow(), images: [], search_chakras: ["Kök Çakra", "Kalp Çakrası"] };
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: [
      ...api.routes,
      ["POST", /^\/api\/dogaltas\/stones\/condition-search$/, (_r, _u, body) => {
        const has = (body?.conditions ?? []).length > 0;
        return { status: 200, json: { ok: true, rows: has ? [listRow] : [], total: has ? 1 : 0, capped: false,
          suggestions: { chakra: [{ name: "Kalp Çakrası", count: 1 }], astrology: [], organ: [], stone_name: [], mineral: [] } } };
      }],
    ] });
    try {
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
      const result = page.getByRole("button", { name: /ZZ Akik/ }).first();
      await result.waitFor({ timeout: 8000 });
      await result.click();
      const panel = page.getByTestId("stone-detail-drawer-panel");
      await panel.waitFor({ timeout: 5000 });
      await panel.getByTestId("drawer-sources").waitFor({ timeout: 8000 });
      await sleep(800);
      const c = panel.getByTestId("stone-source-chip");
      ok(g, "panelde kullanılan kaynaklar özeti, sekme YOK", (await c.count()) === 2 && /Kristal Şifa Kitabı/.test(await c.first().innerText()) && /Ahmet Hoca/.test(await c.nth(1).innerText()) && (await panel.getByRole("tab").count()) === 0);
      const txt = await panel.innerText();
      const gen = panel.locator("section", { hasText: "Ahmet genel: kalp bölgesi." }).first();
      const genTexts = await gen.getByTestId("stone-entry").allInnerTexts();
      ok(g, "Genel Bilgi: iki AYRI bilgi kaydı birlikte görünür (sekme değiştirmeden)", genTexts.length === 2 && genTexts[0].includes("Kristal genel bilgi (birincil).") && genTexts[1].includes("Ahmet genel: kalp bölgesi."), genTexts.join(" || "));
      const genSrc = (await gen.getByTestId("stone-entry-source").allTextContents()).map((t) => t.replace(/^📖\s*Kaynak:\s*/, "").trim());
      ok(g, "her kaydın altında kendi kaynağı (karışmaz)", JSON.stringify(genSrc) === JSON.stringify(["Kristal Şifa Kitabı", "Ahmet Hoca Eğitim Notu"]), JSON.stringify(genSrc));
      const chs = panel.locator("section", { hasText: "Kalp Çakrası" }).first();
      ok(g, "çakralar kaynak başına (Kök → Kristal, Kalp → Ahmet)", (await chs.getByTestId("source-field-entry").count()) === 2);
      ok(g, "salt-okunur (ekle/düzenle/sil yok)", (await panel.getByTestId("stone-entry-add").count()) === 0 && (await panel.getByTestId("stone-entry-edit").count()) === 0 && (await panel.getByTestId("source-edit-row").count()) === 0);
      ok(g, "taş adı ortak", txt.includes("ZZ Akik"));
      // kombinasyon ekleme mantığı aynı
      await panel.getByRole("button", { name: /Kombinasyona Ekle/ }).click();
      await sleep(400);
      ok(g, "Kombinasyona Ekle aynı çalışır (panel içi çıkar butonuna döner)", (await panel.getByRole("button", { name: /Çıkar/ }).count()) >= 1);
      ok(g, "kaynaklar için yazma isteği YOK", api.writes.length === 0, JSON.stringify(api.writes));
      const pb = await panel.boundingBox();
      ok(g, "panel ekranda (yatay taşma yok)", pb.x >= 0 && pb.x + pb.width <= vp.width + 1 && (await noHScroll(page)));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

const ALL = { testSourcesView, testSourcesSearch, testSourcesEdit, testSingleSource, testCreateForm, testBuilderDrawer };
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
