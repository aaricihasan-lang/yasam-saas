/* eslint-disable @typescript-eslint/no-require-imports */
// Natal — iki dağılım yöntemi + harita imleci (2026-11-07) — UI e2e. Sentetik "Deniz Aksoy" (15.07.1990) kayıtlı Natal'ı:
//   • İMLEÇ: Natal haritasının görüntüleme yüzeyinde ve çark sembollerinin üstünde imleç "default" (büyüteç / el yok);
//     yakınlaştırınca da "default"; sürükleme / tekerlek / + − sığdır AYNEN çalışır. Karşılaştırma: kayıtlı Transit'in
//     haritasında eski imleç (zoom-in) DEĞİŞMEDEN.
//   • İPUÇLARI: burç, gezegen, ASC/MC/DSC/IC, ev başlangıcı ve açı <title> ipuçları DOM'da; fare üzerine gelince hedef öğe
//     ipucunu taşır (tarayıcının yerel ipucu — ekran görüntüsünde görünmez, DOM'dan doğrulanır).
//   • DAĞILIM: "10 Gezegen | 15 Puanlık Analiz" seçimi; varsayılan 10 Gezegen; 15 puanda toplamlar 15; yöntem notu; eşitlik
//     tek "baskın" ilan edilmeden; seçim sırasında API çağrısı YOK (yerel hesap).
//   • Sayfa yatay taşması yok; seçim düğmeleri ekranda (320 / 390 / masaüstü).
// Ön koşul: yerel sahte arka uç + next start + önizleme tohumu (NATAL-ELEMENT-IMLEC-ONIZLEME). Gerçek DB / sağlayıcı YOK.
// Çalıştırma: node scripts/astrology/natal-element-imlec-ui.e2e.cjs http://localhost:4224 1536 864 [çıktı klasörü]
const { chromium } = require("playwright");
const { writeFileSync } = require("node:fs");

