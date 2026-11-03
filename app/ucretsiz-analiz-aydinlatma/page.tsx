import type { Metadata } from "next";
import Link from "next/link";
import LegalIdentityBlock from "@/components/kvkk/LegalIdentityBlock";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";

export const metadata: Metadata = {
  title: "Ücretsiz Analiz Aydınlatma Metni — Yaşam Sistemi",
  description:
    "Ücretsiz analizlerde girdiğiniz bilgilerin hangi amaçla, hangi hukuki sebeple, kimlere iletilerek ve ne kadar süreyle işlendiği.",
};

/**
 * Ücretsiz Analiz (Kampanya Merkezi) — KVKK md.10 aydınlatma metni.
 * Metin kodun GERÇEK akışına göre yazılmıştır (docs/campaign/kvkk/ envanteri):
 *   - Girdi ve sonuç kaydedilmez (lib/campaign/visitor/pipeline.ts; kampanya tablolarında girdi/sonuç kolonu yok);
 *   - Klasik Numeroloji'de ad soyad + doğum tarihi, HD / Atlas'ta doğum tarihi-saati-koordinat hesaplama sağlayıcısına
 *     gider (lib/campaign/visitor/dataNotice.ts); Bütüncül Numeroloji, Lilly horary, Kozmik Takvim yerel;
 *   - IP ve tarayıcı kimliği yalnız günlük değişen HMAC özeti (lib/campaign/subject.ts), 30 gün (campaign-maintenance);
 *   - Turnstile: sunucu Cloudflare'e IP göndermez (lib/campaign/visitor/botCheck.ts).
 * Bu sayfa kampanya yayın kapısından (CAMPAIGN_PUBLIC_ENABLED) bağımsız olarak herkese açıktır. Aydınlatma bir onay
 * kutusuna bağlanmaz; açık rıza istenmez.
 */
