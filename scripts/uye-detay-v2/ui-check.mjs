/**
 * ÜYE DETAYI V2 (PR-3) — yerel UI doğrulaması (Playwright; yalnız localhost / 127.0.0.1, dış istekler engellenir; sentetik veri).
 * Önkoşul: scripts/uye-detay-v2/ui-stack.ts + yerel `next dev` (BASE). Production'a temas YOK.
 * Ekran görüntüleri: UD2_SHOTS (yoksa geçici dizin). Her görüntünün adı kanıtladığı testi söyler.
 */
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.UD2_BASE ?? "http://localhost:3971";
const SHOTS = process.env.UD2_SHOTS ?? path.join(os.tmpdir(), "uye-detay-v2-shots");
const cfg = JSON.parse(readFileSync(path.join(os.tmpdir(), "uye-detay-v2-ui.json"), "utf8"));
mkdirSync(SHOTS, { recursive: true });
const db = new pg.Client({ host: "127.0.0.1", port: cfg.pg.port, user: "postgres", password: "testpw", database: "postgres" });
await db.connect();
const q1 = async (sql, args = []) => (await db.query(sql, args)).rows[0];

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); }
};
const consoleErrors = [];
const browser = await chromium.launch();
async function ctxFor(who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  if (who.user.role === "admin") await ctx.addCookies([{ name: "yasam_admin_session", value: who.token, url: BASE }]);
  await ctx.route((url) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => {
    try { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); } catch { /* yok */ }
  }, [JSON.stringify(who.user), who.token]);
  return ctx;
}
async function openDetail(ctx, id, hash = "") {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED|favicon/.test(m.text())) consoleErrors.push(`console ${m.text().slice(0, 200)}`); });
  await page.goto(`${BASE}/admin/users/${id}${hash}`, { waitUntil: "domcontentloaded" });
  await page.locator("#uye-detay-ad").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(600);
  return page;
}
const shot = async (page, name, full = true) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
/** "Ödeme Takibi" bugünkü sistemde kapalı açılır bölümdür (mevcut davranış) → kullanmadan önce aç. */
async function openPayment(page) {
  const t = page.locator("#uye-panel-uyelik button[aria-expanded]").filter({ hasText: "Ödeme Takibi" }).first();
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await page.waitForTimeout(500);
}
// V3 (Owner onaylı sıra): Hesap ve Güvenlik · Özet · Modüller ve Kredi · Üyelik ve Ödeme · Geçmiş ("Gelişmiş" kaldırıldı).
const TABS = [["hesap", "Hesap ve Güvenlik"], ["ozet", "Özet"], ["moduller", "Modüller ve Kredi"], ["uyelik", "Üyelik ve Ödeme"], ["gecmis", "Geçmiş"]];
/** Üstteki Hızlı Hesap İşlemleri alanı (sekmelerin dışında, her sekmede görünür). */
const quick = (page) => page.locator("section[data-quick-actions]");
const tabBtn = (page, label) => page.getByRole("tab", { name: label, exact: false });
async function selectTab(page, id, label) {
  await tabBtn(page, label).first().click();
  await page.locator(`#uye-panel-${id}`).waitFor({ state: "visible" });
  await page.waitForTimeout(150);
}
/** Taşma: sayfa yatay kaydırması + görünür alan dışına taşan öğeler (kendi yatay kaydırmalı kapsayıcıları hariç). */
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const pageOv = document.documentElement.scrollWidth - vw;
    const scrollers = [...document.querySelectorAll("*")].filter((e) => {
      const s = getComputedStyle(e);
      return (s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden") && e.scrollWidth > e.clientWidth + 1;
    });
    const out = [...document.querySelectorAll("main *")].filter((el) => {
      if (el.closest("[hidden]")) return false;
      if (scrollers.some((s) => s !== el && s.contains(el))) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1);
    }).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`);
    return { pageOv, out: out.slice(0, 5), n: out.length };
  });
}

const O = cfg.owner, A2 = cfg.admin2, E = cfg.expert, I = cfg.ids;

// ───────────── 1) Beş sekme · pastel · panel değişimi · klavye ─────────────
console.log("\n[1] Beş sekme (ücretli Pro, masaüstü 1280)");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.proPaid);
  const tabs = await page.getByRole("tab").all();
  ok(tabs.length === 5, "5 sekme (role=tab)", tabs.length);
  const bgs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => getComputedStyle(t).backgroundColor));
  const want = ["rgb(244, 210, 223)", "rgb(237, 231, 255)", "rgb(230, 246, 234)", "rgb(231, 241, 255)", "rgb(255, 240, 228)"];
  ok(JSON.stringify(bgs) === JSON.stringify(want), "pasif sekmeler kendi pastel renginde; açılışta aktif Hesap ve Güvenlik belirgin tonda (#F4D2DF)", bgs);
  const tabOrder = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute("data-tab")).join(","));
  ok(tabOrder === "hesap,ozet,moduller,uyelik,gecmis", "sekme sırası: Hesap ve Güvenlik · Özet · Modüller ve Kredi · Üyelik ve Ödeme · Geçmiş", tabOrder);
  ok((await page.locator('[role="tab"][data-tab="gelismis"]').count()) === 0, "'Gelişmiş' sekmesi yok");
  ok((await page.locator('[role="tab"][aria-selected="true"]').getAttribute("data-tab")) === "hesap" && await page.locator("#uye-panel-hesap").isVisible(), "adressiz açılış: Hesap ve Güvenlik sekmesi");
  // Hızlı Hesap İşlemleri: üye bilgisinin hemen altında, sekmelerden önce, kaydırmadan görünür (1280×900)
  const qb = await quick(page).boundingBox();
  const hb = await page.locator("header").first().boundingBox();
  const tb = await page.locator('[role="tablist"]').boundingBox();
  ok(qb && hb && tb && qb.y >= hb.y + hb.height - 1 && qb.y + qb.height <= tb.y + 1 && qb.y + qb.height <= 900, "Hızlı Hesap İşlemleri: üye bilgisinin altında, sekmelerden önce, ilk ekranda", { qb, hb, tb });
  for (const n of ["Pasif Yap", "Tüm Cihazlardan Çıkış", "Pasife Al ve Arşivle"]) ok(await quick(page).getByRole("button", { name: n, exact: true }).isVisible(), `aktif hesap · hızlı işlem: "${n}" kaydırmadan görünür`);
  ok((await page.getByRole("button", { name: "Pasif Yap", exact: true }).count()) === 1 && (await page.getByRole("button", { name: "Tüm Cihazlardan Çıkış", exact: true }).count()) === 1 && (await page.getByRole("button", { name: "Pasife Al ve Arşivle", exact: true }).count()) === 1, "her hesap işlemi sayfada TEK yerde (tekrar yok)");
  ok((await page.locator("header button").count()) === 0 && (await page.getByRole("button", { name: "Ödeme bilgisi" }).count()) === 0, "başlıkta baskın 'Ödeme bilgisi' / ticari kısayol yok");
  ok((await page.locator('[role="tabpanel"] [aria-labelledby="actions-danger"], [role="tabpanel"] [aria-labelledby="actions-access"]').count()) === 0, "hesap işlem grupları sekme panellerinin içinde DEĞİL");
  ok(new Set(bgs).size === 5, "beş sekmenin rengi birbirinden farklı");
  for (const [id, label] of TABS) {
    await selectTab(page, id, label);
    const vis = (await Promise.all(TABS.map(async ([t]) => `${t}:${(await page.locator(`#uye-panel-${t}`).isVisible()) ? 1 : 0}`))).join(",");
    ok(vis.split(",").filter((x) => x.endsWith(":1")).length === 1 && vis.includes(`${id}:1`), `"${label}" seçilince yalnız kendi paneli görünür`, vis);
    ok((await tabBtn(page, label).first().getAttribute("aria-selected")) === "true", `"${label}" aria-selected=true`);
    ok(page.url().endsWith(`#${id}`), `adres #${id} (geçmiş adımı eklenmeden)`, page.url());
    await shot(page, `01-masaustu-${id}-pro-ucretli`);
  }
  // klavye
  await selectTab(page, "hesap", "Hesap ve Güvenlik");
  await tabBtn(page, "Hesap ve Güvenlik").first().focus();
  await page.keyboard.press("ArrowRight");
  ok((await tabBtn(page, "Özet").first().getAttribute("aria-selected")) === "true", "klavye → ile sonraki sekme");
  await page.keyboard.press("End");
  ok((await tabBtn(page, "Geçmiş").first().getAttribute("aria-selected")) === "true", "klavye End → son sekme");
  ok(await page.evaluate(() => document.activeElement?.getAttribute("data-tab") === "gecmis"), "odak seçili sekmede (roving tabindex)");
  await page.keyboard.press("Home");
  ok((await tabBtn(page, "Hesap ve Güvenlik").first().getAttribute("aria-selected")) === "true", "klavye Home → ilk sekme (Hesap ve Güvenlik)");
  // içerik eşlemesi: işlevler doğru sekmede
  const inPanel = async (id, text) => (await page.locator(`#uye-panel-${id}`).getByText(text, { exact: false }).count()) > 0;
  await selectTab(page, "uyelik", "Üyelik ve Ödeme");
  await openPayment(page);
  ok(await inPanel("ozet", "Son Gerçek Aktivite") && await inPanel("ozet", "Ödeme Durumu"), "Özet: profil özeti alanları");
  ok(await inPanel("uyelik", "Ödeme Takibi") && await inPanel("uyelik", "Geçmiş Ödemeler"), "Üyelik ve Ödeme: ödeme takibi + ödeme geçmişi");
  ok(await page.locator("#uye-panel-moduller #uye-erisim").count() === 1 && await inPanel("moduller", "Kredi ve kullanım sınırları"), "Modüller ve Kredi: modül izinleri + kredi");
  ok(await inPanel("gecmis", "Güvenlik & Oturum Geçmişi"), "Geçmiş: güvenlik & oturum geçmişi");
  ok(await inPanel("hesap", "Lisans & Oturum Limitleri") && await inPanel("hesap", "Hesap Yönetimi") && await inPanel("hesap", "Aktif Cihazlar") && await quick(page).getByText("Tehlikeli İşlemler").isVisible(), "Hesap ve Güvenlik: lisans + cihazlar + profil/parola; tehlikeli işlemler üst alanda");
  await selectTab(page, "hesap", "Hesap ve Güvenlik");
  const order = await page.evaluate(() => [...document.querySelectorAll("#uye-panel-hesap > section")].map((s) => (s.querySelector("h2, p.text-lg")?.textContent ?? "").trim().slice(0, 28)));
  const idx = (t) => order.findIndex((x) => x.startsWith(t));
  ok(idx("Hesap durumu") === 0 && idx("Aktif Cihazlar") === 1 && idx("Profil ve parola") === 2 && idx("Lisans & Oturum") === 3 && idx("Arşiv durumu") === 4, "Hesap ve Güvenlik iç sırası: durum → cihazlar → (deneme) → profil/parola → lisans → arşiv açıklamaları", order);
  ok(await inPanel("hesap", "Kalıcı silme bu ekranda yapılmaz") && (await page.getByRole("button", { name: /kalıcı/i }).count()) === 0, "kalıcı silme yalnız bilgi notu + Arşiv bağlantısı (sayfada düğme YOK)");
  ok(await inPanel("moduller", "Roxy kredi limiti: uygulanmaz") && await inPanel("moduller", "20/saat · 100/gün"), "Pro: Roxy kredi limiti uygulanmaz + HD ayrı sınır");
  await ctx.close();
}

