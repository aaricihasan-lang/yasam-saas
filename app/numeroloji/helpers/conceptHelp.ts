// FAZ 6 / UAT PATCH 1 — "Bu ne demek?" KAVRAM TANIMI kataloğu.
//
// SADECE presentation metadata. FORMÜL MOTORU DEĞİLDİR; yeni numeroloji hesabı,
// yorum, skor veya öneri İÇERMEZ. Tanımlar mevcut canonical engine semantic identity'sine
// ve kaynak terminolojisine dayanır (kitap 1./2. seviye). Uzun interpretation metni tekrar
// EDİLMEZ — her giriş yalnızca kısa bir KAVRAM TANIMIDIR.

export const CONCEPT_HELP: Record<string, string> = {
  // ── Bireysel ana hesaplar ────────────────────────────────────────────────
  anaKulvar:
    "Adınızın harf değerlerinden hesaplanan ana kulvar (temel yaşam kulvarı) sayısıdır. Kişinin çekirdek/özsel yönünü temsil eden ana çizgidir.",
  yanKulvar:
    "Ana Kulvarı tamamlayan yan kulvar sayısıdır; yine adınızın harf değerlerinden hesaplanır.",
  ifadeSayisi:
    "Ad ve soyadınızdaki tüm harflerin sayısal değerlerinin sadeleştirilmesiyle bulunan ifade sayısıdır. Ana/master sayılar (11/19/22/33) kaynak kuralınca korunabilir.",
  hayatYolu:
    "Doğum tarihinizdeki tüm rakamların toplanıp sadeleştirilmesiyle bulunan hayat yolu sayısıdır. Ana/master sayılar (11/22/33) korunur.",
  pin:
    "Doğum tarihinizden türetilen dokuz haneli sayısal koddur; her hane farklı bir yaşam alanını temsil eder.",
  elementler:
    "PIN kodunuzdaki sayıların Hava, Su, Ateş ve Toprak elementlerine göre dağılımıdır.",
  cakraOmurgasi:
    "Sayı ve harf desteklerinizin çakralara göre dağılımını gösteren omurga tablosudur.",
  degisimDonusum:
    "Yaşamınızdaki değişim-dönüşüm yıllarını ve bu değişimlerin etkili olduğu dönemleri gösterir.",
  zirve:
    "Yaşamınızdaki zirve (doruk) dönemlerini ve karşılık gelen yaşları gösterir.",
  mucadele:
    "Yaşamınızdaki mücadele dönemlerini ve karşılık gelen yaşları gösterir.",
  harflerinYankilanisi:
    "Ad-soyad harflerinizin, harf değerlerine göre yaşam zaman çizginizde hangi yaş/yıl aralığında etkili olduğunu gösteren kaynak yöntemidir.",

  // ── Zamanlama (FAZ 4) ─────────────────────────────────────────────────────
  universalYear:
    "Seçilen takvim yılının genel numerolojik sayısıdır. Kişiye özel değildir; aynı yıl için herkes açısından aynı evrensel zamanlama değeridir.",
  universalMonth:
    "Seçilen ayın Evrensel Yıl ile birlikte oluşturduğu genel aylık sayıdır. Kişiye özel değildir.",
  universalDay:
    "Seçilen günün evrensel günlük sayısıdır. Kişiye özel değildir.",
  nominalPersonalYear:
    "Seçilen takvim yılı için doğum gününüz, doğum ayınız ve yıl kullanılarak hesaplanan kişisel yıl sayısıdır. Bu sayı takvim yılı hesabını gösterir; o tarihte fiilen aktif olan kişisel yıl farklı olabilir.",
  activePersonalYear:
    "Referans tarihinde gerçekten içinde bulunduğunuz kişisel yıl dönemidir. Kaynak yönteminde yeni kişisel yıl doğum gününüzde başlar ve bir sonraki doğum gününe kadar devam eder.",
  personalMonth:
    "Seçilen ay için kişiye özel aylık zamanlama sayısıdır. Kişisel yıl hesabı ile takvim ayı birlikte değerlendirilir.",
  personalDay:
    "Seçilen gün için kişiye özel günlük zamanlama sayısıdır. Kişisel yıl, kişisel ay ve gün değeri birlikte hesaplanır.",
  evre:
    "Yaşamın dokuz yıllık büyük gelişim dönemlerinden hangisinde bulunduğunuzu gösterir.",
  dongu:
    "Bulunduğunuz dokuz yıllık evrenin içinde kaçıncı yılda olduğunuzu gösterir. Evre ile aynı şey değildir.",
  yearChakra:
    "Seçilen yıl için doğum günü, doğum ayı ve referans yıl kullanılarak hesaplanan yıllık çakra sayısıdır.",
  maturity:
    "Doğum tarihi tarafı ile ad-soyad tarafının birlikte değerlendirilmesinden elde edilen gelişim sayısıdır. Kaynak yönteminde özellikle olgunluk döneminde (yaklaşık 45 yaştan itibaren) belirginleşen temayı gösterir.",
  birthDayEnergy:
    "Doğduğunuz ayın gerçek gününe, yani 1–31 arasındaki doğum günü sayınıza ait kaynak yorumudur. Bu sayı sadeleştirilmez.",
  personalityEnergy:
    "Doğum gününüzün tek haneye sadeleştirilmiş kişilik sayısıdır.",
  lifeLesson:
    "Kişilik Enerjisi ile Hayat Yolu tarafının birlikte değerlendirilmesinden elde edilen ayrı bir gelişim hesabıdır. PIN'deki 5. hane 'Yaşam Dersi' ile aynı şey değildir.",
  destiny:
    "Ad ve soyadınızdaki bütün harflerin sayısal değerlerinden elde edilen isim temelli kader sayısıdır.",

  // ── İlişki ────────────────────────────────────────────────────────────────
  kisiselPin:
    "Her kişinin doğum tarihinden türetilen dokuz haneli sayısal kodudur.",
  synergyPin:
    "İki kişinin PIN kodlarının ilk sekiz hanesinin aynı pozisyonda birleştirilmesiyle oluşan ortak sinerji kodudur.",
  relationshipSoulFeeling:
    "Sinerji PIN'in 8. hanesine karşılık gelen, ilişkinin duygusal/ruhsal tonunu anlatan kaynak yorumudur.",
  whyTogether:
    "Sinerji PIN'in ilk sekiz hanesinin toplamından (9. hane) elde edilen, iki kişiyi bir araya getiren temayı anlatan sayıdır.",
  relationshipTriangle:
    "İlişki Üçgeni yeni bir hesap değildir; Sinerji PIN'in 1,2,3,6,7,8. hanelerinin kaynak yorumudur (4 ve 5 kaynak kuralı gereği dışta kalır).",
  lifeCode:
    "Her kişinin doğum tarihindeki tüm rakamların tek haneye indirgenmesiyle bulunan Yaşam Kodu sayısıdır.",
  nameNumber:
    "Kişinin ad ve soyadındaki harflerin sayısal değerlerinin tek haneye indirgenmesiyle bulunan isim sayısıdır.",
  acquisition:
    "Doğum günü ve doğum ayının tek haneye indirgenmesiyle bulunan edinim sayısıdır.",
  birthdayNumber:
    "Doğum gününüzün tek haneye indirgenmiş sayısıdır.",
  commonDigit:
    "İki kişinin İsim Sayısı değerlerinin toplanıp tek haneye indirgenmesiyle bulunan ortak rakamdır; hangi konularda anlaştığınızı anlatır.",
  elementBalance:
    "Sinerji PIN hanelerinin Hava, Su, Ateş ve Toprak elementlerine göre dağılımıdır.",
  dominance:
    "Sinerji PIN hanelerinin baskın (1,3,6,8) ve edilgen (2,4,5,7) sayılara göre dağılımıdır. Bu bir uyum puanı değildir.",

  // ── Ev / İş Yeri ──────────────────────────────────────────────────────────
  evOfisSayisi:
    "Ev veya iş yerinizin bina/kapı numarası ile daire numarasının toplanıp tek haneye indirilmesiyle bulunan mekân sayısıdır; mekânın numerolojik karakterini gösterir.",
  isyeriUyumu:
    "İş yeri adının harf değerlerinden hesaplanan, iş yerinin uyum karakterini gösteren kaynak sınıflandırmasıdır.",
};

/** Kavram tanımı (yoksa undefined). Presentation metadata; yeni yorum üretmez. */
export function conceptHelp(key: string): string | undefined {
  return CONCEPT_HELP[key];
}
