// Birleşik BodyGraph SAHNESİ — çizim ilkelleri (SAF). Aynı sahne:
//   • tarayıcıda etkileşimli React SVG'ye (CompositeBodygraph.tsx),
//   • sunucuda SVG metnine → resvg PNG'ye (Word) dönüştürülür. Ekran ve rapor AYNI çizimi kullanır.
// Renk = KİŞİ (A mavi, B turuncu, ortak = çizgili mavi/turuncu). Şekil = BAĞLANTI TÜRÜ (dinamik).

import { COMPOSITE_CENTERS, COMPOSITE_GATES, COMPOSITE_ROUTES, COMPOSITE_VIEW, type Pt } from "./compositeLayout";
import type { CompositeModel, Holder } from "./compositeModel";
import type { ConnectionDynamic } from "./connection";
import { APP_CENTER_TO_ENGINE_CENTER } from "../normalize/hdAppCodes";

export const PERSON_COLOR = { A: "#2563eb", B: "#ea580c" } as const;
export const DYNAMIC_SHAPE: Readonly<Record<ConnectionDynamic, "diamond" | "triangle" | "square" | "circle">> = {
  Electromagnetic: "diamond",
  Dominance: "triangle",
  Compromise: "square",
  Companionship: "circle",
};
const CENTER_TR: Record<string, string> = {
  Head: "Baş", Ajna: "Ajna", Throat: "Boğaz", G: "G", Heart: "Kalp", Spleen: "Dalak", SolarPlexus: "Solar P.", Sacral: "Sakral", Root: "Kök",
};

export type ScenePrim =
  | { k: "polygon"; points: Pt[]; fill: string; stroke: string; sw: number }
  | { k: "polyline"; points: Pt[]; stroke: string; sw: number; dash?: string; opacity?: number; ch?: string; layer: "base" | "half" | "defined" }
  | { k: "circle"; x: number; y: number; r: number; fill: string; stroke: string; sw: number; gate?: number; dash?: string }
  | { k: "path"; d: string; fill: string; stroke?: string; sw?: number }
  | { k: "text"; x: number; y: number; text: string; size: number; weight: number; fill: string; anchor?: "middle" | "start" | "end" }
  | { k: "marker"; shape: "diamond" | "triangle" | "square" | "circle"; x: number; y: number; ch: string };

const fmt = (n: number) => +n.toFixed(2);

export function buildCompositeScene(model: CompositeModel): ScenePrim[] {
  const prims: ScenePrim[] = [];
  const definedCenter = new Map(model.centers.map((c) => [APP_CENTER_TO_ENGINE_CENTER[c.code], c]));
  // 1) Merkezler
  for (const [name, shape] of Object.entries(COMPOSITE_CENTERS)) {
    const c = definedCenter.get(name);
    prims.push({ k: "polygon", points: shape.points, fill: c?.defined ? "#e0e7ff" : "#ffffff", stroke: c?.defined ? "#4338ca" : "#94a3b8", sw: c?.defined ? 2 : 1.4 });
    prims.push({ k: "text", x: shape.label.x, y: shape.label.y, text: CENTER_TR[name], size: 8, weight: 700, fill: c?.defined ? "#312e81" : "#64748b", anchor: "middle" });
    if (c && c.definedBy.length) {
      prims.push({ k: "text", x: shape.label.x, y: shape.label.y + 10, text: c.definedBy.join("+"), size: 7, weight: 800, fill: "#4338ca", anchor: "middle" });
    }
  }
  // 2) Kanal tabanı (tüm 36 kanal — aktif olmayan boş tüp)
  for (const r of COMPOSITE_ROUTES) {
    prims.push({ k: "polyline", points: r.points, stroke: "#cbd5e1", sw: 6.4, layer: "base", ch: r.id });
    prims.push({ k: "polyline", points: r.points, stroke: "#f8fafc", sw: 4.2, layer: "base", ch: r.id });
  }
  // 3) Yarım kanallar (yalnız bir kapı aktif) — ince + kesikli: TAM kanal gibi görünmez
  const half = (pts: Pt[], h: Holder, ch: string, layer: "half" | "defined") => {
    const sw = layer === "defined" ? 4.6 : 3;
    if (h === "both") {
      prims.push({ k: "polyline", points: pts, stroke: PERSON_COLOR.A, sw, ch, layer, dash: layer === "half" ? "3 2" : undefined, opacity: layer === "half" ? 0.8 : 1 });
      prims.push({ k: "polyline", points: pts, stroke: PERSON_COLOR.B, sw, ch, layer, dash: "4 4", opacity: layer === "half" ? 0.8 : 1 });
    } else {
      prims.push({ k: "polyline", points: pts, stroke: PERSON_COLOR[h], sw, ch, layer, dash: layer === "half" ? "3 2" : undefined, opacity: layer === "half" ? 0.8 : 1 });
    }
  };
  for (const r of COMPOSITE_ROUTES) {
    const s = model.channels[r.id];
    if (s.state === "half") {
      if (s.holderA) half(r.halfA, s.holderA, r.id, "half");
      if (s.holderB) half(r.halfB, s.holderB, r.id, "half");
    }
  }
  // 4) Tanımlı kanallar (birleşik) — kalın, iki yarı kapı sahibinin renginde + dinamik işareti
  for (const r of COMPOSITE_ROUTES) {
    const s = model.channels[r.id];
    if (s.state !== "defined") continue;
    prims.push({ k: "polyline", points: r.points, stroke: "#0f172a", sw: 7.2, ch: r.id, layer: "defined", opacity: 0.85 });
    half(r.halfA, s.holderA, r.id, "defined");
    half(r.halfB, s.holderB, r.id, "defined");
    prims.push({ k: "marker", shape: DYNAMIC_SHAPE[s.dynamic], x: r.mid.x, y: r.mid.y, ch: r.id });
  }
  // 5) Kapı rozetleri
  for (const [g, p] of Object.entries(COMPOSITE_GATES)) {
    const gate = Number(g);
    const h = model.gates[gate];
    const r = 7.4;
    if (h === "both") {
      prims.push({ k: "path", d: `M ${p.x} ${fmt(p.y - r)} A ${r} ${r} 0 0 0 ${p.x} ${fmt(p.y + r)} Z`, fill: PERSON_COLOR.A });
      prims.push({ k: "path", d: `M ${p.x} ${fmt(p.y - r)} A ${r} ${r} 0 0 1 ${p.x} ${fmt(p.y + r)} Z`, fill: PERSON_COLOR.B });
      prims.push({ k: "circle", x: p.x, y: p.y, r, fill: "none", stroke: "#0f172a", sw: 0.8, gate });
    } else {
      prims.push({ k: "circle", x: p.x, y: p.y, r, fill: h ? PERSON_COLOR[h] : "#ffffff", stroke: h ? "#0f172a" : "#94a3b8", sw: h ? 0.8 : 0.9, gate });
    }
    prims.push({ k: "text", x: p.x, y: p.y + 2.6, text: g, size: 7.2, weight: 800, fill: h ? "#ffffff" : "#475569", anchor: "middle" });
  }
  return prims;
}

