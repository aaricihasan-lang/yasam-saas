/**
 * HD AŞAMA 4B — BodyGraph PNG yakalama UÇTAN UCA testi (gerçek tarayıcı, gerçek renderer).
 *
 *   • Gerçek self-host Roxy renderer'ı (public/vendor/roxy-ui/0.48.0/bodygraph.js) + uygulamanın
 *     GERÇEK yakalama modülü (lib/human-design/reporting/bodygraphCapture.ts, esbuild ile paketlenir)
 *     + gerçek Roxy fixture'ının KAYITLI render yükü (buildRoxyRenderPayload) kullanılır.
 *   • Üretilen PNG sunucu doğrulayıcısından (validateBodygraphPng) geçmeli; ≥1800 px; oran doğru.
 *   • Görsel eşdeğerlik: aynı renderer'ın ekrandaki (canlı) çizimi ile yakalanan PNG aynı ölçekte
 *     piksel piksel karşılaştırılır (renk farkı eşiği).
 *   • Ağ: yalnız yerel statik sunucu; Roxy/CDN isteği OLURSA test FAIL (istek sayacı).
 *
 * Çalıştır: npx tsx scripts/hd-word-report/bodygraph-capture-e2e.ts [outDir]
 */

import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { chromium } from "playwright";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { HD_BODYGRAPH_ASPECT, validateBodygraphPng } from "../../lib/human-design/reporting/bodygraphPng";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.argv[2] || join(ROOT, ".hd-word-e2e");
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const fixture = JSON.parse(readFileSync(join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));
const renderData = buildRoxyRenderPayload(fixture);
if (!renderData) throw new Error("fixture render yükü üretilemedi");

