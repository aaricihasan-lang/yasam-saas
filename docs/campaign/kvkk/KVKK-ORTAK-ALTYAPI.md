# Yaşam Sistemi — Ortak KVKK Altyapısı (03.11.2026)

> Hukuki görüş değildir. Mevzuat kaynakları resmî metinlerden (kvkk.gov.tr, mevzuat.gov.tr) derlenmiştir; doğrulanamayanlar
> ayrıca işaretlidir. **[OWNER]** ile işaretli alanları yalnız Owner doldurur; uydurma kimlik, adres, süre veya taahhüt YAZILMAZ.
> Etiketler: **[Gerekli]** mevzuatça gerekli · **[Önerilen]** kuvvetle önerilen · **[İsteğe bağlı]** · **[Doğrulanamadı]**.

## 0. Özet — bu belgeyle yapılanlar

| Metin | Durum | Yer |
|---|---|---|
| A. Platform aydınlatma metni | Bu belgede taslak (§A); mevcut `/gizlilik-politikasi` ile çelişmez, onun md.10 özetidir | Owner onayı sonrası sayfaya |
| B. Gizlilik ve Veri Güvenliği Politikası | Mevcut `/gizlilik-politikasi` korunur; §B'deki ekler önerilir | Owner onayı sonrası |
| C. Ücretsiz Analiz ziyaretçi aydınlatması | **Kodda** (PR): form içi kısa bildirim + `/ucretsiz-analiz-aydinlatma` | Merge ile yayın |
| D. Açık rıza değerlendirmesi | §D — ücretsiz analizde açık rıza **gerekmiyor**; onay kutusu eklenmedi | — |
| E. Uzman / danışan rolleri | §E — mevcut Veri İşleme Sözleşmesi'ne eklenecek alt işleyen maddesi | Owner onayı sonrası |

## 1. Veri envanteri (koddan doğrulanan)

| Akış | Veri | Amaç | Hukuki sebep (öneri) | Saklama | Alıcı / yurt dışı |
|---|---|---|---|---|---|
| Ücretsiz analiz | Tekniğe göre ad soyad, doğum tarihi/saati/yeri, bakılacak tarih, bina/daire no | Analizi hesaplamak | md.5/2-c | **Saklanmaz** (kampanya tablolarında girdi/sonuç kolonu yok — `campaign-yayin` Y21) | Klasik Numeroloji: ad + doğum tarihi → hesaplama sağlayıcısı; HD / Atlas: doğum tarihi/saati/koordinat (ad yok); Bütüncül / Lilly / Kozmik: yerel |
| Ücretsiz analiz — kötüye kullanım | IP, `km_z` çerezi (30 gün) | Günlük hak, hız sınırı | md.5/2-f, md.12 | Günlük HMAC özeti, 30 gün (**Inngest bakımı çalışırsa**) | Turnstile: tarayıcı → Cloudflare (IP + tarayıcı sinyalleri); sunucu IP göndermez |
| Ücretsiz analiz — istatistik | Toplu sayaç; `km_aid` yalnız analitik onayıyla | Kampanya ölçümü | sayaç: kişisel veri değil; tekil: md.5/1 açık rıza (çerez tercihi) | 90 gün (tekil özet) | — |
| Uzman (ücretli) | Ad soyad, e-posta, parola özeti, oturum/güvenlik kayıtları (IP, cihaz) | Üyelik, güvenlik | md.5/2-c, md.5/2-f | IP 90 gün, kullanım 180 gün, özet 25 ay (Inngest; **canlıda günlük çalıştığı doğrulandı**) | Vercel, Supabase (Frankfurt), Inngest (ABD) |
| Danışan (uzmanın) | Kimlik, iletişim, doğum, notlar; **sağlık niteliğinde olabilecek** anamnez, beslenme ölçümleri, alerjen, klinik not, kan grubu, fotoğraf | Uzmanın hizmeti | Uzman veri sorumlusu; özel nitelikli veri için md.6 açık rıza (uzmanın yükümlülüğü) | Uzman silene kadar; danışan silme cascade rotası var | Vercel, Supabase; HD/astroloji/numeroloji hesaplarında hesaplama sağlayıcısı |
| Owner / admin | Danışan içeriğini görüntüleyen admin rotası **bulunamadı**; yalnız sayımlar; `admin_audit_log` | Yönetim | md.5/2-f | — | — |
| Raporlar | Word/PDF | Kullanıcıya rapor | — | Kampanya: saklanmaz; uzman HD raporları ve snapshot'lar saklanır | — |

