// B8c (05.11 canlı denetim) — Danışan → Doğaltaş Önerileri → Kayıtlı Kombinasyonlar: düzenlerken taşlar değiştirilebilir
// (çıkar / ekle, tekrar eklenmez, boş liste kaydedilmez); PATCH gövdesinde ad/amaç/not ile birlikte taş listesi gider;
// Vazgeç değişiklik göndermez. Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b8c-danisan-kombinasyon-tas.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const CID = "b8c00000-0000-4000-8000-0000000000c1";
const COMBO_ID = "b8c00000-0000-4000-8000-0000000000a1";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true, clients: true },
};
const CLIENT = { id: CID, tenant_id: TENANT, full_name: "ZZ Danışan", first_name: "ZZ", last_name: "Danışan", created_at: "2026-10-01T08:00:00.000Z" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 400) : ""}`);
}
const browser = await chromium.launch();
for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `b8c-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  let row = { id: COMBO_ID, tenant_id: TENANT, client_id: CID, name: "ZZ Kombinasyon", description: "ZZ amaç", note: "ZZ not", stones_text: "AKİK, AMETİST", notes_text: "Arama Koşulları:\n- Mineral: Kuvars", notes_text_2: "Stok: 0/2 stokta", created_at: "2026-10-01T08:00:00.000Z", updated_at: null };
  const patches = [];
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
    if (url.pathname === `/api/clients/${CID}`) return route.fulfill({ status: 200, json: { ok: true, client: CLIENT, client_version: "1" } });
    if (url.pathname === `/api/clients/${CID}/combinations`) return route.fulfill({ status: 200, json: { ok: true, rows: [row] } });
    if (url.pathname === `/api/clients/${CID}/combinations/${COMBO_ID}` && req.method() === "PATCH") {
      const b = JSON.parse(req.postData() || "{}");
      patches.push(b);
      row = { ...row, name: b.name ?? row.name, description: b.description ?? null, note: b.note ?? null, stones_text: Array.isArray(b.stones) ? b.stones.join(", ") : row.stones_text };
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, notes: [], items: [], stones: [], photos: [] } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  const card = () => page.locator("div").filter({ has: page.getByRole("heading", { name: "Kombinasyonu Düzenle" }) }).last();
  try {
    await page.goto(`${BASE}/dashboard/clients/${CID}`, { waitUntil: "load" });
    await hit(page.getByRole("button", { name: /Doğaltaş Önerileri/ }).first().or(page.getByRole("tab", { name: /Doğaltaş Önerileri/ }).first()).first());
    await page.getByText("ZZ Kombinasyon").first().waitFor({ timeout: 60000 });
    // Vazgeç → PATCH yok
    await hit(page.getByRole("button", { name: "Düzenle", exact: true }).last());
    await page.getByText("Kombinasyonu Düzenle").first().waitFor({ timeout: 10000 });
    ok(g, "düzenlemede mevcut taşlar listelenir", (await card().innerText()).includes("AKİK") && (await card().innerText()).includes("AMETİST"));
    await hit(page.getByRole("button", { name: "AMETİST taşını çıkar" }));
    await hit(page.getByRole("button", { name: "Vazgeç", exact: true }).last());
    await sleep(400);
    ok(g, "Vazgeç → PATCH gitmez", patches.length === 0);
    // Düzenle: AMETİST çıkar, GÜL KUVARS ekle, tekrar AKİK eklemeyi dene → Güncelle
    await hit(page.getByRole("button", { name: "Düzenle", exact: true }).last());
    await page.getByText("Kombinasyonu Düzenle").first().waitFor({ timeout: 10000 });
    ok(g, "Vazgeç sonrası yeniden açınca taşlar özgün haliyle (AMETİST geri)", (await card().innerText()).includes("AMETİST"));
    await hit(page.getByRole("button", { name: "AMETİST taşını çıkar" }));
    await page.getByPlaceholder("Taş adı ekle…").fill("GÜL KUVARS");
    await hit(page.getByRole("button", { name: "+ Ekle", exact: true }).last());
    await page.getByPlaceholder("Taş adı ekle…").fill("akik");
    await page.getByPlaceholder("Taş adı ekle…").press("Enter");
    await sleep(200);
    const chips = await card().innerText();
    ok(g, "ekle/çıkar çalışır, aynı taş (Türkçe duyarsız) tekrar eklenmez", chips.includes("GÜL KUVARS") && !chips.includes("AMETİST") && (chips.match(/AKİK|akik/g) || []).length === 1, chips);
    await hit(page.getByRole("button", { name: "Güncelle", exact: true }));
    for (let i = 0; i < 40 && patches.length === 0; i++) await sleep(150);
    const p = patches[0] ?? {};
    ok(g, "PATCH: taş listesi + ad/amaç/not birlikte gider", JSON.stringify(p.stones) === '["AKİK","GÜL KUVARS"]' && p.name === "ZZ Kombinasyon" && p.description === "ZZ amaç" && p.note === "ZZ not", JSON.stringify(p));
    await page.getByText("Kombinasyon güncellendi.").first().waitFor({ timeout: 10000 }).catch(() => {});
    await hit(page.getByRole("button", { name: /Detay|Gizle/ }).last());
    await sleep(400);
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    ok(g, "güncel taşlar kartta görünür (yeniden yüklenen kayıttan)", body.includes("GÜL KUVARS") && !body.includes("AMETİST"), body.slice(0, 200));
    // Sayfa yenile → sekmeyi ve kombinasyonu yeniden aç → değişiklik korunur, diğer bilgiler aynı
    await page.reload({ waitUntil: "load" });
    await hit(page.getByRole("button", { name: /Doğaltaş Önerileri/ }).first().or(page.getByRole("tab", { name: /Doğaltaş Önerileri/ }).first()).first());
    await page.getByText("ZZ Kombinasyon").first().waitFor({ timeout: 60000 });
    await hit(page.getByRole("button", { name: /Detay/ }).last());
    await sleep(500);
    const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    ok(g, "yenileme sonrası: yeni taşlar korunur, AMETİST yok; amaç ve not aynı", after.includes("GÜL KUVARS") && after.includes("AKİK") && !after.includes("AMETİST") && after.includes("ZZ amaç") && after.includes("ZZ not"), after.slice(0, 300));
    // Tüm taşlar çıkarılırsa kaydedilmez
    await hit(page.getByRole("button", { name: "Düzenle", exact: true }).last());
    await page.getByText("Kombinasyonu Düzenle").first().waitFor({ timeout: 10000 });
    await hit(page.getByRole("button", { name: "AKİK taşını çıkar" }));
    await hit(page.getByRole("button", { name: "GÜL KUVARS taşını çıkar" }));
    await hit(page.getByRole("button", { name: "Güncelle", exact: true }));
    await sleep(600);
    ok(g, "taşsız liste kaydedilmez + uyarı", patches.length === 1 && await page.getByText("En az bir taş olmalı.").count() > 0);
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
