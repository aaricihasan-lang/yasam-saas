// Astroloji — DÖRT AYRI YETKİ modeli (SAF; istemci ve sunucu aynı kararı kullanabilir).
//
//   astrology                 → modül (menü/rota/profiller)
//   astrology_engine          → Hesap Motoru (hesap çalıştırma + teknik sonuç)
//   astrology_kb              → kendi Bilgi Bankası (Aşama 2)
//   astrology_provider_interp → "Roxy Otomatik Yorumları" (sağlayıcı yorum katmanı)
//
// AŞAMA 1 KURALI: Yetkiler module_permissions'ta TANIMLI DEĞİLDİR ve Üye Yönetimi'nde
// verilemez. Tek kaynak OWNER kapısıdır: owner → dördü de açık; owner olmayan → hepsi kapalı
// (zaten owner olmayan modüle hiç ulaşamaz: 404/notFound). Aşama 7'de bayraklar
// module_permissions'tan okunacak; bu fonksiyonun imzası o geçişe hazırdır.
//
// Bayraklar DÜZ boolean'dır (moduleAccessCore.toFlags iç içe JSON'u düşürür).

export const ASTROLOGY_PERMISSION_KEYS = [
  "astrology",
  "astrology_engine",
  "astrology_kb",
  "astrology_provider_interp",
] as const;

export type AstrologyPermissionKey = (typeof ASTROLOGY_PERMISSION_KEYS)[number];

export type AstrologyEntitlements = {
  module: boolean;
  engine: boolean;
  knowledgeBank: boolean;
  providerInterpretations: boolean;
};

export const NO_ASTROLOGY_ENTITLEMENTS: Readonly<AstrologyEntitlements> = Object.freeze({
  module: false,
  engine: false,
  knowledgeBank: false,
  providerInterpretations: false,
});

export type AstrologySubject = {
  /** Sunucuda doğrulanmış owner (is_super_admin + admin + aktif). */
  isOwner: boolean;
  /** Gelecek (Aşama 7): users.module_permissions düz bayrakları. Aşama 1'de YOK SAYILIR. */
  flags?: Record<string, unknown> | null;
};

export function resolveAstrologyEntitlements(subject: AstrologySubject): AstrologyEntitlements {
  if (subject.isOwner !== true) return { ...NO_ASTROLOGY_ENTITLEMENTS };
  // Aşama 1: owner için dört yetki de açık; bayraklar bilinçli olarak okunmaz.
  return { module: true, engine: true, knowledgeBank: true, providerInterpretations: true };
}

/**
 * Sağlayıcı yorumu bu yanıtta servis edilecek mi?
 *   • Yetki yoksa → HAYIR (yanıtta içerik hiç bulunmaz; DB'den okunmaz bile).
 *   • Owner önizlemesi "Roxy Yorumu Kapalıymış Gibi Gör" açıksa → HAYIR (aynı sunucu yolu).
 */
export type InterpretationVisibility =
  | { visible: true }
  | { visible: false; reason: "not_entitled" | "owner_preview_hidden" };

export function resolveInterpretationVisibility(
  ent: AstrologyEntitlements,
  ownerPreviewHideInterp: boolean,
): InterpretationVisibility {
  if (!ent.providerInterpretations) return { visible: false, reason: "not_entitled" };
  if (ownerPreviewHideInterp) return { visible: false, reason: "owner_preview_hidden" };
  return { visible: true };
}

/** Sorgu parametresinden owner önizleme bayrağı (yalnız tam "1"). */
export function parseOwnerPreviewHideInterp(value: string | null | undefined): boolean {
  return value === "1";
}
