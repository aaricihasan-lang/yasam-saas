"use client";

import { useEffect, useRef } from "react";
import { readSessionToken } from "@/lib/auth/yasamUser";
import type { YasamUser } from "@/lib/auth/yasamUser";

const VALIDATE_INTERVAL_MS = 60 * 1000; // 60 saniye — admin terminate sonrası max 60s içinde kick

type UseSessionGuardOptions = {
  user: YasamUser | null;
  onSessionInvalid: () => void;
};

/**
 * Kullanıcının oturum token'ını periyodik olarak ve sayfa odaklandığında
 * doğrular. Oturum geçersizse onSessionInvalid çağrılır.
 *
 * Yalnızca uzman kullanıcılar için aktif (admin httpOnly cookie korumasına sahip).
 */
export function useSessionGuard({ user, onSessionInvalid }: UseSessionGuardOptions): void {
  const onInvalidRef = useRef(onSessionInvalid);
  onInvalidRef.current = onSessionInvalid;

  useEffect(() => {
    // Admin ya da giriş yapılmamış → kontrol gerekmez
    if (!user || user.role === "admin") return;

    let cancelled = false;

    async function validate() {
      const token = readSessionToken();
      if (!token) return; // Token yoksa eski oturum — geçmişe dönük zorlama yapma

      try {
        const res = await fetch(`/api/auth/session?token=${encodeURIComponent(token)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { valid?: boolean };
        if (!json.valid && !cancelled) {
          onInvalidRef.current();
        }
      } catch {
        // Ağ hatası → geçersiz saymıyoruz
      }
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
