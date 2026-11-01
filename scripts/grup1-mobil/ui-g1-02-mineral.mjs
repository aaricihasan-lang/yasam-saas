// G1-02 — Mineral Bankası bölüm editörü: mobilde klavye açıkken (görünüm daralır) yazarken metin alanı
// yerinde kalır (dialog kendi içinde kaymaz); masaüstü yerleşimi değişmez; bölüm içeriği/kayıt korunur.
// Klavye, Android WebView'deki gibi görünüm yüksekliği daraltılarak taklit edilir (fiziksel cihaz değil).
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup1-mobil/ui-g1-02-mineral.mjs
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
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  await hit(page.locator("button.btn-primary").first());
  await sleep(500);
  const sections = page.locator("aside div.grid.grid-cols-1.gap-1 > button");
  await sections.nth(3).scrollIntoViewIfNeeded();
  const asideTop = () => page.evaluate(() => [...document.querySelectorAll("aside")].find((a) => a.querySelector("div.grid.grid-cols-1.gap-1")).getBoundingClientRect().top + window.scrollY); // belge konumu: G1-02 kaydırması hariç, yalnız hover kayması
  const a0 = await asideTop();
  await hit(sections.nth(3));
  await sleep(700);
  const sectionTapShift = Math.round((await asideTop()) - a0);
  const preview = page.locator("section button").filter({ has: page.locator("p.min-h-\\[140px\\]") });
  await preview.scrollIntoViewIfNeeded();
  await hit(preview);
  await page.locator('[role="dialog"] textarea').waitFor({ timeout: 5000 });
  if (!touch) await page.mouse.move(2, 2);
  await sleep(800);
  return { ctx, page, errors, sectionTapShift, hit };
}

const snap = (page) => page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const t = d.querySelector("textarea");
  const r = t.getBoundingClientRect(), dr = d.getBoundingClientRect();
  return { dTop: Math.round(dr.top), dH: Math.round(dr.height), dW: Math.round(dr.width), dScroll: Math.round(d.scrollTop),
    tTop: Math.round(r.top), tH: Math.round(r.height), tW: Math.round(r.width), focused: document.activeElement === t };
});

// Mobil: klavye açık (görünüm 420 px) iken 14 satır yaz → metin alanı yerinde kalmalı
{
  const g = "g1-02-mobil";
  const { ctx, page, errors, sectionTapShift, hit } = await open({ width: 390, height: 844 });
  try {
    ok(g, "bölüm dokunuşunda bölüm paneli yerinde kalır (hover kayması yok)", Math.abs(sectionTapShift) <= 1, `kayma=${sectionTapShift}px`);
    const t0 = (await snap(page)).tTop;
    await hit(page.locator('[role="dialog"] textarea'));
    await sleep(700);
    const t1 = (await snap(page)).tTop;
    ok(g, "metin alanına dokununca alan yerinde kalır (hover kayması yok)", Math.abs(t1 - t0) <= 1, `${t0} → ${t1}`);
    const closed = await snap(page);
    ok(g, "editör açılınca metin alanı odakta", closed.focused);
    await page.setViewportSize({ width: 390, height: 420 });
    await sleep(800);
    const kb = await snap(page);
    ok(g, "klavye açıkken dialog görünür alana sığar", kb.dTop >= 0 && kb.dTop + kb.dH <= 420, JSON.stringify(kb));
    ok(g, "klavye açıkken metin alanı görünür alanda", kb.tTop >= 0 && kb.tTop + kb.tH <= 420, JSON.stringify(kb));
    const ta = page.locator('[role="dialog"] textarea');
    const tops = [];
    await ta.pressSequentially("Deneme satiri", { delay: 2 });
    for (let i = 0; i < 14; i++) {
      await ta.press("Enter");
      await ta.pressSequentially(`satir ${i}`, { delay: 2 });
      tops.push((await snap(page)).tTop);
    }
    const after = await snap(page);
    const drift = Math.max(...tops) - Math.min(...tops);
    ok(g, "yazarken dialog kendi içinde kaymaz (scrollTop 0)", after.dScroll === 0, JSON.stringify(after));
    ok(g, "yazarken metin alanı yerinde kalır (oynama ≤ 3 px)", drift <= 3, `oynama=${drift}px tops=${[...new Set(tops)].join(",")}`);
    ok(g, "yazılan metin eksiksiz", (await ta.inputValue()).split("\n").length === 15);
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(800);
    const reopened = await snap(page);
    ok(g, "klavye kapanınca metin alanı eski yüksekliğine döner", reopened.tH === closed.tH, `${closed.tH} → ${reopened.tH}`);
    await page.getByRole("button", { name: "Bu Alanı Kaydet" }).click();
    await sleep(800);
    const previewText = await page.locator("section button p.min-h-\\[140px\\]").innerText();
    ok(g, "bölüm içeriği forma işlendi (kayıt davranışı aynı)", previewText.startsWith("Deneme satiri"), previewText.slice(0, 60));
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
    console.log(`   ölçüm: kapalı ${JSON.stringify(closed)} | klavye ${JSON.stringify(kb)} | yazma sonrası ${JSON.stringify(after)}`);
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

// Masaüstü: dialog ve metin alanı ölçüleri (≥640 px sınıflar değişmedi) — beklenen değerler main'den ölçüldü
{
  const g = "g1-02-web";
  const { ctx, page, errors } = await open({ width: 1280, height: 900 });
  try {
    const s = await snap(page);
    await page.getByRole("button", { name: "Kapat", exact: true }).click();
    await sleep(500);
    const nameCard = page.locator("section").filter({ has: page.locator("label input") }).first();
    const cardTop = () => nameCard.evaluate((e) => Math.round(e.getBoundingClientRect().top));
    await page.mouse.move(2, 2); await sleep(500);
    const c0 = await cardTop();
    await nameCard.hover(); await sleep(600);
    const c1 = await cardTop();
    ok(g, "masaüstünde fare hover efekti korunur (kart 4 px yükselir)", c0 - c1 === 4, `${c0} → ${c1}`);
    const expected = JSON.parse(process.env.G1_02_WEB_BASELINE ?? "null");
    console.log(`   masaüstü ölçüm: ${JSON.stringify(s)}`);
    if (expected) ok(g, "masaüstü dialog/metin alanı ölçüleri main ile aynı", ["dTop", "dH", "dW", "tTop", "tH", "tW"].every((k) => s[k] === expected[k]), `main=${JSON.stringify(expected)} dal=${JSON.stringify(s)}`);
    ok(g, "masaüstü metin alanı 430 px", s.tH === 430, s.tH);
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

await browser.close();
console.log(`\nG1-02 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
