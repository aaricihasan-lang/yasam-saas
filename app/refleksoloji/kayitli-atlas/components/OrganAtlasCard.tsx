"use client";

import type { OrganSummary } from "../lib/organSummary";
import { formatInstantDateTime } from "@/lib/time/reportTime";
import premium from "@/app/_premium/refleksoloji/kayitliAtlas.module.css";

type OrganAtlasCardProps = {
  summary: OrganSummary;
  /** FA-24: BU organın son güncellemesi (_meta.organUpdatedAt) — global belge tarihi değil. */
  updatedAt: string | null;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** W06: toplu silme seçimi (verilmezse seçim kutusu gösterilmez). */
  selected?: boolean;
  onToggleSelect?: () => void;
};

export function OrganAtlasCard({
  summary,
  updatedAt,
  onView,
  onEdit,
  onDelete,
  selected = false,
  onToggleSelect,
}: OrganAtlasCardProps) {
  return (
    <article
      className={`${premium.card}${selected ? " outline outline-2 outline-violet-400" : ""}`}
      data-selected={selected ? "true" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        {onToggleSelect ? (
          <label className="-m-2 flex shrink-0 cursor-pointer items-center p-2">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-5 w-5 cursor-pointer accent-violet-600"
              aria-label={`${summary.name} kaydını seç`}
            />
          </label>
        ) : null}
        <h2 className={`${premium.organ} min-w-0 flex-1`}>{summary.name}</h2>
        <span className={premium.count}>
          {summary.regionCount} bölge
        </span>
      </div>

      <dl className={premium.meta}>
        <div>
          <dt>Görünüm</dt>
          <dd>{summary.viewLabel}</dd>
        </div>
        <div>
          <dt>Ayak</dt>
          <dd>{summary.footLabel}</dd>
        </div>
        {summary.handLabel ? (
          <div>
            <dt>El</dt>
            <dd>{summary.handLabel}</dd>
          </div>
        ) : null}
        {updatedAt ? (
          <div>
            <dt>Son güncelleme</dt>
            <dd>
              {formatInstantDateTime(updatedAt, { fallback: "—" })}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className={premium.actions}>
        <button
          type="button"
          onClick={onView}
          className={`${premium.btn} ${premium.bView}`}
        >
          Görüntüle
        </button>
        <button
          type="button"
          onClick={onEdit}
          className={`${premium.btn} ${premium.bEdit}`}
        >
          Düzenle
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={`${premium.btn} ${premium.bDel}`}
        >
          Sil
        </button>
      </div>
    </article>
  );
}
