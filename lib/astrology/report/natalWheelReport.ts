// Astroloji G3 — NATAL RAPOR ÇARKI (Word / PDF; SAF SVG dizesi, sunucuda PNG'ye çevrilir). Yalnız Batı Natal raporu kullanır
// (WheelInput.natal verildiğinde; bkz. chartPng). Ortak çizici wheelSvg.ts DEĞİŞMEZ → diğer tekniklerin raporları aynen.
//
// Onaylı tasarım G1-R4-S2 (A4 baskı profili) + G2 ekran kuralları:
//   • Geometri ürünle aynı: R_OUT 272 · R_SIGN_IN 238 · ev numarası 136 · açı dairesi 122; Yükselen solda, boylam saat yönü tersine.
//   • Dört satırlı etiket: gezegen / derece (+℞) / burç / dakika; ev başlangıçları çemberin dışında "derece · burç · dakika";
//     ASC/DSC/MC/IC levhası "burç derece′". Gerçek konum çentiği gerçek boylamda; etiket kendi burç diliminde.
//   • Yoğun küme → burç içinde grup etiketi; her noktanın kesin değeri raporun "Gezegen yerleşimleri" tablosunda.
//   • Saat bilinmiyor: Ay çizilmez (varsayımsal burç diliminde simge yok, grup sayısına girmez); açı çizgisi yok; diğerleri "≈".
// Yerleşim / kesinlik kuralları G2'nin saf modüllerinden (natalLabelLayout, natalPositionView) — ekranla aynı; yeni hesap YOK.
// 170 mm genişlikte 1 SVG birimi ≈ 0,67 pt → en küçük zorunlu yazı 11 birim ≈ 7,3 pt.

import { SIGN_IDS, type BodyId, type SignId } from "../model/western";
import { BODY_GLYPHS, BODY_LABELS, formatDegree, SIGN_GLYPHS, SIGN_LABELS } from "../labels/tr";
import { adist, drawnOnWheel, groupBox, layoutLabels, LABEL_GEO, norm, WHEEL } from "../view/natalLabelLayout";
import type { WheelInput } from "./model";

const { SIZE, C, R_OUT, R_SIGN_IN, RULER_W, R_HOUSE_NUM, R_ASPECT } = WHEEL;
const G = LABEL_GEO.report;
const PAD = G.pad;
const VB = SIZE + 2 * PAD;
/** Rapor çarkı görünüm kutusu (170 mm'de 1 birim ≈ 0,67 pt). */
export const NATAL_REPORT_VIEWBOX = VB;

const ELEMENT_COLOR: Record<string, string> = { fire: "#dc2626", earth: "#15803d", air: "#ca8a04", water: "#2563eb" };
const SIGN_ELEMENT = ["fire", "earth", "air", "water", "fire", "earth", "air", "water", "fire", "earth", "air", "water"];
const NATURE_COLOR: Record<string, string> = { harmonious: "#2563eb", challenging: "#dc2626", neutral: "#64748b" };
const MAJOR = new Set(["conjunction", "opposition", "trine", "square", "sextile"]);
const RETRO_INK = "#be123c";
const POINT_INK = "#0f766e";
const WARN_INK = "#7a4f05";
const HALO = 'stroke="#ffffff" stroke-width="3" stroke-linejoin="round" paint-order="stroke"';

const noVs = (x: string) => x.replace(/[︎️]/g, "");
const signGlyph = (s: SignId) => noVs(SIGN_GLYPHS[s]);
const signColor = (s: SignId) => ELEMENT_COLOR[SIGN_ELEMENT[SIGN_IDS.indexOf(s)]];
const f = (n: number) => n.toFixed(2);
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Ortalanmış metin (resvg için temel çizgi kaydırmalı; dominant-baseline kullanılmaz). */
const text = (x: number, y: number, size: number, body: string, attrs = "") =>
  `<text x="${f(x)}" y="${f(y + size * 0.35)}" text-anchor="middle" font-size="${size}"${attrs ? ` ${attrs}` : ""}>${body}</text>`;

