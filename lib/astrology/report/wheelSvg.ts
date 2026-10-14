// Astroloji Aşama 8 — Rapor için natal çark SVG'si (SAF; sunucuda PNG'ye çevrilir).
//
// Geometri ve yerleşim uygulamadaki çarkla AYNIDIR (app/admin/astroloji/_components/NatalWheel.tsx:
// aynı yarıçaplar, Yükselen solda, boylam saat yönü tersine, 7,5° glif itmesi). Fark yalnız etikettedir:
// 2026-10-14: gezegen/burç etiketleri GERÇEK astroloji glifleridir (☉ ☽ … ♈ …). Geist'te bu glifler yok; resvg'ye sembol
// yedek yazı tipleri (Yasam Astro Symbols A/B) yüklenir ve font-family listesine eklenir. Glif ↔ Türkçe ad eşlemesi çark
// altındaki açıklamada (WHEEL_LEGEND) verilir — sembol ve Türkçe karşılık birlikte.
// Yeni hesap YOK: yalnız kayıtlı teknik veri (boylam, ev, açı) çizilir.

import { SIGN_IDS } from "../model/western";
import type { WheelInput } from "./model";

const SIZE = 604;
const C = SIZE / 2;
const R_OUT = 272;
const R_SIGN_IN = 238;
const R_GLYPH = 212;
const R_DEG = 190;
const R_HOUSE_NUM = 136;
const R_ASPECT = 122;
/** Açı etiketlerine (ASC/MC) yer: tuval her yönde genişletilir. */
const PAD = 26;
/** Çift halkada (Transit / Sinastri) dış halkanın kalınlığı. */
const RING2 = 54;
const OUTER_INK = "#6d28d9";

const ELEMENT_COLOR: Record<string, string> = { fire: "#dc2626", earth: "#15803d", air: "#ca8a04", water: "#2563eb" };
const SIGN_ELEMENT = ["fire", "earth", "air", "water", "fire", "earth", "air", "water", "fire", "earth", "air", "water"];
const NATURE_COLOR: Record<string, string> = { harmonious: "#2563eb", challenging: "#dc2626", neutral: "#64748b" };
const MAJOR = new Set(["conjunction", "opposition", "trine", "square", "sextile"]);

/** Çark etiketleri: gerçek glifler (metin biçimi; görünüm seçicisiz). */
export const WHEEL_BODY_ABBR: Record<string, string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  north_node: "☊",
  south_node: "☋",
  chiron: "⚷",
  lilith: "⚸",
};
export const WHEEL_SIGN_ABBR = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
/** Çark altı açıklama (rapor metninde gösterilir): her glif Türkçe karşılığıyla. */
export const WHEEL_LEGEND =
  "Semboller: ☉ Güneş · ☽ Ay · ☿ Merkür · ♀ Venüs · ♂ Mars · ♃ Jüpiter · ♄ Satürn · ♅ Uranüs · ♆ Neptün · ♇ Plüton · ☊ Kuzey Ay Düğümü · ☋ Güney Ay Düğümü · ⚷ Kiron · ⚸ Kara Ay Lilith · ℞ retro. Burçlar: ♈ Koç · ♉ Boğa · ♊ İkizler · ♋ Yengeç · ♌ Aslan · ♍ Başak · ♎ Terazi · ♏ Akrep · ♐ Yay · ♑ Oğlak · ♒ Kova · ♓ Balık. Açı çizgileri: mavi uyumlu, kırmızı zorlayıcı, gri nötr; kesikli çizgi minör açı.";

/** Sembol yedek yazı tipleri dahil font-family listesi (resvg harf bazında yedeğe geçer). */
export const WHEEL_FONT_STACK = "Geist, 'Yasam Astro Symbols A', 'Yasam Astro Symbols B'";

