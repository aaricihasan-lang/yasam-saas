// G1-02 (Owner B) — Mineral Bankası: mobilde bölüm seçilince yazma alanı görünür konuma kaydırılır.
// Bölüm listesi yerinde kalır; görünürse tekrar kaydırılmaz; yazarken sayfa kaymaz; masaüstü aynen.
// Klavye açık durumu görünüm yüksekliği daraltılarak taklit edilir (fiziksel cihaz değil).
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup1-mobil/ui-g1-02-kaydirma.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: false, module_permissions: { stones: true },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

async function open(vp) {
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
    window.__scrollCalls = 0;
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...a) { window.__scrollCalls++; return orig.apply(this, a); };
  }, USER);
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/dogaltas/mineral-bankasi`, { waitUntil: "load" });
  await page.locator("button.btn-primary").first().waitFor({ timeout: 60000 });
  await (touch ? page.locator("button.btn-primary").first().tap() : page.locator("button.btn-primary").first().click());
  await sleep(600);
  return { ctx, page, errors, touch };
}

const sections = (page) => page.locator("aside div.grid.grid-cols-1.gap-1 > button");
const state = (page) => page.evaluate(() => {
  const aside = [...document.querySelectorAll("aside")].find((a) => a.querySelector("div.grid.grid-cols-1.gap-1"));
  const prev = [...document.querySelectorAll("section button")].find((b) => b.querySelector("p.min-h-\\[140px\\]"));
  const r = prev.getBoundingClientRect();
  return { y: Math.round(scrollY), vh: innerHeight, pTop: Math.round(r.top), pBottom: Math.round(r.bottom),
    visible: r.top >= 0 && r.bottom <= innerHeight + 1, calls: window.__scrollCalls,
    listBeforePreview: Boolean(aside.compareDocumentPosition(prev) & Node.DOCUMENT_POSITION_FOLLOWING),
    asideItems: aside.querySelectorAll("div.grid.grid-cols-1.gap-1 > button").length };
});
// Kullanıcı gibi: butonun görünür olduğu yerde parmakla dokun (Playwright'ın kendi kaydırması olmadan)
async function tapSection(page, i) {
  const b = await sections(page).nth(i).boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(900);
}

// 1) Mobil, klavye KAPALI
{
  const g = "g1-02k-mobil-klavye-kapali";
  const { ctx, page, errors } = await open({ width: 390, height: 844 });
  try {
    await page.evaluate(() => window.scrollTo(0, 200)); await sleep(300);
    const s0 = await state(page);
    ok(g, "başlangıçta yazma alanı ekranın altında (sorun koşulu)", !s0.visible, JSON.stringify(s0));
    await tapSection(page, 2);
    const s1 = await state(page);
    ok(g, "bölüm seçilince yazma alanı tamamen görünür", s1.visible, JSON.stringify(s1));
    ok(g, "tek kaydırma çağrısı", s1.calls - s0.calls === 1, `${s1.calls - s0.calls}`);
    ok(g, "bölüm listesi yerinde (DOM sırası: liste → yazma alanı, 10 bölüm)", s1.listBeforePreview && s1.asideItems === 10);
    // Yazma alanı zaten görünürken başka bölüm → sayfa kaymaz
    const visibleIdx = [];
    for (let i = 0; i < 10; i++) { const b = await sections(page).nth(i).boundingBox(); if (b && b.y >= 0 && b.y + b.height <= 844) visibleIdx.push(i); }
    await tapSection(page, visibleIdx.at(-1));
    const s2 = await state(page);
    ok(g, "yazma alanı görünürken yeni bölüm → sayfa kaymaz (tekrar kaydırma yok)", s2.y === s1.y && s2.visible, `${s1.y} → ${s2.y}`);
    // Ad alanına yazarken sayfa kaymaz
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
    const yBefore = (await state(page)).y;
    const name = page.locator("section label input").first();
    await name.tap(); await page.keyboard.type("ZZ Magnezyum", { delay: 15 }); await sleep(500);
    ok(g, "ad alanına yazarken sayfa kendiliğinden kaymaz", (await state(page)).y === yBefore, `${yBefore} → ${(await state(page)).y}`);
    // Editör açılma + kayıt davranışı aynen
    await page.locator("section button").filter({ has: page.locator("p.min-h-\\[140px\\]") }).tap();
    const ta = page.locator('[role="dialog"] textarea');
    await ta.waitFor({ timeout: 5000 });
    const yEditor = (await state(page)).y;
    await ta.pressSequentially("Satir bir\nSatir iki\nSatir uc", { delay: 10 });
    ok(g, "editörde yazarken arka sayfa kaymaz", (await state(page)).y === yEditor);
    await page.getByRole("button", { name: "Bu Alanı Kaydet" }).tap(); await sleep(400);
    ok(g, "editör kaydı forma işlendi (mevcut davranış)", (await page.locator("section button p.min-h-\\[140px\\]").innerText()).startsWith("Satir bir"));
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

// 2) Mobil, klavye AÇIK (ad alanı odakta, görünüm 420 px)
{
  const g = "g1-02k-mobil-klavye-acik";
  const { ctx, page, errors } = await open({ width: 390, height: 844 });
  try {
    await page.locator("section label input").first().tap();
    await page.setViewportSize({ width: 390, height: 420 }); await sleep(500);
    await page.evaluate(() => window.scrollTo(0, 420)); await sleep(300);
    const visibleIdx = [];
    for (let i = 0; i < 10; i++) { const b = await sections(page).nth(i).boundingBox(); if (b && b.y >= 0 && b.y + b.height <= 420) visibleIdx.push(i); }
    const s0 = await state(page);
    await tapSection(page, visibleIdx[0]);
    const s1 = await state(page);
    ok(g, "klavye açıkken bölüm seçilince yazma alanı görünür", s1.visible, `önce ${JSON.stringify(s0)} sonra ${JSON.stringify(s1)}`);
    ok(g, "tek kaydırma çağrısı", s1.calls - s0.calls <= 1, `${s1.calls - s0.calls}`);
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(500);
    const s2 = await state(page);
    ok(g, "klavye kapanınca yazma alanı hâlâ görünür, ek kaydırma yok", s2.visible && s2.calls === s1.calls, JSON.stringify(s2));
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

// 3) Masaüstü 1280: davranış aynen (kaydırma çağrısı yok)
{
  const g = "g1-02k-web";
  const { ctx, page, errors } = await open({ width: 1280, height: 900 });
  try {
    const s0 = await state(page);
    for (const i of [0, 4, 9]) { await sections(page).nth(i).click(); await sleep(500); }
    const s1 = await state(page);
    ok(g, "masaüstünde bölüm seçimi kaydırma tetiklemez", s1.calls === s0.calls && s1.y === s0.y, `${JSON.stringify(s0)} → ${JSON.stringify(s1)}`);
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

await browser.close();
console.log(`\nG1-02 kaydırma UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
