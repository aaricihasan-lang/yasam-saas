// Manuel test Madde 20 — Danışan sekmeleri: Beslenme + Randevular GÖRSEL olarak yan yana (Playwright, yerel build,
// ağ-mock; prod'a SIFIR temas). DOM index testi YETMEZ → gerçek kutu ölçümü (aynı satır/Y bandı, sağında, taşma yok).
// Çalıştırma: scripts/wt9/ui-wt9.mjs ile aynı (fake-supabase-sink + sahte env build + `next start -p 3911`):
//   node scripts/manual-14-20/ui-m20.mjs   (UI_BASE ile port)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLIENT_ID = "c0000000-0000-4000-8000-000000000020";
const ALL_PERMS = ["clients", "appointments", "stones", "yasam_hafizasi", "human_design"];
const userWith = (perms) => ({
  id: "00000000-0000-4000-8000-0000000000e2", email: "zz-expert20@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: Object.fromEntries(perms.map((k) => [k, true])),
});
const CLIENT = {
  id: CLIENT_ID, tenant_id: TENANT, ad: "ZZ Ayşe", soyad: "Yılmaz", telefon: "0500 000 00 00", dogum: "1990-05-12", gorusme: "2026-10-01",
  burc: "Boğa", kan: "A Rh+", mizac: "Sıcak", created_at: "2026-09-01T09:00:00.000Z",
};
const DESKTOP = [1920, 1536, 1440, 1366, 1280, 1024];
const MOBILE = [375, 390, 768];

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 400) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