type NatalWheel = WheelInput & { natal: NonNullable<WheelInput["natal"]> };
type Entry = { kind: "body" | "point"; key: string; id: string; glyph: string; name: string; lon: number; sign: SignId; deg: number; retro: boolean };

/** Rapor çarkının etiket düzeni (G2 ekranıyla aynı kural; rapor profili). */
export function natalReportLayout(w: NatalWheel) {
  const tu = w.natal.timeUnknown;
  const entries: Entry[] = [
    ...w.bodies
      .filter((b) => drawnOnWheel(tu, b.id))
      .map((b) => ({ kind: "body" as const, key: b.id, id: b.id, glyph: noVs(BODY_GLYPHS[b.id as BodyId] ?? b.id.slice(0, 2)), name: BODY_LABELS[b.id as BodyId] ?? b.id, lon: b.longitude, sign: b.sign, deg: b.degreeInSign, retro: b.retrograde })),
    ...(tu ? [] : w.natal.points).map((p) => ({ kind: "point" as const, key: `x:${p.id}`, id: p.id, glyph: p.glyph, name: p.label, lon: p.longitude, sign: p.sign, deg: p.degreeInSign, retro: false })),
  ];
  const lay = layoutLabels(
    entries.map((e) => ({ id: e.key, lon: e.lon })),
    { detailed: true, profile: "report", K: 1, assumed: tu },
  );
  return { entries, ...lay };
}

