// ATL-B03 EK E2E (14.11.2026) — uygulama akışı: yerel soru anı → sağlayıcı gövdesi YEREL saat + ofset (sahte sağlayıcı günlüğü),
// sonuç gösterimi, kayıt ve ESKİ KAYIT uyumu. YALNIZ yerel sahte DB (bellek içi, sentetik "Ali Örnek") + sahte sağlayıcı; GERÇEK Roxy / DB YOK.
// Eski kayıt simülasyonu: kaydedilen SENTETİK analizin versions_snapshot.adapterVersion değeri yerel sahte PostgREST'te "-1" yapılır →
// arşiv API'si + arayüz "eski hesap sürümü" notunu göstermeli, teknik değerler AYNEN kalmalı.
// Önkoşul: yerel next sunucusu + dev-fake-backend (KATI mod) — diğer astroloji e2e'leriyle aynı ortam.
// Çalıştırma: FAKE_PG_URL=http://127.0.0.1:<fake> node scripts/astrology/horary-b03-ui.e2e.cjs <origin> [ekran klasörü] [fake.log]
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const [ORIGIN = "http://localhost:3971", OUT = "", LOG = ""] = process.argv.slice(2);
// Sahte PostgREST (dev-fake-backend) adresi: koşucu FAKE_PG_URL verir; varsayılan diğer astroloji e2e'leriyle aynı port.
const FAKE = process.env.FAKE_PG_URL || "http://127.0.0.1:54329";
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
(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  // Kullanıcı soru anını BERLIN gösterim diliminde girer; değerlendirme yeri doğum yeri İstanbul → gövde İstanbul yerel saati (+3).
  const options = { date: "2026-10-07", time: "11:00", timezone: "Europe/Berlin", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null };
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "kp.horary", options }] });
  ok("plan: Berlin 11:00 → 09:00 UTC; gösterim dilimi seçenekte", plan.j?.plan?.selections?.[0]?.options?.atUtc === "2026-10-07T09:00" && plan.j.plan.selections[0].options.displayTz === "Europe/Berlin", JSON.stringify(plan.j?.plan?.selections?.[0]?.options ?? plan.j).slice(0, 200));
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: "kp.horary", options: plan.j.plan.selections[0].options }], confirmNewRequests: plan.j.plan.newRequestCount });
  const res = run.j?.results?.[0];
  ok("run: yanıt adaptörden geçti (KATI sahte sağlayıcı)", res?.ok === true, JSON.stringify(run.j).slice(0, 300));
  // Kanıt bu oturumun sahte sağlayıcı günlüğünde (koşucunun verdiği dosya; 14.11 düzeltme: önceki koşuda yetim arka uç başka dosyaya
  // yazıyordu). Aynı UTC an bu oturumda horary01-ui ile hesaplandıysa bu istek önbellekten gelir (yeni sağlayıcı isteği yok) → kanıt
  // oturumun TÜM günlüğünde aranır: kp/horary golden'ı yalnız "aynı UTC an, yerel gövde" kuralıyla eşleşmiş, hiçbir kp/horary 501 almamış.
  const logAll = LOG && fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const hor = logAll.split("\n").filter((l) => /kp\/horary/.test(l));
  ok("sağlayıcı gövdesi YEREL (aynı UTC an) — sahte sağlayıcı golden'ı 'yerel gövde' eşleşmesiyle verdi; 501 yok", /kp-horary\.json \(aynı UTC an, yerel gövde — ATL-B03\)/.test(logAll) && !hor.some((l) => /501/.test(l)), hor.join(" | ").slice(0, 300) || `günlük: ${LOG || "verilmedi"}`);
  ok("sonuç: gün lordu Merkür (07.10.2026 Çarşamba, İstanbul yerel öğle), Lagna KP 108", res?.view?.technical?.ruling?.dayLord === "mercury" && res?.view?.technical?.ascendant?.kpNumber === 108, JSON.stringify(res?.view?.technical?.ruling ?? {}).slice(0, 200));
  const sv = await api("/analyses", { profileId: pid, revision: 1, technique: "kp.horary", options: res.view.options, saveRequestId: randomUUID() });
  const id = sv.j?.analysisId;
  ok("kayıt", typeof id === "string", JSON.stringify(sv.j).slice(0, 200));
  const a1 = await api(`/analyses/${id}`);
  const av = a1.j?.analysis?.versions?.adapterVersion ?? a1.j?.analysis?.versionsSnapshot?.adapterVersion;
  ok("yeni kayıt: adaptör -2, eski hesap notu YOK", av === "astro-roxy-kp-horary-2" && (a1.j?.analysis?.legacyNotes ?? []).length === 0, JSON.stringify({ av, legacy: a1.j?.analysis?.legacyNotes }).slice(0, 200));
  // ── Eski kayıt simülasyonu (yerel sahte DB, sentetik kayıt): adaptör sürümü -1 ──
  const row = await (await fetch(`${FAKE}/rest/v1/astro_analyses?id=eq.${id}&select=versions_snapshot,technical_snapshot`, { headers: { apikey: "local-service", authorization: "Bearer local-service" } })).json();
  const vs = { ...(row?.[0]?.versions_snapshot ?? {}), adapterVersion: "astro-roxy-kp-horary-1" };
  const pr = await fetch(`${FAKE}/rest/v1/astro_analyses?id=eq.${id}`, { method: "PATCH", headers: { apikey: "local-service", authorization: "Bearer local-service", "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify({ versions_snapshot: vs }) });
  ok("sahte DB: sentetik kayıt -1 sürümüne çevrildi", pr.status < 300, String(pr.status));
  const a2 = await api(`/analyses/${id}`);
  const notes = a2.j?.analysis?.legacyNotes ?? [];
  ok("eski kayıt: 'kp_horary_day_lord' notu döner", notes.some((n) => n.code === "kp_horary_day_lord"), JSON.stringify(notes).slice(0, 200));
  ok("eski kayıt: teknik değerler AYNEN (yeniden hesap yok)", JSON.stringify(a2.j?.analysis?.technical) === JSON.stringify(a1.j?.analysis?.technical));
  const browser = await chromium.launch();
  for (const [w, h] of [[1366, 768], [390, 844]]) {
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
    const chip = page.locator('[data-testid="astro-legacy-method"]').first();
    let chipOk = false;
    try {
      await chip.waitFor({ timeout: 60000 });
      chipOk = /Eski hesap sürümü/.test(await chip.innerText());
    } catch {}
    ok(`${w}px arayüz: eski kayıtta 'Eski hesap sürümü' işareti`, chipOk);
    const moment = await page.locator('[data-testid="astro-kp-horary-moment"]').first().innerText().catch(() => "");
    ok(`${w}px arayüz: soru anı yerel (Berlin 11:00) + UTC 09:00 gösterimi`, /11:00/.test(moment) && /09:00 UTC/.test(moment), moment.slice(0, 160));
    const ofl = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px: sayfa yatay taşmaz`, ofl <= 0, String(ofl));
    if (OUT) await page.screenshot({ path: path.join(OUT, `horary-eski-kayit-${w}.png`), fullPage: false });
    await ctx.close();
  }
  await browser.close();
  console.log(`\nATL-B03 ek E2E: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
