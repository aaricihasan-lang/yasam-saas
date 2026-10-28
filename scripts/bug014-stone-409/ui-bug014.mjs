// BUG-014 — Doğaltaş detay: bilgi kaydı ekle/düzenle/sil SONRASI aynı oturumda taş kaydı SAHTE 409 almaz.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Sahte API gerçek sunucunun iki davranışını taklit eder:
//   (a) stone_entries yazımı tetikleyiciyle stones.updated_at'i yeniler (20271016000000, entries_text)
//   (b) PATCH /stones/:id expectedUpdatedAt ≠ güncel updated_at → 409 code=conflict (F-03 CAS)
// Ayrıca GERÇEK eşzamanlılık (başka oturum taşı değiştirdi) hâlâ 409 vermeli (koruma kaybolmadı).
// Çalıştırma: node scripts/bug014-stone-409/ui-bug014.mjs  (UI_BASE ile port)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const PERMS = Object.fromEntries(["stones", "stok", "clients", "appointments"].map((k) => [k, true]));
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: PERMS,
};
const VIEWPORTS = [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }];
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
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 768 });
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

async function renameStone(page, name) {
  await page.getByRole("button", { name: /ZZ Akik/ }).first().click();
  const input = page.locator('input:not([type]):visible').last();
  await input.fill(name);
  await page.getByRole("button", { name: "Kaydet / Güncelle" }).click();
  await sleep(900);
}

async function run(vp) {
  const g = `bug014-${vp.tag}`;
  const api = casApi();
  const { page, ctx, pageErrors } = await newPage(vp, api.routes);
  try {
    await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${STONE_ID}`, { waitUntil: "load" });
    await page.getByTestId("source-text-block").first().waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
    await sleep(500);

    // 1) Bilgi kaydı ekle (tetikleyici updated_at'i yeniler)
    await block(page, "Fiziksel Etkiler").click();
    await editor(page).waitFor({ timeout: 5000 });
    await editor(page).getByTestId("stone-entry-new-content").fill("ZZ yeni fiziksel bilgi");
    await editor(page).getByTestId("stone-entry-new-source").fill("Ahmet Hoca");
    await editor(page).getByTestId("stone-entry-add").click();
    await sleep(900);
    ok(g, "bilgi kaydı eklendi (POST)", api.writes.some((w) => w.m === "POST" && w.path === "entries"));
    await editor(page).getByRole("button", { name: "Kapat" }).click();
    await sleep(400);

    // 2) Aynı oturumda taş adını kaydet → sahte 409 OLMAMALI
    await renameStone(page, "ZZ Akik (güncel)");
    let patches = api.writes.filter((w) => w.path === "stone");
    const body1 = await page.locator("body").innerText();
    ok(g, "ekleme sonrası taş kaydı GÜNCEL updated_at ile gider → 200 (sahte 409 yok)", patches.length === 1 && api.getRow().stone_name === "ZZ Akik (güncel)" && !/başka bir oturumda güncellendi/.test(body1), JSON.stringify(patches));

    // 3) Kayıt düzenle → yine taş kaydı (ikinci kart)
    await block(page, "Fiziksel Etkiler").click();
    await editor(page).waitFor({ timeout: 5000 });
    const row = editor(page).getByTestId("stone-entry-row").last();
    await row.getByTestId("stone-entry-edit").click();
    await row.getByTestId("stone-entry-edit-content").fill("ZZ yeni fiziksel bilgi (düzeltildi)");
    await row.getByTestId("stone-entry-edit-save").click();
    await sleep(900);
    await editor(page).getByRole("button", { name: "Kapat" }).click();
    await sleep(400);
    await page.getByRole("button", { name: /ZZ Akik \(güncel\)/ }).first().click();
    await page.locator('input:not([type]):visible').last().fill("ZZ Akik (ikinci)");
    await page.getByRole("button", { name: "Kaydet / Güncelle" }).click();
    await sleep(900);
    patches = api.writes.filter((w) => w.path === "stone");
    ok(g, "kayıt düzenleme sonrası ikinci taş kaydı da 200", patches.length === 2 && api.getRow().stone_name === "ZZ Akik (ikinci)", JSON.stringify(patches.at(-1)));

    // 4) GERÇEK eşzamanlılık: başka oturum taşı değiştirir → bu oturumun kaydı 409 (koruma duruyor)
    api.setRow({ ...api.getRow(), short_description: "BAŞKA OTURUM", updated_at: api.stamp() });
    await page.getByRole("button", { name: /ZZ Akik \(ikinci\)/ }).first().click();
    await page.locator('input:not([type]):visible').last().fill("ZZ Akik (üçüncü)");
    await page.getByRole("button", { name: "Kaydet / Güncelle" }).click();
    await sleep(900);
    const body2 = await page.locator("body").innerText();
    ok(g, "gerçek eşzamanlı değişiklikte 409 + mesaj (CAS koruması kaybolmadı)", api.getRow().stone_name === "ZZ Akik (ikinci)" && /başka bir oturumda güncellendi/.test(body2));
    const draftInput = page.locator('input:not([type]):visible').last();
    ok(g, "409 sonrası düzenleyici açık ve kullanıcının yazdığı taslak KORUNDU", (await draftInput.count()) === 1 && (await draftInput.inputValue()) === "ZZ Akik (üçüncü)");
    ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

for (const vp of VIEWPORTS) await run(vp);
await browser?.close();
console.log(`\nBUG-014 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
