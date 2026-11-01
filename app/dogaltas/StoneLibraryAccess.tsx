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
 */
const ANDROID_CARD_PROBE_TTL_MS = 30_000;
let androidCardProbe: { key: string; at: number; result: Promise<boolean> } | null = null;

function probeAndroidCard(key: string): Promise<boolean> {
  const now = Date.now();
  if (androidCardProbe && androidCardProbe.key === key && now - androidCardProbe.at < ANDROID_CARD_PROBE_TTL_MS) {
    return androidCardProbe.result;
  }
  const result = viewerGet<{ ok: true }>("/api/dogaltas/kutuphane?yoklama=1").then(
    (r) => r.ok === true && r.status === 200,
    () => false,
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
    void probeAndroidCard(key).then((allowed) => {
      if (alive) setAndroid({ key, allowed });
    });
    return () => {
      alive = false;
    };
  }, [serverAllowed, key]);
  if (serverAllowed) return true;
  return android !== null && android.key === key && android.allowed;
}
