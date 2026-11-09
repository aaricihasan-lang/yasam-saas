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
  BAND_ALIGNS, BAND_WIDTH_MAX, BAND_WIDTH_MIN, BAND_WIDTH_STEP, BG_MODES, BG_THEMES, BG_TONES, CARD_LEVELS, FAVORITE_KEYS, FRAME_FITS, FRAME_ZOOM_MAX, FRAME_ZOOM_MIN, FAVORITES_MAX, FREE_Y_MAX, HIDEABLE_KEYS, LAYOUTS, LOGO_PLATES,
  LOGO_ZONES, PAGE_ATTACH, isFreeZone, PAGE_CARDS, PHOTO_SCOPES, READING_WIDTHS, TEXT_ALIGNS, TEXT_LINE_MAX_CHARS, TEXT_LINES_MAX,
  TEXT_ROLES, TEXT_VALIGNS, VIEW_MODES,
  type CardLevel, type ViewMode, type WorkspaceLayout,
} from "./catalog";

export type Point = { x: number; y: number };
export type LogoPlacement = { zone: (typeof LOGO_ZONES)[number]; x: number; y: number; w: number };
/**
 * `align` (KDO-03): satırın kendi yatay hizası. Yoksa (eski kayıt) `text.align` kullanılır → eski tasarımlar aynen çizilir.
 */
export type TextLine = { id: string; role: (typeof TEXT_ROLES)[number]; text: string; size: number; color: string; align?: (typeof TEXT_ALIGNS)[number] };
export type BrandPalette = { accent: string; soft: string; ink: string; accent2: string; name: string };
/** Karşılama alanı (V2): görünürlük, genişlik yüzdesi (BAND_WIDTH_MIN–MAX, adım BAND_WIDTH_STEP) ve hiza. */
export type HeroBand = { visible: boolean; width: number; align: (typeof BAND_ALIGNS)[number] };
export const DEFAULT_BAND: HeroBand = { visible: true, width: BAND_WIDTH_MAX, align: "left" };
export type WorkspaceDesign = {
  layout: WorkspaceLayout;
  logo: { assetId: string | null; visible: boolean; plate: (typeof LOGO_PLATES)[number]; layout: { desktop: LogoPlacement; mobile: LogoPlacement } };
  /**
   * `surface` (KDO-04): karşılama yazı alanının zemini (#rrggbb). null → tasarımın kendi zemini (varsayılan renkler
   * değişmez). C'de kâğıt plaket, A/B'de metnin arkasındaki panel bu renge boyanır; marka paletinden BAĞIMSIZDIR.
   */
  text: { useGreeting: boolean; showDate: boolean; align: (typeof TEXT_ALIGNS)[number]; valign: (typeof TEXT_VALIGNS)[number]; surface: string | null; lines: TextLine[] };
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
    /** C fotoğraf çerçevesi: Doldur (varsayılan) / Sığdır. Diğer düzenlerde ve tüm sayfa fotoğrafında kullanılmaz. */
    frameFit: (typeof FRAME_FITS)[number];
    /** Sığdır modunda fotoğrafın çerçeve içindeki boyutu (1 = tamamı tam sığar; < 1 uzaklaşır; > 1 yakınlaşır). */
    frameZoom: number;
  };
  brand: BrandPalette | null;
  /**
   * Karşılama alanı (V2). Eski kayıtta yok → çıktıya da eklenmez (eski tasarım birebir aynı kalır); yokluğu DEFAULT_BAND
   * demektir. Gizleme yalnız görünürlüktür: metinler, fotoğraf, logo ve diğer ayarlar aynen saklanır.
   */
  band?: HeroBand;
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
/** Serbest bölgelerde (page / side) y çerçeve üstünden piksel; eski hazır bölgelerde 0–1 oran. */
function placement(v: unknown, path: string, def: LogoPlacement): LogoPlacement {
  if (v === undefined) return { ...def };
  const o = obj(v, path, ["zone", "x", "y", "w"], ["zone", "x", "y", "w"]);
  const zone = oneOf(o.zone, `${path}.zone`, LOGO_ZONES);
  const y = isFreeZone(zone) ? Math.round(num(o.y, `${path}.y`, 0, FREE_Y_MAX)) : num(o.y, `${path}.y`, 0, 1);
  return { zone, x: num(o.x, `${path}.x`, 0, 1), y, w: num(o.w, `${path}.w`, 0.04, 1) };
}

/**
 * Yeni logonun ilk konumu (KDO-05): serbest yerleşim. Masaüstü: karşılama bandında metnin sağı (Kişiselleştirme paneli
 * açıkken de görünür kalır; metin engeldir, çözücü kaçar). Mobil: üst araç satırında menü düğmesinin sağı.
 */
export const DEFAULT_LOGO_DESKTOP: LogoPlacement = { zone: "page", x: 0.55, y: 110, w: 0.15 };
export const DEFAULT_LOGO_MOBILE: LogoPlacement = { zone: "page", x: 0.2, y: 10, w: 0.26 };

