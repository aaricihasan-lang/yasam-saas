/**
 * Refleksoloji — DANIŞAN İŞARET HARİTASI yüzey kayıt defteri (SAF; DOM/fetch yok).
 *
 * Uzman bir danışan seansında ayak / avuç içi / el sırtı yüzeylerine nokta koyar.
 * Her işaret (surface, side) çiftine AİTTİR; bir yüzeyin noktası başka yüzeyde ASLA
 * çizilmez (filtre `marksForSurface`). Bu dosya istemci, API ve harness'in ORTAK tek
 * kaynağıdır — sunucu doğrulaması da buradaki listeleri kullanır.
 *
 * KOORDİNAT MODELİ: x,y ∈ [0,1], yüzeyin SABİT viewBox'ına göre normalize. Görsel ekrana
 * `preserveAspectRatio="xMidYMid meet"` ile ölçeklenir → mobil/web/zoom fark etmeksizin
 * aynı (x,y) aynı anatomik noktaya düşer (piksel koordinatı SAKLANMAZ).
 *
 * Görseller: ayak yüzeyleri mevcut atlas PNG'lerinin (çift ayak) ilgili YARISIDIR (crop);
 * el yüzeyleri bu modüle özgü sade SVG şemalarıdır (dış kaynaklı görsel yok).
 * Şemalar işaretleme zeminidir; anatomik/tıbbi kesinlik iddiası taşımaz.
 *
 * GELECEK PLANLANMIŞ GELİŞTİRME (owner kararı 2026-10-10): Yüz Refleksolojisi doğrudan 3D
 * olarak geliştirilecek; geçici 2D sürüm yayınlanmayacak. Yeni yüzey = bu kayda yeni anahtar
 * + DB'de `reflexology_marks_surface_chk` / `_side_chk` kısıt değişimi (veri yeniden yazımı YOK);
 * x/y (0..1) 3D modelde doku/UV koordinatı olarak kullanılabilir.
 */

export const MARK_SURFACES = [
  "foot_sole",
  "foot_inner",
  "foot_outer",
  "hand_palm",
  "hand_dorsum",
] as const;
export type MarkSurface = (typeof MARK_SURFACES)[number];

export const MARK_SIDES = ["right", "left"] as const;
export type MarkSide = (typeof MARK_SIDES)[number];

export const MARK_SIZES = ["small", "medium", "large"] as const;
export type MarkSize = (typeof MARK_SIZES)[number];

export const MARK_INTENSITIES = ["light", "medium", "strong"] as const;
export type MarkIntensity = (typeof MARK_INTENSITIES)[number];

export const MARK_SIZE_LABEL: Record<MarkSize, string> = {
  small: "Küçük",
  medium: "Orta",
  large: "Büyük",
};

export const MARK_INTENSITY_LABEL: Record<MarkIntensity, string> = {
  light: "Hafif",
  medium: "Orta",
  strong: "Yoğun",
};

export const MARK_SIDE_LABEL: Record<MarkSide, string> = {
  right: "Sağ",
  left: "Sol",
};

/** Nokta yarıçapı — yüzey viewBox KISA kenarına oranla (ekran boyutundan bağımsız). */
export const MARK_SIZE_RATIO: Record<MarkSize, number> = {
  small: 0.018,
  medium: 0.03,
  large: 0.048,
};

export const MARK_NOTE_MAX = 500;
export const SESSION_TITLE_MAX = 120;
export const SESSION_NOTE_MAX = 4000;
/** Seans başına üst sınır (yanlışlıkla/otomasyonla şişmeyi engeller). */
export const MARKS_PER_SESSION_MAX = 400;

export type SurfaceGroup = "foot" | "hand";

export type SurfaceDef = {
  key: MarkSurface;
  group: SurfaceGroup;
  /** Sekme etiketi */
  label: string;
};

export const SURFACE_DEFS: Record<MarkSurface, SurfaceDef> = {
  foot_sole: { key: "foot_sole", group: "foot", label: "Ayak Tabanı" },
  foot_inner: { key: "foot_inner", group: "foot", label: "Ayak İç Yan" },
  foot_outer: { key: "foot_outer", group: "foot", label: "Ayak Dış Yan" },
  hand_palm: { key: "hand_palm", group: "hand", label: "Avuç İçi" },
  hand_dorsum: { key: "hand_dorsum", group: "hand", label: "El Sırtı" },
};

export function isMarkSurface(v: unknown): v is MarkSurface {
  return typeof v === "string" && (MARK_SURFACES as readonly string[]).includes(v);
}
export function isMarkSide(v: unknown): v is MarkSide {
  return typeof v === "string" && (MARK_SIDES as readonly string[]).includes(v);
}
export function isMarkSize(v: unknown): v is MarkSize {
  return typeof v === "string" && (MARK_SIZES as readonly string[]).includes(v);
}
export function isMarkIntensity(v: unknown): v is MarkIntensity {
  return typeof v === "string" && (MARK_INTENSITIES as readonly string[]).includes(v);
}

