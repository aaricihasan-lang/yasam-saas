import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";
import { CONSENT_TEXT_VERSION } from "@/lib/legal/clientConsent";
import { getDataResidency } from "@/lib/legal/dataResidency";

export const metadata: Metadata = {
  title: "Danışan Aydınlatma ve Açık Rıza Metni — Örnek Metin — Yaşam Sistemi",
  description:
    "Uzmanların kendi danışanlarına uyarlayarak sunabileceği örnek KVKK aydınlatma ve açık rıza metni.",
};

/**
 * Danışan aydınlatma + açık rıza ÖRNEK METNİ (P1-6 — nihai ürün metni).
 * Danışan verileri bakımından veri sorumlusu uzmandır; uzman metni kendi bilgileriyle
 * uyarlar. «…» biçimindeki alanlar ürün içi örnek alanlardır (Yaşam Sistemi'nin kendi
 * kimlik bilgileri için yer tutucu DEĞİLDİR — o bilgiler lib/legal/legalIdentity.ts'den gelir).
 * Sürüm, danışan onam kayıtlarındaki text_version ile eşleşir (CONSENT_TEXT_VERSION).
 */

/** Uzmanın kendi bilgisiyle değiştireceği örnek alan. */
function ExampleField({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-md bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-800 ring-1 ring-violet-200">
      «{children}»
    </span>
  );
}

