/**
 * KİŞİSEL DİJİTAL OFİS (P4) — renk matematiği ve logodan marka paleti önerisi (saf; DOM / ağ / model YOK).
 *
 * P0 son kabul prototipi js/color.js'in birebir TypeScript karşılığıdır (WCAG 2.x göreli parlaklık, kontrast,
 * ensureContrast, grade, makePalette, suggestPalettes). Piksel ÖRNEKLEME bileşende canvas ile yapılır; buraya yalnız
 * RGBA dizisi gelir. Her önerilen palette koyu yazı (ink) ↔ zemin tonu (soft) ≥ 4,5:1 GARANTİ edilir
 * (sunucu kontrast kapısı lib/workspace/contrast.ts aynı kuralı uygular).
 */
import type { BrandPalette } from "./schema";

export type Rgb = [number, number, number];
export type Hsl = [number, number, number];

export const AA = 4.5;
export const AA_LARGE = 3;

export function hexToRgb(h: string): Rgb {
  const m = String(h).replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: readonly number[]): string {
  return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

const asRgb = (c: string | readonly number[]): readonly number[] => (typeof c === "string" ? hexToRgb(c) : c);

export function contrast(a: string | readonly number[], b: string | readonly number[]): number {
  const la = luminance(asRgb(a));
  const lb = luminance(asRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function mix(a: string | readonly number[], b: string | readonly number[], t: number): Rgb {
  const A = asRgb(a);
  const B = asRgb(b);
  return [0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t) as Rgb;
}

export const mixHex = (a: string, b: string, t: number): string => rgbToHex(mix(a, b, t));

export function rgbToHsl([r0, g0, b0]: readonly number[]): Hsl {
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb([h0, s, l]: readonly number[]): Rgb {
  const h = ((h0 % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Rengi verilen zemin üzerinde en az `min` kontrasta ulaşana dek koyulaştırır / açar (ton korunur). */
export function ensureContrast(hex: string, bg: string, min = AA): string {
  const [h, s, l0] = rgbToHsl(hexToRgb(hex));
  let l = l0;
  const dir = luminance(hexToRgb(bg)) > 0.4 ? -1 : 1;
  for (let i = 0; i < 70 && contrast(rgbToHex(hslToRgb([h, s, l])), bg) < min; i++) l = Math.max(0, Math.min(1, l + dir * 0.015));
  let out = rgbToHex(hslToRgb([h, s, l]));
  // Güvenlik: ton korunarak ulaşılamadıysa siyah / beyaz uca gidilir.
  if (contrast(out, bg) < min) out = dir < 0 ? "#000000" : "#ffffff";
  return out;
}

export type Grade = "AAA" | "AA" | "AA-large" | "fail";
export function grade(ratio: number): Grade {
  return ratio >= 7 ? "AAA" : ratio >= AA ? "AA" : ratio >= AA_LARGE ? "AA-large" : "fail";
}

// ── Logodan renk çıkarımı (prototip logoColors; piksel dizisi canvas'tan gelir) ──────────────────────────

export type PixelData = { data: ArrayLike<number> };
export type LogoColors = { colors: string[]; dark: string | null };

/** Baskın, doygun renkler (şeffaf, beyaza / griye çok yakın pikseller dışlanır) + koyu ipucu. */
export function logoColorsFromPixels(px: PixelData): LogoColors {
  const d = px.data;
  const buckets = new Map<string, { n: number; sum: [number, number, number]; w: number }>();
  const darkSum: [number, number, number] = [0, 0, 0];
  let darkN = 0;
  for (let i = 0; i + 3 < d.length; i += 4) {
    if (d[i + 3] < 140) continue;
    const rgb: Rgb = [d[i], d[i + 1], d[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (l > 0.93) continue;
    if (s < 0.16 || l < 0.2) {
      if (s >= 0.16 || l < 0.35) { darkSum[0] += rgb[0]; darkSum[1] += rgb[1]; darkSum[2] += rgb[2]; darkN++; }
      continue;
    }
    const key = `${Math.round(h / 15)}:${Math.round(s * 4)}:${Math.round(l * 5)}`;
    const b = buckets.get(key) ?? { n: 0, sum: [0, 0, 0], w: 0 };
    b.n++;
    b.sum[0] += rgb[0]; b.sum[1] += rgb[1]; b.sum[2] += rgb[2];
    b.w += 0.15 + s * s * 2 + (l > 0.25 && l < 0.75 ? 0.5 : 0);
    buckets.set(key, b);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.w - a.w).map((b) => b.sum.map((v) => v / b.n) as Rgb);
  const picked: Rgb[] = [];
  const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  for (const c of ranked) {
    const h = rgbToHsl(c)[0];
    if (picked.every((p) => hueDist(rgbToHsl(p)[0], h) > 28)) picked.push(c);
    if (picked.length >= 3) break;
  }
  return { colors: picked.map(rgbToHex), dark: darkN ? rgbToHex(darkSum.map((v) => v / darkN)) : null };
}

const INK_FALLBACK = "#17142b";

/** Palet = accent (başlık / etiket), soft (zemin tonu), ink (koyu yazı), accent2 (ikincil). */
export function makePalette(name: string, base: string, second: string | null, darkHint: string | null): BrandPalette {
  const [h, s] = rgbToHsl(hexToRgb(base));
  const accent = rgbToHex(hslToRgb([h, Math.min(0.78, Math.max(0.42, s)), 0.42]));
  const soft = rgbToHex(hslToRgb([h, Math.min(0.55, s * 0.7), 0.94]));
  let ink = darkHint ? ensureContrast(darkHint, soft, 7) : rgbToHex(hslToRgb([h, 0.35, 0.16]));
  if (contrast(ink, soft) < AA) ink = INK_FALLBACK;
  const a2 = second ? rgbToHex(hslToRgb([rgbToHsl(hexToRgb(second))[0], 0.6, 0.45])) : rgbToHex(hslToRgb([h + 32, 0.5, 0.48]));
  return { name, accent: ensureContrast(accent, soft, AA), soft, ink, accent2: ensureContrast(a2, soft, AA_LARGE) };
}

export function suggestPalettes({ colors, dark }: LogoColors): BrandPalette[] {
  if (!colors.length) {
    const base = dark || "#4b4560";
    return [makePalette("Nötr zarif", "#6b5f7d", null, base), makePalette("Sıcak altın", "#a8761f", null, base), makePalette("Serin lacivert", "#2f4a7a", null, base)];
  }
  const p1 = makePalette("Logo uyumu", colors[0], colors[1] ?? null, dark);
  const p2 = colors[1]
    ? makePalette("İkinci renk", colors[1], colors[0], dark)
    : makePalette("Analog", rgbToHex(hslToRgb([rgbToHsl(hexToRgb(colors[0]))[0] + 30, 0.55, 0.45])), colors[0], dark);
  const [h, s] = rgbToHsl(hexToRgb(colors[0]));
  const p3 = makePalette("Sakin nötr", rgbToHex(hslToRgb([h, s * 0.35, 0.42])), colors[0], dark);
  return [p1, p2, p3];
}

/** Canvas piksellerinden 3 palet önerisi (her biri ink/soft ≥ 4,5:1). */
export function palettesFromPixels(px: PixelData): BrandPalette[] {
  return suggestPalettes(logoColorsFromPixels(px));
}

/** "Okunabilirliği otomatik düzelt": vurgu ve koyu yazı zemin tonunda AA'ya çekilir (zemin değişmez). */
export function fixBrandContrast(b: BrandPalette): BrandPalette {
  let ink = contrast(b.ink, b.soft) >= AA ? b.ink : ensureContrast(b.ink, b.soft, AA + 0.2);
  if (contrast(ink, b.soft) < AA) ink = INK_FALLBACK;
  const accent = contrast(b.accent, b.soft) >= AA ? b.accent : ensureContrast(b.accent, b.soft, AA + 0.2);
  return { ...b, ink, accent };
}

export const isHex = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);
