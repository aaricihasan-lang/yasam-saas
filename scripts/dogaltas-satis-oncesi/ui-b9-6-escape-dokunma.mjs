// B9.6 (05.11 canlı denetim) — Taş detayı: (1) görsel büyütme penceresi Escape ile kapanır (× ve arka plan aynen);
// (2) mobilde kaynaklı bilgi kartındaki "Tam okumak için tıklayın" dokunma alanı ≥ 44 px (masaüstünde görünüm aynı).
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b9-6-escape-dokunma.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const SID = "b9600000-0000-4000-8000-000000000001";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");
const STONE = {
  id: SID, tenant_id: TENANT, stone_name: "ZZ TAŞ", short_description: "Kısa açıklama", general_info: "Genel bilgi metni ".repeat(20),
  primary_source_name: "ZZ Kaynak", warning_tags: [], chakras: [], assignments: {}, created_at: "2026-10-01T08:00:00.000Z", updated_at: "2026-10-01T08:00:00.000Z",
  images: [{ file_path: `${TENANT}/zz/1.png`, name: "zz-1.png" }],
};
const ENTRIES = [
  { id: "e1", stone_id: SID, field_key: "general_info", content: "Ek kaynak bilgisi bir.", source_name: "ZZ Ek Kaynak", created_at: "2026-10-02T08:00:00.000Z" },
  { id: "e2", stone_id: SID, field_key: "general_info", content: "Ek kaynak bilgisi iki.", source_name: "ZZ Ek Kaynak 2", created_at: "2026-10-03T08:00:00.000Z" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();
for (const vp of [{ width: 320, height: 640, tag: "mobil320" }, { width: 372, height: 800, tag: "mobil372" }, { width: 390, height: 844, tag: "mobil390" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `b9-6-${vp.tag}`;
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
    if (url.pathname === "/zz-img.png") return route.fulfill({ status: 200, headers: { "Content-Type": "image/png" }, body: PNG });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === `/api/dogaltas/stones/${SID}`) return route.fulfill({ status: 200, json: { ok: true, row: STONE } });
    if (url.pathname === `/api/dogaltas/stones/${SID}/entries`) return route.fulfill({ status: 200, json: { ok: true, entries: ENTRIES } });
    if (url.pathname === `/api/dogaltas/stones/${SID}/sources`) return route.fulfill({ status: 200, json: { ok: true, sources: [] } });
    if (url.pathname === "/api/dogaltas/stones/photos/signed-urls") return route.fulfill({ status: 200, json: { ok: true, urls: { [STONE.images[0].file_path]: `${BASE}/zz-img.png` } } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  try {
    await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${SID}`, { waitUntil: "load" });
    await page.getByText("ZZ TAŞ").first().waitFor({ timeout: 60000 });
    await sleep(1500);
    // (1) Escape
    const thumb = page.locator(`img[src="${BASE}/zz-img.png"]`).first();
    await thumb.waitFor({ timeout: 20000 });
    const overlay = () => page.locator("div.fixed.inset-0.bg-black");
    await hit(thumb);
    await overlay().first().waitFor({ timeout: 8000 });
    ok(g, "görsel büyütme penceresi açılır", await overlay().count() === 1);
    await page.keyboard.press("Escape");
    await sleep(400);
    ok(g, "Escape ile kapanır", await overlay().count() === 0);
    await hit(thumb);
    await overlay().first().waitFor({ timeout: 8000 });
    await hit(page.getByRole("button", { name: "×" }).last());
    await sleep(400);
    ok(g, "× ile kapanma aynen", await overlay().count() === 0);
    // (2) Tam okumak dokunma alanı
    const readAll = page.locator('[data-testid="source-text-block"] button', { hasText: "Tam okumak için tıklayın" }).first();
    await readAll.waitFor({ timeout: 15000 });
    const box = await readAll.boundingBox();
    if (touch) ok(g, "mobil: 'Tam okumak' dokunma yüksekliği ≥ 44 px", (box?.height ?? 0) >= 44, JSON.stringify(box));
    else ok(g, "masaüstü: 'Tam okumak' yüksekliği değişmedi (< 30 px, metin satırı)", (box?.height ?? 99) < 30, JSON.stringify(box));
    await hit(readAll);
    await sleep(600);
    ok(g, "'Tam okumak' tıklanınca okuma penceresi açılır (mevcut)", await page.getByRole("dialog").count() > 0 || (await page.locator("body").innerText()).includes("Ek kaynak bilgisi iki."));
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
