"use client";

import type { KnowledgeGroup } from "../rapor-olustur/helpers/hdRapor";

type Props = {
  groups: KnowledgeGroup[];
  loading?: boolean;
};

export function GateKnowledgeNotes({ groups, loading }: Props) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
        Bilgi Bankası Yorumları
      </p>
      {loading ? (
        <p className="text-xs text-indigo-500">Yükleniyor...</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-slate-400">
          Bu başlık için henüz Bilgi Bankası yorumu eklenmemiş.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.flatMap(({ category, records }) =>
            records.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-indigo-100/80 bg-indigo-50/30 px-4 py-3"
              >
                <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-indigo-500">
                  {category}
                </p>
                <p className="mb-0.5 text-xs font-bold text-slate-800">{r.title}</p>
                <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {r.content}
                </p>
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}
