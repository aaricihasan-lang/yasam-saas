/**
 * lib/cosmic/transit-interpretations.ts
 * Gezegen × Burç transit yorumları — 10 gezegen × 12 burç = 120 kombinasyon.
 *
 * Amaç: "Kozmik hava durumu" mantığında kısa, öğretici, profesyonel Türkçe yorumlar.
 * Fal dili yok. Natal harita yok. Kişiye özel değil.
 * Uygulama crash etmesin: bilinmeyen kombinasyon → güvenli fallback.
 */

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type TransitInterpretation = {
  planet:   string;
  sign:     string;
  symbol:   string;
  title:    string;
  summary:  string;
  tags:     string[];
  caution?: string;
};

// ─── Gezegen sembolleri ───────────────────────────────────────────────────────

export const PLANET_SYMBOLS: Record<string, string> = {
  "Güneş":  "☉", "Ay":     "☽", "Merkür": "☿",
  "Venüs":  "♀", "Mars":   "♂", "Jüpiter":"♃",
  "Satürn": "♄", "Uranüs": "♅", "Neptün": "♆", "Plüton": "♇",
};

// ─── Transit yorum sözlüğü ────────────────────────────────────────────────────

type Entry = { title: string; summary: string; tags: string[]; caution?: string };

const TRANSITS: Record<string, Record<string, Entry>> = {

  // ── GÜNEŞ ☉ ──────────────────────────────────────────────────────────────
  "Güneş": {
    "Koç":     { title: "Öncülük Dönemi",              summary: "Güneş Koç'ta başlangıçlara, girişimciliğe ve kişisel inisiyatife enerji katar.",           tags: ["Başlangıç", "Liderlik", "Enerji"],     caution: "Aceleci kararlar sonradan yük olabilir." },
    "Boğa":    { title: "Sabır ve İnşa Zamanı",        summary: "Boğa'daki Güneş, kalıcı değerler ve güvenilir temeller oluşturmayı destekler.",            tags: ["Sebat", "Değer", "Güvenlik"],           caution: "Değişime karşı direnç fırsatları kaçırabilir." },
    "İkizler": { title: "Merak ve İletişim Mevsimi",   summary: "İkizler'deki Güneş, bilgi alışverişini ve çok yönlü bakış açılarını ön plana çıkarır.",    tags: ["İletişim", "Esneklik", "Merak"],        caution: "Odak dağınıklığı ve yüzeysellik tehlikesi." },
    "Yengeç":  { title: "Kök ve Aile Dönemi",          summary: "Yengeç'teki Güneş, iç dünyaya ve aile bağlarına yatırım yapmayı destekler.",              tags: ["Aile", "Duygu", "Koruma"],             caution: "Aşırı içe kapanma ve savunmacılık." },
    "Aslan":   { title: "Yaratıcılık ve Görünürlük",   summary: "Aslan'daki Güneş, özgün ifadeyi ve liderliği destekler; sahneye çıkma zamanıdır.",         tags: ["Yaratıcılık", "Özgüven", "Liderlik"],   caution: "Ego merkezlilik ihtiyacı artabilir." },
    "Başak":   { title: "Analiz ve İyileştirme",        summary: "Başak'taki Güneş, detaylara odaklanmayı ve verimliliği artırmayı destekler.",             tags: ["Analiz", "Düzen", "Sağlık"],            caution: "Aşırı eleştiri ve mükemmeliyetçilik." },
    "Terazi":  { title: "Denge ve İlişki Mevsimi",     summary: "Terazi'deki Güneş, ortaklıkları, adaleti ve uyumu öne çıkarır.",                           tags: ["Denge", "İlişki", "Adalet"],            caution: "Karar vermekten kaçınma eğilimi." },
    "Akrep":   { title: "Dönüşüm ve Derinlik",         summary: "Akrep'teki Güneş, yüzeyin altına inmeyi ve derin dönüşümleri destekler.",                  tags: ["Dönüşüm", "Güç", "Derinlik"],           caution: "Kontrol ihtiyacı ve gizlilik eğilimi." },
    "Yay":     { title: "Büyüme ve Keşif Mevsimi",     summary: "Yay'daki Güneş, büyük resme bakışı ve felsefi genişlemeyi destekler.",                     tags: ["Büyüme", "Özgürlük", "Vizyon"],         caution: "Aşırı iyimserlik ve plansız risk alma." },
    "Oğlak":   { title: "Yapı ve Hedef Dönemi",        summary: "Oğlak'taki Güneş, uzun vadeli hedeflere ve disiplinli ilerlemeye odaklanır.",              tags: ["Kariyer", "Disiplin", "Yapı"],          caution: "Katılık ve aşırı çalışma." },
    "Kova":    { title: "Yenilik ve Kolektif Enerji",  summary: "Kova'daki Güneş, toplulukları, yenilikleri ve alışılmadık fikirleri öne çıkarır.",         tags: ["Yenilik", "Bağımsızlık", "Topluluk"],   caution: "Duygusal mesafe ve kopukluk." },
    "Balık":   { title: "Sezgi ve Ruhsal Derinlik",    summary: "Balık'taki Güneş, empatiyi, sezgiyi ve manevi arayışı destekler.",                         tags: ["Sezgi", "Empati", "Ruhsallık"],         caution: "Gerçeklikten kopma ve sınır koyamama." },
  },

  // ── AY ☽ ─────────────────────────────────────────────────────────────────
  "Ay": {
    "Koç":     { title: "Anlık Motivasyon",            summary: "Ay'ın Koç geçişi, dürtüsel tepkileri ve ani inisiyatifleri aktive eder; enerji yüksek.",   tags: ["Enerji", "Ateş", "Dürtü"],             caution: "Sabırsızlık ve ani öfke olabilir." },
    "Boğa":    { title: "Huzur ve Güven İhtiyacı",    summary: "Boğa'daki Ay, konfor, güvenlik ve somut hazlara yönelmeyi destekler.",                     tags: ["Huzur", "Konfor", "Sükunet"],           caution: "Değişime direnç ve inat göze çarpabilir." },
    "İkizler": { title: "Zihin ve İletişim Hızı",     summary: "İkizler'deki Ay, zihinsel hareketliliği artırır; sohbet ve öğrenme için uygun gün.",       tags: ["Merak", "İletişim", "Hız"],             caution: "Kararsızlık ve dağınık dikkat." },
    "Yengeç":  { title: "Duygu Yüksek",               summary: "Yengeç'te Ay en güçlü halindedir; empati, koruma ve iç ses belirginleşir.",                tags: ["Duygu", "Empati", "Aile"],             caution: "Hassasiyet ve ruh hali dalgalanmaları artabilir." },
    "Aslan":   { title: "Görünme ve Takdir İhtiyacı", summary: "Aslan'daki Ay, ifade özgürlüğü ve takdir görme duygusunu ön plana taşır.",                 tags: ["Gurur", "Cömertlik", "Sıcaklık"],       caution: "Ego kırılganlığı ve drama eğilimi." },
    "Başak":   { title: "Pratik ve Detay Odağı",      summary: "Başak'taki Ay, verimliliği ve günlük rutinleri düzeltme isteğini güçlendirir.",            tags: ["Pratik", "Düzen", "Sağlık"],            caution: "Aşırı eleştiri ve kaygı." },
    "Terazi":  { title: "İlişki ve Estetik Dengesi",  summary: "Terazi'deki Ay, sosyal uyumu, güzelliği ve ortaklık ilişkilerini destekler.",              tags: ["Uyum", "Güzellik", "Sosyal"],           caution: "Karar verememe ve çatışmadan kaçınma." },
    "Akrep":   { title: "Duygusal Yoğunluk",          summary: "Akrep'teki Ay, derin duyguları ve gizli gerçekleri yüzeye çıkarma eğilimi gösterir.",     tags: ["Yoğunluk", "Sezgi", "Derinlik"],        caution: "Kıskançlık ve duygusal karmaşa olabilir." },
    "Yay":     { title: "Özgürlük ve İyimserlik",     summary: "Yay'daki Ay, macera isteğini ve geniş bakış açısını destekler; hafif ve özgür bir gün.",  tags: ["Özgürlük", "İyimserlik", "Macera"],     caution: "Sorumluluktan kaçma eğilimi." },
    "Oğlak":   { title: "Soğukkanlılık ve Yapı",      summary: "Oğlak'taki Ay, pratik sorumlulukları ve duygusal kontrol ihtiyacını öne çıkarır.",        tags: ["Kontrol", "Sorumluluk", "Yapı"],        caution: "Duygusal mesafe ve soğukluk hissi." },
    "Kova":    { title: "Bağımsızlık ve Farklılık",   summary: "Kova'daki Ay, sıra dışı düşünceyi ve topluluk bağlılığını destekler.",                    tags: ["Bağımsızlık", "Yenilik", "Topluluk"],   caution: "Duygusal kopukluk ve soğukluk." },
    "Balık":   { title: "Sezgi ve Empati Doruk",      summary: "Balık'taki Ay, derin empatiyi ve sezgisel iletişimi destekler; rüyalar ve sanat güçlü.",   tags: ["Sezgi", "Şefkat", "Hayal"],             caution: "Sınırlar bulanıklaşabilir, gerçeklikten kopma olabilir." },
  },

  // ── MERKÜR ☿ ─────────────────────────────────────────────────────────────
  "Merkür": {
    "Koç":     { title: "Hızlı ve Doğrudan Düşünce",       summary: "Koç'taki Merkür, doğrudan iletişim ve hızlı karar almayı destekler.",                 tags: ["Netlik", "Hız", "Karar"],            caution: "Düşünmeden konuşma ve sabırsız tartışma." },
    "Boğa":    { title: "Pratik ve Ölçülü İletişim",       summary: "Boğa'daki Merkür, somut ve güvenilir düşünce biçimini destekler.",                    tags: ["Pratiklik", "Güven", "Sabır"],        caution: "Yeni fikirlere kapalılık ve yavaş yanıt." },
    "İkizler": { title: "Çok Yönlü Zeka",                  summary: "İkizler'de evindeki Merkür, öğrenme, yazma ve sohbet için en güçlü konumdadır.",      tags: ["İletişim", "Zeka", "Esneklik"],       caution: "Yüzeysellik ve dağınıklık tehlikesi." },
    "Yengeç":  { title: "Duygusal Zeka ve Sezgi",          summary: "Yengeç'teki Merkür, sözlerin duygusal derinliğini artırır; empatiyle iletişim.",      tags: ["Empati", "Sezgi", "Duygu"],           caution: "Öznellik ve geçmişe takılma." },
    "Aslan":   { title: "Karizmatik Anlatım",              summary: "Aslan'daki Merkür, özgün ve etkileyici sunum becerilerini destekler.",                 tags: ["Karizmatik", "Özgün", "Sunum"],       caution: "Drama ve abartma eğilimi." },
    "Başak":   { title: "Analitik Düşünce Doruk",          summary: "Başak'ta Merkür, analiz ve pratik çözüm bulmada en güçlü konumdadır.",                tags: ["Analiz", "Kesinlik", "Pratik"],        caution: "Gereğinden fazla ayrıntıcılık." },
    "Terazi":  { title: "Diplomatik Düşünce",              summary: "Terazi'deki Merkür, müzakere becerilerini ve adil değerlendirmeyi destekler.",         tags: ["Denge", "Müzakere", "Adalet"],         caution: "Kararsızlık ve her iki tarafı da savunma." },
    "Akrep":   { title: "Derin ve Araştırmacı Düşünce",   summary: "Akrep'teki Merkür, yüzeyin altını kazımayı ve gizli bilgilere ulaşmayı destekler.",   tags: ["Araştırma", "Derinlik", "Sır"],        caution: "Şüphecilik ve gizlilik." },
    "Yay":     { title: "Büyük Resim Düşüncesi",           summary: "Yay'daki Merkür, felsefi bakış açısını ve geniş vizyonu destekler.",                  tags: ["Vizyon", "Felsefe", "Özgürlük"],       caution: "Detayları kaçırma ve aşırı genelleme." },
    "Oğlak":   { title: "Stratejik ve Yapılandırılmış",   summary: "Oğlak'taki Merkür, planlama, organizasyon ve pratik stratejileri destekler.",          tags: ["Strateji", "Plan", "Yapı"],            caution: "Katı düşünce ve yaratıcılığı kısıtlama." },
    "Kova":    { title: "Yenilikçi ve Bağımsız Düşünce",  summary: "Kova'daki Merkür, alışılmadık fikirleri ve kolektif çözümleri destekler.",            tags: ["Yenilik", "Bağımsızlık", "Teknoloji"], caution: "Pratiklikten kopma ve aşırı soyutlama." },
    "Balık":   { title: "Sezgisel ve Sanatsal Düşünce",   summary: "Balık'taki Merkür, hayal gücünü ve sezgisel anlayışı güçlendirir.",                   tags: ["Sezgi", "Hayal", "Sanat"],             caution: "Belirsizlik ve gerçeklikten kopma." },
  },

  // ── VENÜS ♀ ──────────────────────────────────────────────────────────────
  "Venüs": {
    "Koç":     { title: "Tutkulu ve Anlık Çekim",          summary: "Koç'taki Venüs, romantik ilişkilerde ateşli başlangıçları ve anlık çekimi destekler.", tags: ["Tutku", "Anlık", "Ateş"],             caution: "Sabırsızlık ve çabuk soğuma riski." },
    "Boğa":    { title: "Güzellik ve Güvenlik",            summary: "Boğa'da evindeki Venüs, duygusal güvenliği ve estetik zevkleri destekler.",           tags: ["Güvenlik", "Estetik", "Sadakat"],      caution: "Sahiplenici tutum ve değişime direnç." },
    "İkizler": { title: "Flörtöz ve Çok Yönlü İlişkiler", summary: "İkizler'deki Venüs, entelektüel sohbet ve çeşitlilik üzerine kurulu ilişkileri öne çıkarır.", tags: ["Sohbet", "Çeşitlilik", "Zeka"],   caution: "Derin bağ kurmada güçlük." },
    "Yengeç":  { title: "Besleyici ve Koruyucu Sevgi",    summary: "Yengeç'teki Venüs, koruyucu sevgiyi, yuvayı ve duygusal güvenliği destekler.",        tags: ["Koruma", "Yuva", "Empati"],            caution: "Bağımlılık eğilimi ve kırılganlık." },
    "Aslan":   { title: "Gösterişli ve Cömert Sevgi",     summary: "Aslan'daki Venüs, dramatik, sıcak ve görkemli aşkı destekler; sanat ve lüks öne çıkar.", tags: ["Cömertlik", "Sıcaklık", "Sanat"],   caution: "Tanınma ihtiyacı ve kibir." },
    "Başak":   { title: "Pratik ve Hizmet Odaklı Sevgi",  summary: "Başak'taki Venüs, sevgiyi eylemle ve günlük ilgiyle göstermeyi destekler.",           tags: ["Pratik", "Hizmet", "Özen"],            caution: "Aşırı eleştiri ve romantizmi zorlamak." },
    "Terazi":  { title: "Uyumlu ve Adil İlişkiler",       summary: "Terazi'de evindeki Venüs, ortaklıkları, estetiği ve harmonik ilişkileri destekler.",   tags: ["Uyum", "Estetik", "Adalet"],           caution: "Kendi ihtiyaçları geri plana itilebilir." },
    "Akrep":   { title: "Derin ve Dönüştürücü Bağlar",    summary: "Akrep'teki Venüs, yoğun, dönüştürücü ve derin bağlılık gerektiren ilişkileri destekler.", tags: ["Yoğunluk", "Dönüşüm", "Sadakat"],  caution: "Kıskançlık ve güvensizlik." },
    "Yay":     { title: "Maceraperest ve Özgür Sevgi",    summary: "Yay'daki Venüs, özgürlük, yolculuk ve felsefi paylaşıma dayanan ilişkileri destekler.", tags: ["Özgürlük", "Macera", "Felsefe"],      caution: "Bağlanmaktan kaçınma ve tutarsızlık." },
    "Oğlak":   { title: "Ciddi ve Uzun Vadeli Bağlılık",  summary: "Oğlak'taki Venüs, kalıcı ve güvenilir ilişkileri ve statüyü öne çıkarır.",            tags: ["Bağlılık", "Güvenilirlik", "Yapı"],   caution: "Duygusal mesafe ve katı beklentiler." },
    "Kova":    { title: "Özgün ve Bağımsız İlişkiler",    summary: "Kova'daki Venüs, alışılmadık, özgür ve entelektüel temelli ilişkileri destekler.",     tags: ["Bağımsızlık", "Dostluk", "Yenilik"],  caution: "Duygusal soğukluk ve konvansiyonel bağ güçlüğü." },
    "Balık":   { title: "Romantik ve Özverili Sevgi",     summary: "Balık'taki Venüs, idealist, empatik ve sınırları aşan derin aşkı destekler.",          tags: ["Romantizm", "Empati", "İdeal"],        caution: "Gerçekçi olmayan beklentiler ve hayal kırıklığı." },
  },

  // ── MARS ♂ ───────────────────────────────────────────────────────────────
  "Mars": {
    "Koç":     { title: "Ham Enerji ve Cesaret",           summary: "Koç'ta evindeki Mars, inisiyatif ve cesaret için en güçlü konumundadır; eylem zamanı.", tags: ["Eylem", "Cesaret", "Enerji"],        caution: "Öfke patlamaları ve aceleci kararlar." },
    "Boğa":    { title: "Yavaş Ama Kararlı Güç",          summary: "Boğa'daki Mars, uzun vadeli kararlılığı ve fiziksel dayanıklılığı destekler.",        tags: ["Kararlılık", "Dayanıklılık", "Sabır"], caution: "Hareketsizlik ve inat." },
    "İkizler": { title: "Çoğul Eylem ve Hız",             summary: "İkizler'deki Mars, birden fazla alanda hızlı eylem almayı ve sözlü gücü destekler.", tags: ["Hız", "Çokluk", "İletişim"],           caution: "Dağınıklık ve tamamlanmayan projeler." },
    "Yengeç":  { title: "Koruyucu Güç",                   summary: "Yengeç'teki Mars, sevdiklerini koruma güdüsünü güçlendirir; duygusal enerji ön planda.", tags: ["Koruma", "Duygusal Güç", "Yurt"],    caution: "Dolaylı öfke ve pasif-agresif tutum." },
    "Aslan":   { title: "Dramatik ve Yaratıcı Enerji",    summary: "Aslan'daki Mars, sanatsal projeler ve liderlik eylemleri için güçlü enerji verir.",   tags: ["Liderlik", "Yaratıcılık", "Güç"],      caution: "Bencillik ve aşırı rekabetçilik." },
    "Başak":   { title: "Verimli ve Hassas Eylem",         summary: "Başak'taki Mars, analitik çalışma ve sağlık odaklı eylemleri destekler.",            tags: ["Verimlilik", "Analiz", "Sağlık"],      caution: "Mükemmeliyetçi blok ve eleştiri silahı." },
    "Terazi":  { title: "Stratejik ve Diplomatik Güç",    summary: "Terazi'deki Mars, müzakere yoluyla kazanmayı ve adalet için mücadeleyi destekler.",   tags: ["Strateji", "Adalet", "Denge"],         caution: "Eylemde kararsızlık ve kaçınma." },
    "Akrep":   { title: "Yoğun ve Stratejik Güç",         summary: "Akrep'teki Mars, odaklanmış ve dönüştürücü bir eylem gücü sunar.",                   tags: ["Strateji", "Yoğunluk", "Güç"],        caution: "İntikam ve obsesyon riski." },
    "Yay":     { title: "Ateşli ve Özgür Enerji",         summary: "Yay'daki Mars, büyük ideallar uğruna coşkulu eylem ve serüven için güçlü enerji verir.", tags: ["Coşku", "Özgürlük", "Vizyon"],       caution: "Plansız atılım ve sorumluluktan kaçış." },
    "Oğlak":   { title: "Kararlı ve Hesaplı Güç",         summary: "Oğlak'ta Mars güçlüdür; uzun vadeli hedeflere yönelik sistematik eylem desteklenir.",  tags: ["Kararlılık", "Sistematik", "Kariyer"], caution: "Katılık ve aşırı çalışma." },
    "Kova":    { title: "Yenilikçi ve Kolektif Enerji",   summary: "Kova'daki Mars, toplumsal değişim ve yenilik için kolektif eylem gücü verir.",        tags: ["Yenilik", "Değişim", "Topluluk"],      caution: "Duygusal kopukluk ve dengesiz enerji." },
    "Balık":   { title: "Sezgisel ve Özverili Eylem",     summary: "Balık'taki Mars, manevi amaçlar ve yaratıcı projeler için derin motivasyon sunar.",    tags: ["Sezgi", "Özveri", "Yaratıcılık"],      caution: "Enerji kaybı ve mağdur rolüne girme eğilimi." },
  },

  // ── JÜPİTER ♃ ────────────────────────────────────────────────────────────
  "Jüpiter": {
    "Koç":     { title: "Fırsatlar ve Cesaret",            summary: "Koç'taki Jüpiter, cesur adımlar atma ve yeni fırsatlara açılma dönemini destekler.", tags: ["Fırsat", "Büyüme", "Cesaret"],         caution: "Aşırı güven ve plansız risk alma." },
    "Boğa":    { title: "Maddi Bolluk ve Güvenlik",        summary: "Boğa'daki Jüpiter, finansal büyümeyi ve somut varlık inşasını destekler.",          tags: ["Bolluk", "Güvenlik", "Maddi Büyüme"],  caution: "Aşırı harcama ve rahatlama eğilimi." },
    "İkizler": { title: "Bilgi Patlaması ve İletişim",     summary: "İkizler'deki Jüpiter, öğrenme ve iletişim alanlarında genişleme fırsatı sunar.",    tags: ["Öğrenme", "İletişim", "Çeşitlilik"],   caution: "Odak kaybı ve dağınık enerji." },
    "Yengeç":  { title: "Aile ve Duygusal Büyüme",        summary: "Yengeç'teki Jüpiter, aile bağlarını güçlendirir ve duygusal iyileşme fırsatları sunar.", tags: ["Aile", "Duygusal Büyüme", "Yuva"],  caution: "Aşırı koruma ve sınır kaybı." },
    "Aslan":   { title: "Yaratıcı Refah ve Tanınma",      summary: "Aslan'daki Jüpiter, yaratıcı yeteneklerin tanınması için altın dönem sunar.",        tags: ["Tanınma", "Yaratıcılık", "Liderlik"],  caution: "Ego şişkinliği ve fazla güçlü davranış." },
    "Başak":   { title: "Beceri ve Hizmet Büyümesi",      summary: "Başak'taki Jüpiter, ustalık geliştirme ve hizmet alanlarında genişleme fırsatı sunar.", tags: ["Ustalık", "Hizmet", "Gelişim"],       caution: "Aşırı analiz ve küçük şeylere takılma." },
    "Terazi":  { title: "İlişki ve Adalet Genişlemesi",   summary: "Terazi'deki Jüpiter, ortaklıklar, adalet ve diplomasi alanlarında büyüme getirir.",  tags: ["Ortaklık", "Adalet", "Genişleme"],     caution: "Aşırı denge arayışı ve karar vermede gecikme." },
    "Akrep":   { title: "Derin Dönüşüm ve Güçlenme",      summary: "Akrep'teki Jüpiter, derin araştırma ve yatırım alanlarında güçlü büyüme fırsatı sunar.", tags: ["Dönüşüm", "Araştırma", "Güç"],     caution: "Obsesyon ve güç sarhoşluğu riski." },
    "Yay":     { title: "Bilgelik ve Özgürlük Doruk",     summary: "Kendi burcunda Jüpiter, vizyon, bilgelik ve büyüme için en güçlü konumundadır.",     tags: ["Vizyon", "Bilgelik", "Özgürlük"],      caution: "Sınır tanımazlık ve abartı." },
    "Oğlak":   { title: "Yapısal Büyüme ve Kariyer",      summary: "Oğlak'taki Jüpiter, kariyer ve kurumsal büyüme için sistematik fırsatlar sunar.",    tags: ["Kariyer", "Yapı", "Başarı"],           caution: "Aşırı ciddiyet ve katı beklentiler." },
    "Kova":    { title: "Toplumsal Vizyon ve Yenilik",    summary: "Kova'daki Jüpiter, toplumsal değişim ve teknolojik yenilik için büyüme fırsatı sunar.", tags: ["Vizyon", "Yenilik", "Topluluk"],      caution: "Gerçekçi olmayan idealizm." },
    "Balık":   { title: "Manevi Büyüme ve Şefkat",        summary: "Balık'taki Jüpiter, sezgi, şefkat ve manevi gelişim için güçlü bir dönem sunar.",    tags: ["Şefkat", "Sezgi", "Ruhsallık"],        caution: "Gerçekçilikten kopma ve sınır kaybı." },
  },

  // ── SATÜRN ♄ ─────────────────────────────────────────────────────────────
  "Satürn": {
    "Koç":     { title: "Disiplin ve Cesaret Sınavı",     summary: "Satürn Koç etkisi, kişinin cesaretini plansız ataklarla değil kontrollü sorumlulukla göstermesini ister.", tags: ["Disiplin", "Cesaret", "Sorumluluk"], caution: "Sabırsız kararlar ve gereksiz inat yorucu olabilir." },
    "Boğa":    { title: "Sağlam Temel İnşası",            summary: "Boğa'daki Satürn, finansal disiplini ve kalıcı değer inşasını ciddi biçimde destekler.", tags: ["Temel", "Finansal Disiplin", "Sabır"],caution: "Aşırı tasarruf ve zevkten yoksunluk." },
    "İkizler": { title: "Düşünce ve İletişimde Yapı",    summary: "İkizler'deki Satürn, dağınık düşünceleri disipline etmek ve net iletişim kurmayı öne çıkarır.", tags: ["Yapı", "Netlik", "İletişim"],        caution: "Yoğun zihinsel baskı ve konuşma güçlükleri." },
    "Yengeç":  { title: "Duygusal Sorumluluk",            summary: "Yengeç'teki Satürn, duygusal olgunluk ve aile sorumluluklarıyla yüzleşmeyi gerektirir.", tags: ["Olgunluk", "Sorumluluk", "Kök"],      caution: "Duygusal çekilme ve bağlanma korkusu." },
    "Aslan":   { title: "Öz Disiplin ve Gerçek Liderlik",summary: "Aslan'daki Satürn, ego testleriyle gerçek liderlik kapasitesini inşa etmeyi destekler.",  tags: ["Disiplin", "Liderlik", "Güç"],        caution: "Yaratıcılığı kısıtlayan aşırı sertlik." },
    "Başak":   { title: "Mükemmellik Yerine Süreç",       summary: "Başak'taki Satürn, analitik yetenekleri sorumlulukla birleştirmeyi ve hizmet disiplinini destekler.", tags: ["Süreç", "Sorumluluk", "Analiz"],    caution: "Aşırı öz eleştiri ve tükenmişlik riski." },
    "Terazi":  { title: "Adil ve Kalıcı İlişkiler",       summary: "Terazi'deki Satürn, ilişkilerde ciddi bağlılığı ve adalet ilkesini sınar.",            tags: ["Adalet", "Bağlılık", "Denge"],        caution: "Yük haline gelen ilişkiler ve katı beklentiler." },
    "Akrep":   { title: "Derin Dönüşüm ve Yapılandırma", summary: "Akrep'teki Satürn, gücü, kontrolü ve korkuları disiplinli biçimde dönüştürmeyi gerektirir.", tags: ["Dönüşüm", "Yapı", "Derinlik"],     caution: "Obsesyon, kontrol baskısı ve sertlik." },
    "Yay":     { title: "Gerçek Özgürlüğün Sınırları",   summary: "Yay'daki Satürn, büyük vizyonları pratik plan ve sorumlulukla dengelemeyi öğretir.",    tags: ["Sorumluluk", "Vizyon", "Disiplin"],   caution: "Kısıtlanmış özgürlük ve dogmatizm." },
    "Oğlak":   { title: "Otorite ve Uzun Vadeli Yapı",   summary: "Kendi burcunda Satürn, kariyer ve kurumsal yapılar için en disiplinli ve güçlü konumundadır.", tags: ["Kariyer", "Yapı", "Otorite"],      caution: "Aşırı sertlik ve esneksizlik." },
    "Kova":    { title: "Toplumsal Yapının Testi",        summary: "Kova'daki Satürn, kolektif sorumluluk ve toplumsal kuralları yeniden yapılandırmayı destekler.", tags: ["Yapı", "Topluluk", "Reform"],     caution: "Bireyciliği bastıran toplu kurallar." },
    "Balık":   { title: "Sınır ve Empati Dengesi",        summary: "Balık'taki Satürn, manevi sorumlulukları ve empatinin sınırlarını disipline etmeyi gerektirir.", tags: ["Sınır", "Empati", "Manevi"],       caution: "Gerçeklikten kaçış ve öz kurban riski." },
  },

  // ── URANÜS ♅ ─────────────────────────────────────────────────────────────
  "Uranüs": {
    "Koç":     { title: "Radikal Yenilenme",              summary: "Koç'taki Uranüs, toplumda ani ve devrimci başlangıçları tetikler.",                    tags: ["Devrim", "Yenilenme", "Değişim"],      caution: "Kaotik ani değişimler ve bitmemiş projeler." },
    "Boğa":    { title: "Finansal ve Değer Devrimi",      summary: "Boğa'daki Uranüs, para ve değer sistemlerinde köklü dönüşümleri tetikler.",           tags: ["Finansal Değişim", "Değerler", "Yenilik"], caution: "Ekonomik istikrarsızlık." },
    "İkizler": { title: "Teknoloji ve İletişim Devrimi",  summary: "İkizler'deki Uranüs, iletişim teknolojilerinde köklü değişimler getirir.",            tags: ["Teknoloji", "İletişim", "Devrim"],     caution: "Bilgi aşırı yükü ve bağlantı karmaşası." },
    "Yengeç":  { title: "Aile ve Toplum Yapısında Kırılma", summary: "Yengeç'teki Uranüs, geleneksel aile yapılarını köklü biçimde dönüştürür.",         tags: ["Aile Yapısı", "Toplum", "Değişim"],    caution: "Güvensizlik ve kök kaybı." },
    "Aslan":   { title: "Yaratıcı Özgürleşme",            summary: "Aslan'daki Uranüs, bireysel ifade ve liderlik anlayışında köklü yenilikleri destekler.", tags: ["Özgürleşme", "Liderlik", "Yaratıcılık"], caution: "Ego kırılganlığı ve dramalar." },
    "Başak":   { title: "Sağlık ve İş Sistemlerinde Dönüşüm", summary: "Başak'taki Uranüs, sağlık ve çalışma sistemlerinde yenilikçi değişimleri tetikler.", tags: ["Sağlık", "Teknoloji", "Yenilik"],   caution: "Ani değişimler ve uyum güçlüğü." },
    "Terazi":  { title: "İlişki Paradigmasının Değişimi", summary: "Terazi'deki Uranüs, ilişkiler ve adalet anlayışında radikal yenilikleri tetikler.",   tags: ["İlişki", "Adalet", "Özgürlük"],        caution: "Dengesiz ortaklıklar ve anlık ayrılıklar." },
    "Akrep":   { title: "Sistemik Güç Dönüşümü",          summary: "Akrep'teki Uranüs, finans, güç ve tabu konularda toplumsal kırılmalar yaratır.",      tags: ["Güç", "Dönüşüm", "Yenilik"],           caution: "Kriz ve yıkım riskleri." },
    "Yay":     { title: "İnanç ve Özgürlük Devrimi",      summary: "Yay'daki Uranüs, inanç ve eğitimde köklü özgürleşmeleri tetikler.",                   tags: ["İnanç", "Özgürleşme", "Keşif"],        caution: "Nihilizm ve aşırı bağımsızlaşma." },
    "Oğlak":   { title: "Otorite ve Yapı Kırılması",      summary: "Oğlak'taki Uranüs, kurumsal yapılar ve otorite anlayışında köklü dönüşümler tetikler.", tags: ["Otorite", "Yapı", "Kırılma"],        caution: "Kaotik çöküşler ve ani iktidar değişimleri." },
    "Kova":    { title: "Kolektif Özgürleşme Doruk",      summary: "Kendi burcunda Uranüs, kolektif uyanış ve teknolojik sıçrama için en güçlü konumundadır.", tags: ["Uyanış", "Kolektif", "Teknoloji"],  caution: "Sosyal kaos ve aşırı bireycilik." },
    "Balık":   { title: "Manevi ve Kolektif Dönüşüm",     summary: "Balık'taki Uranüs, spiritüel değişimi ve kolektif bilinçte büyük dönüşümleri tetikler.", tags: ["Uyanış", "Spiritüel", "Dönüşüm"],  caution: "Yanılsama ve gerçeklikten kopuş." },
  },

  // ── NEPTÜN ♆ ─────────────────────────────────────────────────────────────
  "Neptün": {
    "Koç":     { title: "Ruhsal Güç ve Öncülük",          summary: "Koç'taki Neptün, manevi yolculukta cesur ilk adımları ve vizyon liderliğini destekler.", tags: ["Ruhsal", "Vizyon", "Öncülük"],       caution: "Hayalci cesaret ve yanılgı riski." },
    "Boğa":    { title: "Maddi ve Manevi Uyum",           summary: "Boğa'daki Neptün, estetik yaratımı ve maddi güzellikle manevi değerleri harmanlayan dönem.", tags: ["Estetik", "Uyum", "Güzellik"],    caution: "Maddi kayıp ve yanılsamalı güvenlik." },
    "İkizler": { title: "Bilginin Mistik Boyutu",          summary: "İkizler'deki Neptün, sezgisel iletişimi ve bilginin ötesindeki anlayışı destekler.",    tags: ["Sezgi", "İletişim", "Mistik"],         caution: "Yanlış bilgi ve manipülasyon riski." },
    "Yengeç":  { title: "Manevi Beslenme ve Kök",          summary: "Yengeç'teki Neptün, aile ve topluluğun manevi bağını güçlendirir.",                   tags: ["Manevi Kök", "Aile", "Empati"],        caution: "Duygusal savunmasızlık ve geçmişte kaybolma." },
    "Aslan":   { title: "Sanatsal ve Ruhsal İlham",        summary: "Aslan'daki Neptün, sanat, yaratıcılık ve spiritüel ifadenin buluştuğu dönem.",         tags: ["Sanat", "İlham", "Ruhsallık"],         caution: "Ego yanılgısı ve sahte liderlik." },
    "Başak":   { title: "Hizmet ve Şifa Misyonu",          summary: "Başak'taki Neptün, şifa, hizmet ve manevi pratikleri destekler.",                      tags: ["Şifa", "Hizmet", "Manevi"],            caution: "Sağlık kaygıları ve hayal kırıklığı." },
    "Terazi":  { title: "Evrensel Aşk ve Adalet",          summary: "Terazi'deki Neptün, evrensel sevgi, sanat ve ilahi adalet arayışını destekler.",       tags: ["Evrensel Sevgi", "Estetik", "Adalet"], caution: "Romantik yanılsama ve ilişkide kaybolma." },
    "Akrep":   { title: "Derin Spiritüel Dönüşüm",        summary: "Akrep'teki Neptün, bilinçdışının derinliklerini ve mistik dönüşümü destekler.",        tags: ["Bilinçdışı", "Mistik", "Dönüşüm"],    caution: "Saplantı ve karanlık spiritüel pratikler." },
    "Yay":     { title: "Evrensel Bilgelik Arayışı",       summary: "Yay'daki Neptün, dini ve felsefi sınırları aşan evrensel bilgelik arayışını destekler.", tags: ["Bilgelik", "Evrensellik", "Keşif"],  caution: "Dogmatizm ve spiritüel yanılgı." },
    "Oğlak":   { title: "Manevi Sorumluluk",               summary: "Oğlak'taki Neptün, kurumsal yapılarda manevi sorumluluğu ve vizyonu destekler.",       tags: ["Sorumluluk", "Manevi", "Yapı"],        caution: "Kurumsal çöküş ve hayal kırıklığı." },
    "Kova":    { title: "Kolektif Uyanış",                  summary: "Kova'daki Neptün, insanlığın kolektif spiritüel uyanışını ve ütopik vizyonları destekler.", tags: ["Kolektif", "Uyanış", "Ütopya"],   caution: "Yanılsama ve pratiklikten kopuş." },
    "Balık":   { title: "Manevi Derinlik Doruk",            summary: "Kendi burcunda Neptün, sezginin, empatinin ve ruhsallığın doruk noktasını işaret eder.", tags: ["Derinlik", "Sezgi", "Ruhsallık"],   caution: "Gerçeklikten kopuş ve öz kayıp." },
  },

  // ── PLÜTON ♇ ─────────────────────────────────────────────────────────────
  "Plüton": {
    "Koç":     { title: "Radikal Kolektif Yenilenme",     summary: "Koç'taki Plüton, medeniyetleri derinden yenileyen güçlü dönüşüm dönemini işaret eder.", tags: ["Yenilenme", "Dönüşüm", "Güç"],      caution: "Çatışma ve yıkım dalgaları." },
    "Boğa":    { title: "Dünyanın Yeniden İnşası",        summary: "Boğa'daki Plüton, doğal kaynaklar ve ekonomik sistemlerde köklü dönüşümleri tetikler.", tags: ["Kaynak", "Ekonomi", "Dönüşüm"],      caution: "Toprak krizleri ve çevresel yıkım." },
    "İkizler": { title: "Bilgi ve Medya Devrimi",          summary: "İkizler'deki Plüton, bilgi sistemlerinde ve iletişimde derin dönüşümleri tetikler.",   tags: ["Bilgi", "Medya", "Güç"],               caution: "Propaganda ve bilgi manipülasyonu." },
    "Yengeç":  { title: "Aile ve Ulusal Kimlik Dönüşümü", summary: "Yengeç'teki Plüton, aile yapılarında ve ulusal kimlikte derin dönüşümler tetikler.",   tags: ["Aile", "Kimlik", "Kök"],               caution: "Derin korku dalgaları ve kimlik krizleri." },
    "Aslan":   { title: "Liderlik ve İktidarın Dönüşümü", summary: "Aslan'daki Plüton, liderlik anlayışını ve yaratıcı iktidarı köklü biçimde dönüştürür.", tags: ["Liderlik", "İktidar", "Dönüşüm"],    caution: "Tiranlık ve ego tahribatı." },
    "Başak":   { title: "Sistem ve Sağlık Dönüşümü",      summary: "Başak'taki Plüton, sağlık sistemlerinde ve toplumsal düzende köklü dönüşümler tetikler.", tags: ["Sistem", "Sağlık", "Analiz"],        caution: "Bürokratik çöküş ve krizler." },
    "Terazi":  { title: "Adalet Sisteminin Dönüşümü",     summary: "Terazi'deki Plüton, ilişki dinamiklerini ve adalet sistemini köklü biçimde dönüştürür.", tags: ["Adalet", "İlişki", "Denge"],         caution: "Güç dengesizlikleri ve adalet krizleri." },
    "Akrep":   { title: "Kolektif Ölüm ve Yeniden Doğuş",summary: "Kendi burcunda Plüton, derin kolektif dönüşümün ve gölgenin yüzleşilmesi gereken dönemini işaret eder.", tags: ["Dönüşüm", "Gölge", "Yeniden Doğuş"], caution: "Yıkım ve güç savaşları." },
    "Yay":     { title: "İnanç ve İdeoloji Devrimi",       summary: "Yay'daki Plüton, inanç sistemlerini ve ideolojileri köklü biçimde yeniler.",            tags: ["İdeoloji", "İnanç", "Güç"],            caution: "Dini çatışmalar ve ideolojik baskı." },
    "Oğlak":   { title: "Kurumların ve Elitlerin Çöküşü",  summary: "Oğlak'taki Plüton, kurumsal ve siyasi güç yapılarında köklü dönüşümleri tetikler.",   tags: ["Yapı", "Otorite", "Çöküş"],            caution: "Elit yıkımı ve kurumsal çöküş dalgaları." },
    "Kova":    { title: "İnsanlığın Kolektif Dönüşümü",   summary: "Kova'daki Plüton, teknoloji ve kolektif bilinçte derin insanlık dönüşümünü tetikler.", tags: ["Teknoloji", "İnsanlık", "Dönüşüm"],   caution: "Kontrolsüz teknoloji ve sosyal parçalanma." },
    "Balık":   { title: "Manevi Gölge ve Yüzleşme",       summary: "Balık'taki Plüton, kolektif bilinçdışını ve spiritüel gölgeleri yüzeye çıkarmayı tetikler.", tags: ["Bilinçdışı", "Gölge", "Spiritüel"], caution: "Kolektif kurban kompleksi ve spiritüel manipülasyon." },
  },
};

