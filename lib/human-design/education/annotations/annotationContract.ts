// Human Design — Eğitim Çalışma Alanı · ÇİZİM / NOT KATMANI SÖZLEŞMESİ (FAZ 8). İstemci + sunucu ORTAK (saf, yan etkisiz).
//
// KOORDİNAT SİSTEMİ: onaylı BodyGraph'ın SABİT SVG koordinatları (CBG_VIEW: viewBox -80 -80 602 752). Ekran pikseli
// SAKLANMAZ → 1440 / 1024 / 820 / 768 / 430 / 390 / 360 / 320 px'te aynı öğe aynı kapı / merkez üzerinde kalır.
// FAZ 13 (owner incelemesi): çizim TUVALİ BodyGraph'ın iki yanındaki boş çalışma alanını da kapsar (ANN_CANVAS: BodyGraph
// görünümü + her yanda 160 birim; 1440 px masaüstünde BodyGraph eski boyutunda kalır). BodyGraph bölgesinin koordinatları DEĞİŞMEDİ → eski kayıtlı çizimler aynı yerde kalır.
// Baloncuk ve metin notu ayrıca SEMANTİK ÇAPA taşıyabilir (kapı 1–64 / kanal / merkez): o durumda x,y çapaya göre KAYMADIR;
// çapa konumu her çizimde güncel BodyGraph geometrisinden (ön katman ölçeği dahil) hesaplanır. Daire ve ok ise tuval
// koordinatında çizilir; işaretledikleri kapı / kanal / merkezin ANLAMLI HEDEF KİMLİĞİ ayrıca saklanır (a / a1·a2).
// Belge ayrıca haritaya ait serbest "eğitim notları" metnini taşır (notes).
//
// GÜVENLİK: belge yalnız aşağıdaki şemayı kabul eder (bilinmeyen alan / tür → RED). Metinlerde '<' ve '>' YASAK
// (DB kısıtı da reddeder); kontrol karakterleri yasak. İstemci metni YALNIZ React metin düğümü olarak çizer
// (innerHTML YOK). Sınırlar: ≤ 400 öğe, kalem izi ≤ 1000 nokta, baloncuk notu ≤ 4000, eğitim notları ≤ 20 000, metin ≤ 300
// karakter, belge ≤ 200 000 karakter (DB kısıtıyla aynı).

import { CBG_CENTERS, CBG_GATES } from "@/lib/human-design/relations/connectionBodygraphGeometry";
import { CBG_CHANNEL_IDS, CBG_FRONT_CENTER, CBG_VIEW, cbgChannelRoute } from "@/lib/human-design/relations/connectionBodygraphScene";

export const ANN_MAX_ELS = 400;
export const ANN_MAX_PEN_POINTS = 1000;
export const ANN_MAX_NOTE = 4000;
export const ANN_MAX_TEXT = 300;
export const ANN_MAX_NOTES = 20_000;
export const ANN_MAX_DOC_CHARS = 200_000;
export const ANN_MAX_JSON_BYTES = 256 * 1024;

export const ANN_COLORS = {
  ink: "#1e293b",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#059669",
  amber: "#d97706",
  violet: "#7c3aed",
} as const;
export type AnnColor = keyof typeof ANN_COLORS;
export const ANN_COLOR_LABEL: Record<AnnColor, string> = { ink: "Lacivert", red: "Kırmızı", blue: "Mavi", green: "Yeşil", amber: "Turuncu", violet: "Mor" };
export const ANN_WIDTHS = [2, 4, 7] as const;
export type AnnWidth = (typeof ANN_WIDTHS)[number];
export const ANN_TEXT_SIZES = [14, 18, 24] as const;
export type AnnTextSize = (typeof ANN_TEXT_SIZES)[number];

export const ANN_CENTER_IDS = ["Head", "Ajna", "Throat", "G", "Heart", "Sacral", "Root", "Spleen", "SolarPlexus"] as const;
export type AnnCenterId = (typeof ANN_CENTER_IDS)[number];
export const ANN_CENTER_LABEL: Record<AnnCenterId, string> = {
  Head: "Baş", Ajna: "Ajna", Throat: "Boğaz", G: "G", Heart: "Kalp", Sacral: "Sakral", Root: "Kök", Spleen: "Dalak", SolarPlexus: "Solar Pleksus",
};

