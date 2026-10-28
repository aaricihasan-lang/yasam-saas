/**
 * Rapor harness'i için SENTETİK normalize fikstürler (model.ts tipleriyle birebir; gerçek kişi verisi YOK).
 * Bilerek "kirli" değerler içerir: sağlayıcı adı, <script>, URL, sahte taş kaynağı adı → raporda görünmemeli.
 */
import type {
  BridgeResult,
  BusinessNameResult,
  ChaldeanPart,
  ChaldeanResult,
  ChartResult,
  ClassicNumber,
  CompatibilityResult,
  DualResult,
  MeaningBlock,
  Period,
  PersonalDayResult,
} from "../../../lib/numeroloji-klasik/model";
import type { StoneMatchResult, StoneSuggestion } from "../../../lib/numeroloji-klasik/stones/types";
import type { ClassicReportRecord, ComparisonReportInput } from "../../../lib/numeroloji-klasik/report/types";

export const FAKE_STONE_SOURCE = "Kristalvadisi Ansiklopedisi Sahte Kaynak";
export const DIRTY_BRAND = "RoxyAPI";
export const GEN_AT = "2026-10-29T10:30:00.000Z";

const U = { status: "unverified" } as const;
const M = { status: "match" } as const;

const meaning = (title: string, extra = ""): MeaningBlock => ({
  title,
  keywords: ["sezgi", "işbirliği", "ışık"],
  description: `${title} sayısı Şükran, ılımlılık ve İçgörü temalarıyla ilişkilendirilir. ${extra}`.trim(),
  strengths: ["Güçlü sezgi ve ğ-harfli örnek: yağmur", "Dinleme becerisi"],
  challenges: ["Aşırı duyarlılık"],
  career: "Danışmanlık ve öğretim alanları.",
  relationships: "Derin bağ kurar.",
  spirituality: "İç gözlem.",
});

const n = (value: number, type: ClassicNumber["type"], calc: string, karmicDebt: number | null = null, m: MeaningBlock | null = null, verification: ClassicNumber["verification"] = M): ClassicNumber => ({
  value, type, karmicDebt, calculation: calc, meaning: m, method: "pythagorean", verification,
});

const period = (position: number, number: number, startAge: number, endAge: number | null, title: string, lesson: string | null = null): Period => ({
  position, number, startAge, endAge, title, description: `${title} dönemi açıklaması — Işık ve İlerleyiş.`,
  opportunities: lesson ? [] : ["Yeni başlangıçlar"], challenges: lesson ? [] : ["Sabırsızlık"],
  lesson, howToOvercome: lesson ? "Sabır ve ölçülülük geliştirin." : null, verification: U,
});

