/**
 * lib/cosmic/energy.ts
 * Kural tabanlı günlük enerji yorumu.
 * Kaynaklar: ay fazı + ay burcu + numeroloji
 */

import { getMoonPhase, getMoonSign } from "./moon";

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type DailyEnergy = {
  title: string;
  summary: string;
  focus: string;
  theme: string;
  recommendation: string;
  mainTheme: string;
  relationship: string;
  work: string;
  spiritualPractice: string;
  caution: string;
};

type PhaseEnergy = {
  title: string;
  theme: string;
  intro: string;
};

type SignModifier = {
  flavor: string;
  focus: string;
  recommendation: string;
};

// ─── Numeroloji ───────────────────────────────────────────────────────────────

function numerologicalDay(date: Date): number {
  const digits = `${date.getDate()}${date.getMonth() + 1}${date.getFullYear()}`
    .split("")
    .map(Number);
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n)
      .split("")
      .map(Number)
      .reduce((a, b) => a + b, 0);
  }
  return n;
}

// ─── Ay fazı tablosu ─────────────────────────────────────────────────────────

const DEFAULT_PHASE: PhaseEnergy = {
  title: "Kozmik Akış",
  theme: "Enerji Döngüsü",
  intro: "Bugün kozmik döngüler aktif",
};

const PHASE_ENERGY = new Map<string, PhaseEnergy>([
  ["Yeni Ay",        { title: "Yeni Başlangıçlar",      theme: "Niyet ve Tohum",         intro: "Yeni Ay'ın taze enerjisi yeni başlangıçlara ve niyetlere kapı açıyor" }],
  ["Büyüyen Hilal",  { title: "Harekete Geçme Zamanı",  theme: "Büyüme ve İlerleme",      intro: "Büyüyen Hilal ile hareket ve ilerleme için enerji hızla yükseliyor" }],
  ["İlk Dördün",     { title: "Karar ve Azim",           theme: "Zorlukları Aşma",         intro: "İlk Dördün zorluklara karşı durma ve net kararlar verme için güç veriyor" }],
  ["Şişen Ay",       { title: "Olgunlaşma ve Netleşme", theme: "Netlik ve Büyüme",         intro: "Şişen Ay'la birlikte enerji doruk noktasına yaklaşıyor ve projeler netleşiyor" }],
  ["Dolunay",        { title: "Doruk ve Tamamlanma",     theme: "Serbest Bırakma",         intro: "Dolunay güçlü bir tamamlanma ve serbest bırakma enerjisi taşıyor" }],
  ["Azalan Ay",      { title: "Değerlendirme Zamanı",    theme: "Derin Değerlendirme",     intro: "Azalan Ay ile geriye bakmak, öğrenmek ve içe dönmek zamanı başlıyor" }],
  ["Son Dördün",     { title: "Bırakma ve Arınma",       theme: "Temizlenme ve Arınma",    intro: "Son Dördün eski kalıpları bırakmak ve alanı temizlemek için destekleyici" }],
  ["Balsamik",       { title: "Dinlenme ve Hazırlık",    theme: "İçe Dönme",               intro: "Balsamik dönemde içe dönmek, dinlenmek ve yeni dönem için hazırlanmak önemli" }],
]);

// ─── Ay burcu tablosu ─────────────────────────────────────────────────────────

const DEFAULT_SIGN: SignModifier = {
  flavor: "genel kozmik bir enerjiyle",
  focus: "Günlük akış ve denge",
  recommendation: "Sezgilerinizi takip edin; bugünün ritmini hissedin.",
};

