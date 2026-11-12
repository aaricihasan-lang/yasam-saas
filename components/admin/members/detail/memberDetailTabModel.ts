/**
 * Üye Detayı V2 — beş sekme ve adres (#hash) eşlemesi. Yalnız gezinme; veri / yetki kararı içermez.
 * Eski bölüm bağlantıları (#uye-ozet, #uye-ticari, #uye-kullanim, #uye-erisim, #uye-guvenlik, #uye-gecmis)
 * başka ekranlardan (ör. HD eğitim yönetimi → "Modül İzinleri'nde değiştir") gelir; ilgili sekmeye çevrilir.
 */
export type MemberDetailTab = "ozet" | "uyelik" | "moduller" | "gecmis" | "gelismis";

export const MEMBER_DETAIL_TABS: readonly { id: MemberDetailTab; label: string }[] = [
  { id: "ozet", label: "Özet" },
  { id: "uyelik", label: "Üyelik ve Ödeme" },
  { id: "moduller", label: "Modüller ve Kredi" },
  { id: "gecmis", label: "Geçmiş" },
  { id: "gelismis", label: "Gelişmiş" },
];

const TAB_IDS = new Set<string>(MEMBER_DETAIL_TABS.map((t) => t.id));

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
  const legacy = LEGACY_SECTION_TAB[raw];
  return legacy ? { tab: legacy, anchor: raw } : null;
}