async function openClient(width, perms) {
  browser ??= await chromium.launch();
  const user = userWith(perms);
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, locale: "tr-TR" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: BASE }]);
  const errors = [];
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, user);
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    if (url.pathname === `/api/clients/${CLIENT_ID}`) return route.fulfill({ status: 200, json: { client: CLIENT } });
    // Beslenme paneli içeriği bu testin konusu değil (yalnız sekme yerleşimi) → erişim yok yanıtı.
    if (url.pathname.startsWith("/api/beslenme/")) return route.fulfill({ status: 403, json: { ok: false, error: "forbidden" } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], notes: [], appointments: [], count: 0 } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/dashboard/clients/${CLIENT_ID}`, { waitUntil: "load" });
  await page.locator("#tab-randevular").waitFor({ timeout: 20000 });
  await page.locator("#tab-beslenme").waitFor({ timeout: 20000 });
  if (perms.includes("yasam_hafizasi")) await page.locator("#tab-hafiza").waitFor({ timeout: 15000 }).catch(() => undefined);
  await sleep(500);
  return { ctx, page, errors };
}

/** Sekme kutuları + taşma ölçümü. `ungroup`: eski davranışı (çift grubu yok) yeniden üretmek için grubu aç. */
async function measure(page, { ungroup = false } = {}) {
  return page.evaluate((ungroup) => {
    const list = document.querySelector('[role="tablist"]');
    if (ungroup) {
      for (const g of list.querySelectorAll("[data-tab-group]")) { while (g.firstChild) list.insertBefore(g.firstChild, g); g.remove(); }
    }
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cy: r.y + r.height / 2 }; };
    const tabs = [...list.querySelectorAll('[role="tab"]')].map((el) => ({ id: el.id.replace("tab-", ""), ...box(el) }));
    const word = [...list.querySelectorAll("button")].find((b) => !b.getAttribute("role"));
    return {
      tabs, word: word ? box(word) : null,
      rows: [...new Set(tabs.map((t) => Math.round(t.y)))].length,
      docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      listOverflow: list.scrollWidth > list.clientWidth + 1,
      vw: window.innerWidth,
      grouped: Boolean(list.querySelector('[data-tab-group="beslenme+randevular"]')),
    };
  }, ungroup);
}
function pairCheck(m) {
  const b = m.tabs.find((t) => t.id === "beslenme"), r = m.tabs.find((t) => t.id === "randevular");
  const sameRow = Math.abs(b.cy - r.cy) <= 2 && Math.abs(b.y - r.y) <= 2;
  const rightOf = r.x >= b.x + b.w - 0.5;
  const adjacent = r.x - (b.x + b.w) <= 12; // gap-1.5 = 6px
  return { b, r, sameRow, rightOf, adjacent };
}

async function testDesktop() {
  for (const perms of [ALL_PERMS, ["clients", "appointments", "stones"]]) {
    const tag = perms.length === ALL_PERMS.length ? "13-sekme" : "11-sekme";
    for (const w of DESKTOP) {
      const g = `M20-masaüstü-${w}-${tag}`;
      const { ctx, page, errors } = await openClient(w, perms);
      try {
        const m = await measure(page);
        const p = pairCheck(m);
        ok(g, "Beslenme ve Randevular kırılmaz grupta", m.grouped);
        ok(g, "Beslenme + Randevular AYNI satır / Y bandı", p.sameRow, JSON.stringify({ b: p.b, r: p.r }));
        ok(g, "Randevular Beslenme'nin HEMEN sağında", p.rightOf && p.adjacent, JSON.stringify({ bEnd: p.b.x + p.b.w, rX: p.r.x }));
        const ids = m.tabs.map((t) => t.id);
        ok(g, "DOM sırası: Randevular = Beslenme + 1 (son sekme)", ids.indexOf("randevular") === ids.indexOf("beslenme") + 1 && ids.at(-1) === "randevular", ids.join(","));
        ok(g, "yatay taşma yok (sayfa + sekme çubuğu)", !m.docOverflow && !m.listOverflow);
        ok(g, "tüm sekmeler ekranda", m.tabs.every((t) => t.x >= 0 && t.x + t.w <= m.vw + 1));
        ok(g, "Word Raporu butonu duruyor", Boolean(m.word));
        ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
        if (w === 1366 || w === 1536) {
          // Kanıt: eski davranış (grupsuz) bu genişlikte çifti bölüyor muydu? (yalnız bilgi + kök neden ispatı)
          const old = pairCheck(await measure(page, { ungroup: true }));
          console.log(`   ℹ️ [${g}] grupsuz (eski) düzen: aynı satır=${old.sameRow}`);
        }
      } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
    }
  }
}

async function testOwnerReproduction() {
  // Owner'ın gördüğü kırılma: satır sonu tam Beslenme | Randevular arasına düşen genişliği BUL (eski düzenle),
  // sonra aynı genişlikte yeni düzenin çifti birlikte tuttuğunu doğrula.
  const g = "M20-owner-reprodüksiyon";
  let found = null;
  for (let w = 1024; w <= 1920 && !found; w += 8) {
    const { ctx, page } = await openClient(w, ALL_PERMS);
    try {
      const old = pairCheck(await measure(page, { ungroup: true }));
      if (!old.sameRow) found = w;
    } finally { await ctx.close(); }
  }
  ok(g, "eski (grupsuz) düzende çiftin bölündüğü masaüstü genişliği bulundu (owner bulgusu yeniden üretildi)", found !== null, "bulunamadı");
  if (found !== null) {
    const { ctx, page, errors } = await openClient(found, ALL_PERMS);
    try {
      const m = await measure(page);
      const p = pairCheck(m);
      ok(g, `${found}px: yeni düzende Beslenme + Randevular aynı satırda yan yana`, p.sameRow && p.rightOf && p.adjacent, JSON.stringify({ b: p.b, r: p.r }));
      ok(g, `${found}px: yatay taşma yok`, !m.docOverflow && !m.listOverflow);
      ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
    } finally { await ctx.close(); }
  }
}

async function testMobile() {
  for (const w of MOBILE) {
    const g = `M20-mobil-${w}`;
    const { ctx, page, errors } = await openClient(w, ALL_PERMS);
    try {
      const m = await measure(page);
      const p = pairCheck(m);
      ok(g, "mevcut responsive davranış: sekmeler çok satıra sarılıyor (tek satıra sıkıştırma YOK)", m.rows >= 2, m.rows);
      ok(g, "Beslenme + Randevular yan yana (sığdığı için)", p.sameRow && p.rightOf);
      ok(g, "yatay taşma yok", !m.docOverflow && !m.listOverflow);
      ok(g, "tüm sekmeler ekranda", m.tabs.every((t) => t.x >= 0 && t.x + t.w <= m.vw + 1));
      ok(g, "dokunma hedefi ≥ 40px", m.tabs.every((t) => t.h >= 40));
      ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

async function testTabSwitch() {
  const g = "M20-sekme-geçişi";
  const { ctx, page, errors } = await openClient(1366, ALL_PERMS);
  try {
    await page.locator("#tab-randevular").click();
    await sleep(400);
    ok(g, "Randevular tıklanınca seçili + paneli görünür", (await page.locator("#tab-randevular").getAttribute("aria-selected")) === "true" && (await page.locator("#tabpanel-randevular").isVisible()));
    await page.locator("#tab-beslenme").click();
    await sleep(400);
    ok(g, "Beslenme tıklanınca seçili", (await page.locator("#tab-beslenme").getAttribute("aria-selected")) === "true");
    await page.locator("#tab-randevular").focus();
    ok(g, "klavye odağı Randevular'a gidebilir", await page.evaluate(() => document.activeElement?.id === "tab-randevular"));
    ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

const ALL = { testDesktop, testOwnerReproduction, testMobile, testTabSwitch };
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(ALL);
try {
  for (const k of only) await ALL[k]();
} catch (e) {
  ok("runner", "beklenmeyen hata", false, e);
} finally {
  await browser?.close();
}
console.log(`\nMadde 20 UI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
