// Connection (iki kişilik ilişki) BODYGRAPH SAHNESİ — SAF (DOM yok, ağ yok, hesap yok).
//
// Görünüm: owner'ın KESİN premium referansı (2026-10-18, "Yaşam Sistemi Enerji Haritası") — cinsiyetsiz, ışıklı
// mavi-lila yarı saydam silüet; beyaz zemin, yumuşak ışık halesi ve ince yörünge halkaları; üç boyutlu kanal
// boruları (pasif: beyaz-gümüş; A: parlak elektrik mavisi; B: parlak turuncu); gölgeli merkezler; parlak dolgulu
// aktif kapılar; sağ üstte Yaşam Sistemi logosu. Referanstan YALNIZ estetik alınır.
//
// Teknik doğruluk: kanal / merkez / kapı geometrisi MÜHÜRLÜ V9 (connectionBodygraphGeometry.ts, otomatik; elle
// değişmez); ön katman ölçeklenmez. Veri YALNIZ kayıtlı + doğrulanmış Connection sonucu ve (varsa) kayıtlı bireysel
// aktif kapılar (compositeModel). Klasik kural: her aktif kapı kanalın KENDİ yarısını kişinin rengine boyar
// (A mavi, B turuncu, ikisi → mavi boru üzerinde turuncu şerit). İki yarısı boyalı + bağlantı türü işareti =
// TANIMLI kanal; tek yarısı boyalı = YARIM kanal. Entegrasyon ağında (10 · 20 · 34 · 57) her kapı kendi kolunu
// boyar; ortak gövde yalnız gövdeden geçen bir kanal tanımlıysa boyanır.
//
// TEK KAYNAK: her ilkel `cbgElements` ile SVG öğe tanımlarına çevrilir; tarayıcıdaki etkileşimli React SVG
// (ConnectionBodygraph.tsx) ve Word'deki sunucu PNG'si (connectionBodygraphSvg → resvg) AYNI tanımları çizer.
// Yazı kalınlığı ince eş renkli konturla verilir (sunucuda yalnız Regular font var → iki çıktı aynı görünür).

import { CHANNELS } from "../engine/channels";
import { APP_CENTER_TO_ENGINE_CENTER } from "../normalize/hdAppCodes";
import {
  CBG_CENTERS,
  CBG_GATE_R,
  CBG_GATES,
  CBG_NET_ARM_OF_GATE,
  CBG_NET_ARMS,
  CBG_NET_CHANNELS,
  CBG_PIPE_EDGE,
  CBG_PIPE_W,
  CBG_PIPES,
} from "./connectionBodygraphGeometry";
import type { CompositeChannelState, CompositeModel, Holder } from "./compositeModel";
import type { ConnectionDynamic, HdConnectionResult } from "./connection";

export type Pt = { x: number; y: number };
export { CBG_GATE_R };

/** Tuval (referans oranı 4:5): V9 ön katmanı (0..440 × 0..650) olduğu gibi; çevresinde silüet ve ışık. */
export const CBG_VIEW = { x: -80, y: -80, width: 602, height: 752 } as const;
export const CBG_VIEWBOX = `${CBG_VIEW.x} ${CBG_VIEW.y} ${CBG_VIEW.width} ${CBG_VIEW.height}`;

export const CBG_PERSON_COLOR = { A: "#2563eb", B: "#f97316" } as const;
export const CBG_DYNAMIC_SHAPE: Readonly<Record<ConnectionDynamic, "diamond" | "triangle" | "square" | "circle">> = {
  Electromagnetic: "diamond",
  Dominance: "triangle",
  Compromise: "square",
  Companionship: "circle",
};

/** Boru dış genişliği: referanstaki belirgin boru (V9 çiziminin 9.8'i yerine; güzergâh aynı). Çakışma testi bu değerle. */
export const CBG_PIPE_FULL = 12.8;
const FULL = CBG_PIPE_FULL;
const BODY_W = 9.8;
const SHINE_W = 3.6;
void CBG_PIPE_EDGE;
void CBG_PIPE_W;
/** Boru tonları: kenar (koyu), gövde, ışık yansıması (orta şerit). */
const TUBE = {
  passive: { edge: "#9ba8cd", body: "#e6eaf5", shine: "#ffffff", shineOpacity: 1 },
  A: { edge: "#0b3aa6", body: "#1f63e6", shine: "#9cc3ff", shineOpacity: 0.95 },
  B: { edge: "#c94a00", body: "#ff7a0f", shine: "#ffd7a8", shineOpacity: 0.95 },
} as const;
const INK = "#1e2a78";
const CENTER_STROKE = "#3346c6";
const GATE_STROKE = "#4a5ed3";

