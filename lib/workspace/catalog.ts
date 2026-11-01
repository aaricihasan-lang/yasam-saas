/**
 * KİŞİSEL DİJİTAL OFİS — sabit katalog ve sınırlar (saf; istemci ve sunucu kullanabilir).
 *
 * Gizleme / Favorilerim anahtarları YETKİ DEĞİLDİR: yalnız uzmanın ana sayfa görünüm tercihidir.
 * Modül erişimi her zaman lib/auth/modulePermissions + moduleAccessCore ile ayrıca belirlenir;
 * buradaki hiçbir değer yetki kararına girmez.
 *
 * Merkez anahtarları ana sayfa merkez kartlarının permissionKey'iyle aynıdır
 * (app/_premium/home/homeCenters.ts → dashboardModules). Modül anahtarları kalıcıdır; ekran adı değişse de değişmez.
 */

export const WORKSPACE_SCHEMA_VERSION = 1;
export const HISTORY_MAX = 10;
export const FAVORITES_MAX = 8;
export const TEXT_LINES_MAX = 10;
export const TEXT_LINE_MAX_CHARS = 300;
/** İstek gövdesi üst sınırı (bayt). Tasarım JSON'u görsel İÇERMEZ; yalnız ayar ve kısa metindir. */
export const BODY_MAX_BYTES = 48 * 1024;

export const WORKSPACE_CENTERS = [
  { key: "clients", modules: ["client_journey", "appointments"] },
  { key: "yasam_hafizasi", modules: ["yasam_hafizasi"] },
  { key: "energy_body", modules: ["energy_body", "reflexology", "cupping"] },
  { key: "sifa_rehberi", modules: ["stones", "stone_library", "aromatherapy", "sifa_rehberi", "beslenme"] },
  { key: "digital_content", modules: ["personal_archive", "belge_ceviri", "video_ceviri", "ders_notu"] },
  { key: "numerology", modules: ["numerology", "human_design", "cosmic_calendar", "astrology"] },
  { key: "stok", modules: ["stok"] },
] as const;

/** Gizleme anahtarı: "center:<merkez>" veya "module:<modül>". Favori: yalnız "module:<modül>". */
export const CENTER_PREF_KEYS: readonly string[] = WORKSPACE_CENTERS.map((c) => `center:${c.key}`);
export const MODULE_PREF_KEYS: readonly string[] = WORKSPACE_CENTERS.flatMap((c) => c.modules.map((m) => `module:${m}`));
export const HIDEABLE_KEYS: ReadonlySet<string> = new Set([...CENTER_PREF_KEYS, ...MODULE_PREF_KEYS]);
export const FAVORITE_KEYS: ReadonlySet<string> = new Set(MODULE_PREF_KEYS);

export const LAYOUTS = ["A", "B", "C"] as const;
export const CARD_LEVELS = ["center", "module"] as const;
export const VIEW_MODES = ["auto", "day", "night", "reading", "focus"] as const;
export const READING_WIDTHS = [58, 68, 80] as const;

export const LOGO_ZONES = ["hero", "cerceve", "toolbar", "sec", "rightTop", "footer"] as const;
export const LOGO_PLATES = ["yok", "cam", "beyaz"] as const;
export const TEXT_ROLES = ["label", "title", "subtitle", "body", "quote"] as const;
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export const TEXT_VALIGNS = ["top", "center", "bottom"] as const;
export const BG_MODES = ["default", "theme", "photo"] as const;
export const BG_THEMES = ["manzara", "safak", "lavanta", "adacayi", "sampanya", "gece", "murdum", "marka"] as const;
export const BG_TONES = ["light", "dark"] as const;
export const PHOTO_SCOPES = ["hero", "page"] as const;
export const PAGE_ATTACH = ["fixed", "scroll"] as const;
export const PAGE_CARDS = ["auto", "glass", "opaque"] as const;

export type WorkspaceLayout = (typeof LAYOUTS)[number];
export type CardLevel = (typeof CARD_LEVELS)[number];
export type ViewMode = (typeof VIEW_MODES)[number];