export default function UcretsizAnalizAydinlatmaPage() {
  return (
    <LegalPageShell title="Ücretsiz Analiz Aydınlatma Metni" currentHref="/ucretsiz-analiz-aydinlatma">
      <p>
        Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu&apos;nun 10. maddesi uyarınca, Yaşam Sistemi
        ücretsiz analiz sayfasında girdiğiniz bilgilerin nasıl işlendiğini açıklar. Ücretsiz analiz için hesap
        açmanız, e-posta veya telefon bilgisi vermeniz gerekmez.
      </p>

      <LegalH2 id="veri-sorumlusu">1. Veri Sorumlusu</LegalH2>
      <p>Ücretsiz analizlerde kişisel verileriniz bakımından veri sorumlusu Yaşam Sistemi&apos;dir.</p>
      <LegalIdentityBlock />

      <LegalH2 id="veriler">2. İşlenen Veriler ve Amaçları</LegalH2>
      <ul>
        <li>
          <strong>Analiz için girdiğiniz bilgiler</strong> (seçtiğiniz analize göre ad soyad, doğum tarihi, doğum saati,
          doğum yeri, bakılacak tarih veya bina / daire numarası): yalnız istediğiniz analizi hesaplamak ve sonucunu,
          varsa raporunu size göstermek için. Bu bilgiler ve analiz sonucu kaydedilmez; istek süresince işlenir ve
          yanıt size iletildikten sonra sunucuda tutulmaz. Rapor dosyası yalnız tarayıcınıza gelir, paylaşım bağlantısı
          üretilmez.
        </li>
        <li>
          <strong>Bağlantı bilgileri</strong> (IP adresi) ve <strong>güvenlik çerezi</strong> (tarayıcıya özgü rastgele
          kimlik): günlük ücretsiz kullanım hakkını uygulamak ve otomatik kötüye kullanımı önlemek için. Ham IP adresi ve
          ham tarayıcı kimliği veritabanına yazılmaz; yalnız gizli bir anahtarla üretilen ve her gün değişen özetleri
          sayılır. Bu özetler 30 gün sonra silinir. Güvenlik çerezi 30 gün geçerlidir ve zorunlu çerez niteliğindedir.
        </li>
        <li>
          <strong>Güvenlik doğrulaması</strong>: otomatik isteklere karşı Cloudflare Turnstile kullanılır. Doğrulama aracı
          tarayıcınızdan doğrudan Cloudflare&apos;e bağlanır ve Cloudflare bu sırada IP adresinizi ve tarayıcı
          sinyallerini kendi gizlilik koşullarıyla işler. Sunucumuz doğrulama sırasında Cloudflare&apos;e IP adresinizi
          ayrıca göndermez.
        </li>
        <li>
          <strong>Kampanya istatistikleri</strong>: ziyaret, analiz başlatma / tamamlama ve rapor indirme sayıları kişisel
          veri içermeyen toplu sayaçlardır. Tekil ziyaretçi sayımı yalnız analitik çerezlere onay verdiyseniz yapılır.
        </li>
      </ul>

      <LegalH2 id="hukuki-sebep">3. Hukuki Sebepler</LegalH2>
      <ul>
        <li>
          Analiz için girdiğiniz bilgiler: talep ettiğiniz ücretsiz analiz hizmetinin kurulması ve ifası için gerekli
          olması (KVKK md.5/2-c).
        </li>
        <li>
          Bağlantı bilgileri, güvenlik çerezi ve güvenlik doğrulaması: hizmetin kötüye kullanımını önlemeye yönelik meşru
          menfaat (KVKK md.5/2-f) ve bilgi güvenliği yükümlülüğü (KVKK md.12).
        </li>
        <li>Tekil ziyaretçi sayımı: analitik çerez tercihinizle verdiğiniz açık rıza (KVKK md.5/1).</li>
      </ul>

      <LegalH2 id="aktarim">4. Aktarım ve Alıcı Grupları</LegalH2>
      <ul>
        <li>
          <strong>Hesaplama hizmet sağlayıcısı</strong> (yurt dışında yerleşik; sunucuları Almanya&apos;da): Klasik
          Numeroloji analizlerinde ad soyad ve doğum tarihiniz; Human Design ve Gökyüzü Atlası analizlerinde doğum
          tarihiniz, saatiniz, doğum yerinizin koordinatları ve saat dilimi (adınız gönderilmez). Bütüncül Numeroloji ve
          diğer yerel analizlerde bu sağlayıcıya veri gönderilmez.
        </li>
        <li>
          <strong>Altyapı hizmet sağlayıcıları</strong>: uygulama barındırma (Vercel; Frankfurt bölgesi), veritabanı
          (Supabase; Frankfurt bölgesi) ve güvenlik doğrulaması (Cloudflare). Güncel liste{" "}
          <Link href="/alt-isleyiciler" className="text-violet-700 underline">
            Alt İşleyiciler
          </Link>{" "}
          sayfasındadır.
        </li>
      </ul>
      <p>
        Bu sağlayıcılara yapılan aktarımlar KVKK&apos;nın 9. maddesi kapsamında yurt dışına aktarım niteliğindedir.
        Verileriniz pazarlama amacıyla üçüncü kişilerle paylaşılmaz.
      </p>

      <LegalH2 id="toplama">5. Toplama Yöntemi</LegalH2>
      <p>
        Veriler, ücretsiz analiz formunu doldurmanızla elektronik ortamda ve tarayıcınızın gönderdiği teknik bağlantı
        bilgileri aracılığıyla otomatik yollarla toplanır.
      </p>

      <LegalH2 id="baskasi">6. Başka Birine Ait Bilgi</LegalH2>
      <p>
        Analizi başka biri için yapıyorsanız, yalnız o kişinin bilgisi ve onayıyla bilgilerini girmenizi rica ederiz. Bu
        bilgiler de kaydedilmez.
      </p>

      <LegalH2 id="haklar">7. Haklarınız</LegalH2>
      <p>
        KVKK md.11 uyarınca kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacını öğrenme,
        aktarıldığı alıcıları bilme, düzeltilmesini veya silinmesini isteme, itiraz etme ve zararın giderilmesini talep
        etme haklarına sahipsiniz. Başvurularınızı yukarıdaki iletişim kanallarından iletebilirsiniz; başvurular en geç
        30 gün içinde yanıtlanır. Analiz girdileri ve sonuçları saklanmadığından, bu bilgiler için sonradan silinecek bir
        kayıt bulunmaz.
      </p>
      <p>
        Platformun genel işleyişi için{" "}
        <Link href="/gizlilik-politikasi" className="text-violet-700 underline">
          Gizlilik Politikası
        </Link>
        &apos;na bakabilirsiniz.
      </p>
    </LegalPageShell>
  );
}
