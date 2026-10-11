/**
 * Enkarnasyon teması — Word raporunda görünen Türkçe ad + özgün İngilizce ad (2026-10-10 owner kararı).
 *
 * • Türkçe görünen adda "Haç" kelimesi KULLANILMAZ: "Right Angle Cross of Contagion" →
 *   "Sağ Açılı Etki Yayma Teması". Özgün İngilizce Human Design terimi AYNEN korunur ve yanında gösterilir.
 * • SAF ve deterministik; kayıtlı snapshot / hesaplama DEĞİŞMEZ (çeviri yalnız çizim anında yapılır).
 * • Sözlükte olmayan tema adı UYDURULMAZ: açıya göre genel Türkçe ad + özgün İngilizce ad gösterilir.
 */

const ANGLE_TR: Readonly<Record<"right" | "left" | "juxtaposition", string>> = {
  right: "Sağ Açılı",
  left: "Sol Açılı",
  juxtaposition: "Yan Yana",
};

const ANGLE_EN: Readonly<Record<"right" | "left" | "juxtaposition", string>> = {
  right: "Right Angle Cross",
  left: "Left Angle Cross",
  juxtaposition: "Juxtaposition Cross",
};

/** İngilizce tema adı (küçük harf, baştaki "the" yok) → Türkçe tema adı. */
const THEME_TR: Readonly<Record<string, string>> = {
  // Sağ Açılı (Right Angle) temaları
  sphinx: "Sfenks",
  maya: "Maya",
  laws: "Yasalar",
  explanation: "Açıklama",
  consciousness: "Bilinç",
  eden: "Cennet Bahçesi",
  service: "Hizmet",
  unexpected: "Beklenmedik",
  "vessel of love": "Sevgi Kabı",
  contagion: "Etki Yayma",
  penetration: "Nüfuz Etme",
  rulership: "Yönetim",
  "four ways": "Dört Yol",
  tension: "Gerilim",
  planning: "Planlama",
  "sleeping phoenix": "Uyuyan Anka",
  // Sol Açılı (Left Angle) temaları
  alignment: "Hizalanma",
  clarion: "Çağrı",
  confrontation: "Yüzleşme",
  cycles: "Döngüler",
  dedication: "Adanmışlık",
  defiance: "Meydan Okuma",
  demands: "Talepler",
  distraction: "Dikkat Dağıtma",
  dominion: "Hâkimiyet",
  duality: "İkilik",
  education: "Eğitim",
  endeavor: "Çaba",
  endeavour: "Çaba",
  healing: "Şifa",
  identification: "Özdeşleşme",
  incarnation: "Enkarnasyon",
  individualism: "Bireycilik",
  industry: "Çalışkanlık",
  informing: "Bilgilendirme",
  masks: "Maskeler",
  migration: "Göç",
  obscuration: "Örtme",
  plane: "Düzlem",
  prevention: "Önleme",
  refinement: "İnceltme",
  revolution: "Devrim",
  separation: "Ayrılık",
  spirit: "Ruh",
  uncertainty: "Belirsizlik",
  upheaval: "Altüst Oluş",
  wishes: "Dilekler",
  // Yan Yana (Juxtaposition) temaları
  "self-expression": "Kendini İfade",
  "self expression": "Kendini İfade",
  driver: "Yön Veren",
  mutation: "Mutasyon",
  formulization: "Formülleştirme",
  habits: "Alışkanlıklar",
  conflict: "Çatışma",
  interaction: "Etkileşim",
  contribution: "Katkı",
  focus: "Odak",
  behavior: "Davranış",
  behaviour: "Davranış",
  ideas: "Fikirler",
  articulation: "Dile Getirme",
  listening: "Dinleme",
  empowering: "Güçlendirme",
  extremes: "Uç Noktalar",
  experimentation: "Deneme",
  opinions: "Görüşler",
  correction: "Düzeltme",
  need: "İhtiyaç",
  now: "Şimdi",
  control: "Kontrol",
  grace: "Zarafet",
  assimilation: "Özümseme",
  rationalization: "Akılcılaştırma",
  innocence: "Masumiyet",
  trickster: "Hilebaz",
  caring: "Özen",
  risks: "Riskler",
  commitment: "Bağlılık",
  fates: "Kader",
  influence: "Etki",
  conservation: "Koruma",
  retreat: "Geri Çekilme",
  power: "Güç",
  experience: "Deneyim",
  crisis: "Kriz",
  bargains: "Pazarlıklar",
  opposition: "Karşıtlık",
  provocation: "Kışkırtma",
  denial: "İnkâr",
  fantasy: "Fantezi",
  completion: "Tamamlama",
  insight: "İç Görü",
  alertness: "Uyanıklık",
  possession: "Sahiplik",
  serendipity: "Mutlu Tesadüf",
  oppression: "Baskı",
  depth: "Derinlik",
  principles: "İlkeler",
  values: "Değerler",
  shock: "Şok",
  stillness: "Durgunluk",
  beginnings: "Başlangıçlar",
  ambition: "Hırs",
  moods: "Ruh Halleri",
  stimulation: "Uyarım",
  intuition: "Sezgi",
  vitality: "Canlılık",
  strategy: "Strateji",
  thinking: "Düşünme",
  detail: "Ayrıntı",
  doubts: "Şüpheler",
  confusion: "Kafa Karışıklığı",
  limitation: "Sınırlama",
};

