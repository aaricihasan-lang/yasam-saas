import type { Metadata } from "next";
import Link from "next/link";
import CookiePreferencesButton from "@/components/analytics/CookiePreferencesButton";
import LegalIdentityBlock from "@/components/kvkk/LegalIdentityBlock";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";
import { getDataResidency } from "@/lib/legal/dataResidency";

export const metadata: Metadata = {
  title: "Gizlilik Politikası — Yaşam Sistemi",
  description:
    "Yaşam Sistemi'nde kişisel verilerin hangi rollerle, hangi amaçlarla ve ne kadar süreyle işlendiği; çerez tercihleri ve haklarınız.",
};

/**
 * Gizlilik Politikası (P1-6 — nihai ürün metni).
 * Metin, uygulamanın GERÇEK davranışına göre yazılmıştır (plan §3 / §6 tutarlılık kapısı):
 *   - Rol ayrımı: danışan verilerinde uzman = veri sorumlusu, Yaşam Sistemi = veri işleyen;
 *     hesap/üyelik/ödeme/güvenlik/kullanım istatistikleri/destek/public analitik için
 *     Yaşam Sistemi = veri sorumlusu.
 *   - Saklama: IP 90 gün; kullanım olayları 180 gün; günlük özetler 25 ay (cron'lar canlıda).
 *   - GA yalnız onayla (components/GoogleAnalytics.tsx + lib/legal/analyticsConsent.ts).
 *   - Yapay zekâ yalnız yönetici modüllerinde.
 * "Teknik Kullanım İstatistikleri" bölümü: owner onaylı nihai metin (Usage360 kapanışı);
 * anlamı genişletilmez, kodun sağlamadığı mutlak garanti eklenmez.
 */
