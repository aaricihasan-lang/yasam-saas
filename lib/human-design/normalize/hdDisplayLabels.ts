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

// 2026-10-17: Türkçe sözlük YALNIZ Türkçe; İngilizce karşılık ayrı tutulur ve hdBilingual ile birleştirilir
// (aynı İngilizce iki kez yazılmaz).
export const HD_NOT_SELF_TR: Readonly<Record<HdTypeCode, string>> = {
  generator: "Hayal kırıklığı",
  // 2026-10-15 owner: temel tema Hayal kırıklığı (Roxy teknik değeri "Frustration" ile aynı);
  // öfkenin eşlik edebileceği yalnız ayrıntılı yorumda anlatılır.
  manifesting_generator: "Hayal kırıklığı",
  manifestor: "Öfke",
  projector: "Kırgınlık",
  reflector: "Düş kırıklığı",
};

/**
 * İngilizce KANONİK karşılıklar — yalnız kayıtta sağlayıcının kanonik değeri (Roxy `strategy` / `signature` /
 * `notSelf`, şemaya göre "Always English") YOKSA (eski dahili motor kayıtları) kullanılan standart Human Design
 * terimleri. Roxy değeri varsa o kullanılır (gerçek veri öncelikli).
 */
export const HD_STRATEGY_EN: Readonly<Record<HdTypeCode, string>> = {
  generator: "Wait to Respond",
  manifesting_generator: "Wait to Respond, then Inform",
  manifestor: "Inform",
  projector: "Wait for the Invitation",
  reflector: "Wait a Lunar Cycle",
};
export const HD_SIGNATURE_EN: Readonly<Record<HdTypeCode, string>> = {
  generator: "Satisfaction",
  manifesting_generator: "Satisfaction",
  manifestor: "Peace",
  projector: "Success",
  reflector: "Surprise",
};
export const HD_NOT_SELF_EN: Readonly<Record<HdTypeCode, string>> = {
  generator: "Frustration",
  manifesting_generator: "Frustration",
  manifestor: "Anger",
  projector: "Bitterness",
  reflector: "Disappointment",
};

const foldTerm = (v: string) => v.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");

/**
 * "Türkçe (English)" — İngilizce yoksa / Türkçeyle aynıysa / Türkçe metin bu İngilizceyi zaten parantezde
 * taşıyorsa yalnız Türkçe (aynı İngilizce iki kez gösterilmez).
 */
export function hdBilingual(tr: string, en: string | null | undefined): string {
  const e = (en ?? "").trim();
  if (!e || foldTerm(e) === foldTerm(tr)) return tr;
  const paren = /\(([^()]*)\)\s*$/.exec(tr);
  if (paren && foldTerm(paren[1]) === foldTerm(e)) return tr;
  return `${tr} (${e})`;
}

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

/** Kavram başlıklarının İngilizce Human Design karşılıkları (uzmanların tanıdığı terim). */
export const HD_TERM_EN = Object.freeze({
  type: "Type",
  strategy: "Strategy",
  authority: "Inner Authority",
  profile: "Profile",
  definition: "Definition",
  signature: "Signature",
  notSelf: "Not-Self Theme",
  cross: "Incarnation Cross",
});

/**
 * 2026-10-17 owner: temel kavram başlıkları Türkçe + parantez içinde İngilizce ("Tip (Type)").
 * Ekran (bilgi bloğu, Sistem Yorumu) ve YENİ Word raporları bunu kullanır; eski rapor snapshot'ları eski
 * başlıklarla basılır (snapshot `termSet` yoksa).
 */
export const HD_TERM_BI = Object.freeze({
  type: `${HD_TERM.type} (${HD_TERM_EN.type})`,
  strategy: `${HD_TERM.strategy} (${HD_TERM_EN.strategy})`,
  authority: `${HD_TERM.authority} (${HD_TERM_EN.authority})`,
  profile: `${HD_TERM.profile} (${HD_TERM_EN.profile})`,
  definition: `${HD_TERM.definition} (${HD_TERM_EN.definition})`,
  signature: `${HD_TERM.signature} (${HD_TERM_EN.signature})`,
  notSelf: `${HD_TERM.notSelf} (${HD_TERM_EN.notSelf})`,
  cross: `Enkarnasyon Haçı (${HD_TERM_EN.cross})`,
});

/** "İmza (Signature)" kavramının kısa açıklaması (uygulama sözlüğü; sağlayıcı metni değildir). */
export const HD_SIGNATURE_HELP =
  "Human Design yaklaşımında, kişinin tipine uygun strateji ve otoriteyle yaşadığında deneyimlediği olumlu durum.";

const PROFILE_LINE_TR = ["", "Araştırmacı", "Münzevi", "Deneyimleyen", "Fırsatçı", "Çözüm Getiren", "Rol Model"] as const;
const PROFILE_LINE_EN = ["", "Investigator", "Hermit", "Martyr", "Opportunist", "Heretic", "Role Model"] as const;

/** "2/4 — Münzevi / Fırsatçı (Hermit / Opportunist)" — profil kodundan (ör. "2_4"); geçersiz → null. */
export function hdProfileBilingual(code: string | null | undefined): string | null {
  const m = /^([1-6])[_/]([1-6])$/.exec(code ?? "");
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return `${a}/${b} — ${PROFILE_LINE_TR[a]} / ${PROFILE_LINE_TR[b]} (${PROFILE_LINE_EN[a]} / ${PROFILE_LINE_EN[b]})`;
}

/** Kayıttaki sağlayıcı KANONİK (İngilizce) değerleri — Roxy: computed_result / provider_raw strategy·signature·notSelf. */
export type HdKeynoteCanonical = { strategy?: unknown; signature?: unknown; notSelf?: unknown } | null | undefined;

/**
 * Tipten deterministik Strateji / İmza / Kendilik Dışı Tema (bilinmeyen tip → null; uydurma yok).
 *   • bilingual: "Türkçe (English)" — Türkçe uygulama sözlüğünden; İngilizce kayıttaki sağlayıcı kanonik
 *     değerinden (yoksa standart HD terimi). false → yalnız Türkçe (eski rapor snapshot'ları için).
 */
export function hdTypeKeynotes(
  typeCode: string | null | undefined,
  opts: { canonical?: HdKeynoteCanonical; bilingual?: boolean } = {},
): { strategy: string; signature: string; notSelf: string } | null {
  if (!typeCode || !(typeCode in HD_STRATEGY_TR)) return null;
  const t = typeCode as HdTypeCode;
  if (opts.bilingual === false) {
    // Eski (tamamlama öncesi) görünüm: Kendilik dışı temada önceki sözlükteki parantezli İngilizce korunur.
    const legacyNotSelf = t === "manifestor" ? HD_NOT_SELF_TR[t] : `${HD_NOT_SELF_TR[t]} (${HD_NOT_SELF_EN[t]})`;
    return { strategy: HD_STRATEGY_TR[t], signature: HD_SIGNATURE_TR[t], notSelf: legacyNotSelf };
  }
  const c = opts.canonical ?? {};
  const en = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);
  return {
    strategy: hdBilingual(HD_STRATEGY_TR[t], en(c.strategy, HD_STRATEGY_EN[t])),
    signature: hdBilingual(HD_SIGNATURE_TR[t], en(c.signature, HD_SIGNATURE_EN[t])),
    notSelf: hdBilingual(HD_NOT_SELF_TR[t], en(c.notSelf, HD_NOT_SELF_EN[t])),
  };
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