// ───────────── 2) Eski bölüm bağlantıları ─────────────
console.log("\n[2] Eski #uye-* bağlantıları → doğru sekme");
{
  const ctx = await ctxFor(O);
  for (const [hash, tab, sel] of [["#uye-erisim", "moduller", "#uye-erisim"], ["#uye-ticari", "uyelik", "#uye-ticari"], ["#uye-guvenlik", "gecmis", "#uye-guvenlik"], ["#gelismis", "hesap", "#uye-panel-hesap"], ["#hesap", "hesap", "#uye-panel-hesap"], ["#ozet", "ozet", "#uye-panel-ozet"]]) {
    const page = await openDetail(ctx, I.proPaid, hash);
    await page.waitForTimeout(500);
    const selected = await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("data-tab"));
    ok(selected === tab && await page.locator(sel).first().isVisible(), `${hash} → "${tab}" sekmesi açık, hedef görünür`, selected);
    await page.close();
  }
  await ctx.close();
}

// ───────────── 3) Üyelik durumları ─────────────
console.log("\n[3] Üyelik durumları");
{
  const ctx = await ctxFor(O);
  // A — ücretli Pro
  let page = await openDetail(ctx, I.proPaid);
  ok((await page.getByRole("button", { name: "Ödeme bilgisi" }).count()) === 0 && await tabBtn(page, "Üyelik ve Ödeme").first().isVisible(), "A ücretli Pro: ödeme başlıkta baskın düğme değil; 'Üyelik ve Ödeme' sekmesinde");
  ok(await page.locator("header dl").getByText("Sonraki ödeme").isVisible(), "A: bilgi şeridinde sonraki ödeme");
  await selectTab(page, "uyelik", "Üyelik ve Ödeme");
  await openPayment(page);
  ok((await page.locator("#uye-panel-uyelik").getByText("EFT-ZZ-1").count()) > 0, "A: ödeme geçmişi satırları görünür");
  await page.close();
  // B — muaf Pro
  page = await openDetail(ctx, I.proExempt);
  ok(await page.locator("header dl").getByText("Ödemeden muaf").isVisible(), "B muaf Pro: bilgi şeridi 'Ödemeden muaf' (ödendi değil)");
  ok((await page.locator("header").getByText("Ödendi", { exact: true }).count()) === 0, "B: başlıkta 'Ödendi' rozeti YOK");
  await selectTab(page, "uyelik", "Üyelik ve Ödeme");
  await openPayment(page);
  ok(await page.locator("#uye-panel-uyelik textarea").first().inputValue() === "Kurucu ekip · Owner kararı (sentetik)", "B: muafiyet gerekçesi (Ödeme Notu) gösteriliyor");
  ok(await page.locator("#uye-panel-uyelik").getByText("· muafiyet gerekçesi", { exact: true }).isVisible(), "B: zaten muaf kayıtta Ödeme Notu 'muafiyet gerekçesi' olarak işaretli (eski kayıt engellenmez)");
  await shot(page, "03-durum-B-muaf-pro-uyelik");
  await page.close();
  // C — deneme
  page = await openDetail(ctx, I.trialAct);
  await selectTab(page, "uyelik", "Üyelik ve Ödeme");
  ok(await page.locator('#uye-panel-uyelik [data-pro-conversion="trial"]').isEnabled(), "C deneme: Üyelik ve Ödeme'de 'Pro Üyeliğe Geçir'");
  ok((await page.getByRole("button", { name: "Pro'ya geçir" }).count()) === 0, "C: Pro geçişi tek yerde (başlıkta tekrar yok)");
  await selectTab(page, "moduller", "Modüller ve Kredi");
  ok(await page.locator("#uye-panel-moduller").getByText("Günlük ortak Roxy kredisi").isVisible(), "C: günlük ortak Roxy kredisi kartı");
  ok((await page.locator("#uye-panel-moduller a[href='/admin/deneme-uyeleri']").count()) === 1, "C: kredi limiti Deneme Üyeleri ekranına bağlı (işlev korunur)");
  await shot(page, "03-durum-C-deneme-moduller-kredi");
  await page.close();
  // D — eski kayıt (owner: açık, admin2: kapalı)
  page = await openDetail(ctx, I.legacy);
  await selectTab(page, "uyelik", "Üyelik ve Ödeme");
  const legacyBtn = page.locator('#uye-panel-uyelik [data-pro-conversion="legacy"]');
  ok(await legacyBtn.isEnabled() && (await legacyBtn.innerText()).includes("Eski Kaydı Pro Üyeliğe Geçir"), "D eski kayıt: ana yöneticide 'Eski Kaydı Pro Üyeliğe Geçir' açık");
  ok((await page.locator('[role="tab"][data-tab="uyelik"]').innerText()).includes("1"), "D: Üyelik ve Ödeme sekmesinde açık karar işareti");
  await shot(page, "03-durum-D-eski-kayit-ozet");
  await page.close();
  const ctx2 = await ctxFor(A2);
  page = await openDetail(ctx2, I.legacy);
  await selectTab(page, "uyelik", "Üyelik ve Ödeme");
  const lb2 = page.locator('#uye-panel-uyelik [data-pro-conversion="legacy"]');
  ok(await lb2.isDisabled() && (await lb2.getAttribute("title"))?.includes("yalnız ana yönetici"), "D: ana olmayan yöneticide onarım KAPALI (+ açıklama)");
  await page.close();
  await ctx2.close();
  // E — başvuru
  page = await openDetail(ctx, I.pending);
  for (const n of ["7 Günlük Denemeyi Onayla", "Pro Üyeliği Onayla", "Başvuruyu Reddet"]) ok(await quick(page).getByRole("button", { name: n, exact: true }).isVisible() && (await page.getByRole("button", { name: n, exact: true }).count()) === 1, `E başvuru: hızlı işlemlerde '${n}' (tek yerde)`);
  ok((await quick(page).getByRole("button", { name: "Pasife Al ve Arşivle" }).count()) === 0, "E: başvuruda arşivleme sunulmaz");
  ok((await page.locator("header dl").getByText("Kayıt").count()) > 0, "E: bilgi şeridi");
  await page.getByRole("button", { name: "Başvuruyu Reddet", exact: true }).click();
  ok(await page.locator("#reject-title").isVisible(), "E: Reddet → ret onay penceresi (tek tık ret YOK)");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok((await page.locator("#reject-title").count()) === 0, "E: Escape pencereyi kapatır; kayıt değişmez");
  ok((await q1(`select approval_status from public.users where id=$1`, [I.pending])).approval_status === "pending", "E: DB başvuru hâlâ pending");
  await shot(page, "03-durum-E-basvuru-ozet");
  await page.close();
  // Ek durumlar: deneme bitti, reddedilen, arşivde (pasif)
  for (const [k, label] of [["trialEnded", "deneme bitti"], ["rejected", "reddedilen"], ["archived", "arşivde/pasif"]]) {
    page = await openDetail(ctx, I[k]);
    const ov = await overflow(page);
    ok(ov.pageOv <= 0 && ov.n === 0, `ek durum (${label}): sayfa açılır, taşma yok`, ov);
    await page.close();
  }
  await ctx.close();
}

