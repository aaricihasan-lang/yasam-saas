/**
 * GİRİŞ GÜVENLİĞİ F2-J — Android uygulamasında YÖNETİCİ oturumunu güvenilir telefona bağlama (istemci tarafı).
 *
 * Sunucu, Android yönetici oturumuna uzun süreyi YALNIZ cihaz anahtarı imzasından sonra verir (kanıtsız: web süreleri
 * 24 sa / 2 sa). Akış: sayfa oturum anahtarıyla nonce ister → `/m/oturum-bagla#s=<oturum>&n=<nonce>` adresine gider →
 * uygulama (2.0.0+) bu ANA ÇERÇEVE gezinmesini yakalar, biyometri / cihaz kilidiyle imzalar, kanıtı kendisi gönderir ve
 * sonucu `yasam-oturum-bagla` olayıyla bildirir. Oturum anahtarı yerel koda verilmez.
 *
 * Yalnız User-Agent'ta `YasamOturumBagla/1` yeteneği olan uygulamada çalışır (1.9.x ve tarayıcılar: hiçbir şey yapmaz).
 * Bu ek bir güvenlik kanıtı DEĞİLDİR; yalnız gezinmenin yakalanacağını bildirir.
 */
const CAPABILITY = "YasamOturumBagla/1";
const WAIT_MS = 3 * 60 * 1000;

export type SessionBindOutcome = "bound" | "not_required" | "unsupported" | "failed";

export function supportsSessionDeviceBind(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.userAgent === "string" && navigator.userAgent.includes(CAPABILITY);
}

let inFlight: Promise<SessionBindOutcome> | null = null;

/** Oturumu bu telefona bağlar / kanıtı yeniler. Aynı anda tek istek. */
export function requestSessionDeviceBind(token: string | null | undefined): Promise<SessionBindOutcome> {
  if (!supportsSessionDeviceBind() || typeof window === "undefined" || !token) return Promise.resolve("unsupported");
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<SessionBindOutcome> => {
    try {
      const res = await fetch("/api/auth/session/device-bind/begin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-session-token": token },
        body: "{}",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => null)) as { required?: unknown; sessionId?: unknown; nonce?: unknown } | null;
      if (!res.ok) return "failed";
      if (j?.required === false) return "not_required";
      const sid = typeof j?.sessionId === "string" ? j.sessionId : "";
      const nonce = typeof j?.nonce === "string" ? j.nonce : "";
      if (!/^[0-9a-f-]{36}$/.test(sid) || !/^[0-9a-f]{64}$/.test(nonce)) return "failed";
      const result = new Promise<SessionBindOutcome>((resolve) => {
        const timer = window.setTimeout(() => { window.removeEventListener("yasam-oturum-bagla", onDone); resolve("failed"); }, WAIT_MS);
        function onDone(e: Event) {
          window.clearTimeout(timer);
          window.removeEventListener("yasam-oturum-bagla", onDone);
          resolve((e as CustomEvent<{ ok?: unknown }>).detail?.ok === true ? "bound" : "failed");
        }
        window.addEventListener("yasam-oturum-bagla", onDone);
      });
      // Uygulama bu gezinmeyi yakalar ve İPTAL eder (sayfa değişmez). Bilinçli olarak gerçek (ana çerçeve) gezinme:
      // istemci yönlendirmesi (router.push) WebView'in shouldOverrideUrlLoading'ine ulaşmaz.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/m/oturum-bagla#s=${encodeURIComponent(sid)}&n=${encodeURIComponent(nonce)}`);
      return await result;
    } catch {
      return "failed";
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
