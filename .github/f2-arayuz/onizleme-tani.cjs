// #804 GEÇİCİ TANILAMA (repoya girmez): runner'daki ui-logo KOPYASINDA previewLoaded'ı sarar — kontrol aynen çalışır,
// yalnız FALSE dönerse <img> durumu + /assets/ istek kayıtları + img.decode() sonucu "ONIZLEME-TANI" satırı olarak basılır.
// PASS/FAIL kararı DEĞİŞMEZ.
"use strict";
const fs = require("node:fs");
const f = process.argv[2];
const s = fs.readFileSync(f, "utf8");
const anchor = "const previewLoaded = (page: Page) => poll(";
if (s.split(anchor).length !== 2) { console.error("previewLoaded tanımı tek değil"); process.exit(2); }
const probe = `(async () => {
  const i = document.querySelector('[data-testid="report-logo-preview-img"]');
  const res = performance.getEntriesByType('resource').filter((x) => x.name.includes('/api/settings/workspace/assets/'))
    .map((x) => ({ u: x.name.slice(-48), st: x.responseStatus, dec: x.decodedBodySize }));
  let dec = 'yok';
  if (i) { try { await i.decode(); dec = 'ok w=' + i.naturalWidth; } catch (e) { dec = 'hata: ' + String(e && e.message || e); } }
  let blob = 'yok';
  if (i && i.src.startsWith('blob:')) { try { const b = await (await fetch(i.src)).blob(); blob = b.type + ' ' + b.size; } catch (e) { blob = 'hata: ' + String(e && e.message || e); } }
  return { img: !!i, src: i ? i.src.slice(0, 32) : null, complete: i ? i.complete : null, w: i ? i.naturalWidth : null, decode: dec, blob, istekler: res };
})()`;
const wrap = `const __previewLoaded0 = (page: Page) => poll(`;
let out = s.replace(anchor, wrap);
out = out.replace(/(const __previewLoaded0 = \(page: Page\) => poll\([^\n]*\);)/, `$1
const previewLoaded = async (page: Page) => {
  const r = await __previewLoaded0(page);
  if (!r) console.log("ONIZLEME-TANI " + JSON.stringify(await page.evaluate(${JSON.stringify(probe)}).catch((e) => String(e))));
  return r;
};`);
if (!out.includes("ONIZLEME-TANI")) { console.error("sarma uygulanamadı"); process.exit(3); }
fs.writeFileSync(f, out);
console.log("onizleme-tani: " + f + " sarıldı");