export const CHART: ChartResult = {
  profile: { name: "Ayşe Örnek Işıl", birthdate: "1988-11-29" },
  core: {
    lifePath: n(11, "master", "Month: 11, Day: 29 → 11, Year: 1988 → 1+9+8+8 = 26 → 8 → sentetik iz → 11", null, meaning("Usta Sezgisel", `Bu metin ${DIRTY_BRAND} kaynaklıdır <script>alert(1)</script> https://example.com/x`)),
    expression: n(22, "master", "Ayşe: A=1, Y=7, Ş=1, E=5 = 14 → 5; Örnek: … = 22", null, meaning("Usta İnşacı")),
    soulUrge: n(7, "single", "Vowels: A=1, E=5, Ö=6, E=5, I=9 = 26 → 8 …", 16, meaning("Araştırmacı")),
    personality: n(6, "single", "Consonants: Y=7, Ş=1, R=9, N=5, K=2, Ş=1, L=3 → 6", null, meaning("Koruyucu"), { status: "mismatch", oracleValue: 5, note: "Ş harfi kuralı farklı" }),
    birthDay: n(11, "master", "29 → 2+9 = 11", null, meaning("Diplomat")),
    maturity: n(6, "single", "Life Path 11 + Expression 22 = 33 → 6", null, meaning("Sorumluluk")),
  },
  karmicLessons: {
    missingNumbers: [4, 8],
    lessons: [
      { number: 4, lesson: "Düzen ve disiplin geliştirin", description: "Eksik 4 sayısı yapı ihtiyacını gösterir.", howToOvercome: "Günlük rutin kurun." },
      { number: 8, lesson: "Maddi dengeyi öğrenin", description: "Eksik 8 sayısı güç ve para konularını işaret eder.", howToOvercome: "Bütçe pratiği yapın." },
    ],
    presentNumbers: { "1": 3, "2": 1, "3": 1, "4": 0, "5": 2, "6": 1, "7": 2, "8": 0, "9": 3 },
    verification: M,
  },
  karmicDebt: {
    hasKarmicDebt: true,
    debtNumbers: [16],
    meanings: [{ number: 16, description: "Alçakgönüllülük yükümlülüğü", challenge: "Gurur ve ego sınavları.", resolution: "Şefkat ve içtenlik." }],
    message: null,
    verification: M,
  },
  personalYear: {
    personalYear: 5, cycle: "9 yıllık döngüde 5. yıl", theme: "Değişim ve Genişleme", forecast: "Özgürlük ve değişim yılı.",
    opportunities: ["Seyahat"], challenges: ["Dağınıklık"], advice: "Temelinizi koruyun.", verification: M,
    personalMonth: { personalMonth: 6, theme: "Ev ve Hizmet", focus: "Aileye odaklanın.", verification: M },
  },
  pinnacles: [period(1, 4, 0, 33, "Temel Atma"), period(2, 11, 34, 42, "Usta Işığı"), period(3, 6, 43, 51, "Hizmet"), period(4, 9, 52, null, "Tamamlanma")],
  challenges: [period(1, 0, 0, 33, "Sıfır Zorluğu", "Odak bulmak"), period(2, 5, 34, 42, "Özgürlük Zorluğu", "Ölçülülük"), period(3, 5, 0, null, "Özgürlük Zorluğu", "Ölçülülük")],
  hiddenPassion: { number: 1, count: 3, allPassions: [1, 9], title: "Öncü Dürtü", description: "Liderlik isteği güçlüdür.", verification: M },
  subconsciousSelf: { number: 7, uniqueNumbers: [1, 2, 3, 5, 6, 7, 9], title: "Sakin Güven", description: "Çoğu durumda dengede kalır.", verification: M },
  nameLetters: {
    cornerstone: { letter: "A", number: 1, meaning: "Girişimci başlangıç.", verification: M },
    capstone: { letter: "L", number: 3, meaning: "Yaratıcı tamamlama.", verification: M },
    firstVowel: { letter: "A", meaning: "Doğrudan tepki.", verification: M },
  },
  birthDayProfile: { day: 29, reducesTo: 11, title: "Sezgisel Diplomat", keywords: ["sezgi", "uyum"], description: "Ayın 29'unda doğanlar duyarlıdır.", strengths: ["Empati"], challenges: ["Kararsızlık"], career: "Arabuluculuk.", relationships: "Sadakat." },
  maturityStatus: { isActive: true, currentAge: 37, activationRange: "35-40", verification: M },
  luckyAssociations: { colors: ["Gümüş", "Beyaz"], gemstones: ["Ay taşı", "İnci", "Dağ kristali"], day: "Pazartesi", element: "Hava", rulingPlanet: "Neptün", compatibleNumbers: [2, 4, 6], incompatibleNumbers: [1, 5] },
  summary: "Numeroloji tablonuz 11 Yaşam Yolu (Usta Sezgisel) ile şekillenir; ğüşiöç İĞÜŞÖÇ.",
};

export const BRIDGE: BridgeResult = {
  lifePathExpression: { bridge: 2, from: { name: "Life Path", number: 11 }, to: { name: "Expression", number: 22 }, meaning: "İşbirliği ile uzlaşma.", verification: M },
  expressionSoulUrge: { bridge: 4, from: { name: "Expression", number: 22 }, to: { name: "Soul Urge", number: 7 }, meaning: "Düzen kurma.", verification: M },
  soulUrgePersonality: { bridge: 1, from: { name: "Soul Urge", number: 7 }, to: { name: "Personality", number: 6 }, meaning: "Bağımsız adım.", verification: M },
  expressionPersonality: { bridge: 7, from: { name: "Expression", number: 22 }, to: { name: "Personality", number: 6 }, meaning: "İç gözlem.", verification: M },
};

