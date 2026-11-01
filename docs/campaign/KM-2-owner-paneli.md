# Kampanya Merkezi — KM-2 Owner Paneli

Bu belge, gerçek Owner yönetim ekranını anlatır: `/admin/kampanya-merkezi`.

- **Tasarım kaynağı:** KM-P0 v2 görsel PASS prototipi (`C:/YasamSistemi-Gorsel-Tasarim/kampanya-merkezi`). Prototip değiştirilmedi.
- **Bağımlılık:** KM-1 (PR #672: tablolar + kota RPC'leri). Bu panel ücretsiz analizi ziyaretçiye **açmaz**. Public uç, sağlayıcı çağrısı ve ziyaretçi sayfası KM-3'ün işidir.

## Erişim

| Katman | Kural |
|---|---|
| `app/admin/layout.tsx` | Admin menüsünde "Kampanya Merkezi" bağlantısı yalnız katı Owner'a sunucuda render edilir. |
| `app/admin/kampanya-merkezi/layout.tsx` | Admin oturumu + katı Owner gerekir. Owner değilse `notFound()`: sayfa HTML'i ve istemci paketi gönderilmez. |
| `lib/campaign/ownerApi.ts` | `verifyAdminRequest` + katı Owner. Owner olmayan her istek aynı 404 gövdesini alır. Yazmalarda aynı köken, JSON ve ≤ 64 KB şartı vardır. |
| DB RPC'leri | `p_actor` her çağrıda yeniden doğrulanır (42501). Yalnız `service_role` çalıştırabilir. |

**Katı Owner tanımı:** `users.is_super_admin` + `role=admin` + `active` + demo değil. E-posta ile yedek eşleşme yoktur.

`actorId` yalnız doğrulanmış admin kimliğinden gelir; istemci gövdesinden asla alınmaz.

## API — `GET|POST /api/admin/kampanya-merkezi`

İşleyiciler `lib/campaign/ownerHandlers.ts` dosyasındadır; testler bunları `deps` ile çağırır.

### GET

- Parametresiz: genel bakış ve sunucu kataloğunu döndürür.
  - İçerik: ayar, kampanyalar, teknik satırları, bugünkü sayaçlar, şablonlar, sağlayıcı durumu.
  - Kişisel veri ve kimlik özeti döndürülmez.
- `?istatistik=7|30|90`: o dönemin günlük sayaçlarını ve Owner durum değişikliklerini döndürür.

### POST eylemleri

Her eylem `{ action, ... }` biçiminde gönderilir:

- `create`
- `save`
- `setStatus`
- `setTechniques`
- `duplicate`
- `archive`
- `updateSettings`
- `saveTemplate`
- `archiveTemplate`

### Doğrulama

- **Alan izin listesi:** Bilinmeyen alan 400 döner. `status`, `created_by` ve `archived_at` ile toplu atama yapılamaz.
- **Teknik kuralları** (`buildTechniqueRows`):
  - CTA ve görsel izin listesi uygulanır.
  - Katalogda olmayan veya "uygun değil" durumundaki teknik reddedilir.
  - PHS ayrı onay ister.
  - Yorum kaynağı olmayan teknikte yorum açılamaz.
  - 0 kredili teknikte bütçe her zaman 0 olur. Analiz başına kredi istemciden değil katalogdan gelir.
- **Silme:** Kampanya adı birebir yazılmalıdır. Bu kural sunucuda da denetlenir. Yalnız Kapalı kampanya arşivlenir; sayaç ve denetim kayıtları korunur.

### Hata yanıtları

| Durum | Yanıt |
|---|---|
| Sürüm çakışması, tek yayındaki kampanya çakışması | 409 |
| DB hatası | 500 ve genel mesaj. İç hata metni yanıta sızmaz; yalnız kısa güvenli belirteç döner. |

## Migration — `20271229000200_campaign_center_admin_ui.sql`

| Nesne | İşlev |
|---|---|
| `campaigns.create_request_id uuid` + kısmi tekil indeks | Çift gönderim veya ağ tekrarı ikinci kampanya oluşturmaz. |
| `campaign_admin_create` | İdempotent oluşturma. Danışma kilidi + istek kimliği kullanır; tekrar `replay=true` döner. |
| `campaign_admin_duplicate` | Kampanya ve teknik satırlarını tek işlemde Kapalı taslak olarak kopyalar. Bitmiş tarihli kampanyanın kopyası tarihsiz olur. |

- Desen KM-1 ile aynıdır: SECURITY DEFINER, sabit `search_path`, `REVOKE PUBLIC/anon/authenticated`, yalnız `service_role`.
- DROP, TRUNCATE ve DELETE yoktur; migration idempotenttir.
- `service_role`'ün `campaigns` üzerindeki yetkisi değişmez (yalnız SELECT).
- `expected-manifest.json` iki yeni fonksiyonu içerir.
- `schema.generated.ts` içinde yalnız `campaigns` satırı güncellendi.

## Panel (5 sekme)

### 1. Kampanya

- Ad, durum (Kapalı / Yakında / Aktif), tarihli veya tarihsiz yayın (Türkiye saati).
- Etkin durum, sunucu saatine göre hesaplanır.
- Yayın kontrol listesi ve açık analiz özeti.
- Silme koruması.

### 2. Reklam İçeriği

- Slogan, alt slogan, açıklama ve olumlama alanları.
- Düğme metni ve güvenli hedef.
- Onaylı görsel seçimi. Yükleme yoktur; ayrı depolama kararı gerekir.
- Owner kütüphanesi (kaydet / kullan / sil) ve 10 hazır slogan.

### 3. Analizler ve Yorumlar

- Modül → teknik listesi sunucu kataloğundan gelir.
- Arama, grup filtresi, toplu açma/kapama (PHS hariç) ve uygunluk matrisi.
- Modül ve teknik yorum anahtarları.
- "Hiçbir koşulda açılmaz" listesi ve rapor kapsamı.
- HD için Word raporu ve Bilgi Bankası tanıtım anahtarları.

### 4. Kota ve Maliyet

- Acil durdurma.
- Ortak günlük kredi ve analiz sınırı.
- Aylık sağlayıcı kotası. Boş bırakılırsa kredi harcayan teknikler fail-closed kalır.
- Uzman payı, uyuşmazlık toleransı, dakika sınırı.
- Sağlayıcı gözlemi.
- Bugünkü gerçek teknik sayaçları. Limit düşürüldüğünde kullanım korunur ve uyarı gösterilir.

### 5. İstatistikler

- Gerçek sayaçlar: tamamlanan analiz, harcanan ve rezerve kredi.
- 7 / 30 / 90 gün görünümleri.
- Açık/kapalı dönem karşılaştırması; açık gün, Owner durum kayıtlarından hesaplanır.
- Teknik tablosu.
- Ziyaret, tekil ziyaretçi, rapor indirme, üyelik tıklaması, dönüşüm ve kaynak için **"Veri henüz toplanmıyor"** yazılır. DEMO veya örnek sayı gösterilmez.

### Ortak davranışlar

- Sağ sütunda canlı ziyaretçi önizlemesi gösterilir (masaüstü/telefon ve durum seçimi). Etkileşimsizdir ve kaydedilmemiş taslaktan çizilir.
- Kaydedilmemiş değişiklik göstergesi, kampanya değişiminde uyarı ve `beforeunload` koruması vardır.
- Oluştur/kopyala istekleri istek kimliği taşır. Meşgulken düğmeler kilitlenir.

## Testler

| Test | Kapsam | Sonuç |
|---|---|---|
| `scripts/campaign/pg/campaign-admin.mjs` | 3 migration 2×; 20 eşzamanlı aynı-istek oluşturma → 1 kayıt; atomik kopya; yetki; production ön/son kontrol SQL'leri | 43 |
| `scripts/campaign/owner-api.test.ts` | Owner olmayan 404, köken, 413/415/400, izin listesi, katalog zorlaması, 409/500 | 62 |
| `scripts/campaign/catalog-ui.test.ts` | Açıklama ↔ katalog eşliği, görsel izin listesi ve dosya varlığı, metin sınırları | 12 |
| `scripts/campaign/owner-ui-e2e.ts` | Playwright + `next start` + geçici PG; 1440/1366/1920/390/320 | — |

`owner-ui-e2e.ts` CI listesinde değildir, çünkü build gerektirir.

## Birleştirme sırası

Production adımları ve salt okunur ön/son kontrol SQL'leri: `docs/campaign/uretim/URETIM-UYGULAMA-PLANI.md`.

1. **PR #672 (KM-1)** önce birleştirilir. Production migration'ları `20271229000000` ve `20271229000100` ayrı Owner onayıyla uygulanır.
2. **KM-2 PR'ı:** taban dal `work/km1-kampanya-altyapi` olarak açıldı (yığılmış PR).
   - #672 birleşince taban `main` olarak değiştirilir.
   - Migration `20271229000200` ayrı Owner onayıyla uygulanır.
   - KM-1 migration'ları olmadan uygulanamaz.
3. Production'da migration olmadan panel API'si `db_error` (fail-closed) döner. Owner menü bağlantısı görünür, ancak panel "yüklenemedi" der. Veri sızıntısı veya yazma olmaz.
