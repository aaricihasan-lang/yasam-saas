// Astroloji — Vedik YOGA denetim kataloğu (SAF; istemci de import edebilir). 2026-10-22 (atlas-roxy-vedik-yoga).
//
// KAPSAM KARARI: Sağlayıcının ayrı "yoga tespit" ucu (POST /vedic-astrology/yoga/detect) D1 doğum haritası yanıtının `yogas`
// alanıyla AYNI 48 denetimi, AYNI öğe şemasıyla (id, name, description, result, quality, family, present, suppressedBy, evidence)
// ve AYNI doğum girdisiyle döndürür → MÜKERRER. Yeni teknik / yeni istek YOK; `vedic.d1` isteği, adaptörü ve önbellek anahtarı
// DEĞİŞMEZ. Bu dosya yalnız D1'de zaten kayıtlı olan yoga sonuçlarını Türkçe, kural düzeyinde göstermek için kendi
// (sağlayıcıdan bağımsız) oluşum tanımlarımızı taşır. Sağlayıcının oluşum/etki metinleri yorum katmanında kalır.
//
// KESİN: Sözlükte (301 kayıt) bulunan bir yoga adı HESAPLANMIŞ SAYILMAZ. Ekranda / raporda "oluşuyor / oluşmuyor" yalnız D1
// kaydındaki (hesaplanmış) 48 denetim için gösterilir; Raja Yoga gibi sözlük başlıkları hesap gibi sunulmaz.

import type { VedicYogaFamily } from "./vedic";

/** D1 / tespit ucunun 48 hesaplanan yogası (sağlayıcı kimlikleri; sıra = D1 kaydındaki sıra). */
export const VEDIC_YOGA_DETECT_IDS = [
  "gajakesari", "sunapha", "anapha", "dhurdhura", "kemadruma", "chandramangala", "budhaaditya",
  "ruchaka", "bhadra", "hamsa", "malavya", "sasa",
  "dhana", "daridra", "lakshmi", "dhanamalika",
  "gada", "sakata-2", "vihaga", "sringhataka", "hala", "kamala", "vapee", "yupa", "ishu", "sakti", "danda", "nav", "kuta", "chhatra",
  "chapa-2", "ardhachandra", "chandra", "samudra", "vajra", "yava",
  "rajju", "musala", "nala",
  "sarpa", "mala",
  "gola-2", "yuga", "sula", "kedara", "pasa", "damni", "vallaki",
] as const;
export type VedicYogaDetectId = (typeof VEDIC_YOGA_DETECT_IDS)[number];

export type VedicYogaInfo = {
  /** Sanskritçe ad (ASCII transliterasyon; Word/PDF yazı tiplerinde güvenli). */
  sanskrit: string;
  family: VedicYogaFamily;
  /** Kendi kısa Türkçe oluşum tanımımız (yaşam hükmü DEĞİL). */
  formation: string;
  /** Ekol / kaynak notu (klasik farklılıklar). */
  school: string;
};

const PM_SCHOOL = "Pancha Mahapurusha (BPHS 75). Kendra burada Lagna'dan sayılır; bazı ekoller Ay'dan sayılan kendrayı da kabul eder.";
const NABHASA_SCHOOL = "Nabhasa yogaları (BPHS 35) yedi görünür grahayla sayılır; Rahu ve Ketu sayılmaz. Öncelik: Akriti, Asraya'nın; Akriti, Asraya ve Dala, Sankhya'nın önüne geçer.";
const AKRITI = (houses: string) => `Yedi görünür graha yalnız ${houses} yer alır (Rahu ve Ketu sayılmaz).`;
const SEQ = (from: string, n: number) => `Yedi görünür graha ${from} başlayarak ardışık ${n} bhavaya yayılır (Rahu ve Ketu sayılmaz).`;
const SANKHYA = (n: number) => `Yedi görünür graha tam ${n} farklı rashide bulunur (Rahu ve Ketu sayılmaz).`;