// ───────────── 3b) Deneme yönetimi (Deneme Üyeleri ile aynı uçlar) ─────────────
console.log("\n[3b] Deneme yönetimi detayda: kredi limiti · inceleme · durdur/sürdür · Pro talebini kapat");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.trialMgmt, "#moduller");
  const credit = page.locator("[data-trial-credit]");
  await credit.waitFor({ timeout: 60_000 });
  ok(await credit.getByText("Bugün kullanılan").isVisible() && (await credit.innerText()).includes("0 / 50"), "kredi paneli: bugün 0 / 50 (varsayılan ortak kredi)");
  const inputs = credit.locator("input");
  await inputs.nth(0).fill("40");
  await inputs.nth(2).fill("60");
  const patches = [];
  page.on("request", (r) => { if (r.method() === "PATCH" && new URL(r.url()).pathname === `/api/admin/trials/${I.trialMgmt}`) patches.push(JSON.parse(r.postData() ?? "{}")); });
  await credit.getByRole("button", { name: "Limitleri kaydet" }).click();
  await page.waitForTimeout(1500);
  ok(patches.length === 1 && patches[0].action === "limits" && patches[0].dailyLimit === 40 && patches[0].moduleLimits.human_design === 60, "aynı uç ve gövde: PATCH trials/[id] {action:limits}", patches[0]);
  ok(await page.getByText("Modül limiti günlük ortak limiti aşamaz").first().isVisible(), "modül limiti > ortak limit → sunucu reddeder, hata gösterilir");
  let tp = await q1(`select daily_credit_limit d, module_credit_limits m from public.trial_profiles where user_id=$1`, [I.trialMgmt]);
  ok(!tp || tp.d === 50, "geçersiz limit kaydedilmedi", tp);
  await inputs.nth(2).fill("20");
  await credit.getByRole("button", { name: "Limitleri kaydet" }).click();
  await page.waitForTimeout(1800);
  tp = await q1(`select daily_credit_limit d, module_credit_limits m from public.trial_profiles where user_id=$1`, [I.trialMgmt]);
  ok(tp && tp.d === 40 && Number(tp.m.human_design) === 20, "geçerli limit kaydedildi (40 ortak · HD 20)", tp);
  ok((await credit.innerText()).includes("0 / 40"), "panel yeni limiti gösteriyor (0 / 40)");
  await shot(page, "03b-deneme-kredi-limiti-moduller");
  await selectTab(page, "hesap", "Hesap ve Güvenlik");
  const st = page.locator("[data-trial-state]");
  await st.waitFor();
  const phase = async () => (await q1(`select trial_status s from public.users where id=$1`, [I.trialMgmt])).s;
  await st.getByRole("button", { name: "İncelemeye al" }).click();
  await page.waitForTimeout(1500);
  ok((await phase()) === "review" && (await page.locator("[data-trial-state]").getAttribute("data-trial-state")) === "review", "İncelemeye al → review (DB + panel)");
  await page.locator("[data-trial-state]").getByRole("button", { name: "İncelemeyi kaldır" }).click();
  await page.waitForTimeout(1500);
  ok((await phase()) === "active", "İncelemeyi kaldır → active");
  await page.locator("[data-trial-state]").getByRole("button", { name: "Deneme erişimini durdur" }).click();
  await page.waitForTimeout(1500);
  ok((await phase()) === "suspended", "Deneme erişimini durdur → suspended");
  await shot(page, "03b-deneme-erisimi-hesap-durduruldu");
  const endsBefore = (await q1(`select trial_ends_at e from public.users where id=$1`, [I.trialMgmt])).e?.toISOString();
  await page.locator("[data-trial-state]").getByRole("button", { name: "Erişimi sürdür" }).click();
  await page.waitForTimeout(1500);
  const endsAfter = (await q1(`select trial_ends_at e from public.users where id=$1`, [I.trialMgmt])).e?.toISOString();
  ok((await phase()) === "active" && endsBefore === endsAfter, "Erişimi sürdür → active; deneme bitişi DEĞİŞMEDİ (süre uzamaz)", { endsBefore, endsAfter });
  await page.locator("[data-trial-state]").getByRole("button", { name: "Pro talebini kapat" }).click();
  await page.waitForTimeout(1500);
  const pr = await q1(`select status, close_reason from public.pro_upgrade_requests where user_id=$1 order by created_at desc limit 1`, [I.trialMgmt]);
  ok(pr.status === "closed" && pr.close_reason === "dismissed", "Pro talebini kapat → talep kapandı (dismissed)", pr);
  const ev = (await q1(`select string_agg(action, ',' order by id) a from public.trial_admin_events where target_user_id=$1`, [I.trialMgmt])).a;
  ok(ev === "limits_changed,review_started,review_cleared,trial_suspended,trial_resumed,pro_request_dismissed", "her işlem deneme yönetim kaydına yazıldı", ev);
  await ctx.close();
  const ctxL = await ctxFor(O);
  const p2 = await ctxL.newPage();
  await p2.goto(`${BASE}/admin/deneme-uyeleri`, { waitUntil: "domcontentloaded" });
  await p2.getByText("ZZ_UD2 Deniz Deneme Yönetimi").first().waitFor({ timeout: 120_000 });
  ok(true, "Deneme Üyeleri ekranı açılıyor ve aynı üyeyi listeliyor (ekran korunur)");
  await ctxL.close();
}

