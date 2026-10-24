// VEDİK HARİTA (2026-10-22) — Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala: ekran + akış regresyonu (Playwright Chromium).
// YEREL; sahte DB + sahte sağlayıcı (KATI mod: birebir golden gövdeye GERÇEK yanıt — dev-fake-backend strictMatch). GERÇEK sağlayıcı YOK.
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend.
// Çalıştırma: node scripts/astrology/vedik-harita-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: 4 teknik + 7'li Chara şeması (Ali Örnek, Lahiri) → plan/çalıştır → kaydet → aç (0 istek) → Word/PDF 200 + içerik; saat yok yok
//   2) Çalışma alanı (1366×768): Vedik sekmesi → Bhav Chalit seç → çalıştır → kundli merkez "Bhav Chalit", karşılaştırma tablosu;
//      Chara Karaka seçicide şema alanı
//   3) Kayıtlı analizler 1366×768 + 768×1024 + 390×844: her teknik paneli görünür; yatay taşma yok; sağlayıcı adı yok; Word/PDF iner.
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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
const SELS = {
  chalit: { technique: "vedic.bhav_chalit", options: { ayanamsa: "lahiri" } },
  k8: { technique: "vedic.chara_karaka", options: { ayanamsa: "lahiri", scheme: "eight" } },
  k7: { technique: "vedic.chara_karaka", options: { ayanamsa: "lahiri", scheme: "seven" } },
  arudha: { technique: "vedic.arudha", options: { ayanamsa: "lahiri" } },
  bala: { technique: "vedic.bhava_bala", options: { ayanamsa: "lahiri" } },
};
const PANEL = { chalit: "astro-vedic-bhav-chalit-panel", k8: "astro-vedic-chara-karaka-panel", k7: "astro-vedic-chara-karaka-panel", arudha: "astro-vedic-arudha-panel", bala: "astro-vedic-bhava-bala-panel" };
const WORD = {
  chalit: ["Bhav Chalit", "Bhava sınırları", "Rashi evi (D1, bütün-burç)", "Chalit bhavası"],
  k8: ["Chara Karakalar", "Atmakaraka", "Pitrikaraka", "8 karaka (Rahu dahil"],
  k7: ["Chara Karakalar", "7 karaka (Rahu hariç"],
  arudha: ["Arudha Lagna (AL)", "Upapada (UL / A12)", "İstisna", "lord kendi burcunda olsa bile"],
  bala: ["Bhava Bala", "Bhavadhipati", "Shadbala ise GEZEGENİN"],
};

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
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}
const noOverflow = (page) => page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const ids = {};
  // ── 1) API
  for (const [key, sel] of Object.entries(SELS)) {
    const { plan, it } = await runSel(pid, sel);
    ok(`API ${key}: plan 0/1 yeni istek, sonuç ok`, (plan.j?.plan?.newRequestCount ?? -1) <= 1 && it?.ok === true, JSON.stringify(it ?? plan.j).slice(0, 240));
    const tech = it?.view?.technical;
    if (key === "chalit") ok("API chalit: Ay rashi evi 6 → chalit 7 (tek değişen)", tech?.movedCount === 1 && tech?.grahas?.find((g) => g.id === "moon")?.bhava === 7);
    if (key === "k8") ok("API karaka 8'li: AK Ay, DK Venüs, Rahu = Pitrikaraka", tech?.atmakaraka === "moon" && tech?.darakaraka === "venus" && tech?.karakas?.find((k) => k.graha === "rahu")?.id === "pitrikaraka");
    if (key === "k7") ok("API karaka 7'li: 7 karaka, Rahu yok", tech?.karakas?.length === 7 && !tech.karakas.some((k) => k.graha === "rahu"));
    if (key === "arudha") ok("API arudha: AL Kova, UL Boğa, istisna A3/A6/A7", tech?.arudhaLagna === "aquarius" && tech?.upapada === "taurus" && tech?.padas?.filter((p) => p.exceptionApplied).map((p) => p.id).join() === "a3,a6,a7");
    if (key === "bala") ok("API Bhava Bala: 1. sıra 11. ev, 12 bhava", tech?.bhavas?.length === 12 && tech.bhavas.find((b) => b.rank === 1)?.house === 11);
    const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
    ids[key] = sv.j?.analysisId;
    ok(`kayıt ${key}`, typeof ids[key] === "string", JSON.stringify(sv.j).slice(0, 200));
  }
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: Object.values(SELS) });
  ok("aynı 5 seçim: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  for (const [key, want] of Object.entries(WORD)) {
    const an = await api(`/analyses/${ids[key]}`);
    ok(`arşivden aç ${key}: teknik veri var`, an.s === 200 && an.j?.analysis?.technical?.schema?.startsWith("astro.vedic."));
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[key]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${key} ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
      if (OUT) fs.writeFileSync(path.join(OUT, `${key}.${fmt}`), buf);
      if (fmt === "docx" && r.status === 200) {
        const text = await docxText(buf);
        ok(`Word ${key}: ${want.join(" · ")}`, want.every((s) => text.includes(s)) && !/roxy/i.test(text) && !text.includes("undefined"), want.filter((s) => !text.includes(s)).join(", "));
      }
    }
  }

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  // ── 2) Çalışma alanı (1366×768)
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
    for (const id of ["vedic.bhav_chalit", "vedic.chara_karaka", "vedic.arudha", "vedic.bhava_bala"]) ok(`seçici: ${id} listede`, await page.locator(`button[data-technique='${id}']`).first().isVisible().catch(() => false));
    await page.locator("button[data-technique='vedic.chara_karaka']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='vedic.chara_karaka']").first().click();
    await page.waitForTimeout(600);
    ok("seçici: Chara Karaka şema alanı (8 / 7)", await page.locator("[data-chara-scheme=select]").first().isVisible().catch(() => false));
    await page.locator("button[data-technique='vedic.chara_karaka']").first().click();
    await page.locator("button[data-technique='vedic.bhav_chalit']").first().click();
    await page.waitForTimeout(300);
    await page.locator("[data-testid=astro-run]").first().click();
    const panel = page.locator("[data-testid=astro-vedic-bhav-chalit-panel]").first();
    await panel.waitFor({ timeout: 120000 }).catch(() => {});
    ok("çalışma alanı: Bhav Chalit paneli", await panel.isVisible().catch(() => false));
    await page.waitForTimeout(2500);
    const centre = await page.evaluate(() => {
      const host = document.querySelector("[data-testid=astro-chalit-kundli] roxy-vedic-kundli");
      const t = host?.shadowRoot?.querySelector("text.centre-label");
      return t ? t.textContent?.trim() : null;
    });
    ok("kundli merkez etiketi 'Bhav Chalit' (D1 Rashi değil)", centre === "Bhav Chalit", String(centre));
    const moved = await page.locator("[data-testid=astro-chalit-compare-table] tr[data-moved='1']").count();
    ok("karşılaştırma tablosu: 1 değişen graha (Ay)", moved === 1, String(moved));
    const m = await noOverflow(page);
    ok("1366 çalışma alanı yatay taşma yok", m.dw <= m.vw + 1, JSON.stringify(m));
    if (OUT) await page.screenshot({ path: path.join(OUT, "chalit-calisma-1366.png"), fullPage: true });
    await ctx.close();
  }

  // ── 3) Kayıtlı analizler — 1366×768, 768×1024, 390×844
  for (const [w, h] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    for (const key of Object.keys(SELS)) {
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${ids[key]}"]`);
      await item.waitFor({ timeout: 120000 }).catch(() => {});
      ok(`${tag} ${key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
      await item.click().catch(() => {});
      const sec = page.locator(`[data-testid=${PANEL[key]}]`).first();
      await sec.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`${tag} ${key}: panel görünür`, await sec.isVisible().catch(() => false));
      if (key === "k7") ok(`${tag} k7: tablo 7 satır`, (await page.locator("[data-testid=astro-chara-karaka-table] tbody tr").count()) === 7);
      if (key === "bala") ok(`${tag} bala: 12 çubuk + Shadbala ayrım notu`, (await page.locator("[data-bhava-bala-bar]").count()) === 12 && (await page.locator("[data-testid=astro-bhava-bala-vs-shadbala]").first().isVisible().catch(() => false)));
      const m = await noOverflow(page);
      ok(`${tag} ${key}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
      const body = await page.locator("body").innerText();
      ok(`${tag} ${key}: sağlayıcı adı / 'golden' yok`, !/\broxy\b|golden|fixture|vedic-astrology\//i.test(body));
      if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${key}-${tag}.png`), fullPage: true });
      for (const [tid, ext, magic] of [["astro-report-docx", "docx", "PK"], ["astro-report-pdf", "pdf", "%PDF-"]]) {
        const b = page.locator(`[data-testid=${tid}]`).first();
        if (!(await b.isVisible().catch(() => false))) {
          ok(`${tag} ${key}: ${ext} düğmesi görünür`, false);
          continue;
        }
        // Rapor oran sınırı (uzman başına dakikada 20) bilinçli korumadır: indirme yalnız ilk genişlikte; diğerlerinde düğme görünürlüğü.
        if (tag !== "1366x768") {
          ok(`${tag} ${key}: ${ext} düğmesi görünür`, true);
          continue;
        }
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), b.click()]);
        const buf = fs.readFileSync(await dl.path());
        ok(`${tag} ${key}: ${ext} iner ve geçerli`, buf.subarray(0, magic.length).toString() === magic && buf.length > 5000, `${buf.length}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nvedik-harita-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