export type CrossThemeNames = {
  /** Türkçe görünen ad ("Haç" içermez). */
  tr: string;
  /** Özgün İngilizce ad (sağlayıcının verdiği gibi; yoksa açıya göre genel İngilizce terim). */
  en: string;
  /** Tema adı sözlükte bulunup çevrildi mi (false → yalnız açıya göre genel ad). */
  themeKnown: boolean;
};

function angleKey(raw: string | null | undefined): "right" | "left" | "juxtaposition" | null {
  const k = (raw ?? "").toLowerCase().replace(/[\s_\-()]+/g, "");
  if (k.startsWith("right") || k.includes("rightangle") || k === "rax" || k.startsWith("sağ")) return "right";
  if (k.startsWith("left") || k.includes("leftangle") || k === "lax" || k.startsWith("sol")) return "left";
  if (k.startsWith("juxta") || k.includes("juxtaposition") || k === "jxp" || k.startsWith("yanyana")) return "juxtaposition";
  return null;
}

const EN_RE = /^\s*(right angle|left angle|juxtaposition)\s+cross\s+of\s+(?:the\s+)?(.+?)\s*(?:\(?\s*(\d)\s*\)?)?\s*$/i;

/**
 * @param name  snapshot.identity.cross.name (ör. "Right Angle Cross of Laws 2"; sağlayıcı adı yoksa açı etiketi)
 * @param angle snapshot.identity.cross.angle (ör. "Sağ Açı (Right Angle)")
 */
export function crossThemeNames(name: string, angle: string | null): CrossThemeNames {
  const m = EN_RE.exec(name);
  if (m) {
    const key = angleKey(m[1])!;
    const theme = m[2].trim().toLowerCase();
    const num = m[3] ? ` ${m[3]}` : "";
    const tr = THEME_TR[theme];
    return tr
      ? { tr: `${ANGLE_TR[key]} ${tr} Teması${num}`, en: name.trim(), themeKnown: true }
      : { tr: `${ANGLE_TR[key]} Enkarnasyon Teması`, en: name.trim(), themeKnown: false };
  }
  const key = angleKey(angle) ?? angleKey(name);
  if (key) return { tr: `${ANGLE_TR[key]} Enkarnasyon Teması`, en: ANGLE_EN[key], themeKnown: false };
  return { tr: "Enkarnasyon Teması", en: name.trim(), themeKnown: false };
}

/** Test/denetim: sözlükteki tema anahtarları. */
export const CROSS_THEME_KEYS: readonly string[] = Object.keys(THEME_TR);