function design(v: unknown, allowAssets: boolean): WorkspaceDesign {
  const d = obj(v, "design", ["layout", "logo", "text", "bg", "brand", "band"], ["layout"]);
  const layout = oneOf(d.layout, "design.layout", LAYOUTS);

  const lg = d.logo === undefined ? {} : obj(d.logo, "design.logo", ["assetId", "visible", "plate", "layout"]);
  const ll = lg.layout === undefined ? {} : obj(lg.layout, "design.logo.layout", ["desktop", "mobile"]);
  const logo: WorkspaceDesign["logo"] = {
    assetId: assetId(lg.assetId, "design.logo.assetId", allowAssets),
    visible: bool(lg.visible, "design.logo.visible", true),
    plate: oneOf(lg.plate, "design.logo.plate", LOGO_PLATES, "yok"),
    layout: { desktop: placement(ll.desktop, "design.logo.layout.desktop", DEFAULT_LOGO_DESKTOP), mobile: placement(ll.mobile, "design.logo.layout.mobile", DEFAULT_LOGO_MOBILE) },
  };

  const tx = d.text === undefined ? {} : obj(d.text, "design.text", ["useGreeting", "showDate", "align", "valign", "surface", "lines"]);
  const rawLines = tx.lines === undefined ? [] : tx.lines;
  if (!Array.isArray(rawLines)) fail("design.text.lines", "Liste bekleniyor.");
  if ((rawLines as unknown[]).length > TEXT_LINES_MAX) fail("design.text.lines", `En fazla ${TEXT_LINES_MAX} satır.`);
  const ids = new Set<string>();
  const lines = (rawLines as unknown[]).map((l, i) => {
    const p = `design.text.lines[${i}]`;
    const o = obj(l, p, ["id", "role", "text", "size", "color", "align"], ["id", "role", "text"]);
    const id = typeof o.id === "string" && LINE_ID_RE.test(o.id) ? o.id : fail(`${p}.id`, "Geçersiz satır kimliği.");
    if (ids.has(id)) fail(`${p}.id`, "Satır kimliği tekrar ediyor.");
    ids.add(id);
    const color = o.color === undefined || o.color === "auto" || o.color === "brand" ? ((o.color as string) ?? "auto") : hex(o.color, `${p}.color`);
    const line: TextLine = { id, role: oneOf(o.role, `${p}.role`, TEXT_ROLES), text: text(o.text, `${p}.text`, TEXT_LINE_MAX_CHARS), size: num(o.size, `${p}.size`, 11, 72, 16), color };
    // Eski kayıtta alan yok → çıktıya da eklenmez (eski tasarım birebir aynı kalır).
    if (o.align !== undefined) line.align = oneOf(o.align, `${p}.align`, TEXT_ALIGNS);
    return line;
  });
  const textOut: WorkspaceDesign["text"] = {
    useGreeting: bool(tx.useGreeting, "design.text.useGreeting", true),
    showDate: bool(tx.showDate, "design.text.showDate", true),
    align: oneOf(tx.align, "design.text.align", TEXT_ALIGNS, "left"),
    valign: oneOf(tx.valign, "design.text.valign", TEXT_VALIGNS, "center"),
    surface: tx.surface === undefined || tx.surface === null ? null : hex(tx.surface, "design.text.surface"),
    lines,
  };

  const b = d.bg === undefined ? {} : obj(d.bg, "design.bg", [
    "mode", "theme", "photoAssetId", "focus", "mobileFocus", "separateMobile", "zoom", "overlay", "tone", "important",
    "scope", "pageAttach", "pageCards", "pageOverlay", "pageBlur", "frameFit", "frameZoom",
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
    // Eski kayıtta alan yok → "fill" (bugünkü görünüm birebir).
    frameFit: oneOf(b.frameFit, "design.bg.frameFit", FRAME_FITS, "fill"),
    frameZoom: num(b.frameZoom, "design.bg.frameZoom", FRAME_ZOOM_MIN, FRAME_ZOOM_MAX, 1),
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

  const out: WorkspaceDesign = { layout, logo, text: textOut, bg, brand };
  // Eski kayıtta alan yok → çıktıya da eklenmez. Genişlik yalnız adım katı tam sayı (serbest CSS değeri kabul edilmez).
  if (d.band !== undefined) {
    const o = obj(d.band, "design.band", ["visible", "width", "align"]);
    const width = num(o.width, "design.band.width", BAND_WIDTH_MIN, BAND_WIDTH_MAX, DEFAULT_BAND.width);
    if (!Number.isInteger(width) || width % BAND_WIDTH_STEP !== 0) fail("design.band.width", `${BAND_WIDTH_STEP}'in katı tam sayı bekleniyor.`);
    out.band = {
      visible: bool(o.visible, "design.band.visible", DEFAULT_BAND.visible),
      width,
      align: oneOf(o.align, "design.band.align", BAND_ALIGNS, DEFAULT_BAND.align),
    };
  }
  return out;
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