export default function GizlilikPolitikasiPage() {
  const residency = getDataResidency();
  return (
    <LegalPageShell title="Gizlilik Politikası" currentHref="/gizlilik-politikasi">
      <p>
        Bu politika, Yaşam Sistemi platformunda kişisel verilerin hangi rollerle, hangi amaçlarla ve
        ne kadar süreyle işlendiğini açıklar. Platform; danışmanlık, terapi ve bütünsel destek
        alanlarında çalışan uzmanların kendi danışan kayıtlarını yönettiği bir çalışma alanıdır.
      </p>
      <LegalIdentityBlock />

      <LegalH2 id="roller">Roller: Kim Hangi Veriden Sorumludur?</LegalH2>
      <ul>
        <li>
          <strong>Danışan verileri:</strong> Uzmanın platforma girdiği danışan kimlik ve iletişim
          bilgileri, anamnez ve sağlık/iyi oluş beyanları, notlar, analizler, raporlar, fotoğraf ve
          belgeler, seans/randevu kayıtları ve modül çıktıları bakımından{" "}
          <strong>uzman veri sorumlusudur</strong>. Yaşam Sistemi bu veriler bakımından{" "}
          <strong>veri işleyen</strong> konumundadır; verileri uzmanın platformu kullanımı
          doğrultusunda barındırır ve işler, kendi amaçları için kullanmaz.
        </li>
        <li>
          <strong>Yaşam Sistemi&apos;nin veri sorumlusu olduğu veriler:</strong> uzman hesabı,
          e-posta ve kimlik doğrulama bilgileri; üyelik, modül izinleri ve ödeme/tahsilat kayıtları;
          oturum, IP ve güvenlik kayıtları; teknik kullanım istatistikleri; destek mesajları ve
          iletişim talepleri; herkese açık sayfaların onaya bağlı ziyaret istatistikleri.
        </li>
      </ul>
      <p>
        Danışanlar, kendilerine ait verilerle ilgili taleplerini öncelikle hizmet aldıkları uzmana
        iletmelidir. Uzmanlar için örnek bir danışan aydınlatma metni{" "}
        <Link href="/kvkk-aydinlatma" className="text-violet-700 underline">
          Danışan Aydınlatma Metni
        </Link>{" "}
        sayfasında yer alır.
      </p>

      <LegalH2 id="veriler">Hangi Verileri İşliyoruz?</LegalH2>
      <ul>
        <li>
          <strong>Hesap ve üyelik verileri:</strong> ad-soyad, e-posta, parola doğrulama bilgisi,
          üyelik/paket bilgisi, modül izinleri ve ödeme durumu kayıtları. Amaç: hesabın açılması,
          üyeliğin yürütülmesi ve sözleşmenin ifası.
        </li>
        <li>
          <strong>Güvenlik kayıtları:</strong> oturum açma zamanı, IP adresi, yaklaşık konum
          (ülke/şehir), tarayıcı/cihaz bilgisi, giriş denemeleri ve güvenlik olayları. Amaç: hesabın
          yetkisiz kullanımını tespit etmek ve önlemek.
        </li>
        <li>
          <strong>Teknik kullanım istatistikleri:</strong> aşağıdaki &quot;Teknik Kullanım
          İstatistikleri&quot; bölümünde açıklanan sınırlı teknik bilgiler.
        </li>
        <li>
          <strong>Çalışma alanı verileri:</strong> uzmanın kendi alanına girdiği danışan kayıtları,
          notlar, analizler, raporlar ve yüklenen dosyalar. Bu kayıtlar sağlıkla ilgili bilgiler gibi
          özel nitelikli kişisel veriler içerebilir; her uzmanın kayıtları kendi çalışma alanında
          ayrı tutulur. Bu veriler uzman adına işlenir.
        </li>
        <li>
          <strong>Destek yazışmaları:</strong> uygulama içi destek kanalı veya iletişim kanallarıyla
          gönderdiğiniz mesajlar. Amaç: talebinizi yanıtlamak.
        </li>
      </ul>

      <LegalH2 id="erisim">Verilere Kim Erişebilir?</LegalH2>
      <p>
        Çalışma alanı verilerinize uygulama üzerinden yalnızca hesabınızla erişilebilir; erişim,
        oturum doğrulaması, çalışma alanı ayrımı ve sunucu taraflı yetki kontrolleriyle
        sınırlandırılır.
      </p>
      <p>
        Yönetim paneli; hesap, üyelik, ödeme durumu, teknik kullanım istatistikleri, güvenlik olayları
        ve destek mesajları gibi platform yönetimi bilgilerini gösterir. Rutin platform yönetiminde
        danışan içeriğine erişim verilmez; yönetim panelinde uzmanların danışan kayıtlarını veya özel
        çalışma içeriğini görüntüleme özelliği <strong>bulunmaz</strong>. Altyapı düzeyindeki teknik
        erişim (bakım, güvenlik olaylarının incelenmesi, yedekten geri yükleme, yasal yükümlülükler)
        yalnızca bu amaçlarla ve en az yetki ilkesiyle sınırlandırılır. Hesap ve güvenlik işlemleri
        kayıt altına alınır.
      </p>
      <p>
        Veriler amaç dışı kullanılmaz, satılmaz ve pazarlama amacıyla paylaşılmaz; hukuka aykırı
        üçüncü taraf paylaşımı yapılmaz. Yetkili kurum ve kuruluşların hukuka uygun talepleri
        hâlinde, mevzuatın gerektirdiği ölçüde paylaşım yapılabilir.
      </p>

      <LegalH2 id="kullanim-istatistikleri">Teknik Kullanım İstatistikleri</LegalH2>
      <p>
        Hizmetin güvenliğinin sağlanması, performansının değerlendirilmesi ve hizmetlerin
        geliştirilmesi amacıyla; son oturum zamanı, cihaz/platform türü ve depolama miktarı gibi
        sınırlı teknik kullanım ve sistem istatistikleri işlenebilir.
      </p>
      <p>
        Bu istatistikler yalnızca sistemin kullanımına ilişkin teknik bilgilerden oluşur. Kullanıcı
        tarafından sisteme girilen danışan içerikleri, danışan bilgileri, anamnez kayıtları, notlar,
        rapor metinleri, form yanıtları, analiz içerikleri, protokoller, yüklenen belgeler ve uzman
        tarafından oluşturulan diğer mesleki veya kişisel içerikler kullanım istatistiği amacıyla
        görüntülenmez, analiz edilmez veya istatistik kayıtlarına aktarılmaz.
      </p>
      <p>
        Uzmanların sisteme girdikleri mesleki veriler ve danışan içerikleri diğer uzmanlar tarafından
        görüntülenemez. Yönetim panelinde uzmanların içerikleri görüntülenmez; yönetim tarafında
        yalnız hesap yönetimi, teknik sistem işlemleri ve kullanım istatistikleriyle sınırlı bilgiler
        bulunur.
      </p>
      <p>
        Yönetim tarafında görülebilen bilgiler; hesabın durumu, son oturum zamanı, işlem türlerinin
        sayıları, yaklaşık aktif kullanım süresi, cihaz/platform bilgileri, depolama miktarı ve benzeri
        teknik sistem istatistikleriyle sınırlıdır.
      </p>
      <p>
        Bu bilgiler, yapılan işlemin içeriğini değil, yalnızca sistem üzerinde bir işlem
        gerçekleştiğini gösterir.
      </p>
      <p>
        Yaşam Sistemi’nin temel veri gizliliği yaklaşımı; her uzmanın kendi çalışma alanındaki
        mesleki ve danışan verilerinin diğer uzmanlardan izole tutulması, kullanıcı içeriklerinin
        yönetimsel kullanım istatistiklerinden kesin olarak ayrılması ve sistem yönetiminin kullanıcı
        içeriklerinin rutin olarak görüntülenmesine dayanmamasıdır.
      </p>

      <LegalH2 id="hizmet-saglayicilar">Hizmet Sağlayıcılar (Alt İşleyiciler)</LegalH2>
      <p>
        Platformun çalışması için veritabanı/depolama, barındırma, arka plan işleri, yönetici
        modüllerinde yapay zekâ ve onaya bağlı ziyaret istatistikleri için hizmet sağlayıcılar
        kullanılır. Güncel liste ve her birinin kapsamı{" "}
        <Link href="/alt-isleyiciler" className="text-violet-700 underline">
          Alt İşleyiciler
        </Link>{" "}
        sayfasındadır.
      </p>

      <LegalH2 id="cerezler">Çerezler ve Yerel Depolama</LegalH2>
      <p>
        <strong>Zorunlu kayıtlar</strong> (onay gerektirmez; hizmetin çalışması için gereklidir):
      </p>
      <ul>
        <li>
          <code>yasam_admin_session</code> — yönetici oturumunu doğrulayan, tarayıcı betiklerinin
          okuyamadığı (httpOnly) oturum çerezi.
        </li>
        <li>
          <code>NEXT_LOCALE</code> — seçtiğiniz arayüz dilini hatırlayan çerez.
        </li>
        <li>
          Yerel depolamadaki oturum anahtarları (<code>yasam_user</code>,{" "}
          <code>yasam_session_token</code>) — oturumunuzu sürdürmek için. Uygulama ayrıca bazı modül
          tercihlerini ve verilerini hızlı göstermek için yerel depolamayı kullanır.
        </li>
        <li>
          Çerez tercihi kaydı (<code>yasam_analytics_consent_v1</code>) — yalnızca analitik
          kararınızı ve karar tarihini saklar.
        </li>
      </ul>
      <p>
        <strong>İsteğe bağlı analitik çerezler:</strong> Google Analytics (<code>_ga</code>,{" "}
        <code>_ga_*</code>) yalnızca onay verdiğinizde, yalnızca herkese açık sayfalarda (ana sayfa,
        hukuki sayfalar, iletişim, kayıt) ve oturum açmamışken çalışır. Onay vermezseniz Google
        Analytics yüklenmez ve bu çerezler oluşturulmaz. Oturum açtığınızda ve uygulama içi sayfalarda
        (danışan, modül, yönetim sayfaları) Google Analytics çalışmaz.
      </p>
      <p>
        Vercel Analytics / Speed Insights çerez kullanmadan sayfa ziyaretlerini ve performansı ölçer;
        gönderilen sayfa adreslerinde kimlik numaraları maskelenir ve sorgu parametreleri gönderilmez.
      </p>
      <p>
        Analitik tercihinizi dilediğiniz zaman değiştirebilir veya onayınızı geri çekebilirsiniz.
        Geri çektiğinizde Google Analytics durdurulur ve analitik çerezleri silinir; zorunlu kayıtlar
        etkilenmez.
      </p>
      <div className="not-prose mt-3">
        <CookiePreferencesButton />
      </div>

      <LegalH2 id="yapay-zeka">Yapay Zekâ Özellikleri</LegalH2>
      <p>
        Yapay zekâ destekli belge, ders notu ve video işleme özellikleri yalnızca yönetici
        modüllerinde açıktır. Uzman hesaplarında bu özellikler kapalıdır; uzmanların danışan verileri
        yapay zekâ sağlayıcısına gönderilmez ve yapay zekâ işlemine konu edilmez.
      </p>

      <LegalH2 id="veri-konumu">Veri Konumu ve Yurt Dışı</LegalH2>
      <p>
        {residency.configured ? (
          <>
            Veritabanı ve dosya depolama bölgesi: <strong>{residency.label}</strong>
            {residency.note ? ` — ${residency.note}` : ""}.{" "}
          </>
        ) : null}
        Hizmet sağlayıcıların bir kısmı yurt dışında bulunduğundan, verilerin yurt dışında işlenmesi
        söz konusu olabilir. Uzmanların, danışanlarından bu konuda gerekli açık rızayı alması ve
        kayıt altına alması gerekir; platform bunun için danışan kaydında onam kaydı bölümü sunar.
      </p>

      <LegalH2 id="saklama">Saklama ve Silme</LegalH2>
      <ul>
        <li>
          <strong>Hesap ve çalışma alanı verileri:</strong> kullanıcı ya da yönetici silene kadar
          saklanır. Arşivlenen bir hesapta veriler silinmez, korunur.
        </li>
        <li>
          <strong>Danışan kayıtları:</strong> uzman, danışan kaydını sildiğinde o danışana bağlı
          kayıtlar da silinir; danışana bağlı olmayan modül kayıtları (ör. Numeroloji, Human Design,
          Refleksoloji, Biyoenerji) ayrıca silinmelidir.
        </li>
        <li>
          <strong>Güvenlik kayıtlarındaki IP adresleri:</strong> 90 gün sonra silinir.
        </li>
        <li>
          <strong>Kullanım olayları ve ziyaret kayıtları:</strong> 180 gün saklanır.
        </li>
        <li>
          <strong>Günlük kullanım özetleri:</strong> 25 ay saklanır.
        </li>
      </ul>
      <p>
        Platformda kendi kendine hesap silme işlemi bulunmaz; hesabınızın silinmesini destek kanalı
        üzerinden talep edebilirsiniz. Altyapı sağlayıcısının yedekleri, sağlayıcının yedekleme
        politikası kapsamında sınırlı bir süre daha tutulabilir.
      </p>

      <LegalH2 id="guvenlik">Güvenlik</LegalH2>
      <p>
        Her uzmanın verileri çalışma alanı bazında ayrılır; erişim oturum doğrulaması ve sunucu
        taraflı yetki kontrolleriyle sınırlandırılır. Çalışma alanı dosyaları özel depolama
        alanlarında tutulur ve kısa süreli bağlantılarla açılır. Yönetim işlemleri en az yetki
        ilkesiyle sınırlandırılır ve hesap/güvenlik işlemleri kayıt altına alınır.
      </p>

      <LegalH2 id="haklariniz">Haklarınız</LegalH2>
      <p>
        6698 sayılı KVKK&apos;nın 11. maddesi kapsamındaki taleplerinizi (bilgi talebi, düzeltme,
        silme, itiraz vb.) aşağıdaki kanallardan iletebilirsiniz:
      </p>
      <ul>
        <li>
          E-posta ve telefon: yukarıdaki iletişim bilgileri veya{" "}
          <Link href="/iletisim" className="text-violet-700 underline">
            İletişim
          </Link>{" "}
          sayfası.
        </li>
        <li>Uygulama içinde: Ayarlar → Admin ile İrtibat.</li>
      </ul>
      <p>
        Danışanlara ait veriler için başvurular öncelikle ilgili uzmana (veri sorumlusu) yapılmalıdır;
        Yaşam Sistemi, uzmanın bu başvuruları yanıtlayabilmesi için kayıt görüntüleme, dışa aktarma ve
        silme araçları sunar.
      </p>
    </LegalPageShell>
  );
}