const norm = (deg: number) => ((deg % 360) + 360) % 360;
const f = (n: number) => n.toFixed(2);
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Glif itmesi (uygulamadaki çarkla aynı algoritma): yakın gövdelerin etiketleri en az 7,5° aralıkla dağıtılır. */
function spread(bodies: { id: string; longitude: number }[]): Map<string, number> {
  const sorted = [...bodies].sort((a, b) => a.longitude - b.longitude);
  const disp = new Map(sorted.map((b) => [b.id, b.longitude]));
  const MIN_SEP = 7.5;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    const order = [...sorted].sort((a, b) => norm(disp.get(a.id)!) - norm(disp.get(b.id)!));
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      const b = order[(i + 1) % order.length];
      if (a.id === b.id) continue;
      const la = disp.get(a.id)!;
      const lb = disp.get(b.id)!;
      const gap = norm(lb - la);
      if (gap < MIN_SEP) {
        const push = (MIN_SEP - gap) / 2 + 0.05;
        disp.set(a.id, la - push);
        disp.set(b.id, lb + push);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return disp;
}

export function buildWheelSvg(w: WheelInput, fontFamily = WHEEL_FONT_STACK): string {
  const ascLon = w.angles?.ascendant.longitude ?? 0;
  const outerBodies = w.outer?.bodies?.length ? w.outer.bodies : null;
  const EXTRA = outerBodies ? RING2 : 0;
  const O = C + PAD + EXTRA;
  const pt = (r: number, lon: number) => {
    const a = ((180 + (lon - ascLon)) * Math.PI) / 180;
    return { x: O + r * Math.cos(a), y: O - r * Math.sin(a) };
  };
  const out: string[] = [];
  const W = SIZE + (PAD + EXTRA) * 2;
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" font-family="${esc(fontFamily)}">`);
  out.push(`<rect x="0" y="0" width="${W}" height="${W}" fill="#ffffff"/>`);
  if (outerBodies) out.push(`<circle cx="${O}" cy="${O}" r="${R_OUT + RING2}" fill="#faf5ff" stroke="${OUTER_INK}" stroke-width="1.2"/>`);
  out.push(`<circle cx="${O}" cy="${O}" r="${R_OUT}" fill="#fffdf7" stroke="#334155" stroke-width="1.5"/>`);
  out.push(`<circle cx="${O}" cy="${O}" r="${R_SIGN_IN}" fill="#ffffff" stroke="#334155" stroke-width="1"/>`);
  out.push(`<circle cx="${O}" cy="${O}" r="${R_ASPECT}" fill="#f8fafc" stroke="#94a3b8" stroke-width="0.8"/>`);

  SIGN_IDS.forEach((_, i) => {
    const start = i * 30;
    const p1 = pt(R_SIGN_IN, start);
    const p2 = pt(R_OUT, start);
    const g = pt((R_SIGN_IN + R_OUT) / 2, start + 15);
    out.push(`<line x1="${f(p1.x)}" y1="${f(p1.y)}" x2="${f(p2.x)}" y2="${f(p2.y)}" stroke="#334155" stroke-width="0.8"/>`);
    out.push(`<text x="${f(g.x)}" y="${f(g.y + 5)}" text-anchor="middle" font-size="14" font-weight="700" fill="${ELEMENT_COLOR[SIGN_ELEMENT[i]]}">${esc(WHEEL_SIGN_ABBR[i])}</text>`);
  });
  for (let i = 0; i < 72; i++) {
    const p1 = pt(R_SIGN_IN, i * 5);
    const p2 = pt(R_SIGN_IN - (i % 2 === 0 ? 6 : 3), i * 5);
    out.push(`<line x1="${f(p1.x)}" y1="${f(p1.y)}" x2="${f(p2.x)}" y2="${f(p2.y)}" stroke="#94a3b8" stroke-width="0.6"/>`);
  }

  const angleIds = new Set([1, 4, 7, 10]);
  const houses = [...w.houses].sort((a, b) => a.number - b.number);
  houses.forEach((h, i) => {
    const next = houses[(i + 1) % houses.length];
    const inner = pt(R_ASPECT, h.longitude);
    const outer = pt(angleIds.has(h.number) ? R_OUT + 6 : R_SIGN_IN, h.longitude);
    const mid = pt(R_HOUSE_NUM, h.longitude + norm(next.longitude - h.longitude) / 2);
    const strong = angleIds.has(h.number);
    out.push(`<line x1="${f(inner.x)}" y1="${f(inner.y)}" x2="${f(outer.x)}" y2="${f(outer.y)}" stroke="${strong ? "#0f172a" : "#94a3b8"}" stroke-width="${strong ? 1.6 : 0.7}"/>`);
    out.push(`<text x="${f(mid.x)}" y="${f(mid.y + 3.5)}" text-anchor="middle" font-size="10" fill="#64748b">${h.number}</text>`);
  });

  if (w.angles) {
    for (const a of [
      { lon: w.angles.ascendant.longitude, t: "ASC" },
      { lon: w.angles.ascendant.longitude + 180, t: "DSC" },
      { lon: w.angles.midheaven.longitude, t: "MC" },
      { lon: w.angles.midheaven.longitude + 180, t: "IC" },
    ]) {
      const q = pt(R_OUT + EXTRA + 16, a.lon);
      out.push(`<text x="${f(q.x)}" y="${f(q.y + 3.5)}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">${a.t}</text>`);
    }
  }

  const posById = new Map(w.bodies.map((b) => [b.id, b]));
  for (const a of w.aspects) {
    const pa = posById.get(a.a);
    const pb = posById.get(a.b);
    if (!pa || !pb) continue;
    const p1 = pt(R_ASPECT, pa.longitude);
    const p2 = pt(R_ASPECT, pb.longitude);
    const major = MAJOR.has(a.type);
    out.push(
      `<line x1="${f(p1.x)}" y1="${f(p1.y)}" x2="${f(p2.x)}" y2="${f(p2.y)}" stroke="${NATURE_COLOR[a.nature ?? "neutral"] ?? "#64748b"}" stroke-width="${major ? 1.1 : 0.7}"${major ? "" : ' stroke-dasharray="3 3"'} opacity="0.75"/>`,
    );
  }

  const disp = spread(w.bodies);
  for (const b of w.bodies) {
    const d = disp.get(b.id) ?? b.longitude;
    const t1 = pt(R_SIGN_IN, b.longitude);
    const t2 = pt(R_SIGN_IN - 9, b.longitude);
    const g = pt(R_GLYPH, d);
    const dg = pt(R_DEG, d);
    const dot = pt(R_ASPECT, b.longitude);
    out.push(`<line x1="${f(t1.x)}" y1="${f(t1.y)}" x2="${f(t2.x)}" y2="${f(t2.y)}" stroke="#0f172a" stroke-width="1.2"/>`);
    out.push(`<line x1="${f(t2.x)}" y1="${f(t2.y)}" x2="${f(g.x)}" y2="${f(g.y)}" stroke="#cbd5e1" stroke-width="0.6"/>`);
    out.push(`<circle cx="${f(dot.x)}" cy="${f(dot.y)}" r="1.8" fill="#0f172a"/>`);
    out.push(`<text x="${f(g.x)}" y="${f(g.y + 5)}" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">${esc(WHEEL_BODY_ABBR[b.id] ?? b.id.slice(0, 2))}</text>`);
    out.push(`<text x="${f(dg.x)}" y="${f(dg.y + 3)}" text-anchor="middle" font-size="9" fill="#475569">${Math.floor(b.degreeInSign)}°${b.retrograde ? "℞" : ""}</text>`);
  }
  // Dış halka (Transit gezegenleri / Sinastri 1. kişi): R_OUT dışında, mor; gerçek derece çentiği R_OUT çizgisinde.
  if (outerBodies) {
    const od = spread(outerBodies);
    for (const b of outerBodies) {
      const d = od.get(b.id) ?? b.longitude;
      const t1 = pt(R_OUT, b.longitude);
      const t2 = pt(R_OUT + 7, b.longitude);
      const g = pt(R_OUT + 22, d);
      const dg = pt(R_OUT + 41, d);
      out.push(`<line x1="${f(t1.x)}" y1="${f(t1.y)}" x2="${f(t2.x)}" y2="${f(t2.y)}" stroke="${OUTER_INK}" stroke-width="1.4"/>`);
      out.push(`<text x="${f(g.x)}" y="${f(g.y + 5)}" text-anchor="middle" font-size="13" font-weight="700" fill="${OUTER_INK}">${esc(WHEEL_BODY_ABBR[b.id] ?? b.id.slice(0, 2))}</text>`);
      out.push(`<text x="${f(dg.x)}" y="${f(dg.y + 3)}" text-anchor="middle" font-size="9" fill="${OUTER_INK}">${Math.floor(b.degreeInSign)}°${b.retrograde ? "℞" : ""}</text>`);
    }
  }
  out.push("</svg>");
  return out.join("");
}
