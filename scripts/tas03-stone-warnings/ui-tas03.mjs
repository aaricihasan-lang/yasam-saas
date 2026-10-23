// TAS-03 — Kombinasyon Oluştur sepeti: bilgi kaydına dönüşmüş uyarı (search_warning_text) görünür.
// Playwright, yerel build, ağ-mock; prod'a SIFIR temas (127.0.0.1 dışı her istek abort).
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink + sahte env build + start);
//   node scripts/tas03-stone-warnings/ui-tas03.mjs   (UI_BASE ile port)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const PERMS = Object.fromEntries(["stones", "stok", "clients", "appointments"].map((k) => [k, true]));
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: PERMS,
};
const VIEWPORTS = [
  { width: 360, height: 780, tag: "mobil-360" },
  { width: 820, height: 1180, tag: "tablet-820" },
  { width: 1440, height: 900, tag: "masaustu-1440" },
];
const W1 = "ZZ UYARI A: hamilelikte kullanılmaz.";
const W2 = "ZZ UYARI B: kalp pili olanlar dikkat.";
const ROWS = [
  // Dönüştürülmüş taş: birincil warning_text NULL, etkin uyarı search_warning_text'te.
  { id: "f0000000-0000-4000-8000-0000000000a1", tenant_id: TENANT, stone_name: "ZZ Kehribar", warning_text: null, warning_tags: [],
    search_warning_text: `${W1}\n\n${W2}`, chakras: ["Kalp Çakrası"], assignments: {}, images: [] },
  // Eski davranış: yalnız birincil warning_text (search_warning_text yok) → aynen gösterilir.
  { id: "f0000000-0000-4000-8000-0000000000a2", tenant_id: TENANT, stone_name: "ZZ Ametist", warning_text: "ZZ ESKİ BİRİNCİL UYARI",
    warning_tags: ["Su ile temizlenmez"], chakras: ["Kalp Çakrası"], assignments: {}, images: [] },
  // Uyarısız taş.
  { id: "f0000000-0000-4000-8000-0000000000a3", tenant_id: TENANT, stone_name: "ZZ Kuvars", warning_text: null, warning_tags: null,
    chakras: ["Kalp Çakrası"], assignments: {}, images: [] },
];

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

async function run(vp) {
  const g = `kombinasyon-sepet-uyari-${vp.tag}`;
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768 });
  const pageErrors = [];
  const writes = [];
  await ctx.addInitScript((u) => {
    try {
      if (sessionStorage.getItem("zz_seeded")) return;
      sessionStorage.setItem("zz_seeded", "1");
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === "/api/dogaltas/stones/condition-search") {
      let body = {};
      try { body = req.postDataJSON() ?? {}; } catch { /* boş */ }
      const has = (body.conditions ?? []).length > 0;
      return route.fulfill({ status: 200, json: { ok: true, rows: has ? ROWS : [], total: has ? ROWS.length : 0, capped: false,
        suggestions: { chakra: [{ name: "Kalp Çakrası", count: 3 }], astrology: [], organ: [], stone_name: [], mineral: [] } } });
    }
    if (req.method() !== "GET") writes.push(`${req.method()} ${url.pathname}`);
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  try {
    await page.goto(`${BASE}/dogaltas/kombinasyon-olustur`, { waitUntil: "load" });
    await sleep(2500);
    const sel = page.locator("section select:visible").first();
    const chakraValue = await sel.evaluate((el) => [...el.options].find((o) => /Çakra/.test(o.text))?.value ?? "");
    await sel.selectOption(chakraValue);
    await page.locator('section input[type="text"]:visible').first().fill("Kalp");
    await page.keyboard.press("Escape");
    const scan = page.locator("button:visible", { hasText: "Taşları Tara" });
    if (await scan.count()) await scan.first().click();
    await sleep(1500);
    await page.getByText("ZZ Kehribar").first().waitFor({ timeout: 8000 });
    const addButtons = page.locator("button:visible", { hasText: "+ Ekle" });
    const n = await addButtons.count();
    for (let i = 0; i < Math.min(n, 3); i++) { await page.locator("button:visible", { hasText: "+ Ekle" }).first().click(); await sleep(250); }
    await sleep(600);

    const p1 = page.locator("p", { hasText: W1 }).first();
    await p1.waitFor({ state: "attached", timeout: 5000 });
    await p1.scrollIntoViewIfNeeded().catch(() => {});
    const t1 = await p1.innerText();
    ok(g, "dönüştürülmüş taşın uyarısı sepette görünür (stones.warning_text NULL olsa da)", t1.includes(W1) && t1.includes(W2), t1);
    ok(g, "birden çok uyarı kaydı ayrı satırlarda (satır sonu korunur)", /A: hamilelikte kullanılmaz\.\s*\n\s*\n?\s*ZZ UYARI B/.test(t1), JSON.stringify(t1));
    ok(g, "uyarı metni görünür (gizli değil)", await p1.isVisible());
    const p2 = page.locator("p", { hasText: "ZZ ESKİ BİRİNCİL UYARI" }).first();
    ok(g, "eski birincil uyarı aynen görünür (geri uyum)", (await p2.count()) === 1 && (await p2.innerText()).includes("ZZ ESKİ BİRİNCİL UYARI"));
    const hasWarnCards = await page.evaluate(() => [...document.querySelectorAll("p")].filter((p) => /ZZ UYARI A|ZZ ESKİ BİRİNCİL/.test(p.textContent ?? "")).length);
    ok(g, "uyarısız taş için uyarı metni üretilmez", hasWarnCards === 2, hasWarnCards);
    ok(g, "yatay taşma yok", await noHScroll(page));
    ok(g, "yazma isteği yok (salt-okunur gösterim)", writes.length === 0, writes.join(", "));
    ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    await page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/tas03-${vp.tag}.png`, fullPage: false }).catch(() => {});
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

for (const vp of VIEWPORTS) await run(vp);
await browser?.close();
console.log(`\nTAS-03 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
