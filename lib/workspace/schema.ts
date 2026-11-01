/**
 * KİŞİSEL DİJİTAL OFİS — sunucu tarafı şema doğrulaması (saf; bağımlılıksız).
 *
 * İlkeler:
 *  - KATI: bilinmeyen alan → 400 (istemci "src", "url", "path", "user_id", "tenant_id" vb. gönderemez).
 *  - Görsel dosya yolu / URL ASLA kabul edilmez. Görsel yalnız sunucunun ürettiği varlık kimliğiyle (uuid) anılır;
 *    P1'de görsel yükleme yoktur → varlık kimliği yalnız `allowAssets` açıkken kabul edilir (varsayılan kapalı).
 *  - Sayılar sonlu ve aralıkta, metinler uzunluk sınırlı, renkler #rrggbb.
 *  - Çıktı normalize edilmiş YENİ nesnedir (girdi nesnesi saklanmaz).
 */
import {
  BG_MODES, BG_THEMES, BG_TONES, CARD_LEVELS, FAVORITE_KEYS, FAVORITES_MAX, HIDEABLE_KEYS, LAYOUTS, LOGO_PLATES,
  LOGO_ZONES, PAGE_ATTACH, PAGE_CARDS, PHOTO_SCOPES, READING_WIDTHS, TEXT_ALIGNS, TEXT_LINE_MAX_CHARS, TEXT_LINES_MAX,
  TEXT_ROLES, TEXT_VALIGNS, VIEW_MODES,
  type CardLevel, type ViewMode, type WorkspaceLayout,
} from "./catalog";

