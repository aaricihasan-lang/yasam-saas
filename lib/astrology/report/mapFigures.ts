// Astroloji raporu — Astrocartography ve Local Space DÜNYA HARİTASI görselleri (SAF SVG; PNG'ye figurePng.ts çevirir).
//
// 2026-10-15 (owner kararı): ekrandaki haritalar Word/PDF'e de girer. YENİ HARİTA MOTORU / SERVİS YOK:
//   • Altlık: ekrandaki WorldMap ile AYNI Natural Earth 1:110m verisi (kamu malı; world-atlas ISC yeniden dağıtımı),
//     AYNI eşdikdörtgen projeksiyon (_lib/geo.ts: x = boylam, y = enlem; 1000×500) ve aynı graticule.
//   • Hatlar: ekrandaki bileşenlerin kullandığı AYNI saf fonksiyonların çıktısı (_lib/locationMaps.ts: acgMapLines,
//     acgMcLabels, localSpaceMapLines, compassPoint) → yol (d), renk ve çizgi tipi ekranla birebir.
//   • Baskı okunabilirliği için yalnız çizgi kalınlığı ve yazı boyutları büyütülür; enlem/boylam eksen etiketleri ve
//     renk/çizgi lejantı eklenir (geometri değişmez).
// Girdi YALNIZ kayıtlı analizin teknik katmanıdır; sağlayıcı çağrısı ve yeni hesap YOKTUR.

import { WORLD_BORDER_LINES, WORLD_LAND_RINGS } from "@/app/admin/astroloji/_lib/worldMap110m";
import { MAP_H, MAP_W, packedToPath, project } from "@/app/admin/astroloji/_lib/geo";
import { ACG_ANGLE_LABEL, ACG_DASH, BODY_COLORS, compassPoint, type MapLabel, type MapLine, type MapMarker } from "@/app/admin/astroloji/_lib/locationMaps";
import { BODY_GLYPHS, BODY_LABELS } from "../labels/tr";
import type { BodyId } from "../model/western";
import type { AcgAngle } from "../model/westernLocation";

export type AcgMapFigure = {
  type: "acgMap";
  lines: MapLine[];
  labels: MapLabel[];
  markers: MapMarker[];
  /** Lejant: çizilen gök cisimleri ve açı türleri (çizilenle birebir). */
  bodies: BodyId[];
  angles: AcgAngle[];
  sampling: { latitudeMin: number; latitudeMax: number };
};
export type LocalSpaceMapFigure = {
  type: "localSpaceMap";
  lines: MapLine[];
  reference: MapMarker;
  compass: { id: BodyId; azimuth: number; aboveHorizon: boolean }[];
};

/** Baskı ölçeği: ekranda 1000 birimlik harita ~17 cm'e iner → çizgi/yazı büyütülür (geometri aynı). */
const PRINT = { line: 1.6, label: 13, marker: 14 } as const;

