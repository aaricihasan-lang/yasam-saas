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
};

export function OrganAtlasCard({
  summary,
  updatedAt,
  onView,
  onEdit,
  onDelete,
}: OrganAtlasCardProps) {
  return (
    <article className={premium.card}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={premium.organ}>{summary.name}</h2>
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
