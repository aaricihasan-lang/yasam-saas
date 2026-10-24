/**
 * Merkezi Hızlı Erişim Menüsü — ROTA YERLEŞİM AYARLARI (tek liste).
 *
 * Menü bağlantıları ve görünürlüğü BURADA DEĞİL: merkezler app/_premium/home/homeCenters.ts (ana sayfa kartlarıyla aynı
 * kilit kararı), alt modüller app/_premium/home/homeModuleNav.ts (ana sayfa "Tüm Modüller" ile aynı katalog + route kapısı)
 * üzerinden gelir. Bu dosya yalnız "menü hangi adreste nasıl yerleşir" bilgisini tutar; yetki kuralı içermez.
 * Owner onaylı prototip: C:\YasamSistemi-Gorsel-Tasarim\hizli-erisim-menu (6073429).
 */

/** Menünün HİÇ gösterilmediği adresler: ana sayfa (kendi premium menüsü), kayıt, herkese açık / yasal sayfalar,
 *  demo vitrini, yönetim paneli (kendi admin kabuğu). Bu adreslerde kabuk yerleşimi hiç etkilemez (display: contents). */
export const QUICK_NAV_HIDDEN_PREFIXES: readonly string[] = [
  "/register",
  "/demo",
  "/admin",
  "/gizlilik-politikasi",
  "/kullanim-sartlari",
  "/kvkk-aydinlatma",
  "/veri-isleme-sozlesmesi",
  "/iletisim",
  "/alt-isleyiciler",
];

/**
 * İçerik alanının genişliği DEĞİŞTİRİLMEYEN hassas ekranlar: menü yalnız üst çubuktaki düğmeyle açılan panel olur.
 *  - Refleksoloji: nokta koordinatları / çizim alanları
 *  - Human Design: BodyGraph ölçeği, görsel kaydı, rapor çıktıları
 *  - Gökyüzü Atlası (+ owner'ın /admin/astroloji ekranı): harita çizimleri ve kendi iç gezintisi
 *  - Tam genişlikte sabit (fixed) alt/üst çubuğu olan ekranlar (modül koduna dokunmadan çakışma olmaz)
 * /admin/astroloji yönetim kabuğundadır; kabuk değiştirilmez, yalnız bu panel erişimi eklenir.
 */
export const QUICK_NAV_OVERLAY_PREFIXES: readonly string[] = [
  "/refleksoloji",
  "/dashboard/refleksoloji",
  "/human-design",
  "/astroloji",
  "/admin/astroloji",
  "/dogaltas/dogaltas-kayit",
  "/dogaltas/mineral-bankasi",
];

/** Yol kalıbıyla (dinamik segmentli) panel modundaki ekranlar: danışan detayı ve alt ekranları (owner onaylı PR #544
 *  yoğun özet kartları / sekmeler — genişliği değişmez; anamnez düzenleyicisinde ayrıca tam genişlik alt çubuk var). */
export const QUICK_NAV_OVERLAY_PATTERNS: readonly RegExp[] = [/^\/dashboard\/clients\/[^/]+(\/|$)/];

/** Aktif sayfa eşlemesi için ek adresler: bu adresler menüde ilgili alt modülü vurgular (yalnız gösterim). */
export const QUICK_NAV_ROUTE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "/danisan-yolculugu/liste": ["/dashboard/clients"],
  "/astroloji": ["/admin/astroloji"],
  "/refleksoloji": ["/dashboard/refleksoloji"],
};

export const QUICK_NAV_COLLAPSE_KEY = "ys-quick-nav-collapsed";
export const QUICK_NAV_OPEN_KEY = "ys-quick-nav-open";
/** quickNav.module.css'teki çekmece kırılımıyla AYNI olmalı. */
export const QUICK_NAV_DRAWER_QUERY = "(max-width: 1024px)";
/** 1025–1799px: kalıcı menü yalnız ikon şeridi; tam panel içeriğin üstünde açılır (quickNav.module.css ile AYNI). */
export const QUICK_NAV_RAIL_QUERY = "(min-width: 1025px) and (max-width: 1799px)";

export const matchesRoute = (path: string, href: string): boolean => path === href || path.startsWith(`${href}/`);

export type QuickNavPlacement = "hidden" | "overlay" | "side";

/** Adrese göre yerleşim (oturum / yetki kararı DEĞİL; o kabukta ayrıca uygulanır). */
export function quickNavPlacement(path: string): QuickNavPlacement {
  if (path === "/") return "hidden";
  if (QUICK_NAV_OVERLAY_PREFIXES.some((p) => matchesRoute(path, p))) return "overlay";
  if (QUICK_NAV_OVERLAY_PATTERNS.some((re) => re.test(path))) return "overlay";
  if (QUICK_NAV_HIDDEN_PREFIXES.some((p) => matchesRoute(path, p))) return "hidden";
  return "side";
}
