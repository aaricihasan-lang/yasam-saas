// Human Design Variables (Dört Ok / PHS) — SAF matematik ve sabitler. Ağ / DB / sağlayıcı YOK.
//
// Kaynak sözleşme: RoxyAPI OpenAPI 2.0.0 `calculateVariables` (2026-10-20 indirildi):
//   • determination = Design Sun · Top left · Primary Health System
//   • environment   = Design North Node · Bottom left · Primary Health System
//   • motivation    = Personality Sun · Top right · Rave Psychology
//   • perspective   = Personality North Node · Bottom right · Rave Psychology
//   • Color 1–6 (çizginin altıda biri), Tone 1–6 (Color'ın altıda biri), Base 1–5 (Tone'un beşte biri)
//   • Yön: Tone 1–3 → left, 4–6 → right · Cognition YALNIZ determination Tone'undan.
// Boylam → kapı/çizgi eşlemesi mevcut mühürlü mandala (engine/mandala, DEĞİŞTİRİLMEDİ) ile yapılır.

import { longitudeToGateLine } from "../engine/mandala";

export const LINE_DEG = 360 / 64 / 6; // 0,9375°
export const COLOR_DEG = LINE_DEG / 6; // 0,15625° = 9′22,5″
export const TONE_DEG = COLOR_DEG / 6; // 0,0260417° = 1′33,75″
export const BASE_DEG = TONE_DEG / 5; // 0,0052083° = 18,75″

export type VariableKey = "determination" | "environment" | "motivation" | "perspective";
export type VariableSide = "design" | "personality";
export type VariablePlanet = "Sun" | "North Node";
export type VariableDirection = "left" | "right";

export type ArrowSpec = {
  key: VariableKey;
  position: "Top left" | "Bottom left" | "Top right" | "Bottom right";
  side: VariableSide;
  planet: VariablePlanet;
  layer: "Primary Health System" | "Rave Psychology";
};

/** Sabit gösterim sırası: sol üst, sol alt, sağ üst, sağ alt. */
export const ARROW_SPECS: readonly ArrowSpec[] = Object.freeze([
  { key: "determination", position: "Top left", side: "design", planet: "Sun", layer: "Primary Health System" },
  { key: "environment", position: "Bottom left", side: "design", planet: "North Node", layer: "Primary Health System" },
  { key: "motivation", position: "Top right", side: "personality", planet: "Sun", layer: "Rave Psychology" },
  { key: "perspective", position: "Bottom right", side: "personality", planet: "North Node", layer: "Rave Psychology" },
]);
export const ARROW_SPEC_BY_KEY: Readonly<Record<VariableKey, ArrowSpec>> = Object.freeze(
  Object.fromEntries(ARROW_SPECS.map((s) => [s.key, s])) as Record<VariableKey, ArrowSpec>,
);

/** Cognition, determination Tone'undan (sözleşme: Smell, Taste, Outer Vision, Inner Vision, Feeling, Touch). */
export const COGNITION_BY_TONE: readonly string[] = Object.freeze(["Smell", "Taste", "Outer Vision", "Inner Vision", "Feeling", "Touch"]);

export const toneDirection = (tone: number): VariableDirection => (tone <= 3 ? "left" : "right");

export type Substructure = {
  gate: number;
  line: number;
  color: number;
  tone: number;
  base: number;
  direction: VariableDirection;
  /** En yakın Color sınırına uzaklık (yay-saniye; çizgi sınırı da Color sınırıdır). */
  colorBoundaryArcsec: number;
  /** En yakın Tone sınırına uzaklık (yay-saniye). */
  toneBoundaryArcsec: number;
};

const idx = (pos: number, size: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(pos / size)));

/** Ekliptik boylam → kapı, çizgi, Color, Tone, Base + sınır mesafeleri (mevcut mandala ofsetiyle). */
export function substructureOf(longitude: number): Substructure {
  const gl = longitudeToGateLine(longitude);
  const p = gl.positionInLineDeg; // [0, LINE)
  const ci = idx(p, COLOR_DEG, 6);
  const pc = p - ci * COLOR_DEG;
  const ti = idx(pc, TONE_DEG, 6);
  const pt = pc - ti * TONE_DEG;
  const bi = idx(pt, BASE_DEG, 5);
  const tone = ti + 1;
  return {
    gate: gl.gate,
    line: gl.line,
    color: ci + 1,
    tone,
    base: bi + 1,
    direction: toneDirection(tone),
    colorBoundaryArcsec: Math.min(pc, COLOR_DEG - pc) * 3600,
    toneBoundaryArcsec: Math.min(pt, TONE_DEG - pt) * 3600,
  };
}

/**
 * Belirsizlik bandı içindeki olası (Color, Tone) çiftleri: boylam ± bant (yay-saniye). Bant bir Tone genişliğinden
 * (93,75″) küçük olduğundan en çok iki aday çıkar. Bağımsız çapraz denetimde sağlayıcı değeri bu kümede olmalıdır.
 */
export function colorToneCandidates(longitude: number, bandArcsec: number): Set<string> {
  const out = new Set<string>();
  for (const d of [-bandArcsec, 0, bandArcsec]) {
    const s = substructureOf(longitude + d / 3600);
    out.add(`${s.color}.${s.tone}`);
  }
  return out;
}