/** Çizim tuvali: BodyGraph görünümü (CBG_VIEW) + iki yanda ANN_CANVAS_SIDE birim boş çalışma alanı (sabit; ekrandan bağımsız). */
export const ANN_CANVAS_SIDE = 160;
export const ANN_CANVAS = { x: CBG_VIEW.x - ANN_CANVAS_SIDE, y: CBG_VIEW.y, width: CBG_VIEW.width + 2 * ANN_CANVAS_SIDE, height: CBG_VIEW.height } as const;
export const ANN_CANVAS_VIEWBOX = `${ANN_CANVAS.x} ${ANN_CANVAS.y} ${ANN_CANVAS.width} ${ANN_CANVAS.height}`;
/** BodyGraph'ın tuval içindeki yeri (yüzde) — iki SVG aynı koordinat düzleminde hizalanır. */
export const ANN_BG_BOX = {
  left: (ANN_CANVAS_SIDE / ANN_CANVAS.width) * 100, width: (CBG_VIEW.width / ANN_CANVAS.width) * 100,
} as const;

/** Baloncuk: numara dairesi yarıçapı (varsayılan 13) ve "metin baloncuk içinde" kutusu (varsayılan 220 × 120). */
export const ANN_BUBBLE_R = { min: 8, def: 13, max: 48 } as const;
export const ANN_BOX = { minW: 80, defW: 220, maxW: 600, minH: 40, defH: 120, maxH: 600 } as const;

export type AnnAnchor = { k: "g"; id: number } | { k: "c"; id: AnnCenterId } | { k: "h"; id: string };
export type AnnEl =
  | { id: string; t: "pen"; c: AnnColor; w: AnnWidth; p: number[] }
  | { id: string; t: "arrow"; c: AnnColor; w: AnnWidth; x1: number; y1: number; x2: number; y2: number; a1: AnnAnchor | null; a2: AnnAnchor | null }
  | { id: string; t: "circle"; c: AnnColor; w: AnnWidth; x: number; y: number; r: number; f: boolean; a: AnnAnchor | null }
  /** r: numara dairesi yarıçapı; m "in": not metni haritada kutu içinde (bw × bh) gösterilir; yoksa açılır not (varsayılan). */
  | { id: string; t: "bubble"; c: AnnColor; x: number; y: number; a: AnnAnchor | null; n: string; r?: number; m?: "in"; bw?: number; bh?: number }
  | { id: string; t: "text"; c: AnnColor; x: number; y: number; a: AnnAnchor | null; s: string; z: AnnTextSize };
export type AnnDoc = { v: 1; els: AnnEl[]; notes: string };
export type AnnSourceKind = "central" | "private";

export const ANN_EMPTY_DOC: AnnDoc = { v: 1, els: [], notes: "" };

// ── Geometri ─────────────────────────────────────────────────────────────────────────────────────
export type AnnFront = { scale: number; cy: number } | null | undefined;
const VX0 = ANN_CANVAS.x, VY0 = ANN_CANVAS.y, VX1 = ANN_CANVAS.x + ANN_CANVAS.width, VY1 = ANN_CANVAS.y + ANN_CANVAS.height;

/** Ön katman (kanallar / merkezler / kapılar) yerel koordinatı → tuval (viewBox) koordinatı (cbgFrontTransform ile aynı). */
export function frontToView(x: number, y: number, front: AnnFront): { x: number; y: number } {
  if (!front || (front.scale === 1 && front.cy === CBG_FRONT_CENTER.y)) return { x, y };
  const tx = CBG_FRONT_CENTER.x * (1 - front.scale);
  const ty = front.cy - CBG_FRONT_CENTER.y * front.scale;
  return { x: tx + x * front.scale, y: ty + y * front.scale };
}

const GATE_POS = new Map<number, { x: number; y: number }>(CBG_GATES.map(([g, x, y]) => [g, { x, y }]));
const CENTER_POS = new Map<string, { x: number; y: number }>(CBG_CENTERS.map((c) => {
  const pts = c.points.split(" ").map((p) => p.split(",").map(Number));
  return [c.engine, { x: pts.reduce((a, p) => a + p[0], 0) / pts.length, y: pts.reduce((a, p) => a + p[1], 0) / pts.length }];
}));

