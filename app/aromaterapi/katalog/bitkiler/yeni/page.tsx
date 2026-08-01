"use client";

import Link from "next/link";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { PlantTaxonForm } from "@/app/aromaterapi/katalog/_components/PlantTaxonForm";
import { readYasamUser } from "@/lib/auth/yasamUser";

/** C3D-B2B — Yeni Bitki (takson) oluşturma ekranı (bağımsız route). */
export default function YeniBitkiPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  return (
    <AromaterapiSectionShell
      title="Yeni Bitki"
      subtitle="Kanonik bir bitki (takson) kaydı oluşturun."
      icon="🌱"
      breadcrumbLeaf="Yeni Bitki"
      showNav={false}
      actions={
        <Link
          href="/aromaterapi/katalog"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          ← Kataloğa dön
        </Link>
      }
    >
      <PlantTaxonForm mode="create" isDemo={isDemo} />
    </AromaterapiSectionShell>
  );
}
