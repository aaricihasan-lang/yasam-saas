// Astroloji owner UI — dünya haritası GEOMETRİ yardımcıları (SAF; istemci güvenli, test edilir).
// Eşdikdörtgen (equirectangular) projeksiyon: x = boylam, y = enlem (doğrusal). Hiçbir harita servisi /
// API anahtarı / dış istek YOK; koordinatlar yalnız sağlayıcının teknik verisinden gelir (uydurma yok).

export const MAP_W = 1000;
export const MAP_H = 500;

export type XY = [number, number];

/** (enlem, boylam) → SVG koordinatı. */
export function project(lat: number, lon: number): XY {
  const x = ((lon + 180) / 360) * MAP_W;
  const y = ((90 - lat) / 180) * MAP_H;
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

/** Boylamı [-180, 180) aralığına getirir. */
export const normLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * [enlem, boylam] noktalarını antimeridyende (±180) BÖLER: ardışık iki nokta arasındaki boylam farkı
 * 180°'den büyükse çizgi haritanın öbür ucundan devam eder → yatay "sahte" çizgi çizilmez.
 */
export function splitAtAntimeridian(points: readonly (readonly [number, number])[]): XY[][] {
  const out: XY[][] = [];
  let cur: XY[] = [];
  let prevLon: number | null = null;
  for (const [lat, lonRaw] of points) {
    const lon = normLon(lonRaw);
    if (prevLon !== null && Math.abs(lon - prevLon) > 180) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
    cur.push(project(lat, lon));
    prevLon = lon;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

export function pathOf(segments: XY[][]): string {
  return segments.map((s) => `M${s.map(([x, y]) => `${x},${y}`).join("L")}`).join("");
}

/** Sıkıştırılmış [boylam*100, enlem*100, …] dizisini SVG yoluna çevirir (antimeridyende bölerek). */
export function packedToPath(flat: readonly number[], close: boolean): string {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i + 1] / 100, flat[i] / 100]);
  const segs = splitAtAntimeridian(pts);
  const p = pathOf(segs);
  return close && segs.length === 1 ? `${p}Z` : p;
}

/** Sabit boylamlı meridyen çizgisi (ACG MC/IC) — enlem aralığında dikey çizgi. */
export function meridianPath(lon: number, latMin: number, latMax: number): string {
  const [x1, y1] = project(latMax, normLon(lon));
  const [x2, y2] = project(latMin, normLon(lon));
  return `M${x1},${y1}L${x2},${y2}`;
}

/** İki nokta arası başlangıç kerterizi (derece, gerçek kuzeyden saat yönünde) — local space doğrulaması. */
export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const φ1 = lat1 * r;
  const φ2 = lat2 * r;
  const Δλ = (lon2 - lon1) * r;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / r) % 360 + 360) % 360;
}
