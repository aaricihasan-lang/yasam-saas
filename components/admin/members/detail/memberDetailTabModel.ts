/**
 * Üye Detayı — beş sekme ve adres (#hash) eşlemesi. Yalnız gezinme; veri / yetki kararı içermez.
 * V3 (Owner onaylı sıra): Hesap ve Güvenlik · Özet · Modüller ve Kredi · Üyelik ve Ödeme · Geçmiş. İlk sekme açılış sekmesidir.
 * Eski bölüm bağlantıları (#uye-ozet, #uye-ticari, #uye-kullanim, #uye-erisim, #uye-guvenlik, #uye-gecmis)
 * başka ekranlardan (ör. HD eğitim yönetimi → "Modül İzinleri'nde değiştir") gelir; ilgili sekmeye çevrilir.
 */
export type MemberDetailTab = "hesap" | "ozet" | "moduller" | "uyelik" | "gecmis";

export const MEMBER_DETAIL_TABS: readonly { id: MemberDetailTab; label: string }[] = [
  { id: "hesap", label: "Hesap ve Güvenlik" },
  { id: "ozet", label: "Özet" },
  { id: "moduller", label: "Modüller ve Kredi" },
  { id: "uyelik", label: "Üyelik ve Ödeme" },
  { id: "gecmis", label: "Geçmiş" },
];

/** Sayfa adressiz açıldığında seçili sekme (sıradaki ilk sekme). */
export const DEFAULT_MEMBER_DETAIL_TAB: MemberDetailTab = MEMBER_DETAIL_TABS[0].id;

const TAB_IDS = new Set<string>(MEMBER_DETAIL_TABS.map((t) => t.id));

/** Kaldırılan sekme adresi → yeni sekme (kaydırılacak bölüm yok). V2 "Gelişmiş" içeriği "Hesap ve Güvenlik"e taşındı. */
export const REMOVED_TAB_REDIRECT: Readonly<Record<string, MemberDetailTab>> = {
  gelismis: "hesap",
};

/** Eski bölüm kimliği → sekme. Bölüm kimlikleri sayfada korunur (sekme açıldıktan sonra bölüme kaydırılır). */
export const LEGACY_SECTION_TAB: Readonly<Record<string, MemberDetailTab>> = {
  "uye-ozet": "ozet",
  "uye-kullanim": "ozet",
  "uye-ticari": "uyelik",
  "uye-erisim": "moduller",
  "uye-guvenlik": "gecmis",
  "uye-gecmis": "gecmis",
};

/** Adresteki #parça → { sekme, kaydırılacak bölüm }. Tanınmayan değer → null (varsayılan sekme kalır). */
export function memberDetailTabFromHash(hash: string | null | undefined): { tab: MemberDetailTab; anchor: string | null } | null {
  const raw = String(hash ?? "").replace(/^#/, "").trim();
  if (!raw) return null;
  if (TAB_IDS.has(raw)) return { tab: raw as MemberDetailTab, anchor: null };
  if (Object.prototype.hasOwnProperty.call(REMOVED_TAB_REDIRECT, raw)) return { tab: REMOVED_TAB_REDIRECT[raw], anchor: null };
  const legacy = Object.prototype.hasOwnProperty.call(LEGACY_SECTION_TAB, raw) ? LEGACY_SECTION_TAB[raw] : undefined;
  return legacy ? { tab: legacy, anchor: raw } : null;
}
