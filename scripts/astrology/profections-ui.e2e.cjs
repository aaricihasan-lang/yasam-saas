// YILLIK PROFEKSİYONLAR (2026-10-20) — ekran + akış regresyonu (Playwright Chromium). YEREL; sahte DB + sahte Roxy (KATI mod:
// yalnız birebir golden gövdeye GERÇEK FAZ 0 yanıtı — golden/profections-ali-36.json = T02; GERÇEK Roxy YOK).
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend.
// Çalıştırma: node scripts/astrology/profections-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   • API: plan (yalnız yaş) → çalıştır (36 yaş = golden) → Kendi Yorumum (yas:36) → kaydet → aç (0 yeni istek) → Word/PDF 200
//   • golden'ı olmayan yaş (37) → sağlayıcı 501 → sonuç yok, kayıt reddedilir (sahte sonuç yok)
//   • Yeni Analiz: teknik seçilir → yıl seçici bu yılı önerir (36 yaş · 15.07.2026 – 14.07.2027) → plan gövdesi {age:36}
//   • Kayıtlı analiz 1366×768, 1024×768, 768×1024, 390×844, 320×640: Türkçe alanlar, yatay taşma yok, kesik metin yok,
//     sağlayıcı anlatısı ("efendisi") ve sağlayıcı adı yok, Kendi Yorumum görünür.
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
const VIEWS = [
  [1366, 768],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [320, 640],
];
const NOTE = "Profeksiyon 36 yaş uzman değerlendirmesi (e2e)";

async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return { ctx, page: await ctx.newPage() };
}

