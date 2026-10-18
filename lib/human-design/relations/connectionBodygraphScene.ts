// Connection (iki kişilik ilişki) BODYGRAPH SAHNESİ — SAF (DOM yok, ağ yok, hesap yok).
//
// Görünüm: owner'ın onayladığı premium referans (2026-10-18) — cinsiyetsiz, açık mavi-lila, yarı saydam insan
// silüeti; beyaz zemin; Yaşam Sistemi logosu. Kanal / merkez / kapı geometrisi: MÜHÜRLÜ V9
// (connectionBodygraphGeometry.ts, otomatik üretilmiş; elle değişmez). Ön katman ÖLÇEKLENMEZ; yalnız tuval
// silüete yer açacak biçimde genişletilmiştir (V9 koordinatları aynen).
//
// Veri: YALNIZ kayıtlı + doğrulanmış Connection sonucu ve (varsa) kayıtlı bireysel aktif kapılar
// (compositeModel). Klasik BodyGraph kuralı: her aktif kapı kanalın KENDİ yarısını kişinin rengine boyar
// (A mavi, B turuncu, ikisi → çizgili). İki yarısı boyalı + bağlantı türü işareti = birleşik haritada TANIMLI
// kanal; tek yarısı boyalı = YARIM kanal. Entegrasyon ağında (10 · 20 · 34 · 57) her kapı kendi kolunu boyar;
// ortak gövde yalnız gövdeden geçen bir kanal tanımlıysa boyanır (tek kapı gövdeyi boyamaz).
//
// Aynı sahne: tarayıcıda etkileşimli React SVG (ConnectionBodygraph.tsx) ve Word için SVG metni → PNG.

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

/** Tuval: V9 ön katmanı (0..440 × 0..650) olduğu gibi; çevresinde silüet için boşluk (referans oranı). */
export const CBG_VIEW = { x: -80, y: -86, width: 600, height: 766 } as const;
export const CBG_VIEWBOX = `${CBG_VIEW.x} ${CBG_VIEW.y} ${CBG_VIEW.width} ${CBG_VIEW.height}`;

export const CBG_PERSON_COLOR = { A: "#2563eb", B: "#ea580c" } as const;
export const CBG_DYNAMIC_SHAPE: Readonly<Record<ConnectionDynamic, "diamond" | "triangle" | "square" | "circle">> = {
  Electromagnetic: "diamond",
  Dominance: "triangle",
  Compromise: "square",
  Companionship: "circle",
};

// V9 kabuğu (mühürlü renkler).
const INK = "#1e1b4b";
const LINE = "#312e81";
const SOFT = "#4f46e5";
const LABEL = "#3730a3";
const PIPE_EDGE = "#5b6785";
const PIPE_IN = "#ffffff";
const FULL = CBG_PIPE_W + 2 * CBG_PIPE_EDGE;
const DEFINED_CENTER_FILL = "#dcd7fb";

/** Logo: referanstaki gibi sağ üst köşede, başın yanında. */
export const CBG_LOGO = { x: 404, y: -74, width: 104, height: 78 } as const;

// ── Silüet (yalnız arka katman; cinsiyetsiz, doğal oranlar, yumuşak mavi-lila degrade) ─────────────────────
// Baş: oval kafatası + kulaklar; boyun; eğimli trapez ve yuvarlak omuzlar; kollar gövde yanında, tuvalin
// altına uzanır. Göğüs / kas çizimi YOK. Kenarlar hafif bulanık (premium, sakin).
export const CBG_SILHOUETTE_DEFS =
  `<linearGradient id="cbgBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9def8"/><stop offset="0.55" stop-color="#e2e3fa"/><stop offset="1" stop-color="#e9e8fb"/></linearGradient>` +
  `<radialGradient id="cbgGlow" cx="0.5" cy="0.42" r="0.55"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="cbgHead" cx="0.5" cy="0.42" r="0.62"><stop offset="0" stop-color="#e6e9fb"/><stop offset="1" stop-color="#d3d9f5"/></radialGradient>` +
  `<filter id="cbgSoft" x="-0.05" y="-0.05" width="1.1" height="1.1"><feGaussianBlur stdDeviation="1.1"/></filter>`;

