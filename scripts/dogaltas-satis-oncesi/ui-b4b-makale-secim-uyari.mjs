// B4b (05.11 canlı denetim) — Taş Makaleleri: seçim yokken "Seçili Güncelle" / "Seçili Sil" sessiz kalmaz, açıklayıcı
// uyarı gösterir; seçim varken mevcut akış (güncelle modalı / silme onayı) aynen. Hiçbir yazma isteği gitmez.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b4b-makale-secim-uyari.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const WARN = "Önce listeden en az bir makale seçin.";
const articles = Array.from({ length: 3 }, (_, i) => ({
  id: `a0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, tenant_id: TENANT, title: `ZZ Makale ${i}`,
  category: "Genel", sub_category: "", tags: [], related_stones: [], related_minerals: [], source: "", source_section: "", keyword: "", notes: "", is_active: true, content: `İçerik ${i}`, updated_at: "2026-10-01T08:00:00.000Z",
}));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `b4b-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  const writes = [];
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (req.method() !== "GET") writes.push(`${req.method()} ${url.pathname}`);
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === "/api/dogaltas/knowledge") return route.fulfill({ status: 200, json: { ok: true, articles } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  try {
    await page.goto(`${BASE}/dogaltas/tas-bilgi-kutuphanesi`, { waitUntil: "load" });
    await page.getByText("ZZ Makale 0").first().waitFor({ timeout: 60000 });
    const upd = page.getByRole("button", { name: "Seçili Güncelle" }).first();
    const del = page.getByRole("button", { name: "Seçili Sil" }).first();
    ok(g, "seçim yokken düğmeler soluk görünür ama etkin (uyarı verebilmek için)", (await upd.getAttribute("data-no-selection")) === "true" && (await del.getAttribute("data-no-selection")) === "true" && !(await upd.isDisabled()) && !(await del.isDisabled()));
    await hit(upd);
    await page.getByText(WARN).first().waitFor({ timeout: 8000 }).catch(() => {});
    ok(g, "Seçili Güncelle (seçimsiz) → uyarı gösterilir", await page.getByText(WARN).count() > 0);
    ok(g, "Seçili Güncelle (seçimsiz) → güncelleme penceresi AÇILMAZ", await page.getByText("Kayıt Güncelle").count() === 0);
    await sleep(4500);
    await hit(del);
    await page.getByText(WARN).first().waitFor({ timeout: 8000 }).catch(() => {});
    ok(g, "Seçili Sil (seçimsiz) → uyarı gösterilir", await page.getByText(WARN).count() > 0);
    ok(g, "Seçili Sil (seçimsiz) → silme onayı açılmaz", await page.getByText("Kalıcı Olarak Sil", { exact: false }).count() === 0);
    // Seçim varken mevcut akış
    await hit(page.locator("main input[type=checkbox]").first());
    await sleep(300);
    ok(g, "seçim varken soluk işaret kalkar", (await upd.getAttribute("data-no-selection")) === null);
    await hit(upd);
    await page.getByText("Kayıt Güncelle").first().waitFor({ timeout: 8000 }).catch(() => {});
    ok(g, "seçim varken Seçili Güncelle → güncelleme penceresi açılır (mevcut)", await page.getByText("Kayıt Güncelle").count() > 0);
    await hit(page.getByRole("button", { name: "İptal" }).last());
    await sleep(300);
    await hit(del);
    await page.getByText("Kalıcı Olarak Sil", { exact: false }).first().waitFor({ timeout: 8000 }).catch(() => {});
    ok(g, "seçim varken Seçili Sil → onay penceresi açılır (mevcut)", await page.getByText("Kalıcı Olarak Sil", { exact: false }).count() > 0);
    await hit(page.getByRole("button", { name: "Vazgeç" }).last());
    await sleep(300);
    ok(g, "hiçbir yazma isteği gitmedi", writes.length === 0, writes.join(","));
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok(g, "beklenmeyen hata", false, String(e?.stack ?? e));
  }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
