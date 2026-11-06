import type { Metadata } from "next";
import Link from "next/link";
import LegalPageShell, { LegalH2 } from "@/components/kvkk/LegalPageShell";
import { buildMailtoHref, buildTelHref } from "@/lib/contact/info";
import { LEGAL_IDENTITY } from "@/lib/legal/legalIdentity";

export const metadata: Metadata = {
  title: "Ücretsiz Analiz Aydınlatma Metni — Yaşam Sistemi",
  description:
    "Ücretsiz analizlerde girdiğiniz bilgilerin hangi amaçla, hangi hukuki sebeple, kimlere iletilerek ve ne kadar süreyle işlendiği.",
};

/**
 * Ücretsiz Analizler — KVKK md.10 aydınlatma metni (Owner metni, 03.11.2026).
 * Veri sorumlusu adı / adresi TEK KAYNAKTAN (lib/legal/legalIdentity.ts legalName / address) okunur; boşsa satır
 * gösterilmez (yer tutucu yayımlanmaz). Owner kuralı: bu iki alan doldurulmadan sayfa yayımlanmamalıdır.
 * Metin kodun gerçek akışıyla eşlidir (docs/campaign/kvkk/KVKK-ORTAK-ALTYAPI.md). Kampanya yayın kapısından bağımsız,
 * herkese açık. Aydınlatma bir onay kutusuna bağlanmaz.
 */
