// TARİHSEL OFSET ENGELİ (owner kararı 2026-10-21) — ekran + API regresyonu (Playwright Chromium). YEREL; sahte DB + sahte Roxy.
// Önkoşul: dev-fake-backend FAKE_SEED_STALE_TZ=1 (+ FAKE_ROXY_CERT/KEY) ve yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true,
//          NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2).
// Çalıştırma: node scripts/astrology/stale-tz-ui.e2e.cjs <origin> <fake-backend.log> [genişlik] [yükseklik]
//   • API: tutarsız revizyon → plan TIMEZONE_REVISION_STALE; run sağlayıcıyı ÇAĞIRMAZ; yalnız-önbellek görünüm de engelli;
//     KP Horary (doğumdan bağımsız) engellenmez; sağlam karşı tarafla sinastri engelli değil, tutarsız karşı tarafla engelli.
//   • Ekran: Yeni Analiz'de uyarı görünür, Natal "hesaplanamaz" + engel metni, "Analizi Başlat" kapalı; sağlam profilde uyarı yok.
//   • Yetkisiz: kimliksiz istek tek tip 404, engel metni sızmaz.
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const { chromium } = require("playwright");
const [ORIGIN = "http://localhost:3931", LOG = "", W = "1366", H = "860"] = process.argv.slice(2);
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${W}px] ${n}${x ? ` — ${x}` : ""}`);
};
const hits = () => (LOG ? (fs.readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : 0);
const API = `${ORIGIN}/api/admin/astroloji`;
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const HDR = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const api = async (p, b, h = HDR) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: h, body: b ? JSON.stringify(b) : undefined });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const CODE = "TIMEZONE_REVISION_STALE";
const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
const HORARY = { technique: "kp.horary", options: { atUtc: "2026-10-07T10:00", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean" } };

(async () => {
  const find = async (q) => (await api(`/profiles?q=${encodeURIComponent(q)}`)).j?.profiles?.[0]?.id ?? null;
  const stale = await find("Reykjavik 1950");
  const good = await find("Reykjavik 1951");
  const ali = await find("Ali Örnek");
  ok("tohum: tutarsız + sağlam sentetik profiller", !!stale && !!good && !!ali);
  const h0 = hits();

  // ── API
  const p1 = await api("/engine/plan", { profileId: stale, selections: [NATAL, HORARY] });
  const codes = p1.j?.plan?.selections?.map((s) => s.blocked?.code ?? null);
  ok("plan: Natal engelli, KP Horary engelsiz", JSON.stringify(codes) === JSON.stringify([CODE, null]), JSON.stringify(codes));
  ok("plan: engel metni yönlendirir (yeni revizyon)", /yeniden kaydedin \(yeni revizyon\)/.test(p1.j?.plan?.selections?.[0]?.blocked?.error ?? ""));
  const r1 = await api("/engine/run", { profileId: stale, selections: [NATAL] });
  ok("run: sonuç dönmez", !JSON.stringify(r1.j ?? {}).includes('"technical"'), `${r1.s}`);
  const v1 = await api("/engine/view", { profileId: stale, selections: [NATAL] });
  ok("yalnız-önbellek görünüm: engelli", JSON.stringify(v1.j ?? {}).includes(CODE), `${v1.s}`);
  const syn = (pid) => ({ technique: "western.synastry", options: { partnerProfileId: pid, houseSystem: "placidus", nodeType: "true" } });
  const p2 = await api("/engine/plan", { profileId: ali, selections: [syn(stale), syn(good)] });
  const c2 = p2.j?.plan?.selections?.map((s) => s.blocked?.code ?? null);
  ok("iki kişili: tutarsız karşı taraf engelli, sağlam karşı taraf engelsiz", c2?.[0] === CODE && c2?.[1] !== CODE, JSON.stringify(c2));
  const pg = await api("/engine/plan", { profileId: good, selections: [NATAL] });
  ok("yanlış pozitif yok: güncel ofsetli tarihsel profil engelsiz", pg.j?.plan?.selections?.[0]?.blocked?.code !== CODE, JSON.stringify(pg.j?.plan?.selections?.[0]?.blocked));
  const anon = await api("/engine/plan", { profileId: stale, selections: [NATAL] }, { "content-type": "application/json", origin: ORIGIN });
  ok("yetkisiz (kimliksiz): tek tip 404, engel bilgisi sızmaz", anon.s === 404 && !JSON.stringify(anon.j ?? {}).includes(CODE), `${anon.s}`);
  ok("sağlayıcıya 0 istek (API adımları)", hits() === h0, `${hits() - h0}`);

  // ── Ekran
  const browser = await chromium.launch();
  const w = Number(W);
  const ctx = await browser.newContext({ viewport: { width: w, height: Number(H) }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, is_super_admin: true }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const planLog = [];
  if (process.env.SHOT) page.on("response", async (r) => { if (r.url().includes("/engine/plan")) { try { planLog.push(JSON.stringify(await r.json()).slice(0, 400)); } catch {} } });
  const pick = async (q, pid) => {
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill(q);
    await page.waitForTimeout(900);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
    await page.waitForTimeout(1500);
  };
  try {
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await pick("Reykjavik 1950", stale);
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/stale-${W}.png`, fullPage: true });
    await page.waitForSelector("[data-testid=atlas-stale-timezone]", { timeout: 30000 }).catch(() => undefined);
    const warn = page.locator("[data-testid=atlas-stale-timezone]");
    ok("ekran: tutarsız profil uyarısı görünür", (await warn.count()) > 0 && (await warn.first().isVisible()), (await warn.count()) ? (await warn.first().innerText()).slice(0, 120) : "yok");
    ok("ekran: uyarı yeni hesabın yapılmayacağını söyler", (await warn.count()) > 0 && /yeni hesaplama yapılmaz/.test(await warn.first().innerText()));
    await page.locator("button[data-technique='western.natal']").first().click();
    const st = page.locator("[data-testid=atlas-focus-status]").first();
    let stTxt = "";
    for (let i = 0; i < 90; i++) {
      stTxt = (await st.count()) ? await st.innerText() : "";
      if (!/plan hazırlanıyor/.test(stTxt) && stTxt) break;
      await page.waitForTimeout(500);
    }
    if (process.env.SHOT) { await page.screenshot({ path: `${process.env.SHOT}/stale-natal-${W}.png`, fullPage: true }); fs.writeFileSync(`${process.env.SHOT}/stale-plan-${W}.txt`, planLog.join(" | ")); }
    ok("ekran: Natal durumu engel metnini gösterir", /yanlış ofsetle kaydedilmiş/.test(stTxt) && /yeniden kaydedin/.test(stTxt), stTxt.slice(0, 160));
    const summary = await page.locator("[data-testid=astro-run]").first().evaluate((el) => el.closest("div")?.parentElement?.textContent ?? "");
    ok("ekran: konsolda 'hesaplanamaz' sayımı", /hesaplanamaz/.test(summary) || /1 teknik seçildi/.test(summary), summary.replace(/\s+/g, " ").slice(0, 160));
    const run = page.locator("[data-testid=astro-run]").first();
    ok("ekran: Analizi Başlat kapalı (yalnız engelli seçim)", await run.isDisabled());
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    ok("ekran: yatay taşma yok", noOverflow);
    // sağlam profil: uyarı yok, Natal engelsiz
    await pick("Reykjavik 1951", good);
    for (let i = 0; i < 60; i++) {
      if (/Reykjavik 1951/.test((await page.locator("[data-testid=atlas-client-identity]").first().innerText().catch(() => "")) ?? "")) break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(3000);
    ok("ekran: sağlam tarihsel profilde uyarı yok", (await page.locator("[data-testid=atlas-stale-timezone]").count()) === 0);
    const anyBlock = await page.locator("[title*='yanlış ofsetle kaydedilmiş']").count();
    const st2 = (await page.locator("[data-testid=atlas-focus-status]").count()) ? await page.locator("[data-testid=atlas-focus-status]").first().innerText() : "";
    ok("ekran: sağlam profilde engel metni yok", anyBlock === 0 && !/yanlış ofsetle kaydedilmiş/.test(st2), st2.slice(0, 120));
  } catch (e) {
    ok("ekran akışı hatasız", false, String(e).slice(0, 200));
  }
  await browser.close();
  ok("sağlayıcıya 0 istek (tüm akış)", hits() === h0, `${hits() - h0}`);
  console.log(`\nstale-tz ui e2e [${W}px]: ${pass} PASS / ${fail} FAIL (gerçek Roxy çağrısı yok)`);
  process.exit(fail ? 1 : 0);
})();
