const { chromium } = require("C:/Users/Mustafa/AppData/Roaming/npm/node_modules/playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = {};

  // ── Desktop ──────────────────────────────────────────────────────────────
  const p1 = await browser.newPage();
  const consoleErrors = [];
  const networkReqs = [];
  p1.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  p1.on("request", r => { const u = r.url(); if (u.includes("supabase") || u.includes(".json")) networkReqs.push(u.substring(0, 100)); });

  await p1.setViewportSize({ width: 1440, height: 900 });
  await p1.goto("http://localhost:3033/dogaltas/tas-bilgi-kutuphanesi", { waitUntil: "networkidle", timeout: 25000 });
  await p1.waitForTimeout(3500);
  await p1.screenshot({ path: "C:/tmp/verify_empty.png" });

  results.headerText    = await p1.evaluate(() => document.querySelector("header p") ? document.querySelector("header p").textContent.trim() : null);
  results.hasJsonFetch  = networkReqs.some(r => r.includes("tas_bilgi_kutuphanesi.json") || r.endsWith(".json"));
  results.supabaseReqs  = networkReqs.filter(r => r.includes("supabase")).length;
  results.supabaseTable = networkReqs.filter(r => r.includes("stone_knowledge")).map(u => u.replace(/.*rest\/v1\//, "").substring(0, 60));

  // İlk makale kartı
  const clickResult = await p1.evaluate(function() {
    var allBtns = Array.from(document.querySelectorAll("aside button"));
    var card = allBtns.find(function(b) { return b.classList.contains("py-3"); });
    if (!card) return null;
    card.click();
    var titleEl = card.querySelector(".text-sm.font-bold") || card.querySelector(".font-bold");
    return titleEl ? titleEl.textContent.trim().substring(0, 60) : "clicked";
  });
  await p1.waitForTimeout(900);
  await p1.screenshot({ path: "C:/tmp/verify_article.png" });
  results.clickedArticle  = clickResult;
  results.rightPanelTitle = await p1.evaluate(function() { var h2 = document.querySelector("h2"); return h2 ? h2.textContent.trim().substring(0, 60) : null; });

  // Mineral araması
  await p1.fill("input[placeholder*='ara']", "mineral");
  await p1.waitForTimeout(700);
  results.markCount  = await p1.evaluate(function() { return document.querySelectorAll("mark").length; });
  results.resultInfo = await p1.evaluate(function() { var s = Array.from(document.querySelectorAll("span")).find(function(el) { return el.textContent.includes("sonuç"); }); return s ? s.textContent.trim() : null; });
  results.matchBadge = await p1.evaluate(function() { var s = Array.from(document.querySelectorAll("span")).find(function(el) { return el.textContent.includes("eşleşme"); }); return s ? s.textContent.trim() : null; });
  await p1.screenshot({ path: "C:/tmp/verify_search.png" });

  // Kategori filtreleri
  await p1.fill("input[placeholder*='ara']", "");
  await p1.waitForTimeout(200);
  results.katButtons = await p1.evaluate(function() {
    return Array.from(document.querySelectorAll("aside button"))
      .filter(function(b) { return b.classList.contains("rounded-full"); })
      .map(function(b) { return b.textContent.trim().replace(/\s+/g, " "); })
      .slice(0, 7);
  });

  // Yeni Kayıt formu
  const formBtnClicked = await p1.evaluate(function() {
    var btn = Array.from(document.querySelectorAll("header button")).find(function(b) { return b.textContent.includes("Yeni Kay"); });
    if (btn) { btn.click(); return btn.textContent.trim(); }
    return null;
  });
  await p1.waitForTimeout(500);
  results.formOpened   = await p1.evaluate(function() { return !!document.querySelector("textarea"); });
  results.formBtnText  = formBtnClicked;
  await p1.screenshot({ path: "C:/tmp/verify_form.png" });

  results.desktopOverflow = await p1.evaluate(function() { return document.body.scrollWidth > document.body.clientWidth; });
  results.consoleErrors   = consoleErrors;

  // ── Mobile ─────────────────────────────────────────────────────────────────
  const pm = await browser.newPage();
  await pm.setViewportSize({ width: 390, height: 844 });
  await pm.goto("http://localhost:3033/dogaltas/tas-bilgi-kutuphanesi", { waitUntil: "networkidle", timeout: 20000 });
  await pm.waitForTimeout(2200);
  await pm.screenshot({ path: "C:/tmp/verify_mobile.png" });
  results.mobileOverflow  = await pm.evaluate(function() { return document.body.scrollWidth > document.body.clientWidth; });
  results.mobileHeaderTxt = await pm.evaluate(function() { var p = document.querySelector("header p"); return p ? p.textContent.trim() : null; });

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch(function(e) { console.error("ERR:", e.message); process.exit(1); });
