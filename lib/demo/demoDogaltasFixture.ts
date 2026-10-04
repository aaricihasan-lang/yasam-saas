/**
 * DEMO VİTRİN — Doğaltaş SENTETİK vitrin verisi (TEK KAYNAK).
 *
 * d83ddd4a ile demo hesabın owner tenant'ındaki GERÇEK taşları okuması (cross-tenant birleşim)
 * güvenlik gereği kaldırıldı ve GERİ GETİRİLMEZ. Doğaltaş vitrini bunun yerine demo tenant'ına
 * ait, açıkça SENTETİK kayıtlarla doldurulur:
 *   - 20 taş (stones) + 6 Taş Bilgi Kütüphanesi makalesi (stone_knowledge_articles).
 *   - Owner kayıtlarından içerik/UUID/tenant/user referansı KOPYALANMAZ; görsel YOK (images=[]).
 *   - Taş adları gerçek ve tanınabilir; metinler demo için yazılmış, tıbbi iddia içermeyen
 *     ("geleneksel kullanımda ilişkilendirilir") sentetik metinlerdir.
 *   - "Mineraller" ataması YALNIZ demo tenant'ının mevcut 42 mineral adını kullanır.
 *
 * Bu dosya migration SQL'inin kaynağıdır (scripts/demo-vitrin/buildDogaltasSeedSql.ts →
 * supabase/migrations/20271006400000_demo_vitrin_dogaltas_seed.sql; harness birebir doğrular).
 */
import { STONE_CHAKRA_OPTIONS, STONE_WARNING_OPTIONS } from "@/lib/dogaltas/stoneTaxonomy";

export { DEMO_TENANT_ID } from "@/lib/demo/demoVitrinFixture";