// ───────────── 4) Ödeme akışları ─────────────
console.log("\n[4] Ödeme: formu doldur ≠ kaydet · muafiyet gerekçesi zorunlu");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.proPaid);
  await selectTab(page, "uyelik", "Üyelik ve Ödeme");
  await openPayment(page);
  const posts = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/payment$/.test(new URL(r.url()).pathname)) posts.push(r.url()); });
  const hBefore = (await q1(`select count(*)::int n from public.user_payment_history where user_id=$1`, [I.proPaid])).n;
  await page.getByRole("button", { name: "Tahsilat geldi · formu doldur" }).click();
  await page.waitForTimeout(500);
  ok(posts.length === 0, "'Tahsilat geldi · formu doldur' sunucuya istek GÖNDERMEZ");
  ok(await page.getByText("Form dolduruldu").isVisible(), "form dolduruldu uyarısı görünür (kaydedilmedi)");
  await shot(page, "04-odeme-formu-dolduruldu-kaydedilmedi");
  const status = page.locator("#uye-panel-uyelik label:has-text('Ödeme Durumu') select").first();
  const note = page.locator("#uye-panel-uyelik label:has-text('Ödeme Notu') textarea").first();
  await status.selectOption("exempt");
  await note.fill("");
  await page.getByRole("button", { name: "Ödemeyi Kaydet" }).click();
  await page.waitForTimeout(600);
  ok(posts.length === 0 && await page.getByText("Muafiyet gerekçesi gerekli").first().isVisible(), "muaf + boş gerekçe → kayıt engellenir, istek yok");
  await shot(page, "04-odeme-muaf-gerekce-zorunlu");
  await note.fill("ZZ sentetik muafiyet gerekçesi");
  const resp = page.waitForResponse((r) => r.request().method() === "POST" && /\/payment$/.test(new URL(r.url()).pathname), { timeout: 120_000 });
  await page.getByRole("button", { name: "Ödemeyi Kaydet" }).click();
  ok((await resp).status() === 200, "kayıt isteği mevcut uca gitti (200)");
  await page.waitForTimeout(800);
  const row = await q1(`select payment_status, payment_note from public.users where id=$1`, [I.proPaid]);
  const hAfter = (await q1(`select count(*)::int n from public.user_payment_history where user_id=$1`, [I.proPaid])).n;
  ok(posts.length === 1 && row.payment_status === "exempt" && row.payment_note === "ZZ sentetik muafiyet gerekçesi", "gerekçeli muafiyet mevcut uçla kaydedilir (users)", row);
  ok(hAfter === hBefore + 1, "ödeme geçmişine tek satır eklendi (çift kayıt yok)", { hBefore, hAfter });
  await ctx.close();
}

