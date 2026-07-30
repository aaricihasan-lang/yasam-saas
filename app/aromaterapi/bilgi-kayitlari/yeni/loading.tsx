"use client";

import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

export default function YeniLoading() {
  return (
    <AromaterapiSectionShell title="Yeni Bilgi Kaydı" icon="📑" breadcrumbLeaf="Yeni" showNav={false}>
      <AromaterapiDetailSkeleton />
    </AromaterapiSectionShell>
  );
}
