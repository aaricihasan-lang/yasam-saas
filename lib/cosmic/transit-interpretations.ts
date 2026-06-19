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
  planet:             string;
  sign:               string;
  symbol:             string;
  title:              string;
  summary:            string;
  tags:               string[];
  caution?:           string;
  supportiveActions?: string[];
  challengePoints?:   string[];
};

// ─── Gezegen sembolleri ───────────────────────────────────────────────────────

export const PLANET_SYMBOLS: Record<string, string> = {
  "Güneş":  "☉", "Ay":     "☽", "Merkür": "☿",
  "Venüs":  "♀", "Mars":   "♂", "Jüpiter":"♃",
  "Satürn": "♄", "Uranüs": "♅", "Neptün": "♆", "Plüton": "♇",
};

// ─── Transit yorum sözlüğü ────────────────────────────────────────────────────

type Entry = {
  title:              string;
  summary:            string;
  tags:               string[];
  caution?:           string;
  supportiveActions?: string[];
  challengePoints?:   string[];
};

const TRANSITS: Record<string, Record<string, Entry>> = {

  // ── GÜNEŞ ☉ ──────────────────────────────────────────────────────────────
  "Güneş": {
    "Koç": {
      title:   "Öncülük Dönemi",
      summary: "Güneş Koç'ta başlangıçlara, girişimciliğe ve kişisel inisiyatife enerji katar.",
      tags:    ["Başlangıç", "Liderlik", "Enerji"],
      caution: "Aceleci kararlar sonradan yük olabilir.",
      supportiveActions: ["Yeni projelere başlama", "Liderlik rolleri üstlenme", "Fiziksel aktivite", "Bağımsız hedefler belirleme", "Girişimcilik adımları"],
      challengePoints:   ["Aceleci kararlar alma", "Başkalarına baskı yapma", "Sabırsızlık", "Öfke patlamaları"],
    },
    "Boğa": {
      title:   "Sabır ve İnşa Zamanı",
      summary: "Boğa'daki Güneş, kalıcı değerler ve güvenilir temeller oluşturmayı destekler.",
      tags:    ["Sebat", "Değer", "Güvenlik"],
      caution: "Değişime karşı direnç fırsatları kaçırabilir.",
      supportiveActions: ["Finansal planlama", "Uzun vadeli projeler oluşturma", "Doğayla bağlantı", "Güvenlik inşa etme", "Estetik çalışmalar"],
      challengePoints:   ["Değişime direnç", "İnat ve ısrar", "Maddi konulara aşırı odak", "Duygusal katılık"],
    },
    "İkizler": {
      title:   "Merak ve İletişim Mevsimi",
      summary: "İkizler'deki Güneş, bilgi alışverişini ve çok yönlü bakış açılarını ön plana çıkarır.",
      tags:    ["İletişim", "Esneklik", "Merak"],
      caution: "Odak dağınıklığı ve yüzeysellik tehlikesi.",
      supportiveActions: ["Yeni fikirler geliştirme", "Sosyal bağlantılar kurma", "Yazma ve konuşmalar", "Öğrenme ve bilgi paylaşımı", "Networking"],
      challengePoints:   ["Odak dağınıklığı", "Yüzeysellik", "Çok projeye aynı anda girişme", "Kararsızlık"],
    },
    "Yengeç": {
      title:   "Kök ve Aile Dönemi",
      summary: "Yengeç'teki Güneş, iç dünyaya ve aile bağlarına yatırım yapmayı destekler.",
      tags:    ["Aile", "Duygu", "Koruma"],
      caution: "Aşırı içe kapanma ve savunmacılık.",
      supportiveActions: ["Aile ile bağ kurma", "Ev ve yuva düzenleme", "Duygusal farkındalık çalışmaları", "İç dünyayı keşfetme", "Besleyici ilişkiler"],
      challengePoints:   ["Aşırı içe kapanma", "Geçmişe takılı kalma", "Savunmacı tutum", "Duygusal dalgalanmalar"],
    },
    "Aslan": {
      title:   "Yaratıcılık ve Görünürlük",
      summary: "Aslan'daki Güneş, özgün ifadeyi ve liderliği destekler; sahneye çıkma zamanıdır.",
      tags:    ["Yaratıcılık", "Özgüven", "Liderlik"],
      caution: "Ego merkezlilik ihtiyacı artabilir.",
      supportiveActions: ["Yaratıcı projeler başlatma", "Liderlik rolleri", "Sosyal etkinliklere katılma", "Kendinizi ifade etme", "Sanatsal üretim"],
      challengePoints:   ["Ego merkezlilik", "Drama yaratma", "Tanınma ihtiyacı", "Başkalarını gölgeleme"],
    },
    "Başak": {
      title:   "Analiz ve İyileştirme",
      summary: "Başak'taki Güneş, detaylara odaklanmayı ve verimliliği artırmayı destekler.",
      tags:    ["Analiz", "Düzen", "Sağlık"],
      caution: "Aşırı eleştiri ve mükemmeliyetçilik.",
      supportiveActions: ["Rutin ve alışkanlık oluşturma", "Sağlık ve detoks programı", "Projeleri tamamlama", "Analitik çalışmalar", "Organize etme"],
      challengePoints:   ["Aşırı eleştiri", "Mükemmeliyetçilik", "Kaygı döngüleri", "Başkalarını eleştirme"],
    },
    "Terazi": {
      title:   "Denge ve İlişki Mevsimi",
      summary: "Terazi'deki Güneş, ortaklıkları, adaleti ve uyumu öne çıkarır.",
      tags:    ["Denge", "İlişki", "Adalet"],
      caution: "Karar vermekten kaçınma eğilimi.",
      supportiveActions: ["Ortaklıklar kurma", "Müzakereler", "Estetik projeler", "Uyum arayışı", "Sosyal etkinlikler"],
      challengePoints:   ["Karar vermekten kaçınma", "Kendi ihtiyaçlarını görmezden gelme", "Çatışmadan kaçınma", "Aşırı uzlaşma"],
    },
    "Akrep": {
      title:   "Dönüşüm ve Derinlik",
      summary: "Akrep'teki Güneş, yüzeyin altına inmeyi ve derin dönüşümleri destekler.",
      tags:    ["Dönüşüm", "Güç", "Derinlik"],
      caution: "Kontrol ihtiyacı ve gizlilik eğilimi.",
      supportiveActions: ["Derin araştırma ve soruşturma", "Psikolojik farkındalık", "Finansal planlama", "Dönüşüm çalışmaları", "Derin ilişki bağları"],
      challengePoints:   ["Kontrol ihtiyacı", "Aşırı gizlilik", "Kıskançlık", "Şüphecilik"],
    },
    "Yay": {
      title:   "Büyüme ve Keşif Mevsimi",
      summary: "Yay'daki Güneş, büyük resme bakışı ve felsefi genişlemeyi destekler.",
      tags:    ["Büyüme", "Özgürlük", "Vizyon"],
      caution: "Aşırı iyimserlik ve plansız risk alma.",
      supportiveActions: ["Uzun mesafe yolculuk", "Felsefi araştırma", "Yüksek öğrenim", "Büyük hedefler belirleme", "Yeni kültürler keşfetme"],
      challengePoints:   ["Plansız risk alma", "Sorumluluktan kaçma", "Abartma", "Kararlılık eksikliği"],
    },
    "Oğlak": {
      title:   "Yapı ve Hedef Dönemi",
      summary: "Oğlak'taki Güneş, uzun vadeli hedeflere ve disiplinli ilerlemeye odaklanır.",
      tags:    ["Kariyer", "Disiplin", "Yapı"],
      caution: "Katılık ve aşırı çalışma.",
      supportiveActions: ["Kariyer hedefleri belirleme", "Uzun vadeli planlama", "Liderlik sorumlulukları", "Yapı inşa etme", "Disiplinli çalışma"],
      challengePoints:   ["Katılık", "İş-yaşam dengesi bozulması", "Aşırı çalışma", "Duygusal mesafe"],
    },
    "Kova": {
      title:   "Yenilik ve Kolektif Enerji",
      summary: "Kova'daki Güneş, toplulukları, yenilikleri ve alışılmadık fikirleri öne çıkarır.",
      tags:    ["Yenilik", "Bağımsızlık", "Topluluk"],
      caution: "Duygusal mesafe ve kopukluk.",
      supportiveActions: ["Topluluk projeleri", "Yenilikçi fikirler üretme", "Teknoloji ve araştırma", "Sosyal aktivizm", "Bağımsız düşünce"],
      challengePoints:   ["Duygusal soğukluk", "Bağ kurmada güçlük", "Aşırı bağımsızlık", "Pratiklikten kopma"],
    },
    "Balık": {
      title:   "Sezgi ve Ruhsal Derinlik",
      summary: "Balık'taki Güneş, empatiyi, sezgiyi ve manevi arayışı destekler.",
      tags:    ["Sezgi", "Empati", "Ruhsallık"],
      caution: "Gerçeklikten kopma ve sınır koyamama.",
      supportiveActions: ["Meditasyon ve içsel çalışmalar", "Sanatsal üretim", "Gönüllülük", "Sezgisel çalışmalar", "Manevi araştırma"],
      challengePoints:   ["Gerçeklikten kopma", "Sınır koyamama", "Kaçış davranışları", "Hayalperestlik"],
    },
  },

  // ── AY ☽ ─────────────────────────────────────────────────────────────────
  "Ay": {
    "Koç": {
      title:   "Anlık Motivasyon",
      summary: "Ay'ın Koç geçişi, dürtüsel tepkileri ve ani inisiyatifleri aktive eder; enerji yüksek.",
      tags:    ["Enerji", "Ateş", "Dürtü"],
      caution: "Sabırsızlık ve ani öfke olabilir.",
      supportiveActions: ["Anlık kararlar verme", "Fiziksel egzersiz", "Yeni başlangıçlar", "Kısa vadeli hedefler", "Spontane aktiviteler"],
      challengePoints:   ["Sabırsızlık", "Ani öfke patlamaları", "Düşünmeden tepki verme", "Çabuk soğuma"],
    },
    "Boğa": {
      title:   "Huzur ve Güven İhtiyacı",
      summary: "Boğa'daki Ay, konfor, güvenlik ve somut hazlara yönelmeyi destekler.",
      tags:    ["Huzur", "Konfor", "Sükunet"],
      caution: "Değişime direnç ve inat göze çarpabilir.",
      supportiveActions: ["Doğayla vakit geçirme", "Besleyici yemekler hazırlama", "Güven duygusu inşa etme", "Estetik zevklere odaklanma", "Uzun vadeli güvenlik planları"],
      challengePoints:   ["Değişime direnç", "İnat", "Maddi bağımlılık", "Değişim korkusu"],
    },
    "İkizler": {
      title:   "Zihin ve İletişim Hızı",
      summary: "İkizler'deki Ay, zihinsel hareketliliği artırır; sohbet ve öğrenme için uygun gün.",
      tags:    ["Merak", "İletişim", "Hız"],
      caution: "Kararsızlık ve dağınık dikkat.",
      supportiveActions: ["Sohbet ve konuşmalar", "Merak ve öğrenme", "Kısa yolculuklar", "Yazışmalar", "Sosyal bağlantılar"],
      challengePoints:   ["Kararsızlık", "Dağınık dikkat", "Yüzeysel bağlar", "Kaygılı düşünceler"],
    },
    "Yengeç": {
      title:   "Duygu Yüksek",
      summary: "Yengeç'te Ay en güçlü halindedir; empati, koruma ve iç ses belirginleşir.",
      tags:    ["Duygu", "Empati", "Aile"],
      caution: "Hassasiyet ve ruh hali dalgalanmaları artabilir.",
      supportiveActions: ["Aile ile bağ kurma", "Duygusal farkındalık", "İçsel çalışmalar", "Ev ve yaşam alanı düzenleme", "Besleyici ritüeller"],
      challengePoints:   ["Alınganlık", "Geçmişe takılı kalma", "Duygusal dalgalanmalar", "Gereğinden fazla korumacılık"],
    },
    "Aslan": {
      title:   "Görünme ve Takdir İhtiyacı",
      summary: "Aslan'daki Ay, ifade özgürlüğü ve takdir görme duygusunu ön plana taşır.",
      tags:    ["Gurur", "Cömertlik", "Sıcaklık"],
      caution: "Ego kırılganlığı ve drama eğilimi.",
      supportiveActions: ["Yaratıcı ifade", "Yaratıcı projelerle vakit", "Sosyal etkinlikler", "Cömertlik gösterme", "Eğlence ve oyun"],
      challengePoints:   ["Ego kırılganlığı", "Takdir görememe duygusu", "Drama eğilimi", "Aşırı büyüklük beklentisi"],
    },
    "Başak": {
      title:   "Pratik ve Detay Odağı",
      summary: "Başak'taki Ay, verimliliği ve günlük rutinleri düzeltme isteğini güçlendirir.",
      tags:    ["Pratik", "Düzen", "Sağlık"],
      caution: "Aşırı eleştiri ve kaygı.",
      supportiveActions: ["Pratik görevleri tamamlama", "Sağlık rutinleri", "Organizasyon", "Detaylı çalışmalar", "Hizmet etme"],
      challengePoints:   ["Aşırı eleştiri", "Kaygı döngüleri", "Mükemmeliyetçilik", "Bedensel semptomlar"],
    },
    "Terazi": {
      title:   "İlişki ve Estetik Dengesi",
      summary: "Terazi'deki Ay, sosyal uyumu, güzelliği ve ortaklık ilişkilerini destekler.",
      tags:    ["Uyum", "Güzellik", "Sosyal"],
      caution: "Karar verememe ve çatışmadan kaçınma.",
      supportiveActions: ["İlişkileri dengeleme", "Estetik çalışmalar", "Diplomatik konuşmalar", "Güzellik ritüelleri", "Sosyal uyum"],
      challengePoints:   ["Karar verememe", "Çatışmadan kaçınma", "Başkalarını memnun etme", "Kendi ihtiyaçlarını bastırma"],
    },
    "Akrep": {
      title:   "Duygusal Yoğunluk",
      summary: "Akrep'teki Ay, derin duyguları ve gizli gerçekleri yüzeye çıkarma eğilimi gösterir.",
      tags:    ["Yoğunluk", "Sezgi", "Derinlik"],
      caution: "Kıskançlık ve duygusal karmaşa olabilir.",
      supportiveActions: ["Derin duygusal çalışma", "Sezgisel farkındalık", "Gizli konuları araştırma", "Dönüşüm ritüelleri", "Derin ilişki bağları"],
      challengePoints:   ["Kıskançlık", "Duygusal karmaşa", "Şüphecilik", "Kontrolü bırakamama"],
    },
    "Yay": {
      title:   "Özgürlük ve İyimserlik",
      summary: "Yay'daki Ay, macera isteğini ve geniş bakış açısını destekler; hafif ve özgür bir gün.",
      tags:    ["Özgürlük", "İyimserlik", "Macera"],
      caution: "Sorumluluktan kaçma eğilimi.",
      supportiveActions: ["Özgürlük hissi yaşama", "Uzak kültürlerle bağlantı", "Felsefi düşünce", "Macera", "Neşe ve coşku"],
      challengePoints:   ["Sorumluluktan kaçma", "Aşırı iyimserlik", "Detaylara dikkat etmeme", "Kararlılık eksikliği"],
    },
    "Oğlak": {
      title:   "Soğukkanlılık ve Yapı",
      summary: "Oğlak'taki Ay, pratik sorumlulukları ve duygusal kontrol ihtiyacını öne çıkarır.",
      tags:    ["Kontrol", "Sorumluluk", "Yapı"],
      caution: "Duygusal mesafe ve soğukluk hissi.",
      supportiveActions: ["Sorumlulukları yerine getirme", "Pratik planlar yapma", "Duygusal kontrol", "Yapı ve düzen", "Uzun vadeli düşünce"],
      challengePoints:   ["Duygusal mesafe", "Soğukluk hissi", "Sertlik", "Duygu bastırma"],
    },
    "Kova": {
      title:   "Bağımsızlık ve Farklılık",
      summary: "Kova'daki Ay, sıra dışı düşünceyi ve topluluk bağlılığını destekler.",
      tags:    ["Bağımsızlık", "Yenilik", "Topluluk"],
      caution: "Duygusal kopukluk ve soğukluk.",
      supportiveActions: ["Topluluk çalışmaları", "Bağımsız projeler", "Yenilikçi düşünce", "Sosyal aktivizm", "Farklı perspektifler"],
      challengePoints:   ["Duygusal kopukluk", "Soğukluk", "Bağ kurmada güçlük", "Aşırı rasyonellik"],
    },
    "Balık": {
      title:   "Sezgi ve Empati Doruk",
      summary: "Balık'taki Ay, derin empatiyi ve sezgisel iletişimi destekler; rüyalar ve sanat güçlü.",
      tags:    ["Sezgi", "Şefkat", "Hayal"],
      caution: "Sınırlar bulanıklaşabilir, gerçeklikten kopma olabilir.",
      supportiveActions: ["Meditasyon", "Sanatsal yaratım", "Sezgisel çalışmalar", "Empati ile dinleme", "Rüya günlüğü tutma"],
      challengePoints:   ["Sınırlar bulanıklaşma", "Gerçeklikten kopma", "Duygusal sünger olma", "Kararsızlık"],
    },
  },

  // ── MERKÜR ☿ ─────────────────────────────────────────────────────────────
  "Merkür": {
    "Koç": {
      title:   "Hızlı ve Doğrudan Düşünce",
      summary: "Koç'taki Merkür, doğrudan iletişim ve hızlı karar almayı destekler.",
      tags:    ["Netlik", "Hız", "Karar"],
      caution: "Düşünmeden konuşma ve sabırsız tartışma.",
      supportiveActions: ["Hızlı kararlar alma", "Girişimci fikirler üretme", "Liderlik iletişimi", "Net ve doğrudan konuşmalar", "Müzakere"],
      challengePoints:   ["Düşünmeden konuşma", "Sabırsız tartışma", "Başkalarını dinlememek", "Kaba iletişim"],
    },
    "Boğa": {
      title:   "Pratik ve Ölçülü İletişim",
      summary: "Boğa'daki Merkür, somut ve güvenilir düşünce biçimini destekler.",
      tags:    ["Pratiklik", "Güven", "Sabır"],
      caution: "Yeni fikirlere kapalılık ve yavaş yanıt.",
      supportiveActions: ["Pratik planlar yapma", "Somut fikirler üretme", "Finansal hesaplamalar", "Güvenilir iletişim", "Uzun vadeli planlama"],
      challengePoints:   ["Yeni fikirlere kapalılık", "Yavaş yanıt verme", "Değişime direnç", "Aşırı muhafazakarlık"],
    },
    "İkizler": {
      title:   "Çok Yönlü Zeka",
      summary: "İkizler'de evindeki Merkür, öğrenme, yazma ve sohbet için en güçlü konumdadır.",
      tags:    ["İletişim", "Zeka", "Esneklik"],
      caution: "Yüzeysellik ve dağınıklık tehlikesi.",
      supportiveActions: ["Öğrenme ve keşfetme", "Yazma ve konuşma", "Sohbet ve tartışma", "Çok yönlü düşünce", "Yeni bilgi edinme"],
      challengePoints:   ["Yüzeysellik", "Dağınıklık", "Çok konuya aynı anda odaklanma", "Tutarsız ifade"],
    },
    "Yengeç": {
      title:   "Duygusal Zeka ve Sezgi",
      summary: "Yengeç'teki Merkür, sözlerin duygusal derinliğini artırır; empatiyle iletişim.",
      tags:    ["Empati", "Sezgi", "Duygu"],
      caution: "Öznellik ve geçmişe takılma.",
      supportiveActions: ["Empatik iletişim", "Hatıraları yazıya dökme", "Aile konuşmaları", "İç sesle bağlantı", "Duygusal zeka"],
      challengePoints:   ["Eski konulara saplanmak", "Aşırı duygusallık", "Yanlış anlaşılmalar", "Söylenmeyeni varsaymak"],
    },
    "Aslan": {
      title:   "Karizmatik Anlatım",
      summary: "Aslan'daki Merkür, özgün ve etkileyici sunum becerilerini destekler.",
      tags:    ["Karizmatik", "Özgün", "Sunum"],
      caution: "Drama ve abartma eğilimi.",
      supportiveActions: ["Etkileyici sunumlar", "Yaratıcı yazma", "Halka konuşmalar", "Güçlü iletişim", "Özgün fikirler"],
      challengePoints:   ["Dinlememe", "Drama", "Abartma", "Ego savaşları"],
    },
    "Başak": {
      title:   "Analitik Düşünce Doruk",
      summary: "Başak'ta Merkür, analiz ve pratik çözüm bulmada en güçlü konumdadır.",
      tags:    ["Analiz", "Kesinlik", "Pratik"],
      caution: "Gereğinden fazla ayrıntıcılık.",
      supportiveActions: ["Analitik çalışma", "Detaylı planlama", "Yazım ve düzenleme", "Araştırma", "Problem çözme"],
      challengePoints:   ["Aşırı ayrıntıcılık", "Eleştiri silahı olarak kullanma", "Kaygılı düşünceler", "Mükemmeliyetçilik"],
    },
    "Terazi": {
      title:   "Diplomatik Düşünce",
      summary: "Terazi'deki Merkür, müzakere becerilerini ve adil değerlendirmeyi destekler.",
      tags:    ["Denge", "Müzakere", "Adalet"],
      caution: "Kararsızlık ve her iki tarafı da savunma.",
      supportiveActions: ["Müzakere", "Diplomatik iletişim", "Adaletli değerlendirme", "Ortaklık görüşmeleri", "Yaratıcı işbirliği"],
      challengePoints:   ["Kararsızlık", "Her iki tarafı savunma", "Net tutum almama", "Aşırı uzlaşma"],
    },
    "Akrep": {
      title:   "Derin ve Araştırmacı Düşünce",
      summary: "Akrep'teki Merkür, yüzeyin altını kazımayı ve gizli bilgilere ulaşmayı destekler.",
      tags:    ["Araştırma", "Derinlik", "Sır"],
      caution: "Şüphecilik ve gizlilik.",
      supportiveActions: ["Derin araştırma", "Gizli bilgileri keşfetme", "Psikolojik analiz", "Strateji geliştirme", "Güçlü sorular sorma"],
      challengePoints:   ["Şüphecilik", "Gizlilik", "Manipülatif iletişim", "Obsesif düşünceler"],
    },
    "Yay": {
      title:   "Büyük Resim Düşüncesi",
      summary: "Yay'daki Merkür, felsefi bakış açısını ve geniş vizyonu destekler.",
      tags:    ["Vizyon", "Felsefe", "Özgürlük"],
      caution: "Detayları kaçırma ve aşırı genelleme.",
      supportiveActions: ["Büyük resim görme", "Felsefe tartışmaları", "Yabancı dil çalışması", "Öğretme ve anlatma", "Yayıncılık"],
      challengePoints:   ["Detayları kaçırma", "Aşırı genelleme", "Sözleri tutmama", "Abartma"],
    },
    "Oğlak": {
      title:   "Stratejik ve Yapılandırılmış",
      summary: "Oğlak'taki Merkür, planlama, organizasyon ve pratik stratejileri destekler.",
      tags:    ["Strateji", "Plan", "Yapı"],
      caution: "Katı düşünce ve yaratıcılığı kısıtlama.",
      supportiveActions: ["Stratejik planlama", "Organizasyon", "Pratik çözümler", "İş yazışmaları", "Yapılandırılmış düşünce"],
      challengePoints:   ["Katı düşünce", "Yaratıcılığı kısıtlama", "Sıkıcı iletişim", "Aşırı formalizm"],
    },
    "Kova": {
      title:   "Yenilikçi ve Bağımsız Düşünce",
      summary: "Kova'daki Merkür, alışılmadık fikirleri ve kolektif çözümleri destekler.",
      tags:    ["Yenilik", "Bağımsızlık", "Teknoloji"],
      caution: "Pratiklikten kopma ve aşırı soyutlama.",
      supportiveActions: ["Yenilikçi fikirler", "Teknoloji ile çalışma", "Kolektif çözümler", "Alışılmadık perspektifler", "Bilimsel araştırma"],
      challengePoints:   ["Pratiklikten kopma", "Aşırı soyutlama", "İnsanları dışlamak", "Soğuk iletişim"],
    },
    "Balık": {
      title:   "Sezgisel ve Sanatsal Düşünce",
      summary: "Balık'taki Merkür, hayal gücünü ve sezgisel anlayışı güçlendirir.",
      tags:    ["Sezgi", "Hayal", "Sanat"],
      caution: "Belirsizlik ve gerçeklikten kopma.",
      supportiveActions: ["Sanatsal yazma", "Sezgisel farkındalık", "Şiir ve yaratıcı ifade", "Rüya analizi", "Empatik dinleme"],
      challengePoints:   ["Belirsiz iletişim", "Gerçeklikten kopma", "Karmaşık düşünceler", "Yanlış anlaşılma"],
    },
  },

  // ── VENÜS ♀ ──────────────────────────────────────────────────────────────
  "Venüs": {
    "Koç": {
      title:   "Tutkulu ve Anlık Çekim",
      summary: "Koç'taki Venüs, romantik ilişkilerde ateşli başlangıçları ve anlık çekimi destekler.",
      tags:    ["Tutku", "Anlık", "Ateş"],
      caution: "Sabırsızlık ve çabuk soğuma riski.",
      supportiveActions: ["Yeni ilişkiler başlatma", "Tutkulu ifadeler", "Spontane romantik jestler", "Bağımsız ilgi alanları", "Cesur yaratıcılık"],
      challengePoints:   ["Sabırsızlık", "Çabuk soğuma", "Bencil tutum", "Anlık kararlar"],
    },
    "Boğa": {
      title:   "Güzellik ve Güvenlik",
      summary: "Boğa'da evindeki Venüs, duygusal güvenliği ve estetik zevkleri destekler.",
      tags:    ["Güvenlik", "Estetik", "Sadakat"],
      caution: "Sahiplenici tutum ve değişime direnç.",
      supportiveActions: ["Estetik çalışmalar", "Konfor alanı oluşturma", "İlişkileri güçlendirme", "Sanatsal üretim", "Güzellik ritüelleri"],
      challengePoints:   ["Sahiplenici tutum", "Değişime direnç", "İlişkilerde inat", "Aşırı konfor bağımlılığı"],
    },
    "İkizler": {
      title:   "Flörtöz ve Çok Yönlü İlişkiler",
      summary: "İkizler'deki Venüs, entelektüel sohbet ve çeşitlilik üzerine kurulu ilişkileri öne çıkarır.",
      tags:    ["Sohbet", "Çeşitlilik", "Zeka"],
      caution: "Derin bağ kurmada güçlük.",
      supportiveActions: ["Entelektüel sohbetler", "Çeşitli sosyal ilişkiler", "Yazışmalar", "Yeni insanlar tanıma", "Yaratıcı fikir alışverişi"],
      challengePoints:   ["Derin bağ kurmada güçlük", "Dağınık ilgi", "Kararsızlık", "Yüzeysel bağlar"],
    },
    "Yengeç": {
      title:   "Besleyici ve Koruyucu Sevgi",
      summary: "Yengeç'teki Venüs, koruyucu sevgiyi, yuvayı ve duygusal güvenliği destekler.",
      tags:    ["Koruma", "Yuva", "Empati"],
      caution: "Bağımlılık eğilimi ve kırılganlık.",
      supportiveActions: ["Besleyici ilişkiler", "Sevdiklerine özen gösterme", "Yuva oluşturma", "Duygusal güvenlik", "Derin bağlılık"],
      challengePoints:   ["Bağımlılık eğilimi", "Duygusal kırılganlık", "Geçmişe özlem", "Aşırı korumacılık"],
    },
    "Aslan": {
      title:   "Gösterişli ve Cömert Sevgi",
      summary: "Aslan'daki Venüs, dramatik, sıcak ve görkemli aşkı destekler; sanat ve lüks öne çıkar.",
      tags:    ["Cömertlik", "Sıcaklık", "Sanat"],
      caution: "Tanınma ihtiyacı ve kibir.",
      supportiveActions: ["Romantik jestler", "Yaratıcı çiftlik aktiviteleri", "Görkemli etkinlikler", "Cömert sevgi ifadeleri", "Sanat ve estetik"],
      challengePoints:   ["Tanınma ihtiyacı", "Drama", "Kibir", "Abartılı beklentiler"],
    },
    "Başak": {
      title:   "Pratik ve Hizmet Odaklı Sevgi",
      summary: "Başak'taki Venüs, sevgiyi eylemle ve günlük ilgiyle göstermeyi destekler.",
      tags:    ["Pratik", "Hizmet", "Özen"],
      caution: "Aşırı eleştiri ve romantizmi zorlamak.",
      supportiveActions: ["Günlük bakım ritüelleri", "Pratik sevgi ifadeleri", "Sağlık odaklı aktiviteler", "Düzeni paylaşma", "Detaylı özen"],
      challengePoints:   ["Aşırı eleştiri", "Romantizmi zorlamak", "Mükemmeliyetçi beklentiler", "Duygusal soğukluk"],
    },
    "Terazi": {
      title:   "Uyumlu ve Adil İlişkiler",
      summary: "Terazi'de evindeki Venüs, ortaklıkları, estetiği ve harmonik ilişkileri destekler.",
      tags:    ["Uyum", "Estetik", "Adalet"],
      caution: "Kendi ihtiyaçları geri plana itilebilir.",
      supportiveActions: ["İlişki uyumunu güçlendirme", "Ortaklıklar", "Estetik çalışmalar", "Adil paylaşım", "Güzellik deneyimleri"],
      challengePoints:   ["Kendi ihtiyaçlarını bastırma", "Kararsızlık", "Memnun etme çabası", "Değer vermeme"],
    },
    "Akrep": {
      title:   "Derin ve Dönüştürücü Bağlar",
      summary: "Akrep'teki Venüs, yoğun, dönüştürücü ve derin bağlılık gerektiren ilişkileri destekler.",
      tags:    ["Yoğunluk", "Dönüşüm", "Sadakat"],
      caution: "Kıskançlık ve güvensizlik.",
      supportiveActions: ["Derin duygusal bağlar", "Dönüşüm çalışmaları", "Fiziksel yakınlık", "Gizli romantizm", "Sadakat güçlendirme"],
      challengePoints:   ["Kıskançlık", "Güvensizlik", "Kontrol ihtiyacı", "Obsesif bağlanma"],
    },
    "Yay": {
      title:   "Maceraperest ve Özgür Sevgi",
      summary: "Yay'daki Venüs, özgürlük, yolculuk ve felsefi paylaşıma dayanan ilişkileri destekler.",
      tags:    ["Özgürlük", "Macera", "Felsefe"],
      caution: "Bağlanmaktan kaçınma ve tutarsızlık.",
      supportiveActions: ["Macera ortaklıkları", "Özgürlüklü ilişkiler", "Felsefi sohbetler", "Seyahat deneyimleri", "Büyüme odaklı bağlar"],
      challengePoints:   ["Bağlanmaktan kaçınma", "Tutarsızlık", "Özgürlük çatışmaları", "Uzakta kalma"],
    },
    "Oğlak": {
      title:   "Ciddi ve Uzun Vadeli Bağlılık",
      summary: "Oğlak'taki Venüs, kalıcı ve güvenilir ilişkileri ve statüyü öne çıkarır.",
      tags:    ["Bağlılık", "Güvenilirlik", "Yapı"],
      caution: "Duygusal mesafe ve katı beklentiler.",
      supportiveActions: ["Kalıcı ilişkiler inşa etme", "Pratik güven oluşturma", "Uzun vadeli bağlılık", "Ortak hedefler belirleme", "Sorumluluk paylaşımı"],
      challengePoints:   ["Duygusal mesafe", "Katı beklentiler", "Romantizm eksikliği", "İş odaklı olma"],
    },
    "Kova": {
      title:   "Özgün ve Bağımsız İlişkiler",
      summary: "Kova'daki Venüs, alışılmadık, özgür ve entelektüel temelli ilişkileri destekler.",
      tags:    ["Bağımsızlık", "Dostluk", "Yenilik"],
      caution: "Duygusal soğukluk ve konvansiyonel bağ güçlüğü.",
      supportiveActions: ["Özgün ilişki biçimleri", "Entelektüel bağlar", "Dostluk temelli ilişkiler", "Sosyal aktivizm birlikteliği", "Bağımsız alanlar"],
      challengePoints:   ["Duygusal soğukluk", "Fiziksel yakınlıktan kaçınma", "Alışılmadık beklentiler", "Kopukluk"],
    },
    "Balık": {
      title:   "Romantik ve Özverili Sevgi",
      summary: "Balık'taki Venüs, idealist, empatik ve sınırları aşan derin aşkı destekler.",
      tags:    ["Romantizm", "Empati", "İdeal"],
      caution: "Gerçekçi olmayan beklentiler ve hayal kırıklığı.",
      supportiveActions: ["Romantik hayaller paylaşma", "Sanat ve müzik deneyimleri", "Empatik bağlar", "Şefkat gösterme", "Yaratıcı birliktelik"],
      challengePoints:   ["Gerçekçi olmayan beklentiler", "Hayal kırıklığı", "Sınırları kaybetme", "Fedakarlıkta kaybolma"],
    },
  },

  // ── MARS ♂ ───────────────────────────────────────────────────────────────
  "Mars": {
    "Koç": {
      title:   "Ham Enerji ve Cesaret",
      summary: "Koç'ta evindeki Mars, inisiyatif ve cesaret için en güçlü konumundadır; eylem zamanı.",
      tags:    ["Eylem", "Cesaret", "Enerji"],
      caution: "Öfke patlamaları ve aceleci kararlar.",
      supportiveActions: ["Cesur adımlar atma", "Fiziksel aktivite", "Liderlik eylemleri", "Yeni başlangıçlar", "Rekabetçi projeler"],
      challengePoints:   ["Öfke patlamaları", "Aceleci kararlar", "Çatışma yaratma", "Kontrolsüz enerji"],
    },
    "Boğa": {
      title:   "Yavaş Ama Kararlı Güç",
      summary: "Boğa'daki Mars, uzun vadeli kararlılığı ve fiziksel dayanıklılığı destekler.",
      tags:    ["Kararlılık", "Dayanıklılık", "Sabır"],
      caution: "Hareketsizlik ve inat.",
      supportiveActions: ["Uzun vadeli projelere odaklanma", "Fiziksel dayanıklılık", "Pratik hedefler", "Kararlı ilerleme", "Değerli varlıklar oluşturma"],
      challengePoints:   ["Hareketsizlik", "İnat", "Değişime direnç", "Yavaş tempo"],
    },
    "İkizler": {
      title:   "Çoğul Eylem ve Hız",
      summary: "İkizler'deki Mars, birden fazla alanda hızlı eylem almayı ve sözlü gücü destekler.",
      tags:    ["Hız", "Çokluk", "İletişim"],
      caution: "Dağınıklık ve tamamlanmayan projeler.",
      supportiveActions: ["Çoklu görevler", "Hızlı karar alma", "İletişim projeleri", "Sözlü müzakere", "Hareketli aktiviteler"],
      challengePoints:   ["Dağınıklık", "Tamamlanmayan projeler", "Tartışmacı tutum", "Enerji bölünmesi"],
    },
    "Yengeç": {
      title:   "Koruyucu Güç",
      summary: "Yengeç'teki Mars, sevdiklerini koruma güdüsünü güçlendirir; duygusal enerji ön planda.",
      tags:    ["Koruma", "Duygusal Güç", "Yurt"],
      caution: "Dolaylı öfke ve pasif-agresif tutum.",
      supportiveActions: ["Sevdiklerini koruma", "Ev projelerine enerji", "Duygusal savunuculuk", "Aile için eylem", "Güvenlik inşa etme"],
      challengePoints:   ["Dolaylı öfke", "Pasif-agresif tutum", "Duygusal saldırganlık", "Kırılganlık"],
    },
    "Aslan": {
      title:   "Dramatik ve Yaratıcı Enerji",
      summary: "Aslan'daki Mars, sanatsal projeler ve liderlik eylemleri için güçlü enerji verir.",
      tags:    ["Liderlik", "Yaratıcılık", "Güç"],
      caution: "Bencillik ve aşırı rekabetçilik.",
      supportiveActions: ["Yaratıcı liderlik", "Sanatsal projeler", "Güçlü sunum", "Cesur ifade", "Şampiyonluk"],
      challengePoints:   ["Bencillik", "Aşırı rekabetçilik", "Drama", "Başkalarını gölgeleme"],
    },
    "Başak": {
      title:   "Verimli ve Hassas Eylem",
      summary: "Başak'taki Mars, analitik çalışma ve sağlık odaklı eylemleri destekler.",
      tags:    ["Verimlilik", "Analiz", "Sağlık"],
      caution: "Mükemmeliyetçi blok ve eleştiri silahı.",
      supportiveActions: ["Verimli çalışma", "Sağlık odaklı eylemler", "Analitik projeler", "Düzenli rutin", "Problem çözme"],
      challengePoints:   ["Mükemmeliyetçi blok", "Aşırı eleştiri", "Strese girmek", "Küçük detaylara takılma"],
    },
    "Terazi": {
      title:   "Stratejik ve Diplomatik Güç",
      summary: "Terazi'deki Mars, müzakere yoluyla kazanmayı ve adalet için mücadeleyi destekler.",
      tags:    ["Strateji", "Adalet", "Denge"],
      caution: "Eylemde kararsızlık ve kaçınma.",
      supportiveActions: ["Diplomatik müzakere", "Adalet için mücadele", "Ortaklık eylemleri", "Stratejik planlama", "Takım çalışması"],
      challengePoints:   ["Kararsız eylem", "Çatışmadan kaçınma", "Erteleme", "Motivasyon eksikliği"],
    },
    "Akrep": {
      title:   "Yoğun ve Stratejik Güç",
      summary: "Akrep'teki Mars, odaklanmış ve dönüştürücü bir eylem gücü sunar.",
      tags:    ["Strateji", "Yoğunluk", "Güç"],
      caution: "İntikam ve obsesyon riski.",
      supportiveActions: ["Yoğun araştırma", "Stratejik güç kullanımı", "Derin çalışmalar", "Dönüşüm eylemleri", "Odaklanmış enerji"],
      challengePoints:   ["İntikam isteği", "Obsesyon", "Güç çatışmaları", "Saplantılı düşünceler"],
    },
    "Yay": {
      title:   "Ateşli ve Özgür Enerji",
      summary: "Yay'daki Mars, büyük ideallar uğruna coşkulu eylem ve serüven için güçlü enerji verir.",
      tags:    ["Coşku", "Özgürlük", "Vizyon"],
      caution: "Plansız atılım ve sorumluluktan kaçış.",
      supportiveActions: ["Coşkulu eylemler", "Büyük vizyonlar", "Seyahat", "Felsefi savunuculuk", "Özgür enerji"],
      challengePoints:   ["Plansız atılım", "Sorumluluktan kaçış", "Tamamlamama", "Aşırı güven"],
    },
    "Oğlak": {
      title:   "Kararlı ve Hesaplı Güç",
      summary: "Oğlak'ta Mars güçlüdür; uzun vadeli hedeflere yönelik sistematik eylem desteklenir.",
      tags:    ["Kararlılık", "Sistematik", "Kariyer"],
      caution: "Katılık ve aşırı çalışma.",
      supportiveActions: ["Uzun vadeli hedefler", "Sistematik çalışma", "Kariyer eylemleri", "Liderlik sorumlulukları", "Yapısal projeler"],
      challengePoints:   ["Katılık", "Aşırı çalışma", "Baskı uygulama", "İşe gömülme"],
    },
    "Kova": {
      title:   "Yenilikçi ve Kolektif Enerji",
      summary: "Kova'daki Mars, toplumsal değişim ve yenilik için kolektif eylem gücü verir.",
      tags:    ["Yenilik", "Değişim", "Topluluk"],
      caution: "Duygusal kopukluk ve dengesiz enerji.",
      supportiveActions: ["Toplumsal değişim eylemleri", "Yenilik projeleri", "Kolektif hareket", "Teknoloji odaklı çalışma", "Bağımsız projeler"],
      challengePoints:   ["Dengesiz enerji", "Duygusal kopukluk", "Ani çıkışlar", "Güvensiz ortam"],
    },
    "Balık": {
      title:   "Sezgisel ve Özverili Eylem",
      summary: "Balık'taki Mars, manevi amaçlar ve yaratıcı projeler için derin motivasyon sunar.",
      tags:    ["Sezgi", "Özveri", "Yaratıcılık"],
      caution: "Enerji kaybı ve mağdur rolüne girme eğilimi.",
      supportiveActions: ["Manevi eylemler", "Yaratıcı projeler", "Şefkatle hareket etme", "Sezgisel çalışmalar", "Empati ile yardım etme"],
      challengePoints:   ["Enerji kaybı", "Mağdur rolü", "Pasiflik", "Yanılsama içinde eylem"],
    },
  },

  // ── JÜPİTER ♃ ────────────────────────────────────────────────────────────
  "Jüpiter": {
    "Koç": {
      title:   "Fırsatlar ve Cesaret",
      summary: "Koç'taki Jüpiter, cesur adımlar atma ve yeni fırsatlara açılma dönemini destekler.",
      tags:    ["Fırsat", "Büyüme", "Cesaret"],
      caution: "Aşırı güven ve plansız risk alma.",
      supportiveActions: ["Cesur girişimler", "Liderlik fırsatları", "Yeni başlangıçlar", "Rekabetçi büyüme", "İnisiyatif alma"],
      challengePoints:   ["Aşırı güven", "Plansız risk", "Başkalarını ezip geçme", "Sabırsızlık"],
    },
    "Boğa": {
      title:   "Maddi Bolluk ve Güvenlik",
      summary: "Boğa'daki Jüpiter, finansal büyümeyi ve somut varlık inşasını destekler.",
      tags:    ["Bolluk", "Güvenlik", "Maddi Büyüme"],
      caution: "Aşırı harcama ve rahatlama eğilimi.",
      supportiveActions: ["Finansal büyüme", "Somut varlık inşası", "Uzun vadeli güvenlik", "Materyal bolluk", "Kalıcı değerler"],
      challengePoints:   ["Aşırı harcama", "Rahatlık tuzağı", "Değişime kapalılık", "Birikim yerine tüketim"],
    },
    "İkizler": {
      title:   "Bilgi Patlaması ve İletişim",
      summary: "İkizler'deki Jüpiter, öğrenme ve iletişim alanlarında genişleme fırsatı sunar.",
      tags:    ["Öğrenme", "İletişim", "Çeşitlilik"],
      caution: "Odak kaybı ve dağınık enerji.",
      supportiveActions: ["Öğrenme ve bilgi genişletme", "Çok yönlü projeler", "İletişim", "Yayıncılık ve öğretme", "Ağ oluşturma"],
      challengePoints:   ["Odak kaybı", "Dağınık enerji", "Tamamlamama", "Yüzeysellik"],
    },
    "Yengeç": {
      title:   "Aile ve Duygusal Büyüme",
      summary: "Yengeç'teki Jüpiter, aile bağlarını güçlendirir ve duygusal iyileşme fırsatları sunar.",
      tags:    ["Aile", "Duygusal Büyüme", "Yuva"],
      caution: "Aşırı koruma ve sınır kaybı.",
      supportiveActions: ["Aile bağlarını güçlendirme", "Duygusal iyileşme", "Yuva ve güvenlik", "Besleyici ilişkiler", "Kök atma"],
      challengePoints:   ["Aşırı koruma", "Sınır kaybı", "Duygusal aşırı yük", "Geçmişe bağlanma"],
    },
    "Aslan": {
      title:   "Yaratıcı Refah ve Tanınma",
      summary: "Aslan'daki Jüpiter, yaratıcı yeteneklerin tanınması için altın dönem sunar.",
      tags:    ["Tanınma", "Yaratıcılık", "Liderlik"],
      caution: "Ego şişkinliği ve fazla güçlü davranış.",
      supportiveActions: ["Yaratıcı büyüme", "Tanınma ve görünürlük", "Liderlik", "Sanatsal genişleme", "Özgüven inşası"],
      challengePoints:   ["Ego şişkinliği", "Fazla güçlü davranış", "Dramatik davranışlar", "Kibir"],
    },
    "Başak": {
      title:   "Beceri ve Hizmet Büyümesi",
      summary: "Başak'taki Jüpiter, ustalık geliştirme ve hizmet alanlarında genişleme fırsatı sunar.",
      tags:    ["Ustalık", "Hizmet", "Gelişim"],
      caution: "Aşırı analiz ve küçük şeylere takılma.",
      supportiveActions: ["Ustalık geliştirme", "Hizmet alanında büyüme", "Pratik beceriler", "Analitik genişleme", "Sağlık iyileştirme"],
      challengePoints:   ["Aşırı analiz", "Küçük şeylere takılma", "Mükemmeliyetçilik", "Fırsatları kaçırma"],
    },
    "Terazi": {
      title:   "İlişki ve Adalet Genişlemesi",
      summary: "Terazi'deki Jüpiter, ortaklıklar, adalet ve diplomasi alanlarında büyüme getirir.",
      tags:    ["Ortaklık", "Adalet", "Genişleme"],
      caution: "Aşırı denge arayışı ve karar vermede gecikme.",
      supportiveActions: ["Ortaklıkları büyütme", "Adalet arayışı", "Diplomatik bağlar", "İş birlikleri", "Denge ve uyum"],
      challengePoints:   ["Karar vermede gecikme", "Aşırı denge arayışı", "Olası fırsatları kaçırma", "Uzlaşma tuzağı"],
    },
    "Akrep": {
      title:   "Derin Dönüşüm ve Güçlenme",
      summary: "Akrep'teki Jüpiter, derin araştırma ve yatırım alanlarında güçlü büyüme fırsatı sunar.",
      tags:    ["Dönüşüm", "Araştırma", "Güç"],
      caution: "Obsesyon ve güç sarhoşluğu riski.",
      supportiveActions: ["Derin araştırma", "Yatırım fırsatları", "Dönüşüm projesi", "Güç inşası", "Psikolojik büyüme"],
      challengePoints:   ["Güç sarhoşluğu", "Obsesyon", "Aşırı kontrol", "Risk alma"],
    },
    "Yay": {
      title:   "Bilgelik ve Özgürlük Doruk",
      summary: "Kendi burcunda Jüpiter, vizyon, bilgelik ve büyüme için en güçlü konumundadır.",
      tags:    ["Vizyon", "Bilgelik", "Özgürlük"],
      caution: "Sınır tanımazlık ve abartı.",
      supportiveActions: ["Büyük vizyon", "Yüksek öğrenim", "Özgürlük projeleri", "Felsefi büyüme", "Dünya keşfi"],
      challengePoints:   ["Sınır tanımazlık", "Abartma", "Sorumluluktan kaçış", "Aşırı iyimserlik"],
    },
    "Oğlak": {
      title:   "Yapısal Büyüme ve Kariyer",
      summary: "Oğlak'taki Jüpiter, kariyer ve kurumsal büyüme için sistematik fırsatlar sunar.",
      tags:    ["Kariyer", "Yapı", "Başarı"],
      caution: "Aşırı ciddiyet ve katı beklentiler.",
      supportiveActions: ["Kariyer büyümesi", "Kurumsal projeler", "Uzun vadeli başarı", "Yapısal genişleme", "Sistematik hedefler"],
      challengePoints:   ["Aşırı ciddiyet", "Katı beklentiler", "Çok çalışma", "Esneklik kaybı"],
    },
    "Kova": {
      title:   "Toplumsal Vizyon ve Yenilik",
      summary: "Kova'daki Jüpiter, toplumsal değişim ve teknolojik yenilik için büyüme fırsatı sunar.",
      tags:    ["Vizyon", "Yenilik", "Topluluk"],
      caution: "Gerçekçi olmayan idealizm.",
      supportiveActions: ["Toplumsal projeler", "Yenilikçi büyüme", "Teknoloji", "Kolektif vizyonlar", "Sosyal değişim"],
      challengePoints:   ["Gerçekçi olmayan idealizm", "Pratiklikten kopma", "Bireysel çıkarları kaybetme", "Aşırı ütopyacılık"],
    },
    "Balık": {
      title:   "Manevi Büyüme ve Şefkat",
      summary: "Balık'taki Jüpiter, sezgi, şefkat ve manevi gelişim için güçlü bir dönem sunar.",
      tags:    ["Şefkat", "Sezgi", "Ruhsallık"],
      caution: "Gerçekçilikten kopma ve sınır kaybı.",
      supportiveActions: ["Manevi büyüme", "Sezgisel projeler", "Şefkatle hizmet", "Sanatsal genişleme", "Empati geliştirme"],
      challengePoints:   ["Gerçekçilikten kopma", "Sınır kaybı", "Duygusal aşırı yük", "Hayalperestlik"],
    },
  },

  // ── SATÜRN ♄ ─────────────────────────────────────────────────────────────
  "Satürn": {
    "Koç": {
      title:   "Disiplin ve Cesaret Sınavı",
      summary: "Satürn Koç etkisi, kişinin cesaretini plansız ataklarla değil kontrollü sorumlulukla göstermesini ister.",
      tags:    ["Disiplin", "Cesaret", "Sorumluluk"],
      caution: "Sabırsız kararlar ve gereksiz inat yorucu olabilir.",
      supportiveActions: ["Planlı cesaret", "Sorumluluk alarak liderlik", "Disiplinli başlangıçlar", "Yapı inşa etme", "Uzun vadeli inisiyatif"],
      challengePoints:   ["Sabırsız kararlar", "Gereksiz inat", "Ciddi çatışmalar", "Engelleyici yapı"],
    },
    "Boğa": {
      title:   "Sağlam Temel İnşası",
      summary: "Boğa'daki Satürn, finansal disiplini ve kalıcı değer inşasını ciddi biçimde destekler.",
      tags:    ["Temel", "Finansal Disiplin", "Sabır"],
      caution: "Aşırı tasarruf ve zevkten yoksunluk.",
      supportiveActions: ["Finansal disiplin", "Kalıcı değer inşası", "Sabırlı tasarruf", "Uzun vadeli yatırım", "Somut temeller"],
      challengePoints:   ["Aşırı tasarruf", "Zevkten yoksunluk", "Katı bütçe", "Değişime direnç"],
    },
    "İkizler": {
      title:   "Düşünce ve İletişimde Yapı",
      summary: "İkizler'deki Satürn, dağınık düşünceleri disipline etmek ve net iletişim kurmayı öne çıkarır.",
      tags:    ["Yapı", "Netlik", "İletişim"],
      caution: "Yoğun zihinsel baskı ve konuşma güçlükleri.",
      supportiveActions: ["Yapılandırılmış düşünce", "Disiplinli öğrenme", "Net iletişim", "Yazım ve planlama", "Sistematik araştırma"],
      challengePoints:   ["Zihinsel baskı", "Konuşma güçlükleri", "Kaygılı düşünceler", "İletişim kısıtlaması"],
    },
    "Yengeç": {
      title:   "Duygusal Sorumluluk",
      summary: "Yengeç'teki Satürn, duygusal olgunluk ve aile sorumluluklarıyla yüzleşmeyi gerektirir.",
      tags:    ["Olgunluk", "Sorumluluk", "Kök"],
      caution: "Duygusal çekilme ve bağlanma korkusu.",
      supportiveActions: ["Duygusal olgunluk", "Aile sorumluluğu", "Kalıcı bağlar inşası", "Güvenilir destek", "Köklenme"],
      challengePoints:   ["Duygusal çekilme", "Bağlanma korkusu", "Aşırı sorumluluk", "Sertlik"],
    },
    "Aslan": {
      title:   "Öz Disiplin ve Gerçek Liderlik",
      summary: "Aslan'daki Satürn, ego testleriyle gerçek liderlik kapasitesini inşa etmeyi destekler.",
      tags:    ["Disiplin", "Liderlik", "Güç"],
      caution: "Yaratıcılığı kısıtlayan aşırı sertlik.",
      supportiveActions: ["Gerçek liderlik", "Öz disiplin", "Güçlü otorite inşası", "Kalıcı yaratıcı çalışmalar", "Olgun ifade"],
      challengePoints:   ["Yaratıcılık kısıtlaması", "Aşırı sertlik", "Ego testleri", "Tanınma engellemeleri"],
    },
    "Başak": {
      title:   "Mükemmellik Yerine Süreç",
      summary: "Başak'taki Satürn, analitik yetenekleri sorumlulukla birleştirmeyi ve hizmet disiplinini destekler.",
      tags:    ["Süreç", "Sorumluluk", "Analiz"],
      caution: "Aşırı öz eleştiri ve tükenmişlik riski.",
      supportiveActions: ["Süreç disiplini", "Sağlık sorumluluğu", "Sistematik analiz", "Hizmet taahhüdü", "Olgunlaşan beceriler"],
      challengePoints:   ["Aşırı öz eleştiri", "Tükenmişlik riski", "Mükemmeliyetçi çöküş", "Aşırı çalışma"],
    },
    "Terazi": {
      title:   "Adil ve Kalıcı İlişkiler",
      summary: "Terazi'deki Satürn, ilişkilerde ciddi bağlılığı ve adalet ilkesini sınar.",
      tags:    ["Adalet", "Bağlılık", "Denge"],
      caution: "Yük haline gelen ilişkiler ve katı beklentiler.",
      supportiveActions: ["Adil ve kalıcı ilişkiler", "Uzun vadeli ortaklıklar", "Hukuki düzenleme", "Disiplinli denge", "Ciddi taahhütler"],
      challengePoints:   ["Yük haline gelen ilişkiler", "Katı beklentiler", "İlişki kısıtlamaları", "Aşırı formalizm"],
    },
    "Akrep": {
      title:   "Derin Dönüşüm ve Yapılandırma",
      summary: "Akrep'teki Satürn, gücü, kontrolü ve korkuları disiplinli biçimde dönüştürmeyi gerektirir.",
      tags:    ["Dönüşüm", "Yapı", "Derinlik"],
      caution: "Obsesyon, kontrol baskısı ve sertlik.",
      supportiveActions: ["Derin dönüşüm çalışmaları", "Güç yapısı inşası", "Korku ile yüzleşme", "Disiplinli araştırma", "Stratejik derinlik"],
      challengePoints:   ["Obsesyon", "Kontrol baskısı", "Sertlik", "İçsel engellemeler"],
    },
    "Yay": {
      title:   "Gerçek Özgürlüğün Sınırları",
      summary: "Yay'daki Satürn, büyük vizyonları pratik plan ve sorumlulukla dengelemeyi öğretir.",
      tags:    ["Sorumluluk", "Vizyon", "Disiplin"],
      caution: "Kısıtlanmış özgürlük ve dogmatizm.",
      supportiveActions: ["Büyük vizyonları planlama", "Felsefi sorumluluk", "Uzun vadeli öğrenim", "Gerçekçi özgürlük", "Bilgelik inşası"],
      challengePoints:   ["Kısıtlanmış özgürlük", "Dogmatizm", "Büyüme engelleri", "Sertlik"],
    },
    "Oğlak": {
      title:   "Otorite ve Uzun Vadeli Yapı",
      summary: "Kendi burcunda Satürn, kariyer ve kurumsal yapılar için en disiplinli ve güçlü konumundadır.",
      tags:    ["Kariyer", "Yapı", "Otorite"],
      caution: "Aşırı sertlik ve esneksizlik.",
      supportiveActions: ["Kariyer yapılanması", "Otorite inşası", "Uzun vadeli başarı", "Kurumsal sorumluluk", "Disiplinli ilerleme"],
      challengePoints:   ["Aşırı sertlik", "Esneksizlik", "İşe kapanma", "Duygusal kopukluk"],
    },
    "Kova": {
      title:   "Toplumsal Yapının Testi",
      summary: "Kova'daki Satürn, kolektif sorumluluk ve toplumsal kuralları yeniden yapılandırmayı destekler.",
      tags:    ["Yapı", "Topluluk", "Reform"],
      caution: "Bireyciliği bastıran toplu kurallar.",
      supportiveActions: ["Kolektif sorumluluk", "Toplumsal reformlar", "Yapısal yenilik", "Uzun vadeli vizyon", "Olgun aktivizm"],
      challengePoints:   ["Toplu kuralların bireyi bastırması", "Aşırı katılık", "Sosyal baskı", "Yenilikçiliği kısıtlama"],
    },
    "Balık": {
      title:   "Sınır ve Empati Dengesi",
      summary: "Balık'taki Satürn, manevi sorumlulukları ve empatinin sınırlarını disipline etmeyi gerektirir.",
      tags:    ["Sınır", "Empati", "Manevi"],
      caution: "Gerçeklikten kaçış ve öz kurban riski.",
      supportiveActions: ["Manevi disiplin", "Empati sınırları", "Spiritüel sorumluluk", "Derin özgünlük", "Olgun hizmet"],
      challengePoints:   ["Gerçeklikten kaçış", "Öz kurban", "Sınır çizme güçlüğü", "Aşırı yük"],
    },
  },

  // ── URANÜS ♅ ─────────────────────────────────────────────────────────────
  "Uranüs": {
    "Koç": {
      title:   "Radikal Yenilenme",
      summary: "Koç'taki Uranüs, toplumda ani ve devrimci başlangıçları tetikler.",
      tags:    ["Devrim", "Yenilenme", "Değişim"],
      caution: "Kaotik ani değişimler ve bitmemiş projeler.",
      supportiveActions: ["Radikal değişimlere açık olma", "Ani fırsatları değerlendirme", "Alışılmadık başlangıçlar", "Devrimci inisiyatif", "Yenilenme"],
      challengePoints:   ["Kaotik ani değişimler", "Bitmemiş projeler", "Kontrolsüz impuls", "Çatışmalar"],
    },
    "Boğa": {
      title:   "Finansal ve Değer Devrimi",
      summary: "Boğa'daki Uranüs, para ve değer sistemlerinde köklü dönüşümleri tetikler.",
      tags:    ["Finansal Değişim", "Değerler", "Yenilik"],
      caution: "Ekonomik istikrarsızlık.",
      supportiveActions: ["Finansal yeniliklere yatırım", "Değer sistemini sorgulamak", "Dijital varlıklar", "Sürdürülebilirlik", "Ekonomik dönüşüm"],
      challengePoints:   ["Ekonomik istikrarsızlık", "Ani kayıplar", "Güvenliği sarsmak", "Alışkanlıkları bozmak"],
    },
    "İkizler": {
      title:   "Teknoloji ve İletişim Devrimi",
      summary: "İkizler'deki Uranüs, iletişim teknolojilerinde köklü değişimler getirir.",
      tags:    ["Teknoloji", "İletişim", "Devrim"],
      caution: "Bilgi aşırı yükü ve bağlantı karmaşası.",
      supportiveActions: ["Teknoloji ile iletişim", "Yeni iletişim biçimleri", "Alışılmadık öğrenme", "Bilgi devrimi", "Hızlı adaptasyon"],
      challengePoints:   ["Bilgi aşırı yükü", "Bağlantı karmaşası", "Dağınık enerji", "Güvenilirlik sorunları"],
    },
    "Yengeç": {
      title:   "Aile ve Toplum Yapısında Kırılma",
      summary: "Yengeç'teki Uranüs, geleneksel aile yapılarını köklü biçimde dönüştürür.",
      tags:    ["Aile Yapısı", "Toplum", "Değişim"],
      caution: "Güvensizlik ve kök kaybı.",
      supportiveActions: ["Aile yapısını yeniden şekillendirme", "Ev hayatında yenilik", "Topluluk değişimi", "Güvenlik anlayışını dönüştürme", "Köklerden özgürleşme"],
      challengePoints:   ["Güvensizlik", "Kök kaybı", "Aile çatışmaları", "İstikrarsızlık"],
    },
    "Aslan": {
      title:   "Yaratıcı Özgürleşme",
      summary: "Aslan'daki Uranüs, bireysel ifade ve liderlik anlayışında köklü yenilikleri destekler.",
      tags:    ["Özgürleşme", "Liderlik", "Yaratıcılık"],
      caution: "Ego kırılganlığı ve dramalar.",
      supportiveActions: ["Yaratıcı özgürleşme", "Alışılmadık sanat", "Bağımsız liderlik", "Özgün ifade", "Devrimci yaratıcılık"],
      challengePoints:   ["Ego kırılganlığı", "Dramalar", "Aşırı bağımsızlık", "Kesintili yaratım"],
    },
    "Başak": {
      title:   "Sağlık ve İş Sistemlerinde Dönüşüm",
      summary: "Başak'taki Uranüs, sağlık ve çalışma sistemlerinde yenilikçi değişimleri tetikler.",
      tags:    ["Sağlık", "Teknoloji", "Yenilik"],
      caution: "Ani değişimler ve uyum güçlüğü.",
      supportiveActions: ["Sağlık teknolojileri", "Çalışma sistemlerinde yenilik", "Süreçlerin otomasyonu", "Verimlilik devrimi", "Yenilikçi analiz"],
      challengePoints:   ["Ani değişimler", "Uyum güçlüğü", "Sistem krizleri", "Stres"],
    },
    "Terazi": {
      title:   "İlişki Paradigmasının Değişimi",
      summary: "Terazi'deki Uranüs, ilişkiler ve adalet anlayışında radikal yenilikleri tetikler.",
      tags:    ["İlişki", "Adalet", "Özgürlük"],
      caution: "Dengesiz ortaklıklar ve anlık ayrılıklar.",
      supportiveActions: ["İlişki paradigmalarını sorgulamak", "Özgür ortaklıklar", "Adalet devrimi", "Alışılmadık ilişkiler", "Özgürlükçü bağlar"],
      challengePoints:   ["Dengesiz ortaklıklar", "Ani ayrılıklar", "Tahmin edilemezlik", "Karmaşa"],
    },
    "Akrep": {
      title:   "Sistemik Güç Dönüşümü",
      summary: "Akrep'teki Uranüs, finans, güç ve tabu konularda toplumsal kırılmalar yaratır.",
      tags:    ["Güç", "Dönüşüm", "Yenilik"],
      caution: "Kriz ve yıkım riskleri.",
      supportiveActions: ["Güç yapılarını dönüştürme", "Gizli bilgilere ulaşma", "Finansal yenilik", "Tabu konuları açmak", "Sistemik değişim"],
      challengePoints:   ["Kriz ve yıkım", "Ani güç kayıpları", "Güvensizlik", "Kontrol kaybı"],
    },
    "Yay": {
      title:   "İnanç ve Özgürlük Devrimi",
      summary: "Yay'daki Uranüs, inanç ve eğitimde köklü özgürleşmeleri tetikler.",
      tags:    ["İnanç", "Özgürleşme", "Keşif"],
      caution: "Nihilizm ve aşırı bağımsızlaşma.",
      supportiveActions: ["İnanç sistemlerini sorgulamak", "Özgür felsefi keşif", "Eğitimde yenilik", "Gezgin yaşam", "Dini özgürleşme"],
      challengePoints:   ["Nihilizm", "Aşırı bağımsızlaşma", "Tamamlamama", "Sabırsızlık"],
    },
    "Oğlak": {
      title:   "Otorite ve Yapı Kırılması",
      summary: "Oğlak'taki Uranüs, kurumsal yapılar ve otorite anlayışında köklü dönüşümler tetikler.",
      tags:    ["Otorite", "Yapı", "Kırılma"],
      caution: "Kaotik çöküşler ve ani iktidar değişimleri.",
      supportiveActions: ["Kurumsal yeniliklere açılma", "Otorite anlayışını sorgulamak", "Kariyer devrimi", "Yapısal yenilik", "Sistemik dönüşüm"],
      challengePoints:   ["Kaotik çöküşler", "Ani iktidar değişimleri", "Güvenlik sorgusu", "Belirsizlik"],
    },
    "Kova": {
      title:   "Kolektif Özgürleşme Doruk",
      summary: "Kendi burcunda Uranüs, kolektif uyanış ve teknolojik sıçrama için en güçlü konumundadır.",
      tags:    ["Uyanış", "Kolektif", "Teknoloji"],
      caution: "Sosyal kaos ve aşırı bireycilik.",
      supportiveActions: ["Kolektif uyanış projeleri", "Teknolojik sıçrama", "Sosyal yenilik", "Birlikte yaratma", "Özgürlükçü topluluklar"],
      challengePoints:   ["Sosyal kaos", "Aşırı bireycilik", "Grup çatışması", "Dağınık enerji"],
    },
    "Balık": {
      title:   "Manevi ve Kolektif Dönüşüm",
      summary: "Balık'taki Uranüs, spiritüel değişimi ve kolektif bilinçte büyük dönüşümleri tetikler.",
      tags:    ["Uyanış", "Spiritüel", "Dönüşüm"],
      caution: "Yanılsama ve gerçeklikten kopuş.",
      supportiveActions: ["Spiritüel uyanış", "Kolektif bilinç genişlemesi", "Mistik keşifler", "Sezgisel yenilikler", "Dönüşümcü sanat"],
      challengePoints:   ["Yanılsama", "Gerçeklikten kopuş", "Spiritüel yanılgı", "Belirsizlik"],
    },
  },

  // ── NEPTÜN ♆ ─────────────────────────────────────────────────────────────
  "Neptün": {
    "Koç": {
      title:   "Ruhsal Güç ve Öncülük",
      summary: "Koç'taki Neptün, manevi yolculukta cesur ilk adımları ve vizyon liderliğini destekler.",
      tags:    ["Ruhsal", "Vizyon", "Öncülük"],
      caution: "Hayalci cesaret ve yanılgı riski.",
      supportiveActions: ["Manevi yolculuğa cesaret", "Vizyon liderliği", "İdeal peşinde koşmak", "İçsel güç geliştirme", "Spiritüel inisiyatif"],
      challengePoints:   ["Hayalci cesaret", "Yanılgı riski", "Plansız idealizm", "Gerçeklikten kopuk eylem"],
    },
    "Boğa": {
      title:   "Maddi ve Manevi Uyum",
      summary: "Boğa'daki Neptün, estetik yaratımı ve maddi güzellikle manevi değerleri harmanlayan dönem.",
      tags:    ["Estetik", "Uyum", "Güzellik"],
      caution: "Maddi kayıp ve yanılsamalı güvenlik.",
      supportiveActions: ["Estetik yaratım", "Maddi güzellikle manevi değerleri birleştirme", "Sanatsal üretim", "Doğayla manevi bağ", "Güzellik arayışı"],
      challengePoints:   ["Maddi kayıp", "Yanılsamalı güvenlik", "Finansal yanılgı", "Madde bağımlılığı"],
    },
    "İkizler": {
      title:   "Bilginin Mistik Boyutu",
      summary: "İkizler'deki Neptün, sezgisel iletişimi ve bilginin ötesindeki anlayışı destekler.",
      tags:    ["Sezgi", "İletişim", "Mistik"],
      caution: "Yanlış bilgi ve manipülasyon riski.",
      supportiveActions: ["Sezgisel iletişim", "Mistik öğrenme", "Sanatsal yazım", "Empatik dinleme", "İlham veren konuşmalar"],
      challengePoints:   ["Yanlış bilgi", "Manipülasyon riski", "Muğlak iletişim", "Belirsizlik"],
    },
    "Yengeç": {
      title:   "Manevi Beslenme ve Kök",
      summary: "Yengeç'teki Neptün, aile ve topluluğun manevi bağını güçlendirir.",
      tags:    ["Manevi Kök", "Aile", "Empati"],
      caution: "Duygusal savunmasızlık ve geçmişte kaybolma.",
      supportiveActions: ["Manevi kök arayışı", "Aile ve toplulukla derin bağ", "Duygusal şifa", "Empatik güvenlik", "Kutsal yuva"],
      challengePoints:   ["Duygusal savunmasızlık", "Geçmişte kaybolma", "Sınır kaybı", "Aşırı idealizasyon"],
    },
    "Aslan": {
      title:   "Sanatsal ve Ruhsal İlham",
      summary: "Aslan'daki Neptün, sanat, yaratıcılık ve spiritüel ifadenin buluştuğu dönem.",
      tags:    ["Sanat", "İlham", "Ruhsallık"],
      caution: "Ego yanılgısı ve sahte liderlik.",
      supportiveActions: ["Sanatsal ilham", "Spiritüel yaratıcılık", "İdeal liderlik", "Sanatta yüce ifade", "Ruhsal güzellik"],
      challengePoints:   ["Ego yanılgısı", "Sahte liderlik", "Drama ve yanılsama", "Abartılı öz algı"],
    },
    "Başak": {
      title:   "Hizmet ve Şifa Misyonu",
      summary: "Başak'taki Neptün, şifa, hizmet ve manevi pratikleri destekler.",
      tags:    ["Şifa", "Hizmet", "Manevi"],
      caution: "Sağlık kaygıları ve hayal kırıklığı.",
      supportiveActions: ["Şifa hizmeti", "Manevi sağlık", "Empatik bakım", "Spiritüel pratikler", "Sezgisel analiz"],
      challengePoints:   ["Sağlık kaygıları", "Hayal kırıklığı", "Yanılsamalı düzen", "Yorgunluk"],
    },
    "Terazi": {
      title:   "Evrensel Aşk ve Adalet",
      summary: "Terazi'deki Neptün, evrensel sevgi, sanat ve ilahi adalet arayışını destekler.",
      tags:    ["Evrensel Sevgi", "Estetik", "Adalet"],
      caution: "Romantik yanılsama ve ilişkide kaybolma.",
      supportiveActions: ["Evrensel aşk", "Sanatsal ilişkiler", "İlahi adalet arayışı", "Estetik deneyimler", "Derin uyum"],
      challengePoints:   ["Romantik yanılsama", "İlişkide kaybolma", "Gerçekçi olmayan beklentiler", "Sınır kaybı"],
    },
    "Akrep": {
      title:   "Derin Spiritüel Dönüşüm",
      summary: "Akrep'teki Neptün, bilinçdışının derinliklerini ve mistik dönüşümü destekler.",
      tags:    ["Bilinçdışı", "Mistik", "Dönüşüm"],
      caution: "Saplantı ve karanlık spiritüel pratikler.",
      supportiveActions: ["Derin spiritüel dönüşüm", "Bilinçdışı keşif", "Mistik pratikler", "Derin şifa çalışmaları", "Kolektif bilinçle bağ"],
      challengePoints:   ["Saplantı", "Karanlık spiritüel pratikler", "Yanılsama ve yanıltma", "Güvensizlik"],
    },
    "Yay": {
      title:   "Evrensel Bilgelik Arayışı",
      summary: "Yay'daki Neptün, dini ve felsefi sınırları aşan evrensel bilgelik arayışını destekler.",
      tags:    ["Bilgelik", "Evrensellik", "Keşif"],
      caution: "Dogmatizm ve spiritüel yanılgı.",
      supportiveActions: ["Evrensel bilgelik", "Felsefi spiritüellik", "Dini keşif", "Uluslararası bağlar", "Büyük vizyon"],
      challengePoints:   ["Dogmatizm", "Spiritüel yanılgı", "Yanılsamalı özgürlük", "Sınır tanımazlık"],
    },
    "Oğlak": {
      title:   "Manevi Sorumluluk",
      summary: "Oğlak'taki Neptün, kurumsal yapılarda manevi sorumluluğu ve vizyonu destekler.",
      tags:    ["Sorumluluk", "Manevi", "Yapı"],
      caution: "Kurumsal çöküş ve hayal kırıklığı.",
      supportiveActions: ["Manevi liderlik", "Kurumsal şifa", "Vizyon sahibi yapılanma", "Sorumlu idealizm", "Kalıcı manevi pratikler"],
      challengePoints:   ["Kurumsal çöküş", "Hayal kırıklığı", "Yanılsamalı otorite", "Güven kayıpları"],
    },
    "Kova": {
      title:   "Kolektif Uyanış",
      summary: "Kova'daki Neptün, insanlığın kolektif spiritüel uyanışını ve ütopik vizyonları destekler.",
      tags:    ["Kolektif", "Uyanış", "Ütopya"],
      caution: "Yanılsama ve pratiklikten kopuş.",
      supportiveActions: ["Kolektif uyanış", "Ütopyacı projeler", "Teknoloji ve manevi bağ", "Spiritüel aktivizm", "Kolektif şifa"],
      challengePoints:   ["Yanılsama", "Pratiklikten kopuş", "Toplu aldatma", "Hayal kırıklığı"],
    },
    "Balık": {
      title:   "Manevi Derinlik Doruk",
      summary: "Kendi burcunda Neptün, sezginin, empatinin ve ruhsallığın doruk noktasını işaret eder.",
      tags:    ["Derinlik", "Sezgi", "Ruhsallık"],
      caution: "Gerçeklikten kopuş ve öz kayıp.",
      supportiveActions: ["Derin meditasyon", "Sanatsal yaratım", "Mistik deneyimler", "Evrensel empati", "Spiritüel doruk"],
      challengePoints:   ["Gerçeklikten kopuş", "Öz kayıp", "Bağımlılık riski", "Sınırsızlık"],
    },
  },

  // ── PLÜTON ♇ ─────────────────────────────────────────────────────────────
  "Plüton": {
    "Koç": {
      title:   "Radikal Kolektif Yenilenme",
      summary: "Koç'taki Plüton, medeniyetleri derinden yenileyen güçlü dönüşüm dönemini işaret eder.",
      tags:    ["Yenilenme", "Dönüşüm", "Güç"],
      caution: "Çatışma ve yıkım dalgaları.",
      supportiveActions: ["Kolektif dönüşüme açık olma", "Güç dinamiklerini fark etme", "Yapıcı öfke kullanımı", "Yenilenme sürecini kucaklama", "Güçlü değişimi yönetme"],
      challengePoints:   ["Çatışma dalgaları", "Yıkım kaygısı", "Güç savaşları", "Şiddet"],
    },
    "Boğa": {
      title:   "Dünyanın Yeniden İnşası",
      summary: "Boğa'daki Plüton, doğal kaynaklar ve ekonomik sistemlerde köklü dönüşümleri tetikler.",
      tags:    ["Kaynak", "Ekonomi", "Dönüşüm"],
      caution: "Toprak krizleri ve çevresel yıkım.",
      supportiveActions: ["Kaynakları dönüştürme", "Finansal paradigma değişimi", "Doğa ile uyumlu yaşam", "Değerlerin derinleşmesi", "Sürdürülebilirlik"],
      challengePoints:   ["Toprak krizleri", "Çevresel yıkım", "Ekonomik kaygı", "Aşırı materializm"],
    },
    "İkizler": {
      title:   "Bilgi ve Medya Devrimi",
      summary: "İkizler'deki Plüton, bilgi sistemlerinde ve iletişimde derin dönüşümleri tetikler.",
      tags:    ["Bilgi", "Medya", "Güç"],
      caution: "Propaganda ve bilgi manipülasyonu.",
      supportiveActions: ["Bilgi sistemlerini dönüştürme", "Gerçek bilgiye ulaşma", "Derinlemesine araştırma", "Medyayı sorgulama", "Güçlü iletişim"],
      challengePoints:   ["Propaganda", "Bilgi manipülasyonu", "Güven krizi", "Yanılgı"],
    },
    "Yengeç": {
      title:   "Aile ve Ulusal Kimlik Dönüşümü",
      summary: "Yengeç'teki Plüton, aile yapılarında ve ulusal kimlikte derin dönüşümler tetikler.",
      tags:    ["Aile", "Kimlik", "Kök"],
      caution: "Derin korku dalgaları ve kimlik krizleri.",
      supportiveActions: ["Kökleri dönüştürme", "Aile gölgesiyle yüzleşme", "Kimliği yeniden inşa etme", "Kolektif şifa", "Duygusal dönüşüm"],
      challengePoints:   ["Derin korku dalgaları", "Kimlik krizleri", "Aile travmaları", "Kök kaybı"],
    },
    "Aslan": {
      title:   "Liderlik ve İktidarın Dönüşümü",
      summary: "Aslan'daki Plüton, liderlik anlayışını ve yaratıcı iktidarı köklü biçimde dönüştürür.",
      tags:    ["Liderlik", "İktidar", "Dönüşüm"],
      caution: "Tiranlık ve ego tahribatı.",
      supportiveActions: ["Liderlik anlayışını dönüştürme", "Yaratıcı gücü yeniden inşa etme", "Gerçek otorite", "Güçlü etkili yaratıcılık", "Dönüşümcü ifade"],
      challengePoints:   ["Tiranlık", "Ego tahribatı", "Güç suistimali", "Dramatik çöküşler"],
    },
    "Başak": {
      title:   "Sistem ve Sağlık Dönüşümü",
      summary: "Başak'taki Plüton, sağlık sistemlerinde ve toplumsal düzende köklü dönüşümler tetikler.",
      tags:    ["Sistem", "Sağlık", "Analiz"],
      caution: "Bürokratik çöküş ve krizler.",
      supportiveActions: ["Sistemleri kökten analiz etme", "Sağlık paradigmalarını dönüştürme", "Köklü reform", "Derin iyileştirme", "Çalışma düzenini yenileme"],
      challengePoints:   ["Bürokratik çöküş", "Krizler", "Aşırı analiz", "Sistemik tükenmişlik"],
    },
    "Terazi": {
      title:   "Adalet Sisteminin Dönüşümü",
      summary: "Terazi'deki Plüton, ilişki dinamiklerini ve adalet sistemini köklü biçimde dönüştürür.",
      tags:    ["Adalet", "İlişki", "Denge"],
      caution: "Güç dengesizlikleri ve adalet krizleri.",
      supportiveActions: ["Adalet sistemini dönüştürme", "İlişki gölgesiyle yüzleşme", "Güç dengesini yeniden kurma", "Derin ortaklıklar", "Köklü adalet"],
      challengePoints:   ["Güç dengesizlikleri", "Adalet krizleri", "İlişki savaşları", "Manipülasyon"],
    },
    "Akrep": {
      title:   "Kolektif Ölüm ve Yeniden Doğuş",
      summary: "Kendi burcunda Plüton, derin kolektif dönüşümün ve gölgenin yüzleşilmesi gereken dönemini işaret eder.",
      tags:    ["Dönüşüm", "Gölge", "Yeniden Doğuş"],
      caution: "Yıkım ve güç savaşları.",
      supportiveActions: ["Derin gölgeyle yüzleşme", "Kolektif dönüşümü kabul etme", "Güçlü spiritüel çalışma", "Yeniden doğuş projeleri", "Köklü şifa"],
      challengePoints:   ["Yıkım dalgaları", "Güç savaşları", "Kolektif karanlık", "Obsesyon"],
    },
    "Yay": {
      title:   "İnanç ve İdeoloji Devrimi",
      summary: "Yay'daki Plüton, inanç sistemlerini ve ideolojileri köklü biçimde yeniler.",
      tags:    ["İdeoloji", "İnanç", "Güç"],
      caution: "Dini çatışmalar ve ideolojik baskı.",
      supportiveActions: ["İnanç sistemlerini dönüştürme", "Özgürlükçü ideoloji", "Güçlü vizyon", "Derin felsefi keşif", "Manevi özgürleşme"],
      challengePoints:   ["Dini çatışmalar", "İdeolojik baskı", "Fanatizm", "Güç ideolojisi"],
    },
    "Oğlak": {
      title:   "Kurumların ve Elitlerin Çöküşü",
      summary: "Oğlak'taki Plüton, kurumsal ve siyasi güç yapılarında köklü dönüşümleri tetikler.",
      tags:    ["Yapı", "Otorite", "Çöküş"],
      caution: "Elit yıkımı ve kurumsal çöküş dalgaları.",
      supportiveActions: ["Yapıları dönüştürme", "Kurumsal dönüşümü yönetme", "Güç yapısını yeniden inşa etme", "Kariyer dönüşümü", "Uzun vadeli değişim"],
      challengePoints:   ["Elit yıkımı", "Kurumsal çöküş", "Güç krizleri", "Belirsizlik"],
    },
    "Kova": {
      title:   "İnsanlığın Kolektif Dönüşümü",
      summary: "Kova'daki Plüton, teknoloji ve kolektif bilinçte derin insanlık dönüşümünü tetikler.",
      tags:    ["Teknoloji", "İnsanlık", "Dönüşüm"],
      caution: "Kontrolsüz teknoloji ve sosyal parçalanma.",
      supportiveActions: ["İnsanlığın dönüşümünü destekleme", "Teknoloji ile bilinç geliştirme", "Kolektif uyanışa katkı", "Toplumsal dönüşüm", "Yenilikçi güç"],
      challengePoints:   ["Kontrolsüz teknoloji", "Sosyal parçalanma", "Bireyin yok olması", "Güç suistimali"],
    },
    "Balık": {
      title:   "Manevi Gölge ve Yüzleşme",
      summary: "Balık'taki Plüton, kolektif bilinçdışını ve spiritüel gölgeleri yüzeye çıkarmayı tetikler.",
      tags:    ["Bilinçdışı", "Gölge", "Spiritüel"],
      caution: "Kolektif kurban kompleksi ve spiritüel manipülasyon.",
      supportiveActions: ["Kolektif bilinçdışını keşfetme", "Spiritüel gölgeyle yüzleşme", "Derin şifa çalışmaları", "Manevi dönüşüm", "Evrensel empati"],
      challengePoints:   ["Kolektif kurban kompleksi", "Spiritüel manipülasyon", "Yanılsama", "Aşırı empati kaybı"],
    },
  },
};

// ─── Fonksiyonlar ─────────────────────────────────────────────────────────────

/** Tekil transit yorumu döner; bilinmeyen kombinasyon → güvenli fallback. */
export function getTransitInterpretation(planet: string, sign: string): TransitInterpretation {
  const entry = TRANSITS[planet]?.[sign];
  return {
    planet,
    sign,
    symbol:           PLANET_SYMBOLS[planet] ?? "⭐",
    title:            entry?.title            ?? "Transit Yorumu Hazırlanıyor",
    summary:          entry?.summary          ?? "Bu transit için yorum yakında eklenecek.",
    tags:             entry?.tags             ?? [],
    caution:          entry?.caution,
    supportiveActions: entry?.supportiveActions,
    challengePoints:  entry?.challengePoints,
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