const CHANNEL_SET = new Set(CBG_CHANNEL_IDS);
/** Kanal güzergâhının (ön katman yerel) orta noktası. */
function channelMid(id: string): { x: number; y: number } | null {
  const r = cbgChannelRoute(id);
  if (r.length < 2) return null;
  const seg = r.slice(1).map((p, i) => Math.hypot(p.x - r[i].x, p.y - r[i].y));
  let half = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i]) { const t = seg[i] ? half / seg[i] : 0; return { x: r[i].x + (r[i + 1].x - r[i].x) * t, y: r[i].y + (r[i + 1].y - r[i].y) * t }; }
    half -= seg[i];
  }
  return r[r.length - 1];
}
/** Tuval noktasının kanal güzergâhına (tuval koordinatında) en kısa uzaklığı. */
function channelDist(id: string, x: number, y: number, front: AnnFront): number {
  const r = cbgChannelRoute(id).map((p) => frontToView(p.x, p.y, front));
  let best = Infinity;
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

/** Çapanın GÜNCEL tuval konumu (geometri değişse bile not çapasıyla birlikte hareket eder). */
export function anchorPoint(a: AnnAnchor, front: AnnFront): { x: number; y: number } | null {
  const p = a.k === "g" ? GATE_POS.get(a.id) : a.k === "c" ? CENTER_POS.get(a.id) : channelMid(a.id);
  return p ? frontToView(p.x, p.y, front) : null;
}

/** Tuval noktasına en yakın kapı / merkez (eşik içinde) → semantik çapa; yoksa null. */
export function nearestAnchor(x: number, y: number, front: AnnFront, maxDist = 34): AnnAnchor | null {
  let best: { a: AnnAnchor; d: number } | null = null;
  for (const [g] of CBG_GATES) {
    const p = anchorPoint({ k: "g", id: g }, front)!;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= maxDist * 0.6 && (!best || d < best.d)) best = { a: { k: "g", id: g }, d };
  }
  if (best) return best.a;
  // Kanal: güzergâha yakınlık (kapıların dışında, boru üzerinde).
  for (const id of CBG_CHANNEL_IDS) {
    const d = channelDist(id, x, y, front);
    if (d <= 9 && (!best || d < best.d)) best = { a: { k: "h", id }, d };
  }
  if (best) return best.a;
  for (const id of ANN_CENTER_IDS) {
    const p = anchorPoint({ k: "c", id }, front)!;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= maxDist * 1.6 && (!best || d < best.d)) best = { a: { k: "c", id }, d };
  }
  return best?.a ?? null;
}

/** Öğenin tuvaldeki konumu (çapa varsa çapa + kayma). */
export function elPosition(el: Extract<AnnEl, { t: "bubble" | "text" }>, front: AnnFront): { x: number; y: number } {
  if (el.a) {
    const p = anchorPoint(el.a, front);
    if (p) return { x: p.x + el.x, y: p.y + el.y };
  }
  return { x: el.x, y: el.y };
}

export function anchorLabel(a: AnnAnchor | null): string | null {
  if (!a) return null;
  return a.k === "g" ? `Kapı ${a.id}` : a.k === "h" ? `Kanal ${a.id}` : `${ANN_CENTER_LABEL[a.id]} merkezi`;
}

// ── Doğrulama (sunucu: KESİN; istemci: aynı kural) ───────────────────────────────────────────────
const ID_RE = /^[a-z0-9-]{4,40}$/;
const BAD_TEXT_RE = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const round1 = (n: number) => Math.round(n * 10) / 10;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inX = (v: unknown): v is number => isNum(v) && v >= VX0 && v <= VX1;
const inY = (v: unknown): v is number => isNum(v) && v >= VY0 && v <= VY1;
const inOff = (v: unknown): v is number => isNum(v) && Math.abs(v) <= 700;

export type AnnParse = { ok: true; doc: AnnDoc } | { ok: false; field: string };

function cleanText(v: unknown, max: number, multiline: boolean): string | null {
  if (typeof v !== "string") return null;
  const t = multiline ? v.replace(/\r\n?/g, "\n") : v;
  if (t.length > max || BAD_TEXT_RE.test(t) || (!multiline && t.includes("\n"))) return null;
  return t;
}

function parseAnchor(v: unknown): AnnAnchor | null | undefined {
  if (v === null || v === undefined) return null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "k" && k !== "id")) return undefined;
  if (o.k === "g" && Number.isInteger(o.id) && (o.id as number) >= 1 && (o.id as number) <= 64) return { k: "g", id: o.id as number };
  if (o.k === "c" && typeof o.id === "string" && (ANN_CENTER_IDS as readonly string[]).includes(o.id)) return { k: "c", id: o.id as AnnCenterId };
  if (o.k === "h" && typeof o.id === "string" && CHANNEL_SET.has(o.id)) return { k: "h", id: o.id };
  return undefined;
}

