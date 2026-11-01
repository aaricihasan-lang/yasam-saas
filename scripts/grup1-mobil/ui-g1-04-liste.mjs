// G1-04 (Owner A) — Doğaltaş listesi: mobilde kart özeti tek satır ("…" ile kesilir), yatay taşma yok,
// karta dokununca mevcut detay sayfası açılır; masaüstü 3 satır aynen; Mineral listesi kartı değişmez.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup1-mobil/ui-g1-04-liste.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const LONG = "Ametist sakinleştirici etkisiyle bilinen, meditasyon ve uyku düzeni için sık kullanılan mor renkli bir kuvars çeşididir; zihinsel berraklık sağlar.";
const NOSPACE = "Uzunkelimeboşluksuzözetmetnitaşmatestiiçinyazılmıştırvebölünmedenuzanır";
const stones = [
  { id: "f0000000-0000-4000-8000-000000000001", tenant_id: TENANT, stone_name: "ZZ Ametist", short_description: LONG, chakras: ["Taç Çakra"], images: [], updated_at: "2026-10-01T08:00:00.000Z" },
  { id: "f0000000-0000-4000-8000-000000000002", tenant_id: TENANT, stone_name: "ZZ Kuvars", short_description: NOSPACE, chakras: [], images: [], updated_at: "2026-10-02T08:00:00.000Z" },
  { id: "f0000000-0000-4000-8000-000000000003", tenant_id: TENANT, stone_name: "ZZ Obsidyen", short_description: "Kısa özet.", chakras: [], images: [], updated_at: "2026-10-03T08:00:00.000Z" },
];
const minerals = [{ id: "e0000000-0000-4000-8000-000000000001", tenant_id: TENANT, name: "ZZ Magnezyum", aciklama: LONG, kategori: "Makro", created_at: "2026-10-01T08:00:00.000Z" }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

async function ctxFor(vp) {
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
    if (url.pathname === "/api/dogaltas/stones") return route.fulfill({ status: 200, json: { ok: true, rows: stones, count: stones.length } });
    if (url.pathname === "/api/dogaltas/minerals") return route.fulfill({ status: 200, json: { ok: true, rows: minerals, count: minerals.length } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, errors, touch };
}

const summary = (page, name) => page.evaluate((name) => {
  const h = [...document.querySelectorAll("h2, h3")].find((x) => x.textContent.trim() === name);
  const p = h.parentElement.querySelector("p");
  const cs = getComputedStyle(p);
  const lh = parseFloat(cs.lineHeight);
  return { lines: Math.round(p.getBoundingClientRect().height / lh), clamp: cs.webkitLineClamp, cut: p.scrollHeight > p.clientHeight + 1, sideClip: p.scrollWidth > p.clientWidth + 1,
    pRight: Math.round(p.getBoundingClientRect().right), docW: document.documentElement.scrollWidth, vw: innerWidth };
}, name);

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `g1-04-${vp.tag}`;
  const { ctx, page, errors, touch } = await ctxFor(vp);
  try {
    await page.goto(`${BASE}/dogaltas/dogaltas-listesi`, { waitUntil: "load" });
    await page.getByText("ZZ Ametist").first().waitFor({ timeout: 60000 });
    await sleep(500);
    const a = await summary(page, "ZZ Ametist");
    const k = await summary(page, "ZZ Kuvars");
    const o = await summary(page, "ZZ Obsidyen");
    if (touch) {
      ok(g, "uzun özet tek satır", a.lines === 1 && a.clamp === "1", JSON.stringify(a));
      ok(g, "uzun özet kesilir (… ile)", a.cut, JSON.stringify(a));
      ok(g, "boşluksuz uzun özet tek satır, … ile kesilir (yandan kırpılmaz)", k.lines === 1 && k.cut && !k.sideClip, JSON.stringify(k));
      ok(g, "kısa özet tek satır, kesilmez", o.lines === 1 && !o.cut, JSON.stringify(o));
      ok(g, "yatay taşma yok", a.docW <= a.vw && k.pRight <= k.vw, JSON.stringify({ a, k }));
    } else {
      ok(g, "masaüstünde özet 3 satır (aynen)", a.lines === 3 && a.clamp === "3", JSON.stringify(a));
    }
    // Kart üzerindeki mevcut öğeler korunur
    const card = page.locator("h3", { hasText: "ZZ Ametist" }).locator("xpath=ancestor::div[.//input[@type='checkbox']][1]");
    ok(g, "seçim kutusu, Sil düğmesi ve detay bağlantısı duruyor",
      (await card.locator("input[type=checkbox]").count()) === 1 && (await card.locator("button", { hasText: "Sil" }).count()) === 1 && (await card.locator("a").count()) >= 2);
    const t = page.getByText("ZZ Ametist").first();
    await (touch ? t.tap() : t.click());
    await page.waitForURL(/dogaltas-listesi\/f0000000-0000-4000-8000-000000000001/, { timeout: 30000 }).catch(() => {});
    ok(g, "karta dokununca mevcut detay sayfası açılır", /\/dogaltas\/dogaltas-listesi\/f0000000-0000-4000-8000-000000000001/.test(page.url()), page.url());
    // Mineral listesi (ortak dp.cardText) değişmez: mobilde de 3 satır sınırı
    await page.goto(`${BASE}/dogaltas/mineral-listesi`, { waitUntil: "load" });
    await page.getByText("ZZ Magnezyum").first().waitFor({ timeout: 60000 });
    await sleep(400);
    const m = await summary(page, "ZZ Magnezyum");
    ok(g, "Mineral listesi kart özeti değişmedi (3 satır sınırı)", m.clamp === "3" && m.lines > 1, JSON.stringify(m));
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}
await browser.close();
console.log(`\nG1-04 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
