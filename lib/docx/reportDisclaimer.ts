/**
 * Danışana giden belgeler ve sağlık/wellness bağlamlı ekranlar için ORTAK,
 * sade bilgilendirme notu metinleri (FA-16).
 *
 * İlke (owner kararı): Uzmanın yazdığı başlık/içeriğe sistem müdahale ETMEZ
 * (rename/filtre/yasak yok). Bunun yerine küçük puntolu, sakin ve profesyonel
 * tek bir not eklenir. Kırmızı/uyarı kutusu KULLANILMAZ.
 *
 * Bu dosya saf metin kaynağıdır (docx bağımlılığı yok) → UI ve Word aynı metni kullanır.
 */

export type WellnessNoteKind =
  | "general"
  | "danisan"
  | "dogaltas"
  | "sifa"
  | "aromaterapi"
  | "hacamat"
  | "numeroloji"
  | "human_design"
  | "biyoenerji"
  | "refleksoloji"
  | "beslenme";

type NoteText = {
  /** Sayfa altı (footer) için tek satırlık kısa not. */
  short: string;
  /** Rapor sonu "Bilgilendirme" bölümü için tam cümle. */
  full: string;
};

const GENERAL_FULL =
  "Bu belge, uzman tarafından hazırlanan destekleyici nitelikte kişisel bir kayıttır; tıbbi tanı veya tedavinin yerine geçmez. Sağlık durumunuzla ilgili kararlar için hekiminize danışınız.";
const GENERAL_SHORT = "Destekleyici kişisel kayıt · tıbbi tanı/tedavi yerine geçmez";

export const WELLNESS_NOTES: Record<WellnessNoteKind, NoteText> = {
  general: { short: GENERAL_SHORT, full: GENERAL_FULL },
  danisan: { short: GENERAL_SHORT, full: GENERAL_FULL },
  dogaltas: {
    short: "Geleneksel/tamamlayıcı bilgi · tıbbi tanı/tedavi yerine geçmez",
    full: "Doğal taşlarla ilgili bilgiler geleneksel ve tamamlayıcı kullanım kaynaklarına dayanır; tıbbi tanı veya tedavinin yerine geçmez. Sağlık durumunuzla ilgili kararlar için hekiminize danışınız.",
  },
  sifa: { short: GENERAL_SHORT, full: GENERAL_FULL },
  aromaterapi: {
    short: "Haricen, seyreltilerek kullanım · tıbbi tanı/tedavi yerine geçmez",
    full: "Aromaterapi önerileri haricen ve uygun seyreltmeyle kullanım içindir; tıbbi tanı veya tedavinin yerine geçmez. Hamilelik, emzirme, kronik hastalık veya ilaç kullanımı durumunda kullanmadan önce hekiminize danışınız.",
  },
  hacamat: {
    short: "Geleneksel bilgi · sağlık iddiası değildir",
    full: "Hacamat/kupa uygulamalarına ilişkin bilgiler geleneksel kaynaklara dayanır; sağlık iddiası taşımaz ve tıbbi tanı veya tedavinin yerine geçmez. Uygulama öncesinde hekim değerlendirmesi önerilir.",
  },
  numeroloji: {
    short: "Kişisel farkındalık amaçlıdır",
    full: "Bu içerik kişisel farkındalık ve gelişim amaçlıdır; tıbbi, psikolojik, hukuki veya finansal tavsiye niteliği taşımaz.",
  },
  human_design: {
    short: "Kişisel farkındalık amaçlıdır",
    full: "Bu içerik kişisel farkındalık ve gelişim amaçlıdır; tıbbi, psikolojik, hukuki veya finansal tavsiye niteliği taşımaz.",
  },
  biyoenerji: {
    short: "Tamamlayıcı/wellness içerik · tıbbi tanı/tedavi yerine geçmez",
    full: "Biyoenerji ve tamamlayıcı/wellness içerikleri kişisel farkındalık ve destek amaçlıdır; tıbbi tanı veya tedavinin yerine geçmez.",
  },
  refleksoloji: {
    short: "Tamamlayıcı uygulama · tıbbi tanı/tedavi yerine geçmez",
    full: "Refleksoloji uygulamaları tamamlayıcı niteliktedir. Bu modül tıbbi tanı veya tedavi amacı taşımaz ve hekim değerlendirmesinin yerine geçmez.",
  },
  beslenme: {
    short: "Genel beslenme bilgisi · tıbbi diyet tedavisi yerine geçmez",
    full: "Bu beslenme planı genel bilgilendirme ve destek amaçlıdır; tıbbi beslenme tedavisinin veya hekim/diyetisyen değerlendirmesinin yerine geçmez.",
  },
};

export function wellnessNote(kind: WellnessNoteKind = "general"): NoteText {
  return WELLNESS_NOTES[kind] ?? WELLNESS_NOTES.general;
}

/**
 * Belgeyi hazırlayan uzmanın görünen adı (profil kaydından).
 * full_name → name → null. Boş/boşluklu değerler null döner.
 */
export function expertDisplayName(profile: Record<string, unknown> | null | undefined): string | null {
  if (!profile) return null;
  for (const key of ["full_name", "name"]) {
    const v = profile[key];
    if (typeof v === "string" && v.trim()) return v.replace(/\s+/g, " ").trim();
  }
  return null;
}
