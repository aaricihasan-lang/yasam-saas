/**
 * KİŞİSEL DİJİTAL OFİS — sunucuda doğrulanabilen kontrast kuralları (saf; bağımlılıksız).
 *
 * Owner kararı 1: okunabilirliği yetersiz tasarım UYGULANAMAZ. Sunucu yalnız RENKLERİ BİLİNEN zeminleri doğrular:
 *  - Karşılama satırları: varsayılan zemin, hazır tema, marka teması ve C düzeni plaketi (fotoğrafta tona göre plaket).
 *  - Marka paleti: koyu yazı (ink) ↔ zemin tonu (soft).
 * Formüller P0 son kabul prototipiyle (editor.js heroBg / lineColor / isLarge) birebir aynıdır.
 *
 * Sunucunun ÖLÇEMEDİĞİ (fotoğraf pikselleri, sayfa geneli fotoğraf + kart zemini) → istemcinin ZORUNLU piksel kapısı
 * (P4/P5 kabul kriteri; docs/kisisel-dijital-ofis/P1-DEVIR-NOTU.md). Bu modül o kapının yerine geçmez; atlatma yolu da
 * değildir: sunucu kuralı istemciden bağımsız uygulanır ve gevşetilemez.
 */
import type { TextLine, WorkspaceDesign } from "./schema";

export const AA = 4.5;
export const AA_LARGE = 3;

const THEME_BG: Record<string, string> = {
  manzara: "#efe9e4", safak: "#f4d6c3", lavanta: "#e2d6f5", adacayi: "#d8e7d0", sampanya: "#e9d3a8", gece: "#392e5e", murdum: "#6a2a4d",
};

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function lum(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function mixHex(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Karşılama metninin arkasındaki model zemin rengi; fotoğraf (A/B) için null → sunucu ölçemez. */
export function heroBackground(d: WorkspaceDesign): string | null {
  const b = d.bg;
  if (b.mode === "photo") return d.layout === "C" ? (b.tone === "dark" ? "#2a2238" : "#f1ede8") : null;
  if (b.mode === "theme") return b.theme === "marka" && d.brand ? mixHex(d.brand.soft, d.brand.accent, 0.22) : THEME_BG[b.theme] ?? THEME_BG.manzara;
  return "#f4efeb";
}

export function resolvedLineColor(d: WorkspaceDesign, l: TextLine, bg: string): string {
  const dark = contrastRatio(bg, "#000000") < 7;
  if (l.color === "brand") return d.brand ? d.brand.accent : "#7c3aed";
  if (l.color !== "auto") return l.color;
  if (dark) return ({ label: "#f1d293", title: "#ffffff", subtitle: "#f3f1f8", quote: "#f3f1f8", body: "#dcd8e6" } as Record<string, string>)[l.role] ?? "#ffffff";
  return ({ label: d.brand ? d.brand.accent : "#765614", title: d.brand ? d.brand.ink : "#17142b", subtitle: "#2a2640", quote: "#2a2640", body: "#5c586f" } as Record<string, string>)[l.role] ?? "#17142b";
}

/** WCAG büyük yazı: mobilde ×0,74 ölçek → en küçük görünür boyut; yalnız "title" kalın (700). */
export const isLargeLine = (l: TextLine) => (l.role === "title" ? l.size * 0.74 >= 18.66 : l.size * 0.74 >= 24);

export type ContrastIssue = { path: string; area: string; ratio: number; need: number; color: string; background: string };

export function checkDesignContrast(d: WorkspaceDesign): ContrastIssue[] {
  const out: ContrastIssue[] = [];
  const bg = heroBackground(d);
  if (!d.text.useGreeting && bg) {
    d.text.lines.forEach((l, i) => {
      if (!l.text.trim()) return;
      const fg = resolvedLineColor(d, l, bg);
      const need = isLargeLine(l) ? AA_LARGE : AA;
      const ratio = contrastRatio(fg, bg);
      if (ratio < need) out.push({ path: `design.text.lines[${i}]`, area: `Karşılama satırı ${i + 1}`, ratio: Math.round(ratio * 100) / 100, need, color: fg, background: bg });
    });
  }
  if (d.brand) {
    const ratio = contrastRatio(d.brand.ink, d.brand.soft);
    if (ratio < AA) out.push({ path: "design.brand.ink", area: "Marka paleti: koyu yazı / zemin tonu", ratio: Math.round(ratio * 100) / 100, need: AA, color: d.brand.ink, background: d.brand.soft });
  }
  return out;
}
