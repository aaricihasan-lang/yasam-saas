"use client";

import { Suspense } from "react";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiListSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { BilgiKayitlariView } from "@/app/aromaterapi/bilgi-kayitlari/_components/BilgiKayitlariView";

/**
 * Bilgi Kayıtları — C3C tenant-scoped okuma ekranı.
 *
 * İnce kabuk: sayfa yalnız görsel kabuğu ve okuma görünümünü bağlar; veri erişimi
 * ayrı istemci bileşeni (BilgiKayitlariView) ve server read API üzerindedir.
 */
export default function BilgiKayitlariPage() {
  return (
    <AromaterapiSectionShell
      title="Bilgi Kayıtları"
      subtitle="Kaynağa dayalı, kanıt ve provenans taşıyan bilgi kayıtları. Güvenlik konuları burada filtre ve bağlam olarak ele alınır."
      icon="📑"
    >
      <Suspense fallback={<AromaterapiListSkeleton />}>
        <BilgiKayitlariView />
      </Suspense>
    </AromaterapiSectionShell>
  );
}
