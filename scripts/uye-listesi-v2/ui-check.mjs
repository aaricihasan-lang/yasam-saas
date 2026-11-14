/**
 * ÜYE LİSTESİ V2 — yerel UI doğrulaması (Playwright; yalnız localhost, dış istekler engellenir; sentetik veri).
 * Önkoşul: scripts/uye-listesi-v2/ui-stack.ts + yerel `next dev` (BASE).
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.L2UI_BASE ?? "http://localhost:3961";
const SHOTS = process.env.L2UI_SHOTS ?? path.join(os.tmpdir(), "uye-listesi-v2-shots");
const cfg = JSON.parse(readFileSync(path.join(os.tmpdir(), "uye-listesi-v2-ui.json"), "utf8"));
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); }
};
const pageErrors = [];
const browser = await chromium.launch();
async function ctxFor(who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  if (who.user.role === "admin") await ctx.addCookies([{ name: "yasam_admin_session", value: who.token, url: BASE }]);
  await ctx.route((url) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => {
    try { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } catch { /* yok */ }
  }, [JSON.stringify(who.user), who.token]);
  await ctx.addInitScript(() => {
    const css = document.createElement("style");
    css.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(css));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${page.url()} :: ${String(e).slice(0, 200)}`));
  const memberApi = [];
  page.on("response", (r) => { if (r.url().includes("/api/admin/members")) memberApi.push(r.status()); });
  return { ctx, page, memberApi };
}
async function go(page, p) {
  await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => undefined);
}
const ready = (page) => page.locator("[data-list-total]").filter({ hasText: "kişi" }).waitFor({ timeout: 120000 });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function api(page, who, qs = "") {
  return page.evaluate(async ([id, t, q]) => {
    const r = await fetch(`/api/admin/members${q}`, { headers: { "x-admin-id": id, "x-session-token": t } });
    return r.json();
  }, [who.user.id, who.token, qs]);
}
const stagesOnPage = (page) => page.locator("[data-row] [data-stage]").evaluateAll((els) => els.map((e) => e.getAttribute("data-stage")));

try {
  console.log("[Masaüstü · owner]");
  const O = await ctxFor(cfg.owner);
  await go(O.page, "/admin/users");
  await ready(O.page);
  const j = await api(O.page, cfg.owner);
  const kv = async (k) => (await O.page.locator(`[data-kpi="${k}"] [data-kpi-value]`).innerText()).trim();
  ok((await kv("today")) === String(j.counts.today) && (await kv("trial")) === String(j.counts.trial) && (await kv("pro")) === String(j.counts.pro)
     && (await kv("ended")) === String(j.counts.ended) && (await kv("waiting")) === String(j.decisions.total),
    `Beş gösterge API ile aynı (bugün ${j.counts.today} · denemede ${j.counts.trial} · Pro ${j.counts.pro} · biten ${j.counts.ended} · karar ${j.decisions.total})`);
  ok(j.counts.trial === 6 && j.counts.not_started === 2 && /\+2 başlamamış/.test(await O.page.locator('[data-kpi="trial"]').innerText()),
    "Denemede = 6 (başlamamış 2 ayrı gösterilir; demo deneme sayılmaz)");
  const bellCount = await O.page.locator("[data-owner-bell-action]").innerText().catch(() => "");
  ok(bellCount.trim() === String(j.decisions.total), `Karar bekleyen (${j.decisions.total}) = Yönetim zili turuncu sayı (${bellCount.trim()})`);
  const attnRows = await O.page.locator("[data-attn-row]").count();
  ok(attnRows === 3 && (await O.page.locator("[data-attn-all]").count()) === 1, "Bugün dikkat: ilk 3 karar satırı + “Tümünü gör”");
  await O.page.locator("[data-attn-all]").click();
  ok((await O.page.locator("[data-attn-row]").count()) === 5, "“Tümünü gör” → 5 karar satırı (Pro talebi, başvuru, inceleme, ödeme, eski kayıt)");
  ok((await O.page.locator("[data-fyi]").innerText()).includes("ödeme tarihi geçen (kontrol)"), "Bilgi: tarihi geçen ama işaretsiz ödeme “kontrol” olarak (borç değil)");
  const chipN = async (k) => (await O.page.locator(`[data-preset="${k}"]`).first().innerText()).match(/(\d+)\s*$/)?.[1];
  ok((await chipN("all")) === String(j.presets.all) && (await chipN("trial")) === String(j.presets.trial) && (await chipN("prores")) === String(j.presets.prores),
    "Görünür filtre çiplerindeki sayılar API ile aynı");
  await O.page.screenshot({ path: path.join(SHOTS, "01-masaustu-1280.png"), fullPage: true });

  // Filtre: Denemedekiler
  await O.page.locator('[data-preset="trial"]').first().click();
  await O.page.waitForURL(/f=trial/, { timeout: 60000 });
  await ready(O.page);
  let st = await stagesOnPage(O.page);
  ok(st.length === 6 && st.every((s) => s === "deneme"), `“Denemedekiler” → 6 satır, hepsi deneme (${st.join(",")})`);
  // Diğer filtreler → Başlamamış deneme
  await O.page.locator("[data-more]").click();
  await O.page.locator('[data-more-panel] [data-preset="notstarted"]').click();
  await O.page.waitForURL(/f=notstarted/, { timeout: 60000 });
  await ready(O.page);
  st = await stagesOnPage(O.page);
  ok(st.length === 2 && st.every((s) => s === "deneme_baslamadi"), "“Başlamamış deneme” → 2 satır (denemedekilere karışmaz)");
  for (const [f, stage, n] of [["askida", "deneme_durdu", 1], ["pasif", "pasif", 1], ["arsiv", "arsiv", 1], ["eski", "eski_kayit", 1], ["inceleme", "inceleme", 1]]) {
    await go(O.page, `/admin/users?f=${f}`);
    await ready(O.page);
    st = await stagesOnPage(O.page);
    ok(st.length === n && st.every((s) => s === stage), `“${f}” → ${n} satır (${stage})`);
  }
  ok((await O.page.locator("[data-active-more]").count()) === 1, "Diğer filtrelerden seçilen filtre çipi ✕ ile görünür");
  await go(O.page, "/admin/users?f=askida");
  await ready(O.page);
  // Aşama 4a (Owner onayı 12.11): bu filtre deneme durdurmadır; hesap askısı/arşiv ayrı filtrelerdedir (yanlış etiket yok).
  const askNote = await O.page.locator('[data-notice="askida"]').innerText();
  ok(/denemesi durdurulmuş/.test(askNote) && /Pasif hesaplar/.test(askNote) && /Arşiv/.test(askNote),
    "Denemesi durdurulanlar: notu deneme durumu olduğunu ve pasif/arşivin ayrı filtrelerde olduğunu söyler (yanlış etiket yok)");
  await O.page.locator("[data-more]").click();
  const morePanel = await O.page.locator("[data-more-panel]").innerText();
  ok(morePanel.includes("Denemesi durdurulanlar") && morePanel.includes("Pasif hesaplar") && !morePanel.includes("Askıya alınanlar"),
    "Diğer filtreler: “Denemesi durdurulanlar” + ayrı “Pasif hesaplar”; eski yanıltıcı “Askıya alınanlar” yok");
  ok(!(await stagesOnPage(O.page)).includes("pasif") && !(await stagesOnPage(O.page)).includes("arsiv"), "Denemesi durdurulan hesap pasif/arşiv sayılmaz");
  await go(O.page, "/admin/users?f=pay");
  await ready(O.page);
  ok(/borç anlamına gelmez/.test(await O.page.locator('[data-notice="pay"]').innerText()), "Ödeme kontrolü: “tarihin geçmesi borç değildir” notu");

  // Arama
  await go(O.page, "/admin/users");
  await ready(O.page);
  await O.page.fill("#member-v2-q", "ISMAIL");
  await O.page.waitForURL(/q=ISMAIL/, { timeout: 60000 });
  await ready(O.page);
  const names = await O.page.locator("[data-row] td:first-child b").allInnerTexts();
  ok(names.length > 0 && names.every((n) => n.includes("İsmail")), `Arama “ISMAIL” → İsmail (${names.length})`);
  await O.page.fill("#member-v2-q", "");
  await O.page.waitForURL((u) => !u.toString().includes("q="), { timeout: 60000 });
  // Sıralama + gelişmiş filtre
  await O.page.selectOption("#member-v2-sort", "name");
  await O.page.waitForURL(/sort=name/, { timeout: 60000 });
  await ready(O.page);
  const sorted = await O.page.locator("[data-row] td:first-child b").allInnerTexts();
  ok(sorted.length === 20, "A–Z sıralaması + 20'lik sayfa");
  await O.page.locator("[data-adv-toggle]").click();
  await O.page.selectOption("[data-adv-role]", "admin");
  await O.page.waitForURL(/rol=admin/, { timeout: 60000 });
  await ready(O.page);
  st = await stagesOnPage(O.page);
  ok(st.length === 2 && st.every((s) => s === "yonetici"), "Gelişmiş filtre: Yöneticiler ayrı");
  ok(await O.page.locator("[data-classic-link]").isVisible(), "Gelişmiş filtrede “Ayrıntılı liste” (360° filtreleri) bağlantısı");

  // Sayfalama
  await go(O.page, "/admin/users");
  await ready(O.page);
  const total = j.total;
  await O.page.locator("[data-next]").click();
  await O.page.waitForURL(/page=2/, { timeout: 60000 });
  await ready(O.page);
  ok((await O.page.locator("[data-pager]").innerText()).startsWith("21–"), `Sonraki sayfa (toplam ${total})`);

  // Detaya git + dönüş filtreyi korur
  await go(O.page, "/admin/users?f=trial");
  await ready(O.page);
  const firstId = await O.page.locator("[data-row]").first().getAttribute("data-row");
  await O.page.locator("[data-row] [data-detail-link]").first().click();
  await O.page.waitForURL(new RegExp(`/admin/users/${firstId}`), { timeout: 120000 });
  await O.page.locator("text=Üye Listesine Dön").first().waitFor({ timeout: 120000 });
  ok(true, "Detay bağlantısı mevcut üye detayını açar");
  await O.page.locator("text=Üye Listesine Dön").first().click();
  await O.page.waitForURL(/\/admin\/users\?f=trial/, { timeout: 120000 });
  ok(true, "“Üye Listesine Dön” aynı filtreye (Denemedekiler) döner");

  // Raporlar (Yönetim Özeti korunur)
  await go(O.page, "/admin/users");
  await ready(O.page);
  await O.page.locator("details summary", { hasText: "Raporlar" }).click();
  await O.page.waitForTimeout(2500);
  const rep = await O.page.locator("details").last().innerText();
  ok(rep.length > 80, "Raporlar altında mevcut Yönetim Özeti açılır");

  console.log("\n[Klasik ekran + eski bağlantılar]");
  await go(O.page, "/admin/users?due=overdue");
  await O.page.waitForURL(/\/admin\/users\/klasik\?due=overdue/, { timeout: 120000 });
  await O.page.locator("text=Üye Listesi").first().waitFor({ timeout: 120000 });
  ok(true, "Ana panel “Yenileme geçti” bağlantısı (due=overdue) klasik listede aynı filtreyle açılır");
  await go(O.page, "/admin/users?view=archive");
  await O.page.waitForURL(/klasik\?view=archive/, { timeout: 120000 });
  await O.page.locator("text=Pasif ve arşivdeki onaylı uzmanlar").waitFor({ timeout: 120000 });
  // Aşama 4a: pasif satır doğrudan yeniden aktifleştirilir; arşiv satırında Yeniden Aktifleştir YOK (önce arşivden çıkarma).
  const rowOf = (state) => O.page.locator(`article:has([data-row-state="${state}"])`);
  ok((await rowOf("pasif").count()) === 1 && await rowOf("pasif").getByRole("button", { name: "Yeniden Aktifleştir" }).isVisible(),
    "Pasif + Arşiv işlemleri: pasif satırda Yeniden Aktifleştir klasik ekranda aynen");
  ok((await rowOf("arsiv").count()) === 1 && (await rowOf("arsiv").getByRole("button", { name: "Yeniden Aktifleştir" }).count()) === 0,
    "Arşivdeki satırda Yeniden Aktifleştir yok (önce arşivden çıkarma)");
  // Kalıcı Sil düğmesi (değişmeyen mantık): yalnız owner VE purge RPC'si veritabanında varsa çizilir. Yerel test
  // zincirinde purge migration'ı yok → sunucu bayrağı false; düğme bayrakla birebir uyumlu olmalı.
  const arch = await O.page.evaluate(async ([id, t]) => (await (await fetch("/api/admin/users/archive", { headers: { "x-admin-id": id, "x-session-token": t } })).json()).viewer, [cfg.owner.user.id, cfg.owner.token]);
  const purgeBtns = await O.page.locator("[data-testid='archive-purge-button']").count();
  ok((arch?.canPermanentDelete === true) === (purgeBtns > 0), `Kalıcı Sil düğmesi sunucu yetki bayrağıyla uyumlu (bayrak ${arch?.canPermanentDelete}, düğme ${purgeBtns}; yerelde purge RPC yok)`);
  await go(O.page, "/admin/users/klasik?yeni=1");
  await O.page.locator("#create-name").waitFor({ timeout: 120000 });
  ok(await O.page.locator("#create-password").isVisible(), "“Yeni uzman” → klasik oluşturma formu açık gelir (modül + Astroloji teknikleri dahil)");
  await go(O.page, "/admin/deneme-uyeleri");
  await O.page.waitForTimeout(3000);
  const trialTxt = await O.page.locator("body").innerText();
  ok(/Deneme/i.test(trialTxt) && !/okunamadı|hata oluştu/i.test(trialTxt), "Deneme Üyeleri ekranı aynen çalışır");
  await O.page.screenshot({ path: path.join(SHOTS, "05-deneme-uyeleri.png") });

  console.log("\n[Mobil]");
  for (const w of [320, 360, 390]) {
    const M = await ctxFor(cfg.owner, { width: w, height: 780 });
    await go(M.page, "/admin/users");
    await ready(M.page);
    const ov = await overflow(M.page);
    const cards = await M.page.locator("[data-card]").count();
    const tableVisible = await M.page.locator("table").isVisible().catch(() => false);
    ok(ov <= 0 && cards === 20 && !tableVisible, `${w}px: yatay taşma ${ov}, 20 kart, tablo gizli`);
    await M.page.screenshot({ path: path.join(SHOTS, `02-mobil-${w}.png`), fullPage: true });
    await M.page.locator("[data-more]").click();
    await M.page.locator("[data-adv-toggle]").click();
    const ov2 = await overflow(M.page);
    ok(ov2 <= 0, `${w}px: Diğer filtreler + Gelişmiş filtre açıkken taşma ${ov2}`);
    await M.page.screenshot({ path: path.join(SHOTS, `03-mobil-${w}-filtreler.png`), fullPage: true });
    await M.page.locator("[data-card]").first().click();
    await M.page.waitForURL(/\/admin\/users\/[0-9a-f-]{36}/, { timeout: 120000 });
    ok(true, `${w}px: kart dokununca üye detayı açılır`);
    await M.ctx.close();
  }

  console.log("\n[Diğer roller]");
  const A = await ctxFor(cfg.admin2);
  await go(A.page, "/admin/users");
  await ready(A.page);
  ok((await A.page.locator("#owner-bell").count()) === 0 && (await A.page.locator("[data-kpi]").count()) === 5, "Normal admin: liste çalışır, owner zili yok");
  await A.ctx.close();
  const E = await ctxFor(cfg.expert);
  await go(E.page, "/admin/users");
  await E.page.waitForTimeout(4000);
  ok(!/\/admin\/users/.test(new URL(E.page.url()).pathname) && E.memberApi.every((s) => s === 401 || s === 403),
    `Uzman: /admin/users açılamaz (yönlendirildi: ${new URL(E.page.url()).pathname}), üye verisi dönmez`);
  const direct = await E.page.evaluate(async ([id, t]) => (await fetch("/api/admin/members", { headers: { "x-admin-id": id, "x-session-token": t } })).status, [cfg.expert.user.id, cfg.expert.token]);
  ok(direct === 401 || direct === 403, `Uzman API'yi doğrudan çağırırsa ${direct}`);
  await E.ctx.close();
  await O.ctx.close();
  ok(pageErrors.length === 0, `Sayfa hatası yok (${pageErrors.length})`, pageErrors.slice(0, 5));
} catch (e) {
  fail++;
  failures.push(`İSTİSNA: ${String(e).slice(0, 300)}`);
  console.error(e);
} finally {
  await browser.close();
}
console.log(`\nÜYE LİSTESİ V2 UI: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.error(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
