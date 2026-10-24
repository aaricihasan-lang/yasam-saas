// 2026-10-24 — Dashakoot Rasi TUTARLILIK UYARISI: ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte
// sağlayıcı (KATI mod: yalnız BİREBİR golden gövdeye GERÇEK yanıt). GERÇEK sağlayıcı YOK. İki GERÇEK yanıt (sentetik kişiler,
// Londra; fixtures/golden/vedic-dashakoot-rasi-tutarsiz*.json): (S) Terazi→Balık sayım 6, toplam 5, kısıt yok → satır + toplam +
// karar duyarlılığı metni; (N) İkizler→Akrep sayım 6, toplam 4 → satır + toplam metni, duyarlılık YOK. Mevcut golden (Ali Örnek ×
// Sentetik B, 7 / 10, Rasi sayım 12 karşılanmadı) → uyarı YOK.
// Önkoşul: yerel next sunucusu + dev-fake-backend (vedik-eslesme-2-ui ile aynı ortam).
// Çalıştırma: node scripts/astrology/dashakoot-rasi-uyari-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: profiller (Londra), Dashakoot 1 istek; teknik veri DEĞİŞMEZ (S 5 / 10, N 4 / 10, Rasi karşılandı · 1, sayım 6);
//      kaydet → aç (0 istek) → teknik veri aynı → Word / PDF 200; Word metninde uyarı başlığı + satır + toplam (+ S'de duyarlılık);
//      Word'de "5 / 10" / "4 / 10" aynen; varsayılan golden kaydının Word'ünde uyarı yok
//   2) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: uyarı kutusu + Rasi rozeti görünür; S'de duyarlılık satırı, N'de yok;
//      golden kaydında kutu / rozet yok; yatay taşma yok; kutu görünüm alanından taşmaz; Word / PDF iner; sağlayıcı adı yok.
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
const JARGON = /\broxy\b|golden|fixture|\/vedic-astrology\//i;
const TITLE = "Rasi kriteri — tutarlılık uyarısı";
const ROW = "Ay burcuna sayım 6 çıkıyor";
const UNCHANGED = "Gösterilen puan ve toplam değiştirilmemiştir.";
const DECISION = "bu satıra duyarlıdır";

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
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}
const mkProfile = async (label, birthDate, birthTime) => (await api("/profiles", { label, birthDate, birthTime, timeKnown: true, timeAccuracy: "exact_record", locationId: "gb-london" })).j?.profile?.id;

