/* eslint-disable @typescript-eslint/no-require-imports */
// G3 — Natal Word / PDF raporu GERÇEK UYGULAMA AKIŞI (2026-11-22). Yerel sahte arka uç + yerel sahte sağlayıcı (gerçek Roxy / DB YOK):
//   A. Yeni Natal analizi (API: profil → plan → hesapla → kaydet; saat biliniyor + saat bilinmiyor) → tekli rapor Word / PDF.
//   B. Kayıtlı analizi arşivden açma → "Word" / "PDF" düğmeleri → indirilen dosyalar (Ali natal + G2 saat bilinmiyor natal).
//   C. Toplu rapor (aynı danışanın seçili analizleri) Word / PDF.
//   Her dosya: geçerli DOCX (zip + word/document.xml) / PDF (%PDF), Natal tabloları ve burç / derece / dakika; saat bilinmiyorsa
//   Owner metni + Ay satırı; Word ve PDF aynı Ay / uyarı kuralı. 2026-11-23: yoğun burç derece cetveli (görsel + tablo) her akışta.
// Ön koşul: FAKE_NATAL_REAL_GOLDEN=1 FAKE_ROXY_RELABEL=1 FAKE_NATAL_G2_SEED=1 FAKE_ROXY_CERT/KEY dev-fake-backend.ts <fake> + next dev --webpack
//   (ROXY_API_KEY=local-fake-roxy-key, ROXY_API_BASE_URL=https://127.0.0.1:<fake+1>/api/v2, NODE_EXTRA_CA_CERTS=<cert>). Ajan oturumundan
//   başlatırken sunucuyu `env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE` ile açın (AGENTS.md yeniden yazılmasın).
// Çalıştırma: node scripts/astrology/natal-g3-report-download.e2e.cjs http://localhost:3991 <çıktı klasörü>
const { chromium } = require("playwright");
const { mkdirSync, writeFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const JSZip = require("jszip");

const [ORIGIN = "http://localhost:3991", OUT = join(process.cwd(), ".g3-indirme")] = process.argv.slice(2);
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const MOON_TXT = "Ay'ın kesin burcu ve derecesi, doğum saati bilinmediği için doğrulanamıyor.";
const MOON_ROW = "Doğum saati bilinmediği için konumu belirsiz";
let pass = 0;
let fail = 0;
const results = [];
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else fail++;
  results.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? "✓" : "✗"} ${name}${!cond && detail ? ` — ${String(detail).slice(0, 300)}` : ""}`);
}
const norm = (s) => s.replace(/[︎️]/g, "").replace(/\s+/g, " ");
async function pdfText(buf) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return norm(text);
}
async function docxText(buf) {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml").async("string");
  return norm([...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
}
async function check(tag, kind, buf, { timeUnknown }) {
  const isPdf = kind === "pdf";
  ok(`${tag} ${kind}: geçerli dosya`, isPdf ? buf.subarray(0, 5).toString() === "%PDF-" : buf.subarray(0, 2).toString() === "PK", `${buf.subarray(0, 8)}`);
  const txt = isPdf ? await pdfText(buf) : await docxText(buf);
  ok(
    `${tag} ${kind}: Natal tabloları (Gezegen yerleşimleri${timeUnknown ? "" : " · Ana eksenler · Ev başlangıçları"}) ve derece°dakika′`,
    /Gezegen yerleşimleri/.test(txt) && /\d+°\d\d′/.test(txt) && (timeUnknown ? !/Ev başlangıçları \(cusp\)/.test(txt) && !/Yükselen \(ASC\)/.test(txt) : /Ana eksenler/.test(txt) && /Ev başlangıçları/.test(txt)),
    txt.slice(0, 200),
  );
  if (timeUnknown) {
    const n = (txt.match(/doğrulanamıyor/g) || []).length;
    ok(`${tag} ${kind}: saat bilinmiyor — Owner metni (${n} kez) + Ay satırı; Ay açısı / 15 puan yok`, txt.includes(MOON_TXT) && n >= 4 && txt.includes(MOON_ROW) && !/Ay – /.test(txt) && txt.includes("Ay hariç 9 gezegen"), `n=${n}`);
  } else ok(`${tag} ${kind}: saat biliniyor — Ay normal satırı, Owner metni yok`, !txt.includes(MOON_ROW) && !txt.includes(MOON_TXT));
  // G3 (2026-11-23): yoğun burç derece cetveli — bölüm varsa görsel sayısı çark + cetvel; saat biliniyorsa golden harita (Yengeç'te
  // 3 nokta) cetvel İÇERMELİ. Saat bilinmiyorsa Ay cetvelde yer almaz (cetvel tablosunda "☽ Ay" yok).
  const images = isPdf ? (buf.toString("latin1").match(/\/Subtype \/Image/g) || []).length : Object.keys((await JSZip.loadAsync(buf)).files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/")).length;
  const ruler = txt.includes("Derece cetveli — yoğun burçlar");
  ok(`${tag} ${kind}: derece cetveli ${ruler ? "VAR" : "yok"} — görsel sayısı ${images} (çark + cetvel tutarlı)`, ruler ? images >= 2 && txt.includes("Cetveldeki noktalar") : images === 1, `images=${images}`);
  if (!timeUnknown) ok(`${tag} ${kind}: golden harita yoğun grup → derece cetveli var`, ruler);
  else if (ruler) {
    const from = txt.indexOf("Cetveldeki noktalar");
    ok(`${tag} ${kind}: saat bilinmiyor — Ay cetvelde yok`, !/☽ ?Ay/.test(txt.slice(from, txt.indexOf("Teknik hesaplama", from))));
  }
  return txt;
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "tr-TR", acceptDownloads: true, extraHTTPHeaders: { "x-admin-id": OWNER, "x-session-token": TOKEN } });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const api = async (path, body) => {
    const r = body ? await ctx.request.post(`${ORIGIN}/api/admin/astroloji${path}`, { data: body }) : await ctx.request.get(`${ORIGIN}/api/admin/astroloji${path}`);
    let json = null;
    try {
      json = await r.json();
    } catch {
      /* ikili yanıt */
    }
    return { status: r.status(), json, r };
  };
  const getFile = async (path) => {
    const r = await ctx.request.get(`${ORIGIN}/api/admin/astroloji${path}`);
    return { status: r.status(), buf: Buffer.from(await r.body()), type: r.headers()["content-type"] };
  };

  // ── A. Yeni Natal analizi (saat biliniyor / bilinmiyor) → tekli rapor ──
  const fresh = {};
  for (const [tag, birth] of [
    ["yeni-saatli", { birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" }],
    ["yeni-saatsiz", { birthDate: "1990-07-15", timeKnown: false, locationId: "tr-34-istanbul" }],
  ]) {
    const created = await api("/profiles", { label: `G3 ${tag} ${Date.now().toString(36)}`, ...birth });
    const pid = created.json?.profile?.id;
    const rev = created.json?.profile?.currentRevision ?? 1;
    const sels = [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }];
    const plan = await api("/engine/plan", { profileId: pid, revision: rev, selections: sels });
    const run = await api("/engine/run", { profileId: pid, revision: rev, selections: (plan.json?.plan?.selections ?? sels).map((s, i) => ({ technique: s.technique, options: s.options ?? sels[i].options })), confirmNewRequests: plan.json?.plan?.newRequestCount });
    const res = (run.json?.results ?? []).find((x) => x.technique === "western.natal");
    const saved = res?.ok ? await api("/analyses", { profileId: pid, revision: rev, technique: "western.natal", options: res.view.options, saveRequestId: randomUUID(), title: `G3 ${tag} natal` }) : null;
    const id = saved?.json?.analysisId;
    ok(`A ${tag}: profil → hesap (yerel sahte sağlayıcı) → kayıt`, !!pid && !!res?.ok && !!id, JSON.stringify({ p: created.status, plan: plan.status, run: run.status, save: saved?.status }));
    if (!id) continue;
    fresh[tag] = { pid, id };
    for (const kind of ["docx", "pdf"]) {
      const f = await getFile(`/analyses/${id}/report?format=${kind}`);
      ok(`A ${tag} ${kind}: HTTP 200`, f.status === 200, `${f.status} ${f.type}`);
      writeFileSync(join(OUT, `A-${tag}.${kind}`), f.buf);
      await check(`A ${tag}`, kind, f.buf, { timeUnknown: tag === "yeni-saatsiz" });
    }
  }

  // ── B. Arşivden aç → Word / PDF düğmeleri (gerçek indirme) ──
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  for (const [tag, client, saved, tu] of [["arsiv-ali", "Ali", "Ali natal", false], ["arsiv-saatsiz", "Ayşe", "G2 saat bilinmiyor", true]]) {
    await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 300000 });
    await page.waitForSelector("[data-portal=archive]", { timeout: 300000 });
    await page.locator("[data-portal=archive]").first().click();
    await page.waitForSelector("[data-testid=astro-archive-list]", { timeout: 120000 });
    const rows = page.locator("[data-testid=astro-archive-list] [title='Danışan dosyasını aç']");
    // Liste kabı satırlardan önce gelebilir → aranan danışanın satırı görünene kadar beklenir (en çok 60 sn).
    await page
      .waitForFunction((c) => [...document.querySelectorAll("[data-testid=astro-archive-list] [title='Danışan dosyasını aç']")].some((e) => (e.closest("tr,li,article,[role=row]") || e.parentElement).innerText.includes(c)), client, { timeout: 60000 })
      .catch(() => {});
    const n = await rows.count();
    const seen = [];
    let hit = false;
    for (let i = 0; i < n; i++) {
      const t = await rows.nth(i).evaluate((e) => (e.closest("tr,li,article,[role=row]") || e.parentElement).innerText);
      seen.push(t.replace(/\s+/g, " ").slice(0, 60));
      if (!hit && t.includes(client)) {
        await rows.nth(i).click();
        hit = true;
      }
    }
    ok(`B ${tag}: arşivde danışan satırı bulundu`, hit, seen.join(" | "));
    if (!hit) continue;
    await page.waitForSelector("[data-testid=astro-saved-analyses] [data-saved-item]", { timeout: 120000 });
    await page.locator("[data-testid=astro-saved-analyses] [data-saved-item]", { hasText: saved }).first().click();
    await page.waitForSelector("[data-testid=astro-report-docx]", { timeout: 120000 });
    for (const kind of ["docx", "pdf"]) {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.locator(`[data-testid=astro-report-${kind}]:visible`).first().click()]);
      const file = join(OUT, `B-${tag}.${kind}`);
      await dl.saveAs(file);
      ok(`B ${tag} ${kind}: düğmeyle indirildi (${dl.suggestedFilename()})`, true);
      await check(`B ${tag}`, kind, readFileSync(file), { timeUnknown: tu });
    }
  }
  ok("B: sayfa hatası yok", errors.length === 0, errors.join(" | "));

  // ── C. Toplu rapor (aynı danışanın seçili analizleri) ──
  if (fresh["yeni-saatli"]) {
    for (const kind of ["docx", "pdf"]) {
      const f = await getFile(`/analyses/report?profileId=${fresh["yeni-saatli"].pid}&ids=${fresh["yeni-saatli"].id}&format=${kind}`);
      ok(`C toplu ${kind}: HTTP 200`, f.status === 200, `${f.status}`);
      writeFileSync(join(OUT, `C-toplu.${kind}`), f.buf);
      await check("C toplu", kind, f.buf, { timeUnknown: false });
    }
  }
  await browser.close();
  writeFileSync(join(OUT, "sonuc.json"), JSON.stringify({ pass, fail, results }, null, 1));
  console.log(`\nnatal-g3-report-download e2e: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
