"use client";

import { Suspense } from "react";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiListSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { KaynaklarView } from "@/app/aromaterapi/kaynaklar/_components/KaynaklarView";

/**
 * Kaynaklar — C3C tenant-scoped okuma ekranı.
 *
 * İnce kabuk: sayfa yalnız görsel kabuğu ve okuma görünümünü bağlar; veri erişimi
 * ayrı istemci bileşeni (KaynaklarView) ve server read API üzerindedir.
 */
export default function KaynaklarPage() {
  return (
    <AromaterapiSectionShell
      title="Kaynaklar"
      subtitle="Kaynak → pasaj → sadık çeviri → editoryal açıklama/yorum provenans zinciri."
      icon="📜"
    >
      <Suspense fallback={<AromaterapiListSkeleton />}>
        <KaynaklarView />
      </Suspense>
    </AromaterapiSectionShell>
  );
}