export function buildNatalReportSvg(w: NatalWheel, fontFamily: string): string {
  const tu = w.natal.timeUnknown;
  const ascLon = w.angles?.ascendant.longitude ?? 0;
  const pt = (r: number, lon: number) => {
    const a = ((180 + (lon - ascLon)) * Math.PI) / 180;
    return { x: PAD + C + r * Math.cos(a), y: PAD + C - r * Math.sin(a) };
  };
  const { entries, groups, disp } = natalReportLayout(w);
  const grouped = new Set(groups.flatMap((g) => g.ids));
  const o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${VB}" height="${VB}" font-family="${esc(fontFamily)}">`);
  o.push(`<rect x="0" y="0" width="${VB}" height="${VB}" fill="#ffffff"/>`);
  o.push(`<circle cx="${f(PAD + C)}" cy="${f(PAD + C)}" r="${R_OUT}" fill="#ffffff" stroke="#334155" stroke-width="1.5"/>`);
  o.push(`<circle cx="${f(PAD + C)}" cy="${f(PAD + C)}" r="${R_SIGN_IN}" fill="#ffffff" stroke="#334155" stroke-width="1"/>`);
  o.push(`<circle cx="${f(PAD + C)}" cy="${f(PAD + C)}" r="${R_ASPECT}" fill="#f8fafc" stroke="#94a3b8" stroke-width="0.8"/>`);

  // Burç halkası: kalın sınırlar + element renkli burç sembolü
  SIGN_IDS.forEach((s, i) => {
    const st = i * 30;
    const a = pt(R_SIGN_IN, st);
    const b = pt(R_OUT, st);
    const g = pt((R_SIGN_IN + R_OUT) / 2, st + 15);
    o.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="#334155" stroke-width="1.1"/>`);
    o.push(text(g.x, g.y, 18, signGlyph(s), `fill="${signColor(s)}"`));
  });
  // Derece cetveli (baskı): her 5° kısa, 10° uzun
  for (let l = 0; l < 360; l += 5) {
    if (l % 30 === 0) continue;
    const a = pt(R_SIGN_IN, l);
    const b = pt(R_SIGN_IN - (l % 10 === 0 ? 7 : 4), l);
    o.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="#94a3b8" stroke-width="0.6"/>`);
  }

  // Evler + gerçek eksenler (saat bilinmiyorsa teknik veride yok → çizilmez)
  const A = w.angles;
  const houses = [...w.houses].sort((a, b) => a.number - b.number);
  const angleOf = (n: number): number | null =>
    !A ? null : n === 1 ? A.ascendant.longitude : n === 7 ? A.ascendant.longitude + 180 : n === 10 ? A.midheaven.longitude : n === 4 ? A.midheaven.longitude + 180 : null;
  const axisCusp = (n: number, lon: number) => {
    const a = angleOf(n);
    return a !== null && adist(lon, a) < 0.02;
  };
  houses.forEach((h, i) => {
    const next = houses[(i + 1) % houses.length];
    const axis = axisCusp(h.number, h.longitude);
    const a = pt(R_ASPECT, h.longitude);
    const b = pt(axis ? R_OUT + 6 : R_SIGN_IN, h.longitude);
    const mid = pt(R_HOUSE_NUM, h.longitude + norm(next.longitude - h.longitude) / 2);
    o.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${axis ? "#0f172a" : "#94a3b8"}" stroke-width="${axis ? 1.6 : 0.7}"/>`);
    o.push(text(mid.x, mid.y, 11, String(h.number), `fill="#475569" ${HALO}`));
  });
  if (A)
    for (const n of [1, 4, 7, 10]) {
      const lon = angleOf(n)!;
      const h = houses.find((x) => x.number === n);
      if (h && adist(h.longitude, lon) < 0.02) continue;
      const a = pt(R_ASPECT, lon);
      const b = pt(R_OUT + 6, lon);
      o.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="#0f172a" stroke-width="1.6"/>`);
    }
  // Ev başlangıçları: çemberin dışında derece · burç · dakika (eksen levhasına yakınsa daha dışarıda)
  if (A) {
    const angleLons = [A.ascendant.longitude, A.midheaven.longitude, A.ascendant.longitude + 180, A.midheaven.longitude + 180];
    const placed: { lon: number; r: number }[] = [];
    for (const h of [...houses].sort((a, b) => a.longitude - b.longitude)) {
      if (axisCusp(h.number, h.longitude)) continue;
      const nearPlate = angleLons.some((x) => adist(h.longitude, x) < 9);
      const nearPrev = placed.some((p) => adist(h.longitude, p.lon) < 9 && p.r === R_OUT + 15);
      const r = nearPlate ? R_OUT + 68 : nearPrev ? R_OUT + 37 : R_OUT + 15;
      placed.push({ lon: h.longitude, r });
      const t1 = pt(R_OUT, h.longitude);
      const t2 = pt(r - 8, h.longitude);
      const q = pt(r, h.longitude);
      const [dg, mn] = formatDegree(h.degreeInSign).split("°");
      o.push(`<line x1="${f(t1.x)}" y1="${f(t1.y)}" x2="${f(t2.x)}" y2="${f(t2.y)}" stroke="#94a3b8" stroke-width="0.8"/>`);
      o.push(text(q.x, q.y, G.f.cusp, `${dg}°<tspan fill="${signColor(h.sign)}" font-size="${G.f.cuspSign}">${signGlyph(h.sign)}</tspan>${mn}`, `fill="#334155" ${HALO}`));
    }
    for (const a of [
      { lon: A.ascendant.longitude, t: "ASC" },
      { lon: A.ascendant.longitude + 180, t: "DSC" },
      { lon: A.midheaven.longitude, t: "MC" },
      { lon: A.midheaven.longitude + 180, t: "IC" },
    ]) {
      const q = pt(R_OUT + 20, a.lon);
      const l = norm(a.lon);
      const s = SIGN_IDS[Math.floor(l / 30) % 12];
      const pw = 60;
      const ph = 32;
      o.push(`<rect x="${f(q.x - pw / 2)}" y="${f(q.y - ph / 2)}" width="${pw}" height="${ph}" rx="5" fill="#ffffff" stroke="#334155" stroke-width="0.8"/>`);
      o.push(text(q.x, q.y - ph / 4.6, G.f.plateT, a.t, 'font-weight="700" fill="#0f172a"'));
      o.push(text(q.x, q.y + ph / 4.3, G.f.plateV, `<tspan fill="${signColor(s)}" font-size="${G.f.plateV + 1}">${signGlyph(s)}</tspan> ${formatDegree(l % 30)}`, 'fill="#334155"'));
    }
  }

  // Açı çizgileri — saat bilinmiyorsa ÇİZİLMEZ (12:00 varsayımı kesin sonuç değildir)
  if (!tu) {
    const pos = new Map(w.bodies.map((b) => [b.id, b]));
    for (const a of w.aspects) {
      const pa = pos.get(a.a);
      const pb = pos.get(a.b);
      if (!pa || !pb) continue;
      const p1 = pt(R_ASPECT, pa.longitude);
      const p2 = pt(R_ASPECT, pb.longitude);
      const major = MAJOR.has(a.type);
      o.push(`<line x1="${f(p1.x)}" y1="${f(p1.y)}" x2="${f(p2.x)}" y2="${f(p2.y)}" stroke="${NATURE_COLOR[a.nature ?? "neutral"] ?? "#64748b"}" stroke-width="${major ? 1.2 : 0.7}"${major ? "" : ' stroke-dasharray="3 3"'} opacity="0.8"/>`);
    }
    for (const e of entries.filter((x) => x.kind === "body")) {
      const d = pt(R_ASPECT, e.lon);
      o.push(`<circle cx="${f(d.x)}" cy="${f(d.y)}" r="1.8" fill="#0f172a"/>`);
    }
  }

  // Gruptakilerin gerçek konum çentiği; tekillerin çentiği + bağlantısı; etiketler
  const tickEnd = R_SIGN_IN - RULER_W - 2;
  for (const e of entries.filter((x) => grouped.has(x.key))) {
    const t1 = pt(R_SIGN_IN, e.lon);
    const t2 = pt(R_SIGN_IN - RULER_W - 6, e.lon);
    o.push(`<line x1="${f(t1.x)}" y1="${f(t1.y)}" x2="${f(t2.x)}" y2="${f(t2.y)}" stroke="${e.kind === "point" ? POINT_INK : "#0f172a"}" stroke-width="2.2"/>`);
  }
  const labels: string[] = [];
  for (const gr of groups) {
    const box = groupBox(gr.ids.length, "report", 1);
    const c = pt(box.r, gr.mid);
    const ent = gr.ids.map((k) => entries.find((e) => e.key === k)!);
    labels.push(`<rect x="${f(c.x - box.w / 2)}" y="${f(c.y - box.h / 2)}" width="${f(box.w)}" height="${f(box.h)}" rx="10" fill="#ffffff" stroke="${signColor(gr.sign)}" stroke-width="1.6"/>`);
    labels.push(text(c.x, c.y - box.h * 0.23, 12, `<tspan fill="${signColor(gr.sign)}" font-size="13">${signGlyph(gr.sign)}</tspan> ${gr.ids.length} nokta`, 'font-weight="700" fill="#0f172a"'));
    labels.push(text(c.x, c.y + box.h * 0.23, 13, esc(ent.map((e) => e.glyph).join(" ")), 'fill="#0f172a"'));
  }
  for (const e of entries.filter((x) => !grouped.has(x.key))) {
    const d = disp.get(e.key) ?? e.lon;
    const t1 = pt(R_SIGN_IN, e.lon);
    const k2 = pt(tickEnd, e.lon);
    const ink = e.kind === "point" ? POINT_INK : "#0f172a";
    const g = pt(G.tier.g, d);
    const vx = g.x - k2.x;
    const vy = g.y - k2.y;
    const L = Math.hypot(vx, vy) || 1;
    const gap = Math.min(11, L * 0.6);
    o.push(`<line x1="${f(t1.x)}" y1="${f(t1.y)}" x2="${f(k2.x)}" y2="${f(k2.y)}" stroke="${ink}" stroke-width="1.8"/>`);
    o.push(`<line x1="${f(k2.x)}" y1="${f(k2.y)}" x2="${f(g.x - (vx / L) * gap)}" y2="${f(g.y - (vy / L) * gap)}" stroke="#94a3b8" stroke-width="0.8"/>`);
    const [dg, mn] = formatDegree(e.deg).split("°");
    const d1 = pt(G.tier.d, d);
    const s1 = pt(G.tier.s, d);
    const m1 = pt(G.tier.m, d);
    const gsize = e.id === "vertex" ? G.f.v : G.f.g;
    labels.push(text(g.x, g.y, gsize, esc(e.glyph), `fill="${ink}"${e.id === "vertex" ? ' font-weight="700" font-style="italic"' : ""} ${HALO}`));
    labels.push(text(d1.x, d1.y, G.f.d, `${tu ? "≈" : ""}${dg}°${e.retro ? `<tspan fill="${RETRO_INK}">℞</tspan>` : ""}`, `font-weight="600" fill="${e.kind === "point" ? POINT_INK : "#1e293b"}" ${HALO}`));
    labels.push(text(s1.x, s1.y, G.f.s, signGlyph(e.sign), `fill="${signColor(e.sign)}" ${HALO}`));
    labels.push(text(m1.x, m1.y, G.f.m, mn, `fill="#475569" ${HALO}`));
  }
  o.push(...labels);
  if (tu) {
    o.push(text(PAD + C, PAD + C - 8, 13, "Saat bilinmiyor", `font-weight="600" fill="${WARN_INK}"`));
    o.push(text(PAD + C, PAD + C + 10, 11, "Ay çizilmedi · açı çizgisi yok", `fill="${WARN_INK}"`));
  }
  o.push("</svg>");
  return o.join("");
}

