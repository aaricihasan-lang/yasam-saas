// WT9 + Manuel test Madde 14 — Doğaltaş ÇOKLU KAYNAK (alan içi kaynak blokları): UI davranış testleri (Playwright, yerel build, ağ-mock; prod'a SIFIR temas).
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
const chips = (page) => page.getByTestId("stone-source-chip");
// Madde 14: çok kaynaklı taşta bölüm = kaynak blokları kartı.
const block = (page, title) => page.getByTestId("source-text-block").filter({ has: page.locator(`h2:text-is("${title}"), h3:text-is("${title}")`) }).first();
const entries = (loc) => loc.getByTestId("source-field-entry");
const entryOf = (loc, sid) => loc.locator(`[data-testid="source-field-entry"][data-source-id="${sid}"]`);
const rowOf = (loc, sid) => loc.locator(`[data-testid="source-edit-row"][data-source-id="${sid}"]`);
async function saveEditor(page) {
  await page.getByRole("button", { name: /Kaydet \/ Güncelle/ }).click();
  await sleep(800);
}

// ── A) Görüntüleme (Madde 14): her bölümde kaynakların metni kendi adıyla AYRI blok ─────────
async function testSourcesView() {
  for (const vp of VIEWPORTS) {
    const g = `A-kaynak-blok-gorunum-${vp.tag}`;
    const api = sourcesApi();
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("stone-sources-bar").waitFor({ timeout: 15000 });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 10000 });
      await sleep(500);
      if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/m14-gorunum-${vp.tag}.png`, fullPage: true });
      const names = await chips(page).allInnerTexts();
      ok(g, "kaynak çubuğu: 2 kaynak (birincil önce), sekme YOK", names.length === 2 && /Kristal Şifa Kitabı/.test(names[0]) && /Ahmet Hoca/.test(names[1]) && (await page.getByRole("tab").count()) === 0, names.join("|"));
      ok(g, "açıklama: metinler kaynak adıyla ayrı", /kaynak adıyla ayrı ayrı/.test(await page.getByTestId("stone-source-hint").innerText()));
      const fz = block(page, "Fiziksel Etkiler");
      const fe = entries(fz);
      ok(g, "Fiziksel Etkiler: 2 ayrı kaynak bloğu", (await fe.count()) === 2);
      const p0 = await entryOf(fz, "primary").innerText(), p1 = await entryOf(fz, AHMET_ID).innerText();
      ok(g, "blok 1 = Kristal Şifa Kitabı → birincil metin", /KRİSTAL ŞİFA KİTABI|Kristal Şifa Kitabı/i.test(p0) && p0.includes("Birincil fiziksel etkiler.") && !p0.includes("Ahmet:"), p0);
      ok(g, "blok 2 = Ahmet Hoca → Ahmet'in metni (karışmaz)", /Ahmet Hoca/i.test(p1) && p1.includes("Ahmet: mide kramplarında rahatlatır.") && !p1.includes("Birincil"), p1);
      const order = await fe.evaluateAll((els) => els.map((e) => e.getAttribute("data-source-id")));
      ok(g, "kaynak sırası korunur (birincil → ek)", order.join() === `primary,${AHMET_ID}`, order.join());
      const gi = block(page, "Genel Taş Açıklaması");
      ok(g, "aynı iki kaynak başka alanda farklı metin (Genel Bilgi)", (await entryOf(gi, "primary").innerText()).includes("Kristal genel bilgi (birincil).") && (await entryOf(gi, AHMET_ID).innerText()).includes("Ahmet genel."));
      const care = block(page, "Bakım");
      ok(g, "yalnız bir kaynakta dolu alan → yine kaynak adıyla (Bakım: yalnız Kristal)", (await entries(care).count()) === 1 && /Kristal Şifa Kitabı/.test(await entries(care).first().textContent()));
      const ch = page.getByTestId("source-chakra-block");
      ok(g, "çakralar kaynak başına (Ahmet'te çakra yok → tek blok)", (await entries(ch).count()) === 1 && (await ch.innerText()).includes("Kök"));
      // okuyucu: kaynak bloğuna tıklayınca o kaynağın metni + adı
      await entryOf(fz, AHMET_ID).click();
      await sleep(500);
      const body = await page.locator("body").innerText();
      ok(g, "bloğa tıklayınca okuyucu: başlıkta kaynak adı + yalnız o kaynağın metni", /Fiziksel Etkiler · Ahmet Hoca Eğitim Notu/.test(body), body.slice(0, 200));
      await page.keyboard.press("Escape");
      await sleep(300);
      ok(g, "taşa özgü ad ortak kalır", (await page.locator("main").innerText()).includes("ZZ Akik"));
      ok(g, "düzenleme modu dışında ekle/sil/düzenle satırı yok", (await page.getByTestId("stone-source-add").count()) === 0 && (await page.getByTestId("stone-source-delete").count()) === 0 && (await page.getByTestId("source-edit-row").count()) === 0);
      ok(g, "yazma isteği YOK", api.writes.length === 0);
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── B) Arama: eşleşen kaynak bloğu + çipte eşleşme sayısı + sarı vurgu ─────────────────────
async function testSourcesSearch() {
  for (const vp of VIEWPORTS) {
    const g = `B-kaynak-arama-${vp.tag}`;
    const api = sourcesApi();
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}?q=${encodeURIComponent("MİDE")}`, { waitUntil: "load" });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 15000 });
      await sleep(1500);
      ok(g, "çipte eşleşme sayısı yalnız eşleşen kaynakta", /🔍\s*1/.test(await chips(page).nth(1).innerText()) && (await chips(page).first().getByTestId("stone-source-hits").count()) === 0);
      const fz = block(page, "Fiziksel Etkiler");
      ok(g, "eşleşen bölüm işaretli (Ahmet'in metni)", /Eşleşme|eşleşme|🔍/.test(await fz.innerText()));
      ok(g, "eşleşen kaynak bloğu tam ve kendi adıyla görünür", (await entryOf(fz, AHMET_ID).innerText()).includes("Ahmet: mide kramplarında rahatlatır."));
      const marks = await page.locator("main mark").allInnerTexts();
      const hc = await page.evaluate(() => globalThis.CSS?.highlights?.get("yasam-search-hit")?.size ?? 0);
      ok(g, "WT8 sarı vurgu korunur (kaynak metninde)", marks.some((m) => /mide/i.test(m)) || hc > 0, JSON.stringify({ marks, hc }));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── C/D/E/J) Düzenleme: kaynak başına satır, B'yi düzenlemek A'yı değiştirmez, boş alan A'yı silmez ─