/** Logo: referanstaki gibi sağ üstte, başın yanında. */
export const CBG_LOGO = { x: 396, y: -60, width: 108, height: 81 } as const;

// ── Statik tanımlar (degrade, filtre) — kullanıcı verisi içermez ─────────────────────────────────────────────
export const CBG_DEFS =
  // zemin ışığı
  `<radialGradient id="cbgHalo" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#eaf0ff" stop-opacity="0.75"/><stop offset="0.6" stop-color="#f3f6ff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="cbgDot" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#cfdcfb"/><stop offset="1" stop-color="#cfdcfb" stop-opacity="0"/></radialGradient>` +
  // silüet: kenarlarda mavi-lila, merkezde ışıklı
  `<linearGradient id="cbgBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8d3f6"/><stop offset="0.5" stop-color="#d2dcf8"/><stop offset="1" stop-color="#dce4fa"/></linearGradient>` +
  `<radialGradient id="cbgBodyLight" cx="0.5" cy="0.36" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
  `<linearGradient id="cbgBodySide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9eb0ea" stop-opacity="0.55"/><stop offset="0.14" stop-color="#9eb0ea" stop-opacity="0"/><stop offset="0.86" stop-color="#9eb0ea" stop-opacity="0"/><stop offset="1" stop-color="#9eb0ea" stop-opacity="0.55"/></linearGradient>` +
  `<radialGradient id="cbgHead" cx="0.46" cy="0.38" r="0.62"><stop offset="0" stop-color="#e9eefd"/><stop offset="0.7" stop-color="#d1daf7"/><stop offset="1" stop-color="#bfcbf2"/></radialGradient>` +
  `<filter id="cbgSoft" x="-0.05" y="-0.05" width="1.1" height="1.1"><feGaussianBlur stdDeviation="0.9"/></filter>` +
  `<radialGradient id="cbgShoulder" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
  `<filter id="cbgGlow" x="-0.2" y="-0.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="9"/></filter>` +
  // boru gölgesi + merkez kabartması
  `<filter id="cbgPipeShadow" x="-0.1" y="-0.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation="1.7"/></filter>` +
  `<filter id="cbgLift" x="-0.2" y="-0.2" width="1.4" height="1.4"><feDropShadow dx="0" dy="1.4" stdDeviation="1.6" flood-color="#1e2a78" flood-opacity="0.24"/></filter>` +
  `<linearGradient id="cbgCenterOpen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef1fb"/></linearGradient>` +
  `<linearGradient id="cbgCenterDef" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f3ff"/><stop offset="1" stop-color="#d9e0fd"/></linearGradient>` +
  // parlak kapı dolguları
  `<radialGradient id="cbgGateA" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#9cc2ff"/><stop offset="0.55" stop-color="#2f6cf0"/><stop offset="1" stop-color="#1640b8"/></radialGradient>` +
  `<radialGradient id="cbgGateB" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffd09c"/><stop offset="0.55" stop-color="#f97316"/><stop offset="1" stop-color="#c2410c"/></radialGradient>`;

// ── Silüet (arka katman): cinsiyetsiz, doğal oranlar; ince boyun, yuvarlak omuz, yanlarda kollar ────────────
const HEAD = "M 220 -72 C 262 -72 292 -41 292 4 C 292 41 285 70 272 90 C 260 108 241 118 220 119 C 199 118 180 108 168 90 C 155 70 148 41 148 4 C 148 -41 178 -72 220 -72 Z";
const EARS = "M 289 14 C 300 10 306 22 304 38 C 302 54 295 62 287 60 Z M 151 14 C 140 10 134 22 136 38 C 138 54 145 62 153 60 Z";
// Referans ölçüleri (1120×1400 px → birim: x·0.5375−80): boyun x 165–275, trapez eğimi omuz başına (22, 242), kol dış hattı x≈1–8,
// koltuk altı çizgisi x≈50–57; figür BodyGraph genişliğinde, kollar gövde yanında aşağı iner.
const BODY =
  "M 175 97 C 175 130 173 156 166 170 C 140 186 84 192 50 206 C 24 217 10 238 7 268 C 4 300 2 340 1 400 C 0 480 2 600 3 680 L 437 680 C 438 600 440 480 439 400 C 438 340 436 300 433 268 C 430 238 416 217 390 206 C 356 192 300 186 274 170 C 267 156 265 130 265 97 Z";
