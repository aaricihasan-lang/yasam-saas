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
import { fetchPreparation } from "@/lib/aromaterapi/catalogData";
import type { PreparationDetail } from "@/lib/aromaterapi/readTypes";
import { CATALOG_STATUS_TR, PREPARATION_TYPE_TR, tr } from "@/lib/aromaterapi/readLabels";

/**
 * Preparat detay — künye + bağlı bitki + ilişkili bilgi kaydı sayısı.
 *
 * NOT: "Üretim ve Elde Ediliş" ve "Saklama ve Kalite" bölümlerinin ayrıntılı
 * alanları (yöntem, ekipman, oran, süre, sıcaklık, saklama, kalite/güvenlik
 * notları) mevcut şemada YOKTUR. Bu nedenle sahte içerik gösterilmez;
 * bölümler profesyonel boş-durum ile korunur (şema tamamlanınca doldurulur).
 */
export default function PreparatDetayPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const fetcher = useCallback((signal: AbortSignal) => fetchPreparation(id, signal), [id]);
  const { data, loading, notFound, errorCode, retry } = useAromaterapiDetail<PreparationDetail>(
    fetcher,
    id,
  );

  const typeLabel = data ? tr.label(PREPARATION_TYPE_TR, data.preparation_type) : "Preparat Detayı";

  return (
    <DetailScreen
      title={typeLabel}
      subtitle={data?.taxon_canonical_name ?? undefined}
      icon="⚗️"
      breadcrumbLeaf="Preparat Detayı"
      backHref="/aromaterapi/katalog?tab=preparatlar"
      backLabel="Kataloğa dön"
      loading={loading}
      notFound={notFound}
      errorCode={errorCode}
      onRetry={retry}
    >
      {data ? (
        <div className="space-y-4">
          <DetailSection title="Genel Bilgiler">
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailField label="Preparat Türü" value={typeLabel} />
              <DetailField label="Bitki Kısmı" value={data.plant_part} />
              <DetailField label="Kemotip (CT)" value={data.chemotype ?? "—"} />
              <DetailField
                label="Durum"
                value={<MetaChip tone="teal">{tr.label(CATALOG_STATUS_TR, data.status)}</MetaChip>}
              />
            </dl>
          </DetailSection>

          <DetailSection title="Bağlı Bitki">
            {data.taxon ? (
              <Link
                href={`/aromaterapi/katalog/bitkiler/${data.taxon.id}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-teal-100/70 bg-white/90 px-3.5 py-3 shadow-sm transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-black italic text-slate-800 [overflow-wrap:anywhere]">
                    {data.taxon.canonical_name}
                  </span>
                  <span className="block text-[11.5px] font-semibold text-slate-400">
                    {data.taxon.family}
                  </span>
                </span>
                <span aria-hidden className="text-teal-400">
                  →
                </span>
              </Link>
            ) : (
              <p className="py-3 text-center text-[13px] font-semibold text-slate-400">
                Bağlı bitki bulunamadı.
              </p>
            )}
          </DetailSection>

          <DetailSection
            title="Üretim ve Elde Ediliş"
            hint="Uçucu yağ, hidrosol, maserat ve diğer preparat türleri için ayrı yöntem varyantları."
          >
            <SchemaGapNote message="Bu preparat için yapılandırılmış üretim/elde ediliş bilgisi (kullanılan bitki kısmı ayrıntısı, yöntem, ekipman, oran, süre, sıcaklık, süzme, dinlendirme) henüz kaynağa dayalı olarak girilmemiştir. Hazır olduğunda burada kaynağıyla birlikte gösterilecektir." />
          </DetailSection>

          <DetailSection title="Saklama ve Kalite">
            <SchemaGapNote message="Saklama koşulları, raf ömrü ve kalite/güvenlik notları kaynağa dayalı olarak girildiğinde burada listelenecektir." />
          </DetailSection>

          <DetailSection title="İlişkili Bilgi Kayıtları">
            {data.knowledge_record_count > 0 ? (
              <Link
                href={`/aromaterapi/bilgi-kayitlari?preparation_id=${data.id}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                📑 {data.knowledge_record_count.toLocaleString("tr-TR")} bilgi kaydını görüntüle →
              </Link>
            ) : (
              <p className="py-3 text-center text-[13px] font-semibold text-slate-400">
                Bu preparata bağlı bilgi kaydı bulunmuyor.
              </p>
            )}
          </DetailSection>
        </div>
      ) : null}
    </DetailScreen>
  );
}

function SchemaGapNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3.5">
      <span aria-hidden className="text-lg">
        🧭
      </span>
      <p className="text-[13px] font-medium leading-relaxed text-slate-500">{message}</p>
    </div>
  );
}
