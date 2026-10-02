import type { Metadata } from "next";
import Link from "next/link";
import LegalIdentityBlock from "@/components/kvkk/LegalIdentityBlock";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";
import { getDataResidency } from "@/lib/legal/dataResidency";

export const metadata: Metadata = {
  title: "Veri İşleme Sözleşmesi — Yaşam Sistemi",
  description:
    "Uzman (veri sorumlusu) ile Yaşam Sistemi (veri işleyen) arasında danışan verilerinin işlenmesine ilişkin koşullar.",
};

/**
 * Veri İşleme Sözleşmesi (P1-6 — nihai ürün metni).
 * Rol ayrımı + sorumluluklar plan §3.1–§3.2; doğrulanamayan taahhüt YOK (ihlal bildirim
 * süresi, üyelik sonu otomatik silme süresi, sağlayıcı veri konumu, şifreleme ayrıntısı).
 */
export default function VeriIslemeSozlesmesiPage() {
  const residency = getDataResidency();
  return (
    <LegalPageShell title="Veri İşleme Sözleşmesi" currentHref="/veri-isleme-sozlesmesi">
      <p>
        Bu sözleşme, platformu kullanan uzman (&quot;Veri Sorumlusu&quot;) ile Yaşam Sistemi
        (&quot;Veri İşleyen&quot;) arasında, uzmanın platforma girdiği danışan verilerinin
        işlenmesine ilişkin koşulları düzenler ve{" "}
        <Link href="/kullanim-sartlari" className="text-violet-700 underline">
          Kullanım Şartları
        </Link>
        &apos;nın ayrılmaz bir parçasıdır.
      </p>
      <LegalIdentityBlock />

      <LegalH2 id="roller">1. Taraflar ve Roller</LegalH2>
      <ul>
        <li>
          <strong>Veri Sorumlusu (Uzman):</strong> danışan verilerinin hangi amaçla ve hangi hukuki
          sebeple işleneceğini belirler; danışanlarını aydınlatmak ve gerekli açık rızaları almakla
          yükümlüdür.
        </li>
        <li>
          <strong>Veri İşleyen (Yaşam Sistemi):</strong> danışan verilerini yalnızca uzmanın platformu
          kullanımı doğrultusunda, hizmetin sunulması amacıyla barındırır ve işler; kendi amaçları
          için kullanmaz.
        </li>
        <li>
          Uzman hesabı, üyelik, ödeme kayıtları, oturum/IP/güvenlik kayıtları, teknik kullanım
          istatistikleri ve destek yazışmaları bu sözleşmenin konusu değildir; bunlar bakımından
          Yaşam Sistemi veri sorumlusudur (bkz.{" "}
          <Link href="/gizlilik-politikasi" className="text-violet-700 underline">
            Gizlilik Politikası
          </Link>
          ).
        </li>
      </ul>

      <LegalH2 id="konu">2. İşlemenin Konusu</LegalH2>
      <p>
        Uzmanın çalışma alanına girdiği danışan kimlik/iletişim bilgileri, anamnez ve sağlık/iyi oluş
        beyanları, görüşme notları, analiz ve raporlar, fotoğraf ve belgeler, seans/randevu ve ücret
        kayıtları ile modül çıktıları; saklama, görüntüleme, raporlama, dışa aktarma ve yedekleme
        amaçlarıyla işlenir.
      </p>

      <LegalH2 id="uzman-yukumlulukleri">3. Veri Sorumlusunun (Uzmanın) Yükümlülükleri</LegalH2>
      <ul>
        <li>Danışan verilerini hukuka uygun biçimde elde etmek.</li>
        <li>
          Danışanlarını aydınlatmak, gerekli işleme şartını sağlamak ve özel nitelikli veriler için
          açık rıza almak (bkz.{" "}
          <Link href="/kvkk-aydinlatma" className="text-violet-700 underline">
            örnek aydınlatma metni
          </Link>
          ).
        </li>
        <li>Yalnız amaç için gerekli verileri girmek (veri minimizasyonu).</li>
        <li>Verileri yetkisiz kişilerle paylaşmamak ve amaç dışı kullanmamak.</li>
        <li>Hesap ve parola güvenliğini sağlamak.</li>
        <li>Dışa aktarılan Word/PDF raporlarının ve diğer dosyaların güvenliğini sağlamak.</li>
        <li>Kendi personelinin danışan verilerine erişimini gerekli olanla sınırlamak.</li>
      </ul>

      <LegalH2 id="isleyen-yukumlulukleri">4. Veri İşleyenin (Yaşam Sistemi&apos;nin) Yükümlülükleri</LegalH2>
      <ul>
        <li>Verileri yalnızca uzmanın talimatları ve platform işlevleri kapsamında işlemek.</li>
        <li>
          Uzmanların verilerini çalışma alanı bazında ayırmak (kiracı izolasyonu); erişimi oturum
          doğrulaması ve sunucu taraflı yetki kontrolleriyle sınırlandırmak.
        </li>
        <li>
          Uygulama ve dosya depolama güvenliğini sağlamak; çalışma alanı dosyalarını özel depolama
          alanlarında tutmak ve kısa süreli bağlantılarla açmak.
        </li>
        <li>
          Rutin platform yönetiminde danışan içeriğine erişim vermemek; yönetim panelinde danışan
          içeriğini görüntüleme özelliği sunmamak; altyapı düzeyindeki teknik erişimi bakım, güvenlik,
          geri yükleme ve yasal yükümlülüklerle ve en az yetki ilkesiyle sınırlandırmak.
        </li>
        <li>Hesap ve güvenlik işlemlerini kayıt altına almak.</li>
        <li>Verileri amaç dışı kullanmamak; hukuka aykırı üçüncü taraf paylaşımı yapmamak.</li>
        <li>
          Alt işleyicileri yönetmek,{" "}
          <Link href="/alt-isleyiciler" className="text-violet-700 underline">
            Alt İşleyiciler
          </Link>{" "}
          sayfasında listelemek ve değişiklikleri bu sayfada duyurmak.
        </li>
        <li>Farkına varılan ve uzmanın verilerini etkileyen veri ihlallerini uzmana bildirmek.</li>
        <li>
          Uzmanın, danışanlarının KVKK m.11 başvurularını yanıtlayabilmesi için gerekli işlevleri
          (kayıt görüntüleme, dışa aktarma, silme) sağlamak.
        </li>
      </ul>

      <LegalH2 id="yurt-disi">5. Veri Konumu ve Yurt Dışı</LegalH2>
      <p>
        {residency.configured ? (
          <>
            Veritabanı/depolama bölgesi: <strong>{residency.label}</strong>
            {residency.note ? ` — ${residency.note}` : ""}.{" "}
          </>
        ) : null}
        Alt işleyicilerin bir kısmı yurt dışında bulunduğundan veriler yurt dışında işlenebilir.
        Uzman, danışanlarından bu konuda gerekli açık rızayı almak ve kayıt altına almakla
        yükümlüdür; platform bunun için danışan kaydında onam kaydı bölümü sunar.
      </p>

      <LegalH2 id="sure-silme">6. Süre, İade ve Silme</LegalH2>
      <p>
        Sözleşme, uzmanın üyeliği süresince geçerlidir. Uzman, verilerini platformun dışa aktarma
        araçlarıyla alabilir ve kayıtlarını silebilir. Hesap ve çalışma alanı verileri, uzman ya da
        yönetici silene kadar saklanır; arşivlenen bir hesapta veriler silinmez, korunur. Hesabın ve
        verilerin silinmesi destek kanalı üzerinden talep edilir. Altyapı sağlayıcısının yedekleri,
        sağlayıcının yedekleme politikası kapsamında sınırlı bir süre daha tutulabilir.
      </p>

      <LegalH2 id="yapay-zeka">7. Yapay Zekâ</LegalH2>
      <p>
        Yapay zekâ destekli özellikler yalnızca yönetici modüllerinde açıktır. Uzman hesaplarında bu
        özellikler kapalıdır; uzmanın danışan verileri yapay zekâ sağlayıcılarına gönderilmez ve
        yapay zekâ işlemine konu edilmez.
      </p>
    </LegalPageShell>
  );
}
