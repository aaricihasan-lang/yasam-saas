// #804 GEÇİCİ — GERÇEK APPLE SAFARI ön probu (macOS runner, safaridriver / W3C WebDriver; bağımlılık YOK).
// Uygulama kodu YOK: 127.0.0.1'de yalın sentetik sayfa + sentetik PNG/WebP. Ölçülen:
//   1 Safari oturumu açılıyor mu  2 yerel sayfaya ulaşıyor mu  3 PNG/WebP gerçekten ÇİZİLİYOR mu (canvas piksel)
//   4 blob: URL'den görsel  5 dosya seçme alanı (gerçek dosya) + gerçek HTTP gövdesi  6 kapanışta süreç temizliği
// Çıktı: "SAFARI-PROBU <ad> <json>" satırları; ekran görüntüsü OUT dizinine.
import http from "node:http";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const WD = process.env.WD_URL ?? "http://127.0.0.1:4444";
const OUT = process.env.OUT ?? "safari-probu";
mkdirSync(OUT, { recursive: true });
const log = (ad, v) => console.log(`SAFARI-PROBU ${ad} ${JSON.stringify(v)}`);

// Sentetik görseller (sharp YOK — sabit, sharp ile doğrulanmış): 2×1 opak PNG ve 2×1 kayıpsız WebP, piksel (15,107,90,255).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWPgz476D8IADbUDp+bwQQYAAAAASUVORK5CYII=", "base64");
const WEBP = Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvAQAAAAfQtT5Uq/+BiOh/AAA=", "base64");
let yuklenen = -1;
const html = `<!doctype html><meta charset="utf-8"><title>safari-probu</title><body>
<h1>Safari probu</h1><input type="file" id="f"><img id="i"><canvas id="c" width="4" height="4"></canvas></body>`;
const srv = http.createServer((req, res) => {
  if (req.url === "/img.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(PNG); }
  if (req.url === "/img.webp") { res.writeHead(200, { "content-type": "image/webp" }); return res.end(WEBP); }
  if (req.url === "/up" && req.method === "PUT") {
    const parca = []; req.on("data", (d) => parca.push(d));
    req.on("end", () => { yuklenen = Buffer.concat(parca).length; res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ n: yuklenen })); });
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html);
});
await new Promise((r) => srv.listen(8123, "127.0.0.1", r));

async function wd(method, path, body) {
  const r = await fetch(WD + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.value;
}
// execute/async Safari 27.2'de 408 verdi (ilk koşu) → yalnız execute/sync + sınırlı yoklama (sabit uyku yok, üst sınır 15 sn).
const sync = (script, args = []) => wd("POST", `/session/${sid}/execute/sync`, { script, args });
async function bekle(script, args = [], ms = 15000) {
  const son = Date.now() + ms;
  for (;;) { const v = await sync(script, args); if (v !== null && v !== undefined) return v; if (Date.now() > son) return { e: "zaman-asimi" }; await new Promise((r) => setTimeout(r, 200)); }
}
// Görseli <img>'e yükle (src: doğrudan yol ya da blob: URL), yüklenince canvas'a çiz ve piksel oku → gerçekten çizildi mi?
const BASLAT = `window.__s = null; const [src, blobType] = arguments;
  const yukle = (u, n) => { const i = document.getElementById('i'); i.removeAttribute('src');
    i.onload = () => { const c = document.getElementById('c'); const x = c.getContext('2d'); x.clearRect(0, 0, 4, 4); x.drawImage(i, 0, 0);
      window.__s = { e: 'load', w: i.naturalWidth, h: i.naturalHeight, boyut: n, src: i.src.slice(0, 5), piksel: Array.from(x.getImageData(0, 0, 1, 1).data) }; };
    i.onerror = () => { window.__s = { e: 'error', w: i.naturalWidth, boyut: n, src: i.src.slice(0, 5) }; };
    i.src = u; };
  if (!blobType) yukle(src, null);
  else fetch(src).then((r) => r.blob()).then((b) => yukle(URL.createObjectURL(new Blob([b], { type: blobType })), b.size)).catch((e) => { window.__s = { e: 'hata ' + e }; });
  return true;`;
const SONUC = "return window.__s;";
async function gorsel(src, blobType) { await sync(BASLAT, [src, blobType ?? null]); return bekle(SONUC); }

let sid = null;
try {
  const s = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
  sid = s.sessionId;
  log("1-oturum", { ok: !!sid, browserName: s.capabilities?.browserName, browserVersion: s.capabilities?.browserVersion, platformName: s.capabilities?.platformName });
  await wd("POST", `/session/${sid}/timeouts`, { script: 15000 });
  await wd("POST", `/session/${sid}/url`, { url: "http://127.0.0.1:8123/" });
  log("2-sayfa", { baslik: await wd("GET", `/session/${sid}/title`), ua: await sync("return navigator.userAgent") });
  log("3-png", await gorsel("/img.png"));
  log("3-webp", await gorsel("/img.webp"));
  log("4-blob-png", await gorsel("/img.png", "image/png"));
  log("4-blob-webp", await gorsel("/img.webp", "image/webp"));
  // 5 Dosya seçme: gerçek dosya yolu → <input type=file>; ardından File gövdesiyle gerçek PUT (sunucu bayt sayar).
  const dosya = resolve(OUT, "yukle.png");
  writeFileSync(dosya, PNG);
  let secim = null;
  try {
    const el = await wd("POST", `/session/${sid}/element`, { using: "css selector", value: "#f" });
    const id = Object.values(el)[0];
    await wd("POST", `/session/${sid}/element/${id}/value`, { text: dosya });
    secim = await sync("const f = document.getElementById('f').files[0]; return f ? { ad: f.name, boyut: f.size, tur: f.type } : null");
    await sync("window.__u = null; const f = document.getElementById('f').files[0]; fetch('/up', { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: f.slice(0, f.size) }).then((r) => r.json()).then((j) => { window.__u = j; }).catch((e) => { window.__u = { hata: String(e) }; }); return true;");
    const up = await bekle("return window.__u;");
    log("5-dosya", { secim, istemciYanit: up, sunucuGordu: yuklenen, beklenen: PNG.length });
  } catch (e) {
    log("5-dosya", { hata: String(e).slice(0, 300), secim });
  }
  const png = await wd("GET", `/session/${sid}/screenshot`);
  writeFileSync(join(OUT, "safari-probu.png"), Buffer.from(png, "base64"));
} catch (e) {
  log("HATA", String(e).slice(0, 500));
} finally {
  if (sid) await wd("DELETE", `/session/${sid}`).catch((e) => log("kapanis-hata", String(e)));
  await new Promise((r) => setTimeout(r, 3000));
  let kalan = "";
  try { kalan = execSync("pgrep -fl 'Safari|WebDriver' || true", { encoding: "utf8" }).trim(); } catch { /* */ }
  log("6-surec", { kalan: kalan.split("\n").filter(Boolean) });
  srv.close();
}
