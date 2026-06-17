/**
 * lib/cosmic/guidance.ts
 * Tarih rehberi katmanı — Faz 8.
 * Ay fazı + ay burcu + numeroloji kombinasyonundan rehberlik üretir.
 */

import { getMoonPhase, getMoonSign } from "./moon";

// ─── Tip ─────────────────────────────────────────────────────────────────────

export type DailyGuidance = {
  potential:           string;    // 2-3 cümle
  activities:          string[];  // 3-5 madde (✓ prefixsiz)
  cautions:            string[];  // 2-4 madde (⚠ prefixsiz)
  spiritualSuggestion: string;    // 1-2 cümle
};

// ─── Numeroloji (energy.ts'den bağımsız) ─────────────────────────────────────

function numerologicalDay(date: Date): number {
  const digits = `${date.getDate()}${date.getMonth() + 1}${date.getFullYear()}`
    .split("")
    .map(Number);
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").map(Number).reduce((a, b) => a + b, 0);
  }
  return n;
}

// ─── Günün Potansiyeli — ay fazı girişi ──────────────────────────────────────

const PHASE_POTENTIAL = new Map<string, string>([
  ["Yeni Ay",       "Yeni Ay'ın taze enerjisi, niyetleri derinleştirmek ve yeni tohumları ekmek için en güçlü anı sunuyor."],
  ["Büyüyen Hilal", "Büyüyen Hilal ile hareket ve momentum artıyor; attığınız adımlar somutlaşmaya başlıyor."],
  ["İlk Dördün",    "İlk Dördün zorlukları dönüştürme ve kararlarınızı netleştirme için güçlü bir potansiyel taşıyor."],
  ["Şişen Ay",      "Şişen Ay'la birlikte enerji doruk noktasına yaklaşıyor; projeler ve ilişkiler olgunlaşıyor."],
  ["Dolunay",       "Dolunay'ın yoğun enerjisi tamamlanma, berraklık ve serbest bırakma için zirve anı yaratıyor."],
  ["Azalan Ay",     "Azalan Ay değerlendirme, içsel öğrenme ve akışı gözlemleme için derin bir alan açıyor."],
  ["Son Dördün",    "Son Dördün eski kalıpları ve artık işe yaramayan şeyleri bırakarak geleceğe alan açıyor."],
  ["Balsamik",      "Balsamik dönem derin bir dinlenme ve yeni dönem için sessizce hazırlanma zamanı sunuyor."],
]);

// ─── Ay burcuna göre potansiyel katkısı ──────────────────────────────────────

const SIGN_POTENTIAL = new Map<string, string>([
  ["Koç",     "Koç'un cesur ve dinamik etkisiyle girişimci enerji ve hayata geçirme gücü yüksek."],
  ["Boğa",    "Boğa'nın güven ve sabır enerjisiyle somut, kalıcı sonuçlar için zemin son derece güçlü."],
  ["İkizler", "İkizler'in iletişimci ve meraklı yapısıyla fikirler, bağlantılar ve öğrenme canlanıyor."],
  ["Yengeç",  "Yengeç'in duygusal ve koruyucu enerjisiyle içsel dünya ve aile bağları ön plana çıkıyor."],
  ["Aslan",   "Aslan'ın yaratıcı ve karizmatik enerjisiyle kendini ifade etme ve liderlik için bereketli bir gün."],
  ["Başak",   "Başak'ın analitik ve düzenleyici etkisiyle netlik, verimlilik ve detay için ideal zemin oluşuyor."],
  ["Terazi",  "Terazi'nin denge ve uyum arayışıyla ilişkiler ve işbirlikleri için güçlü bir enerji var."],
  ["Akrep",   "Akrep'in derin ve dönüştürücü gücüyle sezgi, araştırma ve köklü değişimler için zemin hazır."],
  ["Yay",     "Yay'ın özgür ve vizyon dolu enerjisiyle keşif, öğrenme ve büyük resme bakma zamanı."],
  ["Oğlak",   "Oğlak'ın disiplinli yapısıyla uzun vadeli hedefler ve yapısal planlar için güçlü potansiyel var."],
  ["Kova",    "Kova'nın yenilikçi ve kolektif bakışıyla yeni fikirler ve topluluk enerjisi aktif."],
  ["Balık",   "Balık'ın derin sezgisi ve spiritüel enerjisiyle yaratıcı ilham ve iç dünya için verimli bir gün."],
]);

// ─── Numeroloji katkısı ───────────────────────────────────────────────────────