Doğrulanamayanlar: Vercel istek loglarının içeriği/süresi; Supabase bucket'larının production ayarı; danışan tablolarının tamamının RLS ayrıntısı.

## 2. Yurt dışı aktarım (KVKK md.9, 01.06.2024 sonrası)

Türkiye için Kurulun **yeterlilik kararı yok** → AB'de (Almanya) barındırma da yurt dışı aktarımdır. Düzenli aktarımda dayanak
**uygun güvence** (standart sözleşme / BCR / taahhütname) olmalıdır; **açık rıza yalnız arızi aktarımda** (md.9/6) dayanaktır.
Standart sözleşme Kurul metniyle **değiştirilmeden** kullanılır ve imzadan sonra **5 iş günü içinde Kurula bildirilir**
(standartsozlesme.kvkk.gov.tr; bildirmeme md.18 idari para cezası). AB SCC / DPA Türk standart sözleşmesinin yerine **geçmez**.

| Sağlayıcı | Veri | Konum | Mevcut belge | Türk standart sözleşme | Durum |
|---|---|---|---|---|---|
| Hesaplama sağlayıcısı (Roxy Labs) | Doğum verisi; Klasik Numeroloji'de **ad soyad** | Almanya (Nürnberg); yönetim erişimi Hindistan (log/hesap) | DPA otomatik (AB SCC M2); veri koruma sayfası: istek içeriği bellekte, kayda yazılmaz | **Belgesine göre ücretsiz imzalıyor** (Kurul Kararı 2024/959) — talep edilmedi | **[Gerekli] AÇIK** — Owner talep etmeli, imza + 5 iş günü bildirim |
| Vercel | Tüm istekler, teknik loglar | Fonksiyon fra1 (canlıda `x-vercel-id: fra1` doğrulandı); log/hesap verisi ABD | DPA otomatik (SCC M1–M3), DPF | Yayımlanmış süreç yok **[Doğrulanamadı]** | **[Gerekli] AÇIK** — platform geneli, kampanyaya özgü değil |
| Supabase | Tüm DB / storage | Frankfurt (eu-central-1) | DPA; imzalı kopya dashboard → Legal Documents | Yayımlanmış süreç yok **[Doğrulanamadı]** | **[Gerekli] AÇIK** — platform geneli |
| Cloudflare (Turnstile) | Ziyaretçi IP, tarayıcı sinyalleri (tarayıcıdan doğrudan) | Küresel / ABD | Turnstile gizlilik eki | Topluluk kaynağına göre DPA Türk SS içermiyor **[Doğrulanamadı]** | **[Gerekli] AÇIK** |
| Inngest | Yalnız iş kimlikleri (kişisel veri taşınmaz; kodla doğrulandı) | ABD | DPA yalnız ücretli planda | — | Kampanya bakımı kişisel veri taşımaz (HMAC/sayaç); düşük risk |

**En kısa uygulanabilir çözüm:** (1) Roxy'den bu hafta Türk SS-2 (veri sorumlusundan veri işleyene) imzası iste, imzadan sonra
5 iş günü içinde bildir; (2) Vercel, Supabase, Cloudflare'e yazılı SS-2 talebi gönder ve yazışmayı sakla; (3) imza
alınamayan sağlayıcılar için hukukçu değerlendirmesi (tek hukuki maliyet kalemi). Ziyaretçiden onay kutusu almak bu eksikliği
**gidermez**.

## A. Platform aydınlatma metni (taslak — `/gizlilik-politikasi` özetine eklenir)

**Veri sorumlusu:** [OWNER: gerçek kişi adı soyadı veya şirket unvanı] — [OWNER: adres] — yasamsistemi@gmail.com — 0850 307 20 93.
(`lib/legal/legalIdentity.ts` `legalName` / `address` alanları doldurulunca tüm hukuk sayfalarında otomatik görünür.) **[Gerekli]**
— Aydınlatma Tebliği md.5: veri sorumlusunun kimliği.

