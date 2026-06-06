"use client";

import Link from "next/link";
import { getOrganColor } from "@/app/refleksoloji/protokol-haritasi/types";
import { formatProtocolDate, parseOrgansList } from "../lib/protocolActions";
import type { ReflexologyProtocolRecord } from "../types";

type ProtocolListCardProps = {
  protocol: ReflexologyProtocolRecord;
  onDelete: () => void;
};

export function ProtocolListCard({ protocol, onDelete }: ProtocolListCardProps) {
  const title = protocol.title?.trim() || "Başlıksız protokol";
  const targetProblem = protocol.target_problem?.trim() || "";
  const organsList = parseOrgansList(protocol.organs);
  const organsSummary = protocol.organs?.trim() || "";

  return (
    <article className="flex flex-col rounded-2xl border border-purple-100 bg-white/80 p-4 shadow-sm ring-1 ring-violet-100/60 backdrop-blur-md transition hover:shadow-md">
      <Link
        href={`/refleksoloji/kayitli-protokoller/${encodeURIComponent(protocol.id)}`}
        className="block min-w-0 flex-1"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-black text-slate-900">{title}</h2>
          {organsList.length > 0 ? (
            <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-900">
              {organsList.length} organ
            </span>
          ) : null}
        </div>

        {targetProblem ? (
          <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-relaxed text-violet-900/90">
            {targetProblem}
          </p>
        ) : null}

        {organsSummary ? (
          <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-600">
            {organsSummary}
          </p>
        ) : (
          <p className="mt-1 text-xs font-medium text-slate-400">Organ bilgisi eklenmemiş.</p>
        )}

        {organsList.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {organsList.map((name, index) => {
              const color = getOrganColor(index);
              return (
                <li key={`${name}-${index}`}>
                  <span
                    className={`inline-block rounded-lg border px-2 py-0.5 text-[10px] font-bold ${color.chipClass}`}
                  >
                    {name}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Link>

      <dl className="mt-3 space-y-1 text-xs font-medium text-slate-500">
        <div className="flex justify-between gap-2">
          <dt>Kayıt tarihi</dt>
          <dd className="font-semibold text-slate-700">
            {formatProtocolDate(protocol.created_at)}
          </dd>
        </div>
        {protocol.source_uid?.trim() ? (
          <div className="flex min-w-0 justify-between gap-2">
            <dt className="shrink-0">Kaynak UID</dt>
            <dd className="min-w-0 truncate font-mono text-[10px] font-semibold text-slate-600">{protocol.source_uid}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link
          href={`/refleksoloji/kayitli-protokoller/${encodeURIComponent(protocol.id)}`}
          className="flex-1 rounded-xl border border-violet-300/80 bg-violet-100 px-3 py-1.5 text-center text-xs font-bold text-violet-950 transition hover:bg-violet-200/90"
        >
          Görüntüle
        </Link>
        <Link
          href={`/refleksoloji/protokol-haritasi?id=${encodeURIComponent(protocol.id)}`}
          className="flex-1 rounded-xl border border-fuchsia-300/80 bg-fuchsia-50 px-3 py-1.5 text-center text-xs font-bold text-fuchsia-950 transition hover:bg-fuchsia-100/90"
        >
          Düzenle
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 sm:w-auto sm:min-w-[80px]"
        >
          Sil
        </button>
      </div>
    </article>
  );
}