export default function UcretsizAnalizAydinlatmaPage() {
  const id = LEGAL_IDENTITY;
  const name = id.legalName?.trim();
  const address = id.address?.trim();
  return (
    <LegalPageShell title="Ücretsiz Analizler — Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni" currentHref="/ucretsiz-analiz-aydinlatma">
      <LegalH2 id="veri-sorumlusu">1. Veri sorumlusu ve iletişim</LegalH2>
      <p>
        Yaşam Sistemi, www.yasamsistemi.com adresinde sunulan dijital analiz platformunun marka ve hizmet adıdır.
      </p>
      <dl className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 text-sm sm:grid-cols-[max-content_1fr]">
        {name ? (
          <div className="contents">
            <dt className="font-bold text-slate-500">Veri sorumlusu</dt>
            <dd className="min-w-0 break-words text-slate-900">{name}</dd>
          </div>
        ) : null}
        {address ? (
          <div className="contents">
            <dt className="font-bold text-slate-500">Tebligat / iletişim adresi</dt>
            <dd className="min-w-0 break-words text-slate-900">{address}</dd>
          </div>
        ) : null}
        <div className="contents">
          <dt className="font-bold text-slate-500">E-posta</dt>
          <dd className="min-w-0 break-words text-slate-900">
            <a href={buildMailtoHref()} className="font-semibold text-violet-700 underline">{id.email}</a>
          </dd>
        </div>
        <div className="contents">
          <dt className="font-bold text-slate-500">İletişim</dt>
          <dd className="min-w-0 break-words text-slate-900">
            <a href={buildTelHref()} className="font-semibold text-violet-700 underline">{id.phone}</a>
          </dd>
        </div>
      </dl>
      <p>Kişisel verilerinizin işlenmesiyle ilgili taleplerinizi belirtilen iletişim kanalları üzerinden iletebilirsiniz.</p>

      <LegalH2 id="veriler">2. Hangi kişisel veriler işlenir?</LegalH2>
      <p>Ücretsiz analiz hizmetinde seçtiğiniz tekniğe göre aşağıdaki bilgiler işlenebilir:</p>
      <ul>
        <li>Doğum tarihi, doğum saati ve doğum yeri.</li>
        <li>Klasik Numeroloji için ad ve soyad.</li>
        <li>Analiz türüne göre değerlendirme veya hesaplama tarihi, ev ya da işyeri numarası.</li>
        <li>Günlük kullanım sınırları ve güvenlik için IP adresi, tarayıcıya özgü güvenlik kimliği ve güvenlik doğrulama bilgileri.</li>
        <li>İsteğe bağlı ziyaret istatistikleri için izin verdiğiniz analitik bilgiler.</li>
      </ul>
      <p>Ücretsiz analizler için hesap açmanız, telefon numaranızı veya e-posta adresinizi vermeniz zorunlu değildir.</p>

      <LegalH2 id="amaclar">3. Kişisel veriler hangi amaçlarla işlenir?</LegalH2>
      <p>
        Bilgileriniz yalnızca talep ettiğiniz analizi hesaplamak, sonucu ve varsa raporu sunmak, ücretsiz kullanım
        sınırlarını uygulamak, yetkisiz otomatik kullanımı önlemek ve platformun bilgi güvenliğini sağlamak amacıyla işlenir.
      </p>
      <p>
        İletişim veya pazarlama amacıyla ayrıca izin vermediğiniz sürece analiz için girdiğiniz bilgiler pazarlama
        iletişimi amacıyla kullanılmaz.
      </p>

      <LegalH2 id="hukuki-sebep">4. Veri işleme yöntemleri ve hukuki sebepler</LegalH2>
      <p>
        Analiz bilgileriniz, ücretsiz analiz formunu doldurmanız yoluyla elektronik ortamda toplanır ve istediğiniz
        hizmetin sunulması amacıyla işlenir.
      </p>
      <p>
        Bu işlemler için KVKK&apos;nın 5. maddesindeki uygun veri işleme şartları; hizmetin kurulması ve ifası bakımından
        5/2-c, bilgi güvenliği ve kötüye kullanımın önlenmesi bakımından koşulları sağlandığı ölçüde 5/2-f kapsamında
        değerlendirilir.
      </p>
      <p>İsteğe bağlı analitik çerezler kullanılıyorsa bunlar için gerekli tercih veya izin mekanizması ayrı uygulanır.</p>
      <p>Kişisel verilerin yurt dışına aktarımı bakımından ayrıca KVKK&apos;nın 9. maddesindeki koşullar geçerlidir.</p>

      <LegalH2 id="aktarim">5. Veriler kimlere aktarılır?</LegalH2>
      <p>Yaşam Sistemi, hesaplama ve teknik altyapı hizmetlerini sunabilmek için bazı yurt dışı hizmet sağlayıcılardan yararlanır.</p>
      <ul>
        <li>
          <strong>Hesaplama hizmet sağlayıcısı:</strong> Human Design ve Gökyüzü Atlası analizlerinde doğum tarihi, saati,
          yer koordinatları ve ilgili saat dilimi bilgileri; Klasik Numeroloji analizlerinde ad, soyad ve doğum tarihi
          hesaplama sağlayıcısına iletilir.
        </li>
        <li>
          <strong>Yerel analizler:</strong> Bütüncül Numeroloji analizleri, harici hesaplama API&apos;sine gönderilmeden
          Yaşam Sistemi uygulama altyapısında hesaplanır.
        </li>
        <li>
          <strong>Barındırma ve veritabanı:</strong> Vercel ve Supabase, platformun barındırılması, sunucu işlemleri ve
          gerekli kayıtların yönetimi için kullanılır.
        </li>
        <li>
          <strong>Güvenlik:</strong> Cloudflare Turnstile, otomatik ve kötüye kullanıma yönelik isteklerin tespiti amacıyla
          tarayıcınızdan IP adresi ve teknik tarayıcı sinyalleri işleyebilir.
        </li>
      </ul>
      <p>
        Yurt dışına veri aktarımı, KVKK&apos;nın 9. maddesinde öngörülen koşullara ve uygulanabilir hukuki güvencelere tabi
        olarak gerçekleştirilmelidir. Sağlayıcı ve veri kapsamına ilişkin bilgiler{" "}
        <Link href="/alt-isleyiciler" className="text-violet-700 underline">Alt İşleyiciler</Link> sayfasında açıklanır.
      </p>

      <LegalH2 id="saklama">6. Verilerin saklanması ve silinmesi</LegalH2>
      <p>
        Ücretsiz kampanya kapsamında gönderilen analiz girdileri ve üretilen sonuçlar, Yaşam Sistemi&apos;nin kampanya
        veritabanında kalıcı danışan kaydı oluşturmak amacıyla saklanmaz.
      </p>
      <p>
        Analiz ve rapor çıktıları ziyaretçinin tarayıcısına iletilir. Kullanım haklarının ve güvenliğin yönetilmesi için IP
        ve tarayıcı kimliklerinden oluşturulan günlük kriptografik özetler, mevcut saklama politikasına göre 30 günün sonunda
        temizlenir.
      </p>
      <p>Teknik altyapı sağlayıcılarının kendi güvenlik kayıtları, veri işleme ve saklama koşulları ayrıca geçerlidir.</p>

      <LegalH2 id="baskasi">7. Başkasına ait bilgiler</LegalH2>
      <p>Başka bir kişiye ait doğum bilgilerini ancak bu bilgileri hukuka uygun şekilde paylaşma yetkiniz varsa giriniz.</p>
      <p>
        Ücretsiz analizlerimizde ikinci kişinin bilgilerinin zorunlu olduğu Sinastri ve İlişki Analizi gibi teknikler mevcut
        kampanya kapsamında sunulmamaktadır.
      </p>

      <LegalH2 id="haklar">8. KVKK kapsamındaki haklarınız</LegalH2>
      <p>
        6698 sayılı Kanun&apos;un 11. maddesi kapsamında kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse
        bilgi talep etme, işlenme amacını ve aktarıldığı alıcıları öğrenme, koşulları oluştuğunda düzeltme veya silme isteme
        ve diğer kanuni haklarınızı kullanabilirsiniz.
      </p>
      <p>
        Başvurularınızı{" "}
        <a href={buildMailtoHref()} className="text-violet-700 underline">{id.email}</a>{" "}
        üzerinden iletebilirsiniz. Başvurularınız mevzuattaki usul ve süreler çerçevesinde değerlendirilir.
      </p>
      <p>
        Platformun genel veri işleme süreçleri için{" "}
        <Link href="/gizlilik-politikasi" className="text-violet-700 underline">Gizlilik Politikası</Link>, hizmet
        sağlayıcılar için <Link href="/alt-isleyiciler" className="text-violet-700 underline">Alt İşleyiciler</Link>{" "}
        sayfasını inceleyebilirsiniz.
      </p>
    </LegalPageShell>
  );
}
