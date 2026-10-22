// ATLAS ROXY KALAN (2026-10-22) — Vedik aylık zamanlama (`vedic.monthly`): ekran + akış regresyonu (Playwright Chromium). YEREL;
// sahte DB + sahte sağlayıcı. GERÇEK SAĞLAYICI ÇAĞRISI YOK. 23.10.2026'dan beri Şubat 2026 dört aylık bölüm + doğum anı (A) için
// GERÇEK sağlayıcı yanıtları fixtures/golden/ altında; dev-fake-backend golden'ı BİREBİR gövdeyle ÖNCE eşler (şema örneği devreye girmez).
// Beklentiler gerçek veriye göredir: 16 giriş · 58 açı (majör 9 · minör 49) · 332 Ay açısı · 27 deklinasyon (15 paralel + 12 kontraparalel)
// · doğum anı 9 temas; Rahu/Ketu açı listelerinde var; yerelleştirilmiş adlar ("… Düğümü") ekrana girmez.
// Tohum: "Ali Örnek — natal" (sentetik A, İstanbul).
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend
//          (FAKE_ROXY_SCHEMA_EXAMPLES GEREKMEZ — golden önce).
// Çalıştırma: node scripts/astrology/vedik-aylik-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: Şubat 2026, 4 aylık bölüm + doğum anı → 5 istek; aynı seçim 0; gösterim saat dilimi değişimi 0; kaydet → aç (0 istek) →
//      Word / PDF 200 + içerik (yöntem, açı ↔ drishti ayrımı, deklinasyon, özet; sağlayıcı adı yok)
//   2) Seçici (1366×768): Vedik sekmesinde teknik; ay alanı, 5 bölüm, saat dilimi, Lahiri sabit notu
//   3) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: özet, zaman çizelgesi, gezegen filtresi, majör filtresi, saat dilimi değişimi,
//      doğum anı deklinasyonları; yatay taşma yok; Word/PDF iner; sağlayıcı adı / iç jargon yok. Tarayıcı öykünmesidir; fiziksel cihaz DEĞİL.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const JSZip = require("jszip");
const [ORIGIN = "http://localhost:3961", OUT = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const API = `${ORIGIN}/api/admin/astroloji`;
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const api = async (p, b, raw = false, method = null) => {
  const r = await fetch(`${API}${p}`, { method: method ?? (b ? "POST" : "GET"), headers: H, body: b ? JSON.stringify(b) : undefined });
  if (raw) return r;
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const JARGON = /\broxy\b|golden|fixture|şema-örneği|\/vedic-astrology\/|aspects\/lunar|parallels\/monthly/i;
// Sağlayıcının yerelleştirilmiş adları ("Kuzey Düğümü" / "Güney Düğümü") bu teknikte gösterilmez (Yaşam sözlüğü: Rahu / Ketu). Başka
// tekniklerin kendi etiketlerinde "Düğümü" geçebildiği için denetim yalnız bu tekniğin paneli + Word metni üzerinde yapılır.
const LOCALIZED_LEAK = /Düğümü|Localized/;

async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return { ctx, page: await ctx.newPage() };
}
async function runSel(pid, sel) {
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [sel], confirmNewRequests: plan.j?.plan?.newRequestCount ?? 0 });
  return { plan, run, it: run.j?.results?.[0] };
}
async function docxText(buf) {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml").async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  // ── 1) API
  const SECS = ["ingress", "aspects", "lunar", "parallels", "natal_parallels"];
  const sel = { technique: "vedic.monthly", options: { year: 2026, month: 2, sections: SECS, ayanamsa: "lahiri", displayTz: "Europe/Istanbul" } };
  const r = await runSel(pid, sel);
  ok("API plan: 5 yeni istek (4 aylık bölüm + doğum anı)", r.plan.j?.plan?.newRequestCount === 5, JSON.stringify(r.plan.j?.plan ?? r.plan.j).slice(0, 300));
  const t = r.it?.view?.technical;
  ok(
    "API (gerçek yanıt): 16 burç girişi · 58 açı · 332 Ay açısı · 27 deklinasyon · doğum anı 9 paralel; eksik bölüm yok",
    r.it?.ok === true && t?.ingress?.events?.length === 16 && t.aspects?.events?.length === 58 && t.lunar?.events?.length === 332 && t.parallels?.events?.length === 27 && t.natalParallels?.parallels?.length === 9 && t.missing?.length === 0,
    JSON.stringify(r.it ?? r.run.j).slice(0, 300),
  );
  const rk = (p) => p === "rahu" || p === "ketu";
  ok(
    "API (gerçek yanıt): Rahu/Ketu gezegen açılarında 20 + Ay açılarında 90; tüm orb 0; 12 kontraparalel; Merkür ∥ Satürn 22.02.2026 17:37 UTC",
    (t?.aspects?.events ?? []).filter((e) => rk(e.a) || rk(e.b)).length === 20 &&
      (t?.lunar?.events ?? []).filter((e) => rk(e.planet)).length === 90 &&
      [...(t?.aspects?.events ?? []), ...(t?.lunar?.events ?? [])].every((e) => e.orb === 0) &&
      (t?.parallels?.events ?? []).filter((e) => e.type === "contraparallel").length === 12 &&
      (t?.parallels?.events ?? []).some((e) => e.a === "mercury" && e.b === "saturn" && e.type === "parallel" && e.atUtc === "2026-02-22T17:37"),
  );
  ok("API (gerçek yanıt): doğum anı YEREL 1990-07-15T14:30:00; yerelleştirilmiş ad teknik veride yok", t?.natalParallels?.atLocal === "1990-07-15T14:30:00" && !/Localized|Düğümü/.test(JSON.stringify(t ?? {})));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel, { ...sel, options: { ...sel.options, displayTz: "Europe/Berlin" } }] });
  ok("aynı seçim + başka gösterim saat dilimi: 0 yeni istek", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: "vedic.monthly", options: r.it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(sv.j).slice(0, 200));
  const an = await api(`/analyses/${id}`);
  ok("kayıtlı analiz: teknik + seçenekler (bölümler, saat dilimi)", an.j?.analysis?.technical?.schema === "astro.vedic.monthly.v1" && an.j.analysis.params?.displayTz === "Europe/Istanbul");
  const want = ["Vedik aylık zamanlama", "Şubat 2026", "Pencere UTC takvim ayıdır", "ASTRONOMİK açılardır", "graha drishti", "Aylık özet", "Gezegen burç girişleri", "Ay açıları", "Doğum anı deklinasyonları", "27 (paralel 15 · kontraparalel 12)", "dakika hassasiyetindeki"];
  for (const fmt of ["docx", "pdf"]) {
    const rr = await api(`/analyses/${id}/report?format=${fmt}`, null, true);
    const buf = Buffer.from(await rr.arrayBuffer());
    ok(`rapor ${fmt}: 200`, rr.status === 200 && buf.length > 5000, `${rr.status} ${buf.length}`);
    if (OUT) fs.writeFileSync(path.join(OUT, `vedik-aylik.${fmt}`), buf);
    if (fmt === "docx" && rr.status === 200) {
      const text = await docxText(buf);
      ok(`Word: ${want.join(" · ")}`, want.every((x) => text.includes(x)) && !JARGON.test(text) && !LOCALIZED_LEAK.test(text) && !text.includes("undefined"), want.filter((x) => !text.includes(x)).join(", "));
    }
  }

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  // ── 2) Seçici (1366×768)
  {
    const { ctx, page } = await newPage(browser, 1366, 768);
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.locator("[data-testid=atlas-client-trigger]").first().click();
    await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
    await page.waitForTimeout(900);
    await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
    await page.waitForTimeout(1200);
    await page.locator("[role=tablist] button[data-system=vedic]").first().click();
    await page.waitForTimeout(500);
    ok("seçici: vedic.monthly Vedik sekmesinde", await page.locator("button[data-technique='vedic.monthly']").first().isVisible().catch(() => false));
    await page.locator("button[data-technique='vedic.monthly']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='vedic.monthly']").first().click();
    await page.waitForTimeout(800);
    const f = page.locator("[data-testid=astro-vm-params]").first();
    ok("seçici: parametre alanı görünür", await f.isVisible().catch(() => false));
    ok("seçici: ay alanı + 5 bölüm + saat dilimi", (await page.locator("[data-vm=month]").count()) === 1 && (await page.locator("[data-vm-section]").count()) === 5 && (await page.locator("[data-vm=tz]").count()) === 1);
    const ft = await f.innerText().catch(() => "");
    ok("seçici: Lahiri sabit + graha drishti ayrımı notu", ft.includes("Lahiri (sabit)") && ft.includes("graha drishti"), ft.slice(0, 200));
    await page.locator("[data-vm=prev]").first().click();
    await page.waitForTimeout(300);
    ok("seçici: önceki ay düğmesi ayı değiştirir", (await page.locator("[data-vm=month]").first().inputValue().catch(() => "")) !== "", "");
    const body = await page.locator("body").innerText();
    ok("seçici: sağlayıcı adı / iç jargon yok", !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, "secici-1366.png"), fullPage: true });
    await ctx.close();
  }

  // ── 3) Kayıtlı analiz — 1366×768, 768×1024, 390×844
  for (const [w, h] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${id}"]`);
    await item.waitFor({ timeout: 120000 }).catch(() => {});
    ok(`${tag}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
    await item.click().catch(() => {});
    const sec = page.locator("[data-testid=astro-vm-panel]").first();
    await sec.waitFor({ timeout: 60000 }).catch(() => {});
    ok(`${tag}: panel görünür`, await sec.isVisible().catch(() => false));
    const summary = await page.locator("[data-testid=astro-vm-summary]").first().innerText().catch(() => "");
    ok(`${tag}: aylık özet (majör 9 · minör 49)`, summary.includes("majör 9") && summary.includes("minör 49"), summary.slice(0, 200));
    ok(`${tag}: yöntem + drishti ayrımı uyarısı`, (await page.locator("[data-testid=astro-vm-method]").count()) === 1 && (await page.locator("[data-testid=astro-vm-drishti-note]").count()) === 1);
    const head = async () => (await page.locator("[data-testid=astro-vm-timeline] h4").first().innerText().catch(() => "")).trim();
    ok(`${tag}: zaman çizelgesi 433 olay (ilk parça gösterilir)`, (await head()).includes("433"), await head());
    await page.locator("[data-testid=astro-vm-planet-moon]").first().click();
    await page.waitForTimeout(300);
    const afterMoon = await head();
    ok(`${tag}: gezegen filtresi (Ay kapalı) olay sayısını düşürür`, /\(\d+ \/ 433\)/.test(afterMoon) && !afterMoon.startsWith("Zaman çizelgesi (433"), afterMoon);
    await page.locator("[data-testid=astro-vm-planet-moon]").first().click();
    await page.locator("[data-testid=astro-vm-major]").first().check();
    await page.waitForTimeout(300);
    const kinds = await page.locator("[data-testid=astro-vm-timeline] li[data-vm-kind=aspect]").count();
    ok(`${tag}: yalnız majör filtresi`, kinds <= 9, String(kinds));
    await page.locator("[data-testid=astro-vm-major]").first().uncheck();
    const first = await page.locator("[data-testid=astro-vm-timeline] li").first().innerText().catch(() => "");
    await page.locator("[data-testid=astro-vm-tz]").first().selectOption("UTC");
    await page.waitForTimeout(300);
    const firstUtc = await page.locator("[data-testid=astro-vm-timeline] li").first().innerText().catch(() => "");
    ok(`${tag}: saat dilimi değişimi gösterimi değiştirir (istek yok)`, first !== firstUtc && firstUtc.includes("UTC"), `${first.slice(0, 60)} | ${firstUtc.slice(0, 60)}`);
    ok(`${tag}: doğum anı deklinasyonları bölümü`, await page.locator("[data-testid=astro-vm-natal]").first().isVisible().catch(() => false));
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
    const body = await page.locator("body").innerText();
    ok(`${tag}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
    const panelText = await sec.innerText().catch(() => "");
    ok(`${tag}: panelde yerelleştirilmiş sağlayıcı adı ("… Düğümü") yok`, panelText.length > 0 && !LOCALIZED_LEAK.test(panelText));
    if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${tag}.png`), fullPage: true });
    for (const [tid, ext, magic] of [["astro-report-docx", "docx", "PK"], ["astro-report-pdf", "pdf", "%PDF-"]]) {
      const b = page.locator(`[data-testid=${tid}]`).first();
      if (!(await b.isVisible().catch(() => false))) {
        ok(`${tag}: ${ext} düğmesi görünür`, false);
        continue;
      }
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), b.click()]);
      const buf = fs.readFileSync(await dl.path());
      ok(`${tag}: ${ext} iner ve geçerli`, buf.subarray(0, magic.length).toString() === magic && buf.length > 5000, `${buf.length}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nvedik-aylik-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
