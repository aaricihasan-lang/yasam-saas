type RegionNotesPanelProps = {
  selectedOrgan: string | null;
};

export function RegionNotesPanel({ selectedOrgan }: RegionNotesPanelProps) {
  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col rounded-2xl border border-white/90 bg-white/80 p-3 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md lg:w-[340px]">
      <h2 className="text-lg font-black uppercase tracking-[0.2em] text-violet-900">Organ Notları</h2>

      <div className="mt-2 rounded-xl border border-violet-200/70 bg-gradient-to-r from-violet-100/60 to-fuchsia-50/50 px-3.5 py-2.5">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-800 sm:text-sm">Seçili Organ:</p>
        <p
          className={`mt-1 text-base font-bold leading-snug ${
            selectedOrgan ? "text-violet-950" : "font-semibold italic text-slate-600"
          }`}
        >
          {selectedOrgan ?? "Organ seçiniz"}
        </p>
      </div>

      <label className="mt-3 flex min-h-0 flex-1 flex-col">
        <span className="text-sm font-bold uppercase tracking-wide text-slate-600">Açıklama</span>
        <textarea
          readOnly
          value=""
          placeholder={
            selectedOrgan
              ? `${selectedOrgan} için notlar buraya yazılacak…`
              : "Organ ve refleks bölgesi notları buraya yazılacak…"
          }
          className="mt-1.5 min-h-[160px] flex-1 resize-none rounded-xl border border-violet-200/60 bg-violet-50/30 px-3.5 py-3 text-base font-medium leading-relaxed text-slate-800 placeholder:text-base placeholder:font-medium placeholder:text-slate-500 outline-none lg:min-h-[280px]"
        />
      </label>

      <p className="mt-3 rounded-xl border border-dashed border-violet-200/75 bg-violet-50/45 px-3.5 py-2.5 text-base font-medium leading-relaxed text-violet-900">
        Atlas bilgisi burada görüntülenecek.
      </p>
    </aside>
  );
}
