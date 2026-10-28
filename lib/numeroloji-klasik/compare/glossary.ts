/**
 * Klasik Numeroloji · Karşılaştırma — KAVRAM SÖZLÜĞÜ (saf; istemci + sunucu güvenli).
 *
 * İki ekol: "Mevcut Numeroloji" (kurumun kitap 1/2 metodolojisi, kayıtlı analiz anlık görüntüsü) ve
 * "Klasik Numeroloji" (Pisagor/Batı — Decoz uzlaşımı; Kalde/Cheiro). Sözlük YALNIZ sabit uzman açıklaması
 * taşır; karşılaştırma ekranı yorum ÜRETMEZ, iki sayıyı tek sayıda BİRLEŞTİRMEZ. Karar uzmanındır.
 *
 * Uzmana görünen metinlerde sağlayıcı adı YOKTUR (bkz. MIMARI.md §5).
 */

export type ComparableKind = "value" | "root" | "not_comparable";

export type ConceptKey =
  | "hayat_yolu"
  | "ifade"
  | "ana_kulvar"
  | "yan_kulvar"
  | "dogum_gunu"
  | "olgunluk"
  | "zirve"
  | "mucadele"
  | "kisisel_yil"
  | "kisisel_ay"
  | "kisisel_gun"
  | "karmik";

export type GlossaryEntry = {
  conceptKey: ConceptKey;
  labelTr: string;
  /** Mevcut Numeroloji kayıt alanı/alanları (analysis_data.motor.* ya da kayıtta tutulmayan canlı hesap). */
  legacyFields: readonly string[];
  /** Klasik sonuç alanı/alanları (ChartResult yolu ya da ayrı uç). */
  classicFields: readonly string[];
  /** Adı benzer/aynı ama formülü farklı mı? */
  sameNameDifferentFormula: boolean;
  legacyLabelTr: string;
  classicLabelTr: string;
  legacyMethodTr: string;
  classicMethodTr: string;
  differenceTr: string;
  comparable: ComparableKind;
};

export const COMPARE_GLOSSARY_VERSION = "num-compare-glossary-v1";

export const LEGACY_SCHOOL_LABEL = "Mevcut Numeroloji";
export const CLASSIC_SCHOOL_LABEL = "Klasik Numeroloji";

const E = (e: GlossaryEntry): GlossaryEntry => Object.freeze({ ...e, legacyFields: Object.freeze([...e.legacyFields]), classicFields: Object.freeze([...e.classicFields]) });

