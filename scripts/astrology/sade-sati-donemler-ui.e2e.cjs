// SADE SATI DÖNEM TARİHLERİ (Draft) — tarayıcı regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod).
// Önkoşul: next sunucusu ASTROLOGY_SADE_SATI_PERIODS=true ile (bayrak açık) + dev-fake-backend. Gerçek sağlayıcı YOK.
// Çalıştırma: node scripts/astrology/sade-sati-donemler-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: Vedik D1 + Sade Sati → dönemler (K1, damga, etkin dönem 2022–2030), kaydet → aç 0 yeni istek, Word metni
//   2) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: dönem bölümü, 3+ dönem, bölüm satırları, kesinti, K2 karşılaştırma,
//      Ay sınırı uyarısı; yatay taşma yok; sağlayıcı adı yok.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const d1 = await runSel(pid, { technique: "vedic.d1", options: { ayanamsa: "lahiri" } });
  ok("API Vedik D1 (Janma Rashi kaynağı)", d1.it?.ok === true, JSON.stringify(d1.it ?? d1.run.j).slice(0, 200));
  const sSel = { technique: "vedic.sade_sati", options: { ayanamsa: "lahiri" } };
  const s = await runSel(pid, sSel);
  const t = s.it?.view?.technical;
  ok("API Sade Sati: periodsStatus ok + K1 damgası", t?.periodsStatus?.state === "ok" && /^sade-sati-periods\.k1\.v1\+/.test(t?.periods?.method ?? ""), JSON.stringify(t?.periodsStatus));
  const act = t?.periods?.cycles?.find((c) => c.relation === "active");
  ok("API: etkin dönem 2022-04-29 → 2030-04-17, iki kesinti", !!act && act.start.startsWith("2022-04-29") && act.end.startsWith("2030-04-17") && act.interruptions.length === 2, JSON.stringify(act && { s: act.start, e: act.end }));
  ok("API: dönem hesabı yeni ücretli istek yapmadı (yalnız Sade Sati birimi)", (s.plan.j?.plan?.newRequestCount ?? 9) <= 1);
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sSel.technique, options: s.it?.view?.options ?? sSel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(sv.j).slice(0, 200));
  const an = await api(`/analyses/${id}`);
  ok("arşivden aç: dönemler + damga snapshot'ta", an.j?.analysis?.technical?.periods?.method === t?.periods?.method);
  const r = await api(`/analyses/${id}/report?format=docx`, null, true);
  const buf = Buffer.from(await r.arrayBuffer());
  const text = r.status === 200 ? (await (await JSZip.loadAsync(buf)).file("word/document.xml").async("string")).replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'") : "";
  ok("Word: dönem bölümü + kesinti + K2 + damga; sağlayıcı adı yok", ["Sade Sati dönem tarihleri", "Etkin dönem", "Kesinti", "K2b", "Metodoloji damgası"].every((x) => text.includes(x)) && !JARGON.test(text), `${r.status}`);
  const pdf = await api(`/analyses/${id}/report?format=pdf`, null, true);
  ok("PDF: 200", pdf.status === 200);

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
