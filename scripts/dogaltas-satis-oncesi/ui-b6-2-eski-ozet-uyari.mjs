// B6.2 (05.11 canlı denetim, owner kararı A) — Kombinasyon detayı: taşları değiştirilmiş kombinasyonun otomatik
// koşul / stok özetinin başındaki "GÜNCEL DEĞİL" satırı ayrı, belirgin uyarı (role=note) olarak gösterilir; özgün
// özet altında aynen okunur. İşaretsiz kombinasyon ve kullanıcı notu eskisi gibi. Mobil 320/390 + web 1280.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b6-2-eski-ozet-uyari.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const MARK = "⚠ GÜNCEL DEĞİL: Kombinasyonun taşları 05.11.2026 tarihinde değiştirildi. Aşağıdaki özet önceki taş listesine (AMETİST, LEPİDOLİT, AKİK) aittir ve yeniden hesaplanmadı.";
const COND = "Arama Koşulları:\n- Mineral: Lityum ≥ %1\n\nKarşılanan: Mineral: Lityum\nEksik: —";
const STOCK = "Stok: 2/3 stokta\nUyarılı taşlar: LEPİDOLİT";
const STALE_TITLE = "ZZ ESKİ ÖZETLİ KOMBİ";
const FRESH_TITLE = "ZZ GÜNCEL KOMBİ";
const base = { tenant_id: TENANT, variant_index: 1, description: "ZZ açıklama", source: "Kombinasyon Oluştur", created_at: "2026-10-01T08:00:00.000Z", updated_at: "2026-11-05T08:00:00.000000+00:00" };
const STALE = { ...base, id: "b6200000-0000-4000-8000-000000000001", source_id: "k1", issue: STALE_TITLE, stones_text: "AMETİST, GÜL KUVARS",
  notes_text: `${MARK}\n\n${COND}`, notes_text_2: `${MARK}\n\n${STOCK}`, notes_text_3: "ZZ kullanıcı notu" };
const FRESH = { ...base, id: "b6200000-0000-4000-8000-000000000002", source_id: "k2", issue: FRESH_TITLE, stones_text: "AMETİST, LEPİDOLİT",
  notes_text: COND, notes_text_2: STOCK, notes_text_3: "ZZ kullanıcı notu 2" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();
for (const vp of [{ width: 320, height: 640, tag: "mobil320" }, { width: 390, height: 844, tag: "mobil390" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `b6-2-${vp.tag}`;
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
    if (url.pathname === "/api/dogaltas/combinations") {
      const q = JSON.stringify([...url.searchParams.values()]);
      const rows = q.includes("GÜNCEL KOMBİ") ? [FRESH] : q.includes("ESKİ ÖZETLİ") ? [STALE] : [STALE, FRESH];
      return route.fulfill({ status: 200, json: { ok: true, rows, count: rows.length } });
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  try {
    // (1) Taşları değiştirilmiş kombinasyon
    await page.goto(`${BASE}/dogaltas/kombinasyonlar/${encodeURIComponent(STALE_TITLE)}`, { waitUntil: "load" });
    await page.getByText("ZZ kullanıcı notu").first().waitFor({ timeout: 60000 });
    await sleep(800);
    const notes = page.locator('[data-testid="stale-summary-note"]');
    ok(g, "koşul ve stok özetinde 2 ayrı 'GÜNCEL DEĞİL' uyarısı (role=note)", await notes.count() === 2 && await page.getByRole("note").filter({ hasText: "GÜNCEL DEĞİL" }).count() === 2, await notes.count());
    const first = (await notes.first().innerText()).trim();
    ok(g, "uyarı metni açık: önceki taş listesine ait, yeniden hesaplanmadı", first.includes("önceki taş listesine (AMETİST, LEPİDOLİT, AKİK) aittir") && first.includes("yeniden hesaplanmadı"), first);
    ok(g, "uyarı görünür (ekran genişliğine sığar)", await notes.first().isVisible() && ((await notes.first().boundingBox())?.width ?? 999) <= vp.width, JSON.stringify(await notes.first().boundingBox()));
    const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    ok(g, "özgün özet metni uyarının altında aynen okunur", body.includes("Arama Koşulları:") && body.includes("Lityum ≥ %1") && body.includes("Stok: 2/3 stokta"), body.slice(0, 300));
    ok(g, "uyarı satırı özet metninde ikinci kez tekrarlanmaz", (body.match(/GÜNCEL DEĞİL/g) || []).length === 2, (body.match(/GÜNCEL DEĞİL/g) || []).length);
    ok(g, "kullanıcı notu aynen", body.includes("ZZ kullanıcı notu"));
    ok(g, "yatay taşma yok", await noHScroll());
    // (2) Taşları değişmemiş kombinasyon — eskisi gibi
    await page.goto(`${BASE}/dogaltas/kombinasyonlar/${encodeURIComponent(FRESH_TITLE)}`, { waitUntil: "load" });
    await page.getByText("ZZ kullanıcı notu 2").first().waitFor({ timeout: 60000 });
    await sleep(800);
    const body2 = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    ok(g, "işaretsiz kombinasyonda uyarı YOK, özet eskisi gibi", await page.locator('[data-testid="stale-summary-note"]').count() === 0 && !body2.includes("GÜNCEL DEĞİL") && body2.includes("Arama Koşulları:") && body2.includes("Stok: 2/3 stokta"), body2.slice(0, 300));
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) { ok(g, "beklenmeyen hata", false, String(e?.stack ?? e)); }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
