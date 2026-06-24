// Demo fixture verisi — yalnızca is_demo_account=true hesabında devreye girer. DB'ye yazılmaz.
// Şifa rehberi demo deneyimi: zengin ve dolu bir bilgi bankası hissi verir.
// Kimlik bilgileri (ad, kategori, dolu bölüm, son güncelleme) görünür;
// klinik / terapötik içerikler liste ve detayda DemoBlur ile korunur.

import type {
  HealingGuideDetail,
  HealingGuideListRow,
} from "@/lib/sifa-rehberi/healingGuideLiveData";

export const DEMO_SIFA_PREFIX = "demo-sifa-";

export function isDemoFixtureGuide(id: string): boolean {
  return id.startsWith(DEMO_SIFA_PREFIX);
}

// ─── Fixture tohumları ──────────────────────────────────────────────────────

type SifaSeed = { slug: string; name: string; category: string };

const DEMO_SIFA_SEED: SifaSeed[] = [
  { slug: "alerji", name: "Alerji", category: "Bağışıklık" },
  { slug: "astim", name: "Astım", category: "Solunum" },
  { slug: "migren", name: "Migren", category: "Sinir Sistemi" },
  { slug: "sinuzit", name: "Sinüzit", category: "Solunum" },
  { slug: "gastrit", name: "Gastrit", category: "Sindirim" },
  { slug: "reflu", name: "Reflü", category: "Sindirim" },
  { slug: "kabizlik", name: "Kabızlık", category: "Sindirim" },
  { slug: "bagirsak-temizligi", name: "Bağırsak Temizliği", category: "Sindirim" },
  { slug: "bagirsak-kurdu", name: "Bağırsak Kurdu", category: "Sindirim" },
  { slug: "bagirsak-kanamasi", name: "Bağırsak Kanaması", category: "Sindirim" },
  { slug: "mide-yanmasi", name: "Mide Yanması", category: "Sindirim" },
  { slug: "mide-ulseri", name: "Mide Ülseri", category: "Sindirim" },
  { slug: "bel-fitigi", name: "Bel Fıtığı", category: "Kas-İskelet" },
  { slug: "boyun-fitigi", name: "Boyun Fıtığı", category: "Kas-İskelet" },
  { slug: "diz-agrisi", name: "Diz Ağrısı", category: "Kas-İskelet" },
  { slug: "romatizma", name: "Romatizma", category: "Kas-İskelet" },
  { slug: "eklem-agrilari", name: "Eklem Ağrıları", category: "Kas-İskelet" },
  { slug: "meniskus", name: "Menisküs", category: "Kas-İskelet" },
  { slug: "siyatik", name: "Siyatik", category: "Kas-İskelet" },
  { slug: "varis", name: "Varis", category: "Dolaşım" },
  { slug: "hemoroid", name: "Hemoroid", category: "Dolaşım" },
  { slug: "uyku-problemleri", name: "Uyku Problemleri", category: "Sinir Sistemi" },
  { slug: "kronik-yorgunluk", name: "Kronik Yorgunluk", category: "Genel" },
  { slug: "panik-atak", name: "Panik Atak", category: "Psikolojik" },
  { slug: "anksiyete", name: "Anksiyete", category: "Psikolojik" },
  { slug: "depresif-duygu-durumu", name: "Depresif Duygu Durumu", category: "Psikolojik" },
  { slug: "tiroid-problemleri", name: "Tiroid Problemleri", category: "Endokrin" },
  { slug: "karaciger-yaglanmasi", name: "Karaciğer Yağlanması", category: "Sindirim" },
  { slug: "bobrek-tasi", name: "Böbrek Taşı", category: "Üriner" },
  { slug: "safra-kesesi", name: "Safra Kesesi Problemleri", category: "Sindirim" },
  { slug: "egzama", name: "Egzama", category: "Cilt" },
  { slug: "sedef", name: "Sedef", category: "Cilt" },
  { slug: "mantar", name: "Mantar", category: "Cilt" },
  { slug: "sac-dokulmesi", name: "Saç Dökülmesi", category: "Cilt" },
  { slug: "kulak-cinlamasi", name: "Kulak Çınlaması", category: "Sinir Sistemi" },
  { slug: "vertigo", name: "Vertigo", category: "Sinir Sistemi" },
  { slug: "hipertansiyon", name: "Hipertansiyon", category: "Dolaşım" },
  { slug: "dusuk-tansiyon", name: "Düşük Tansiyon", category: "Dolaşım" },
  { slug: "odem", name: "Ödem", category: "Dolaşım" },
  { slug: "kilo-kontrolu", name: "Kilo Kontrolü", category: "Metabolizma" },
];

// ─── İçerik üreticisi ───────────────────────────────────────────────────────
// Her kayıt için tüm bölümleri dolduran gerçekçi, uzman dilinde Türkçe metin
// üretir. İçerikler demo hesabında blur ile korunduğu için kullanıcı yalnızca
// "bu sistemde her rahatsızlık için bu kadar detay doldurulabiliyor" izlenimini alır.

