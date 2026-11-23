/**
 * HTTPONLY — ESKİ TOKEN → ÇEREZ GEÇİŞ KAPISI (yalnız istemci; Android geçişi B-1).
 *
 * Sorun: çerez taşımasına geçen bir tarayıcıda / WebView'da localStorage'da eski token kalmışsa, ilk açılışta panel
 * istekleri (bileşen efektleri) tek seferlik çerez yazımı (ensureWebCookieSession) bitmeden gider; çerez taşımasında
 * başlık da eklenmez → ~350 ms boyunca 401.
 *
 * Çözüm: geçiş BEKLİYORKEN (isWebCookieMigrationPending) aynı kaynak `/api/` istekleri, tek uçuşlu geçişi bekler.
 *   - Kimlik bilgisi DEĞİŞMEZ (token başlığa geri eklenmez); sunucu kararı aynen gelir — gerçek 401 gizlenmez.
 *   - Üst sınır GATE_MAX_MS; sayfa başına TEK deneme (başarısız geçişte istekler hemen gerçek sonucunu alır, tekrar
 *     fırtınası yok). Ağ hatası / 5xx / geçersiz oturum → ensureWebCookieSession token'ı korur, istek devam eder.
 *   - `/api/auth/session*` (geçişin kendi uçları, giriş/çıkış/durum) ve `/api/auth/mfa/*` (oturumsuz ikinci adım; bağlama
 *     kendi HttpOnly çerezinde) kapı dışıdır → kilitlenme / gereksiz bekleme yok.
 *   - Geçiş beklemiyorsa (normal web çerez oturumu, Android header kipi, token yok) davranış BİREBİR aynıdır.
 */
import { ensureWebCookieSession, isWebCookieMigrationPending } from "@/lib/auth/yasamUser";

export const COOKIE_MIGRATION_GATE_MAX_MS = 4000;

/** Bu istek geçişi beklemeli mi? (saf) */
export function isGatedRequestPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (pathname === "/api/auth/session" || pathname.startsWith("/api/auth/session/")) return false;
  return !pathname.startsWith("/api/auth/mfa/");
}

function requestPathname(input: RequestInfo | URL, origin: string): string | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, origin);
    return u.origin === origin ? u.pathname : null;
  } catch {
    return null;
  }
}

let installed = false;
let gate: Promise<void> | null = null;
let gateSettled = false;

function waitForMigration(): Promise<void> {
  if (!gate) {
    gate = Promise.race([
      ensureWebCookieSession(),
      new Promise<void>((resolve) => setTimeout(resolve, COOKIE_MIGRATION_GATE_MAX_MS)),
    ]).catch(() => undefined).finally(() => {
      gateSettled = true;
    });
  }
  return gate;
}

/** Kapıyı bir kez kurar (modül yüklenirken; bileşen efektlerinden ÖNCE çağrılmalı). */
export function installCookieMigrationFetchGate(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (gateSettled || !isWebCookieMigrationPending()) return original(input, init);
    const path = requestPathname(input, window.location.origin);
    if (!path || !isGatedRequestPath(path)) return original(input, init);
    return waitForMigration().then(() => original(input, init));
  };
}
