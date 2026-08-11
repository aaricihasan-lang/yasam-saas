"use client";

import Link from "next/link";
import { useId } from "react";
import { useAromaterapiListQuery } from "@/app/aromaterapi/_components/read/useAromaterapiListQuery";
import { ReadListScreen } from "@/app/aromaterapi/_components/read/ReadListScreen";
import {
  MetaChip,
  ReadFilterSelect,
  ReadSearchBar,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { fetchKnowledgeRecordList } from "@/lib/aromaterapi/claimData";
import type { KnowledgeRecordListItem } from "@/lib/aromaterapi/readTypes";
import {
  CLAIM_STATUS_TR,
  CLAIM_TYPE_TR,
  EVIDENCE_LAYER_TR,
  RATIONALE_STATUS_TR,
  tr,
} from "@/lib/aromaterapi/readLabels";
import { formatDateTr, truncate } from "@/lib/aromaterapi/readFormat";

/**
 * Bilgi Kayıtları — gerçek tenant-scoped read ekranı.
 *
 * Kullanıcıya "claim" terimi GÖSTERİLMEZ; her yerde "Bilgi Kaydı". Güvenlik ayrı
 * bölüm değildir: kayıt türü = "Güvenlik" filtresi (+ güvenlik konusu) ile görülür.
 * Yeni/Düzenle/Sil eylemleri C3C'de YOK (C3D create/update editörüne bırakıldı).
 */

const FILTER_KEYS = [
  "claim_type",
  "status",
  "evidence_layer",
  "rationale_status",
  "safety_topic",
  "preparation_id",
] as const;

const opts = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

export function BilgiKayitlariView() {
  const s = useAromaterapiListQuery<KnowledgeRecordListItem>({
    fetcher: fetchKnowledgeRecordList,
    filterKeys: FILTER_KEYS,
  });
  const hasActive = Boolean(s.q) || Object.keys(s.filters).length > 0;
  const prepFilter = s.filters.preparation_id;

  return (
    <div className="space-y-3">
      {prepFilter ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5">
          <span className="text-[12.5px] font-bold text-emerald-800">
            Tek preparata bağlı bilgi kayıtları gösteriliyor.
          </span>
          <button
            type="button"
            onClick={() => s.setFilter("preparation_id", "")}
            className="ml-auto inline-flex min-h-[36px] items-center rounded-lg border border-emerald-200 bg-white px-3 text-[12px] font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
          >
            Filtreyi temizle
          </button>
        </div>
      ) : null}

      {/* C3D-D: Yeni Bilgi Kaydı aksiyonu (görünür, baskın olmayan CTA). */}
      <div className="flex justify-end">
        <Link
          href="/aromaterapi/bilgi-kayitlari/yeni"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 text-[13px] font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
        >
          <span aria-hidden>＋</span>
          Yeni Bilgi Kaydı
        </Link>
      </div>

      <ReadListScreen<KnowledgeRecordListItem>
        loading={s.loading}
        errorCode={s.errorCode}
        rows={s.rows}
        total={s.total}
        page={s.page}
        limit={s.limit}
        hasActiveQuery={hasActive}
        onPage={s.goToPage}
        onRetry={s.retry}
        emptyTitle="Henüz bilgi kaydı yok"
        emptyMessage="Bu tenant kütüphanesinde kaynağa dayalı bilgi kaydı bulunmuyor."
        gridClassName="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        search={
          <ReadSearchBar
            value={s.qInput}
            onChange={s.setQInput}
            placeholder="Sonuç, gerekçe veya bağlam ara…"
          />
        }
        filters={
          <>
            <ReadFilterSelect
              label="Kayıt türü"
              value={s.filters.claim_type ?? ""}
              options={opts(CLAIM_TYPE_TR)}
              onChange={(v) => s.setFilter("claim_type", v)}
            />
            <ReadFilterSelect
              label="Kanıt katmanı"
              value={s.filters.evidence_layer ?? ""}
              options={opts(EVIDENCE_LAYER_TR)}
              onChange={(v) => s.setFilter("evidence_layer", v)}
            />
            <ReadFilterSelect
              label="Gerekçe"
              value={s.filters.rationale_status ?? ""}
              options={opts(RATIONALE_STATUS_TR)}
              onChange={(v) => s.setFilter("rationale_status", v)}
            />
            <ReadFilterSelect
              label="Durum"
              value={s.filters.status ?? ""}
              options={opts(CLAIM_STATUS_TR)}
              onChange={(v) => s.setFilter("status", v)}
            />
            {s.filters.claim_type === "safety" ? (
              <SafetyTopicFilter
                value={s.filters.safety_topic ?? ""}
                onChange={(v) => s.setFilter("safety_topic", v)}
              />
            ) : null}
            <ReadFilterSelect
              label="Sırala"
              value={s.sort}
              allLabel="Son güncelleme"
              options={[
                { value: "created", label: "Oluşturulma" },
                { value: "type", label: "Kayıt türü" },
              ]}
              onChange={s.setSort}
            />
          </>
        }
        renderItem={(row) => <RecordRow key={row.id} row={row} />}
      />
    </div>
  );
}

/** Güvenlik konusu — dinamik allowlist (^[a-z][a-z0-9_]*$); yalnız geçerliyse uygulanır. */
function SafetyTopicFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex min-w-[160px] flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-black uppercase tracking-wide text-slate-400">
        Güvenlik konusu
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "" || /^[a-z][a-z0-9_]*$/.test(v)) onChange(v);
        }}
        placeholder="örn. pregnancy"
        className="min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3 text-[13px] font-bold text-slate-700 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50"
      />
    </div>
  );
}

function RecordRow({ row }: { row: KnowledgeRecordListItem }) {
  const prep = [row.taxon_canonical_name, row.preparation_type]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/aromaterapi/bilgi-kayitlari/${row.id}`}
      className="group flex h-full flex-col rounded-2xl border border-emerald-100/70 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <MetaChip tone={row.claim_type === "safety" ? "rose" : "emerald"}>
          {tr.label(CLAIM_TYPE_TR, row.claim_type)}
        </MetaChip>
        <MetaChip tone="sky">{tr.label(EVIDENCE_LAYER_TR, row.evidence_layer)}</MetaChip>
      </div>
      <p className="text-[14px] font-bold leading-snug text-slate-800 [overflow-wrap:anywhere] group-hover:text-emerald-900">
        {truncate(row.conclusion, 180)}
      </p>
      {prep ? (
        <p className="mt-1.5 text-[12px] font-semibold italic text-slate-500 [overflow-wrap:anywhere]">
          {prep}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {row.safety_topic ? <MetaChip tone="amber">{row.safety_topic}</MetaChip> : null}
        <MetaChip tone="slate">{tr.label(CLAIM_STATUS_TR, row.status)}</MetaChip>
        <span className="ml-auto text-[11px] font-bold text-slate-400">
          {formatDateTr(row.updated_at)}
        </span>
      </div>
    </Link>
  );
}
