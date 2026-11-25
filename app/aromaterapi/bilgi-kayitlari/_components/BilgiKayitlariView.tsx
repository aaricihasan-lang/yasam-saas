"use client";

import { useEnumLabel, useEnumOptions } from "@/lib/aromaterapi/useEnumLabel";
import { useLocale, useTranslations } from "next-intl";
import type { ActiveLocale } from "@/lib/i18n/locales";
import Link from "next/link";
import { useId } from "react";
import { useAromaterapiListQuery } from "@/app/aromaterapi/_components/read/useAromaterapiListQuery";
import { ReadListScreen } from "@/app/aromaterapi/_components/read/ReadListScreen";
import { useReadListSelection } from "@/app/aromaterapi/_components/read/useReadListSelection";
import { useToast } from "@/components/ui/ToastProvider";
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

export function BilgiKayitlariView() {
  // I18N: seçenek etiketi ekran dilinde (kanonik değer sırası readLabels sözlüğündeki gibi).
  const enumOptionsI18n = useEnumOptions();
  const t = useTranslations("aromatherapy.knowledge.list");
  const opts = (map: Record<string, string>) => enumOptionsI18n(Object.keys(map), map);
  const s = useAromaterapiListQuery<KnowledgeRecordListItem>({
    fetcher: fetchKnowledgeRecordList,
    filterKeys: FILTER_KEYS,
  });
  const hasActive = Boolean(s.q) || Object.keys(s.filters).length > 0;
  const { showToast } = useToast();
  const selection = useReadListSelection({ exportUrl: "/api/aromaterapi/claims/word-report", resetKey: `${s.q}|${JSON.stringify(s.filters)}|${s.sort}`, showToast });
  const prepFilter = s.filters.preparation_id;

  return (
    <div className="space-y-3">
      {prepFilter ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5">
          <span className="text-[12.5px] font-bold text-emerald-800">
            {t("prepFilter")}
          </span>
          <button
            type="button"
            onClick={() => s.setFilter("preparation_id", "")}
            className="ml-auto inline-flex min-h-[36px] items-center rounded-lg border border-emerald-200 bg-white px-3 text-[12px] font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
          >
            {t("clearFilter")}
          </button>
        </div>
      ) : null}

      <ReadListScreen<KnowledgeRecordListItem>
        selection={selection}
        loading={s.loading}
        errorCode={s.errorCode}
        rows={s.rows}
        total={s.total}
        page={s.page}
        limit={s.limit}
        hasActiveQuery={hasActive}
        onPage={s.goToPage}
        onRetry={s.retry}
        emptyTitle={t("emptyTitle")}
        emptyMessage={t("emptyMessage")}
        gridClassName="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        action={
          <Link
            href="/aromaterapi/bilgi-kayitlari/yeni"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[13px] font-black text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
          >
            <span aria-hidden>＋</span>
            {t("newRecord")}
          </Link>
        }
        search={
          <ReadSearchBar
            value={s.qInput}
            onChange={s.setQInput}
            placeholder={t("searchPlaceholder")}
          />
        }
        filters={
          <>
            <ReadFilterSelect
              label={t("filterType")}
              value={s.filters.claim_type ?? ""}
              options={opts(CLAIM_TYPE_TR)}
              // safety_topic kontrolü yalnız claim_type=safety iken görünür; başka
              // türe geçince bağımlı param'ı da atomik temizle (ghost filter fix).
              onChange={(v) =>
                s.setFilter("claim_type", v, v === "safety" ? undefined : ["safety_topic"])
              }
            />
            <ReadFilterSelect
              label={t("filterEvidence")}
              value={s.filters.evidence_layer ?? ""}
              options={opts(EVIDENCE_LAYER_TR)}
              onChange={(v) => s.setFilter("evidence_layer", v)}
            />
            <ReadFilterSelect
              label={t("filterRationale")}
              value={s.filters.rationale_status ?? ""}
              options={opts(RATIONALE_STATUS_TR)}
              onChange={(v) => s.setFilter("rationale_status", v)}
            />
            <ReadFilterSelect
              label={t("filterStatus")}
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
              label={t("sort")}
              value={s.sort}
              allLabel={t("sortUpdated")}
              options={[
                { value: "created", label: t("sortCreated") },
                { value: "type", label: t("sortType") },
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
  const t = useTranslations("aromatherapy.knowledge.list");
  return (
    <div className="flex min-w-[160px] flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-black uppercase tracking-wide text-slate-400">
        {t("safetyTopic")}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "" || /^[a-z][a-z0-9_]*$/.test(v)) onChange(v);
        }}
        placeholder={t("safetyTopicPlaceholder")}
        className="min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3 text-[13px] font-bold text-slate-700 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50"
      />
    </div>
  );
}

function RecordRow({ row }: { row: KnowledgeRecordListItem }) {
  const enumLabel = useEnumLabel();
  const locale = useLocale() as ActiveLocale;
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
          {enumLabel(CLAIM_TYPE_TR, row.claim_type)}
        </MetaChip>
        <MetaChip tone="sky">{enumLabel(EVIDENCE_LAYER_TR, row.evidence_layer)}</MetaChip>
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
        <MetaChip tone="slate">{enumLabel(CLAIM_STATUS_TR, row.status)}</MetaChip>
        <span className="ml-auto text-[11px] font-bold text-slate-400">
          {formatDateTr(row.updated_at, locale)}
        </span>
      </div>
    </Link>
  );
}
