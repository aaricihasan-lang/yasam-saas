"use client";

type Props = {
  noteText: string;
  setNoteText: (value: string) => void;
  onSave: () => void;
  saving: boolean;
};

export default function NotesTab({ noteText, setNoteText, onSave, saving }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="mb-1.5 inline-flex rounded-full bg-violet-100 px-2.5 py-[5px] text-[11px] font-black text-violet-800">
            DANIŞAN NOT ALANI
          </span>
          <h2 className="text-[22px] font-black leading-[1.1] text-slate-950">Danışan Notları</h2>
          <p className="mt-1 text-[13px] text-slate-500">Seans gözlemleri, özel bilgiler ve süreç notları.</p>
        </div>
      </div>

      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="Danışan hakkında özel notlar..."
        className="w-full min-h-[120px] resize-y rounded-[14px] border border-slate-300 bg-white p-3 text-[14px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
      />

      <button
        onClick={onSave}
        disabled={saving}
        className="btn-secondary disabled:opacity-70"
      >
        {saving ? "Kaydediliyor..." : "Notları Kaydet"}
      </button>
    </div>
  );
}
