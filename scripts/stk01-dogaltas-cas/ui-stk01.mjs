// STK-01-DT — Ürün & Stok → Doğaltaş "Yeni Kayıt Ekle": stok arada (satış) değişince kayıp yok, taslak korunur.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Sahte /api/dogaltas/inventory GERÇEK route sözleşmesini taklit eder: adet yazan PATCH'te expected_stock yoksa
// 428 (stock_expected_required), DB stoğu farklıysa 409 (stock_conflict), eşitse yazar.
// Senaryo: ekran adet 10 görür → kullanıcı +5 girer → kaydetmeden hemen önce satış 3 düşer (DB 7) → Ekle.
//   Beklenen: 409 → anlaşılır mesaj, güncel stok (7) yüklenir, form (ad/adet) KORUNUR → tekrar Ekle → 12.
// Çalıştırma: node scripts/stk01-dogaltas-cas/ui-stk01.mjs  (UI_BASE ile port)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e5", email: "zz-stok@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true, stok: true, clients: true },
};
const ROW_ID = "d0000000-0000-4000-8000-0000000000d1";
const VIEWPORTS = [{ width: 390, height: 844, tag: "mobil" }, { width: 1366, height: 900, tag: "masaustu" }];
const CONFLICT_MSG = "Stok bu arada başka bir işlemle (ör. satış) değişti; kayıt yazılmadı. Güncel stok yüklendi — formu kontrol edip yeniden kaydedin.";

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

async function run(vp) {
  const g = `stok-${vp.tag}`;
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768, locale: "tr-TR" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: BASE }]);
  const errors = [];
  const patches = [];
  let gets = 0;
  let saleDone = false;
  const row = { id: ROW_ID, tenant_id: TENANT, name: "ZZ AMETİST", type: "8 MM DİZİ", adet: 10, dizi_icerik: 0, dizi_price: 0, adet_price: 10,
    dizi_price_usd: 0, dizi_price_eur: 0, photos: [], usd_rate: 0, eur_rate: 0, total_cost_try: 0, unit_cost_try: 0 };
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
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === "/api/dogaltas/inventory") {
      if (req.method() === "GET") { gets++; return route.fulfill({ status: 200, json: { ok: true, rows: [row] } }); }
      if (req.method() === "PATCH") {
        const body = req.postDataJSON() ?? {};
        patches.push(body);
        if (!saleDone) { saleDone = true; row.adet -= 3; } // kaydetmeden hemen önce satış (RPC) → DB 7
        if ("adet" in body) {
          if (typeof body.expected_stock !== "number") return route.fulfill({ status: 428, json: { ok: false, code: "stock_expected_required", error: "Stok güncellemesi için mevcut stok bilgisi gerekli. Sayfayı yenileyip tekrar deneyin." } });
          if (body.expected_stock !== row.adet) return route.fulfill({ status: 409, json: { ok: false, code: "stock_conflict", current_stock: row.adet, error: "Stok bu arada başka bir işlemle değişti." } });
        }
        const { expected_stock: _x, id: _i, ...fields } = body;
        Object.assign(row, fields);
        return route.fulfill({ status: 200, json: { ok: true, id: ROW_ID } });
      }
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], sales: [], items: [] } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  try {
    await page.goto(`${BASE}/urun-stok/dogaltas`, { waitUntil: "load" });
    await page.getByText("ZZ AMETİST").first().waitFor({ timeout: 30000 });
    const nameInput = page.getByPlaceholder("Örn. SİTRİN");
    const qtyInput = page.locator('label:has-text("Stok adedi") input');
    await nameInput.fill("ZZ AMETİST");
    await qtyInput.fill("5");
    const getsBefore = gets;
    await page.getByRole("button", { name: "Ekle", exact: true }).click();
    if (process.env.OLD_CLIENT) {
      // Uyumluluk: önbellekte kalmış ESKİ arayüz (expected_stock göndermez) + YENİ sunucu → 428.
      await page.getByText("Sayfayı yenileyip tekrar deneyin", { exact: false }).first().waitFor({ timeout: 10000 });
      ok(g, "eski arayüz + yeni sunucu → 428: veri DEĞİŞMEDİ (satış korundu, 7)", row.adet === 7 && patches.length === 1 && !("expected_stock" in patches[0]), JSON.stringify({ adet: row.adet, p: patches[0] }));
      ok(g, "eski arayüz + yeni sunucu → kullanıcı 'sayfayı yenileyin' görür, taslak korunur", (await nameInput.inputValue()) === "ZZ AMETİST");
      return;
    }
    await page.getByText(CONFLICT_MSG).waitFor({ timeout: 10000 });
    ok(g, "çakışma → anlaşılır mesaj (kayıt yazılmadı, güncel stok yüklendi)", await page.getByText(CONFLICT_MSG).isVisible());
    ok(g, "ilk yazma ekranın gördüğü stokla (expected_stock=10, adet=15) gitti", patches[0]?.expected_stock === 10 && patches[0]?.adet === 15, JSON.stringify(patches[0]));
    ok(g, "satış KORUNDU (DB 7, 15 yazılmadı)", row.adet === 7);
    ok(g, "güncel stok sunucudan yeniden yüklendi", gets > getsBefore);
    ok(g, "taslak KORUNDU (ad + adet alanları dolu)", (await nameInput.inputValue()) === "ZZ AMETİST" && (await qtyInput.inputValue()) === "5");
    ok(g, "'buluta yazılamadı' yanıltıcı mesajı YOK", (await page.getByText("buluta yazılamadı").count()) === 0);
    await page.getByRole("button", { name: "Ekle", exact: true }).click();
    await page.getByText("Kayıt güncellendi ve buluta kaydedildi").first().waitFor({ timeout: 10000 });
    ok(g, "yeniden kaydet → taze tabanla (expected 7) → 12 (doğru, kayıp yok)", patches[1]?.expected_stock === 7 && row.adet === 12, JSON.stringify(patches[1]));
    ok(g, "başarı sonrası form temizlendi", (await nameInput.inputValue()) === "" && (await qtyInput.inputValue()) === "");
    ok(g, "yatay taşma yok", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/stk01-${vp.tag}.png` }).catch(() => {});
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

for (const vp of VIEWPORTS) await run(vp);
await browser?.close();
console.log(`\nSTK-01 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
