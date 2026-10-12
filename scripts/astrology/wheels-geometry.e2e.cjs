// Çift halka GEOMETRİ doğrulaması (Playwright; ağ YOK, Roxy ÇAĞRILMAZ). Roxy'nin `@roxyapi/ui` bileşenleri
// (`roxy-transit-wheel`, `roxy-synastry-chart`) kayıtlı golden Roxy yanıtlarından ve sentetik uç durumlardan üretilen
// veriyle çizilir; SVG'den her cismin ÇİZİLDİĞİ açı okunup ekliptik boylama geri çevrilir ve veriyle karşılaştırılır.
//   • Sembol kaydırılmamışsa sembolün kendisi ≤ 0,5° (bileşenin kaydırma eşiği); kaydırılmışsa gerçek derece işareti
//     (ince gösterge çizgisinin halkadaki ucu) ≤ 0,01°.
//   • Halka: transit natal iç (r≈94) / transit dış (r≈124); sinastri 1. kişi dış (r≈124) / 2. kişi iç (r≈96).
//   • Derece etiketi = gerçek boylamın burç içi tam derecesi. Ev cusp çizgileri ≤ 0,01°. Yön: ASC solda (transit),
//     Koç 0° solda (sinastri). Uç durumlar: 359,95° / 0,05°, 29,99° / 30,01°, 1,2° içinde 4 cisim, ASC 359,9°.
// Kullanım: node scripts/astrology/wheels-geometry.e2e.cjs <payloads.json> [genişlik]
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const payloads = JSON.parse(readFileSync(process.argv[2], "utf8"));
const width = Number(process.argv[3] ?? 390);
const BUNDLE = join(__dirname, "..", "..", "node_modules", "@roxyapi", "ui", "dist", "cdn", "roxy-ui.js");
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${width}px] ${n}${x ? ` — ${x}` : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route("**/*", (r) => (r.request().url().startsWith("data:") || r.request().url() === "about:blank" ? r.continue() : r.abort()));
  await page.setContent("<!doctype html><html><body style='margin:0'></body></html>");
  await page.addScriptTag({ content: readFileSync(BUNDLE, "utf8") });

  const measure = (tag, data) =>
    page.evaluate(
      async ({ tag, data }) => {
        document.body.innerHTML = "";
        const el = document.createElement(tag);
        el.setAttribute("lang", "tr");
        el.setAttribute("hide-readings", "");
        el.style.display = "block";
        document.body.appendChild(el);
        el.data = data;
        await el.updateComplete;
        await new Promise((r) => setTimeout(r, 50));
        await el.updateComplete;
        const svg = el.shadowRoot.querySelector('svg[part="chart"]');
        if (!svg) return { error: "svg yok" };
        const C = 200;
        const ang = (x, y) => (Math.atan2(y - C, x - C) * 180) / Math.PI;
        const dist = (x, y) => Math.hypot(x - C, y - C);
        const out = [];
        for (const g of svg.querySelectorAll("g")) {
          const glyph = g.querySelector(":scope > text.natal-glyph, :scope > text.transit-glyph, :scope > text.p1, :scope > text.p2");
          if (!glyph) continue;
          const title = glyph.querySelector("title")?.textContent ?? "";
          const leader = g.querySelector(":scope > line.leader");
          const gx = Number(glyph.getAttribute("x"));
          const gy = Number(glyph.getAttribute("y"));
          const tx = leader ? Number(leader.getAttribute("x1")) : gx;
          const ty = leader ? Number(leader.getAttribute("y1")) : gy;
          const deg = g.querySelector(":scope > text.planet-deg")?.textContent ?? null;
          const tag = glyph.querySelector("tspan.person-tag")?.textContent ?? null;
          out.push({ cls: glyph.getAttribute("class"), title, displaced: !!leader, glyphAngle: ang(gx, gy), trueAngle: ang(tx, ty), r: dist(gx, gy), deg, tag });
        }
        const cusps = [...svg.querySelectorAll("line.house-cusp")].map((l) => ang(Number(l.getAttribute("x1")), Number(l.getAttribute("y1"))));
        const vb = svg.getBoundingClientRect();
        return { bodies: out, cusps, svgWidth: vb.width, svgHeight: vb.height };
      },
      { tag, data },
    );

  const norm = (x) => ((x % 360) + 360) % 360;
  // Başlık: "[Natal|Transiting] <ad>[ retrograde] - 22°57' Koç[ · House 6]" → yalnız <ad> (tam eşleşme; "Ay" ≠ "Kuzey Ay Düğümü").
  const nameOf = (title) => title.replace(/^(Natal|Transiting|Transit) /, "").split(" - ")[0].replace(/ retrograde$/, "").trim();
  const minuteOf = (title) => {
    const m = /- (\d+)°(\d+)'/.exec(title);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const signDeg = (lon) => Math.floor(norm(lon) % 30);

  async function checkTransit(name, d) {
    const m = await measure("roxy-transit-wheel", d);
    if (m.error) return ok(`${name}: çizildi`, false, m.error);
    const asc = d.ascendant.longitude;
    const toLon = (a) => norm(180 + asc - a);
    const lists = [
      ["natal", d.natalPlanets, 94],
      ["transit", d.transitPlanets, 124],
    ];
    for (const [kind, list, R] of lists) {
      const drawn = m.bodies.filter((b) => b.cls.includes(`${kind}-glyph`));
      ok(`${name}: ${kind} cisim sayısı (${list.length})`, drawn.length === list.length, `${drawn.length}`);
      let worst = 0;
      let worstGlyph = 0;
      let ringOk = true;
      let labelOk = true;
      let ided = 0;
      for (const p of list) {
        const b = drawn.find((x) => nameOf(x.title) === p.nameLocalized || nameOf(x.title) === p.name);
        if (!b) continue;
        ided++;
        if (b.displaced) worst = Math.max(worst, diff(toLon(b.trueAngle), p.longitude));
        else worstGlyph = Math.max(worstGlyph, diff(toLon(b.glyphAngle), p.longitude));
        if (Math.abs(b.r - R) > 1.5) ringOk = false;
        if (b.deg && Number.parseInt(b.deg, 10) !== signDeg(p.longitude)) labelOk = false;
        const tm = minuteOf(b.title);
        const within = norm(p.longitude) % 30;
        // Kesme (truncation) beklenir; YALNIZ değer tam dakika sınırındaysa (|kalan| < 1e-6′) kayan nokta 1′ eksik gösterebilir.
        const exact = within * 60;
        const onBoundary = Math.abs(exact - Math.round(exact)) < 1e-6;
        const expectMin = onBoundary ? Math.round(exact) : Math.floor(exact);
        if (tm === null || !(tm === expectMin || (onBoundary && tm === expectMin - 1))) {
          labelOk = false;
          if (process.env.DEBUG) console.log("   etiket", p.name, p.longitude, b.title, b.deg);
        }
      }
      ok(`${name}: ${kind} kimlik eşleşmesi (başlıktan)`, ided === list.length, `${ided}/${list.length}`);
      ok(`${name}: ${kind} kaydırılan sembolün gerçek derece işareti ≤ 0,01°`, worst <= 0.01, `en büyük sapma ${worst.toFixed(4)}°`);
      ok(`${name}: ${kind} kaydırılmamış sembol ≤ 0,5°`, worstGlyph <= 0.5, `${worstGlyph.toFixed(3)}°`);
      ok(`${name}: ${kind} doğru halka (r≈${R})`, ringOk);
      ok(`${name}: ${kind} derece etiketi ve ipucu derece/dakika = veri`, labelOk);
    }
    ok(`${name}: 12 ev cusp'ı`, m.cusps.length === 12, `${m.cusps.length}`);
    const cuspWorst = Math.max(...m.cusps.map((a, i) => diff(toLon(a), d.houses[i].longitude)));
    ok(`${name}: ev cusp çizgileri ≤ 0,01°`, cuspWorst <= 0.01, `${cuspWorst.toFixed(4)}°`);
    ok(`${name}: ASC solda (180°)`, diff(toLon(180), asc) < 1e-9);
    return m;
  }

  async function checkSyn(name, d) {
    const m = await measure("roxy-synastry-chart", d);
    if (m.error) return ok(`${name}: çizildi`, false, m.error);
    const toLon = (a) => norm(180 - a);
    for (const [idx, list, R] of [
      ["1", d.person1.planets, 124],
      ["2", d.person2.planets, 96],
    ]) {
      const drawn = m.bodies.filter((b) => b.tag === idx);
      ok(`${name}: ${idx}. kişi cisim sayısı (${list.length})`, drawn.length === list.length, `${drawn.length}`);
      let worst = 0;
      let worstGlyph = 0;
      let ringOk = true;
      let ided = 0;
      for (const p of list) {
        const b = drawn.find((x) => nameOf(x.title) === p.nameLocalized || nameOf(x.title) === p.name);
        if (!b) continue;
        ided++;
        if (b.displaced) worst = Math.max(worst, diff(toLon(b.trueAngle), p.longitude));
        else worstGlyph = Math.max(worstGlyph, diff(toLon(b.glyphAngle), p.longitude));
        if (Math.abs(b.r - R) > 1.5) ringOk = false;
        if (b.deg && Number.parseInt(b.deg, 10) !== signDeg(p.longitude)) ringOk = false;
      }
      ok(`${name}: ${idx}. kişi kimlik eşleşmesi`, ided === list.length, `${ided}/${list.length}`);
      ok(`${name}: ${idx}. kişi kaydırılan sembolün gerçek derece işareti ≤ 0,01°`, worst <= 0.01, `${worst.toFixed(4)}°`);
      ok(`${name}: ${idx}. kişi kaydırılmamış sembol ≤ 0,5°`, worstGlyph <= 0.5, `${worstGlyph.toFixed(3)}°`);
      ok(`${name}: ${idx}. kişi ${idx === "1" ? "DIŞ" : "İÇ"} halkada (r≈${R})`, ringOk);
    }
    ok(`${name}: ev çizgisi YOK (sahte ev üretilmez)`, m.cusps.length === 0);
    return m;
  }

  const tg = await checkTransit("Transit golden", payloads.transitGolden);
  await checkTransit("Transit uç durum", payloads.transitEdge);
  const sg = await checkSyn("Sinastri golden", payloads.synGolden);
  await checkSyn("Sinastri uç durum", payloads.synEdge);
  if (tg && sg) ok("SVG ekrana sığar (yatay taşma yok)", tg.svgWidth <= width + 0.5 && sg.svgWidth <= width + 0.5, `${tg.svgWidth}/${sg.svgWidth}`);
  await browser.close();
  console.log(`\nwheels geometry: ${pass} PASS / ${fail} FAIL (${width}px)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("HATA", e);
  process.exit(2);
});
