/**
 * Human Design — DEMO GÖRÜNÜMÜ istemci yönlendirmesi (D3, owner kararı 2026-11-02).
 *
 * Demo hesabı (users.is_demo_account=true) Human Design sayfalarındayken YALNIZ izin listesindeki OKUMA istekleri
 * (/api/hd/…) salt okunur demo ucuna (/api/hd/demo/…) yönlenir; böylece mevcut ekranlar hiç değiştirilmeden örnek
 * kişileri gösterir. Diğer her istek (yazma dahil) gerçek uca gider: gerçek uçlar demo hesabına zaten 403 DEMO_READONLY
 * döner, ücretli hesap yapmaz. Eğitim Merkezi yolları (/human-design/egitim-*) ve /api/hd/education KAPSAM DIŞIDIR.
 *
 * Yönlendirme YETKİ DEĞİLDİR: demo ucu her istekte sunucuda demo hesabını doğrular (demoGate); demo olmayan bir oturum
 * yönlenmiş olsa bile tek tip 404 alır. Normal uzman / admin oturumunda bu katman hiçbir isteğe dokunmaz.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const DEMO_GET_PATHS: readonly RegExp[] = [
  /^\/api\/hd\/analyses$/,
  /^\/api\/hd\/charts$/,
  /^\/api\/hd\/charts\/system-reading$/,
  /^\/api\/hd\/clients$/,
  /^\/api\/hd\/journey-clients$/,
  /^\/api\/hd\/relations$/,
  /^\/api\/hd\/relations\/candidates$/,
  new RegExp(`^/api/hd/relations/${UUID}(/knowledge|/reports)?$`, "i"),
];
const DEMO_POST_PATHS: readonly RegExp[] = [/^\/api\/hd\/charts\/variables\/saved$/];

/** Demo görünümü yalnız Human Design uzman sayfalarında (Eğitim Merkezi hariç). */
export function isHdDemoPage(pathname: string): boolean {
  if (pathname !== "/human-design" && !pathname.startsWith("/human-design/")) return false;
  return !pathname.startsWith("/human-design/egitim");
}

/** SAF karar: bu istek demo ucuna yönlenmeli mi? Yönlenecekse yeni yol (sorgu korunur), değilse null. */
export function hdDemoRewrite(method: string, requestPath: string, pagePath: string, isDemo: boolean): string | null {
  if (!isDemo || !isHdDemoPage(pagePath)) return null;
  const m = method.toUpperCase();
  const list = m === "GET" ? DEMO_GET_PATHS : m === "POST" ? DEMO_POST_PATHS : null;
  if (!list || !list.some((re) => re.test(requestPath))) return null;
  return `/api/hd/demo/${requestPath.slice("/api/hd/".length)}`;
}

let installed = false;

/**
 * Pencere fetch'ini bir kez sarar (idempotent). Her istekte güncel kullanıcı + sayfa yolu okunur → demo olmayan oturumda ve
 * HD dışı sayfalarda istek AYNEN geçer.
 */
export function installHdDemoFetchBridge(readIsDemo: () => boolean): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      if (input instanceof Request) return original(input, init);
      const url = new URL(typeof input === "string" ? input : input.href, window.location.origin);
      if (url.origin === window.location.origin) {
        const next = hdDemoRewrite(init?.method ?? "GET", url.pathname, window.location.pathname, readIsDemo());
        if (next) return original(`${next}${url.search}`, init);
      }
    } catch {
      /* çözümlenemeyen istek olduğu gibi gider */
    }
    return original(input, init);
  };
}

/**
 * İstemci görünüm sinyali: demo hesabı Human Design uzman sayfasında mı? YETKİ DEĞİLDİR — yalnız demo örneğinin hazır
 * sekmelerini (Sistem Yorumu / Dört Ok) göstermek içindir; veriyi demo ucu sunucuda demo hesabını doğrulayarak verir.
 */
export function isHdDemoClientView(isDemo: boolean): boolean {
  return isDemo && typeof window !== "undefined" && isHdDemoPage(window.location.pathname);
}
