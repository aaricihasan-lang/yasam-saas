// B8b (05.11 canlı denetim) — Mineral detayında "← Mineral Listesi" (arama varsa "← Aramaya Dön", q korunur);
// düzenleme modunda görünmez. Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b8b-mineral-geri.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const MID = "b8b00000-0000-4000-8000-000000000001";
const MINERAL = { id: MID, tenant_id: TENANT, source_id: "zz-min", name: "ZZ Mineral", aciklama: "ZZ demir açıklama", kategori: "ZZ", organ_etkileri: [], fiziksel: [], zihinsel: [], cakralar: [], fizyoloji: [], eksiklik_belirtileri: [], fazlalik_belirtileri: [], doz_asimi: [], iceren_taslar: [], created_at: "2026-10-01T08:00:00.000Z", updated_at: "2026-10-01T08:00:00.000Z" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();
for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `b8b-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
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
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === `/api/dogaltas/minerals/${MID}`) return route.fulfill({ status: 200, json: { ok: true, row: MINERAL } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  try {
    await page.goto(`${BASE}/dogaltas/mineral-listesi/${MID}`, { waitUntil: "load" });
    await page.getByText("ZZ Mineral").first().waitFor({ timeout: 60000 });
    const back = page.getByRole("link", { name: "← Mineral Listesi" });
    ok(g, "detayda '← Mineral Listesi' görünür", await back.count() === 1);
    ok(g, "bağlantı mineral listesine gider", (await back.getAttribute("href")) === "/dogaltas/mineral-listesi");
    await hit(page.getByRole("button", { name: "Düzenle" }).first());
    await sleep(500);
    ok(g, "düzenleme modunda geri bağlantısı yok (kaydedilmemiş değişiklik korunur)", await page.getByRole("link", { name: "← Mineral Listesi" }).count() === 0);
    await page.goto(`${BASE}/dogaltas/mineral-listesi/${MID}?q=demir`, { waitUntil: "load" });
    await page.getByText("ZZ Mineral").first().waitFor({ timeout: 60000 });
    const back2 = page.getByRole("link", { name: "← Aramaya Dön" });
    ok(g, "arama bağlamında '← Aramaya Dön' ve q korunur", await back2.count() === 1 && (await back2.getAttribute("href")) === "/dogaltas/mineral-listesi?q=demir");
    await hit(back2);
    await page.waitForURL(/\/dogaltas\/mineral-listesi\?q=demir$/, { timeout: 15000 }).catch(() => {});
    ok(g, "tıklanınca aramalı listeye dönülür", /\/dogaltas\/mineral-listesi\?q=demir$/.test(page.url()), page.url());
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
