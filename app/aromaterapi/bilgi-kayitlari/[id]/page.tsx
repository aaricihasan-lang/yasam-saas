"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailScreen } from "@/app/aromaterapi/_components/read/DetailScreen";
import {
  DetailField,
  DetailSection,
  MetaChip,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { useAromaterapiDetail } from "@/app/aromaterapi/_components/read/useAromaterapiDetail";
import { fetchKnowledgeRecord, fetchKnowledgeAudit } from "@/lib/aromaterapi/claimData";
import { messageForCode } from "@/lib/aromaterapi/readClient";
import type { KnowledgeAuditEvent, KnowledgeRecordDetail } from "@/lib/aromaterapi/readTypes";
import {
  AUDIT_OPERATION_TR,
  CLAIM_STATUS_TR,
  CLAIM_TYPE_TR,
  CONCLUSION_PROVENANCE_TR,
  EVIDENCE_LAYER_TR,
  EVIDENCE_RELATION_TR,
  OUTCOME_TYPE_TR,
  POPULATION_CODE_TR,
  PREPARATION_TYPE_TR,
  RATIONALE_STATUS_TR,
  RELATION_TYPE_TR,
  ROUTE_CODE_TR,
  SOURCE_ROLE_TR,
  VERIFICATION_STATUS_TR,
  tr,
} from "@/lib/aromaterapi/readLabels";
import { formatDateTimeTr } from "@/lib/aromaterapi/readFormat";

const AUDIT_PAGE = 20;

/** Bilgi Kaydı detay — sonuç/gerekçe, preparat, kanıt/kaynak, pasaj, rota/popülasyon, ilişki, geçmiş. */
export default function BilgiKaydiDetayPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const fetcher = useCallback((signal: AbortSignal) => fetchKnowledgeRecord(id, signal), [id]);
  const { data, loading, notFound, errorCode, retry } =
    useAromaterapiDetail<KnowledgeRecordDetail>(fetcher, id);

  return (
    <DetailScreen
      title={data ? tr.label(CLAIM_TYPE_TR, data.claim_type) + " Kaydı" : "Bilgi Kaydı"}
      subtitle={data?.preparation?.taxon_canonical_name ?? undefined}
      icon="📑"
      breadcrumbLeaf="Bilgi Kaydı"
      backHref="/aromaterapi/bilgi-kayitlari"
      backLabel="Bilgi Kayıtlarına dön"
      loading={loading}
      notFound={notFound}
      errorCode={errorCode}
      onRetry={retry}
    >
      {data ? (
        <div className="space-y-4">
          <DetailSection title="Sonuç ve Gerekçe">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Sonuç</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[15px] font-bold leading-relaxed text-slate-900">
                {data.conclusion}
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailField
                label="Sonuç Kaynağı"
                value={tr.label(CONCLUSION_PROVENANCE_TR, data.conclusion_provenance)}
              />
              <DetailField
                label="Kayıt Türü"
                value={
                  <MetaChip tone={data.claim_type === "safety" ? "rose" : "emerald"}>
                    {tr.label(CLAIM_TYPE_TR, data.claim_type)}
                  </MetaChip>
                }
              />
              <DetailField
                label="Gerekçe Durumu"
                value={tr.label(RATIONALE_STATUS_TR, data.rationale_status)}
              />
              {data.outcome_type ? (
                <DetailField
                  label="Sonuç Tipi (Güvenlik)"
                  value={tr.label(OUTCOME_TYPE_TR, data.outcome_type)}
                />
              ) : null}
              {data.safety_topic ? (
                <DetailField
                  label="Güvenlik Konusu"
                  value={<MetaChip tone="amber">{data.safety_topic}</MetaChip>}
                />
              ) : null}
              <DetailField
                label="Durum"
                value={<MetaChip tone="slate">{tr.label(CLAIM_STATUS_TR, data.status)}</MetaChip>}
              />
            </dl>
            {data.rationale ? (
              <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Gerekçe</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[14px] font-medium leading-relaxed text-slate-700">
                  {data.rationale}
                </p>
              </div>
            ) : null}
          </DetailSection>

          <DetailSection title="Preparat ve Bağlam">
            {data.preparation ? (
              <Link
                href={`/aromaterapi/katalog/preparatlar/${data.preparation.id}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-teal-100/70 bg-white/90 px-3.5 py-3 shadow-sm transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-black text-slate-800">
                    {tr.label(PREPARATION_TYPE_TR, data.preparation.preparation_type)}
                  </span>
                  {data.preparation.taxon_canonical_name ? (
                    <span className="block text-[12px] font-semibold italic text-slate-400 [overflow-wrap:anywhere]">
                      {data.preparation.taxon_canonical_name}
                    </span>
                  ) : null}
                </span>
                <span aria-hidden className="text-teal-400">→</span>
              </Link>
            ) : (
              <p className="text-[13px] font-semibold text-slate-400">Bağlı preparat bulunamadı.</p>
            )}
            <dl className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {data.route ? (
                <DetailField label="Uygulama Yolu" value={tr.label(ROUTE_CODE_TR, data.route)} />
              ) : null}
              {data.preparation_context ? (
                <DetailField label="Preparat Bağlamı" value={data.preparation_context} />
              ) : null}
            </dl>
          </DetailSection>

          <DetailSection title="Kanıt ve Kaynaklar">
            <DetailField
              label="Kanıt Katmanı"
              value={<MetaChip tone="sky">{tr.label(EVIDENCE_LAYER_TR, data.evidence_layer)}</MetaChip>}
            />
            <div className="mt-2 space-y-2">
              {data.sources.length === 0 ? (
                <EmptyLine text="Bağlı kaynak yok." />
              ) : (
                data.sources.map((src) => (
                  <div key={src.id} className="rounded-xl border border-violet-100/70 bg-white/90 p-3.5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13.5px] font-black text-slate-800 [overflow-wrap:anywhere]">
                        {src.source_title ?? "Kaynak"}
                      </span>
                      <MetaChip tone="violet">{tr.label(SOURCE_ROLE_TR, src.source_role)}</MetaChip>
                      <MetaChip tone={src.verification_status === "verified" ? "emerald" : "slate"}>
                        {tr.label(VERIFICATION_STATUS_TR, src.verification_status)}
                      </MetaChip>
                    </div>
                    {src.locator_text ? (
                      <p className="mt-1 text-[12px] font-semibold text-slate-400">{src.locator_text}</p>
                    ) : null}
                    {src.source_original_excerpt ? (
                      <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-amber-200 pl-3 text-[13px] font-medium italic text-slate-600">
                        {src.source_original_excerpt}
                      </p>
                    ) : null}
                    {src.faithful_translation ? (
                      <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-emerald-200 pl-3 text-[13px] font-medium text-slate-700">
                        {src.faithful_translation}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </DetailSection>

          <DetailSection title="Pasajlar">
            {data.passages.length === 0 ? (
              <EmptyLine text="Bağlı pasaj yok." />
            ) : (
              <ul className="space-y-2">
                {data.passages.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-100 bg-white/90 px-3.5 py-2.5 shadow-sm"
                  >
                    <span className="text-[13px] font-black text-slate-800 [overflow-wrap:anywhere]">
                      {p.passage_locator_label ?? "Pasaj"}
                    </span>
                    <MetaChip tone="emerald">{tr.label(EVIDENCE_RELATION_TR, p.evidence_relation)}</MetaChip>
                    <MetaChip tone={p.verification_status === "verified" ? "emerald" : "slate"}>
                      {tr.label(VERIFICATION_STATUS_TR, p.verification_status)}
                    </MetaChip>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Rotalar ve Popülasyonlar">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">Rotalar</p>
                {data.routes.length === 0 ? (
                  <EmptyLine text="Rota yok." />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.routes.map((r) => (
                      <MetaChip key={r.id} tone="sky">
                        {tr.label(ROUTE_CODE_TR, r.route_code)}
                      </MetaChip>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
                  Popülasyonlar
                </p>
                {data.populations.length === 0 ? (
                  <EmptyLine text="Popülasyon yok." />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.populations.map((pop) => (
                      <MetaChip key={pop.id} tone="amber">
                        {tr.label(POPULATION_CODE_TR, pop.population_code)}
                        {pop.age_min !== null || pop.age_max !== null
                          ? ` (${pop.age_min ?? "?"}–${pop.age_max ?? "?"})`
                          : ""}
                      </MetaChip>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DetailSection>

          <DetailSection title="İlişkiler">
            {data.relations.length === 0 ? (
              <EmptyLine text="Bu kayıt için ilişki tanımlı değil." />
            ) : (
              <ul className="space-y-2">
                {data.relations.map((rel) => {
                  const otherId = rel.a_claim_id === data.id ? rel.b_claim_id : rel.a_claim_id;
                  return (
                    <li key={rel.id} className="rounded-xl border border-slate-100 bg-white/90 p-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <MetaChip tone="violet">{tr.label(RELATION_TYPE_TR, rel.relation_type)}</MetaChip>
                        <Link
                          href={`/aromaterapi/bilgi-kayitlari/${otherId}`}
                          className="text-[12px] font-black text-emerald-700 underline hover:text-emerald-900"
                        >
                          İlişkili kaydı aç →
                        </Link>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] font-medium text-slate-700">
                        {rel.explanation_tr}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </DetailSection>

          <DetailSection
            title="Değişiklik Geçmişi"
            hint="Bu kaydın oluşturma ve güncelleme adımları (salt-okunur)."
          >
            <AuditPanel claimId={data.id} />
          </DetailSection>
        </div>
      ) : null}
    </DetailScreen>
  );
}

function AuditPanel({ claimId }: { claimId: string }) {
  const [rows, setRows] = useState<KnowledgeAuditEvent[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fetchedPage, setFetchedPage] = useState(0);
  const seen = useRef(new Set<string>());
  // loading türetilir (effect'te senkron setState yok).
  const loading = fetchedPage < page;

  useEffect(() => {
    const controller = new AbortController();
    fetchKnowledgeAudit(claimId, { page, limit: AUDIT_PAGE }, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok && res.envelope) {
        setTotal(res.envelope.total);
        setErrorCode(null);
        setRows((prev) => {
          const next = page === 1 ? [] : [...prev];
          for (const e of res.envelope!.rows) {
            if (!seen.current.has(e.id)) {
              seen.current.add(e.id);
              next.push(e);
            }
          }
          return next;
        });
        setFetchedPage(page);
      } else if (res.errorCode) {
        setErrorCode(res.errorCode);
        setFetchedPage(page);
      }
    });
    return () => controller.abort();
  }, [claimId, page]);

  if (loading && rows.length === 0) {
    return <p className="py-3 text-center text-[13px] font-semibold text-slate-400">Geçmiş yükleniyor…</p>;
  }
  if (errorCode && rows.length === 0) {
    return (
      <p role="alert" className="py-3 text-center text-[13px] font-bold text-rose-600">
        {messageForCode(errorCode)}
      </p>
    );
  }
  if (rows.length === 0) {
    return <EmptyLine text="Bu kayıt için değişiklik geçmişi bulunmuyor." />;
  }

  const hasMore = rows.length < total;
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((e) => (
          <li key={e.id} className="rounded-xl border border-slate-100 bg-white/90 p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <MetaChip tone={e.operation === "create" ? "emerald" : "sky"}>
                {tr.label(AUDIT_OPERATION_TR, e.operation)}
              </MetaChip>
              <span className="text-[12px] font-bold text-slate-500">{formatDateTimeTr(e.occurred_at)}</span>
              <span className="ml-auto text-[12px] font-black text-slate-600 [overflow-wrap:anywhere]">
                {e.actor_label_snapshot}
              </span>
            </div>
            {e.reason ? (
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] font-medium text-slate-700">
                <span className="font-black text-slate-400">Gerekçe: </span>
                {e.reason}
              </p>
            ) : null}
            {Array.isArray(e.warnings) && e.warnings.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {e.warnings.map((w, i) => (
                  <MetaChip key={i} tone="amber">
                    ⚠ {typeof w === "string" ? w : JSON.stringify(w)}
                  </MetaChip>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {hasMore ? (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setPage((n) => n + 1)}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 disabled:opacity-50"
          >
            {loading ? "Yükleniyor…" : "Daha fazla"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-2.5 text-center text-[12.5px] font-medium italic text-slate-400">
      {text}
    </p>
  );
}
