# 7 Günlük Ücretsiz Deneme — Gizlilik / KVKK Metin Taslağı

> **DURUM: TASLAK — HUKUKİ ONAY GEREKLİ.** Bu belgedeki metinler canlı sayfalara (`/gizlilik-politikasi`,
> `/kvkk-aydinlatma`) **işlenmemiştir**. `[HUKUKİ ONAY]` ile işaretli her ifade hukuk danışmanının
> değerlendirmesinden sonra kesinleşir. Teknik açıklamalar (aşağıdaki "Mevcut teknik davranış") kod
> ile doğrulanmış olgulardır; hukuki nitelendirme değildir.
>
> Hazırlanma: 2026-11-06 · İlgili kod: `lib/trial/*`, `supabase/migrations/20280101000000_trial7_self_trial.sql`

---

## 0. Konumlandırma notu `[HUKUKİ ONAY]`

- `/kvkk-aydinlatma` sayfası, uzmanların **kendi danışanlarına** sunabileceği örnek aydınlatma metnidir.
  7 günlük deneme üyeliği ise **uzmanın kendi kişisel verisiyle** ilgilidir (Yaşam Sistemi veri sorumlusu).
- Bu nedenle deneme açıklamalarının yeri **Gizlilik Politikası**'dır. Danışan aydınlatma örneğinde
  değişiklik önerilmez.
- Değerlendirilmesi gereken: kayıt formunda (`/register`) veri toplanırken aydınlatma yükümlülüğünün
  (KVKK m.10) karşılanması için forma "Gizlilik Politikası" bağlantısı ve kısa bilgilendirme cümlesi
  eklenmesi. Önerilen cümle (Bölüm 3).

---

## 1. Mevcut teknik davranış (doğrulanmış olgular)

| Veri | Ne zaman | Biçim | Tutulduğu yer | Hesap silinince |
|---|---|---|---|---|
| Ad soyad, e-posta, parola özeti | Kayıt | Parola bcrypt özeti; e-posta düz metin | `users` | Mevcut hesap silme süreciyle |
| Deneme durumu ve penceresi (ilk giriş zamanı, bitiş zamanı) | İlk başarılı giriş | Zaman damgası | `users.trial_*` | Hesapla birlikte |
| **Tek deneme hakkı anahtarı** | Kayıt | Kanonik e-postanın **HMAC-SHA256** özeti (sunucu gizli anahtarıyla; ham e-posta yok) | `trial_claims` | **Silinmez** (bkz. Bölüm 4) |
| **IP kovası** | Kayıt | IP adresinin **HMAC** özeti (ham IP yok) | `trial_profiles.ip_bucket` | Hesapla birlikte silinir (FK cascade) |
| Risk sinyalleri | Kayıt | Puan (0–100) + işaretler: tek kullanımlık e-posta alan adı, aynı IP kovasından 24 saatte çoklu kayıt, tarayıcı bilgisi eksik, otomatik üretilmiş görünen ad | `trial_profiles` | Hesapla birlikte |
| Otomatik inceleme durumu | Kayıt | Yüksek riskte hesap "incelemede" açılır; modüller kapalı, **kalıcı ret yok**, karar yöneticidedir | `users.trial_status` | Hesapla birlikte |
| Günlük Roxy kredi kullanımı | Her ücretli hesaplama isteği | Gün, modül (Atlas / HD / Numeroloji), durum, HTTP kodu, uç etiketi — **hesaplama içeriği yok** | `trial_credit_ledger` | Hesapla birlikte |
| Pro üyelik talebi | Uzman talep ettiğinde | Tarih, durum, isteğe bağlı not (≤500 karakter) | `pro_upgrade_requests` | Hesapla birlikte |
| Yönetici işlemleri | Limit / inceleme / durdurma / Pro geçişi | İşlem türü, eski/yeni durum, yönetici kimliği | `trial_admin_events`, `admin_audit_log` | **Kalır** (denetim kaydı; kişi kimliği yalnız kullanıcı ID) |
| Cloudflare Turnstile | Kayıt formu | Tarayıcı doğrudan Cloudflare'e bağlanır (IP + tarayıcı sinyalleri Cloudflare'de işlenir). **Sunucu Cloudflare'e yalnız tek kullanımlık belirteci gönderir, IP göndermez.** | — (Cloudflare) | — |