export default function KvkkAydinlatmaPage() {
  const residency = getDataResidency();
  return (
    <LegalPageShell
      title="Danışan Aydınlatma ve Açık Rıza Metni — Örnek Metin"
      currentHref="/kvkk-aydinlatma"
    >
      <p>
        Bu sayfa, platformu kullanan uzmanların <strong>kendi danışanlarına</strong> sunabileceği örnek
        bir aydınlatma ve açık rıza metnidir. Danışan verileri bakımından veri sorumlusu uzman
        olduğundan, metni kendi bilgileriniz ve çalışma biçiminize göre uyarlayarak kullanın. Vurgulu
        alanlar (ör. <ExampleField>Uzmanın adı / işletme adı</ExampleField>) sizin bilgilerinizle
        değiştirilecek örnek alanlardır.
      </p>
      <p>
        Metin sürümü: <code>{CONSENT_TEXT_VERSION}</code> — danışan kaydında onam eklediğinizde bu
        sürüm kayıtla birlikte saklanır.
      </p>

      <LegalH2 id="veri-sorumlusu">1. Veri Sorumlusu</LegalH2>
      <p>
        Kişisel verileriniz, veri sorumlusu sıfatıyla <ExampleField>Uzmanın adı / işletme adı</ExampleField>{" "}
        (<ExampleField>Adres</ExampleField>, <ExampleField>E-posta / telefon</ExampleField>) tarafından
        6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında işlenir.
      </p>

      <LegalH2 id="veriler-amaclar">2. İşlenen Veriler ve Amaçlar</LegalH2>
      <ul>
        <li>Kimlik ve iletişim bilgileri — randevu ve görüşme süreçlerinin yürütülmesi.</li>
        <li>
          Görüşme notları, değerlendirmeler, anamnez ve sağlıkla ilgili beyanlarınız (özel nitelikli
          kişisel veri) — size sunulan destekleyici çalışmanın planlanması ve takibi.
        </li>
        <li>Seans, randevu ve ücret/ödeme kayıtları — hizmetin yürütülmesi ve yasal yükümlülükler.</li>
        <li>Paylaştığınız fotoğraf ve belgeler — çalışmanın değerlendirilmesi ve takibi.</li>
      </ul>

      <LegalH2 id="hukuki-sebep">3. Toplama Yöntemi ve Hukuki Sebep</LegalH2>
      <p>
        Verileriniz; görüşmelerde sözlü/yazılı beyanlarınız ve size sunulan formlar aracılığıyla
        toplanır. Kimlik, iletişim ve ödeme bilgileriniz sözleşmenin kurulması ve ifası ile hukuki
        yükümlülüklerin yerine getirilmesi sebeplerine (KVKK m.5); sağlıkla ilgili özel nitelikli
        verileriniz ise <strong>açık rızanıza</strong> (KVKK m.6) dayanılarak işlenir.
      </p>

      <LegalH2 id="aktarim">4. Aktarım</LegalH2>
      <p>
        Kayıtlarınız, uzmanınızın kullandığı Yaşam Sistemi yazılım platformunda saklanır. Platform,
        veri işleyen sıfatıyla altyapı hizmet sağlayıcılarından (veritabanı/depolama, barındırma)
        yararlanır; liste için{" "}
        <Link href="/alt-isleyiciler" className="text-violet-700 underline">
          Alt İşleyiciler
        </Link>
        .{" "}
        {residency.configured ? (
          <>
            Veritabanı/depolama bölgesi: <strong>{residency.label}</strong>.{" "}
          </>
        ) : null}
        Sağlayıcıların bir kısmı yurt dışında bulunduğundan verileriniz yurt dışında işlenebilir; bu
        aktarım KVKK m.9&apos;daki şartlara uygun olarak ve gerektiğinde açık rızanıza dayanılarak
        yapılır. Verileriniz bunlar dışında, hukuki yükümlülükler hariç üçüncü kişilerle paylaşılmaz.
      </p>

      <LegalH2 id="saklama">5. Saklama Süresi</LegalH2>
      <p>
        Verileriniz, işleme amacının gerektirdiği süre ve ilgili mevzuatta öngörülen süreler boyunca
        saklanır; bu sürelerin sonunda silinir veya anonim hâle getirilir. Saklama süresi:{" "}
        <ExampleField>Uzmanın belirlediği süre</ExampleField>.
      </p>

      <LegalH2 id="haklar">6. Haklarınız (KVKK m.11)</LegalH2>
      <p>
        Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini
        isteme, aktarıldığı üçüncü kişileri bilme, itiraz etme ve zararın giderilmesini talep etme
        haklarına sahipsiniz. Başvurularınızı <ExampleField>Başvuru kanalı (e-posta / adres)</ExampleField>{" "}
        üzerinden iletebilirsiniz.
      </p>

      <LegalH2 id="acik-riza">Açık Rıza Metni</LegalH2>
      <p>
        &quot;<ExampleField>Uzmanın adı</ExampleField> tarafından tarafıma sunulan aydınlatma metnini
        okudum. Sağlık durumuma ilişkin beyanlarım ve görüşme notları gibi özel nitelikli kişisel
        verilerimin, bana sunulan destekleyici çalışmanın planlanması ve takibi amacıyla işlenmesine
        açık rıza veriyorum.&quot;
      </p>
      <p>
        &quot;Kişisel verilerimin, uzmanın kullandığı yazılım platformunun yurt dışındaki altyapı
        sağlayıcılarında saklanmasına ve işlenmesine açık rıza veriyorum.&quot;
      </p>
      <p>
        Rızanızı dilediğiniz zaman geri çekebilirsiniz; geri çekme, önceki işlemlerin hukuka
        uygunluğunu etkilemez.
      </p>
      <p>
        Ad-soyad: <ExampleField>Danışanın adı-soyadı</ExampleField> · Tarih:{" "}
        <ExampleField>Tarih</ExampleField> · İmza: <ExampleField>İmza</ExampleField>
      </p>

      <LegalH2 id="uzmanlar-icin">Uzmanlar İçin</LegalH2>
      <ul>
        <li>
          Danışan kaydındaki &quot;KVKK Aydınlatma ve Onam&quot; bölümünden aydınlatmanın yapıldığını
          ve alınan rızaları (yöntemi ve tarihiyle) kayıt altına alabilirsiniz.
        </li>
        <li>Kayıtlar değiştirilemez; rızanın geri çekilmesi yeni bir kayıt olarak eklenir.</li>
        <li>
          Platformu kullanırken üstlendiğiniz sorumluluklar{" "}
          <Link href="/veri-isleme-sozlesmesi" className="text-violet-700 underline">
            Veri İşleme Sözleşmesi
          </Link>{" "}
          ve{" "}
          <Link href="/kullanim-sartlari" className="text-violet-700 underline">
            Kullanım Şartları
          </Link>{" "}
          sayfalarında yer alır.
        </li>
      </ul>
    </LegalPageShell>
  );
}
