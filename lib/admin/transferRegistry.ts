/**
 * Admin → Uzman Veri Aktarım Merkezi — MERKEZÎ TRANSFER MANİFESTİ.
 *
 * TEK KAYNAK (single source of truth): modül → alt bölüm → transfer grup anahtarı.
 * Hem admin UI (app/admin/veri-paylasimi/page.tsx) hem de sunucu route'u
 * (app/api/admin/veri-paylasimi/transfer/route.ts) bu manifesti referans alır.
 *
 * NEDEN: Eskiden UI checkbox listesi ve server REGISTRY birbirinden bağımsız
 * elle güncelleniyordu; yeni bölüm eklerken iki yerin senkron kalması gerekiyordu.
 * Artık grup anahtar kümesi burada tanımlanır; harness UI ⇄ server drift'ini yakalar.
 *
 * ÖNEMLİ: Bu dosya SALT METADATA'dır — tablo adı, service_role, copyFields gibi
 * sunucu-yetki detayları BURADA YOKTUR (onlar server route'unda kalır). İstemciye
 * sızması sakıncalı hiçbir sır içermez; grup anahtarları zaten API sözleşmesidir.
 */

/** Sunucu route REGISTRY'si ile birebir aynı olması gereken transfer grup anahtarları. */
export type TransferGroupKey =
  | "stones"
  | "minerals"
  | "combinations"
  | "stone_knowledge_articles"
  | "bioenergy_symbols"
  | "bioenergy_imaginations"
  | "bioenergy_chakras"
  | "bioenergy_energy_bodies"
  | "bioenergy_subconscious_causes"
  | "reflexology_protocols"
  | "numerology_knowledge_records"
  | "numerology_stone_assignments"
  | "aromatherapy_oils_essential"
  | "aromatherapy_oils_carrier"
  | "aromatherapy_oils_maceration"
  | "aromatherapy_blends"
  | "healing_guides"
  | "hd_knowledge"
  | "bioenergy_sessions";

/**
 * UI alt bölümü. Bir görünür checkbox → 1+ transfer grup anahtarı.
 * (ör. Numeroloji "Bilgi Bankası" tek kutu → 2 grup anahtarı.)
 */
export type TransferSectionMeta = {
  /** UI kararlılığı için görünür checkbox kimliği (state anahtarı). */
  key: string;
  label: string;
  /** Bu bölüm işaretlenince sunucuya gidecek transfer grup anahtarları. */
  transferKeys: TransferGroupKey[];
  /** false ise UI'da "Yakında" olarak disabled görünür (ör. localStorage-only). */
  active: boolean;
  /**
   * true ise UI "Tümünü aktar / Seçili kayıtları aktar" moduna izin verir
   * (yalnız tek transferKey'li düz tablolarda anlamlı). id filtresi gönderilebilir.
   */
  granular?: boolean;
  /** Disabled bölüm için kullanıcıya gösterilecek gerekçe. */
  pendingNote?: string;
};

export type TransferModuleMeta = {
  key: string;
  label: string;
  sections: TransferSectionMeta[];
};

/**
 * Aktarıma UYGUN modül ağacı. Disabled bölümler (localStorage-only) burada
 * `active:false` ile görünür kalır ama grup anahtarı üretmez.
 */