export const PERSONAL_DAY: PersonalDayResult = {
  personalDay: 3, theme: "İfade", guidance: "Bugün yaratıcı ifadeye açık olun.", targetDate: "2026-10-29",
  personalMonth: 6, personalMonthTheme: "Ev ve Hizmet", personalYear: 5, personalYearTheme: "Değişim", verification: M,
};

const cpart = (value: number, total: number, compound: number | null, calc: string, name: string | null, nature: "fortunate" | "unfortunate" | "mixed"): ChaldeanPart => ({
  value, type: compound ? "compound" : "single", karmicDebt: null, calculation: calc, meaning: null, method: "chaldean", verification: M,
  total, compound, root: value, compoundMeaning: compound ? { number: compound, name, nature, meaning: `${compound} bileşik sayısının klasik anlamı.`, sameAs: null } : null,
});

export const CHALDEAN: ChaldeanResult = {
  name: "Ayşe Örnek Işıl",
  destiny: cpart(5, 23, 23, "A=1, Y=1, Ş=3 … = 23 → 5", "Aslanın Kraliyet Yıldızı", "fortunate"),
  soulUrge: cpart(1, 10, 10, "A=1, E=5, Ö=7 … = 10 → 1", "Talih Çarkı", "mixed"),
  personality: cpart(4, 13, 13, "Y=1, Ş=3 … = 13 → 4", "Ölüm", "unfortunate"),
  numberMeaning: { number: 5, planet: "Merkür", title: "İletişimci", keywords: ["çok yönlülük"], caution: true, meaning: "Merkür'ün hızlı enerjisi." },
  caution: true,
  summary: "Ad, Merkür tarafından yönetilen 5 titreşimi taşır.",
};

export const DUAL: DualResult = {
  name: "Ayşe Örnek Işıl",
  pythagorean: { ...n(22, "master", "Ayşe … = 22"), title: "Usta İnşacı", keywords: ["vizyon"] },
  chaldean: { ...cpart(5, 23, 23, "Ayşe … = 23 → 5", "Aslanın Kraliyet Yıldızı", "fortunate"), planet: "Merkür", title: "İletişimci", caution: false },
  agreement: false,
  note: "Bu isimde iki sistem farklı sonuç veriyor.",
  verification: M,
};

export const PERSON_RECORD: ClassicReportRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "person",
  title: "Ayşe Örnek — Kişisel Analiz",
  input: { fullName: "Ayşe Örnek Işıl", birth: { year: 1988, month: 11, day: 29 }, targetDate: "2026-10-29" },
  techniques: ["core", "bridge", "personal_day", "chaldean", "dual"],
  status: "complete",
  result: { chart: CHART, bridge: BRIDGE, personal_day: PERSONAL_DAY, chaldean: CHALDEAN, dual: DUAL },
  methodologyVersion: "numk-method-1",
  apiSchemaVersion: "numerology-openapi-2.0.0",
  referenceDate: "2026-10-29",
  createdAt: "2026-10-29T09:00:00.000Z",
  failed: [],
};

export const COMPAT: CompatibilityResult = {
  overallScore: 85, rating: "Oldukça Uyumlu",
  lifePath: { person1: 11, person2: 3, compatibility: 90, description: "Yaşam Yolu 11 ve 3 ilham verici bir uyum." },
  expression: { person1: 7, person2: 7, compatibility: 80, description: "İfade 7 ve 7 derin anlayış." },
  soulUrge: { person1: 6, person2: 5, compatibility: 65, description: "Ruh Güdüsü 6 ve 5 denge ister." },
  strengths: ["Güçlü duygusal bağ"], challenges: ["Farklı sorun çözme tarzları"], advice: "Açık iletişim kurun.", verification: M,
};

export const RELATIONSHIP_RECORD: ClassicReportRecord = {
  kind: "relationship", title: "Örnek Çift Uyumu",
  input: { person1: { fullName: "Ayşe Örnek", birth: { year: 1988, month: 11, day: 29 } }, person2: { fullName: "Şükrü Deneme", birth: { year: 1985, month: 3, day: 12 } } },
  techniques: ["compatibility"], status: "complete", result: { compatibility: COMPAT },
  methodologyVersion: "numk-method-1", apiSchemaVersion: "numerology-openapi-2.0.0", referenceDate: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z",
};