const SIGN_MODIFIER = new Map<string, SignModifier>([
  ["Koç",     { flavor: "Koç'un cesur ve dinamik etkisiyle",             focus: "Girişim ve cesaret",          recommendation: "Cesur adımlar at; harekete geçmek için bekleme." }],
  ["Boğa",    { flavor: "Boğa'nın güven ve sabır enerjisiyle",           focus: "Sabır ve güvenlik",           recommendation: "Temel ihtiyaçlarına önem ver; sabırlı ve kararlı ilerle." }],
  ["İkizler", { flavor: "İkizler'in iletişimci ve meraklı yapısıyla",    focus: "İletişim ve fikir paylaşımı", recommendation: "Fikirlerini paylaş ve yeni bağlantılar kur." }],
  ["Yengeç",  { flavor: "Yengeç'in duygusal ve koruyucu enerjisiyle",    focus: "Duygular ve aile bağları",    recommendation: "Sevdiklerinle vakit geçir; iç sesinle bağlantıda kal." }],
  ["Aslan",   { flavor: "Aslan'ın yaratıcı ve lider enerjisiyle",        focus: "Yaratıcılık ve ifade",        recommendation: "Kendini özgürce ifade et; yaratıcı projelere zaman ayır." }],
  ["Başak",   { flavor: "Başak'ın analitik ve düzenleyici etkisiyle",    focus: "Organizasyon ve detay",       recommendation: "Sistematik çalış; sağlık rutinlerini ve düzeni gözden geçir." }],
  ["Terazi",  { flavor: "Terazi'nin denge ve uyum arayışıyla",           focus: "İlişkiler ve denge",          recommendation: "Önemli kararları dengeli değerlendir; ilişkilere özen göster." }],
  ["Akrep",   { flavor: "Akrep'in derin ve dönüştürücü gücüyle",        focus: "Dönüşüm ve sezgi",           recommendation: "Sezgilerine güven; köklü dönüşümlere açık ol." }],
  ["Yay",     { flavor: "Yay'ın özgür ve vizyon dolu enerjisiyle",       focus: "Keşif ve büyük resim",        recommendation: "Büyük resme bak; yeni perspektifler ve deneyimler ara." }],
  ["Oğlak",   { flavor: "Oğlak'ın disiplinli ve kararlı yapısıyla",      focus: "Hedefler ve kariyer",         recommendation: "Uzun vadeli hedeflerine odaklan; sistemli ve kararlı adımlar at." }],
  ["Kova",    { flavor: "Kova'nın yenilikçi ve kolektif bakışıyla",      focus: "Yenilik ve topluluk",         recommendation: "Alışılmışın dışında düşün; kolektif projelerde yer al." }],
  ["Balık",   { flavor: "Balık'ın derin sezgisi ve spiritüel enerjisiyle", focus: "Sezgi ve iç dünya",        recommendation: "İç sesinle bağlantıda kal; yaratıcı ve spiritüel pratiklere alan aç." }],
]);

// ─── Numeroloji vurgusu ───────────────────────────────────────────────────────

const NUM_ACCENT = new Map<number, string>([
  [1,  "1 sayısının liderlik ve bağımsızlık enerjisi bu akışı güçlendiriyor."],
  [2,  "2 sayısının uyum ve işbirliği enerjisi dengeyi destekliyor."],
  [3,  "3 sayısının yaratıcılık ve neşe titreşimi bugün aktif."],
  [4,  "4 sayısının düzen ve sağlamlık enerjisi sağlam zemin sağlıyor."],
  [5,  "5 sayısının değişim ve özgürlük enerjisi hareketi destekliyor."],
  [6,  "6 sayısının sevgi ve uyum enerjisi ilişkileri besliyor."],
  [7,  "7 sayısının spiritüel derinliği içe dönüşü güçlendiriyor."],
  [8,  "8 sayısının güç ve bolluk enerjisi fırsatları ön plana çıkarıyor."],
  [9,  "9 sayısının tamamlanma bilgeliği döngüleri kapatmaya yardım ediyor."],
  [11, "11 üstay sayısının yüksek sezgi titreşimi aktif."],
  [22, "22 üstay sayısının büyük vizyon enerjisi güçlü."],
  [33, "33 üstay sayısının evrensel şefkat enerjisi yayılıyor."],
]);

// ─── Ana tema (ay fazına göre) ────────────────────────────────────────────────

