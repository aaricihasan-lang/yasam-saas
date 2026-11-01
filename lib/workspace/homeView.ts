/**
 * KİŞİSEL DİJİTAL OFİS (P3) — uzman ana sayfası görünüm sözleşmesi (saf; ağ / DB / React YOK, istemci güvenli).
 *
 * P1 tasarım (`WorkspaceDesign`) + P1 tercihler (`UiPrefs`) → ana sayfa bileşenlerinin (app/_premium/home/Home*.tsx)
 * ileride okuyacağı TEK görünüm nesnesi. P3'te ana sayfa bunu henüz OKUMAZ (bağlantı P4+); sözleşme ve testler hazırdır.
 *
 * Kurallar:
 *  - Tasarım ve tercihler BAĞIMSIZDIR: biri null / varsayılan olsa da diğeri olduğu gibi uygulanır
 *    ("Tasarımımı sıfırla" yalnız `design`'ı null yapar; gizlenen modüller ve Favorilerim korunur).
 *  - Görsel URL'si YALNIZ sunucunun ürettiği varlık kimliğinden (uuid) kurulur → P2 güvenli uç
 *    `/api/settings/workspace/assets/<id>?v=desktop|mobile`. Dış URL / dosya yolu hiçbir koşulda üretilmez.
 *  - Gizleme yalnız GÖRÜNÜRLÜKTÜR: yetki / kilit kararı vermez, kilidi açmaz; kilit çağıranın getCenterLock kuralında kalır.
 *  - Favorilerim yalnız erişilebilir modüllerden, tekrarsız, en çok FAVORITES_MAX.
 *  - Kalıcı Yaşam Sistemi logosu kişiselleştirmeden ETKİLENMEZ (`systemLogo` daima true); kişisel logo ayrı alandır.
 *  - Yalnız uzman ana sayfasına uygulanır; iç modül ekranları bu nesneyi kullanmaz.
 */
import { FAVORITE_KEYS, FAVORITES_MAX, WORKSPACE_CENTERS, type CardLevel, type ViewMode, type WorkspaceLayout } from "./catalog";
import { DEFAULT_UI_PREFS, UUID_RE, type ReadingPrefs, type UiPrefs, type WorkspaceDesign } from "./schema";

export type AssetVariant = "desktop" | "mobile";
export type AssetUrls = { desktop: string; mobile: string };

export type HomeViewCenter = {
  key: string;
  /** Kullanıcı merkezi gizledi mi (yalnız görünürlük; kilit / yetki DEĞİL). */
  hidden: boolean;
  modules: { key: string; hidden: boolean }[];
};

export type HomeView = {
  /** Kişisel tasarım uygulanıyor mu; false → bugünkü varsayılan ana sayfa birebir. */
  personalized: boolean;
  layout: WorkspaceLayout | null;
  hero: WorkspaceDesign["text"] | null;
  background: (Omit<WorkspaceDesign["bg"], "photoAssetId"> & { photo: AssetUrls | null }) | null;
  logo: { systemLogo: true; personal: (Omit<WorkspaceDesign["logo"], "assetId"> & { image: AssetUrls | null }) | null };
  brand: WorkspaceDesign["brand"];
  centers: HomeViewCenter[];
  /** "module:<anahtar>" biçiminde, kullanıcının sırasıyla. */
  favorites: string[];
  cardLevel: CardLevel;
  viewMode: ViewMode;
  reading: ReadingPrefs;
};

/** Varlık kimliği → P2 güvenli görsel ucu. Geçersiz kimlik → null (asla ham değer URL'ye konmaz). */
export function workspaceAssetUrl(assetId: string | null | undefined, variant: AssetVariant): string | null {
  if (typeof assetId !== "string" || !UUID_RE.test(assetId)) return null;
  return `/api/settings/workspace/assets/${assetId}?v=${variant}`;
}

function assetUrls(assetId: string | null | undefined): AssetUrls | null {
  const desktop = workspaceAssetUrl(assetId, "desktop");
  const mobile = workspaceAssetUrl(assetId, "mobile");
  return desktop && mobile ? { desktop, mobile } : null;
}

export function resolveHomeView(input: {
  design: WorkspaceDesign | null | undefined;
  prefs: UiPrefs | null | undefined;
  /** Kullanıcının erişebildiği modül anahtarları (çıplak, öneksiz). Verilmezse Favorilerim boş döner (güvenli varsayılan). */
  accessibleModules?: ReadonlySet<string>;
}): HomeView {
  const design = input.design ?? null;
  const prefs = input.prefs ?? DEFAULT_UI_PREFS;
  const hidden = new Set(prefs.hiddenModules);

  const centers: HomeViewCenter[] = WORKSPACE_CENTERS.map((c) => ({
    key: c.key,
    hidden: hidden.has(`center:${c.key}`),
    modules: c.modules.map((m) => ({ key: m, hidden: hidden.has(`module:${m}`) })),
  }));

  const accessible = input.accessibleModules;
  const favorites: string[] = [];
  for (const f of prefs.favorites) {
    if (favorites.length >= FAVORITES_MAX) break;
    if (!FAVORITE_KEYS.has(f) || favorites.includes(f)) continue;
    if (!accessible || !accessible.has(f.slice("module:".length))) continue;
    favorites.push(f);
  }

  let background: HomeView["background"] = null;
  let personalLogo: HomeView["logo"]["personal"] = null;
  if (design) {
    const { photoAssetId, ...bg } = design.bg;
    background = { ...bg, photo: bg.mode === "photo" ? assetUrls(photoAssetId) : null };
    const { assetId, ...logo } = design.logo;
    personalLogo = { ...logo, image: assetUrls(assetId) };
  }

  return {
    personalized: design !== null,
    layout: design ? design.layout : null,
    hero: design ? design.text : null,
    background,
    logo: { systemLogo: true, personal: personalLogo },
    brand: design ? design.brand : null,
    centers,
    favorites,
    cardLevel: prefs.cardLevel,
    viewMode: prefs.viewMode,
    reading: { ...prefs.reading },
  };
}
