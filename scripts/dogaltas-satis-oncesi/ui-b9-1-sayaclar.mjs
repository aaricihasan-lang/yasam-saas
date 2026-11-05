// B9.1 (05.11 canlı denetim) — "Toplam kayıt" ve "Tümü (n)" kiracıdaki TOPLAM kaydı gösterir; arama/kategori kapsamı
// ayrı ("Filtreli (n)", "Sonuçların Tümünü Seç (n)", "n sonuç") ve aynen kalır. Taş listesi + Mineral listesi.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b9-1-sayaclar.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const NAMES = ["AKİK", "AMETİST", "AMETRİN", "APATİT", "AVENTURİN", "AZURİT", "BERİL", "DEMİR TAŞI", "ELMAS"];
const STONES = NAMES.map((n, i) => ({ id: `b9100000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, tenant_id: TENANT, stone_name: n, short_description: "", chakras: [], warning_tags: [], images: [], created_at: "2026-10-01T08:00:00.000Z" }));
const MINS = ["Demir", "Kalsiyum", "Magnezyum", "Çinko", "Bakır"].map((n, i) => ({ id: `b9110000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, tenant_id: TENANT, source_id: `m${i}`, name: n, aciklama: "", kategori: i < 2 ? "Makro" : "İz", created_at: "2026-10-01T08:00:00.000Z" }));
const fold = (s) => s.toLocaleLowerCase("tr");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();
for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
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
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    const q = fold(url.searchParams.get("q") ?? "");
    if (url.pathname === "/api/dogaltas/stones") {
      const rows = STONES.filter((s) => !q || fold(s.stone_name).includes(q));
      if (url.searchParams.get("mode") === "count") return route.fulfill({ status: 200, json: { ok: true, count: rows.length } });
      return route.fulfill({ status: 200, json: { ok: true, rows, count: rows.length } });
    }
    if (url.pathname === "/api/dogaltas/minerals") {
      const cat = url.searchParams.get("category") ?? "";
      const rows = MINS.filter((m) => (!q || fold(m.name).includes(q)) && (!cat || m.kategori === cat));
      if (url.searchParams.get("mode") === "count") return route.fulfill({ status: 200, json: { ok: true, count: rows.length } });
      return route.fulfill({ status: 200, json: { ok: true, rows } });
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const statOf = async (label) => page.evaluate((lbl) => {
    const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent?.trim() === lbl);
    const box = el?.closest("div")?.parentElement;
    return box ? box.innerText.replace(/\s+/g, " ") : "";
  }, label);
  const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  // ── Taş listesi
  {
    const g = `b9-1-tas-${vp.tag}`;
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi`, { waitUntil: "load" });
      await page.getByText("AKİK").first().waitFor({ timeout: 60000 });
      await sleep(800);
      ok(g, "aramasız: Toplam kayıt 9, Tümü (9)", /9 Toplam kayıt|Toplam kayıt 9/.test(await statOf("Toplam kayıt")) && (await body()).includes("Tümü (9)"), await statOf("Toplam kayıt"));
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi?q=ame`, { waitUntil: "load" });
      await page.getByText("AMETİST").first().waitFor({ timeout: 60000 });
      await sleep(1500);
      const b = await body();
      ok(g, "aramada: Toplam kayıt 9 kalır", /9 Toplam kayıt|Toplam kayıt 9/.test(await statOf("Toplam kayıt")), await statOf("Toplam kayıt"));
      ok(g, "aramada: Tümü (9) kiracı toplamı", b.includes("Tümü (9)"), b.slice(0, 200));
      ok(g, "aramada: kapsam sayıları aynen (Sonuçların Tümünü Seç (2), Filtreli (2))", b.includes("(2)") && /Filtreli \(2\)/.test(b), b.slice(0, 300));
      // Boş sonuç: Toplam kayıt yine 9
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi?q=zzqqxx`, { waitUntil: "load" });
      await page.getByText("Sonuç bulunamadı").first().waitFor({ timeout: 60000 });
      await sleep(1500);
      ok(g, "boş sonuçta: Toplam kayıt 9", /9 Toplam kayıt|Toplam kayıt 9/.test(await statOf("Toplam kayıt")), await statOf("Toplam kayıt"));
      // Arama temizlenince
      await page.getByRole("button", { name: "Aramayı Temizle" }).first().click();
      await page.getByText("AKİK").first().waitFor({ timeout: 30000 });
      await sleep(1500);
      ok(g, "arama temizlenince: Toplam kayıt 9, Tümü (9)", /9 Toplam kayıt|Toplam kayıt 9/.test(await statOf("Toplam kayıt")) && (await body()).includes("Tümü (9)"), await statOf("Toplam kayıt"));
    } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  }
  // ── Mineral listesi
  {
    const g = `b9-1-mineral-${vp.tag}`;
    try {
      await page.goto(`${BASE}/dogaltas/mineral-listesi`, { waitUntil: "load" });
      await page.getByText("Kalsiyum").first().waitFor({ timeout: 60000 });
      await sleep(800);
      ok(g, "aramasız: Toplam kayıt 5", /5 Toplam kayıt|Toplam kayıt 5/.test(await statOf("Toplam kayıt")), await statOf("Toplam kayıt"));
      await page.goto(`${BASE}/dogaltas/mineral-listesi?q=demir`, { waitUntil: "load" });
      await page.getByText("Demir").first().waitFor({ timeout: 60000 });
      await sleep(1500);
      ok(g, "aramada: Toplam kayıt 5 kalır", /5 Toplam kayıt|Toplam kayıt 5/.test(await statOf("Toplam kayıt")), await statOf("Toplam kayıt"));
      ok(g, "aramada: listelenen sonuç 1 (kapsam aynen)", /1 Listelenen sonuç|Listelenen sonuç 1/.test(await statOf("Listelenen sonuç")), await statOf("Listelenen sonuç"));
      // Kategori filtresi: Toplam 5, listelenen 2 (Makro)
      await page.goto(`${BASE}/dogaltas/mineral-listesi`, { waitUntil: "load" });
      await page.getByText("Kalsiyum").first().waitFor({ timeout: 60000 });
      await page.locator("select").first().selectOption("Makro");
      await sleep(2000);
      ok(g, "kategori filtresinde: Toplam kayıt 5, listelenen 2", /5 Toplam kayıt|Toplam kayıt 5/.test(await statOf("Toplam kayıt")) && /2 Listelenen sonuç|Listelenen sonuç 2/.test(await statOf("Listelenen sonuç")), (await statOf("Toplam kayıt")) + " | " + (await statOf("Listelenen sonuç")));
      ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
    } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