const NUM_POTENTIAL = new Map<number, string>([
  [1,  "1 sayısının liderlik ve bağımsızlık titreşimi bu potansiyeli pekiştiriyor."],
  [2,  "2 sayısının uyum ve işbirliği enerjisi dengeyi ve bağlantıyı güçlendiriyor."],
  [3,  "3 sayısının yaratıcılık ve neşe titreşimi ifade ve büyümeyi destekliyor."],
  [4,  "4 sayısının düzen ve sağlamlık enerjisi sağlam zemin sağlıyor."],
  [5,  "5 sayısının değişim ve özgürlük enerjisi hareketi ve adaptasyonu destekliyor."],
  [6,  "6 sayısının sevgi ve uyum enerjisi ilişkileri ve iyileşmeyi besliyor."],
  [7,  "7 sayısının spiritüel derinliği içe dönüş ve sezgiyi güçlendiriyor."],
  [8,  "8 sayısının güç ve bolluk enerjisi hedef odaklı çalışmayı destekliyor."],
  [9,  "9 sayısının tamamlanma bilgeliği döngüleri kapatmaya ve bütünleşmeye yardım ediyor."],
  [11, "11 üstay sayısının yüksek sezgi titreşimi bu güne özel bir derinlik katıyor."],
  [22, "22 üstay sayısının büyük vizyon enerjisi somut hayaller kurmak için güçlü."],
  [33, "33 üstay sayısının evrensel şefkat enerjisi bugün özellikle aktif."],
]);

// ─── Ay fazına göre önerilen aktiviteler ─────────────────────────────────────

const PHASE_ACTIVITIES = new Map<string, string[]>([
  ["Yeni Ay",       ["Niyet belirleme", "Hedef yazma", "Yeni projeler başlatma", "İçsel hazırlık"]],
  ["Büyüyen Hilal", ["Harekete geçme", "Yeni bağlantılar kurma", "Araştırma", "İlk adımlar atma"]],
  ["İlk Dördün",    ["Karar verme", "Engelleri aşma", "Kararlılıkla çalışma", "Problem çözme"]],
  ["Şişen Ay",      ["Proje tamamlama", "Paylaşım ve sunum", "Büyüme odaklı çalışma", "İlerlemeyi gözden geçirme"]],
  ["Dolunay",       ["Tamamlanmayı kutlama", "Serbest bırakma ritüeli", "Netleşme", "Farkındalık pratiği"]],
  ["Azalan Ay",     ["Geçmiş analizi", "Öğrenme ve değerlendirme", "Geri bildirim alma", "Temizlik ve düzenleme"]],
  ["Son Dördün",    ["Eski kalıpları bırakma", "Arınma ritüeli", "Bitirilmemiş işleri tamamlama", "Alan açma"]],
  ["Balsamik",      ["Derin dinlenme", "Sessiz meditasyon", "Yalnız çalışma", "Yeni dönem niyeti"]],
]);

// ─── Ay burcuna göre ek aktiviteler ──────────────────────────────────────────

const SIGN_ACTIVITIES = new Map<string, string[]>([
  ["Koç",     ["Cesur girişimler", "Fiziksel aktivite"]],
  ["Boğa",    ["Doğayla temas", "El işi veya somut üretim"]],
  ["İkizler", ["Yazma ve iletişim", "Fikir paylaşımı"]],
  ["Yengeç",  ["Aile ve yakın çevre zamanı", "Duygusal destek verme/alma"]],
  ["Aslan",   ["Yaratıcı ifade", "Sunum ve gösterim"]],
  ["Başak",   ["Sağlık rutinleri", "Detaylı analiz"]],
  ["Terazi",  ["İlişki köprüsü kurma", "Estetik ve tasarım"]],
  ["Akrep",   ["Derin araştırma", "Dönüşüm çalışması"]],
  ["Yay",     ["Öğrenme ve keşif", "Uzun vadeli planlama"]],
  ["Oğlak",   ["Kariyer adımları", "Yapısal planlama"]],
  ["Kova",    ["Topluluk projesi", "Yenilikçi fikirler"]],
  ["Balık",   ["Sanatsal çalışma", "Spiritüel pratik"]],
]);

// ─── Ay fazına göre dikkat ────────────────────────────────────────────────────

const PHASE_CAUTIONS = new Map<string, string[]>([
  ["Yeni Ay",       ["Büyük kararlara acele etmek", "Aşırı yüklenme"]],
  ["Büyüyen Hilal", ["Sabırsızlık", "Çok fazla odak noktası seçmek"]],
  ["İlk Dördün",    ["Tükenmeden önce dinlenmeyi ihmal etmek", "Dirençle boğuşmak"]],
  ["Şişen Ay",      ["Aşırı heyecanla acele karar vermek", "Sabırsız davranmak"]],
  ["Dolunay",       ["Duygusal tepkiler", "Reaktif ve aceleci kararlar"]],
  ["Azalan Ay",     ["Geçmişe takılıp kalmak", "Bırakmakta güçlük çekmek"]],
  ["Son Dördün",    ["Yeni başlangıçlara acele etmek", "Yarım bırakılan işleri dağıtmak"]],
  ["Balsamik",      ["Aşırı izolasyon", "Bekleyememe sabırsızlığı"]],
]);

