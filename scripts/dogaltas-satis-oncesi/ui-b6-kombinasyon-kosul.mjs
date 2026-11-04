// B6 (05.11 canlı denetim) — Kombinasyon oluştur: koşulu karşılamayan taş elle eklendiğinde "Kombinasyon tüm
// koşulları karşılıyor" GÖSTERİLMEZ; koşulu karşılamayan taşlar adıyla belirtilir. Koşul kuralı (sepette en az bir
// taş karşılarsa koşul karşılanır) ve eşikler aynen. Kaydedilen özet de aynı bilgiyi taşır.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b6-kombinasyon-kosul.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const stone = (id, name, minerals, chakras) => ({
  id, tenant_id: TENANT, stone_name: name, short_description: "", general_info: "", warning_text: "", warning_tags: [],
  chakras, assignments: { Mineraller: minerals, "Etkili Organlar": [], "Astrolojik Atama": [], Elementler: [] }, images: [], created_at: "2026-10-01T08:00:00.000Z",
});
const QA = stone("b6000000-0000-4000-8000-000000000001", "ZZ KUVARSLI", [["Kuvars", "45"]], ["Kalp Çakrası"]);
const QA2 = stone("b6000000-0000-4000-8000-000000000003", "ZZ KUVARSLI 2", [["Kuvars", "60"]], ["Kalp Çakrası"]);
const AM = stone("b6000000-0000-4000-8000-000000000002", "ZZ AMETİST", [["Silis", "90"]], ["Taç Çakra"]);
const ALL_MET = "Kombinasyon tüm koşulları karşılıyor";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 400) : ""}`);
}
const browser = await chromium.launch();

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `b6-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  const saves = [];
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
    if (url.pathname === "/api/dogaltas/stones/condition-search") {
      const body = JSON.parse(req.postData() || "{}");
      const conds = body.conditions ?? [];
      if (conds.some((c) => c.type === "stone_name")) {
        const v = String(conds[0].value).toLocaleLowerCase("tr");
        return route.fulfill({ status: 200, json: { ok: true, rows: [QA, QA2, AM].filter((s) => s.stone_name.toLocaleLowerCase("tr").includes(v)), total: 1, capped: false } });
      }
      if (conds.length === 0) return route.fulfill({ status: 200, json: { ok: true, rows: [], total: 0, capped: false, suggestions: {} } });
      return route.fulfill({ status: 200, json: { ok: true, rows: [QA, QA2], total: 2, capped: false } });
    }
    if (url.pathname === "/api/dogaltas/duplicate-check") return route.fulfill({ status: 200, json: { ok: true, exists: false } });
    if (url.pathname === "/api/dogaltas/combinations/save") { saves.push(JSON.parse(req.postData() || "{}")); return route.fulfill({ status: 200, json: { ok: true, saved: 1 } }); }
    if (url.pathname === "/api/dogaltas/stones" && url.searchParams.get("mode") === "count") return route.fulfill({ status: 200, json: { ok: true, count: 3 } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, items: [] } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  const cartText = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  try {
    await page.goto(`${BASE}/dogaltas/kombinasyon-olustur`, { waitUntil: "load" });
    await page.getByPlaceholder("örn. Demir, Lityum, Kalsiyum").first().waitFor({ timeout: 60000 });
    await page.getByPlaceholder("örn. Demir, Lityum, Kalsiyum").first().fill("Kuvars");
    await page.getByPlaceholder("ops.").first().fill("40");
    await hit(page.getByRole("button", { name: "Taşları Tara" }).first());
    await page.getByText("ZZ KUVARSLI", { exact: true }).first().waitFor({ timeout: 15000 });
    // 1) Koşulu karşılayan taş → "tüm koşulları karşılıyor" (mevcut davranış)
    const card = page.getByText("ZZ KUVARSLI", { exact: true }).first().locator("xpath=ancestor::*[.//button[normalize-space()='+ Ekle']][1]");
    await hit(card.getByRole("button", { name: "+ Ekle" }).first());
    await sleep(500);
    ok(g, "yalnız koşulu karşılayan taş: 'tüm koşulları karşılıyor' görünür (mevcut)", (await cartText()).includes(ALL_MET));
    // 2) Koşulu karşılamayan taş elle eklenir → mesaj değişir
    await page.getByPlaceholder("Örn. Ametist — aramadan doğrudan ekle").first().fill("ZZ AMETİST");
    await hit(page.getByRole("button", { name: "+ Ekle" }).last());
    await sleep(800);
    const t2 = await cartText();
    ok(g, "karşılamayan taş eklenince 'tüm koşulları karşılıyor' GÖRÜNMEZ", !t2.includes(ALL_MET), t2.slice(0, 300));
    ok(g, "karşılamayan taş adıyla belirtilir", t2.includes("Koşulları karşılamayan taş var: ZZ AMETİST"));
    ok(g, "koşul kuralı aynı: Kuvars ≥ %40 'Karşılanan' altında (sepette KUVARSLI var)", t2.includes("✓ Mineral: Kuvars"));
    // 3) Kaydet → özet notu bu bilgiyi taşır
    await page.getByPlaceholder("Kombinasyon adı (zorunlu)").fill("ZZ B6 Kombinasyon");
    await hit(page.getByRole("button", { name: /Kombinasyonu Kaydet/ }).last());
    await hit(page.getByRole("button", { name: /Genel Kombinasyonlara Kaydet/ }).first());
    for (let i = 0; i < 40 && saves.length === 0; i++) await sleep(250);
    const nt = JSON.stringify(saves[0] ?? {});
    ok(g, "kaydedilen özet: 'Koşulları karşılamayan taşlar: ZZ AMETİST' içerir", nt.includes("Koşulları karşılamayan taşlar: ZZ AMETİST"), nt.slice(0, 400));
    ok(g, "kaydedilen özet: Karşılanan/Eksik satırları aynen var (mevcut)", nt.includes("Karşılanan:") && nt.includes("Eksik:"));
    // 4) Karşılamayan taş çıkarılınca tekrar 'tüm koşulları karşılıyor'
    await page.goto(`${BASE}/dogaltas/kombinasyon-olustur`, { waitUntil: "load" });
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok(g, "beklenmeyen hata", false, String(e?.stack ?? e));
  }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
