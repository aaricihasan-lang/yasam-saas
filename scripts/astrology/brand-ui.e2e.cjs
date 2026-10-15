// 2026-10-15 marka temizliği — kullanıcıya GÖRÜNEN arayüz metninde sağlayıcı adı (Roxy / RoxyAPI) yok. Gerçek tarayıcı,
// YEREL: next dev 3931 + dev-fake-backend (FAKE_ROXY_RELABEL=1). Gerçek DB / Roxy YOK.
// Çalıştırma: node scripts/astrology/brand-ui.e2e.cjs [genişlik] [yükseklik]
//   B1 Atlas ana ekranı, Yeni Analiz, Analiz Arşivi, Bilgi Bankası, danışan dosyası
//   B2 26 tekniğin kayıtlı analizi: masadaki HER sekme (Harita / Teknik / Otomatik Yorum / Bilgi Bankam / Kendi Yorumum)
//   Görünür metin (innerText) + title / aria-label öznitelikleri taranır.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const [W = "1366", H = "860"] = process.argv.slice(2);
const width = Number(W);
const BASE = "http://localhost:3931/admin/astroloji";
const API = "http://localhost:3931/api/admin/astroloji";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${width}px] ${n}${x ? ` — ${x}` : ""}`);
};
const api = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const AT = "2026-10-07T09:00";
const SEL = {
  "western.natal": { houseSystem: "placidus", nodeType: "true" }, "western.transit": { atUtc: AT, nodeType: "true" }, "western.forecast": { startDate: "2026-10-01", days: 90 },
  "western.progression": { targetDate: "2026-10-07", nodeType: "true" }, "western.solar_arc": { targetDate: "2026-10-07", nodeType: "true" }, "western.solar_return": { returnYear: 2026, houseSystem: "placidus" },
  "western.lunar_return": { month: "2026-10", houseSystem: "placidus" }, "western.astrocartography": {}, "western.relocation": { targetLocationId: "us-ny-new-york", houseSystem: "placidus" },
  "western.local_space": { referenceLocationId: null }, "western.fixed_stars": { nodeType: "true", orb: 1, reportCatalog: true },
  "vedic.d1": {}, "vedic.varga": { division: 9 }, "vedic.dasha": {}, "vedic.drishti": {}, "vedic.ashtakavarga": {}, "vedic.shadbala": {}, "vedic.panchanga": {}, "vedic.transit": { atUtc: AT },
  "kp.chart": { ayanamsa: "kp-newcomb", nodeType: "mean" }, "kp.dasha": { ayanamsa: "kp-newcomb", nodeType: "mean" }, "kp.ruling": { atUtc: AT, nodeType: "mean" },
  "kp.transit": { atUtc: AT, ayanamsa: "kp-newcomb", nodeType: "mean" }, "kp.horary": { atUtc: AT, horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean" },
};
/** Görünür metin + kullanıcıya görünen öznitelikler (title, aria-label, placeholder, alt). */
const scan = (page) =>
  page.evaluate(() => {
    const out = [];
    const re = /roxy/i;
    const txt = document.body.innerText;
    for (const m of txt.matchAll(/.{0,40}roxy.{0,40}/gi)) out.push(`metin: ${m[0]}`);
    for (const el of document.querySelectorAll("[title],[aria-label],[placeholder],[alt]")) {
      for (const a of ["title", "aria-label", "placeholder", "alt"]) {
        const v = el.getAttribute(a);
        if (v && re.test(v)) out.push(`${a}: ${v.slice(0, 80)}`);
      }
    }
    return out;
  });

(async () => {
  const pid = (await api("/profiles", { label: `Marka Taraması ${Date.now().toString(36)}`, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" })).json.profile.id;
  const partner = (await api("/profiles", { label: `Marka Partner ${Date.now().toString(36)}`, birthDate: "1988-03-02", birthTime: "09:10", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-06-ankara" })).json.profile.id;
  const all = { ...SEL, "western.synastry": { partnerProfileId: partner, houseSystem: "placidus", nodeType: "true" }, "western.composite": { partnerProfileId: partner, houseSystem: "placidus", nodeType: "true" } };
  const ids = {};
  for (const [technique, options] of Object.entries(all)) {
    const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique, options }] });
    const s = plan.json?.plan?.selections?.[0];
    if (!s) continue;
    const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: s.technique, options: s.options ?? options }], confirmNewRequests: plan.json.plan.newRequestCount });
    const r = run.json?.results?.[0];
    if (!r?.ok) continue;
    const id = (await api("/analyses", { profileId: pid, revision: 1, technique: r.technique, options: r.view.options, saveRequestId: randomUUID(), includeProviderInterp: true })).json?.analysisId;
    if (id) ids[technique] = id;
  }
  ok(`hazırlık: ${Object.keys(ids).length} teknik kaydedildi (26 hedef)`, Object.keys(ids).length === 26, Object.keys(all).filter((k) => !ids[k]).join(","));
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width, height: Number(H) } });
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true }, { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  // B1 — genel ekranlar
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
  await page.waitForTimeout(1500);
  let found = await scan(page);
  ok("B1 Atlas ana ekranı: sağlayıcı adı yok", found.length === 0, found.join(" | "));
  for (const portal of ["new", "archive", "kb"]) {
    await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    const p = page.locator(`[data-portal=${portal}]`).first();
    ok(`B1 ${portal} portalı var`, (await p.count()) > 0);
    if (!(await p.count())) continue;
    await p.click();
    await page.waitForTimeout(2500);
    found = await scan(page);
    ok(`B1 ${portal} ekranı: sağlayıcı adı yok`, found.length === 0, found.join(" | "));
  }
  // B2 — her teknik, her masa sekmesi (danışan dosyasına modül içinde geçilir: aynı belgede hash ataması)
  const openFile = async () => {
    await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    await page.evaluate((x) => {
      window.location.hash = `danisan/${x}`;
    }, pid);
  };
  await openFile();
  await page.waitForSelector("[data-testid=astro-saved-analyses]", { timeout: 120000 });
  found = await scan(page);
  ok("B1 danışan dosyası: sağlayıcı adı yok", found.length === 0, found.join(" | "));
  for (const [tech, id] of Object.entries(ids)) {
    await openFile();
    await page.waitForSelector(`[data-saved-item="${id}"]`, { timeout: 120000 });
    await page.locator(`[data-saved-item="${id}"]`).click();
    await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
    await page.waitForTimeout(1200);
    const hits = new Set(await scan(page));
    const tabs = page.locator("[data-testid=astro-saved-analysis] [role=tab]");
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click().catch(() => undefined);
      await page.waitForTimeout(500);
      for (const h of await scan(page)) hits.add(h);
    }
    ok(`B2 ${tech}: ${n} sekmenin hiçbirinde sağlayıcı adı yok`, hits.size === 0, [...hits].slice(0, 3).join(" | "));
  }
  await browser.close();
  console.log(`\nastrology brand UI [${width}px]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