// ─── G3 (2026-11-23, Owner Karar 2): YOĞUN BURÇ DERECE CETVELİ (Natal'a özel ayrı figür) ───────────────────────────────
// Çarkta grup etiketiyle birleştirilen her burç için 0°–30° doğrusal ölçek: her nokta burç içindeki GERÇEK derecesinde
// (kayıtlı boylam; eşit aralık / yaklaşık yerleşim YOK). Yakın noktalar cetvelin üstünde ve altında ayrı etiket şeritlerinde
// okunur; kısa dikey çizgi gerçek dereceyi gösterir. Noktalar çarktaki gruplardan AYNEN alınır (grup sayısı = cetvel sayısı;
// saat bilinmiyorsa Ay gruplara hiç girmez). Word 166,4 mm'de 1 birim ≈ 0,62 pt → en küçük yazı 13 birim ≈ 8,1 pt.

/** Cetvel görselinin genişliği (SVG birimi). */
export const NATAL_RULER_VIEWBOX_W = 760;
/** Tek figürde en çok burç şeridi (Word'de bölünmez figür bloğu tek sayfaya sığsın). */
export const NATAL_RULER_SIGNS_PER_FIGURE = 3;

export type NatalRulerPoint = { key: string; kind: "body" | "point"; glyph: string; name: string; lon: number; sign: SignId; deg: number; retro: boolean };
export type NatalDegreeRulerFigure = {
  type: "natalDegreeRuler";
  timeUnknown: boolean;
  /** Burç sırasıyla; her burçta noktalar dereceye göre. */
  signs: { sign: SignId; points: NatalRulerPoint[] }[];
};

