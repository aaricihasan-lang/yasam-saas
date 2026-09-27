/**
 * Analitik (Google Analytics / Vercel Analytics) gizlilik politikası — SAF modül.
 *
 * KURAL (FAZ1 FINAL HARDENING — INFRA):
 *   - Google Analytics YALNIZ herkese açık sayfalarda ve YALNIZ oturum açılmamış
 *     ziyaretçide yüklenir / veri gönderir (rota İZİN LİSTESİ; kara liste değil).
 *   - Oturum açık kullanıcıda (uzman/admin) GA hiç yüklenmez; yüklenmişse
 *     `ga-disable-<ID>` bayrağıyla susturulur.
 *   - Uygulama içi rotalar (dashboard, danışan, modül, admin …) GA'ya ASLA gitmez →
 *     danışan UUID'si GA'ya sızamaz.
 *   - Vercel Analytics / Speed Insights'a giden URL'lerde UUID/sayısal kimlikler
 *     maskelenir, query/hash atılır (redactAnalyticsUrl).
 *
 * Client + server import edilebilir (DOM/Node API'si YOK).
 */

export const GA_MEASUREMENT_ID = "G-1W3D0G2TBN";

/** GA'nın yüklenebileceği herkese açık rotalar (tam eşleşme; alt yol YOK). */
export const PUBLIC_ANALYTICS_PATHS: ReadonlyArray<string> = [
  "/",
  "/gizlilik-politikasi",
  "/kullanim-sartlari",
  "/kvkk-aydinlatma",
  "/veri-isleme-sozlesmesi",
  "/alt-isleyiciler",
  "/iletisim",
  "/register",
];

function normalizePath(pathname: string | null | undefined): string {
  const raw = String(pathname ?? "").split(/[?#]/)[0] || "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const trimmed = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
  return trimmed || "/";
}

/** Rota GA izin listesinde mi? (oturum durumundan bağımsız) */
export function isGaAllowedPath(pathname: string | null | undefined): boolean {
  return PUBLIC_ANALYTICS_PATHS.includes(normalizePath(pathname));
}

/**
 * GA etkin olmalı mı? Herkese açık rota + oturum YOK.
 * Ana sayfa (/) hem giriş/tanıtım hem de oturum sonrası panel olduğundan oturum
 * varsa (hasSession) GA kapalıdır.
 */
export function shouldEnableAnalytics(input: {
  pathname: string | null | undefined;
  hasSession: boolean;
}): boolean {
  if (input.hasSession) return false;
  return isGaAllowedPath(input.pathname);
}

/** GA'ya gönderilecek sayfa yolu: yalnız normalize path (query/hash YOK). */
export function analyticsPagePath(pathname: string | null | undefined): string {
  return normalizePath(pathname);
}

const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Vercel Analytics / Speed Insights URL maskeleme: query + hash atılır, UUID'ler
 * `[id]`, yalnız rakamlardan oluşan (≥4) yol parçaları `[n]` olur.
 * Geçersiz URL → yalnız yol kısmı üzerinde aynı maskeleme.
 */
export function redactAnalyticsUrl(url: string): string {
  const maskPath = (p: string) =>
    p
      .replace(UUID_SEGMENT, "[id]")
      .split("/")
      .map((seg) => (/^\d{4,}$/.test(seg) ? "[n]" : seg))
      .join("/");
  try {
    const u = new URL(url);
    return `${u.origin}${maskPath(u.pathname)}`;
  } catch {
    return maskPath(String(url).split(/[?#]/)[0]);
  }
}
