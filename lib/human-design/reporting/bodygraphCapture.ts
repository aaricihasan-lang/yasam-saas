// HD AŞAMA 4B — Profesyonel Word için BodyGraph PNG'si (YALNIZ TARAYICI).
//
// Kaynak: production'daki RESMİ Roxy renderer'ı (<roxy-bodygraph>, self-host @roxyapi/ui 0.48.0) —
// eski Yaşam Sistemi çizimi ya da yeni bir motor KULLANILMAZ. Renderer, kayıtlı haritanın yapısal
// yüküyle (roxy_render; yorum metni içermez) ekran DIŞINDA bir kapta çizdirilir:
//
//   1. Renderer'ın SVG'si Shadow DOM'dan alınır; her öğenin HESAPLANMIŞ stilleri (CSS değişkenleri
//      ve color-mix çözülmüş halde) satır içi yazılır → görünüm ekrandakiyle aynı kalır.
//   2. Doğrulama: çizimdeki aktif kapı noktası ve tanımlı merkez sayısı kayıtlı veriyle BİREBİR
//      eşleşmeli (eksik/yanlış çizim Word'e gitmez).
//   3. SVG, viewBox oranı korunarak hedef yükseklikte (≥1800 px) canvas'a çizilir → PNG.
//
// Yeni Roxy çağrısı YOK (renderer kontrollü modda kendi isteğini yapmaz). Sunucu PNG'yi ayrıca
// doğrular (bodygraphPng.ts); bu modül yalnız üretir.

const TARGET_HEIGHTS = [2400, 2000, 1800] as const;
const MAX_PNG_BYTES = Math.floor(2.4 * 1024 * 1024);
const RENDER_TIMEOUT_MS = 8000;

/** Satır içine yazılan SVG sunum özellikleri (görünümü belirleyen tam küme). */
const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-transform",
  "font-variant",
  "text-anchor",
  "dominant-baseline",
  "paint-order",
] as const;

export type BodygraphCaptureResult =
  | { ok: true; dataUrl: string; width: number; height: number; bytes: number }
  | { ok: false; error: string };

type RoxyElement = HTMLElement & { data?: unknown; updateComplete?: Promise<unknown> };

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function expected(data: Record<string, unknown>): { gates: Set<number>; definedCenters: number } {
  const gates = new Set<number>();
  for (const g of Array.isArray(data.gates) ? data.gates : []) {
    const n = (g as { gate?: unknown })?.gate;
    if (typeof n === "number") gates.add(n);
  }
  const definedCenters = (Array.isArray(data.centers) ? data.centers : []).filter((c) => (c as { defined?: unknown })?.defined === true).length;
  return { gates, definedCenters };
}

/**
 * Renderer'ın gerçek DOM'u (0.48.0, doğrulandı): aktif kapı numaraları `text.bg-gate.on`,
 * tanımlı merkezler `polygon.bg-center.defined`. Çizilen aktif kapı NUMARALARI kümesi ve tanımlı
 * merkez sayısı kayıtlı veriyle BİREBİR aynı olmalı.
 */
function drawingMatches(svg: SVGSVGElement, data: Record<string, unknown>): boolean {
  const exp = expected(data);
  const drawn = new Set<number>();
  svg.querySelectorAll("text.bg-gate.on").forEach((t) => drawn.add(Number((t.textContent ?? "").trim())));
  if (drawn.size !== exp.gates.size || [...exp.gates].some((g) => !drawn.has(g))) return false;
  return svg.querySelectorAll("polygon.bg-center.defined").length === exp.definedCenters;
}

function inlineComputedStyles(src: SVGSVGElement, dst: SVGSVGElement): void {
  const srcEls = [src, ...Array.from(src.querySelectorAll("*"))];
  const dstEls = [dst, ...Array.from(dst.querySelectorAll("*"))];
  for (let i = 0; i < srcEls.length && i < dstEls.length; i++) {
    const cs = getComputedStyle(srcEls[i] as Element);
    const decl: string[] = [];
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) decl.push(`${p}:${v}`);
    }
    (dstEls[i] as Element).setAttribute("style", decl.join(";"));
    (dstEls[i] as Element).removeAttribute("class");
    (dstEls[i] as Element).removeAttribute("part");
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("svg image load failed"));
    img.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

async function rasterize(svgMarkup: string, vbW: number, vbH: number, height: number): Promise<{ blob: Blob; width: number; height: number } | null> {
  const width = Math.round((vbW / vbH) * height);
  const sized = svgMarkup.replace(/^<svg\b/, `<svg width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; // Word sayfası beyaz; şeffaf kenarlar düz beyaz olur
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    return blob ? { blob, width, height } : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Kayıtlı yapısal yükten (roxy_render) yüksek çözünürlüklü BodyGraph PNG'si üretir.
 * `loadRenderer`: mevcut renderer yükleyicisi (HdRoxyBodygraph ile AYNI script; tek kaynak).
 */
export async function captureRoxyBodygraphPng(
  data: Record<string, unknown>,
  loadRenderer: () => Promise<void>,
): Promise<BodygraphCaptureResult> {
  if (typeof window === "undefined" || typeof document === "undefined") return { ok: false, error: "Tarayıcı ortamı gerekli." };
  try {
    await loadRenderer();
  } catch {
    return { ok: false, error: "BodyGraph çizim bileşeni yüklenemedi." };
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-hd-bodygraph-capture", "");
  // Ekran dışı ama GÖRÜNÜR (visibility/opacity gizlemesi hesaplanmış stile sızardı).
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:864px;pointer-events:none;";
  const el = document.createElement("roxy-bodygraph") as RoxyElement;
  el.className = "hd-fit";
  el.setAttribute("hide-readings", "");
  el.setAttribute("hide-sections", "header,details,legend,themes,facts");
  el.setAttribute("lang", "tr");
  host.appendChild(el);
  document.body.appendChild(host);

  try {
    el.data = data;
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    let svg: SVGSVGElement | null = null;
    while (Date.now() < deadline) {
      if (el.updateComplete) await el.updateComplete.catch(() => undefined);
      await nextFrame();
      svg = (el.shadowRoot?.querySelector("svg.chart") as SVGSVGElement | null) ?? null;
      if (svg && svg.querySelector(".bg-center")) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!svg) return { ok: false, error: "BodyGraph çizilemedi." };

    // Çizim ↔ kayıtlı veri doğrulaması (eksik/yanlış çizim rapora girmez).
    if (!drawingMatches(svg, data)) {
      return { ok: false, error: "BodyGraph çizimi kayıtlı harita verisiyle doğrulanamadı." };
    }

    const vb = svg.viewBox?.baseVal;
    if (!vb || !(vb.width > 0) || !(vb.height > 0)) return { ok: false, error: "BodyGraph ölçüsü okunamadı." };

    const clone = svg.cloneNode(true) as SVGSVGElement;
    inlineComputedStyles(svg, clone);
    clone.querySelectorAll("title,desc").forEach((n) => n.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.removeAttribute("role");
    clone.removeAttribute("aria-label");
    const markup = new XMLSerializer().serializeToString(clone);

    for (const h of TARGET_HEIGHTS) {
      const out = await rasterize(markup, vb.width, vb.height, h);
      if (!out) continue;
      if (out.blob.size > MAX_PNG_BYTES) continue;
      return { ok: true, dataUrl: await blobToDataUrl(out.blob), width: out.width, height: out.height, bytes: out.blob.size };
    }
    return { ok: false, error: "BodyGraph görseli üretilemedi." };
  } catch {
    return { ok: false, error: "BodyGraph görseli üretilemedi." };
  } finally {
    host.remove();
  }
}