Not: HMAC özetleri **takma adlandırılmış (pseudonymous) kişisel veri** niteliğindedir; anonim veri
değildir `[HUKUKİ ONAY]`.

---

## 2. Gizlilik Politikası — önerilen ekler (taslak metin)

### 2a. "Hangi Verileri İşliyoruz?" bölümüne yeni madde

> **7 günlük ücretsiz deneme üyeliği verileri:** deneme süresinin başlangıç ve bitiş zamanı, deneme
> durumu (aktif, süresi dolmuş, incelemede, durdurulmuş), günlük hesaplama kredisi kullanım kayıtları
> (tarih, modül ve işlem sonucu; hesaplama içeriği bu kayıtlarda tutulmaz) ve Pro üyelik talepleriniz.
> Amaç: deneme üyeliğinin yürütülmesi, deneme kullanım sınırlarının uygulanması ve Pro üyeliğe geçiş
> talebinizin değerlendirilmesi. `[HUKUKİ ONAY: hukuki sebep — sözleşmenin kurulması/ifası (m.5/2-c)]`

> **Kötüye kullanımı önleme kayıtları:** her e-posta adresiyle yalnız bir kez ücretsiz deneme
> yapılabilmesi için e-posta adresinizin standart hale getirilmiş biçiminden üretilen, geri
> döndürülemeyen bir anahtar (HMAC özeti) ile kayıt sırasında IP adresinizden üretilen benzer bir anahtar
> ve otomatik güvenlik sinyalleri (ör. geçici e-posta alan adı, aynı ağdan kısa sürede çok sayıda kayıt).
> Ham IP adresiniz bu amaçla saklanmaz. Amaç: deneme üyeliğinin kötüye kullanılmasının ve sahte
> hesapların önlenmesi. `[HUKUKİ ONAY: hukuki sebep — meşru menfaat (m.5/2-f); meşru menfaat
> dengelemesi kaydı]`

### 2b. Otomatik değerlendirme açıklaması (yeni paragraf) `[HUKUKİ ONAY]`

> Kayıt sırasında otomatik güvenlik sinyalleri yüksek risk gösterirse hesabınız oluşturulur ancak
> **inceleme** durumunda açılır; inceleme tamamlanana kadar deneme modülleri kullanılamaz. Bu durum
> kalıcı bir ret değildir; nihai kararı yönetici verir. Değerlendirmeye itiraz etmek için destek
> kanalından bize ulaşabilirsiniz.

(Değerlendirme: KVKK m.11/1-g — münhasıran otomatik sistemlerle analiz sonucu aleyhe bir sonuç
doğmasına itiraz hakkı. Mevcut akışta nihai karar yöneticidedir.)

### 2c. "Hizmet sağlayıcılar / alt işleyenler"

`/alt-isleyiciler` sayfasındaki Cloudflare (Turnstile) satırının amacı bu PR ile "Ücretsiz analizlerde
ve uzman kayıt formunda (7 günlük deneme üyeliği)" olarak güncellendi. Veri kapsamı metni değişmedi
ve artık kayıt formu için de birebir doğrudur (sunucu IP göndermez). Yurt dışına aktarım dayanağı
`[HUKUKİ ONAY: KVKK m.9 — mevcut kampanya için belirlenen dayanak kayıt formunu da kapsıyor mu?]`

### 2d. "Saklama ve Silme" bölümüne yeni maddeler (süreler hukuki onaya bağlı)

> - **Deneme üyeliği, kredi kullanımı ve Pro talebi kayıtları:** hesabınızla birlikte saklanır;
>   hesabınız silindiğinde birlikte silinir.
> - **Kayıt sırasındaki IP anahtarı (HMAC) ve güvenlik sinyalleri:** hesabınızla birlikte saklanır;
>   hesabınız silindiğinde birlikte silinir. `[HUKUKİ ONAY: hesap aktifken daha kısa bir süre
>   (ör. 90 gün — güvenlik kayıtlarındaki IP ile uyumlu) uygulanmalı mı?]`
> - **Tek deneme hakkı anahtarı (HMAC):** `[HUKUKİ ONAY — Bölüm 4'teki seçeneklerden biri seçilecek]`