(async () => {
  const tag = randomUUID().slice(0, 6);
  // GERÇEK yanıtların gövdeleriyle BİREBİR aynı doğum girdileri (Londra; 2001-03-25 08:00 yaz saati +1).
  const S1 = await mkProfile(`Rasi S1 ${tag}`, "2001-03-25", "08:00");
  const S2 = await mkProfile(`Rasi S2 ${tag}`, "2001-03-13", "03:00");
  const N1 = await mkProfile(`Rasi N1 ${tag}`, "2001-03-15", "10:00");
  const N2 = await mkProfile(`Rasi N2 ${tag}`, "2001-03-04", "22:00");
  ok("hazırlık: 4 sentetik profil (Londra)", [S1, S2, N1, N2].every((x) => typeof x === "string"), JSON.stringify([S1, S2, N1, N2]));
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const pb = (await api(`/profiles?q=${encodeURIComponent("Sentetik B")}`)).j.profiles[0].id;
  const cases = [
    { key: "S", p: S1, partner: S2, total: 5, sensitive: true },
    { key: "N", p: N1, partner: N2, total: 4, sensitive: false },
    { key: "G", p: pid, partner: pb, total: 7, sensitive: null },
  ];
  // ── 1) API
  for (const c of cases) {
    const sel = { technique: "vedic.dashakoot", options: { partnerProfileId: c.partner, ayanamsa: "lahiri" } };
    const r = await runSel(c.p, sel);
    const tech = r.it?.view?.technical;
    const rasi = (tech?.rows ?? []).find((x) => x.id === "rasi");
    ok(`API ${c.key}: 1 istek, ${c.total} / 10`, r.plan.j?.plan?.newRequestCount === 1 && r.it?.ok === true && tech?.total === c.total, JSON.stringify(r.it ?? r.run.j).slice(0, 300));
    if (c.sensitive !== null) ok(`API ${c.key}: teknik veri DEĞİŞMEDİ — Rasi karşılandı · 1, sayım 6 (sağlayıcının bildirdiği gibi)`, rasi?.matched === true && rasi?.points === 1 && rasi?.count === 6, JSON.stringify(rasi));
    const sv = await api("/analyses", { profileId: c.p, revision: 1, technique: sel.technique, options: r.it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
    c.id = sv.j?.analysisId;
    ok(`kayıt ${c.key}`, typeof c.id === "string", JSON.stringify(sv.j).slice(0, 200));
    const again = await api("/engine/plan", { profileId: c.p, revision: 1, selections: [sel] });
    ok(`${c.key}: aynı seçim 0 yeni istek`, again.j?.plan?.newRequestCount === 0);
    const an = await api(`/analyses/${c.id}`);
    const at = an.j?.analysis?.technical;
    ok(`kayıtlı ${c.key}: teknik veri canlı sonuçla aynı (sessiz düzeltme yok)`, JSON.stringify(at?.rows) === JSON.stringify(tech?.rows) && at?.total === c.total);
    for (const fmt of ["docx", "pdf"]) {
      const rr = await api(`/analyses/${c.id}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await rr.arrayBuffer());
      ok(`rapor ${c.key} ${fmt}: 200`, rr.status === 200 && buf.length > 5000, `${rr.status} ${buf.length}`);
      if (OUT) fs.writeFileSync(path.join(OUT, `${c.key}.${fmt}`), buf);
      if (fmt === "docx" && rr.status === 200) {
        const text = await docxText(buf);
        if (c.sensitive === null) ok(`Word ${c.key}: uyarı YOK (tutarlı satır)`, !text.includes(TITLE) && !text.includes("tutarlılık uyarısı") && text.includes("7 / 10"));
        else {
          const want = [TITLE, ROW, UNCHANGED, `karşılanan kriter sayısı ${c.total - 1} / 10 olur`, `${c.total} / 10`];
          ok(`Word ${c.key}: başlık + satır + toplam metni; toplam ${c.total} / 10 aynen`, want.every((x) => text.includes(x)) && !JARGON.test(text), want.filter((x) => !text.includes(x)).join(", "));
          ok(`Word ${c.key}: duyarlılık metni ${c.sensitive ? "VAR" : "YOK"}`, text.includes(DECISION) === c.sensitive);
          const iTech = text.indexOf("Teknik hesaplama sonuçları"), iWarn = text.indexOf(TITLE), iInterp = text.indexOf("Otomatik Yorum");
          ok(`Word ${c.key}: uyarı teknik bölümde (yorum bölümünden önce)`, iTech >= 0 && iWarn > iTech && (iInterp === -1 || iWarn < iInterp), `${iTech} ${iWarn} ${iInterp}`);
        }
      }
    }
  }

  // ── 2) Kayıtlı analizler — 1366×768, 768×1024, 390×844
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const [w, h] of [
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    const vt = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    for (const c of cases) {
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${c.p}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${c.id}"]`);
      await item.waitFor({ timeout: 120000 }).catch(() => {});
      ok(`${vt} ${c.key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
      await item.click().catch(() => {});
      const sec = page.locator("[data-testid=astro-dashakoot-panel]").first();
      await sec.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`${vt} ${c.key}: panel görünür`, await sec.isVisible().catch(() => false));
      const total = await page.locator("[data-testid=astro-dashakoot-total]").first().innerText().catch(() => "");
      ok(`${vt} ${c.key}: toplam ${c.total} / 10 aynen gösterilir`, total.includes(String(c.total)) && total.includes("10"), total);
      const box = page.locator("[data-testid=astro-dashakoot-rasi-notice]");
      const badge = page.locator("[data-testid=astro-dashakoot-rasi-badge]");
      if (c.sensitive === null) {
        ok(`${vt} ${c.key}: uyarı kutusu ve rozet YOK`, (await box.count()) === 0 && (await badge.count()) === 0);
      } else {
        ok(`${vt} ${c.key}: uyarı kutusu + Rasi satırında rozet görünür`, (await box.first().isVisible().catch(() => false)) && (await page.locator("[data-testid=astro-porutham-rasi] [data-testid=astro-dashakoot-rasi-badge]").first().isVisible().catch(() => false)));
        const bt = await box.first().innerText().catch(() => "");
        ok(`${vt} ${c.key}: kutu metni (başlık, sayım 6, puan değiştirilmedi, toplam ${c.total - 1} / 10)`, bt.includes(TITLE) && bt.includes(ROW) && bt.includes(UNCHANGED) && bt.includes(`${c.total - 1} / 10`), bt.slice(0, 200));
        ok(`${vt} ${c.key}: duyarlılık satırı ${c.sensitive ? "VAR" : "YOK"}`, ((await page.locator("[data-testid=astro-dashakoot-rasi-decision]").count()) === 1) === c.sensitive && (await box.first().getAttribute("data-sensitive")) === String(c.sensitive));
        const bb = await box.first().boundingBox();
        ok(`${vt} ${c.key}: kutu görünüm genişliğinde (taşma yok)`, !!bb && bb.x >= -1 && bb.x + bb.width <= w + 1, JSON.stringify(bb));
        await box.first().scrollIntoViewIfNeeded().catch(() => {});
        if (OUT) await box.first().screenshot({ path: path.join(OUT, `kutu-${c.key}-${vt}.png`) }).catch(() => {});
      }
      const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
      ok(`${vt} ${c.key}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
      const body = await page.locator("body").innerText();
      ok(`${vt} ${c.key}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
      if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${c.key}-${vt}.png`), fullPage: true });
      for (const [tid, ext, magic] of [
        ["astro-report-docx", "docx", "PK"],
        ["astro-report-pdf", "pdf", "%PDF-"],
      ]) {
        const b = page.locator(`[data-testid=${tid}]`).first();
        if (!(await b.isVisible().catch(() => false))) {
          ok(`${vt} ${c.key}: ${ext} düğmesi görünür`, false);
          continue;
        }
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), b.click()]);
        const buf = fs.readFileSync(await dl.path());
        ok(`${vt} ${c.key}: ${ext} iner ve geçerli`, buf.subarray(0, magic.length).toString() === magic && buf.length > 5000, `${buf.length}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\ndashakoot-rasi-uyari-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
