// SADE SATI DÖNEM TARİHLERİ (Draft) — tarayıcı regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod).
// Önkoşul: next sunucusu ASTROLOGY_SADE_SATI_PERIODS=true ile (bayrak açık) + dev-fake-backend. Gerçek sağlayıcı YOK.
// Çalıştırma: node scripts/astrology/sade-sati-donemler-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü] [mod] [kimlik-dosyası]
//   mod: on (varsayılan; sunucu bayrağı AÇIK) · off (sunucu bayrağı KAPALI: dönem alanı/bölümü YOK) ·
//        archive (sunucu bayrağı KAPALI; `on` koşusunun kimlik dosyasındaki kayıt aynen açılır, 0 istek)
//   1) API: Vedik D1 + Sade Sati → dönemler (K1, damga, etkin dönem 2022–2030), kaydet → aç 0 yeni istek, Word metni
//   2) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: dönem bölümü, 3+ dönem, bölüm satırları, kesinti, K2 karşılaştırma,
//      Ay sınırı uyarısı; yatay taşma yok; sağlayıcı adı yok.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const JSZip = require("jszip");
const [ORIGIN = "http://localhost:3961", OUT = "", MODE = "on", IDFILE = ""] = process.argv.slice(2);
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
const api = async (p, b, raw = false) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
  if (raw) return r;
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const JARGON = /\broxy\b|golden|fixture|\/vedic-astrology\//i;
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

