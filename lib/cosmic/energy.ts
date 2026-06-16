/**
 * lib/cosmic/energy.ts
 * Kural tabanlı günlük enerji yorumu.
 *
 * Mevcut kaynaklar: ay fazı + ay burcu + numeroloji
 * İleride eklenecek: hacamat yorumları, retro yorumları,
 *   dolunay yorumları, kullanıcı tercihleri
 */

import { getMoonPhase, getMoonSign } from "./moon";

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type DailyEnergy = {
  title: string;
  summary: string;
  focus: string;
  theme: string;
  recommendation: string;
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

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

/**
 * Verilen tarih için ay fazı + ay burcu + numeroloji verilerinden
 * kural tabanlı günlük enerji özeti üretir.
 */
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
    title: phaseData.title,
    summary: summaryParts.join(" "),
    focus: signData.focus,
    theme: phaseData.theme,
    recommendation: signData.recommendation,
  };
}
