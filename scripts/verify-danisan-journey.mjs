/**
 * verify-danisan-journey.mjs
 * Danışan Yolculuğu modülü uçtan uca son-kullanıcı testi (canlı: www.yasamsistemi.com).
 *   Faz A  login (gerçek hesap, www) + session storageState
 *   Faz B  veri girişi: çeşitli danışanlar + burç doğrulama + randevu
 *   Faz C  çift-context (web↔mobil cihaz) senkron
 *   Faz D  5 viewport responsive/görsel denetim (taşma, font, dokunma hedefi, screenshot)
 *   Faz E  JSON özet
 * Kayıtlar SİLİNMEZ. node scripts/verify-danisan-journey.mjs
 */
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "https://www.yasamsistemi.com";
const EMAIL = "esra@outlook.com";
const PASS = "123456";
const ROOT = "scripts/screenshots/verify-dy";
mkdirSync(ROOT, { recursive: true });
const runTag = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "").replace(/(\d{4})(\d{4})/, "$1-$2");

const findings = [];
const add = (sev, area, device, problem, expected, fix) =>
  findings.push({ sev, area, device, problem, expected, fix });
const log = (...a) => console.log(...a);

// ── Sayfa içi denetim fonksiyonu (browser context'te çalışır) ────────────────
const AUDIT_FN = `() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const docW = document.documentElement.scrollWidth;
  const bodyW = document.body.scrollWidth;
  const overflowX = Math.max(docW, bodyW) > vw + 1;
  const all = Array.from(document.querySelectorAll('body *'));
  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Yatay taşan görünür elemanlar
  const offenders = [];
  for (const el of all) {
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 || r.left < -2) {
      const cls = (el.className && el.className.toString) ? el.className.toString().slice(0, 50) : '';
      offenders.push({ tag: el.tagName.toLowerCase(), cls, right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width), txt: (el.textContent||'').trim().slice(0,40) });
    }
  }
  offenders.sort((a,b)=> b.right - a.right);
  // Küçük font (doğrudan metin taşıyan yaprak elemanlar)
  const tiny = [];
  for (const el of all) {
    if (!isVisible(el)) continue;
    const hasDirectText = Array.from(el.childNodes).some(n => n.nodeType===3 && n.textContent.trim().length>1);
    if (!hasDirectText) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) tiny.push({ fs: Math.round(fs*10)/10, txt: el.textContent.trim().slice(0,30) });
  }
  const lt12 = tiny.length;
  const lt10 = tiny.filter(t=>t.fs < 10).length;
  // Dokunma hedefleri (buton/link/input/select)
  const small = [];
  for (const el of all) {
    if (!['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(el.tagName)) continue;
    if (!isVisible(el)) continue;
    if (el.type === 'hidden') continue;
    const r = el.getBoundingClientRect();
    let h = r.height, w = r.width;
    // checkbox/radio: gerçek dokunma alanı sarmalayan <label>'dır
    const lab = el.closest('label');
    if (lab) { const lr = lab.getBoundingClientRect(); h = Math.max(h, lr.height); w = Math.max(w, lr.width); }
    if (h < 36 || w < 28) {
      small.push({ tag: el.tagName.toLowerCase(), h: Math.round(h), w: Math.round(w), txt: (el.textContent||el.getAttribute('placeholder')||el.type||'').trim().slice(0,24) });
    }
  }
  return {
    vw, vh, docW, bodyW, overflowX,
    offenders: offenders.slice(0, 6),
    tinyFonts: { lt12, lt10, samples: tiny.slice(0, 8) },
    smallTargets: { count: small.length, samples: small.slice(0, 10) },
  };
}`;

async function auditPage(page, label, vpKey, errBucket) {
  const before = errBucket.length;
  let res = null;
  try {
    res = await page.evaluate(eval("(" + AUDIT_FN + ")"));
  } catch (e) { res = { error: e.message }; }
  const dir = `${ROOT}/${vpKey}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${label}.png`, fullPage: true }).catch(() => {});
  const errs = errBucket.slice(before);
  return { ...res, consoleErrors: errs };
}