type GuideFields = {
  general_summary: string;
  medical_causes: string;
  subconscious_causes: string;
  temperament_causes: string;
  other_causes: string;
  iridology_match: string;
  hand_analysis_match: string;
  cupping_leech: string;
  reflexology: string;
  diet_recommendations: string;
  herbal_methods: string;
  stone_recommendations: string;
  aromatherapy: string;
  meditation: string;
  breathwork: string;
  bioenergy: string;
  massage: string;
  daily_routine: string;
  sleep_routine: string;
  supportive_alternative_methods: string;
  islamic_recommendations: string;
};

function buildFields(name: string, category: string, idx: number): GuideFields {
  const ad = name.toLocaleLowerCase("tr-TR");
  const fields: GuideFields = {
    general_summary: `${name}, ${category} alanında sık karşılaşılan bir rahatsızlıktır. Bu rehberde ${ad} ile ilişkili olası nedenler, destekleyici uygulamalar ve bütüncül yaklaşımlar uzman bakış açısıyla derlenmiştir. Kişiye özel değerlendirme esastır.`,
    medical_causes: `${name} tablosunda öne çıkan tıbbi nedenler arasında dolaşımsal, hormonal ve yapısal etkenler değerlendirilir. Klinik öykü, fizik muayene ve laboratuvar bulguları birlikte ele alınmalıdır.`,
    subconscious_causes: `Bilinçaltı düzeyde ${ad} çoğu zaman bastırılmış duygular, çözülmemiş çatışmalar ve aşırı kontrol ihtiyacı ile ilişkilendirilir. Kişinin yaşam öyküsündeki tetikleyici dönemler incelenir.`,
    temperament_causes: `Mizaç açısından ${ad} eğilimi, baskın hılt dengesizliği ve kişinin ısı–nem dengesindeki sapmalarla yorumlanır. Sıcak/soğuk ve kuru/nemli mizaç özellikleri göz önünde tutulur.`,
    other_causes: `Çevresel faktörler, beslenme alışkanlıkları, hareketsizlik ve uyku düzenindeki bozulmalar ${ad} sürecini tetikleyebilir veya şiddetlendirebilir.`,
    iridology_match: `İris haritasında ${ad} ile ilişkili bölgede yapısal işaretler, lakün veya renk değişimleri gözlenebilir. Sektörel değerlendirme bütüncül tabloyu destekler.`,
    hand_analysis_match: `El analizinde ilgili parmak ve avuç bölgelerindeki gerginlik çizgileri ile renk tonu değişimleri ${ad} eğilimine işaret edebilir.`,
    cupping_leech: `Hacamat uygulamasında ${ad} için klasik bölgesel noktalar tercih edilir. Sülük tedavisi yalnızca uzman gözetiminde ve uygun kontrendikasyon değerlendirmesiyle planlanır.`,
    reflexology: `Refleksoloji çalışmasında ${ad} ile eşleşen refleks noktalarına nazik ve kademeli basınç uygulanır. Seans süresi kişinin toleransına göre artırılır.`,
    diet_recommendations: `Beslenmede işlenmiş gıdalar ve rafine şeker azaltılır; ${ad} sürecini destekleyen anti-inflamatuar besinler, yeterli su ve lifli gıdalar önerilir.`,
    herbal_methods: `Geleneksel bitkisel desteklerde uygun infüzyon, dekoksiyon ve tentürler ${ad} için tamamlayıcı olarak değerlendirilir. İlaç etkileşimleri kontrol edilmelidir.`,
    stone_recommendations: `Doğaltaş çalışmasında ${ad} için uyumlu taşlar enerji dengeleme amacıyla seçilir, düzenli temizlenir ve niyetle programlanır.`,
    aromatherapy: `Aromaterapide uygun uçucu yağlar taşıyıcı yağla seyreltilerek ${ad} için inhalasyon, masaj veya kompres yoluyla kullanılır. Cilt testi önerilir.`,
    meditation: `Meditasyon pratiğinde farkındalık ve beden taraması teknikleri ${ad} ile gelen gerginliği azaltmaya ve zihinsel dengeyi yeniden kurmaya yardımcı olur.`,
    breathwork: `Nefes çalışmasında diyafram nefesi ve uzatılmış nefes verme, ${ad} sürecinde parasempatik sinir sistemini etkinleştirerek sakinleşme sağlar.`,
    bioenergy: `Biyoenerji çalışmasında ilgili çakra ve enerji kanallarındaki tıkanıklıklar ${ad} açısından taranır ve dengelenir; aura temizliği desteklenir.`,
    massage: `Masaj uygulamasında ilgili bölgelere yumuşak ve ritmik dokunuşlar uygulanır; ${ad} kaynaklı gerginlik gevşetilir ve dolaşım desteklenir.`,
    daily_routine: `Günlük rutinde düzenli hareket, yeterli su tüketimi, açık hava ve ekran molaları ${ad} yönetiminde temel oluşturur.`,
    sleep_routine: `Uyku düzeninde sabit yatış–kalkış saatleri ve uyku öncesi mavi ışık kısıtlaması ${ad} sürecini olumlu etkiler.`,
    supportive_alternative_methods: `Destekleyici olarak yoga, ılık kompres, ofis egzersizleri ve günlük tutma ${ad} ile baş etmede tamamlayıcı yöntemler arasındadır.`,
    islamic_recommendations: `Manevi destek için uygun dua ve zikirler niyet ile okunur; şifanın Allah'tan olduğu bilinciyle sabır, şükür ve tevekkül esas alınır.`,
  };

  // Kayıtlar arasında "dolu bölüm" sayısında doğal çeşitlilik için bazı
  // durumsal alanlar deterministik olarak boş bırakılır.
  if (idx % 2 === 0) fields.hand_analysis_match = "";
  if (idx % 3 === 0) fields.other_causes = "";
  if (idx % 4 === 0) fields.massage = "";

  return fields;
}

