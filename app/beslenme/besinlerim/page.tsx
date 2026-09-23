"use client";
/**
 * Beslenme → Besinlerim (DAR UZMAN GİRİŞİ). Yalnız owner VEYA dar bayraklı uzman
 * (module_permissions.beslenme_manual_food) erişir; aksi → "/"'a yönlendirilir.
 *
 * Kapsam: SYSTEM ortak katalog (salt-okunur) + kendi tenant CUSTOM besinleri. Kendi
 * CUSTOM kaydını ekle/oku/güncelle/arşivle; nutrient/porsiyon tamamla. SYSTEM ve başka
 * tenant YAZILAMAZ (server guard + resolveFoodForWrite). Beslenme modülünün geri kalanı
 * (planlar/danışan/konu yönetimi + Kaynaklar/Geleneksel küratör sekmeleri) BU SAYFADA YOK.
 * Erişim server-authoritative probe ile doğrulanır; UI gizleme tek katman DEĞİLDİR.
 */
import {
  BeslenmeGate,
  useBeslenmeFoodContributorGuard,
} from "../_components/BeslenmeShell";
import { BesinYonetimiScreen } from "../_components/BesinYonetimiScreen";

export default function BesinlerimPage() {
  const { state } = useBeslenmeFoodContributorGuard();
  if (state !== "ok") return <BeslenmeGate state={state} />;
  return <BesinYonetimiScreen mode="contributor" />;
}
