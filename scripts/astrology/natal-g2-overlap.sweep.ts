/**
 * G2 — natal etiket katmanı GERÇEK TARAYICI çakışma taraması (2026-11-22). 202 harita (golden + Çumra + 200 sağlayıcı fixture'ı) ×
 * (Profesyonel/Ayrıntılı, Temel/Sade) × (saat biliniyor, saat bilinmiyor maskeli) = 808 çark; SSR çıktısı Chromium'da ürünün
 * yazı tipleriyle (Geist + Yasam Natal Sembol) ~ürün masaüstü ölçeğinde (616 px) çizilir; etiket satırları, grup kutuları, ev başlangıcı
 * etiketleri, eksen levhaları ve ev numaralarının ekran kutuları karşılaştırılır (≥ 0,6 px örtüşme = çakışma) ve hiçbir yazı çark tuvalinin dışına taşmaz. Ağ / DB / sağlayıcı YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/natal-g2-overlap.sweep.ts [çıktı klasörü]
 *   (Playwright Chromium gerekir; CSS modülü yükleyicisi aşağıda ilk içe aktarma olarak kaydedilir.)
 */
import "./css-module-stub.cjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import NatalWheel from "@/app/admin/astroloji/_components/NatalWheel";
import { natalWheelDisplay } from "@/app/admin/astroloji/_components/NatalChartControls";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { maskTimeDependent } from "@/lib/astrology/view/natalView";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import { DEFAULT_PREFS, type NatalLabelPref } from "@/lib/astrology/view/natalWheelDisplay";

const ROOT = join(__dirname, "..", "..");
const FIX = join(__dirname, "fixtures");
const OUT = process.argv[2] ?? join(ROOT, ".g2-overlap-sweep");
mkdirSync(OUT, { recursive: true });

const golden = (() => {
  const raw = JSON.parse(readFileSync(join(FIX, "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const p = projectRoxyNatal(raw.response ?? raw, { houseSystem: "placidus", nodeType: "true" });
  if (!p.ok) throw new Error("golden");
  return p.value.technical as NatalTechnical;
})();
const cumra = JSON.parse(readFileSync(join(FIX, "natal-display", "cumra-1987-swisseph-ref.json"), "utf8")).technical as NatalTechnical;
const cases = (JSON.parse(readFileSync(join(FIX, "pro-natal-houses", "roxy-natal-technical-2026-10-31.json"), "utf8")).cases as { id: string; technical: NatalTechnical }[]).map((c) => ({ id: c.id, t: c.technical }));
const ALL = [{ id: "golden", t: golden }, { id: "cumra", t: cumra }, ...cases];
const PTS = { nodes: true, chiron: true, lilith: true, vertex: true, fortune: true };

const items: { key: string; svg: string }[] = [];
for (const { id, t } of ALL)
  for (const [mode, labels] of [["pro", "detailed"], ["basic", "simple"]] as const)
    for (const tu of [false, true]) {
      const tt = tu ? maskTimeDependent(t) : t;
      const d = natalWheelDisplay(tt, { ...DEFAULT_PREFS, mode, labels: labels as NatalLabelPref, points: { basic: PTS, pro: PTS } }, { timeUnknown: tu });
      items.push({ key: `${id}|${mode}/${labels}|${tu ? "saatsiz" : "saatli"}`, svg: renderToStaticMarkup(createElement(NatalWheel, { technical: tt, tinted: true, display: d, sizeClassName: "w616" })) });
    }

const fontUrl = (f: string) => pathToFileURL(join(ROOT, "public", "fonts", f)).href;
const head = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"Yasam Natal Sembol";src:url("${fontUrl("YasamAstroSymbolsA.ttf")}") format("truetype");unicode-range:U+260A-260B,U+26B7-26B8,U+2297}
@font-face{font-family:"GeistLocal";src:url("${fontUrl("Geist-Regular.ttf")}") format("truetype")}
:root{--font-geist-sans:"GeistLocal"} body{margin:0;font-family:GeistLocal} .w616{width:616px;height:616px;display:block}
</style>`;

// Tarayıcıda çalışan denetim (düz metin: derleyici yardımcıları sayfaya taşınmaz).
const INSPECT = `(() => {
  const out = [];
  document.querySelectorAll("[data-key]").forEach((box) => {
    const svg = box.querySelector("svg");
    const boxes = [];
    const add = (el, key, kind) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0.5 && r.height > 0.5) boxes.push({ key, kind, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    };
    svg.querySelectorAll("[data-label-text] text").forEach((t) => {
      const g = t.closest("[data-body],[data-point]");
      add(t, g.getAttribute("data-body") || g.getAttribute("data-point"), "lbl");
    });
    svg.querySelectorAll("[data-group] rect").forEach((t) => add(t, "g:" + t.parentElement.getAttribute("data-group"), "grp"));
    svg.querySelectorAll("[data-cusp-degree] text").forEach((t) => add(t, "c" + t.parentElement.getAttribute("data-cusp-degree"), "cusp"));
    svg.querySelectorAll("[data-angle] rect, [data-angle] text").forEach((t) => add(t, "a:" + t.closest("[data-angle]").getAttribute("data-angle"), "angle"));
    svg.querySelectorAll("[data-house-num]").forEach((t) => add(t, "h" + t.getAttribute("data-house-num"), "hnum"));
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.key === b.key) continue;
        if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) - 0.6 > 0 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) - 0.6 > 0) overlaps.push(a.kind + ":" + a.key + "×" + b.kind + ":" + b.key);
      }
    const sb = svg.getBoundingClientRect();
    for (const x of boxes) if (x.x0 < sb.left - 0.5 || x.x1 > sb.right + 0.5 || x.y0 < sb.top - 0.5 || x.y1 > sb.bottom + 0.5) overlaps.push("tuval-dışı:" + x.kind + ":" + x.key);
    out.push({ key: box.getAttribute("data-key"), overlaps });
  });
  return out;
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
  const all: { key: string; overlaps: string[] }[] = [];
  const BATCH = 60;
  for (let i = 0; i < items.length; i += BATCH) {
    const html = head + items.slice(i, i + BATCH).map((x) => `<div data-key="${x.key}">${x.svg}</div>`).join("");
    const f = join(OUT, `batch-${i / BATCH}.html`);
    writeFileSync(f, html);
    await page.goto(pathToFileURL(f).href);
    await page.evaluate(() => document.fonts.ready);
    all.push(...((await page.evaluate(INSPECT)) as { key: string; overlaps: string[] }[]));
  }
  await browser.close();
  const bad = all.filter((x) => x.overlaps.length);
  const byKind = (re: RegExp) => bad.filter((x) => re.test(x.key)).length;
  console.log(`natal-g2-overlap sweep: ${all.length} çark · çakışmalı çark ${bad.length} (saatli ayrıntılı ${byKind(/pro\/detailed\|saatli/)} · saatli sade ${byKind(/basic\/simple\|saatli/)} · saatsiz ayrıntılı ${byKind(/pro\/detailed\|saatsiz/)} · saatsiz sade ${byKind(/basic\/simple\|saatsiz/)})`);
  for (const b of bad.slice(0, 15)) console.log(`  ✗ ${b.key}: ${b.overlaps.slice(0, 4).join(", ")}`);
  writeFileSync(join(OUT, "sonuc.json"), JSON.stringify({ total: all.length, bad: bad.length, items: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
})();