// ─── Tarih üreticisi (deterministik) ────────────────────────────────────────

function isoForIndex(idx: number, monthsBack: number): string {
  const month = ((idx + monthsBack) % 6) + 1; // 1..6 → 2026-0X geçerli
  const day = ((idx * 7) % 26) + 2; // 2..27
  const dd = String(day).padStart(2, "0");
  return `2026-0${month}-${dd}T09:00:00.000Z`;
}

// ─── Türetilmiş yapılar (modül yüklenince bir kez hesaplanır) ────────────────

type DemoGuideEntry = {
  seed: SifaSeed;
  fields: GuideFields;
  created_at: string;
  updated_at: string;
  filledCount: number;
};

const DEMO_SIFA_ENTRIES: DemoGuideEntry[] = DEMO_SIFA_SEED.map((seed, idx) => {
  const fields = buildFields(seed.name, seed.category, idx);
  const filledCount = Object.values(fields).filter((v) => v.trim().length > 0).length;
  return {
    seed,
    fields,
    created_at: isoForIndex(idx, 0),
    updated_at: isoForIndex(idx, 2),
    filledCount,
  };
});

const DEMO_SIFA_ENTRY_BY_ID = new Map<string, DemoGuideEntry>(
  DEMO_SIFA_ENTRIES.map((e) => [`${DEMO_SIFA_PREFIX}${e.seed.slug}`, e]),
);

// ─── Liste satırları ────────────────────────────────────────────────────────

export function getDemoGuideListRows(): HealingGuideListRow[] {
  return DEMO_SIFA_ENTRIES.map((entry) => {
    const id = `${DEMO_SIFA_PREFIX}${entry.seed.slug}`;
    return {
      id,
      tenant_id: "demo",
      name: entry.seed.name,
      category: entry.seed.category,
      symptoms: null,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      sectionCount: entry.filledCount,
      sectionTypes: [],
      // Önizleme için özet parçası — demo listede DemoBlur ile korunur.
      sectionSnippets: [entry.fields.general_summary],
    };
  });
}

// ─── Detay ──────────────────────────────────────────────────────────────────

export function getDemoGuideDetail(id: string): HealingGuideDetail | null {
  const entry = DEMO_SIFA_ENTRY_BY_ID.get(id);
  if (!entry) return null;

  const f = entry.fields;
  return {
    guide: {
      id,
      tenant_id: "demo",
      name: entry.seed.name,
      category: entry.seed.category,
      symptoms: null,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      related_stones: null,
      related_reflexology: null,
      legacy: {
        general_summary: f.general_summary || null,
        medical_causes: f.medical_causes || null,
        subconscious_causes: f.subconscious_causes || null,
        temperament_causes: f.temperament_causes || null,
        other_causes: f.other_causes || null,
        iridology_match: f.iridology_match || null,
        hand_analysis_match: f.hand_analysis_match || null,
        cupping_leech: f.cupping_leech || null,
        reflexology: f.reflexology || null,
        diet_recommendations: f.diet_recommendations || null,
        herbal_methods: f.herbal_methods || null,
        stone_recommendations: f.stone_recommendations || null,
        aromatherapy: f.aromatherapy || null,
        meditation: f.meditation || null,
        breathwork: f.breathwork || null,
        bioenergy: f.bioenergy || null,
        massage: f.massage || null,
        daily_routine: f.daily_routine || null,
        sleep_routine: f.sleep_routine || null,
        supportive_alternative_methods: f.supportive_alternative_methods || null,
        islamic_recommendations: f.islamic_recommendations || null,
      },
      images: [],
    },
    sections: [],
  };
}
