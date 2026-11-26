/**
 * ÜYE PASİFLEŞTİRME F5 — "hesap şimdi pasif" istemci sinyali (yalnız tarayıcı).
 *
 * Sorun: profil senkronu 90 sn TTL'lidir (USER_SYNC_TTL_MS). Yönetici uzmanı OTURUMU AÇIKKEN pasif yaparsa, bu süre
 * içindeki istemci geçişleri önbellekteki "aktif" profille modül iskeletini açar (veri gelmez: sunucu 403).
 *
 * Çözüm: aynı kaynak `/api/` isteğine 403 + gövde `code: "ACCOUNT_RESTRICTED"` (verifyUserRequest) dönerse pencereye
 * ACCESS_RESTRICTED_EVENT yayılır; dinleyiciler (rota koruması, ana sayfa) profili ZORLA tazeler ve kilitler.
 *   - Yanıt DEĞİŞMEZ (gövde kopyadan okunur); yalnız 403'te çalışır → normal kullanımda ek istek / maliyet YOK.
 *   - Sinyal ≤ 1 / 3 sn (tek ekrandaki çoklu 403 tek tazeleme üretir). Hata → sessizce yok sayılır.
 */
import { ACCESS_RESTRICTED_CODE } from "@/lib/auth/accessRestriction";

export const ACCESS_RESTRICTED_EVENT = "yasam:access-restricted" as const;
const SIGNAL_MIN_GAP_MS = 3000;

let installed = false;
let lastSignalAt = 0;

function isSameOriginApi(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

/** Gözlemciyi bir kez kurar (modül yüklenirken). */
export function installAccessRestrictionSignal(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const p = original(input, init);
    if (!isSameOriginApi(input)) return p;
    return p.then((res) => {
      if (res.status === 403 && Date.now() - lastSignalAt >= SIGNAL_MIN_GAP_MS) {
        void res
          .clone()
          .json()
          .then((body: unknown) => {
            if ((body as { code?: unknown } | null)?.code !== ACCESS_RESTRICTED_CODE) return;
            if (Date.now() - lastSignalAt < SIGNAL_MIN_GAP_MS) return;
            lastSignalAt = Date.now();
            window.dispatchEvent(new Event(ACCESS_RESTRICTED_EVENT));
          })
          .catch(() => undefined);
      }
      return res;
    });
  };
}
