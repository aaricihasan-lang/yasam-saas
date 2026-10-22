// Astroloji raporu — Bhava Bala güç çubukları (22.10.2026; SAF). Ekrandaki Bhava Bala çubuklarının (VedicHaritaPanels) AYNI veri,
// ölçek ve etiket kuralıyla statik SVG karşılığı. Girdi YALNIZ kayıtlı analizin teknik katmanıdır; hesap YOKTUR.

import type { SignId } from "../model/western";
import { SIGN_LABELS } from "../labels/tr";

export type BhavaBalaBarsFigure = {
  type: "bhavaBalaBars";
  /** Toplam rupa ve sağlayıcı sırası (1 = en güçlü). */
  bhavas: { house: number; rashi: SignId; rank: number; rupas: number }[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const svgText = (x: number, y: number, s: string, at: Record<string, string | number>) =>
  `<text x="${fmt(x)}" y="${fmt(y)}" dominant-baseline="central"${Object.entries(at)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join("")}>${esc(s)}</text>`;

/** Ekran ölçeği: çubuk = toplam rupa / en yüksek rupa (sıfır tabanlı); sıra 1 koyu, diğerleri açık amber. */
export function bhavaBalaBarsSvg(fig: BhavaBalaBarsFigure, fontFamily: string): string {
  const bs = [...fig.bhavas].sort((a, b) => a.house - b.house);
  if (bs.length !== 12) throw new Error("Bhava Bala 12 ev değil");
  const W = 1000;
  const rowH = 34;
  const pad = 8;
  const H = pad * 2 + bs.length * rowH;
  const labelW = 230;
  const valueW = 150;
  const x0 = labelW + 12;
  const barW = W - x0 - valueW - 12;
  const barH = 16;
  const max = Math.max(...bs.map((b) => b.rupas), 1);
  const parts: string[] = [`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`];
  bs.forEach((b, i) => {
    const cy = pad + i * rowH + rowH / 2;
    parts.push(svgText(4, cy, `${b.house}. ev · ${SIGN_LABELS[b.rashi] ?? b.rashi}`, { fill: "#0f172a", "font-size": 17, "font-weight": 500 }));
    parts.push(`<rect x="${x0}" y="${fmt(cy - barH / 2)}" width="${barW}" height="${barH}" rx="5" fill="#f1f5f9"/>`);
    const w = (Math.max(0, b.rupas) / max) * barW;
    if (w > 0) parts.push(`<rect x="${x0}" y="${fmt(cy - barH / 2)}" width="${fmt(w)}" height="${barH}" rx="5" fill="${b.rank === 1 ? "#d97706" : "#fcd34d"}" data-bhava-bala="${b.house}"/>`);
    parts.push(svgText(W - 4, cy, `${b.rupas.toFixed(2).replace(".", ",")} rupa · ${b.rank}.`, { fill: "#0f172a", "font-size": 17, "text-anchor": "end" }));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${esc(fontFamily)}">${parts.join("")}</svg>`;
}

export const BHAVA_BALA_LEGEND = "Çubuk = evin toplam gücü (rupa); ölçek en güçlü eve göre. Koyu çubuk 1. sıradaki (en güçlü) evdir; satır sonundaki sayı sağlayıcı sırasıdır (1 = en güçlü).";