// Gerçek yakalama modülü → tarayıcı paketi (window.__hdCapture).
const bundle = buildSync({
  stdin: {
    contents: `import { captureRoxyBodygraphPng } from "./lib/human-design/reporting/bodygraphCapture";
      window.__hdCapture = captureRoxyBodygraphPng;`,
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  write: false,
  platform: "browser",
}).outputFiles[0].text;

// HdRoxyBodygraph.tsx ile AYNI yükleme + ::part sıfırlama (renderer'ın uygulamadaki hali).
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#fff;font-family:system-ui}
roxy-bodygraph.hd-fit{display:block;width:100%}
roxy-bodygraph.hd-fit::part(card){border:0;padding:0;margin:0;background:transparent;box-shadow:none;border-radius:0}
roxy-bodygraph.hd-fit::part(layout){display:block;margin:0;padding:0}
roxy-bodygraph.hd-fit::part(chart){margin:0;padding:0;width:100%;max-width:none;height:auto}
#live{width:432px}</style></head><body>
<div id="live"><roxy-bodygraph class="hd-fit" hide-readings="" hide-sections="header,details,legend,themes,facts" lang="tr"></roxy-bodygraph></div>
<script>window.__load=()=>new Promise((res,rej)=>{if(customElements.get('roxy-bodygraph'))return res();const s=document.createElement('script');s.src='/vendor/roxy-ui/0.48.0/bodygraph.js';s.onload=()=>customElements.whenDefined('roxy-bodygraph').then(()=>res());s.onerror=rej;document.head.appendChild(s);});</script>
<script>window.__cmp=async(a,b,w,h)=>{const load=(src)=>new Promise((r)=>{const i=new Image();i.onload=()=>r(i);i.src=src;});const ims=await Promise.all([load(a),load(b)]);const px=(img)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);return x.getImageData(0,0,w,h).data;};const da=px(ims[0]),db=px(ims[1]);let differ=0,total=0,nonWhite=0;for(let i=0;i<da.length;i+=4){total++;const d=Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2]);if(d>90)differ++;if(da[i]+da[i+1]+da[i+2]<700)nonWhite++;}return {ratio:differ/total,nonWhite:nonWhite/total};};</script>
<script src="/capture.js"></script></body></html>`;

async function main() {
  const external: string[] = [];
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(PAGE); return; }
    if (url === "/capture.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle); return; }
    if (url.startsWith("/vendor/roxy-ui/")) {
      try { res.setHeader("content-type", "text/javascript"); res.end(readFileSync(join(ROOT, "public", url))); } catch { res.statusCode = 404; res.end(); }
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    page.on("request", (r) => { if (!r.url().startsWith(`http://127.0.0.1:${port}`) && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) external.push(r.url()); });
    await page.goto(`http://127.0.0.1:${port}/`);

    console.log("\n—— CAP. Gerçek renderer → PNG");
    const result = (await page.evaluate(async (data) => {
      const w = window as unknown as { __hdCapture: (d: unknown, l: () => Promise<void>) => Promise<Record<string, unknown>>; __load: () => Promise<void> };
      return w.__hdCapture(data, w.__load);
    }, renderData)) as { ok: boolean; dataUrl?: string; width?: number; height?: number; bytes?: number; error?: string };
    ok("yakalama başarılı", result.ok === true, result.error);
    if (!result.ok || !result.dataUrl) return;
    const png = Buffer.from(result.dataUrl.split(",")[1], "base64");
    writeFileSync(join(OUT, "bodygraph-capture.png"), png);
    const v = validateBodygraphPng(png);
    ok("sunucu doğrulayıcısından geçer (imza/CRC/çözme/oran)", v.ok, v.ok ? "" : v.error);
    ok("yükseklik ≥ 1800 px", (result.height ?? 0) >= 1800, String(result.height));
    ok("oran korunur (432:612)", Math.abs((result.width! / result.height!) - HD_BODYGRAPH_ASPECT) < 0.01, `${result.width}x${result.height}`);
    ok("boyut makul (< 2,5 MB)", png.length < 2.5 * 1024 * 1024, `${png.length} bytes`);
    console.log(`    PNG: ${result.width}×${result.height}, ${png.length} bytes`);

    console.log("\n—— VIS. Canlı renderer ↔ yakalanan PNG piksel karşılaştırması");
    await page.evaluate(async (data) => {
      const w = window as unknown as { __load: () => Promise<void> };
      await w.__load();
      const el = document.querySelector("#live roxy-bodygraph") as HTMLElement & { data?: unknown; updateComplete?: Promise<unknown> };
      el.data = data;
      await el.updateComplete;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }, renderData);
    const liveSvg = page.locator("#live roxy-bodygraph").locator("svg.chart");
    const box = await liveSvg.boundingBox();
    const live = await liveSvg.screenshot();
    writeFileSync(join(OUT, "bodygraph-live.png"), live);
    // PNG'yi canlı çizimle aynı boyuta indirip pikselleri karşılaştır (tarayıcı içinde).
    const diff = (await page.evaluate(
      ([a, b, w, h]) => (window as unknown as { __cmp: (...x: unknown[]) => Promise<unknown> }).__cmp(a, b, w, h),
      [`data:image/png;base64,${live.toString("base64")}`, result.dataUrl, Math.round(box!.width), Math.round(box!.height)] as const,
    )) as { ratio: number; nonWhite: number };
    ok("çizim boş değil (içerik var)", diff.nonWhite > 0.05, diff.nonWhite.toFixed(3));
    ok("canlı çizimle görsel eşdeğer (< %3 piksel farkı)", diff.ratio < 0.03, `fark=${(diff.ratio * 100).toFixed(2)}%`);
    console.log(`    piksel farkı: ${(diff.ratio * 100).toFixed(2)}% · içerik: ${(diff.nonWhite * 100).toFixed(1)}%`);

    console.log("\n—— VER. Bozuk veri → yakalama reddeder (eksik çizim Word'e gitmez)");
    const broken = await page.evaluate(async (data) => {
      const w = window as unknown as { __hdCapture: (d: unknown, l: () => Promise<void>) => Promise<Record<string, unknown>>; __load: () => Promise<void> };
      const d = JSON.parse(JSON.stringify(data));
      d.gates.push({ planet: "Sun", side: "design", gate: 64, line: 1, gateName: "x" }); // çizimde olmayacak sahte kapı → sayım uyuşmaz
      d.gates = d.gates.filter((g: { gate: number }) => g.gate !== 64).concat([{ planet: "Sun", side: "design", gate: 999, line: 1 }]);
      return w.__hdCapture(d, w.__load);
    }, renderData) as { ok: boolean; error?: string };
    ok("kayıtlı veriyle uyuşmayan çizim reddedilir", broken.ok === false, broken.error);

    console.log("\n—— NET. Ağ");
    ok("Roxy/CDN/harici istek YOK", external.length === 0, external.join(", "));
  } finally {
    await browser.close();
    server.close();
  }
}

main()
  .then(() => {
    console.log(`\nBODYGRAPH E2E: ${pass} PASS / ${fail} FAIL  (çıktı: ${OUT})`);
    process.exitCode = fail === 0 ? 0 : 1;
  })
  .catch((e) => { console.error(e); process.exitCode = 1; });