export const BUSINESS: BusinessNameResult = {
  name: "Işık Çiçekçilik",
  number: cpart(3, 21, 21, "I=1, Ş=3, I=1, K=2 … = 21 → 3", "Müneccimlerin Tacı", "fortunate"),
  planet: "Jüpiter", rating: "excellent", favorableCompound: true, industries: ["Eğitim", "Danışmanlık"],
  guidance: "Jüpiter tarafından yönetilen genişleyici titreşim.", summary: "Kök 3 (mükemmel).", verification: M,
};

export const BUSINESS_RECORD: ClassicReportRecord = {
  kind: "business", title: "Işık Çiçekçilik adı", input: { name: "Işık Çiçekçilik" }, techniques: ["business_name"], status: "complete",
  result: { business_name: BUSINESS }, methodologyVersion: "numk-method-1", apiSchemaVersion: "numerology-openapi-2.0.0", createdAt: "2026-10-29T09:00:00.000Z",
};

export const NAMES_RECORD: ClassicReportRecord = {
  kind: "names", title: "Bebek adı adayları", input: { candidates: ["Ilgın Deniz", "Şule Ağaç"] }, techniques: ["dual"], status: "partial",
  result: {
    "dual#1": { ...DUAL, name: "Ilgın Deniz", agreement: true },
    "dual#2": { ...DUAL, name: "Şule Ağaç" },
  },
  methodologyVersion: "numk-method-1", apiSchemaVersion: "numerology-openapi-2.0.0", createdAt: "2026-10-29T09:00:00.000Z", failed: ["dual#3"],
};

const sug = (stoneKey: string, nameTr: string, nameEn: string | null, method: StoneSuggestion["primary"], explanation: string): StoneSuggestion =>
  ({
    stoneKey, nameTr, nameEn, primary: method, symbolic: true,
    reasons: [{ method, explanation }],
    // Beyaz liste DIŞI alanlar (rapora girmemeli):
    source: FAKE_STONE_SOURCE, sourceName: FAKE_STONE_SOURCE, license: `${FAKE_STONE_SOURCE} lisansı`, excerpt_attribution: FAKE_STONE_SOURCE,
  }) as unknown as StoneSuggestion;

export const STONES: StoneMatchResult = {
  libraryAvailable: true,
  providerDirect: [
    { input: "Ay taşı", status: "matched", stoneKey: "ay-tasi", nameTr: "Ay Taşı", via: "name" },
    { input: "İnci", status: "ambiguous", candidates: [{ stoneKey: "inci", nameTr: "İnci", nameEn: "Pearl", via: "name" }, { stoneKey: "tatli-su-incisi", nameTr: "Tatlı Su İncisi", nameEn: null, via: "partial" }] },
    { input: "Dağ kristali", status: "unmatched" },
  ],
  groups: [
    { method: "provider_direct", label: "Klasik ekolün doğrudan önerdiği taşlar", description: "", items: [sug("ay-tasi", "Ay Taşı", "Moonstone", "provider_direct", "Yaşam Yolu listesinde adıyla geçer.")], total: 1 },
    { method: "vibration_exact", label: "Sayısal titreşimi birebir eşleşen taşlar", description: "", items: [sug("ametist", "Ametist", "Amethyst", "vibration_exact", "Titreşimi 7; Ruh Güdüsü 7 ile birebir.")], total: 1 },
    { method: "vibration_root", label: "Kök sayı üzerinden türetilen taşlar", description: "", items: [sug("sedef", "Sedef", null, "vibration_root", "Usta sayı 11'in kökü 2 üzerinden; birebir eşleşme değildir.")], total: 1 },
    { method: "planet", label: "Yönetici gezegenle ilişkili taşlar", description: "", items: [sug("akuamarin", "Akuamarin", "Aquamarine", "planet", "Geleneksel gezegeni Neptün.")], total: 1 },
    { method: "pairs_with", label: "Doğrudan önerilerle birlikte kullanılan taşlar", description: "", items: [sug("selenit", "Selenit", null, "pairs_with", "Ay Taşı'nın geleneksel eşlikçisi.")], total: 1 },
  ],
  suggestions: [],
  notes: ["Karmik borç 16 için taş verisinde karşılık yok; yalnız not düşülmüştür."],
  disclaimer: { symbolic: true, text: "Taş önerileri numerolojinin sembolik ve geleneksel yorumlarına dayanır; tıbbi tanı, tedavi ya da sağlık önerisi değildir ve bir uzman değerlendirmesinin yerine geçmez." },
  // Beyaz liste dışı kök alan:
  ...({ librarySource: FAKE_STONE_SOURCE } as object),
} as StoneMatchResult;

