# Kampanya Merkezi — KM-3 Gerçek Ziyaretçi Deneyimi

Bu belge, Owner'ın açtığı ücretsiz analizlerin kayıtsız ziyaretçiye nasıl sunulduğunu anlatır. Tasarım, KM-P0 v2 görsel PASS prototipinden geliyor; Owner önizlemesi ve canlı sayfa **aynı bileşeni** kullanıyor (`app/_campaign/VisitorCampaignView.tsx`).

## Görünürlük — üç kapı (hepsi gerekli)

1. **Ortam:** `CAMPAIGN_PUBLIC_ENABLED=true`. Varsayılan kapalıdır; kapalıyken `/ucretsiz-analiz` ve `/api/kampanya/*` 404 döner. Kod yayına çıksa bile ziyaretçi hiçbir şey görmez.
2. **Veritabanı:** Yayındaki tek kampanya Aktif veya Yakında olmalı, tarih penceresi uygun olmalı, acil durdurma kapalı olmalı.
3. **Teknik:** Owner tekniği açmış olmalı, teknik katalogda **hazır** olmalı ve gerçek motora bağlı bir çalıştırıcısı bulunmalı (`lib/campaign/visitor/runners`).

## Gerçek motora bağlı teknikler (22)

| Modül | Teknik | Motor | Kredi |
|---|---|---|---|
| Human Design | BodyGraph | Roxy `/human-design/bodygraph` + mevcut doğrulama zinciri (`computeFictionalChart`) | 1 |
| Klasik Numeroloji | core, bridge, personal_day, daily, chaldean, dual, person_all, compatibility, business_name | Roxy `/numerology/*` + mevcut servis (`computeClassicResult`) | 1–5 |
| Bütüncül Numeroloji | analysis, timing | Yerel motor | 0 |
| Gökyüzü Atlası | natal, transit, progression, solar_arc, solar_return, profections, vedic.d1, sade_sati | Roxy + mevcut teknik kaydı (`getTechnique().units/project`) | 1 |
| Gökyüzü Atlası | horary.lilly | Yerel motor | 0 |
| Kozmik Takvim | paket: 6 özellik, Hacamat dahil | Yerel motor (`lib/cosmic`), hesap sunucuda | 0 |

**Bağlanmayanlar (ziyaretçiye görünmez):**
- `hd:transit`: sınırlara yakın anlarda Roxy düzeltmesi ister ve ortak gezegen önbelleğine yazar. KM-4'e bırakıldı.
- Katalogda "doğrulama" ve "uygun değil" durumundaki tüm teknikler. Dört Ok / PHS, HD yerel motoru ve Klasik isim karşılaştırması bunlara dahildir.

Owner panelinde her teknik "Ziyaretçi akışına bağlı" ya da "Ziyaretçiye henüz bağlı değil" etiketi taşır. Yayın kontrol listesi bağlı olmayan seçimleri uyarı olarak gösterir.

**Kozmik paketin durumu:** "doğrulama"dan **hazır**a alındı. Gerekçe: altı özellik sunucuda gerçek motorla hesaplanıyor ve testli. Hacamat yalnız tarafsız bilgi gösterir: Hicri gün ve Ay evresi. Kural metni, uygun/yasak gün, sağlık ya da yarar iddiası gösterilmez. Hukuki inceleme sonrası içerik ayrı bir yayın kapısıdır.

## Akış (`lib/campaign/visitor/pipeline.ts`)

1. **Ön kapılar:** Ortam kapısı, yayındaki kampanya ve bağlı teknik denetlenir.
2. **İstek denetimi:**
   - Aynı köken, JSON gövde, en fazla 16 KB.
   - Bal küpü alanı.
   - IP başına 10 dakikada 30 istek (DB hız sınırı).
