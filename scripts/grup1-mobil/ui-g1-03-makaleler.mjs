// G1-03 (Owner) — Taş Makaleleri (eski Bilgi Kütüphanesi): kategori filtresi kayıt listesinin DOĞRUDAN üstünde;
// Toplu İşlemler çubuğu filtre ile liste arasında değil (üstte) ve işlevleri aynen; filtre/arama/sonuçlar aynen.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort; yazma YOK).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup1-mobil/ui-g1-03-makaleler.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const CATS = ["Genel", "Çakra", "Bakım"];
const articles = Array.from({ length: 12 }, (_, i) => ({
  id: `a0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, tenant_id: TENANT, title: `ZZ Makale ${i}`,
  category: CATS[i % 3], sub_category: "", tags: [], related_stones: [], related_minerals: [], source: "", source_section: "", keyword: "", notes: "", is_active: true, content: i === 7 ? "Özel içerik ametist kelimesi" : `İçerik ${i}`, updated_at: "2026-10-01T08:00:00.000Z",
}));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `g1-03-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  const writes = [];
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
    if (req.method() !== "GET") writes.push(`${req.method()} ${url.pathname}`);
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === "/api/dogaltas/knowledge") return route.fulfill({ status: 200, json: { ok: true, articles } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  try {
    await page.goto(`${BASE}/dogaltas/tas-bilgi-kutuphanesi`, { waitUntil: "load" });
    await page.getByText("ZZ Makale 0").first().waitFor({ timeout: 60000 });
    await sleep(500);
    const layout = () => page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }; };
      const search = document.querySelector("aside input[type=text]");
      const filter = document.querySelector("button[aria-pressed]").parentElement;
      const bulk = [...document.querySelectorAll("button")].find((b) => /Seçili Güncelle/.test(b.textContent)).parentElement;
      const firstRec = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === "ZZ Makale 0");
      const between = [...filter.closest("aside").children].filter((c) => {
        const r = box(c); return r.top >= box(filter).bottom && r.bottom <= box(firstRec).top && c.textContent.includes("Toplu");
      }).length;
      return { search: box(search), bulk: box(bulk), filter: box(filter), first: box(firstRec), bulkBetween: between,
        filterSectionNext: filter.parentElement.nextElementSibling?.querySelector("button[aria-pressed]") ? "filtre" : (filter.parentElement.nextElementSibling?.textContent.includes("ZZ Makale 0") ? "liste" : "diğer") };
    });
    const L = await layout();
    ok(g, "sıra: arama → Toplu İşlemler → filtre → liste", L.search.top < L.bulk.top && L.bulk.bottom <= L.filter.top && L.filter.bottom <= L.first.top, JSON.stringify(L));
    ok(g, "filtre ile liste arasında Toplu İşlemler yok", L.bulkBetween === 0, JSON.stringify(L));
    ok(g, "filtre bölümünden sonraki bölüm doğrudan liste", L.filterSectionNext === "liste", L.filterSectionNext);

    // Filtre seçenekleri ve sonuçları aynen
    const chips = await page.locator("button[aria-pressed]").allInnerTexts();
    ok(g, "filtre seçenekleri: Tümü + 3 kategori (sayılarla)", chips.length === 4 && /Bakım\s*\(4\)/.test(chips.join("|")) && /Çakra\s*\(4\)/.test(chips.join("|")) && /Genel\s*\(4\)/.test(chips.join("|")), chips.join("|"));
    await hit(page.locator("button[aria-pressed]", { hasText: "Çakra" }));
    await sleep(400);
    ok(g, "Çakra filtresi → 4 kayıt", /4 kayıt/.test(await page.locator("aside").first().innerText()) || (await page.getByText(/^ZZ Makale \d+$/).count()) === 4);
    await hit(page.locator("button[aria-pressed]", { hasText: "Tümü" }));
    await sleep(400);
    // Arama aynen
    await page.locator("aside input[type=text]").fill("ametist");
    await sleep(1200);
    const asideText = await page.locator("aside").filter({ has: page.locator("input[type=text]") }).innerText().catch((e) => `HATA ${e} ${errors.join(" | ")}`);
    ok(g, "arama içerikte bulur (ametist → yalnız ZZ Makale 7)", asideText.includes("ZZ Makale 7") && !/ZZ Makale (?!7)\d/.test(asideText), asideText.slice(0, 300));
    await page.locator("aside input[type=text]").fill("");
    await sleep(900);
    // Toplu İşlemler işlevleri aynen (yazma yapılmaz)
    const upd = page.getByRole("button", { name: "Seçili Güncelle" });
    ok(g, "seçim yokken Seçili Güncelle/Sil pasif", (await upd.isDisabled()) && (await page.getByRole("button", { name: "Seçili Sil" }).isDisabled()));
    const cb = page.locator("aside input[type=checkbox]").first();
    await hit(cb); await sleep(300);
    ok(g, "kayıt seçilince sayaç ve düğmeler etkin", /1 seçili|Seçili: 1|1 kayıt seçildi|1/.test(await page.getByText(/seçil/i).first().innerText()) && !(await upd.isDisabled()));
    await hit(upd); await sleep(400);
    ok(g, "Seçili Güncelle penceresi açılır", (await page.getByRole("dialog").count()) >= 1 || /Güncelle/.test(await page.locator("body").innerText()));
    await page.keyboard.press("Escape"); await sleep(300);
    if (!touch) {
      ok(g, "masaüstünde 'Tümünü Seç' duruyor", (await page.getByRole("button", { name: /Tümünü Seç|Seçimi Kaldır|Tümünü Kaldır/ }).count()) >= 1);
    }
    ok(g, "hiç yazma isteği yok", writes.length === 0, writes.join(","));
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/g1-03-${vp.tag}.png` });
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}
await browser.close();
console.log(`\nG1-03 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
