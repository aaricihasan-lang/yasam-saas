import type { Metadata } from "next";
import Link from "next/link";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";
import { getDataResidency } from "@/lib/legal/dataResidency";

export const metadata: Metadata = {
  title: "Gizlilik Politikası (Taslak) — Yaşam Sistemi",
  description: "Yaşam Sistemi gizlilik politikası taslağı ve veri işleme ilkeleri.",
};

/**
 * Gizlilik Politikası — TASLAK (FAZ1 FINAL HARDENING — INFRA).
 * Metin, uygulamanın GERÇEK davranışına göre yazılmıştır (GA yalnız herkese açık
 * sayfalar; yapay zekâ yalnız yönetici hesabı; yönetici paneli uzman özel içeriğini
 * görüntüleme özelliği sunmaz). Hukuki inceleme gerekir.
 */
export default function GizlilikPolitikasiPage() {
  const residency = getDataResidency();
  return (
    <LegalPageShell title="Gizlilik Politikası" currentHref="/gizlilik-politikasi">
      <p>
        Bu metin, Yaşam Sistemi platformunda kişisel verilerin hangi amaçlarla ve nasıl işlendiğini
        açıklar. Platformu kullanan uzmanlar, kendi danışanlarına ait verilerin <strong>veri
        sorumlusudur</strong>; Yaşam Sistemi bu veriler bakımından uzman adına <strong>veri
        işleyen</strong> konumundadır. Uzman hesabına ait bilgiler (ad, e-posta, üyelik) bakımından
        ise Yaşam Sistemi veri sorumlusudur.
      </p>

      <LegalH2>Hangi Verileri İşliyoruz?</LegalH2>
      <ul>
        <li>
          <strong>Hesap verileri:</strong> ad-soyad, e-posta, parola doğrulama bilgisi, üyelik/paket
          ve ödeme durumu bilgileri.
        </li>
        <li>
          <strong>Güvenlik kayıtları:</strong> oturum açma zamanı, IP adresi, yaklaşık konum
          (ülke/şehir), tarayıcı/cihaz bilgisi ve güvenlik olayları. Bu kayıtlar hesabın yetkisiz
          kullanımını tespit etmek için tutulur.
        </li>
        <li>
          <strong>Çalışma alanı verileri:</strong> uzmanın kendi alanına girdiği danışan kayıtları,
          notlar, analizler, raporlar ve yüklenen dosyalar. Bu kayıtlar sağlıkla ilgili bilgiler gibi
          özel nitelikli kişisel veriler içerebilir; her uzmanın kayıtları kendi çalışma alanında
          (kiracı) ayrı tutulur.
        </li>
        <li>
          <strong>Destek yazışmaları:</strong> destek/iletişim formuyla gönderdiğiniz mesajlar.
        </li>
      </ul>

      <LegalH2>Verilere Kim Erişebilir?</LegalH2>
      <p>
        Çalışma alanı verilerinize uygulama üzerinden yalnızca hesabınızla erişilebilir; erişim,
        oturum doğrulaması, çalışma alanı (kiracı) ayrımı ve sunucu taraflı yetki kontrolleriyle
        sınırlandırılır.
      </p>
      <p>
        Yönetici paneli; hesap, üyelik, ödeme durumu, kullanım istatistikleri (kayıt sayıları gibi
        özet bilgiler), güvenlik olayları ve destek mesajları gibi platform yönetimi bilgilerini
        gösterir. Yönetici panelinde uzmanların danışan kayıtlarını veya özel çalışma içeriğini
        görüntüleme özelliği <strong>bulunmaz</strong>. Altyapı düzeyindeki teknik erişim (veritabanı
        bakımı, güvenlik olaylarının incelenmesi, yedekten geri yükleme, yasal yükümlülükler) yalnızca
        bu amaçlarla sınırlı tutulur.
      </p>

      <LegalH2>Hizmet Sağlayıcılar (Alt İşleyiciler)</LegalH2>
      <p>
        Platformun çalışması için veritabanı/depolama, barındırma, arka plan işleri ve analitik
        hizmet sağlayıcıları kullanılır. Güncel liste ve her birinin kapsamı{" "}
        <Link href="/alt-isleyiciler" className="text-violet-700 underline">
          Alt İşleyiciler
        </Link>{" "}
        sayfasındadır. Verileriniz bu sağlayıcılar dışında üçüncü kişilere satılmaz veya pazarlama
        amacıyla paylaşılmaz; yasal zorunluluk hâlinde yetkili makamlarla paylaşılabilir.
      </p>

      <LegalH2>Analitik ve Çerezler</LegalH2>
      <ul>
        <li>
          <strong>Google Analytics</strong> yalnızca oturum açılmamış ziyaretçilerin herkese açık
          sayfalarında (ana sayfa, hukuki sayfalar, iletişim, kayıt) çalışır ve bu sayfalarda
          Google Analytics çerezleri ayarlanabilir. Oturum açtığınızda ve
          uygulama içi sayfalarda (danışan, modül, yönetim sayfaları) yüklenmez ve veri göndermez.
        </li>
        <li>
          <strong>Vercel Analytics / Speed Insights</strong> sayfa ziyaretleri ve performans
          ölçümleri için kullanılır; gönderilen sayfa adreslerinde kimlik numaraları maskelenir ve
          sorgu parametreleri gönderilmez.
        </li>
        <li>
          Uygulama; oturumunuzu sürdürmek ve bazı modül verilerini hızlı göstermek için tarayıcınızın
          yerel depolamasını, yönetici oturumu için ise zorunlu bir çerezi kullanır.
        </li>
      </ul>

      <LegalH2>Yapay Zekâ Özellikleri</LegalH2>
      <p>
        Yapay zekâ destekli belge/video işleme özellikleri yalnızca yönetici hesabında açıktır. Uzman
        hesaplarında bu özellikler kapalıdır ve uzmanların çalışma alanı verileri yapay zekâ
        sağlayıcısına gönderilmez.
      </p>

      <LegalH2>Veri Konumu</LegalH2>
      <p>
        Veritabanı ve dosya depolama bölgesi: <strong>{residency.label}</strong>
        {residency.note ? ` — ${residency.note}` : ""}. Hizmet sağlayıcıların bir kısmı yurt dışında
        bulunduğundan, verilerin yurt dışında işlenmesi söz konusu olabilir; uzmanların danışanlarından
        bu konuda gerekli açık rızayı alması ve kayıt altına alması önerilir.
      </p>

      <LegalH2>Saklama ve Silme</LegalH2>
      <p>
        Hesap ve çalışma alanı verileri üyelik süresince saklanır. Uzman, danışan kaydını sildiğinde o
        danışana bağlı kayıtlar da silinir; danışana bağlı olmayan modül kayıtları (ör. Numeroloji,
        Human Design, Refleksoloji, Biyoenerji) ayrıca silinmelidir. Altyapı sağlayıcısının yedekleri,
        sağlayıcının yedekleme politikası kapsamında sınırlı bir süre daha tutulabilir.
      </p>

      <LegalH2>Haklarınız</LegalH2>
      <p>
        6698 sayılı KVKK&apos;nın 11. maddesi kapsamındaki taleplerinizi (bilgi talebi, düzeltme,
        silme vb.){" "}
        <Link href="/iletisim" className="text-violet-700 underline">
          İletişim sayfası
        </Link>{" "}
        üzerinden iletebilirsiniz. Danışanlara ait veriler için başvurular öncelikle ilgili uzmana
        (veri sorumlusu) yapılmalıdır.
      </p>
    </LegalPageShell>
  );
}
