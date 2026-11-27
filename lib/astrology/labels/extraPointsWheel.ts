// Ek noktalar çarkı — ekran (ExtraPointsPanels.tsx) ve Word/PDF raporu (report/model.ts) için ORTAK saf veri.
// İç halka: kayıtlı natal çerçeve; dış halka: asteroitler, ortalama/gerçek Lilith, (gizlenmeyen) Hermetik lotlar.
// Yeni hesap YOK: yalnız kayıtlı teknik katmandaki boylamlar. Ek noktalar için açı listesi yoktur → açı çizgisi çizilmez.

import { BODY_GLYPHS, SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "./tr";
import { ASTEROID_COLOR, ASTEROID_GLYPHS, ASTEROID_LABELS, LILITH_COLORS, LILITH_LABELS, LILITH_SHORT, LOT_COLOR, LOT_LABELS, LOT_SHORT } from "./extraPoints";
import type { SignId } from "../model/western";
import { lotPositionWithheld, type ExtraNatalFrame, type ExtraPointsTechnical, type LilithVariant, type LotId } from "../model/westernExtraPoints";

export type ExtraOuterPoint = { key: string; longitude: number; sign: SignId; degreeInSign: number; retrograde: boolean; label: string; color: string; title: string };

const pos = (sign: SignId, d: number) => `${SIGN_GLYPHS[sign]} ${SIGN_LABELS[sign]} ${formatDegree(d)}`;

/** Açıklamada lot kısaltmasının karşılığı. */
export const EXTRA_LOT_LEGEND_WORD: Record<LotId, string> = { fortune: "Şans", spirit: "Ruh", eros: "Eros", necessity: "Zorunluluk", courage: "Cesaret", victory: "Zafer", nemesis: "Nemesis" };

/** Dış halka noktaları (ekran ve rapor aynı liste, aynı sıra). Konumu gizlenen lot (lotPositionWithheld) çizilmez. */
export function extraOuterPoints(t: ExtraPointsTechnical): ExtraOuterPoint[] {
  const out: ExtraOuterPoint[] = [];
  for (const b of t.asteroids?.bodies ?? [])
    out.push({ key: `a:${b.id}`, longitude: b.longitude, sign: b.sign, degreeInSign: b.degreeInSign, retrograde: b.retrograde, label: ASTEROID_GLYPHS[b.id], color: ASTEROID_COLOR, title: `${ASTEROID_LABELS[b.id]} — ${pos(b.sign, b.degreeInSign)}${b.retrograde ? " ℞" : ""}` });
  if (t.lilith)
    for (const v of ["mean", "true"] as LilithVariant[]) {
      const x = t.lilith[v];
      out.push({ key: `l:${v}`, longitude: x.longitude, sign: x.sign, degreeInSign: x.degreeInSign, retrograde: x.retrograde, label: LILITH_SHORT[v], color: LILITH_COLORS[v], title: `${LILITH_LABELS[v]} — ${pos(x.sign, x.degreeInSign)}${x.retrograde ? " ℞" : ""}` });
    }
  for (const l of (t.lots?.lots ?? []).filter((x) => !lotPositionWithheld(x)))
    out.push({ key: `o:${l.id}`, longitude: l.longitude, sign: l.sign, degreeInSign: l.degreeInSign, retrograde: false, label: LOT_SHORT[l.id], color: LOT_COLOR, title: `${LOT_LABELS[l.id]} — ${pos(l.sign, l.degreeInSign)}` });
  return out;
}

/** İç halka gövdeleri: ortalama Lilith ek noktalar katmanında çizildiği için iç halkada tekrar çizilmez (karışmasın). */
export function extraInnerBodies(t: ExtraPointsTechnical, frame: ExtraNatalFrame): ExtraNatalFrame["bodies"] {
  return frame.bodies.filter((b) => (t.lilith ? b.id !== "lilith" : true) && (b.id as string) in BODY_GLYPHS);
}

/** Açıklama parçaları (ekranda renkli satırlar, raporda düz metin). */
export function extraWheelLegendParts(t: ExtraPointsTechnical): { text: string; color: string | null }[] {
  const parts: { text: string; color: string | null }[] = [{ text: "İç halka: natal harita", color: null }];
  if (t.asteroids) parts.push({ text: "⚳⚴⚵⚶ asteroitler", color: ASTEROID_COLOR });
  if (t.lilith) {
    parts.push({ text: `${LILITH_SHORT.mean}: ortalama Lilith`, color: LILITH_COLORS.mean });
    parts.push({ text: `${LILITH_SHORT.true}: gerçek Lilith`, color: LILITH_COLORS.true });
  }
  if (t.lots) {
    const lots = t.lots.lots.filter((l) => !lotPositionWithheld(l)).map((l) => `${LOT_SHORT[l.id]} ${EXTRA_LOT_LEGEND_WORD[l.id]}`);
    if (lots.length) parts.push({ text: lots.join(" · "), color: LOT_COLOR });
  }
  return parts;
}