const HEAD = "M 220 -76 C 263 -76 294 -44 295 4 C 296 42 289 78 277 104 C 265 129 244 147 220 149 C 196 147 175 129 163 104 C 151 78 144 42 145 4 C 146 -44 177 -76 220 -76 Z";
const EARS = "M 293 18 C 303 16 307 28 305 44 C 303 60 297 70 290 70 Z M 147 18 C 137 16 133 28 135 44 C 137 60 143 70 150 70 Z";
const BODY =
  "M 177 112 C 179 142 178 166 172 182 C 162 196 132 201 98 207 C 54 215 22 238 13 282 C 6 322 2 400 0 482 C -2 560 -4 620 -6 700 " +
  "L 446 700 C 444 620 442 560 440 482 C 438 400 434 322 427 282 C 418 238 386 215 342 207 C 308 201 278 196 268 182 C 262 166 261 142 263 112 Z";
// Kol ile gövde arasındaki çok hafif ayrım (gölge çizgisi).
const ARM_SHADE = "M 44 300 C 50 380 52 470 48 560 C 46 610 45 650 45 700 M 396 300 C 390 380 388 470 392 560 C 394 610 395 650 395 700";

export const CBG_SILHOUETTE_MARKUP =
  `<g filter="url(#cbgSoft)" data-cbg-silhouette="">` +
  `<path d="${BODY}" fill="url(#cbgBody)" fill-opacity="0.92"/>` +
  `<path d="${BODY}" fill="url(#cbgGlow)"/>` +
  `<path d="${ARM_SHADE}" fill="none" stroke="#c8cdf0" stroke-width="5" stroke-opacity="0.55" stroke-linecap="round"/>` +
  `<path d="${EARS}" fill="#d6dbf6"/>` +
  `<path d="${HEAD}" fill="url(#cbgHead)" fill-opacity="0.95"/>` +
  `</g>`;

// ── Sahne ilkelleri ─────────────────────────────────────────────────────────────────────────────────────
export type CbgPrim =
  | { k: "rect"; fill: string }
  | { k: "silhouette" }
  | { k: "pipe"; points: string; part: "edge" | "inner"; cap: "butt" | "round" }
  | { k: "fill"; points: string; color: string; dash?: string; cap: "butt" | "round"; chs: string[] }
  | { k: "slot" }
  | { k: "marker"; d: string; ch: string; shape: "diamond" | "triangle" | "square" | "circle" }
  | { k: "center"; engine: string; points: string; defined: boolean }
  | { k: "text"; x: number; y: number; text: string; size: number; weight: number; fill: string; spacing?: number; role: "center" | "gate" }
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
/** Yay uzunluğunun ortasından ikiye böl (ortak orta nokta iki yarıda da var). */
function splitHalf(p: Pt[]): [Pt[], Pt[], Pt] {
  const half = plen(p) / 2;
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const s = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acc + s >= half) {
      const t = s ? (half - acc) / s : 0;
      const m = { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t };
      return [[...p.slice(0, i), m], [m, ...p.slice(i)], m];
    }
    acc += s;
  }
  const m = p[p.length - 1];
  return [p, [m], m];
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

function markerPath(shape: "diamond" | "triangle" | "square" | "circle", x: number, y: number, s = 4.8): string {
  const n = (v: number) => +v.toFixed(2);
  switch (shape) {
    case "diamond": return `M ${n(x)} ${n(y - s)} L ${n(x + s)} ${n(y)} L ${n(x)} ${n(y + s)} L ${n(x - s)} ${n(y)} Z`;
    case "triangle": return `M ${n(x)} ${n(y - s)} L ${n(x + s)} ${n(y + s * 0.8)} L ${n(x - s)} ${n(y + s * 0.8)} Z`;
    case "square": { const q = s * 0.8; return `M ${n(x - q)} ${n(y - q)} H ${n(x + q)} V ${n(y + q)} H ${n(x - q)} Z`; }
    default: { const r = s * 0.85; return `M ${n(x - r)} ${n(y)} A ${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)} A ${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)} Z`; }
  }
}

/** Bir kanal yarısını kişi rengine boyayan dolgu(lar). Ortak kapı: mavi zemin + turuncu çizgiler (düz uçlu, şeritler net). */
function fills(points: Pt[], h: Holder, cap: "butt" | "round", chs: string[]): CbgPrim[] {
  const s = fmt(points);
  if (h === "both") return [{ k: "fill", points: s, color: CBG_PERSON_COLOR.A, cap, chs }, { k: "fill", points: s, color: CBG_PERSON_COLOR.B, dash: "5 5", cap: "butt", chs }];
  return [{ k: "fill", points: s, color: CBG_PERSON_COLOR[h], cap, chs }];
}

/** Kanalın kapı tarafındaki yarılarının sahibi (tanımlı: iki yarı; yarım: yalnız aktif kapı). */
function halfHolders(st: CompositeChannelState): [Holder | null, Holder | null] {
  if (st.state === "defined") return [st.holderA, st.holderB];
  if (st.state === "half") return [st.holderA, st.holderB];
  return [null, null];
}