function markerPath(shape: "diamond" | "triangle" | "square" | "circle", x: number, y: number, s = 5.2): string {
  switch (shape) {
    case "diamond": return `M ${x} ${fmt(y - s)} L ${fmt(x + s)} ${y} L ${x} ${fmt(y + s)} L ${fmt(x - s)} ${y} Z`;
    case "triangle": return `M ${x} ${fmt(y - s)} L ${fmt(x + s)} ${fmt(y + s * 0.8)} L ${fmt(x - s)} ${fmt(y + s * 0.8)} Z`;
    case "square": { const q = s * 0.82; return `M ${fmt(x - q)} ${fmt(y - q)} H ${fmt(x + q)} V ${fmt(y + q)} H ${fmt(x - q)} Z`; }
    default: return `M ${fmt(x - s * 0.85)} ${y} A ${fmt(s * 0.85)} ${fmt(s * 0.85)} 0 1 0 ${fmt(x + s * 0.85)} ${y} A ${fmt(s * 0.85)} ${fmt(s * 0.85)} 0 1 0 ${fmt(x - s * 0.85)} ${y} Z`;
  }
}
export function scenePointsAttr(p: Pt[]): string {
  return p.map((q) => `${fmt(q.x)},${fmt(q.y)}`).join(" ");
}
export function sceneMarkerPath(m: Extract<ScenePrim, { k: "marker" }>): string {
  return markerPath(m.shape, m.x, m.y);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sunucu: sahne → bağımsız SVG metni (resvg için; font ailesi verilir). */
export function sceneToSvg(prims: ScenePrim[], fontFamily: string, view: { width: number; height: number } = COMPOSITE_VIEW): string {
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.width} ${view.height}" width="${view.width}" height="${view.height}" font-family="${esc(fontFamily)}">`, `<rect width="100%" height="100%" fill="#ffffff"/>`];
  for (const p of prims) {
    switch (p.k) {
      case "polygon": out.push(`<polygon points="${scenePointsAttr(p.points)}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.sw}" stroke-linejoin="round"/>`); break;
      case "polyline": out.push(`<polyline points="${scenePointsAttr(p.points)}" fill="none" stroke="${p.stroke}" stroke-width="${p.sw}" stroke-linecap="round" stroke-linejoin="round"${p.dash ? ` stroke-dasharray="${p.dash}"` : ""}${p.opacity !== undefined ? ` opacity="${p.opacity}"` : ""}/>`); break;
      case "circle": out.push(`<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.sw}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ""}/>`); break;
      case "path": out.push(`<path d="${p.d}" fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw ?? 1}"` : ""}/>`); break;
      case "text": out.push(`<text x="${p.x}" y="${p.y}" font-size="${p.size}" font-weight="${p.weight}" fill="${p.fill}" text-anchor="${p.anchor ?? "start"}">${esc(p.text)}</text>`); break;
      case "marker": out.push(`<path d="${sceneMarkerPath(p)}" fill="#ffffff" stroke="#0f172a" stroke-width="1.6"/>`); break;
    }
  }
  out.push("</svg>");
  return out.join("");
}