export const VEDIC_YOGA_INFO: Record<VedicYogaDetectId, VedicYogaInfo> = {
  gajakesari: { sanskrit: "Gajakesari", family: "classical", formation: "Jüpiter, Ay'dan sayıldığında bir kendrada (1., 4., 7., 10.) bulunur; klasik koşullara göre geri hareketli olmaması ve doğal zararlı etkisinde olmaması da aranır.", school: "Parashara'nın üç koşullu tanımı; Phaladeepika ve halk geleneği yalnız Ay'dan kendra koşuluyla yetinir." },
  sunapha: { sanskrit: "Sunapha", family: "classical", formation: "Güneş, Rahu ve Ketu dışındaki bir graha Ay'dan 2. rashide bulunur.", school: "BPHS 37 Chandra yogaları. 2. ve 12. ev birlikte doluysa ekoller Durdhura'yı öne alır." },
  anapha: { sanskrit: "Anapha", family: "classical", formation: "Güneş, Rahu ve Ketu dışındaki bir graha Ay'dan 12. rashide bulunur.", school: "BPHS 37 Chandra yogaları. 2. ve 12. ev birlikte doluysa ekoller Durdhura'yı öne alır." },
  dhurdhura: { sanskrit: "Durdhura", family: "classical", formation: "Güneş, Rahu ve Ketu dışındaki grahalar Ay'dan hem 2. hem 12. rashide bulunur.", school: "BPHS 37 Chandra yogaları." },
  kemadruma: { sanskrit: "Kemadruma", family: "classical", formation: "Ay'dan 2. ve 12. rashide (Güneş, Rahu, Ketu dışında) hiçbir graha yoktur; Ay ile birlikte ya da Lagna'dan kendrada graha bulunması yogayı kaldırır.", school: "BPHS 37; iptal (bhanga) koşulları ekole göre değişir (Ay'a kavuşum, kendrada graha, Ay'a bakış)." },
  chandramangala: { sanskrit: "Chandra Mangala", family: "classical", formation: "Ay ile Mars kavuşum ya da karşıtlık içindedir (bu hesapta 10° orb).", school: "Klasik metinlerde aynı rashide birlikte bulunuş; derece orbu modern uygulamadır." },
  budhaaditya: { sanskrit: "Budha-Aditya", family: "classical", formation: "Merkür ile Güneş kavuşum içindedir (bu hesapta 10° orb).", school: "Klasik metinlerde aynı rashide birlikte bulunuş; derece orbu modern uygulamadır. Merkür Güneş'ten en çok ~28° uzaklaşabilir." },
  ruchaka: { sanskrit: "Ruchaka", family: "classical", formation: "Mars, Lagna'dan bir kendrada, kendi burcunda (Koç, Akrep) ya da yücelim burcunda (Oğlak) bulunur.", school: PM_SCHOOL },
  bhadra: { sanskrit: "Bhadra", family: "classical", formation: "Merkür, Lagna'dan bir kendrada, kendi burcunda (İkizler, Başak) ya da yücelim burcunda (Başak) bulunur.", school: PM_SCHOOL },
  hamsa: { sanskrit: "Hamsa", family: "classical", formation: "Jüpiter, Lagna'dan bir kendrada, kendi burcunda (Yay, Balık) ya da yücelim burcunda (Yengeç) bulunur.", school: PM_SCHOOL },
  malavya: { sanskrit: "Malavya", family: "classical", formation: "Venüs, Lagna'dan bir kendrada, kendi burcunda (Boğa, Terazi) ya da yücelim burcunda (Balık) bulunur.", school: PM_SCHOOL },
  sasa: { sanskrit: "Sasa", family: "classical", formation: "Satürn, Lagna'dan bir kendrada, kendi burcunda (Oğlak, Kova) ya da yücelim burcunda (Terazi) bulunur.", school: PM_SCHOOL },
  dhana: { sanskrit: "Dhana", family: "classical", formation: "BPHS 41'deki on bir servet bileşiminden (2., 5., 9., 11. ev lordları ve yerleşimleri) en az biri sağlanır; tek bir karar olarak verilir.", school: "Kural ailesi (BPHS 41.2–14). Hangi kuralın sağlandığı kanıt metninde adıyla yazılır; tek kaynağa dayanan kurallar karara katılmaz." },
  daridra: { sanskrit: "Daridra", family: "classical", formation: "BPHS 42 ve Phaladeepika 6'daki yoksunluk bileşimlerinden (ör. 11. ev lordunun 6., 8., 12. evde bulunması) en az biri sağlanır; tek bir karar olarak verilir.", school: "Kural ailesi (BPHS 42, Phaladeepika 6). Yalnız tek kaynağa dayanan kurallar (B.V. Raman) karara katılmaz." },
  lakshmi: { sanskrit: "Lakshmi", family: "classical", formation: "9. ev lordu kendi, mulatrikona ya da yücelim burcunda ve bir kendra ya da trikonada bulunur; Lagna lordu güçlüdür.", school: "BPHS 36.27–28; yerleşim Raman 27 ile genişletilir. Lagna lordunun gücü; yanma, düşüş ve dusthana yerleşiminin olmaması olarak okunur." },
  dhanamalika: { sanskrit: "Dhana Malika", family: "classical", formation: "Yedi görünür graha 2. evden 8. eve kadar ardışık yedi evi, her eve bir graha düşecek biçimde doldurur.", school: "Malika (çelenk) yogaları, Jataka Parijata 7.132. Rahu ve Ketu sayılmaz." },
  gada: { sanskrit: "Gada", family: "akriti", formation: AKRITI("birbirine komşu iki kendrada (1-4, 4-7, 7-10 ya da 10-1)"), school: NABHASA_SCHOOL },
  "sakata-2": { sanskrit: "Sakata (Nabhasa)", family: "akriti", formation: AKRITI("Lagna'da ve 7. evde"), school: `${NABHASA_SCHOOL} Ay'dan 6./8. Jüpiter ile kurulan Sakata yogasından AYRIDIR.` },
  vihaga: { sanskrit: "Vihaga", family: "akriti", formation: AKRITI("4. ve 10. evde"), school: NABHASA_SCHOOL },
  sringhataka: { sanskrit: "Sringataka", family: "akriti", formation: AKRITI("Lagna ve trikonalarında (1., 5., 9. ev)"), school: NABHASA_SCHOOL },
  hala: { sanskrit: "Hala", family: "akriti", formation: AKRITI("Lagna'yı içermeyen bir üçlüde (2-6-10, 3-7-11 ya da 4-8-12)"), school: NABHASA_SCHOOL },
  kamala: { sanskrit: "Kamala", family: "akriti", formation: AKRITI("dört kendrada (1., 4., 7., 10.); dördü de dolu"), school: NABHASA_SCHOOL },
  vapee: { sanskrit: "Vapi", family: "akriti", formation: AKRITI("dört panaparada (2-5-8-11) ya da dört apoklimada (3-6-9-12)"), school: NABHASA_SCHOOL },
  yupa: { sanskrit: "Yupa", family: "akriti", formation: SEQ("Lagna'dan", 4), school: NABHASA_SCHOOL },
  ishu: { sanskrit: "Ishu (Shara)", family: "akriti", formation: SEQ("4. evden", 4), school: NABHASA_SCHOOL },
  sakti: { sanskrit: "Shakti", family: "akriti", formation: SEQ("7. evden", 4), school: NABHASA_SCHOOL },
  danda: { sanskrit: "Danda", family: "akriti", formation: SEQ("10. evden", 4), school: NABHASA_SCHOOL },
  nav: { sanskrit: "Nauka", family: "akriti", formation: SEQ("Lagna'dan", 7), school: NABHASA_SCHOOL },
  kuta: { sanskrit: "Kuta", family: "akriti", formation: SEQ("4. evden", 7), school: NABHASA_SCHOOL },
  chhatra: { sanskrit: "Chhatra", family: "akriti", formation: SEQ("7. evden", 7), school: NABHASA_SCHOOL },
  "chapa-2": { sanskrit: "Chapa (Dhanus)", family: "akriti", formation: SEQ("10. evden", 7), school: NABHASA_SCHOOL },
  ardhachandra: { sanskrit: "Ardhachandra", family: "akriti", formation: "Yedi görünür graha bir panapara ya da apoklima evinden başlayarak ardışık yedi bhavaya yayılır (Rahu ve Ketu sayılmaz).", school: NABHASA_SCHOOL },
  chandra: { sanskrit: "Chakra", family: "akriti", formation: AKRITI("altı tek evde (1., 3., 5., 7., 9., 11.)"), school: `${NABHASA_SCHOOL} Kimlik "chandra" olsa da yoga Chakra'dır.` },
  samudra: { sanskrit: "Samudra", family: "akriti", formation: AKRITI("altı çift evde (2., 4., 6., 8., 10., 12.)"), school: NABHASA_SCHOOL },
  vajra: { sanskrit: "Vajra", family: "akriti", formation: "Doğal iyicil grahalar Lagna'da ve 7. evde, doğal zararlılar 4. ve 10. evde bulunur.", school: `${NABHASA_SCHOOL} Ay'ın iyicil/zararlı sayılması ekole göre değişir.` },
  yava: { sanskrit: "Yava", family: "akriti", formation: "Doğal iyicil grahalar 4. ve 10. evde, doğal zararlılar Lagna'da ve 7. evde bulunur.", school: `${NABHASA_SCHOOL} Ay'ın iyicil/zararlı sayılması ekole göre değişir.` },
  rajju: { sanskrit: "Rajju", family: "asraya", formation: "Yedi görünür grahanın tamamı hareketli (chara) burçlardadır: Koç, Yengeç, Terazi, Oğlak.", school: NABHASA_SCHOOL },
  musala: { sanskrit: "Musala", family: "asraya", formation: "Yedi görünür grahanın tamamı sabit (sthira) burçlardadır: Boğa, Aslan, Akrep, Kova.", school: NABHASA_SCHOOL },
  nala: { sanskrit: "Nala", family: "asraya", formation: "Yedi görünür grahanın tamamı çift yönlü (dwiswabhava) burçlardadır: İkizler, Başak, Yay, Balık.", school: NABHASA_SCHOOL },
  sarpa: { sanskrit: "Sarpa", family: "dala", formation: "Doğal zararlı grahalar (Güneş, Mars, Satürn) kendralarda bulunur ve hiçbir iyicil graha kendrada değildir.", school: `${NABHASA_SCHOOL} Klasik metinde üç kendra; Ay'ın sınıfı ekole göre değişir.` },
  mala: { sanskrit: "Mala (Srik)", family: "dala", formation: "Doğal iyicil grahalar (Merkür, Venüs, Jüpiter) kendralarda bulunur ve hiçbir zararlı graha kendrada değildir.", school: `${NABHASA_SCHOOL} Klasik metinde üç kendra; Ay'ın sınıfı ekole göre değişir.` },
  "gola-2": { sanskrit: "Gola", family: "sankhya", formation: SANKHYA(1), school: NABHASA_SCHOOL },
  yuga: { sanskrit: "Yuga", family: "sankhya", formation: SANKHYA(2), school: NABHASA_SCHOOL },
  sula: { sanskrit: "Shoola", family: "sankhya", formation: SANKHYA(3), school: NABHASA_SCHOOL },
  kedara: { sanskrit: "Kedara", family: "sankhya", formation: SANKHYA(4), school: NABHASA_SCHOOL },
  pasa: { sanskrit: "Pasha", family: "sankhya", formation: SANKHYA(5), school: NABHASA_SCHOOL },
  damni: { sanskrit: "Damini", family: "sankhya", formation: SANKHYA(6), school: NABHASA_SCHOOL },
  vallaki: { sanskrit: "Veena (Vallaki)", family: "sankhya", formation: SANKHYA(7), school: NABHASA_SCHOOL },
};

