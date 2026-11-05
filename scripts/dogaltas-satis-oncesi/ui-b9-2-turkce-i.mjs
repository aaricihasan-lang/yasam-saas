// B9.2 (05.11 canlı denetim) — İstemci tarafı Türkçe İ/I: (1) Mineral Bankası yeni kayıtta source_id "QA MINERAL 0411" →
// "qa-mineral-0411" (eski "qa-m-neral-0411"); (2) sunucu dosya adı başlığı yoksa kombinasyon / mineral detay Word yedek dosya
// adı "İ" bozulmadan. Mevcut kayıtların kimlikleri değişmez (yalnız yeni kayıt üretimi).
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b9-2-turkce-i.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const MID = "b9200000-0000-4000-8000-000000000001";
const MINERAL = { id: MID, tenant_id: TENANT, source_id: "eski-kimlik-degismez", name: "İNCİ MİNERALİ", aciklama: "", kategori: "", organ_etkileri: [], fiziksel: [], zihinsel: [], cakralar: [], fizyoloji: [], eksiklik_belirtileri: [], fazlalik_belirtileri: [], doz_asimi: [], iceren_taslar: [], created_at: "2026-10-01T08:00:00.000Z", updated_at: "2026-10-01T08:00:00.000Z" };
const TITLE = "QA KOMBİNASYON 0411";
const COMBO = { id: "b9200000-0000-4000-8000-000000000101", tenant_id: TENANT, source_id: "k1", variant_index: 1, issue: TITLE, description: "", stones_text: "AKİK", notes_text: null, notes_text_2: null, notes_text_3: null, source: "", created_at: "2026-10-01T08:00:00.000Z" };
const DOCX = Buffer.from("PK\u0003\u0004zz");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();
for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, acceptDownloads: true });
  const posts = [];
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
    if (url.pathname === "/api/dogaltas/duplicate-check") return route.fulfill({ status: 200, json: { ok: true, exists: false } });
    if (url.pathname === "/api/dogaltas/minerals" && req.method() === "POST") { posts.push(JSON.parse(req.postData() || "{}")); return route.fulfill({ status: 200, json: { ok: true, id: MID } }); }
    if (url.pathname === `/api/dogaltas/minerals/${MID}`) return route.fulfill({ status: 200, json: { ok: true, row: MINERAL } });
    // Word: dosya adı başlığı YOK → istemci yedek adı kullanılır.
    if (url.pathname.endsWith("/word-report")) return route.fulfill({ status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, body: DOCX });
    if (url.pathname === "/api/dogaltas/combinations") return route.fulfill({ status: 200, json: { ok: true, rows: [COMBO], count: 1 } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  const g = `b9-2-${vp.tag}`;
  try {
    // (1) Mineral Bankası yeni kayıt source_id
    await page.goto(`${BASE}/dogaltas/mineral-bankasi`, { waitUntil: "load" });
    await hit(page.getByRole("button", { name: /Yeni Kayıt Oluştur/ }).first());
    await page.getByPlaceholder("Örn: KROM").fill("QA MINERAL 0411");
    await hit(page.getByRole("button", { name: "Kaydet", exact: true }).last());
    for (let i = 0; i < 40 && posts.length === 0; i++) await sleep(250);
    ok(g, "Mineral Bankası: 'QA MINERAL 0411' → source_id 'qa-mineral-0411'", posts[0]?.source_id === "qa-mineral-0411", JSON.stringify(posts[0] ?? {}).slice(0, 200));
    // (2) Mineral detay Word yedek dosya adı
    await page.goto(`${BASE}/dogaltas/mineral-listesi/${MID}`, { waitUntil: "load" });
    await page.getByText("İNCİ MİNERALİ").first().waitFor({ timeout: 60000 });
    ok(g, "mevcut mineral kimliği (source_id) değişmeden gösterilir", (await page.locator("body").innerText()).includes("eski-kimlik-degismez"));
    const [d1] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), hit(page.getByRole("button", { name: /Word/ }).first())]);
    ok(g, "mineral Word yedek adı 'mineral-inci-minerali-…'", /^mineral-inci-minerali-\d{4}-\d{2}-\d{2}\.docx$/.test(d1.suggestedFilename()), d1.suggestedFilename());
    // (3) Kombinasyon detay Word yedek dosya adı
    await page.goto(`${BASE}/dogaltas/kombinasyonlar/${encodeURIComponent(TITLE)}`, { waitUntil: "load" });
    await page.getByText(TITLE).first().waitFor({ timeout: 60000 });
    const [d2] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), hit(page.getByRole("button", { name: /Word/ }).first())]);
    ok(g, "kombinasyon Word yedek adı 'kombinasyon-qa-kombinasyon-0411-…'", /^kombinasyon-qa-kombinasyon-0411-\d{4}-\d{2}-\d{2}\.docx$/.test(d2.suggestedFilename()), d2.suggestedFilename());
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
