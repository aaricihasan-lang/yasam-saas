// B9.3 (05.11 canlı denetim) — Taş kaydında ad boşken uyarı profesyonel: "Taş adı zorunludur." ("hocam" yok).
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
import { chromium } from "playwright";
const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = { id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman", role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active", tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") { if (cond) pass++; else fail++; console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`); }
const browser = await chromium.launch();
async function session(vp) {
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript((u) => { try { localStorage.setItem("yasam_user", JSON.stringify(u)); localStorage.setItem("yasam_session_token", "zz-local-fake-token"); localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() })); } catch {} }, USER);
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, names: [] } });
  });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, errors, hit: (loc) => (touch ? loc.tap() : loc.click()) };
}
for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `b9-3-${vp.tag}`;
  const { ctx, page, errors, hit } = await session(vp);
  try {
    await page.goto(`${BASE}/dogaltas/dogaltas-kayit`, { waitUntil: "load" });
    await hit(page.getByRole("button", { name: /Yeni Kayıt Oluştur/ }).first());
    await page.getByPlaceholder("Örn. Ametist").waitFor({ timeout: 60000 });
    await hit(page.getByRole("button", { name: "Kaydet", exact: true }).last());
    await page.getByText("Taş adı zorunludur.").first().waitFor({ timeout: 8000 }).catch(() => {});
    ok(g, "boş ad: 'Taş adı zorunludur.' görünür", await page.getByText("Taş adı zorunludur.").count() > 0);
    ok(g, "'hocam' ifadesi yok", (await page.locator("body").innerText()).toLocaleLowerCase("tr").includes("hocam") === false);
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
