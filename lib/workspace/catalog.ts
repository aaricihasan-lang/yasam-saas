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
/**
 * "reading" (Okuma) Owner kararıyla (KDO-06, 2026-11-02) kaldırıldı: yalnız ESKİ kayıtlar için şemada kabul edilir,
 * okunduğu yerde "auto"ya çevrilir (lib/workspace/viewMode.normalizeViewMode). Seçicide yalnız SELECTABLE_VIEW_MODES.
 */
export const VIEW_MODES = ["auto", "day", "night", "reading", "focus"] as const;
export const SELECTABLE_VIEW_MODES = ["auto", "day", "night", "focus"] as const;
/** Okuma modu ayarları kaldırıldı (KDO-06); eski kayıtlardaki değerler bozulmasın diye yalnız doğrulamada kullanılır. */
export const READING_WIDTHS = [58, 68, 80] as const;

/**
 * Logo yerleşim çerçeveleri (KDO-05 Serbest Yerleştir, 2026-11-02):
 *  - "page": ana sayfa içerik alanı (üst araç satırı + karşılama + modüller + sağ sütun). x = yatay serbest aralığın
 *    oranı (0–1), y = çerçeve üstünden piksel (0–FREE_Y_MAX), w = çerçeve genişliğine oran.
 *  - "side": sol menünün alt boş alanı (Yaşam Sistemi logosu, menü ve zil satırı bu alanın DIŞINDADIR). Birimler aynı.
 * Eski hazır bölgeler (hero … footer) arayüzden kaldırıldı; yalnız ESKİ kayıtlar bozulmasın diye şemada kabul edilir ve
 * eski yerinde çizilir; düzenlemede ilk dokunuşta aynı noktada serbest yerleşime çevrilir.
 */
export const FREE_LOGO_ZONES = ["page", "side"] as const;
export const LEGACY_LOGO_ZONES = ["hero", "cerceve", "toolbar", "sec", "rightTop", "footer"] as const;
export const LOGO_ZONES = [...LEGACY_LOGO_ZONES, ...FREE_LOGO_ZONES] as const;
export const FREE_Y_MAX = 8000;
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
export type SelectableViewMode = (typeof SELECTABLE_VIEW_MODES)[number];
export type FreeLogoZone = (typeof FREE_LOGO_ZONES)[number];
export const isFreeZone = (z: string): z is FreeLogoZone => z === "page" || z === "side";

// ── P2: görsel depolama ─────────────────────────────────────────────────────
export const ASSET_BUCKET = "expert-workspace";
export const ASSET_KINDS = ["logo", "photo"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
/** Owner kararı 6: logo 2 MB, arka plan fotoğrafı 10 MB (özgün dosya). */
export const ASSET_MAX_BYTES: Record<AssetKind, number> = { logo: 2 * 1024 * 1024, photo: 10 * 1024 * 1024 };
/** Vercel işlev gövdesi ~4,5 MB → sunucu rotasına ≤ 3 MB'lık parçalar. */
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;
/** Piksel bombası sınırı: toplam piksel ve en uzun kenar (çözümlemeden ÖNCE başlıktan denetlenir). */
export const ASSET_MAX_PIXELS = 40_000_000;
export const ASSET_MAX_SIDE = 12_000;
export const ASSET_MIN_SIDE = 16;
/** Varyantların uzun kenarı (en-boy oranı korunur, büyütme yapılmaz). */
export const ASSET_VARIANTS: Record<AssetKind, { desktop: number; mobile: number }> = {
  logo: { desktop: 1200, mobile: 600 },
  photo: { desktop: 2560, mobile: 1280 },
};
export const ASSET_ALLOWED: readonly { mime: string; format: "png" | "jpeg" | "webp"; ext: readonly string[] }[] = [
  { mime: "image/png", format: "png", ext: ["png"] },
  { mime: "image/jpeg", format: "jpeg", ext: ["jpg", "jpeg"] },
  { mime: "image/webp", format: "webp", ext: ["webp"] },
];
/** Geçici ham parçalar (yalnız sunucu yazar/okur; tamamlama / iptal / saatlik temizlikte silinir). */
export const STAGING_BUCKET = "expert-workspace-staging";
/** Yükleme oturumu süresi (DB varsayılanı ile aynı: 15 dk). */
export const UPLOAD_TTL_MS = 15 * 60 * 1000;
/** Tamamlama kilidi: maxDuration (60 sn) üstü; süresi geçen kilit yeniden alınabilir (çöken işlem toparlanır). */
export const PROCESSING_LEASE_MS = 90 * 1000;
/**
 * Okunan her varyant Vercel işlev yanıt sınırının (~4,5 MB) ALTINDA kalmalı → kodlayıcı kaliteyi kademeli düşürür;
 * yine de aşarsa görsel reddedilir. Ham (özgün) dosya HİÇBİR uçtan istemciye dönmez.
 */
export const ASSET_VARIANT_MAX_BYTES = 4_000_000;
/** Aynı işlev örneğinde aynı anda en fazla bu kadar görsel işlenir (Fluid Compute eşzamanlılığında bellek sınırı). */
export const IMAGE_PROCESS_CONCURRENCY = 2;
