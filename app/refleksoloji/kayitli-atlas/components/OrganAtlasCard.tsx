"use client";

import { useLocale, useTranslations } from "next-intl";
import { localeTag } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import type { OrganSummary } from "../lib/organSummary";
import { useAtlasLabels } from "../lib/useAtlasLabels";
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
  const t = useTranslations("reflexology.savedAtlas.card");
  const tc = useTranslations("reflexology.common");
  const bcp47 = localeTag(useLocale() as ActiveLocale);
  const labels = useAtlasLabels();
  const handLabel = labels.handLabel(summary);
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
              aria-label={t("selectAria", { name: summary.name })}
            />
          </label>
        ) : null}
        <h2 className={`${premium.organ} min-w-0 flex-1`}>{summary.name}</h2>
        <span className={premium.count}>
          {t("regionCount", { count: summary.regionCount })}
        </span>
      </div>

      <dl className={premium.meta}>
        <div>
          <dt>{t("view")}</dt>
          <dd>{labels.viewLabel(summary)}</dd>
        </div>
        <div>
          <dt>{t("foot")}</dt>
          <dd>{labels.footLabel(summary)}</dd>
        </div>
        {handLabel ? (
          <div>
            <dt>{t("hand")}</dt>
            <dd>{handLabel}</dd>
          </div>
        ) : null}
        {updatedAt ? (
          <div>
            <dt>{t("updated")}</dt>
            <dd>
              {formatInstantDateTime(updatedAt, { fallback: "—", locale: bcp47 })}
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
          {t("open")}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className={`${premium.btn} ${premium.bEdit}`}
        >
          {t("edit")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={`${premium.btn} ${premium.bDel}`}
        >
          {tc("delete")}
        </button>
      </div>
    </article>
  );
}
