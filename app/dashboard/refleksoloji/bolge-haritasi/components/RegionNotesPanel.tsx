type RegionNotesPanelProps = {
  selectedOrgan: string | null;
};

export function RegionNotesPanel({ selectedOrgan }: RegionNotesPanelProps) {
  return (
    <aside className="flex min-h-0 flex-col rounded-[24px] border border-white/90 bg-white/80 p-4 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md sm:p-5">
      <h2 className="text-xs font-black uppercase tracking-[0.22em] text-violet-800/90">Organ Notları</h2>

      <div className="mt-3 rounded-xl border border-violet-200/70 bg-gradient-to-r from-violet-100/50 to-fuchsia-50/40 px-3.5 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700/90">Seçili Organ:</p>
        <p
          className={`mt-1 text-sm font-bold leading-snug ${
            selectedOrgan ? "text-violet-950" : "font-medium italic text-slate-500"
          }`}
        >
          {selectedOrgan ?? "Organ seçiniz"}
        </p>
      </div>

      <label className="mt-4 flex min-h-0 flex-1 flex-col">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Açıklama</span>
        <textarea
          readOnly
          value=""
          placeholder={
            selectedOrgan
              ? `${selectedOrgan} için notlar buraya yazılacak…`
              : "Organ ve refleks bölgesi notları buraya yazılacak…"
          }
          className="mt-2 min-h-[140px] flex-1 resize-none rounded-xl border border-violet-200/60 bg-violet-50/30 px-3.5 py-3 text-sm font-medium leading-relaxed text-slate-700 placeholder:text-slate-400 outline-none lg:min-h-[200px]"
        />
      </label>

      <p className="mt-4 rounded-xl border border-dashed border-violet-200/75 bg-violet-50/45 px-3.5 py-3 text-sm font-medium leading-relaxed text-violet-900/85">
        Atlas bilgisi burada görüntülenecek.
      </p>
    </aside>
  );
}