(async () => {
  // ── 1) API akışı
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const sel = [{ technique: "western.profections", options: { age: 36 } }];
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: sel });
  ok("plan: seçenek yalnız yaş", JSON.stringify(plan.j?.plan?.selections?.[0]?.options) === JSON.stringify({ age: 36 }), JSON.stringify(plan.j?.plan?.selections?.[0] ?? plan.j).slice(0, 200));
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: sel, confirmNewRequests: plan.j.plan.newRequestCount });
  const v = run.j?.results?.[0]?.view;
  ok("run: gerçek golden yanıtı adaptörden geçti", run.j?.results?.[0]?.ok === true, JSON.stringify(run.j).slice(0, 300));
  ok("sonuç: 36 yaş · 1. ev · Akrep · Mars · Boğa/7 · Tam Burç", v?.technical?.age === 36 && v.technical.profectedHouse === 1 && v.technical.profectedSign === "scorpio" && v.technical.lordOfYear === "mars" && v.technical.lordNatal?.sign === "taurus" && v.technical.lordNatal?.house === 7 && v.method?.houseSystem === "whole-sign", JSON.stringify(v?.technical));
  ok("yanıtta sağlayıcı anlatısı yok", !JSON.stringify(run.j).includes("efendisi"));
  // Arayüzle aynı yol: çalışma alanı not bağlamını SUNUCUDAN alır (yas:36), not PUT ile o bağlama yazılır.
  const ws = await api("/workspace", { profileId: pid, revision: 1, technique: "western.profections", options: v.options });
  ok("çalışma alanı not bağlamı = yas:36", ws.j?.noteContext === "yas:36", JSON.stringify(ws.j).slice(0, 200));
  const note = await api("/notes", { profileId: pid, technique: "western.profections", contextKey: ws.j?.contextKey, noteContext: ws.j?.noteContext, sectionKey: "overall", body: NOTE, expectedRevision: null }, false, "PUT");
  ok("Kendi Yorumum (yas:36) kaydedildi", note.s === 201 || note.s === 200, `${note.s} ${JSON.stringify(note.j).slice(0, 200)}`);
  const ws37 = await api("/workspace", { profileId: pid, revision: 1, technique: "western.profections", options: { age: 37 } });
  ok("37 yaş çalışma alanında 36 yaş notu görünmez", ws37.s !== 200 || !JSON.stringify(ws37.j).includes(NOTE), `${ws37.s}`);
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: "western.profections", options: v.options, saveRequestId: randomUUID() });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(sv.j).slice(0, 200));
  const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: sel });
  ok("aynı profeksiyon yılı: 0 yeni istek", again.j?.plan?.newRequestCount === 0, JSON.stringify(again.j?.plan).slice(0, 200));
  const an = await api(`/analyses/${id}`);
  ok("kayıtlı analiz: teknik + not", an.j?.analysis?.technical?.lordOfYear === "mars" && JSON.stringify(an.j?.analysis?.notes ?? []).includes(NOTE), JSON.stringify(an.j).slice(0, 200));
  for (const fmt of ["docx", "pdf"]) {
    const r = await api(`/analyses/${id}/report?format=${fmt}`, null, true);
    const buf = Buffer.from(await r.arrayBuffer());
    ok(`rapor ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length} bayt`);
    if (OUT) fs.writeFileSync(path.join(OUT, `profeksiyon-36.${fmt}`), buf);
    if (fmt === "docx" && r.status === 200) {
      const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml").async("string");
      const text = xml.replace(/<[^>]+>/g, "");
      ok("Word: Türkçe alanlar + uzman notu + Tam Burç", ["Yıllık Profeksiyonlar", "36 yaş profeksiyon yılı", "Etkin astrolojik ev", "Yılın yönetici gezegeni", "Yöneticinin natal konumu", "Tam Burç (Whole Sign)", NOTE].every((s) => text.includes(s)), text.slice(0, 160));
      ok("Word: sağlayıcı metni / sağlayıcı adı yok", !text.includes("efendisi") && !/roxy/i.test(text) && !text.includes("undefined"));
    }
  }
  const r37 = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: "western.profections", options: { age: 37 } }], confirmNewRequests: 1 });
  ok("golden'ı olmayan yaş (37): sonuç yok (sahte sonuç üretilmez)", r37.j?.results?.[0]?.ok !== true, JSON.stringify(r37.j).slice(0, 200));
  const sv37 = await api("/analyses", { profileId: pid, revision: 1, technique: "western.profections", options: { age: 37 }, saveRequestId: randomUUID() });
  ok("hesaplanmamış yıl kaydedilemez", sv37.s >= 400, String(sv37.s));

  const browser = await chromium.launch();

  // ── 2) Yeni Analiz: yıl seçici (masaüstü + telefon)
  for (const [w, h] of [
    [1366, 768],
    [390, 844],
  ]) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    const bodies = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/admin\/astroloji\/engine\/(plan|run)/.test(r.url())) {
        try {
          for (const s of JSON.parse(r.postData() || "{}").selections ?? []) if (s.technique === "western.profections") bodies.push(s.options);
        } catch {}
      }
    });
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
    const btn = page.locator("button[data-technique='western.profections']").first();
    const label = (await btn.count()) ? await btn.getAttribute("aria-label") : null;
    const focusTxt = await page.locator("[data-technique-focus='western.profections']").first().innerText();
    ok(`${tag} teknik listede: Yıllık Profeksiyonlar`, label === "Yıllık Profeksiyonlar: analize ekle" && /Yıllık Profeksiyonlar/.test(focusTxt), `${label} | ${focusTxt}`);
    await btn.click();
    await page.waitForTimeout(300);
    await page.locator("[data-technique-focus='western.profections']").first().click();
    await page.waitForTimeout(800);
    const pick = page.locator("[data-testid=astro-profection-age]").first();
    await pick.waitFor({ timeout: 30000 });
    ok(`${tag} bu yıl önerildi (36)`, (await pick.inputValue()) === "36", await pick.inputValue());
    const optTxt = await pick.locator("option:checked").innerText();
    ok(`${tag} seçenek: 36 yaş · 15.07.2026 – 14.07.2027 (bu yıl)`, optTxt.trim() === "36 yaş · 15.07.2026 – 14.07.2027 (bu yıl)", optTxt);
    const rng = await page.locator("[data-testid=astro-profection-range]").first().innerText();
    ok(`${tag} aralık metni`, rng.trim() === "36 yaş profeksiyon yılı: 15.07.2026 – 14.07.2027", rng);
    const fieldBox = await page.locator("[data-testid=astro-profections-params]").first().evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, vw: document.documentElement.clientWidth, dw: document.documentElement.scrollWidth }));
    ok(`${tag} parametre alanı taşmıyor`, fieldBox.sw <= fieldBox.cw + 1 && fieldBox.dw <= fieldBox.vw + 1, JSON.stringify(fieldBox));
    await page.waitForTimeout(1500);
    ok(`${tag} plan gövdesi yalnız {age:36}`, bodies.length > 0 && bodies.every((o) => JSON.stringify(o) === JSON.stringify({ age: 36 })), JSON.stringify(bodies.slice(-2)));
    if (OUT) await page.screenshot({ path: path.join(OUT, `yeni-analiz-${tag}.png`), fullPage: false });
    await ctx.close();
  }

  // ── 2b) P2-01: danışan geçişinde profeksiyon yaşı (A→B→A, aynı doğum tarihli ikiz, elle seçim, eski istek yok)
  {
    const ilk = (await api(`/profiles?q=${encodeURIComponent("İlknur Işık")}`)).j.profiles[0];
    const twinLabel = `İkiz Sentetik ${Date.now().toString(36)}`;
    const twin = (await api("/profiles", { label: twinLabel, birthDate: "1990-07-15", birthTime: "09:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-06-ankara" })).j?.profile;
    ok("P2 hazırlık: İlknur + aynı doğum tarihli ikiz profil", !!ilk?.id && !!twin?.id, `${ilk?.id} ${twin?.id}`);
    const { ctx, page } = await newPage(browser, 1366, 768);
    const plans = [];
    const runs = [];
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    page.on("request", (r) => {
      if (r.method() !== "POST") return;
      const m = /\/api\/admin\/astroloji\/engine\/(plan|run)/.exec(r.url());
      if (!m) return;
      try {
        const b = JSON.parse(r.postData() || "{}");
        const ages = (b.selections ?? []).filter((s) => s.technique === "western.profections").map((s) => s.options?.age);
        (m[1] === "plan" ? plans : runs).push({ pid: b.profileId, ages });
      } catch {}
    });
    const pick = async (pid, q) => {
      await page.locator("[data-testid=atlas-client-trigger]").first().click();
      await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill(q);
      await page.waitForTimeout(900);
      await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
      await page.waitForTimeout(1500);
    };
    const focusProf = async () => {
      await page.locator("[data-technique-focus='western.profections']").first().click();
      await page.waitForTimeout(900);
      return page.locator("[data-testid=astro-profection-age]").first();
    };
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
    await page.locator("[data-portal=new]").first().click();
    await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await pick(pid, "Ali Örnek");
    await page.locator("button[data-technique='western.profections']").first().click();
    let sel = await focusProf();
    ok("P2-A Ali: bu yıl 36 önerildi", (await sel.inputValue()) === "36", await sel.inputValue());
    await sel.selectOption("38");
    await page.waitForTimeout(600);
    await page.locator("button[data-technique='western.natal']").first().click();
    await page.locator("[data-technique-focus='western.natal']").first().click();
    await page.waitForTimeout(900);
    sel = await focusProf();
    ok("P2-B Ali: elle 38 başka alana gidip dönünce korunur", (await sel.inputValue()) === "38", await sel.inputValue());
    await page.waitForTimeout(1500);
    ok("P2-H Ali: elle 38 plana gider", plans.some((p) => p.pid === pid && p.ages.includes(38)), JSON.stringify(plans.slice(-2)));
    await pick(ilk.id, "İlknur");
    sel = await focusProf();
    const ilkVal = await sel.inputValue();
    ok("P2-C İlknur: Ali'nin yaşı taşınmaz, İlknur'un bu yılı 41", ilkVal === "41", `${ilkVal} | ${await sel.locator("option:checked").innerText()}`);
    await page.waitForTimeout(2000);
    const ilkPlans = plans.filter((p) => p.pid === ilk.id);
    ok("P2-D İlknur planı yalnız İlknur'un yılı (41); Ali'nin 36/38'i hiçbir İlknur isteğinde yok", ilkPlans.length > 0 && ilkPlans.every((p) => p.ages.every((a) => a === 41)) && ilkPlans.some((p) => p.ages.includes(41)), JSON.stringify(ilkPlans));
    // İlknur'da elle 40 seçilir → Ali'ye dönünce İlknur'un 40'ı da 41'i de taşınmaz.
    await sel.selectOption("40");
    await page.waitForTimeout(800);
    await pick(pid, "Ali Örnek");
    sel = await focusProf();
    ok("P2-E Ali'ye dönüş: İlknur'un yaşı (40/41) taşınmaz; Ali'nin bu yılı 36", (await sel.inputValue()) === "36", await sel.inputValue());
    // İlknur'a geri dön → İlknur'un kendi elle seçimi (40) korunur, Ali'nin 36'sı taşınmaz.
    await pick(ilk.id, "İlknur");
    sel = await focusProf();
    ok("P2-E İlknur'a dönüş: Ali'nin 36'sı taşınmaz", (await sel.inputValue()) !== "36", await sel.inputValue());
    await pick(pid, "Ali Örnek");
    sel = await focusProf();
    await sel.selectOption("30");
    await page.waitForTimeout(800);
    await pick(twin.id, twinLabel);
    sel = await focusProf();
    ok("P2-F aynı doğum tarihli ikiz: Ali'nin elle 30'u taşınmaz (ikiz kendi bu yılı 36)", (await sel.inputValue()) === "36", await sel.inputValue());
    await page.waitForTimeout(1500);
    const twinPlans = plans.filter((p) => p.pid === twin.id);
    ok("P2-F ikiz planlarında 30 yok", twinPlans.every((p) => !p.ages.includes(30)), JSON.stringify(twinPlans));
    const n0 = plans.length;
    await page.waitForTimeout(5000);
    ok("P2-L boşta 5 sn yeni plan isteği yok (render/istek döngüsü yok)", plans.length === n0, `${plans.length - n0}`);
    ok("P2-L konsol hatası yok", errs.length === 0, errs.slice(0, 3).join(" || "));
    ok("P2-L kullanıcı başlatmadan çalıştırma (ücretli istek) yok", runs.length === 0, JSON.stringify(runs));
    if (OUT) await page.screenshot({ path: path.join(OUT, "p2-danisan-gecisi-1366x768.png") });
    await ctx.close();
  }

  // ── 3) Kayıtlı analiz — 5 ekran
  for (const [w, h] of VIEWS) {
    const tag = `${w}x${h}`;
    const { ctx, page } = await newPage(browser, w, h);
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${id}"]`);
    await item.waitFor({ timeout: 120000 });
    await item.click();
    const panel = page.locator('[data-testid="astro-profections-panel"]').first();
    await panel.waitFor({ timeout: 60000 });
    const txt = (sel) => page.locator(`[data-testid="${sel}"]`).first().innerText();
    ok(`${tag} profeksiyon yılı`, (await txt("astro-profections-year")).trim() === "36 yaş profeksiyon yılı · 15.07.2026 – 14.07.2027", await txt("astro-profections-year"));
    ok(`${tag} etkin ev 1. ev`, (await txt("astro-profections-house")).trim() === "1. ev");
    ok(`${tag} etkin burç Akrep`, /Akrep/.test(await txt("astro-profections-sign")));
    ok(`${tag} yönetici Mars`, /Mars/.test(await txt("astro-profections-lord")));
    ok(`${tag} yöneticinin natal konumu Boğa · 7. ev`, /Boğa · 7\. ev/.test(await txt("astro-profections-lord-natal")), await txt("astro-profections-lord-natal"));
    ok(`${tag} ev sistemi Tam Burç (Whole Sign)`, (await txt("astro-profections-house-system")).trim() === "Tam Burç (Whole Sign)");
    const m = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="astro-profections-panel"]');
      const clipped = [...root.querySelectorAll("dd, dt, h4, p, span")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible").map((el) => el.textContent.slice(0, 40));
      const r = root.getBoundingClientRect();
      return { dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, right: r.right, clipped };
    });
    ok(`${tag} yatay taşma yok`, m.dw <= m.vw + 1 && m.right <= m.vw + 1, JSON.stringify(m));
    ok(`${tag} kesik metin yok`, m.clipped.length === 0, m.clipped.join(" | "));
    const body = await page.locator("body").innerText();
    ok(`${tag} sağlayıcı anlatısı / sağlayıcı adı yok`, !body.includes("efendisi") && !/\broxy\b/i.test(body));
    ok(`${tag} Kendi Yorumum + not görünür`, body.includes("Kendi Yorumum"), "");
    if (OUT) await page.screenshot({ path: path.join(OUT, `kayitli-${tag}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log(`\nprofections-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
