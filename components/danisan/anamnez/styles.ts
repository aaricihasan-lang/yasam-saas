import { outputHideClass } from "@/lib/platform/outputSupport";
/** Anamnez arayüzü ortak sınıfları — Danışan Detayı input dilinin aynısı (mobilde 16px: iOS zoom yok). */
export const aInput =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-600 sm:text-[14px]";
export const aTextarea =
  "w-full min-h-[76px] resize-y rounded-xl border border-slate-300 bg-white p-2.5 text-[16px] text-slate-800 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-600 sm:text-[14px]";
export const aLabel = "block text-[13px] font-extrabold text-slate-700";

/**
 * Anamnez SERBEST METİN alanları — kimlik bilgisi (login/username/password) alanı DEĞİL.
 *
 * Kök neden (2026-10-07 Android testi): alanlar `<form>` dışında, `name`/`autocomplete` metadata'sı
 * olmadan render ediliyordu; Android Chrome Password Manager ve Android Autofill çerçevesi (WebView)
 * böyle alanları kendi sezgileriyle sınıflandırıp "Başvuru nedeni"ne her dokunuşta parola/kullanıcı
 * önerisi açıyordu. Açık, standart semantik verilir:
 *   - autocomplete="off"           → otomatik doldurma/kimlik önerisi istenmez (HTML standardı),
 *   - kimlik çağrıştırmayan benzersiz name (anamnez_<alan>) → sezgisel "username" eşleşmesi yok,
 *   - autocapitalize/autocorrect/spellcheck → düzyazı alanı (klavye normal metin klavyesi),
 *   - parola yöneticisi yok-say ipuçları (LastPass/1Password/Dashlane) — zararsız ek katman.
 * Giriş ekranının gerçek parola alanları bu yardımcıyı KULLANMAZ (davranışları değişmez).
 */
export function freeTextFieldProps(fieldKey: string) {
  return {
    name: `anamnez_${fieldKey.replace(/[^A-Za-z0-9_]/g, "_")}`,
    autoComplete: "off",
    autoCorrect: "on",
    autoCapitalize: "sentences",
    spellCheck: true,
    "data-lpignore": "true",
    "data-1p-ignore": "true",
    "data-form-type": "other",
  } as const;
}
export const aHint = "text-[12px] font-medium leading-relaxed text-slate-500";
export const aChip = (active: boolean) =>
  `inline-flex min-h-[40px] items-center justify-center rounded-xl border px-3 text-[13px] font-bold transition-colors disabled:cursor-default ${
    active
      ? "border-teal-600 bg-teal-600 text-white"
      : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
  }`;
export const aGhostBtn =
  "inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60";

/**
 * Anamnez PDF CTA'ları (Boş Form / Kayıtlı Form) — owner kararı 2026-10-04: mobil PDF indirme bu
 * aşamada desteklenmiyor → Android'de (uygulama + tarayıcı; SSR sınıfı) ve telefon genişliğinde
 * (<768px) GİZLİ; masaüstü/tablet (md+) aynen görünür. PDF üretim davranışı DEĞİŞMEZ.
 */
export const ANAMNEZ_PDF_CTA_HIDE = `${outputHideClass("anamnez-pdf")} hidden md:inline-flex`;
/** "Önce kaydedin" ipucu yalnız bu CTA'ya ait → aynı koşulda gizli. */
export const ANAMNEZ_PDF_HINT_HIDE = `${outputHideClass("anamnez-pdf")} hidden md:block`;
