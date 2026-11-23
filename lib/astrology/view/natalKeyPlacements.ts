// Astroloji — NATAL ÖZET: GÜNEŞ / AY / YÜKSELEN kartları (G4; SAF). Yeni hesap YOK: kayıtlı teknik değer + G2 kesinlik kuralı
// (positionRow / positionStatus). Saat bilinmiyorken: Güneş "≈ 12:00 varsayımı", Ay belirsiz (burç / derece yok), Yükselen bilinmiyor.

import type { NatalTechnical, SignId } from "../model/western";
import { BODY_GLYPHS, formatDegree, SIGN_GLYPHS, SIGN_LABELS } from "../labels/tr";
import { MOON_UNKNOWN_TEXT, NOON_ASSUMPTION } from "./natalLabelLayout";
import { positionRow } from "./natalPositionView";

export type KeyPlacementStatus = "exact" | "assumed" | "unknown" | "missing";
export type KeyPlacement = {
  key: "sun" | "moon" | "asc";
  title: string;
  glyph: string;
  status: KeyPlacementStatus;
  /** "exact" / "assumed" iken dolu; "unknown" / "missing" iken null (burç / derece gösterilmez). */
  sign: SignId | null;
  signName: string | null;
  signGlyph: string | null;
  degree: string | null;
  /** Kartta görünen kısa not (yalnız yaklaşık / belirsiz / bilinmiyor; dar kartta okunur). */
  note: string | null;
  /** Tam açıklama (kart ipucu; Owner metni). Aynı metin Özet'te kartların hemen altındaki saat uyarısında da yazılıdır. */
  detail: string | null;
};

export const KEY_SUN_ASSUMED_NOTE = `${NOON_ASSUMPTION} · kesin değil`;
export const KEY_MOON_UNKNOWN_NOTE = "Doğum saati bilinmediği için doğrulanamıyor";
export const KEY_ASC_UNKNOWN_NOTE = "Doğum saati gerekir";
const KEY_SUN_ASSUMED_DETAIL = `Doğum saati bilinmiyor: Güneş'in burcu ve derecesi yerel ${NOON_ASSUMPTION}dır, kesin değildir.`;
const KEY_ASC_UNKNOWN_DETAIL = "Doğum saati bilinmeden Yükselen (ASC) hesaplanamaz.";

const signParts = (sign: SignId, degreeInSign: number) => ({ sign, signName: SIGN_LABELS[sign], signGlyph: SIGN_GLYPHS[sign], degree: formatDegree(degreeInSign) });

export function natalKeyPlacements(t: Pick<NatalTechnical, "bodies" | "points" | "angles">, timeUnknown: boolean): KeyPlacement[] {
  const body = (key: "sun" | "moon", title: string, glyph: string): KeyPlacement => {
    const r = positionRow(t, key, timeUnknown);
    if (!r) return { key, title, glyph, status: "missing", sign: null, signName: null, signGlyph: null, degree: null, note: null, detail: null };
    if (r.status === "unknown" || !r.sign || r.degreeInSign === null) return { key, title, glyph, status: "unknown", sign: null, signName: null, signGlyph: null, degree: null, note: KEY_MOON_UNKNOWN_NOTE, detail: MOON_UNKNOWN_TEXT };
    return { key, title, glyph, status: r.status === "assumed" ? "assumed" : "exact", ...signParts(r.sign, r.degreeInSign), note: r.status === "assumed" ? KEY_SUN_ASSUMED_NOTE : null, detail: r.status === "assumed" ? KEY_SUN_ASSUMED_DETAIL : null };
  };
  const asc: KeyPlacement = timeUnknown
    ? { key: "asc", title: "Yükselen", glyph: "ASC", status: "unknown", sign: null, signName: null, signGlyph: null, degree: null, note: KEY_ASC_UNKNOWN_NOTE, detail: KEY_ASC_UNKNOWN_DETAIL }
    : t.angles
      ? { key: "asc", title: "Yükselen", glyph: "ASC", status: "exact", ...signParts(t.angles.ascendant.sign, t.angles.ascendant.degreeInSign), note: null, detail: null }
      : { key: "asc", title: "Yükselen", glyph: "ASC", status: "missing", sign: null, signName: null, signGlyph: null, degree: null, note: null, detail: null };
  // Semboller ekrandaki tablolarla AYNI kaynaktan (metin sunumu seçicisiyle; emoji olarak çizilmez).
  return [body("sun", "Güneş", BODY_GLYPHS.sun), body("moon", "Ay", BODY_GLYPHS.moon), asc];
}
