// B4a (05.11 canlı denetim) — Mineral ve Makale Word raporu: sonuç yoksa (404, seçim-kayıp değil) gerçeği söyleyen
// mesaj; diğer hatalarda (500 / selection_missing) mevcut genel mesaj aynen. Rapor motoru değişmez.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b4a-rapor-sonuc-yok.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const NO_MIN = "Bu seçim için rapora eklenecek mineral bulunamadı.";
const NO_ART = "Bu seçim için rapora eklenecek makale bulunamadı.";
const GENERIC = "Word raporu oluşturulamadı. Lütfen tekrar deneyin.";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();
// Senaryo: rapor ucu ne dönecek
const SCEN = {
  empty: { status: 404, body: { ok: false, error: "Bu seçim için … bulunamadı." } },
  missing: { status: 404, body: { ok: false, code: "selection_missing", error: "Seçilen kayıtlardan bazıları bulunamadı" } },
  server: { status: 500, body: { ok: false, error: "x" } },
};

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const touch = vp.width < 768;
  for (const [scen, resp] of Object.entries(SCEN)) {
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
      if (url.pathname === "/api/dogaltas/mineral-report" || url.pathname === "/api/dogaltas/knowledge-report") return route.fulfill({ status: resp.status, json: resp.body });
      if (url.pathname === "/api/dogaltas/knowledge") return route.fulfill({ status: 200, json: { ok: true, articles: [] } });
      if (url.pathname === "/api/dogaltas/minerals") return route.fulfill({ status: 200, json: url.searchParams.get("mode") === "count" ? { ok: true, count: 0 } : { ok: true, rows: [] } });
      return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    const hit = (loc) => (touch ? loc.tap() : loc.click());
    const expectMin = scen === "empty" ? NO_MIN : GENERIC;
    const expectArt = scen === "empty" ? NO_ART : GENERIC;
    const g = `b4a-${vp.tag}-${scen}`;
    try {
      await page.goto(`${BASE}/dogaltas/mineral-listesi`, { waitUntil: "load" });
      await hit(page.getByRole("button", { name: /Word Raporu/ }).first());
      await hit(page.getByRole("button", { name: "Rapor Oluştur" }).first());
      await page.getByText(expectMin, { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {});
      ok(g, `Mineral: '${expectMin}'`, await page.getByText(expectMin, { exact: false }).count() > 0);
      if (scen === "empty") ok(g, "Mineral: genel hata mesajı gösterilmez", await page.getByText(GENERIC, { exact: false }).count() === 0);

      await page.goto(`${BASE}/dogaltas/tas-bilgi-kutuphanesi`, { waitUntil: "load" });
      await hit(page.getByRole("button", { name: /Word Raporu/ }).first());
      await hit(page.getByRole("button", { name: "Rapor Oluştur" }).first());
      await page.getByText(expectArt, { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {});
      ok(g, `Makale: '${expectArt}'`, await page.getByText(expectArt, { exact: false }).count() > 0);
      if (scen === "empty") ok(g, "Makale: genel hata mesajı gösterilmez", await page.getByText(GENERIC, { exact: false }).count() === 0);
      ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
    } catch (e) {
      ok(g, "beklenmeyen hata", false, String(e?.stack ?? e));
    }
    await ctx.close();
    await sleep(100);
  }
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
