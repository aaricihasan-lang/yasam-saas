// Klasik Numeroloji · Doğaltaş eşleştirme — SAF tipler (IO yok; istemci + sunucu güvenli).

/** Kişinin eşleştirmede kullanılan çekirdek sayıları. */
export type StoneNumberKey = "lifePath" | "expression" | "soulUrge" | "personality" | "birthDay";

export type StoneNumberInput = {
  value: number;
  /** Sağlayıcının işareti. 11/22/33 HER ZAMAN usta sayı kabul edilir (işaret "single" gelse bile kök sayıya sessizce indirgenmez). */
  type?: "single" | "master";
};

export type StonePersonNumbers = Partial<Record<StoneNumberKey, StoneNumberInput | null>> & {
  /** Karmik borç sayıları (13/14/16/19). Taş verisinde karşılığı YOK → eşleştirmede kullanılmaz, yalnız not düşülür. */
  karmicDebt?: readonly number[] | null;
  /** Karmik ders (eksik) sayıları. Taş verisinde karşılığı YOK → eşleştirmede kullanılmaz, yalnız not düşülür. */
  karmicLessons?: readonly number[] | null;
};

/** `/chart` → luckyAssociations alt kümesi (Yaşam Yolu'nun yönetici gezegeninden türetilir). */
export type StoneLuckyAssociations = {
  /** Serbest metin taş adları (sağlayıcının istek dilinde). */
  gemstones?: readonly string[] | null;
  /** Aynı listenin diğer dildeki karşılığı (aynı sıra). Birincil ad çözülemezse yedek olarak denenir. */
  gemstonesAlt?: readonly string[] | null;
  rulingPlanet?: string | null;
  element?: string | null;
};

/** Eşleştiricinin aday taş dizini satırı (kütüphaneden ya da çevrimdışı veriden kurulur). */
export type StoneCandidate = {
  /** Kütüphane slug'ı (uzman yüzeyi) ya da çevrimdışı analizde harici kimlik. İç uuid uzmana GİTMEZ. */
  stoneKey: string;
  nameTr: string;
  nameEn: string | null;
  aliases: readonly string[];
  /** 0 = "bilinmiyor" kabul edilir ve eşleştirmeye girmez. Kütüphanede birden çok değer olabilir. */
  numericalVibration: number | readonly number[] | null;
  /** Anahtar ("venus") ya da ham metin ("Venus & Neptune"); ikisi de çözülür. */
  planets: readonly string[];
  chakras: readonly string[];
  elements: readonly string[];
  /** Birlikte kullanılan taşlar (stoneKey listesi). */
  pairsWith?: readonly string[];
};

export type StoneMatchMethod =
  | "provider_direct"
  | "vibration_exact"
  | "vibration_root"
  | "planet"
  | "pairs_with"
  | "element";

export type StoneSuggestionReason = {
  method: StoneMatchMethod;
  numberKey?: StoneNumberKey;
  numberValue?: number;
  /** Eşleşmenin taş tarafındaki değeri (titreşim sayısı / gezegen anahtarı / eşlikçi taş anahtarı / element anahtarı). */
  matched?: string | number;
  /** Usta sayı ya da bileşik sayı için kullanılan kök (yalnız vibration_root). */
  root?: number;
  rootKind?: "master" | "compound";
  /** Türkçe insan dilinde açıklama (sağlayıcı adı / tıbbi iddia içermez). */
  explanation: string;
};

export type StoneSuggestion = {
  stoneKey: string;
  nameTr: string;
  nameEn: string | null;
  /** En güçlü gerekçenin yöntemi (grup yerleşimi). */
  primary: StoneMatchMethod;
  reasons: StoneSuggestionReason[];
  /** Her öneri sembolik / gelenekseldir; tıbbi değildir. */
  symbolic: true;
};

export type ProviderDirectStatus = "matched" | "ambiguous" | "unmatched" | "text_only";

export type ProviderDirectItem = {
  /** Sağlayıcının verdiği ad (gösterim için; değiştirilmez). */
  input: string;
  status: ProviderDirectStatus;
  stoneKey?: string;
  nameTr?: string;
  /** Belirsizlikte adaylar (otomatik seçim YOK; uzman seçer). */
  candidates?: { stoneKey: string; nameTr: string; nameEn: string | null; via: NameMatchVia }[];
  /** Çözümde kullanılan yol. */
  via?: NameMatchVia;
};

export type NameMatchVia = "name" | "compact" | "alias" | "alt_lang" | "partial" | "variant";

export type StoneMatchGroup = {
  method: StoneMatchMethod;
  label: string;
  description: string;
  items: StoneSuggestion[];
  /** Kesilmeden önceki öğe sayısı. */
  total: number;
};

export type StoneMatchResult = {
  libraryAvailable: boolean;
  providerDirect: ProviderDirectItem[];
  groups: StoneMatchGroup[];
  /** Tüm gruplardan tekilleştirilmiş öneriler (grup sırasıyla). */
  suggestions: StoneSuggestion[];
  notes: string[];
  disclaimer: { symbolic: true; text: string };
};

export type StoneMatchOptions = {
  perGroupCap?: number;
  totalCap?: number;
  /** Element eşleşmesi (varsayılan KAPALI — owner kararı; bkz. docs/numeroloji-klasik/DOGALTAS.md). */
  includeElement?: boolean;
  /** Eşlikçi taşlar (varsayılan AÇIK). */
  includePairs?: boolean;
};
