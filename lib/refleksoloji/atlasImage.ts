/**
 * Refleksoloji atlas → deterministik server-side PNG (tarayıcısız).
 *
 * Word/PDF için klinik ayak arka planı + gerçek atlas bölgeleri (oval/rect/
 * free_draw/thick_line) TEK bir SVG'de birleştirilir ve `@resvg/resvg-js` ile
 * PNG'ye raster edilir. Tarayıcı screenshot / html2canvas / Playwright YOK.
 *
 * Koordinatlar Bölge Haritası'yla birebir: normalize 0..1 → arka plan PNG'sinin
 * TAM görsel alanı (object-contain overlay = tüm görsel; sol/sag ayak koordinatı
 * zaten bu alanda konumlanır). Aynı girdi → aynı SVG → aynı PNG (Date/random YOK).
 */

import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getImgDimensions } from "@/lib/docx/reportHelpers";
import type { RenderRegion, AtlasBackgroundGroup } from "./atlasRegionsCore";
import { ATLAS_GROUP_ASSET } from "./atlasRegionsCore";

/** Word içine gömülecek render sonucu. */
export type AtlasPng = {
  png: Buffer;
  width: number;
  height: number;
};

// Arka plan PNG'leri süreç ömrü boyunca cache'lenir (bulk raporda tek okuma).
const bgCache = new Map<string, { base64: string; w: number; h: number }>();

async function loadBackground(
  group: AtlasBackgroundGroup,
): Promise<{ base64: string; w: number; h: number }> {
  const asset = ATLAS_GROUP_ASSET[group];
  const cached = bgCache.get(asset);
  if (cached) return cached;

  // Vercel: outputFileTracingIncludes ile bu PNG'ler route bundle'ına dahil edilir
  // (bkz. next.config.ts). Ağ fetch'i YOK — yerel paketlenmiş asset.
  const file = path.join(process.cwd(), "public", "refleksoloji", asset);
  const buf = await readFile(file);
  const dims = getImgDimensions(buf) ?? { w: 1024, h: 1024 };
  const entry = { base64: buf.toString("base64"), w: dims.w, h: dims.h };
  bgCache.set(asset, entry);
  return entry;
}

/** rgba()/rgb()/hex → { hex, opacity }. usvg uyumu için renk hex'e sabitlenir. */
function parseColor(color: string): { hex: string; opacity: number } {
  const m = color.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").map((s) => s.trim());
    const to2 = (v: string) =>
      Math.max(0, Math.min(255, Math.round(parseFloat(v)))).toString(16).padStart(2, "0");
    const hex = `#${to2(parts[0])}${to2(parts[1])}${to2(parts[2])}`;
    const opacity = parts[3] != null ? Math.max(0, Math.min(1, parseFloat(parts[3]))) : 1;
    return { hex, opacity };
  }
  return { hex: color, opacity: 1 };
}

/** Deterministik sayı biçimi (kayan-nokta gürültüsü olmadan). */
function n(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0";
}

/** Tek bir bölgeyi SVG parçasına çevirir (viewBox birimleri = doğal piksel). Test için export. */
export function regionToSvg(region: RenderRegion, W: number, H: number, s = 1): string {
  const fill = parseColor(region.fill);
  const stroke = parseColor(region.stroke);
  const boxStroke = Math.max(2, Math.round(W * 0.005) * s);
  const freeStroke = Math.max(3, Math.round(W * 0.006) * s);
  const thickStroke = Math.max(4, Math.round(W * 0.009) * s);
  const common = `fill="${fill.hex}" fill-opacity="${fill.opacity}" stroke="${stroke.hex}" stroke-width="${boxStroke}"`;

  if (region.shape === "oval" && region.cx != null && region.cy != null && region.rx != null && region.ry != null) {
    const cx = region.cx * W;
    const cy = region.cy * H;
    const rot = region.angle ? ` transform="rotate(${n(region.angle)} ${n(cx)} ${n(cy)})"` : "";
    return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(region.rx * W)}" ry="${n(region.ry * H)}" ${common}${rot}/>`;
  }

  if (region.shape === "rect" && region.cx != null && region.cy != null && region.rx != null && region.ry != null) {
    const x = (region.cx - region.rx) * W;
    const y = (region.cy - region.ry) * H;
    const w = region.rx * 2 * W;
    const h = region.ry * 2 * H;
    const corner = Math.round(W * 0.008);
    const cx = region.cx * W;
    const cy = region.cy * H;
    const rot = region.angle ? ` transform="rotate(${n(region.angle)} ${n(cx)} ${n(cy)})"` : "";
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${corner}" ry="${corner}" ${common}${rot}/>`;
  }

  if (region.shape === "free_draw" && Array.isArray(region.points) && region.points.length >= 1) {
    if (region.points.length === 1) {
      const p = region.points[0];
      return `<circle cx="${n(p.x * W)}" cy="${n(p.y * H)}" r="${n(freeStroke * 1.4)}" fill="${stroke.hex}"/>`;
    }
    const pts = region.points.map((p) => `${n(p.x * W)},${n(p.y * H)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${stroke.hex}" stroke-width="${freeStroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  if (region.shape === "thick_line" && region.x1 != null && region.y1 != null && region.x2 != null && region.y2 != null) {
    return `<line x1="${n(region.x1 * W)}" y1="${n(region.y1 * H)}" x2="${n(region.x2 * W)}" y2="${n(region.y2 * H)}" stroke="${stroke.hex}" stroke-width="${thickStroke}" stroke-linecap="round"/>`;
  }

  return "";
}

export type RenderAtlasOptions = {
  /** Çıktı ölçek katsayısı (varsayılan 2x → yüksek çözünürlük, kırpma/blur yok). */
  renderScale?: number;
};

/**
 * Bir arka plan grubunun (taban/yan_ic/yan_dis) atlas haritasını PNG olarak üretir.
 * `regions` YALNIZ o gruba ait çizilebilir bölgeler olmalıdır (çağıran filtreler).
 * Aynı `regions` + `group` → byte-deterministik PNG.
 */
/**
 * Grup + bölgeler → tam SVG (arka plan gömülü + overlay'ler). Deterministik.
 * Test/QA için ayrık export edilir (renderAtlasGroupPng bunu kullanır).
 */
export async function buildAtlasSvg(
  group: AtlasBackgroundGroup,
  regions: RenderRegion[],
): Promise<{ svg: string; width: number; height: number }> {
  const bg = await loadBackground(group);
  const { w: W, h: H } = bg;
  const shapes = regions.map((r) => regionToSvg(r, W, H, 1)).filter(Boolean).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<image x="0" y="0" width="${W}" height="${H}" href="data:image/png;base64,${bg.base64}"/>` +
    shapes +
    `</svg>`;
  return { svg, width: W, height: H };
}

export async function renderAtlasGroupPng(
  group: AtlasBackgroundGroup,
  regions: RenderRegion[],
  opts: RenderAtlasOptions = {},
): Promise<AtlasPng> {
  const renderScale = opts.renderScale ?? 2;
  const { svg, width: W } = await buildAtlasSvg(group, regions);

  const outW = Math.round(W * renderScale);
  const resvg = new Resvg(svg, {
    background: "white",
    fitTo: { mode: "width", value: outW },
  });
  const rendered = resvg.render();
  const png = Buffer.from(rendered.asPng());
  return { png, width: rendered.width, height: rendered.height };
}
