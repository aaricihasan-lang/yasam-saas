"use client";
import { useTranslations } from "next-intl";

import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiListSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

/** Rota geçişinde anında görsel geri bildirim (Suspense fallback). */
export default function SozlukLoading() {
  const t = useTranslations("system.loading.aromaterapi");
  return (
    <AromaterapiSectionShell title={t("glossary")} icon="📚" breadcrumbLeaf={t("glossary")}>
      <AromaterapiListSkeleton />
    </AromaterapiSectionShell>
  );
}