3. **Girdi doğrulama:** Bilinmeyen alan reddedilir. Takvim, gelecek tarih ve saat biçimi denetlenir. Konum yalnız yerel veri setinden alınır (il, 973 ilçe, dünya; dış API yok). Hata varsa **rezervasyon açılmaz**.
4. **Rezervasyon (`campaign_reserve`, KM-1):**
   - Kampanya ve teknik açık mı.
   - IP ve tarayıcı günlük hakkı (yalnız günlük HMAC özetleri).
   - Teknik ve genel kontenjan ile kredi bütçesi.
   - Aylık kampanya payı ve uzman payı tabanı.
   - Sağlayıcı durumunun tazeliği, dakika sınırı, idempotency.
5. **Çalıştırma:** Her sağlayıcı HTTP isteği `guardedFetch` üzerinden geçer: rezervasyon tavanı ve `campaign_authorize_call` → istek → sonuç kaydı. İzin yoksa istek atılmaz. Yapılandırılmış Roxy kökü dışına istek atılmaz.
6. **Sonuçlandırma (`settle`):**
   - Başarı: `completed`.
   - Sağlayıcıya hiç gidilmeden hata: `aborted_no_call` (hak geri döner).
   - Çağrı sonrası hata: `failed_after_call` (yetkilendirilen kredi harcanmış sayılır).

**Kozmik paket akışı:** İlk istek rezervasyon açar ve 2 saatlik, HMAC imzalı paket belirteci döndürür. Sonraki özellik ve ay geçişleri belirteçle yapılır; belirteç başına 2 saatte 120 istek sınırı vardır. Belirtecin rezervasyonu `completed`, aynı kampanya ve `kozmik:paket` olmalıdır.

## Roxy kredi koruması — gerçek hesap kalanı

Yanıt başlığındaki `X-RateLimit-Remaining` bir **anahtar sayacıdır** ve hesabın gerçek kalanından yüksektir (canlı ölçüm 29.10: başlık 49.629, hesap 27.709). Bu yüzden:

- **Migration `20271229000300`:** Mevcut RPC'ler değişmez; yalnız ekleme yapılır.
  - `campaign_observe_usage`: Yalnız Owner çalıştırabilir. Paneldeki "Gerçek kullanımı doğrula (1 kredi)" düğmesi sağlayıcının `/usage` ucunu **bir kez** okur ve gerçek kalanı kaydeder. Aynı anda fark = başlık − gerçek kalıcı olarak yazılır ve denetim kaydı oluşur.
  - `campaign_observe_header`: Sonraki başlık gözlemleri (kampanya çağrıları ve uzman Klasik Numeroloji defteri) **yalnız geçerli bir fark varken** işlenir: kalan = başlık − fark. Fark aynı UTC ayına ait ve en fazla 7 günlük, gözlem en fazla 10 dakikalık olmalı. Sıra dışı (daha eski) gözlem daha yeni değeri ezmez.
- **Fail-closed kuralları:**
  - Fark yoksa veya bayatsa kalan güncellenmez; durum 15 dakikada bayatlar ve ücretli rezervasyon `saglayici_durumu_bilinmiyor` ile reddedilir.
  - Başlık tek başına **asla** hesap kalanı sayılmaz.
  - Kampanya çağrı kaydına ham başlık kalanı yazılmaz; yalnız plan sınırı yazılır.
- **Uzman payı tabanı** gerçek kalandan hesaplanır. Eşzamanlı istekler testte aşım üretmedi (30 paralel istekte tam izin verilen sayı geçti).

## Gizlilik

