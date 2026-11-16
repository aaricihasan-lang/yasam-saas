// #804 GEÇİCİ ORTAM PROBU (repoya girmez) — Uygulama kodu YOK: 127.0.0.1'de yalın HTML sayfası. Aynı görseller
// {PNG, WebP (alfa; ui-logo fikstürleriyle aynı sharp ayarı)} × {gerçek sunucu, Playwright route.fulfill} × {blob:, data:}
// ile <img>'e yüklenir; Chromium / Firefox / WebKit'te onload/onerror + naturalWidth raporlanır. Amaç: WebKit önizleme
// FAIL'inin ürün mü, tarayıcı/ortam mı olduğunu ayırmak.
import http from "node:http";
import sharp from "sharp";
import { chromium, firefox, webkit } from "playwright";

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160"><rect x="10" y="10" width="200" height="140" rx="20" fill="#0f6b5a"/></svg>`);
const IMG = {
  png: { type: "image/png", buf: await sharp(svg).png().toBuffer() },
  webp: { type: "image/webp", buf: await sharp(svg).resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer() },
};
const html = `<!doctype html><meta charset="utf-8"><body><img id="i"><script>
window.probe = async (path, type, kind) => {
  if (kind === 'urun') { // lib/workspace/client.ts fetchAssetBlobUrl ile aynı çağrı biçimi
    const r = await fetch(path, { headers: { authorization: 'Bearer zz' }, cache: 'force-cache' });
    const b = await r.blob(); const src = URL.createObjectURL(b);
    const img = document.getElementById('i'); img.removeAttribute('src');
    return await new Promise((res) => {
      const t = setTimeout(() => res({ e: 'timeout', w: img.naturalWidth, n: b.size }), 5000);
      img.onload = () => { clearTimeout(t); res({ e: 'load', w: img.naturalWidth, n: b.size }); };
      img.onerror = () => { clearTimeout(t); res({ e: 'error', w: img.naturalWidth, n: b.size }); };
      img.src = src;
    });
  }
  const r = await fetch(path); const buf = await r.arrayBuffer();
  let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  const src = kind === 'blob' ? URL.createObjectURL(new Blob([buf], { type })) : 'data:' + type + ';base64,' + btoa(s);
  const img = document.getElementById('i'); img.removeAttribute('src');
  return await new Promise((res) => {
    const t = setTimeout(() => res({ e: 'timeout', w: img.naturalWidth, n: buf.byteLength }), 5000);
    img.onload = () => { clearTimeout(t); res({ e: 'load', w: img.naturalWidth, n: buf.byteLength }); };
    img.onerror = () => { clearTimeout(t); res({ e: 'error', w: img.naturalWidth, n: buf.byteLength }); };
    img.src = src;
  });
};
window.upload = async () => { // lib/workspace/client.ts parça yüklemesi ile aynı: PUT, gövde = Blob (dosya dilimi)
  const f = new File([new Uint8Array(4096).fill(7)], 'x.png', { type: 'image/png' });
  const r = await fetch('/route/up', { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: f.slice(0, 4096), cache: 'no-store' });
  return r.status;
};
</script>`;
const srv = http.createServer((req, res) => {
  const k = (req.url ?? "").match(/^\/srv\/(png|webp)$/)?.[1];
  if (k) { res.writeHead(200, { "content-type": IMG[k].type }); res.end(IMG[k].buf); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html);
});
await new Promise((r) => srv.listen(3997, "127.0.0.1", r));
for (const [name, bt] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
  const b = await bt.launch();
  try {
    const ctx = await b.newContext();
    let upLen = -1;
    await ctx.route("**/route/*", (route) => {
      const k = new URL(route.request().url()).pathname.split("/").pop();
      if (k === "up") { upLen = route.request().postDataBuffer()?.length ?? 0; return route.fulfill({ status: 200, json: { ok: true } }); }
      return route.fulfill({ status: 200, body: IMG[k].buf, headers: { "Content-Type": IMG[k].type, "Cache-Control": "private, no-store" } });
    });
    const p = await ctx.newPage();
    await p.goto("http://127.0.0.1:3997/", { waitUntil: "load" });
    const row = {};
    for (const fmt of ["png", "webp"]) for (const via of ["srv", "route"]) for (const kind of ["blob", "data", "urun"]) {
      const r = await p.evaluate(`probe('/${via}/${fmt}', '${IMG[fmt].type}', '${kind}')`);
      row[`${fmt}/${via}/${kind}`] = `${r.e}:${r.w}`;
    }
    await p.evaluate("upload()");
    row["yukleme-govdesi(route)"] = `${upLen}/4096`;
    console.log(`BLOB-PROBU ${name} ${JSON.stringify(row)}`);
  } finally { await b.close(); }
}
srv.close();