/** Çarktaki yoğun gruplar → cetvel figürleri (grup yoksa boş dizi: cetvel / boş bölüm oluşmaz). */
export function natalDegreeRulerFigures(w: NatalWheel): NatalDegreeRulerFigure[] {
  const { entries, groups } = natalReportLayout(w);
  const signs = [...groups]
    .sort((a, b) => SIGN_IDS.indexOf(a.sign) - SIGN_IDS.indexOf(b.sign))
    .map((g) => ({
      sign: g.sign,
      points: g.ids
        .map((k) => entries.find((e) => e.key === k)!)
        .map((e) => ({ key: e.key, kind: e.kind, glyph: e.glyph, name: e.name, lon: e.lon, sign: e.sign, deg: e.deg, retro: e.retro }))
        .sort((a, b) => a.deg - b.deg || a.key.localeCompare(b.key)),
    }));
  const out: NatalDegreeRulerFigure[] = [];
  for (let i = 0; i < signs.length; i += NATAL_RULER_SIGNS_PER_FIGURE) out.push({ type: "natalDegreeRuler", timeUnknown: w.natal.timeUnknown, signs: signs.slice(i, i + NATAL_RULER_SIGNS_PER_FIGURE) });
  return out;
}

const RX0 = 44;
const RX1 = NATAL_RULER_VIEWBOX_W - 44;
const RULER_FONT = { title: 15, name: 14, deg: 14, num: 13 } as const;
const LANE_H = 34;
const LANE_GAP = 6;
const HEAD_H = 28;
const ABOVE_GAP = 24;
const BELOW_GAP = 28;
/** Burç içi derece → cetvel x (doğrusal; 0° sol, 30° sağ). */
export const rulerX = (deg: number) => RX0 + (Math.min(30, Math.max(0, deg)) / 30) * (RX1 - RX0);
/** Yaklaşık metin genişliği (Geist + sembol yazı tipi; yerleşim payı için). */
const estW = (s: string, size: number) => [...s].reduce((n, ch) => n + (ch.codePointAt(0)! >= 0x2000 ? 1.0 : ch === " " ? 0.3 : 0.6) * size, 0);

