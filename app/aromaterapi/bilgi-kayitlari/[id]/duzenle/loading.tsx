"use client";

import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

export default function DuzenleLoading() {
  return (
    <AromaterapiSectionShell title="Bilgi Kaydını Düzenle" icon="📑" breadcrumbLeaf="Düzenle" showNav={false}>
      <AromaterapiDetailSkeleton />
    </AromaterapiSectionShell>
  );
}
