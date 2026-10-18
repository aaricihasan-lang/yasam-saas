// HORARY-KP-01 (2026-10-18) — KP Horary paneli ekran regresyonu (Playwright Chromium). YEREL; sahte DB + sahte Roxy
// (KATI mod: yalnız birebir golden gövdeye GERÇEK golden kp-horary yanıtı; GERÇEK Roxy YOK).
// Önkoşul: yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>,
//          ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2) + dev-fake-backend.
// Çalıştırma: node scripts/astrology/horary01-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   • kayıtlı horary (golden: 07.10.2026 12:00 Europe/Istanbul = 09:00 UTC, sayı 108) açılır
//   • yerel soru anı + UTC; İki Lagna tablosu (horary Başak/Merkür ↔ zaman Mars); ruling ayrıntısı (gün lordu, Ay, zaman
//     Lagna'sı); cusp sub-lord tablosu 12 satır, düğüm satırında "+"; cusp ayrıntısında "Sub lordun evleri"
//   • 1366×768, 1024×768, 768×1024, 390×844, 320×640: sayfa yatay taşmaz; tablolar kendi kutusunda kayar; metin üst üste binmez
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const [ORIGIN = "http://localhost:3951", OUT = ""] = process.argv.slice(2);
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
const api = async (p, b) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
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
(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  // Soru anı yerel saatle girilir (displayTz); değerlendirme yeri = doğum yeri (İstanbul) → gövde golden'la birebir.
  const options = { date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null };
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "kp.horary", options }] });
  ok("plan: 1 seçim, displayTz seçenekte", plan.j?.plan?.selections?.[0]?.options?.displayTz === "Europe/Istanbul", JSON.stringify(plan.j?.plan?.selections?.[0]?.options ?? plan.j).slice(0, 200));
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: "kp.horary", options: plan.j.plan.selections[0].options }], confirmNewRequests: plan.j.plan.newRequestCount });
  ok("run: golden yanıtı projeksiyondan geçti", run.j?.results?.[0]?.ok === true, JSON.stringify(run.j).slice(0, 300));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: "kp.horary", options: run.j.results[0].view.options, saveRequestId: randomUUID() });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string");
  const browser = await chromium.launch();
  for (const [w, h] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
    const host = new URL(ORIGIN).hostname;
    await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
    await ctx.addInitScript(() => {
      localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
      localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
    });
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 240000 });
    const item = page.locator(`[data-saved-item="${id}"]`);
    await item.waitFor({ timeout: 120000 });
    await item.click();
    const panel = page.locator('[data-testid="astro-kp-horary-panel"]');
    await panel.waitFor({ timeout: 60000 });
    const tag = `${w}x${h}`;
    const moment = await page.locator('[data-testid="astro-kp-horary-moment"]').innerText();
    // HORARY-P2: yerel saat esas, UTC parantezde.
    ok(`${tag} yerel soru anı + UTC`, moment.trim() === "07.10.2026 12:00 — Türkiye saati, GMT+3 (09:00 UTC)", moment);
    const mb = await page.locator('[data-testid="astro-kp-horary-moment"]').evaluate((el) => { const r = el.getBoundingClientRect(); const p = el.closest("p").getBoundingClientRect(); return { right: r.right, pRight: p.right, vw: document.documentElement.clientWidth }; });
    ok(`${tag} soru anı başlığı taşmıyor`, mb.right <= mb.pRight + 1 && mb.right <= mb.vw + 1, JSON.stringify(mb));
    const lag = await page.locator('[data-testid="astro-kp-horary-lagnas"]').innerText();
    ok(`${tag} iki Lagna: horary Başak/Merkür, zaman Mars`, /Horary · sayı 108 \(Başak\)/.test(lag) && /Soru anı \(gerçek zaman\)/.test(lag) && /farklıdır/.test(lag), lag.replace(/\s+/g, " ").slice(0, 200));
    const ru = await page.locator('[data-testid="astro-kp-horary-ruling-detail"]').innerText();
    ok(`${tag} ruling ayrıntısı`, /Gün lordu/.test(ru) && /Zaman Lagna/.test(ru) && /Mars/.test(ru), ru.replace(/\s+/g, " ").slice(0, 160));
    const rows = await page.locator("[data-kp-cusp-sub]").count();
    ok(`${tag} cusp sub-lord tablosu 12 satır`, rows === 12, String(rows));
    const plus = await page.locator('[data-kp-cusp-sub="5"]').innerText();
    ok(`${tag} 5. cusp (düğüm sub lordu) ajan evleri '+' ile`, /\+/.test(plus), plus.replace(/\s+/g, " "));
    await page.locator('[data-kp-cusp-sub="7"]').click();
    const subH = await page.locator('[data-testid="astro-kp-cusp-sublord-houses"]').first().innerText();
    ok(`${tag} cusp ayrıntısı: sub lordun evleri`, /L1: .*L4: /.test(subH), subH);
    const geo = await page.evaluate(() => {
      const de = document.documentElement;
      const p = document.querySelector('[data-testid="astro-kp-horary-panel"]');
      const pr = p.getBoundingClientRect();
      const kids = [...p.children].map((c) => c.getBoundingClientRect());
      let overlap = 0;
      for (let i = 1; i < kids.length; i++) if (kids[i].top < kids[i - 1].bottom - 1 && kids[i].left < kids[i - 1].right - 1 && kids[i - 1].left < kids[i].right - 1) overlap++;
      return { pageOverflow: de.scrollWidth - de.clientWidth, panelRight: pr.right, vw: de.clientWidth, overlap };
    });
    ok(`${tag} sayfa yatay taşmıyor`, geo.pageOverflow <= 1, JSON.stringify(geo));
    ok(`${tag} panel ekran içinde`, geo.panelRight <= geo.vw + 1, JSON.stringify(geo));
    ok(`${tag} panel blokları üst üste binmiyor`, geo.overlap === 0, JSON.stringify(geo));
    if (OUT) {
      await page.locator('[data-testid="astro-kp-horary-lagnas"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, `horary01-${tag}-lagna.png`) });
      await page.locator('[data-testid="astro-kp-horary-cusp-sub"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, `horary01-${tag}-cuspsub.png`) });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nhorary01-ui: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
