import type { Metadata } from "next";
import Link from "next/link";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";

export const metadata: Metadata = {
  title: "Kullanım Şartları (Taslak) — Yaşam Sistemi",
  description: "Yaşam Sistemi platform kullanım şartları taslağı.",
};

/** Kullanım Şartları — TASLAK (FAZ1 FINAL HARDENING — INFRA). Hukuki inceleme gerekir. */
export default function KullanimSartlariPage() {
  return (
    <LegalPageShell title="Kullanım Şartları" currentHref="/kullanim-sartlari">
      <p>
        Yaşam Sistemi platformunu kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız.
      </p>

      <LegalH2>Hesap Sorumluluğu</LegalH2>
      <p>
        Hesabınızın güvenliğinden siz sorumlusunuz. Şifrenizi kimseyle paylaşmayın. Yetkisiz erişim
        şüphesinde yöneticinize bildirin.
      </p>

      <LegalH2>Platform Kullanımı</LegalH2>
      <p>
        Platform yalnızca kişisel ve profesyonel amaçlı kullanım içindir. Sistemi zararlı amaçlarla
        kullanmak yasaktır.
      </p>

      <LegalH2>Danışan Verileri</LegalH2>
      <p>
        Platforma girdiğiniz danışan verilerinin veri sorumlusu sizsiniz. Danışanlarınızı aydınlatmak
        ve gerekli açık rızaları almak sizin sorumluluğunuzdadır; bunun için{" "}
        <Link href="/kvkk-aydinlatma" className="text-violet-700 underline">
          aydınlatma metni şablonunu
        </Link>{" "}
        uyarlayabilir ve danışan kaydında onam durumunu kayıt altına alabilirsiniz. Yaşam Sistemi bu
        veriler bakımından veri işleyendir; ayrıntılar{" "}
        <Link href="/veri-isleme-sozlesmesi" className="text-violet-700 underline">
          Veri İşleme Sözleşmesi
        </Link>{" "}
        taslağındadır.
      </p>

      <LegalH2>Sağlık Uyarısı</LegalH2>
      <p>
        Platformdaki içerik ve raporlar tamamlayıcı/destekleyici çalışmalara yöneliktir; tıbbi teşhis
        veya tedavinin yerine geçmez.
      </p>

      <LegalH2>Hizmet Değişiklikleri</LegalH2>
      <p>Yaşam Sistemi, özellik ve planları önceden bildirerek değiştirme hakkını saklı tutar.</p>

      <LegalH2>İletişim</LegalH2>
      <p>
        Sorularınız için{" "}
        <Link href="/iletisim" className="text-violet-700 underline">
          İletişim sayfamıza
        </Link>{" "}
        ulaşabilirsiniz.
      </p>
    </LegalPageShell>
  );
}
