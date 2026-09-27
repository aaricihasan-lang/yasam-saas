import type { Metadata } from "next";
import Link from "next/link";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";
import { CONSENT_TEXT_VERSION } from "@/lib/legal/clientConsent";
import { getDataResidency } from "@/lib/legal/dataResidency";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni Şablonu (Taslak) — Yaşam Sistemi",
  description: "Uzmanların danışanlarına uyarlayabileceği KVKK aydınlatma ve açık rıza metni şablonu (taslak).",
};

/**
 * KVKK aydınlatma + açık rıza ŞABLONU — uzman (veri sorumlusu) kendi bilgileriyle uyarlar.
 * TASLAK (FAZ1 FINAL HARDENING — INFRA). Sürüm, danışan onam kayıtlarındaki
 * text_version ile eşleşir (lib/legal/clientConsent.ts CONSENT_TEXT_VERSION).
 */
export default function KvkkAydinlatmaPage() {
  const residency = getDataResidency();
  return (
    <LegalPageShell title="KVKK Aydınlatma Metni Şablonu" currentHref="/kvkk-aydinlatma">
      <p>
        Bu sayfa, platformu kullanan uzmanların <strong>kendi danışanlarına</strong> sunacağı
        aydınlatma metni ve açık rıza metni için bir <strong>şablondur</strong>. Köşeli parantez içindeki
        alanları kendi bilgilerinizle doldurun ve metni hukukçunuza kontrol ettirin. Şablon sürümü:{" "}
        <code>{CONSENT_TEXT_VERSION}</code> (danışan onam kaydında bu sürüm saklanır).
      </p>

      <LegalH2>1. Veri Sorumlusu</LegalH2>
      <p>
        Kişisel verileriniz, veri sorumlusu sıfatıyla <strong>[Uzmanın adı-soyadı / işletme adı]</strong>{" "}
        (<em>[adres]</em>, <em>[e-posta / telefon]</em>) tarafından 6698 sayılı Kişisel Verilerin
        Korunması Kanunu (&quot;KVKK&quot;) kapsamında işlenir.
      </p>

      <LegalH2>2. İşlenen Veriler ve Amaçlar</LegalH2>
      <ul>
        <li>Kimlik ve iletişim bilgileri — randevu ve görüşme süreçlerinin yürütülmesi.</li>
        <li>
          Görüşme notları, değerlendirmeler ve sağlıkla ilgili beyanlarınız (özel nitelikli kişisel
          veri) — size sunulan destekleyici çalışmanın planlanması ve takibi.
        </li>
        <li>Ücret/ödeme kayıtları — hizmet bedelinin takibi ve yasal yükümlülükler.</li>
      </ul>

      <LegalH2>3. Toplama Yöntemi ve Hukuki Sebep</LegalH2>
      <p>
        Veriler; görüşmelerde sözlü/yazılı beyanınız ve formlar aracılığıyla toplanır. Kimlik, iletişim
        ve ödeme bilgileri sözleşmenin kurulması/ifası ve hukuki yükümlülük sebeplerine; sağlıkla ilgili
        özel nitelikli veriler ise <strong>açık rızanıza</strong> dayanılarak işlenir. <em>[Hukuki
        sebepler uzmanın faaliyetine göre hukukçu tarafından netleştirilmelidir.]</em>
      </p>

      <LegalH2>4. Aktarım</LegalH2>
      <p>
        Kayıtlar, uzmanın kullandığı Yaşam Sistemi yazılım platformunda saklanır. Platform, veri işleyen
        sıfatıyla altyapı hizmet sağlayıcılarından (veritabanı/depolama, barındırma) yararlanır; liste için{" "}
        <Link href="/alt-isleyiciler" className="text-violet-700 underline">
          Alt İşleyiciler
        </Link>
        . Veritabanı/depolama bölgesi: <strong>{residency.label}</strong>. Sağlayıcıların bir kısmı yurt
        dışında bulunduğundan verileriniz yurt dışında işlenebilir. Verileriniz bunlar dışında, yasal
        zorunluluklar hariç üçüncü kişilerle paylaşılmaz.
      </p>

      <LegalH2>5. Haklarınız (KVKK m.11)</LegalH2>
      <p>
        Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini
        isteme, aktarıldığı üçüncü kişileri bilme, itiraz etme ve zararın giderilmesini talep etme
        haklarına sahipsiniz. Başvurularınızı <em>[başvuru kanalı]</em> üzerinden iletebilirsiniz.
      </p>

      <LegalH2>Açık Rıza Metni (Şablon)</LegalH2>
      <p>
        &quot;<em>[Uzmanın adı]</em> tarafından tarafıma sunulan aydınlatma metnini okudum. Sağlık
        durumuma ilişkin beyanlarım ve görüşme notları gibi özel nitelikli kişisel verilerimin, bana
        sunulan destekleyici çalışmanın planlanması ve takibi amacıyla işlenmesine açık rıza
        veriyorum.&quot;
      </p>
      <p>
        &quot;Kişisel verilerimin, uzmanın kullandığı yazılım platformunun yurt dışındaki altyapı
        sağlayıcılarında saklanmasına/işlenmesine açık rıza veriyorum.&quot; <em>[Yurt dışı aktarım
        için uygulanacak hukuki mekanizma (KVKK m.9) hukukçu tarafından belirlenmelidir.]</em>
      </p>
      <p>
        Rızanızı dilediğiniz zaman geri çekebilirsiniz; geri çekme, önceki işlemlerin hukuka
        uygunluğunu etkilemez.
      </p>

      <LegalH2>Uzmanlar İçin Not</LegalH2>
      <p>
        Danışan kaydında &quot;KVKK Aydınlatma ve Onam&quot; bölümünden aydınlatmanın yapıldığını ve
        alınan rızaları (yöntemi ve tarihiyle) kayıt altına alabilirsiniz. Kayıtlar değiştirilemez; geri
        çekme yeni bir kayıt olarak eklenir.
      </p>
    </LegalPageShell>
  );
}
