/**
 * Doğaltaş modülü — ortak form primitif sınıfları (amber/emerald V3 kimliği).
 *
 * Daha önce her form sayfası kendi input/label/textarea sabitini tanımlıyordu
 * (uiInput/uiField/uiTextarea/uiLabel) ve bir kısmı palet-dışı cyan focus
 * kullanıyordu (P1-O). Tek kaynak burada; emerald odaklı, tutarlı focus halkası.
 */

/** Tek satırlık metin girişi (input) — h-10, emerald kenarlık + focus. */
export const DOGALTAS_INPUT_CLASS =
  "h-10 w-full rounded-xl border-2 border-emerald-200 bg-white/90 px-4 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";

/** Açılır liste (select) — input ile aynı görünüm. */
export const DOGALTAS_SELECT_CLASS = DOGALTAS_INPUT_CLASS;

/** Çok satırlı metin (textarea) — emerald kenarlık + focus. */
export const DOGALTAS_TEXTAREA_CLASS =
  "w-full min-h-[100px] resize-none rounded-xl border-2 border-emerald-200 bg-white/90 px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";

/** Alan etiketi (label). */
export const DOGALTAS_LABEL_CLASS =
  "mb-1.5 block text-[13px] font-bold text-slate-700";
