"use client";

export type BulkExportBarProps = {
  selectedCount: number;
  totalCount: number;
  filteredCount?: number;
  hasActiveFilter?: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExportSelected?: () => void;
  onExportAll?: () => void;
  onExportFiltered?: () => void;
  isExporting?: boolean;
  compact?: boolean;
  onDeleteSelected?: () => void;
  isDeleting?: boolean;
  /** "Tümünü Sil" aksiyonu (çok güvenli, doğrulama kodlu modal tetikler) */
  onDeleteAll?: () => void;
  /** Seç butonu etiketi (varsayılan "Tümünü Seç"). Örn. "Görünenleri Seç" */
  selectAllLabel?: string;
  /** Seç butonunda gösterilecek sayı (varsayılan totalCount). Örn. görünen kayıt sayısı */
  selectAllCount?: number;
};

export function BulkExportBar({
  selectedCount,
  totalCount,
  filteredCount,
  hasActiveFilter,
  onSelectAll,
  onClearSelection,
  onExportSelected,
  onExportAll,
  onExportFiltered,
  isExporting,
  compact,
  onDeleteSelected,
  isDeleting,
  onDeleteAll,
  selectAllLabel = "Tümünü Seç",
  selectAllCount,
}: BulkExportBarProps) {
  const busy = Boolean(isExporting) || Boolean(isDeleting);
  const hasExport = Boolean(onExportSelected || onExportAll);
  const selectCountDisplay = selectAllCount ?? totalCount;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/90 px-3 py-1.5 shadow-sm">
        <span className="shrink-0 rounded-full border border-blue-300 bg-white px-2.5 py-0.5 text-[11px] font-black text-blue-800 shadow-sm">
          {selectedCount > 0 ? `✓ ${selectedCount} seçili` : "Seçim yok"}
        </span>

        <button
          type="button"
          onClick={onSelectAll}
          disabled={busy}
          className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          {selectAllLabel} ({selectCountDisplay})
        </button>

        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClearSelection}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-black text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            Seçimi Temizle
          </button>
        )}

        {hasExport && (
          <>
            <div className="hidden h-3 w-px bg-blue-200 sm:block" aria-hidden />

            {onExportSelected && (
              <button
                type="button"
                onClick={onExportSelected}
                disabled={selectedCount === 0 || busy}
                className="rounded-lg border border-blue-400 bg-blue-600 px-2.5 py-0.5 text-[11px] font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "⏳ Hazırlanıyor..." : `📄 Seçilenleri (${selectedCount})`}
              </button>
            )}

            {hasActiveFilter && onExportFiltered && filteredCount !== undefined && (
              <button
                type="button"
                onClick={onExportFiltered}
                disabled={busy || filteredCount === 0}
                className="rounded-lg border border-violet-400 bg-violet-600 px-2.5 py-0.5 text-[11px] font-black text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "⏳..." : `📄 Filtreli (${filteredCount})`}
              </button>
            )}

            {onExportAll && (
              <button
                type="button"
                onClick={onExportAll}
                disabled={busy}
                className="rounded-lg border border-slate-400 bg-slate-700 px-2.5 py-0.5 text-[11px] font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
              >
                {busy ? "⏳..." : `📄 Tümü (${totalCount})`}
              </button>
            )}
          </>
        )}

        {onDeleteSelected && (
          <>
            <div className="hidden h-3 w-px bg-red-200 sm:block" aria-hidden />
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={selectedCount === 0 || busy}
              className="rounded-lg border border-red-300 bg-red-600 px-2.5 py-0.5 text-[11px] font-black text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isDeleting ? "⏳ Siliniyor..." : `🗑 Seçilileri Sil (${selectedCount})`}
            </button>
          </>
        )}

        {onDeleteAll && (
          <button
            type="button"
            onClick={onDeleteAll}
            disabled={busy || totalCount === 0}
            className="rounded-lg border border-red-300 bg-white px-2.5 py-0.5 text-[11px] font-black text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            🗑 Tümünü Sil
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/90 px-3 py-2 shadow-sm">
      {/* Seçim sayacı */}
      <span className="shrink-0 rounded-full border border-blue-300 bg-white px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-blue-800 shadow-sm">
        {selectedCount > 0 ? `✓ ${selectedCount} seçili` : "Seçim yok"}
      </span>

      {/* Seçim kontrolleri */}
      <button
        type="button"
        onClick={onSelectAll}
        disabled={busy}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
      >
        Tümünü Seç ({totalCount})
      </button>

      {selectedCount > 0 && (
        <button
          type="button"
          onClick={onClearSelection}
          disabled={busy}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          Seçimi Temizle
        </button>
      )}

      {hasExport && (
        <>
          <div className="hidden h-4 w-px bg-blue-200 sm:block" aria-hidden />

          {onExportSelected && (
            <button
              type="button"
              onClick={onExportSelected}
              disabled={selectedCount === 0 || busy}
              className="rounded-lg border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "⏳ Hazırlanıyor..." : `📄 Seçilenleri Word (${selectedCount})`}
            </button>
          )}

          {hasActiveFilter && onExportFiltered && filteredCount !== undefined && (
            <button
              type="button"
              onClick={onExportFiltered}
              disabled={busy || filteredCount === 0}
              className="rounded-lg border border-violet-400 bg-violet-600 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "⏳..." : `📄 Filtrelenmiş Word (${filteredCount})`}
            </button>
          )}

          {onExportAll && (
            <button
              type="button"
              onClick={onExportAll}
              disabled={busy}
              className="rounded-lg border border-slate-400 bg-slate-700 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
            >
              {busy ? "⏳..." : `📄 Tümünü Word (${totalCount})`}
            </button>
          )}
        </>
      )}

      {onDeleteSelected && (
        <>
          <div className="hidden h-4 w-px bg-red-200 sm:block" aria-hidden />
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0 || busy}
            className="rounded-lg border border-red-300 bg-red-600 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? "⏳ Siliniyor..." : `🗑 Seçilileri Sil (${selectedCount})`}
          </button>
        </>
      )}

      {onDeleteAll && (
        <>
          <div className="hidden h-4 w-px bg-red-200 sm:block" aria-hidden />
          <button
            type="button"
            onClick={onDeleteAll}
            disabled={busy || totalCount === 0}
            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            🗑 Tümünü Sil ({totalCount})
          </button>
        </>
      )}
    </div>
  );
}
