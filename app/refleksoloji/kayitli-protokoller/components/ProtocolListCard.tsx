"use client";

import Link from "next/link";
import { Calendar, Eye, Pencil, Trash2 } from "lucide-react";
import { DemoBlur } from "@/components/demo/DemoBlur";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";
import { getOrganColor } from "@/app/refleksoloji/protokol-haritasi/types";
import { formatProtocolDate, parseOrgansList } from "../lib/protocolActions";
import type { ReflexologyProtocolRecord } from "../types";

type ProtocolListCardProps = {
  protocol: ReflexologyProtocolRecord;
  onDelete: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  /** Demo hesabında mı gösteriliyor */
  isDemo?: boolean;
  /** Demo fixture/seed protokolü mü (içerik blur'lu) */
  isSeed?: boolean;
};

export function ProtocolListCard({
  protocol,
  onDelete,
  isSelected,
  onToggleSelect,
  isDemo = false,
  isSeed = false,
}: ProtocolListCardProps) {
  const title = protocol.title?.trim() || "Başlıksız protokol";
  const targetProblem = protocol.target_problem?.trim() || "";
  const organsList = parseOrgansList(protocol.organs);
  const organsSummary = protocol.organs?.trim() || "";

  return (
    <article className={`relative flex flex-col rounded-[20px] border bg-white/95 px-5 pb-4 pt-[18px] shadow-[0_1px_2px_rgba(76,61,140,0.04),0_14px_32px_-18px_rgba(76,61,140,0.25)] transition ${
      isSelected ? "border-violet-400 ring-[3px] ring-violet-300/30" : "border-[#e8e4f7]"
    }`}>
      {/* Checkpoint — sadece demo olmayan ve fixture olmayan protokollerde */}
      {onToggleSelect !== undefined && !isDemo && (
        <label
          className="absolute right-3 top-3 z-10 flex h-5 w-5 cursor-pointer items-center justify-center"
          onClick={(e) => e.preventDefault()}
        >
          <input
            type="checkbox"
            checked={Boolean(isSelected)}
            onChange={() => onToggleSelect()}
            className="h-[18px] w-[18px] rounded border-violet-300 accent-violet-600"
          />
        </label>
      )}

      <Link
        href={`/refleksoloji/kayitli-protokoller/${encodeURIComponent(protocol.id)}`}
        className="block min-w-0 flex-1"
      >
        <div className="flex items-start justify-between gap-2 pr-7">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-[18px] font-extrabold leading-snug text-[#17132f] [overflow-wrap:anywhere]">{title}</h2>
            <AdminTransferBadge originType={protocol.origin_type} className="mt-1" />
          </div>
          {organsList.length > 0 ? (
            <span className="shrink-0 rounded-full bg-[#ece7fd] px-3 py-0.5 text-[13px] font-semibold text-[#4c33b8]">
              {organsList.length} organ
            </span>
          ) : null}
        </div>

        {targetProblem ? (
          <DemoBlur isProtected={isSeed} className="mt-1.5">
            <p className="line-clamp-2 text-[13.5px] font-bold leading-relaxed text-violet-700">
              {targetProblem}
            </p>
          </DemoBlur>
        ) : null}

        {organsSummary ? (
          <DemoBlur isProtected={isSeed} className="mt-1">
            <p className="line-clamp-2 text-[14px] font-medium leading-relaxed text-[#57536b]">
              {organsSummary}
            </p>
          </DemoBlur>
        ) : (
          <p className="mt-1 text-[14px] font-medium text-[#9a97b0]">Organ bilgisi eklenmemiş.</p>
        )}

        {organsList.length > 0 ? (
          <DemoBlur isProtected={isSeed} className="mt-2">
            <ul className="flex flex-wrap gap-1.5">
              {organsList.map((name, index) => {
                const color = getOrganColor(index);
                return (
                  <li key={`${name}-${index}`}>
                    <span
                      className={`inline-block rounded-lg border px-2.5 py-0.5 text-[12.5px] font-semibold ${color.chipClass}`}
                    >
                      {name}
                    </span>
                  </li>
                );
              })}
            </ul>
          </DemoBlur>
        ) : null}
      </Link>

      <dl className="mt-auto pt-3.5 text-[14px] font-medium text-[#57536b]">
        <div className="flex items-center justify-between gap-2">
          <dt className="inline-flex items-center gap-1.5">
            <Calendar className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
            Kayıt tarihi
          </dt>
          <dd className="whitespace-nowrap font-semibold text-[#17132f]">
            {formatProtocolDate(protocol.created_at)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 grid grid-cols-[1fr_1.1fr_0.8fr] gap-2">
        <Link
          href={`/refleksoloji/kayitli-protokoller/${encodeURIComponent(protocol.id)}`}
          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#d8cff8] bg-[#efeafd] px-2 text-[14px] font-semibold text-[#2b2257] transition hover:bg-[#e5ddfc] sm:min-h-[38px]"
        >
          <Eye className="h-4 w-4 text-[#4c33b8]" strokeWidth={2.2} aria-hidden />
          Görüntüle
        </Link>
        {!isSeed && (
          <Link
            href={`/refleksoloji/protokol-haritasi?id=${encodeURIComponent(protocol.source_uid ?? protocol.id)}`}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#ecd2f2] bg-[#fbf1fb] px-2 text-[14px] font-semibold text-[#2b2257] transition hover:bg-[#f6e4f6] sm:min-h-[38px]"
          >
            <Pencil className="h-[15px] w-[15px] text-violet-700" strokeWidth={2.2} aria-hidden />
            Düzenle
          </Link>
        )}
        {!isSeed && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#fcd5d5] bg-[#fff2f2] px-2 text-[14px] font-semibold text-rose-600 transition hover:bg-[#ffe4e4] sm:min-h-[38px]"
          >
            <Trash2 className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden />
            Sil
          </button>
        )}
      </div>
    </article>
  );
}
