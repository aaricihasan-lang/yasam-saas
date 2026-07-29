"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { DetailScreen } from "@/app/aromaterapi/_components/read/DetailScreen";
import {
  DetailField,
  DetailSection,
  MetaChip,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { useAromaterapiDetail } from "@/app/aromaterapi/_components/read/useAromaterapiDetail";
import { fetchPlantTaxon, type PlantTaxonDetailResult } from "@/lib/aromaterapi/catalogData";
import {
  CATALOG_STATUS_TR,
  PREPARATION_TYPE_TR,
  TAXON_RANK_TR,
  tr,
} from "@/lib/aromaterapi/readLabels";

/** Bitki (takson) detay — künye + bu taksona bağlı preparat özeti. */
export default function BitkiDetayPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const fetcher = useCallback(
    (signal: AbortSignal) => fetchPlantTaxon(id, signal),
    [id],
  );
  const { data, loading, notFound, errorCode, retry } =
    useAromaterapiDetail<PlantTaxonDetailResult>(fetcher, id);

  const taxon = data?.taxon;

  return (
    <DetailScreen
      title={taxon ? <span className="italic">{taxon.canonical_name}</span> : "Bitki Detayı"}
      subtitle={taxon?.family}
      icon="🌱"
      breadcrumbLeaf="Bitki Detayı"
      backHref="/aromaterapi/katalog"
      backLabel="Kataloğa dön"
      loading={loading}
      notFound={notFound}
      errorCode={errorCode}
      onRetry={retry}
    >
      {taxon ? (
        <div className="space-y-4">
          <DetailSection title="Genel Bilgiler">
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailField label="Kanonik Ad" value={<span className="italic">{taxon.canonical_name}</span>} />
              <DetailField label="Familya" value={taxon.family} />
              <DetailField label="Cins" value={<span className="italic">{taxon.genus}</span>} />
              <DetailField label="Tür" value={<span className="italic">{taxon.species}</span>} />
              <DetailField label="Rank" value={tr.label(TAXON_RANK_TR, taxon.taxon_rank)} />
              {taxon.infraspecific_epithet ? (
                <DetailField label="Alt-tür Epiteti" value={taxon.infraspecific_epithet} />
              ) : null}
              {taxon.author_citation ? (
                <DetailField label="Yazar Atfı" value={taxon.author_citation} />
              ) : null}
              <DetailField
                label="Durum"
                value={<MetaChip tone="teal">{tr.label(CATALOG_STATUS_TR, taxon.status)}</MetaChip>}
              />
            </dl>
          </DetailSection>

          <DetailSection
            title="Bağlı Preparatlar"
            hint={`${data.preparations.length.toLocaleString("tr-TR")} preparat bu bitkiye bağlı.`}
          >
            {data.preparations.length === 0 ? (
              <p className="py-4 text-center text-[13px] font-semibold text-slate-400">
                Bu bitkiye bağlı preparat kaydı bulunmuyor.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.preparations.map((prep) => (
                  <li key={prep.id}>
                    <Link
                      href={`/aromaterapi/katalog/preparatlar/${prep.id}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-teal-100/70 bg-white/90 px-3 py-2.5 shadow-sm transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
                    >
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-black text-slate-800">
                          {tr.label(PREPARATION_TYPE_TR, prep.preparation_type)}
                        </span>
                        <span className="block text-[11.5px] font-semibold text-slate-400">
                          {prep.plant_part}
                          {prep.chemotype ? ` · CT: ${prep.chemotype}` : ""}
                        </span>
                      </span>
                      <span aria-hidden className="text-teal-400">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        </div>
      ) : null}
    </DetailScreen>
  );
}
