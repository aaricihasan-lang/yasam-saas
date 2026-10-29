// Hazır Eğitim Haritaları — KAYNAKLA DOĞRULANMIŞ aile grupları (owner kararı 29.10.2026).
//
// Yalnız FAZ16 v3 paketinde "tamamlanmis_ciftler" altında DOĞRULANDI olarak kayıtlı ilişkiler (KARSILASTIRMALI-VAKALAR.json).
// Kaynağı doğrulanmamış bağ EKLENMEZ (ör. kraliyet akrabalıkları pakette doğrulanmadı → yok). Eşleme natural_key iledir;
// DB'de ayrı tablo / migration YOK. Üye kayıtta yoksa aile kartı o üyeyi göstermez (uydurma yok).
// Yeni ilişki hesabı (Connection / Penta) YAPILMAZ — bireysel kayıtlı haritalar yan yana gösterilir.

export type EduFamilyMember = { naturalKey: string; role: string };
export type EduFamily = {
  key: string;
  title: string;
  /** Akrabalık bağlantıları — "A → B: ilişki". */
  links: Array<{ from: string; to: string; label: string }>;
  members: EduFamilyMember[];
  /** Doğrulama kaynağı (owner ekranında gösterilir). */
  evidence: string;
};

export const EDU_FAMILIES: readonly EduFamily[] = Object.freeze([
  {
    key: "curie",
    title: "Curie Ailesi",
    members: [
      { naturalKey: "marie-curie-1867-11-07", role: "Anne" },
      { naturalKey: "irene-joliot-curie-1897-09-12", role: "Kız" },
    ],
    links: [{ from: "marie-curie-1867-11-07", to: "irene-joliot-curie-1897-09-12", label: "anne – kız" }],
    evidence: "Irène Joliot-Curie'nin birincil doğum aktesinde yazılı (Paris 13e, akte 2073: \"fille de Pierre Curie … et de Marie Salomé Sklodowska\"); iki kişinin doğum belgesi ve kaynaklı biyografisi doğrulandı.",
  },
  {
    key: "frank",
    title: "Frank Ailesi",
    members: [
      { naturalKey: "otto-frank-1889-05-12", role: "Baba" },
      { naturalKey: "anne-frank-1929-06-12", role: "Kız" },
    ],
    links: [{ from: "otto-frank-1889-05-12", to: "anne-frank-1929-06-12", label: "baba – kız" }],
    evidence: "İki kaynaklı biyografi ilişkiyi olgusal olarak kaydeder; iki gerçek harita ve bağlantı bütünlüğü doğrulandı.",
  },
]);

export function eduFamilyByKey(key: string): EduFamily | null {
  return EDU_FAMILIES.find((f) => f.key === key) ?? null;
}
