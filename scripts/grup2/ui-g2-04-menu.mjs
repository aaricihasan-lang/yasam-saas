// G2-04 — Danışan Yolculuğu › Analizler: Normal Çakra / Çakra-Gezegen penceresi açıkken sol menü analiz içeriğini örtmez.
// Geniş / dar / daraltılmış menü masaüstü, mobil tarayıcı, Android uygulama (WebView UA). Kök pencereler (onay, bildirim)
// yine üstte; Kaydet ve Kapat / Word Al / Tümünü Temizle; kapanınca sayfa katmanı ve menü eski hâlinde; +/− renkleri aynen.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas). Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup2/ui-g2-04-menu.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3977";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLIENT = "c0000000-0000-4000-8000-000000000001";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { clients: true },
};
const APP_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 YasamSistemiAndroid/1.0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

// Pencerede ölçülecek noktalar: en üstteki öğe pencere örtüsünün içinde mi?
const probe = (page) => page.evaluate(() => {
  const overlay = document.querySelector("[data-dy-analysis-modal]") ?? [...document.querySelectorAll("div")].find((d) => d.className.includes("z-[10000]") && d.className.includes("fixed"));
  const at = (el, dx = 6) => {
    if (!el) return "yok";
    const r = el.getBoundingClientRect();
    const x = Math.max(1, r.left + dx), y = r.top + Math.min(r.height / 2, 14);
    if (y < 0 || y > innerHeight) return "ekran-dışı";
    const top = document.elementFromPoint(x, y);
    return overlay.contains(top) ? "ANALİZ" : `ÖRTÜLÜ:${top?.tagName}.${String(top?.className).slice(0, 30)}`;
  };
  const fields = document.querySelector('[data-testid="analysis-fields"]');
  const label = fields?.querySelector("section div[style]");          // ilk satır etiketi (renkli)
  const input = fields?.querySelector("section input");               // ilk ölçüm hücresi
  const sectionTitle = fields?.querySelector("section > div");        // bölüm başlığı (Seans öncesi …)
  return { title: at(document.querySelector("#analysis-print-area h3")), section: at(sectionTitle), label: at(label), input: at(input) };
});
const mainZ = (page) => page.evaluate(() => getComputedStyle(document.querySelector("main")).zIndex);