const [ORIGIN = "http://localhost:4224", W = "1536", H = "864", OUT = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const BASE = `${ORIGIN}/admin/astroloji`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";

let pass = 0;
let fail = 0;
const results = [];
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else fail++;
  results.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "tr-TR", timezoneId: "Europe/Istanbul", deviceScaleFactor: 1, hasTouch: width < 640 });
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
  page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
  let apiCalls = [];
  page.on("request", (r) => {
    if (/\/api\//.test(r.url())) apiCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  const shot = async (name) => {
    if (!OUT) return;
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${width}-${name}.png` });
  };

  const openSaved = async (title) => {
    await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
    await page.waitForSelector("[data-portal=archive]", { timeout: 180000 });
    await page.locator("[data-portal=archive]").first().click();
    await page.waitForSelector("[data-testid=astro-archive-list]", { timeout: 90000 });
    const row = page.locator("[data-testid=astro-archive-list] tr, [data-testid=astro-archive-list] [role=row], [data-testid=astro-archive-list] li").filter({ hasText: "Deniz Aksoy" }).filter({ hasText: "15.07.1990" }).first();
    await row.locator("[title='Danışan dosyasını aç']").first().click();
    await page.waitForSelector("[data-testid=astro-saved-analyses] [data-saved-item]", { timeout: 90000 });
    await page.locator("[data-testid=astro-saved-analyses] [data-saved-item]", { hasText: title }).first().click();
    await page.waitForSelector("[data-testid=atlas-chart-viewport]", { timeout: 90000 });
    await page.waitForTimeout(1500);
  };
  const surface = () => page.locator("[data-testid=atlas-chart-viewport]:visible > [role=group]").first();
  const cursorAt = (x, y) => page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return el ? { tag: el.tagName.toLowerCase(), cursor: getComputedStyle(el).cursor, title: el.closest("text,g,svg") ? (el.closest("text")?.querySelector("title")?.textContent ?? null) : null } : null;
  }, [x, y]);

  // ══ Natal (kayıtlı)
  await openSaved("Deniz natal");
  const vp = surface();
  ok("Natal: harita yüzeyi imleci 'default'", (await vp.evaluate((el) => getComputedStyle(el).cursor)) === "default");
  await vp.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  // Çark sembolleri (ekranda görünenler arasından): ilk burç glifi ve ilk gezegen glifinin merkezinde imleç + ipucu
  const glyphs = await page.evaluate(() => {
    const svg = document.querySelector("[data-testid=atlas-chart-viewport] svg[aria-label='Natal harita çarkı']");
    if (!svg) return null;
    const pick = (re) => {
      for (const t of svg.querySelectorAll("text")) {
        const ti = t.querySelector("title");
        if (ti && re.test(ti.textContent)) {
          const r = t.getBoundingClientRect();
          if (r.width > 0 && r.y > 0 && r.y + r.height < window.innerHeight && r.x > 0 && r.x + r.width < window.innerWidth) return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: ti.textContent };
        }
      }
      return null;
    };
    return {
      sign: pick(/^(Koç|Boğa|İkizler|Yengeç|Aslan|Başak|Terazi|Akrep|Yay|Oğlak|Kova|Balık)$/),
      planet: pick(/^Güneş — /),
      asc: pick(/^Yükselen — /),
      mc: pick(/^Tepe Noktası \(MC\) — /),
      titles: svg.querySelectorAll("title").length,
    };
  });
  ok("İpuçları DOM'da (çark <title> sayısı > 40)", glyphs && glyphs.titles > 40, `title=${glyphs?.titles}`);
  for (const k of ["sign", "planet", "asc", "mc"]) {
    const g = glyphs?.[k];
    if (!g) {
      ok(`ipucu hedefi bulundu: ${k}`, false);
      continue;
    }
    await page.mouse.move(g.x, g.y);
    await page.waitForTimeout(150);
    const c = await cursorAt(g.x, g.y);
    ok(`fare ${k} üstünde: imleç default, ipucu korunur`, c && c.cursor === "default" && c.title === g.title, `${c?.tag} ${c?.cursor} · "${c?.title}"`);
  }
  // Yakınlaştırma (araç satırı + / tekerlek) sonrası da imleç default; ölçek gerçekten değişir
  const vpBox = await vp.boundingBox();
  await page.mouse.move(vpBox.x + vpBox.width / 2, vpBox.y + vpBox.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  const scale = Number(await page.locator("[data-testid=atlas-chart-viewport]:visible").first().getAttribute("data-scale"));
  ok("tekerlek yakınlaştırması çalışır", scale > 1, `ölçek ${scale}`);
  ok("yakınken imleç yine 'default' (el / büyüteç yok)", (await vp.evaluate((el) => getComputedStyle(el).cursor)) === "default");
  await page.mouse.down();
  await page.mouse.move(vpBox.x + vpBox.width / 2 + 40, vpBox.y + vpBox.height / 2 + 30, { steps: 5 });
  ok("sürüklerken imleç 'default'", (await vp.evaluate((el) => getComputedStyle(el).cursor)) === "default");
  await page.mouse.up();
  await vp.focus();
  await page.keyboard.press("0");
  await page.waitForTimeout(300);
  ok("klavye 0 → sığdır", Number(await page.locator("[data-testid=atlas-chart-viewport]:visible").first().getAttribute("data-scale")) === 1);
  await shot("natal-harita");

  // Dağılım özeti — iki yöntem
  const dist = page.locator("[data-testid=natal-distribution]:visible").first();
  await dist.scrollIntoViewIfNeeded();
  ok("Dağılım: varsayılan yöntem 10 Gezegen", (await dist.getAttribute("data-method")) === "planets10");
  const readCol = () =>
    dist.evaluate((el) => {
      const rows = [...el.querySelectorAll("div.flex.justify-between")].map((r) => [r.children[0].textContent, Number(r.children[1].textContent)]);
      return { rows, note: el.querySelector("[data-testid=natal-dist-note]")?.textContent ?? "", text: el.innerText };
    });
  const a = await readCol();
  const sum = (rows, names) => rows.filter(([n]) => names.includes(n)).reduce((s, [, v]) => s + v, 0);
  ok("10 Gezegen: element toplamı 10, nitelik toplamı 10", sum(a.rows, ["Ateş", "Toprak", "Hava", "Su"]) === 10 && sum(a.rows, ["Öncü", "Sabit", "Değişken"]) === 10, JSON.stringify(a.rows));
  ok("element sırası sabit (Ateş, Toprak, Hava, Su)", a.rows.slice(0, 4).map((r) => r[0]).join(",") === "Ateş,Toprak,Hava,Su");
  apiCalls = [];
  await page.locator("[data-testid=natal-dist-method-weighted15]:visible").first().click();
  await page.waitForTimeout(300);
  ok("15 Puanlık Analiz seçilir", (await dist.getAttribute("data-method")) === "weighted15");
  const b = await readCol();
  ok("15 puan: element toplamı 15, nitelik toplamı 15", sum(b.rows, ["Ateş", "Toprak", "Hava", "Su"]) === 15 && sum(b.rows, ["Öncü", "Sabit", "Değişken"]) === 15, JSON.stringify(b.rows));
  ok("15 puan: yöntem notu görünür", /Güneş, Ay ve Yükselen 3'er puan/.test(b.note) && /Uranüs, Neptün ve Plüton sayılmaz/.test(b.note));
  { const astro = apiCalls.filter((c) => /astrolog|astroloji|engine|roxy/i.test(c)); ok("yöntem seçimi hesaplama / astroloji API çağrısı yapmaz (yerel hesap)", astro.length === 0, astro.join(", ")); }
  const tieOk = (txt) => !/baskın: .*·/.test(txt) && (!/eşitlik:/.test(txt) || /eşit — \d+'(er|şer|ar|şar) (gezegen|puan)\./.test(txt));
  ok("eşitlikte tek 'baskın' yok; varsa eşitlik cümlesi", tieOk(b.text) && tieOk(a.text));
  await shot("dagilim-15-puan");
  await page.locator("[data-testid=natal-dist-method-planets10]:visible").first().click();
  await page.waitForTimeout(200);
  ok("10 Gezegen'e geri dönülür; değerler aynı", JSON.stringify((await readCol()).rows) === JSON.stringify(a.rows));
  const seg = await page.locator("[data-testid=natal-dist-method-weighted15]:visible").first().boundingBox();
  ok("seçim düğmeleri ekranda (taşmaz)", seg && seg.x >= 0 && seg.x + seg.width <= width + 1, JSON.stringify(seg));
  ok("sayfa yatay taşması yok", (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);

  // Word (gerçek indirilen dosya): iki yöntem + yöntem notu; PDF indirilir (boş değil)
  if (width >= 1024) {
    const JSZip = require("jszip");
    const get = async (fmt) => {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.locator(`[data-testid=astro-report-${fmt}]:visible`).first().click()]);
      return require("node:fs").readFileSync(await dl.path());
    };
    const docx = await get("docx");
    const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml").async("string");
    const plain = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    ok("Word: 10 Gezegen ve 15 Puanlık Analiz satırları", /Element — 10 Gezegen/.test(plain) && /Element — 15 Puanlık Analiz/.test(plain) && /Yöntem — 15 Puanlık Analiz/.test(plain));
    ok("Word: 15 puan değerleri ekranla aynı", plain.includes(b.rows.slice(0, 4).map(([n, v]) => `${n} ${v}`).join(" · ")), b.rows.slice(0, 4).map(([n, v]) => `${n} ${v}`).join(" · "));
    const pdf = await get("pdf");
    ok("PDF indirilir", pdf.length > 1000 && pdf.slice(0, 4).toString() === "%PDF", `${pdf.length} bayt`);
  }

  // ══ Karşılaştırma: Natal DIŞI teknik (Transit) imleci değişmedi
  await openSaved("Deniz transit");
  const vpT = surface();
  if ((await vpT.count()) > 0) ok("Transit haritası: eski imleç (zoom-in) korunur", (await vpT.evaluate((el) => getComputedStyle(el).cursor)) === "zoom-in");
  else ok("Transit haritası görüntüleyicisi bulundu", false);

  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  console.log(`\nnatal-element-imlec e2e (${width}×${height}): ${pass} PASS / ${fail} FAIL`);
  if (OUT) writeFileSync(`${OUT}/${width}-sonuc.json`, JSON.stringify({ width, height, pass, fail, results }, null, 1));
  await browser.close();
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