// Kollar (gövdeden hafif koyu; omuz başında ışık)
const ARMS =
  "M 22 242 C 14 262 10 280 8 300 C 4 350 1 400 1 460 C 1 540 2 610 3 680 L 52 680 C 50 610 49 540 50 460 C 51 400 54 350 57 316 C 48 290 36 262 22 242 Z " +
  "M 414 222 C 426 236 431 250 433 268 C 436 300 438 340 439 400 C 440 480 438 600 437 680 L 388 680 C 390 610 391 540 390 460 C 389 400 386 350 383 316 C 390 284 400 248 414 222 Z";
const ARM_LINE = "M 57 316 C 54 350 51 400 50 460 C 49 540 50 610 52 680 M 383 316 C 386 350 389 400 390 460 C 391 540 390 610 388 680";

export const CBG_SILHOUETTE_MARKUP =
  `<g data-cbg-silhouette="">` +
  // dış ışıma (yumuşak hale)
  `<g filter="url(#cbgGlow)" opacity="0.55"><path d="${BODY}" fill="none" stroke="#b4c3f3" stroke-width="12"/><path d="${HEAD}" fill="none" stroke="#b4c3f3" stroke-width="10"/></g>` +
  `<g filter="url(#cbgSoft)">` +
  `<path d="${BODY}" fill="url(#cbgBody)" fill-opacity="0.97"/>` +
  `<path d="${BODY}" fill="url(#cbgBodySide)"/>` +
  `<path d="${ARMS}" fill="#9fb1ea" fill-opacity="0.22"/>` +
  `<path d="${BODY}" fill="url(#cbgBodyLight)"/>` +
  `<ellipse cx="40" cy="240" rx="34" ry="24" fill="url(#cbgShoulder)"/><ellipse cx="400" cy="240" rx="34" ry="24" fill="url(#cbgShoulder)"/>` +
  `<path d="${ARM_LINE}" fill="none" stroke="#a8b8ec" stroke-width="2.4" stroke-opacity="0.55" stroke-linecap="round"/>` +
  `<path d="${EARS}" fill="#c8d2f3"/>` +
  `<path d="${HEAD}" fill="url(#cbgHead)"/>` +
  // kenar ışığı (referanstaki beyaz kontur parlaklığı)
  `<path d="${BODY}" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-opacity="0.7"/><path d="${HEAD}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.7"/>` +
  `</g></g>`;

