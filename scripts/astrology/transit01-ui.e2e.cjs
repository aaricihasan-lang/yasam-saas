// TRANSİT-01 (2026-10-17) — gerçek tarayıcı (Playwright Chromium) uçtan uca. YEREL; sahte DB + sahte Roxy (KATI mod:
// yalnız birebir golden gövdeye gerçek golden yanıt; GERÇEK Roxy YOK).
// Önkoşul: yerel `next start` (PORT, ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>) +
//          dev-fake-backend (<fake>/<fake+1>, FAKE_ROXY_CERT/KEY) — sayaç için fake backend log dosyası verilir.
// Çalıştırma: node scripts/astrology/transit01-ui.e2e.cjs <genişlik> <yükseklik> <fake-backend.log> [android] [port]
//   android = "android" → Android WebView kullanıcı ajanı (fiziksel cihaz testi DEĞİLDİR; yalnız UA öykünmesi).
//
//   1 Yeni Analiz: transit 3 kip (şimdi / seçilen gün / gün + saat) + saat dilimi + hesaplanacak UTC anı ön izlemesi;
//     takvim başlangıç + bitiş (gün sayısı) seçimi.
//   2 Transit sonucu: yerel an + bölge + UTC; özet + açı türü sayımı; En güçlü transitler (≤5, güç sırası); filtreler
//     (gezegen / natal nokta / tür / güç / seyir) + boş sonuç + temizle; Güç sütunu; natal ev; çift halka haritası.
//   3 Transit Takvimi: önem puanı + açıklaması; gün seçimi → Seçilen Günün Transit Ayrıntısı (natal etkiler ↔ genel
//     gökyüzü); plan ücretsiz (0 istek); kayıtlı an → 0 istek ile transit sekmesi + Kesinleşme sütunu; kayıtsız an →
//     "1 yeni hesaplama isteği" önizlemesi, Vazgeç → istek yok.
//   4 Kayıt: kaydet → kayıtlı analiz Word/PDF (API) içerikleri; sayfada yatay taşma yok; konsol hatası yok.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");

const [W = "1366", H = "860", LOG = "", UA = "", PORT = "3941"] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const android = UA === "android";
const tag = `${width}px${android ? " Android-UA" : ""}`;
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/admin/astroloji`;
const API = `${ORIGIN}/api/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const HDR = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}`, origin: ORIGIN };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const SHOTS = process.env.SHOTS || "";
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-${name}.png`, fullPage: false }); };
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const api = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    /* ikili gövde */
  }
  return { status: r.status, json, buf };
};
async function overflowOffenders(page, rootSel) {
  return page.evaluate(
    ({ rootSel, vw }) => {
      const root = document.querySelector(rootSel);
      if (!root) return ["kök yok"];
      const out = [];
      const scrollable = (el) => {
        for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 1) return true;
        }
        return false;
      };
      for (const el of root.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]") || el.closest("svg")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if ((r.right > vw + 1 || r.left < -1) && !scrollable(el)) {
          const txt = (el.textContent || "").trim().slice(0, 40);
          if (txt || el.tagName === "TABLE") out.push(`${el.tagName.toLowerCase()} [${Math.round(r.left)}–${Math.round(r.right)}] "${txt}"`);
        }
        if (out.length > 6) break;
      }
      return out;
    },
    { rootSel, vw: width },
  );
}

