"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * HUMAN DESIGN — kaydedilmemiş değişiklik koruması (uygulama içi gezinme dâhil).
 *
 * Kupa & Hacamat modülünde kanıtlanmış desenin HD kopyası (modüller arası import yok):
 * `beforeunload` yalnız sekme kapanışı/yenileme için çalışır; Next istemci yönlendirmesi
 * (menü, logo, breadcrumb linkleri) ve tarayıcı/Android GERİ tuşu onu tetiklemez. Bu hook
 * `dirty` iken üç yolu da kapatır:
 *   1) Yenileme/kapanış → tarayıcının standart `beforeunload` uyarısı.
 *   2) Sayfa içi link tıklaması → tıklama yakalanır (capture), `confirmLeave()` sorulur;
 *      onaylanırsa hedefe `router.push` ile gidilir, iptalde sayfada kalınır.
 *   3) Geri tuşu → dirty olunca aynı URL'ye bir "nöbetçi" geçmiş kaydı eklenir. Geri basılınca
 *      nöbetçi düşer (sayfa değişmez) ve `confirmLeave()` sorulur: iptal → nöbetçi yeniden
 *      eklenir; onay → bir adım daha geri gidilir (gerçek önceki sayfa).
 *
 * `dirty=false` iken hiçbir uyarı çıkmaz (kaydedilmiş formda gereksiz soru yok).
 */
export function useHdLeaveGuard(dirty: boolean, confirmLeave: () => Promise<boolean>): void {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  const confirmRef = useRef(confirmLeave);
  const sentinelRef = useRef(false);
  const leavingRef = useRef(false);
  const askingRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
    confirmRef.current = confirmLeave;
  });

  // 1) Yenileme / sekme kapanışı.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // 2) Uygulama içi link tıklamaları (capture: Next <Link> onClick'inden ÖNCE).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || leavingRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      if (askingRef.current) return;
      askingRef.current = true;
      void confirmRef.current().then((ok) => {
        askingRef.current = false;
        if (!ok) return;
        leavingRef.current = true;
        router.push(url.pathname + url.search + url.hash);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  // 3) Tarayıcı / Android geri tuşu.
  useEffect(() => {
    if (!dirty || sentinelRef.current) return;
    window.history.pushState(window.history.state, "", window.location.href);
    sentinelRef.current = true;
  }, [dirty]);

  useEffect(() => {
    const onPopState = () => {
      if (!sentinelRef.current) return;
      sentinelRef.current = false;
      if (leavingRef.current) return;
      // Değişiklikler bu arada kaydedildiyse nöbetçi kayıt artık gereksiz: kullanıcının geri
      // basışı "yutulmasın" diye bir adım daha geri gidilir (gerçek önceki sayfa).
      if (!dirtyRef.current) {
        window.history.back();
        return;
      }
      if (askingRef.current) return;
      askingRef.current = true;
      void confirmRef.current().then((ok) => {
        askingRef.current = false;
        if (ok) {
          leavingRef.current = true;
          window.history.back();
        } else {
          window.history.pushState(window.history.state, "", window.location.href);
          sentinelRef.current = true;
        }
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}

/**
 * Programatik yönlendirmeden ÖNCE (ör. "Listeye Dön" butonu) aynı soruyu sormak için yardımcı:
 * dirty değilse doğrudan true döner.
 */
export async function confirmIfDirty(dirty: boolean, confirmLeave: () => Promise<boolean>): Promise<boolean> {
  if (!dirty) return true;
  return confirmLeave();
}
