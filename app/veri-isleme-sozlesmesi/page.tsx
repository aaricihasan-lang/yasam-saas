import type { Metadata } from "next";
import Link from "next/link";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";
import { getDataResidency } from "@/lib/legal/dataResidency";

export const metadata: Metadata = {
  title: "Veri İşleme Sözleşmesi (Taslak) — Yaşam Sistemi",
  description: "Uzman (veri sorumlusu) ile Yaşam Sistemi (veri işleyen) arasındaki veri işleme koşulları taslağı.",
};

/** Veri İşleme Sözleşmesi — TASLAK (FAZ1 FINAL HARDENING — INFRA). Hukuki inceleme gerekir. */
export default function VeriIslemeSozlesmesiPage() {
  const residency = getDataResidency();
  return (
    <LegalPageShell title="Veri İşleme Sözleşmesi" currentHref="/veri-isleme-sozlesmesi">
      <p>
        Bu sözleşme taslağı, platformu kullanan uzman (&quot;Veri Sorumlusu&quot;) ile Yaşam Sistemi
        (&quot;Veri İşleyen&quot;) arasında, uzmanın platforma girdiği danışan verilerinin işlenmesine
        ilişkin koşulları düzenler.
      </p>

      <LegalH2>1. Taraflar ve Roller</LegalH2>
      <ul>
        <li>
          <strong>Veri Sorumlusu (Uzman):</strong> danışan verilerinin hangi amaçla ve hangi hukuki
          sebeple işleneceğini belirler; danışanlarını aydınlatmak ve gerekli açık rızaları almakla
          yükümlüdür.
        </li>
        <li>
          <strong>Veri İşleyen (Yaşam Sistemi):</strong> danışan verilerini yalnızca uzmanın platformu
          kullanımı doğrultusunda, hizmetin sunulması amacıyla işler; kendi amaçları için kullanmaz.
        </li>
      </ul>

      <LegalH2>2. İşlemenin Konusu</LegalH2>
      <p>
        Uzmanın çalışma alanına girdiği danışan kimlik/iletişim bilgileri, görüşme notları, analiz ve
        raporlar, ücret kayıtları ve yüklenen dosyalar; saklama, görüntüleme, raporlama ve yedekleme
        amaçlarıyla işlenir.
      </p>

      <LegalH2>3. Veri İşleyenin Yükümlülükleri</LegalH2>
      <ul>
        <li>Verileri yalnızca uzmanın talimatları ve platform işlevleri kapsamında işlemek.</li>
        <li>
          Uzmanların verilerini çalışma alanı (kiracı) bazında ayırmak; erişimi oturum doğrulaması ve
          sunucu taraflı yetki kontrolleriyle sınırlandırmak.
        </li>
        <li>
          Yönetici panelinde uzmanın özel çalışma içeriğini görüntüleme özelliği sunmamak; altyapı
          düzeyindeki teknik erişimi bakım, güvenlik, geri yükleme ve yasal yükümlülüklerle sınırlı
          tutmak.
        </li>
        <li>
          Alt işleyicileri{" "}
          <Link href="/alt-isleyiciler" className="text-violet-700 underline">
            Alt İşleyiciler
          </Link>{" "}
          sayfasında listelemek ve değişiklikleri bu sayfada duyurmak.
        </li>
        <li>Farkına varılan veri ihlallerini uzmana gecikmeksizin bildirmek.</li>
        <li>
          Uzmanın, danışanlarının KVKK m.11 başvurularını yanıtlayabilmesi için gerekli işlevleri
          (kayıt görüntüleme, dışa aktarma, silme) sağlamak.
        </li>
      </ul>

      <LegalH2>4. Veri Konumu ve Yurt Dışı</LegalH2>
      <p>
        Veritabanı/depolama bölgesi: <strong>{residency.label}</strong>
        {residency.note ? ` — ${residency.note}` : ""}. Alt işleyicilerin bir kısmı yurt dışında
        bulunduğundan veriler yurt dışında işlenebilir; uygulanacak hukuki mekanizmanın (KVKK m.9)
        hukukçu tarafından belirlenmesi gerekir.
      </p>

      <LegalH2>5. Süre, İade ve Silme</LegalH2>
      <p>
        Sözleşme, uzmanın üyeliği süresince geçerlidir. Uzman, verilerini platformun dışa aktarma
        işlevleriyle alabilir ve kayıtlarını silebilir. Üyelik sona erdiğinde verilerin iadesi ve
        silinmesi uzmanla kararlaştırılan süre içinde yapılır; altyapı sağlayıcısının yedekleri,
        sağlayıcının yedekleme politikası kapsamında sınırlı bir süre daha tutulabilir.
      </p>

      <LegalH2>6. Yapay Zekâ</LegalH2>
      <p>
        Uzman hesaplarında yapay zekâ özellikleri kapalıdır; uzmanın danışan verileri yapay zekâ
        sağlayıcılarına gönderilmez.
      </p>
    </LegalPageShell>
  );
}