export function isVedicYogaDetectId(id: unknown): id is VedicYogaDetectId {
  return typeof id === "string" && (VEDIC_YOGA_DETECT_IDS as readonly string[]).includes(id);
}

/** Kayıttaki sonuç durumu (yalnız hesaplanmış denetimlerden). */
export type VedicYogaStatus = "present" | "suppressed" | "absent";
export const VEDIC_YOGA_STATUS_LABELS: Record<VedicYogaStatus, string> = {
  present: "Oluşuyor",
  suppressed: "Bastırıldı (kural sağlandı)",
  absent: "Oluşmuyor",
};
/** Geleneksel nitelik sınıfı (hüküm değil; klasik metnin sınıflaması). */
export const VEDIC_YOGA_QUALITY_LABELS: Record<"positive" | "negative" | "both", string> = { positive: "Olumlu", negative: "Olumsuz", both: "Karma" };

/** Bağımsız kural denetimi (D1 graha konumlarından; sağlayıcı kararına BAKMADAN). */
export type VedicYogaRuleState = "holds" | "fails" | "uncertain" | "not_checked";
/** Sağlayıcı kararı ile bağımsız denetimin karşılaştırması. */
export type VedicYogaConsistency = "consistent" | "inconsistent" | "uncertain" | "not_checked";
export const VEDIC_YOGA_CONSISTENCY_LABELS: Record<VedicYogaConsistency, string> = {
  consistent: "Uyumlu",
  inconsistent: "Uyuşmazlık",
  uncertain: "Ekole bağlı",
  not_checked: "Denetlenmedi",
};

export const VEDIC_YOGA_METHOD_TEXT =
  "Yoga denetimleri D1 (Rashi) hesabıyla aynı anda, aynı doğum verisiyle yapılır; ayrı bir hesap isteği gerekmez. Durum, nitelik ve kanıt hesap servisinin kararıdır. Oluşum kuralı ve ekol notu klasik tanımdır. Bağımsız denetim, kural tabanlı yogaları (Pancha Mahapurusha, Budha-Aditya, Chandra Mangala, Chandra yogaları, Nabhasa dağılımları, Dhana Malika) D1 graha konumlarından yeniden sınar; ekolden ekole değişen koşullarda \"Ekole bağlı\" yazar.";
export const VEDIC_YOGA_DICTIONARY_NOTE =
  "Yalnız bu haritada hesaplanan 48 yoga denetimi listelenir. Klasik yoga sözlüğündeki diğer başlıklar (ör. Raja Yoga, Parivartana, Viparita Raja) bu haritada hesaplanmadığı için oluştu ya da oluşmadı olarak gösterilmez.";
