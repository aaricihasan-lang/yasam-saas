"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("aromatherapy.knowledge.page");
  return (
    <AromaterapiSectionShell
      title={t("title")}
      subtitle={t("subtitle")}
      icon="📑"
    >
      <Suspense fallback={<AromaterapiListSkeleton />}>
        <BilgiKayitlariView />
      </Suspense>
    </AromaterapiSectionShell>
  );
}
