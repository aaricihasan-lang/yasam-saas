/** Anamnez arayüzü ortak sınıfları — Danışan Detayı input dilinin aynısı (mobilde 16px: iOS zoom yok). */
export const aInput =
  "w-full rounded-[10px] border border-[#cfd6e0] bg-white px-3 py-2.5 text-[16px] text-[#0f1d36] outline-none transition-all placeholder:text-[#9aa5b5] focus:border-[#2c5aa0] focus:ring-[3px] focus:ring-[#2c5aa0]/15 disabled:bg-[#f2f4f7] disabled:text-[#55637a] sm:text-[14px]";
export const aTextarea =
  "w-full min-h-[76px] resize-y rounded-[10px] border border-[#cfd6e0] bg-white p-2.5 text-[16px] text-[#0f1d36] outline-none transition-all placeholder:text-[#9aa5b5] focus:border-[#2c5aa0] focus:ring-[3px] focus:ring-[#2c5aa0]/15 disabled:bg-[#f2f4f7] disabled:text-[#55637a] sm:text-[14px]";
export const aLabel = "block text-[12.5px] font-bold text-[#1f3050]";

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
export const aHint = "text-[12px] font-medium leading-relaxed text-[#55637a]";
export const aChip = (active: boolean) =>
  `inline-flex min-h-[40px] items-center justify-center rounded-xl border px-3 text-[13px] font-bold transition-colors disabled:cursor-default ${
    active
      ? "border-[#13284b] bg-[#13284b] text-white"
      : "border-[#d4dae3] bg-white text-[#1f3050] hover:border-[#2c5aa0]/40 hover:bg-[#eaf0f8] disabled:hover:border-[#d4dae3] disabled:hover:bg-white"
  }`;
export const aGhostBtn =
  "inline-flex min-h-[40px] items-center justify-center gap-1 rounded-[10px] border border-[#d4dae3] bg-white px-3 text-[13px] font-bold text-[#1f3050] transition-colors hover:bg-[#f8f9fb] disabled:opacity-60";

/**
 * Anamnez PDF CTA'ları (Boş Form / Kayıtlı Form) — 2026-10-14 owner kararı: Android uygulaması blob
 * PDF indirmeyi kaydedebildiği için TÜM cihazlarda (Android uygulama/tarayıcı ve telefon genişliği
 * dahil) GÖRÜNÜR (önceki 2026-10-04 kararı mobilde gizliyordu). PDF üretim davranışı DEĞİŞMEZ.
 * Sabit adları çağıranlar değişmesin diye korunur.
 */
export const ANAMNEZ_PDF_CTA_HIDE = "inline-flex";
/** "Önce kaydedin" ipucu CTA ile aynı koşulda (her yerde) görünür. */
export const ANAMNEZ_PDF_HINT_HIDE = "block";
