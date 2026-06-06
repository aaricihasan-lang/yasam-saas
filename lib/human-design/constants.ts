export const HUMAN_DESIGN_TYPES = [
  { code: "generator",             label: "Generator" },
  { code: "manifesting_generator", label: "Manifesting Generator" },
  { code: "projector",             label: "Projector" },
  { code: "manifestor",            label: "Manifestor" },
  { code: "reflector",             label: "Reflector" },
] as const;

export const HUMAN_DESIGN_AUTHORITIES = [
  { code: "sacral",               label: "Sacral Otorite" },
  { code: "emotional",            label: "Emotional / Solar Plexus" },
  { code: "splenic",              label: "Splenic (Dalak)" },
  { code: "ego_heart",            label: "Ego / Heart" },
  { code: "self_projected",       label: "Self-Projected" },
  { code: "mental_environmental", label: "Mental / Environmental" },
  { code: "lunar",                label: "Lunar (Ay)" },
] as const;

export const HUMAN_DESIGN_PROFILES = [
  { code: "1_3", label: "1/3 — Araştırmacı / Şehit" },
  { code: "1_4", label: "1/4 — Araştırmacı / Fırsatçı" },
  { code: "2_4", label: "2/4 — Münzevi / Fırsatçı" },
  { code: "2_5", label: "2/5 — Münzevi / Sapkın" },
  { code: "3_5", label: "3/5 — Şehit / Sapkın" },
  { code: "3_6", label: "3/6 — Şehit / Rol Model" },
  { code: "4_6", label: "4/6 — Fırsatçı / Rol Model" },
  { code: "4_1", label: "4/1 — Fırsatçı / Araştırmacı" },
  { code: "5_1", label: "5/1 — Sapkın / Araştırmacı" },
  { code: "5_2", label: "5/2 — Sapkın / Münzevi" },
  { code: "6_2", label: "6/2 — Rol Model / Münzevi" },
  { code: "6_3", label: "6/3 — Rol Model / Şehit" },
] as const;

export const HUMAN_DESIGN_DEFINITIONS = [
  { code: "single",          label: "Tekli Tanım" },
  { code: "split",           label: "İkili Tanım (Split)" },
  { code: "triple_split",    label: "Üçlü Tanım (Triple Split)" },
  { code: "quadruple_split", label: "Dörtlü Tanım (Quadruple Split)" },
] as const;

export const HUMAN_DESIGN_CENTERS = [
  { code: "head",        label: "Head / Baş Merkezi" },
  { code: "ajna",        label: "Ajna Merkezi" },
  { code: "throat",      label: "Throat / Boğaz Merkezi" },
  { code: "g_identity",  label: "G / Kimlik Merkezi" },
  { code: "heart_ego",   label: "Heart / Ego Merkezi" },
  { code: "solar_plexus",label: "Solar Plexus Merkezi" },
  { code: "sacral",      label: "Sacral Merkezi" },
  { code: "spleen",      label: "Spleen / Dalak Merkezi" },
  { code: "root",        label: "Root / Kök Merkezi" },
] as const;

export const HUMAN_DESIGN_GATES = Array.from({ length: 64 }, (_, i) => ({
  code: i + 1,
  label: `${i + 1}. Kapı`,
})) satisfies { code: number; label: string }[];

export const HUMAN_DESIGN_CHANNELS = [
  { code: "1-8",   label: "1-8 İlham Kanalı" },
  { code: "2-14",  label: "2-14 Ritim Kanalı" },
  { code: "3-60",  label: "3-60 Mutasyon Kanalı" },
  { code: "4-63",  label: "4-63 Mantık Kanalı" },
  { code: "5-15",  label: "5-15 Ritim Kanalı" },
  { code: "6-59",  label: "6-59 Seks Kanalı" },
  { code: "7-31",  label: "7-31 Alfa Kanalı" },
  { code: "9-52",  label: "9-52 Konsantrasyon Kanalı" },
  { code: "10-20", label: "10-20 Uyanma Kanalı" },
  { code: "10-34", label: "10-34 Keşif Kanalı" },
  { code: "10-57", label: "10-57 Mükemmel Form Kanalı" },
  { code: "11-56", label: "11-56 Merak Kanalı" },
  { code: "12-22", label: "12-22 Açıklık Kanalı" },
  { code: "13-33", label: "13-33 Gezgin Kanalı" },
  { code: "16-48", label: "16-48 Dalga Boyu Kanalı" },
  { code: "17-62", label: "17-62 Kabul Kanalı" },
  { code: "18-58", label: "18-58 Yargı Kanalı" },
  { code: "19-49", label: "19-49 Sentez Kanalı" },
  { code: "20-34", label: "20-34 Meşguliyet Kanalı" },
  { code: "20-57", label: "20-57 Beyin Dalgası Kanalı" },
  { code: "21-45", label: "21-45 Para Hattı Kanalı" },
  { code: "23-43", label: "23-43 Yapılanma Kanalı" },
  { code: "24-61", label: "24-61 Farkındalık Kanalı" },
  { code: "25-51", label: "25-51 İnisiyasyon Kanalı" },
  { code: "26-44", label: "26-44 Teslimiyet Kanalı" },
  { code: "27-50", label: "27-50 Koruma Kanalı" },
  { code: "28-38", label: "28-38 Mücadele Kanalı" },
  { code: "29-46", label: "29-46 Keşif Kanalı" },
  { code: "30-41", label: "30-41 Tanınma Kanalı" },
  { code: "32-54", label: "32-54 Dönüşüm Kanalı" },
  { code: "34-57", label: "34-57 Güç Kanalı" },
  { code: "35-36", label: "35-36 Geçicilik Kanalı" },
  { code: "37-40", label: "37-40 Topluluk Kanalı" },
  { code: "39-55", label: "39-55 Duygu Kanalı" },
  { code: "42-53", label: "42-53 Olgunlaşma Kanalı" },
  { code: "47-64", label: "47-64 Soyutlama Kanalı" },
] as const;

export const HD_KNOWLEDGE_CATEGORIES = [
  "Tipler",
  "Otoriteler",
  "Profiller",
  "Tanımlar",
  "Merkezler",
  "Kanallar",
  "Kapılar",
  "Stratejiler",
  "Genel Notlar",
] as const;

export type HdKnowledgeCategory = (typeof HD_KNOWLEDGE_CATEGORIES)[number];

export const HD_KNOWLEDGE_CATEGORY_PREFIX: Record<HdKnowledgeCategory, string> = {
  Tipler:          "tip",
  Otoriteler:      "otorite",
  Profiller:       "profil",
  Tanımlar:        "tanim",
  Merkezler:       "merkez",
  Kanallar:        "kanal",
  Kapılar:         "kapi",
  Stratejiler:     "strateji",
  "Genel Notlar":  "not",
};