const PHASE_MAIN_THEME = new Map<string, string>([
  ["Yeni Ay",        "Niyet belirlemek ve içsel tohumları ekmek için güçlü bir an."],
  ["Büyüyen Hilal",  "Attığınız adımlar şekilleniyor; enerji ve momentum yükseliyor."],
  ["İlk Dördün",     "Zorluklar büyümeyi tetikler; kararlılıkla devam edin."],
  ["Şişen Ay",       "Her şey olgunlaşıyor; sabır mükemmel sonucu getirir."],
  ["Dolunay",        "Tamamlananlar bugün güçlü; sonuçları kutlayın ve bırakın."],
  ["Azalan Ay",      "Değerlendirme zamanı; neyin işe yarayıp yaramadığını görün."],
  ["Son Dördün",     "Eski kalıpları bırakmak için şimdi; arınma enerjisi güçlü."],
  ["Balsamik",       "Sessizlik ve hazırlık; yeni bir dönem yaklaşıyor."],
]);

// ─── İlişki rehberi (ay burcuna göre) ────────────────────────────────────────

const SIGN_RELATIONSHIP = new Map<string, string>([
  ["Koç",     "Önce kendi ihtiyaçlarınıza yer açın; fazla reaktif olmaktan kaçının."],
  ["Boğa",    "Güven ve sabır ilişkiyi besler; acele kararlar vermeyin."],
  ["İkizler", "Sohbeti derinleştirin; yüzeysel kalmak bağı zayıflatır."],
  ["Yengeç",  "Duyguları sessizce biriktirmek yerine paylaşmak iyileştirir."],
  ["Aslan",   "Takdirin iki taraflı olmasına özen gösterin."],
  ["Başak",   "Eleştiri yerine çözüm odaklı yaklaşmak bağı güçlendirir."],
  ["Terazi",  "Karşılıklı dinleyerek orta noktayı bulmak kolaylaşıyor."],
  ["Akrep",   "Kıskançlık yerine güveni seçin; derin konuşmalar iyileştiriyor."],
  ["Yay",     "Özgürlük ve bağlılık dengesini gözlemleyin."],
  ["Oğlak",   "Zaman ayırmak ilişkiyi besler; işi sürekli öne almayın."],
  ["Kova",    "Bireysel alanı karşılıklı saygıyla koruyun."],
  ["Balık",   "Sınırları net tutun; empati çok yoğunlaşabilir."],
]);

// ─── İş / üretim rehberi (ay burcuna göre) ───────────────────────────────────

const SIGN_WORK = new Map<string, string>([
  ["Koç",     "Girişimci ve bağımsız projeler için güçlü bir gün."],
  ["Boğa",    "Uzun vadeli, somut sonuç üretecek işler için ideal tempo."],
  ["İkizler", "Yazı, sunum ve bağlantı kurma için bereketli bir zaman."],
  ["Yengeç",  "Bakım, ekip işleri ve iç düzenlemelerde enerji yüksek."],
  ["Aslan",   "Sunum, yaratıcılık ve liderlik gerektiren işler öne çıkıyor."],
  ["Başak",   "Detaylı analiz, düzeltme ve sağlık konuları için verimli."],
  ["Terazi",  "Müzakere, tasarım ve ortak kararlar için güçlü bir gün."],
  ["Akrep",   "Araştırma, derin inceleme ve finans işleri için doğru zaman."],
  ["Yay",     "Strateji, eğitim ve yayıncılık işleri için uygun enerji."],
  ["Oğlak",   "Kariyer adımları ve yapısal planlar için bereketli."],
  ["Kova",    "Teknoloji, yenilik ve kolektif projeler için verimli."],
  ["Balık",   "Sanatsal çalışma ve sezgisel kararlar için iyi bir zaman."],
]);

// ─── Ruhsal çalışma (ay burcuna göre) ────────────────────────────────────────

