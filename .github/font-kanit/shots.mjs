// GEÇİCİ CI görsel kanıt (final commit'te kaldırılır). node .github/font-kanit/shots.mjs <etiket> <port> <çıktı-dizini>
// Her sayfa / genişlik: tam sayfa PNG + yüklenen font yüzleri + Google Fonts istekleri + CDP ile gerçekte kullanılan platform fontları.
import { chromium } from "playwright";
import fs from "node:fs";
const [, , etiket, port, dir] = process.argv;
if (fs.existsSync(dir)) throw new Error(`çıktı dizini zaten var: ${dir}`);
fs.mkdirSync(dir, { recursive: true });
const sayfalar = ["/zz-font-kanit", "/", "/register", "/gizlilik-politikasi"];
const b = await chromium.launch();
const ozet = [];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const s of sayfalar) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: "tr-TR" });
    const p = await ctx.newPage();
    const google = [];
    p.on("request", (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) google.push(r.url()); });
    const res = await p.goto(`http://127.0.0.1:${port}${s}`, { waitUntil: "load", timeout: 120000 });
    await p.evaluate(async () => { await document.fonts.ready; });
    await p.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    await p.waitForTimeout(2500);
    const ad = `${s.replace(/\W+/g, "_") || "kok"}-${w}`;
    await p.screenshot({ path: `${dir}/${ad}.png`, fullPage: true });
    const yuzler = await p.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family}|${f.weight}|${f.style}`).sort());
    // CDP: gerçekte çizen platform fontları (özel / sistem, glif sayısı)
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    const secici = s === "/zz-font-kanit" ? "[data-kanit]" : "h1, h2, p, button, a, label, input";
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: secici });
    const kullanilan = [];
    for (const id of nodeIds.slice(0, 80)) {
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: id }).catch(() => ({ fonts: [] }));
      if (!fonts.length) continue;
      const etk = s === "/zz-font-kanit" ? (await cdp.send("DOM.getAttributes", { nodeId: id })).attributes.join(" ").replace(/^.*data-kanit (\S+ \S+).*$/, "$1") : "";
      kullanilan.push({ etiket: etk, fontlar: fonts.map((f) => ({ ozel: f.isCustomFont, aile: f.isCustomFont ? "ÖZEL" : f.familyName, glif: f.glyphCount })) });
    }
    const olcum = await p.evaluate(() => ({ yukseklik: document.documentElement.scrollHeight, genislik: document.documentElement.scrollWidth,
      h1: [...document.querySelectorAll("h1")].slice(0, 3).map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), satir: Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight || "1")) }; }),
      buton: [...document.querySelectorAll("button, a[class*='btn'], a[class*='Btn']")].slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }));
    ozet.push({ etiket, sayfa: s, w, durum: res.status(), ...olcum, yuklenenYuz: yuzler.length, yuzler, googleIstek: google, kullanilan });
    await ctx.close();
  }
}
fs.writeFileSync(`${dir}/ozet.json`, JSON.stringify(ozet, null, 1));
for (const o of ozet) console.log(o.sayfa, o.w, "durum", o.durum, "yükseklik", o.yukseklik, "yüz", o.yuklenenYuz, "google isteği", o.googleIstek.length);
await b.close();