const KEYS: Record<AnnEl["t"], readonly string[]> = {
  pen: ["id", "t", "c", "w", "p"],
  arrow: ["id", "t", "c", "w", "x1", "y1", "x2", "y2", "a1", "a2"],
  circle: ["id", "t", "c", "w", "x", "y", "r", "f", "a"],
  bubble: ["id", "t", "c", "x", "y", "a", "n", "r", "m", "bw", "bh"],
  text: ["id", "t", "c", "x", "y", "a", "s", "z"],
};

export function parseAnnEl(v: unknown, i: number): AnnEl | string {
  const f = (name: string) => `els[${i}].${name}`;
  if (!v || typeof v !== "object" || Array.isArray(v)) return `els[${i}]`;
  const o = v as Record<string, unknown>;
  const t = o.t;
  if (typeof t !== "string" || !(t in KEYS)) return f("t");
  const allowed = KEYS[t as AnnEl["t"]];
  const extra = Object.keys(o).find((k) => !allowed.includes(k));
  if (extra) return f(extra);
  if (typeof o.id !== "string" || !ID_RE.test(o.id)) return f("id");
  if (typeof o.c !== "string" || !(o.c in ANN_COLORS)) return f("c");
  const id = o.id, c = o.c as AnnColor;
  const w = o.w as AnnWidth;
  switch (t) {
    case "pen": {
      if (!(ANN_WIDTHS as readonly number[]).includes(w)) return f("w");
      if (!Array.isArray(o.p) || o.p.length < 2 || o.p.length % 2 !== 0 || o.p.length > ANN_MAX_PEN_POINTS * 2) return f("p");
      const p: number[] = [];
      for (let k = 0; k < o.p.length; k += 2) {
        if (!inX(o.p[k]) || !inY(o.p[k + 1])) return f("p");
        p.push(round1(o.p[k] as number), round1(o.p[k + 1] as number));
      }
      return { id, t, c, w, p };
    }
    case "arrow": {
      if (!(ANN_WIDTHS as readonly number[]).includes(w)) return f("w");
      if (!inX(o.x1) || !inY(o.y1) || !inX(o.x2) || !inY(o.y2)) return f("xy");
      const a1 = parseAnchor(o.a1), a2 = parseAnchor(o.a2);
      if (a1 === undefined) return f("a1");
      if (a2 === undefined) return f("a2");
      return { id, t, c, w, x1: round1(o.x1), y1: round1(o.y1), x2: round1(o.x2), y2: round1(o.y2), a1, a2 };
    }
    case "circle": {
      if (!(ANN_WIDTHS as readonly number[]).includes(w)) return f("w");
      if (!inX(o.x) || !inY(o.y)) return f("xy");
      if (!isNum(o.r) || o.r < 3 || o.r > 400) return f("r");
      if (typeof o.f !== "boolean") return f("f");
      const a = parseAnchor(o.a);
      if (a === undefined) return f("a");
      return { id, t, c, w, x: round1(o.x), y: round1(o.y), r: round1(o.r), f: o.f, a };
    }
    case "bubble":
    case "text": {
      const a = parseAnchor(o.a);
      if (a === undefined) return f("a");
      if (a ? !inOff(o.x) || !inOff(o.y) : !inX(o.x) || !inY(o.y)) return f("xy");
      if (t === "bubble") {
        const n = cleanText(o.n, ANN_MAX_NOTE, true);
        if (n === null) return f("n");
        const b: Extract<AnnEl, { t: "bubble" }> = { id, t, c, x: round1(o.x as number), y: round1(o.y as number), a, n };
        if (o.r !== undefined) { if (!isNum(o.r) || o.r < ANN_BUBBLE_R.min || o.r > ANN_BUBBLE_R.max) return f("r"); b.r = round1(o.r); }
        if (o.m !== undefined) { if (o.m !== "in") return f("m"); b.m = "in"; }
        if (o.bw !== undefined) { if (!isNum(o.bw) || o.bw < ANN_BOX.minW || o.bw > ANN_BOX.maxW) return f("bw"); b.bw = round1(o.bw); }
        if (o.bh !== undefined) { if (!isNum(o.bh) || o.bh < ANN_BOX.minH || o.bh > ANN_BOX.maxH) return f("bh"); b.bh = round1(o.bh); }
        return b;
      }
      const s = cleanText(o.s, ANN_MAX_TEXT, false);
      if (s === null || s.trim() === "") return f("s");
      if (!(ANN_TEXT_SIZES as readonly number[]).includes(o.z as number)) return f("z");
      return { id, t, c, x: round1(o.x as number), y: round1(o.y as number), a, s, z: o.z as AnnTextSize };
    }
  }
  return f("t");
}