async function run(vp) {
  const g = `g2-04-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, ...(vp.ua ? { userAgent: vp.ua } : {}) });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  const posts = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    if (p === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (p === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (p === `/api/clients/${CLIENT}`) return route.fulfill({ status: 200, json: { ok: true, client: { id: CLIENT, tenant_id: TENANT, first_name: "ZZ", last_name: "Menü", full_name: "ZZ Menü", row_version: 1 } } });
    if (p === `/api/clients/${CLIENT}/analyses` && req.method() === "POST") { posts.push(req.postDataJSON()); return route.fulfill({ status: 200, json: { ok: true, id: "a0000000-0000-4000-8000-0000000000a1" } }); }
    if (p === `/api/clients/${CLIENT}/analyses`) return route.fulfill({ status: 200, json: { ok: true, analyses: [] } });
    if (p.endsWith("/analyses/upload-image")) return route.fulfill({ status: 200, json: { ok: true } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, items: [] } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  try {
    await page.goto(`${BASE}/dashboard/clients/${CLIENT}?tab=analizler`, { waitUntil: "load" });
    await page.getByRole("button", { name: "Analizi Aç" }).first().waitFor({ timeout: 90000 });
    await sleep(800);
    if (vp.collapse) { await page.locator("[data-side-toggle]").first().click(); await sleep(600); }
    const z0 = await mainZ(page);
    for (const [i, name] of [[0, "Çakra"], [1, "Çakra-Gezegen"]]) {
      await page.getByRole("button", { name: "Analizi Aç" }).nth(i).click();
      await page.getByTestId("analysis-fields").waitFor({ timeout: 10000 });
      await sleep(600);
      const pr = await probe(page);
      ok(g, `${name}: başlık / bölüm başlığı / satır etiketi / ölçüm hücresi örtülmez`, Object.values(pr).every((v) => v === "ANALİZ" || v === "ekran-dışı" || v === "yok") && pr.title === "ANALİZ", JSON.stringify(pr));
      if (i === 1) {
        // Çakra-Gezegen: gezegen başlıkları (sol sütun dahil) — yatay kaydırılabilir panelin ilk hücreleri
        const planet = await page.evaluate(() => {
          const overlay = document.querySelector("[data-dy-analysis-modal]") ?? [...document.querySelectorAll("div")].find((d) => d.className.includes("z-[10000]") && d.className.includes("fixed"));
          const grid = document.querySelector('[data-testid="analysis-fields"] section .grid');
          const firstRowLabel = grid?.querySelector("div[style*='background']");
          const r = firstRowLabel?.getBoundingClientRect();
          if (!r) return "yok";
          const top = document.elementFromPoint(r.left + 6, r.top + r.height / 2);
          return overlay.contains(top) ? "ANALİZ" : `ÖRTÜLÜ:${top?.tagName}`;
        });
        ok(g, "Çakra-Gezegen: gezegen tablosu sol sütunu örtülmez", planet === "ANALİZ" || planet === "yok", planet);
      }
      // +/− renkleri (#657) aynen
      const f = page.getByTestId("analysis-fields").locator("input");
      await f.nth(0).fill("+3"); await f.nth(1).fill("-2");
      const bg = await f.evaluateAll((els) => els.slice(0, 2).map((e) => getComputedStyle(e).backgroundColor));
      ok(g, `${name}: +/− zemin renkleri (#657) aynen`, /rgba\(34, 197, 94, 0\.15\)|rgb.*34.*197.*94/.test(bg[0]) && /rgba\(239, 68, 68, 0\.15\)|rgb.*239.*68.*68/.test(bg[1]), JSON.stringify(bg));
      if (i === 0) {
        // Word Al (kayıtsız analiz → mevcut bilgi bildirimi) — bildirim pencerenin ÜSTÜNDE görünür
        await page.getByRole("button", { name: "Word Al" }).first().click();
        await sleep(500);
        const toast = await page.evaluate(() => {
          const el = [...document.querySelectorAll("body *")].find((e) => e.children.length === 0 && /önce analizi kaydedin/i.test(e.textContent ?? "") && e.getBoundingClientRect().width > 0 && !e.closest("[data-dy-analysis-modal]"));
          if (!el) return "yok";
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return top === el || el.contains(top) || top?.contains(el) ? "ÜSTTE" : `ALTTA:${top?.tagName}`;
        });
        ok(g, "Word Al: mevcut bildirim pencerenin üstünde görünür", toast === "ÜSTTE", toast);
        // Tümünü Temizle → mevcut onay penceresi pencerenin üstünde; Vazgeç
        await page.getByRole("button", { name: "Tümünü Temizle" }).first().click();
        await sleep(500);
        const dlg = page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
        const dlgTop = await dlg.evaluate((d) => { const r = d.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + 20); return d.contains(t) ? "ÜSTTE" : `ALTTA:${t?.tagName}`; }).catch(() => "yok");
        ok(g, "Tümünü Temizle: onay penceresi analiz penceresinin üstünde", dlgTop === "ÜSTTE", dlgTop);
        await page.getByRole("button", { name: /Vazgeç|İptal|Hayır/ }).last().click().catch(() => page.keyboard.press("Escape"));
        await sleep(400);
        ok(g, "Temizle vazgeçilince değerler korunur", (await f.nth(0).inputValue()) === "+3");
        // Kaydet ve Kapat → POST, pencere kapanır
        await page.getByTestId("analysis-save-close").click();
        await page.getByTestId("analysis-save-close").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
        ok(g, "Kaydet ve Kapat: kayıt gönderildi + pencere kapandı", posts.length === 1 && (await page.locator("[data-testid='analysis-fields']").count()) === 0, String(posts.length));
      } else {
        await page.getByRole("button", { name: "Kapat" }).first().click();
        await sleep(400);
      }
      ok(g, `${name} kapanınca sayfa katmanı eski hâlinde (main z-index ${z0})`, (await mainZ(page)) === z0, `${z0} → ${await mainZ(page)}`);
    }
    if (!touch) {
      const menuTop = await page.evaluate(() => {
        const item = document.querySelector('[class*="sideMenu_menuItem"]');
        if (!item) return "yok";
        const r = item.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + 10, r.top + r.height / 2);
        return item.contains(t) || t?.closest('[class*="sideMenu"]') ? "MENÜ" : `ÖRTÜLÜ:${t?.tagName}`;
      });
      ok(g, "pencere kapalıyken sol menü eskisi gibi erişilebilir", menuTop === "MENÜ", menuTop);
    }
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}

for (const vp of [
  { width: 1920, height: 1080, tag: "genis-masaustu" },
  { width: 1280, height: 800, tag: "dar-masaustu" },
  { width: 1280, height: 800, tag: "menu-daraltilmis", collapse: true },
  { width: 390, height: 844, tag: "mobil-tarayici" },
  { width: 390, height: 844, tag: "android-uygulama", ua: APP_UA },
]) await run(vp);
await browser.close();
console.log(`\nG2-04 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