/** Sabit sentetik UUID: de5a<tablo>-c11e-4000-8000-<sıra> (0x20 taş, 0x21 makale). */
function fid(table: number, n: number): string {
  return `de5a${table.toString(16).padStart(4, "0")}-c11e-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export const DEMO_STONE_SOURCE_NOTE =
  "Yaşam Sistemi vitrin hesabı için hazırlanmış SENTETİK örnek kayıttır. Geleneksel kullanım bilgisi niteliğindedir; tıbbi teşhis veya tedavinin yerine geçmez.";

/** Demo tenant'ının mevcut 42 mineral adı (production'dan okunan; atama yalnız bunları kullanır). */
export const DEMO_TENANT_MINERAL_NAMES = [
  "SEZYUM", "ANTİMON", "NİKEL", "FLOR", "GERMANYUM", "MOLİBDEN", "SİLİSYUM", "SODYUM", "KROM", "BARYUM",
  "DEMİR", "BİZMUT", "MAGNEZYUM", "KALAY", "STRONSİYUM", "KLOR", "TİTAN", "BOR", "CIVA", "FOSFOR",
  "OKSİJEN", "ÇİNKO", "BAKIR", "KOBALT", "KURŞUN", "GALYUM", "ARSENİK", "ALTIN", "BERİLYUM", "POTASYUM",
  "VANADYUM", "BROM", "ZİRKONYUM", "GÜMÜŞ", "SÜLFÜR", "İYOT", "SELENYUM", "MANGANEZ", "KADMİYUM",
  "ALÜMİNYUM", "KALSİYUM", "LİTYUM",
] as const;

type Chakra = (typeof STONE_CHAKRA_OPTIONS)[number];
type Warning = (typeof STONE_WARNING_OPTIONS)[number];
type Mineral = (typeof DEMO_TENANT_MINERAL_NAMES)[number];

type StoneSpec = {
  name: string;
  family: string;
  formula: string;
  hardness: string;
  color: string;
  theme: string;
  chakras: Chakra[];
  minerals: Mineral[];
  element: string;
  zodiac: string[];
  organs: string[];
  temperament: string;
  care: "water_ok" | "no_water" | "no_sun" | "no_water_no_sun";
  warnings: Warning[];
  extraWarning?: string;
};

const SPECS: readonly StoneSpec[] = [
  { name: "AGAT", family: "Kalsedon (mikrokristalin kuvars)", formula: "SiO₂", hardness: "6,5–7", color: "katmanlı, bantlı; gri, kahve, mavi tonları", theme: "denge ve istikrar", chakras: ["Kök Çakra"], minerals: ["SİLİSYUM", "OKSİJEN", "DEMİR"], element: "Toprak", zodiac: ["İkizler", "Başak"], organs: ["Deri", "Bağırsaklar"], temperament: "Balgam", care: "water_ok", warnings: ["Genel Uyarı"] },
  { name: "AKUAMARİN", family: "Beril", formula: "Be₃Al₂Si₆O₁₈", hardness: "7,5–8", color: "açık mavi, deniz mavisi", theme: "sakin iletişim ve ifade", chakras: ["Boğaz Çakrası", "Kalp Çakrası"], minerals: ["BERİLYUM", "ALÜMİNYUM", "SİLİSYUM", "DEMİR"], element: "Su", zodiac: ["Balık", "Kova"], organs: ["Boğaz", "Akciğerler"], temperament: "Balgam", care: "no_sun", warnings: ["Genel Uyarı"] },
  { name: "AMAZONİT", family: "Mikroklin feldispat", formula: "KAlSi₃O₈", hardness: "6–6,5", color: "yeşil-turkuaz", theme: "uyum ve sakinlik", chakras: ["Kalp Çakrası", "Boğaz Çakrası"], minerals: ["POTASYUM", "ALÜMİNYUM", "SİLİSYUM", "KURŞUN"], element: "Su", zodiac: ["Başak"], organs: ["Kalp", "Boğaz"], temperament: "Balgam", care: "no_water", warnings: ["Genel Uyarı", "Çocuklar"], extraWarning: "Bileşiminde eser miktarda kurşun bulunabildiği için ağza alınmamalı ve iksir hazırlığında kullanılmamalıdır." },
  { name: "AMETİST", family: "Kuvars", formula: "SiO₂ (eser demir)", hardness: "7", color: "lila, mor, menekşe", theme: "sakinlik ve odak", chakras: ["Taç Çakra", "Üçüncü Göz"], minerals: ["SİLİSYUM", "OKSİJEN", "DEMİR", "MANGANEZ"], element: "Hava", zodiac: ["Balık", "Kova", "Yay"], organs: ["Sinir sistemi", "Baş bölgesi"], temperament: "Sevda", care: "no_sun", warnings: ["Uyku / Huzursuzluk"] },
  { name: "FLORİT", family: "Halojenür", formula: "CaF₂", hardness: "4", color: "mor, yeşil, mavi; bantlı", theme: "düzen ve zihinsel netlik", chakras: ["Üçüncü Göz", "Kalp Çakrası"], minerals: ["KALSİYUM", "FLOR"], element: "Hava", zodiac: ["Oğlak", "Balık"], organs: ["Kemikler", "Dişler"], temperament: "Balgam", care: "no_water_no_sun", warnings: ["Genel Uyarı", "Çocuklar"], extraWarning: "Yumuşak ve kolay kırılan bir taştır; ağza alınmamalı, iksir hazırlığında kullanılmamalıdır." },
  { name: "GRANAT", family: "Granat grubu (almandin)", formula: "Fe₃Al₂(SiO₄)₃", hardness: "7–7,5", color: "koyu kırmızı, bordo", theme: "canlılık ve kararlılık", chakras: ["Kök Çakra", "Sakral Çakra"], minerals: ["DEMİR", "ALÜMİNYUM", "SİLİSYUM"], element: "Ateş", zodiac: ["Oğlak", "Koç"], organs: ["Kan dolaşımı", "Kalp"], temperament: "Safra", care: "water_ok", warnings: ["Tansiyon", "Enerji Hassasiyeti"] },
  { name: "HEMATİT", family: "Demir oksit", formula: "Fe₂O₃", hardness: "5–6,5", color: "metalik gri-siyah", theme: "topraklanma ve koruma", chakras: ["Kök Çakra"], minerals: ["DEMİR", "OKSİJEN"], element: "Toprak", zodiac: ["Koç", "Kova"], organs: ["Kan", "Bacaklar"], temperament: "Sevda", care: "no_water", warnings: ["Tansiyon"] },
  { name: "KAPLAN GÖZÜ", family: "Kuvars (lifli psödomorf)", formula: "SiO₂ (demir oksitli)", hardness: "7", color: "altın-kahve, ışık oyunlu", theme: "özgüven ve odak", chakras: ["Solar Pleksus", "Sakral Çakra"], minerals: ["SİLİSYUM", "DEMİR", "OKSİJEN"], element: "Ateş", zodiac: ["Aslan", "Oğlak"], organs: ["Mide", "Sindirim sistemi"], temperament: "Safra", care: "water_ok", warnings: ["Genel Uyarı"] },
  { name: "KARNELYAN", family: "Kalsedon", formula: "SiO₂ (demir oksitli)", hardness: "6,5–7", color: "turuncu, kırmızı-turuncu", theme: "motivasyon ve yaratıcılık", chakras: ["Sakral Çakra"], minerals: ["SİLİSYUM", "DEMİR", "OKSİJEN"], element: "Ateş", zodiac: ["Koç", "Aslan"], organs: ["Bel bölgesi", "Böbrekler"], temperament: "Dem", care: "no_sun", warnings: ["Tansiyon"] },
  { name: "LABRADORİT", family: "Plajiyoklaz feldispat", formula: "(Ca,Na)(Al,Si)₄O₈", hardness: "6–6,5", color: "gri zemin üzerinde mavi-yeşil yanardöner", theme: "sezgi ve dönüşüm", chakras: ["Üçüncü Göz", "Taç Çakra"], minerals: ["KALSİYUM", "SODYUM", "ALÜMİNYUM", "SİLİSYUM"], element: "Su", zodiac: ["Yay", "Akrep"], organs: ["Gözler", "Sinir sistemi"], temperament: "Sevda", care: "no_water", warnings: ["Psikolojik Hassasiyet"] },
  { name: "LAPİSLAZULİ", family: "Kaya (lazurit ağırlıklı)", formula: "(Na,Ca)₈(AlSiO₄)₆(S,SO₄,Cl)", hardness: "5–5,5", color: "lacivert, altın renkli pirit noktalı", theme: "bilgelik ve ifade", chakras: ["Üçüncü Göz", "Boğaz Çakrası"], minerals: ["SODYUM", "KALSİYUM", "ALÜMİNYUM", "SİLİSYUM", "SÜLFÜR"], element: "Hava", zodiac: ["Yay", "Terazi"], organs: ["Boğaz", "Baş bölgesi"], temperament: "Balgam", care: "no_water", warnings: ["Genel Uyarı"] },
  { name: "LEPİDOLİT", family: "Mika", formula: "K(Li,Al)₃(Al,Si)₄O₁₀(F,OH)₂", hardness: "2,5–3", color: "pembe-lila, pullu", theme: "rahatlama ve dinginlik", chakras: ["Kalp Çakrası", "Taç Çakra"], minerals: ["LİTYUM", "POTASYUM", "ALÜMİNYUM", "FLOR"], element: "Su", zodiac: ["Terazi"], organs: ["Sinir sistemi"], temperament: "Balgam", care: "no_water", warnings: ["Uzman Kontrolü", "Çocuklar"], extraWarning: "Lityum içerir; ağza alınmamalı ve iksir hazırlığında kullanılmamalıdır." },
  { name: "MALAHİT", family: "Bakır karbonat", formula: "Cu₂CO₃(OH)₂", hardness: "3,5–4", color: "koyu ve açık yeşil bantlı", theme: "dönüşüm ve cesaret", chakras: ["Kalp Çakrası", "Solar Pleksus"], minerals: ["BAKIR", "OKSİJEN"], element: "Toprak", zodiac: ["Akrep", "Oğlak"], organs: ["Karaciğer", "Eklemler"], temperament: "Safra", care: "no_water", warnings: ["Hamilelik", "Çocuklar", "Alerji"], extraWarning: "Bakır içerir; tozu solunmamalı, işlenmemiş hâli cilde uzun süre temas ettirilmemeli ve iksirde kullanılmamalıdır." },
  { name: "OBSİDYEN (SİYAH)", family: "Volkanik cam", formula: "SiO₂ ağırlıklı amorf", hardness: "5–5,5", color: "parlak siyah", theme: "koruma ve farkındalık", chakras: ["Kök Çakra"], minerals: ["SİLİSYUM", "OKSİJEN", "DEMİR", "MAGNEZYUM"], element: "Toprak", zodiac: ["Akrep", "Yay"], organs: ["Bacaklar", "Bağırsaklar"], temperament: "Sevda", care: "water_ok", warnings: ["Psikolojik Hassasiyet", "Enerji Hassasiyeti"] },
  { name: "PEMBE KUVARS", family: "Kuvars", formula: "SiO₂ (eser titan/mangan)", hardness: "7", color: "açık pembe, süt pembesi", theme: "şefkat ve iç huzur", chakras: ["Kalp Çakrası"], minerals: ["SİLİSYUM", "OKSİJEN", "TİTAN", "MANGANEZ"], element: "Su", zodiac: ["Boğa", "Terazi"], organs: ["Kalp", "Deri"], temperament: "Dem", care: "no_sun", warnings: ["Genel Uyarı"] },
  { name: "PİRİT", family: "Demir sülfür", formula: "FeS₂", hardness: "6–6,5", color: "metalik pirinç sarısı", theme: "irade ve bolluk niyeti", chakras: ["Solar Pleksus"], minerals: ["DEMİR", "SÜLFÜR"], element: "Ateş", zodiac: ["Aslan"], organs: ["Mide", "Akciğerler"], temperament: "Safra", care: "no_water", warnings: ["Genel Uyarı"], extraWarning: "Nemli ortamda oksitlenebilir; ağza alınmamalı ve iksir hazırlığında kullanılmamalıdır." },
  { name: "RODOKROZİT", family: "Manganez karbonat", formula: "MnCO₃", hardness: "3,5–4", color: "pembe-kırmızı bantlı", theme: "duygusal yenilenme", chakras: ["Kalp Çakrası", "Solar Pleksus"], minerals: ["MANGANEZ", "OKSİJEN"], element: "Ateş", zodiac: ["Akrep", "Aslan"], organs: ["Kalp", "Böbrekler"], temperament: "Dem", care: "no_water_no_sun", warnings: ["Genel Uyarı"] },
  { name: "SELENİT", family: "Alçıtaşı (jips)", formula: "CaSO₄·2H₂O", hardness: "2", color: "beyaz, ipeksi parlak", theme: "arınma ve hafiflik", chakras: ["Taç Çakra"], minerals: ["KALSİYUM", "SÜLFÜR", "OKSİJEN"], element: "Hava", zodiac: ["Yengeç", "Boğa"], organs: ["Omurga", "Sinir sistemi"], temperament: "Balgam", care: "no_water", warnings: ["Genel Uyarı"], extraWarning: "Suda çözünür; suyla temizlenmemeli ve nemli ortamda saklanmamalıdır." },
  { name: "SİTRİN", family: "Kuvars", formula: "SiO₂ (eser demir)", hardness: "7", color: "açık sarı, bal rengi", theme: "neşe ve canlılık", chakras: ["Solar Pleksus", "Sakral Çakra"], minerals: ["SİLİSYUM", "OKSİJEN", "DEMİR"], element: "Ateş", zodiac: ["Aslan", "İkizler", "Koç"], organs: ["Mide", "Sindirim sistemi"], temperament: "Safra", care: "no_sun", warnings: ["Enerji Hassasiyeti"] },
  { name: "TURMALİN (SİYAH)", family: "Turmalin grubu (şörl)", formula: "NaFe₃Al₆(BO₃)₃Si₆O₁₈(OH)₄", hardness: "7–7,5", color: "siyah, çizgili prizmatik", theme: "koruma ve topraklanma", chakras: ["Kök Çakra"], minerals: ["BOR", "SODYUM", "DEMİR", "ALÜMİNYUM", "SİLİSYUM"], element: "Toprak", zodiac: ["Oğlak", "Akrep"], organs: ["Bacaklar", "Bağışıklık"], temperament: "Sevda", care: "water_ok", warnings: ["Genel Uyarı"] },
];

const CARE_TEXT: Record<StoneSpec["care"], string> = {
  water_ok: "Ilık su ve yumuşak bir bezle temizlenebilir; kuruladıktan sonra kumaş kese içinde saklanması önerilir.",
  no_water: "Su ile temizlenmesi önerilmez; kuru, yumuşak bir fırça veya tütsü/ses ile enerjisel temizlik tercih edilir.",
  no_sun: "Uzun süre doğrudan güneş ışığında rengi açılabilir; gölgede, kumaş kese içinde saklanmalıdır.",
  no_water_no_sun: "Suya ve doğrudan güneşe karşı hassastır; kuru temizlenmeli, gölgede ve tek başına saklanmalıdır.",
};

export type DemoStoneSeed = {
  id: string;
  stone_name: string;
  short_description: string;
  general_info: string;
  source_note: string;
  physical_effects: string;
  spiritual_effects: string;
  other_effects: string;
  warning_text: string;
  warning_tags: string[];
  feng_shui: string;
  meditation: string;
  care: string;
  application: string;
  chakras: string[];
  assignments: Record<string, string[][]>;
  updatedOffsetMinutes: number;
};

function titleCase(name: string): string {
  return name
    .toLocaleLowerCase("tr-TR")
    .split(" ")
    .map((w) => (w.startsWith("(") ? "(" + w.slice(1, 2).toLocaleUpperCase("tr-TR") + w.slice(2) : w.slice(0, 1).toLocaleUpperCase("tr-TR") + w.slice(1)))
    .join(" ");
}

export const DEMO_STONES_SEED: readonly DemoStoneSeed[] = SPECS.map((s, i) => {
  const label = titleCase(s.name);
  const chakraText = s.chakras.join(" ve ");
  return {
    id: fid(0x20, i + 1),
    stone_name: s.name,
    short_description: `${label}; ${s.theme} temasıyla ilişkilendirilen, ${s.color} renkli bir taştır. (Sentetik örnek kayıt)`,
    general_info: `${label}, ${s.family} grubunda yer alır. Kimyasal formülü ${s.formula}, Mohs sertliği ${s.hardness} olarak bilinir. Renk aralığı: ${s.color}. Bu kayıt Yaşam Sistemi vitrin hesabı için hazırlanmış örnek bir kayıttır.`,
    source_note: DEMO_STONE_SOURCE_NOTE,
    physical_effects: `Geleneksel kristal çalışmalarında ${s.organs.join(" ve ").toLocaleLowerCase("tr-TR")} bölgesiyle ilişkilendirilir. Bu bilgi tıbbi bir iddia değildir; sağlık sorunlarında hekime başvurulmalıdır.`,
    spiritual_effects: `${chakraText} ile eşleştirilir; ${s.theme} niyetiyle yapılan çalışmalarda destekleyici bir sembol olarak kullanılır.`,
    other_effects: `Element: ${s.element}. Mizaç eşleşmesi: ${s.temperament}. Burç geleneğinde ${s.zodiac.join(", ")} ile anılır.`,
    warning_text: [
      "Doğaltaşlar tıbbi tedavinin yerine geçmez; mevcut bir tedavi varsa uzman/hekim önerisi esastır.",
      s.extraWarning ?? "",
    ].filter(Boolean).join(" "),
    warning_tags: [...s.warnings],
    feng_shui: `Feng shui uygulamalarında ${s.theme} niyetini simgelemek için ${s.element === "Su" ? "evin kuzey" : s.element === "Ateş" ? "evin güney" : s.element === "Hava" ? "çalışma alanının doğu" : "girişin yakını veya merkez"} bölümünde konumlandırılır.`,
    meditation: `Meditasyon sırasında ${chakraText.toLocaleLowerCase("tr-TR")} bölgesinin yakınında tutulabilir; 5–10 dakikalık sakin nefes çalışmasıyla birlikte kullanılır.`,
    care: CARE_TEXT[s.care],
    application: `Cepte taşıma, masa üstünde bulundurma veya meditasyon sırasında elde tutma şeklinde kullanılır. ${s.care === "water_ok" ? "" : "İksir (su) hazırlığında kullanılmaz."}`.trim(),
    chakras: [...s.chakras],
    assignments: {
      Elementler: [[s.element]],
      Mineraller: s.minerals.map((m) => [m]),
      "Etkili Organlar": s.organs.map((o) => [o]),
      "Çakra Atama": s.chakras.map((c) => [c]),
      Burçlar: s.zodiac.map((z) => [z]),
      Mizaçlar: [[s.temperament]],
    },
    updatedOffsetMinutes: -(i + 1) * 7,
  };
});

// ─── Taş Bilgi Kütüphanesi — sentetik makaleler ──────────────────────────────

export type DemoArticleSeed = {
  id: string;
  title: string;
  category: "Şifa" | "Araştırma" | "Mineroloji" | "Uygulamalar" | "Genel";
  sub_category: string;
  tags: string[];
  related_stones: string[];
  related_minerals: string[];
  source: string;
  keyword: string;
  content: string;
};

const ARTICLE_FOOTER =
  "\n\nNot: Bu makale Yaşam Sistemi vitrin hesabı için hazırlanmış SENTETİK örnek içeriktir; tıbbi tavsiye değildir.";

export const DEMO_ARTICLES_SEED: readonly DemoArticleSeed[] = [
  {
    id: fid(0x21, 1), category: "Mineroloji", sub_category: "Temel Bilgiler",
    title: "Mohs Sertlik Ölçeği ve Taşların Dayanıklılığı",
    tags: ["mohs", "sertlik", "dayanıklılık"], related_stones: ["AMETİST", "SELENİT", "FLORİT"], related_minerals: ["SİLİSYUM", "KALSİYUM"],
    source: "Vitrin örnek içeriği", keyword: "mohs sertlik",
    content: "Mohs ölçeği, minerallerin birbirini çizebilme özelliğine göre 1 ile 10 arasında sıralandığı göreceli bir sertlik ölçeğidir.\n\nSelenit (2) tırnakla çizilebilecek kadar yumuşakken kuvars ailesindeki ametist ve sitrin (7) günlük kullanıma oldukça dayanıklıdır. Florit (4) gibi orta sertlikteki taşlar darbelere karşı korunmalıdır.\n\nUygulamada sertlik; taşın cepte taşınabilirliğini, birlikte saklanabileceği taşları ve temizlik yöntemini belirlemede ilk bakılacak bilgidir." + ARTICLE_FOOTER,
  },
  {
    id: fid(0x21, 2), category: "Uygulamalar", sub_category: "Bakım",
    title: "Doğaltaşların Temizlenmesi ve Saklanması",
    tags: ["bakım", "temizlik", "saklama"], related_stones: ["SELENİT", "MALAHİT", "PİRİT", "AMETİST"], related_minerals: ["BAKIR", "DEMİR"],
    source: "Vitrin örnek içeriği", keyword: "taş bakımı",
    content: "Her taş aynı yöntemle temizlenmez. Selenit suda çözünür; malahit ve pirit nemden etkilenir. Bu taşlar kuru bir fırça veya yumuşak bezle temizlenmelidir.\n\nAmetist, sitrin ve pembe kuvars gibi renkli kuvarslar uzun süre doğrudan güneşte kaldığında solabilir. Taşları ayrı keselerde saklamak, sert taşların yumuşakları çizmesini önler.\n\nTemizlik sonrasında taşın kayıt kartındaki 'Bakım' alanına uygulanan yöntemi not etmek, danışan çalışmalarında tutarlılık sağlar." + ARTICLE_FOOTER,
  },
  {
    id: fid(0x21, 3), category: "Şifa", sub_category: "Çakra Eşleştirme",
    title: "Çakra Renkleri ve Taş Eşleştirme Geleneği",
    tags: ["çakra", "renk", "eşleştirme"], related_stones: ["TURMALİN (SİYAH)", "KARNELYAN", "SİTRİN", "PEMBE KUVARS", "AKUAMARİN", "LAPİSLAZULİ", "AMETİST"], related_minerals: [],
    source: "Vitrin örnek içeriği", keyword: "çakra taşları",
    content: "Geleneksel uygulamalarda her çakra bir renk ile ilişkilendirilir ve taşlar çoğunlukla bu renk uyumuna göre seçilir: Kök çakra için siyah ve kırmızı taşlar, sakral çakra için turuncu, solar pleksus için sarı, kalp çakrası için pembe ve yeşil, boğaz çakrası için açık mavi, üçüncü göz için lacivert ve taç çakra için mor/beyaz tonlar.\n\nBu eşleştirme sembolik bir çerçevedir; uzmanlar danışanın ihtiyacına göre farklı tercihler yapabilir." + ARTICLE_FOOTER,
  },
  {
    id: fid(0x21, 4), category: "Araştırma", sub_category: "Bilimsel Bakış",
    title: "Kristal Çalışmalarına Bilimsel Bir Bakış",
    tags: ["araştırma", "kanıt", "etik"], related_stones: [], related_minerals: [],
    source: "Vitrin örnek içeriği", keyword: "bilimsel bakış",
    content: "Doğaltaşların fiziksel sağlık üzerindeki etkilerine dair güçlü klinik kanıt bulunmamaktadır. Bu nedenle profesyonel uygulamada taşlar; rahatlama, odak ve niyet çalışmalarına eşlik eden tamamlayıcı semboller olarak konumlandırılmalıdır.\n\nEtik uygulama için: danışana tıbbi vaatte bulunulmamalı, devam eden tedaviler değiştirilmemeli ve gerekli durumlarda hekime yönlendirme yapılmalıdır. Yaşam Sistemi'ndeki uyarı alanları bu yaklaşımı desteklemek için tasarlanmıştır." + ARTICLE_FOOTER,
  },
  {
    id: fid(0x21, 5), category: "Mineroloji", sub_category: "Mineral Aileleri",
    title: "Kuvars Ailesi: Ametist, Sitrin ve Pembe Kuvars",
    tags: ["kuvars", "silisyum", "renk"], related_stones: ["AMETİST", "SİTRİN", "PEMBE KUVARS", "KAPLAN GÖZÜ"], related_minerals: ["SİLİSYUM", "OKSİJEN", "DEMİR", "TİTAN", "MANGANEZ"],
    source: "Vitrin örnek içeriği", keyword: "kuvars",
    content: "Kuvars, silisyum ve oksijenden (SiO₂) oluşan, yer kabuğunun en yaygın minerallerinden biridir. Renk farklılıkları çoğunlukla eser elementlerden kaynaklanır: Ametistin morluğu ve sitrinin sarılığı eser demirle, pembe kuvarsın rengi ise titan ve mangan gibi eserlerle ilişkilendirilir.\n\nKaplan gözü de lifli yapısıyla kuvars ailesinin ışık oyunlu bir üyesidir. Aynı aileden taşlar benzer sertlik (7) ve bakım ihtiyaçlarına sahiptir." + ARTICLE_FOOTER,
  },
  {
    id: fid(0x21, 6), category: "Genel", sub_category: "Kullanım",
    title: "Taş Kartlarını Danışan Çalışmasında Kullanmak",
    tags: ["kullanım", "danışan", "kayıt"], related_stones: ["AMETİST", "HEMATİT"], related_minerals: [],
    source: "Vitrin örnek içeriği", keyword: "taş kartı",
    content: "Doğaltaş listesindeki her kayıt; genel bilgi, çakra ve element atamaları, mineraller, uyarılar ve bakım notlarını tek kartta toplar.\n\nUzman, danışan detayındaki 'Taşlar' sekmesinden önerdiği taşı kaydederken bu kartlardaki uyarı etiketlerini kontrol ederek güvenli bir öneri hazırlayabilir. Kombinasyon oluşturma ekranı ise mineral ihtiyaçlarına göre taş seçimine yardımcı olur." + ARTICLE_FOOTER,
  },
];

export function allDemoStoneIds(): string[] {
  return DEMO_STONES_SEED.map((s) => s.id);
}
