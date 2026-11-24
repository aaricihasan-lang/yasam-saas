"use client";

import { useTranslations } from "next-intl";
import { useEnumLabel, useEnumOptions } from "@/lib/aromaterapi/useEnumLabel";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAromaterapiListQuery } from "@/app/aromaterapi/_components/read/useAromaterapiListQuery";
import { ReadListScreen } from "@/app/aromaterapi/_components/read/ReadListScreen";
import { useReadListSelection } from "@/app/aromaterapi/_components/read/useReadListSelection";
import { useToast } from "@/components/ui/ToastProvider";
import {
  MetaChip,
  ReadFilterSelect,
  ReadSearchBar,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { fetchPlantTaxaList, fetchPreparationList } from "@/lib/aromaterapi/catalogData";
import type { PlantTaxonListItem, PreparationListItem } from "@/lib/aromaterapi/readTypes";
import {
  CATALOG_STATUS_TR,
  PREPARATION_TYPE_TR,
  TAXON_RANK_TR,
  } from "@/lib/aromaterapi/readLabels";

/**
 * Bitki & Preparat Kataloğu — gerçek tenant-scoped read ekranı.
 *
 * "Bitkiler" / "Preparatlar" segmentli görünüm; her biri sunucu-tarafı arama,
 * filtre ve sayfalama ile bağımsız listelenir. Sekme değişince arama/filtre/
 * sayfa temizlenir (sıralama allowlist'leri sekmeye özeldir).
 */

const TAXA_FILTER_KEYS = ["status"] as const;
const PREP_FILTER_KEYS = ["preparation_type", "status"] as const;

// I18N: kanonik durum değerleri; etiket bileşende useEnumOptions(CATALOG_STATUS_TR) ile.
const CATALOG_STATUS_VALUES = ["draft", "verified", "approved"];

// I18N: seçenek etiketleri bileşende useEnumOptions ile (kanonik değer listesi burada).
const PREP_TYPE_VALUES = Object.keys(PREPARATION_TYPE_TR);

type Tab = "bitkiler" | "preparatlar";

export function KatalogView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/aromaterapi/katalog";
  const tab: Tab = searchParams.get("tab") === "preparatlar" ? "preparatlar" : "bitkiler";

  const switchTab = (next: Tab) => {
    // Sekme değişince diğer sekmenin arama/filtre/sıralama/sayfası taşınmaz.
    router.replace(next === "bitkiler" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <SegmentedTabs tab={tab} onChange={switchTab} />
      {tab === "bitkiler" ? <PlantTaxaSection /> : <PreparationSection />}
    </div>
  );
}

function SegmentedTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tc = useTranslations("aromatherapy.catalog");
  const base =
    "inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-[13px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60 sm:flex-none";
  const active = "bg-teal-600 text-white shadow-sm";
  const idle = "border border-slate-200 bg-white/80 text-slate-600 hover:border-teal-200 hover:text-teal-800";
  return (
    <div
      role="tablist"
      aria-label={tc("tabsAria")}
      className="flex w-full gap-2 rounded-2xl border border-teal-100/70 bg-white/70 p-1.5 shadow-sm sm:w-fit"
    >
      <button
        type="button"
        role="tab"
        aria-selected={tab === "bitkiler"}
        onClick={() => onChange("bitkiler")}
        className={`${base} ${tab === "bitkiler" ? active : idle}`}
      >
        {tc("tabPlants")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "preparatlar"}
        onClick={() => onChange("preparatlar")}
        className={`${base} ${tab === "preparatlar" ? active : idle}`}
      >
        {tc("tabPreparations")}
      </button>
    </div>
  );
}

// ---------------- Bitkiler (takson) ----------------

function PlantTaxaSection() {
  const tc = useTranslations("aromatherapy.catalog");
  const enumOptionsI18n = useEnumOptions();
  const s = useAromaterapiListQuery<PlantTaxonListItem>({
    fetcher: fetchPlantTaxaList,
    filterKeys: TAXA_FILTER_KEYS,
  });
  const hasActive = Boolean(s.q) || Object.keys(s.filters).length > 0;
  const { showToast } = useToast();
  const selection = useReadListSelection({ exportUrl: "/api/aromaterapi/plant-taxa/word-report", resetKey: `${s.q}|${JSON.stringify(s.filters)}|${s.sort}`, showToast });

  return (
      <ReadListScreen<PlantTaxonListItem>
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
      emptyTitle={tc("plantsEmptyTitle")}
      emptyMessage={tc("plantsEmptyMessage")}
      action={
        <Link
          href="/aromaterapi/katalog/bitkiler/yeni"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-[13px] font-black text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
        >
          <span aria-hidden>＋</span> {tc("newPlant")}
        </Link>
      }
      search={
        <ReadSearchBar
          value={s.qInput}
          onChange={s.setQInput}
          placeholder={tc("plantsSearch")}
        />
      }
      filters={
        <>
          <ReadFilterSelect
            label={tc("status")}
            value={s.filters.status ?? ""}
            options={enumOptionsI18n(CATALOG_STATUS_VALUES, CATALOG_STATUS_TR)}
            onChange={(v) => s.setFilter("status", v)}
          />
          <ReadFilterSelect
            label={tc("sort")}
            value={s.sort}
            allLabel={tc("sortName")}
            options={[
              { value: "updated", label: tc("sortUpdated") },
              { value: "family", label: tc("sortFamily") },
            ]}
            onChange={s.setSort}
          />
        </>
      }
        renderItem={(row) => <PlantTaxonRow key={row.id} row={row} />}
      />
  );
}