// ───────────── 5) Pro geçişi ödeme kaydetmez ─────────────
console.log("\n[5] Pro geçişi (deneme → Pro) · ödeme ayrı");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.trialAct);
  const before = await q1(`select payment_status, (select count(*)::int from public.user_payment_history h where h.user_id=u.id) n from public.users u where id=$1`, [I.trialAct]);
  await selectTab(page, "uyelik", "Üyelik ve Ödeme");
  await page.locator('#uye-panel-uyelik [data-pro-conversion="trial"]').click();
  await page.getByText("Bu pencere ödeme kaydetmez").waitFor();
  ok(true, "Pro penceresi: 'Bu pencere ödeme kaydetmez' uyarısı");
  await shot(page, "05-pencere-pro-gecis", false);
  const submit = page.locator('[role="dialog"]').getByRole("button", { name: "Pro Üyeliğe Geçir", exact: true });
  ok(await submit.isDisabled(), "onay kutusu işaretlenmeden gönderilemez");
  await page.locator('input[type="checkbox"]').last().check();
  await submit.click();
  await page.waitForTimeout(2500);
  const after = await q1(`select package_type, payment_status, (select count(*)::int from public.user_payment_history h where h.user_id=u.id) n from public.users u where id=$1`, [I.trialAct]);
  ok(String(after.package_type).toLowerCase() === "premium", "Pro geçişi mevcut uçla yapıldı (package premium)", after);
  ok(after.payment_status === before.payment_status && after.n === before.n, "ödeme durumu / geçmişi DEĞİŞMEDİ (Pro ≠ ödeme)", { before, after });
  ok(await page.locator("#uye-panel-uyelik").isVisible() && await page.getByText("ödeme bilgisi henüz kaydedilmedi").first().isVisible(), "başarıdan sonra Üyelik ve Ödeme + 'ödeme henüz kaydedilmedi' hatırlatması");
  await shot(page, "05-pro-sonrasi-odeme-hatirlatmasi");
  await ctx.close();
}

