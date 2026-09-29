# Usage360 AŞAMA 2B — Modül Enstrümantasyon Sözleşmesi

Bu belge, modül route'larına Usage360 iş olayı eklerken uyulacak BAĞLAYICI kurallardır.
Kanonik çekirdek: `lib/usage/trackUsage.ts` (tek sunucu yardımcısı), `lib/usage/usageTaxonomy.ts`
(eylem + alt-varlık sözlüğü), `lib/usage/usageBeaconClient.ts` (tek istemci yolu).
Kapsam doğrulama: `npx tsx scripts/usage360/coverage-harness.ts`.

## 1. Sunucu başarı olayı

```ts
import { trackUsage } from "@/lib/usage/trackUsage";
// … iş işlemi BAŞARILI olduktan SONRA, başarı yanıtını döndürmeden hemen önce:
await trackUsage(guard, req, { module: "stones", action: "record_created", subEntity: "stone", resourceId: newId });
```

- `guard`: route'un `requireModuleAccess` / `verifyUserRequest` sonucu (tam nesne). Kimlik
  YALNIZ buradan gelir; istemci gövdesinden user/tenant ALINMAZ.
- `req`: handler'ın request parametresi.
- `module` ve `action` **string literal** olmalı (harness doğrular). `subEntity` literal olmalı;
  gerçekten dinamikse (ör. biyoenerji `[resource]`) sabit bir eşleme nesnesinden gelir ve manifestte
  `subEntities` listesi verilir.
- `resourceId`: etkilenen kaydın id'si (string). Yalnız idempotency için HMAC'lanır; ham saklanmaz.
- Toplu işlem → **tek** olay + `itemCount: n`. Asla N olay yok.
- Tek kullanıcı eylemi = tek olay (bir route birden çok alt tabloya yazsa bile).
- Olay, iş hatası (DB error) dalında YAZILMAZ; dedup/no-op dallarında (değişiklik yok) YAZILMAZ.

## 2. Eylem semantiği (HTTP metodundan TÜRETİLMEZ)

| Durum | action |
|---|---|
| Yeni kayıt | `record_created` |
| Var olanı değiştirme (sıralama, bağlama, kopyalama-hedefine yazma dahil) | `record_updated` |
| Silme (gerçek silme; toplu silme tek olay + itemCount) | `record_deleted` |
| Hesaplama/analiz çalıştırma (numeroloji analizi, HD compute) | `analysis_run` |
| Sunucuda Word/PDF üretimi (dosya BAŞARIYLA üretildikten sonra) | `report_generated` |
| Yükleme tamamlandı (finalize / sunucu multipart başarı) | `file_uploaded` |
| AI işi tamamlandı | `ai_task_completed` |

Kopya ile YENİ kayıt oluşuyorsa `record_created`. Upsert'te gerçek yol biliniyorsa ona göre;
bilinmiyorsa `record_updated`. Rapor konusu `subEntity` ile verilir (ör. seans raporu → `session`).

**Muaf (olay yok, manifestte `exempt` + gerekçe):** okuma/arama/sayma POST'ları, signed-URL,
upload `prepare`, onay/challenge token uçları, yönetici-özel uçlar, kullanıcı kimliği olmayan
(tenant-only auth) uçlar, admin-only modüller (video_ceviri, ders_notu, belge_ceviri_ai),
arka plan senkronu/seed.

## 3. Alt-varlık (sub_entity) — YALNIZ bu allowlist

`lib/usage/usageTaxonomy.ts` → `USAGE_SUB_ENTITIES`. Listede olmayan değer KULLANILMAZ
(gerekirse ajan raporunda öner; taksonomi dosyasını değiştirme).

## 4. Hata telemetrisi

- Ana DB iş hatası (500) `serverErrorResponse` / `logServerError` ile dönüyorsa bağlama ekle:
  `serverErrorResponse({ route, action, tenantId, cause, usage: { guard, req, module: "stones", failedAction: "record_created", subEntity: "stone" } })`
- 500'ü düz `NextResponse.json(...)` ile dönüyorsa, dönmeden önce:
  `await trackUsage(guard, req, { module: "stones", action: "action_failed", failedAction: "record_created", subEntity: "stone", errorClass: "server" });`
- 409 çakışma dalında `errorClass: "conflict"`. 400/401/403/404/429 için hata olayı YOK.
- Hata olayına mesaj, cause, id, gövde ASLA geçmez (sözleşme buna izin vermez).
- Manifestte `"failure": "server"` veya `"conflict"`.

## 5. Tarayıcıda üretilen dışa aktarım

```ts
import { reportUsageExport, reportUsageClientFailure } from "@/lib/usage/usageBeaconClient";
reportUsageExport("clients", "analysis");                         // başarılı indirme/yazdırma SONRASI
reportUsageClientFailure("clients", "client_export", "report_exported", "analysis"); // catch içinde
```
Yalnız kullanıcı dışa aktarımı başlattığında; render'da değil. Argümanlar literal.

## 6. Manifest — `scripts/usage360/route-events/<module>.json`

```json
{
  "module": "stones",
  "handlers": [
    { "route": "dogaltas/stones", "method": "POST", "events": [{ "action": "record_created", "subEntity": "stone" }], "failure": "server" },
    { "route": "dogaltas/stones/bulk-delete", "method": "POST", "events": [{ "action": "record_deleted", "subEntity": "stone" }], "note": "tek olay + itemCount" },
    { "route": "dogaltas/stones/photos/signed-urls", "method": "POST", "exempt": "okuma: imzalı görüntüleme URL'i üretir" }
  ]
}
```
`route` = `app/api/` sonrası yol, `/route.ts` hariç. Modül prefix'i altındaki HER GET-dışı handler
ve her rapor/indirme GET'i listelenir. Fabrika ile üretilen handler'larda `implFile` alanı
olayların bulunduğu lib dosyasını gösterir.

## 7. Yasaklar

- Guard/auth/tenant/demo mantığını zayıflatma veya değiştirme; iş davranışını değiştirme.
- `lib/usage/*`, `lib/http/apiError.ts`, harness'ler, migration'lar ve başka modül dosyaları
  DEĞİŞTİRİLMEZ. Git komutu (add/commit/stash/checkout/reset) YOK.
- Telemetriye ad, başlık, not, serbest metin, dosya adı/boyutu, hata mesajı, URL GİRMEZ.
- Eski `recordUsageEvent` doğrudan çağrılmaz; mevcut 4 `trackUsage` çağrısı korunur, çoğaltılmaz.
