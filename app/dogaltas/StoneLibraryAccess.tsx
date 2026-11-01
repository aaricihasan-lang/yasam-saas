"use client";

/**
 * Doğaltaş Kütüphanesi erişimi — sunucuda (app/dogaltas/layout.tsx, ilk çizim) verilen kararı istemci bileşenlerine taşır.
 * Varsayılan false (fail-closed). Yetki kararı burada VERİLMEZ; yalnız sunucudan gelen değer okunur.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useIsAndroidApp } from "@/hooks/useIsAndroidApp";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { viewerGet } from "./kutuphane/_shared/api";

const StoneLibraryAccessContext = createContext(false);

export function StoneLibraryAccessProvider({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return <StoneLibraryAccessContext.Provider value={allowed}>{children}</StoneLibraryAccessContext.Provider>;
}

export const useStoneLibraryAccess = (): boolean => useContext(StoneLibraryAccessContext);

/*
 * G2-01B / A1 (owner onayı 01.11.2026): YALNIZ resmî Android uygulamasında Doğaltaş Kütüphanesi KARTI.
 * Kök neden: ilk çizim kararı yalnız çerezle verilir; Android oturumu başlıktadır → sunucu ilk çizimde kullanıcıyı göremez.
 * Web: sunucu kararı AYNEN döner, istek YOK. Android: mevcut kimlikli kütüphane kapısına (?yoklama=1) başlık oturumuyla tek
 * istek; YALNIZ 200 + ok → kart. 401/403/404/5xx/ağ hatası/belirsizlik → gizli. UA yetki kanıtı DEĞİLDİR (yalnız sorup
 * sormamayı belirler). Sonuç kalıcı depoya yazılmaz; yalnız aynı oturum anahtarı (kullanıcı + token) için 30 sn bellekte
 * paylaşılır (Suspense yedeği → içerik geçişinde çift istek olmasın). Oturum değişince anahtar değişir, eski sonuç kullanılmaz.
 * Olumlu sonuç SÜRESİZ DEĞİL: doğrulama (istek) anından en çok TTL geçerli; süre dolunca taze yoklama, GRACE içinde olumlu
 * yanıt yoksa gizli (fail-closed). 404 (yetki yok / iptal) → gizli, bu sayfada bir daha sorulmaz; ağ / 5xx → gizli, TTL sonra
 * yeniden denenir. Uygulama arka plandayken istek yok; süre dolduysa gizli, öne gelince hemen yeniden doğrulanır.
 */
const ANDROID_CARD_PROBE_TTL_MS = 30_000;
const ANDROID_CARD_REVALIDATE_GRACE_MS = 10_000;
type AndroidCardProbe = { allowed: boolean; denied: boolean; at: number };
let androidCardProbe: { key: string; at: number; result: Promise<AndroidCardProbe> } | null = null;

function probeAndroidCard(key: string, fresh: boolean): Promise<AndroidCardProbe> {
  const now = Date.now();
  if (!fresh && androidCardProbe && androidCardProbe.key === key && now - androidCardProbe.at < ANDROID_CARD_PROBE_TTL_MS) {
    return androidCardProbe.result;
  }
  const result = viewerGet<{ ok: true }>("/api/dogaltas/kutuphane?yoklama=1").then(
    (r) => ({ allowed: r.ok === true && r.status === 200, denied: !r.ok && r.status === 404, at: now }),
    () => ({ allowed: false, denied: false, at: now }),
  );
  androidCardProbe = { key, at: now, result };
  return result;
}

/** Kütüphane KARTI erişimi: web = ilk çizim sunucu kararı; resmî Android uygulaması = kimlikli kapı doğrulaması. */
export function useStoneLibraryCardAccess(): boolean {
  const serverAllowed = useStoneLibraryAccess();
  const isAndroidApp = useIsAndroidApp();
  const userId = isAndroidApp ? readYasamUser()?.id ?? "" : "";
  const token = isAndroidApp ? readSessionToken() ?? "" : "";
  const key = userId && token ? `${userId}|${token}` : "";
  const [android, setAndroid] = useState<{ key: string; allowed: boolean } | null>(null);
  useEffect(() => {
    if (serverAllowed || !key) return;
    let alive = true;
    let denied = false;
    let seq = 0;
    let revalidateTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const check = (fresh: boolean) => {
      const mine = ++seq;
      void probeAndroidCard(key, fresh).then((p) => {
        if (!alive || mine !== seq) return; // geç / eski yanıt yok sayılır
        clearTimeout(graceTimer);
        setAndroid({ key, allowed: p.allowed });
        denied = p.denied;
        clearTimeout(revalidateTimer);
        if (!denied) revalidateTimer = setTimeout(revalidate, Math.max(0, p.at + ANDROID_CARD_PROBE_TTL_MS - Date.now()));
      });
    };
    const revalidate = () => {
      if (!alive || denied) return;
      if (document.visibilityState !== "visible") {
        setAndroid({ key, allowed: false }); // süre doldu, arka planda istek yok → fail-closed
        return;
      }
      clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        if (alive) setAndroid({ key, allowed: false });
      }, ANDROID_CARD_REVALIDATE_GRACE_MS);
      check(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    check(false);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      clearTimeout(revalidateTimer);
      clearTimeout(graceTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [serverAllowed, key]);
  if (serverAllowed) return true;
  return android !== null && android.key === key && android.allowed;
}
