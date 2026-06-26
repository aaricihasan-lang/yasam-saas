/**
 * verify-biyoenerji.mjs
 * Enerji & Beden > Biyoenerji modülü uçtan uca son-kullanıcı testi.
 *   Faz A  login + session storageState
 *   Faz B  6 alt modülde CRUD (create + büyük-metin modal + edit + arama + delete-throwaway)
 *   Faz C  responsive/görsel denetim (taşma, font, dokunma, console, screenshot)
 *   Faz D  web↔mobil senkron
 *   Faz E  JSON özet
 * Kalıcı kayıtlar SİLİNMEZ (yalnız delete-throwaway silinir). BASE_URL ile yerel/canlı.
 */
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "https://www.yasamsistemi.com";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const ROOT = "scripts/screenshots/verify-bio";
mkdirSync(ROOT, { recursive: true });
const runTag = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");

const BIO = "/dashboard/biyoenerji";
const MODULES = [
  { key: "seanslar",            route: `${BIO}/seanslar`,            label: "Biyoenerji Seansları", detail: false },
  { key: "enerji-bedenleri",    route: `${BIO}/enerji-bedenleri`,    label: "Enerji Bedenleri",     detail: false },
  { key: "bilincalti-sebepleri",route: `${BIO}/bilincalti-sebepleri`,label: "Bilinçaltı Sebepleri", detail: true },
  { key: "imajinasyonlar",      route: `${BIO}/imajinasyonlar`,      label: "İmajinasyonlar",       detail: true },
  { key: "sembol-dili",         route: `${BIO}/sembol-dili`,         label: "Sembol Dili",          detail: true },
  { key: "cakralar",            route: `${BIO}/cakralar`,            label: "Çakralar",             detail: true },
];

const findings = [];
const add = (sev, area, device, problem, expected, fix) => findings.push({ sev, area, device, problem, expected, fix });
const log = (...a) => console.log(...a);

const AUDIT_FN = `() => {
  const vw = window.innerWidth;
  const docW = document.documentElement.scrollWidth, bodyW = document.body.scrollWidth;
  const overflowX = Math.max(docW, bodyW) > vw + 1;
  const all = Array.from(document.querySelectorAll('body *'));
  const isVisible = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
  const offenders = [];
  for (const el of all) { if (!isVisible(el)) continue; const r = el.getBoundingClientRect();
    if (r.right > vw+2 || r.left < -2) { offenders.push({ tag: el.tagName.toLowerCase(), right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width), txt: (el.textContent||'').trim().slice(0,40) }); } }
  offenders.sort((a,b)=> b.right-a.right);
  const tiny = [];
  for (const el of all) { if (!isVisible(el)) continue;
    const hasText = Array.from(el.childNodes).some(n=>n.nodeType===3 && n.textContent.trim().length>1); if (!hasText) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) tiny.push({ fs: Math.round(fs*10)/10, txt: el.textContent.trim().slice(0,30) }); }
  const small = [];
  for (const el of all) { if (!['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(el.tagName)) continue; if (!isVisible(el)) continue; if (el.type==='hidden') continue;
    const r = el.getBoundingClientRect(); let h=r.height,w=r.width; const lab=el.closest('label'); if (lab){const lr=lab.getBoundingClientRect();h=Math.max(h,lr.height);w=Math.max(w,lr.width);}
    if (h<36||w<28) small.push({ tag: el.tagName.toLowerCase(), h: Math.round(h), w: Math.round(w), txt: (el.textContent||el.getAttribute('placeholder')||el.type||'').trim().slice(0,24) }); }
  return { vw, docW, overflowX, offenders: offenders.slice(0,6), tinyFonts: { lt12: tiny.length, lt10: tiny.filter(t=>t.fs<10).length, samples: tiny.slice(0,6) }, smallTargets: { count: small.length, samples: small.slice(0,8) } };
}`;

function attachErrors(page, bucket, getLabel) {
  page.on("console", (m) => { if (m.type() === "error") bucket.push(`[${getLabel()}] ${m.text().slice(0,180)}`); });
  page.on("pageerror", (e) => bucket.push(`[${getLabel()}] pageerror: ${e.message.slice(0,180)}`));
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && /\/api\/|supabase/.test(r.url())) bucket.push(`[${getLabel()}] HTTP ${s} ${r.request().method()} ${r.url().replace(BASE,"").slice(0,120)}`); });
}