// ───────────── 6) Modül izinleri: anında, tek anahtar, alt izin korunur ─────────────
console.log("\n[6] Modüller: anında kayıt · yalnız değişen anahtar · alt izin korunur");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.proPaid);
  await selectTab(page, "moduller", "Modüller ve Kredi");
  const switchNames = await page.locator("#uye-panel-moduller #uye-erisim [role='switch']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  const want19 = ["Danışan Yönetimi", "Ajanda", "Numeroloji", "Numeroloji — Gelecek Yılları Göster", "Doğaltaş", "Ürün & Stok Merkezi", "Şifa Rehberi", "Refleksoloji", "Biyoenerji", "Aromaterapi", "Belge Çeviri Merkezi", "Dijital İçerik Merkezi", "Human Design", "Human Design — Sistem Yorumu", "Kozmik Takvim / Yaşam Takvimi", "Kupa & Hacamat", "Beslenme", "Astroloji", "Astroloji — Otomatik Yorum"];
  ok(switchNames.length === 19 && want19.every((n) => switchNames.includes(n)), "19 anahtarın hepsi ekranda (15 modül + Dijital İçerik Merkezi + 3 alt yetki)", switchNames);
  ok(await page.getByText("Kaydet düğmesi yoktur").isVisible(), "modül kaydının anında ve ayrı ayrı olduğu açıkça yazıyor");
  const bodies = [];
  page.on("request", (r) => { if (r.method() === "PATCH" && new URL(r.url()).pathname === `/api/admin/users/${I.proPaid}`) bodies.push(r.postData()); });
  await page.getByRole("switch", { name: "Human Design", exact: true }).click();
  await page.waitForTimeout(1500);
  const perms = (await q1(`select module_permissions m from public.users where id=$1`, [I.proPaid])).m;
  ok(bodies.length === 1 && JSON.parse(bodies[0]).changes && Object.keys(JSON.parse(bodies[0]).changes).join() === "human_design", "tek PATCH, yalnız değişen anahtar", bodies);
  ok(perms.human_design === false && perms.hd_system_reading === true, "ana modül kapandı; alt izin (Sistem Yorumu) SİLİNMEDİ", perms);
  await shot(page, "06-moduller-ve-kredi");
  await page.getByRole("switch", { name: "Human Design", exact: true }).click();
  await page.waitForTimeout(1200);
  ok((await q1(`select module_permissions m from public.users where id=$1`, [I.proPaid])).m.human_design === true, "geri açıldı (sentetik hesapta eski hali)");
  await ctx.close();
}

