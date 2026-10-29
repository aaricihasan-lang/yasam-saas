# Klasik Numeroloji — Kişisel Veri Saklama ve Temizlik

Durum: geliştirme (branch `work/numeroloji-merkezi-roxy`). Production'da KAPALI (`NUMEROLOGY_CLASSIC_ENABLED`).
Bu belge gizli bilgi içermez.

## 1. Hangi kişisel veri nerede

| Tablo | İçerik (kişisel veri) | Tenant | Silme | Yedek (lib/backup/registry.ts) |
|---|---|---|---|---|
| `numerology_classic_analyses` | ad-soyad, doğum tarihi, hedef tarih (`input`); hesap sonucu (`result`); başlık; isteğe bağlı danışan bağı (`client_id`) | evet | yumuşak (`deleted_at`) → temizlikte kalıcı | `backup` (danışan bağı isteğe bağlı) |
| `numerology_comparative_notes` | uzman not metni (`body`); iki kaynağın kompakt anlık görüntüsü (`snapshot`: sayılar, taş adları, özetler); danışan / mevcut kayıt / klasik analiz bağları | evet | yumuşak (`deleted_at`) → temizlikte kalıcı | `backup` (danışan + klasik analiz bağı isteğe bağlı) |
| `numerology_classic_response_cache` | sağlayıcı yanıtının normalize hâli (ad yankısı ve sayı anlamları dahil). Anahtar HMAC özetidir (ham ad/doğum tarihi anahtarda yok) | evet | `expires_at` dolunca okunmaz → temizlikte kalıcı | yedek DIŞI (`derived`) |
| `numerology_classic_provider_calls` | çağrı defteri: tenant, kullanıcı kimliği, uç, HTTP durumu, kalan kota. Ad / doğum tarihi / anahtar YOK | evet | otomatik temizlik YOK (öneri: 13 ay — owner kararı) | yedek DIŞI (`system`) |
| `numerology_classic_catalog` | sabit anlam metinleri — kişisel veri YOK | hayır | — | yedek DIŞI (`global`) |
| `numerology_classic_purge_log` | temizlik denetim kaydı: çalıştıran, parametreler, sayılar, silinen satır kimlikleri — kişisel veri YOK | kapsam alanı | silme yetkisi yok (yalnız ekleme/güncelleme) | yedek DIŞI (`system`) |

Sağlayıcıya giden veri: ad-soyad + doğum günü/ay/yıl (+ hedef tarih). Ham sağlayıcı yanıtı veritabanına YAZILMAZ.

## 2. Önbellek süresi (TTL)

- Her önbellek satırı yazılırken `expires_at = yazım anı + NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS` gün.
- Varsayılan **90 gün**; değer 1–365 aralığına sıkıştırılır; tamsayı değilse varsayılan kullanılır.
- Süresi geçen satır **okunmaz** (yeni hesap yapılır ve satır yeni yanıtla yenilenir).
- `expires_at` boş eski satırlar (bu değişiklikten önce yazılmış olanlar): `created_at + TTL` ile değerlendirilir.
- **Önemli:** bir analizi yumuşak silmek önbelleği SİLMEZ. Aynı kişinin normalize yanıtı TTL dolana kadar
  (veya temizlik çalışana kadar) önbellekte kalır. Önbellek satırı analize bağlı değildir (aynı girdiyle
  başka analizler de onu kullanabilir).

## 3. Önbellek anahtarı sırrı (ortam değişkenleri)

| Durum | Davranış |
|---|---|
| `NUMEROLOGY_CLASSIC_CACHE_SECRET` var | HMAC-SHA256 anahtarı bu sırdan (`numk-cache:v1:` etiketli) |
| yalnız `SUPABASE_SERVICE_ROLE_KEY` var | HMAC-SHA256 anahtarı service-role anahtarından, aynı alan ayırma etiketiyle |
| ikisi de yok + `NODE_ENV=test` | düz SHA-256 (yalnız yerel test) |
| ikisi de yok + diğer her ortam | **önbellek KAPALI**: okuma/yazma yok, süreç başına bir kez log; tek-uçuş/kilit anahtarı süreç içi rastgele sırla (düz özet veritabanına gitmez) |

Önerilen: production'da ayrı bir `NUMEROLOGY_CLASSIC_CACHE_SECRET` tanımlamak (service-role anahtarı döndürülürse
önbellek kendiliğinden geçersiz olur; bu bir güvenlik sorunu değildir, yalnız ek sağlayıcı çağrısıdır).

## 4. Silinmiş analize bağlı notlar

- Analiz yumuşak silinince, ona bağlı notların listesi / görünümü / PATCH yanıtı:
  `classicId: null`, `classicDeleted: true`, anlık görüntüden klasik taraf çıkarılmış hâlde döner
  (mevcut Numeroloji tarafı + not metni korunur). Veritabanındaki bağ ve anlık görüntü grace süresi boyunca
  değişmez (geri alma / denetim için).