export function surfaceLabel(surface: MarkSurface, side: MarkSide): string {
  const def = SURFACE_DEFS[surface];
  const s = MARK_SIDE_LABEL[side];
  if (def.group === "foot") return `${s} ${def.label}`;
  return `${s} El — ${def.label}`;
}

// ─── Görsel tanımı ──────────────────────────────────────────────────────────────

export type SurfaceView = {
  /** viewBox genişlik/yükseklik (normalize koordinatın paydası). */
  width: number;
  height: number;
  /** Raster zemin (ayak) — viewBox'a göre konumlanır; crop = görselin ilgili yarısı. */
  image?: { href: string; x: number; y: number; width: number; height: number };
  /** Vektör şema (el) — çizim bileşeni `kind`'a göre çizer. */
  vector?: { kind: "hand_palm" | "hand_dorsum"; mirror: boolean };
};

/**
 * Ayak PNG'leri iki ayağı YAN YANA içerir; hangi yarının sağ/sol olduğu görsele göre
 * değişir (taban & iç yan: Sağ solda; dış yan: Sol solda). Crop bu tabloyla yapılır.
 */
const FOOT_IMAGES: Record<
  "foot_sole" | "foot_inner" | "foot_outer",
  { href: string; w: number; h: number; rightOnLeftHalf: boolean; cropY: number; cropH: number }
> = {
  foot_sole: { href: "/refleksoloji/klinik_taban.png", w: 1024, h: 1024, rightOnLeftHalf: true, cropY: 40, cropH: 960 },
  foot_inner: { href: "/refleksoloji/klinik_yan_ic.png", w: 1536, h: 1024, rightOnLeftHalf: true, cropY: 240, cropH: 600 },
  foot_outer: { href: "/refleksoloji/klinik_yan_dis.png", w: 1536, h: 1024, rightOnLeftHalf: false, cropY: 240, cropH: 600 },
};

export const HAND_VIEWBOX = { width: 400, height: 560 } as const;

/**
 * El şemasının temel çizimi = başparmak SAĞDA. Kendi ellerine bakan uzman bakışı:
 *   avuç içi yukarı → başparmaklar DIŞA (sağ el: sağda) ; el sırtı yukarı → İÇE (sağ el: solda).
 * Bu nedenle: sağ avuç = temel, sol avuç = ayna, sağ sırt = ayna, sol sırt = temel.
 */
export function handMirrored(surface: "hand_palm" | "hand_dorsum", side: "right" | "left"): boolean {
  return surface === "hand_palm" ? side === "left" : side === "right";
}

export function surfaceView(surface: MarkSurface, side: MarkSide): SurfaceView {
  if (surface === "foot_sole" || surface === "foot_inner" || surface === "foot_outer") {
    const img = FOOT_IMAGES[surface];
    const half = img.w / 2;
    const useLeftHalf = side === "right" ? img.rightOnLeftHalf : !img.rightOnLeftHalf;
    const cropX = useLeftHalf ? 0 : half;
    return {
      width: half,
      height: img.cropH,
      image: { href: img.href, x: -cropX, y: -img.cropY, width: img.w, height: img.h },
    };
  }
  return { ...HAND_VIEWBOX, vector: { kind: surface, mirror: handMirrored(surface, side) } };
}

// ─── İşaret modeli ──────────────────────────────────────────────────────────────

