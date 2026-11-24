"use client";

import { useTranslations } from "next-intl";
import { useAromaReadError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import type { ReactNode } from "react";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import type { ReadListSelection } from "@/app/aromaterapi/_components/read/useReadListSelection";
import {
  ReadError,
  ReadLoading,
  ReadPagination,
  ReadResultCount,
  ReadToolbar,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";

/**
 * Aromaterapi V2 — C3C ortak liste ekranı düzeni.
 *
 * Toolbar (arama + filtreler + sonuç sayısı) → durum (loading/error/empty/liste)
 * → sayfalama. Tüm liste ekranlarını (bitki/preparat/kaynak/bilgi kaydı/sözlük)
 * tek görsel sözleşmede toplar. Salt sunum; veri hook'tan gelir.
 */
export function ReadListScreen<T extends { id: string }>({
  search,
  filters,
  action,
  loading,
  errorCode,
  rows,
  total,
  page,
  limit,
  hasActiveQuery,
  onPage,
  onRetry,
  renderItem,
  emptyTitle,
  emptyMessage,
  filteredEmptyTitle,
  filteredEmptyMessage,
  gridClassName = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
  selection,
}: {
  search: ReactNode;
  filters?: ReactNode;
  /** Listenin birincil eylemi (ör. "Yeni Bitki"). Kontrol çubuğuna bağlanır. */
  action?: ReactNode;
  loading: boolean;
  errorCode: string | null;
  rows: T[];
  total: number;
  page: number;
  limit: number;
  /** Arama/filtre aktif mi? Boş durumu (gerçek boş vs filtreli boş) ayırt eder. */
  hasActiveQuery: boolean;
  onPage: (page: number) => void;
  onRetry: () => void;
  renderItem: (row: T) => ReactNode;
  emptyTitle: string;
  emptyMessage: string;
  filteredEmptyTitle?: string;
  filteredEmptyMessage?: string;
  gridClassName?: string;
  /** Additive çoklu-seçim + Word export (useReadListSelection). Verilmezse seçim yok. */
  selection?: ReadListSelection;
}) {
  const pageIds = rows.map((r) => r.id);
  const t = useTranslations("aromatherapy.shared");
  const readError = useAromaReadError();
  return (
    <div className="space-y-4">
      <ReadToolbar
        search={search}
        filters={filters}
        action={action}
        count={<ReadResultCount total={total} loading={loading} />}
      />

      {selection && !loading && rows.length > 0 ? (
        <BulkExportBar
          compact
          selectedCount={selection.selectedIds.size}
          totalCount={total}
          filteredCount={total}
          selectAllLabel={t("selectPage")}
          selectAllCount={pageIds.length}
          onSelectAll={() => selection.selectAllPage(pageIds)}
          onClearSelection={selection.clear}
          isExporting={selection.isExporting}
          exportSelectedLabel={selection.selectedIds.size === 1 ? t("exportOne") : t("exportMany")}
          onExportSelected={selection.selectedIds.size > 0 ? selection.onExportSelected : undefined}
          onExportAll={selection.onExportAll}
        />
      ) : null}

      {loading ? (
        <ReadLoading />
      ) : errorCode ? (
        <ReadError message={readError(errorCode)} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        hasActiveQuery ? (
          <AromaterapiEmptyState
            variant="filtered"
            title={filteredEmptyTitle ?? t("filteredEmptyTitle")}
            message={filteredEmptyMessage ?? t("filteredEmptyMessage")}
          />
        ) : (
          <AromaterapiEmptyState variant="empty" title={emptyTitle} message={emptyMessage} />
        )
      ) : (
        <>
          <div className={gridClassName}>
            {rows.map((row) =>
              selection ? (
                <div key={row.id} className="relative">
                  <input
                    type="checkbox"
                    checked={selection.selectedIds.has(row.id)}
                    onChange={() => selection.toggle(row.id)}
                    aria-label={t("selectAria")}
                    className="absolute right-2.5 top-2.5 z-10 h-4 w-4 rounded accent-amber-600"
                  />
                  {renderItem(row)}
                </div>
              ) : (
                renderItem(row)
              ),
            )}
          </div>
          <ReadPagination page={page} limit={limit} total={total} onPage={onPage} />
        </>
      )}
    </div>
  );
}