// ─── Fonksiyonlar ─────────────────────────────────────────────────────────────

/** Tekil transit yorumu döner; bilinmeyen kombinasyon → güvenli fallback. */
export function getTransitInterpretation(planet: string, sign: string): TransitInterpretation {
  const entry = TRANSITS[planet]?.[sign];
  return {
    planet,
    sign,
    symbol: PLANET_SYMBOLS[planet] ?? "⭐",
    title:   entry?.title   ?? "Transit Yorumu Hazırlanıyor",
    summary: entry?.summary ?? "Bu transit için yorum yakında eklenecek.",
    tags:    entry?.tags    ?? [],
    caution: entry?.caution,
  };
}

/**
 * Öncelik sırasına göre ilk N transit yorumunu döner.
 * rows: gokyuzuRows gibi { key: string; sign: string }[] dizisi.
 */
const PRIORITY: ReadonlyArray<string> = [
  "Ay", "Güneş", "Merkür", "Venüs", "Mars",
  "Jüpiter", "Satürn", "Uranüs", "Neptün", "Plüton",
];

export function getTopTransits(
  rows: ReadonlyArray<{ key: string; sign: string }>,
  count = 4,
): TransitInterpretation[] {
  const map = new Map(rows.map(r => [r.key, r.sign]));
  const result: TransitInterpretation[] = [];
  for (const planet of PRIORITY) {
    if (result.length >= count) break;
    const sign = map.get(planet);
    if (sign) result.push(getTransitInterpretation(planet, sign));
  }
  return result;
}
