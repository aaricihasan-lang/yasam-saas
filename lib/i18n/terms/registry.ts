/**
 * MERKEZÎ TERMİNOLOJİ + KANONİK KİMLİK MİMARİSİ (I18N-F1).
 *
 * İlke: dilsel etiket ASLA teknik kimlik değildir.
 *   kimlik (kod)   → "aries", "sun", "fire", "full_moon"   — hesap, eşleştirme, önbellek, karşılaştırma bunu kullanır
 *   görünen etiket → messages/<dil>/terms.json  (t("terms.zodiac.aries") → "Koç" / "Aries")
 *   eski DB değeri → bugün veritabanında Türkçe saklanan kanonik değer (ör. clients.burc = "Koç") — DEĞİŞTİRİLMEZ,
 *                    yalnız sınırda koda çevrilir (fromLegacyTr) ve ekranda etiket katalogdan gösterilir.
 *
 * Kimlik listeleri lib/astrology/labels (SignId/BodyId) ile AYNIDIR; Türkçe katalog etiketleri astroloji
 * etiketleriyle birebir eşittir (scripts/i18n/unit.test.ts denetler) → modüller arası terim ayrışması olmaz.
 * Yeni alan (HD, numeroloji, doğaltaş…) kendi `terms.<alan>` bölümünü ve kimlik listesini burada ekler.
 */

export const ZODIAC_IDS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"] as const;
export type ZodiacId = (typeof ZODIAC_IDS)[number];

export const BODY_IDS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "north_node", "south_node", "chiron", "lilith"] as const;
export type BodyId = (typeof BODY_IDS)[number];

export const ELEMENT_IDS = ["fire", "earth", "air", "water"] as const;
export type ElementId = (typeof ELEMENT_IDS)[number];

export const MOON_PHASE_IDS = ["new_moon", "first_quarter", "full_moon", "last_quarter"] as const;
export type MoonPhaseId = (typeof MOON_PHASE_IDS)[number];

/**
 * Bugün veritabanında / kayıtlı JSON'da saklanan TÜRKÇE KANONİK değerler (değiştirilmez). Bu tablo yalnız
 * okuma sınırında kimliğe çevirmek içindir; yeni kayıtlarda modül fazı kararına göre kod saklanabilir.
 */
const LEGACY_TR: {
  zodiac: Record<ZodiacId, string>;
  element: Record<ElementId, string>;
  moonPhase: Record<MoonPhaseId, string>;
} = {
  zodiac: {
    aries: "Koç", // i18n-ignore: kanonik DB değeri (clients.burc)
    taurus: "Boğa", // i18n-ignore: kanonik DB değeri
    gemini: "İkizler", // i18n-ignore: kanonik DB değeri
    cancer: "Yengeç", // i18n-ignore: kanonik DB değeri
    leo: "Aslan",
    virgo: "Başak", // i18n-ignore: kanonik DB değeri
    libra: "Terazi",
    scorpio: "Akrep",
    sagittarius: "Yay",
    capricorn: "Oğlak", // i18n-ignore: kanonik DB değeri
    aquarius: "Kova",
    pisces: "Balık", // i18n-ignore: kanonik DB değeri
  },
  element: {
    fire: "Ateş", // i18n-ignore: kanonik değer (Danışan analiz element verisi)
    earth: "Toprak",
    air: "Hava",
    water: "Su",
  },
  moonPhase: {
    new_moon: "Yeni Ay",
    first_quarter: "İlk Dördün", // i18n-ignore: kanonik değer (lib/cosmic/moon.ts — Kozmik Ajanda F1'de değişmez)
    full_moon: "Dolunay",
    last_quarter: "Son Dördün", // i18n-ignore: kanonik değer (lib/cosmic/moon.ts)
  },
};

export type TermDomain = keyof typeof LEGACY_TR;

function fold(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("tr-TR");
}

/** Eski Türkçe kanonik değer → kimlik (eşleşme yoksa null; DB değeri dokunulmadan korunur). */
export function fromLegacyTr<D extends TermDomain>(domain: D, value: string | null | undefined): keyof (typeof LEGACY_TR)[D] | null {
  if (!value) return null;
  const v = fold(value);
  for (const [id, label] of Object.entries(LEGACY_TR[domain])) if (fold(label) === v) return id as keyof (typeof LEGACY_TR)[D];
  return null;
}

/** Kimlik → eski Türkçe kanonik değer (mevcut kayıt biçimini koruyarak yazmak için). */
export function toLegacyTr<D extends TermDomain>(domain: D, id: keyof (typeof LEGACY_TR)[D]): string {
  return (LEGACY_TR[domain] as Record<string, string>)[id as string];
}

/** Görünen etiket anahtarı: t(termKey("zodiac", "aries")) → "terms.zodiac.aries". */
export function termKey(domain: "zodiac" | "body" | "element" | "moonPhase", id: string): string {
  return `terms.${domain}.${id}`;
}

export const LEGACY_TR_TABLE = LEGACY_TR;
