// G1-01 (Android) — Doğaltaş Bilgi kaydı "Kaynak" alanları: resmî Android uygulamasında (WebView UA:
// "; wv)" / "YasamSistemiAndroid/") yerel <datalist> bağlantısı YOK; Android Chrome ve masaüstünde aynen VAR.
// Her ortamda hazır doldurma, tümünü seçme, yazma ve kaydetme aynı. Ağ-mock; prod'a SIFIR temas.
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup1-mobil/ui-g1-01-android.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const PERMS = Object.fromEntries(["stones", "stok", "clients", "appointments"].map((k) => [k, true]));
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: PERMS,
};
const APP_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 YasamSistemiAndroid/1.0";
const CHROME_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36";
const VIEWPORTS = [
  { width: 390, height: 844, tag: "android-uygulama", ua: APP_UA, expectList: false },
  { width: 390, height: 844, tag: "android-chrome", ua: CHROME_UA, expectList: true },
  { width: 1280, height: 900, tag: "web", ua: undefined, expectList: true },
];
const STONE_ID = "f0000000-0000-4000-8000-000000000091";
const FIELDS = ["short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects", "feng_shui", "meditation", "care", "application", "warning_text"];

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

function casApi() {
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 1, 9, 0, tick++)).toISOString();
  let row = {
    id: STONE_ID, tenant_id: TENANT, stone_name: "ZZ Akik", primary_source_name: "Kristal Şifa Kitabı",
    short_description: "Kısa", general_info: "Genel bilgi.", source_note: null, physical_effects: "Birincil fiziksel.", spiritual_effects: null,
    other_effects: null, warning_text: null, warning_tags: [], feng_shui: null, meditation: null, care: null, application: null,
    chakras: ["Kök Çakra"], assignments: {}, images: [], created_at: "2026-10-01T08:00:00.000Z", updated_at: stamp(),
  };
  let entries = [];
  let seq = 100;
  const writes = [];
  const bump = () => { row = { ...row, updated_at: stamp() }; }; // (a) tetikleyici taklidi
  const view = () => [{ id: "primary", name: row.primary_source_name, isPrimary: true, sortOrder: -1,
    fields: { ...Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? null])), chakras: row.chakras }, updatedAt: row.updated_at }];
  const routes = [
    ["GET", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/sources$`), () => ({ status: 200, json: { ok: true, sources: view(), schemaMissing: false } })],
    ["GET", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/entries$`), () => ({ status: 200, json: { ok: true, entries, schemaMissing: false } })],
    ["POST", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/entries$`), (_r, _u, body) => {
      writes.push({ m: "POST", path: "entries", body });
      const created = { id: `e0000000-0000-4000-8000-000000000${seq++}`, tenant_id: TENANT, stone_id: STONE_ID, field_key: body.field_key,
        content: body.content, source_name: body.source_name, sort_order: entries.length, created_at: stamp(), updated_at: null };
      entries.push(created);
      bump();
      return { status: 201, json: { ok: true, entry: created } };
    }],
    ["PATCH", new RegExp(`^/api/dogaltas/stones/${STONE_ID}/entries/[^/]+$`), (_r, url, body) => {
      const eid = decodeURIComponent(url.pathname.split("/").pop());
      writes.push({ m: "PATCH", path: `entries/${eid}`, body });
      const e = entries.find((x) => x.id === eid);
      if (!e) return { status: 404, json: { ok: false, error: "Kayıt bulunamadı." } };
      if ("content" in body) e.content = body.content;
      if ("source_name" in body) e.source_name = body.source_name;
      bump();
      return { status: 200, json: { ok: true, entry: e } };
    }],
    ["GET", new RegExp(`^/api/dogaltas/stones/${STONE_ID}$`), () => ({ status: 200, json: { ok: true, row } })],
    ["PATCH", new RegExp(`^/api/dogaltas/stones/${STONE_ID}$`), (_r, _u, body) => {
      writes.push({ m: "PATCH", path: "stone", body });
      if (body.expectedUpdatedAt && body.expectedUpdatedAt !== row.updated_at) { // (b) CAS
        return { status: 409, json: { ok: false, code: "conflict", error: "Bu kayıt başka bir oturumda güncellendi. Son verileri yenileyip değişikliklerinizi kontrol edin." } };
      }
      const { expectedUpdatedAt: _x, ...fields } = body;
      row = { ...row, ...fields, updated_at: stamp() };
      return { status: 200, json: { ok: true, id: STONE_ID, row } };
    }],
    ["GET", /^\/api\/dogaltas\/stone-sources\/names/, () => ({ status: 200, json: { ok: true, names: ["Kristal Şifa Kitabı", "Ahmet Hoca"] } })],
  ];
  return { routes, writes, getRow: () => row, setRow: (r) => { row = r; }, stamp };
}

async function newPage(viewport, routes) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.width < 768, isMobile: viewport.width < 768, ...(viewport.ua ? { userAgent: viewport.ua } : {}) });
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
  return { ctx, page, pageErrors };
}

const editor = (page) => page.getByTestId("stone-entries-editor");
const block = (scope, title) => scope.getByTestId("source-text-block").filter({ has: scope.locator(`h2:text-is("${title}"), h3:text-is("${title}")`) }).first();

async function run(vp) {
  const g = `g1-01a-${vp.tag}`;
  const api = casApi();
  const { page, ctx, pageErrors } = await newPage(vp, api.routes);
  const touch = vp.width < 768;
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  const src = () => editor(page).getByTestId("stone-entry-new-source");
  const content = () => editor(page).getByTestId("stone-entry-new-content");
  const posted = () => api.writes.filter((w) => w.m === "POST").map((w) => w.body.source_name);
  const listOk = (attr) => (vp.expectList ? Boolean(attr) : attr === null);
  const want = vp.expectList ? "VAR" : "YOK";
  try {
    await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
    await page.getByTestId("source-text-block").first().waitFor({ timeout: 60000 });
    const isApp = await page.evaluate(() => document.documentElement.hasAttribute("data-android-app"));
    ok(g, `sunucu işareti data-android-app ${vp.expectList ? "yok" : "var"} (UA tespiti)`, isApp === !vp.expectList, String(isApp));
    await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
    await sleep(600);
    await block(page, "Fiziksel Etkiler").click();
    await editor(page).waitFor({ timeout: 5000 });

    const newAttr = await src().getAttribute("list");
    ok(g, `Yeni Bilgi Kaynak alanında öneri bağlantısı ${want}`, listOk(newAttr), String(newAttr));
    const opts = await editor(page).getByTestId("stone-entry-source-suggestions").locator("option").evaluateAll((os) => os.map((o) => o.value));
    ok(g, "öneri listesi verisi sayfada korunur", opts.includes("Kristal Şifa Kitabı") && opts.includes("Ahmet Hoca"), JSON.stringify(opts));
    ok(g, "Kaynak hazır doldurma aynen", (await src().inputValue()) === "Kristal Şifa Kitabı");

    // Hazır değere dokunmadan kaydet → aynen
    await hit(content()); await page.keyboard.type("Bilgi bir", { delay: 5 });
    await hit(editor(page).getByTestId("stone-entry-add")); await sleep(900);
    ok(g, "dokunulmayan hazır kaynak aynen kaydedilir", posted().at(-1) === "Kristal Şifa Kitabı", JSON.stringify(posted()));
    // Dokunup yaz → yeni kaynak yerine geçer (G1-01 tümünü seçme)
    await hit(content()); await page.keyboard.type("Bilgi iki", { delay: 5 });
    await hit(src()); await page.keyboard.type("Ahmet Hoca", { delay: 5 });
    ok(g, "dokunup yazınca yeni kaynak eskisinin yerine geçer", (await src().inputValue()) === "Ahmet Hoca", await src().inputValue());
    await hit(editor(page).getByTestId("stone-entry-add")); await sleep(900);
    ok(g, "kaydedilen kaynak = yazılan", posted().at(-1) === "Ahmet Hoca", JSON.stringify(posted()));
    // İkinci dokunuş normal imleç → ekleme
    await hit(content()); await page.keyboard.type("Bilgi üç", { delay: 5 });
    await hit(src()); await hit(src()); await page.keyboard.press("End"); await page.keyboard.type(" s.42", { delay: 5 });
    ok(g, "ikinci dokunuşta hazır kaynağa ekleme yapılabilir", (await src().inputValue()) === "Ahmet Hoca s.42", await src().inputValue());
    await src().fill("");
    await hit(editor(page).getByTestId("stone-entry-add")); await sleep(300);
    ok(g, "boş kaynakta zorunlu uyarısı korunur", /Kaynak zorunludur/.test(await editor(page).innerText()));

    // Mevcut bilgiyi düzenle: Kaynak alanı da aynı kural
    const row = editor(page).getByTestId("stone-entry-row").last();
    await row.getByTestId("stone-entry-edit").click();
    const editSrc = row.getByTestId("stone-entry-edit-source");
    const editAttr = await editSrc.getAttribute("list");
    ok(g, `Düzenle Kaynak alanında öneri bağlantısı ${want}`, listOk(editAttr), String(editAttr));
    await editSrc.fill("Mehmet Hoca");
    await row.getByTestId("stone-entry-edit-save").click(); await sleep(900);
    const patch = api.writes.filter((w) => w.m === "PATCH" && w.path.startsWith("entries/")).at(-1);
    ok(g, "düzenlenen kaynak kaydedilir", patch?.body?.source_name === "Mehmet Hoca", JSON.stringify(patch));
    ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

for (const vp of VIEWPORTS) await run(vp);
await browser?.close();
console.log(`\nG1-01 Android UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
