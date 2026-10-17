// PENTA şeması — sahne (SAF). Connection'ın 9 merkezli birleşik haritası UYGULANMAZ (Penta bir BodyGraph değildir).
// Düzen referansı: sade Penta "merdiveni" — üç merkez bandı (Boğaz / G / Sakral), aralarında üçer kanal; her kanal
// iki kapı arasında dikey çizgi, adı ortada. Metinler Türkçe, renkler Yaşam Sistemi kimliği.
// Kaynak yalnız kayıtlı, doğrulanmış Penta sonucu: 6 kanal (üst G→Boğaz / alt G→Sakral), 12 kapı, kapı başına
// taşıyan üyeler (numara = analizdeki üye sırası), 2/14 çekirdek, boşluk kapıları.
// Aynı sahne ekranda (React) ve Word'de (resvg PNG) kullanılır.

import type { HdPentaResult } from "./penta";
import { hdChannelLabelFromCode } from "../codeHelpers";
import type { Pt } from "./compositeLayout";
import type { ScenePrim } from "./compositeScene";

export const PENTA_VIEW = { width: 440, height: 660 } as const;

const INK = "#1e1b4b";
const BRAND = "#4f46e5";
const CORE = "#be185d";
const MUTED = "#94a3b8";
const BAND_FILL = "#eef2ff";
const BAND_STROKE = "#a5b4fc";

const COL_X = [86, 220, 354];
const BAND_H = 46;
const BANDS = {
  Throat: { y: 18, label: "BOĞAZ MERKEZİ" },
  G: { y: 307, label: "G MERKEZİ" },
  Sacral: { y: 596, label: "SAKRAL MERKEZ" },
} as const;
const GATE_R = 15;
/** kanal kimliği → [üst kapı, alt kapı] (resmî Penta sırası). */
const UPPER: Array<[string, number, number]> = [["7-31", 31, 7], ["1-8", 8, 1], ["13-33", 33, 13]];
const LOWER: Array<[string, number, number]> = [["5-15", 15, 5], ["2-14", 2, 14], ["29-46", 46, 29]];

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

/** Kanalın üst ve alt kapı konumları (üst kapı üst bandın hemen altında, alt kapı alt bandın hemen üstünde). */
export function pentaGatePositions(): Record<number, Pt> {
  const out: Record<number, Pt> = {};
  const place = (rows: Array<[string, number, number]>, top: { y: number }, bottom: { y: number }) =>
    rows.forEach(([, t, b], i) => {
      out[t] = { x: COL_X[i], y: top.y + BAND_H + 32 };
      out[b] = { x: COL_X[i], y: bottom.y - 32 };
    });
  place(UPPER, BANDS.Throat, BANDS.G);
  place(LOWER, BANDS.G, BANDS.Sacral);
  return out;
}

const channelName = (id: string, fallback: string) => (hdChannelLabelFromCode(id).replace(/^\s*\d+-\d+\s*/, "").replace(/\s*\(.*\)\s*$/, "").trim() || fallback);

export function buildPentaScene(r: HdPentaResult): ScenePrim[] {
  const prims: ScenePrim[] = [];
  const pos = pentaGatePositions();
  const gateBy = new Map(r.gates.map((g) => [g.gate, g]));
  // Merkez bantları
  for (const b of Object.values(BANDS)) {
    prims.push({ k: "path", d: roundedRect(18, b.y, PENTA_VIEW.width - 36, BAND_H, 14), fill: BAND_FILL, stroke: BAND_STROKE, sw: 1.4 });
    prims.push({ k: "text", x: PENTA_VIEW.width / 2, y: b.y + BAND_H / 2 + 5, text: b.label, size: 13, weight: 800, fill: "#3730a3", anchor: "middle" });
  }
  // Kanallar: kapılar arası dikey çizgi, adı ortada (çizgi ad için açılır)
  for (const [id, top, bottom] of [...UPPER, ...LOWER]) {
    const c = r.channels.find((x) => x.id === id);
    if (!c) continue;
    const a = pos[top];
    const b = pos[bottom];
    const y1 = a.y + GATE_R + 2;
    const y2 = b.y - GATE_R - 2;
    const mid = (y1 + y2) / 2;
    const gap = 26;
    const stroke = c.defined ? (c.isCore ? CORE : BRAND) : "#cbd5e1";
    const sw = c.defined ? 7 : 4;
    const dash = c.defined ? undefined : "2 7";
    prims.push({ k: "polyline", points: [{ x: a.x, y: y1 }, { x: a.x, y: mid - gap / 2 }], stroke, sw, dash, layer: c.defined ? "defined" : "half", ch: id });
    prims.push({ k: "polyline", points: [{ x: a.x, y: mid + gap / 2 }, { x: a.x, y: y2 }], stroke, sw, dash, layer: c.defined ? "defined" : "half", ch: id });
    prims.push({ k: "text", x: a.x, y: mid - 1, text: channelName(id, c.name), size: 11, weight: c.defined ? 800 : 600, fill: c.defined ? INK : "#64748b", anchor: "middle" });
    prims.push({ k: "text", x: a.x, y: mid + 11, text: `${id}${c.isCore ? " · ÇEKİRDEK" : ""}${c.defined ? "" : " · boşluk var"}`, size: 8.5, weight: 700, fill: c.isCore ? CORE : c.defined ? BRAND : "#b45309", anchor: "middle" });
  }
  // Kapılar + taşıyan üyeler (numaralı rozetler; numara = üye sırası)
  for (const [gate, p] of Object.entries(pos)) {
    const g = gateBy.get(Number(gate));
    const filled = !!g?.filled;
    prims.push({ k: "circle", x: p.x, y: p.y, r: GATE_R, fill: "#ffffff", stroke: filled ? INK : MUTED, sw: filled ? 2 : 1.5, dash: filled ? undefined : "3 3", gate: Number(gate) });
    prims.push({ k: "text", x: p.x, y: p.y + 4.5, text: gate, size: 12.5, weight: 800, fill: filled ? INK : MUTED, anchor: "middle" });
    if (g && g.heldBy.length) {
      g.heldBy.forEach((m, i) => {
        const bx = p.x + GATE_R + 11 + i * 16;
        prims.push({ k: "circle", x: bx, y: p.y, r: 7.5, fill: BRAND, stroke: "#ffffff", sw: 1 });
        prims.push({ k: "text", x: bx, y: p.y + 3.2, text: String(m + 1), size: 9, weight: 800, fill: "#ffffff", anchor: "middle" });
      });
    } else {
      prims.push({ k: "text", x: p.x + GATE_R + 6, y: p.y + 3.5, text: "boşluk", size: 9.5, weight: 700, fill: "#b45309", anchor: "start" });
    }
  }
  return prims;
}

/** Etkileşim yüzeyi: Penta kanal çizgileri (ekran). */
export function pentaChannelLines(): Array<{ id: string; points: Pt[] }> {
  const pos = pentaGatePositions();
  return [...UPPER, ...LOWER].map(([id, top, bottom]) => ({ id, points: [{ x: pos[top].x, y: pos[top].y + GATE_R }, { x: pos[bottom].x, y: pos[bottom].y - GATE_R }] }));
}