export type Point = { x: number; y: number };
export type LogoPlacement = { zone: (typeof LOGO_ZONES)[number]; x: number; y: number; w: number };
export type TextLine = { id: string; role: (typeof TEXT_ROLES)[number]; text: string; size: number; color: string };
export type BrandPalette = { accent: string; soft: string; ink: string; accent2: string; name: string };
export type WorkspaceDesign = {
  layout: WorkspaceLayout;
  logo: { assetId: string | null; visible: boolean; plate: (typeof LOGO_PLATES)[number]; layout: { desktop: LogoPlacement; mobile: LogoPlacement } };
  text: { useGreeting: boolean; showDate: boolean; align: (typeof TEXT_ALIGNS)[number]; valign: (typeof TEXT_VALIGNS)[number]; lines: TextLine[] };
  bg: {
    mode: (typeof BG_MODES)[number];
    theme: (typeof BG_THEMES)[number];
    photoAssetId: string | null;
    focus: Point;
    mobileFocus: Point;
    separateMobile: boolean;
    zoom: number;
    overlay: number;
    tone: (typeof BG_TONES)[number];
    important: { x: number; y: number; r: number };
    scope: (typeof PHOTO_SCOPES)[number] | null;
    pageAttach: (typeof PAGE_ATTACH)[number];
    pageCards: (typeof PAGE_CARDS)[number];
    pageOverlay: number | null;
    pageBlur: number;
  };
  brand: BrandPalette | null;
};
export type ReadingPrefs = { scale: number; lineHeight: number; width: (typeof READING_WIDTHS)[number] };
export type UiPrefs = { hiddenModules: string[]; favorites: string[]; cardLevel: CardLevel; viewMode: ViewMode; reading: ReadingPrefs };

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string; path: string };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const LINE_ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
// Satır sonu dışındaki kontrol karakterleri ve görünmez yön işaretleri reddedilir.
const BAD_TEXT_RE = /[\u0000-\u0009\u000B-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;

class SchemaError extends Error {
  constructor(public path: string, message: string) {
    super(message);
  }
}
const fail = (path: string, msg: string): never => {
  throw new SchemaError(path, msg);
};

function obj(v: unknown, path: string, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "Nesne bekleniyor.");
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${path}.${k}`, "Bilinmeyen alan.");
  for (const k of required) if (!(k in o)) fail(`${path}.${k}`, "Zorunlu alan eksik.");
  return o;
}
function oneOf<T extends string | number>(v: unknown, path: string, list: readonly T[], def?: T): T {
  if (v === undefined && def !== undefined) return def;
  if (!list.includes(v as T)) fail(path, `Geçersiz değer (izin verilen: ${list.join(", ")}).`);
  return v as T;
}
function bool(v: unknown, path: string, def: boolean): boolean {
  if (v === undefined) return def;
  if (typeof v !== "boolean") fail(path, "true/false bekleniyor.");
  return v as boolean;
}
function num(v: unknown, path: string, min: number, max: number, def?: number): number {
  if (v === undefined && def !== undefined) return def;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail(path, `${min} ile ${max} arasında sayı bekleniyor.`);
  return v as number;
}
function text(v: unknown, path: string, max: number): string {
  if (typeof v !== "string") fail(path, "Metin bekleniyor.");
  const s = v as string;
  if (s.length > max) fail(path, `En fazla ${max} karakter.`);
  if (BAD_TEXT_RE.test(s)) fail(path, "Metinde izin verilmeyen karakter var.");
  return s;
}
function hex(v: unknown, path: string): string {
  if (typeof v !== "string" || !HEX_RE.test(v)) fail(path, "#rrggbb biçiminde renk bekleniyor.");
  return (v as string).toLowerCase();
}
function assetId(v: unknown, path: string, allowAssets: boolean): string | null {
  if (v === undefined || v === null) return null;
  if (!allowAssets) fail(path, "Görsel yükleme bu sürümde kapalı; görsel kimliği kabul edilmez.");
  if (typeof v !== "string" || !UUID_RE.test(v)) fail(path, "Görsel yalnız sunucu varlık kimliğiyle (uuid) anılabilir; dosya yolu / URL kabul edilmez.");
  return v as string;
}
function point(v: unknown, path: string, def: Point): Point {
  if (v === undefined) return { ...def };
  const o = obj(v, path, ["x", "y"], ["x", "y"]);
  return { x: num(o.x, `${path}.x`, 0, 100), y: num(o.y, `${path}.y`, 0, 100) };
}
function placement(v: unknown, path: string, def: LogoPlacement): LogoPlacement {
  if (v === undefined) return { ...def };
  const o = obj(v, path, ["zone", "x", "y", "w"], ["zone", "x", "y", "w"]);
  return { zone: oneOf(o.zone, `${path}.zone`, LOGO_ZONES), x: num(o.x, `${path}.x`, 0, 1), y: num(o.y, `${path}.y`, 0, 1), w: num(o.w, `${path}.w`, 0.04, 1) };
}

const DEFAULT_DESKTOP: LogoPlacement = { zone: "hero", x: 1, y: 0.5, w: 0.26 };
const DEFAULT_MOBILE: LogoPlacement = { zone: "toolbar", x: 0.5, y: 0.5, w: 1 };

function design(v: unknown, allowAssets: boolean): WorkspaceDesign {
  const d = obj(v, "design", ["layout", "logo", "text", "bg", "brand"], ["layout"]);
  const layout = oneOf(d.layout, "design.layout", LAYOUTS);

  const lg = d.logo === undefined ? {} : obj(d.logo, "design.logo", ["assetId", "visible", "plate", "layout"]);
  const ll = lg.layout === undefined ? {} : obj(lg.layout, "design.logo.layout", ["desktop", "mobile"]);
  const logo: WorkspaceDesign["logo"] = {
    assetId: assetId(lg.assetId, "design.logo.assetId", allowAssets),
    visible: bool(lg.visible, "design.logo.visible", true),
    plate: oneOf(lg.plate, "design.logo.plate", LOGO_PLATES, "yok"),
    layout: { desktop: placement(ll.desktop, "design.logo.layout.desktop", DEFAULT_DESKTOP), mobile: placement(ll.mobile, "design.logo.layout.mobile", DEFAULT_MOBILE) },
  };

  const tx = d.text === undefined ? {} : obj(d.text, "design.text", ["useGreeting", "showDate", "align", "valign", "lines"]);
  const rawLines = tx.lines === undefined ? [] : tx.lines;
  if (!Array.isArray(rawLines)) fail("design.text.lines", "Liste bekleniyor.");
  if ((rawLines as unknown[]).length > TEXT_LINES_MAX) fail("design.text.lines", `En fazla ${TEXT_LINES_MAX} satır.`);
  const ids = new Set<string>();
  const lines = (rawLines as unknown[]).map((l, i) => {
    const p = `design.text.lines[${i}]`;
    const o = obj(l, p, ["id", "role", "text", "size", "color"], ["id", "role", "text"]);
    const id = typeof o.id === "string" && LINE_ID_RE.test(o.id) ? o.id : fail(`${p}.id`, "Geçersiz satır kimliği.");
    if (ids.has(id)) fail(`${p}.id`, "Satır kimliği tekrar ediyor.");
    ids.add(id);
    const color = o.color === undefined || o.color === "auto" || o.color === "brand" ? ((o.color as string) ?? "auto") : hex(o.color, `${p}.color`);
    return { id, role: oneOf(o.role, `${p}.role`, TEXT_ROLES), text: text(o.text, `${p}.text`, TEXT_LINE_MAX_CHARS), size: num(o.size, `${p}.size`, 11, 72, 16), color };
  });
  const textOut: WorkspaceDesign["text"] = {
    useGreeting: bool(tx.useGreeting, "design.text.useGreeting", true),
    showDate: bool(tx.showDate, "design.text.showDate", true),
    align: oneOf(tx.align, "design.text.align", TEXT_ALIGNS, "left"),
    valign: oneOf(tx.valign, "design.text.valign", TEXT_VALIGNS, "center"),
    lines,
  };

  const b = d.bg === undefined ? {} : obj(d.bg, "design.bg", [
    "mode", "theme", "photoAssetId", "focus", "mobileFocus", "separateMobile", "zoom", "overlay", "tone", "important",
    "scope", "pageAttach", "pageCards", "pageOverlay", "pageBlur",
  ]);
  const imp = b.important === undefined ? { x: 50, y: 50, r: 18 } : (() => {
    const o = obj(b.important, "design.bg.important", ["x", "y", "r"], ["x", "y", "r"]);
    return { x: num(o.x, "design.bg.important.x", 0, 100), y: num(o.y, "design.bg.important.y", 0, 100), r: num(o.r, "design.bg.important.r", 6, 45) };
  })();
  const bg: WorkspaceDesign["bg"] = {
    mode: oneOf(b.mode, "design.bg.mode", BG_MODES, "default"),
    theme: oneOf(b.theme, "design.bg.theme", BG_THEMES, "manzara"),
    photoAssetId: assetId(b.photoAssetId, "design.bg.photoAssetId", allowAssets),
    focus: point(b.focus, "design.bg.focus", { x: 50, y: 50 }),
    mobileFocus: point(b.mobileFocus, "design.bg.mobileFocus", { x: 50, y: 50 }),
    separateMobile: bool(b.separateMobile, "design.bg.separateMobile", false),
    zoom: num(b.zoom, "design.bg.zoom", 1, 2.5, 1),
    overlay: num(b.overlay, "design.bg.overlay", 0, 0.85, 0.45),
    tone: oneOf(b.tone, "design.bg.tone", BG_TONES, "light"),
    important: imp,
    scope: b.scope === undefined || b.scope === null ? null : oneOf(b.scope, "design.bg.scope", PHOTO_SCOPES),
    // Owner kararı 8: tüm sayfa fotoğrafında varsayılan "Sabit".
    pageAttach: oneOf(b.pageAttach, "design.bg.pageAttach", PAGE_ATTACH, "fixed"),
    pageCards: oneOf(b.pageCards, "design.bg.pageCards", PAGE_CARDS, "auto"),
    pageOverlay: b.pageOverlay === undefined || b.pageOverlay === null ? null : num(b.pageOverlay, "design.bg.pageOverlay", 0, 0.9),
    pageBlur: num(b.pageBlur, "design.bg.pageBlur", 0, 12, 0),
  };
  if (bg.mode === "photo" && !bg.photoAssetId) fail("design.bg.photoAssetId", "Fotoğraf modu için görsel gerekli.");

  let brand: BrandPalette | null = null;
  if (d.brand !== undefined && d.brand !== null) {
    const o = obj(d.brand, "design.brand", ["accent", "soft", "ink", "accent2", "name"], ["accent", "soft", "ink"]);
    brand = {
      accent: hex(o.accent, "design.brand.accent"),
      soft: hex(o.soft, "design.brand.soft"),
      ink: hex(o.ink, "design.brand.ink"),
      accent2: o.accent2 === undefined ? "#c99a3a" : hex(o.accent2, "design.brand.accent2"),
      name: o.name === undefined ? "Özel" : text(o.name, "design.brand.name", 40),
    };
  }
  if (bg.theme === "marka" && bg.mode === "theme" && !brand) fail("design.brand", "Marka teması için marka paleti gerekli.");
  if (lines.some((l) => l.color === "brand") && !brand) fail("design.brand", "Marka rengi kullanan satır için marka paleti gerekli.");

  return { layout, logo, text: textOut, bg, brand };
}

function capture<T>(fn: () => T): Parsed<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (e instanceof SchemaError) return { ok: false, error: e.message, path: e.path };
    throw e;
  }
}

/** Tasarım (taslak veya uygulanan). */
export function parseDesign(input: unknown, opts: { allowAssets?: boolean } = {}): Parsed<WorkspaceDesign> {
  return capture(() => design(input, opts.allowAssets === true));
}

export const DEFAULT_READING: ReadingPrefs = { scale: 1.15, lineHeight: 1.7, width: 68 };
export const DEFAULT_UI_PREFS: UiPrefs = { hiddenModules: [], favorites: [], cardLevel: "center", viewMode: "auto", reading: { ...DEFAULT_READING } };

function keyList(v: unknown, path: string, allowed: ReadonlySet<string>, max: number): string[] {
  if (!Array.isArray(v)) fail(path, "Liste bekleniyor.");
  const arr = v as unknown[];
  if (arr.length > max) fail(path, `En fazla ${max} öğe.`);
  const seen = new Set<string>();
  return arr.map((k, i) => {
    if (typeof k !== "string" || !allowed.has(k)) fail(`${path}[${i}]`, "Bilinmeyen modül anahtarı.");
    if (seen.has(k as string)) fail(`${path}[${i}]`, "Tekrarlanan modül anahtarı.");
    seen.add(k as string);
    return k as string;
  });
}

/** Arayüz tercihleri (tam değer; PUT ile değiştirilir). */
export function parseUiPrefs(input: unknown): Parsed<UiPrefs> {
  return capture(() => {
    const o = obj(input, "prefs", ["hiddenModules", "favorites", "cardLevel", "viewMode", "reading"], ["hiddenModules", "favorites", "cardLevel", "viewMode", "reading"]);
    const r = obj(o.reading, "prefs.reading", ["scale", "lineHeight", "width"], ["scale", "lineHeight", "width"]);
    return {
      hiddenModules: keyList(o.hiddenModules, "prefs.hiddenModules", HIDEABLE_KEYS, HIDEABLE_KEYS.size),
      favorites: keyList(o.favorites, "prefs.favorites", FAVORITE_KEYS, FAVORITES_MAX),
      cardLevel: oneOf(o.cardLevel, "prefs.cardLevel", CARD_LEVELS),
      viewMode: oneOf(o.viewMode, "prefs.viewMode", VIEW_MODES),
      reading: {
        scale: num(r.scale, "prefs.reading.scale", 1, 1.5),
        lineHeight: num(r.lineHeight, "prefs.reading.lineHeight", 1.4, 2.1),
        width: oneOf(r.width, "prefs.reading.width", READING_WIDTHS),
      },
    };
  });
}

/** Beklenen sürüm (çift sekme çakışma kontrolü). 0 = henüz kayıt yok. */
export function parseExpectedVersion(v: unknown): Parsed<number> {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 2_000_000_000) {
    return { ok: false, error: "expectedVersion 0 veya pozitif tam sayı olmalı.", path: "expectedVersion" };
  }
  return { ok: true, value: v };
}
