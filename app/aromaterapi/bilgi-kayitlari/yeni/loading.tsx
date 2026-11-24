"use client";
import { useTranslations } from "next-intl";

import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

export default function YeniLoading() {
  const t = useTranslations("system.loading.aromaterapi");
  return (
    <AromaterapiSectionShell title={t("newRecord")} icon="📑" breadcrumbLeaf={t("newLeaf")}>
      <AromaterapiDetailSkeleton />
    </AromaterapiSectionShell>
  );
}
