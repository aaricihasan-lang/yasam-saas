// ATL-B01 (30.10.2026) — Upagraha eski (-1) / yeni (BPHS, -2) kayıt: ekran + Word/PDF regresyonu (Playwright Chromium). YEREL; sahte DB +
// sahte sağlayıcı (GERÇEK golden yanıtlar: vedic-upagraha-a-night.json, vedic-upagraha-b.json). GERÇEK sağlayıcı çağrılmaz.
// Önkoşul: dev-fake-backend (FAKE_ROXY_CERT/KEY) ve yerel next sunucusu (ASTROLOGY_MODULE_ENABLED=true,
//          NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<fake>, ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2).
// Çalıştırma: node scripts/astrology/upagraha-kalavela-ui.e2e.cjs <origin> <fake-port> <eski-teknik.json> [ekran-görüntüsü-klasörü]
//   eski-teknik.json = aynı gerçek yanıtın ESKİ (-1) projeksiyonu (origin/main kodu; adaptör projeksiyonu değişmedi).
//   1) API: "A Pazar gecesi" (23:10 İstanbul) ve "Sentetik B" (Pazartesi gündüz) Upagraha → kaydet (yeni, -2). Eski kayıt: yeni kaydın
//      satırı kopyalanır, teknik veri + sürüm -1 ile (sahte DB'ye; prod'a DEĞİL). Word/PDF metinleri ↔ beklenen değer ve notlar.
//   2) Kayıtlı analizler 1366×768, 390×844, 320×568: değerler, yöntem notları, eski kayıt uyarısı; taşma / kırpılma / küçük yazı yok.
//   Tarayıcı öykünmesidir; fiziksel cihaz testi DEĞİLDİR.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const JSZip = require("jszip");
const [ORIGIN = "http://localhost:3971", FAKE = "54399", OLD_TECH = "", OUT = ""] = process.argv.slice(2);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const API = `${ORIGIN}/api/admin/astroloji`;
const REST = `http://127.0.0.1:${FAKE}/rest/v1`;
const T = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
const JARGON = /\broxy\b|golden|fixture|\/vedic-astrology\//i;
const norm = (s) => s.replace(/\s+/g, " ").trim();
// Yöntem notlarının ayırt edici parçaları (model/vedicNoktalar.ts).
const N = {
  sysNew: "8. parça yöneticisizdir",
  sysOld: "Bu kayıt eski hesap sürümüdür",
  schoolNew: "Ekol farkı ve yöntem: Kala, Mrityu, Ardhaprahara ve Yamaghantaka, BPHS'e",
  schoolOld: "Ekol farkı (16 gerçek hesapla",
  legacy: "BPHS sırasıyla hesaplanmamıştır",
};
// Beklenen değerler (A Pazar gecesi: Kala/Mrityu/Ardhaprahara BPHS ile değişir, Yamaghantaka aynı; B Pazartesi gündüz: Kala değişir).
const CASES = {
  aNew: { label: "A Pazar gecesi", want: ["319,90°", "310,35°", "349,79°", "39,92°", "58,36°", "270,68°"], notes: ["sysNew", "schoolNew"], absent: ["sysOld", "schoolOld", "legacy"] },
  aOld: { label: "A Pazar gecesi — ESKİ kayıt", want: ["319,90°", "310,35°", "17,34°", "58,36°", "74,19°", "270,68°"], notes: ["sysOld", "schoolOld", "legacy"], absent: ["sysNew", "schoolNew"] },
  bNew: { label: "Sentetik B", want: ["103,95°", "101,53°", "121,99°", "12,60°", "42,45°", "65,74°"], notes: ["sysNew", "schoolNew"], absent: ["sysOld", "schoolOld", "legacy"] },
};
async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([{ name: "__Host-yasam_sid", value: T, domain: host, path: "/", secure: true }, { name: "yasam_admin_session", value: T, domain: host, path: "/" }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  return { ctx, page: await ctx.newPage() };
}
async function docxText(buf) {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml").async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function pdfText(file) {
  return execFileSync("pdftotext", ["-enc", "UTF-8", file, "-"], { encoding: "utf8" });
}
const noteHits = (text, keys) => keys.filter((k) => norm(text).includes(norm(N[k])));

(async () => {
  // ── 1) API: profiller, hesap, yeni kayıtlar, eski kayıt
  const sel = { technique: "vedic.upagraha", options: { ayanamsa: "lahiri" } };
  const cr = await api("/profiles", { label: "A Pazar gecesi", clientId: "11111111-1111-4111-8111-111111111111", birthDate: "1990-07-15", birthTime: "23:10", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" });
  // Yeniden çalıştırmada aynı doğum verili profil zaten vardır → onu kullan (tekrar oluşturulmaz).
  const pidA = cr.j?.profile?.id ?? (cr.j?.code === "DUPLICATE_PROFILE" ? cr.j.duplicates?.[0]?.profileId : undefined);
  ok("profil A Pazar gecesi oluşturuldu", typeof pidA === "string", JSON.stringify(cr.j).slice(0, 200));
  const pidB = (await api(`/profiles?q=${encodeURIComponent("Sentetik B")}`)).j?.profiles?.[0]?.id;
  ok("profil Sentetik B (tohum)", typeof pidB === "string");
  const ids = {};
  for (const [key, pid] of [["aNew", pidA], ["bNew", pidB]]) {
    const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [sel] });
    const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [sel], confirmNewRequests: plan.j?.plan?.newRequestCount ?? 0 });
    const it = run.j?.results?.[0];
    const tb = it?.view?.technical?.timeBased ?? [];
    ok(`API ${key}: hesap OK, kalaVela BPHS işareti, adaptör -2`, it?.ok === true && it?.view?.technical?.kalaVela?.method === "bphs_part_start" && it?.view?.adapterVersion === "astro-roxy-vedic-upagraha-2", JSON.stringify(it ?? run.j).slice(0, 300));
    ok(`API ${key}: değerler ${tb.map((p) => `${p.id} ${p.longitude}`).join(", ")}`, CASES[key].want.every((w) => tb.some((p) => p.longitude.toFixed(2).replace(".", ",") + "°" === w)));
    const sv = await api("/analyses", { profileId: pid, revision: 1, technique: sel.technique, options: it?.view?.options ?? sel.options, saveRequestId: randomUUID(), includeProviderInterp: true, title: `${CASES[key].label} — Upagraha (yeni)` });
    ids[key] = sv.j?.analysisId;
    ok(`kayıt ${key}`, typeof ids[key] === "string", JSON.stringify(sv.j).slice(0, 200));
  }
  // Eski kayıt: yeni A kaydının satırı, teknik veri ESKİ projeksiyon + sürüm -1 (yalnız sahte DB).
  const row = (await (await fetch(`${REST}/astro_analyses?id=eq.${ids.aNew}&select=*`)).json())[0];
  const oldTech = JSON.parse(fs.readFileSync(OLD_TECH, "utf8"));
  const rpc = await fetch(`${REST}/rpc/astro_analysis_save_v2`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      p_tenant_id: TENANT, p_user_id: OWNER, p_profile_id: pidA, p_profile_revision: 1, p_partner_profile_id: null, p_partner_profile_revision: null, p_result_ids: [],
      p_technique: "vedic.upagraha", p_title: "A Pazar gecesi — Upagraha (ESKİ kayıt)", p_save_request_id: randomUUID(), p_technique_params: row.technique_params,
      p_profile_snapshot: row.profile_snapshot, p_method_snapshot: row.method_snapshot, p_technical_snapshot: oldTech, p_kb_snapshot: [], p_provider_interp_included: false,
      p_provider_interp_snapshot: null, p_versions_snapshot: { ...row.versions_snapshot, adapterVersion: "astro-roxy-vedic-upagraha-1", projectionVersion: "vedic-upagraha-proj-1" }, p_notes: [],
    }),
  });
  ids.aOld = (await rpc.json())?.analysis_id;
  ok("eski (-1) kayıt sahte DB'ye yazıldı", typeof ids.aOld === "string");
  const before = JSON.stringify((await (await fetch(`${REST}/astro_analyses?id=eq.${ids.aOld}&select=*`)).json())[0]);
  const detail = await api(`/analyses/${ids.aOld}`);
  ok("eski kayıt açılır: legacy notu upagraha_kala_vela + değerler AYNEN (17,34 · 58,36 · 74,19)", (detail.j?.analysis?.legacyNotes ?? []).some((n) => n.code === "upagraha_kala_vela") && JSON.stringify(detail.j?.analysis?.technical?.timeBased) === JSON.stringify(oldTech.timeBased), JSON.stringify(detail.j?.analysis?.legacyNotes ?? detail.j).slice(0, 300));
  const pids = { aNew: pidA, aOld: pidA, bNew: pidB };

  // ── Word / PDF içerikleri
  const docs = {};
  for (const key of ["aNew", "aOld", "bNew"]) {
    for (const fmt of ["docx", "pdf"]) {
      const r = await api(`/analyses/${ids[key]}/report?format=${fmt}`, null, true);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`rapor ${key} ${fmt}: 200`, r.status === 200 && buf.length > 5000, `${r.status} ${buf.length}`);
      const file = path.join(OUT || require("node:os").tmpdir(), `upagraha-${key}.${fmt}`);
      fs.writeFileSync(file, buf);
      const text = fmt === "docx" ? await docxText(buf) : pdfText(file);
      docs[`${key}.${fmt}`] = text;
      const c = CASES[key];
      const t = norm(text);
      const missV = c.want.filter((w) => !t.includes(w));
      const missN = c.notes.filter((k) => !noteHits(text, [k]).length);
      const extra = c.absent.filter((k) => noteHits(text, [k]).length);
      ok(`${fmt.toUpperCase()} ${key}: değerler + doğru yöntem notları; yanlış not yok; jargon yok`, !missV.length && !missN.length && !extra.length && !JARGON.test(text), `eksik değer ${missV} · eksik not ${missN} · fazla not ${extra}`);
      if (key === "aOld") ok(`${fmt.toUpperCase()} aOld: genel 'Eski hesap sürümü' bölümü`, t.includes("Eski hesap sürümü"));
    }
  }

  // ── 2) Ekran: 1366×768, 390×844, 320×568
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const screen = {};
  for (const [w, hh] of [
    [1366, 768],
    [390, 844],
    [320, 568],
  ]) {
    const tag = `${w}x${hh}`;
    const { ctx, page } = await newPage(browser, w, hh);
    for (const key of ["aNew", "aOld", "bNew"]) {
      await page.goto("about:blank");
      await page.goto(`${ORIGIN}/admin/astroloji#danisan/${pids[key]}`, { waitUntil: "load", timeout: 240000 });
      const item = page.locator(`[data-saved-item="${ids[key]}"]`);
      await item.waitFor({ timeout: 120000 }).catch(() => {});
      ok(`${tag} ${key}: kayıt danışan dosyasında görünür`, await item.isVisible().catch(() => false));
      await item.click().catch(() => {});
      const sec = page.locator("[data-testid=astro-upagraha-panel]").first();
      await sec.waitFor({ timeout: 60000 }).catch(() => {});
      ok(`${tag} ${key}: panel görünür`, await sec.isVisible().catch(() => false));
      // Açılan kaydın başlığındaki "Eski hesap sürümü" etiketi (SavedAnalysisView): yalnız eski kayıtta.
      ok(`${tag} ${key}: başlıkta 'Eski hesap sürümü' etiketi ${key === "aOld" ? "VAR" : "YOK"}`, (await page.locator("[data-testid=astro-legacy-method]:visible").count()) === (key === "aOld" ? 1 : 0));
      const timeTxt = await page.locator("[data-testid=astro-upagraha-time]").first().innerText().catch(() => "");
      const c = CASES[key];
      ok(`${tag} ${key}: 6 + 5 satır; değerler ${c.want.join(" ")}`, (await page.locator("[data-testid=astro-upagraha-time] tbody tr").count()) === 6 && (await page.locator("[data-testid=astro-upagraha-sun] tbody tr").count()) === 5 && c.want.every((x) => timeTxt.includes(x)), c.want.filter((x) => !timeTxt.includes(x)).join(","));
      const panelTxt = await sec.innerText().catch(() => "");
      screen[`${key}.${tag}`] = panelTxt;
      const missN = c.notes.filter((k) => !noteHits(panelTxt, [k]).length);
      const extra = c.absent.filter((k) => noteHits(panelTxt, [k]).length);
      ok(`${tag} ${key}: doğru yöntem notları, yanlış not yok`, !missN.length && !extra.length, `eksik ${missN} · fazla ${extra}`);
      ok(`${tag} ${key}: eski kayıt uyarı kutusu ${key === "aOld" ? "VAR" : "YOK"}`, (await page.locator("[data-testid=astro-upagraha-legacy-order]").count()) === (key === "aOld" ? 1 : 0));
      // Taşma / kırpılma / küçük yazı: sayfada yatay taşma yok; not paragrafları ve uyarı kutusu kendi kutusuna sığıyor; tablo
      // kapsayıcısı taşarsa kaydırılabilir olmalı (overflow-x auto/scroll); görünür metin ≥ 11 px.
      const m = await page.evaluate(() => {
        const root = document.querySelector("[data-testid=astro-upagraha-panel]");
        const dw = document.documentElement.scrollWidth;
        const vw = document.documentElement.clientWidth;
        const clipped = [];
        for (const el of root.querySelectorAll("p, td, th, h2, h3, span")) {
          const cs = getComputedStyle(el);
          if (el.offsetParent === null || !el.textContent.trim()) continue;
          if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "auto" && cs.overflowX !== "scroll" && el.tagName === "P") clipped.push(el.textContent.slice(0, 40));
        }
        const tables = [...root.querySelectorAll("table")].map((t) => {
          let p = t.parentElement;
          while (p && p !== root && getComputedStyle(p).overflowX === "visible") p = p.parentElement;
          const fits = t.getBoundingClientRect().width <= (p ?? root).clientWidth + 1;
          return fits || ["auto", "scroll"].includes(getComputedStyle(p ?? root).overflowX);
        });
        let minFont = 99;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const el = walker.currentNode.parentElement;
          if (!walker.currentNode.textContent.trim() || !el || el.offsetParent === null) continue;
          minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
        }
        const pr = root.getBoundingClientRect();
        return { dw, vw, clipped, tablesOk: tables.every(Boolean), minFont, panelInside: pr.left >= -1 && pr.right <= vw + 1 };
      });
      ok(`${tag} ${key}: yatay taşma yok, kırpılmış paragraf yok, tablolar sığıyor ya da kaydırılabilir, panel ekranda, yazı ≥ 11 px`, m.dw <= m.vw + 1 && !m.clipped.length && m.tablesOk && m.panelInside && m.minFont >= 11, JSON.stringify(m));
      const body = await page.locator("body").innerText();
      ok(`${tag} ${key}: sağlayıcı adı / iç jargon yok`, !JARGON.test(body));
      if (OUT) {
        await sec.screenshot({ path: path.join(OUT, `upagraha-${key}-${tag}.png`) });
        // İç kaydırmalı masaüstü düzeninde tek parça element görüntüsü görünür alanın dışını boş çizer → bölüm bölüm görüntü.
        for (const [part, sel] of [["uyari", "[data-testid=astro-upagraha-legacy-order]"], ["zaman", "[data-testid=astro-upagraha-time]"], ["yontem", "[data-testid=astro-upagraha-method]"]]) {
          const loc = page.locator(sel).first();
          if (!(await loc.count())) continue;
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(200);
          await loc.screenshot({ path: path.join(OUT, `bolum-${key}-${tag}-${part}.png`) }).catch((e) => ok(`${tag} ${key}: ${part} görüntüsü`, false, String(e)));
        }
        // Dar ekranda zaman tablosu kaydırılabilir kapsayıcıda: sağa kaydırınca kalan sütunlar (Nakshatra · Dayanak) okunur.
        if (w < 640) {
          const sx = await page.evaluate(() => {
            const t = document.querySelector("[data-testid=astro-upagraha-time] table");
            let p = t?.parentElement;
            while (p && !["auto", "scroll"].includes(getComputedStyle(p).overflowX)) p = p.parentElement;
            if (!p) return null;
            p.scrollLeft = p.scrollWidth;
            return { scrollLeft: p.scrollLeft, max: p.scrollWidth - p.clientWidth };
          });
          ok(`${tag} ${key}: zaman tablosu yatay kaydırılabilir ve sona kaydırıldı`, !!sx && sx.max > 0 && Math.abs(sx.scrollLeft - sx.max) <= 1, JSON.stringify(sx));
          await page.waitForTimeout(200);
          await page.locator("[data-testid=astro-upagraha-time]").first().screenshot({ path: path.join(OUT, `bolum-${key}-${tag}-zaman-sag.png`) }).catch(() => {});
        }
        await page.screenshot({ path: path.join(OUT, `sayfa-${key}-${tag}.png`), fullPage: false });
      }
    }
    await ctx.close();
  }
  await browser.close();
  // ── Ekran ↔ Word/PDF aynı değer ve notlar
  for (const key of ["aNew", "aOld", "bNew"]) {
    const c = CASES[key];
    for (const tag of ["1366x768", "390x844", "320x568"]) {
      const s = screen[`${key}.${tag}`] ?? "";
      for (const fmt of ["docx", "pdf"]) {
        const d = docs[`${key}.${fmt}`] ?? "";
        const same = c.want.every((w) => norm(s).includes(w) === norm(d).includes(w)) && Object.keys(N).every((k) => noteHits(s, [k]).length === noteHits(d, [k]).length);
        ok(`ekran ${tag} ↔ ${fmt.toUpperCase()} ${key}: aynı değerler + aynı yöntem notu kümesi`, same);
      }
    }
  }
  const after = JSON.stringify((await (await fetch(`${REST}/astro_analyses?id=eq.${ids.aOld}&select=*`)).json())[0]);
  ok("eski kayıt satırı açma/rapor sonrası DEĞİŞMEDİ", before === after);
  console.log(`\nupagraha-kalavela-ui e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