export function buildConnectionBodygraphScene(state: CbgState): CbgPrim[] {
  const out: CbgPrim[] = [{ k: "rect", fill: "#ffffff" }, { k: "silhouette" }];
  const pipe = (pts: Pt[] | string, cap: "butt" | "round" = "butt"): CbgPrim[] => {
    const s = typeof pts === "string" ? pts : fmt(pts);
    return [{ k: "pipe", points: s, part: "edge", cap }, { k: "pipe", points: s, part: "inner", cap }];
  };
  const pipeFills = (id: string): CbgPrim[] => {
    const st = state.channels[id];
    const [hLo, hHi] = halfHolders(st);
    if (!hLo && !hHi) return [];
    const [a, b] = splitHalf(PIPE_PTS.get(id)!);
    return [...(hLo ? fills(a, hLo, "butt", [id]) : []), ...(hHi ? fills(b, hHi, "butt", [id]) : [])];
  };
  const pipeString = new Map(CBG_PIPES);

  // 1) 26-44 en altta (eksen borularının arkasından geçer) — V9 sırası.
  out.push(...pipe(pipeString.get("26-44")!), ...pipeFills("26-44"));

  // 2) Entegrasyon ağı: önce tüm kenarlar, sonra tüm iç dolgular (düğümde kesintisiz), sonra kişi renkleri.
  for (const [, s] of CBG_NET_ARMS) out.push({ k: "pipe", points: s, part: "edge", cap: "round" });
  for (const [, s] of CBG_NET_ARMS) out.push({ k: "pipe", points: s, part: "inner", cap: "round" });
  const netIds = Object.keys(CBG_NET_CHANNELS);
  const armChs = (arm: string) => netIds.filter((id) => CBG_NET_CHANNELS[id].includes(arm));
  for (const [gate, arm] of Object.entries(CBG_NET_ARM_OF_GATE)) {
    const h = state.gates[Number(gate)];
    // Kapı kendi kolunu, yalnız o kapı ağdaki bir kanalda (tanımlı ya da yarım) yer alıyorsa boyar.
    const inUse = netIds.some((id) => id.split("-").map(Number).includes(Number(gate)) && state.channels[id].state !== "none");
    if (h && inUse) out.push(...fills(ARM_PTS.get(arm)!, h, "round", armChs(arm).filter((id) => id.split("-").map(Number).includes(Number(gate)))));
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
    out.push(...fills(a, up, "round", trunkChs), ...fills(b, down, "round", trunkChs));
  }

  // 3) Diğer kanallar (V9 sırası): boru + kişi renkleri.
  for (const [id, s] of CBG_PIPES) {
    if (id === "26-44") continue;
    out.push(...pipe(s), ...pipeFills(id));
  }

  // 4) Seçim vurgusu yuvası (etkileşimli çizimde seçili kanal buraya çizilir).
  out.push({ k: "slot" });

  // 5) Tanımlı kanalların bağlantı türü işareti: kanal ortası; entegrasyon ağında ortak parçalarda üst üste
  //    binmesin diye güzergâh boyunca ortaya en yakın boş konum (kapılardan ve diğer işaretlerden uzak).
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
    const defined = state.definedCenters.has(c.engine);
    out.push({ k: "center", engine: c.engine, points: c.points, defined });
    c.label.forEach((t, i) =>
      out.push({ k: "text", x: c.labelAt[0], y: +(c.labelAt[1] + (i - (c.label.length - 1) / 2) * 8.2).toFixed(1), text: t, size: c.label.length > 1 ? 6 : 7, weight: 700, fill: LABEL, spacing: 0.7, role: "center" }),
    );
  }
  // 7) Kapılar.
  for (const [g, x, y] of CBG_GATES) {
    const h = state.gates[g] ?? null;
    out.push({ k: "gate", gate: g, x, y, holder: h });
    out.push({ k: "text", x, y: +(y + 2.45).toFixed(2), text: String(g), size: 6.6, weight: 700, fill: h ? "#ffffff" : INK, role: "gate" });
  }
  out.push({ k: "logo" });
  return out;
}