export const COMPARE_GLOSSARY: readonly GlossaryEntry[] = Object.freeze([
  E({
    conceptKey: "hayat_yolu",
    labelTr: "Hayat Yolu ↔ Yaşam Yolu",
    legacyFields: ["motor.hayatYolu.display"],
    classicFields: ["core.lifePath"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Hayat Yolu / DM Kodu",
    classicLabelTr: "Yaşam Yolu",
    legacyMethodTr:
      "Doğum tarihindeki tüm rakamlar tek tek toplanır ve toplam bir kez sadeleştirilir; sonuç \"toplam/sade\" biçiminde gösterilir (ör. 36/9, 29/11, 19/10). Toplam 11 ve altındaysa tek değerdir (10 → 10/1). 22 ve 33 usta sayı olarak korunmaz (22/4, 33/6).",
    classicMethodTr:
      "Ay, gün ve yıl AYRI AYRI sadeleştirilir (usta sayılar 11/22/33 korunur), sonra toplanıp yeniden sadeleştirilir. Son indirgeme yolunda 13/14/16/19 görülürse karmik borç olarak işaretlenir.",
    differenceTr:
      "İki ekol aynı doğum tarihinden farklı gösterim üretir: Mevcut Numeroloji iki basamaklı toplamı ve tek sadeleştirmeyi birlikte okur (Dan Millman tarzı), Klasik Numeroloji tek bir nihai sayı ve usta sayı verir. Rakam toplamının kökü (1–9) iki yöntemde her zaman aynıdır; ancak 11 ile 2, ya da 19/10 ile 1 aynı sayı DEĞİLDİR — usta sayı ve iki basamaklı kod ayrı okuma gerektirir.",
    comparable: "value",
  }),
  E({
    conceptKey: "ifade",
    labelTr: "İfade ↔ İfade (Kader)",
    legacyFields: ["motor.ifadeSayisi.display"],
    classicFields: ["core.expression"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "İfade Sayısı",
    classicLabelTr: "İfade (Kader) Sayısı",
    legacyMethodTr:
      "Ad ve soyadın TÜM harfleri tek bir toplamda birleştirilir, tek haneye indirgenir; yalnız 11 ve 22 korunur (19 ve 33 indirgenir).",
    classicMethodTr:
      "Her isim parçası ayrı ayrı sadeleştirilir (usta sayılar korunur), parça sonuçları toplanıp yeniden sadeleştirilir; 11/22/33 korunur, 13/14/16/19 karmik borç olarak işaretlenir.",
    differenceTr:
      "Harf tablosu aynıdır (Pisagor döngüsel; Türkçe harfler temel harfe katlanır: Ç→C, Ğ→G, İ/I→I, Ö→O, Ş→S, Ü→U). Fark indirgeme sırasındadır: tüm-ad toplamı ile parça-parça indirgeme aynı kökü verir ama usta sayı (özellikle 33) ve karmik işaret yalnız birinde görülebilir.",
    comparable: "value",
  }),
  E({
    conceptKey: "ana_kulvar",
    labelTr: "Ana Kulvar ↔ Ruh Güdüsü",
    legacyFields: ["motor.anaKulvar.display", "motor.anaKulvar.componentValues"],
    classicFields: ["core.soulUrge"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Ana Kulvar",
    classicLabelTr: "Ruh Güdüsü (Kalp Arzusu)",
    legacyMethodTr:
      "Her isim parçasının sesli harfleri (A E I İ O Ö U Ü) ayrı toplanır; 11/19/22/33 özel sayı olarak korunur ve \"özel/kalan\" yol gösterimiyle yazılır (ör. 19/2, 22/3, 11/11 (22)). Parantez alternatif okuma hatırlatmasıdır.",
    classicMethodTr:
      "Tüm sesli harfler (A E I O U; Y ve W sessiz) toplanıp sadeleştirilir; 11/22/33 korunur, 13/14/16/19 karmik borç olarak işaretlenir. Sonuç tek sayıdır.",
    differenceTr:
      "Mevcut Numeroloji'nin Ana Kulvar'ı bir kulvar (yol) okumasıdır: özel sayıyı ve kalanı birlikte gösterir; Klasik Ruh Güdüsü tek nihai sayıdır. Sesli harf kümesi ve harf değerleri aynı olduğundan kök (1–9) karşılaştırılabilir; yol gösterimi ile tek sayı birebir eşlenmez. 19 Mevcut Numeroloji'de özel sayıdır, Klasik'te karmik borç işaretidir.",
    comparable: "root",
  }),
  E({
    conceptKey: "yan_kulvar",
    labelTr: "Yan Kulvar ↔ Kişilik",
    legacyFields: ["motor.yanKulvar.display", "motor.yanKulvar.componentValues"],
    classicFields: ["core.personality"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Yan Kulvar",
    classicLabelTr: "Kişilik Sayısı",
    legacyMethodTr:
      "Her isim parçasının sessiz harfleri ayrı toplanır; 11/19/22/33 özel sayı olarak korunur ve \"özel/kalan\" yol gösterimiyle yazılır.",
    classicMethodTr: "Tüm sessiz harfler (Y ve W dahil) toplanıp sadeleştirilir; 11/22/33 korunur, karmik borç işaretlenir.",
    differenceTr:
      "Ana Kulvar ↔ Ruh Güdüsü ile aynı ilişki: sessiz harf kümesi ve harf değerleri aynıdır, kök karşılaştırılabilir; Mevcut Numeroloji'nin özel sayı yol gösterimi tek sayıya indirgenmeden okunmalıdır.",
    comparable: "root",
  }),
  E({
    conceptKey: "dogum_gunu",
    labelTr: "Doğum Günü Enerjisi ↔ Doğum Günü",
    legacyFields: ["(kayıtta yok) Doğum Günü Enerjisi 1–31", "(kayıtta yok) Kişilik Enerjisi 1–9"],
    classicFields: ["core.birthDay"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Doğum Günü Enerjisi / Kişilik Enerjisi",
    classicLabelTr: "Doğum Günü Sayısı",
    legacyMethodTr:
      "Doğum Günü Enerjisi ayın günüdür (1–31, indirgenmez). Kişilik Enerjisi aynı günün 1–9'a tam indirgenmesidir (usta sayı korunmaz). İkisi de kayıtlı analizde saklanmaz, ekranda canlı gösterilir.",
    classicMethodTr: "Ayın günü; 11 ve 22 korunur (29 → 11), diğer iki haneli günler tek haneye indirgenir; 13/14/16/19 karmik borç olarak işaretlenir.",
    differenceTr:
      "Mevcut Numeroloji iki ayrı kavram kullanır (indirgenmemiş gün enerjisi ve tam indirgenmiş kişilik enerjisi); Klasik Doğum Günü Sayısı ikisinin arasındadır (usta sayıyı korur). Kayıtlı analizde bu alan bulunmadığından karşılaştırma ekranı Mevcut tarafı yeniden HESAPLAMAZ; uzman Mevcut Numeroloji ekranından bakar.",
    comparable: "root",
  }),
  E({
    conceptKey: "olgunluk",
    labelTr: "Olgunluk ↔ Olgunluk (Gerçekleşme)",
    legacyFields: ["(kayıtta yok) Olgunluk Sayısı"],
    classicFields: ["core.maturity"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Olgunluk Sayısı",
    classicLabelTr: "Olgunluk (Gerçekleşme) Sayısı",
    legacyMethodTr:
      "Doğum tarihi rakam toplamı (11/22 korunarak) + ad-soyad harf toplamı (11/22 korunarak) toplanır ve yeniden 11/22 korunarak indirgenir; 33 ve 19 korunmaz. Kayıtlı analizde saklanmaz.",
    classicMethodTr: "Yaşam Yolu + İfade (usta değerleriyle) toplanır, usta sayılar korunarak indirgenir.",
    differenceTr:
      "Bileşenler farklı indirgendiği için (Mevcut: tüm tarih ve tüm ad toplamı; Klasik: Yaşam Yolu ve İfade nihai sayıları) aynı kişide farklı usta sayı çıkabilir; kök çoğunlukla aynıdır. Mevcut taraf kayıtta yoktur, yeniden hesaplanmaz.",
    comparable: "root",
  }),
  E({
    conceptKey: "zirve",
    labelTr: "Zirve Yılları ↔ Zirveler",
    legacyFields: ["motor.zirveYillari.peaks[].display", "motor.zirveYillari.peaks[].yasMetot1", "motor.zirveYillari.peaks[].yasMetot2"],
    classicFields: ["pinnacles[]"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Zirve Yılı",
    classicLabelTr: "Zirve",
    legacyMethodTr:
      "Gün, ay ve yıl ayrı indirgenir (11/22 korunur, 33 korunmaz). 1. = gün+ay, 2. = gün+yıl, 3. = 1.+2., 4. = ay+yıl. Yaş İKİ yöntemle verilir: Metot 1 = 36 − 1. zirve sayısı, Metot 2 = 36 − Hayat Yolu kökü; sonra +9, +9, +9 (nokta yaş).",
    classicMethodTr:
      "Ay, gün ve yıl (yıl önce rakam toplamı) usta sayılar 11/22/33 korunarak indirgenir; aynı dört toplam. İlk zirve 36 − Yaşam Yolu (tek hane) yaşında biter, sonrakiler 9'ar yıllık dönemdir; 4. zirve ömür boyu sürer (dönem aralığı).",
    differenceTr:
      "Zirve sayıları çoğunlukla aynı çıkar; fark 33'ün korunması ve yıl bileşeninin indirgenme biçimindedir. Asıl fark zamanlamadadır: Mevcut Numeroloji nokta yaş (iki metot) verir, Klasik dönem aralığı verir. Klasik ilk dönem bitişi Mevcut Metot 2 yaşına denk gelir; Metot 1 farklı olabilir.",
    comparable: "value",
  }),
  E({
    conceptKey: "mucadele",
    labelTr: "Mücadele Yılları ↔ Zorluklar",
    legacyFields: ["motor.mucadeleYillari.method1[].topic", "motor.mucadeleYillari.anaMucadele"],
    classicFields: ["challenges[]"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Mücadele",
    classicLabelTr: "Zorluk",
    legacyMethodTr:
      "Gün, ay, yıl tek haneye indirgenir (özel sayı korunmaz). M1 = |gün − ay| (36 − M1 yaşına kadar), M2 = |gün − yıl| (+27), M3 = |ay − yıl| (+27); Ana Mücadele = |M1 − M2| 3. geçiş sınırından sonra geçerlidir. Eski kayıtlarda nokta yaşlar ve M3 = |M1 − M2| bulunabilir.",
    classicMethodTr:
      "Aynı mutlak farklar: 1. = |ay − gün|, 2. = |gün − yıl|, 3. (ana) = |1. − 2.| ömür boyu, 4. = |ay − yıl| 4. zirveyle başlar. Dönemler zirve dönemleriyle eşlenir.",
    differenceTr:
      "Sayılar formül eşlemesiyle karşılaştırılır (sıra ile değil): Mevcut M1 ↔ Klasik 1., M2 ↔ 2., Ana Mücadele ↔ 3. (ana), M3 ↔ 4. Sayılar genelde aynıdır; zamanlama farklıdır (Mevcut: 36 − M1 ve 27'şer yıllık geçiş sınırları; Klasik: Yaşam Yolu'na bağlı zirve dönemleri, ana zorluk ömür boyu).",
    comparable: "value",
  }),
  E({
    conceptKey: "kisisel_yil",
    labelTr: "Kişisel Yıl",
    legacyFields: ["(kayıtta yok) Aktif / Nominal Kişisel Yıl"],
    classicFields: ["personalYear.personalYear"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Kişisel Yıl (aktif / nominal)",
    classicLabelTr: "Kişisel Yıl",
    legacyMethodTr:
      "Gün + ay + takvim yılı rakamları → 1–9. AKTİF Kişisel Yıl doğum gününde değişir (doğum günü gelmediyse önceki yıl); NOMİNAL değer takvim yılıdır. Kayıtlı analizde saklanmaz.",
    classicMethodTr: "Ay + gün + hedef yıl, her biri tek haneye indirgenip toplanır → 1–9. 1 Ocak'ta değişir.",
    differenceTr:
      "Klasik değer Mevcut Numeroloji'nin NOMİNAL Kişisel Yılı ile aynı mantıktadır; AKTİF Kişisel Yıl ise 1 Ocak ile doğum günü arasında bir önceki yılın değerini taşır. Bu aralıkta iki ekol farklı sayı gösterir; ikisi de kendi kuralında doğrudur.",
    comparable: "value",
  }),
  E({
    conceptKey: "kisisel_ay",
    labelTr: "Kişisel Ay",
    legacyFields: ["(kayıtta yok) Kişisel Ay"],
    classicFields: ["personalYear.personalMonth.personalMonth"],
    sameNameDifferentFormula: false,
    legacyLabelTr: "Kişisel Ay",
    classicLabelTr: "Kişisel Ay",
    legacyMethodTr: "NOMİNAL Kişisel Yıl + takvim ayı → 1–9. Kayıtlı analizde saklanmaz.",
    classicMethodTr: "Kişisel Yıl + takvim ayı → 1–9.",
    differenceTr: "Formül aynıdır (ikisi de takvim yılına dayanır); fark yalnız hedef tarih seçiminden doğar. Mevcut taraf kayıtta yoktur, yeniden hesaplanmaz.",
    comparable: "value",
  }),
  E({
    conceptKey: "kisisel_gun",
    labelTr: "Kişisel Gün",
    legacyFields: ["(kayıtta yok) Kişisel Gün"],
    classicFields: ["personal_day.personalDay"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "Kişisel Gün",
    classicLabelTr: "Kişisel Gün",
    legacyMethodTr: "Kişisel Ay + takvim günü → 1–9 (Rafet yöntemi; Kişisel Yıl ayrıca eklenmez). Kayıtlı analizde saklanmaz.",
    classicMethodTr: "Kişisel Ay + takvim günü → 1–9.",
    differenceTr: "Formül zinciri aynıdır; tarih bağımlıdır. Karşılaştırma yalnız aynı hedef tarih için anlamlıdır. Mevcut taraf kayıtta yoktur, yeniden hesaplanmaz.",
    comparable: "value",
  }),
  E({
    conceptKey: "karmik",
    labelTr: "Karmik Sayılar",
    legacyFields: ["motor.anaKulvar (19)", "motor.yanKulvar (19)"],
    classicFields: ["karmicDebt.debtNumbers", "karmicLessons.missingNumbers"],
    sameNameDifferentFormula: true,
    legacyLabelTr: "19 (özel sayı)",
    classicLabelTr: "Karmik borç (13/14/16/19) ve karmik dersler",
    legacyMethodTr: "Mevcut Numeroloji'de 19 kulvarlarda korunan özel sayılardan biridir; ayrı bir karmik borç/ders hesabı yoktur.",
    classicMethodTr:
      "Karmik borç: Yaşam Yolu, İfade, Ruh Güdüsü, Kişilik ve Doğum Günü'nün son indirgeme yolunda 13/14/16/19 görülmesi. Karmik dersler: adda hiç bulunmayan 1–9 harf değerleri.",
    differenceTr:
      "Kavramlar eşdeğer değildir: Mevcut Numeroloji'deki 19 bir kulvar özel sayısıdır; Klasik karmik borç dört sayının herhangi birinin indirgeme yolunda görülmesidir ve karmik dersler ayrı bir eksik-sayı analizidir. Sayısal eşleşme aranmaz; iki taraf yan yana gösterilir.",
    comparable: "not_comparable",
  }),
]);

export function glossaryEntry(key: ConceptKey): GlossaryEntry {
  const e = COMPARE_GLOSSARY.find((g) => g.conceptKey === key);
  if (!e) throw new Error(`glossary: bilinmeyen kavram ${key}`);
  return e;
}

// ── Yalnız bir ekolde olan bölümler ───────────────────────────────────────────────────────────

export type OnlyLegacyKey =
  | "pin_kodu"
  | "cakra_omurgasi"
  | "elementler"
  | "degisim_donusum"
  | "harflerin_yankilanisi"
  | "evre_dongu"
  | "ev_ofis"
  | "isyeri_uyumu"
  | "sinerji_pin";

export type OnlyClassicKey =
  | "karmik_dersler"
  | "kopru_sayilari"
  | "gizli_tutku"
  | "bilincalti"
  | "isim_harfleri"
  | "dogum_gunu_profili"
  | "kalde_bilesik"
  | "ugurlu_iliskiler"
  | "isletme_adi_kalde";

export type OnlyOneSideEntry<K extends string> = {
  key: K;
  labelTr: string;
  /** Kaynak alan; kayıtta tutulmayanlar için açıklayıcı not. */
  field: string;
  /** Anlık görüntüde (kayıtlı analiz / klasik sonuç) bulunabilir mi? */
  storedInSnapshot: boolean;
  descriptionTr: string;
};

const O = <K extends string>(e: OnlyOneSideEntry<K>): OnlyOneSideEntry<K> => Object.freeze({ ...e });

export const ONLY_LEGACY: readonly OnlyOneSideEntry<OnlyLegacyKey>[] = Object.freeze([
  O({ key: "pin_kodu", labelTr: "PİN Kodu", field: "motor.pinKodu", storedInSnapshot: true, descriptionTr: "Doğum tarihinden piramit yöntemiyle elde edilen 9 kutulu kod. Klasik ekolde karşılığı yoktur." }),
  O({ key: "cakra_omurgasi", labelTr: "Çakra Omurgası", field: "motor.cakraOmurgasi", storedInSnapshot: true, descriptionTr: "Harf ve sayı destekleriyle 1–10 çakra dağılımı. Klasik ekolde karşılığı yoktur." }),
  O({ key: "elementler", labelTr: "Elementler", field: "motor.elementler", storedInSnapshot: true, descriptionTr: "PİN Kodu rakamlarının Hava/Su/Ateş/Toprak dağılımı. Klasik uğurlu element (gezegen kaynaklı) ile aynı şey değildir." }),
  O({ key: "degisim_donusum", labelTr: "Değişim-Dönüşüm Yılları", field: "motor.degisimDonusumMetni", storedInSnapshot: true, descriptionTr: "Doğum tarihinden türetilen değişim yılları dizisi. Klasik ekolde karşılığı yoktur." }),
  O({ key: "harflerin_yankilanisi", labelTr: "Harflerin Yankılanışı", field: "motor.harflerinYankilanisi", storedInSnapshot: true, descriptionTr: "İsim harflerinin yaş/yıl zaman çizelgesi. Klasik ekolde karşılığı yoktur (Klasik isim harfleri farklı bir analizdir)." }),
  O({ key: "evre_dongu", labelTr: "Evre / Döngü", field: "(kayıtta yok) zamanlama döngüleri", storedInSnapshot: false, descriptionTr: "Mevcut Numeroloji zamanlama döngüleri; kayıtlı analizde saklanmaz." }),
  O({ key: "ev_ofis", labelTr: "Ev / Ofis Sayısı", field: "(kayıtta yok) yer analizi", storedInSnapshot: false, descriptionTr: "Adres/kapı numarası analizi; kişi kaydının parçası değildir." }),
  O({ key: "isyeri_uyumu", labelTr: "İşyeri Uyumu", field: "(kayıtta yok) işyeri analizi", storedInSnapshot: false, descriptionTr: "Mevcut Numeroloji işyeri analizi; Klasik İşletme Adı (Kalde) ile aynı yöntem değildir." }),
  O({ key: "sinerji_pin", labelTr: "Sinerji PİN", field: "(kayıtta yok) ilişki analizi", storedInSnapshot: false, descriptionTr: "İki kişinin PİN kodlarından sinerji; Klasik uyum puanı ile aynı yöntem değildir." }),
]);

export const ONLY_CLASSIC: readonly OnlyOneSideEntry<OnlyClassicKey>[] = Object.freeze([
  O({ key: "karmik_dersler", labelTr: "Karmik Dersler", field: "karmicLessons", storedInSnapshot: true, descriptionTr: "Adda hiç bulunmayan 1–9 harf değerleri." }),
  O({ key: "kopru_sayilari", labelTr: "Köprü Sayıları", field: "bridge", storedInSnapshot: true, descriptionTr: "İki çekirdek sayı arasındaki fark (ör. Yaşam Yolu ↔ İfade)." }),
  O({ key: "gizli_tutku", labelTr: "Gizli Tutku", field: "hiddenPassion", storedInSnapshot: true, descriptionTr: "Adda en sık tekrar eden harf değeri." }),
  O({ key: "bilincalti", labelTr: "Bilinçaltı Benlik", field: "subconsciousSelf", storedInSnapshot: true, descriptionTr: "Adda bulunan farklı harf değeri adedi." }),
  O({ key: "isim_harfleri", labelTr: "İsim Harfleri (Köşe Taşı, Tepe Taşı, İlk Sesli)", field: "nameLetters", storedInSnapshot: true, descriptionTr: "İlk adın ilk/son harfi ve ilk sesli harfi." }),
  O({ key: "dogum_gunu_profili", labelTr: "Doğum Günü Profili", field: "birthDayProfile", storedInSnapshot: true, descriptionTr: "Ayın gününe göre klasik ekol profili." }),
  O({ key: "kalde_bilesik", labelTr: "Kalde (Cheiro) ve Bileşik Sayılar", field: "chaldean", storedInSnapshot: true, descriptionTr: "Kalde harf tablosu (1–8) ve 10–52 bileşik sayı anlamları; Pisagor'dan bağımsız ikinci sistem." }),
  O({ key: "ugurlu_iliskiler", labelTr: "Uğurlu İlişkiler", field: "luckyAssociations", storedInSnapshot: true, descriptionTr: "Yaşam Yolu'nun yönetici gezegeninden türetilen renk, taş, gün ve element." }),
  O({ key: "isletme_adi_kalde", labelTr: "İşletme Adı (Kalde)", field: "business_name", storedInSnapshot: true, descriptionTr: "İşletme adının Kalde sayısı ve değerlendirmesi." }),
]);

/** Karşılaştırma tablosu sabit üst bilgisi (yorum değil, kural). */
export const COMPARE_RULES_TR = Object.freeze([
  "İki ekolün sayıları yan yana gösterilir; tek bir ortak sayıda birleştirilmez.",
  "\"Aynı değer\" yalnız iki sayı birebir aynıysa yazılır; 11 ile 2 aynı değer değildir (yalnız aynı köktür).",
  "Mevcut Numeroloji tarafı kayıtlı analizden kaydedildiği gibi okunur; yeniden hesaplanmaz.",
  "Hangi okumanın kullanılacağına uzman karar verir.",
]);