(async () => {
  // Golden kişi (sahte Roxy yalnız bu doğum verisine gerçek golden döner) — seed profili "Ali Örnek — natal".
  const prof = await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`);
  const pid = prof.json?.items?.[0]?.id ?? prof.json?.profiles?.[0]?.id;
  ok("hazırlık: golden doğum profili bulundu", typeof pid === "string", JSON.stringify(prof.json).slice(0, 160));
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    ...(android ? { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36" } : {}),
  });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("dialog", (d) => void d.dismiss());

  // ── 1) Yeni Analiz
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
  await page.locator("[data-portal=new]").first().click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
  await page.waitForTimeout(1200);
  for (const id of ["western.natal", "western.transit", "western.forecast"]) {
    await page.locator(`button[data-technique='${id}']`).first().click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(600);
  await page.locator("[data-technique-focus='western.transit']").first().click();
  await page.waitForTimeout(500);
  const moment = page.locator("[data-testid=astro-transit-moment]").first();
  ok("transit anı: 3 kip (Şimdi / Seçilen gün / Seçilen gün ve saat)", (await moment.locator("[data-transit-mode]").count()) === 3);
  ok("Şimdi kipinde UTC saat başı yuvarlama açıkça yazıyor", /UTC saat başına yuvarlanır/.test(await page.locator("[data-testid=astro-transit-moment-note]").first().innerText()));
  await moment.locator("[data-transit-mode=custom]").check();
  await moment.locator('input[aria-label="Transit tarihi"]').fill("2026-10-07");
  await moment.locator('input[aria-label="Transit saati"]').fill("12:00");
  await moment.locator('select[aria-label="Transit saat dilimi"]').selectOption("Europe/Istanbul");
  await page.waitForTimeout(300);
  const prev = await page.locator("[data-testid=astro-transit-utc-preview]").first().innerText();
  ok("hesaplanacak UTC anı ön izlemesi (İstanbul 12:00 → 09:00 UTC)", prev.includes("07.10.2026 09:00 UTC"), prev);
  await moment.locator('select[aria-label="Transit saat dilimi"]').selectOption("America/New_York");
  await page.waitForTimeout(200);
  const prevNy = await page.locator("[data-testid=astro-transit-utc-preview]").first().innerText();
  ok("saat dilimi değişince ön izleme değişir (New York 12:00 EDT → 16:00 UTC)", prevNy.includes("07.10.2026 16:00 UTC"), prevNy);
  await moment.locator('select[aria-label="Transit saat dilimi"]').selectOption("Europe/Istanbul");
  await page.locator("[data-technique-focus='western.forecast']").first().click();
  await page.waitForTimeout(500);
  const fr = page.locator("[data-testid=astro-forecast-range]").first();
  await fr.locator('input[aria-label="Takvim başlangıcı"]').fill("2026-10-01");
  await fr.locator('select[aria-label="Takvim süresi"]').selectOption("90");
  await page.waitForTimeout(200);
  ok("takvim bitiş tarihi gün sayısından (01.10 + 90 gün → 29.12.2026)", (await fr.locator('input[aria-label="Takvim bitişi"]').inputValue()) === "2026-12-29");
  await fr.locator('input[aria-label="Takvim bitişi"]').fill("2026-10-30");
  await page.waitForTimeout(200);
  ok("bitiş tarihi seçilince süre güncellenir (30 gün)", /30 gün · 1 parça/.test(await fr.innerText()));
  await fr.locator('select[aria-label="Takvim süresi"]').selectOption("90");
  await page.waitForTimeout(1500);
  const h0 = hits();
  await page.locator("[data-testid=astro-run]").click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 120000 });
  await page.waitForTimeout(1500);
  ok("analiz çalıştı (sahte Roxy golden)", true, `istek ${h0 === null ? "?" : hits() - h0}`);

  // ── 2) Transit sonucu
  const tabSel = (id) => (mobile ? `[data-testid=astro-result-tabs-mobile] [data-tab-key-m^='${id}']` : `[data-tab-key^='${id}']`);
  const openTab = async (id) => {
    if (mobile && !(await page.locator(tabSel(id)).first().isVisible()) && (await page.locator("[data-testid=astro-result-tabs-more]").isVisible())) await page.locator("[data-testid=astro-result-tabs-more]").click();
    await page.locator(tabSel(id)).first().click();
    await page.waitForTimeout(900);
  };
  await openTab("western.transit");
  // Transit ayrıntısı sağ paneldeki "Teknik ayrıntı" sekmesinde (harita merkezde).
  const techTab = page.getByRole("tab", { name: /Teknik ayrıntı/ }).first();
  if (await techTab.count()) await techTab.click();
  await page.waitForSelector("[data-testid=astro-transit-panel]", { timeout: 30000 });
  const at = await page.locator("[data-testid=astro-transit-at]").first().innerText();
  ok("transit anı: yerel + bölge + UTC", at.includes("07.10.2026 12:00 (GMT+3, Europe/Istanbul) · 07.10.2026 09:00 UTC"), at);
  ok("özet: açı türü sayımı görünür", (await page.locator("[data-testid=astro-transit-summary] [data-aspect-type]").count()) > 0);
  const topN = await page.locator("[data-testid=astro-transit-strongest] li").count();
  ok("En güçlü transitler: 1–5 satır", topN >= 1 && topN <= 5, String(topN));
  const tbl = page.locator("[data-testid=astro-transit-table]").first();
  const cardMode = await page.locator("[data-testid=astro-transit-cards]").first().isVisible();
  ok("dar kapta kart, geniş kapta tablo (kap genişliğine göre)", mobile ? cardMode : true, cardMode ? "kart" : "tablo");
  const rowsSel = cardMode ? "[data-testid=astro-transit-cards] li" : "table tbody tr";
  const total0 = await tbl.locator(rowsSel).count();
  await tbl.locator('select[aria-label="Açı kapsamı"]').selectOption("all");
  await page.waitForTimeout(200);
  const totalAll = await tbl.locator(rowsSel).count();
  ok("Tüm açılar (minör dahil) ≥ majör", totalAll >= total0, `${total0} → ${totalAll}`);
  const bodyOpts = await tbl.locator('select[aria-label="Transit gezegen filtresi"] option').allInnerTexts();
  await tbl.locator('select[aria-label="Transit gezegen filtresi"]').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  const chosen = bodyOpts[1].replace(/^\S+\s/, "").trim();
  const firstCells = cardMode ? await tbl.locator("[data-testid=astro-transit-cards] li").allInnerTexts() : await tbl.locator("table tbody tr td:first-child").allInnerTexts();
  ok("gezegen filtresi: tüm satırlar seçilen transit gezegeni", firstCells.length > 0 && firstCells.every((x) => x.includes(chosen)), `${chosen} · ${firstCells.length}`);
  await tbl.locator('select[aria-label="En az güç"]').selectOption("90");
  await tbl.locator('select[aria-label="Seyir filtresi"]').selectOption("applying");
  await page.waitForTimeout(200);
  const afterStrict = await tbl.locator(rowsSel).count();
  ok("güç + seyir filtreleri satırları daraltır (boşsa açık mesaj)", afterStrict <= firstCells.length && (afterStrict > 0 || (await page.locator("[data-testid=astro-transit-empty]").isVisible())), String(afterStrict));
  await tbl.getByRole("button", { name: "Filtreleri temizle" }).click();
  await page.waitForTimeout(200);
  ok("Filtreleri temizle → tüm açılar geri", (await tbl.locator(rowsSel).count()) === totalAll);
  ok("güç bilgisi (tablo sütunu veya kartta %)", cardMode ? /%\d+/.test(await tbl.locator("[data-testid=astro-transit-cards] li").first().innerText()) : (await tbl.locator("th", { hasText: "Güç" }).count()) === 1);
  ok("kesinleşme notu (tek an hesabı; takvimden açılınca gösterilir)", /Transit Takvimi gününden açıldığında/.test(await page.locator("[data-testid=astro-transit-exact-note]").first().innerText()));
  await shot(page, "1-transit");
  await page.locator("[data-testid=astro-transit-table]").first().scrollIntoViewIfNeeded();
  await shot(page, "2-transit-table");
  ok("transit ekranında sessiz kesilme yok", (await overflowOffenders(page, "[data-testid=astro-result-view]")).length === 0, (await overflowOffenders(page, "[data-testid=astro-result-view]")).join(" | "));

  // ── 3) Transit Takvimi → gün ayrıntısı → günün haritası
  await openTab("western.forecast");
  await page.waitForSelector("[data-testid=astro-forecast-panel]", { timeout: 30000 });
  ok("önem puanı açıklaması görünür (olasılık/kader değildir)", /gerçekleşme olasılığı/.test(await page.locator("[data-testid=astro-significance-note]").first().innerText()));
  ok("olaylarda önem rozeti", (await page.locator("[data-significance]").count()) > 0);
  await page.locator("[data-testid=astro-forecast-min-sig]").selectOption("70");
  await page.waitForTimeout(300);
  const sigs = await page.locator("[data-significance]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-significance"))));
  ok("Önem ≥ 70 filtresi", sigs.length > 0 && sigs.every((v) => v >= 70), sigs.slice(0, 8).join(","));
  // Olay Açıklamaları (yorum sekmesi): yerel saat + UTC birlikte (gösterim saat dilimi seçeneğinden).
  const interpTab = page.getByRole("tab", { name: /Olay Açıklamaları/ }).first();
  if (await interpTab.count()) {
    await interpTab.click();
    await page.waitForTimeout(500);
    const lt = await page.locator("[data-testid=astro-forecast-interp-local]").first().textContent().catch(() => "");
    const row = await page.locator("[data-testid=astro-forecast-interp-local]").first().locator("xpath=..").textContent().catch(() => "");
    ok("Olay Açıklamaları: yerel saat (GMT+3) + UTC birlikte", /GMT\+3/.test(lt ?? "") && /UTC/.test(row ?? ""), (row ?? "").slice(0, 60));
    const tk = page.getByRole("tab", { name: /Teknik ayrıntı/ }).first();
    if (await tk.count()) await tk.click().catch(() => undefined);
  } else ok("Olay Açıklamaları sekmesi (yorum görünürlüğü)", false, "sekme yok");
  await page.locator("[data-testid=astro-forecast-min-sig]").selectOption("0");
  await page.waitForTimeout(300);
  const hDay = hits();
  ok("olay listesinde gün satırları + gün seçici", (await page.locator("[data-testid=astro-forecast-day]").count()) > 0 && (await page.locator("[data-testid=astro-forecast-pick-day]").isVisible()));
  await page.locator("[data-testid=astro-forecast-pick-day]").fill("2026-10-07");
  await page.waitForSelector("[data-testid=astro-day-detail]", { timeout: 10000 });
  const dd = page.locator("[data-testid=astro-day-detail]");
  ok("Seçilen Günün Transit Ayrıntısı açıldı (07.10.2026)", /Seçilen Günün Transit Ayrıntısı · 07\.10\.2026/.test(await dd.innerText()));
  const ddText = (await dd.textContent()) ?? "";
  ok("natal etkiler ile genel gökyüzü olayları ayrı listelenir", /Natal haritaya etkiler/.test(ddText) && /Genel gökyüzü olayları/.test(ddText));
  if (LOG) ok("gün seçimi sağlayıcıya istek GÖNDERMEZ", hits() === hDay);
  await dd.scrollIntoViewIfNeeded();
  await shot(page, "3-day-detail");
  await dd.locator("[data-testid=astro-day-open-noon]").click();
  await page.waitForSelector("[data-testid=astro-day-plan-count]", { timeout: 20000 });
  ok("plan: bu an kayıtlı → 'yeni istek yok' (plan ücretsiz)", /yeni istek yok/.test(await page.locator("[data-testid=astro-day-plan-count]").innerText()));
  if (LOG) ok("plan sırasında istek yok", hits() === hDay);
  await page.locator("[data-testid=astro-day-plan-confirm]").click();
  await page.waitForSelector("[data-testid=astro-transit-panel]", { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  if (await techTab.count()) await page.getByRole("tab", { name: /Teknik ayrıntı/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(600);
  if (LOG) ok("takvimden açılan transit: 0 sağlayıcı isteği (kayıtlı an + takvim önbellekten)", hits() === hDay, `${hits() - hDay}`);
  const note = await page.locator("[data-testid=astro-transit-exact-note]").first().innerText();
  ok("takvimden açılan transitte kesinleşme anları (takvim penceresi notu)", /Kesinleşme anları kaynak takvimin olaylarından/.test(note), note.slice(0, 120));
  await page.locator("[data-testid=astro-transit-strongest]").first().scrollIntoViewIfNeeded();
  await shot(page, "4-transit-exact");
  {
    const cm = await page.locator("[data-testid=astro-transit-cards]").first().isVisible();
    ok("kesinleşme bilgisi (tablo sütunu veya kartta)", cm ? (await page.locator("[data-testid=astro-transit-cards] li", { hasText: "Kesinleşme:" }).count()) > 0 : (await page.locator("[data-testid=astro-transit-table] th", { hasText: "Kesinleşme" }).count()) === 1);
  }
  const info = await page.locator("[data-testid=astro-transit-moment-info]").first().innerText();
  ok("kaynak takvim bilgisi transit başlığında", /kaynak takvim: 01\.10\.2026 \+ 90 gün/.test(info), info);
  // Kayıtsız an: plan 1 yeni istek gösterir, vazgeçilince istek yok.
  await openTab("western.forecast");
  await page.locator("[data-testid=astro-forecast-day][data-day='2026-10-06']").first().click();
  await page.waitForSelector("[data-testid=astro-day-detail]", { timeout: 10000 });
  ok("olay satırından gün seçimi (06.10.2026: 4 natal etki)", (await page.locator("[data-testid=astro-day-personal] li").count()) === 4, String(await page.locator("[data-testid=astro-day-personal] li").count()));
  if (await page.locator("[data-testid=astro-day-open-exact]").count()) {
    const h3 = hits();
    await page.locator("[data-testid=astro-day-open-exact]").first().click();
    await page.waitForSelector("[data-testid=astro-day-plan-count]", { timeout: 20000 });
    ok("kayıtsız an (kesinleşme anı): plan '1 yeni hesaplama isteği' der", /1 yeni hesaplama isteği/.test(await page.locator("[data-testid=astro-day-plan-count]").innerText()));
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await page.waitForTimeout(300);
    if (LOG) ok("Vazgeç → sağlayıcıya istek yok", hits() === h3);
  } else ok("kesinleşme anı düğmesi", false, "yok");
  ok("takvim ekranında sessiz kesilme yok", (await overflowOffenders(page, "[data-testid=astro-result-view]")).length === 0, (await overflowOffenders(page, "[data-testid=astro-result-view]")).join(" | "));

  // ── 4) Kayıt + Word/PDF (API; kayıtlı analizden)
  const opts = { atUtc: "2026-10-07T09:00", nodeType: "true", displayTz: "Europe/Istanbul", calendar: { startDate: "2026-10-01", days: 90 } };
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: "western.transit", options: opts, saveRequestId: randomUUID(), includeProviderInterp: true });
  ok("takvim bağlantılı transit kaydedildi", sv.status === 201 && typeof sv.json?.analysisId === "string", String(sv.status));
  if (sv.json?.analysisId) {
    const d = await api(`/analyses/${sv.json.analysisId}/report?format=docx`);
    const p = await api(`/analyses/${sv.json.analysisId}/report?format=pdf`);
    ok("Word indirilir (PK)", d.status === 200 && d.buf.slice(0, 2).toString() === "PK");
    ok("PDF indirilir (%PDF-)", p.status === 200 && p.buf.slice(0, 5).toString() === "%PDF-");
  }
  ok("konsol hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\ntransit01-ui [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