export type NatalRulerLabel = { p: NatalRulerPoint; lane: number; above: boolean; w: number; cx: number };

/** Şerit yerleşimi: dereceye göre sıralı noktalar sırayla üst / alt şeritlere; her şeritte etiketler çakışmadan itilir. */
export function natalRulerLayout(points: NatalRulerPoint[], timeUnknown: boolean) {
  const lo = 6;
  const hi = NATAL_RULER_VIEWBOX_W - 6;
  const width = (p: NatalRulerPoint) => Math.max(estW(`${p.glyph} ${p.name}`, RULER_FONT.name), estW(`${timeUnknown ? "≈" : ""}${formatDegree(p.deg)}${p.retro ? " ℞" : ""}`, RULER_FONT.deg)) + 12;
  let lanes = 2;
  for (;;) {
    const fits = Array.from({ length: lanes }, (_, l) => points.filter((_, i) => i % lanes === l).reduce((n, p) => n + width(p) + 8, 0) <= hi - lo).every(Boolean);
    if (fits || lanes >= 8) break;
    lanes += 2;
  }
  const labels: NatalRulerLabel[] = points.map((p, i) => ({ p, lane: Math.floor((i % lanes) / 2), above: i % 2 === 0, w: width(p), cx: rulerX(p.deg) }));
  for (let l = 0; l < lanes; l++) {
    const row = labels.filter((_, i) => i % lanes === l);
    for (const r of row) r.cx = Math.min(hi - r.w / 2, Math.max(lo + r.w / 2, r.cx));
    for (let i = 1; i < row.length; i++) row[i].cx = Math.max(row[i].cx, row[i - 1].cx + (row[i - 1].w + row[i].w) / 2 + 8);
    if (row.length) row[row.length - 1].cx = Math.min(row[row.length - 1].cx, hi - row[row.length - 1].w / 2);
    for (let i = row.length - 2; i >= 0; i--) row[i].cx = Math.min(row[i].cx, row[i + 1].cx - (row[i].w + row[i + 1].w) / 2 - 8);
  }
  const above = Math.ceil(lanes / 2);
  const below = Math.floor(lanes / 2);
  const height = HEAD_H + above * (LANE_H + LANE_GAP) + ABOVE_GAP + BELOW_GAP + below * (LANE_H + LANE_GAP) + 12;
  return { lanes, labels, above, below, height, lo, hi };
}

