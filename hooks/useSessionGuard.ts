"use client";

import { useEffect, useRef } from "react";
import { readYasamUser, type YasamUser } from "@/lib/auth/yasamUser";
import { checkSessionStatus, type SessionEndReason } from "@/lib/auth/sessionExpiry";

const VALIDATE_INTERVAL_MS = 60 * 1000; // 60 saniye — admin terminate / süre dolumu sonrası max 60s içinde

type UseSessionGuardOptions = {
  user: YasamUser | null;
  onSessionInvalid: (reason: SessionEndReason) => void;
};

/**
 * Kullanıcının oturum token'ını periyodik olarak ve sayfa odaklandığında
 * doğrular. Oturum geçersizse onSessionInvalid(reason) çağrılır
 * (reason: "expired" → süre dolumu; "revoked" → iptal/başka cihaz/güvenlik).
 *
 * WEB P1 (2026-10): ADMIN DE kapsamda. Önceden admin "httpOnly cookie korumasına sahip"
 * gerekçesiyle muaftı; sunucu tarafı süre zorlaması (P1-3) açıldıktan sonra süresi dolan admin,
 * localStorage'daki bayat durumla ana sayfada takılı kalıyordu. Sunucu kuralları değişmez;
 * yalnız istemci geçersiz oturumu fark eder. Yük: mevcut 60 sn + görünürlük dönüşü (yeni polling yok).
 */
export function useSessionGuard({ user, onSessionInvalid }: UseSessionGuardOptions): void {
  const onInvalidRef = useRef(onSessionInvalid);
  useEffect(() => {
    onInvalidRef.current = onSessionInvalid;
  });

  useEffect(() => {
    // Giriş yapılmamış → kontrol gerekmez
    if (!user) return;

    let cancelled = false;

    async function validate() {
      // Token yoksa eski oturum — geçmişe dönük zorlama yapma (checkSessionStatus → null)
      const status = await checkSessionStatus();
      // Ağ hatası / belirsiz yanıt → geçersiz SAYILMAZ
      if (!status || cancelled) return;
      if (!status.valid) onInvalidRef.current(status.reason);
    }

    // İlk kontrol: sayfa yüklenince 5 saniye bekle
    const initialTimer = setTimeout(() => void validate(), 5_000);

    // Periyodik kontrol
    const interval = setInterval(() => void validate(), VALIDATE_INTERVAL_MS);

    // Sekme tekrar aktif olduğunda kontrol
    function handleVisibility() {
      if (document.visibilityState === "visible") void validate();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Ana sayfa DIŞI sayfalar (modül + /admin) için aynı kontrol — kullanıcıyı render durumuna
 * almadan, effect içinde localStorage'dan okur (oturumsuz ziyaretçide hiçbir istek yapılmaz).
 * `active` false iken (ör. ana sayfa — kendi useSessionGuard'ı var) çalışmaz.
 */
export function useStoredSessionGuard(
  active: boolean,
  onSessionInvalid: (reason: SessionEndReason) => void,
): void {
  const onInvalidRef = useRef(onSessionInvalid);
  useEffect(() => {
    onInvalidRef.current = onSessionInvalid;
  });

  useEffect(() => {
    if (!active || !readYasamUser()) return;

    let cancelled = false;
    async function validate() {
      const status = await checkSessionStatus();
      if (!status || cancelled) return;
      if (!status.valid) onInvalidRef.current(status.reason);
    }

    const initialTimer = setTimeout(() => void validate(), 5_000);
    const interval = setInterval(() => void validate(), VALIDATE_INTERVAL_MS);
    function handleVisibility() {
      if (document.visibilityState === "visible") void validate();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [active]);
}
