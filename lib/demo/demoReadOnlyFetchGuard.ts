/**
 * DEMO VİTRİN — istemci tarafı SALT-OKUNUR fetch kapısı (UX katmanı).
 *
 * Demo hesap (users.is_demo_account=true) artık GERÇEK danışan detay sayfasını kullanır. Sunucu
 * tarafı her mutation'ı zaten 403 ile reddeder (asıl güvenlik oradadır — bu kapı onun YERİNE
 * GEÇMEZ). Bu modül yalnız kullanıcı deneyimi içindir: demo oturumunda aynı-origin `/api/*`
 * yazma istekleri (POST/PUT/PATCH/DELETE) ağa HİÇ çıkmadan standart bir 403 DEMO_READONLY
 * yanıtıyla kısa devre edilir ve TEK (tekilleştirilmiş) bilgilendirme gösterilir → "403 toast
 * yağmuru" ve yarım kalan çok-adımlı akışlar oluşmaz.
 *
 * İstisna: OKUMA amaçlı POST uçları (Word/rapor üretimi, imzalı görsel URL'i, Yaşam Hafızası
 * araması, oturum/telemetri) allowlist ile geçer; bunlar sunucuda da demo için salt-okunur
 * çalışır (DB'ye kalıcı yazma yok, ücretli servis yok).
 */

export const DEMO_READONLY_CODE = "DEMO_READONLY";
export const DEMO_READONLY_MESSAGE =
  "Demo hesabı salt okunurdur: kaydetme, düzenleme, silme ve dosya yükleme işlemleri bu hesapta çalışmaz.";

/** Yazma metodu olsa da VERİ DEĞİŞTİRMEYEN (okuma/çıktı) uçlar. */
const READ_ONLY_POST_PATTERNS: readonly RegExp[] = [
  /^\/api\/auth\//,
  /^\/api\/usage\//,
  /^\/api\/clients\/[^/]+\/word-report$/,
  /^\/api\/clients\/word-report-bulk$/,
  /^\/api\/clients\/[^/]+\/stone-photos\/signed-urls$/,
  /^\/api\/clients\/[^/]+\/yasam-hafizasi\/search$/,
  /^\/api\/yasam-hafizasi\/(search|client-search)$/,
  /^\/api\/beslenme\/plans\/[^/]+\/word$/,
];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestPath(input: RequestInfo | URL, origin: string): string | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, origin);
    if (url.origin !== origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/** SAF karar: bu istek demo oturumunda kısa devre edilmeli mi? */
export function isDemoBlockedRequest(method: string, pathname: string | null): boolean {
  if (!pathname || !pathname.startsWith("/api/")) return false;
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  return !READ_ONLY_POST_PATTERNS.some((re) => re.test(pathname));
}

function blockedResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, code: DEMO_READONLY_CODE, error: DEMO_READONLY_MESSAGE, demo: true }),
    { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}

let installed: { original: typeof fetch; refs: number } | null = null;
let lastNotice = 0;
let noticeHandler: (() => void) | null = null;

/**
 * Demo oturumunda kapıyı kurar; dönen fonksiyon kaldırır (sayfa unmount). Aynı anda birden çok
 * kurulum referans sayımıyla güvenlidir. `onBlocked` 4 sn içinde en fazla BİR kez çağrılır.
 */
export function installDemoReadOnlyFetchGuard(onBlocked: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  noticeHandler = onBlocked;
  if (installed) {
    installed.refs += 1;
  } else {
    const original = window.fetch.bind(window);
    installed = { original, refs: 1 };
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")) || "GET";
      const path = requestPath(input, window.location.origin);
      if (isDemoBlockedRequest(method, path)) {
        const now = Date.now();
        if (now - lastNotice > 4000) {
          lastNotice = now;
          try { noticeHandler?.(); } catch { /* bildirim hatası akışı bozmaz */ }
        }
        return Promise.resolve(blockedResponse());
      }
      return original(input, init);
    };
  }
  return () => {
    if (!installed) return;
    installed.refs -= 1;
    if (installed.refs <= 0) {
      window.fetch = installed.original;
      installed = null;
      noticeHandler = null;
    }
  };
}