async function testSourcesEdit() {
  for (const vp of VIEWPORTS) {
    const g = `C-kaynak-duzenle-${vp.tag}`;
    const api = sourcesApi();
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("stone-sources-bar").waitFor({ timeout: 15000 });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 10000 });
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
      ok(g, "yeni kaynak çipi eklendi", (await chips(page).count()) === 3);
      const fz = block(page, "Fiziksel Etkiler");
      ok(g, "düzenleme modunda Fiziksel Etkiler: HER kaynak için ayrı satır (boş olan dahil)", (await fz.getByTestId("source-edit-row").count()) === 3);
      if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/m14-duzenle-${vp.tag}.png`, fullPage: true });
      ok(g, "yeni (boş) kaynak satırı '+ Ekle' sunar", /\+ Ekle/.test(await rowOf(fz, NEW_ID).innerText()));
      // yeni kaynağın satırı → editör BOŞ açılır (başka kaynağın metni GELMEZ) → kaydet → yalnız o kaynağa
      await rowOf(fz, NEW_ID).click();
      let ta = page.locator("textarea").first();
      await ta.waitFor({ timeout: 5000 });
      ok(g, "editör başlığında hedef kaynak adı", (await page.locator("body").innerText()).includes("Fiziksel Etkiler · Kendi Ders Notlarım"));
      ok(g, "yeni kaynağın editörü boş (birincil/Ahmet metni sızmaz)", (await ta.inputValue()) === "");
      await ta.fill("Kendi notum: fiziksel.");
      await saveEditor(page);
      let pw = api.writes.filter((w) => w.m === "PATCH");
      ok(g, "yeni kaynak alanı → PATCH /sources/<yeni> yalnız physical_effects", pw.length === 1 && pw[0].path === `sources/${NEW_ID}` && JSON.stringify(Object.keys(pw[0].body).sort()) === JSON.stringify(["physical_effects"]) && pw[0].body.physical_effects === "Kendi notum: fiziksel.", JSON.stringify(pw));
      ok(g, "kaydedilen metin kendi kaynak satırında", (await rowOf(fz, NEW_ID).innerText()).includes("Kendi notum: fiziksel."));
      // D) Ahmet (Kaynak B) düzenlenir → birincil (A) değişmez
      await rowOf(fz, AHMET_ID).click();
      ta = page.locator("textarea").first();
      await ta.waitFor({ timeout: 5000 });
      ok(g, "Ahmet satırı → editörde Ahmet'in metni", (await ta.inputValue()) === "Ahmet: mide kramplarında rahatlatır.");
      await ta.fill("Ahmet güncel: BBB.");
      await saveEditor(page);
      ok(g, "D: Ahmet düzenlemesi → PATCH /sources/<ahmet>; birincil metin AYNEN", api.writes.at(-1).path === `sources/${AHMET_ID}` && api.getRow().physical_effects === "Birincil fiziksel etkiler." && !api.writes.some((w) => w.path === "stone"));
      // E) Ahmet'in alanı boşaltılır → yalnız Ahmet NULL; birincil + diğer kaynak korunur
      await rowOf(fz, AHMET_ID).click();
      await page.locator("textarea").first().fill("");
      await saveEditor(page);
      const last = api.writes.at(-1);
      const ahmet = api.getExtras().find((e) => e.id === AHMET_ID);
      ok(g, "E: boş alan yalnız o kaynağa NULL olarak yazılır", last.path === `sources/${AHMET_ID}` && last.body.physical_effects === null && ahmet.physical_effects == null, JSON.stringify(last));
      ok(g, "E: birincil ve diğer kaynak metni SİLİNMEDİ", api.getRow().physical_effects === "Birincil fiziksel etkiler." && api.getExtras().find((e) => e.id === NEW_ID).physical_effects === "Kendi notum: fiziksel.");
      ok(g, "E: Ahmet'in diğer alanı (Genel Bilgi) korunur", ahmet.general_info === "Ahmet genel.");
      // birincil satır → mevcut taş PATCH'i
      await rowOf(fz, "primary").click();
      ta = page.locator("textarea").first();
      await ta.waitFor({ timeout: 5000 });
      ok(g, "birincil satır → editörde birincil metin", (await ta.inputValue()) === "Birincil fiziksel etkiler.");
      await ta.fill("Birincil güncel.");
      await saveEditor(page);
      const sw = api.writes.filter((w) => w.path === "stone");
      ok(g, "birincil kaynak alanı → mevcut taş PATCH'i", sw.length === 1 && sw[0].body.physical_effects === "Birincil güncel.", JSON.stringify(sw));
      ok(g, "birincil düzenleme ek kaynakları değiştirmedi", api.getExtras().find((e) => e.id === NEW_ID).physical_effects === "Kendi notum: fiziksel.");
      // çakra: kaynak başına
      const chb = page.getByTestId("source-chakra-block");
      await rowOf(chb, NEW_ID).click();
      await sleep(500);
      const lbl = page.locator("label, button", { hasText: "Kalp Çakrası" }).last();
      if (await lbl.count()) { await lbl.click(); await saveEditor(page); }
      const cw = api.writes.at(-1);
      ok(g, "çakra seçimi yalnız hedef kaynağa (PATCH /sources/<yeni> chakras)", cw.path === `sources/${NEW_ID}` && Array.isArray(cw.body.chakras) && cw.body.chakras.includes("Kalp Çakrası") && JSON.stringify(api.getRow().chakras) === JSON.stringify(["Kök Çakra"]), JSON.stringify(cw));
      // ad düzenle (Ahmet) — çipteki ✎
      await page.locator(`[data-testid="stone-source-rename"][data-source-id="${AHMET_ID}"]`).click();
      await page.getByTestId("stone-source-name-input").fill("Ahmet Hoca Eğitim Notları");
      await page.getByTestId("stone-source-save").click();
      await sleep(700);
      ok(g, "kaynak adı düzenlendi (PATCH source_name) → blok etiketleri yeni ad", api.writes.some((w) => w.path === `sources/${AHMET_ID}` && w.body.source_name === "Ahmet Hoca Eğitim Notları") && /Ahmet Hoca Eğitim Notları/.test(await chips(page).nth(1).innerText()) && /Ahmet Hoca Eğitim Notları/.test(await rowOf(fz, AHMET_ID).textContent()));
      // J) yeniden yükle → kalıcı metinler kendi kaynaklarında
      await page.reload({ waitUntil: "load" });
      await page.getByTestId("source-text-block").first().waitFor({ timeout: 15000 });
      await sleep(600);
      const fz2 = block(page, "Fiziksel Etkiler");
      ok(g, "J: yeniden yükleme sonrası her metin kendi kaynağında", (await entryOf(fz2, "primary").innerText()).includes("Birincil güncel.") && (await entryOf(fz2, NEW_ID).innerText()).includes("Kendi notum: fiziksel.") && (await entryOf(fz2, AHMET_ID).count()) === 0);
      ok(g, "J: Ahmet'in Genel Bilgi bloğu duruyor", (await entryOf(block(page, "Genel Taş Açıklaması"), AHMET_ID).innerText()).includes("Ahmet genel."));
      // sil (Ahmet) — onaylı, çipteki ✕
      await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
      await page.locator(`[data-testid="stone-source-delete"][data-source-id="${AHMET_ID}"]`).waitFor({ timeout: 5000 });
      await page.locator(`[data-testid="stone-source-delete"][data-source-id="${AHMET_ID}"]`).click();
      for (let k = 0; k < 2; k++) {
        const okBtn = page.getByTestId("confirm-ok");
        if (await okBtn.count()) { await okBtn.click(); await sleep(400); }
      }
      await sleep(600);
      ok(g, "ek kaynak silindi (onaylı DELETE), diğerleri duruyor", api.writes.some((w) => w.m === "DELETE" && w.path === `sources/${AHMET_ID}`) && (await chips(page).count()) === 2 && (await page.locator("main").innerText()).includes("ZZ Akik"));
      ok(g, "yatay taşma yok", await noHScroll(page));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── D/K) Tek kaynaklı / eski kayıt: eski görünüm (blok yok), silinemez, adı belirtilmemiş ─────────
async function testSingleSource() {
  for (const vp of VIEWPORTS) {
    const g = `D-tek-kaynak-${vp.tag}`;
    const api = sourcesApi({ withExtra: false, primary: { primary_source_name: null } });
    const { page, ctx, pageErrors } = await newPage({ viewport: vp, routes: api.routes });
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
      await page.getByTestId("stone-sources-bar").waitFor({ timeout: 15000 });
      await sleep(600);
      ok(g, "eski kayıt: 'Kaynak belirtilmemiş' tek çip", (await chips(page).count()) === 1 && /Kaynak belirtilmemiş/.test(await chips(page).first().innerText()));
      ok(g, "tek kaynakta kaynak blokları YOK (gereksiz karmaşa yok, eski görünüm)", (await page.getByTestId("source-text-block").count()) === 0 && (await page.getByTestId("source-field-entry").count()) === 0);
      ok(g, "içerik eski kartta aynen", (await card(page, "Fiziksel").innerText()).includes("Birincil fiziksel etkiler."));
      ok(g, "açıklama: metinler bu kaynağa ait", /Kaynak belirtilmemiş/.test(await page.getByTestId("stone-source-hint").innerText()));
      await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
      await page.getByTestId("stone-source-delete").waitFor({ timeout: 5000 });
      ok(g, "taşın tek kaynağı silinemez (buton pasif + açıklama)", (await page.getByTestId("stone-source-delete").isDisabled()) && /tek kaynağı silinemez/.test(await page.getByTestId("stone-sources-bar").innerText()));
      ok(g, "'Kaynak adı ver' sunulur", (await page.getByTestId("stone-source-rename").getAttribute("title")) === "Kaynak adı ver");
      // tek kaynakta eski düzenleme akışı: kart → taş PATCH'i
      await card(page, "Fiziksel").click();
      await page.locator("textarea").first().fill("Eski kayıt güncel.");
      await saveEditor(page);
      ok(g, "tek kaynakta düzenleme mevcut taş PATCH'i (eski akış)", api.writes.some((w) => w.path === "stone" && w.body.physical_effects === "Eski kayıt güncel."));
      await page.getByTestId("stone-source-rename").click();
      await page.getByTestId("stone-source-name-input").fill("Kristal Şifa Kitabı");
      await page.getByTestId("stone-source-save").click();
      await sleep(700);
      ok(g, "birincile ad verildi → PATCH /sources/primary", api.writes.some((w) => w.path === "sources/primary" && w.body.source_name === "Kristal Şifa Kitabı") && /Kristal Şifa Kitabı/.test(await chips(page).first().innerText()));
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

// ── F) Kombinasyon Oluştur taş paneli: alan içi kaynak blokları (salt-okunur), seçim/ekleme mantığı aynı ──
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
      ok(g, "panelde 2 kaynak çipi (birincil + ek), sekme YOK", (await c.count()) === 2 && /Kristal Şifa Kitabı/.test(await c.first().innerText()) && /Ahmet Hoca/.test(await c.nth(1).innerText()) && (await panel.getByRole("tab").count()) === 0);
      ok(g, "koşul (Kalp) eşleşmesi ek kaynak çipinde rozetli", /🔍/.test(await c.nth(1).innerText()));
      const txt = await panel.innerText();
      const gen = panel.locator("section", { hasText: "Ahmet genel: kalp bölgesi." }).first();
      const genIds = await gen.getByTestId("source-field-entry").evaluateAll((els) => els.map((e) => e.getAttribute("data-source-id")));
      ok(g, "Genel Bilgi: iki kaynak AYRI blokta, birlikte görünür (sekme değiştirmeden)", genIds.join() === `primary,${AHMET_ID}` && txt.includes("Kristal genel bilgi (birincil).") && txt.includes("Ahmet genel: kalp bölgesi."), genIds.join());
      const ahmetBlock = await gen.locator(`[data-testid="source-field-entry"][data-source-id="${AHMET_ID}"]`).innerText();
      ok(g, "Ahmet bloğu yalnız Ahmet'in metni + adı (karışmaz)", /Ahmet Hoca/i.test(ahmetBlock) && ahmetBlock.includes("Ahmet genel: kalp bölgesi.") && !ahmetBlock.includes("birincil"));
      const chs = panel.locator("section", { hasText: "Kalp Çakrası" }).first();
      ok(g, "çakralar kaynak başına (Kök → Kristal, Kalp → Ahmet)", (await chs.getByTestId("source-field-entry").count()) === 2);
      ok(g, "salt-okunur (ekle/sil yok)", (await panel.getByTestId("stone-source-add").count()) === 0 && (await panel.getByTestId("stone-source-delete").count()) === 0 && (await panel.getByTestId("source-edit-row").count()) === 0);
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
