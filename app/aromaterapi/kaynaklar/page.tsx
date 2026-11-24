"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("aromatherapy.sources");
  return (
    <AromaterapiSectionShell
      title={t("pageTitle")}
      subtitle={t("pageSubtitle")}
      icon="📜"
    >
      <Suspense fallback={<AromaterapiListSkeleton />}>
        <KaynaklarView />
      </Suspense>
    </AromaterapiSectionShell>
  );
}
