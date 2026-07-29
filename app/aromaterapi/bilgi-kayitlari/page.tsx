"use client";

import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { AromaterapiSectionSkeletonCard } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

/**
 * Bilgi Kayıtları (C3A çekirdek bölüm) — C3B görsel iskeleti.
 *
 * Bu sayfa C3B'de yalnız kabuk + bölüm yapısını gösterir; veri okuma/arama ve
 * oluşturma/güncelleme sonraki ürünleştirme adımlarında (C3C/C3D) etkinleşir.
 * API çağrısı yapmaz, sahte kayıt göstermez.
 */
export default function BilgiKayitlariPage() {
  return (
    <AromaterapiSectionShell
      title="Bilgi Kayıtları"
      subtitle="Kaynağa dayalı, kanıt ve provenans taşıyan bilgi kayıtları. Güvenlik konuları burada filtre ve bağlamsal uyarı olarak ele alınır."
      icon="📑"
    >
      <div className="space-y-4">
        <AromaterapiEmptyState
          variant="pending"
          title="Bilgi Kayıtları hazırlanıyor"
          message="Bu bölümün okuma ve arama bağlantıları sonraki ürünleştirme adımında etkinleştirilecektir. Aşağıda bölümün alacağı yapı görülmektedir."
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <AromaterapiSectionSkeletonCard
            title="Kayıt Listesi"
            hint="Kaydedilmiş bilgi kayıtları; bölüme, konuya ve güvenlik durumuna göre aranıp filtrelenebilir."
          />
          <AromaterapiSectionSkeletonCard
            title="Kanıt & Kaynak"
            hint="Her kaydın dayandığı kaynaklar, pasajlar ve ilişkiler; sonuç provenansı ve kanıt katmanı."
          />
          <AromaterapiSectionSkeletonCard
            title="Değişiklik Geçmişi"
            hint="Kayıt detayında; oluşturma ve güncelleme adımlarının izlenebilir geçmişi."
          />
        </div>
      </div>
    </AromaterapiSectionShell>
  );
}
