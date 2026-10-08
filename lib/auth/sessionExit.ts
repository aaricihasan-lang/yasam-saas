"use client";

import { markSessionEnded, type SessionEndReason } from "@/lib/auth/sessionExpiry";

/**
 * WT4 — oturum sona erdiğinde (sunucu iki kez kesin "geçersiz" dedi / başka sekmede çıkış yapıldı)
 * modül sayfasından giriş akışına GÜVENİLİR dönüş.
 *
 * KÖK NEDEN (Playwright ile yeniden üretildi): oturum sonu akışı önce yerel oturumu temizliyor,
 * sonra `location.replace("/")` yapıyordu. Sayfada kaydedilmemiş değişiklik varsa (Şifa Rehberi
 * düzenleme vb.) modülün `beforeunload` guard'ı "Siteden ayrılsın mı?" penceresi açıyor; "Kal"
 * (veya WebView'ın pencereyi reddetmesi) yönlendirmeyi İPTAL ediyordu. Sonuç: kullanıcı OTURUMSUZ
 * hâlde aynı formda kalıyor → Kaydet/Sil "Yetki gerekli" (boş x-user-id) → geri tuşu "Yetkiniz
 * Bulunmuyor" → "Ana Panele Dön" giriş ekranı.
 *
 * ÇÖZÜM: önce istemci-tarafı (Next router) yönlendirme — `beforeunload` TETİKLENMEZ, korumalı sayfa
 * unmount olur ve modüllerin guard dinleyicileri kendi effect temizliğiyle kalkar. Ardından (bellek
 * içi durumun tamamen sıfırlanması için) eskisi gibi tam sayfa `location.replace`; bu noktada
 * engelleyecek guard kalmamıştır. Not: capture-fazı `stopImmediatePropagation` Chrome'da
 * beforeunload penceresini ENGELLEMİYOR (denendi) → kullanılmaz.
 * Normal kullanımda (oturum açık) hiçbir guard etkilenmez.
 */
export function leaveAfterSessionEnd(
  href: string,
  reason: SessionEndReason,
  softNavigate: (href: string) => void,
  maxWaitMs = 3000,
): void {
  if (typeof window === "undefined") return;
  markSessionEnded(reason);
  try {
    softNavigate(href);
  } catch {
    /* yönlendirici yoksa doğrudan tam sayfa */
  }
  // Tam yükleme, istemci-tarafı geçiş TAMAMLANINCA (korumalı sayfa unmount → guard'lar kalktı)
  // yapılır; geçiş gecikirse en geç maxWaitMs sonra yine yapılır.
  const started = Date.now();
  const target = new URL(href, window.location.href).pathname;
  const tick = () => {
    const arrived = window.location.pathname === target;
    if (!arrived && Date.now() - started < maxWaitMs) {
      window.setTimeout(tick, 100);
      return;
    }
    // Ana sayfa istemci-tarafı açılışta nedeni tüketmiş olabilir → tam yüklemede de gösterilsin.
    markSessionEnded(reason);
    window.setTimeout(() => window.location.replace(href), arrived ? 150 : 0);
  };
  window.setTimeout(tick, 100);
}
