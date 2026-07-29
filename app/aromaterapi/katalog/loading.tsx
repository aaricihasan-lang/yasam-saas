"use client";

import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiListSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

/** Rota geçişinde anında görsel geri bildirim (Suspense fallback). */
export default function KatalogLoading() {
  return (
    <AromaterapiSectionShell title="Bitki & Preparat Kataloğu" icon="🌱">
      <AromaterapiListSkeleton />
    </AromaterapiSectionShell>
  );
}
