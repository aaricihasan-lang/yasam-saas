// AYLIK EFEMERİS (Batı tropikal · Vedik sideral) — API + ekran uçtan uca (Playwright Chromium). YEREL; sahte PostgREST
// (dev-fake-backend) + sahte HTTPS sağlayıcı (monthly-ephemeris-fake-provider.mjs, QA'daki GERÇEK kayıtlı yanıtlar). Ücretli çağrı YOK.
// Ön koşul: dev-fake-backend.ts <fake> + fake provider <pport> + next dev --webpack (ASTROLOGY_MODULE_ENABLED=true,
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, SUPABASE_SERVICE_ROLE_KEY=local-fake, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-fake,
//   ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<pport>/api/v2, NODE_TLS_REJECT_UNAUTHORIZED=0,
//   ATLAS_DE440_PATH=<de440.bsp>). Ajan oturumundan: env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE … (AGENTS.md yeniden yazılmasın).
// Çalıştırma: node scripts/astrology/monthly-ephemeris-ui.e2e.cjs <origin> <pport> [ekran-görüntüsü-klasörü]
// Tarayıcı öykünmesidir; fiziksel Android cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const JSZip = require("jszip");

const [ORIGIN = "http://localhost:3987", PPORT = "54400", OUT = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const ADMIN2 = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const T2 = "local-admin2-token-bbbbbbbbbbb";
const H2 = { "content-type": "application/json", "x-admin-id": ADMIN2, "x-session-token": T2, cookie: `yasam_admin_session=${T2}`, origin: ORIGIN };
const API = `${ORIGIN}/api/admin/astroloji/efemeris/aylik`;
const j = async (url, init = {}) => {
  const r = await fetch(url, { headers: H, ...init });
  let b = null;
  try {
    b = await r.clone().json();
  } catch {}
  return { s: r.status, b, r };
};
const post = (url, body, headers = H) => j(url, { method: "POST", headers, body: JSON.stringify(body) });
const count = async () => (await (await fetch(`https://127.0.0.1:${PPORT}/__count`)).json());
const nowY = new Date().getUTCFullYear();
const nowM = new Date().getUTCMonth() + 1;

async function login(browser, w, h, mobile) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
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
async function docxText(buf) {
  const z = await JSZip.loadAsync(buf);
  const xml = await z.file("word/document.xml").async("string");
  return { xml, text: [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("") };
}

(async () => {
  // ─── API ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const c0 = await count();
  const anon = await fetch(API, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ kind: "western", year: 2026, month: 11 }) });
  ok("A1 oturumsuz istek → tek tip 404", anon.status === 404, String(anon.status));
  const a2 = await post(API, { kind: "western", year: 2026, month: 11 }, H2);
  ok("A2 owner olmayan admin (yönetici yüzeyi) → 404", a2.s === 404, String(a2.s));
  const w1 = await post(API, { kind: "western", year: 2026, month: 11 });
  const c1 = await count();
  ok("A3 Batı Kasım 2026: 30 gün × 14 cisim, tropikal, 12:00 UTC, bağımsız kontrol PASS, en çok 1 sağlayıcı isteği (sunucu önceden ısınmışsa 0)", w1.s === 200 && w1.b.result.days.length === 30 && w1.b.result.bodies.length === 14 && w1.b.result.zodiac === "tropical" && w1.b.result.ayanamsa === null && w1.b.result.timeOfDay === "12:00" && w1.b.result.crossCheck.status === "pass" && c1.western - c0.western <= 1, `${w1.s} cc=${w1.b?.result?.crossCheck?.status} max=${w1.b?.result?.crossCheck?.maxAbsArcsec} çağrı=${c1.western - c0.western}`);
  ok("A4 yanıt ham sağlayıcı alanı / anahtar sızdırmaz", !JSON.stringify(w1.b).includes("degreeInSign") && !JSON.stringify(w1.b).includes("local-fake-roxy-key"));
  const w2 = await post(API, { kind: "western", year: 2026, month: 11 });
  ok("A5 aynı ay tekrar → önbellek, sağlayıcı isteği YOK", w2.s === 200 && w2.b.providerCalls === 0 && (await count()).western === c1.western, `cache=${w2.b?.cache}`);
  const v1 = await post(API, { kind: "vedic", year: 2026, month: 11 });
  ok("A6 Vedik Kasım 2026: 9 graha, sideral + Lahiri, Rahu ortalama düğüm, kontrol PASS", v1.s === 200 && v1.b.result.bodies.length === 9 && v1.b.result.zodiac === "sidereal" && v1.b.result.ayanamsa === "lahiri" && v1.b.result.nodeMethod === "mean" && v1.b.result.crossCheck.status === "pass", `max=${v1.b?.result?.crossCheck?.maxAbsArcsec}`);
  const before = (await count()).total;
  const oor = await post(API, { kind: "western", year: 1500, month: 1 });
  ok("A7 aralık dışı yıl → 400, sağlayıcıya istek GİTMEZ", oor.s === 400 && (await count()).total === before);
  const leap = await post(API, { kind: "vedic", year: 2024, month: 2 });
  ok("A8 artık yıl Şubatı (Vedik 2024-02) → 29 gün", leap.s === 200 && leap.b.result.days.length === 29 && leap.b.result.days[28].date === "2024-02-29");
  const yrEnd = await post(API, { kind: "western", year: 2026, month: 12 });
  const yrBeg = await post(API, { kind: "western", year: 2027, month: 1 });
  ok("A9 yıl geçişi: 2026-12 (31) → 2027-01 (31), tarihler kesintisiz", yrEnd.s === 200 && yrBeg.s === 200 && yrEnd.b.result.days[30].date === "2026-12-31" && yrBeg.b.result.days[0].date === "2027-01-01");
  const kir = await post(API, { kind: "western", year: 2600, month: 12 });
  ok("A10 2600-12: Kiron sağlayıcıda yok → tabloda 13 cisim + 'bu ay verilmedi' (eksik gün yok)", kir.s === 200 && kir.b.result.bodies.length === 13 && kir.b.result.missingBodies.join() === "chiron", JSON.stringify(kir.b?.result?.missingBodies ?? kir.b));
  const miss = await post(API, { kind: "western", year: 2026, month: 5 });
  ok("A11 sağlayıcı ayı veremezse → 502, tablo gösterilmez", miss.s === 502 && miss.b.code === "PROVIDER_FAILED");

  const cR = (await count()).total;
  const rd = await j(`${API}/rapor?kind=western&year=2026&month=11&format=docx`);
  const rp = await j(`${API}/rapor?kind=western&year=2026&month=11&format=pdf`);
  const rn = await j(`${API}/rapor?kind=western&year=2031&month=1&format=pdf`);
  ok("A12 kaydedilmemiş rapor: Word + PDF 200; hesaplanmamış ay 409; sağlayıcı isteği YOK", rd.s === 200 && rp.s === 200 && rn.s === 409 && (await count()).total === cR, `${rd.s}/${rp.s}/${rn.s}`);
  const saveReq = randomUUID();
  const sv = await post(`${API}/kayitlar`, { kind: "vedic", year: 2026, month: 11, title: "E2E Vedik Kasım", saveRequestId: saveReq });
  const sv2 = await post(`${API}/kayitlar`, { kind: "vedic", year: 2026, month: 11, title: "E2E Vedik Kasım", saveRequestId: saveReq });
  ok("A13 kaydet (201) + aynı istek kimliği → aynı kayıt (idempotency)", sv.s === 201 && sv2.s === 200 && sv2.b.reused === true && sv.b.record.id === sv2.b.record.id, `${sv.s}/${sv2.s} ${JSON.stringify(sv.b).slice(0, 200)}`);
  const id = sv.b?.record?.id;
  const g = await j(`${API}/kayitlar/${id}`);
  ok("A14 arşivden aç: anlık görüntü = hesaplanan tablo (birebir), sağlayıcı isteği YOK", g.s === 200 && JSON.stringify(g.b.result.days) === JSON.stringify(v1.b.result.days) && (await count()).total === cR);
  const g2 = await j(`${API}/kayitlar/${id}`, { headers: H2 });
  ok("A15 başka kullanıcı kaydı açamaz (404)", g2.s === 404, String(g2.s));
  const sd = await j(`${API}/kayitlar/${id}/rapor?format=docx`);
  const sdText = sd.s === 200 ? await docxText(Buffer.from(await sd.r.arrayBuffer())) : { xml: "", text: "" };
  ok("A16 kayıtlı Word: yatay, Lahiri, 12.00 UTC, kayıt başlığı", sd.s === 200 && /w:orient="landscape"/.test(sdText.xml) && sdText.text.includes("Lahiri") && sdText.text.includes("12.00 UTC") && sdText.text.includes("E2E Vedik Kasım"));
  const list = await j(`${API}/kayitlar`);
  ok("A17 liste kaydı içerir, anlık görüntü sızdırmaz", list.s === 200 && list.b.records.some((r) => r.id === id) && !JSON.stringify(list.b).includes('"days"'));
  const ex = await fetch(`${ORIGIN}/api/astroloji/efemeris/aylik`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e", "x-session-token": "local-expert-token-eeeeeeeeeee", cookie: "yasam_session=local-expert-token-eeeeeeeeeee", origin: ORIGIN }, body: JSON.stringify({ kind: "western", year: 2026, month: 11 }) });
  ok("A18 astroloji izni olmayan uzman (uzman yüzeyi) → 404", ex.status === 404, String(ex.status));

  // ─── Ekran ───────────────────────────────────────────────────────────────────────────────────────────────────
  const browser = await chromium.launch();
  try {
    const ctx = await login(browser, 1440, 900, false);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const computeReqs = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/efemeris\/aylik$/.test(new URL(r.url()).pathname)) computeReqs.push(r.postData());
    });
    await page.goto(`${ORIGIN}/admin/astroloji/efemeris#efemeris`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForSelector('[data-testid="me-table"]', { timeout: 180_000 });
    const title = await page.textContent('[data-testid="me-title"]');
    const monthName = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][nowM - 1];
    ok("U1 varsayılan: içinde bulunulan ay, Batı (Tropikal) açılır", (title ?? "").includes(`${monthName} ${nowY}`) && (title ?? "").includes("Batı (Tropikal)"), title ?? "");
    const rows = await page.locator('[data-testid="me-table"] tbody tr').count();
    const cols = await page.locator('[data-testid="me-table"] thead th').count();
    ok("U2 ayın bütün günleri satır; varsayılan 13 doğrulanmış cisim + gün sütunu (doğrulanmamış Lilith gizli)", rows === new Date(Date.UTC(nowY, nowM, 0)).getUTCDate() && cols === 14 && (await page.locator('[data-testid="me-head-lilith"]').count()) === 0, `${rows} satır, ${cols} sütun`);
    const lilChip = page.locator('[data-testid="me-body-lilith"]');
    ok("U2b Lilith çipi kapalı, '⚠' ve 'doğrulanmamış' açıklamalı; not satırı görünür", (await lilChip.getAttribute("aria-pressed")) === "false" && /⚠/.test((await lilChip.textContent()) ?? "") && /doğrulanmamış/.test((await lilChip.getAttribute("title")) ?? "") && (await page.isVisible('[data-testid="me-unverified-note"]')));
    const nLil = computeReqs.length;
    await lilChip.click();
    const lilHead = (await page.textContent('[data-testid="me-head-lilith"]')) ?? "";
    ok("U2c kullanıcı açarsa Lilith '⚠' başlıkla görünür (0 yeni istek)", /⚠/.test(lilHead) && computeReqs.length === nLil, lilHead);
    await lilChip.click();
    ok("U3 '12.00 UTC' ve kesin geçiş saati uyarısı görünür", /12\.00 UTC/.test((await page.textContent('[data-testid="me-time-note"]')) ?? "") && /kesin geçiş/.test((await page.textContent('[data-testid="me-time-note"]')) ?? ""));
    const d1 = `${nowY}-${String(nowM).padStart(2, "0")}-01`;
    const cellUi = (await page.textContent(`[data-testid="me-cell-${d1}-sun"]`)) ?? "";
    ok("U4 hücre: burç sembolü + Türkçe ad + derece°dakika′", /[♈-♓]\s?\S+\s*\d{2}°\d{2}′/.test(cellUi.replace(/\uFE0E/g, "")), cellUi);
    const nReq = computeReqs.length;
    await page.click('[data-testid="me-body-moon"]');
    await page.click('[data-testid="me-body-chiron"]');
    const colsHidden = await page.locator('[data-testid="me-table"] thead th').count();
    await page.click('[data-testid="me-mode-lon"]');
    const lonTxt = (await page.textContent(`[data-testid="me-cell-${d1}-sun"]`)) ?? "";
    await page.click('[data-testid="me-mode-sign"]');
    await page.click('[data-testid="me-body-moon"]');
    await page.click('[data-testid="me-body-chiron"]');
    ok("U5 gezegen gizle/göster + tam boylam görünümü YALNIZ görünüm: 0 yeni istek", colsHidden === 12 && /^\d{1,3},\d{4}°/.test(lonTxt) && computeReqs.length === nReq, `${colsHidden} sütun, "${lonTxt}", istek ${computeReqs.length - nReq}`);
    await shot(page, "01-masaustu-bati");
    await page.click('[data-testid="me-kind-vedic"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="me-title"]')?.textContent?.includes("Vedik"), null, { timeout: 60_000 });
    const vcols = await page.locator('[data-testid="me-table"] thead th').count();
    const vchips = (await page.textContent('[data-testid="me-result"]')) ?? "";
    ok("U6 Vedik (Sideral): 9 graha + gün, 'Sideral zodyak · Lahiri ayanamsası', Rahu ortalama düğüm", vcols === 10 && vchips.includes("Lahiri") && vchips.includes("Rahu: ortalama düğüm"), `${vcols}`);
    await shot(page, "02-masaustu-vedik");
    // Kaydet → arşiv → aç → Word/PDF.
    await page.click('[data-testid="me-save"]');
    await page.fill('[data-testid="me-save-title"]', "E2E ekran kaydı");
    await page.click('[data-testid="me-save-confirm"]');
    await page.waitForSelector('[data-testid="me-notice"]', { timeout: 30_000 });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="me-record"]')].some((e) => e.textContent?.includes("E2E ekran kaydı")), null, { timeout: 30_000 });
    ok("U7 ekrandan kaydet → arşiv listesinde görünür", true);
    await page.click('[data-testid="me-kind-western"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="me-title"]')?.textContent?.includes("Batı"), null, { timeout: 60_000 });
    const nReq2 = computeReqs.length;
    const rec = page.locator('[data-testid="me-record"]', { hasText: "E2E ekran kaydı" }).first();
    await rec.locator('[data-testid="me-record-open"]').click();
    await page.waitForSelector('[data-testid="me-saved-banner"]', { timeout: 30_000 });
    const t2 = (await page.textContent('[data-testid="me-title"]')) ?? "";
    ok("U8 arşivden aç: kayıtlı Vedik tablo, hesap isteği YOK", t2.includes("Vedik") && computeReqs.length === nReq2, t2);
    const screenCell = ((await page.textContent(`[data-testid="me-cell-${d1}-moon"]`)) ?? "").replace(/\s+/g, "");
    const [dlDocx] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.click('[data-testid="me-docx"]')]);
    const docxPath = path.join(OUT || require("node:os").tmpdir(), `me-${Date.now()}.docx`);
    await dlDocx.saveAs(docxPath);
    const dt = await docxText(fs.readFileSync(docxPath));
    ok("U9 kayıtlı Word indirildi; ekrandaki hücre değeri Word'de aynen var", dt.text.replace(/\s+/g, "").includes(screenCell.replace(/\uFE0E/g, "")) && /landscape/.test(dt.xml), `${dlDocx.suggestedFilename()} "${screenCell}"`);
    const [dlPdf] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.click('[data-testid="me-pdf"]')]);
    const pdfPath = path.join(OUT || require("node:os").tmpdir(), `me-${Date.now()}.pdf`);
    await dlPdf.saveAs(pdfPath);
    ok("U10 kayıtlı PDF indirildi (%PDF)", fs.readFileSync(pdfPath).subarray(0, 4).toString() === "%PDF", dlPdf.suggestedFilename());
    // Batı Word: doğrulanmamış Lilith rapora girmez (künyede adıyla yazılır); Kiron (1600–2100 doğrulanmış) girer.
    await page.click('[data-testid="me-kind-western"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="me-title"]')?.textContent?.includes("Batı"), null, { timeout: 60_000 });
    const [dlW] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.click('[data-testid="me-docx"]')]);
    const wPath = path.join(OUT || require("node:os").tmpdir(), `me-bati-${Date.now()}.docx`);
    await dlW.saveAs(wPath);
    const wt = await docxText(fs.readFileSync(wPath));
    const headRow = (wt.xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? []).find((r) => r.includes("Güneş")) ?? "";
    ok("U9b Batı Word: tablo başlığında Lilith YOK, Kiron VAR; künyede 'Raporda yer almayan … Kara Ay Lilith'", headRow.includes("Kiron") && !headRow.includes("Lilith") && wt.text.includes("Raporda yer almayan") && wt.text.includes("Kara Ay Lilith"), dlW.suggestedFilename());
    // Önceki / sonraki ay.
    await page.click('[data-testid="me-current"]');
    await page.waitForSelector('[data-testid="me-saved-banner"]', { state: "detached", timeout: 60_000 });
    await page.click('[data-testid="me-prev"]');
    await page.waitForFunction((n) => document.querySelector('[data-testid="me-title"]')?.textContent?.includes(n), ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][(nowM + 10) % 12], { timeout: 60_000 });
    ok("U11 'Önceki ay' düğmesi bir önceki ayı açar", true);
    // Ayrıntılı yerel tablo korunur.
    await page.click('[data-testid="me-advanced"] summary');
    await page.waitForSelector('[data-testid="eph-form"]', { state: "visible", timeout: 30_000 });
    ok("U12 mevcut ayrıntılı yerel efemeris (00:00 UT) katlanır bölümde açılır", await page.isVisible('[data-testid="eph-submit"]'));
    // Diğer sekmeler.
    await page.click('[data-testid="sky-tab-ay"]');
    ok("U13 Ay Evreleri sekmesi açılır (regresyon)", await page.isVisible("text=Ay Evreleri"));
    ok("U14 sayfa hatası yok", errors.length === 0, errors.join(" | ").slice(0, 300));
    await ctx.close();

    // Mobil 360 / 375 / 390.
    for (const w of [360, 375, 390]) {
      const mc = await login(browser, w, 800, true);
      const mp = await mc.newPage();
      await mp.goto(`${ORIGIN}/admin/astroloji/efemeris#efemeris`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await mp.waitForSelector('[data-testid="me-table"]', { timeout: 180_000 });
      const m = await mp.evaluate(() => {
        const sc = document.querySelector('[data-testid="me-scroll"]');
        const before = sc.querySelector("tbody tr th").getBoundingClientRect().left;
        sc.scrollLeft = 400;
        const after = sc.querySelector("tbody tr th").getBoundingClientRect().left;
        const deg = sc.querySelector("tbody td span:last-child");
        return {
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          tableScrolls: sc.scrollWidth > sc.clientWidth,
          stickyDay: Math.abs(before - after) < 1,
          scLeft: sc.scrollLeft,
          degFont: deg ? parseFloat(getComputedStyle(deg).fontSize) : 0,
          kindBtnsVisible: [...document.querySelectorAll('[data-testid^="me-kind-"]')].every((b) => b.getBoundingClientRect().width > 100),
        };
      });
      ok(`M${w} sayfa yatay taşmaz; kaydırma YALNIZ tablo kabında; tarih sütunu yapışkan; derece ≥12 px; tür düğmeleri tam`, m.pageOverflow <= 0 && m.tableScrolls && m.stickyDay && m.scLeft > 0 && m.degFont >= 12 && m.kindBtnsVisible, JSON.stringify(m));
      await mp.evaluate(() => (document.querySelector('[data-testid="me-scroll"]').scrollLeft = 0));
      await shot(mp, `03-mobil-${w}`, true);
      await mc.close();
    }
  } finally {
    await browser.close();
  }
  const cEnd = await count();
  console.log(`sahte sağlayıcı sayacı: ${JSON.stringify(cEnd)}`);
  ok("Z1 her ay+tür için sağlayıcıya EN ÇOK 1 istek (başarılı aylar; API + ekran + kayıt + rapor + arşiv boyunca)", Object.entries(cEnd.byMonth).every(([k, n]) => n === 1 || k === "western:2026-05"), JSON.stringify(cEnd.byMonth));
  ok("Z2 başarısız ay (2026-05) önbelleğe ALINMAZ → sonraki istekte yeniden denenir (bilinçli)", (cEnd.byMonth["western:2026-05"] ?? 0) >= 1);
  console.log(`\nSONUÇ monthly-ephemeris-ui: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(`FAIL beklenmeyen hata: ${String(e?.stack ?? e).slice(0, 600)}`);
  process.exit(1);
});
