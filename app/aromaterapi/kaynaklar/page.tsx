"use client";

import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { AromaterapiSectionSkeletonCard } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

/**
 * Kaynaklar — C3B görsel iskeleti.
 *
 * Kaynak → pasaj → sadık çeviri → editoryal açıklama/yorum provenans zincirinin
 * ev sahibi bölüm. C3B'de yalnız yapı gösterilir; okuma/arama ve içerik yönetimi
 * sonraki adımlarda etkinleşir. API çağrısı yapmaz, sahte içerik göstermez.
 */
export default function KaynaklarPage() {
  return (
    <AromaterapiSectionShell
      title="Kaynaklar"
      subtitle="Kaynak, pasaj, özgün metin, sadık çeviri ve editoryal katmanlar tek provenans zincirinde. Katmanlar birbirine karıştırılmaz."
      icon="📜"
    >
      <div className="space-y-4">
        <AromaterapiEmptyState
          variant="pending"
          title="Kaynaklar hazırlanıyor"
          message="Bu bölümün okuma ve arama bağlantıları sonraki ürünleştirme adımında etkinleştirilecektir. Aşağıda provenans zincirinin alacağı yapı görülmektedir."
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <AromaterapiSectionSkeletonCard
            title="Özgün Kaynak Metni"
            hint="Kaynağın birebir pasajı; künye, konum ve haklar bilgisiyle korunur."
          />
          <AromaterapiSectionSkeletonCard
            title="Sadık Çeviri"
            hint="Özgün metne doğrudan bağlı çeviri; yorum eklemez, sadeleştirmez."
          />
          <AromaterapiSectionSkeletonCard
            title="Editoryal Açıklama"
            hint="Çeviriden ayrı; okuyucuya yönelik açıklayıcı editoryal katman."
          />
          <AromaterapiSectionSkeletonCard
            title="Editoryal Yorum & Uzman Notu"
            hint="Editoryal yorum ve uzman değerlendirmesi; kaynak metinden net biçimde ayrılır."
          />
        </div>
      </div>
    </AromaterapiSectionShell>
  );
}
