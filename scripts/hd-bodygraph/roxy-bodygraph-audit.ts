/**
 * BİREYSEL BODYGRAPH (self-host @roxyapi/ui 0.48.0 <roxy-bodygraph>) — SALT-OKUMA DENETİM.
 * Bileşen gerçek Chromium'da KAYITLI fixture verisiyle (ağ yok, Roxy çağrısı yok) çizilir; shadow DOM
 * SVG'si ölçülür. Kod/tasarım DEĞİŞTİRİLMEZ. Çıktı: konsol raporu + JSON (scratch).
 * Çalıştır: npx tsx scripts/hd-bodygraph/roxy-bodygraph-audit.ts [--out <dosya.json>] [--png <dosya.png>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
const PNG = process.argv.includes("--png") ? process.argv[process.argv.indexOf("--png") + 1] : null;
const BUNDLE = readFileSync(path.join(process.cwd(), "public/vendor/roxy-ui/0.48.0/bodygraph.js"), "utf8");
const FIXTURE = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));

async function main() {
  const payload = buildRoxyRenderPayload(FIXTURE)!;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await page.route("**/*", (r) => (r.request().url().startsWith("data:") || r.request().url() === "about:blank" ? r.continue() : r.abort()));
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><div id="host" style="width:432px"></div></body></html>`);
  await page.addScriptTag({ content: BUNDLE });
  await page.evaluate(async (data) => {
    await customElements.whenDefined("roxy-bodygraph");
    const el = document.createElement("roxy-bodygraph") as HTMLElement & { data?: unknown };
    for (const a of ["hide-readings", "hide-header", "hide-details", "hide-legend", "hide-themes", "hide-facts"]) el.setAttribute(a, "");
    el.data = data;
    document.getElementById("host")!.appendChild(el);
  }, payload);
  await page.waitForTimeout(800);
  const res = await page.evaluate(() => {
    const el = document.querySelector("roxy-bodygraph")!;
    const root = (el.shadowRoot ?? el) as ShadowRoot;
    const svg = root.querySelector("svg")!;
    const vb = svg.getAttribute("viewBox");
    // Tüm metinler (kapı numaraları) ve konumları
    const texts = [...svg.querySelectorAll("text")].map((t) => {
      const b = (t as SVGGraphicsElement).getBBox();
      return { t: (t.textContent ?? "").trim(), x: b.x + b.width / 2, y: b.y + b.height / 2, fs: parseFloat(getComputedStyle(t).fontSize) };
    });
    // Tüm çizgi/yol öğeleri: tip, data-* ve uç noktaları
    const shapes = [...svg.querySelectorAll("path,line,polyline")].map((p) => {
      const attrs: Record<string, string> = {};
      for (const a of [...p.attributes]) if (a.name.startsWith("data-") || a.name === "class" || a.name === "stroke" || a.name === "stroke-width" || a.name === "stroke-dasharray" || a.name === "opacity") attrs[a.name] = a.value;
      const g = p as SVGGeometryElement;
      let start: { x: number; y: number } | null = null, end: { x: number; y: number } | null = null, len = 0;
      try { len = g.getTotalLength(); const s = g.getPointAtLength(0); const e = g.getPointAtLength(len); start = { x: s.x, y: s.y }; end = { x: e.x, y: e.y }; } catch { /* yok */ }
      return { tag: p.tagName, attrs, start, end, len, parent: (p.parentElement?.getAttribute("class") ?? "") + "|" + [...(p.parentElement?.attributes ?? [])].filter((a) => a.name.startsWith("data-")).map((a) => `${a.name}=${a.value}`).join(",") };
    });
    return { vb, texts, shapes, w: svg.getBoundingClientRect().width };
  });
  if (PNG) await page.locator("roxy-bodygraph").screenshot({ path: PNG });
  await browser.close();

  const gateText = res.texts.filter((t) => /^\d{1,2}$/.test(t.t) && Number(t.t) >= 1 && Number(t.t) <= 64);
  const gatePos = new Map<number, { x: number; y: number; fs: number }>();
  for (const t of gateText) if (!gatePos.has(Number(t.t))) gatePos.set(Number(t.t), { x: t.x, y: t.y, fs: t.fs });
  console.log(`viewBox ${res.vb} · ekran genişliği ${res.w.toFixed(0)}px · kapı metni ${gatePos.size}/64 · çizgi öğesi ${res.shapes.length}`);
  const fsVals = [...gatePos.values()].map((g) => g.fs);
  console.log(`kapı yazı boyu (CSS px, 432px genişlikte): min ${Math.min(...fsVals)} max ${Math.max(...fsVals)}`);
  const attrsSeen = new Set(res.shapes.flatMap((s) => Object.keys(s.attrs)));
  console.log(`çizgi öznitelikleri: ${[...attrsSeen].join(", ")}`);
  const sample = res.shapes.filter((s) => Object.keys(s.attrs).some((k) => k.startsWith("data-"))).slice(0, 8);
  console.log("örnek veri-öznitelikli öğeler:", JSON.stringify(sample, null, 0).slice(0, 1500));
  if (OUT) writeFileSync(OUT, JSON.stringify({ ...res, gatePos: [...gatePos.entries()] }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
