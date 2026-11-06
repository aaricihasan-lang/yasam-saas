// Gökyüzü Atlası — PROFESYONEL EFEMERİS: ΔT erişimi (SAF). AŞAMA 2 (ortak zaman standardı, PR #647): ΔT tablosu ortak katmana
// TAŞINDI (lib/astrology/time/deltaT.ts — değerler DEĞİŞMEDİ). Bu dosya yalnız mevcut adları korur.
// Not: TT artık `lib/astrology/time/scales.ts` ile kurulur (1961–2027-06-28 artık saniye tablosundan kesin; tablo yalnız 1961
// öncesi ve 2027-06-28 sonrası). Global `SetDeltaTFunction` DEĞİŞTİRİLMEZ.

export {
  DELTA_T_FIRST_YEAR,
  DELTA_T_LAST_YEAR,
  DELTA_T_LAST_OBSERVED_YEAR,
  DELTA_T_TABLE_LENGTH,
  deltaTModelSeconds as deltaTSeconds,
  deltaTClassOf as deltaTClass,
  type DeltaTClass,
} from "../../time/deltaT";
