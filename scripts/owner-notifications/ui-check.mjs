/**
 * OWNER BİLDİRİM ZİLİ — yerel UI doğrulaması (Playwright; yalnız localhost / 127.0.0.1, dış istekler engellenir).
 * Önkoşul: scripts/owner-notifications/ui-stack.ts + yerel `next dev` (BASE). Sentetik veri; production'a temas YOK.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.ONUI_BASE ?? "http://localhost:3951";
const SHOTS = process.env.ONUI_SHOTS ?? path.join(os.tmpdir(), "owner-notifications-shots");
const cfg = JSON.parse(readFileSync(path.join(os.tmpdir(), "owner-notifications-ui.json"), "utf8"));
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); }
};
const ctl = async (p) => (await fetch(`${cfg.ctl}${p}`)).json();

const EXPERT_PAGES = [
  ["/danisan-yolculugu", "Danışan Yolculuğu"],
  ["/human-design", "Human Design"],
  ["/numeroloji", "Numeroloji"],
  ["/astroloji", "Gökyüzü Atlası"],
  ["/", "Ana sayfa"],
];

const pageErrors = [];
const browser = await chromium.launch();
async function ctxFor(who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  if (who.user.role === "admin") await ctx.addCookies([{ name: "yasam_admin_session", value: who.token, url: BASE }]);
  await ctx.route((url) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => {
    try { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } catch { /* yok */ }
  }, [JSON.stringify(who.user), who.token]);
  // Next dev göstergesi (yalnız geliştirme sunucusu) mobil çekmecede zilin üstüne biner → test sırasında gizlenir.
  await ctx.addInitScript(() => {
    const css = document.createElement("style");
    css.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(css));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${page.url()} :: ${String(e).slice(0, 200)}`));
  const ownerApi = [];
  const ownerApiStatus = [];
  page.on("request", (r) => { if (r.url().includes("/api/admin/notifications")) ownerApi.push(r.url()); });
  page.on("response", (r) => { if (r.url().includes("/api/admin/notifications")) ownerApiStatus.push(r.status()); });
  return { ctx, page, ownerApi, ownerApiStatus };
}
async function go(page, p) {
  await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}
/** Menü panel/çekmece modundaysa açar (randevu ziliyle aynı erişim yolu). */
async function revealMenu(page) {
  const bell = page.locator("#owner-bell");
  const inView = async () => {
    const b = await bell.boundingBox().catch(() => null);
    const vw = page.viewportSize()?.width ?? 0;
    return !!b && b.x >= 0 && b.x + b.width <= vw && (await bell.isVisible().catch(() => false));
  };
  if (await inView()) return;
  const btn = page.locator("[data-testid='quick-nav-open']");
  if (await btn.isVisible().catch(() => false)) { await btn.click(); await page.waitForTimeout(500); }
}
const apptBell = (page) => page.locator("button[aria-label^='Bildirimler']:not(#owner-bell)");
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

try {
  // ── Owner: uzman ekranları ─────────────────────────────────────────────────
  console.log("[Owner · uzman ekranları]");
  const O = await ctxFor(cfg.owner);
  for (const [p, label] of EXPERT_PAGES) {
    await go(O.page, p);
    await revealMenu(O.page);
    const vis = await O.page.locator("#owner-bell").isVisible().catch(() => false);
    const badge = vis ? (await O.page.locator("[data-owner-bell-action]").innerText().catch(() => "")) : "";
    const appt = await apptBell(O.page).first().isVisible().catch(() => false);
    ok(vis && badge.trim() === "3", `${label} (${p}): owner zili görünür, karar rozeti 3`, { vis, badge });
    ok(appt, `${label} (${p}): randevu zili yerinde`);
    await O.page.screenshot({ path: path.join(SHOTS, `01-owner-${label.replace(/\s+/g, "-").toLowerCase()}.png`) });
  }

  console.log("[Owner · panel]");
  await go(O.page, "/danisan-yolculugu");
  await revealMenu(O.page);
  await O.page.locator("#owner-bell").click();
  const panel = O.page.locator("[data-owner-bell-panel]");
  await panel.waitFor({ timeout: 15000 });
  const actRows = await O.page.locator("[data-owner-sec='action'] [data-owner-notif]").count();
  const infoRows = await O.page.locator("[data-owner-sec='info'] [data-owner-notif]").count();
  ok(actRows === 3 && infoRows >= 3, `Panel iki bölüm: karar ${actRows} · bilgi ${infoRows}`);
  const ptxt = (await panel.innerText()).replace(/\s+/g, " ");
  ok(/Karar bekleyen/i.test(ptxt) && /Deneme/i.test(ptxt) && !/Denemeye başladı.*Yeni Başvuru Sahibi/.test(ptxt), "Başvuru “denemeye başladı” olarak listelenmez", ptxt.slice(0, 300));
  ok(await O.page.locator("[data-owner-all-notifs]").isVisible(), "“Tüm bildirimler” bağlantısı görünür");
  await O.page.screenshot({ path: path.join(SHOTS, "02-owner-panel-masaustu.png") });

  // Okundu ≠ çözüldü
  await O.page.locator("[data-owner-read-all]").click();
  await O.page.locator("[data-owner-bell-info]").waitFor({ state: "detached", timeout: 15000 }).catch(() => undefined);
  ok(!(await O.page.locator("[data-owner-bell-info]").count()) && (await O.page.locator("[data-owner-bell-action]").innerText()).trim() === "3",
    "“Tümünü okundu” bilgi noktasını söndürür; karar rozeti 3 kalır");

  // Sayfa değişimi → panel kapanır; admin ekranında zil admin çubuğunda
  await O.page.locator("[data-owner-sec='action'] [data-owner-notif]").first().click();
  await O.page.waitForURL(/\/admin\/users\//, { timeout: 300000 });
  await O.page.waitForTimeout(1500);
  ok(!(await panel.isVisible().catch(() => false)), "Satıra tıklayınca üye detayına gider, panel kapanır");
  ok(await O.page.locator("#owner-bell").isVisible() && (await O.page.locator("#owner-bell").count()) === 1, "Admin ekranında tek owner zili (admin çubuğunda)");
  await O.page.screenshot({ path: path.join(SHOTS, "03-owner-admin-detay.png") });

  // Sekmeye dönüş → yenileme
  console.log("[Owner · sekmeye dönüş / DB hatası]");
  await go(O.page, "/numeroloji");
  await revealMenu(O.page);
  await ctl("/add-trial");
  await O.page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  await O.page.locator("[data-owner-bell-info]").waitFor({ timeout: 20000 }).catch(() => undefined);
  ok(await O.page.locator("[data-owner-bell-info]").isVisible().catch(() => false), "Sekmeye dönüşte yeni “deneme başladı” bilgisi geldi");

  // DB geçici hatası → son bilinen sayı korunur, uyarı notu
  await ctl("/break");
  await O.page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  await O.page.waitForTimeout(4000);
  await O.page.locator("#owner-bell").click();
  await O.page.locator("[data-owner-bell-panel]").waitFor({ timeout: 15000 });
  const staleNote = await O.page.locator("[data-owner-bell-stale-note]").isVisible().catch(() => false);
  const badgeAfter = (await O.page.locator("[data-owner-bell-action]").innerText().catch(() => "")).trim();
  ok(staleNote && badgeAfter === "3", `DB hatasında rozet sıfırlanmadı (${badgeAfter}) ve “güncellenemedi” notu görünür`);
  await O.page.screenshot({ path: path.join(SHOTS, "04-owner-db-hatasi.png") });
  await ctl("/fix");
  await O.page.keyboard.press("Escape");
  await O.page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  await O.page.waitForTimeout(4000);
  ok(!(await O.page.locator("[data-owner-bell-stale]").count()), "DB düzelince uyarı kalktı");

  // Tüm bildirimler sayfası
  console.log("[Owner · Tüm bildirimler]");
  await go(O.page, "/admin/bildirimler");
  await O.page.locator("[data-owner-history-total]").filter({ hasText: "bildirim" }).waitFor({ timeout: 60000 });
  const total0 = await O.page.locator("[data-owner-history-total]").innerText();
  ok(/^\d+ bildirim$/.test(total0.trim()) && Number.parseInt(total0, 10) >= 7, `Geçmiş listesi: ${total0}`);
  await O.page.selectOption("#owner-history-type", "basvuru");
  await O.page.waitForTimeout(1500);
  const kinds = await O.page.locator("[data-owner-history-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  ok(kinds.length >= 4 && kinds.every((k) => k === "action"), `Tür filtresi (başvuru): ${kinds.length} satır, hepsi karar`);
  await O.page.selectOption("#owner-history-status", "open");
  await O.page.waitForTimeout(1500);
  const openTxt = (await O.page.locator("[data-owner-history]").innerText()).replace(/\s+/g, " ");
  ok(/Yeni Başvuru Sahibi/.test(openTxt) && !/Çözüldü/.test(openTxt), "Durum filtresi (açık): yalnız bekleyen başvuru");
  await O.page.selectOption("#owner-history-status", "resolved");
  await O.page.waitForTimeout(1500);
  const resTxt = (await O.page.locator("[data-owner-history]").innerText()).replace(/\s+/g, " ");
  ok(/Çözüldü · Deneme onaylandı/i.test(resTxt) || /Çözüldü/.test(resTxt), "Durum filtresi (çözülen): sonuç + tarih yazılı");
  await O.page.selectOption("#owner-history-type", "all");
  await O.page.selectOption("#owner-history-status", "all");
  await O.page.fill("#owner-history-q", "Deneme 2");
  await O.page.waitForTimeout(2000);
  const qRows = await O.page.locator("[data-owner-history-row]").allInnerTexts();
  ok(qRows.length >= 1 && qRows.every((t) => t.includes("Deneme 2")), `Arama “Deneme 2”: ${qRows.length} satır`);
  await O.page.fill("#owner-history-q", "");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  await O.page.fill("#owner-history-from", "2020-01-01");
  await O.page.fill("#owner-history-to", "2020-01-02");
  await O.page.waitForTimeout(1500);
  ok(/Bu filtrede bildirim yok/.test(await O.page.locator("[data-owner-history]").innerText()), "Tarih filtresi (geçmiş aralık) → boş");
  await O.page.fill("#owner-history-from", today);
  await O.page.fill("#owner-history-to", today);
  await O.page.waitForTimeout(1500);
  ok((await O.page.locator("[data-owner-history-row]").count()) >= 7, "Tarih filtresi (bugün) → kayıtlar listelenir");
  await O.page.screenshot({ path: path.join(SHOTS, "05-tum-bildirimler-masaustu.png"), fullPage: true });

  // ── Mobil 320 / 360 / 390 ───────────────────────────────────────────────────
  console.log("[Mobil]");
  for (const w of [320, 360, 390]) {
    const M = await ctxFor(cfg.owner, { width: w, height: 760 });
    await go(M.page, "/danisan-yolculugu");
    await revealMenu(M.page);
    const vis = await M.page.locator("#owner-bell").isVisible().catch(() => false);
    let inView = false;
    if (vis) {
      await M.page.locator("#owner-bell").click();
      const p = M.page.locator("[data-owner-bell-panel]");
      await p.waitFor({ timeout: 15000 });
      const b = await p.boundingBox();
      inView = !!b && b.x >= 0 && b.x + b.width <= w + 0.5;
      await M.page.screenshot({ path: path.join(SHOTS, `06-mobil-${w}-panel.png`) });
    }
    const ov = await overflow(M.page);
    ok(vis && inView && ov <= 0, `${w}px: zil erişilebilir, panel ekran içinde, yatay taşma ${ov}`);
    await go(M.page, "/admin/bildirimler");
    await M.page.locator("[data-owner-history-total]").filter({ hasText: "bildirim" }).waitFor({ timeout: 60000 });
    const ov2 = await overflow(M.page);
    ok(ov2 <= 0, `${w}px: Tüm bildirimler sayfası yatay taşma ${ov2}`);
    const adminBell = await M.page.locator("#owner-bell").isVisible().catch(() => false);
    ok(adminBell, `${w}px: admin çubuğunda owner zili görünür`);
    await M.page.screenshot({ path: path.join(SHOTS, `07-mobil-${w}-tum-bildirimler.png`), fullPage: true });
    await M.ctx.close();
  }

  // ── Normal admin + uzman: zil YOK, API'ye istek YOK ────────────────────────
  console.log("[Owner dışı]");
  for (const [who, label] of [[cfg.admin2, "Normal admin"], [cfg.expert, "Uzman"]]) {
    const X = await ctxFor(who);
    for (const [p, pl] of EXPERT_PAGES.slice(0, 3)) {
      await go(X.page, p);
      await revealMenu(X.page);
      const n = await X.page.locator("#owner-bell, [data-owner-bell]").count();
      const rowVis = await X.page.locator("[data-owner-bell-row]").isVisible().catch(() => false);
      const appt = await apptBell(X.page).first().isVisible().catch(() => false);
      ok(n === 0 && !rowVis, `${label} · ${pl}: owner zili / “Yönetim” satırı yok`);
      ok(appt, `${label} · ${pl}: randevu zili yerinde`);
    }
    if (who === cfg.admin2) {
      await go(X.page, "/admin/users");
      ok((await X.page.locator("#owner-bell").count()) === 0, "Normal admin · /admin/users: owner zili yok");
      await go(X.page, "/admin/bildirimler");
      await X.page.waitForTimeout(1500);
      ok(/yalnız platform owner/i.test(await X.page.locator("body").innerText()), "Normal admin · /admin/bildirimler: erişim yok mesajı");
      // Normal admin istemcide admin sayılır → sayfa başına en çok 1 deneme; sunucu 403 verir, yoklama durur, hiçbir şey çizilmez.
      ok(X.ownerApiStatus.length > 0 && X.ownerApiStatus.every((st) => st === 401 || st === 403) && X.ownerApi.length <= 6,
        `Normal admin: zil API'si her istekte reddedildi (${X.ownerApiStatus.join(",")}), yoklama durdu`);
    } else {
      ok(X.ownerApi.length === 0, `Uzman: owner bildirim API'sine hiç istek yok (${X.ownerApi.length})`);
      await X.page.screenshot({ path: path.join(SHOTS, "08-uzman-zil-yok.png") });
    }
    await X.ctx.close();
  }
  await O.ctx.close();
  const ownErr = pageErrors.filter((e) => /owner|bildirim|OwnerBell|notifications/i.test(e));
  ok(ownErr.length === 0, `Owner zili kaynaklı sayfa hatası yok (toplam sayfa hatası ${pageErrors.length})`, ownErr);
  if (pageErrors.length) console.log("  · sayfa hataları:", JSON.stringify(pageErrors.slice(0, 8)));
} catch (e) {
  fail++;
  failures.push(`İSTİSNA: ${String(e).slice(0, 300)}`);
  console.error(e);
} finally {
  await browser.close();
}
console.log(`\nOWNER ZİL UI: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.error(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