async function offMode(pid) {
  const d1 = await runSel(pid, { technique: "vedic.d1", options: { ayanamsa: "lahiri" } });
  ok("OFF: Vedik D1", d1.it?.ok === true);
  const sSel = { technique: "vedic.sade_sati", options: { ayanamsa: "lahiri" } };
  const s = await runSel(pid, sSel);
  const t = s.it?.view?.technical ?? {};
  ok("OFF: Sade Sati günlük sonucu var, dönem alanı YOK", s.it?.ok === true && !("periods" in t) && !("periodsStatus" in t), Object.keys(t).join(","));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sSel.technique, options: s.it?.view?.options ?? sSel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const id = sv.j?.analysisId;
  const r = await api(`/analyses/${id}/report?format=docx`, null, true);
  const text = r.status === 200 ? (await (await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()))).file("word/document.xml").async("string")).replace(/<[^>]+>/g, " ") : "";
  ok("OFF: Word 200, Sade Sati bölümü var, dönem bölümü YOK", r.status === 200 && text.includes("Sade Sati") && !text.includes("Sade Sati dönem tarihleri"), String(r.status));
  const browser = await chromium.launch();
  for (const [w, h] of [[1366, 768], [390, 844]]) {
    const { ctx, page } = await newPage(browser, w, h);
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${id}"]`);
    await item.waitFor({ timeout: 120000 }).catch(() => {});
    await item.click().catch(() => {});
    await page.locator("[data-testid=astro-sade-sati-panel]").first().waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    ok(`OFF ${w}: dönem bölümü çizilmez`, (await page.locator("[data-testid=astro-sade-sati-periods]").count()) === 0);
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(`OFF ${w}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
    if (OUT) await page.screenshot({ path: path.join(OUT, `sade-sati-off-${w}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
}

async function archiveMode(pid) {
  const saved = JSON.parse(fs.readFileSync(IDFILE, "utf8"));
  const before = fs.existsSync(process.env.FAKELOG ?? "") ? (fs.readFileSync(process.env.FAKELOG, "utf8").match(/^fake roxy #/gm) ?? []).length : null;
  const an = await api(`/analyses/${saved.id}`);
  const t = an.j?.analysis?.technical;
  ok("ARŞİV (bayrak kapalı): kayıt açılır, dönemler + damga aynen", an.s === 200 && t?.periods?.method === saved.method && t?.periods?.catalog?.sha256 === saved.sha, JSON.stringify({ s: an.s, m: t?.periods?.method }));
  ok("ARŞİV: nextTransition + etkin dönem aynen", JSON.stringify(t?.periods?.nextTransition) === saved.next && t?.periods?.cycles?.length === saved.cycles);
  const r = await api(`/analyses/${saved.id}/report?format=docx`, null, true);
  const text = r.status === 200 ? (await (await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()))).file("word/document.xml").async("string")).replace(/<[^>]+>/g, " ") : "";
  ok("ARŞİV: Word dönem bölümü (bayrak kapalıyken de)", text.includes("Sade Sati dönem tarihleri") && text.includes("Bir sonraki geçiş"));
  const browser = await chromium.launch();
  const { ctx, page } = await newPage(browser, 1366, 768);
  await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
  const item = page.locator(`[data-saved-item="${saved.id}"]`);
  await item.waitFor({ timeout: 120000 }).catch(() => {});
  await item.click().catch(() => {});
  const sec = page.locator("[data-testid=astro-sade-sati-periods]").first();
  await sec.waitFor({ timeout: 60000 }).catch(() => {});
  ok("ARŞİV 1366: dönem bölümü görünür (kayıttan)", (await sec.getAttribute("data-periods-state").catch(() => null)) === "ok");
  if (OUT) await page.screenshot({ path: path.join(OUT, `sade-sati-arsiv-bayrak-kapali-1366.png`), fullPage: true });
  await ctx.close();
  await browser.close();
  const after = fs.existsSync(process.env.FAKELOG ?? "") ? (fs.readFileSync(process.env.FAKELOG, "utf8").match(/^fake roxy #/gm) ?? []).length : null;
  ok("ARŞİV: sağlayıcıya yeni istek yok (sahte sağlayıcı günlüğü)", before === after, `${before} → ${after}`);
}

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  if (MODE === "off" || MODE === "archive") {
    await (MODE === "off" ? offMode(pid) : archiveMode(pid));
    console.log(`\nsade-sati-donemler-ui e2e [${MODE}]: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  }
  const d1 = await runSel(pid, { technique: "vedic.d1", options: { ayanamsa: "lahiri" } });
  ok("API Vedik D1 (Janma Rashi kaynağı)", d1.it?.ok === true, JSON.stringify(d1.it ?? d1.run.j).slice(0, 200));
  const sSel = { technique: "vedic.sade_sati", options: { ayanamsa: "lahiri" } };
  const s = await runSel(pid, sSel);
  const t = s.it?.view?.technical;
  ok("API Sade Sati: periodsStatus ok + K1 damgası", t?.periodsStatus?.state === "ok" && /^sade-sati-periods\.k1\.v1\+/.test(t?.periods?.method ?? ""), JSON.stringify(t?.periodsStatus));
  const act = t?.periods?.cycles?.find((c) => c.relation === "active");
  ok("API: etkin dönem 2022-04-29 → 2030-04-17, iki kesinti", !!act && act.start.startsWith("2022-04-29") && act.end.startsWith("2030-04-17") && act.interruptions.length === 2, JSON.stringify(act && { s: act.start, e: act.end }));
  ok("API: dönem hesabı yeni ücretli istek yapmadı (yalnız Sade Sati birimi)", (s.plan.j?.plan?.newRequestCount ?? 9) <= 1);
  ok("API: katalog v2 (NAIF) + sonraki geçiş", t?.periods?.catalog?.version === "2" && /saturn-sidereal-lahiri\.v2$/.test(t?.periods?.method ?? "") && t?.periods?.nextTransition && t.periods.nextTransition.beyondCoverage === false, JSON.stringify(t?.periods?.nextTransition));
  const ex = await fetch(`${API}/analyses`, { headers: { ...H, "x-admin-id": "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e", "x-session-token": "local-expert-token-eeeeeeeeeee", cookie: "yasam_admin_session=local-expert-token-eeeeeeeeeee" } });
  ok("YETKİ: astroloji izni olmayan uzman (başka tenant) API'ye erişemez", ex.status === 401 || ex.status === 403 || ex.status === 404, String(ex.status));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sSel.technique, options: s.it?.view?.options ?? sSel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(sv.j).slice(0, 200));
  const an = await api(`/analyses/${id}`);
  ok("arşivden aç: dönemler + damga snapshot'ta", an.j?.analysis?.technical?.periods?.method === t?.periods?.method);
  if (IDFILE) fs.writeFileSync(IDFILE, JSON.stringify({ id, method: t?.periods?.method, sha: t?.periods?.catalog?.sha256, next: JSON.stringify(t?.periods?.nextTransition), cycles: t?.periods?.cycles?.length }));
  const r = await api(`/analyses/${id}/report?format=docx`, null, true);
  const buf = Buffer.from(await r.arrayBuffer());
  const text = r.status === 200 ? (await (await JSZip.loadAsync(buf)).file("word/document.xml").async("string")).replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'") : "";
  ok("Word: dönem bölümü + kesinti + K2 + damga + özet + sonraki geçiş + NAIF kaynağı; sağlayıcı adı yok", ["Sade Sati dönem tarihleri", "Etkin dönem", "Kesinti", "K2b", "Metodoloji damgası", "Janma Rashi (doğum Ay burcu)", "Bir sonraki geçiş", "NAIF DE440", "kader öngörüsü değildir"].every((x) => text.includes(x)) && !JARGON.test(text), `${r.status}`);
  const pdf = await api(`/analyses/${id}/report?format=pdf`, null, true);
  const pbuf = Buffer.from(await pdf.arrayBuffer());
  ok("PDF: 200 + %PDF imzası + boyut", pdf.status === 200 && pbuf.subarray(0, 5).toString() === "%PDF-" && pbuf.length > 20_000, `${pdf.status} ${pbuf.length}`);
  if (OUT) fs.writeFileSync(path.join(OUT, "sade-sati-rapor.pdf"), pbuf);
  if (OUT) fs.writeFileSync(path.join(OUT, "sade-sati-rapor.docx"), buf);

  const browser = await chromium.launch();
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
    await item.click().catch(() => {});
    const sec = page.locator("[data-testid=astro-sade-sati-periods]").first();
    await sec.waitFor({ timeout: 60000 }).catch(() => {});
    ok(`${tag}: dönem bölümü görünür (state=ok)`, (await sec.isVisible().catch(() => false)) && (await sec.getAttribute("data-periods-state")) === "ok");
    const cyc = await page.locator("[data-testid=astro-sade-sati-cycle]").count();
    ok(`${tag}: en az 3 dönem (geçmiş / etkin / gelecek)`, cyc >= 3, String(cyc));
    ok(`${tag}: etkin dönem vurgulu`, (await page.locator("[data-testid=astro-sade-sati-cycle][data-relation=active]").count()) === 1);
    ok(`${tag}: bölüm satırları + kesinti listesi`, (await page.locator("[data-testid=astro-sade-sati-segment]").count()) >= 10 && (await page.locator("[data-testid=astro-sade-sati-interruptions]").count()) >= 1);
    ok(`${tag}: Ay sınırı uyarısı`, await page.locator("[data-testid=astro-sade-sati-moon-boundary]").first().isVisible().catch(() => false));
    const sum = await page.locator("[data-testid=astro-sade-sati-summary]").first().innerText().catch(() => "");
    ok(`${tag}: özet — Janma Rashi, ayanamsa, durum, sonraki geçiş, katalog v2`, ["Janma Rashi (doğum Ay burcu): Balık", "Lahiri", "Durum:", "Bir sonraki geçiş:", "Katalog: v2"].every((x) => sum.includes(x)), sum.slice(0, 160));
    const sb = await page.locator("[data-testid=astro-sade-sati-summary]").first().boundingBox().catch(() => null);
    ok(`${tag}: özet kutusu görünüm alanına sığar`, !!sb && sb.x >= 0 && sb.x + sb.width <= w + 1, JSON.stringify(sb));
    await page.locator("[data-testid=astro-sade-sati-cycle][data-relation=active] summary").first().click().catch(() => {});
    ok(`${tag}: K2a/K2b karşılaştırma açılır`, await page.locator("[data-testid=astro-sade-sati-cycle][data-relation=active] [data-testid=astro-sade-sati-k2]").first().isVisible().catch(() => false));
    const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
    const body = await sec.innerText().catch(() => "");
    ok(`${tag}: UTC + Türkiye saati sütunları; sağlayıcı adı yok`, body.includes("UTC") && /GMT\+[23]/.test(body) && !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, `sade-sati-donem-${tag}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log(`\nsade-sati-donemler-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("HATA", e);
  process.exit(1);
});
