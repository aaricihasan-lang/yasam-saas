// ATLAS ROXY KALAN (2026-10-22 gece) — Vedik eşleştirme 2: Güney Hint On Porutham (vedic.dashakoot) + Papasamyam
// (vedic.papasamyam): ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod: yalnız BİREBİR
// golden gövdeye GERÇEK yanıt — dev-fake-backend strictMatch yeni golden'ları (vedic-dashakoot / vedic-papasamyam) klasördeki tüm
// golden'larla birlikte okur). GERÇEK sağlayıcı YOK. Tohum: "Ali Örnek — natal" (sentetik A, İstanbul) + "Sentetik B — Ankara".
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend.
// Çalıştırma: node scripts/astrology/vedik-eslesme-2-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   1) API: Dashakoot 1 istek → 7 / 10, Rajju / Vedha etkin değil; Papasamyam 1 istek → 3,75 / 2,75, karşılaştırma sağlanıyor;
//      aynı seçim 0 istek; rol takası (karşı taraf 1. rol; gerçek takaslı golden 23.10.2026): Dashakoot 1 yeni istek → 6 / 10
//      (Rasi sayım 2 karşılandı), Papasamyam → 2,75 / 3,75 karşılaştırma sağlanmıyor ('exceeds'); takaslı sonuç AYRI kayıt
//      (varsayılan 7 / 10 kaydı değişmez), Word'de 6 / 10; karşı taraf saatsiz → TIME_REQUIRED (0 istek);
//      kaydet → aç (0 istek) → Word / PDF 200 + içerik (sağlayıcı adı yok, teknik bölümde hüküm yok)
//   2) Seçici (1366×768): Vedik sekmesinde iki yeni teknik; rol seçimi "1. rol (geleneksel: damat) / 2. rol (geleneksel: gelin)"
//   3) Kayıtlı analiz 1366×768 + 768×1024 + 390×844: kriter tablosu 10 satır, kısıt kartları, Papasamyam iki kişi kartı; yatay
//      taşma yok; Word/PDF iner; sağlayıcı adı / iç jargon / hüküm cümlesi yok.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
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
  // XML varlıkları çözülür (ör. kesme işareti Word XML'inde &apos; olarak saklanır).
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const pb = (await api(`/profiles?q=${encodeURIComponent("Sentetik B")}`)).j.profiles[0].id;
  const ids = {};
  // Sağlayıcının hüküm / açıklama cümlelerinden parçalar (teknik katmanda / panelde bulunmamalı).
  const VERDICT_TEXT = ["tavsiye edilir", "reddedilmez", "zihinler buluşur", "uzun ömür"];
  // ── 1) API
  const dSel = { technique: "vedic.dashakoot", options: { partnerProfileId: pb, ayanamsa: "lahiri" } };
  const pSel = { technique: "vedic.papasamyam", options: { partnerProfileId: pb, ayanamsa: "lahiri" } };
  const d = await runSel(pid, dSel);
  ok("API Dashakoot plan: 1 yeni istek", d.plan.j?.plan?.newRequestCount === 1, JSON.stringify(d.plan.j?.plan ?? d.plan.j).slice(0, 300));
  const dt = d.it?.view?.technical;
  ok("API Dashakoot: 7 / 10, 10 kriter, Rajju Paada/Kati etkin değil, Vedha etkin değil", d.it?.ok === true && dt?.total === 7 && dt.rows.length === 10 && dt.rajju?.active === false && dt.rajju.person1 === "paada" && dt.vedha?.active === false, JSON.stringify(d.it ?? d.run.j).slice(0, 300));
  ok("API Dashakoot teknik katmanında hüküm / açıklama metni yok", !VERDICT_TEXT.some((x) => JSON.stringify(dt ?? {}).includes(x)));
  const p = await runSel(pid, pSel);
  const pt = p.it?.view?.technical;
  ok("API Papasamyam: 1 istek; 3,75 / 2,75; karşılaştırma 'within'", p.plan.j?.plan?.newRequestCount === 1 && p.it?.ok === true && pt?.person1?.total === 3.75 && pt.person2?.total === 2.75 && pt.comparison === "within", JSON.stringify(p.it ?? p.run.j).slice(0, 300));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [dSel, pSel] });
  ok("aynı seçimler: 0 yeni istek (önbellek)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const swap = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ ...dSel, options: { ...dSel.options, order: "partner_first" } }] });
  ok("rol takası (karşı taraf 1. rol): 1 yeni istek (ayrı hesap)", swap.j?.plan?.newRequestCount === 1, JSON.stringify(swap.j?.plan).slice(0, 200));
  // Rol takaslı GERÇEK yanıt (sahte arka uç golden'ı önce eşler): sonuç gösterilir, ayrı anahtar / ayrı kayıt.
  const dSw = { ...dSel, options: { ...dSel.options, order: "partner_first" } };
  const pSw = { ...pSel, options: { ...pSel.options, order: "partner_first" } };
  const ds = await runSel(pid, dSw);
  const dst = ds.it?.view?.technical;
  const rasiSw = (dst?.rows ?? []).find((k) => k.id === "rasi");
  ok("rol takası Dashakoot: 6 / 10, rol işareti, Rasi sayım 2 karşılandı, Rajju Kati/Paada etkin değil", ds.it?.ok === true && dst?.total === 6 && dst.order === "partner_first" && rasiSw?.points === 1 && rasiSw?.count === 2 && dst.rajju?.active === false && dst.rajju.person1 === "kati", JSON.stringify(ds.it ?? ds.run.j).slice(0, 300));
  const ps = await runSel(pid, pSw);
  const pst = ps.it?.view?.technical;
  ok("rol takası Papasamyam: 1 istek; 2,75 / 3,75; karşılaştırma 'exceeds'", ps.plan.j?.plan?.newRequestCount === 1 && ps.it?.ok === true && pst?.person1?.total === 2.75 && pst.person2?.total === 3.75 && pst.comparison === "exceeds", JSON.stringify(ps.it ?? ps.run.j).slice(0, 300));
  const againSw = await api("/engine/plan", { profileId: pid, revision: 1, selections: [dSel, pSel, dSw, pSw] });
  ok("varsayılan + takaslı seçimler birlikte: 0 yeni istek (ayrı anahtarlar önbellekte)", againSw.j?.plan?.newRequestCount === 0, JSON.stringify(againSw.j?.plan).slice(0, 200));
  const noTime = (await api(`/profiles?q=${encodeURIComponent("Saat bilinmeyen")}`)).j.profiles[0].id;
  const nt = await api("/engine/plan", {
    profileId: pid,
    revision: 1,
    selections: [
      { technique: "vedic.dashakoot", options: { partnerProfileId: noTime, ayanamsa: "lahiri" } },
      { technique: "vedic.papasamyam", options: { partnerProfileId: noTime, ayanamsa: "lahiri" } },
    ],
  });
  ok("karşı taraf saatsiz: TIME_REQUIRED ×2, 0 istek", (nt.j?.plan?.selections ?? []).length === 2 && nt.j.plan.selections.every((x) => x?.blocked?.code === "TIME_REQUIRED") && nt.j?.plan?.newRequestCount === 0, JSON.stringify(nt.j?.plan?.selections ?? nt.j).slice(0, 200));
  for (const [key, sel, it] of [
    ["dk", dSel, d.it],
    ["ps", pSel, p.it],
    ["dkSw", dSw, ds.it],
  ]) {
    const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true });
    ids[key] = sv.j?.analysisId;
    ok(`kayıt ${key}`, typeof ids[key] === "string", JSON.stringify(sv.j).slice(0, 200));
  }
  const an = await api(`/analyses/${ids.dk}`);
  ok("kayıtlı Dashakoot: teknik + karşı taraf + yorum (yetkiyle)", an.j?.analysis?.technical?.total === 7 && an.j.analysis.profile?.partner?.label === "Sentetik B — Ankara" && an.j.analysis.interpretation?.visible === true);
  const anSw = await api(`/analyses/${ids.dkSw}`);
  ok("kayıtlı takaslı Dashakoot AYRI kayıt: 6 / 10, rol işareti; varsayılan kayıt 7 / 10 kalır", ids.dkSw !== ids.dk && anSw.j?.analysis?.technical?.total === 6 && anSw.j.analysis.technical.order === "partner_first" && an.j?.analysis?.technical?.order === undefined, JSON.stringify(anSw.j).slice(0, 200));
  for (const [key, want] of [
    ["dk", ["On Porutham (Dashakoot) — teknik değerlendirme", "7 / 10", "1. rol (geleneksel: damat)", "2. rol (geleneksel: gelin)", "Sentetik B — Ankara", "Rajju kısıtı", "Paada (ayak)", "Yöntem: Güney Hint On Porutham", "karşılandı · 1", "1. roldeki kişinin", "kendi doğum anının ayanamsa değeriyle"]],
    ["ps", ["Papasamyam — teknik değerlendirme", "3,75", "2,75", "Karşılaştırma kuralı", "Lagna'dan", "Venüs'ten", "Yöntem: Papasamyam", "1. roldeki kişinin", "kendi doğum anının ayanamsa değeriyle"]],
    ["dkSw", ["On Porutham (Dashakoot) — teknik değerlendirme", "6 / 10", "1. rol (geleneksel: damat)", "Rasi kriterinde gelinden damada 6., 8. ve 12. sayımlar", "1. roldeki kişinin", "kendi doğum anının ayanamsa değeriyle"]],
  ]) {
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[key]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${key} ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
      if (OUT) fs.writeFileSync(path.join(OUT, `${key}.${fmt}`), buf);
      if (fmt === "docx" && r.status === 200) {
        const text = await docxText(buf);
        ok(`Word ${key}: ${want.join(" · ")}`, want.every((x) => text.includes(x)) && !JARGON.test(text) && !text.includes("undefined"), want.filter((x) => !text.includes(x)).join(", "));
        const iTech = text.indexOf("Teknik hesaplama sonuçları");
        const iRec = text.search(/tavsiye edilir|reddedilmez/);
        ok(`Word ${key}: hüküm cümlesi yalnız yorum bölümünde`, iTech >= 0 && (iRec === -1 || iRec > text.indexOf("Otomatik Yorum")), `${iTech} ${iRec}`);
      }
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
    for (const id of ["vedic.gun_milan", "vedic.dashakoot", "vedic.papasamyam"]) ok(`seçici: ${id} Vedik sekmesinde`, await page.locator(`button[data-technique='${id}']`).first().isVisible().catch(() => false));
    for (const [id, tid] of [
      ["vedic.dashakoot", "dashakoot"],
      ["vedic.papasamyam", "papasamyam"],
    ]) {
      await page.locator(`button[data-technique='${id}']`).first().click();
      await page.waitForTimeout(300);
      await page.locator(`[data-technique-focus='${id}']`).first().click();
      await page.waitForTimeout(800);
      ok(`seçici ${tid}: karşı taraf alanı + parametreler`, (await page.locator("select[aria-label='Karşı taraf profili']").first().isVisible().catch(() => false)) && (await page.locator(`[data-testid=astro-${tid}-params]`).first().isVisible().catch(() => false)));
      const grp = page.locator(`[data-testid=astro-${tid}-order]`).first();
      ok(
        `seçici ${tid}: rol seçimi (2 seçenek, varsayılan danışan 1. rol; "1. rol (geleneksel: damat) / 2. rol (geleneksel: gelin)")`,
        (await grp.locator("input[type=radio]").count()) === 2 && (await grp.locator("[data-porutham-order=client_first]").isChecked().catch(() => false)) && (await grp.innerText().catch(() => "")).includes("1. rol (geleneksel: damat) / 2. rol (geleneksel: gelin)"),
      );
    }
    const body = await page.locator("body").innerText();
    ok("seçici: sağlayıcı adı / iç jargon yok", !JARGON.test(body));
    if (OUT) await page.screenshot({ path: path.join(OUT, "secici-1366.png"), fullPage: true });
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
    for (const [key, testid] of [
      ["dk", "astro-dashakoot-panel"],
      ["ps", "astro-papasamyam-panel"],
    ]) {
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${ids[key]}"]`);
      await item.waitFor({ timeout: 120000 }).catch(() => {});
      ok(`${tag} ${key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
      await item.click().catch(() => {});
      const sec = page.locator(`[data-testid=${testid}]`).first();
      await sec.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`${tag} ${key}: panel görünür`, await sec.isVisible().catch(() => false));
      const panelText = await sec.innerText().catch(() => "");
      // 24.10.2026: ayanamsa etiketi — derece 1. rolün doğum anına ait; her kişi kendi doğum anının değeriyle (ölçüldü)
      ok(`${tag} ${key}: ayanamsa etiketi 1. rol doğum anı + kişi başına not`, panelText.includes("1. rol doğum anı)") && panelText.includes("1. roldeki kişinin (") && panelText.includes("kendi doğum anının ayanamsa değeriyle"), panelText.slice(0, 240));
      ok(`${tag} ${key}: teknik panelde hüküm / açıklama cümlesi yok; roller açıkça yazılı`, !VERDICT_TEXT.some((x) => panelText.includes(x)) && panelText.includes("1. rol (geleneksel: damat)") && panelText.includes("2. rol (geleneksel: gelin)"), panelText.slice(0, 200));
      if (key === "dk") {
        const rows = await page.locator("[data-testid=astro-dashakoot-table] tbody tr").count();
        ok(`${tag} dk: kriter tablosu 10 satır`, rows === 10, String(rows));
        const total = await page.locator("[data-testid=astro-dashakoot-total]").first().innerText().catch(() => "");
        ok(`${tag} dk: toplam 7 / 10`, total.includes("7") && total.includes("10"), total);
        ok(`${tag} dk: Rajju / Vedha kartları etkin değil`, (await page.locator("[data-testid=astro-dashakoot-rajju][data-active=false]").count()) === 1 && (await page.locator("[data-testid=astro-dashakoot-vedha][data-active=false]").count()) === 1);
      } else {
        ok(`${tag} ps: iki kişi kartı, 3'er referans satırı`, (await page.locator("[data-testid=astro-papa-1] tbody tr").count()) === 3 && (await page.locator("[data-testid=astro-papa-2] tbody tr").count()) === 3);
        ok(`${tag} ps: karşılaştırma kuralı sağlanıyor`, (await page.locator("[data-testid=astro-papasamyam-comparison][data-comparison=within]").count()) === 1);
      }
      const m = await page.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
      ok(`${tag} ${key}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify(m));
      const body = await page.locator("body").innerText();
      ok(`${tag} ${key}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
      if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${key}-${tag}.png`), fullPage: true });
      for (const [tid, ext, magic] of [
        ["astro-report-docx", "docx", "PK"],
        ["astro-report-pdf", "pdf", "%PDF-"],
      ]) {
        const b = page.locator(`[data-testid=${tid}]`).first();
        if (!(await b.isVisible().catch(() => false))) {
          ok(`${tag} ${key}: ${ext} düğmesi görünür`, false);
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
  console.log(`\nvedik-eslesme-2-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
