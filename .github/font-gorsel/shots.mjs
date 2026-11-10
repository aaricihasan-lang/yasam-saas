// KANIT: node .github/font-gorsel/shots.mjs <etiket> <port> <çıktı-dizini>
// Her ekran × genişlik (320 / 390 / 1440): tam sayfa PNG, yüklenen yüzler, Google istekleri, CDP ile öğe başına çizen fontlar
// (etiket = data-k ya da etiket adı + metin başı → önce/sonra eşleşmesi sıradan bağımsız), başlık / buton / kart ölçüleri.
import { chromium } from "playwright";
import fs from "node:fs";
const [, , etiket, port, dir] = process.argv;
if (fs.existsSync(dir)) throw new Error(`çıktı dizini zaten var: ${dir}`);
fs.mkdirSync(dir, { recursive: true });
const ekranlar = ["/zz-ekran/analiz", "/zz-ekran/atlas-giris", "/zz-ekran/atlas-arsiv", "/zz-ekran/atlas-bilgi", "/zz-ekran/atlas-calisma", "/zz-ekran/karakter"];
const b = await chromium.launch();
const ozet = [];
for (const w of [1440, 390, 320]) {
  for (const s of ekranlar) {
    const ctx = await b.newContext({ viewport: { width: w, height: w >= 1024 ? 900 : 844 }, deviceScaleFactor: 1, locale: "tr-TR" });
    const p = await ctx.newPage();
    const google = [];
    p.on("request", (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) google.push(r.url()); });
    const res = await p.goto(`http://127.0.0.1:${port}${s}`, { waitUntil: "load", timeout: 120000 });
    await p.evaluate(async () => { await document.fonts.ready; });
    await p.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    await p.waitForTimeout(2500);
    const ad = `${s.split("/").pop()}-${w}`;
    await p.screenshot({ path: `${dir}/${ad}.png`, fullPage: true });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    const secici = s.endsWith("karakter") ? "[data-k] , [data-k] h2" : "h1, h2, h3, p, button, a, span, strong, small, label";
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: secici });
    const kullanilan = {};
    for (const id of nodeIds.slice(0, 220)) {
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: id }).catch(() => ({ fonts: [] }));
      if (!fonts.length) continue;
      const { node } = await cdp.send("DOM.describeNode", { nodeId: id, depth: 1 });
      const attrs = Object.fromEntries((node.attributes || []).reduce((a, v, i, arr) => (i % 2 ? a : [...a, [v, arr[i + 1]]]), []));
      let anahtar = attrs["data-k"];
      if (!anahtar) {
        const metin = (node.children || []).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join("").trim().slice(0, 40);
        anahtar = `${node.localName}:${metin}`;
      }
      let k = anahtar, n = 2; while (kullanilan[k]) k = `${anahtar}#${n++}`;
      kullanilan[k] = fonts.map((f) => ({ aile: f.isCustomFont ? `ÖZEL(${f.familyName})` : f.familyName, glif: f.glyphCount }));
    }
    const olcum = await p.evaluate(() => {
      const kutu = (sel) => [...document.querySelectorAll(sel)].slice(0, 12).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; });
      return { yukseklik: document.documentElement.scrollHeight, genislik: document.documentElement.scrollWidth, tasma: document.documentElement.scrollWidth > window.innerWidth,
        baslik: kutu("h1, h2"), buton: kutu("button, a"), kart: kutu("[class*='card' i]") };
    });
    ozet.push({ etiket, ekran: s, w, durum: res.status(), ...olcum, googleIstek: google, kullanilan });
    await ctx.close();
  }
}
fs.writeFileSync(`${dir}/ozet.json`, JSON.stringify(ozet, null, 1));
for (const o of ozet) console.log(o.ekran, o.w, "durum", o.durum, "yükseklik", o.yukseklik, "taşma", o.tasma, "google", o.googleIstek.length, "öğe", Object.keys(o.kullanilan).length);
await b.close();
