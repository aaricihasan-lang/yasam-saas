// ATL-P2-03 (#548, 2026-10-24) — KP bölünmüş alt bölüm: GERÇEK tarayıcı akışı (Playwright Chromium). YEREL; sahte DB + sahte sağlayıcı
// KATI kip (FAKE_ROXY_RELABEL=0): üç GERÇEK sağlayıcı yanıtı (golden kp-planets-ist-*-split-*.json, 24.10.2026; gövde ürünün kendi
// kpPlanetsAtBody çıktısı — KP tek an, İstanbul) BİREBİR gövdeyle döner. Sağlayıcı üçünde de 1. parça numarasını bildirir.
// Beklenen değerler BAĞIMSIZ hesaptır (rasyonel 249 KP tablosu + Vimshottari kesirleriyle sub-sub; boylam Skyfield DE440 ile ≤1,49″):
// ürünün kendi çıktısından türetilmez.
// Önkoşul: yerel next (ASTROLOGY_MODULE_ENABLED=true, sahte DB/sağlayıcı) + dev-fake-backend FAKE_ROXY_RELABEL=0.
// Çalıştırma: node scripts/astrology/kp-split-ui.e2e.cjs <origin> [ekran-görüntüsü-klasörü]
//   • API: hesap REDDEDİLMEZ; ilgili gezegen kpNumber = tablo (2. parça), kpNumberProvider = sağlayıcının yanlış numarası; lordlar/boylam
//   • kaydet → aynı seçim 0 yeni istek → Word (numara "23*", açıklama notu, lordlar) / PDF 200
//   • Kayıtlı analiz danışan dosyasından (arşiv) açılır — 390×844, 768×1024, 1366×768: satırda konum, burç/yıldız/Sub/Sub-sub, "23*",
//     yanlış numara (22) görünmez, açıklama notu, yatay taşma yok, sağlayıcı adı / undefined / NaN yok, sayfa hatası yok
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
const { chromium } = require("playwright");
const { randomUUID } = require("crypto");
const path = require("path");
const zlib = require("zlib");
const [ORIGIN = "http://localhost:3961", OUT = ""] = process.argv.slice(2);
const API = `${ORIGIN}/api/admin/astroloji`;
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": T, cookie: `yasam_admin_session=${T}`, origin: ORIGIN };
const TR = { sun: "Güneş", moon: "Ay", mars: "Mars", mercury: "Merkür", jupiter: "Jüpiter", venus: "Venüs", saturn: "Satürn", rahu: "Rahu", ketu: "Ketu" };
// Bağımsız beklenen (C:/YasamSistemi-QA/ATLAS-ROXY-KABUL-2026-10-24/01-kp/analiz.py): an, gezegen, konum metni, lordlar, KP, sağlayıcı KP
const CASES = [
  { ad: "ay-kp23", atUtc: "2026-11-24T02:45", body: "moon", pos: "0°36′59″", lon: 30.6165, sign: "venus", star: "sun", sub: "rahu", ss: "venus", kp: 23, prov: 22 },
  { ad: "ay-kp229", atUtc: "2026-11-19T19:45", body: "moon", pos: "0°19′17″", lon: 330.3215, sign: "jupiter", star: "jupiter", sub: "moon", ss: "venus", kp: 229, prov: 228 },
  { ad: "mars-kp23", atUtc: "2036-03-06T00:00", body: "mars", pos: "0°03′30″", lon: 30.0584, sign: "venus", star: "sun", sub: "rahu", ss: "saturn", kp: 23, prov: 22 },
];
let pass = 0, fail = 0;
const ok = (name, cond, info = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${info ? " — " + String(info).slice(0, 300) : ""}`); };
const api = async (p, b) => {
  const r = await fetch(`${API}${p}`, { method: b ? "POST" : "GET", headers: H, body: b ? JSON.stringify(b) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let j = null;
  try { j = JSON.parse(buf); } catch {}
  return { s: r.status, j, buf };
};
function docxText(buf) {
  let i = 0;
  while ((i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), i)) >= 0) {
    const method = buf.readUInt16LE(i + 8), csize = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), xlen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nlen).toString();
    const start = i + 30 + nlen + xlen;
    if (name === "word/document.xml") {
      const data = buf.slice(start, start + csize);
      const xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
      // paragraf sonu → boşluk; koşu (run) sınırları birleşik (ör. "23" + "*" ayrı koşularda olabilir)
      return xml.replace(/<\/w:p>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    }
    i = start;
  }
  return "";
}
const findAll = (o, pred, acc = []) => {
  if (o && typeof o === "object") {
    if (pred(o)) acc.push(o);
    for (const v of Object.values(o)) findAll(v, pred, acc);
  }
  return acc;
};
(async () => {
  const pid = (await api(`/profiles?q=${encodeURIComponent("Ali Örnek")}`)).j.profiles[0].id;
  const saved = {};
  for (const c of CASES) {
    const options = { atUtc: c.atUtc, ayanamsa: "kp-newcomb", nodeType: "mean" };
    const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "kp.transit", options }] });
    const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: "kp.transit", options: plan.j.plan.selections[0].options }], confirmNewRequests: plan.j.plan.newRequestCount });
    const r0 = run.j?.results?.[0];
    ok(`${c.ad}: hesap REDDEDİLMEDİ (önceki davranış: bölünmüş alt bölüm → RET)`, r0?.ok === true, JSON.stringify(run.j).slice(0, 240));
    if (!r0?.ok) continue;
    const pts = findAll(r0.view, (o) => o.id === c.body && typeof o.kpNumber === "number");
    const p = pts[0];
    ok(`${c.ad}: API ${c.body} KP = ${c.kp} (tablo), sağlayıcı izi ${c.prov}`, !!p && p.kpNumber === c.kp && p.kpNumberProvider === c.prov, JSON.stringify(p && { kp: p.kpNumber, prov: p.kpNumberProvider }));
    ok(`${c.ad}: API lordlar burç/yıldız/Sub/Sub-sub = bağımsız`, !!p && p.signLord === c.sign && p.starLord === c.star && p.subLord === c.sub && p.subSubLord === c.ss, JSON.stringify(p && [p.signLord, p.starLord, p.subLord, p.subSubLord]));
    ok(`${c.ad}: API boylam ${c.lon}°`, !!p && Math.abs((p.longitude ?? p.lon ?? NaN) - c.lon) < 1e-6, JSON.stringify(p && (p.longitude ?? p.lon)));
    const others = findAll(r0.view, (o) => typeof o.kpNumber === "number" && typeof o.kpNumberProvider === "number" && o.id !== c.body);
    ok(`${c.ad}: başka noktada yerel düzeltme yok`, others.length === 0, JSON.stringify(others.map((o) => o.id)));
    const sv = await api("/analyses", { profileId: pid, revision: 1, technique: "kp.transit", options: r0.view.options, saveRequestId: randomUUID() });
    ok(`${c.ad}: kayıt (201)`, (sv.s === 201 || sv.s === 200) && sv.j?.ok === true && !!sv.j?.analysisId, `${sv.s} ${JSON.stringify(sv.j).slice(0, 160)}`);
    saved[c.ad] = sv.j?.analysisId;
    const again = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique: "kp.transit", options }] });
    ok(`${c.ad}: aynı seçim 0 yeni istek (önbellek)`, again.j?.plan?.newRequestCount === 0);
    const docx = await api(`/analyses/${saved[c.ad]}/report?format=docx`);
    const txt = docxText(docx.buf);
    if (OUT) require("fs").writeFileSync(path.join(OUT, `word-${c.ad}.txt`), txt);
    ok(`${c.ad}: Word 200 + "${c.kp}*" + açıklama notu`, docx.s === 200 && txt.includes(`${c.kp}*`) && /KP alt bölüm tablosu/.test(txt), `${docx.s} ${txt.length}`);
    ok(`${c.ad}: Word lordlar (${TR[c.star]} / ${TR[c.sub]} / ${TR[c.ss]}) ve sağlayıcı adı / undefined / NaN yok`, txt.includes(TR[c.sub]) && txt.includes(TR[c.ss]) && !/roxy|undefined|NaN/i.test(txt));
    const pdf = await api(`/analyses/${saved[c.ad]}/report?format=pdf`);
    ok(`${c.ad}: PDF 200`, pdf.s === 200 && pdf.buf.length > 1000 && pdf.buf.slice(0, 4).toString() === "%PDF", `${pdf.s} ${pdf.buf.length}`);
  }
  const browser = await chromium.launch();
  for (const [W, Hh] of [[390, 844], [768, 1024], [1366, 768]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: Hh }, isMobile: W < 640, hasTouch: W < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
    await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: "localhost", path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: "localhost", path: "/" }]);
    await ctx.addInitScript(() => {
      localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
      localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    for (const c of CASES) {
      const tag = `${W}x${Hh} ${c.ad}`;
      const aid = saved[c.ad];
      if (!aid) { ok(`${tag}: kayıt yok`, false); continue; }
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pid}`, { waitUntil: "load", timeout: 180000 });
      await page.waitForSelector(`[data-saved-item="${aid}"]`, { timeout: 120000 });
      await page.locator(`[data-saved-item="${aid}"]`).click();
      await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
      await page.waitForSelector(`tr[data-kp-body="${c.body}"]`, { timeout: 60000 });
      await page.waitForTimeout(700);
      const m = await page.evaluate((b) => {
        const row = document.querySelector(`tr[data-kp-body="${b}"]`);
        const cells = row ? [...row.querySelectorAll("td")].map((td) => td.textContent.trim()) : [];
        const kpCell = row?.querySelector("[data-kp-local]");
        const note = [...document.querySelectorAll("[data-testid=astro-kp-local-number-note]")].filter((e) => e.offsetParent !== null);
        const body = document.body.innerText;
        return { cells, kp: kpCell?.textContent.trim() ?? null, kpTitle: kpCell?.getAttribute("title") ?? "", note: note[0]?.textContent ?? "", dw: document.documentElement.scrollWidth, vw: window.innerWidth, roxy: /\broxy\b/i.test(body), bad: /undefined|NaN/.test(body), localCount: document.querySelectorAll("[data-kp-local]").length };
      }, c.body);
      ok(`${tag}: KP hücresi "${c.kp}*" (yanlış ${c.prov} görünmez)`, m.kp === `${c.kp}*` && !m.cells.includes(String(c.prov)), JSON.stringify(m.cells));
      ok(`${tag}: konum ${c.pos} + burç/yıldız/Sub/Sub-sub ${TR[c.sign]}/${TR[c.star]}/${TR[c.sub]}/${TR[c.ss]}`, m.cells.some((t) => t.includes(c.pos)) && m.cells.includes(TR[c.sign]) && m.cells.includes(TR[c.star]) && m.cells.includes(TR[c.sub]) && m.cells.includes(TR[c.ss]), JSON.stringify(m.cells));
      ok(`${tag}: yıldız açıklaması — not görünür + hücre ipucu`, /KP alt bölüm tablosu/.test(m.note) && /KP alt bölüm tablosu/.test(m.kpTitle), m.note.slice(0, 120));
      ok(`${tag}: yalnız 1 işaretli numara`, m.localCount === 1, String(m.localCount));
      ok(`${tag}: yatay taşma yok`, m.dw <= m.vw + 1, JSON.stringify({ dw: m.dw, vw: m.vw }));
      ok(`${tag}: sağlayıcı adı / undefined / NaN yok`, !m.roxy && !m.bad);
      if (OUT) await page.locator(`tr[data-kp-body="${c.body}"]`).screenshot({ path: path.join(OUT, `kp-split-${c.ad}-${W}x${Hh}-satir.png`) }).catch(() => {});
      if (OUT && c.ad === "ay-kp23") await page.screenshot({ path: path.join(OUT, `kp-split-${c.ad}-${W}x${Hh}.png`) });
    }
    ok(`${W}x${Hh}: sayfa hatası yok`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(`\nkp-split-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HATA", e); process.exit(2); });