export const TRANSFER_MODULES: TransferModuleMeta[] = [
  {
    key: "dogaltas",
    label: "Doğaltaş",
    sections: [
      { key: "stones", label: "Doğaltaş Listesi", transferKeys: ["stones"], active: true, granular: true },
      { key: "combinations", label: "Kombinasyonlar", transferKeys: ["combinations"], active: true, granular: true },
      { key: "minerals", label: "Mineral Bankası", transferKeys: ["minerals"], active: true, granular: true },
      {
        key: "stone_knowledge_articles",
        label: "Taş Bilgi Kütüphanesi",
        transferKeys: ["stone_knowledge_articles"],
        active: true,
        granular: true,
      },
    ],
  },
  {
    key: "bioenergy",
    label: "Biyoenerji",
    sections: [
      { key: "bio_symbols", label: "Sembol Dili", transferKeys: ["bioenergy_symbols"], active: true },
      { key: "bio_imag", label: "İmajinasyonlar", transferKeys: ["bioenergy_imaginations"], active: true },
      { key: "bio_chakras", label: "Çakralar", transferKeys: ["bioenergy_chakras"], active: true },
      { key: "bio_bodies", label: "Enerji Bedenleri", transferKeys: ["bioenergy_energy_bodies"], active: true },
      {
        key: "bio_sub",
        label: "Bilinçaltı Sebepleri",
        transferKeys: ["bioenergy_subconscious_causes"],
        active: true,
      },
      {
        key: "bioenergy_sessions",
        label: "Biyoenerji Seansları (teknik/uygulama kütüphanesi)",
        transferKeys: ["bioenergy_sessions"],
        active: true,
      },
    ],
  },
  {
    key: "reflexology",
    label: "Refleksoloji",
    sections: [
      { key: "ref_proto", label: "Protokoller", transferKeys: ["reflexology_protocols"], active: true },
      {
        key: "ref_atlas",
        label: "Atlas",
        transferKeys: [],
        active: false,
        pendingNote: "Atlas verisi şu an tarayıcıda (localStorage) — merkezi DB kaydı yok",
      },
      {
        key: "ref_notes",
        label: "Notlar",
        transferKeys: [],
        active: false,
        pendingNote: "Klinik notlar şu an tarayıcıda (localStorage) — merkezi DB kaydı yok",
      },
    ],
  },
  {
    key: "numerology",
    label: "Numeroloji",
    sections: [
      {
        key: "num_bank",
        label: "Bilgi Bankası",
        transferKeys: ["numerology_knowledge_records", "numerology_stone_assignments"],
        active: true,
      },
    ],
  },
  {
    key: "aromatherapy",
    label: "Aromaterapi",
    sections: [
      {
        key: "aromatherapy_oils_essential",
        label: "Uçucu Yağlar",
        transferKeys: ["aromatherapy_oils_essential"],
        active: true,
        granular: true,
      },
      {
        key: "aromatherapy_oils_carrier",
        label: "Sabit Yağlar",
        transferKeys: ["aromatherapy_oils_carrier"],
        active: true,
        granular: true,
      },
      {
        key: "aromatherapy_oils_maceration",
        label: "Maserasyon Yağları",
        transferKeys: ["aromatherapy_oils_maceration"],
        active: true,
        granular: true,
      },
      {
        key: "aromatherapy_blends",
        label: "Blend / Formüller",
        transferKeys: ["aromatherapy_blends"],
        active: true,
      },
    ],
  },
  {
    key: "sifa_rehberi",
    label: "Şifa Rehberi",
    sections: [
      {
        key: "healing_guides",
        label: "Rehberler (bölümleriyle birlikte)",
        transferKeys: ["healing_guides"],
        active: true,
      },
    ],
  },
  {
    key: "human_design",
    label: "Human Design",
    sections: [
      {
        // human_design_knowledge_records + child human_design_knowledge_sources
        // (Tipler/Otoriteler/Kapılar/Kanallar dahil tüm HD bilgi bankası kategorileri).
        key: "hd_knowledge",
        label: "Bilgi Bankası (Tipler · Otoriteler · Kapılar · Kanallar)",
        transferKeys: ["hd_knowledge"],
        active: true,
      },
    ],
  },
];

/** Tüm aktif transfer grup anahtarları (server REGISTRY ile eşleşmeli). */
export const ALL_ACTIVE_GROUP_KEYS: TransferGroupKey[] = TRANSFER_MODULES.flatMap((m) =>
  m.sections.filter((s) => s.active).flatMap((s) => s.transferKeys),
);

/** Grup anahtarı → "Modül / Bölüm" görünür etiket (sonuç raporu için). */
export const GROUP_KEY_LABELS: Record<TransferGroupKey, string> = (() => {
  const map = {} as Record<TransferGroupKey, string>;
  for (const mod of TRANSFER_MODULES) {
    for (const sec of mod.sections) {
      for (const key of sec.transferKeys) {
        map[key] = `${mod.label} / ${sec.label}`;
      }
    }
  }
  return map;
})();

export function groupLabel(key: TransferGroupKey): string {
  return GROUP_KEY_LABELS[key] ?? key;
}

/** UI'da granular (kayıt-seçmeli) modu destekleyen grup anahtarları. */
export const GRANULAR_GROUP_KEYS: TransferGroupKey[] = TRANSFER_MODULES.flatMap((m) =>
  m.sections
    .filter((s) => s.active && s.granular && s.transferKeys.length === 1)
    .map((s) => s.transferKeys[0]),
);

/** İşaretli UI bölüm anahtarlarından etkin transfer grup anahtarlarını toplar. */
export function collectActiveTransferGroups(
  checked: Record<string, boolean>,
): TransferGroupKey[] {
  const keys: TransferGroupKey[] = [];
  for (const mod of TRANSFER_MODULES) {
    for (const sec of mod.sections) {
      if (!sec.active || sec.transferKeys.length === 0) continue;
      if (!checked[sec.key]) continue;
      keys.push(...sec.transferKeys);
    }
  }
  return keys;
}
