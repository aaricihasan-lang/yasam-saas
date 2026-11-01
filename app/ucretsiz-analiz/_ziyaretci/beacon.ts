"use client";
/**
 * Gece operasyonu — kampanya istatistik bildirimi (tarayıcı). Toplu sayaç; kişisel veri GÖNDERİLMEZ.
 *   - UTM: yalnız utm_source; ilk girişte URL'den okunur, sekme oturumu boyunca sessionStorage'da tutulur.
 *   - Tekil ziyaret: YALNIZ analitik onayı varsa yerel rastgele kimlik (localStorage "km_aid"); onay yoksa kimlik
 *     oluşturulmaz / gönderilmez. Sunucu kimliği günlük HMAC özetine çevirir.
 *   - Hata sessizce yok sayılır (analiz akışını etkilemez).
 */
import { hasAnalyticsConsent } from "@/components/analytics/analyticsConsentClient";

const UTM_KEY = "km_utm";
const AID_KEY = "km_aid";

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

export function campaignUtm(): string {
  return safe(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("utm_source");
    const v = (fromUrl ?? "").trim().toLowerCase();
    if (/^[a-z0-9_.-]{1,40}$/.test(v)) {
      sessionStorage.setItem(UTM_KEY, v);
      return v;
    }
    const kept = sessionStorage.getItem(UTM_KEY) ?? "";
    return /^[a-z0-9_.-]{1,40}$/.test(kept) ? kept : "";
  }, "");
}

function analyticsId(): string | null {
  if (!safe(() => hasAnalyticsConsent(), false)) return null;
  return safe(() => {
    let id = localStorage.getItem(AID_KEY);
    if (!id || !/^[A-Za-z0-9_-]{22,64}$/.test(id)) {
      const b = new Uint8Array(18);
      crypto.getRandomValues(b);
      id = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem(AID_KEY, id);
    }
    return id;
  }, null);
}

export function sendCampaignEvent(event: "sayfa" | "rapor_indir" | "uyelik_tikla", technique?: string): void {
  const aid = event === "sayfa" ? analyticsId() : null;
  const body = JSON.stringify({ event, utm: campaignUtm(), ...(technique ? { technique } : {}), ...(aid ? { aid, consent: true } : {}) });
  // keepalive yalnız sayfadan ayrılan tıklamada (üyelik bağlantısı) gerekir; diğerlerinde normal istek.
  void fetch("/api/kampanya/olay", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", keepalive: event === "uyelik_tikla", body })
    // Yanıt gövdesi tüketilir: okunmayan gövde bağlantıyı / isteği açık bırakabilir.
    .then((r) => r.text())
    .catch(() => undefined);
}
