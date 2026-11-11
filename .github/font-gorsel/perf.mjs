// KANIT: node .github/font-gorsel/perf.mjs <etiket> <port> <çıktı.json>
// Yazı tipi yükleme ölçümü (aynı runner türü, aynı Chromium, aynı ağ/CPU kısıtı; önce ve sonra AYNI betik):
//   • 390 px, ağ kısıtı ~Hızlı 3G (150 ms gecikme, ~1.44 Mbit/s indirme) + CPU 4× yavaş, önbellek KAPALI → soğuk yükleme × TEKRAR
//   • her koşuda: indirilen font istekleri (adres, aktarılan bayt, cache-control), <link rel=preload as=font> sayısı ve
//     hedefleri, CLS (layout-shift toplamı), LCP, FCP, document.fonts.ready süresi, CSP ihlali, 127.0.0.1 dışı istekler
//   • ardından aynı bağlamda ılık (önbellek AÇIK) yeniden yükleme → ağdan inen font baytı (önbellek davranışı)
// Tek runner ölçümüdür; değişkenlik için her rota TEKRAR kez ölçülür, medyan + min/max raporlanır.
import { chromium } from "playwright";
import fs from "node:fs";

const [, , etiket, port, cikti] = process.argv;
const TEKRAR = 5;
const ROTALAR = ["/", "/register", "/zz-ekran/analiz", "/zz-ekran/atlas-giris", "/zz-ekran/atlas-sonuc-acik", "/zz-ekran/dy", "/zz-ekran/enerji-beden", "/zz-ekran/kampanya"];
const AG = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024 * 0.9) / 8, uploadThroughput: (750 * 1024 * 0.9) / 8 };

const b = await chromium.launch();
const sonuc = [];

async function olc(ctx, p, cdp, url) {
  const fontlar = new Map();
  const disari = [];
  const csp = [];
  const onReq = (e) => {
    const u = e.request.url;
    if (!/^https?:\/\/127\.0\.0\.1/.test(u) && !u.startsWith("data:")) disari.push(u);
    if (e.type === "Font") fontlar.set(e.requestId, { url: u.replace(/^https?:\/\/[^/]+/, ""), bayt: 0, onbellek: false, cc: null });
  };
  const onResp = (e) => {
    const f = fontlar.get(e.requestId);
    if (f) {
      f.cc = e.response.headers["cache-control"] || e.response.headers["Cache-Control"] || null;
      f.onbellek = !!(e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromPrefetchCache);
    }
  };
  const onFin = (e) => {
    const f = fontlar.get(e.requestId);
    if (f) f.bayt = e.encodedDataLength;
  };
  const onCache = (e) => {
    const f = fontlar.get(e.requestId);
    if (f) f.onbellek = true;
  };
  cdp.on("Network.requestWillBeSent", onReq);
  cdp.on("Network.responseReceived", onResp);
  cdp.on("Network.loadingFinished", onFin);
  cdp.on("Network.requestServedFromCache", onCache);
  const onCon = (m) => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text().slice(0, 300));
  };
  p.on("console", onCon);
  const t0 = Date.now();
  await p.goto(url, { waitUntil: "load", timeout: 180000 });
  const fontsReady = await p.evaluate(async () => {
    await document.fonts.ready;
    return performance.now();
  });
  await p.waitForTimeout(3000);
  const vitals = await p.evaluate(() => {
    const cls = window.__kanitCls ?? null;
    const lcp = window.__kanitLcp ?? null;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    const preload = [...document.querySelectorAll('link[rel="preload"][as="font"]')].map((l) => l.getAttribute("href"));
    const yuklu = [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family}|${f.weight}|${f.style}`);
    return { cls, lcp, fcp, preload, yuklu };
  });
  cdp.off("Network.requestWillBeSent", onReq);
  cdp.off("Network.responseReceived", onResp);
  cdp.off("Network.loadingFinished", onFin);
  cdp.off("Network.requestServedFromCache", onCache);
  p.off("console", onCon);
  const f = [...fontlar.values()];
  return {
    sureMs: Date.now() - t0,
    fontsReadyMs: Math.round(fontsReady),
    ...vitals,
    fontIstek: f.length,
    fontAgBayt: f.filter((x) => !x.onbellek).reduce((t, x) => t + x.bayt, 0),
    fontlar: f,
    disariIstek: disari,
    cspIhlal: csp,
  };
}

for (const r of ROTALAR) {
  const kosular = [];
  let ilik = null;
  for (let i = 0; i < TEKRAR; i++) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "tr-TR" });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", AG);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    // CLS / LCP yalnız PerformanceObserver ile okunabilir (getEntriesByType bu türleri döndürmez).
    await p.addInitScript(() => {
      window.__kanitCls = 0;
      window.__kanitLcp = null;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__kanitCls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => {
        const e = l.getEntries();
        if (e.length) window.__kanitLcp = e[e.length - 1].startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    kosular.push(await olc(ctx, p, cdp, `http://127.0.0.1:${port}${r}`));
    if (i === TEKRAR - 1) {
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
      await p.goto("about:blank");
      ilik = await olc(ctx, p, cdp, `http://127.0.0.1:${port}${r}`);
    }
    await ctx.close();
  }
  const med = (k) => {
    const v = kosular.map((x) => x[k]).filter((x) => x != null).sort((a, c) => a - c);
    return v.length ? { medyan: v[Math.floor(v.length / 2)], min: v[0], max: v[v.length - 1] } : null;
  };
  const ozet = { rota: r, kosu: TEKRAR, fontAgBayt: med("fontAgBayt"), fontIstek: med("fontIstek"), cls: med("cls"), lcp: med("lcp"), fcp: med("fcp"), fontsReadyMs: med("fontsReadyMs"), ilikFontAgBayt: ilik?.fontAgBayt ?? null, kosular, ilik };
  sonuc.push(ozet);
  console.log(`${etiket} ${r}: font ${ozet.fontAgBayt?.medyan} B (${ozet.fontIstek?.medyan} istek) · CLS ${ozet.cls?.medyan?.toFixed(4)} · LCP ${Math.round(ozet.lcp?.medyan ?? 0)} ms · fonts.ready ${ozet.fontsReadyMs?.medyan} ms · ılık font ağ ${ozet.ilikFontAgBayt} B · dış istek ${kosular[0].disariIstek.length} · CSP ihlal ${kosular[0].cspIhlal.length}`);
}
fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
await b.close();
