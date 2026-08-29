// ─────────────────────────────────────────────────────────────────────────────
// İLİŞKİ SOURCE KATALOGLARI (canonical — Hasan Hoca "kitap 2. seviye" PDF'si)
//
// Yorum METİNLERİ relationshipCatalogs.ts içinde AUTO-GENERATED (birebir kaynak).
// Bu dosya: sabit eşlemeler (hane→alan, üçgen), provenance sayfa haritası ve
// katalog yeniden-ihracı. Serbest/yeni yorum EKLENMEZ.
// ─────────────────────────────────────────────────────────────────────────────

export {
  RUH_DUYGUSU_REL,
  NEDEN_BIR_ARADAYIZ_REL,
  ISIM_SAYISI_REL,
  YASAM_KODU_REL,
  EDINIM_REL,
  DOGUM_GUNU_REL,
  ORTAK_RAKAM_REL,
  DIRECTIONAL_REL,
  HANE_REL,
} from "./relationshipCatalogs";

/** Ruh Duygusu = Sinerji PIN 8. hane (ayrı detaylı katalog, kaynak s.57-58). */
export { RUH_DUYGUSU_REL as SOUL_FEELING_CATALOG } from "./relationshipCatalogs";
/** 9. hane / "Neden Bir Aradayız" = ORTAK 9. HANE kataloğu (kaynak s.66). */
export { NEDEN_BIR_ARADAYIZ_REL as WHY_TOGETHER_CATALOG } from "./relationshipCatalogs";

/** İlişki Üçgeni hane→alan eşlemesi. 4 (Yaşam Döngüsü) ve 5 (Ders) üçgen DIŞINDADIR. */
export const TRIANGLE_FIELD_BY_POSITION: Record<number, string> = {
  1: "Kişilik",
  2: "Sosyal Bilinç",
  3: "Küresel Bilinçlilik",
  6: "İçsel Benlik",
  7: "İçsel Çocuk",
  8: "Ruh Duygusu",
};

/** Tüm Sinerji PIN hanelerinin alan adları (1..9). */
export const HANE_FIELD_BY_POSITION: Record<number, string> = {
  1: "Kişilik",
  2: "Sosyal Bilinç",
  3: "Küresel Bilinçlilik",
  4: "Yaşam Döngüsü",
  5: "Ders",
  6: "İçsel Benlik",
  7: "İçsel Çocuk",
  8: "Ruh Duygusu",
  9: "Neden Bir Aradayız",
};

export const TRIANGLE_POSITIONS: number[] = [1, 2, 3, 6, 7, 8];
export const TRIANGLE_EXCLUDED_POSITIONS: number[] = [4, 5];

export const TRIANGLE_RULE_NOTE =
  "İlişki analizi pin kodundaki 2'ler, ilişki analizi pin kodu üçgeninde (kişilik, sosyal bilinçlilik, küresel bilinçlilik, içsel benlik, içsel çocuk ve ruh duygusu haneleri) bulunuyorsa ilişkiyi daha sevgi dolu ve besleyici bir hale getirir. Bu üçgen, yaşam döngüsü ve ders hanelerini dışarıda bırakır.";

/** Katalog provenance sayfa haritası (kitap 2. seviye). */
export const CATALOG_SOURCE_PAGES: Record<string, string> = {
  ruhDuygusu: "s.57-58",
  nedenBirAradayiz: "s.66 (ORTAK 9. HANE)",
  hane: "s.60-66 (İlişki analizinde çıkan rakamların anlamları)",
  isimSayisi: "s.69-77",
  yasamKodu: "s.78-90",
  edinim: "s.94-101",
  dogumGunu: "s.103-108",
  ortakRakam: "s.150",
  directional: "s.151-160 (X rakamının diğer rakamlarla münasebeti)",
  esUyumu: "s.205-211",
};
