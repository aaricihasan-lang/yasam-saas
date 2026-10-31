// WT-03 PROFESYONEL EFEMERİS — API + ekran uçtan uca (Playwright Chromium). YEREL; sahte DB (dev-fake-backend), sağlayıcı YOK.
// Önkoşul: next dev/start ASTROLOGY_MODULE_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, sahte SERVICE_ROLE.
// Çalıştırma:
//   node scripts/astrology/pro-ephemeris-ui.e2e.cjs <origin> off            → bayrak KAPALI sunucu: sayfa + API 404
//   node scripts/astrology/pro-ephemeris-ui.e2e.cjs <origin> on [ekran-dir] → ATLAS_PRO_EPHEMERIS_ENABLED=1 sunucu: API + 5 görünüm
// Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const [ORIGIN = "http://localhost:3983", MODE = "on", OUT = ""] = process.argv.slice(2);
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
const api = async (b, headers = H, surface = "/api/admin/astroloji/efemeris") => {
  const r = await fetch(`${ORIGIN}${surface}`, { method: "POST", headers, body: JSON.stringify(b) });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const VIEWS = [
  ["masaustu", 1366, 768],
  ["tablet-dikey", 768, 1024],
  ["mobil-390", 390, 844],
  ["mobil-375", 375, 667],
  ["mobil-dar", 320, 640],
];

async function login(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "owner@example.test", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return ctx;
}

/** Görünür alan içinde, kırpılmamış, ≥ minH yüksek ve tıklanabilir mi? */
async function controlOk(page, sel, minH = 44) {
  return page.evaluate(
    ([s, m]) => {
      const el = document.querySelector(s);
      if (!el) return "yok";
      const r = el.getBoundingClientRect();
      if (r.height < m - 0.5) return `yükseklik ${r.height}`;
      if (r.left < -0.5 || r.right > window.innerWidth + 0.5) return `yatay taşma ${r.left}-${r.right}`;
      const hit = document.elementFromPoint(Math.min(r.left + r.width / 2, window.innerWidth - 1), Math.max(0, Math.min(r.top + r.height / 2, window.innerHeight - 1)));
      if (r.top >= 0 && r.bottom <= window.innerHeight && hit && !el.contains(hit) && !hit.contains(el)) return "üstü kapalı";
      return "ok";
    },
    [sel, minH],
  );
}

async function main() {
  if (MODE === "off") {
    const p = await fetch(`${ORIGIN}/admin/astroloji/efemeris`, { headers: { cookie: `yasam_admin_session=${T}` } });
    ok("bayrak kapalı: sayfa 404", p.status === 404, `durum ${p.status}`);
    const a = await api({ view: "day", date: "2026-10-31" });
    ok("bayrak kapalı: API tek tip 404 (yetkili owner da)", a.s === 404, `durum ${a.s}`);
    // Uzman kabuğunda (app/astroloji/layout.tsx eşzamanlı) Next akışlı yanıtta notFound() durum kodunu 200 bırakabiliyor; ölçüt İÇERİK:
    // bulunamadı sayfası döner, efemeris masası / form işaretleri HTML'de YOKTUR.
    const e = await fetch(`${ORIGIN}/astroloji/efemeris`);
    const eh = await e.text();
    ok("bayrak kapalı: uzman sayfası bulunamadı içeriği, efemeris masası YOK", (e.status === 404 || /could not be found/.test(eh)) && !/eph-form|Profesyonel Efemeris/.test(eh), `durum ${e.status}`);
    console.log(`\nSONUÇ pro-ephemeris-ui (off): ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  }

  // ─── API ───
  const noSess = await api({ view: "day", date: "2026-10-31" }, { "content-type": "application/json", origin: ORIGIN });
  ok("API oturumsuz → 404", noSess.s === 404, `durum ${noSess.s}`);
  const expert = await api({ view: "day", date: "2026-10-31" }, H, "/api/astroloji/efemeris");
  ok("API uzman yüzeyi, astroloji yetkisi olmayan admin kimliği → 404", expert.s === 404, `durum ${expert.s}`);
  const m = await api({ view: "month", year: 2026, month: 10 });
  ok("API ay görünümü 200, 31 satır, 00:00 UT", m.s === 200 && m.j?.result?.rows?.length === 31 && m.j.result.rows.every((r) => r.ut.endsWith("T00:00:00Z")), `durum ${m.s}`);
  const bp = m.j?.result?.meta?.bodyPrecision ?? {};
  ok("API hassasiyet: yerel boylam dakika; Güneş hızı saniye, Merkür hızı 0,1′, gerçek düğüm hızı dakika (cisim bazında)", m.j?.result?.meta?.precision?.lon === "arcmin" && bp.sun?.speed === "arcsec" && bp.mercury?.speed === "tenth_arcmin" && bp.true_node?.speed === "arcmin" && bp.sun?.lon === "tenth_arcmin" && bp.moon?.lon === "arcmin");
  ok("API sağlayıcı çağrısı 0 (yerel)", m.j?.result?.meta?.providerCalls === 0);
  ok("API olaylar ay içinde ve kronolojik", Array.isArray(m.j?.result?.events) && m.j.result.events.length > 0 && m.j.result.events.every((e, i, a) => i === 0 || a[i - 1].ms <= e.ms));
  const bad = await api({ view: "day", date: "2023-02-29" });
  ok("API geçersiz tarih → 400 field=date", bad.s === 400 && bad.j?.field === "date", `durum ${bad.s}`);
  const big = await api({ view: "range", start: "2000-01-01", end: "2015-01-01" });
  ok("API 10 yıldan uzun aralık → 400 RANGE_TOO_LARGE", big.s === 400 && big.j?.code === "RANGE_TOO_LARGE");
  const out = await api({ view: "day", date: "1599-12-31" });
  ok("API 1600 öncesi → 400 OUT_OF_RANGE", out.s === 400 && out.j?.code === "OUT_OF_RANGE");
  const prov = await api({ view: "day", date: "2026-10-31", source: "provider" });
  ok("API sağlayıcı kaynağı (ek bayrak yok) → 403 PROVIDER_DISABLED, ücretli çağrı yok", prov.s === 403 && prov.j?.code === "PROVIDER_DISABLED", `durum ${prov.s}`);
  const yr = await api({ view: "year", year: 2024, page: 1 });
  ok("API yıl görünümü sayfa 2 = Şubat 2024 (29 gün), 12 sayfa", yr.s === 200 && yr.j?.result?.rows?.length === 29 && yr.j.result.page.total === 12);
  const sid = await api({ view: "day", date: "2026-10-31", zodiac: "sidereal_lahiri" });
  ok("API sidereal: ayanamsa meta dolu", sid.s === 200 && sid.j?.result?.meta?.ayanamsa?.id === "lahiri");
  const malformed = await fetch(`${ORIGIN}/api/admin/astroloji/efemeris`, { method: "POST", headers: H, body: "{" });
  ok("API bozuk JSON → 400", malformed.status === 400);

  // ─── Ekran ───
  const browser = await chromium.launch({ channel: "chromium" }).catch(() => chromium.launch());
  try {
    for (const [name, w, h] of VIEWS) {
      const ctx = await login(browser, w, h);
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e)));
      await page.goto(`${ORIGIN}/admin/astroloji/efemeris`, { waitUntil: "networkidle", timeout: 120_000 });
      ok(`${name}: sayfa açıldı`, (await page.locator('[data-testid="pro-ephemeris"]').count()) === 1);
      await page.fill('[data-testid="eph-month"]', "2026-10");
      await page.click('[data-testid="eph-submit"]');
      await page.waitForSelector('[data-testid="eph-table"]', { timeout: 60_000 });
      const rows = await page.locator('[data-testid="eph-table"] tbody tr').count();
      ok(`${name}: Ekim 2026 tablosu 31 satır`, rows === 31, `${rows}`);
      const sun = await page.textContent('[data-testid="eph-cell-2026-10-01-sun"]');
      ok(`${name}: 1 Ekim Güneş boylamı 0,1′ biçiminde (07°50,3′ Ter, DE440 07°50′19″)`, /^07°50,3′ Ter/.test((sun || "").trim()), sun);
      const sat = await page.textContent('[data-testid="eph-cell-2026-10-01-saturn"]');
      ok(`${name}: Satürn geri işareti ℞`, (sat || "").includes("℞"), sat);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(`${name}: sayfada yatay taşma yok`, overflow <= 1, `fazla ${overflow}px`);
      const wrap = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="eph-table-wrap"]');
        return { sw: el.scrollWidth, cw: el.clientWidth, ox: getComputedStyle(el).overflowX };
      });
      ok(`${name}: tablo kendi kabında yatay kayar`, wrap.ox === "auto" && (w >= 1366 || wrap.sw > wrap.cw), JSON.stringify(wrap));
      const stickyLeft = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="eph-table-wrap"]');
        el.scrollLeft = 400;
        const th = el.querySelector("tbody th");
        return Math.round(th.getBoundingClientRect().left - el.getBoundingClientRect().left);
      });
      ok(`${name}: tarih sütunu yapışkan (kaydırmada solda kalır)`, Math.abs(stickyLeft) <= 1, `${stickyLeft}px`);
      for (const sel of ['[data-testid="eph-submit"]', '[data-testid="eph-view-year"]', '[data-testid="eph-field-ra"]', '[data-testid="eph-source"]']) {
        await page.locator(sel).scrollIntoViewIfNeeded();
        const r = await controlOk(page, sel);
        ok(`${name}: ${sel} görünür, ≥44 px, kırpılmamış`, r === "ok", r);
      }
      await page.click('[data-testid="eph-field-ra"]');
      const ra = await page.textContent('[data-testid="eph-cell-2026-10-01-sun"]');
      ok(`${name}: RA sekmesi zaman biriminde (s/d)`, /^\d{2}s \d{2}(,\d)?d/.test((ra || "").trim()), ra);
      const evs = await page.locator('[data-testid="eph-events"] li').count();
      ok(`${name}: olay listesi dolu`, evs > 10, `${evs}`);
      const meta = await page.textContent('[data-testid="eph-meta"]');
      ok(`${name}: kaynak/zaman kutusu 00:00 UT ve sağlayıcı adı YOK`, /00:00 UT/.test(meta || "") && !/roxy/i.test(meta || ""));
      if (name === "masaustu") {
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15_000 }), page.click('[data-testid="eph-csv"]')]);
        const p = await dl.path();
        const txt = fs.readFileSync(p, "utf8");
        ok("masaustu: CSV indirildi, başlık + 31×11 satır", txt.includes("tarih;saat_UT;cisim") && txt.trim().split(/\r?\n/).length === 2 + 31 * 11, `${txt.trim().split(/\r?\n/).length} satır`);
        // girdi değişince eski tablo gizlenir
        await page.fill('[data-testid="eph-month"]', "2026-11");
        ok("masaustu: girdi değişince eski tablo gizlenir", (await page.locator('[data-testid="eph-table"]').count()) === 0);
        // yıl görünümü + sayfalama
        await page.click('[data-testid="eph-view-year"]');
        await page.fill('[data-testid="eph-year"]', "2024");
        await page.click('[data-testid="eph-submit"]');
        await page.waitForSelector('[data-testid="eph-pager"]', { timeout: 60_000 });
        await page.click('[data-testid="eph-next"]');
        await page.waitForFunction(() => /2 \/ 12/.test(document.querySelector('[data-testid="eph-page"]')?.textContent || ""), null, { timeout: 60_000 });
        const feb = await page.locator('[data-testid="eph-table"] tbody tr').count();
        ok("masaustu: yıl sayfa 2/12 = Şubat 2024 (29 satır)", feb === 29, `${feb}`);
        // sağlayıcı kapalı → anlaşılır hata, tablo yok
        await page.selectOption('[data-testid="eph-source"]', "provider");
        await page.click('[data-testid="eph-submit"]');
        await page.waitForSelector('[data-testid="eph-error"]', { timeout: 30_000 });
        const em = await page.textContent('[data-testid="eph-error"]');
        ok("masaustu: sağlayıcı kapalı hatası, sağlayıcı adı yok", /kapalı/.test(em || "") && !/roxy/i.test(em || ""), em);
        // cisim seçilmedi
        await page.selectOption('[data-testid="eph-source"]', "local");
        for (const b of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "true_node"]) await page.uncheck(`[data-testid="eph-body-${b}"]`);
        await page.click('[data-testid="eph-submit"]');
        ok("masaustu: cisim seçilmeden gönderim → alan hatası", (await page.getAttribute('[data-testid="eph-error"]', "data-field")) === "bodies");
      }
      if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
      ok(`${name}: sayfa hatası yok`, errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nSONUÇ pro-ephemeris-ui (on): ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
