// PENTA şeması — sahne (SAF). Connection'ın 9 merkezli birleşik haritası UYGULANMAZ.
// Kaynak yalnız kayıtlı, doğrulanmış Penta sonucu: 6 kanal (üst G→Boğaz / alt G→Sakral), 12 kapı,
// kapı başına taşıyan üyeler (sıra = analizdeki üye sırası), 2/14 çekirdek, boşluk kapıları.
// Aynı sahne ekranda (React) ve Word'de (resvg PNG) kullanılır.

import type { HdPentaResult } from "./penta";
import { hdChannelLabelFromCode } from "../codeHelpers";
import type { Pt } from "./compositeLayout";
import type { ScenePrim } from "./compositeScene";

export const PENTA_VIEW = { width: 400, height: 470 } as const;

/** Bant (merkez) ve kapı konumları. Üst kanallar: Boğaz kapısı üstte, G kapısı altta; alt kanallar: G üstte, Sakral altta. */
const COL_X = [96, 200, 304];
const BANDS = {
  Throat: { y: 40, label: "Boğaz" },
  G: { y: 235, label: "G Merkezi" },
  Sacral: { y: 430, label: "Sakral" },
} as const;
/** kanal kimliği → [üst kapı, alt kapı], sütun sırası (resmî Penta sırası). */
const UPPER: Array<[string, number, number]> = [["7-31", 31, 7], ["1-8", 8, 1], ["13-33", 33, 13]];
const LOWER: Array<[string, number, number]> = [["5-15", 15, 5], ["2-14", 2, 14], ["29-46", 46, 29]];

export function pentaGatePositions(): Record<number, Pt> {
  const out: Record<number, Pt> = {};
  UPPER.forEach(([, top, bottom], i) => { out[top] = { x: COL_X[i], y: BANDS.Throat.y + 34 }; out[bottom] = { x: COL_X[i], y: BANDS.G.y - 34 }; });
  LOWER.forEach(([, top, bottom], i) => { out[top] = { x: COL_X[i], y: BANDS.G.y + 34 }; out[bottom] = { x: COL_X[i], y: BANDS.Sacral.y - 34 }; });
  return out;
}

export function buildPentaScene(r: HdPentaResult): ScenePrim[] {
  const prims: ScenePrim[] = [];
  const pos = pentaGatePositions();
  const gateBy = new Map(r.gates.map((g) => [g.gate, g]));
  // Bantlar
  for (const b of Object.values(BANDS)) {
    prims.push({ k: "polygon", points: [{ x: 34, y: b.y - 16 }, { x: 366, y: b.y - 16 }, { x: 366, y: b.y + 16 }, { x: 34, y: b.y + 16 }], fill: "#eef2ff", stroke: "#6366f1", sw: 1.4 });
    prims.push({ k: "text", x: 200, y: b.y + 4.5, text: b.label, size: 12, weight: 800, fill: "#3730a3", anchor: "middle" });
  }
  const chans = [...UPPER.map((u) => ({ u, upper: true })), ...LOWER.map((u) => ({ u, upper: false }))];
  for (const { u: [id, top, bottom], upper } of chans) {
    const c = r.channels.find((x) => x.id === id);
    if (!c) continue;
    const a = pos[top];
    const b = pos[bottom];
    const y1 = upper ? BANDS.Throat.y + 16 : BANDS.G.y + 16;
    const y2 = upper ? BANDS.G.y - 16 : BANDS.Sacral.y - 16;
    const line = [{ x: a.x, y: y1 }, { x: a.x, y: y2 }];
    if (c.defined) {
      prims.push({ k: "polyline", points: line, stroke: c.isCore ? "#be185d" : "#4f46e5", sw: c.isCore ? 9 : 7, layer: "defined", ch: id });
    } else {
      prims.push({ k: "polyline", points: line, stroke: "#cbd5e1", sw: 6, dash: "7 6", layer: "half", ch: id });
    }
    prims.push({ k: "text", x: a.x + 12, y: (y1 + y2) / 2 + 3, text: hdChannelLabelFromCode(id).replace(/^\s*\d+-\d+\s*/, "") || c.name, size: 8.5, weight: 600, fill: "#475569", anchor: "start" });
    void b;
  }
  // Kapılar + taşıyan üyeler
  for (const [gate, p] of Object.entries(pos)) {
    const g = gateBy.get(Number(gate));
    const filled = !!g?.filled;
    prims.push({ k: "circle", x: p.x, y: p.y, r: 11, fill: filled ? "#4f46e5" : "#fffbeb", stroke: filled ? "#1e1b4b" : "#d97706", sw: filled ? 1 : 1.6, gate: Number(gate) });
    prims.push({ k: "text", x: p.x, y: p.y + 3.8, text: gate, size: 10, weight: 800, fill: filled ? "#ffffff" : "#92400e", anchor: "middle" });
    const who = g && g.heldBy.length ? g.heldBy.map((i) => String(i + 1)).join(" · ") : "boşluk";
    const below = p.y < BANDS.G.y ? (Number(gate) === 31 || Number(gate) === 8 || Number(gate) === 33) : false;
    // Üye etiketi: kapının kanal dışı yanında (sol), okunur.
    prims.push({ k: "text", x: p.x - 16, y: p.y + (below ? 3.5 : 3.5), text: who, size: 8.5, weight: 700, fill: g && g.heldBy.length ? "#1e293b" : "#b45309", anchor: "end" });
  }
  return prims;
}

/** Etkileşim yüzeyi: Penta kanal çizgileri (ekran). */
export function pentaChannelLines(): Array<{ id: string; points: Pt[] }> {
  const pos = pentaGatePositions();
  return [
    ...UPPER.map(([id, top]) => ({ id, points: [{ x: pos[top].x, y: BANDS.Throat.y + 16 }, { x: pos[top].x, y: BANDS.G.y - 16 }] })),
    ...LOWER.map(([id, top]) => ({ id, points: [{ x: pos[top].x, y: BANDS.G.y + 16 }, { x: pos[top].x, y: BANDS.Sacral.y - 16 }] })),
  ];
}
