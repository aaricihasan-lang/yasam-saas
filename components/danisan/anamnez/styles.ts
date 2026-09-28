/** Anamnez arayüzü ortak sınıfları — Danışan Detayı input dilinin aynısı (mobilde 16px: iOS zoom yok). */
export const aInput =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-600 sm:text-[14px]";
export const aTextarea =
  "w-full min-h-[76px] resize-y rounded-xl border border-slate-300 bg-white p-2.5 text-[16px] text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-600 sm:text-[14px]";
export const aLabel = "block text-[13px] font-extrabold text-slate-700";
export const aHint = "text-[12px] font-medium leading-relaxed text-slate-500";
export const aChip = (active: boolean) =>
  `inline-flex min-h-[40px] items-center justify-center rounded-xl border px-3 text-[13px] font-bold transition-colors disabled:cursor-default ${
    active
      ? "border-teal-600 bg-teal-600 text-white"
      : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
  }`;
export const aGhostBtn =
  "inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60";