const SIGN_SPIRITUAL = new Map<string, string>([
  ["Koç",     "Hareket meditasyonu veya doğada yürüyüş denge getirir."],
  ["Boğa",    "Topraklanma meditasyonu ve sessiz doğa zamanı önerilen pratik."],
  ["İkizler", "Mantra okumak veya günlük tutmak zihinsel berraklık sağlar."],
  ["Yengeç",  "Su ritüeli veya nefes çalışması bugün destekleyici."],
  ["Aslan",   "Güneş selamlama ve kalp çakrası çalışması güçlendirici."],
  ["Başak",   "Temizlik ritüeli veya bilinçli nefes çalışması dengeleyici."],
  ["Terazi",  "Güzellik ve uyum üzerine meditasyon veya ses terapisi."],
  ["Akrep",   "Derin nefes ve arınma ritüeli bugün çok destekleyici."],
  ["Yay",     "Doğada uzun yürüyüş veya vizyon meditasyonu önerilen."],
  ["Oğlak",   "Sabah rutini oluşturmak veya yapısal bir pratik başlatmak ideal."],
  ["Kova",    "Akış meditasyonu veya kolektif enerji çalışması destekleyici."],
  ["Balık",   "Ses banyosu, görselleştirme veya rüya günlüğü tutmak iyi."],
]);

// ─── Dikkat / uyarı (ay fazına göre) ─────────────────────────────────────────

const PHASE_CAUTION = new Map<string, string>([
  ["Yeni Ay",        "Büyük kararlara acele etmeyin; enerji henüz şekilleniyor."],
  ["Büyüyen Hilal",  "Aşırı yüklenme tuzağına düşmeyin; adım adım ilerleyin."],
  ["İlk Dördün",     "Direnç doğal; tükenmeden önce kendinize dinlenme verin."],
  ["Şişen Ay",       "Aşırı heyecan kararları atlayabilir; sabırlı kalın."],
  ["Dolunay",        "Duygusal yoğunluk yüksek; reaktif kararlardan kaçının."],
  ["Azalan Ay",      "Bırakmakta güçlük çekebilirsiniz; akışa güvenin."],
  ["Son Dördün",     "Yeni başlangıçlar için erken; mevcut işleri bitirmeye odaklanın."],
  ["Balsamik",       "Aşırı izolasyondan kaçının; hafif bağlantılar iyileştirici."],
]);

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export function getDailyEnergySummary(date: Date): DailyEnergy {
  const phase = getMoonPhase(date);
  const sign  = getMoonSign(date);
  const num   = numerologicalDay(date);

  const phaseData = PHASE_ENERGY.get(phase.name) ?? DEFAULT_PHASE;
  const signData  = SIGN_MODIFIER.get(sign.name) ?? DEFAULT_SIGN;
  const numAccent = NUM_ACCENT.get(num) ?? "";

  const summaryParts = [
    `${phaseData.intro}.`,
    `${signData.flavor} bugün ${signData.focus.toLowerCase()} için enerji yüksek.`,
    numAccent,
  ].filter(Boolean);

  return {
    title:            phaseData.title,
    summary:          summaryParts.join(" "),
    focus:            signData.focus,
    theme:            phaseData.theme,
    recommendation:   signData.recommendation,
    mainTheme:        PHASE_MAIN_THEME.get(phase.name) ?? "Kozmik döngüler aktif; günü sezgilerinizle yönlendirin.",
    relationship:     SIGN_RELATIONSHIP.get(sign.name) ?? "İlişkilerinizde sabır ve anlayış sergilediğinizde bağlar güçlenir.",
    work:             SIGN_WORK.get(sign.name) ?? "Rutinlere sadık kalarak küçük adımlarla ilerlemek verimliliği artırır.",
    spiritualPractice: SIGN_SPIRITUAL.get(sign.name) ?? "Kısa bir nefes veya meditasyon pratiği günü anlamlandırır.",
    caution:          PHASE_CAUTION.get(phase.name) ?? "Aşırıya kaçmaktan kaçının; dengeli yaklaşım her alanda işe yarar.",
  };
}