---

## 3. Kayıt formu bilgilendirme cümlesi (öneri) `[HUKUKİ ONAY]`

> Kayıt olarak, deneme üyeliğinin yürütülmesi ve kötüye kullanımın önlenmesi amacıyla verilerinizin
> [Gizlilik Politikası](/gizlilik-politikasi)'nda açıklandığı şekilde işleneceğini öğrendiniz.
> Güvenlik doğrulaması Cloudflare Turnstile ile yapılır.

(Not: Bu bir aydınlatma cümlesidir; açık rıza metni değildir. Açık rıza gerekip gerekmediği —
özellikle yurt dışı aktarım için — hukuken değerlendirilmelidir.)

---

## 4. Tek deneme hakkı kaydının saklama süresi — değerlendirilecek seçenekler

**Mevcut durum (kod):** `trial_claims` tablosunda yalnız `claim_hash` (HMAC), ilk kullanıcı ID'si ve
tarih tutulur; `users` tablosuna bağlı değildir → hesap silinse de kalır. **Hiçbir saklama/silme
politikası uygulanmamıştır; mevcut kayıt yoktur (0 satır) ve silinmemiştir.**

| Seçenek | Açıklama | Artı | Risk / not |
|---|---|---|---|
| **A. Süresiz saklama** | Özet, tek hak amacı sürdükçe tutulur | Tek hak kuralı tam korunur | KVKK m.4 "amaçla bağlantılı, sınırlı ve ölçülü" ve "gerekli süre" ilkeleri — süresiz saklama gerekçelendirilmeli; HMAC takma adlı kişisel veridir |
| **B. Sabit süre (ör. 12 veya 24 ay) sonra imha** | Özet, kayıt tarihinden itibaren belirli süre sonunda silinir | Ölçülülük; süre sonunda aynı kişi yeniden deneyebilir (ticari kabul edilebilir) | Süre ve gerekçe saklama-imha politikasına (VERBİS) işlenmeli; periyodik imha işi gerekir |
| **C. Hesap silinince birlikte silme** | Hesapla aynı ömür | En sade ve veri en aza indirme ile uyumlu | Hesap silip yeniden kayıtla yeni deneme alınabilir (tek hak kuralı zayıflar) |
| **D. Hesap silinince kalır, sabit süre sonra imha (B + C karması)** | Hesap silindikten sonra yalnız özet, kısa bir süre (ör. 12 ay) tutulur | Kötüye kullanım penceresini kapatır, süresiz değil | Silme talebi (m.11) geldiğinde özetin neden tutulduğu gerekçelendirilmeli (meşru menfaat / hukuki iddia) |

Değerlendirme soruları `[HUKUKİ ONAY]`:
1. Özetin hukuki sebebi meşru menfaat (m.5/2-f) mı; dengeleme testi kayıt altına alınacak mı?
2. Kişinin silme talebinde (m.7, m.11) özet de silinecek mi, yoksa istisna mı uygulanacak?
3. Seçilen süre VERBİS / saklama-imha politikasına nasıl yansıtılacak?
4. `RATE_LIMIT_SECRET` değişirse eski özetler eşleşmez (fiilen etkisizleşir) — bu "imha" sayılabilir mi?

**Teknik not:** Seçenek B veya D seçilirse uygulanacak değişiklik (Owner onayından sonra, ayrı PR):
`trial_claims.claimed_at` üzerinden belirli süreyi aşan satırları silen zamanlanmış iş (Inngest
cron) + Gizlilik Politikası saklama maddesi. Bu belge kapsamında hiçbir silme işi eklenmemiştir.

---

## 5. Diğer hukuki değerlendirme noktaları `[HUKUKİ ONAY]`

- `trial_admin_events` / `admin_audit_log` denetim kayıtları hesap silinince kalır (kullanıcı ID ile).
  Mevcut admin denetim kaydı politikasıyla aynı mı ele alınacak?
- Pro talebindeki serbest metin not alanına kişisel veri girilebilir; saklama süresi hesapla aynı.
- WhatsApp üzerinden Pro iletişimi platform dışıdır; WhatsApp yazışmaları bu politikanın kapsamında mı
  belirtilecek?