1. **İşlenen veriler ve amaçlar:** Üyelik (ad soyad, e-posta, parola özeti) — hesabın kurulması ve hizmetin sunulması;
   güvenlik kayıtları (IP, cihaz, oturum) — bilgi güvenliği; kullanım istatistikleri — hizmetin iyileştirilmesi; ücretsiz
   analiz girdileri — yalnız istenen hesap (saklanmaz); uzmanların danışan verileri — uzman adına (uzman veri sorumlusudur).
2. **Hukuki sebepler:** md.5/2-c (sözleşme), md.5/2-ç (hukuki yükümlülük), md.5/2-f (meşru menfaat); analitik çerezler ve
   pazarlama için md.5/1 açık rıza.
3. **Alıcılar:** barındırma (Vercel), veritabanı (Supabase), arka plan işleri (Inngest), güvenlik doğrulaması (Cloudflare),
   hesaplama hizmet sağlayıcısı, yönetici modüllerinde yapay zekâ (OpenAI), onaylı analitik (Google Analytics); yetkili
   kamu kurumları (hukuki yükümlülük hâlinde).
4. **Yurt dışı aktarım:** §2 tablosu; dayanak: md.9 standart sözleşme.
5. **Toplama yöntemi:** elektronik formlar, çerezler, otomatik teknik kayıtlar.
6. **Haklar ve başvuru (md.11 / md.13):** yasamsistemi@gmail.com veya yazılı başvuru [OWNER: adres]; en geç 30 gün.

## B. Gizlilik ve Veri Güvenliği Politikası — önerilen ekler

Mevcut `/gizlilik-politikasi` metni korunur. Eklenmesi önerilenler:
- **[Gerekli]** Ücretsiz analiz bölümü (bu PR: `/ucretsiz-analiz-aydinlatma` bağlantısı ve alt işleyici listesi güncellendi).
- **[Gerekli]** Veri ihlali: Kurula **72 saat** içinde bildirim, ilgili kişilere makul sürede bildirim (Kurul Kararı 2019/10)
  — iç prosedür: [OWNER: sorumlu kişi ve iletişim].
- **[Önerilen]** Saklama süreleri yalnız zamanlanmış temizlik görevleri çalıştığında geçerlidir → görevlerin çalıştığı
  her deploy sonrası Inngest senkronuyla doğrulanır (bkz. yayın prosedürü).
- **[Önerilen]** Güvenlik özeti: TLS; HttpOnly oturum çerezi; CSP nonce; RLS; ham IP yerine HMAC özetleri; kampanya
  girdileri bellekte işlenir.

## C. Ücretsiz analiz ziyaretçi aydınlatması — KODDA

- Form içinde, gönder düğmesinden ve güvenlik doğrulamasından **önce** teknik bazında kısa bildirim
  (`lib/campaign/visitor/dataNotice.ts`): hangi verinin yurt dışındaki hesaplama sağlayıcısına gittiği / gitmediği.
- Ayrıntılı metin: `/ucretsiz-analiz-aydinlatma` (kampanya kapısından bağımsız, herkese açık; yeni sekmede açılır; modal veya
  zorunlu kaydırma yok).
- Onay kutusu **yok** (Kurul İlke Kararı 2026/347: aydınlatma rızaya bağlanmaz). Kanıt olarak ayrı kayıt tutulmaz
  (veri minimizasyonu); aydınlatmanın formda gösterildiği kodla ve testle (`scripts/campaign/data-notice.test.ts`) belgelenir.

## D. Açık rıza değerlendirmesi

