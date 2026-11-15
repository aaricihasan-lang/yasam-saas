// F1/F2 (14.11.2026) — secondary progression ORTALAMA DÜĞÜM + KUTUP NATAL EVLERİ ekran / arşiv / Word-PDF regresyonu (Playwright Chromium).
// YEREL; sahte DB + sahte sağlayıcı (KATI mod; GERÇEK sağlayıcı YOK). Önkoşul: dev-fake-backend **FAKE_F1F2_SEED=1** ile (f1f2Seed.ts:
// gerçek progresyon yanıtlarından 4 kayıt — yeni mean, yeni kutup, eski (-1) mean, eski (-1) kutup; hepsi SENTETİK "TEST" kişileri).
// Çalıştırma: node scripts/astrology/progression-f1f2-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü] [fake.log]
//   • API: arşivden aç → yeni kayıtta yöntem damgası, eski kayıtta "eski hesap" notu; 0 sağlayıcı isteği; kayıt değişmez
//   • Word/PDF 200: mean notu / eski uyarı; kutupta "Natal ev (Placidus)" YOK; eski kutupta "Placidus değil" etiketi
//   • Kayıtlı analiz 1366×768, 768×1024, 390×844: doğru not/uyarı görünür, kutupta Placidus başlığı yok, yatay taşma yok
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const JSZip = require("jszip");
const [ORIGIN = "http://localhost:3961", OUT = "", LOG = ""] = process.argv.slice(2);
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
const api = async (p, b, raw = false) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
  if (raw) return r;
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { s: r.status, j };
};
const hits = () => (LOG && fs.existsSync(LOG) ? (fs.readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const VIEWS = [
  [1366, 768],
  [768, 1024],
  [390, 844],
];
const MEAN_NOTE = "Ortalama düğüm: hesaplama hizmeti bu teknikte ortalama düğüm yerine gerçek düğüm döndürdüğü için";
const LEGACY_MEAN = "Bu kayıtta ortalama düğüm (mean) istendi, ancak kayıttaki Kuzey/Güney düğüm değerleri";
const POLAR_NOTE = "Doğum yeri kutup dairesi ötesinde";
const LEGACY_POLAR_LABEL = "Natal ev (hizmet değeri — Placidus değil)";
const LEGACY_POLAR = "Bu kayıttaki natal ev sütunu Placidus DEĞİLDİR";
async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return { ctx, page: await ctx.newPage() };
}

(async () => {
  // ── 1) API: 4 kayıt
  const cases = [];
  for (const [q, kind] of [
    ["TEST F1 · Katmandu", "mean"],
    ["TEST F2 · Tromsø", "polar"],
  ]) {
    const pr = await api(`/profiles?q=${encodeURIComponent(q)}`);
    const pid = pr.j?.profiles?.[0]?.id;
    ok(`tohum profili ${q}`, typeof pid === "string", JSON.stringify(pr.j).slice(0, 160));
    const ls = await api(`/analyses?profileId=${pid}`);
    const rows = (ls.j?.analyses ?? []).filter((a) => a.technique === "western.progression");
    ok(`${q}: 2 progresyon kaydı (yeni + eski)`, rows.length === 2, String(rows.length));
    for (const r of rows) cases.push({ pid, id: r.id, kind, legacy: /ESKİ kayıt/.test(r.title ?? ""), title: r.title });
  }
  const h0 = hits();
  for (const c of cases) {
    const tag = `${c.kind}${c.legacy ? " (eski -1)" : " (yeni -2)"}`;
    const a = (await api(`/analyses/${c.id}`)).j?.analysis;
    const t = a?.technical ?? {};
    const codes = (a?.legacyNotes ?? []).map((n) => n.code);
    if (c.kind === "mean" && !c.legacy) ok(`API ${tag}: adaptör -2, yerel mean damgası, not yok`, a?.versions?.adapterVersion === "astro-roxy-progression-2" && t.nodeComputation?.source === "local_mean" && codes.length === 0, `${a?.versions?.adapterVersion} ${JSON.stringify(codes)}`);
    if (c.kind === "mean" && c.legacy) ok(`API ${tag}: -1, damga yok, not progression_mean_node`, a?.versions?.adapterVersion === "astro-roxy-progression-1" && !t.nodeComputation && JSON.stringify(codes) === '["progression_mean_node"]', JSON.stringify(codes));
    if (c.kind === "polar" && !c.legacy) ok(`API ${tag}: natal ev numarası yok, polar_undefined, not yok`, (t.bodies ?? []).every((b) => b.house === null) && t.natalHouseStatus?.status === "polar_undefined" && codes.length === 0, JSON.stringify({ ev: (t.bodies ?? []).map((b) => b.house), nhs: t.natalHouseStatus ?? null, codes, adapter: a?.versions?.adapterVersion, kaynak: a?.natalFrameSource ?? null }));
    if (c.kind === "polar" && c.legacy) ok(`API ${tag}: saklı evler aynen + okuma anı işareti + not`, (t.bodies ?? []).every((b) => typeof b.house === "number") && t.natalHouseStatus?.status === "legacy_polar_provider" && JSON.stringify(codes) === '["progression_polar_houses"]', JSON.stringify(codes));
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${c.id}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${tag} ${fmt}: 200`, r.status === 200 && buf.length > 15000, `${r.status} ${buf.length} bayt`);
      if (OUT) fs.writeFileSync(path.join(OUT, `${c.kind}${c.legacy ? "-eski" : "-yeni"}.${fmt}`), buf);
      if (fmt === "docx" && r.status === 200) {
        const zip = await JSZip.loadAsync(buf);
        const text = (await zip.file("word/document.xml").async("string")).replace(/<[^>]+>/g, "");
        const want = c.kind === "mean" ? (c.legacy ? [LEGACY_MEAN] : [MEAN_NOTE]) : c.legacy ? [LEGACY_POLAR_LABEL, LEGACY_POLAR] : [POLAR_NOTE, "İlerletilmiş harita evi (tam burç)"];
        const notWant = c.kind === "polar" ? ["Natal ev (Placidus)"] : c.legacy ? [MEAN_NOTE] : [LEGACY_MEAN];
        ok(`Word ${tag}: doğru yöntem metni`, want.every((x) => text.includes(x)) && notWant.every((x) => !text.includes(x)), `eksik=${want.filter((x) => !text.includes(x)).length} fazla=${notWant.filter((x) => text.includes(x)).join(",")}`);
        ok(`Word ${tag}: sağlayıcı adı yok`, !/roxy/i.test(text) && !text.includes("undefined"));
      }
    }
  }
  if (LOG) ok("arşivden açma + rapor: 0 sağlayıcı isteği", hits() === h0, `${h0} → ${hits()}`);

  // ── 2) Kayıtlı analiz — 3 ekran × 4 kayıt
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const [w, h] of VIEWS) {
    const vtag = `${w}x${h}`;
    for (const c of cases) {
      const tag = `${vtag} ${c.kind}${c.legacy ? "-eski" : "-yeni"}`;
      const { ctx, page } = await newPage(browser, w, h);
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${c.pid}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${c.id}"]`);
      await item.waitFor({ timeout: 120000 });
      await item.click();
      await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
      await page.waitForTimeout(2000);
      const techTab = page.getByRole("tab", { name: /Teknik ayrıntı/ }).first();
      if (await techTab.count()) await techTab.click();
      await page.waitForTimeout(800);
      const vis = async (id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0 && (await page.locator(`[data-testid="${id}"]`).first().isVisible());
      const want = c.kind === "mean" ? (c.legacy ? "astro-progression-legacy-mean" : "astro-progression-mean-node-note") : c.legacy ? "astro-progression-legacy-polar" : "astro-progression-polar-note";
      const others = ["astro-progression-legacy-mean", "astro-progression-mean-node-note", "astro-progression-legacy-polar", "astro-progression-polar-note"].filter((x) => x !== want);
      ok(`${tag}: doğru not/uyarı görünür (${want})`, await vis(want));
      let wrong = [];
      for (const o of others) if (await page.locator(`[data-testid="${o}"]`).count()) wrong.push(o);
      ok(`${tag}: başka not/uyarı yok`, wrong.length === 0, wrong.join(","));
      const m = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="astro-progression-panel"]');
        const r = el?.getBoundingClientRect();
        const head = document.querySelector('[data-testid="astro-progression-natal-house-head"]');
        return { dw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, right: r ? r.right : 0, text: el ? el.innerText : "", natalHead: head ? head.textContent : null };
      });
      ok(`${tag}: konum tablosu`, await vis("astro-progression-positions"));
      if (c.kind === "polar") ok(`${tag}: 'Natal ev (Placidus)' başlığı YOK${c.legacy ? "; 'Placidus değil' etiketi var" : "; natal ev sütunu yok"}`, !m.text.includes("Natal ev (Placidus)") && (c.legacy ? m.natalHead === LEGACY_POLAR_LABEL : m.natalHead === null), String(m.natalHead));
      else ok(`${tag}: natal ev sütunu 'Natal ev (Placidus)'`, m.natalHead === "Natal ev (Placidus)", String(m.natalHead));
      ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1 && m.right <= m.vw + 1, JSON.stringify({ dw: m.dw, vw: m.vw, right: Math.round(m.right) }));
      ok(`${tag}: sağlayıcı adı yok`, !/roxy/i.test(m.text));
      ok(`${tag}: sayfa hatası yok`, errs.length === 0, errs.join(" | "));
      if (OUT) {
        const note = page.locator(`[data-testid="${want}"]`).first();
        await note.scrollIntoViewIfNeeded().catch(() => {});
        await page.screenshot({ path: path.join(OUT, `${c.kind}-${c.legacy ? "eski" : "yeni"}-${vtag}.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\nprogression-f1f2-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
