// Gökyüzü Atlası — 10 canlı bulgu (15.11.2026) ekran regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (KATI mod:
// yalnız birebir golden gövdeye GERÇEK golden yanıt; GERÇEK sağlayıcı YOK). Önkoşul: dev-fake-backend **FAKE_PICKER_SEED=1** ile
// (520 kayıtlı sentetik profil → toplu indirme sınırı). Tüm kişiler SENTETİK (Ali Örnek, Sentetik B, Çok Kayıtlı Örnek).
// Çalıştırma: node scripts/astrology/atlas-ui10.e2e.cjs <origin> [ekran-görüntüsü-klasörü] [fake.log]
//   K1 arşivden açılan analizde Teknik Ekle → Sinastri karşı taraf listesi dolu
//   K2 Vedik D1 yogaları: Türkçe oluşum kuralı; İngilizce kanıt yalnız açılır ayrıntıda, "özgün İngilizce" etiketli
//   K3 toplu Word/PDF: 30'dan fazla analizde "Tümü" kapalı + açıklama; 30 ve altında açık
//   K4 büyük harf başlıkta Latince / İngilizce ev sistemi adı Türkçe "İ" ile yazılmaz (PLACIDUS, WHOLE SIGN)
//   K5 KP saat dilimi listesi tüm IANA bölgeleri (Pacific/Apia); UTC girilen horary künyesinde değerlendirme yeri yerel saati
//   Y1 Analiz Arşivi: danışan adı sütunu daralmaz (tablo yalnız yer varsa; yoksa kart); arama kutusu ≥ 200 px
//   Y2 KP horary ızgarası: etiket kesilmez (scrollWidth ≤ clientWidth)
//   Y3 masa bilgi paneli (≥1024): hedef 480 px (masa darsa harita ≥ 320 px'e kadar)
//   Y4 Solar Arc konum tablosu: Solar Arc sütunu yatay kaydırmasız görünür
//   Y5 KP ızgarasında < 10 px metin yok; Vedik kundli çerçevesi ≥ 320 px (yer varsa)
//   Genişlikler 320 · 390 · 768 · 1024 · 1366 · 1536; her ekranda sayfa yatay taşmaz. Tarayıcı öykünmesidir; fiziksel cihaz DEĞİL.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const { dismissAtlasDevNotice } = require("./atlas-e2e-open-analysis.cjs");
const [ORIGIN = "http://localhost:3981", OUT = "", LOG = ""] = process.argv.slice(2);
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
const api = async (p, b) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const hits = () => (LOG && fs.existsSync(LOG) ? (fs.readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const VIEWS = [
  [320, 640],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1536, 864],
];
const LIMIT = 30;

async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    if (!location.protocol.startsWith("http")) return; // about:blank ara sayfasında depolama yok
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  await dismissAtlasDevNotice(page);
  return { ctx, page };
}
/** Gezinme (hash / yeniden çizim) ölçümün ortasına denk gelirse bağlam yok olur → kısa bekleyip yeniden ölç (en çok 4 kez). */
async function ev(page, fn, arg) {
  for (let i = 0; ; i++) {
    try {
      return await page.evaluate(fn, arg);
    } catch (e) {
      if (i >= 3 || !/Execution context was destroyed|navigation/.test(String(e))) throw e;
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
}
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`) });
};
/** Sayfa yatay taşma + büyük harfte Türkçe "İ" ile yazılmış Latince ad (K4) taraması. */
const pageAudit = (page) =>
  ev(page, () => {
    const bad = [];
    for (const el of document.querySelectorAll("th, h3, h4, h5, span, div, p, button, label")) {
      if (el.children.length > 3 || el.offsetParent === null) continue;
      const t = el.innerText || "";
      if (/SİGN|PLACİDUS|REGİOMONTANUS|ALCABİTİUS/.test(t) && getComputedStyle(el).textTransform === "uppercase") bad.push(t.slice(0, 60));
    }
    return { dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, capsBad: [...new Set(bad)] };
  });

async function openSaved(page, pid, id, wait) {
  await page.goto("about:blank"); // aynı sayfada yalnız hash değişirse yeniden yüklenmez → her açılış temiz yükleme
  await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
  const item = page.locator(`[data-saved-item="${id}"]`);
  await item.waitFor({ timeout: 120000 });
  await item.click();
  await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
  await page.waitForTimeout(1500);
  const techTab = page.getByRole("tab", { name: /Teknik ayrıntı/ }).first();
  if (await techTab.count()) await techTab.click().catch(() => {});
  if (wait) await page.waitForSelector(wait, { timeout: 60000 });
  await page.waitForTimeout(700);
}

async function runSave(pid, sel, title) {
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
  const opts = plan.j?.plan?.selections?.[0]?.options ?? sel.options;
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: sel.technique, options: opts }], confirmNewRequests: plan.j?.plan?.newRequestCount ?? 0 });
  const it = run.j?.results?.[0];
  ok(`hazırlık ${sel.technique}: golden yanıt projeksiyondan geçti`, it?.ok === true, JSON.stringify(run.j ?? run.s).slice(0, 240));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? opts, saveRequestId: randomUUID(), title });
  ok(`hazırlık ${sel.technique}: kayıt`, typeof sv.j?.analysisId === "string", JSON.stringify(sv.j ?? sv.s).slice(0, 200));
  return sv.j?.analysisId;
}

(async () => {
  const profs = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}&sort=name&limit=100`)).j.profiles;
  const pid = profs.find((p) => p.label === "Ali Örnek — natal" && p.current?.birthDate === "1990-07-15")?.id ?? profs[0].id;
  const many = (await api(`/profiles?q=${encodeURIComponent("Çok Kayıtlı")}`)).j?.profiles?.[0]?.id ?? null;
  ok("hazırlık: 520 kayıtlı sentetik profil var (FAKE_PICKER_SEED=1)", !!many);
  const list = (await api(`/analyses?profileId=${pid}&offset=0&limit=100`)).j;
  const natalId = (list?.analyses ?? list?.items ?? []).find((a) => a.technique === "western.natal" && /gerçek kayıt/.test(a.title ?? ""))?.id;
  ok("hazırlık: Ali natal kaydı", typeof natalId === "string", JSON.stringify(Object.keys(list ?? {})));
  const h0 = hits();
  const ids = {
    horary: await runSave(pid, { technique: "kp.horary", options: { date: "2026-10-07", time: "09:00", timezone: "UTC", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null } }, "UI10 KP horary (UTC girişi)"),
    d1: await runSave(pid, { technique: "vedic.d1", options: { ayanamsa: "lahiri" } }, "UI10 Vedik D1"),
    prog: await runSave(pid, { technique: "western.progression", options: { targetDate: "2026-10-07", nodeType: "true" } }, "UI10 progression"),
    sa: await runSave(pid, { technique: "western.solar_arc", options: { targetDate: "2026-10-07", nodeType: "true" } }, "UI10 solar arc"),
  };
  console.log(`kayıtlar ${JSON.stringify(ids)} · sağlayıcı isteği ${h0} → ${hits()}`);

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const [w, h] of VIEWS) {
    const tag = `${w}`;
    const { ctx, page } = await newPage(browser, w, h);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

    // ── Y1 + K3: Analiz Arşivi + toplu indirme
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    await page.locator("[data-testid=astro-client-file-back]").first().waitFor({ timeout: 120000 });
    await page.locator("[data-testid=astro-client-file-back]").first().click();
    await page.waitForFunction(() => location.hash === "#analiz-arsivi", null, { timeout: 20000 }).catch(() => {});
    await page.locator("[data-testid=astro-archive-rows] li").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    const ar = await ev(page, () => {
      const root = document.querySelector("[data-testid=astro-archive-list]");
      const row = [...document.querySelectorAll("[data-testid=astro-archive-rows] li")].find((li) => li.innerText.includes("Ali Örnek")) ?? document.querySelector("[data-testid=astro-archive-rows] li");
      const name = row?.querySelector("button[title='Danışan dosyasını aç']");
      const nameText = name?.querySelector("span.min-w-0 > span");
      const lh = nameText ? parseFloat(getComputedStyle(nameText).lineHeight) || 20 : 20;
      const search = document.querySelector("input[aria-label='Arşivde ara']")?.closest("label");
      const head = document.querySelector("[data-testid=astro-archive-list] [class*='tableHead']");
      return {
        listW: Math.round(root?.getBoundingClientRect().width ?? 0),
        table: !!head && getComputedStyle(head).display !== "none",
        nameW: Math.round(name?.getBoundingClientRect().width ?? 0),
        nameLines: nameText ? Math.round(nameText.getBoundingClientRect().height / lh) : 0,
        searchW: Math.round(search?.getBoundingClientRect().width ?? 0),
        toolbarW: Math.round(search?.parentElement?.getBoundingClientRect().width ?? 0),
      };
    });
    ok(`Y1 ${tag}: danışan adı sütunu ≥ 140 px, ad ≤ 2 satır`, ar.nameW >= 140 && ar.nameLines <= 2, JSON.stringify(ar));
    ok(`Y1 ${tag}: arama kutusu ≥ 200 px (ya da araç çubuğu kadar)`, ar.searchW >= Math.min(200, ar.toolbarW - 2), JSON.stringify({ searchW: ar.searchW, toolbarW: ar.toolbarW }));
    let au = await pageAudit(page);
    ok(`Y1 ${tag}: sayfa yatay taşmıyor`, au.dw <= au.vw + 1, JSON.stringify({ dw: au.dw, vw: au.vw }));
    await shot(page, `Y1-arsiv-${tag}`);

    if (many) {
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${many}`, { waitUntil: "load", timeout: 240000 });
      await page.locator("[data-testid=astro-bulk-all-docx]").waitFor({ timeout: 120000 });
      const bk = await ev(page, () => ({
        all: document.querySelector("[data-testid=astro-bulk-all-docx]")?.textContent,
        allDisabled: document.querySelector("[data-testid=astro-bulk-all-docx]")?.disabled,
        pdfDisabled: document.querySelector("[data-testid=astro-bulk-all-pdf]")?.disabled,
        limit: document.querySelector("[data-testid=astro-bulk-limit]")?.innerText ?? null,
      }));
      const n = Number(/\((\d+)\)/.exec(bk.all ?? "")?.[1] ?? NaN);
      ok(`K3 ${tag}: ${n} analiz (> ${LIMIT}) → "Tümü" Word/PDF kapalı + açıklama`, n > LIMIT && bk.allDisabled === true && bk.pdfDisabled === true && /en çok 30 analiz/.test(bk.limit ?? ""), JSON.stringify(bk));
      await page.locator("[data-testid=astro-bulk-report]").scrollIntoViewIfNeeded();
      await shot(page, `K3-toplu-indirme-${tag}`);
    }
    if (w === 1366) {
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
      await page.locator("[data-testid=astro-bulk-all-docx]").waitFor({ timeout: 120000 });
      const b2 = await ev(page, () => ({ all: document.querySelector("[data-testid=astro-bulk-all-docx]")?.textContent, dis: document.querySelector("[data-testid=astro-bulk-all-docx]")?.disabled, limit: !!document.querySelector("[data-testid=astro-bulk-limit]") }));
      const n2 = Number(/\((\d+)\)/.exec(b2.all ?? "")?.[1] ?? NaN);
      ok(`K3 ${tag}: sınırla tutarlı (${n2} analiz → ${n2 > LIMIT ? "kapalı" : "açık"})`, b2.dis === n2 > LIMIT && b2.limit === n2 > LIMIT, JSON.stringify(b2));
    }

    // ── K1 (+K5 seçici): arşivden açılan kayıtlı natal → Teknik Ekle
    if ([390, 768, 1366].includes(w) && natalId) {
      await openSaved(page, pid, natalId);
      await page.locator("[data-testid=atlas-saved-add-technique]:visible").first().click();
      await page.locator("[data-add-technique='western.synastry']").first().waitFor({ timeout: 30000 });
      await page.locator("[data-add-technique='western.synastry']").first().click();
      await page.locator("li:has([data-add-technique='western.synastry']) > button").nth(1).click();
      const sel = page.locator("select[aria-label='Karşı taraf profili']").first();
      await sel.waitFor({ timeout: 20000 });
      await page.waitForFunction(() => [...(document.querySelector("select[aria-label='Karşı taraf profili']")?.options ?? [])].filter((o) => o.value).length > 0, null, { timeout: 8000 }).catch(() => {});
      const opts = await sel.evaluate((s) => [...s.options].filter((o) => o.value).map((o) => o.textContent));
      ok(`K1 ${tag}: Teknik Ekle → Sinastri karşı taraf seçenekleri dolu`, opts.length > 0 && opts.some((t) => /Sentetik B/.test(t)), `${opts.length} seçenek: ${opts.slice(0, 3).join(" | ")}`);
      await shot(page, `K1-teknik-ekle-sinastri-${tag}`);
      if (w === 1366) {
        await page.locator("[data-testid=atlas-add-close-settings]").first().click().catch(() => {});
        await page.locator("[data-add-system='kp']").first().click();
        await page.locator("[data-add-technique='kp.horary']").first().click();
        await page.locator("li:has([data-add-technique='kp.horary']) > button").nth(1).click();
        await page.getByText("Tarih/saat", { exact: false }).first().click();
        const tz = page.locator("select[aria-label='KP saat dilimi']").first();
        await tz.waitFor({ timeout: 15000 });
        const tzs = await tz.evaluate((s) => [...s.options].map((o) => o.value));
        ok(`K5 ${tag}: KP saat dilimi listesi tüm IANA bölgeleri (Pacific/Apia var)`, tzs.includes("Pacific/Apia") && tzs.length > 100, `${tzs.length} seçenek`);
        await shot(page, `K5-kp-saat-dilimi-${tag}`);
      }
    }

    // ── K5 künye + Y2 + Y5 (KP horary ızgarası)
    if (ids.horary) {
      await openSaved(page, pid, ids.horary, "[data-testid=astro-kp-horary-panel]");
      const kp = await ev(page, () => {
        const items = [...document.querySelectorAll("[data-testid=astro-kp-horary-panel] [data-kp-item]")].filter((e) => e.offsetParent !== null);
        const cut = items.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
        const chart = document.querySelector("[data-testid=astro-kp-horary-panel] [data-testid=astro-kp-chart]");
        const small = chart ? [...chart.querySelectorAll("*")].filter((e) => e.offsetParent !== null && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10).length : -1;
        return {
          moment: document.querySelector("[data-testid=astro-kp-horary-moment]")?.innerText ?? null,
          place: document.querySelector("[data-testid=astro-kp-horary-moment-place]")?.innerText ?? null,
          items: items.length,
          cut,
          small,
          chartW: Math.round(chart?.getBoundingClientRect().width ?? 0),
        };
      });
      ok(`K5 ${tag}: UTC girilen soru anı + değerlendirme yeri yerel saati`, kp.moment === "07.10.2026 09:00 UTC" && kp.place === "değerlendirme yerinde 07.10.2026 12:00 — Türkiye saati, GMT+3", JSON.stringify({ m: kp.moment, p: kp.place }));
      ok(`Y2 ${tag}: KP horary ızgarasında kesik etiket yok`, kp.items > 0 && kp.cut.length === 0, `${kp.items} etiket, kesik ${kp.cut.length}: ${kp.cut.slice(0, 4).join(" | ")} · harita ${kp.chartW} px`);
      ok(`Y5 ${tag}: KP ızgarasında < 10 px metin yok`, kp.small === 0, `${kp.small} öğe`);
      au = await pageAudit(page);
      ok(`${tag} KP horary: sayfa yatay taşmıyor`, au.dw <= au.vw + 1, JSON.stringify({ dw: au.dw, vw: au.vw }));
      await page.locator("[data-testid=astro-kp-horary-panel] [data-testid=astro-kp-chart]").first().scrollIntoViewIfNeeded();
      await shot(page, `Y2-Y5-kp-horary-${tag}`);
    }

    // ── K2 + Y5 (Vedik D1)
    if (ids.d1) {
      await openSaved(page, pid, ids.d1, "[data-testid=astro-vedic-yogas]");
      const vd = await ev(page, () => {
        const ul = document.querySelector("[data-testid=astro-vedic-yogas]");
        const frame = document.querySelector(".vedic-kundli-frame");
        const panel = frame?.parentElement;
        return {
          text: ul?.innerText ?? "",
          formations: ul ? ul.querySelectorAll("[data-testid=astro-vedic-yoga-formation]").length : 0,
          frameW: Math.round(frame?.getBoundingClientRect().width ?? 0),
          rowW: Math.round(panel?.getBoundingClientRect().width ?? 0),
        };
      });
      const english = /Non-luminary|placed in the|conjunction or opposition|own sign|holds on \d+ of|occupy exactly/.test(vd.text);
      ok(`K2 ${tag}: yoga listesinde görünür İngilizce oluşum metni yok, Türkçe kural var`, !english && vd.formations >= 5 && /Oluşum kuralı: /.test(vd.text), `${vd.formations} kural · İngilizce görünür=${english}`);
      ok(`Y5 ${tag}: Vedik kundli çerçevesi ≥ 320 px (yer varsa)`, vd.frameW >= Math.min(320, vd.rowW - 2), JSON.stringify({ frameW: vd.frameW, rowW: vd.rowW }));
      au = await pageAudit(page);
      ok(`${tag} Vedik D1: sayfa yatay taşmıyor`, au.dw <= au.vw + 1, JSON.stringify({ dw: au.dw, vw: au.vw }));
      await page.locator(".vedic-kundli-frame").first().scrollIntoViewIfNeeded();
      await shot(page, `Y5-vedik-kundli-${tag}`);
      await page.locator("[data-testid=astro-vedic-yogas]").first().scrollIntoViewIfNeeded();
      await shot(page, `K2-vedik-yoga-${tag}`);
    }

    // ── K4 + Y3 (progression)
    if (ids.prog) {
      await openSaved(page, pid, ids.prog, "[data-testid=astro-progression-panel]");
      const pr = await ev(page, () => {
        const head = document.querySelector("[data-testid=astro-progression-natal-house-head]");
        const grid = document.querySelector("[data-testid=atlas-desk-grid]");
        const info = grid ? grid.children[2] : null;
        const tbl = document.querySelector("[data-testid=astro-progression-positions]");
        const box = tbl?.closest(".overflow-x-auto");
        const hr = head?.getBoundingClientRect();
        const br = box?.getBoundingClientRect();
        return {
          headShown: head ? head.innerText : null,
          headText: head ? head.textContent : null,
          deskW: grid ? Math.round(grid.getBoundingClientRect().width) : null,
          infoW: info ? Math.round(info.getBoundingClientRect().width) : null,
          natalHeadVisible: hr && br ? hr.right <= br.right + 1 : null,
        };
      });
      ok(`K4 ${tag}: büyük harf başlık 'NATAL EV (PLACIDUS)' (Türkçe İ yok), metin değişmedi`, pr.headShown === "NATAL EV (PLACIDUS)" && pr.headText === "Natal ev (Placidus)", JSON.stringify({ shown: pr.headShown, text: pr.headText }));
      if (pr.deskW) {
        const target = Math.min(480, pr.deskW - 14 - 320);
        ok(`Y3 ${tag}: bilgi paneli ≥ ${target} px (masa ${pr.deskW} px)`, pr.infoW >= target - 2, JSON.stringify(pr));
        if (w >= 1366) ok(`Y3 ${tag}: 'Natal ev' sütunu kaydırmasız görünür`, pr.natalHeadVisible === true, JSON.stringify(pr));
      }
      au = await pageAudit(page);
      ok(`K4 ${tag}: büyük harfte 'SİGN/PLACİDUS' yok`, au.capsBad.length === 0, au.capsBad.join(" | "));
      ok(`${tag} progression: sayfa yatay taşmıyor`, au.dw <= au.vw + 1, JSON.stringify({ dw: au.dw, vw: au.vw }));
      await page.locator("[data-testid=astro-progression-positions]").first().scrollIntoViewIfNeeded();
      await shot(page, `K4-Y3-progression-${tag}`);
    }

    // ── Y4 (Solar Arc)
    if (ids.sa) {
      await openSaved(page, pid, ids.sa, "[data-testid=astro-solar-arc-positions]");
      const sa = await ev(page, () => {
        const tbl = document.querySelector("[data-testid=astro-solar-arc-positions]");
        const ths = [...tbl.querySelectorAll("thead th")];
        const th = ths.find((x) => x.textContent.trim() === "Solar Arc");
        const box = tbl.closest(".overflow-x-auto");
        const b = box.getBoundingClientRect();
        const r = th.getBoundingClientRect();
        return { order: ths.map((x) => x.textContent.trim()), saRight: Math.round(r.right), boxRight: Math.round(b.right), scroll: box.scrollWidth > box.clientWidth + 1 };
      });
      ok(`Y4 ${tag}: Solar Arc sütunu kaydırmasız görünür`, sa.saRight <= sa.boxRight + 1, JSON.stringify(sa));
      au = await pageAudit(page);
      ok(`${tag} solar arc: sayfa yatay taşmıyor`, au.dw <= au.vw + 1, JSON.stringify({ dw: au.dw, vw: au.vw }));
      await page.locator("[data-testid=astro-solar-arc-positions]").first().scrollIntoViewIfNeeded();
      await shot(page, `Y4-solar-arc-${tag}`);
    }
    ok(`${tag}: sayfa hatası yok`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(`\natlas-ui10 e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log(`\natlas-ui10 e2e: ${pass} PASS / ${fail + 1} FAIL (betik hatası)`);
  process.exit(1);
});
