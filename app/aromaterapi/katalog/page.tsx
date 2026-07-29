"use client";

import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { AromaterapiSectionSkeletonCard } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

/**
 * Bitki & Preparat Kataloğu — C3B görsel iskeleti.
 *
 * Bitki (takson) ve preparat kanonik omurgası; bilgi kayıtlarının dayanağıdır.
 * C3B'de yalnız yapı gösterilir; okuma/arama ve kayıt yönetimi sonraki adımlarda
 * etkinleşir. API çağrısı yapmaz, sahte içerik göstermez.
 */
export default function KatalogPage() {
  return (
    <AromaterapiSectionShell
      title="Bitki & Preparat Kataloğu"
      subtitle="Bitki (takson) ve preparat kanonik kayıtları — bilgi kaydının bağlandığı omurga."
      icon="🌱"
    >
      <div className="space-y-4">
        <AromaterapiEmptyState
          variant="pending"
          title="Katalog hazırlanıyor"
          message="Bu bölümün okuma ve arama bağlantıları sonraki ürünleştirme adımında etkinleştirilecektir. Aşağıda kataloğun alacağı yapı görülmektedir."
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AromaterapiSectionSkeletonCard
            title="Bitkiler (Takson)"
            hint="Botanik kimlik; cins, tür ve familya bilgisiyle kanonik bitki kayıtları."
          />
          <AromaterapiSectionSkeletonCard
            title="Preparatlar"
            hint="Bir taksona bağlı preparat formları (uçucu yağ, hidrosol, maserasyon vb.)."
          />
        </div>
      </div>
    </AromaterapiSectionShell>
  );
}