async function auditPage(page, label, vpKey, errBucket) {
  const before = errBucket.length;
  let res = null;
  try { res = await page.evaluate(eval("(" + AUDIT_FN + ")")); } catch (e) { res = { error: e.message }; }
  const dir = `${ROOT}/${vpKey}`; mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${label}.png`, fullPage: true }).catch(() => {});
  return { ...res, consoleErrors: errBucket.slice(before) };
}

async function waitListLoaded(page) {
  await page.waitForFunction(() => /Kayıtlar\s*\(\d+\)/.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ headless: true });
let storageState = null;
const summary = { phaseB: {}, phaseC: {}, phaseD: {} };

try {
  // ═══ FAZ A: LOGIN ═══
  log("\n═══ FAZ A: Login ═══");
  const lc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await lc.newPage();
  await lp.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await lp.waitForTimeout(900);
  await lp.getByRole("button", { name: "Giriş Yap" }).first().click({ timeout: 15000 });
  await lp.waitForTimeout(400);
  await lp.locator('input[type="email"]').fill(EMAIL);
  await lp.locator('input[type="password"]').fill(PASS);
  await lp.getByRole("button", { name: /Uzman Paneline Gir/i }).click();
  await lp.waitForFunction(() => !!localStorage.getItem("yasam_session_token"), { timeout: 30000 }).catch(() => {});
  await lp.waitForTimeout(1500);
  log("session token:", await lp.evaluate(() => !!localStorage.getItem("yasam_session_token")));
  storageState = await lc.storageState();
  await lc.close();

  // ═══ FAZ B: CRUD (her modül) ═══
  log("\n═══ FAZ B: CRUD ═══");
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const dErr = []; let curLabel = "crud";
  const dp = await deskCtx.newPage();
  attachErrors(dp, dErr, () => curLabel);

  async function openCreateModal(mod) {
    curLabel = "create:" + mod.key;
    await dp.goto(BASE + mod.route, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitListLoaded(dp);
    await dp.getByRole("button", { name: /Yeni Kayıt/i }).first().click({ timeout: 10000 });
    await dp.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await dp.waitForTimeout(400);
  }

  // her modülde create — TÜM metin inputlarını doldur (zorunlu alan modaldan modala değişir:
  // bazı modallarda ilk input source_uid, başlık ikinci). Başarı success toast ("oluşturuldu") ile doğrulanır;
  // liste paginated + title-sıralı olduğundan yeni kayıt 1. sayfada görünmeyebilir.
  for (const mod of MODULES) {
    const name = `BIO ${mod.label} ${runTag}`;
    let ok = false, err = "";
    try {
      await openCreateModal(mod);
      const dlg = dp.locator('[role="dialog"]').last();
      const inputs = dlg.locator('input:not([type="checkbox"]):not([type="radio"])');
      const n = await inputs.count();
      for (let i = 0; i < n; i++) await inputs.nth(i).fill(name).catch(() => {});
      await dlg.getByRole("button", { name: /^Kaydet$/ }).click();
      await dp.waitForFunction(() => /oluşturuldu/i.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
      ok = /oluşturuldu/i.test(await dp.locator("body").innerText());
    } catch (e) { err = e.message.slice(0, 120); }
    summary.phaseB[mod.key] = { create: ok, err };
    log(`  ${ok ? "✅" : "❌"} create ${mod.key}${err ? " — " + err : ""}`);
    if (!ok) add("Kritik", `CRUD/${mod.key}`, "Web", `Kayıt oluşturulamadı${err ? " ("+err+")" : ""}`, "Kayıt anında listede", "supabase insert / RLS / modal");
  }

  // seanslar DEEP: büyük metin modal (uzun + TR + emoji), edit, arama, delete-throwaway
  log("  — seanslar deep —");
  const deep = { largeText: false, edit: false, search: false, del: false };
  try {
    // büyük metin modal ile içerik
    await openCreateModal(MODULES[0]);
    let dlg = dp.locator('[role="dialog"]').last();
    const deepName = `BIO Deep ${runTag}`;
    await dlg.locator("input").first().fill(deepName);
    // içerik textarea (readOnly preview) tıkla → LargeTextModal
    await dlg.locator("textarea").first().click();
    await dp.waitForTimeout(500);
    const big = dp.locator('[role="dialog"]').last(); // LargeTextModal
    const longText = "İçsel denge çalışması 🌿✨. İmajinasyon: ışık huzmesi. " + "Çok satırlı uzun not. ".repeat(40) + "\nİkinci satır\nÜçüncü satır 🔥";
    await big.locator("textarea").first().fill(longText);
    await big.getByRole("button", { name: /Kaydet ve Kapat/i }).click();
    await dp.waitForTimeout(500);
    dlg = dp.locator('[role="dialog"]').last();
    await dlg.getByRole("button", { name: /^Kaydet$/ }).click();
    await dp.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 12000 }).catch(() => {});
    await dp.waitForFunction((nm) => document.body.innerText.includes(nm), deepName, { timeout: 10000 }).catch(() => {});
    deep.largeText = (await dp.locator("body").innerText()).includes(deepName);

    // arama: deepName başlıkta ara
    await dp.locator('input[type="search"]').first().fill(deepName);
    await dp.waitForTimeout(800);
    deep.search = (await dp.locator("body").innerText()).includes(deepName);
    await dp.locator('input[type="search"]').first().fill("");
    await dp.waitForTimeout(400);

    // edit: kaydı seç → Güncelle
    await dp.getByRole("button", { name: new RegExp(deepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    await dp.waitForTimeout(500);
    await dp.getByRole("button", { name: /^Güncelle$/ }).first().click();
    await dp.waitForSelector('[role="dialog"]', { timeout: 8000 });
    dlg = dp.locator('[role="dialog"]').last();
    await dlg.locator("input").first().fill(`${deepName} (düzenlendi)`);
    await dlg.getByRole("button", { name: /^Güncelle$/ }).click();
    await dp.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 12000 }).catch(() => {});
    await dp.waitForFunction(() => document.body.innerText.includes("(düzenlendi)"), { timeout: 10000 }).catch(() => {});
    deep.edit = (await dp.locator("body").innerText()).includes("(düzenlendi)");

    // delete-throwaway: yeni kayıt oluştur ve sil
    await openCreateModal(MODULES[0]);
    dlg = dp.locator('[role="dialog"]').last();
    const delName = `BIO SilTest ${runTag}`;
    await dlg.locator("input").first().fill(delName);
    await dlg.getByRole("button", { name: /^Kaydet$/ }).click();
    await dp.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 12000 }).catch(() => {});
    await dp.waitForFunction((nm) => document.body.innerText.includes(nm), delName, { timeout: 10000 }).catch(() => {});
    await dp.getByRole("button", { name: new RegExp(delName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    await dp.waitForTimeout(400);
    await dp.getByRole("button", { name: /^Sil$/ }).first().click();
    await dp.waitForTimeout(400);
    await dp.getByRole("button", { name: /Evet, sil/i }).click();
    await dp.waitForFunction((nm) => !document.body.innerText.includes(nm), delName, { timeout: 10000 }).catch(() => {});
    deep.del = !(await dp.locator("body").innerText()).includes(delName);
  } catch (e) { log("  ⚠️ deep hata:", e.message.slice(0, 140)); }
  summary.phaseB.deep = deep;
  log(`  largeText=${deep.largeText} edit=${deep.edit} arama=${deep.search} sil=${deep.del}`);
  if (!deep.largeText) add("Orta", "Seanslar/BüyükMetin", "Web", "Büyük metin modalı ile içerik kaydedilemedi", "Uzun/TR/emoji metin kaydedilmeli", "LargeTextModal akışı");
  if (!deep.edit) add("Orta", "Seanslar/Düzenleme", "Web", "Güncelleme çalışmadı", "Kayıt güncellenmeli", "handleGuncelle");
  if (!deep.search) add("Orta", "Seanslar/Arama", "Web", "Arama çalışmadı", "Başlıkta filtre", "filteredRows");
  if (!deep.del) add("Orta", "Seanslar/Silme", "Web", "Silme çalışmadı", "Kayıt silinmeli", "executeDelete");

  await dp.close(); await deskCtx.close();

  // ═══ FAZ C: RESPONSIVE ═══
  log("\n═══ FAZ C: Responsive denetim ═══");
  const viewports = [
    { key: "laptop", label: "Laptop 1366×768", opts: { viewport: { width: 1366, height: 768 } } },
    { key: "buyuk", label: "Büyük 1920×1080", opts: { viewport: { width: 1920, height: 1080 } } },
    { key: "tablet", label: "Tablet 768×1024", opts: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { key: "mobil", label: "Mobil 390×844", opts: { ...devices["iPhone 13"] } },
    { key: "pwa", label: "PWA 393×852", opts: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ];
  const corePages = [{ key: "ana", url: BIO }, ...MODULES.map((m) => ({ key: m.key, url: m.route }))];

  for (const vp of viewports) {
    const ctx = await browser.newContext({ ...vp.opts, storageState });
    const errBucket = []; let lbl = vp.key;
    const pg = await ctx.newPage();
    attachErrors(pg, errBucket, () => lbl);
    summary.phaseC[vp.key] = {};
    for (const pd of corePages) {
      lbl = `${vp.key}:${pd.key}`;
      try { await pg.goto(BASE + pd.url, { waitUntil: "domcontentloaded", timeout: 35000 }); await pg.waitForTimeout(2600); } catch {}
      const r = await auditPage(pg, pd.key, vp.key, errBucket);
      summary.phaseC[vp.key][pd.key] = r;
      const isMobile = ["mobil", "pwa", "tablet"].includes(vp.key);
      log(`  ${vp.key}/${pd.key}: overflowX=${r.overflowX} (doc${r.docW}/vw${r.vw}) font<12=${r.tinyFonts?.lt12} <10=${r.tinyFonts?.lt10} tap=${r.smallTargets?.count} err=${r.consoleErrors?.length}`);
      if (r.overflowX) add("Orta", `${pd.key} taşma`, vp.label, `Yatay taşma doc=${r.docW}>vw=${r.vw}; en sağ <${r.offenders?.[0]?.tag} "${r.offenders?.[0]?.txt}">`, "Taşma yok", "overflow/genişlik");
      if (r.tinyFonts?.lt10 > 0) add("Küçük", `${pd.key} font`, vp.label, `${r.tinyFonts.lt10}× <10px (örn "${r.tinyFonts.samples?.[0]?.txt}" ${r.tinyFonts.samples?.[0]?.fs}px)`, "≥11px", "font büyüt");
      if (isMobile && r.smallTargets?.count > 0) add("Küçük", `${pd.key} dokunma`, vp.label, `${r.smallTargets.count}× <36px (örn "${r.smallTargets.samples?.[0]?.txt}" ${r.smallTargets.samples?.[0]?.h}px)`, "≥40px", "min-h/label");
      if (r.consoleErrors?.length) r.consoleErrors.forEach((ce) => add("Kritik", `${pd.key} console`, vp.label, ce, "Console temiz", "kaynağı düzelt"));
    }
    await pg.close(); await ctx.close();
  }

  // ═══ FAZ D: SENKRON ═══
  log("\n═══ FAZ D: Web↔Mobil senkron ═══");
  const syncName = `BIO Senkron ${runTag}`;
  const mobCtx = await browser.newContext({ ...devices["iPhone 13"], storageState });
  const mp = await mobCtx.newPage();
  await mp.goto(BASE + MODULES[0].route, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitListLoaded(mp);
  await mp.getByRole("button", { name: /Yeni Kayıt/i }).first().click();
  await mp.waitForSelector('[role="dialog"]', { timeout: 8000 });
  await mp.locator('[role="dialog"]').last().locator("input").first().fill(syncName);
  await mp.locator('[role="dialog"]').last().getByRole("button", { name: /^Kaydet$/ }).click();
  await mp.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 12000 }).catch(() => {});
  await mp.waitForFunction((nm) => document.body.innerText.includes(nm), syncName, { timeout: 10000 }).catch(() => {});
  const mobOk = (await mp.locator("body").innerText()).includes(syncName);

  const d2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const d2p = await d2.newPage();
  await d2p.goto(BASE + MODULES[0].route, { waitUntil: "domcontentloaded", timeout: 30000 });
  await d2p.waitForFunction((nm) => /Kayıtlar\s*\(\d+\)/.test(document.body.innerText) && document.body.innerText.includes(nm), syncName, { timeout: 15000 }).catch(() => {});
  const webSeesMob = (await d2p.locator("body").innerText()).includes(syncName);
  log(`  mobil-kayit=${mobOk} | web-görüyor=${webSeesMob}`);
  summary.phaseD = { mobOk, webSeesMob };
  if (!webSeesMob) add("Kritik", "Senkron", "Web↔Mobil", "Mobil kayıt web'de görünmüyor", "Anında senkron", "aynı DB/tenant");
  await mp.close(); await mobCtx.close(); await d2p.close(); await d2.close();

  // ═══ FAZ E ═══
  writeFileSync(`${ROOT}/findings.json`, JSON.stringify({ runTag, findings, summary }, null, 2));
  log("\n═══ ÖZET ═══");
  const k = findings.filter(f=>f.sev==="Kritik").length, o = findings.filter(f=>f.sev==="Orta").length, kk = findings.filter(f=>f.sev==="Küçük").length;
  log(`Bulgu: ${findings.length} | Kritik ${k} Orta ${o} Küçük ${kk}`);
  findings.slice(0, 40).forEach((f, i) => log(`  ${i+1}. [${f.sev}] (${f.device}) ${f.area}: ${f.problem}`));
  log("\nJSON: " + ROOT + "/findings.json");
} catch (e) {
  log("FATAL:", e.message, (e.stack||"").split("\n").slice(0,3).join(" | "));
} finally {
  await browser.close();
}
