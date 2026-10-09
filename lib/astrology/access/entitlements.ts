// Astroloji — YETKİ modeli (SAF; istemci ve sunucu aynı kararı kullanabilir).
//
//   astrology                 → modül (rota/profiller + Hesap Motoru + kendi Bilgi Bankası)
//   astrology_provider_interp → "Roxy Otomatik Yorum" alt-yetkisi (sağlayıcı yorum katmanı)
//   (engine / knowledgeBank ayrı bayrak DEĞİLDİR: modülle birlikte gelir — Aşama 7C ürün kararı.)
//
// AŞAMA 7C: bayraklar mevcut yetki sisteminden okunur (users.module_permissions; Admin > Üye
// Yönetimi). Kurallar:
//   • Owner (users.is_super_admin + admin + aktif + demo değil) → hepsi açık.
//   • Owner OLMAYAN admin → hepsi KAPALI (owner kuralı 2026-10-07 korunur; çağıran kapı ayrıca 404 döner).
//   • Uzman: astrology === true → modül; astrology_provider_interp === true YALNIZ modül de açıksa yorum.
//   • Bayrak yalnız boolean `true` sayılır (string/sayı/iç içe nesne → kapalı; fail-closed).

export const ASTROLOGY_PERMISSION_KEYS = ["astrology", "astrology_provider_interp"] as const;

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
  /** Sunucuda doğrulanmış owner (is_super_admin + admin + aktif + demo değil). */
  isOwner: boolean;
  /** Sunucuda doğrulanmış kullanıcının rolü (owner olmayan admin bayraktan bağımsız kapalıdır). */
  role?: string | null;
  /** users.module_permissions (sunucuda DB'den okunmuş; istemci beyanı DEĞİL). */
  flags?: Record<string, unknown> | null;
};

export function resolveAstrologyEntitlements(subject: AstrologySubject): AstrologyEntitlements {
  if (subject.isOwner === true) return { module: true, engine: true, knowledgeBank: true, providerInterpretations: true };
  // Owner olmayan admin: admin'in genel modül muafiyeti Astroloji'de UYGULANMAZ (owner kuralı).
  if (String(subject.role ?? "").trim().toLowerCase() !== "expert") return { ...NO_ASTROLOGY_ENTITLEMENTS };
  const f = subject.flags && typeof subject.flags === "object" && !Array.isArray(subject.flags) ? subject.flags : null;
  if (!f || f.astrology !== true) return { ...NO_ASTROLOGY_ENTITLEMENTS };
  return { module: true, engine: true, knowledgeBank: true, providerInterpretations: f.astrology_provider_interp === true };
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