// ─── Ay burcuna göre ek dikkat ────────────────────────────────────────────────

const SIGN_CAUTIONS = new Map<string, string>([
  ["Koç",     "Düşünmeden harekete geçmek"],
  ["Boğa",    "Katılık ve değişime direnç"],
  ["İkizler", "Dağınık enerji ve odak kaybı"],
  ["Yengeç",  "Aşırı duygusal hassasiyet"],
  ["Aslan",   "Ego merkezli tepkiler"],
  ["Başak",   "Aşırı eleştiri ve mükemmeliyetçilik"],
  ["Terazi",  "Kararsızlık döngüsüne girmek"],
  ["Akrep",   "Saplantılı düşünce veya kontrol ihtiyacı"],
  ["Yay",     "Aşırı iyimserlikle gerçekçiliği kaybetmek"],
  ["Oğlak",   "İş-yaşam dengesini ihmal etmek"],
  ["Kova",    "Duygusal kopukluk"],
  ["Balık",   "Sınır koymakta güçlük"],
]);

// ─── Ruhsal öneri (ay burcuna göre) ──────────────────────────────────────────

const SIGN_SPIRITUAL = new Map<string, string>([
  ["Koç",     "Hareket meditasyonu veya sabah doğa yürüyüşü enerjiyi dengeler."],
  ["Boğa",    "Topraklanma meditasyonu ve sessiz doğa zamanı kalıcı denge getirir."],
  ["İkizler", "Mantra okumak veya günlük tutmak zihinsel berraklık sağlar."],
  ["Yengeç",  "Su ritüeli veya nefes çalışması duyguları dengelemekte destekleyici."],
  ["Aslan",   "Güneş selamlama ve kalp çakrası pratiği yaratıcılığı besler."],
  ["Başak",   "Bilinçli nefes veya temizlik ritüeli denge ve netlik getirir."],
  ["Terazi",  "Güzellik ve uyum üzerine meditasyon veya ses terapisi faydalı."],
  ["Akrep",   "Derin nefes ve arınma ritüeli bugün çok güçlü etki yapar."],
  ["Yay",     "Doğada uzun yürüyüş veya vizyon meditasyonu önerilen pratik."],
  ["Oğlak",   "Sabah rutini oluşturmak veya yapısal bir pratik başlatmak idealdir."],
  ["Kova",    "Akış meditasyonu veya niyetli kolektif enerji çalışması destekleyici."],
  ["Balık",   "Ses banyosu, görselleştirme veya rüya günlüğü tutmak bugün güçlü."],
]);

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export function getDailyGuidance(date: Date): DailyGuidance {
  const phase = getMoonPhase(date);
  const sign  = getMoonSign(date);
  const num   = numerologicalDay(date);

  // Potansiyel (3 parça birleşimi)
  const phasePotential = PHASE_POTENTIAL.get(phase.name) ?? "Kozmik döngüler aktif.";
  const signPotential  = SIGN_POTENTIAL.get(sign.name)   ?? "";
  const numPotential   = NUM_POTENTIAL.get(num)          ?? "";
  const potential      = [phasePotential, signPotential, numPotential].filter(Boolean).join(" ");

  // Aktiviteler (faz 3 + burç 2 = 5 madde max)
  const phaseActs = PHASE_ACTIVITIES.get(phase.name) ?? [];
  const signActs  = SIGN_ACTIVITIES.get(sign.name)   ?? [];
  const activities = [...phaseActs.slice(0, 3), ...signActs.slice(0, 2)];

  // Dikkat (faz 2 + burç 1 = 3 madde)
  const phaseCauts = PHASE_CAUTIONS.get(phase.name) ?? [];
  const signCaut   = SIGN_CAUTIONS.get(sign.name);
  const cautions   = signCaut
    ? [...phaseCauts, signCaut].slice(0, 4)
    : phaseCauts.slice(0, 3);

  // Ruhsal öneri
  const spiritualSuggestion = SIGN_SPIRITUAL.get(sign.name)
    ?? "Kısa bir nefes veya meditasyon pratiği günü anlamlandırır.";

  return { potential, activities, cautions, spiritualSuggestion };
}
