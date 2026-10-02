import type { Metadata } from "next";
import Link from "next/link";
import LegalIdentityBlock from "@/components/kvkk/LegalIdentityBlock";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";

export const metadata: Metadata = {
  title: "Kullanım Şartları — Yaşam Sistemi",
  description: "Yaşam Sistemi platformunun kullanım şartları, tarafların rolleri ve sorumlulukları.",
};

/**
 * Kullanım Şartları (P1-6 — nihai ürün metni).
 * Rol ayrımı + uzman / Yaşam Sistemi sorumlulukları plan §3.1–§3.2 ile birebir.
 * Mutlak ifade ve doğrulanamayan taahhüt (ihlal bildirim süresi, otomatik silme süresi) YOK.
 */
export default function KullanimSartlariPage() {
  return (
    <LegalPageShell title="Kullanım Şartları" currentHref="/kullanim-sartlari">
      <p>
        Bu şartlar, Yaşam Sistemi platformunun kullanımına ilişkin koşulları düzenler. Platforma
        kaydolarak veya platformu kullanarak bu şartları kabul etmiş olursunuz.
      </p>
      <LegalIdentityBlock />

      <LegalH2 id="hizmet">Hizmetin Kapsamı</LegalH2>
      <p>
        Yaşam Sistemi; danışmanlık, terapi ve bütünsel destek alanlarında çalışan uzmanların danışan
        kayıtlarını, randevularını, notlarını, analizlerini ve raporlarını kendi çalışma alanlarında
        yönetmesini sağlayan bir yazılım platformudur. Modül erişimi, uzmanın üyeliğine ve hesabına
        tanımlanan izinlere göre belirlenir.
      </p>

      <LegalH2 id="hesap">Hesap ve Güvenlik</LegalH2>
      <ul>
        <li>
          Hesabınızın ve parolanızın güvenliğinden siz sorumlusunuz; parolanızı kimseyle paylaşmayın.
        </li>
        <li>
          Yetkisiz erişim şüphesinde parolanızı değiştirin ve durumu destek kanalı üzerinden hemen
          bildirin.
        </li>
        <li>
          Hesap ve güvenlik işlemleri (ör. oturum açma ve yönetim tarafından yapılan hesap
          işlemleri) güvenlik amacıyla kayıt altına alınır.
        </li>
      </ul>

      <LegalH2 id="roller">Danışan Verileri ve Roller</LegalH2>
      <p>
        Platforma girdiğiniz danışan verileri bakımından <strong>veri sorumlusu sizsiniz</strong>.
        Yaşam Sistemi bu veriler bakımından <strong>veri işleyendir</strong>: verileri sizin
        platformu kullanımınız doğrultusunda barındırır ve işler, kendi amaçları için kullanmaz.
        Ayrıntılar{" "}
        <Link href="/veri-isleme-sozlesmesi" className="text-violet-700 underline">
          Veri İşleme Sözleşmesi
        </Link>
        &apos;nde yer alır. Hesabınız, üyeliğiniz, ödeme kayıtlarınız, güvenlik kayıtları ve teknik
        kullanım istatistikleri bakımından ise Yaşam Sistemi veri sorumlusudur (bkz.{" "}
        <Link href="/gizlilik-politikasi" className="text-violet-700 underline">
          Gizlilik Politikası
        </Link>
        ).
      </p>

      <LegalH2 id="uzman-sorumluluklari">Uzmanın Sorumlulukları</LegalH2>
      <ul>
        <li>Danışan verilerini hukuka uygun biçimde elde etmek.</li>
        <li>
          Danışanlarını aydınlatmak ve gerekli işleme şartını sağlamak; özel nitelikli veriler için
          gerekli açık rızayı almak (bunun için{" "}
          <Link href="/kvkk-aydinlatma" className="text-violet-700 underline">
            örnek aydınlatma metni
          </Link>{" "}
          uyarlanabilir ve danışan kaydında onam durumu kayıt altına alınabilir).
        </li>
        <li>Yalnız amaç için gerekli verileri girmek (veri minimizasyonu).</li>
        <li>Danışan verilerini yetkisiz kişilerle paylaşmamak ve amaç dışı kullanmamak.</li>
        <li>Hesap ve parola güvenliğini sağlamak.</li>
        <li>
          Platformdan dışa aktardığı Word/PDF raporlarını ve diğer dosyaları güvenli biçimde saklamak.
        </li>
        <li>Kendi personelinin danışan verilerine erişimini gerekli olanla sınırlamak.</li>
      </ul>

      <LegalH2 id="yasam-sistemi-sorumluluklari">Yaşam Sistemi&apos;nin Sorumlulukları</LegalH2>
      <ul>
        <li>Her uzmanın verilerini çalışma alanı bazında ayırmak (kiracı izolasyonu).</li>
        <li>Erişim kontrolü ve sunucu taraflı yetkilendirme uygulamak.</li>
        <li>Uygulama ve dosya depolama güvenliğini sağlamak; dosyaları özel depolama alanlarında tutmak.</li>
        <li>Güvenlik amacıyla gerekli teknik kayıtları tutmak.</li>
        <li>Hizmeti güvenli biçimde işletmek ve sürdürmek.</li>
        <li>
          Alt işleyicileri yönetmek ve güncel listeyi{" "}
          <Link href="/alt-isleyiciler" className="text-violet-700 underline">
            Alt İşleyiciler
          </Link>{" "}
          sayfasında yayımlamak.
        </li>
        <li>
          Rutin platform yönetiminde danışan içeriğine erişim vermemek; teknik erişimi en az yetki
          ilkesiyle sınırlandırmak; verileri amaç dışı kullanmamak ve hukuka aykırı üçüncü taraf
          paylaşımı yapmamak.
        </li>
      </ul>

      <LegalH2 id="kullanim">Platform Kullanımı</LegalH2>
      <p>
        Platform, uzmanın mesleki çalışmaları için kullanılır. Platformu hukuka aykırı amaçlarla,
        başkalarının haklarını ihlal edecek şekilde veya sistemin güvenliğini ya da işleyişini
        bozacak biçimde kullanmak yasaktır.
      </p>

      <LegalH2 id="saglik">Sağlık Uyarısı</LegalH2>
      <p>
        Platformdaki içerik ve raporlar tamamlayıcı/destekleyici çalışmalara yöneliktir; tıbbi teşhis
        veya tedavinin yerine geçmez.
      </p>

      <LegalH2 id="yapay-zeka">Yapay Zekâ</LegalH2>
      <p>
        Yapay zekâ destekli özellikler yalnızca yönetici modüllerinde açıktır. Uzman hesaplarında bu
        özellikler kapalıdır ve uzmanların danışan verilerine yapay zekâ uygulanmaz.
      </p>

      <LegalH2 id="uyelik-sonu">Üyelik, Arşiv ve Hesap Silme</LegalH2>
      <p>
        Hesap ve çalışma alanı verileri, siz ya da yönetici silene kadar saklanır. Arşivlenen bir
        hesapta veriler silinmez, korunur. Verilerinizi platformun dışa aktarma araçlarıyla
        alabilirsiniz. Platformda kendi kendine hesap silme işlemi bulunmaz; hesabınızın silinmesini
        destek kanalı üzerinden talep edebilirsiniz.
      </p>

      <LegalH2 id="degisiklikler">Hizmet ve Şart Değişiklikleri</LegalH2>
      <p>
        Yaşam Sistemi, özellik ve planlarda değişiklik yapabilir. Bu şartlarda yapılan değişiklikler
        bu sayfada yayımlanır ve sayfanın üstündeki &quot;Son güncelleme&quot; tarihi güncellenir.
      </p>

      <LegalH2 id="iletisim">İletişim</LegalH2>
      <p>
        Sorularınız için yukarıdaki iletişim bilgilerini, uygulama içindeki &quot;Ayarlar → Admin ile
        İrtibat&quot; bölümünü veya{" "}
        <Link href="/iletisim" className="text-violet-700 underline">
          İletişim
        </Link>{" "}
        sayfasını kullanabilirsiniz.
      </p>
    </LegalPageShell>
  );
}
