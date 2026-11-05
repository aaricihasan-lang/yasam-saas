// B8a (05.11 canlı denetim) — Mineral ve Kombinasyon detay ekranlarında Sil: onaylı (mevcut onay kalıpları), Vazgeç'te
// istek gitmez, onayda mevcut silme ucu (mineral bulk-delete / combinations/delete) satır kimlikleriyle çağrılır ve listeye
// dönülür; demo hesapta Sil görünmez. Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b8a-detay-sil.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const mkUser = (demo) => ({
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: demo, module_permissions: { stones: true },
});
const MID = "b8a00000-0000-4000-8000-000000000001";
const MINERAL = { id: MID, tenant_id: TENANT, source_id: "zz-min", name: "ZZ Mineral", aciklama: "ZZ açıklama", kategori: "ZZ", organ_etkileri: [], fiziksel: [], zihinsel: [], cakralar: [], fizyoloji: [], eksiklik_belirtileri: [], fazlalik_belirtileri: [], doz_asimi: [], iceren_taslar: [], created_at: "2026-10-01T08:00:00.000Z", updated_at: "2026-10-01T08:00:00.000Z" };
const TITLE = "ZZ B8 KOMBİNASYON";
const COMBOS = ["c1", "c2"].map((k, i) => ({ id: `b8a00000-0000-4000-8000-00000000010${i}`, tenant_id: TENANT, source_id: `zz-src-${i}`, variant_index: i + 1, issue: TITLE, description: "ZZ amaç", stones_text: "AKİK, AMETİST", notes_text: null, notes_text_2: null, notes_text_3: null, source: "ZZ", created_at: "2026-10-01T08:00:00.000Z", updated_at: "2026-10-01T08:00:00.000Z" }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

async function session(vp, demo) {
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  const writes = [];
  const user = mkUser(demo);
  // Oturum başına sahte sunucu durumu: silme sonrası listeler bunu yansıtır.
  let minerals = [MINERAL];
  let combos = [...COMBOS];
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
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (req.method() !== "GET") writes.push({ m: req.method(), p: url.pathname, b: req.postData() });
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    if (url.pathname === `/api/dogaltas/minerals/${MID}`) return route.fulfill({ status: 200, json: { ok: true, row: MINERAL } });
    if (url.pathname === "/api/dogaltas/minerals/bulk-delete") { const ids = JSON.parse(req.postData() || "{}").ids ?? []; minerals = minerals.filter((m) => !ids.includes(m.id)); return route.fulfill({ status: 200, json: { ok: true, deleted: ids.length } }); }
    if (url.pathname === "/api/dogaltas/combinations/delete") { const ids = JSON.parse(req.postData() || "{}").ids ?? []; combos = combos.filter((c) => !ids.includes(c.id)); return route.fulfill({ status: 200, json: { ok: true, deleted: ids.length } }); }
    if (url.pathname === "/api/dogaltas/combinations") return route.fulfill({ status: 200, json: url.searchParams.get("count") ? { ok: true, count: combos.length } : { ok: true, rows: combos, count: combos.length } });
    if (url.pathname === "/api/dogaltas/minerals") return route.fulfill({ status: 200, json: url.searchParams.get("mode") === "count" ? { ok: true, count: minerals.length } : { ok: true, rows: minerals } });
    if (url.pathname === "/api/dogaltas/inventory") return route.fulfill({ status: 200, json: { ok: true, rows: [] } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, writes, errors, hit: (loc) => (touch ? loc.tap() : loc.click()) };
}
// Onay penceresinde (ilk/son adım) olumlu düğmeye bas.
async function confirmAll(page, hit, labels) {
  for (const l of labels) {
    const b = page.getByRole("button", { name: l, exact: true }).last();
    await b.waitFor({ timeout: 8000 });
    await hit(b);
    await sleep(300);
  }
}

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const mobile = vp.width < 768;
  // ── Mineral detay
  {
    const g = `b8a-mineral-${vp.tag}`;
    const { ctx, page, writes, errors, hit } = await session(vp, false);
    try {
      await page.goto(`${BASE}/dogaltas/mineral-listesi/${MID}`, { waitUntil: "load" });
      await page.getByText("ZZ Mineral").first().waitFor({ timeout: 60000 });
      const del = page.getByRole("button", { name: "Sil", exact: true }).first();
      ok(g, "detayda Sil düğmesi var", await del.count() > 0);
      await hit(del);
      await hit(page.getByRole("button", { name: "Vazgeç", exact: true }).last());
      await sleep(400);
      ok(g, "Vazgeç → silme isteği gitmez, sayfada kalınır", writes.length === 0 && page.url().includes(MID));
      await hit(del);
      await confirmAll(page, hit, mobile ? ["Evet", "Kalıcı Olarak Sil"] : ["Evet"]);
      await page.waitForURL(/\/dogaltas\/mineral-listesi$/, { timeout: 15000 }).catch(() => {});
      const w = writes.find((x) => x.p === "/api/dogaltas/minerals/bulk-delete");
      ok(g, "onay → mevcut silme ucu bu kimlikle çağrılır", !!w && JSON.parse(w.b).ids?.join() === MID, JSON.stringify(writes));
      ok(g, "silme sonrası mineral listesine dönülür", /\/dogaltas\/mineral-listesi$/.test(page.url()), page.url());
      await sleep(1500);
      ok(g, "liste güncel: silinen mineral listede yok", (await page.locator("main").innerText()).includes("ZZ Mineral") === false);
      ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
    } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
    await ctx.close();
  }
  // ── Kombinasyon detay
  {
    const g = `b8a-kombinasyon-${vp.tag}`;
    const { ctx, page, writes, errors, hit } = await session(vp, false);
    try {
      await page.goto(`${BASE}/dogaltas/kombinasyonlar/${encodeURIComponent(TITLE)}`, { waitUntil: "load" });
      await page.getByText(TITLE).first().waitFor({ timeout: 60000 });
      const del = page.getByRole("button", { name: "Sil", exact: true }).first();
      await del.waitFor({ timeout: 15000 });
      ok(g, "detayda Sil düğmesi var", await del.count() > 0);
      await hit(del);
      await hit(page.getByRole("button", { name: "Hayır", exact: true }).last());
      await sleep(400);
      ok(g, "Hayır → silme isteği gitmez", writes.length === 0);
      await hit(del);
      await confirmAll(page, hit, ["Evet", "Evet, Kalıcı Sil"]);
      await page.waitForURL(/\/dogaltas\/kombinasyonlar$/, { timeout: 15000 }).catch(() => {});
      const w = writes.find((x) => x.p === "/api/dogaltas/combinations/delete");
      ok(g, "iki adımlı onay → başlıktaki tüm satır kimlikleriyle mevcut uç", !!w && JSON.parse(w.b).ids?.sort().join() === COMBOS.map((c) => c.id).sort().join(), JSON.stringify(writes));
      ok(g, "silme sonrası kombinasyon listesine dönülür", /\/dogaltas\/kombinasyonlar$/.test(page.url()), page.url());
      await sleep(1500);
      ok(g, "liste güncel: silinen kombinasyon listede yok", (await page.locator("main").innerText()).includes(TITLE) === false);
      ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
    } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
    await ctx.close();
  }
  // ── Demo hesap: Sil görünmez
  {
    const g = `b8a-demo-${vp.tag}`;
    const { ctx, page } = await session(vp, true);
    try {
      await page.goto(`${BASE}/dogaltas/mineral-listesi/${MID}`, { waitUntil: "load" });
      await sleep(4000);
      ok(g, "demo: mineral detayında Sil yok", await page.getByRole("button", { name: "Sil", exact: true }).count() === 0);
      await page.goto(`${BASE}/dogaltas/kombinasyonlar/${encodeURIComponent(TITLE)}`, { waitUntil: "load" });
      await sleep(4000);
      ok(g, "demo: kombinasyon detayında Sil yok", await page.getByRole("button", { name: "Sil", exact: true }).count() === 0);
    } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
    await ctx.close();
  }
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
