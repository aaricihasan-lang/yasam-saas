/**
 * Premium BodyGraph — OKUNABİLİRLİK + KANAL GÖSTERİMİ GERÇEK TARAYICI DENETİMİ (owner kararı 2026-10-18).
 *
 * Ölçülen (her ekranda, gerçek Next sunucusu + gerçek bireysel harita ekranı):
 *   • BodyGraph SVG piksel boyutu, kapı numarası / merkez adı EKRAN piksel boyutu (font-size × SVG ölçeği)
 *   • Kapı numarası (piksel hassas) daire konturunun iç kenarına ≥ 0.15 birim, ortalı; merkez adı şeklin İÇİNDE, kenar
 *     çizgisine ≥ 2.7, kapı dairesine ≥ 1.4 birim; dış etiket (KALP) boruya ≥ 1.4 birim; yazılar üst üste binmez
 *     (gerçek font ile canvas ölçümü; tahmin yok)
 *   • Yatay taşma yok; BodyGraph sahne içinde
 * Kanal denetimi (ekrandan bağımsız, bir kez): kayıtlı aktivasyonlardan BAĞIMSIZ türetilen beklenti ↔ premium DOM ↔
 *   Roxy resmî çizicisinin (public/vendor/roxy-ui/0.48.0, yerel) gölge DOM'u — kanal kanal, yarı yarı.
 * Word: gerçek yakalama modülü (premiumBodygraphCapture) aynı kayıtla PNG üretir; aynı yazı denetimi Word SVG'sinde.
 *
 * Veri: varsayılan depo fixture'ı; `--chart <json>` ile kayıtlı bir harita satırı (computed_result + provider_raw)
 * YEREL test veritabanına yazılır (production'a bağlanılmaz; Roxy isteği yapılmaz — sahte Roxy).
 * Ön koşul: test shim build — NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54541 (bu betiğin HTTP shim portu; build'e
 *   gömülür), anahtarlar scripts/hd-live-accept/browser-e2e.ts ile aynı.
 * Çalıştır: npx tsx scripts/hd-bodygraph-premium/readability-e2e.ts --out <klasör> [--chart <json>] [--only 1536x730]
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildSync } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { TA, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { CBG_CENTERS, CBG_GATE_R, CBG_GATES, CBG_NET_ARMS, CBG_PIPES } from "../../lib/human-design/relations/connectionBodygraphGeometry";
import { CBG_PIPE_FULL } from "../../lib/human-design/relations/connectionBodygraphScene";
import { CHANNELS } from "../../lib/human-design/engine/channels";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { validateBodygraphPng } from "../../lib/human-design/reporting/bodygraphPng";

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const ROOT = path.join(__dirname, "..", "..");
const OUT = arg("--out") ?? path.join(os.tmpdir(), "hd-bodygraph-readability");
const CHART_FILE = arg("--chart");
const ONLY = (arg("--only") ?? "").split(",").filter(Boolean);
const PORT = 3997;
const APP = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type Device = { name: string; w: number; h: number; mobile?: boolean; tablet?: boolean };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// Masaüstü: tarayıcının İÇ alanı (Windows görev çubuğu + Chrome sekme/adres çubuğu düşülmüş gerçekçi değerler).
const DEVICES: Device[] = [
  { name: "1366x641", w: 1366, h: 641 },
  { name: "1536x730", w: 1536, h: 730 },
  { name: "1920x945", w: 1920, h: 945 },
  { name: "tablet-820x1180", w: 820, h: 1180, mobile: true, tablet: true },
  { name: "tablet-1180x820", w: 1180, h: 820, mobile: true, tablet: true },
  { name: "mobil-390x844", w: 390, h: 844, mobile: true },
];

// ── Sahne geometrisi (mühürlü V9; yalnız OKUNUR) ─────────────────────────────────────────────────────────────
const GEO = {
  r: CBG_GATE_R,
  gates: CBG_GATES.map(([n, x, y]) => ({ n, x, y })),
  centers: CBG_CENTERS.map((c) => ({ engine: c.engine, labels: [...c.label], at: [...c.labelAt], poly: c.points.split(" ").map((p) => p.split(",").map(Number)) })),
  pipes: [...CBG_PIPES, ...CBG_NET_ARMS].map(([, s]) => s.split(" ").map((p) => p.split(",").map(Number))),
  pipeHalf: CBG_PIPE_FULL / 2,
  /** Kapı dairesi konturunun iç kenarı (r − 0.95/2) − 0.15 güvenlik payı: numara mürekkebi bunun dışına çıkmaz. */
  gateInkMax: CBG_GATE_R - 0.475 - 0.15,
};