function PlantTaxonRow({ row }: { row: PlantTaxonListItem }) {
  const enumLabel = useEnumLabel();
  const tc = useTranslations("aromatherapy.catalog");
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-teal-100/70 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
      <Link
        href={`/aromaterapi/katalog/bitkiler/${row.id}`}
        className="flex flex-col rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
      >
        <h3 className="text-[15px] font-black italic leading-snug text-slate-900 [overflow-wrap:anywhere] group-hover:text-teal-800">
          {row.canonical_name}
        </h3>
        <p className="mt-1 text-[12px] font-semibold text-slate-500 [overflow-wrap:anywhere]">
          {row.family}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <MetaChip tone="teal">{enumLabel(TAXON_RANK_TR, row.taxon_rank)}</MetaChip>
          {row.is_hybrid ? <MetaChip tone="violet">{tc("hybrid")}</MetaChip> : null}
          <MetaChip tone="slate">{enumLabel(CATALOG_STATUS_TR, row.status)}</MetaChip>
        </div>
      </Link>
      <div className="mt-auto flex justify-end border-t border-teal-50 pt-2.5">
        <Link
          href={`/aromaterapi/katalog/bitkiler/${row.id}/duzenle`}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2.5 text-[12px] font-black text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
        >
          {tc("edit")}
        </Link>
      </div>
    </article>
  );
}

// ---------------- Preparatlar ----------------

function PreparationSection() {
  const enumOptionsI18n = useEnumOptions();
  const tc = useTranslations("aromatherapy.catalog");
  const { showToast } = useToast();
  const s = useAromaterapiListQuery<PreparationListItem>({
    fetcher: fetchPreparationList,
    filterKeys: PREP_FILTER_KEYS,
  });
  const hasActive = Boolean(s.q) || Object.keys(s.filters).length > 0;
  const selection = useReadListSelection({ exportUrl: "/api/aromaterapi/preparations/word-report", resetKey: `${s.q}|${JSON.stringify(s.filters)}|${s.sort}`, showToast });

  return (
      <ReadListScreen<PreparationListItem>
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
      emptyTitle={tc("prepsEmptyTitle")}
      emptyMessage={tc("prepsEmptyMessage")}
      action={
        <Link
          href="/aromaterapi/katalog/preparatlar/yeni"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-[13px] font-black text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
        >
          <span aria-hidden>＋</span> {tc("newPreparation")}
        </Link>
      }
      search={
        <ReadSearchBar
          value={s.qInput}
          onChange={s.setQInput}
          placeholder={tc("prepsSearch")}
        />
      }
      filters={
        <>
          <ReadFilterSelect
            label={tc("prepType")}
            value={s.filters.preparation_type ?? ""}
            options={enumOptionsI18n(PREP_TYPE_VALUES, PREPARATION_TYPE_TR)}
            onChange={(v) => s.setFilter("preparation_type", v)}
          />
          <ReadFilterSelect
            label={tc("status")}
            value={s.filters.status ?? ""}
            options={enumOptionsI18n(CATALOG_STATUS_VALUES, CATALOG_STATUS_TR)}
            onChange={(v) => s.setFilter("status", v)}
          />
          <ReadFilterSelect
            label={tc("sort")}
            value={s.sort}
            allLabel={tc("sortUpdated")}
            options={[{ value: "type", label: tc("sortType") }]}
            onChange={s.setSort}
          />
        </>
      }
        renderItem={(row) => <PreparationRow key={row.id} row={row} />}
      />
  );
}

function PreparationRow({ row }: { row: PreparationListItem }) {
  const enumLabel = useEnumLabel();
  const tc = useTranslations("aromatherapy.catalog");
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-teal-100/70 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
      <Link
        href={`/aromaterapi/katalog/preparatlar/${row.id}`}
        className="flex flex-col rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
      >
        <h3 className="text-[15px] font-black leading-snug text-slate-900 group-hover:text-teal-800">
          {enumLabel(PREPARATION_TYPE_TR, row.preparation_type)}
        </h3>
        {row.taxon_canonical_name ? (
          <p className="mt-1 text-[12px] font-semibold italic text-slate-500 [overflow-wrap:anywhere]">
            {row.taxon_canonical_name}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <MetaChip tone="teal">{row.plant_part}</MetaChip>
          {row.chemotype ? <MetaChip tone="amber">{tc("chemotype", { value: row.chemotype })}</MetaChip> : null}
          <MetaChip tone="slate">{enumLabel(CATALOG_STATUS_TR, row.status)}</MetaChip>
        </div>
      </Link>
      <div className="mt-auto flex justify-end border-t border-teal-50 pt-2.5">
        <Link
          href={`/aromaterapi/katalog/preparatlar/${row.id}/duzenle`}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2.5 text-[12px] font-black text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
        >
          {tc("edit")}
        </Link>
      </div>
    </article>
  );
}