export function natalDegreeRulerSvg(fig: NatalDegreeRulerFigure, fontFamily: string): string {
  const tu = fig.timeUnknown;
  const strips = fig.signs.map((s) => ({ s, lay: natalRulerLayout(s.points, tu) }));
  const H = strips.reduce((n, x) => n + x.lay.height, 0) + 8;
  const W = NATAL_RULER_VIEWBOX_W;
  const o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${f(H)}" width="${W}" height="${f(H)}" font-family="${esc(fontFamily)}">`);
  o.push(`<rect x="0" y="0" width="${W}" height="${f(H)}" fill="#ffffff"/>`);
  let y0 = 4;
  strips.forEach(({ s, lay }, si) => {
    const col = signColor(s.sign);
    if (si > 0) o.push(`<line x1="8" y1="${f(y0)}" x2="${W - 8}" y2="${f(y0)}" stroke="#cbd5e1" stroke-width="1"/>`);
    // Başlık: burç sembolü + adı + nokta sayısı (çarktaki grup etiketiyle aynı sayı)
    o.push(
      `<text x="${RX0 - 30}" y="${f(y0 + 19)}" font-size="${RULER_FONT.title}" font-weight="700" fill="#0f172a"><tspan fill="${col}" font-size="${RULER_FONT.title + 2}">${signGlyph(s.sign)}</tspan> ${esc(SIGN_LABELS[s.sign])} · ${s.points.length} nokta · burç içi 0°–30°${tu ? " · ≈ 12:00 varsayımı (Ay hariç)" : ""}</text>`,
    );
    const axisY = y0 + HEAD_H + lay.above * (LANE_H + LANE_GAP) + ABOVE_GAP;
    // Ölçek: 1° kısa, 5° orta, 10° uzun çentik; 0–30 her 5° numaralı
    o.push(`<line x1="${RX0}" y1="${f(axisY)}" x2="${RX1}" y2="${f(axisY)}" stroke="${col}" stroke-width="2"/>`);
    const nums: string[] = [];
    for (let d = 0; d <= 30; d++) {
      const x = rulerX(d);
      const h = d % 10 === 0 ? 9 : d % 5 === 0 ? 6 : 3;
      o.push(`<line x1="${f(x)}" y1="${f(axisY - h)}" x2="${f(x)}" y2="${f(axisY + h)}" stroke="#475569" stroke-width="${d % 10 === 0 ? 1.4 : 0.8}"/>`);
      // Numaralar bağlantı çizgilerinden SONRA (beyaz hale ile üstte) çizilir — okunurluk.
      if (d % 5 === 0) nums.push(text(x, axisY + 19, RULER_FONT.num, `${d}°`, `fill="#475569" ${HALO}`));
    }
    for (const L of lay.labels) {
      const ink = L.p.kind === "point" ? POINT_INK : "#0f172a";
      const mx = rulerX(L.p.deg);
      const boxY = L.above ? axisY - ABOVE_GAP - (L.lane + 1) * LANE_H - L.lane * LANE_GAP : axisY + BELOW_GAP + L.lane * (LANE_H + LANE_GAP);
      const edgeY = L.above ? boxY + LANE_H : boxY;
      const tickY = L.above ? axisY - 13 : axisY + 13;
      // Gerçek derece işareti (eksende nokta + şeride doğru kısa çizgi) ve etikete bağlantı
      o.push(`<line x1="${f(mx)}" y1="${f(axisY)}" x2="${f(mx)}" y2="${f(tickY)}" stroke="${ink}" stroke-width="2.2"/>`);
      o.push(`<line x1="${f(mx)}" y1="${f(tickY)}" x2="${f(L.cx)}" y2="${f(edgeY)}" stroke="#94a3b8" stroke-width="0.9"/>`);
      o.push(`<circle cx="${f(mx)}" cy="${f(axisY)}" r="3.4" fill="${ink}" stroke="#ffffff" stroke-width="1" data-deg="${L.p.deg}" data-key="${esc(L.p.key)}"/>`);
      o.push(`<rect x="${f(L.cx - L.w / 2)}" y="${f(boxY)}" width="${f(L.w)}" height="${LANE_H}" rx="5" fill="#ffffff" stroke="${L.p.kind === "point" ? POINT_INK : "#94a3b8"}" stroke-width="0.9"/>`);
      o.push(text(L.cx, boxY + 9.5, RULER_FONT.name, `${esc(L.p.glyph)} ${esc(L.p.name)}`, `fill="${ink}"${L.p.key === "x:vertex" ? ' font-style="italic"' : ""}`));
      o.push(
        text(L.cx, boxY + 25, RULER_FONT.deg, `${tu ? "≈" : ""}${formatDegree(L.p.deg)}${L.p.retro ? ` <tspan fill="${RETRO_INK}">℞</tspan>` : ""}`, `font-weight="600" fill="${L.p.kind === "point" ? POINT_INK : "#1e293b"}"`),
      );
    }
    o.push(...nums);
    y0 += lay.height;
  });
  o.push("</svg>");
  return o.join("");
}