- Doğum bilgisi, ad ve yer **yalnız bellekte** işlenir. Kaydedilmez, loglanmaz ve önbelleğe alınmaz; Klasik Numeroloji önbelleği kampanya için kapalıdır.
- Kampanya, uzmanın Klasik Numeroloji sağlayıcı defterine satır yazmaz; defteri yalnız okur.
- Analiz kaydı oluşturulmaz.
- IP ve tarayıcı yalnız günlük dönen HMAC özeti olarak sayılır. `campaign_purge_subjects` bu özetleri 30 gün sonra siler.
- Tarayıcı kimliği çerezi `km_z`: HttpOnly, Secure, SameSite=Lax, 30 gün; içeriği rastgele bir kimliktir.
- Horary soru metni cihazda kalır, sunucuya gönderilmez.
- **Ziyaretçiye hiçbir koşulda gösterilmeyenler:** uzman Bilgi Bankası, uzman ve danışmanlık notları, Atlas uzman notları ve soru kayıtları, Bütüncül Numeroloji uzman bilgi kayıtları, taş önerileri ve stok, Hacamat kural kayıtları ve raporları.
- **Yorumlar:** Sağlayıcı ve kitap metinleri yalnız Owner'ın modül ve teknik anahtarları açıksa ve katalogda yorum kaynağı varsa gösterilir. Kaynağı olmayan tekniğe yorum eklenmez.
- **Rapor:** Yalnız HD Word, Owner "Word raporu"nu açtıysa sunulur. Uzman kaydı içermez; yorum kapalıysa "yorumsuz" seçenekle üretilir.

## Zamanlanmış bakım

`lib/inngest/functions/campaignMaintenance.ts`. Varsayılan kapalıdır; `CAMPAIGN_MAINTENANCE_ENABLED=true` ile açılır. Üç iş yapar:
- 10 dakikada bir: `campaign_expire_stale` (yarım rezervasyonlar harcandı sayılır).
- 10 dakikada bir: uzman Klasik Numeroloji defterinden tazelik senkronu.
- Günde bir: 30 günden eski kimlik özetlerini silme.

## Ortam değişkenleri (production'a Owner girer; bu PR sırları değiştirmez)

| Değişken | Değer | Not |
|---|---|---|
| `CAMPAIGN_PUBLIC_ENABLED` | `true` | **Yayın anahtarı.** Kapalıyken her şey 404. |
| `CAMPAIGN_SUBJECT_SECRET` | ≥ 32 karakter rastgele | IP/tarayıcı özeti ve paket belirteci. Yoksa `RATE_LIMIT_SECRET` kullanılır; ikisi de yoksa fail-closed. |
| `CAMPAIGN_MAINTENANCE_ENABLED` | `true` | Bakım zamanlayıcısı. |
| `ROXY_API_KEY` | mevcut | Ortak sağlayıcı anahtarı (değişmez). |
| `ASTROLOGY_MODULE_ENABLED` | mevcut | Atlas kapalıysa kampanya Atlas teknikleri de çalışmaz. |
| `NUMEROLOGY_CLASSIC_PROVIDER_CALLS` | mevcut | Kapalıysa kampanya Klasik Numeroloji teknikleri de çalışmaz. |

## Testler

| Test | Kapsam | Sonuç |
|---|---|---|
| `scripts/campaign/pg/campaign-visitor.mjs` | 000300, gerçek kalan, fark kuralları, ücretli rezervasyonun gözleme bağlılığı, uzman payı, 30 eşzamanlı istek, yetki | 29 |
| `scripts/campaign/visitor-runners.test.ts` | 22 çalıştırıcı, gerçek motor çıktıları, yorum açık/kapalı, Hacamat tarafsızlığı, kota koruyucusu, izinsiz adres, gizlilik | 56 |
| `scripts/campaign/visitor-api.test.ts` | Uçlar, kapılar, mesajlar, `settle`, çerez, paket belirteci, durum, konum | 46 |
| `scripts/campaign/visitor-ui-e2e.ts` | Playwright + `next start` + geçici PG + yerel HTTPS sahte Roxy; masaüstü, mobil, Android, Owner önizleme | yerel |

## Ana sayfa entegrasyonu (Owner adımı)

`app/page.tsx` başka bir oturumun (Kişisel Ofis) sık değiştirdiği bir dosyadır. Çakışmayı önlemek için bu PR ana sayfaya dokunmaz. Kampanya reklam bağlantıları `/ucretsiz-analiz` adresine gider.

Ana sayfaya kampanya bölümü, Owner onayından sonra iki satırlık ayrı bir değişiklikle eklenecek: `VisitorCampaignView` bölümü + `/api/kampanya/durum`.
