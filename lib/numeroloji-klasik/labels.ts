/**
 * Klasik Numeroloji — Türkçe etiketler (uzmana görünen metin; sağlayıcı adı YOK).
 */
import type { ClassicEndpointId } from "./endpoints";
import type { BusinessRating, CompoundNature, NumberKind, NumberMethod, VerificationStatus } from "./model";

export const METHOD_LABELS: Readonly<Record<NumberMethod, string>> = Object.freeze({
  pythagorean: "Pisagor (Batı)",
  chaldean: "Kalde (Cheiro)",
});

export const INTERPRETATION_HEADING = "Klasik ekol yorumu";

export const ENDPOINT_LABELS: Readonly<Record<ClassicEndpointId, string>> = Object.freeze({
  chart: "Tam Numeroloji Haritası",
  life_path: "Yaşam Yolu",
  expression: "İfade (Kader) Sayısı",
  soul_urge: "Ruh Güdüsü (Kalp Arzusu)",
  personality: "Kişilik Sayısı",
  birth_day: "Doğum Günü Sayısı",
  maturity: "Olgunluk (Gerçekleşme) Sayısı",
  bridge: "Köprü Sayıları",
  karmic_lessons: "Karmik Dersler",
  karmic_debt: "Karmik Borç",
  personal_day: "Kişisel Gün",
  personal_month: "Kişisel Ay",
  personal_year: "Kişisel Yıl",
  compatibility: "Numerolojik Uyum",
  meanings: "Sayı Anlamı",
  daily: "Günün Sayısı",
  chaldean: "Kalde İsim Analizi",
  compound_number: "Bileşik Sayı",
  dual: "İki Sistem Karşılaştırması",
  business_name: "İşletme Adı Analizi",
});

export const CORE_NUMBER_LABELS = Object.freeze({
  lifePath: "Yaşam Yolu",
  expression: "İfade",
  soulUrge: "Ruh Güdüsü",
  personality: "Kişilik",
  birthDay: "Doğum Günü",
  maturity: "Olgunluk",
  destiny: "Kader (İsim) Sayısı",
  hiddenPassion: "Gizli Tutku",
  subconsciousSelf: "Bilinçaltı Benlik",
  cornerstone: "Köşe Taşı",
  capstone: "Tepe Taşı",
  firstVowel: "İlk Sesli Harf",
  pinnacles: "Zirveler",
  challenges: "Zorluklar",
  luckyAssociations: "Uğurlu İlişkiler",
  birthDayProfile: "Doğum Günü Profili",
  maturityStatus: "Olgunluk Durumu",
} as const);

export const BRIDGE_LABELS = Object.freeze({
  lifePathExpression: "Yaşam Yolu ↔ İfade",
  expressionSoulUrge: "İfade ↔ Ruh Güdüsü",
  soulUrgePersonality: "Ruh Güdüsü ↔ Kişilik",
  expressionPersonality: "İfade ↔ Kişilik",
} as const);

export const NUMBER_KIND_LABELS: Readonly<Record<NumberKind, string>> = Object.freeze({
  single: "Tek hane",
  master: "Usta sayı",
  compound: "Bileşik sayı",
});

export const KARMIC_DEBT_LABEL = "Karmik borç";

export const COMPOUND_NATURE_LABELS: Readonly<Record<CompoundNature, string>> = Object.freeze({
  fortunate: "Uğurlu",
  unfortunate: "Uğursuz",
  mixed: "Karışık",
});

export const BUSINESS_RATING_LABELS: Readonly<Record<BusinessRating, string>> = Object.freeze({
  excellent: "Mükemmel",
  good: "İyi",
  caution: "Dikkat",
  avoid: "Kaçınılmalı",
});

export const VERIFICATION_LABELS: Readonly<Record<VerificationStatus, string>> = Object.freeze({
  match: "Bağımsız hesapla doğrulandı",
  mismatch: "Bağımsız hesapla uyuşmuyor",
  unverified: "Doğrulanmadı",
});

export const MEANING_FIELD_LABELS = Object.freeze({
  title: "Başlık",
  keywords: "Anahtar kelimeler",
  description: "Açıklama",
  strengths: "Güçlü yönler",
  challenges: "Zorlayıcı yönler",
  career: "Kariyer",
  relationships: "İlişkiler",
  spirituality: "Ruhsallık",
} as const);