| İşlem | Açık rıza gerekir mi | Gerekçe |
|---|---|---|
| Ücretsiz analiz hesabı | Hayır | md.5/2-c — ziyaretçinin talep ettiği hizmet |
| IP özeti / güvenlik çerezi / Turnstile | Hayır | md.5/2-f + md.12; zorunlu çerez (Kurul Çerez Rehberi) |
| Yurt dışı aktarım (düzenli) | **Hayır — dayanak olamaz** | md.9: standart sözleşme gerekir; açık rıza yalnız arızi aktarım |
| Tekil ziyaret sayımı / Google Analytics | Evet | Mevcut çerez tercih bileşeni (zaten var) |
| Uzmanın danışanından özel nitelikli veri (sağlık) | Evet — **uzmanın** yükümlülüğü | md.6; platformda `client_consents` (acik_riza_ozel_nitelikli) mevcut |
| İkinci kişinin verisi (iki kişilik analizler) | — | İlk kampanyada iki kişilik teknikler kapalı önerildi |

## E. Uzman ve danışan veri işleme sorumlulukları

- Danışan verilerinde **uzman = veri sorumlusu**, **Yaşam Sistemi = veri işleyen** (mevcut `/veri-isleme-sozlesmesi` ve
  `/gizlilik-politikasi` ile uyumlu).
- **[Gerekli]** Veri işleyen, alt işleyenleri veri sorumlusuna bildirmelidir: hesaplama sağlayıcısı alt işleyen listesine
  eklendi (bu PR). Veri İşleme Sözleşmesi'ne önerilen madde: *"Yaşam Sistemi, Human Design, astroloji ve numeroloji
  hesaplamaları için yurt dışında yerleşik bir hesaplama hizmet sağlayıcısını alt işleyen olarak kullanır; bu hesaplamalarda
  yalnız hesap için gereken doğum bilgileri ve Klasik Numeroloji'de ad soyad iletilir. Güncel liste Alt İşleyiciler
  sayfasındadır."*
- **[Gerekli — uzmanın]** Danışana aydınlatma ve özel nitelikli veri için açık rıza: `/kvkk-aydinlatma` örnek metni mevcut.
- **[İsteğe bağlı]** Uzmana, danışanın yurt dışı aktarımı için standart sözleşme zincirinin (uzman → Yaşam Sistemi → alt
  işleyen; SS-2 / SS-3) kurulduğunu gösteren kısa bilgi notu.

## 3. VERBİS

Genel istisna: yıllık çalışan < 50 **ve** yıllık mali bilanço < 100 milyon TL **ve** ana faaliyet özel nitelikli veri işleme
değil (Kurul Kararı 2023/1154). Yaşam Sistemi'nin ana faaliyeti özel nitelikli veri işleme sayılırsa eşik 10 çalışan / 10
milyon TL (Kurul Kararı 2025/1572). Danışan sağlık verileri uzmanların sorumluluğunda işlendiğinden platformun ana faaliyeti
olarak nitelenip nitelenmeyeceği hukukçu sorusudur **[Doğrulanamadı]**. [OWNER: çalışan sayısı ve bilanço ile istisnayı belgeleyin.]

## 4. Kaynaklar

- 6698 sayılı Kanun (md.9 güncel hâli): https://www.kvkk.gov.tr/Icerik/6649/Personal-Data-Protection-Law
- Standart sözleşmeler: https://www.kvkk.gov.tr/Icerik/7929/Standart-Sozlesmeler — bildirim: https://www.kvkk.gov.tr/Icerik/8043/Standart-Sozlesme-Bildirim-Modulu-Hakkinda-Kamuoyu-Duyurusu
- Veri ihlali bildirimi: https://www.kvkk.gov.tr/Icerik/5362/Veri-Ihlali-Bildirimi
- Çerez rehberi: https://kvkk.gov.tr/Icerik/7353/Cerez-Uygulamalari-Hakkinda-Rehber
- VERBİS istisnası (2025/1572): https://kvkk.gov.tr/Icerik/8388/KAMUOYU-DUYURUSU
- Kurul İlke Kararı 2026/347 (aydınlatma ↔ açık rıza ayrımı): ikincil kaynak üzerinden; RG 24.03.2026 sayı 33203 resmî metinden teyit edilmeli **[Doğrulanamadı]**
- Hesaplama sağlayıcısı veri koruma sayfası: https://roxyapi.com/docs/data-protection (03.11.2026 okundu: veriler Almanya'da; istek içeriği kaydedilmez; Türk standart sözleşmesini alıcı taraf olarak ücretsiz imzalar)