export function parseAnnDoc(v: unknown): AnnParse {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, field: "doc" };
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "v" && k !== "els" && k !== "notes")) return { ok: false, field: "doc" };
  const notes = o.notes === undefined ? "" : cleanText(o.notes, ANN_MAX_NOTES, true);
  if (notes === null) return { ok: false, field: "notes" };
  if (o.v !== 1) return { ok: false, field: "v" };
  if (!Array.isArray(o.els)) return { ok: false, field: "els" };
  if (o.els.length > ANN_MAX_ELS) return { ok: false, field: "els.length" };
  const els: AnnEl[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < o.els.length; i++) {
    const r = parseAnnEl(o.els[i], i);
    if (typeof r === "string") return { ok: false, field: r };
    if (ids.has(r.id)) return { ok: false, field: `els[${i}].id` };
    ids.add(r.id);
    els.push(r);
  }
  const doc: AnnDoc = { v: 1, els, notes };
  if (JSON.stringify(doc).length > ANN_MAX_DOC_CHARS) return { ok: false, field: "doc.size" };
  return { ok: true, doc };
}

// ── API sözleşmesi ───────────────────────────────────────────────────────────────────────────────
export type AnnLayer = { id: string; sourceKind: AnnSourceKind; sourceId: string; elCount: number; revision: number; createdAt: string; updatedAt: string; doc?: AnnDoc };
export type AnnOwnerLayerRow = AnnLayer & {
  trainerUserId: string; trainerName: string; sourceTitle: string | null; sourceState: string; contentClosed: boolean; grantActive: boolean;
  /** FAZ 19: yalnız özel kayıtta — "kurgusal" | "gercek" (merkezî kayıtta null). */
  privateKind: "kurgusal" | "gercek" | null;
};
/** Owner incelemesi: izni kapalı özel kayıtta doc YOK (contentClosed); merkezî yayımlı kayıtta kayıtlı snapshot'tan BodyGraph görünümü. */
export type AnnOwnerLayerDetail = AnnLayer & { trainerUserId: string; trainerName: string; sourceState: string; contentClosed: boolean; chartView: Record<string, unknown> | null };
/** FAZ 9: eğitmen başına yetki + veri durumu (içerik yok). */
export type AnnOwnerTrainerRow = {
  userId: string; name: string; accountActive: boolean; grantActive: boolean;
  centralLayers: number; privateLayers: number; privateItems: number; privateItemsClosed: number; lastActivity: string | null;
};
export type AnnPurgePreview = { userId: string; name: string; grantActive: boolean; layers: number; items: number; keptConsents: number; keptAudit: number };

export const ANN_ERROR_MAP: Record<string, { status: number; code: string; error: string }> = {
  EA400: { status: 400, code: "INVALID_DOC", error: "Çizim içeriği geçersiz." },
  EA409: { status: 409, code: "REVISION_CONFLICT", error: "Bu çalışma alanı başka bir pencerede veya cihazda değiştirildi." },
  EA413: { status: 413, code: "DOC_TOO_LARGE", error: "Çizim çok büyük (en çok 400 öğe)." },
  EA422: { status: 422, code: "CONFIRM_REQUIRED", error: "Bu işlem açık onay gerektirir." },
  EA423: { status: 409, code: "GRANT_ACTIVE", error: "Eğitim yetkisi açıkken kalıcı silme yapılamaz. Önce Modül İzinleri'nden yetkiyi kapatın." },
};
export const ANN_NOT_FOUND_CODE = "EA404";
export const ANN_RPC = {
  get: "hd_edu_ann_get",
  save: "hd_edu_ann_save",
  clear: "hd_edu_ann_clear",
  ownerList: "hd_edu_ann_owner_list",
  ownerGet: "hd_edu_ann_owner_get",
  ownerDelete: "hd_edu_ann_owner_delete",
  ownerTrainers: "hd_edu_ann_owner_trainers",
  ownerPurgePreview: "hd_edu_ann_owner_purge_preview",
  ownerPurge: "hd_edu_ann_owner_purge",
} as const;