// Görünüm seçicisi (U+FE0E/F) yazı tipinde glif değildir → atılır (KP haritası ve rapor metin akışıyla aynı kural).
const VS = new RegExp(`[${String.fromCharCode(0xfe0e)}${String.fromCharCode(0xfe0f)}]`, "g");
const esc = (s: string) => s.replace(VS, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f2 = (n: number) => String(Math.round(n * 100) / 100);
const scaleDash = (d: string | undefined) => (d ? d.split(/\s+/).map((x) => f2(Number(x) * PRINT.line)).join(" ") : undefined);
const text = (x: number, y: number, s: string, at: Record<string, string | number>) =>
  `<text x="${f2(x)}" y="${f2(y)}"${Object.entries(at)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join("")}>${esc(s)}</text>`;

let baseCache: { land: string[]; borders: string[] } | null = null;
function base() {
  if (!baseCache) baseCache = { land: WORLD_LAND_RINGS.map((r) => packedToPath(r, true)), borders: WORLD_BORDER_LINES.map((r) => packedToPath(r, false)) };
  return baseCache;
}

/** Ekrandaki WorldMap'in statik karşılığı (altlık + graticule + hatlar + etiketler + işaretler) + eksen etiketleri. */
function worldMapGroup(lines: MapLine[], labels: MapLabel[], markers: MapMarker[]): string {
  const p: string[] = [];
  p.push(`<rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" fill="#eff6ff"/>`);
  const grat: string[] = [];
  for (let lon = -150; lon <= 150; lon += 30) grat.push(`M${project(0, lon)[0]},0L${project(0, lon)[0]},${MAP_H}`);
  for (let lat = -60; lat <= 60; lat += 30) grat.push(`M0,${project(lat, 0)[1]}L${MAP_W},${project(lat, 0)[1]}`);
  p.push(`<path d="${grat.join("")}" stroke="#cbd5e1" stroke-width="0.6" fill="none"/>`);
  const b = base();
  for (const d of b.land) p.push(`<path d="${d}" fill="#f8fafc" stroke="#94a3b8" stroke-width="0.5"/>`);
  for (const d of b.borders) p.push(`<path d="${d}" fill="none" stroke="#cbd5e1" stroke-width="0.4"/>`);
  for (const l of lines) {
    const dash = scaleDash(l.dash);
    p.push(`<path d="${l.d}" fill="none" stroke="${l.color}" stroke-width="${f2((l.width ?? 1.4) * PRINT.line)}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-opacity="0.95" data-map-line="${esc(l.key)}"/>`);
  }
  // Üst kenar etiketleri (MC): ekrandaki konum; birbirine çok yakın olanlar alt satıra kaydırılır (okunabilirlik).
  const sorted = [...labels].sort((a, c) => a.x - c.x);
  const rowLastX: number[] = [];
  for (const t of sorted) {
    let row = 0;
    while (rowLastX[row] !== undefined && t.x - rowLastX[row] < 34) row++;
    rowLastX[row] = t.x;
    p.push(text(t.x, t.y + 2 + row * (PRINT.label + 2), t.text, { "font-size": PRINT.label, "font-weight": 700, fill: t.color, "text-anchor": "middle", "paint-order": "stroke", stroke: "#ffffff", "stroke-width": 3, "data-map-label": t.key }));
  }
  for (const m of markers) {
    const [x, y] = project(m.lat, m.lon);
    p.push(`<circle cx="${x}" cy="${y}" r="5.5" fill="${m.color ?? "#0f172a"}" stroke="#ffffff" stroke-width="2" data-map-marker="${esc(m.key)}"/>`);
    const right = x < MAP_W - 180;
    p.push(text(right ? x + 8 : x - 8, y - 8, m.label, { "font-size": PRINT.marker, "font-weight": 700, fill: "#0f172a", "text-anchor": right ? "start" : "end", "paint-order": "stroke", stroke: "#ffffff", "stroke-width": 3.5 }));
  }
  // Eksen etiketleri (coğrafi kapsam okunur): boylam alt kenarda, enlem sol kenarda.
  for (let lon = -150; lon <= 150; lon += 30) p.push(text(project(0, lon)[0], MAP_H - 5, `${Math.abs(lon)}°${lon === 0 ? "" : lon > 0 ? "D" : "B"}`, { "font-size": 10, fill: "#64748b", "text-anchor": "middle" }));
  for (let lat = -60; lat <= 60; lat += 30) p.push(text(4, project(lat, 0)[1] - 3, `${Math.abs(lat)}°${lat === 0 ? "" : lat > 0 ? "K" : "G"}`, { "font-size": 10, fill: "#64748b" }));
  p.push(`<rect x="0.5" y="0.5" width="${MAP_W - 1}" height="${MAP_H - 1}" fill="none" stroke="#94a3b8" stroke-width="1"/>`);
  return p.join("");
}

/** Gök cismi lejantı (renk + glif + ad), satır başına `perRow`. Döner: [svg, yükseklik]. */
function bodyLegend(ids: BodyId[], y0: number, perRow = 5): [string, number] {
  const colW = MAP_W / perRow;
  const rowH = 24;
  const p: string[] = [];
  ids.forEach((id, i) => {
    const x = (i % perRow) * colW + 8;
    const y = y0 + Math.floor(i / perRow) * rowH + 12;
    p.push(`<line x1="${x}" y1="${y}" x2="${x + 26}" y2="${y}" stroke="${BODY_COLORS[id]}" stroke-width="${PRINT.line * 1.5}"/>`);
    p.push(text(x + 32, y, `${BODY_GLYPHS[id]} ${BODY_LABELS[id]}`, { "font-size": 14, fill: "#0f172a", "dominant-baseline": "central", "data-legend-body": id }));
  });
  return [p.join(""), Math.ceil(ids.length / perRow) * rowH];
}

export function acgMapSvg(fig: AcgMapFigure, fontFamily: string): string {
  if (!fig.lines.length) throw new Error("Astrocartography: çizilecek hat yok");
  const p: string[] = [`<rect x="0" y="0" width="${MAP_W}" height="2000" fill="#ffffff"/>`, worldMapGroup(fig.lines, fig.labels, fig.markers)];
  let y = MAP_H + 10;
  const [bl, bh] = bodyLegend(fig.bodies, y);
  p.push(bl);
  y += bh + 6;
  // Açı türleri: çizgi tipi örnekleri (ekrandaki ACG_DASH ile aynı).
  const colW = MAP_W / 4;
  fig.angles.forEach((a, i) => {
    const x = i * colW + 8;
    const dash = scaleDash(ACG_DASH[a]);
    p.push(`<line x1="${x}" y1="${y + 12}" x2="${x + 40}" y2="${y + 12}" stroke="#334155" stroke-width="${PRINT.line * 1.5}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
    p.push(text(x + 48, y + 12, `${ACG_ANGLE_LABEL[a]} hattı`, { "font-size": 14, fill: "#0f172a", "dominant-baseline": "central", "data-legend-angle": a }));
  });
  y += 30;
  const H = Math.ceil(y + 4);
  p[0] = `<rect x="0" y="0" width="${MAP_W}" height="${H}" fill="#ffffff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${H}" width="${MAP_W}" height="${H}" font-family="${esc(fontFamily)}">${p.join("")}</svg>`;
}

export function localSpaceMapSvg(fig: LocalSpaceMapFigure, fontFamily: string): string {
  if (!fig.lines.length) throw new Error("Local space: çizilecek hat yok");
  const p: string[] = ["", worldMapGroup(fig.lines, [], [fig.reference])];
  // Alt bölüm: pusula (ekrandaki LocalSpace pusulasıyla aynı yerleşim kuralı) + lejant.
  const top = MAP_H + 14;
  const C = 170;
  const R = 140;
  const cx = C + 10;
  const cy = top + C;
  p.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.2"/>`);
  for (const az of [0, 90, 180, 270]) {
    const [x, y] = compassPoint(cx, cy, R + 17, az);
    p.push(text(x, y, az === 0 ? "K" : az === 90 ? "D" : az === 180 ? "G" : "B", { "font-size": 16, "font-weight": 700, fill: "#0f172a", "text-anchor": "middle", "dominant-baseline": "central", "data-compass": String(az) }));
  }
  for (const b of fig.compass) {
    const [x, y] = compassPoint(cx, cy, R, b.azimuth);
    const [lx, ly] = compassPoint(cx, cy, R - 16, b.azimuth);
    p.push(`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${BODY_COLORS[b.id]}" stroke-width="${PRINT.line * 1.5}"${b.aboveHorizon ? "" : ` stroke-dasharray="${scaleDash("4 3")}"`} data-ls-body="${b.id}"/>`);
    p.push(text(lx, ly, BODY_GLYPHS[b.id], { "font-size": 16, fill: BODY_COLORS[b.id], "text-anchor": "middle", "dominant-baseline": "central" }));
  }
  p.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="#0f172a"/>`);
  // Lejant (pusulanın sağında): renk + ad + azimut; kesikli = ufuk altında.
  const lx0 = cx + C + 40;
  const rowH = Math.min(26, Math.floor((2 * C - 30) / Math.max(1, fig.compass.length)));
  fig.compass.forEach((b, i) => {
    const y = top + 12 + i * rowH;
    p.push(`<line x1="${lx0}" y1="${y}" x2="${lx0 + 30}" y2="${y}" stroke="${BODY_COLORS[b.id]}" stroke-width="${PRINT.line * 1.5}"${b.aboveHorizon ? "" : ` stroke-dasharray="${scaleDash("4 3")}"`}/>`);
    p.push(text(lx0 + 38, y, `${BODY_GLYPHS[b.id]} ${BODY_LABELS[b.id]} · azimut ${b.azimuth.toFixed(1).replace(".", ",")}°${b.aboveHorizon ? "" : " · ufuk altında"}`, { "font-size": 14, fill: "#0f172a", "dominant-baseline": "central", "data-legend-body": b.id }));
  });
  p.push(text(lx0, top + 2 * C + 6, "Düz çizgi = ufuk üstünde · kesikli = ufuk altında. Azimut: gerçek kuzeyden saat yönünde.", { "font-size": 12, fill: "#64748b" }));
  const H = top + 2 * C + 18;
  p[0] = `<rect x="0" y="0" width="${MAP_W}" height="${H}" fill="#ffffff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${H}" width="${MAP_W}" height="${H}" font-family="${esc(fontFamily)}">${p.join("")}</svg>`;
}
