// B9.5 (05.11 canlı denetim) — Taş Makaleleri yeni kayıt formu: Kaydet'e (en altta) basıldığında doğrulama hatası
// (formun üstünde) görünür alana kaydırılır ve role="alert" ile duyurulur. Yazma isteği gitmez.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b9-5-makale-hata.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();
for (const vp of [{ width: 320, height: 640, tag: "mobil320" }, { width: 390, height: 844, tag: "mobil390" }, { width: 1280, height: 720, tag: "web" }]) {
  const g = `b9-5-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  const writes = [];
  const saved = [];
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
    if (req.method() !== "GET") writes.push(url.pathname);
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === "/api/dogaltas/knowledge" && req.method() === "POST") { saved.push(JSON.parse(req.postData() || "{}")); return route.fulfill({ status: 200, json: { ok: true, article: { id: "b9500000-0000-4000-8000-000000000001" } } }); }
    if (url.pathname === "/api/dogaltas/knowledge") return route.fulfill({ status: 200, json: { ok: true, articles: [] } });
    if (url.pathname === "/api/dogaltas/knowledge/categories") return route.fulfill({ status: 200, json: { ok: true, categories: [{ id: "c1", name: "Genel", tenant_id: TENANT, sort_order: 0 }] } });
    if (url.pathname === "/api/dogaltas/duplicate-check") return route.fulfill({ status: 200, json: { ok: true, exists: false } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  const inView = async (loc) => {
    const b = await loc.boundingBox();
    return !!b && b.y >= 0 && b.y + b.height <= vp.height;
  };
  try {
    await page.goto(`${BASE}/dogaltas/tas-bilgi-kutuphanesi`, { waitUntil: "load" });
    await hit(page.getByRole("button", { name: /Yeni Kayıt/ }).first());
    await page.getByPlaceholder("Makale başlığı...").waitFor({ timeout: 30000 });
    // Formun altındaki Kaydet'e kaydırıp boş form gönder
    const save = page.getByRole("button", { name: "Kaydet", exact: true }).first();
    await save.scrollIntoViewIfNeeded();
    await sleep(300);
    await hit(save);
    const alert = page.getByRole("alert").filter({ hasText: "Başlık zorunludur." }).first();
    await alert.waitFor({ timeout: 8000 });
    await sleep(900);
    ok(g, "boş başlık: hata role=alert ile gösterilir", await alert.count() === 1);
    ok(g, "hata görünür alanda (kaydırıldı)", await inView(alert), JSON.stringify(await alert.boundingBox()));
    // Başlık dolu, kategori boş → sıradaki hata da görünür
    await page.getByPlaceholder("Makale başlığı...").fill("ZZ Makale");
    await save.scrollIntoViewIfNeeded();
    await sleep(300);
    await hit(save);
    const alert2 = page.getByRole("alert").filter({ hasText: /Kategori/ }).first();
    await alert2.waitFor({ timeout: 8000 });
    await sleep(900);
    ok(g, "kategori hatası da görünür alanda", await inView(alert2), JSON.stringify(await alert2.boundingBox()));
    ok(g, "geçersiz formda yazma isteği gitmedi", writes.length === 0, writes.join(","));
    // Geçerli form → normal kayıt (mevcut API) çalışır
    await page.locator("select", { has: page.locator("option", { hasText: "Kategori seç" }) }).first().selectOption({ index: 1 });
    await page.getByPlaceholder(/Makale içeriği/).first().fill("ZZ içerik");
    await page.getByRole("button", { name: "Kaydet", exact: true }).first().scrollIntoViewIfNeeded();
    await hit(page.getByRole("button", { name: "Kaydet", exact: true }).first());
    for (let i = 0; i < 40 && saved.length === 0; i++) await sleep(200);
    ok(g, "geçerli form: kayıt isteği mevcut uca gider (başlık + kategori + içerik)", saved.length === 1 && saved[0].title === "ZZ Makale" && !!saved[0].category && saved[0].content === "ZZ içerik", JSON.stringify(saved));
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
