/**
 * Premium BodyGraph — profesyonel Word görseli UÇTAN UCA (gerçek tarayıcı, gerçek yakalama modülü).
 *   • lib/human-design/reporting/premiumBodygraphCapture.ts esbuild ile paketlenir; gerçek Roxy fixture'ının
 *     kayıtlı computed_result'ı + render yükü (bağ parmak izi) kullanılır.
 *   • PNG: sunucu doğrulayıcısı (validateBodygraphPng) + analiz bağı (verifyBodygraphBinding) geçmeli; ≥1800 px.
 *   • Ağ: yalnız yerel statik sunucu (logo + font); dış istek OLURSA FAIL.
 * Çalıştır: npx tsx scripts/hd-bodygraph-premium/word-capture-e2e.ts [outDir]
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";
import { chromium } from "playwright";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { validateBodygraphPng, HD_BODYGRAPH_PREMIUM_ASPECT } from "../../lib/human-design/reporting/bodygraphPng";
import { HD_BODYGRAPH_BIND_KEYWORD, bodygraphBindingText, fingerprintFromRoxyRender, readPngTextChunks } from "../../lib/human-design/reporting/bodygraphBinding";

const ROOT = join(__dirname, "..", "..");
const OUT = process.argv[2] || join(ROOT, ".hd-word-e2e");
mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const FIXTURE = JSON.parse(readFileSync(join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));
const v = validateRoxyBodygraph(FIXTURE);
if (!v.ok) throw new Error("fixture");
const n = normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" });
if (!n.ok) throw new Error("normalize");
const CHART = n.chart;
const payload = buildRoxyRenderPayload(FIXTURE)!;
const CHART_ID = "c4a00000-0000-4000-8000-0000000000b2";

const bundle = buildSync({
  stdin: { contents: `import { capturePremiumBodygraphPng } from "./lib/human-design/reporting/premiumBodygraphCapture"; window.__cap = capturePremiumBodygraphPng;`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "iife", write: false, platform: "browser",
}).outputFiles[0].text;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/cap.js"></script></body></html>`;

async function main() {
  const external: string[] = [];
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(PAGE); return; }
    if (url === "/cap.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle); return; }
    if (url === "/assets/yasam-sistemi-chart-logo.png" || url === "/fonts/Geist-Regular.ttf") {
      res.setHeader("content-type", url.endsWith(".png") ? "image/png" : "font/ttf");
      res.end(readFileSync(join(ROOT, "public", url)));
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("request", (r) => { const u = r.url(); if (!u.startsWith(`http://127.0.0.1:${port}`) && !u.startsWith("blob:") && !u.startsWith("data:")) external.push(u); });
    await page.goto(`http://127.0.0.1:${port}/`);
    const res = (await page.evaluate(async ([chart, data, id]) => (window as unknown as { __cap: (c: unknown, d: unknown, i: string) => Promise<Record<string, unknown>> }).__cap(chart, data, id as string), [CHART, payload, CHART_ID] as const)) as { ok: boolean; dataUrl?: string; width?: number; height?: number; bytes?: number; error?: string };
    ok("premium yakalama başarılı", res.ok, res.error ?? "");
    if (!res.ok || !res.dataUrl) return;
    const png = Buffer.from(res.dataUrl.split(",")[1], "base64");
    writeFileSync(join(OUT, "premium-bodygraph-word.png"), png);
    const chk = validateBodygraphPng(png);
    ok("sunucu PNG doğrulayıcısından geçer", chk.ok, chk.ok ? "" : chk.error);
    ok("yükseklik ≥ 1800 px, oran premium (602:752)", (res.height ?? 0) >= 1800 && Math.abs(res.width! / res.height! - HD_BODYGRAPH_PREMIUM_ASPECT) < 0.01, `${res.width}x${res.height}`);
    const bound = readPngTextChunks(new Uint8Array(png)).get(HD_BODYGRAPH_BIND_KEYWORD) ?? [];
    ok("analiz bağı (kimlik + kayıtlı parmak izi) gömülü — sunucunun beklediğiyle aynı", bound.length === 1 && bound[0] === bodygraphBindingText(CHART_ID, fingerprintFromRoxyRender(payload)), JSON.stringify(bound));
    ok("dış ağ isteği yok", external.length === 0, external.join(","));
  } finally {
    await browser.close();
    server.close();
  }
}
main().then(() => {
  console.log(`\nPREMIUM WORD YAKALAMA: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}).catch((e) => { console.error(e); process.exit(1); });