export type ClientMark = {
  id: string;
  session_id: string;
  surface: MarkSurface;
  side: MarkSide;
  x: number;
  y: number;
  size: MarkSize;
  intensity: MarkIntensity | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type MarkSession = {
  id: string;
  client_id: string;
  session_date: string; // YYYY-MM-DD
  title: string | null;
  note: string | null;
  mark_count: number;
  created_at: string;
  updated_at: string;
};

/** Yalnız bu (yüzey, taraf) çiftine ait işaretler — yüzeyler arası sızma YOK. */
export function marksForSurface<T extends Pick<ClientMark, "surface" | "side">>(
  marks: readonly T[],
  surface: MarkSurface,
  side: MarkSide,
): T[] {
  return marks.filter((m) => m.surface === surface && m.side === side);
}

export function countBySurface(
  marks: readonly Pick<ClientMark, "surface" | "side">[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of marks) {
    const k = `${m.surface}:${m.side}`;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Normalize nokta → viewBox kullanıcı birimi (render). */
export function toViewBox(view: Pick<SurfaceView, "width" | "height">, x: number, y: number) {
  return { cx: clampUnit(x) * view.width, cy: clampUnit(y) * view.height };
}

/** viewBox kullanıcı birimi → normalize (pointer). 4 ondalık (~0.1 px @1000px) yeterli. */
export function fromViewBox(view: Pick<SurfaceView, "width" | "height">, ux: number, uy: number) {
  const r = (v: number) => Math.round(clampUnit(v) * 10000) / 10000;
  return { x: r(ux / view.width), y: r(uy / view.height) };
}

export function markRadius(view: Pick<SurfaceView, "width" | "height">, size: MarkSize): number {
  return Math.min(view.width, view.height) * MARK_SIZE_RATIO[size];
}

// ─── Doğrulama (sunucu + istemci ortak) ─────────────────────────────────────────

export type MarkInput = {
  surface: MarkSurface;
  side: MarkSide;
  x: number;
  y: number;
  size: MarkSize;
  intensity: MarkIntensity | null;
  note: string | null;
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function cleanText(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\u0000/g, "").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function unitNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return null;
  return Math.round(v * 10000) / 10000;
}

export function validateMarkInput(raw: unknown): ValidationResult<MarkInput> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Geçersiz işaret." };
  const r = raw as Record<string, unknown>;
  if (!isMarkSurface(r.surface)) return { ok: false, error: "Geçersiz yüzey." };
  const side = r.side;
  if (!isMarkSide(side)) return { ok: false, error: "Sağ/sol bilgisi gerekli." };
  const x = unitNumber(r.x);
  const y = unitNumber(r.y);
  if (x === null || y === null) return { ok: false, error: "Koordinat 0–1 aralığında olmalı." };
  const size = r.size ?? "medium";
  if (!isMarkSize(size)) return { ok: false, error: "Geçersiz nokta boyutu." };
  const intensity = r.intensity ?? null;
  if (intensity !== null && !isMarkIntensity(intensity)) return { ok: false, error: "Geçersiz yoğunluk." };
  const note = cleanText(r.note, MARK_NOTE_MAX);
  return { ok: true, value: { surface: r.surface, side, x, y, size, intensity, note: note ?? null } };
}

export type MarkPatch = Partial<Pick<MarkInput, "x" | "y" | "size" | "intensity" | "note">>;

/** Güncelleme: yüzey/taraf DEĞİŞTİRİLEMEZ (yüzeyler arası taşıma yok). */
export function validateMarkPatch(raw: unknown): ValidationResult<MarkPatch> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Geçersiz istek." };
  const r = raw as Record<string, unknown>;
  const out: MarkPatch = {};
  if ("x" in r || "y" in r) {
    const x = unitNumber(r.x);
    const y = unitNumber(r.y);
    if (x === null || y === null) return { ok: false, error: "Koordinat 0–1 aralığında olmalı." };
    out.x = x;
    out.y = y;
  }
  if ("size" in r) {
    if (!isMarkSize(r.size)) return { ok: false, error: "Geçersiz nokta boyutu." };
    out.size = r.size;
  }
  if ("intensity" in r) {
    if (r.intensity !== null && !isMarkIntensity(r.intensity)) return { ok: false, error: "Geçersiz yoğunluk." };
    out.intensity = (r.intensity as MarkIntensity | null) ?? null;
  }
  if ("note" in r) {
    const n = cleanText(r.note, MARK_NOTE_MAX);
    if (n === undefined) return { ok: false, error: "Geçersiz not." };
    out.note = n;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "Güncellenecek alan yok." };
  return { ok: true, value: out };
}

export type SessionInput = { session_date: string; title: string | null; note: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function validateSessionInput(raw: unknown, partial = false): ValidationResult<Partial<SessionInput>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Geçersiz istek." };
  const r = raw as Record<string, unknown>;
  const out: Partial<SessionInput> = {};
  if ("session_date" in r || !partial) {
    if (!isValidIsoDate(r.session_date)) return { ok: false, error: "Geçersiz seans tarihi." };
    out.session_date = r.session_date;
  }
  if ("title" in r) {
    const t = cleanText(r.title, SESSION_TITLE_MAX);
    if (t === undefined) return { ok: false, error: "Geçersiz başlık." };
    out.title = t;
  } else if (!partial) out.title = null;
  if ("note" in r) {
    const n = cleanText(r.note, SESSION_NOTE_MAX);
    if (n === undefined) return { ok: false, error: "Geçersiz not." };
    out.note = n;
  } else if (!partial) out.note = null;
  if (partial && Object.keys(out).length === 0) return { ok: false, error: "Güncellenecek alan yok." };
  return { ok: true, value: out };
}

/** Erişilebilir metin özeti (ekran okuyucu + liste): renk TEK BAŞINA anlam taşımaz. */
export function describeMark(m: Pick<ClientMark, "size" | "intensity" | "note">, index: number): string {
  const parts = [`${index}. nokta`, MARK_SIZE_LABEL[m.size]];
  if (m.intensity) parts.push(MARK_INTENSITY_LABEL[m.intensity]);
  if (m.note) parts.push(m.note);
  return parts.join(" · ");
}
