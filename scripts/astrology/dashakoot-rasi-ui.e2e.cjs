// ATL-B02 (07.11.2026) — On Porutham Rasi (Kalaprakasika, adaptör -2): yeni / eski (-1) / belirsiz Rasi kayıtları — ekran + Word/PDF
// regresyonu (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı (GERÇEK golden yanıtlar: vedic-dashakoot.json, -swap.json). GERÇEK
// sağlayıcı çağrılmaz.
// Önkoşul: dev-fake-backend (FAKE_ROXY_CERT/KEY) ve yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true,
//          NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2).
// Çalıştırma: node scripts/astrology/dashakoot-rasi-ui.e2e.cjs <origin> <fake-port> <belirsiz-teknik-v2.json> [ekran-görüntüsü-klasörü]
//   belirsiz-teknik-v2.json = denetim-148'deki aynı burç (1. sayım) çiftinin -2 teknik verisi (yalnız sahte DB kaydı; Rasi belirsiz).
//   1) API: Ali Örnek (damat) + Sentetik B (gelin) → 12. sayım: servis 0, Kalaprakasika 1 → 8 / 10, servis değerlendirmesi gizli;
//      rol takası → 2. sayım, damat Koç (tek burç): servis 1, Kalaprakasika 0 → 5 / 10. Eski (-1) kayıt: yeni kaydın satırı, Rasi satırı
//      servisin değeriyle + sürüm -1 (sahte DB'ye; prod'a DEĞİL). Belirsiz kayıt: toplam 5–6.
//   2) Kayıtlı analizler 1920×1080, 1366×768, 768×1024, 390×844, 320×568: toplam, Rasi sonucu, kural / istisna / yöntem metni, eski kayıt
//      uyarısı; taşma / kırpılma / küçük yazı yok; ekran ↔ Word/PDF aynı.   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const JSZip = require("jszip");
const [ORIGIN = "http://localhost:3981", FAKE = "54419", UNC_TECH = "", OUT = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const API = `${ORIGIN}/api/admin/astroloji`;
const REST = `http://127.0.0.1:${FAKE}/rest/v1`;
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
const norm = (s) => s.replace(/\s+/g, " ").trim();
// Metinlerin ayırt edici parçaları (model/vedicPorutham.ts, legacyMethod.ts).
const N = {
  methodKp: "Rasi kriteri Kalaprakasika'ya (N. P. Subramania Iyer çevirisi, Bölüm XIII, s. 73–74) göre yerel olarak hesaplanır",
  methodOld: "Bu hesaplamada Rasi kriterinde gelinden damada 6., 8. ve 12. sayımlar karşılanmamış kabul edilir",
  ruleConverse: "8.–12. sayım: Kalaprakasika'da 2.–6. konumların tersi olumlu sayılır; karşılandı.",
  ruleSecondOdd: "2. sayım: damadın (1. rol) Ay burcu tek burç; Kalaprakasika istisnası uygulanmaz, karşılanmadı.",
  ruleSame: "Aynı Ay burcu (1. sayım): Kalaprakasika'nın Rasi kuralı bu konum için hüküm vermez",
  providerDiff: "(servisin kendi Rasi kuralı; puanlamaya girmez)",
  totalUnc: "Rasi belirsiz olduğundan toplam tek sayı olarak verilmez",
  pariharaSame: "iki Ay burcunun yöneticisi aynı",
  legacy: "Rasi kriteri bu kayıttan sonra Kalaprakasika (Bölüm XIII, s. 73–74) kuralıyla hesaplanıyor",
  withheld: "Servisin genel değerlendirmesi ve öneri cümlesi bu sonuçta gösterilmiyor",
  // Owner kararı (07.11): -2 kayıtlarda karma toplam açıklaması.
  mixed: "Bu toplamda Rasi kriteri Kalaprakasika yöntemine göre, diğer 9 kriter ise hesaplama servisinin kurallarına göre değerlendirilmiştir. Toplam, Kalaprakasika'nın tüm ölçütleriyle hesaplanmış bir uyum puanı değildir.",
};
const CASES = {
  dk: { label: "varsayılan (-2)", total: "8 / 10", rasi: "karşılandı · 1", notes: ["methodKp", "ruleConverse", "providerDiff", "mixed"], absent: ["methodOld", "ruleSecondOdd", "ruleSame", "totalUnc", "legacy"], legacy: false },
  dkSw: { label: "rol takaslı (-2)", total: "5 / 10", rasi: "karşılanmadı · 0", notes: ["methodKp", "ruleSecondOdd", "providerDiff", "mixed"], absent: ["methodOld", "ruleConverse", "ruleSame", "totalUnc", "legacy"], legacy: false },
  old: { label: "ESKİ (-1)", total: "7 / 10", rasi: "karşılanmadı · 0", notes: ["methodOld"], absent: ["methodKp", "ruleConverse", "ruleSecondOdd", "ruleSame", "providerDiff", "totalUnc", "withheld", "mixed"], legacy: true },
  unc: { label: "belirsiz Rasi (-2)", total: "5–6 / 10", rasi: "belirsiz · —", notes: ["methodKp", "ruleSame", "providerDiff", "totalUnc", "pariharaSame", "mixed"], absent: ["methodOld", "ruleConverse", "ruleSecondOdd", "legacy"], legacy: false },
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
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
const pdfText = (file) => execFileSync("pdftotext", ["-enc", "UTF-8", file, "-"], { encoding: "utf8" });
// PDF metninde satır kırılımı / tireleme olabilir: boşluksuz karşılaştırma.
const has = (text, s) => norm(text).replace(/\s/g, "").includes(s.replace(/\s/g, ""));
const hits = (text, keys) => keys.filter((k) => has(text, N[k]));

(async () => {
  // ── 1) API
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const pb = (await api(`/profiles?q=${encodeURIComponent("Sentetik B")}`)).j.profiles[0].id;
  const dSel = { technique: "vedic.dashakoot", options: { partnerProfileId: pb, ayanamsa: "lahiri" } };
  const dSw = { ...dSel, options: { ...dSel.options, order: "partner_first" } };
  const ids = {};
  const d = await runSel(pid, dSel);
  const dt = d.it?.view?.technical;
  const rasi = (t) => (t?.rows ?? []).find((r) => r.id === "rasi");
  ok("API varsayılan: adaptör -2, 8 / 10, Rasi 12. sayım karşılandı (servis: karşılanmadı), diğer satırlar servisin", d.it?.ok === true && d.it?.view?.adapterVersion === "astro-roxy-vedic-dashakoot-2" && dt?.total === 8 && rasi(dt)?.matched === true && rasi(dt)?.count === 12 && dt.rasiClassic?.provider?.matched === false, JSON.stringify(d.it ?? d.run.j).slice(0, 300));
  const ds = await runSel(pid, dSw);
  const dst = ds.it?.view?.technical;
  ok("API takas: 5 / 10, Rasi 2. sayım tek burç karşılanmadı (servis: karşılandı)", ds.it?.ok === true && dst?.total === 5 && rasi(dst)?.matched === false && rasi(dst)?.count === 2 && dst.rasiClassic?.rule === "second_odd" && dst.rasiClassic?.provider?.matched === true, JSON.stringify(ds.it ?? ds.run.j).slice(0, 300));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [dSel, dSw] });
  ok("aynı seçimler tekrar: 0 yeni istek (-2 önbellek anahtarı)", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  for (const [key, sel, it] of [
    ["dk", dSel, d.it],
    ["dkSw", dSw, ds.it],
  ]) {
    const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true, title: `On Porutham — ${CASES[key].label}` });
    ids[key] = sv.j?.analysisId;
    ok(`kayıt ${key}`, typeof ids[key] === "string", JSON.stringify(sv.j).slice(0, 200));
  }
  const an = await api(`/analyses/${ids.dk}`);
  const ip = an.j?.analysis?.interpretation;
  ok("kayıtlı -2: yorum görünür, servis değerlendirmesi gizli (verdictWithheld), Rasi notu yok", ip?.visible === true && JSON.stringify(ip).includes('"verdictWithheld":"rasi_local"') && JSON.stringify(ip).includes('"verdict":null') && !JSON.stringify(ip).includes('"id":"rasi"'), JSON.stringify(ip).slice(0, 300));
  // Eski (-1) kayıt: yeni kaydın satırı; Rasi satırı + toplam servisin değeriyle, Kalaprakasika alanı yok (yalnız sahte DB).
  const row = (await (await fetch(`${REST}/astro_analyses?id=eq.${ids.dk}&select=*`)).json())[0];
  const oldTech = JSON.parse(JSON.stringify(row.technical_snapshot));
  const or = oldTech.rows.find((r) => r.id === "rasi");
  or.matched = oldTech.rasiClassic.provider.matched;
  or.points = or.matched ? 1 : 0;
  oldTech.total = oldTech.rows.reduce((s, r) => s + r.points, 0);
  delete oldTech.rasiClassic;
  delete oldTech.totalRange;
  const save = async (title, tech, v) => {
    const rpc = await fetch(`${REST}/rpc/astro_analysis_save_v2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        p_tenant_id: TENANT, p_user_id: OWNER, p_profile_id: pid, p_profile_revision: 1, p_partner_profile_id: row.partner_profile_id ?? null, p_partner_profile_revision: row.partner_profile_revision ?? null, p_result_ids: [],
        p_technique: "vedic.dashakoot", p_title: title, p_save_request_id: randomUUID(), p_technique_params: row.technique_params,
        p_profile_snapshot: row.profile_snapshot, p_method_snapshot: row.method_snapshot, p_technical_snapshot: tech, p_kb_snapshot: [], p_provider_interp_included: false,
        p_provider_interp_snapshot: null, p_versions_snapshot: { ...row.versions_snapshot, adapterVersion: `astro-roxy-vedic-dashakoot-${v}`, projectionVersion: `vedic-dashakoot-proj-${v}` }, p_notes: [],
      }),
    });
    return (await rpc.json())?.analysis_id;
  };
  ids.old = await save("On Porutham — ESKİ (-1) kayıt", oldTech, 1);
  ok("eski (-1) kayıt sahte DB'ye yazıldı (7 / 10, Rasi servisin)", typeof ids.old === "string" && oldTech.total === 7);
  ids.unc = await save("On Porutham — belirsiz Rasi örneği", JSON.parse(fs.readFileSync(UNC_TECH, "utf8")), 2);
  ok("belirsiz Rasi (-2) kayıt sahte DB'ye yazıldı", typeof ids.unc === "string");
  const rowOf = async (id) => JSON.stringify((await (await fetch(`${REST}/astro_analyses?id=eq.${id}&select=*`)).json())[0]);
  const beforeOld = await rowOf(ids.old);
  const dOld = await api(`/analyses/${ids.old}`);
  ok("eski kayıt açılır: legacy notu dashakoot_rasi; teknik veri AYNEN (7 / 10, Rasi karşılanmadı)", (dOld.j?.analysis?.legacyNotes ?? []).some((n) => n.code === "dashakoot_rasi") && JSON.stringify(dOld.j?.analysis?.technical) === JSON.stringify(oldTech), JSON.stringify(dOld.j?.analysis?.legacyNotes ?? dOld.j).slice(0, 300));
  const dNew = await api(`/analyses/${ids.dk}`);
  ok("yeni kayıtta eski kayıt notu YOK", !(dNew.j?.analysis?.legacyNotes ?? []).some((n) => n.code === "dashakoot_rasi"));

  // ── Word / PDF
  const docs = {};
  for (const key of Object.keys(CASES)) {
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[key]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${key} ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
      const file = path.join(OUT || require("node:os").tmpdir(), `dashakoot-${key}.${fmt}`);
      fs.writeFileSync(file, buf);
      const text = fmt === "docx" ? await docxText(buf) : pdfText(file);
      docs[`${key}.${fmt}`] = text;
      const c = CASES[key];
      const miss = c.notes.filter((k) => !hits(text, [k]).length);
      const extra = c.absent.filter((k) => hits(text, [k]).length);
      ok(`${fmt.toUpperCase()} ${key}: toplam ${c.total}, Rasi '${c.rasi}', doğru metinler; yanlış metin yok; jargon yok`, has(text, c.total) && has(text, c.rasi) && !miss.length && !extra.length && !JARGON.test(text), `eksik ${miss} · fazla ${extra} · toplam ${has(text, c.total)} · rasi ${has(text, c.rasi)}`);
      if (c.legacy) ok(`${fmt.toUpperCase()} ${key}: 'Eski hesap sürümü' bölümü + Rasi eski kayıt notu`, has(text, "Eski hesap sürümü") && has(text, N.legacy));
      ok(`${fmt.toUpperCase()} ${key}: "en az 5" eşiği uygulanmamış`, !/en az (5|beş)|at least five/i.test(text));
      if (key === "dk") ok(`${fmt.toUpperCase()} dk: yorum bölümünde değerlendirme gizli açıklaması; servis cümlesi yok`, has(text, N.withheld) && !/tavsiye edilir/.test(text));
    }
  }

  // ── 2) Ekran
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const screen = {};
  const SIZES = [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
    [390, 844],
    [320, 568],
  ];
  for (const [w, hh] of SIZES) {
    const tag = `${w}x${hh}`;
    const { ctx, page } = await newPage(browser, w, hh);
    for (const key of Object.keys(CASES)) {
      const c = CASES[key];
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${ids[key]}"]`);
      await item.waitFor({ timeout: 120000 }).catch(() => {});
      ok(`${tag} ${key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
      await item.click().catch(() => {});
      const sec = page.locator("[data-testid=astro-dashakoot-panel]").first();
      await sec.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`${tag} ${key}: panel görünür`, await sec.isVisible().catch(() => false));
      ok(`${tag} ${key}: başlıkta 'Eski hesap sürümü' etiketi ${c.legacy ? "VAR" : "YOK"}`, (await page.locator("[data-testid=astro-legacy-method]:visible").count()) === (c.legacy ? 1 : 0));
      const total = await page.locator("[data-testid=astro-dashakoot-total]").first().innerText().catch(() => "");
      const rasiCell = await page.locator("[data-testid=astro-porutham-rasi]").first().innerText().catch(() => "");
      ok(`${tag} ${key}: toplam '${c.total}', Rasi '${c.rasi}', 10 satır`, has(total, c.total.replace(" / 10", "")) && has(total, "/ 10") && has(rasiCell, c.rasi) && (await page.locator("[data-testid=astro-dashakoot-table] tbody tr").count()) === 10, `${total} · ${rasiCell}`);
      ok(`${tag} ${key}: Kalaprakasika Rasi kartı ${key === "old" ? "YOK" : "VAR"}`, (await page.locator("[data-testid=astro-dashakoot-rasi-classic]").count()) === (key === "old" ? 0 : 1));
      // Karma toplam açıklaması: yalnız -2; toplamın hemen altında, görünür, kendi kutusuna sığıyor; "en az 5" eşiği yok.
      const mix = page.locator("[data-testid=astro-dashakoot-total-mixed]");
      if (key === "old") ok(`${tag} old: karma toplam açıklaması YOK`, (await mix.count()) === 0);
      else {
        const mm = await page.evaluate(() => {
          const t = document.querySelector("[data-testid=astro-dashakoot-total]");
          const m = document.querySelector("[data-testid=astro-dashakoot-total-mixed]");
          if (!t || !m) return null;
          const a = t.getBoundingClientRect();
          const b = m.getBoundingClientRect();
          return { below: b.top >= a.bottom - 1 && b.top - a.bottom < 60, fits: m.scrollWidth <= m.clientWidth + 1, inView: b.left >= -1 && b.right <= document.documentElement.clientWidth + 1, font: parseFloat(getComputedStyle(m).fontSize) };
        });
        ok(`${tag} ${key}: karma toplam açıklaması toplamın hemen altında, taşmıyor, ekranda, yazı ≥ 11 px`, (await mix.isVisible().catch(() => false)) && !!mm && mm.below && mm.fits && mm.inView && mm.font >= 11, JSON.stringify(mm));
      }
      const panelTxt = await sec.innerText().catch(() => "");
      const interpTxt = await page.locator("[data-testid=astro-dashakoot-interp]").first().innerText().catch(() => "");
      screen[`${key}.${tag}`] = panelTxt;
      const miss = c.notes.filter((k) => !hits(panelTxt, [k]).length);
      const extra = c.absent.filter((k) => k !== "legacy" && k !== "withheld" && hits(panelTxt, [k]).length);
      ok(`${tag} ${key}: doğru metinler, yanlış metin yok`, !miss.length && !extra.length, `eksik ${miss} · fazla ${extra}`);
      if (key === "dk") ok(`${tag} dk: yorum panelinde değerlendirme gizli açıklaması`, has(interpTxt, N.withheld) && !interpTxt.includes("tavsiye edilir"), interpTxt.slice(0, 200));
      const m = await page.evaluate(() => {
        const root = document.querySelector("[data-testid=astro-dashakoot-panel]");
        const dw = document.documentElement.scrollWidth;
        const vw = document.documentElement.clientWidth;
        const clipped = [];
        for (const el of root.querySelectorAll("p, h4")) {
          if (el.offsetParent === null || !el.textContent.trim()) continue;
          const cs = getComputedStyle(el);
          if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") clipped.push(el.textContent.slice(0, 40));
        }
        const tables = [...root.querySelectorAll("table")].map((t) => {
          let p = t.parentElement;
          while (p && p !== root && getComputedStyle(p).overflowX === "visible") p = p.parentElement;
          return t.getBoundingClientRect().width <= (p ?? root).clientWidth + 1 || ["auto", "scroll"].includes(getComputedStyle(p ?? root).overflowX);
        });
        let minFont = 99;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const el = walker.currentNode.parentElement;
          if (!walker.currentNode.textContent.trim() || !el || el.offsetParent === null) continue;
          minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
        }
        const card = document.querySelector("[data-testid=astro-dashakoot-rasi-classic]");
        const cr = card?.getBoundingClientRect();
        const pr = root.getBoundingClientRect();
        return { dw, vw, clipped, tablesOk: tables.every(Boolean), minFont, panelInside: pr.left >= -1 && pr.right <= vw + 1, cardInside: !cr || (cr.left >= -1 && cr.right <= vw + 1) };
      });
      ok(`${tag} ${key}: yatay taşma yok, kırpılmış paragraf yok, tablolar sığıyor ya da kaydırılabilir, Rasi kartı ekranda, yazı ≥ 11 px`, m.dw <= m.vw + 1 && !m.clipped.length && m.tablesOk && m.panelInside && m.cardInside && m.minFont >= 11, JSON.stringify(m));
      const body = await page.locator("body").innerText();
      ok(`${tag} ${key}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
      if (OUT) {
        for (const [part, sel] of [["toplam", "[data-testid=astro-dashakoot-total]"], ["karma", "[data-testid=astro-dashakoot-total-mixed]"], ["tablo", "[data-testid=astro-dashakoot-table]"], ["rasi", "[data-testid=astro-dashakoot-rasi-classic]"], ["yontem", "[data-testid=astro-dashakoot-method]"], ["eski", "[data-testid=astro-legacy-method]"]]) {
          const loc = page.locator(sel).first();
          if (!(await loc.count()) || !(await loc.isVisible().catch(() => false))) continue;
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(200);
          await loc.screenshot({ path: path.join(OUT, `bolum-${key}-${tag}-${part}.png`) }).catch((e) => ok(`${tag} ${key}: ${part} görüntüsü`, false, String(e)));
        }
        await page.screenshot({ path: path.join(OUT, `sayfa-${key}-${tag}.png`), fullPage: false });
      }
    }
    await ctx.close();
  }
  await browser.close();
  // ── Ekran ↔ Word/PDF aynı toplam, Rasi sonucu ve metin kümesi
  for (const key of Object.keys(CASES)) {
    const c = CASES[key];
    for (const [w, hh] of SIZES) {
      const s = screen[`${key}.${w}x${hh}`] ?? "";
      for (const fmt of ["docx", "pdf"]) {
        const dd = docs[`${key}.${fmt}`] ?? "";
        const keys = Object.keys(N).filter((k) => k !== "legacy" && k !== "withheld");
        const same = has(s, c.rasi) === has(dd, c.rasi) && keys.every((k) => hits(s, [k]).length === hits(dd, [k]).length);
        ok(`ekran ${w}x${hh} ↔ ${fmt.toUpperCase()} ${key}: aynı Rasi sonucu + aynı metin kümesi`, same);
      }
    }
  }
  ok("eski (-1) kayıt satırı açma / rapor / ekran sonrası DEĞİŞMEDİ", beforeOld === (await rowOf(ids.old)));
  console.log(`\ndashakoot-rasi-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
