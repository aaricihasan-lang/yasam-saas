// HORARY-W KAYIT / ARŞİV (2026-10-29) — William Lilly Horary kaydet, kayıtlı haritayı aç, Analiz Arşivi "Horary Soruları",
// kayıtlı Word/PDF (Playwright Chromium). YEREL; sahte PostgREST (dev-fake-backend; tablo kısıtlarının gerçek PostgreSQL kanıtı:
// scripts/astrology/pg/horary-questions.mjs). Önkoşul: next sunucusu ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_ATLAS_HORARY_PREVIEW=1,
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake> + dev-fake-backend.
// Çalıştırma: node scripts/astrology/horaryWesternRecords-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
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
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const REC = `${ORIGIN}/api/admin/astroloji/horary/western/records`;
const j = async (url, init = {}) => {
  const r = await fetch(url, { headers: H, ...init });
  let b = null;
  try {
    b = await r.json();
  } catch {}
  return { s: r.status, b };
};
const VIEWS = [
  ["masaustu", 1366, 768],
  ["masaustu-genis", 1536, 864],
  ["tablet-yatay", 1024, 768],
  ["tablet-dikey", 768, 1024],
  ["mobil", 390, 844],
  ["mobil-dar", 320, 640],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Çalıştırmaya özgü ek: sahte DB önceki çalıştırmaların kayıtlarını tutabilir → başlıklar yalıtılır. */
const RUN = randomUUID().slice(0, 6);
const T1 = `E2E Ortaklık DEMO ${RUN}`;
const T2 = `E2E Meslek ${RUN}`;
async function login(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return ctx;
}
const shot = async (page, name, full = true) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
};
async function audit(page, items) {
  const bad = [];
  for (const [label, loc, minH] of items) {
    if ((await loc.count()) === 0) {
      bad.push(`${label}: bulunamadı`);
      continue;
    }
    const el = loc.first();
    await el.scrollIntoViewIfNeeded();
    const m = await el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), r.top + r.height / 2);
      let clipped = false;
      for (let p = node.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") {
          const pr = p.getBoundingClientRect();
          if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) clipped = true;
        }
      }
      return { l: r.left, rr: r.right, h: r.height, w: r.width, vw, hit: !!hit && (hit === node || node.contains(hit) || hit.contains(node)), clipped };
    });
    const why = [];
    if (m.l < -0.5 || m.rr > m.vw + 0.5) why.push(`alan dışı ${Math.round(m.l)}–${Math.round(m.rr)}/${m.vw}`);
    if (m.clipped) why.push("kırpılıyor");
    if (!m.hit) why.push("üstünde başka öğe");
    if (m.h < minH - 0.5) why.push(`yükseklik ${Math.round(m.h)}<${minH}`);
    if (why.length) bad.push(`${label}: ${why.join(", ")}`);
  }
  return bad;
}
async function newResult(page, { time, house } = {}) {
  await page.goto(`${ORIGIN}/admin/astroloji#horary-lilly`, { waitUntil: "load", timeout: 240000 });
  await page.getByTestId("horary-form").waitFor({ timeout: 120000 });
  await page.getByTestId("horary-demo").click();
  if (time) await page.getByTestId("horary-time").fill(time);
  if (house) await page.getByTestId("horary-house").selectOption(String(house));
  await page.getByTestId("horary-submit").click();
  await page.getByTestId("horary-result").waitFor({ timeout: 60000 });
}
const docxText = async (buf) => {
  const z = await JSZip.loadAsync(buf);
  return [...(await z.file("word/document.xml").async("string")).matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
};

(async () => {
  // API: yetki ve doğrulama.
  ok("kayıt listesi oturumsuz → 404", (await fetch(REC)).status === 404);
  ok("kayıt aç oturumsuz → 404", (await fetch(`${REC}/${randomUUID()}`)).status === 404);
  ok("kayıtlı rapor oturumsuz → 404", (await fetch(`${REC}/${randomUUID()}/report?format=pdf`)).status === 404);
  ok("tahmin edilen kayıt kimliği → 404", (await j(`${REC}/${randomUUID()}`)).s === 404);
  ok("bozuk kimlik → 404", (await j(`${REC}/abc`)).s === 404);
  const badTitle = await j(REC, { method: "POST", body: JSON.stringify({ date: "2026-10-29", time: "14:30", locationId: "tr-34-istanbul", quesitedHouse: 7, title: "", saveRequestId: randomUUID() }) });
  ok("başlıksız kayıt → 400", badTitle.s === 400 && badTitle.b?.field === "title");
  const crossClient = await j(REC, { method: "POST", body: JSON.stringify({ date: "2026-10-29", time: "14:30", locationId: "tr-34-istanbul", quesitedHouse: 7, title: "x", clientId: randomUUID(), saveRequestId: randomUUID() }) });
  ok("yetkisiz / var olmayan danışan → 400 CLIENT_NOT_FOUND", crossClient.s === 400 && crossClient.b?.code === "CLIENT_NOT_FOUND");

  const browser = await chromium.launch();
  try {
    const ctx = await login(browser, 1366, 768);
    const page = await ctx.newPage();
    let posts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/horary\/western\/records$/.test(r.url())) posts++;
    });
    // 1) Danışansız kayıt; soru metni varsayılan SAKLANMAZ; çift tıklama tek kayıt.
    await newResult(page);
    const sq = page.getByTestId("horary-save-question");
    ok("'Soru metnini de kaydet' varsayılan KAPALI", (await sq.count()) === 1 && !(await sq.isChecked()));
    await page.getByTestId("horary-save-title").fill(T1);
    await shot(page, "30-kaydet-cubugu");
    posts = 0;
    await Promise.all([page.getByTestId("horary-save").click(), page.getByTestId("horary-save").click({ timeout: 800 }).catch(() => {})]);
    await page.getByTestId("horary-save-msg").waitFor({ timeout: 30000 });
    ok("kaydedildi durumu gösterilir", /Kaydedildi/.test(await page.getByTestId("horary-save-msg").innerText()));
    ok("çift tıklama → tek istek", posts === 1, `istek ${posts}`);
    const l1 = await j(`${REC}?q=${encodeURIComponent(RUN)}`);
    const r1 = (l1.b?.records ?? []).filter((x) => x.title === T1);
    ok("veritabanında tek kayıt, DEMO işaretli, yöntem sürümü var", r1.length === 1 && r1[0].isDemo === true && /^lilly-1647@/.test(r1[0].methodologyVersion));
    const g1 = await j(`${REC}/${r1[0]?.id}`);
    ok("soru metni saklanmadı (questionText null)", g1.s === 200 && g1.b.record.questionText === null);
    ok("kayıtlı sonuç ekrandaki hesapla aynı (UTC)", g1.b?.result?.question?.utc === "2026-10-29T11:30:00Z");

    // 2) Danışan bağlı + açık izinle soru metni.
    await newResult(page, { time: "15:00", house: 10 });
    await page.getByTestId("horary-save-title").fill(T2);
    await page.getByTestId("horary-save-client-q").fill("Ali");
    await page.getByTestId("horary-save-client-search").click();
    await page.getByTestId("horary-save-client-results").getByRole("button").first().click();
    ok("danışan seçildi", (await page.getByTestId("horary-save-client-picked").innerText()).length > 0);
    await page.getByTestId("horary-save-question").check();
    await page.getByTestId("horary-save").click();
    await page.getByTestId("horary-saved-open").waitFor({ timeout: 30000 });
    await shot(page, "31-kaydedildi");
    await page.getByTestId("horary-saved-open").click();
    await page.getByTestId("horary-saved-bar").waitFor({ timeout: 60000 });
    ok("kayıtlı harita açıldı (#horary-lilly/kayit/<id>)", /#horary-lilly\/kayit\/[0-9a-f-]{36}$/.test(page.url()));
    const meta = await page.getByTestId("horary-saved-meta").innerText();
    ok("kayıtlı harita: KAYITLI HARİTA + yöntem sürümü + değişmezlik notu", /KAYITLI HARİTA/.test(meta) && /lilly-1647@/.test(meta) && /değişmez/.test(meta));
    ok("kayıtlı harita: danışan etiketi", (await page.getByTestId("horary-saved-client-picked").innerText()).length > 0);
    ok("kayıtlı harita: çark ve bulgular", (await page.getByTestId("horary-wheel").locator("svg").count()) >= 1 && (await page.getByTestId("horary-summary").isVisible()));
    const recId = /kayit\/([0-9a-f-]{36})/.exec(page.url())[1];
    const g2 = await j(`${REC}/${recId}`);
    ok("açık izinle soru metni saklandı", g2.b?.record?.questionText === "DEMO — Bu ortaklık teklifi gerçekleşecek mi?");
    await shot(page, "32-kayitli-harita");
    // Kayıtlı haritadan Word: başlık, danışan, kayıtlı sonuç; soru metni işaretliyken var.
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByTestId("horary-report-docx").click()]);
    const wt = await docxText(fs.readFileSync(await dl.path()));
    ok("kayıtlı Word: başlık + danışan + 'Kayıtlı sonuç' + soru metni", wt.includes(T2) && wt.includes("Kayıtlı sonuç") && wt.includes("ortaklık teklifi") && /Danışan/.test(wt));
    await page.getByTestId("horary-report-question").uncheck();
    const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByTestId("horary-report-pdf").click()]);
    const pb = fs.readFileSync(await dl2.path());
    ok("kayıtlı PDF: gerçek PDF", pb.subarray(0, 5).toString("latin1") === "%PDF-" && pb.byteLength > 60000);
    // Başlık düzenleme.
    await page.getByTestId("horary-saved-title").fill(`${T2} (düzenlendi)`);
    await page.getByTestId("horary-saved-title-save").click();
    await page.getByTestId("horary-saved-msg").waitFor();
    ok("başlık güncellendi", /Başlık güncellendi/.test(await page.getByTestId("horary-saved-msg").innerText()) && (await j(`${REC}/${recId}`)).b.record.title === `${T2} (düzenlendi)`);
    // Yenileme: kayıtlı harita geri gelir.
    await page.reload({ waitUntil: "load" });
    await page.getByTestId("horary-saved-bar").waitFor({ timeout: 120000 });
    ok("sayfa yenileme → kayıtlı harita korunur", (await page.getByTestId("horary-saved-title").inputValue()) === `${T2} (düzenlendi)`);

    // 3) Arşiv: "Kayıtlı sorular" → Horary sekmesi; arama / tarih / danışan; satırdan açma; Doğum Profilleri sekmesi.
    await page.getByTestId("horary-open-archive").click();
    await page.getByTestId("horary-archive").waitFor({ timeout: 60000 });
    ok("Kayıtlı sorular → Analiz Arşivi 'Horary Soruları' sekmesi", (await page.getByTestId("archive-mode-horary").getAttribute("aria-selected")) === "true");
    await page.getByTestId("horary-archive-rows").waitFor({ timeout: 30000 });
    const rowsAll = await page.getByTestId("horary-archive-rows").locator("li").count();
    ok("arşiv listesinde kayıtlar", rowsAll >= 2, `${rowsAll}`);
    await shot(page, "33-arsiv-horary");
    await page.getByTestId("horary-archive-q").fill(`Meslek ${RUN}`);
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=horary-archive-rows] li").length === 1, null, { timeout: 15000 }).catch(() => {});
    ok("arama: başlık 'Meslek' → 1 satır", (await page.getByTestId("horary-archive-rows").locator("li").count()) === 1);
    await page.getByTestId("horary-archive-q").fill("");
    await page.getByTestId("horary-archive-from").fill("2027-01-01");
    await page.getByTestId("horary-archive-empty").waitFor({ timeout: 15000 });
    ok("tarih filtresi (2027+) → kayıt yok mesajı", /filtrelere uyan/.test(await page.getByTestId("horary-archive-empty").innerText()));
    await page.getByTestId("horary-archive-from").fill("");
    await page.getByTestId("horary-archive-client-q").fill("Ali");
    await page.getByTestId("horary-archive-client-search").click();
    await page.getByTestId("horary-archive-client-results").getByRole("button").first().click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=horary-archive-rows] li").length === 1, null, { timeout: 15000 }).catch(() => {});
    // Danışan + bu çalıştırmanın eki: yalnız danışanlı kayıt (önceki çalıştırmaların kayıtları ek ile dışlanır).
    await page.getByTestId("horary-archive-q").fill(RUN);
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=horary-archive-rows] li").length === 1, null, { timeout: 15000 }).catch(() => {});
    ok("danışan filtresi → yalnız danışanlı kayıt", (await page.getByTestId("horary-archive-rows").locator("li").count()) === 1 && (await page.getByTestId("horary-archive-rows").innerText()).includes(T2));
    await shot(page, "34-arsiv-filtre-danisan");
    await page.getByTestId("horary-archive-rows").locator("[data-horary-open]").first().click();
    await page.getByTestId("horary-saved-bar").waitFor({ timeout: 60000 });
    ok("arşiv satırı → kayıtlı harita açılır", (await page.getByTestId("horary-saved-title").inputValue()).startsWith(T2));
    await page.goto(`${ORIGIN}/admin/astroloji#analiz-arsivi`, { waitUntil: "load" });
    await page.getByTestId("archive-mode-switch").waitFor({ timeout: 120000 });
    await page.getByTestId("archive-mode-profiles").click();
    ok("Doğum Profilleri sekmesi mevcut arşivi gösterir", await page.getByTestId("astro-archive-list").isVisible());
    // Bilinmeyen kayıt kimliği.
    await page.goto(`${ORIGIN}/admin/astroloji#horary-lilly/kayit/${randomUUID()}`, { waitUntil: "load" });
    await page.getByTestId("horary-record-error").waitFor({ timeout: 120000 });
    ok("bilinmeyen kayıt → 'bulunamadı / yetki yok' + yeni soru seçeneği", /bulunamadı/.test(await page.getByTestId("horary-record-error").innerText()));
    // Kayıt 5xx (simüle) → hata + tekrar dene; girdiler korunur.
    await newResult(page, { time: "16:00" });
    await page.route("**/horary/western/records", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue()));
    await page.getByTestId("horary-save").click();
    await page.getByTestId("horary-save-msg").waitFor();
    ok("kayıt 5xx (simüle) → Türkçe hata + 'Tekrar dene'", /yapılamadı/.test(await page.getByTestId("horary-save-msg").innerText()) && /Tekrar dene/.test(await page.getByTestId("horary-save").innerText()));
    await page.unroute("**/horary/western/records");
    await page.getByTestId("horary-save").click();
    await page.getByTestId("horary-saved-open").waitFor({ timeout: 30000 });
    ok("tekrar deneme → kaydedildi", true);
    await ctx.close();

    // 4) Görünümler: kayıt çubuğu, kayıtlı harita, arşiv — denetim ölçümleri + ekran görüntüleri.
    for (const [name, w, h] of VIEWS) {
      const c = await login(browser, w, h);
      const p = await c.newPage();
      await newResult(p);
      const b1 = await audit(p, [
        ["kayıt başlığı", p.getByTestId("horary-save-title"), 44],
        ["danışan ara", p.getByTestId("horary-save-client-q"), 44],
        ["danışan Ara düğmesi", p.getByTestId("horary-save-client-search"), 44],
        ["Kaydet", p.getByTestId("horary-save"), 44],
        ["soru metnini de kaydet (etiket)", p.getByTestId("horary-save-question").locator("xpath=.."), 44],
        ["Kayıtlı sorular", p.getByTestId("horary-open-archive"), 44],
      ]);
      ok(`${name} ${w}×${h}: kayıt çubuğu denetimleri görünür / kırpılmamış / ≥44 px`, b1.length === 0, b1.join(" | "));
      await p.getByTestId("horary-save-bar").scrollIntoViewIfNeeded();
      await shot(p, `40-${name}-${w}x${h}-kaydet`, false);
      await p.goto(`${ORIGIN}/admin/astroloji#horary-lilly/kayit/${recId}`, { waitUntil: "load" });
      await p.getByTestId("horary-saved-bar").waitFor({ timeout: 120000 });
      const b2 = await audit(p, [
        ["kayıtlı başlık", p.getByTestId("horary-saved-title"), 44],
        ["başlık Kaydet", p.getByTestId("horary-saved-title-save"), 44],
        ["danışan bağlantısını kaldır", p.getByTestId("horary-saved-client-clear"), 44],
        ["Word indir", p.getByTestId("horary-report-docx"), 44],
        ["PDF indir", p.getByTestId("horary-report-pdf"), 44],
        ["Yeni Horary sorusu", p.getByTestId("horary-new-question"), 44],
      ]);
      ok(`${name}: kayıtlı harita denetimleri görünür / kırpılmamış / ≥44 px`, b2.length === 0, b2.join(" | "));
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${name}: kayıtlı haritada yatay taşma yok`, over <= 1, `${over}px`);
      await p.getByTestId("horary-saved-bar").scrollIntoViewIfNeeded();
      await shot(p, `41-${name}-${w}x${h}-kayitli-harita`, false);
      await p.getByTestId("horary-open-archive").click();
      await p.getByTestId("horary-archive-rows").waitFor({ timeout: 60000 });
      const b3 = await audit(p, [
        ["arşiv: Doğum Profilleri", p.getByTestId("archive-mode-profiles"), 44],
        ["arşiv: Horary Soruları", p.getByTestId("archive-mode-horary"), 44],
        ["arşiv arama", p.getByTestId("horary-archive-q"), 40],
        ["arşiv tarih başlangıç", p.getByTestId("horary-archive-from"), 40],
        ["arşiv tarih bitiş", p.getByTestId("horary-archive-to"), 40],
        ["arşiv danışan ara", p.getByTestId("horary-archive-client-q"), 44],
        ["arşiv satır aç", p.getByTestId("horary-archive-rows").locator("[data-horary-open]").first(), 24],
      ]);
      ok(`${name}: Horary arşivi denetimleri görünür / kırpılmamış`, b3.length === 0, b3.join(" | "));
      const over2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(`${name}: arşivde yatay taşma yok`, over2 <= 1, `${over2}px`);
      await shot(p, `42-${name}-${w}x${h}-arsiv`);
      await c.close();
    }
  } finally {
    await browser.close();
  }
  await sleep(10);
  console.log(`\nastrology horary-western KAYIT/ARŞİV UI e2e: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
