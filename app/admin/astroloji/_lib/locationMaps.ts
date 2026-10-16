// Astrocartography / Local Space harita çizgileri — SAF (istemci + sunucu). 2026-10-15: ekrandaki harita bileşenleri
// (LocationPanels / WorldMap) ve Word/PDF rapor haritası AYNI fonksiyonları kullanır → rapordaki hatlar ekrandakiyle
// birebir aynı yol (path), renk ve çizgi tipindedir. Koordinatlar yalnız kayıtlı teknik veriden (uydurma yok).

import { BODY_IDS, type BodyId } from "@/lib/astrology/model/western";
import type { AcgAngle, AstrocartographyTechnical, LocalSpaceTechnical } from "@/lib/astrology/model/westernLocation";
import { BODY_GLYPHS, BODY_LABELS } from "@/lib/astrology/labels/tr";
import { meridianPath, pathOf, project, splitAtAntimeridian } from "./geo";

export type MapLine = { key: string; d: string; color: string; dash?: string; width?: number; label: string; detail: string[] };
export type MapMarker = { key: string; lat: number; lon: number; label: string; color?: string };
export type MapLabel = { key: string; x: number; y: number; text: string; color: string };

export const BODY_COLORS: Record<BodyId, string> = {
  sun: "#d97706",
  moon: "#64748b",
  mercury: "#0891b2",
  venus: "#db2777",
  mars: "#dc2626",
  jupiter: "#7c3aed",
  saturn: "#334155",
  uranus: "#0284c7",
  neptune: "#2563eb",
  pluto: "#7f1d1d",
  north_node: "#15803d",
  south_node: "#166534",
  chiron: "#a16207",
  lilith: "#581c87",
};
export const ACG_ANGLE_LABEL: Record<AcgAngle, string> = { mc: "MC (Tepe)", ic: "IC (Dip)", asc: "AC (Yükselen)", dsc: "DC (Alçalan)" };
export const ACG_DASH: Record<AcgAngle, string | undefined> = { mc: undefined, ic: "7 4", asc: undefined, dsc: "2 3" };
export const ACG_ANGLES = ["mc", "ic", "asc", "dsc"] as const;
/** Ekranın varsayılan seçimi: klasik 10 gök cismi (Güneş…Plüton). Rapor da bu varsayılan görünümü çizer. */
export const CLASSICAL = new Set<BodyId>(BODY_IDS.slice(0, 10));

const lonText = (lon: number) => `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "D" : "B"}`;

/** ACG teknik verisi → harita çizgileri (SAF; test edilir). */
export function acgMapLines(t: AstrocartographyTechnical, bodies: ReadonlySet<BodyId>, angles: ReadonlySet<AcgAngle>): MapLine[] {
  const out: MapLine[] = [];
  const latMin = t.sampling.latitudeMin;
  const latMax = t.sampling.latitudeMax;
  for (const b of t.bodies) {
    if (!bodies.has(b.id)) continue;
    const name = BODY_LABELS[b.id];
    const common = `RA ${b.rightAscension.toFixed(2)}° · Dec ${b.declination.toFixed(2)}°`;
    for (const a of ACG_ANGLES) {
      if (!angles.has(a)) continue;
      let d: string;
      const detail: string[] = [];
      if (a === "mc" || a === "ic") {
        const lon = a === "mc" ? b.mcLongitude : b.icLongitude;
        d = meridianPath(lon, latMin, latMax);
        detail.push(`Sabit boylam ${lonText(lon)} (dikey meridyen; ${latMin}°…${latMax}° enlem çizildi)`, common);
      } else {
        const c = a === "asc" ? b.asc : b.dsc;
        const pts = [...c.points].sort((p, q) => p[0] - q[0]);
        d = pathOf(splitAtAntimeridian(pts));
        detail.push(`${pts.length} örnek nokta (${pts[0]?.[0] ?? "—"}°…${pts[pts.length - 1]?.[0] ?? "—"}° enlem)`, common);
        if (c.circumpolarBeyond !== null) detail.push(`|enlem| > ${c.circumpolarBeyond.toFixed(2)}°: cisim ufku kesmez (doğmaz/batmaz) → bu enlemlerde hat yok.`);
      }
      if (!d) continue;
      out.push({ key: `${b.id}:${a}`, d, color: BODY_COLORS[b.id], dash: ACG_DASH[a], width: a === "mc" || a === "ic" ? 1.2 : 1.5, label: `${BODY_GLYPHS[b.id]} ${name} — ${ACG_ANGLE_LABEL[a]} hattı`, detail });
    }
  }
  return out;
}

/** ACG MC hatlarının üst kenar etiketleri (ekrandakiyle aynı: "<glif>MC", hat boylamında). */
export function acgMcLabels(t: AstrocartographyTechnical, bodies: ReadonlySet<BodyId>, angles: ReadonlySet<AcgAngle>): MapLabel[] {
  return t.bodies
    .filter((b) => bodies.has(b.id) && angles.has("mc"))
    .map((b) => {
      const [x] = project(0, b.mcLongitude);
      return { key: `lbl-${b.id}`, x, y: 14, text: `${BODY_GLYPHS[b.id]}MC`, color: BODY_COLORS[b.id] };
    });
}

/** Azimut (kuzeyden saat yönü) → pusula SVG noktası (SAF; test edilir). */
export function compassPoint(cx: number, cy: number, r: number, azimuth: number): [number, number] {
  const a = (azimuth * Math.PI) / 180;
  return [Math.round((cx + r * Math.sin(a)) * 100) / 100, Math.round((cy - r * Math.cos(a)) * 100) / 100];
}

export function localSpaceMapLines(t: LocalSpaceTechnical, bodies: ReadonlySet<BodyId>): MapLine[] {
  return t.bodies
    .filter((b) => bodies.has(b.id))
    .map((b) => ({
      key: `ls:${b.id}`,
      d: pathOf(splitAtAntimeridian(b.line)),
      color: BODY_COLORS[b.id],
      dash: b.aboveHorizon ? undefined : "4 3",
      label: `${BODY_GLYPHS[b.id]} ${BODY_LABELS[b.id]} — local space hattı (${b.compass.toUpperCase()})`,
      detail: [`Azimut ${b.azimuth.toFixed(2)}° (gerçek kuzeyden saat yönü) · yükseklik ${b.altitude.toFixed(2)}° · ${b.aboveHorizon ? "ufuk üstünde" : "ufuk altında"}`, `${b.line.length} büyük çember yol noktası (sağlayıcı)`],
    }));
}