/** Zemin: ışık halesi + ince yörünge halkaları ve noktalar (referanstaki derinlik). */
const ORBIT_C = { x: 220, y: 300 };
const ORBIT_R = [258, 292];
const ORBIT_DOTS: Array<[number, number]> = [[0, 198], [0, 342], [1, 222], [1, 318], [0, 262], [0, 278]];
export const CBG_BACKDROP_MARKUP =
  `<g data-cbg-backdrop="">` +
  `<ellipse cx="220" cy="300" rx="380" ry="420" fill="url(#cbgHalo)"/>` +
  ORBIT_R.map((r, i) => `<circle cx="${ORBIT_C.x}" cy="${ORBIT_C.y}" r="${r}" fill="none" stroke="#d6e0f8" stroke-width="${i ? 0.6 : 0.9}" stroke-opacity="0.9"/>`).join("") +
  ORBIT_DOTS.map(([ri, deg]) => {
    const a = (deg * Math.PI) / 180;
    const x = (ORBIT_C.x + ORBIT_R[ri] * Math.cos(a)).toFixed(1);
    const y = (ORBIT_C.y + ORBIT_R[ri] * Math.sin(a)).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="7" fill="url(#cbgDot)"/><circle cx="${x}" cy="${y}" r="2.6" fill="#e6edfd" stroke="#c4d2f6" stroke-width="0.6"/>`;
  }).join("") +
  `</g>`;

// ── Sahne ilkelleri ─────────────────────────────────────────────────────────────────────────────────────
export type Tone = "passive" | "A" | "B";
export type CbgPrim =
  | { k: "rect" }
  | { k: "backdrop" }
  | { k: "silhouette" }
  | { k: "shadows"; routes: string[] }
  | { k: "pipe"; points: string; part: "edge" | "body" | "shine"; cap: "butt" | "round" }
  | { k: "fill"; points: string; tone: "A" | "B"; stripe?: boolean; chs: string[] }
  | { k: "tick"; points: string; chs: string[] }
  | { k: "slot" }
  | { k: "marker"; d: string; ch: string; shape: "diamond" | "triangle" | "square" | "circle" }
  | { k: "center"; engine: string; points: string; defined: boolean }
  | { k: "text"; x: number; y: number; text: string; size: number; fill: string; spacing?: number; stroke: number; role: "center" | "gate" }
  | { k: "gate"; gate: number; x: number; y: number; holder: Holder | null }
  | { k: "logo" };

/** Grafiğe giren durum (kayıtlı sonuçtan; uydurma yok). */
export type CbgState = {
  gates: Record<number, Holder | null>;
  channels: Record<string, CompositeChannelState>;
  definedCenters: Set<string>;
  /** Yarım kanal / kişilerin tüm kapıları biliniyor mu (kaynak bireysel veri)? */
  full: boolean;
};

/** Tam model (kayıtlı bireysel kapılar + kayıtlı sonuç, birebir doğrulanmış). */
export function cbgStateFromModel(m: CompositeModel): CbgState {
  return {
    gates: m.gates,
    channels: m.channels,
    definedCenters: new Set(m.centers.filter((c) => c.defined).map((c) => APP_CENTER_TO_ENGINE_CENTER[c.code])),
    full: true,
  };
}

/** Yalnız kayıtlı sonuç (bireysel kaynak yoksa): tanımlı kanallar ve kapıları; yarım kanal bilinmez → çizilmez. */
export function cbgStateFromResult(r: HdConnectionResult): CbgState {
  const gates: Record<number, Holder | null> = {};
  for (let g = 1; g <= 64; g++) gates[g] = null;
  const merge = (cur: Holder | null, h: Holder): Holder => (!cur || cur === h ? h : "both");
  const channels: Record<string, CompositeChannelState> = {};
  for (const ch of CHANNELS) channels[ch.id] = { id: ch.id, state: "none" };
  for (const c of r.channels) {
    const lo = Math.min(c.gateA, c.gateB);
    const hi = Math.max(c.gateA, c.gateB);
    const h = (g: number): Holder | null => {
      const a = c.personAGates.includes(g);
      const b = c.personBGates.includes(g);
      return a && b ? "both" : a ? "A" : b ? "B" : null;
    };
    for (const g of [lo, hi]) {
      const x = h(g);
      if (x) gates[g] = x === "both" ? "both" : merge(gates[g], x);
    }
    const hA = h(lo);
    const hB = h(hi);
    if (hA && hB) channels[c.id] = { id: c.id, state: "defined", dynamic: c.dynamic, holderA: hA, holderB: hB, personAGates: [...c.personAGates], personBGates: [...c.personBGates] };
  }
  return {
    gates,
    channels,
    definedCenters: new Set(r.centers.filter((c) => c.defined).map((c) => APP_CENTER_TO_ENGINE_CENTER[c.code])),
    full: false,
  };
}

// ── Geometri yardımcıları ───────────────────────────────────────────────────────────────────────────────
const parse = (s: string): Pt[] => s.split(" ").map((q) => {
  const [x, y] = q.split(",");
  return { x: Number(x), y: Number(y) };
});
const f2 = (n: number) => n.toFixed(2);
const fmt = (p: Pt[]) => p.map((q) => `${f2(q.x)},${f2(q.y)}`).join(" ");
const plen = (p: Pt[]) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return s;
};
function pointAt(p: Pt[], d: number): Pt {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const s = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acc + s >= d) {
      const t = s ? (d - acc) / s : 0;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t };
    }
    acc += s;
  }
  return p[p.length - 1];
}
/** Yay uzunluğu aralığı [a, b] (ortak uç noktalar dahil). */
function slice(p: Pt[], a: number, b: number): Pt[] {
  const out: Pt[] = [pointAt(p, a)];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    acc += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acc > a && acc < b) out.push(p[i]);
  }
  out.push(pointAt(p, b));
  return out;
}
/** Yay uzunluğunun ortasından ikiye böl (ortak orta nokta iki yarıda da var). */
function splitHalf(p: Pt[]): [Pt[], Pt[], Pt] {
  const L = plen(p);
  return [slice(p, 0, L / 2), slice(p, L / 2, L), pointAt(p, L / 2)];
}
const join = (...parts: Pt[][]) =>
  parts.reduce<Pt[]>((acc, part) => {
    for (const q of part) {
      const l = acc.at(-1);
      if (!l || Math.hypot(q.x - l.x, q.y - l.y) > 1e-6) acc.push(q);
    }
    return acc;
  }, []);

const PIPE_PTS = new Map(CBG_PIPES.map(([id, s]) => [id, parse(s)]));
const ARM_PTS = new Map(CBG_NET_ARMS.map(([id, s]) => [id as string, parse(s)]));
const GATE_PT = new Map(CBG_GATES.map(([g, x, y]) => [g, { x, y }]));
const rev = (p: Pt[]) => [...p].reverse();

/** Kanalın tam güzergâhı (küçük kapı → büyük kapı). Etkileşim yüzeyi ve işaret konumu için. */
export function cbgChannelRoute(id: string): Pt[] {
  const p = PIPE_PTS.get(id);
  if (p) return p;
  const arms = CBG_NET_CHANNELS[id];
  if (!arms) return [];
  const [lo] = id.split("-").map(Number);
  // V9 ile aynı birleştirme: kollar düğüme doğru, gövde M→J; yön küçük kapıdan başlayacak biçimde düzeltilir.
  const seq = id === "10-20" ? [ARM_PTS.get("kol10")!, rev(ARM_PTS.get("kol20")!)] : id === "34-57" ? [rev(ARM_PTS.get("kol34")!), ARM_PTS.get("kol57")!] : arms.map((a) => ARM_PTS.get(a)!);
  const route = join(...seq);
  const start = GATE_PT.get(lo)!;
  return Math.hypot(route[0].x - start.x, route[0].y - start.y) > 0.01 ? rev(route) : route;
}
export const CBG_CHANNEL_IDS: readonly string[] = CHANNELS.map((c) => c.id);

const MARKER_GAP = 14;
const MARKER_GATE_GAP = CBG_GATE_R + 7;
/** Ortaya en yakın, başka işarete / kapıya çakışmayan konum (yoksa en ferah aday). */
function markerSpot(route: Pt[], placed: Pt[], gates: Pt[]): Pt {
  const L = plen(route);
  let best: Pt = pointAt(route, L / 2);
  let bestScore = -Infinity;
  for (const t of [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74, 0.2, 0.8]) {
    const q = pointAt(route, L * t);
    const dm = Math.min(Infinity, ...placed.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
    const dg = Math.min(...gates.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
    if (dm >= MARKER_GAP && dg >= MARKER_GATE_GAP) return q;
    const score = Math.min(dm / MARKER_GAP, dg / MARKER_GATE_GAP);
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

function markerPath(shape: "diamond" | "triangle" | "square" | "circle", x: number, y: number, s = 4.6): string {
  const n = (v: number) => +v.toFixed(2);
  switch (shape) {
    case "diamond": return `M ${n(x)} ${n(y - s)} L ${n(x + s)} ${n(y)} L ${n(x)} ${n(y + s)} L ${n(x - s)} ${n(y)} Z`;
    case "triangle": return `M ${n(x)} ${n(y - s)} L ${n(x + s)} ${n(y + s * 0.8)} L ${n(x - s)} ${n(y + s * 0.8)} Z`;
    case "square": { const q = s * 0.8; return `M ${n(x - q)} ${n(y - q)} H ${n(x + q)} V ${n(y + q)} H ${n(x - q)} Z`; }
    default: { const r = s * 0.85; return `M ${n(x - r)} ${n(y)} A ${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)} A ${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)} Z`; }
  }
}

/** Bir kanal yarısını kişi rengine boyayan dolgu(lar). Ortak kapı: mavi boru + turuncu şeritler. */
function fills(points: Pt[], h: Holder, chs: string[]): CbgPrim[] {
  const s = fmt(points);
  if (h === "both") return [{ k: "fill", points: s, tone: "A", chs }, { k: "fill", points: s, tone: "B", stripe: true, chs }];
  return [{ k: "fill", points: s, tone: h, chs }];
}

function halfHolders(st: CompositeChannelState): [Holder | null, Holder | null] {
  if (st.state === "defined" || st.state === "half") return [st.holderA, st.holderB];
  return [null, null];
}

const TICK_HALF = 1.1;

export function buildConnectionBodygraphScene(state: CbgState): CbgPrim[] {
  const out: CbgPrim[] = [{ k: "rect" }, { k: "backdrop" }, { k: "silhouette" }];
  // Boru gölgesi (tüm kanallar, tek katman)
  out.push({ k: "shadows", routes: [...CBG_PIPES.map(([, s]) => s), ...CBG_NET_ARMS.map(([, s]) => s)] });
  const pipe = (s: string): CbgPrim[] => [
    { k: "pipe", points: s, part: "edge", cap: "butt" },
    { k: "pipe", points: s, part: "body", cap: "butt" },
    { k: "pipe", points: s, part: "shine", cap: "butt" },
  ];
  const pipeFills = (id: string): CbgPrim[] => {
    const st = state.channels[id];
    const [hLo, hHi] = halfHolders(st);
    if (!hLo && !hHi) return [];
    const route = PIPE_PTS.get(id)!;
    const [a, b] = splitHalf(route);
    const L = plen(route);
    return [
      ...(hLo ? fills(a, hLo, [id]) : []),
      ...(hHi ? fills(b, hHi, [id]) : []),
      // yarı sınırı: ince beyaz ayraç (referanstaki gibi; iki yarı okunur)
      { k: "tick", points: fmt(slice(route, L / 2 - TICK_HALF, L / 2 + TICK_HALF)), chs: [id] },
    ];
  };

  // 1) 26-44 en altta (eksen borularının arkasından geçer) — V9 sırası.
  const pipeString = new Map(CBG_PIPES);
  out.push(...pipe(pipeString.get("26-44")!), ...pipeFills("26-44"));

  // 2) Entegrasyon ağı: önce tüm kenarlar, sonra gövdeler, sonra ışık (düğümde kesintisiz), sonra kişi renkleri.
  for (const part of ["edge", "body", "shine"] as const) for (const [, s] of CBG_NET_ARMS) out.push({ k: "pipe", points: s, part, cap: "round" });
  const netIds = Object.keys(CBG_NET_CHANNELS);
  const armChs = (arm: string, gate: number) => netIds.filter((id) => CBG_NET_CHANNELS[id].includes(arm) && id.split("-").map(Number).includes(gate));
  for (const [gate, arm] of Object.entries(CBG_NET_ARM_OF_GATE)) {
    const g = Number(gate);
    const h = state.gates[g];
    const inUse = netIds.some((id) => id.split("-").map(Number).includes(g) && state.channels[id].state !== "none");
    if (h && inUse) out.push(...fills(ARM_PTS.get(arm)!, h, armChs(arm, g)));
  }
  // Gövde: yalnız gövdeden geçen tanımlı kanal(lar) varsa; üst yarı 10/20 kapısının, alt yarı 34/57 kapısının sahibi.
  const merge = (cur: Holder | null, h: Holder): Holder => (!cur || cur === h ? h : "both");
  let up: Holder | null = null;
  let down: Holder | null = null;
  const trunkChs: string[] = [];
  for (const id of ["10-34", "10-57", "20-34", "20-57"]) {
    const st = state.channels[id];
    if (st.state !== "defined") continue;
    trunkChs.push(id);
    up = merge(up, st.holderA);
    down = merge(down, st.holderB);
  }
  if (up && down) {
    const [a, b] = splitHalf(ARM_PTS.get("govde")!);
    out.push(...fills(a, up, trunkChs), ...fills(b, down, trunkChs));
  }

  // 3) Diğer kanallar (V9 sırası): boru + kişi renkleri.
  for (const [id, s] of CBG_PIPES) {
    if (id === "26-44") continue;
    out.push(...pipe(s), ...pipeFills(id));
  }

  // 4) Seçim vurgusu + etkileşim yuvası.
  out.push({ k: "slot" });

  // 5) Tanımlı kanalların bağlantı türü işareti (çakışmasız).
  const placed: Pt[] = [];
  const gatePts = CBG_GATES.map(([, x, y]) => ({ x, y }));
  for (const id of CBG_CHANNEL_IDS) {
    const st = state.channels[id];
    if (st.state !== "defined") continue;
    const m = markerSpot(cbgChannelRoute(id), placed, gatePts);
    placed.push(m);
    out.push({ k: "marker", d: markerPath(CBG_DYNAMIC_SHAPE[st.dynamic], m.x, m.y), ch: id, shape: CBG_DYNAMIC_SHAPE[st.dynamic] });
  }

  // 6) Merkezler + adlar.
  for (const c of CBG_CENTERS) {
    out.push({ k: "center", engine: c.engine, points: c.points, defined: state.definedCenters.has(c.engine) });
    c.label.forEach((t, i) =>
      out.push({ k: "text", x: c.labelAt[0], y: +(c.labelAt[1] + (i - (c.label.length - 1) / 2) * 8.4).toFixed(1), text: t, size: c.label.length > 1 ? 6.2 : 7.4, fill: INK, spacing: 0.5, stroke: 0.32, role: "center" }),
    );
  }
  // 7) Kapılar.
  for (const [g, x, y] of CBG_GATES) {
    const h = state.gates[g] ?? null;
    out.push({ k: "gate", gate: g, x, y, holder: h });
    out.push({ k: "text", x, y: +(y + 2.35).toFixed(2), text: String(g), size: 6.4, fill: h ? "#ffffff" : INK, stroke: 0.18, role: "gate" });
  }
  out.push({ k: "logo" });
  return out;
}

// ── İlkel → SVG öğe tanımları (React ve sunucu ORTAK) ───────────────────────────────────────────────────────
export type CbgEl = { tag: "rect" | "polyline" | "path" | "polygon" | "circle" | "text" | "image" | "g"; attrs: Record<string, string | number>; text?: string; raw?: string };

const SHADOW_STYLE = { stroke: "#1e2a6e", opacity: 0.2, width: 12.5, dy: 1.9 };

export function cbgElements(p: CbgPrim, logoHref: string | null): CbgEl[] {
  switch (p.k) {
    case "rect":
      return [{ tag: "rect", attrs: { x: CBG_VIEW.x, y: CBG_VIEW.y, width: CBG_VIEW.width, height: CBG_VIEW.height, fill: "#ffffff" } }];
    case "backdrop":
      return [{ tag: "g", attrs: {}, raw: CBG_BACKDROP_MARKUP }];
    case "silhouette":
      return [{ tag: "g", attrs: {}, raw: CBG_SILHOUETTE_MARKUP }];
    case "shadows":
      return [{ tag: "g", attrs: { filter: "url(#cbgPipeShadow)", transform: `translate(0 ${SHADOW_STYLE.dy})`, opacity: SHADOW_STYLE.opacity }, raw: p.routes.map((s) => `<polyline points="${s}" fill="none" stroke="${SHADOW_STYLE.stroke}" stroke-width="${SHADOW_STYLE.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join("") }];
    case "pipe": {
      const t = TUBE.passive;
      const stroke = p.part === "edge" ? t.edge : p.part === "body" ? t.body : t.shine;
      const w = p.part === "edge" ? FULL : p.part === "body" ? BODY_W : SHINE_W;
      return [{ tag: "polyline", attrs: { points: p.points, fill: "none", stroke, strokeWidth: w, strokeLinecap: p.cap, strokeLinejoin: "round" } }];
    }
    case "fill": {
      const t = TUBE[p.tone];
      const dash: Record<string, string> = p.stripe ? { strokeDasharray: "5 5" } : {};
      // Çizgili (ortak kapı) şerit kenar çizmez: alttaki mavi borunun kenarı korunur.
      const els: CbgEl[] = [];
      if (!p.stripe) els.push({ tag: "polyline", attrs: { points: p.points, fill: "none", stroke: t.edge, strokeWidth: FULL, strokeLinecap: "butt", strokeLinejoin: "round" } });
      els.push({ tag: "polyline", attrs: { points: p.points, fill: "none", stroke: t.body, strokeWidth: BODY_W, strokeLinecap: "butt", strokeLinejoin: "round", ...dash } });
      els.push({ tag: "polyline", attrs: { points: p.points, fill: "none", stroke: t.shine, strokeOpacity: t.shineOpacity, strokeWidth: SHINE_W, strokeLinecap: "butt", strokeLinejoin: "round", ...dash } });
      return els;
    }
    case "tick":
      return [{ tag: "polyline", attrs: { points: p.points, fill: "none", stroke: "#ffffff", strokeWidth: FULL - 0.6, strokeLinecap: "butt" } }];
    case "slot":
      return [];
    case "marker":
      return [{ tag: "path", attrs: { d: p.d, fill: "#ffffff", stroke: INK, strokeWidth: 0.9, strokeLinejoin: "round" } }];
    case "center":
      return [{ tag: "polygon", attrs: { points: p.points, fill: p.defined ? "url(#cbgCenterDef)" : "url(#cbgCenterOpen)", stroke: CENTER_STROKE, strokeWidth: p.defined ? 2.1 : 1.8, strokeLinejoin: "round", filter: "url(#cbgLift)" } }];
    case "text":
      return [{
        tag: "text",
        attrs: { x: p.role === "gate" ? f2(p.x) : p.x.toFixed(1), y: p.role === "gate" ? f2(p.y) : p.y.toFixed(1), fontSize: p.size, ...(p.spacing ? { letterSpacing: p.spacing } : {}), textAnchor: "middle", fill: p.fill, stroke: p.fill, strokeWidth: p.stroke, strokeLinejoin: "round" },
        text: p.text,
      }];
    case "gate": {
      const r = CBG_GATE_R;
      const x = f2(p.x);
      const y = f2(p.y);
      if (p.holder === "both") {
        return [
          { tag: "path", attrs: { d: `M ${x} ${f2(p.y - r)} A ${r} ${r} 0 0 0 ${x} ${f2(p.y + r)} Z`, fill: "url(#cbgGateA)" } },
          { tag: "path", attrs: { d: `M ${x} ${f2(p.y - r)} A ${r} ${r} 0 0 1 ${x} ${f2(p.y + r)} Z`, fill: "url(#cbgGateB)" } },
          { tag: "circle", attrs: { cx: x, cy: y, r, fill: "none", stroke: "#ffffff", strokeWidth: 0.8 } },
        ];
      }
      if (p.holder) return [{ tag: "circle", attrs: { cx: x, cy: y, r, fill: p.holder === "A" ? "url(#cbgGateA)" : "url(#cbgGateB)", stroke: "#ffffff", strokeWidth: 0.8 } }];
      return [{ tag: "circle", attrs: { cx: x, cy: y, r, fill: "#ffffff", stroke: GATE_STROKE, strokeWidth: 0.95 } }];
    }
    case "logo":
      return logoHref ? [{ tag: "image", attrs: { href: logoHref, x: CBG_LOGO.x, y: CBG_LOGO.y, width: CBG_LOGO.width, height: CBG_LOGO.height, preserveAspectRatio: "xMidYMid meet" } }] : [];
  }
}

