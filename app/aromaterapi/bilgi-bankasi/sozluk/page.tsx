"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiListSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { SozlukView } from "@/app/aromaterapi/bilgi-bankasi/sozluk/_components/SozlukView";

/**
 * Sözlük — Bilgi Bankası & Sözlük bölümünün tenant-scoped terim görünümü.
 *
 * Mevcut Bilgi Bankası sheet ekranından ayrı, kontrollü bir alt-görünümdür;
 * mevcut sheet renderer ve demo davranışına dokunmaz (Bölüm 10).
 */
export default function SozlukPage() {
  const t = useTranslations("aromatherapy.glossary");
  return (
    <AromaterapiSectionShell
      title={t("pageTitle")}
      subtitle={t("pageSubtitle")}
      icon="📚"
      breadcrumbLeaf={t("pageTitle")}
    >
      <Suspense fallback={<AromaterapiListSkeleton />}>
        <SozlukView />
      </Suspense>
    </AromaterapiSectionShell>
  );
}
