// REF-04 — Refleksoloji Word: sunucu 413 (rapor 4,4 MB'ı aşıyor) döndüğünde kullanıcı ANLAŞILIR mesajı görür,
// indirme başlamaz, sayfa çökmez (liste "Tümünü Word" + kayıtlı protokol detayı "Word Raporu").
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas). Çalıştırma: node scripts/ref04-word-size/ui-ref04-413.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e4", email: "zz-expert-ref@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { reflexology: true, clients: true },
};
const P1 = "a1000000-0000-4000-8000-000000000001";
const PROTOS = [P1, "a1000000-0000-4000-8000-000000000002"].map((id, i) => ({
  id, tenant_id: TENANT, source_uid: `zz-${i}`, title: `ZZ Protokol ${i}`, target_problem: "ZZ", organs: "Böbrek | Kalp",
  application_notes: "ZZ not", raw_json: { id: `zz-${i}`, title: `ZZ Protokol ${i}`, organs: ["Böbrek", "Kalp"] }, created_at: "2026-10-01T09:00:00.000Z",
}));
const MSG_BULK = "Rapor indirilebilir boyutu (4,4 MB) aşıyor. Lütfen daha az protokol seçerek tekrar deneyin.";
const MSG_SINGLE = "Rapor indirilebilir boyutu (4,4 MB) aşıyor.";
const VIEWPORTS = [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }];

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

async function newPage(vp) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768, locale: "tr-TR", acceptDownloads: true });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: BASE }]);
  const errors = [];
  const reports = [];
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
    if (url.pathname === "/api/refleksoloji/protocols") return route.fulfill({ status: 200, json: { ok: true, protocols: PROTOS } });
    if (url.pathname.startsWith("/api/refleksoloji/protocols/")) return route.fulfill({ status: 200, json: { ok: true, protocol: PROTOS[0] } });
    if (url.pathname === "/api/refleksoloji/protocol-report") {
      let body = {};
      try { body = req.postDataJSON() ?? {}; } catch { /* boş */ }
      reports.push(body);
      // Gerçek route'un 413 yanıt gövdesiyle birebir.
      return route.fulfill({ status: 413, json: { ok: false, error: body.exportMode === "single" ? MSG_SINGLE : MSG_BULK } });
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], document: null, notes: [] } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  let downloads = 0;
  page.on("download", () => { downloads++; });
  return { ctx, page, errors, reports, downloads: () => downloads };
}

async function run(vp) {
  {
    const g = `liste-tumu-${vp.tag}`;
    const { ctx, page, errors, reports, downloads } = await newPage(vp);
    try {
      await page.goto(`${BASE}/refleksoloji/kayitli-protokoller`, { waitUntil: "load" });
      const btn = page.getByRole("button", { name: /Tümünü Word|📄 .*\(2\)/ }).first();
      await btn.waitFor({ timeout: 30000 });
      await btn.click();
      await page.getByText(MSG_BULK).first().waitFor({ timeout: 8000 });
      ok(g, "413 → anlaşılır mesaj görünür (daha az protokol seçin)", await page.getByText(MSG_BULK).first().isVisible());
      ok(g, "istek 'all' modunda gitti", reports.length === 1 && reports[0].exportMode === "all", JSON.stringify(reports));
      ok(g, "indirme başlamadı", downloads() === 0);
      await sleep(400);
      ok(g, "düğme yeniden kullanılabilir (meşgul durumda kalmadı)", await btn.isEnabled());
      ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
  {
    const g = `detay-word-${vp.tag}`;
    const { ctx, page, errors, reports, downloads } = await newPage(vp);
    try {
      await page.goto(`${BASE}/refleksoloji/kayitli-protokoller/${P1}`, { waitUntil: "load" });
      const btn = page.getByRole("button", { name: "Word Raporu" }).first();
      await btn.waitFor({ timeout: 30000 });
      await btn.click();
      await page.getByText(MSG_SINGLE, { exact: true }).first().waitFor({ timeout: 8000 });
      ok(g, "413 → tek protokol mesajı görünür", await page.getByText(MSG_SINGLE, { exact: true }).first().isVisible());
      ok(g, "istek 'single' + protocolId", reports.length === 1 && reports[0].exportMode === "single" && reports[0].protocolId === P1, JSON.stringify(reports));
      ok(g, "indirme başlamadı", downloads() === 0);
      ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

for (const vp of VIEWPORTS) await run(vp);
await browser?.close();
console.log(`\nREF-04 413 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