function attachErrors(page, bucket, getLabel) {
  page.on("console", (m) => { if (m.type() === "error") bucket.push(`[${getLabel()}] ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => bucket.push(`[${getLabel()}] pageerror: ${e.message.slice(0, 160)}`));
  page.on("response", (r) => {
    const s = r.status();
    if (s >= 400 && /\/api\//.test(r.url())) bucket.push(`[${getLabel()}] HTTP ${s} ${r.request().method()} ${r.url().replace(BASE, "")}`);
  });
}

const browser = await chromium.launch({ headless: true });
let storageState = null;
let firstClientId = null;
const summary = { phaseB: [], phaseC: {}, phaseD: {} };

try {
  // ═══ FAZ A: LOGIN ═══
  log("\n═══ FAZ A: Login (www) ═══");
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await loginCtx.newPage();
  await lp.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await lp.waitForTimeout(1000);
  await lp.getByRole("button", { name: "Giriş Yap" }).first().click({ timeout: 15000 });
  await lp.waitForTimeout(400);
  await lp.locator('input[type="email"]').fill(EMAIL);
  await lp.locator('input[type="password"]').fill(PASS);
  await lp.getByRole("button", { name: /Uzman Paneline Gir/i }).click();
  await lp.waitForFunction(() => !!localStorage.getItem("yasam_session_token"), { timeout: 30000 })
    .catch(() => log("⚠️ session token timeout"));
  await lp.waitForTimeout(2000);
  const tokOk = await lp.evaluate(() => !!localStorage.getItem("yasam_session_token"));
  log("session token kaydedildi:", tokOk);
  storageState = await loginCtx.storageState();

  // mevcut danışan id (detay denetimi için)
  firstClientId = await lp.evaluate(async () => {
    const u = JSON.parse(localStorage.getItem("yasam_user"));
    const t = localStorage.getItem("yasam_session_token");
    const r = await fetch("/api/clients", { headers: { "x-user-id": u.id, "x-session-token": t } });
    const j = await r.json();
    return (j.clients && j.clients[0] && j.clients[0].id) || null;
  });
  await loginCtx.close();
  if (!tokOk) { add("Kritik", "Login", "Tümü", "Login sonrası session token oluşmadı", "Token kaydedilmeli", "session API/redirect kontrolü"); }

  // ═══ FAZ B: VERİ GİRİŞİ (desktop) ═══
  log("\n═══ FAZ B: Veri girişi + burç + randevu ═══");
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const dErr = [];
  let curLabel = "kayit";
  const dp = await deskCtx.newPage();
  attachErrors(dp, dErr, () => curLabel);

  async function createClient(c) {
    curLabel = "kayit:" + c.ad;
    await dp.goto(BASE + "/danisan-yolculugu/kayit", { waitUntil: "domcontentloaded", timeout: 30000 });
    await dp.waitForTimeout(1200);
    const inputs = dp.locator('section input[type="text"], section input:not([type])');
    // Alanları label sırasına göre doldur: Ad, Soyad, Telefon
    await dp.getByPlaceholder("Ad", { exact: true }).fill(c.ad);
    await dp.getByPlaceholder("Soyad", { exact: true }).fill(c.soyad);
    if (c.tel) await dp.getByPlaceholder("05xx xxx xx xx").fill(c.tel);
    if (c.dogum) await dp.getByPlaceholder("GG/AA/YYYY").fill(c.dogum);
    await dp.waitForTimeout(300);
    // Burç otomatik değer
    let burc = "";
    try {
      burc = await dp.locator('input[disabled]').first().inputValue();
    } catch {}
    // Kaydet
    await dp.getByRole("button", { name: /Danışanı Kaydet/i }).click();
    await dp.waitForTimeout(800);
    // Duplicate uyarısı çıkarsa "Yine de Kaydet"
    const dup = dp.getByRole("button", { name: /Yine de Kaydet/i });
    if (await dup.isVisible().catch(() => false)) {
      await dup.click();
      await dp.waitForTimeout(800);
    }
    // Liste'ye yönlenmeyi bekle
    await dp.waitForURL(/\/danisan-yolculugu\/liste/, { timeout: 15000 }).catch(() => {});
    // Liste async fetch'i bitip kayıt görünene kadar bekle (yanlış-pozitif önleme)
    await dp.waitForFunction((nm) => {
      const t = document.body.innerText;
      return /Kayıtlı Danışanlar\s*\(\d+\)/.test(t) && t.includes(nm);
    }, c.ad, { timeout: 15000 }).catch(() => {});
    const onListe = /\/liste/.test(dp.url());
    const present = (await dp.locator("body").innerText()).includes(c.ad);
    return { ad: c.ad, soyad: c.soyad, burc, expectBurc: c.expectBurc, burcOk: !c.expectBurc || burc === c.expectBurc, savedRedirect: onListe, visibleInList: present };
  }

  const clients = [
    { ad: "Ali", soyad: "Veli", tel: "0532 111 22 33", dogum: "25/04/1990", expectBurc: "Boğa" },
    { ad: "Çiğdem", soyad: "Şahinoğlu", tel: "0543 998 77 66", dogum: "10/08/1985", expectBurc: "Aslan" },
    { ad: "Abdülmecidşerafettin", soyad: "Hacımehmetoğullarındanırmakzade", tel: "0533 444 55 66 / dahili 1290", dogum: "" },
    { ad: "Burak", soyad: `Randevulu ${runTag}`, tel: "0535 222 33 44", dogum: "03/12/1992", expectBurc: "Yay" },
  ];
  for (const c of clients) {
    const r = await createClient(c);
    summary.phaseB.push(r);
    log(`  ${r.visibleInList ? "✅" : "❌"} ${r.ad} ${r.soyad} | burç=${r.burc||"-"} ${r.expectBurc ? (r.burcOk ? "(doğru)" : "(BEKLENEN " + r.expectBurc + ")") : ""} | liste=${r.visibleInList}`);
    if (r.expectBurc && !r.burcOk) add("Orta", "Kayıt/Burç", "Web", `Burç hesabı yanlış: ${r.ad} → ${r.burc}`, `${r.expectBurc}`, "burcHesapla sınır kontrolü");
    if (!r.visibleInList) add("Kritik", "Kayıt", "Web", `${r.ad} kayıt sonrası listede görünmüyor`, "Kayıt anında listede", "POST/GET clients + redirect");
  }

  // Randevu oluştur (Burak için) — randevulu danışan + tarih hesabı
  curLabel = "ajanda";
  await dp.goto(BASE + "/dashboard/ajanda", { waitUntil: "domcontentloaded", timeout: 30000 });
  await dp.waitForTimeout(2500);
  let apptOk = false;
  try {
    await dp.getByRole("button", { name: /Yeni Randevu Ekle/i }).click();
    await dp.waitForTimeout(500);
    await dp.getByRole("button", { name: /Kayıtlı Danışan/i }).click();
    await dp.waitForTimeout(300);
    // Danışan seç (Burak)
    const sel = dp.locator("select").first();
    await sel.selectOption({ label: `Burak Randevulu ${runTag}` }).catch(async () => {
      // label tam eşleşmezse içeren option
      const opts = await sel.locator("option").allTextContents();
      const idx = opts.findIndex((o) => o.includes("Burak Randevulu"));
      if (idx >= 0) await sel.selectOption({ index: idx });
    });
    await dp.getByPlaceholder(/Seans, Toplantı/i).fill(`Test Seansı ${runTag}`);
    // gelecek tarih: bugünden +7 gün
    const d = new Date(); d.setDate(d.getDate() + 7);
    const fdate = d.toISOString().slice(0, 10);
    await dp.locator('input[type="date"]').fill(fdate);
    await dp.locator('input[type="time"]').fill("14:30");
    await dp.getByPlaceholder(/İsteğe bağlı notlar/i).fill("Otomatik test randevusu — Türkçe karakter: ışĞüöç. " + "Uzun not ".repeat(15));
    await dp.getByRole("button", { name: /Randevu Kaydet/i }).click();
    await dp.waitForFunction((tag) => document.body.innerText.includes(`Test Seansı ${tag}`), runTag, { timeout: 15000 }).catch(() => {});
    apptOk = (await dp.locator("body").innerText()).includes(`Test Seansı ${runTag}`);
    log(`  ${apptOk ? "✅" : "❌"} Randevu oluşturuldu (Burak, ${fdate} 14:30)`);
  } catch (e) { log("  ⚠️ Randevu oluşturma hatası:", e.message.slice(0, 120)); }
  summary.phaseB.push({ appointment: apptOk });
  if (!apptOk) add("Orta", "Ajanda", "Web", "Randevu oluşturulamadı/görünmedi", "Randevu listede görünmeli", "ajanda createAppointment");

  // Ana sayfa stat doğrulaması (randevu sonrası)
  curLabel = "ana";
  await dp.goto(BASE + "/danisan-yolculugu", { waitUntil: "domcontentloaded", timeout: 30000 });
  await dp.waitForTimeout(3000);
  const anaText = await dp.locator("body").innerText();
  const totalMatch = anaText.match(/Toplam Danışan/);
  summary.phaseB.push({ anaLoaded: !!totalMatch });

  await dp.close();
  await deskCtx.close();

  // ═══ FAZ C: SENKRON (cihaz↔cihaz) ═══
  log("\n═══ FAZ C: Web↔Mobil senkron ═══");
  // Mobil context'te yeni kayıt
  const mobCtx = await browser.newContext({ ...devices["iPhone 13"], storageState });
  const mErr = []; let mLabel = "mobil-kayit";
  const mp = await mobCtx.newPage();
  attachErrors(mp, mErr, () => mLabel);
  const mobName = { ad: "Mobil", soyad: `Senkron ${runTag}`, tel: "0500 100 20 30", dogum: "01/01/1995", expectBurc: "Oğlak" };
  await mp.goto(BASE + "/danisan-yolculugu/kayit", { waitUntil: "domcontentloaded", timeout: 30000 });
  await mp.waitForTimeout(1500);
  await mp.getByPlaceholder("Ad", { exact: true }).fill(mobName.ad);
  await mp.getByPlaceholder("Soyad", { exact: true }).fill(mobName.soyad);
  await mp.getByPlaceholder("05xx xxx xx xx").fill(mobName.tel);
  await mp.getByPlaceholder("GG/AA/YYYY").fill(mobName.dogum);
  await mp.waitForTimeout(300);
  const mobBurc = await mp.locator('input[disabled]').first().inputValue().catch(() => "");
  await mp.getByRole("button", { name: /Danışanı Kaydet/i }).click();
  await mp.waitForTimeout(800);
  const mdup = mp.getByRole("button", { name: /Yine de Kaydet/i });
  if (await mdup.isVisible().catch(() => false)) { await mdup.click(); await mp.waitForTimeout(800); }
  await mp.waitForURL(/\/liste/, { timeout: 15000 }).catch(() => {});
  await mp.waitForFunction((nm) => {
    const t = document.body.innerText;
    return /Kayıtlı Danışanlar\s*\(\d+\)/.test(t) && t.includes(nm);
  }, `Senkron ${runTag}`, { timeout: 15000 }).catch(() => {});
  const mobInList = (await mp.locator("body").innerText()).includes(`Senkron ${runTag}`);
  log(`  Mobil kayıt: ${mobName.ad} ${mobName.soyad} | burç=${mobBurc} | mobil-listede=${mobInList}`);

  // Yeni desktop context (ayrı "cihaz") — mobil kaydı görüyor mu?
  const desk2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const d2 = await desk2.newPage();
  await d2.goto(BASE + "/danisan-yolculugu/liste", { waitUntil: "domcontentloaded", timeout: 30000 });
  await d2.waitForFunction((nm) => {
    const t = document.body.innerText;
    return /Kayıtlı Danışanlar\s*\(\d+\)/.test(t) && t.includes(nm);
  }, `Senkron ${runTag}`, { timeout: 15000 }).catch(() => {});
  const webSeesMobile = (await d2.locator("body").innerText()).includes(`Senkron ${runTag}`);
  log(`  ${webSeesMobile ? "✅" : "❌"} Web (ayrı cihaz) mobil kaydını görüyor`);

  // Desktop'tan kayıt → mobilde görünüyor mu?
  await d2.goto(BASE + "/danisan-yolculugu/kayit", { waitUntil: "domcontentloaded", timeout: 30000 });
  await d2.waitForTimeout(1200);
  await d2.getByPlaceholder("Ad", { exact: true }).fill("Web");
  await d2.getByPlaceholder("Soyad", { exact: true }).fill(`Senkron ${runTag}`);
  await d2.getByPlaceholder("05xx xxx xx xx").fill("0500 900 80 70");
  await d2.getByRole("button", { name: /Danışanı Kaydet/i }).click();
  await d2.waitForTimeout(800);
  const d2dup = d2.getByRole("button", { name: /Yine de Kaydet/i });
  if (await d2dup.isVisible().catch(() => false)) { await d2dup.click(); await d2.waitForTimeout(800); }
  await d2.waitForURL(/\/liste/, { timeout: 15000 }).catch(() => {});
  await d2.waitForTimeout(1000);

  await mp.goto(BASE + "/danisan-yolculugu/liste", { waitUntil: "domcontentloaded", timeout: 30000 });
  await mp.waitForFunction((nm) => {
    const t = document.body.innerText;
    return /Kayıtlı Danışanlar\s*\(\d+\)/.test(t) && t.includes(nm);
  }, `Web Senkron ${runTag}`, { timeout: 15000 }).catch(() => {});
  const mobSeesWeb = (await mp.locator("body").innerText()).includes(`Web Senkron ${runTag}`);
  log(`  ${mobSeesWeb ? "✅" : "❌"} Mobil web'den eklenen kaydı görüyor`);

  summary.phaseC = { mobInList, webSeesMobile, mobSeesWeb, mobBurc, mobBurcOk: mobBurc === mobName.expectBurc };
  if (!webSeesMobile) add("Kritik", "Senkron", "Web↔Mobil", "Mobil kayıt web'de görünmüyor", "Anında senkron", "API/tenant aynı DB");
  if (!mobSeesWeb) add("Kritik", "Senkron", "Web↔Mobil", "Web kaydı mobilde görünmüyor", "Anında senkron", "API/tenant aynı DB");
  await mp.close(); await mobCtx.close();
  await d2.close(); await desk2.close();
  summary.phaseC.consoleErrorsMobil = mErr.slice(0, 8);

  // ═══ FAZ D: RESPONSIVE DENETIM ═══
  log("\n═══ FAZ D: 5 viewport responsive denetim ═══");
  const viewports = [
    { key: "laptop", label: "Laptop 1366×768", opts: { viewport: { width: 1366, height: 768 } } },
    { key: "buyuk", label: "Büyük masaüstü 1920×1080", opts: { viewport: { width: 1920, height: 1080 } } },
    { key: "tablet", label: "Tablet 768×1024", opts: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { key: "mobil", label: "Mobil web 390×844", opts: { ...devices["iPhone 13"] } },
    { key: "pwa", label: "Mobil/PWA 393×852", opts: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ];
  const pages = [
    { key: "ana", url: "/danisan-yolculugu" },
    { key: "kayit", url: "/danisan-yolculugu/kayit" },
    { key: "liste", url: "/danisan-yolculugu/liste" },
    { key: "ajanda", url: "/dashboard/ajanda" },
  ];
  if (firstClientId) pages.push({ key: "detay", url: `/dashboard/clients/${firstClientId}` });

  for (const vp of viewports) {
    const ctx = await browser.newContext({ ...vp.opts, storageState });
    const errBucket = []; let lbl = vp.key;
    const pg = await ctx.newPage();
    attachErrors(pg, errBucket, () => lbl);
    summary.phaseD[vp.key] = {};
    for (const pageDef of pages) {
      lbl = `${vp.key}:${pageDef.key}`;
      try {
        await pg.goto(BASE + pageDef.url, { waitUntil: "domcontentloaded", timeout: 35000 });
        await pg.waitForTimeout(2800);
      } catch (e) { log(`  ⚠️ ${lbl} goto: ${e.message.slice(0,80)}`); }
      const r = await auditPage(pg, pageDef.key, vp.key, errBucket);
      summary.phaseD[vp.key][pageDef.key] = r;
      const isMobile = ["mobil", "pwa", "tablet"].includes(vp.key);
      const flagOv = r.overflowX;
      const flagTiny = (r.tinyFonts && r.tinyFonts.lt10 > 0);
      const flagTap = isMobile && r.smallTargets && r.smallTargets.count > 0;
      log(`  ${vp.key}/${pageDef.key}: overflowX=${r.overflowX} (doc${r.docW}/vw${r.vw}) tinyFont<12=${r.tinyFonts?.lt12} <10=${r.tinyFonts?.lt10} smallTap=${r.smallTargets?.count} err=${r.consoleErrors?.length}`);
      if (flagOv) add("Orta", `${pageDef.key} taşma`, vp.label, `Yatay taşma: doc=${r.docW}px > viewport=${r.vw}px. En sağ eleman: <${r.offenders?.[0]?.tag} "${r.offenders?.[0]?.txt}"> right=${r.offenders?.[0]?.right}`, "Taşma yok, yatay scroll yok", "overflow-x-hidden / genişlik sınırı");
      if (flagTiny) add("Küçük", `${pageDef.key} font`, vp.label, `${r.tinyFonts.lt10} adet <10px metin (örn: "${r.tinyFonts.samples?.[0]?.txt}" ${r.tinyFonts.samples?.[0]?.fs}px)`, "Min ~11-12px okunabilir", "font-size artır");
      if (flagTap) add("Küçük", `${pageDef.key} dokunma hedefi`, vp.label, `${r.smallTargets.count} buton/link < 36px yükseklik (örn: "${r.smallTargets.samples?.[0]?.txt}" ${r.smallTargets.samples?.[0]?.h}px)`, "≥40px dokunma hedefi", "padding/min-h artır");
    }
    await pg.close(); await ctx.close();
  }

  // ═══ FAZ E: ÖZET ═══
  writeFileSync(`${ROOT}/findings.json`, JSON.stringify({ runTag, findings, summary }, null, 2));
  log("\n═══ ÖZET ═══");
  log("Bulgu sayısı:", findings.length, "| Kritik:", findings.filter(f=>f.sev==="Kritik").length, "Orta:", findings.filter(f=>f.sev==="Orta").length, "Küçük:", findings.filter(f=>f.sev==="Küçük").length);
  findings.forEach((f, i) => log(`  ${i+1}. [${f.sev}] (${f.device}) ${f.area}: ${f.problem}`));
  log("\nJSON: " + ROOT + "/findings.json");
} catch (e) {
  log("FATAL:", e.message, e.stack?.split("\n").slice(0,3).join(" | "));
} finally {
  await browser.close();
}
