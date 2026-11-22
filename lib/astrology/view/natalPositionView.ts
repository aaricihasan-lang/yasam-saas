// Astroloji — NATAL KONUM SUNUMU (G2; SAF). Çark etiketi, grup alanı, dokunma paneli ve tablolar AYNI kuralı kullanır.
// Yeni hesap YOK: yalnız kayıtlı teknik değerin nasıl yazılacağı (formatDegree: dakika kesilir) ve saat bilinmiyorken kesinlik.

import type { BodyId, NatalTechnical, SignId } from "../model/western";
import { BODY_GLYPHS, BODY_LABELS, formatDegree } from "../labels/tr";
import { positionStatus, type PositionStatus } from "./natalLabelLayout";

export type PositionRow = {
  key: string;
  kind: "body" | "point";
  id: string;
  name: string;
  glyph: string;
  status: PositionStatus;
  /** "unknown" (saat bilinmiyor, Ay) iken null: burç / derece / dakika gösterilmez. */
  sign: SignId | null;
  deg: string | null;
  min: string | null;
  full: string | null;
  /** Burç içi derece (cetvel konumu için; "unknown" iken null). */
  degreeInSign: number | null;
  retro: boolean;
  house: number | null;
};

const POINT_META = { fortune: { glyph: "⊗", label: "Şans Noktası" }, vertex: { glyph: "Vx", label: "Vertex" } } as const;

/** Etiket anahtarı → sunulacak değer ("x:fortune" / "x:vertex" özel nokta). Teknik veride yoksa null. */
export function positionRow(t: Pick<NatalTechnical, "bodies" | "points">, key: string, timeUnknown: boolean): PositionRow | null {
  const isPoint = key.startsWith("x:");
  const pid = key.slice(2) as "fortune" | "vertex";
  const rec = isPoint ? (pid === "fortune" ? t.points?.partOfFortune : pid === "vertex" ? t.points?.vertex : null) : t.bodies.find((b) => b.id === key);
  if (!rec) return null;
  const status = positionStatus(timeUnknown, key);
  const unknown = status === "unknown";
  const full = formatDegree(rec.degreeInSign);
  const [d, m] = full.split("°");
  return {
    key,
    kind: isPoint ? "point" : "body",
    id: isPoint ? pid : key,
    name: isPoint ? POINT_META[pid].label : BODY_LABELS[key as BodyId],
    glyph: isPoint ? POINT_META[pid].glyph : BODY_GLYPHS[key as BodyId],
    status,
    sign: unknown ? null : rec.sign,
    deg: unknown ? null : `${d}°`,
    min: unknown ? null : m,
    full: unknown ? null : full,
    degreeInSign: unknown ? null : rec.degreeInSign,
    retro: !isPoint && "retrograde" in rec ? !!rec.retrograde : false,
    house: timeUnknown ? null : (rec.house ?? null),
  };
}
