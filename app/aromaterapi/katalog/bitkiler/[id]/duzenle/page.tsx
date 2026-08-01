"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { ReadError } from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { useAromaterapiDetail } from "@/app/aromaterapi/_components/read/useAromaterapiDetail";
import { PlantTaxonForm } from "@/app/aromaterapi/katalog/_components/PlantTaxonForm";
import { fetchPlantTaxon, type PlantTaxonDetailResult } from "@/lib/aromaterapi/catalogData";
import { messageForCode } from "@/lib/aromaterapi/readClient";
import { readYasamUser } from "@/lib/auth/yasamUser";

/** C3D-B2B — Bitkiyi düzenle. GET ile hydrate; out-of-tenant/eksik → 404 ekranı. */
export default function BitkiDuzenlePage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const isDemo = readYasamUser()?.is_demo_account === true;
  const fetcher = useCallback((signal: AbortSignal) => fetchPlantTaxon(id, signal), [id]);
  const { data, loading, notFound, errorCode, retry } =
    useAromaterapiDetail<PlantTaxonDetailResult>(fetcher, id);

  return (
    <AromaterapiSectionShell
      title="Bitkiyi Düzenle"
      subtitle="Değişiklik yaparken bir gerekçe girmeniz gerekir."
      icon="🌱"
      breadcrumbLeaf="Düzenle"
      showNav={false}
      actions={
        <Link
          href={id ? `/aromaterapi/katalog/bitkiler/${id}` : "/aromaterapi/katalog"}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          ← Bitkiye dön
        </Link>
      }
    >
      {loading ? (
        <AromaterapiDetailSkeleton />
      ) : notFound ? (
        <AromaterapiEmptyState
          variant="empty"
          icon="🔎"
          title="Bitki bulunamadı"
          message="Bu bitki bulunamadı veya bu hesabın kütüphanesinde değil."
          action={
            <Link
              href="/aromaterapi/katalog"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800"
            >
              Kataloğa dön
            </Link>
          }
        />
      ) : errorCode ? (
        <ReadError message={messageForCode(errorCode)} onRetry={retry} />
      ) : data ? (
        <PlantTaxonForm mode="edit" initial={data.taxon} isDemo={isDemo} />
      ) : null}
    </AromaterapiSectionShell>
  );
}