// ───────────── 7) Tehlikeli pencereler ─────────────
console.log("\n[7] Pasif yap · Arşivle · Tüm cihazlardan çıkış (onay metinleri)");
{
  const ctx = await ctxFor(O);
  const page = await openDetail(ctx, I.proPaid, "#gelismis");
  ok((await page.locator('[role="tab"][aria-selected="true"]').getAttribute("data-tab")) === "hesap", "eski #gelismis adresi → Hesap ve Güvenlik");
  await page.getByRole("button", { name: "Pasif Yap" }).click();
  ok(await page.locator("#deactivate-title").isVisible(), "Pasif Yap → onay penceresi");
  await shot(page, "07-pencere-pasif-yap", false);
  await page.getByRole("button", { name: "Vazgeç" }).first().click();
  ok((await q1(`select active from public.users where id=$1`, [I.proPaid])).active === true, "Vazgeç → hesap aktif kalır");
  await page.getByRole("button", { name: "Pasife Al ve Arşivle" }).click();
  await page.getByRole("button", { name: "Evet, devam et" }).click();
  const dSubmit = page.locator('[role="dialog"]').getByRole("button", { name: /Pasife Al ve Arşivle|Arşivle/ }).last();
  await page.locator('[role="dialog"] input[placeholder="PASİFE AL VE ARŞİVLE"]').fill("ARŞİVLE");
  ok(await dSubmit.isDisabled(), "arşiv: yanlış onay metni → düğme kapalı");
  await shot(page, "07-pencere-arsivle-dogrulama", false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok((await page.locator('[role="dialog"]').count()) === 0, "arşiv: Escape kapatır");
  await page.getByRole("button", { name: "Tüm Cihazlardan Çıkış" }).click();
  await page.getByRole("button", { name: "Devam et" }).click();
  await page.locator('[role="dialog"] input').last().fill("ÇIKIŞ YAP");
  ok(await page.locator('[role="dialog"]').getByRole("button", { name: "Tüm cihazlardan çıkış yaptır" }).isDisabled(), "tüm cihazlardan çıkış: yanlış metin → kapalı");
  await shot(page, "07-pencere-tum-cihazlardan-cikis", false);
  await page.keyboard.press("Escape");
  await ctx.close();
}

// ───────────── 8) Yetki (sunucu) ─────────────
console.log("\n[8] Yetki: sunucu kontrolleri (arayüzle aynı kimlik başlıkları: x-admin-id + x-session-token)");
{
  const H = (who, json = false) => ({ "x-admin-id": who.user.id, "x-session-token": who.token, ...(json ? { "content-type": "application/json" } : {}) });
  const r0 = await fetch(`${BASE}/api/admin/users/${I.proPaid}`, { headers: H(O) });
  ok(r0.status === 200, "kontrol: ana yönetici kimliğiyle okuma 200 (başlıklar geçerli)", r0.status);
  const r1 = await fetch(`${BASE}/api/admin/users/${I.proPaid}`, { headers: H(E) });
  ok(r1.status === 401 || r1.status === 403, "uzman oturumu yönetim API'sini okuyamaz", r1.status);
  const r2 = await fetch(`${BASE}/api/admin/users/${I.proPaid}`);
  ok(r2.status === 401 || r2.status === 403, "oturumsuz istek reddedilir", r2.status);
  const r2b = await fetch(`${BASE}/api/admin/users/${I.proPaid}`, { headers: { "x-admin-id": O.user.id, "x-session-token": E.token } });
  ok(r2b.status === 401 || r2b.status === 403, "başka kullanıcının oturumuyla yönetici kimliği taklit edilemez", r2b.status);
  const r3 = await fetch(`${BASE}/api/admin/users/${I.legacy}/status`, {
    method: "POST", headers: H(A2, true), body: JSON.stringify({ action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "" }),
  });
  ok(r3.status === 403, "ana olmayan yönetici eski kayıt onarımı yapamaz (sunucu 403)", r3.status);
  const r4 = await fetch(`${BASE}/api/admin/users/00000000-0000-4000-8000-00000000ffff/status`, {
    method: "POST", headers: H(O, true), body: JSON.stringify({ action: "reject" }),
  });
  ok(r4.status >= 400 && r4.status < 500, "olmayan üye kimliğiyle işlem yapılamaz", r4.status);
  const r5 = await fetch(`${BASE}/api/admin/users/${I.proPaid}/logout-all`, { method: "POST", headers: H(O, true), body: JSON.stringify({ confirm: "ÇIKIŞ YAP" }) });
  ok(r5.status >= 400 && r5.status < 500, "yanlış onay metniyle tüm cihazlardan çıkış sunucuda reddedilir", r5.status);
  ok((await q1(`select package_type from public.users where id=$1`, [I.legacy])).package_type === null, "eski kayıt değişmedi");
  // Owner kararı (11.11.2026): YENİ muafiyet sunucuda da gerekçesiz reddedilir; hiçbir şey yazılmaz.
  {
    const before = await q1(`select md5(u::text) h, (select count(*)::int from public.user_payment_history x where x.user_id=u.id) n from public.users u where id=$1`, [I.archived]);
    const r6 = await fetch(`${BASE}/api/admin/users/${I.archived}/payment`, {
      method: "POST", headers: H(O, true),
      body: JSON.stringify({ draft: { status: "exempt", lastPaymentDate: "", nextPaymentDate: "", paidAmount: "", note: "  ", agreedFee: "", billingPeriod: "" } }),
    });
    const after = await q1(`select md5(u::text) h, (select count(*)::int from public.user_payment_history x where x.user_id=u.id) n from public.users u where id=$1`, [I.archived]);
    ok(r6.status === 400 && before.h === after.h && before.n === after.n, "doğrudan API: gerekçesiz YENİ muafiyet sunucuda reddedilir (400), satır ve geçmiş değişmez", { status: r6.status, before, after });
  }
}

// ───────────── 9) Genişlikler · uzun içerik · mobil sekme ─────────────
console.log("\n[9] Genişlikler 320/360/390/768/1024/1280/1440 · uzun içerik");
for (const w of [320, 360, 390, 768, 1024, 1280, 1440]) {
  const ctx = await ctxFor(O, { width: w, height: 900 });
  for (const [who, id] of [["pro", I.proPaid], ["uzun", I.longName]]) {
    const page = await openDetail(ctx, id);
    for (const [tid, label] of TABS) {
      await selectTab(page, tid, label);
      const ov = await overflow(page);
      const vis = await page.evaluate((t) => {
        const b = document.querySelector(`[role="tab"][data-tab="${t}"]`).getBoundingClientRect();
        const n = document.querySelector('[role="tablist"]').getBoundingClientRect();
        return b.left >= n.left - 1 && b.right <= n.right + 1;
      }, tid);
      ok(ov.pageOv <= 0 && ov.n === 0 && vis, `${w}px · ${who} · ${label}: taşma yok, aktif sekme görünür`, { ov, vis });
      if (tid === "hesap") {
        const qv = await quick(page).evaluate((q) => {
          const vw = document.documentElement.clientWidth;
          return [...q.querySelectorAll("button")].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 24), ok: r.width > 0 && r.height >= 40 && r.left >= -1 && r.right <= vw + 1 }; });
        });
        const overlap = await quick(page).evaluate((q) => {
          const rs = [...q.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
          for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return true; }
          return false;
        });
        ok(qv.length >= 3 && qv.every((x) => x.ok) && !overlap, `${w}px · ${who}: hızlı işlem düğmeleri tam görünür (≥40 px), üst üste binme yok`, { qv, overlap });
      }
      if ((w <= 390 && who === "pro") || (w === 1440 && who === "pro" && tid === "hesap") || (who === "uzun" && tid === "hesap" && (w === 320 || w === 1280))) {
        await shot(page, `09-${w}px-${who}-${tid}`);
      }
    }
    await page.close();
  }
  await ctx.close();
}

// ───────────── 10) Regresyon: liste → detay → liste ─────────────
console.log("\n[10] Liste V2 → detay → liste dönüşü");
{
  const ctx = await ctxFor(O);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/users?f=eski`, { waitUntil: "domcontentloaded" });
  const link = page.locator(`a[href="/admin/users/${I.legacy}"]`).first();
  await link.waitFor({ timeout: 120_000 });
  await link.click();
  await page.locator("#uye-detay-ad").waitFor({ timeout: 120_000 });
  ok((await page.locator("#uye-detay-ad").innerText()).includes("ZZ_UD2 Eski Kayıt"), "liste (Eski kayıt filtresi) → doğru üyenin detayı");
  await page.getByRole("link", { name: "Üye Listesine Dön" }).click();
  await page.waitForURL(/\/admin\/users\?/, { timeout: 60_000 });
  ok(page.url().includes("f=eski"), "detaydan dönüş filtreyi korur", page.url());
  await ctx.close();
}

ok(consoleErrors.length === 0, "tarayıcı konsolunda hata yok", consoleErrors.slice(0, 5));
await browser.close();
await db.end();
console.log(`\nÜYE DETAYI V2/V3 UI: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