// ── SVG metni (Word / dışa aktarım) ─────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const KEEP_CAMEL = new Set(["preserveAspectRatio", "viewBox"]);
const kebab = (k: string) => (KEEP_CAMEL.has(k) ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
export function cbgElToSvg(e: CbgEl): string {
  const attrs = Object.entries(e.attrs).map(([k, v]) => ` ${kebab(k)}="${esc(String(v))}"`).join("");
  if (e.raw !== undefined) return `<${e.tag}${attrs}>${e.raw}</${e.tag}>`;
  if (e.text !== undefined) return `<${e.tag}${attrs}>${esc(e.text)}</${e.tag}>`;
  return `<${e.tag}${attrs}/>`;
}

export function connectionBodygraphSvg(prims: CbgPrim[], opts: { logoHref: string | null; fontFamily: string; width?: number; height?: number }): string {
  const o: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CBG_VIEWBOX}"${opts.width ? ` width="${opts.width}"` : ""}${opts.height ? ` height="${opts.height}"` : ""} font-family="${esc(opts.fontFamily)}">`,
    `<defs>${CBG_DEFS}</defs>`,
  ];
  for (const p of prims) for (const e of cbgElements(p, opts.logoHref)) o.push(cbgElToSvg(e));
  o.push("</svg>");
  return o.join("\n");
}