- Kalıcı temizlikte (aşağıda) önce bu notların anlık görüntüsünden klasik taraf veritabanında da çıkarılır
  (`classicDeleted: true` işareti), sonra analiz kalıcı silinir (FK `ON DELETE SET NULL` bağı boşaltır).

## 5. Temizlik fonksiyonu

`lib/numeroloji-klasik/server/retention.ts` → `purgeClassicPersonalData(db, { now, softDeletedGraceDays = 30, cacheTtlDays?, dryRun?, tenantId?, actor? })`

- Siler: süresi geçmiş **önbellek** satırları; grace günden önce **yumuşak silinmiş** notlar ve analizler
  (önce bağlı notların anlık görüntüsünden klasik taraf çıkarılır).
- **Asla silmez:** uzmanın kaydettiği aktif (silinmemiş) analiz ve notlar — yaşı ne olursa olsun (önbellek süresinin
  dolması ≠ kayıt silme). Sağlayıcı çağrı defteri bu fonksiyonda değişmez.
- `dryRun: true` → yalnız aday sayıları ve kimlikleri; hiçbir satır silinmez/değişmez.
- `tenantId` → yalnız o tenant; diğer tenant'lar okunmaz/silinmez. Sonuçta `byTenant` sayıları.
- **Geri izlenebilirlik:** her çalıştırma silmeden ÖNCE `numerology_classic_purge_log` tablosuna yazılır (çalıştıran,
  kuru mu, kapsam, parametreler); bitişte sayılar, tenant bazında sayılar ve silinen satır kimlikleri (kişisel veri
  değil; tablo başına en çok 2000) işlenir. Kayıt yazılamazsa **hiçbir şey silinmez** (fail-closed). Denetim kaydına
  service_role yalnız SELECT/INSERT/UPDATE yetkisine sahiptir (silme yetkisi yok).
- İdempotent; hata → `{ ok:false, step }` (o ana kadarki sayılarla; denetim kaydında `ok=false` + adım).
- **Zamanlanmış değil.** Hiçbir cron / Inngest işi bu fonksiyonu çağırmaz (owner kararı bekleniyor).
- Testler: `scripts/numeroloji-klasik/server/routes.harness.ts` (SEC-01 + NK-R5 bölümü; gerçek PG).

## 6. Önerilen saklama politikası (NK-R5 — owner onayı bekliyor)

| Veri | Öneri | Gerekçe |
|---|---|---|
| Önbellek (`response_cache`) | 90 gün TTL (mevcut varsayılan), süresi dolanı günlük temizlik | Türetilmiş veri; yeniden üretilebilir; ad/doğum yankısı taşır |
| Kayıtlı analiz (aktif) | **Otomatik silme YOK**; yalnız uzman siler veya danışan/hesap silme akışı | Uzmanın bilerek kaydettiği iş kaydı |
| Yumuşak silinmiş analiz | 30 gün geri alma süresi, sonra kalıcı silme | Yanlışlıkla silmeye karşı pencere + veri minimizasyonu |
| Karşılaştırma notu (aktif) | Otomatik silme YOK; bağlı analiz kalıcı silinince yalnız klasik taraf anlık görüntüden çıkarılır | Uzman notu korunur |
| Yumuşak silinmiş not | 30 gün, sonra kalıcı silme | Aynı |
| Sağlayıcı defteri (`provider_calls`) | 13 ay sakla (yıllık kullanım/kota denetimi), sonra **sil** (kişisel veri yok; yalnız kullanıcı kimliği) — ayrı onaylı adım | Kota/maliyet denetimi |
| Temizlik denetim kaydı (`purge_log`) | 24 ay | KVKK silme yükümlülüğünün kanıtı |

Önerilen işletim: önce production'da **yalnız `dryRun`** ile 2 hafta günlük rapor (denetim kaydından okunur), sonra
owner onayıyla gerçek temizlik (günlük, düşük trafik saati, tek instance; hata → owner bildirimi). Hesap/danışan
kalıcı silme akışları (mevcut purge/cascade) Klasik tabloları da kapsamalı — bu ayrı bir onaylı iş kalemidir.

## 7. Owner kararı gereken konular

1. Temizliğin zamanlaması (ör. günlük cron / Inngest; hangi saat; hata bildirimi) ve önce kuru çalıştırma dönemi.
2. Önbellek süresi (`NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS`, varsayılan 90 gün) — KVKK saklama politikasıyla uyumu.
3. Yumuşak silme sonrası bekleme süresi (`softDeletedGraceDays`, varsayılan 30 gün).
4. Çağrı defteri (`numerology_classic_provider_calls`) ve denetim kaydı saklama süreleri.
5. Production'da ayrı `NUMEROLOGY_CLASSIC_CACHE_SECRET` tanımlanıp tanımlanmayacağı.
6. Yedek kapsamı: analizler + notlar uzman yedeğine giriyor (registry `backup`); önbellek / defter / katalog girmiyor.
7. Hesap / danışan kalıcı silme akışlarına Klasik tabloların eklenmesi.