export const COMPARISON: ComparisonReportInput = {
  alignment: {
    rows: [
      { conceptKey: "hayat_yolu", position: null, labelTr: "Hayat Yolu ↔ Yaşam Yolu", legacy: { display: "11/2", value: 11, root: 2 }, legacyMissingReason: null, classic: { value: 11, type: "master", karmicDebt: null, root: 2 }, classicMissingReason: null, relation: "same_value", comparable: "value", sameNameDifferentFormula: false, explanation: "" },
      { conceptKey: "ifade", position: null, labelTr: "İfade ↔ İfade (Kader)", legacy: { display: "8", value: 8, root: 8 }, legacyMissingReason: null, classic: { value: 22, type: "master", karmicDebt: null, root: 4 }, classicMissingReason: null, relation: "different", comparable: "value", sameNameDifferentFormula: true, explanation: "A ekolünde İfade Türkçe harf tablosuyla, B ekolünde Pisagor (Batı) tablosuyla hesaplanır; Ş, Ğ, İ harflerinin değerleri farklıdır." },
      { conceptKey: "ana_kulvar", position: null, labelTr: "Ana Kulvar ↔ Ruh Güdüsü", legacy: null, legacyMissingReason: "field_missing", classic: { value: 7, type: "single", karmicDebt: 16, root: 7 }, classicMissingReason: null, relation: "one_missing", comparable: "not_comparable", sameNameDifferentFormula: false, explanation: "" },
      { conceptKey: "zirve", position: 2, labelTr: "Zirve Yılları ↔ Zirveler", legacy: { display: "34-42 / 11", value: 11, root: 2 }, legacyMissingReason: null, classic: { value: 11, type: "master", karmicDebt: null, root: 2 }, classicMissingReason: null, relation: "same_root", comparable: "root", sameNameDifferentFormula: true, explanation: "Dönem sınırları iki ekolde farklı hesaplanır." },
    ],
    onlyLegacy: [{ key: "pin_kodu", labelTr: "PİN Kodu", present: true }, "Çakra omurgası"],
    onlyClassic: [{ key: "kopru_sayilari", labelTr: "Köprü Sayıları", present: true }, { key: "kalde_bilesik", labelTr: "Kalde bileşik sayı", present: false }],
    stones: {
      legacyAssigned: [{ name: "Ametist", slot: "bileklik" }, { name: "Sitrin", slot: "kutle" }],
      classicDirect: [{ name: "Ay Taşı", status: "matched" }, { name: "İnci", status: "ambiguous" }],
      classicDerived: [{ name: "Akuamarin", methods: ["planet"] }, { name: "Sedef", methods: ["vibration_root"] }],
      overlap: [{ nameLegacy: "Ametist", slots: ["bileklik"] }],
    },
    missing: null,
  },
  legacyMeta: { title: "Ayşe — mevcut kayıt", personName: "Ayşe Örnek Işıl", birthDate: "29.11.1988", createdAt: "2026-09-01T09:00:00.000Z" },
  classicMeta: { title: "Ayşe — ekol karşılaştırması", personName: "Ayşe Örnek Işıl", birthDate: "29.11.1988", createdAt: "2026-10-29T09:00:00.000Z", methodologyVersion: "numk-method-1" },
  note: `Uzman notu: iki ekol farklı sonuçlar veriyor; danışanla birlikte değerlendirilecek. ${DIRTY_BRAND} <script>x</script>`,
};