// ── SVG metni (Word / dışa aktarım). React çizimi aynı ilkelleri aynı biçimde kullanır. ─────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const cbgPipeAttrs = (p: Extract<CbgPrim, { k: "pipe" }>) => ({
  stroke: p.part === "edge" ? PIPE_EDGE : PIPE_IN,
  strokeWidth: p.part === "edge" ? FULL : CBG_PIPE_W,
});
export const CBG_FILL_WIDTH = CBG_PIPE_W;
export const cbgCenterAttrs = (defined: boolean) => ({ fill: defined ? DEFINED_CENTER_FILL : "#ffffff", stroke: LINE, strokeWidth: defined ? 2.2 : 1.7 });
export const cbgGateHalfPaths = (x: number, y: number) => {
  const r = CBG_GATE_R;
  return {
    left: `M ${f2(x)} ${f2(y - r)} A ${r} ${r} 0 0 0 ${f2(x)} ${f2(y + r)} Z`,
    right: `M ${f2(x)} ${f2(y - r)} A ${r} ${r} 0 0 1 ${f2(x)} ${f2(y + r)} Z`,
  };
};
export const CBG_GATE_STROKE = SOFT;
export const CBG_MARKER_STYLE = { fill: "#ffffff", stroke: INK, strokeWidth: 1.4 } as const;

export function connectionBodygraphSvg(prims: CbgPrim[], opts: { logoHref: string | null; fontFamily: string; width?: number; height?: number }): string {
  const o: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CBG_VIEWBOX}"${opts.width ? ` width="${opts.width}"` : ""}${opts.height ? ` height="${opts.height}"` : ""} font-family="${esc(opts.fontFamily)}">`,
    `<defs>${CBG_SILHOUETTE_DEFS}</defs>`,
  ];
  for (const p of prims) {
    switch (p.k) {
      case "rect":
        o.push(`<rect x="${CBG_VIEW.x}" y="${CBG_VIEW.y}" width="${CBG_VIEW.width}" height="${CBG_VIEW.height}" fill="${p.fill}"/>`);
        break;
      case "silhouette":
        o.push(CBG_SILHOUETTE_MARKUP);
        break;
      case "pipe": {
        const a = cbgPipeAttrs(p);
        o.push(`<polyline points="${p.points}" fill="none" stroke="${a.stroke}" stroke-width="${a.strokeWidth}" stroke-linecap="${p.cap}" stroke-linejoin="round"/>`);
        break;
      }
      case "fill":
        o.push(`<polyline points="${p.points}" fill="none" stroke="${p.color}" stroke-width="${CBG_FILL_WIDTH}" stroke-linecap="${p.cap}" stroke-linejoin="round"${p.dash ? ` stroke-dasharray="${p.dash}"` : ""}/>`);
        break;
      case "slot":
        break;
      case "marker":
        o.push(`<path d="${p.d}" fill="${CBG_MARKER_STYLE.fill}" stroke="${CBG_MARKER_STYLE.stroke}" stroke-width="${CBG_MARKER_STYLE.strokeWidth}" stroke-linejoin="round"/>`);
        break;
      case "center": {
        const a = cbgCenterAttrs(p.defined);
        o.push(`<polygon points="${p.points}" fill="${a.fill}" stroke="${a.stroke}" stroke-width="${a.strokeWidth}" stroke-linejoin="round"/>`);
        break;
      }
      case "text":
        o.push(`<text x="${p.role === "gate" ? f2(p.x) : p.x.toFixed(1)}" y="${p.role === "gate" ? f2(p.y) : p.y.toFixed(1)}" font-size="${p.size}" font-weight="${p.weight}"${p.spacing ? ` letter-spacing="${p.spacing}"` : ""} text-anchor="middle" fill="${p.fill}">${esc(p.text)}</text>`);
        break;
      case "gate": {
        if (p.holder === "both") {
          const h = cbgGateHalfPaths(p.x, p.y);
          o.push(`<path d="${h.left}" fill="${CBG_PERSON_COLOR.A}"/><path d="${h.right}" fill="${CBG_PERSON_COLOR.B}"/>`);
          o.push(`<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${CBG_GATE_R}" fill="none" stroke="${CBG_GATE_STROKE}" stroke-width="1"/>`);
        } else {
          o.push(`<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${CBG_GATE_R}" fill="${p.holder ? CBG_PERSON_COLOR[p.holder] : "#ffffff"}" stroke="${CBG_GATE_STROKE}" stroke-width="1"/>`);
        }
        break;
      }
      case "logo":
        if (opts.logoHref) o.push(`<image href="${esc(opts.logoHref)}" x="${CBG_LOGO.x}" y="${CBG_LOGO.y}" width="${CBG_LOGO.width}" height="${CBG_LOGO.height}" preserveAspectRatio="xMidYMid meet"/>`);
        break;
    }
  }
  o.push("</svg>");
  return o.join("\n");
}
