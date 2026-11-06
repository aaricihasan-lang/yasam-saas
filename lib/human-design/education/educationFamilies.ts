// Hazır Eğitim Haritaları — KAYNAKLA DOĞRULANMIŞ aile grupları (owner kararı 29.10.2026).
//
// FAZ16 v3 paketinde "tamamlanmis_ciftler" altında DOĞRULANDI olarak kayıtlı ilişkiler (KARSILASTIRMALI-VAKALAR.json) +
// 30.10.2026 araştırması: aynı ölçütle (iki kişinin kaynaklı biyografisi ilişkiyi olgusal olarak kaydeder) doğrulanan
// II. Elizabeth – Prenses Margaret kardeşliği. Tek taraflı / kaynaksız bağ EKLENMEZ (ör. Victoria → II. Elizabeth yalnız tek
// biyografide → yok). Eşleme natural_key iledir;
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
  {
    key: "kraliyet-kardesler",
    title: "Kraliyet Ailesi · Kız Kardeşler",
    members: [
      { naturalKey: "kralice-ii-elizabeth-1926-04-21", role: "Abla" },
      { naturalKey: "prenses-margaret-snowdon-kontesi-1930-08-21", role: "Kız kardeş" },
    ],
    links: [{ from: "kralice-ii-elizabeth-1926-04-21", to: "prenses-margaret-snowdon-kontesi-1930-08-21", label: "abla – kız kardeş" }],
    evidence: "İki kaynaklı biyografi ilişkiyi olgusal olarak kaydeder: II. Elizabeth (\"Kız kardeşi Margaret 1930'da doğdu\" — The Royal Family, royal.uk resmî site) ve Prenses Margaret (\"Kraliçe II. Elizabeth'in tek kardeşi\"; \"ablasıyla birlikte evde … öğrenim gördü\" — Encyclopaedia Britannica; Westminster Abbey); iki gerçek harita kayıtlı.",
  },
]);

export function eduFamilyByKey(key: string): EduFamily | null {
  return EDU_FAMILIES.find((f) => f.key === key) ?? null;
}

/** Eğitmen kataloğundaki aile kartı (yalnız kimlik + rol + görünen ad; natural_key ve doğrulama metni taşınmaz). */
export type EduVisibleFamily = {
  key: string;
  title: string;
  members: Array<{ id: string; role: string; displayName: string }>;
  links: Array<{ from: string; to: string; label: string }>;
};

/**
 * EĞİTMEN: aile kartı YALNIZ ailenin TÜM üyeleri okuma anında yayımlı ve görünürse döner (owner kararı 30.10.2026).
 * Bir üye hukuki / teknik nedenle yayımlı değilse aile hiç gösterilmez → eksik üyenin kimliği, varlığı ve aile mevcudu sızmaz.
 * `rows` yalnız yayımlı + uygun kayıtlardan (listPublishedCatalog) gelmelidir.
 */
export function visibleFamilies(rows: ReadonlyArray<{ id: string; naturalKey: string; displayName: string }>): EduVisibleFamily[] {
  const byKey = new Map(rows.map((r) => [r.naturalKey, r]));
  return EDU_FAMILIES.flatMap((f) => {
    const members = f.members.map((m) => { const r = byKey.get(m.naturalKey); return r ? { id: r.id, role: m.role, displayName: r.displayName } : null; });
    if (members.length < 2 || members.some((m) => m === null)) return [];
    const idOf = new Map(f.members.map((m) => [m.naturalKey, byKey.get(m.naturalKey)!.id]));
    return [{
      key: f.key, title: f.title,
      members: members as Array<{ id: string; role: string; displayName: string }>,
      links: f.links.map((l) => ({ from: idOf.get(l.from)!, to: idOf.get(l.to)!, label: l.label })),
    }];
  });
}
