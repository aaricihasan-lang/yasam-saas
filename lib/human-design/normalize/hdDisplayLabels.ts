// HD — hesaplanmış harita için Türkçe GÖRÜNTÜ etiketleri (SAF, uygulama sözlüğü).
//
// Bu dosya sağlayıcı (RoxyAPI) açıklama metni İÇERMEZ ve kopyalamaz. Yalnız tipten
// deterministik olarak bilinen kısa HD anahtar kavramlarının (Strateji / İmza / Benlik-dışı
// tema) Yaşam Sistemi Türkçe etiketleridir. Sağlayıcının ham değeri ayrıca, açıkça
// "sağlayıcı değeri" olarak gösterilir.

import type { HdTypeCode } from "../types";

export const HD_STRATEGY_TR: Readonly<Record<HdTypeCode, string>> = {
  generator: "Yanıt vermek için beklemek",
  manifesting_generator: "Yanıt vermek için beklemek, sonra bilgilendirmek",
  manifestor: "Harekete geçmeden önce bilgilendirmek",
  projector: "Davet beklemek",
  reflector: "Bir ay döngüsünü (~28 gün) beklemek",
};

export const HD_SIGNATURE_TR: Readonly<Record<HdTypeCode, string>> = {
  generator: "Tatmin",
  manifesting_generator: "Tatmin",
  manifestor: "Huzur",
  projector: "Başarı",
  reflector: "Hayret",
};

export const HD_NOT_SELF_TR: Readonly<Record<HdTypeCode, string>> = {
  generator: "Hayal kırıklığı (Frustration)",
  // 2026-10-15 owner: temel tema Hayal kırıklığı (Roxy teknik değeri "Frustration" ile aynı);
  // öfkenin eşlik edebileceği yalnız ayrıntılı yorumda anlatılır.
  manifesting_generator: "Hayal kırıklığı (Frustration)",
  manifestor: "Öfke",
  projector: "Kırgınlık (Bitterness)",
  reflector: "Düş kırıklığı (Disappointment)",
};

/**
 * HD-23 — Görünen HD kavram BAŞLIKLARI (tek kaynak: ekran, Word, Sistem Yorumu). Teknik anahtarlar
 * (type_code, notSelf, …) değişmez; yalnız kullanıcıya görünen ad buradan gelir.
 */
export const HD_TERM = Object.freeze({
  type: "Tip",
  strategy: "Strateji",
  authority: "İç Otorite",
  profile: "Profil",
  definition: "Tanım",
  signature: "İmza",
  notSelf: "Kendilik Dışı Tema",
  notSelfQuestion: "Kendilik dışı sorusu",
});

/** Tipten deterministik Strateji / İmza / Kendilik Dışı Tema (bilinmeyen tip → null; uydurma yok). */
export function hdTypeKeynotes(typeCode: string | null | undefined): { strategy: string; signature: string; notSelf: string } | null {
  if (!typeCode || !(typeCode in HD_STRATEGY_TR)) return null;
  const t = typeCode as HdTypeCode;
  return { strategy: HD_STRATEGY_TR[t], signature: HD_SIGNATURE_TR[t], notSelf: HD_NOT_SELF_TR[t] };
}

// ── HD-05: sağlayıcı (Roxy lang=tr) metnindeki uygunsuz profil çizgisi adları ─────────────────
// Roxy'nin makine çevirisi 3. çizgiyi (Martyr) "Şehit", 5. çizgiyi (Heretic) "Kâfir"/"Sapkın" olarak
// basıyor. Uygulama sözlüğü (constants HUMAN_DESIGN_PROFILES): 3 = "Deneyimleyen", 5 = "Çözüm Getiren".
// Yalnız GÖRÜNEN metin düzeltilir; kayıtlı provider_raw ve hesap verisi DEĞİŞMEZ. Türkçe ekler korunur
// (Şehidin → Deneyimleyenin, Kâfire → Çözüm Getirene); ek ünlüleri ince ünlüye uyumlanır.
const PROVIDER_TERM_FIXES: ReadonlyArray<{ re: RegExp; to: string }> = [
  { re: /(?<!\p{L})([ŞşSs]ehi[tdTD])(\p{L}*)/gu, to: "Deneyimleyen" },
  { re: /(?<!\p{L})([Kk][âaÂA]fi[rR])(\p{L}*)/gu, to: "Çözüm Getiren" },
  { re: /(?<!\p{L})([Ss]apk[ıi][nN])(\p{L}*)/gu, to: "Çözüm Getiren" },
];
const FRONT_VOWEL: Readonly<Record<string, string>> = { ı: "i", a: "e", u: "ü", o: "ö", I: "İ", A: "E", U: "Ü", O: "Ö" };

function fixSuffix(suffix: string): string {
  // Şehit+te/ten → (n ile biten yeni kök) de/den; ünsüz sertleşmesi ve kalın ünlüler uyumlanır.
  return suffix.replace(/^t(?=e|i)/, "d").replace(/[ıauoIAUO]/g, (c) => FRONT_VOWEL[c] ?? c);
}

/** Sağlayıcı Türkçe metnindeki uygunsuz terimleri uygulama sözlüğüne çevirir (idempotent). */
export function normalizeProviderTrText(text: string): string;
export function normalizeProviderTrText(text: string | null): string | null;
export function normalizeProviderTrText(text: string | null): string | null {
  if (!text) return text;
  let out = text;
  for (const { re, to } of PROVIDER_TERM_FIXES) {
    out = out.replace(re, (_m, stem: string, suffix: string) => {
      const lower = stem[0] === stem[0].toLowerCase() && stem[0] !== stem[0].toUpperCase();
      const base = lower ? to.toLocaleLowerCase("tr-TR") : to;
      return base + fixSuffix(suffix);
    });
  }
  return out;
}

const ANGLE_TR: Readonly<Record<string, string>> = {
  rightangle: "Sağ Açı (Right Angle)",
  leftangle: "Sol Açı (Left Angle)",
  juxtaposition: "Yan Yana (Juxtaposition)",
};

/** Enkarnasyon bölüm başlığı (2026-10-10 owner kararı: görünen Türkçe başlıkta "Haç" yok). */
export const HD_CROSS_SECTION_TITLE = "Enkarnasyon Teması (Yaşam Amacı)";

export function hdCrossAngleLabel(angle: string | null | undefined): string {
  if (!angle) return "—";
  return ANGLE_TR[angle.toLowerCase().replace(/[\s_\-]+/g, "")] ?? angle;
}