/** Tarayıcıda: bir SVG içindeki tüm yazıların gerçek mürekkep kutusu ↔ kapı daireleri / merkez şekilleri. */
type TextAudit = {
  silhouette: { min: number; who: string; frontScale: number };
  scale: number; svgW: number; svgH: number;
  gateText: { min: number; max: number; px: number; maxInk: number }; centerText: { min: number; max: number; pxMin: number };
  gateBad: Array<{ n: number; why: string }>; centerBad: Array<{ label: string; why: string }>; textOverlap: string[];
  gateCount: number; centerLabelCount: number;
};
async function auditSvg(page: Page, selector: string): Promise<TextAudit> {
  return page.evaluate(([sel, geo]) => {
    const G = geo as typeof GEO;
    const svg = document.querySelector(sel) as SVGSVGElement;
    const vb = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const fit = Math.min(rect.width / vb.width, rect.height / vb.height);
    // Ön katman ölçeği (bireysel: CbgState.front) dahil gerçek ekran ölçeği: yazının ekran matrisi.
    const firstText = svg.querySelector("text") as SVGTextElement | null;
    const scale = firstText?.getScreenCTM()?.a ?? fit;
    // Silüet içi: ön katman (kanallar / merkezler / kapılar) silüet yolunun İÇİNDE ve kenarına ≥ 4 birim (tuval birimi).
    const sil = svg.querySelector("[data-cbg-silhouette] > defs + g path, [data-cbg-silhouette] path") as SVGPathElement | null;
    const frontG = [...svg.querySelectorAll("g[transform]")].find((g) => /scale\(/.test(g.getAttribute("transform") ?? "")) as SVGGElement | undefined;
    const M = frontG ? frontG.transform.baseVal.consolidate()!.matrix : null;
    const toCanvas = (x: number, y: number) => (M ? [M.a * x + M.e, M.d * y + M.f] : [x, y]);
    const frontScale = M ? M.a : 1;
    let silMin = 1e9, silWho = "";
    if (sil) {
      const L = sil.getTotalLength(); const edge: number[][] = [];
      for (let i = 0; i < L; i += 1) { const q = sil.getPointAtLength(i); if (q.y <= 640) edge.push([q.x, q.y]); }
      const pt = svg.createSVGPoint();
      const probe = (x: number, y: number, r: number, who: string) => {
        const [X, Y] = toCanvas(x, y); if (Y > 640) return; pt.x = X; pt.y = Y;
        let m = 1e9; for (const [ex, ey] of edge) { const d = Math.hypot(ex - X, ey - Y); if (d < m) m = d; }
        const d = (sil.isPointInFill(pt) ? m : -m) - r * frontScale;
        if (d < silMin) { silMin = d; silWho = who; }
      };
      for (const c of G.centers) for (let i = 0; i < c.poly.length; i++) { const a = c.poly[i], q = c.poly[(i + 1) % c.poly.length]; for (let k = 0; k <= 6; k++) probe(a[0] + (q[0] - a[0]) * k / 6, a[1] + (q[1] - a[1]) * k / 6, 1.1, `merkez ${c.engine}`); }
      for (const pl of G.pipes) for (let i = 1; i < pl.length; i++) { const n = Math.max(1, Math.ceil(Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]) / 6)); for (let k = 0; k <= n; k++) probe(pl[i - 1][0] + (pl[i][0] - pl[i - 1][0]) * k / n, pl[i - 1][1] + (pl[i][1] - pl[i - 1][1]) * k / n, G.pipeHalf, "boru"); }
      for (const g of G.gates) probe(g.x, g.y, G.r + 0.5, `kapı ${g.n}`);
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const K = 100; // alt-piksel ölçüm: 100× büyük ölç, küçült
    type Box = { l: number; r: number; t: number; b: number };
    const ink = (el: SVGTextElement): Box => {
      const cs = getComputedStyle(el);
      const size = parseFloat(el.getAttribute("font-size") ?? cs.fontSize);
      const ls = parseFloat(el.getAttribute("letter-spacing") ?? "0") || 0;
      const sw = parseFloat(el.getAttribute("stroke-width") ?? "0") || 0;
      ctx.font = `${cs.fontWeight} ${size * K}px ${cs.fontFamily}`;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${ls * K}px`;
      ctx.textAlign = "center";
      const m = ctx.measureText(el.textContent ?? "");
      const x = parseFloat(el.getAttribute("x")!);
      const y = parseFloat(el.getAttribute("y")!);
      // SVG letter-spacing son harften sonra da eklenir → middle hizada mürekkep ls/2 sola kayar.
      const shift = -ls / 2;
      return { l: x + shift - m.actualBoundingBoxLeft / K - sw / 2, r: x + shift + m.actualBoundingBoxRight / K + sw / 2, t: y - m.actualBoundingBoxAscent / K - sw / 2, b: y + m.actualBoundingBoxDescent / K + sw / 2 };
    };
    const inPoly = (px: number, py: number, poly: number[][]) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const segDist = (px: number, py: number, a: number[], b: number[]) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
    };
    const boxCircleGap = (bx: Box, cx: number, cy: number) => {
      const nx = Math.max(bx.l, Math.min(cx, bx.r)), ny = Math.max(bx.t, Math.min(cy, bx.b));
      return Math.hypot(cx - nx, cy - ny);
    };
    const texts = [...svg.querySelectorAll("text")] as SVGTextElement[];
    const gateBad: Array<{ n: number; why: string }> = [];
    const centerBad: Array<{ label: string; why: string }> = [];
    const boxes: Array<{ k: string; b: Box }> = [];
    let gMin = 1e9, gMax = 0, cMin = 1e9, cMax = 0, gateCount = 0, centerLabelCount = 0, maxInk = 0;
    for (const el of texts) {
      const t = (el.textContent ?? "").trim();
      const size = parseFloat(el.getAttribute("font-size") ?? "0");
      const b = ink(el);
      if (/^\d+$/.test(t)) {
        gateCount++;
        gMin = Math.min(gMin, size); gMax = Math.max(gMax, size);
        const g = G.gates.find((q) => q.n === Number(t));
        if (!g) { gateBad.push({ n: Number(t), why: "kapı yok" }); continue; }
        // Piksel hassas: numara (dolgu + kontur) 40× büyük çizilir; mürekkebin kapı merkezine en uzak noktası.
        const K = 40, W = 16 * K;
        const cv = document.createElement("canvas"); cv.width = W; cv.height = W;
        const c2 = cv.getContext("2d", { willReadFrequently: true })!;
        const cs2 = getComputedStyle(el);
        c2.font = `${cs2.fontWeight} ${size * K}px ${cs2.fontFamily}`; c2.textAlign = "center"; c2.lineJoin = "round";
        c2.lineWidth = (parseFloat(el.getAttribute("stroke-width") ?? "0") || 0) * K;
        const ox = (parseFloat(el.getAttribute("x")!) - g.x) * K + W / 2, oy = (parseFloat(el.getAttribute("y")!) - g.y) * K + W / 2;
        c2.fillText(t, ox, oy); if (c2.lineWidth) c2.strokeText(t, ox, oy);
        const px = c2.getImageData(0, 0, W, W).data;
        let far = 0;
        for (let yy = 0; yy < W; yy++) for (let xx = 0; xx < W; xx++) if (px[(yy * W + xx) * 4 + 3] > 60) {
          const dx = (xx + 0.5 - W / 2) / K, dy = (yy + 0.5 - W / 2) / K;
          far = Math.max(far, Math.hypot(dx, dy));
        }
        if (far > G.gateInkMax) gateBad.push({ n: g.n, why: `mürekkep daire konturuna değiyor (${far.toFixed(2)} > ${G.gateInkMax.toFixed(2)})` });
        const cx = (b.l + b.r) / 2 - g.x, cy = (b.t + b.b) / 2 - g.y;
        if (Math.abs(cx) > 0.7 || Math.abs(cy) > 0.9) gateBad.push({ n: g.n, why: `ortalı değil (dx ${cx.toFixed(2)}, dy ${cy.toFixed(2)})` });
        maxInk = Math.max(maxInk, far);
        boxes.push({ k: `kapı ${t}`, b });
      } else if (t) {
        centerLabelCount++;
        cMin = Math.min(cMin, size); cMax = Math.max(cMax, size);
        const x = parseFloat(el.getAttribute("x")!);
        const y = parseFloat(el.getAttribute("y")!);
        const c = G.centers.find((q) => q.labels.includes(t) && Math.abs(q.at[0] - x) < 0.5 && Math.abs(q.at[1] - y) < 30);
        if (!c) { centerBad.push({ label: t, why: "merkez bulunamadı" }); continue; }
        const corners = [[b.l, b.t], [b.r, b.t], [b.l, b.b], [b.r, b.b]];
        const edges = c.poly.map((p, i) => [p, c.poly[(i + 1) % c.poly.length]]);
        if (inPoly(c.at[0], c.at[1], c.poly)) {
          const minEdge = Math.min(...corners.flatMap(([px, py]) => edges.map(([a, q]) => segDist(px, py, a, q))));
          if (!corners.every(([px, py]) => inPoly(px, py, c.poly)) || minEdge < 2.7) centerBad.push({ label: t, why: `şekil kenar çizgisine ${minEdge.toFixed(2)} birim (en az 2.7) / dışarı taşıyor` });
        } else {
          // V9: etiketi şeklin DIŞINDA olan merkez (KALP) → şekle ve borulara değmemeli.
          if (corners.some(([px, py]) => inPoly(px, py, c.poly))) centerBad.push({ label: t, why: "dış etiket şeklin içine giriyor" });
          const near = (px: number, py: number) => Math.min(...G.pipes.flatMap((pl) => pl.slice(1).map((q, i) => segDist(px, py, pl[i], q))));
          const samples: number[][] = [];
          for (let i = 0; i <= 10; i++) { samples.push([b.l + ((b.r - b.l) * i) / 10, b.t], [b.l + ((b.r - b.l) * i) / 10, b.b]); }
          samples.push([b.l, (b.t + b.b) / 2], [b.r, (b.t + b.b) / 2]);
          const pd = Math.min(...samples.map(([px, py]) => near(px, py))) - G.pipeHalf;
          if (pd < 1.4) centerBad.push({ label: t, why: `boruya ${pd.toFixed(2)} birim (en az 1.4)` });
        }
        const hit = G.gates.map((g) => ({ n: g.n, gap: boxCircleGap(b, g.x, g.y) - G.r })).filter((q) => q.gap < 1.4);
        if (hit.length) centerBad.push({ label: t, why: `kapı dairesine yakın/çakışık: ${hit.map((q) => `${q.n}(${q.gap.toFixed(2)})`).join(",")}` });
        boxes.push({ k: `merkez ${t}`, b });
      }
    }
    const textOverlap: string[] = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].b, c = boxes[j].b;
      if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) textOverlap.push(`${boxes[i].k}×${boxes[j].k}`);
    }
    return {
      silhouette: { min: +silMin.toFixed(2), who: silWho, frontScale: +frontScale.toFixed(3) },
      scale: +scale.toFixed(4), svgW: Math.round(rect.width), svgH: Math.round(rect.height),
      gateText: { min: gMin, max: gMax, px: +(gMin * scale).toFixed(2), maxInk: +maxInk.toFixed(2) }, centerText: { min: cMin, max: cMax, pxMin: +(cMin * scale).toFixed(2) },
      gateBad, centerBad, textOverlap, gateCount, centerLabelCount,
    };
  }, [selector, GEO] as const);
}

// ── Kanal beklentisi: kayıtlı aktivasyonlardan BAĞIMSIZ (çizim kodu kullanılmaz) ─────────────────────────────
type Side = "P" | "D" | "PD";
function expectedChannels(activations: Array<{ gate: number; side: string }>) {
  const P = new Set<number>(), D = new Set<number>();
  for (const a of activations) (a.side === "design" ? D : P).add(a.gate);
  const side = (g: number): Side | null => (P.has(g) && D.has(g) ? "PD" : P.has(g) ? "P" : D.has(g) ? "D" : null);
  const out: Array<{ id: string; kind: "defined" | "half"; halves: Array<{ gate: number; side: Side }> }> = [];
  for (const ch of CHANNELS) {
    const lo = Math.min(ch.gateA, ch.gateB), hi = Math.max(ch.gateA, ch.gateB);
    const halves = [lo, hi].map((g) => ({ gate: g, side: side(g) })).filter((h): h is { gate: number; side: Side } => !!h.side);
    if (halves.length) out.push({ id: ch.id, kind: halves.length === 2 ? "defined" : "half", halves });
  }
  return out;
}

/** Premium DOM'dan kanal yarıları: her dolgu grubunun ilk/son noktası hangi kapıya yakınsa o kapının yarısı. */
async function premiumHalves(page: Page) {
  return page.evaluate((geo) => {
    const G = geo as typeof GEO;
    const svg = document.querySelector('[data-hd-renderer="premium"] svg[data-hd-cbg]') as SVGSVGElement;
    const out: Array<{ chs: string; gate: number; color: string; dashed: boolean; stripeDash: string | null }> = [];
    for (const g of svg.querySelectorAll("[data-hd-cbg-fill]")) {
      const chs = g.getAttribute("data-hd-cbg-fill")!;
      const color = g.getAttribute("data-hd-cbg-color")!;
      const lines = [...g.querySelectorAll("polyline")];
      const pts = lines[0].getAttribute("points")!.split(" ").map((p) => p.split(",").map(Number));
      const gatesOf = [...new Set(chs.split(",").flatMap((c) => c.split("-").map(Number)))];
      let best = { gate: 0, d: 1e9 };
      for (const n of gatesOf) {
        const q = G.gates.find((x) => x.n === n)!;
        for (const p of [pts[0], pts[pts.length - 1]]) { const d = Math.hypot(p[0] - q.x, p[1] - q.y); if (d < best.d) best = { gate: n, d }; }
      }
      // Kesik: renkli borunun gövdesinde (şerit DEĞİL) stroke-dasharray var mı?
      const dashed = !color.endsWith("-dash") && lines.some((l) => !!l.getAttribute("stroke-dasharray"));
      out.push({ chs, gate: best.gate, color, dashed, stripeDash: color.endsWith("-dash") ? lines[0].getAttribute("stroke-dasharray") : null });
    }
    return out;
  }, GEO);
}

async function main() {
  const rec = CHART_FILE ? JSON.parse(readFileSync(CHART_FILE, "utf8")) : null;
  const env: TestEnv = await startHdFlowEnv({ port: 54451, dirName: "hd-bodygraph-readability-pgdata2", httpPort: 54541 });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  let roxyReq = 0;
  const report: Record<string, unknown> = {};
  const staticServer = createServer();
  try {
    const PA = { human_design: true, clients: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "HBRD", TA, PA);
    const jr = await import("../../app/api/hd/clients/journey/route");
    const rr = await import("../../app/api/hd/charts/roxy/route");
    const [ad, soyad] = rec ? String(rec.client_name ?? "Kayıtlı Harita").split(/\s+(.+)/) : ["Okunabilirlik", "Fixture"];
    console.log("  · test ortamı hazır; danışan oluşturuluyor");
    const c = await callRoute(jr.POST, "POST", UA, { action: "create_new", ad: ad || "Kayıtlı", soyad: soyad || "Harita", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID() });
    const hd = String(c.json.hd_client_id);
    const ch = await callRoute(rr.POST, "POST", UA, { client_id: hd, location_id: "client" });
    const chartId = String(ch.json.id);
    roxy.restore();
    if (rec) {
      // YEREL test veritabanı: kayıtlı satırın hesap alanları birebir (yeni hesap YOK).
      await su.query(
        `update public.human_design_charts set computed_result=$2, provider_raw=$3, birth_date=$4, birth_time=$5, birth_place=$6, timezone=$7, input=$8,
           type_code=$9, authority_code=$10, profile_code=$11, definition_code=$12, engine_version=$13, contract_version=$14, provider=$15, input_hash=$16 where id=$1`,
        [chartId, rec.computed_result, rec.provider_raw, rec.birth_date, rec.birth_time, rec.birth_place, rec.timezone, rec.input, rec.type_code, rec.authority_code,
          rec.profile_code, rec.definition_code, rec.engine_version, rec.contract_version, rec.provider, rec.input_hash],
      );
      await su.query(`update public.human_design_clients set birth_date=$2, birth_time=$3, birth_place=$4 where id=$1`, [hd, rec.birth_date, rec.birth_time, rec.birth_place]);
    }
    const row = (await su.query(`select computed_result, provider_raw from public.human_design_charts where id=$1`, [chartId])).rows[0];
    const CR = row.computed_result;
    const PAYLOAD = buildRoxyRenderPayload(row.provider_raw);

    // Statik sunucu: Roxy resmî çizicisi (yerel vendor) + Word yakalama paketi + font/logo. Dış ağ YOK.
    const bundle = buildSync({
      stdin: {
        contents: `import { capturePremiumBodygraphPng } from "./lib/human-design/reporting/premiumBodygraphCapture";
import { premiumStateFromChart } from "./lib/human-design/bodygraph/premiumChartState";
import { buildConnectionBodygraphScene, connectionBodygraphSvg } from "./lib/human-design/relations/connectionBodygraphScene";
window.__cap = capturePremiumBodygraphPng;
window.__svg = (c) => connectionBodygraphSvg(buildConnectionBodygraphScene(premiumStateFromChart(c)), { logoHref: "/assets/yasam-sistemi-chart-logo.png", fontFamily: "Geist" });`,
        resolveDir: ROOT, loader: "ts",
      },
      bundle: true, format: "iife", write: false, platform: "browser",
    }).outputFiles[0].text;
    const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:Geist;src:url(/fonts/Geist-Regular.ttf)}body{margin:0;font-family:Geist}</style></head><body><div id="w" style="width:602px;height:752px"></div><script src="/cap.js"></script><script src="/roxy.js"></script></body></html>`;
    staticServer.on("request", (req, res) => {
      const url = req.url ?? "/";
      if (url === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(PAGE); return; }
      if (url === "/cap.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle); return; }
      if (url === "/roxy.js") { res.setHeader("content-type", "text/javascript"); res.end(readFileSync(path.join(ROOT, "public/vendor/roxy-ui/0.48.0/bodygraph.js"))); return; }
      if (url === "/assets/yasam-sistemi-chart-logo.png" || url === "/fonts/Geist-Regular.ttf") {
        res.setHeader("content-type", url.endsWith(".png") ? "image/png" : "font/ttf");
        res.end(readFileSync(path.join(ROOT, "public", url)));
        return;
      }
      res.statusCode = 404; res.end();
    });
    await new Promise<void>((r) => staticServer.listen(0, "127.0.0.1", () => r()));
    const sport = (staticServer.address() as { port: number }).port;

    const userJson: Json = {
      id: UA.id, tenant_id: TA, full_name: "ZZ_HBRD", email: "zz.hbrd@example.test", role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: PA,
    };
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    // ── 1) Kanal gösterimi: beklenti ↔ premium ↔ Roxy resmî (bir kez) ──────────────────────────────────────────
    const EXP = expectedChannels(CR.activations);
    {
      section("Kanal gösterimi — Roxy resmî çizici (yerel vendor, gölge DOM)");
      const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
      const ext: string[] = [];
      page.on("request", (r) => { if (!r.url().startsWith(`http://127.0.0.1:${sport}`) && !/^(data|blob):/.test(r.url())) ext.push(r.url()); });
      await page.addInitScript({ content: "window.__name = (f) => f;" });
      await page.goto(`http://127.0.0.1:${sport}/`);
      await page.waitForFunction(() => !!customElements.get("roxy-bodygraph"));
      const roxyHalves = await page.evaluate(async (data) => {
        const el = document.createElement("roxy-bodygraph") as HTMLElement & { data?: unknown; updateComplete?: Promise<unknown> };
        document.body.appendChild(el);
        el.data = data;
        await el.updateComplete;
        await new Promise((r) => setTimeout(r, 300));
        const root = el.shadowRoot!;
        // Kapı konumu: tüm kanalların gri zemin çizgisi (.bg-channel) uçları = kapı noktaları; kapı numarası en yakın uca.
        const dots: Array<{ x: number; y: number }> = [];
        for (const l of root.querySelectorAll("line.bg-channel")) {
          dots.push({ x: +l.getAttribute("x1")!, y: +l.getAttribute("y1")! }, { x: +l.getAttribute("x2")!, y: +l.getAttribute("y2")! });
        }
        const labels = [...root.querySelectorAll("text.bg-gate")].map((t) => ({ n: Number(t.textContent), x: +t.getAttribute("x")!, y: +t.getAttribute("y")! }));
        const halves = [...root.querySelectorAll("line.bg-half")].map((l) => ({ x1: +l.getAttribute("x1")!, y1: +l.getAttribute("y1")!, x2: +l.getAttribute("x2")!, y2: +l.getAttribute("y2")!, cls: l.getAttribute("class") ?? "", dash: getComputedStyle(l).strokeDasharray }));
        return { dots, labels, halves };
      }, PAYLOAD);
      // Roxy kapı numarası → en yakın nokta; yarı çizgisi (x1,y1) → kapı; (x2,y2) orta nokta → kanal.
      const gatePt = new Map<number, { x: number; y: number }>();
      const uniq = new Map<string, { x: number; y: number }>();
      for (const d of roxyHalves.dots) uniq.set(`${d.x.toFixed(1)},${d.y.toFixed(1)}`, d);
      const pts = [...uniq.values()];
      for (const l of roxyHalves.labels) {
        let best = pts[0], bd = 1e9;
        for (const p of pts) { const dd = Math.hypot(p.x - l.x, p.y - l.y); if (dd < bd) { bd = dd; best = p; } }
        gatePt.set(l.n, best);
      }
      const roxy: Array<{ id: string; gate: number; side: Side; dash: string }> = [];
      const unmatched: unknown[] = [];
      const byKey = new Map<string, { id: string; gate: number; cls: string[]; dash: string }>();
      for (const h of roxyHalves.halves) {
        let found: { id: string; gate: number } | null = null;
        for (const chn of CHANNELS) {
          const a = gatePt.get(chn.gateA), b = gatePt.get(chn.gateB);
          if (!a || !b) continue;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          if (Math.hypot(mx - h.x2, my - h.y2) > 0.6) continue;
          for (const [g, p] of [[chn.gateA, a], [chn.gateB, b]] as const) if (Math.hypot(p.x - h.x1, p.y - h.y1) < 0.6) found = { id: chn.id, gate: g };
        }
        if (!found) { unmatched.push(h); continue; }
        const k = `${found.id}:${found.gate}`;
        const e = byKey.get(k) ?? { ...found, cls: [], dash: "" };
        e.cls.push(h.cls);
        if (!h.cls.includes("stripe")) e.dash = h.dash;
        byKey.set(k, e);
      }
      for (const e of byKey.values()) {
        const stripe = e.cls.some((c) => c.includes("stripe"));
        const left = e.cls.some((c) => c.includes("src-left") && !c.includes("stripe"));
        const right = e.cls.some((c) => c.includes("src-right") && !c.includes("stripe"));
        roxy.push({ id: e.id, gate: e.gate, side: stripe ? "PD" : left ? "D" : right ? "P" : ("?" as Side), dash: e.dash });
      }
      ok(unmatched.length === 0, "Roxy: her yarı çizgisi bir kanala ve kapıya eşlendi", unmatched.slice(0, 3));
      ok(ext.length === 0, "Roxy karşılaştırması: dış ağ isteği yok", ext);
      const expHalves = EXP.flatMap((e) => e.halves.map((h) => `${e.id}:${h.gate}:${h.side}`)).sort();
      const roxyKeys = roxy.map((h) => `${h.id}:${h.gate}:${h.side}`).sort();
      ok(JSON.stringify(expHalves) === JSON.stringify(roxyKeys), `Roxy resmî çizim = kayıtlı aktivasyonlar (${expHalves.length} renkli yarı, kanal-kapı-taraf birebir)`, { exp: expHalves.filter((k) => !roxyKeys.includes(k)), roxy: roxyKeys.filter((k) => !expHalves.includes(k)) });
      ok(roxy.every((h) => h.dash === "none"), "Roxy: renkli yarılar DÜZ (kesik çizgi yok; yalnız iki taraflı şerit kesikli)", roxy.filter((h) => h.dash !== "none"));
      report.roxy = roxy;
      await page.close();
    }

    const prem = async (page: Page, tag: string) => {
      const halves = await premiumHalves(page);
      // Ağ kolu (10/20/34/57) dolgusu birden çok kanal kimliği taşır → kanal başına aç.
      const got = new Set<string>();
      const dashedFound: string[] = [];
      const stripeGaps: string[] = [];
      for (const h of halves) {
        for (const id of h.chs.split(",")) {
          if (!id.split("-").map(Number).includes(h.gate)) continue;
          const tone = h.color.replace("-dash", "");
          got.add(`${id}:${h.gate}:${h.color.endsWith("-dash") ? "stripe" : tone}`);
          if (h.dashed) dashedFound.push(`${id}:${h.gate}`);
          if (h.stripeDash && h.stripeDash !== "5 5") stripeGaps.push(`${id}:${h.gate}=${h.stripeDash}`);
        }
      }
      const toKeys = (side: Side) => (side === "PD" ? ["A", "stripe"] : side === "P" ? ["A"] : ["B"]);
      const exp = new Set(EXP.flatMap((e) => e.halves.flatMap((h) => toKeys(h.side).map((k) => `${e.id}:${h.gate}:${k}`))));
      const missing = [...exp].filter((k) => !got.has(k));
      const extra = [...got].filter((k) => !exp.has(k));
      // Ağ gövdesi (yalnız tanımlı ağ kanalında) beklenti listesinde gövde parçası olarak ayrıca görünür → yalnız beklenmeyen KAPI yarısı sayılır.
      ok(missing.length === 0 && extra.length === 0, `${tag}: premium renkli yarılar = kayıtlı aktivasyonlar (Kişilik=A siyah, Tasarım=B kırmızı, ikisi=A+şerit)`, { missing, extra });
      // Kategori kategori (owner: ayrı rapor). Renk adı: A=siyah (Kişilik), B=kırmızı (Tasarım), A+şerit=siyah-kırmızı.
      const name = (side: Side) => (side === "PD" ? "siyah-kırmızı şeritli" : side === "P" ? "siyah" : "kırmızı");
      const cats: Array<[string, (e: (typeof EXP)[number]) => boolean]> = [
        ["TAM TANIMLI", (e) => e.kind === "defined"],
        ["YARIM", (e) => e.kind === "half"],
        ["ÇİFT AKTİVASYONLU (kapı iki tarafta)", (e) => e.halves.some((h) => h.side === "PD")],
      ];
      for (const [cat, f] of cats) {
        const list = EXP.filter(f);
        const bad = list.filter((e) => e.halves.some((h) => toKeys(h.side).some((k) => !got.has(`${e.id}:${h.gate}:${k}`))));
        const dashedHere = list.filter((e) => dashedFound.some((x) => x.startsWith(`${e.id}:`))).map((e) => e.id);
        const desc = list.map((e) => `${e.id} ${e.halves.map((h) => `${h.gate}=${name(h.side)}`).join(" + ")}`);
        console.log(`  · ${cat} (${list.length}): ${desc.join(" · ")}`);
        ok(bad.length === 0, `${tag}: ${cat} kanallar — renkli yarılar kayıtla birebir`, bad.map((e) => e.id));
        ok(dashedHere.length === 0, `${tag}: ${cat} kanallar — renkli yarılar DÜZ (beyaz boşluklu kesik çizgi yok)`, dashedHere);
      }
      ok(stripeGaps.length === 0, `${tag}: iki taraflı kapı şeridi tanımlı kanaldakiyle aynı (5/5, siyah üzerinde kırmızı; beyaz boşluk yok)`, stripeGaps);
      return { dashedFound, stripeGaps, halves };
    };

    // ── 2) Ekranlar ──────────────────────────────────────────────────────────────────────────────────────────
    for (const d of DEVICES.filter((x) => !ONLY.length || ONLY.includes(x.name))) {
      section(d.name);
      const ctx = await browser.newContext({
        viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.mobile ? 2 : 1, isMobile: !!d.mobile, hasTouch: !!d.mobile,
        locale: "tr-TR", timezoneId: "Europe/Istanbul", ...(d.mobile ? { userAgent: d.tablet ? IPAD : IPHONE } : {}),
      });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript({ content: "window.__name = (f) => f;" });
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson), UA.token!]);
      const page = await ctx.newPage();
      page.on("request", (r) => { if (/\/api\/hd\/charts\/roxy|roxyapi\.com/.test(r.url())) roxyReq++; });
      page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));
      await page.goto(`${APP}/human-design/danisanlar`);
      try { await page.locator(`[data-hd-group-open="${hd}"]`).click({ timeout: 60_000 }); }
      catch (e) { await page.screenshot({ path: path.join(OUT, `${d.name}-HATA.png`) }); throw e; }
      const dlg = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
      await dlg.locator('[data-hd-renderer="premium"] svg[data-hd-cbg]').waitFor({ timeout: 90_000 });
      await page.waitForTimeout(600);
      const A = await auditSvg(page, '[data-hd-renderer="premium"] svg[data-hd-cbg]');
      const L = await page.evaluate(() => {
        const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
        const sc = document.querySelector('[role="dialog"][aria-labelledby="hd-computed-detay-title"] .overflow-y-auto') as HTMLElement | null;
        return {
          stage: r("[data-hd-stage]"), svg: r('[data-hd-renderer="premium"] svg[data-hd-cbg]'), vw: innerWidth,
          cols: [document.querySelector('[data-hd-stage] [data-hd-side="design"]')?.parentElement, document.querySelector('[data-hd-stage] [data-hd-side="personality"]')?.parentElement]
            .map((e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; }),
          overflowX: document.documentElement.scrollWidth > innerWidth + 1 || (!!sc && sc.scrollWidth > sc.clientWidth + 1),
        };
      });
      report[d.name] = { audit: A, layout: L };
      console.log(`  · SVG ${A.svgW}×${A.svgH}px, silüet payı ${A.silhouette.min} (${A.silhouette.who}), ekran ölçeği ${A.scale} → kapı numarası ${A.gateText.px}px (${A.gateText.min} birim), merkez adı en küçük ${A.centerText.pxMin}px (${A.centerText.min}–${A.centerText.max} birim)`);
      ok(A.silhouette.min >= 4, `${d.name}: BodyGraph silüetin İÇİNDE (kenara en az 4 birim; ön katman ölçeği ${A.silhouette.frontScale})`, A.silhouette);
      ok(A.gateCount === 64 && A.centerLabelCount === 10, `${d.name}: 64 kapı numarası + 10 merkez adı satırı`, { g: A.gateCount, c: A.centerLabelCount });
      ok(A.gateBad.length === 0, `${d.name}: kapı numaraları dairenin içinde ve ortalı`, A.gateBad.slice(0, 8));
      ok(A.centerBad.length === 0, `${d.name}: merkez adları şeklin içinde, kapılara değmiyor`, A.centerBad);
      ok(A.textOverlap.length === 0, `${d.name}: hiçbir yazı başka yazıya binmiyor`, A.textOverlap.slice(0, 8));
      ok(!L.overflowX, `${d.name}: yatay taşma yok`);
      ok(!!L.svg && !!L.stage && L.svg.x >= L.stage.x - 1 && L.svg.r <= L.stage.r + 1, `${d.name}: BodyGraph sahne içinde (yatay)`, { svg: L.svg, stage: L.stage });
      const hit = L.cols.filter((c) => !!c && !!L.svg && c.x < L.svg.r - 1 && L.svg.x < c.r - 1 && c.y < L.svg.b - 1 && L.svg.y < c.b - 1);
      ok(L.cols.every(Boolean) && hit.length === 0, `${d.name}: BodyGraph Design / Personality sütunlarının üzerine binmiyor`, { svg: L.svg, cols: L.cols });
      if (d.name === "1536x730") {
        const P = await prem(page, d.name);
        report.premiumHalves = P.halves;
        report.dashed = P.dashedFound;
        report.stripeGaps = P.stripeGaps;
      }
      await page.evaluate(() => { const sc = document.querySelector('[role="dialog"][aria-labelledby="hd-computed-detay-title"] .overflow-y-auto') as HTMLElement | null; if (sc) sc.scrollTop = 0; });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, `${d.name}-ekran.png`), fullPage: false });
      // Kaydırılmış görünüm: BodyGraph'ın alt kenarı görünür (kısa ekranda kullanıcının kaydırınca gördüğü).
      await page.evaluate(() => {
        const sc = document.querySelector('[role="dialog"][aria-labelledby="hd-computed-detay-title"] .overflow-y-auto') as HTMLElement | null;
        const svg = document.querySelector('[data-hd-renderer="premium"] svg[data-hd-cbg]') as SVGSVGElement | null;
        if (sc && svg) sc.scrollTop += Math.max(0, svg.getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom + 12);
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, `${d.name}-ekran-alt.png`), fullPage: false });
      // Yakın çekim: ekrandaki SVG'nin BİREBİR kopyası, ekrandaki piksel boyutunda (modal kaydırma kabı kırpmasın diye
      // sabit katmanda). Yalnız görüntü içindir; ölçümler yukarıda gerçek yerleşimde alındı.
      if (A.svgH + 20 > d.h) await page.setViewportSize({ width: d.w, height: A.svgH + 20 });
      await page.evaluate(({ w, h }) => {
        const src = document.querySelector('[data-hd-renderer="premium"] svg[data-hd-cbg]') as SVGSVGElement;
        const c = src.cloneNode(true) as SVGSVGElement;
        c.removeAttribute("class");
        c.setAttribute("width", String(w));
        c.setAttribute("height", String(h));
        const ov = document.createElement("div");
        ov.id = "__bgshot";
        ov.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;background:#fff;z-index:2147483647;font-family:${getComputedStyle(src).fontFamily}`;
        ov.appendChild(c);
        document.body.appendChild(ov);
      }, { w: A.svgW, h: A.svgH });
      await page.locator("#__bgshot").screenshot({ path: path.join(OUT, `${d.name}-bodygraph.png`) });
      await ctx.close();
    }

    // ── 3) Word görseli (gerçek yakalama modülü) + Word SVG yazı denetimi ─────────────────────────────────────
    {
      section("Word görseli");
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.addInitScript({ content: "window.__name = (f) => f;" });
      await page.goto(`http://127.0.0.1:${sport}/`);
      await page.evaluate(() => document.fonts.load("10px Geist"));
      const res = (await page.evaluate(async ([chart, data, id]) => (window as unknown as { __cap: (c: unknown, d: unknown, i: string) => Promise<Record<string, unknown>> }).__cap(chart, data, id as string), [CR, PAYLOAD, chartId] as const)) as { ok: boolean; dataUrl?: string; width?: number; height?: number; error?: string };
      ok(res.ok && !!res.dataUrl, "Word: premium yakalama başarılı", res.error);
      if (res.dataUrl) {
        const png = Buffer.from(res.dataUrl.split(",")[1], "base64");
        writeFileSync(path.join(OUT, "word-bodygraph.png"), png);
        const chk = validateBodygraphPng(png);
        ok(chk.ok, "Word: sunucu PNG doğrulayıcısından geçer", chk.ok ? undefined : chk.error);
      }
      await page.evaluate((c) => { document.getElementById("w")!.innerHTML = (window as unknown as { __svg: (c: unknown) => string }).__svg(c); const s = document.querySelector("#w svg") as SVGSVGElement; s.setAttribute("width", "602"); s.setAttribute("height", "752"); }, CR);
      await page.waitForTimeout(200);
      const W = await auditSvg(page, "#w svg");
      report.word = W;
      ok(W.silhouette.min >= 4, `Word SVG: BodyGraph silüetin İÇİNDE (kenara en az 4 birim; ön katman ölçeği ${W.silhouette.frontScale})`, W.silhouette);
      ok(W.gateBad.length === 0 && W.centerBad.length === 0 && W.textOverlap.length === 0, "Word SVG: kapı numaraları / merkez adları sığıyor, çakışma yok", { g: W.gateBad.slice(0, 5), c: W.centerBad, o: W.textOverlap.slice(0, 5) });
      await page.close();
    }

    section("Genel");
    ok(roxyReq === 0, "ekran açma: Roxy isteği 0", roxyReq);
    ok(errors.length === 0, "sayfa JS hatası yok", errors.slice(0, 5));
  } finally {
    writeFileSync(path.join(OUT, "olcumler.json"), JSON.stringify(report, null, 1));
    try { await browser?.close(); } catch { /* kapandı */ }
    staticServer.close();
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nPREMIUM BODYGRAPH OKUNABİLİRLİK + KANAL: ${pass} PASS / ${fail} FAIL  (görüntüler + ölçümler: ${OUT})`);
  if (fail) { for (const f of [...new Set(fails)].slice(0, 60)) console.log(" -", f); process.exit(1); }
}

main().catch((e) => { console.error("HATA:", e, (e as Error)?.stack ?? ""); process.exit(1); });
