// Profesyonel Word — PREMIUM BodyGraph PNG'si (YALNIZ TARAYICI). Aktif çizici (rendererConfig "premium").
//
// Ekrandaki premium grafikle AYNI SVG (buildConnectionBodygraphScene + connectionBodygraphSvg) kayıtlı
// computed_result'tan üretilir; logo ve Geist font SVG'ye gömülür (görsel olarak yüklenen SVG dış kaynak okuyamaz),
// canvas'a çizilir → PNG. Sunucu sözleşmesi DEĞİŞMEZ: PNG'ye pasif Roxy yakalamasıyla aynı bağ (analiz kimliği +
// kayıtlı roxy_render parmak izi) `tEXt` olarak eklenir; ölçü / bayt sınırları bodygraphPng.ts ile uyumlu.
// Pasif eski yol: bodygraphCapture.captureRoxyBodygraphPng (silinmedi).

import type { HdComputedChart } from "../chart/computedChart";
import { premiumStateFromChart } from "../bodygraph/premiumChartState";
import { buildConnectionBodygraphScene, CBG_VIEW, connectionBodygraphSvg } from "../relations/connectionBodygraphScene";
import { HD_BODYGRAPH_BIND_KEYWORD, bodygraphBindingText, fingerprintFromRoxyRender, insertPngTextChunk } from "./bodygraphBinding";
import type { BodygraphCaptureResult } from "./bodygraphCapture";

const TARGET_HEIGHTS = [2000, 1800] as const; // sunucu: en az 1800 px yükseklik, en fazla 3072 px kenar
const MAX_PNG_BYTES = Math.floor(2.4 * 1024 * 1024);
const LOGO_SRC = "/assets/yasam-sistemi-chart-logo.png";
const FONT_SRC = "/fonts/Geist-Regular.ttf";

async function asDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

async function rasterize(svg: string, height: number): Promise<{ blob: Blob; width: number; height: number } | null> {
  const width = Math.round((CBG_VIEW.width / CBG_VIEW.height) * height);
  const sized = svg.replace(/^<svg\b/, `<svg width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png"));
    return blob ? { blob, width, height } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bytesToPngDataUrl(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:image/png;base64,${btoa(bin)}`;
}

/** Kayıtlı haritadan premium BodyGraph PNG'si (Word). `roxyRender` yalnız bağ parmak izi için (sunucu aynısını üretir). */
export async function capturePremiumBodygraphPng(result: HdComputedChart, roxyRender: Record<string, unknown>, chartId: string): Promise<BodygraphCaptureResult> {
  if (typeof window === "undefined" || typeof document === "undefined") return { ok: false, error: "Tarayıcı ortamı gerekli." };
  const state = premiumStateFromChart(result);
  if (!state) return { ok: false, error: "BodyGraph çizimi kayıtlı harita verisiyle doğrulanamadı." };
  try {
    const [logo, font] = await Promise.all([asDataUrl(LOGO_SRC), asDataUrl(FONT_SRC)]);
    let svg = connectionBodygraphSvg(buildConnectionBodygraphScene(state), { logoHref: logo, fontFamily: "Geist" });
    if (font) svg = svg.replace("<defs>", `<defs><style>@font-face{font-family:Geist;src:url(${font}) format("truetype");}</style>`);
    const binding = bodygraphBindingText(chartId, fingerprintFromRoxyRender(roxyRender));
    for (const h of TARGET_HEIGHTS) {
      const out = await rasterize(svg, h);
      if (!out) continue;
      const bound = insertPngTextChunk(new Uint8Array(await out.blob.arrayBuffer()), HD_BODYGRAPH_BIND_KEYWORD, binding);
      if (bound.length > MAX_PNG_BYTES) continue;
      return { ok: true, dataUrl: bytesToPngDataUrl(bound), width: out.width, height: out.height, bytes: bound.length };
    }
    return { ok: false, error: "BodyGraph görseli üretilemedi." };
  } catch {
    return { ok: false, error: "BodyGraph görseli üretilemedi." };
  }
}
