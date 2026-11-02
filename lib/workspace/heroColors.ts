/**
 * KİŞİSEL DİJİTAL OFİS — karşılama metni renkleri, ETKİN GÖRÜNÜM MODUNA göre (KDO-01, saf; istemci + test).
 *
 * Sorun (canlı Owner testi 2026-11-02): Gece modunda kök değişkenler (--ink …) açığa dönerken zemin açık kalabiliyor ya da
 * zemin koyulaşırken kullanıcının / markanın koyu rengi aynı kalıyordu → okunmuyordu. Tek sabit renk yerine:
 *  1) `heroBackgroundFor(d, mode)`: metnin GERÇEKTEN üzerinde durduğu zeminin model rengi (gece koyu bandı / plaketi /
 *     ofis camı; uzmanın yazı zemini; tema). Fotoğraf (A/B, yazı zemini yok) → null: tarayıcının piksel ölçümü
 *     (usePhotoReadability) devreye girer; ölçülemeyen durum PASS sayılmaz.
 *  2) `heroPalette(d, bg)`: her rol için o zeminde WCAG AA'yı (büyük yazıda 3:1, diğerlerinde 4,5:1) sağlayan renk.
 *     Uzmanın seçtiği renk yeterliyse AYNEN korunur; yetersizse tonu korunarak açılır / koyulaştırılır (ensureContrast).
 * Model renkler, ilgili katmanın metin bölgesindeki EN KÖTÜ (açık yazı için en açık, koyu yazı için en koyu) noktasıdır;
 * tarayıcı ölçümü scripts/workspace/ui-kdo.harness.ts (bölüm K) ile doğrulanır.
 */
import { AA, AA_LARGE, contrastRatio, heroBackground, isLargeLine, resolvedLineColor } from "./contrast";
import { ensureContrast } from "./palette";
import type { TextLine, WorkspaceDesign } from "./schema";
import type { EffectiveViewMode } from "./viewMode";

/** Gece modunda kişiselleştirilmemiş zeminlerin model renkleri (personal.module.css GECE MODU ile aynı katmanlar). */
export const NIGHT_BG = {
  /** A (ve varsayılan): #1f1a33 → #2b2443 + sol üst mor ışıma (%20 #8b5cf6) — en açık nokta. */
  band: "#352759",
  /** C kâğıt plaketi gece: #241d3c → #191428 + iç ışık. */
  plaque: "#2a2240",
  /** B ofis camı gece: %86 rgb(24 20 40) cam, altında karartılmış manzara. */
  office: "#3a3649",
} as const;

/** Tasarım varsayılan (kişiselleştirilmemiş) zeminde mi? (personalRoot.facts → custom=false ile aynı kural.) */
export function isDefaultSurface(d: WorkspaceDesign): boolean {
  const b = d.bg;
  if (b.mode === "photo") return !b.photoAssetId;
  if (b.mode === "theme") return b.theme === "manzara" || (b.theme === "marka" && !d.brand);
  return true;
}

/**
 * Metnin arkasındaki model zemin, etkin moda göre. Gece: kişisel zemini olmayan tasarımlar koyu gece katmanına geçer;
 * uzmanın kendi zemini (tema / fotoğraf / yazı zemini) gece modunda da korunur (P4 kuralı: uzman tasarımı değişmez).
 */
export function heroBackgroundFor(d: WorkspaceDesign, mode: EffectiveViewMode): string | null {
  if (mode === "night" && !d.text.surface && isDefaultSurface(d)) {
    return d.layout === "C" ? NIGHT_BG.plaque : d.layout === "B" ? NIGHT_BG.office : NIGHT_BG.band;
  }
  return heroBackground(d);
}

const isDarkBg = (bg: string) => contrastRatio(bg, "#000000") < 7;

export type HeroPalette = {
  bg: string;
  dark: boolean;
  eyebrow: string;
  title: string;
  /** "Hoş geldiniz, <ad>" adının degrade uçları (büyük kalın yazı → 3:1). */
  name: [string, string];
  date: string;
  sub: string;
  line: (l: TextLine) => string;
};

/** Zeminde AA sağlayan rol renkleri. Seçilen renk yeterliyse korunur. */
export function heroPalette(d: WorkspaceDesign, bg: string): HeroPalette {
  const dark = isDarkBg(bg);
  const role = (r: TextLine["role"], need: number) => ensureContrast(resolvedLineColor(d, { id: "x", role: r, text: "x", size: 16, color: "auto" }, bg), bg, need);
  const keep = (c: string, need: number) => (contrastRatio(c, bg) >= need ? c : ensureContrast(c, bg, need));
  const brandName = d.brand ? [d.brand.accent, d.brand.accent2] : null;
  const nameBase: [string, string] = brandName ? [brandName[0], brandName[1]] : dark ? ["#cbb8ff", "#ecca80"] : ["#7c2ff0", "#9b46f0"];
  return {
    bg,
    dark,
    eyebrow: role("label", AA),
    // Selamlama başlığı ~34–53 px kalın → büyük yazı.
    title: role("title", AA_LARGE),
    name: [keep(nameBase[0], AA_LARGE), keep(nameBase[1], AA_LARGE)],
    date: keep(dark ? "#ffffff" : "#17142b", AA),
    sub: role("body", AA),
    line: (l) => keep(resolvedLineColor(d, l, bg), isLargeLine(l) ? AA_LARGE : AA),
  };
}
