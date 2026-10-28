# Klasik Numeroloji — Kişisel Veri Saklama ve Temizlik

Durum: geliştirme (branch `work/numeroloji-merkezi-roxy`). Production'da KAPALI (`NUMEROLOGY_CLASSIC_ENABLED`).
Bu belge gizli bilgi içermez.

## 1. Hangi kişisel veri nerede

| Tablo | İçerik (kişisel veri) | Tenant | Silme | Yedek (lib/backup/registry.ts) |
|---|---|---|---|---|
| `numerology_classic_analyses` | ad-soyad, doğum tarihi, hedef tarih (`input`); hesap sonucu (`result`); başlık; isteğe bağlı danışan bağı (`client_id`) | evet | yumuşak (`deleted_at`) → temizlikte kalıcı | `backup` (danışan bağı isteğe bağlı) |
| `numerology_comparative_notes` | uzman not metni (`body`); iki kaynağın kompakt anlık görüntüsü (`snapshot`: sayılar, taş adları, özetler); danışan / mevcut kayıt / klasik analiz bağları | evet | yumuşak (`deleted_at`) → temizlikte kalıcı | `backup` (danışan + klasik analiz bağı isteğe bağlı) |
| `numerology_classic_response_cache` | sağlayıcı yanıtının normalize hâli (ad yankısı ve sayı anlamları dahil). Anahtar HMAC özetidir (ham ad/doğum tarihi anahtarda yok) | evet | `expires_at` dolunca okunmaz → temizlikte kalıcı | yedek DIŞI (`derived`) |
| `numerology_classic_provider_calls` | çağrı defteri: tenant, kullanıcı kimliği, uç, HTTP durumu, kalan kota. Ad / doğum tarihi / anahtar YOK | evet | otomatik temizlik YOK (owner kararı) | yedek DIŞI (`system`) |
| `numerology_classic_catalog` | sabit anlam metinleri — kişisel veri YOK | hayır | — | yedek DIŞI (`global`) |

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

`lib/numeroloji-klasik/server/retention.ts` → `purgeClassicPersonalData(db, { now, softDeletedGraceDays = 30, cacheTtlDays? })`

- service-role istemcisiyle, **tüm tenant'lar** için çalışır; sayıları döner
  (`cacheDeleted`, `notesDeleted`, `notesScrubbed`, `analysesDeleted`).
- Siler: süresi geçmiş önbellek satırları; grace günden önce yumuşak silinmiş notlar ve analizler.
- İdempotent: tekrar çalıştırmak güvenlidir. Hata olursa `{ ok:false, step }` döner (o ana kadarki sayılarla).
- Bir çalıştırmada en çok ~1000 silinmiş analiz işlenir (PostgREST satır sınırı); kalan sonraki çalıştırmada temizlenir.
- **Zamanlanmış değil.** Hiçbir cron / Inngest işi bu fonksiyonu çağırmaz.

## 6. Owner kararı gereken konular

1. Temizliğin zamanlaması (ör. günlük cron / Inngest; hangi saat; hata bildirimi).
2. Önbellek süresi (`NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS`, varsayılan 90 gün) — KVKK saklama politikasıyla uyumu.
3. Yumuşak silme sonrası bekleme süresi (`softDeletedGraceDays`, varsayılan 30 gün).
4. Çağrı defteri (`numerology_classic_provider_calls`) için saklama süresi (şu an otomatik temizlik yok).
5. Production'da ayrı `NUMEROLOGY_CLASSIC_CACHE_SECRET` tanımlanıp tanımlanmayacağı.
6. Yedek kapsamı: analizler + notlar uzman yedeğine giriyor (registry `backup`); önbellek / defter / katalog girmiyor.
