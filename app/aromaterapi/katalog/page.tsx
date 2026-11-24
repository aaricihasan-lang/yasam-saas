"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiListSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { KatalogView } from "@/app/aromaterapi/katalog/_components/KatalogView";

/**
 * Bitki & Preparat Kataloğu — C3C tenant-scoped okuma ekranı.
 *
 * İnce kabuk: sayfa yalnız görsel kabuğu ve okuma görünümünü bağlar; tüm veri
 * erişimi ayrı istemci bileşeni (KatalogView) ve server read API üzerindedir.
 * Bu sayfa doğrudan veri erişimi içermez.
 */
export default function KatalogPage() {
  const t = useTranslations("aromatherapy.catalog");
  return (
    <AromaterapiSectionShell
      title={t("pageTitle")}
      subtitle={t("pageSubtitle")}
      icon="🌱"
    >
      <Suspense fallback={<AromaterapiListSkeleton />}>
        <KatalogView />
      </Suspense>
    </AromaterapiSectionShell>
  );
}
