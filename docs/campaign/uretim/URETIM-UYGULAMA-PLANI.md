# Kampanya Merkezi — Production Uygulama Planı (KM-1 + KM-2)

> **Bu belge plandır; hiçbir adım uygulanmadı.** Her adım ayrı Owner onayı ister.
> Bu planda tablo silinmez, mevcut kayıt değiştirilmez, sağlayıcı (Roxy) çağrısı yapılmaz ve ücretsiz kampanya açılmaz.

## 0. Uygulanacak migration'lar (sıra zorunlu)

| Sıra | Dosya | PR | Ne yapar |
|---|---|---|---|
| 1 | `20271229000000_campaign_center_core.sql` | #672 | 10 yeni tablo oluşturur: ayar, kampanya, teknik, şablon, sayaç, kimlik sayacı, rezervasyon, sağlayıcı çağrısı, sağlayıcı durumu, denetim. Owner yardımcısını ve tek ayar satırını (bütçe 0) ekler. |
| 2 | `20271229000100_campaign_center_quota_rpc.sql` | #672 | Atomik kota RPC'lerini ve Owner RPC'lerini ekler. Yalnız `service_role` çalıştırabilir. |
| 3 | `20271229000200_campaign_center_admin_ui.sql` | #676 | `campaigns.create_request_id` kolonunu, idempotent oluşturma ve atomik kopyalama RPC'lerini ekler. |

- **Numara notu:** İlk numaralar `20271228…` idi. main'deki #671 `20271228000000_expert_workspace_assets_access.sql` ile çakıştığı için `20271229…` olarak değiştirildi. SQL komutları değişmedi; yalnız başlık yorumları güncellendi.
- **#671 ile ilişki:** #671'in migration'ı ayrı bir iştir. Kampanya migration'ları ona bağımlı değildir ve onun nesnelerine dokunmaz. #671 daha önce uygulanmışsa veya henüz uygulanmamışsa, her iki durumda da sıra `…28000000 → …29000000` olarak kalır.
- **Bağımlılık:** Üç dosya da yalnız `public.users` (okuma) ve Supabase rollerine dayanır. Tenant, danışan veya uzman tablolarına referans yoktur.

## 1. Ön koşullar

1. #672 main'e birleştirilmiş olmalı.
   - Kod yayına çıkınca etkisi yoktur: public uç yok, panel route'u yalnız Owner'a açık.
   - Migration uygulanmadan panel "yüklenemedi" der (fail-closed).
2. Tablolar ilk kez oluşturulduğu için Altın Yedek kuralı Owner kararıdır. Bu plan yedek almaz.
3. Production defterini salt okunur kontrol edin:

   ```sql
   SELECT version, name FROM supabase_migrations.schema_migrations
    WHERE version LIKE '2027122%' ORDER BY version;
   ```

   - **Beklenen:** `20271229…` kaydı **yok**.
   - Bu projede migration'lar SQL Editor ile elle uygulandığı için defter eksik olabilir. Asıl kanıt 2. adımdaki katalog kontrolüdür.

## 2. Ön kontrol (salt okunur)

- `docs/campaign/uretim/01-onkontrol.sql` dosyasını SQL Editor'da çalıştırın.
- **Beklenen:** 5 satırın tamamı `ok = true`.
  - Kontroller: owner kolonları, roller, `Europe/Istanbul` saat dilimi, campaign* tablo yok, campaign* fonksiyon yok.
- Herhangi bir satır `false` ise **DURUN**. Örneğin campaign* nesnesi zaten varsa bu, yarım veya eski bir uygulama demektir; Owner'a raporlayın.

> Bu SQL yerel testte doğrulandı (`scripts/campaign/pg/campaign-admin.mjs`):
> - **U01:** migration öncesinde tüm satırlar true.
> - **U03:** uygulama sonrasında "zaten var" iki satırı false olur.

## 3. Kuru çalıştırma (canlıda, geri alınır)

```sql
BEGIN;
-- 20271229000000 … 20271229000200 dosyalarının İÇERİĞİ (her dosyadaki kendi BEGIN/COMMIT satırları HARİÇ)
-- ardından 02-sonkontrol.sql
ROLLBACK;
```

- Son kontrolün 11 satırı da `true` olmalı. `ROLLBACK` sonrasında 01 ön kontrol yeniden çalıştırılır ve yine 5/5 `true` olmalıdır (iz bırakmadığının kanıtı).
- Dosyaların sonundaki `NOTIFY pgrst, 'reload schema';` satırı, işlem geri alınınca etkisizdir.

## 4. Uygulama

1. Üç dosyayı **0 → 100 → 200 sırasıyla**, her biri kendi `BEGIN … COMMIT` işleminde, SQL Editor'da uygulayın.
   - 100 numaralı dosya, 0 numaralının tablolarını gerektirir.
   - 200 numaralı dosya, 100 numaralının `campaign_admin_save` ve `campaign__audit` fonksiyonlarını gerektirir.
2. Her dosyadan sonra hata yoksa sonraki dosyaya geçin.
3. Bir dosya hata verirse o dosyanın işlemi kendiliğinden geri alınır. Önceki dosyalar idempotenttir: `IF NOT EXISTS` / `CREATE OR REPLACE` kullanır, `DROP` yoktur. Sorun giderildikten sonra aynı dosya yeniden çalıştırılabilir. Yerel testte iki kez uygulama doğrulandı.
4. İsteğe bağlı: defter kaydı (`supabase_migrations.schema_migrations`). Projenin mevcut uygulama alışkanlığına göre Owner karar verir.

## 5. Son kontrol (salt okunur)

`docs/campaign/uretim/02-sonkontrol.sql` dosyasını çalıştırın. **Beklenen:** 11 satırın tamamı `ok = true`.

| Kontrol | Beklenen |
|---|---|
| Kampanya tabloları | 10 tablo; RLS açık, politika 0 |
| `anon` / `authenticated` | Hiçbir tabloya ve fonksiyona erişemez |
| `service_role` | Tablolarda yalnız SELECT; 16 RPC'yi çalıştırabilir |
| RPC'ler | SECURITY DEFINER + sabit `search_path` |
| İndeksler | Tek yayındaki kampanya indeksi ve istek kimliği indeksi var |
| Ayar satırı | Tek satır, fail-closed: bütçe 0, aylık kota boş |
| Kampanya kaydı | Yok |

Ardından:

- `drift:compare` / manifest denetimi çalıştırılır. Yeni nesneler `supabase/expected-manifest.json` içinde kayıtlıdır.
- PG17 (production) ile PG18 (prova) arasındaki NOT NULL katalog farkı, postflight sırasında normalleştirilir.

## 6. Uygulama sonrası durum

- **Kampanya kapalı kalır.** Kampanya kaydı yoktur, ortak bütçe 0, aylık sağlayıcı kotası boştur. Bu ayarlarla kredi harcayan hiçbir analiz kabul edilmez.
- **Ziyaretçiye hiçbir şey görünmez.** Public analiz ucu ve ziyaretçi sayfası bu PR'larda yoktur (KM-3).
- **Panel açılır.** `/admin/kampanya-merkezi` yalnız Owner'a görünür; taslak kampanya hazırlanabilir. "Aktif" durumu kaydedilir, ancak KM-3 olmadan ziyaretçiye ücretsiz analiz açmaz.
- **Ortam değişkeni gerekmez.** `CAMPAIGN_SUBJECT_SECRET` (≥ 32 karakter) KM-3'te ziyaretçi akışı açılırken gerekir. Yoksa sistem fail-closed kalır.

## 7. Geri dönüş

- **Anında:** `campaign_settings.kill_switch = true` yapın (Owner panelindeki "Acil durdurma") veya kampanyayı Kapalı'ya alın.
- **Kod:** İlgili PR'ın geri alınması yeterlidir. Tablolar boş kalır ve zarar vermez.
- **Veri silen geri alma migration'ı yoktur** (DROP / TRUNCATE yok). Tabloların kaldırılması gerekirse bu ayrı, Owner onaylı ve yedekli bir migration ile yapılır.

## 8. Doğrulama kanıtı (yerel, sentetik)

| Test | Sonuç |
|---|---|
| `scripts/campaign/pg/campaign-quota.mjs` (KM-1) | 150 PASS |
| `scripts/campaign/pg/campaign-admin.mjs` (KM-2 + bu belgedeki ön/son kontrol SQL'leri) | 43 PASS |
| Owner API | 62 PASS |
| Servisler | 48 PASS |
| Katalog eşliği | 26 + 12 PASS |
| Playwright Owner paneli (1440 / 1366 / 1920 / 390 / 320) | 118 PASS |

## KM-3 eki — `20271229000300_campaign_provider_usage_gap.sql` (PR: KM-3)

> KM-1 ve KM-2'nin üç migration'ı production'a uygulandı (01.11.2026, defter 150). Bu ek yalnız KM-3 migration'ını kapsar.
> Uygulanması ayrı Owner onayı ister.

**Ne yapar:** Yalnız ekleme yapar.
- `campaign_provider_state` tablosuna 4 kolon ekler: `remaining_gap`, `gap_observed_at`, `gap_window`, `usage_observed_at`.
- İki RPC ekler: `campaign_observe_usage` (Owner) ve `campaign_observe_header`.
- Mevcut RPC'ler, tablolar ve kayıtlar değişmez.

**Uygulama sırası:**
1. KM-3 PR'ı birleştirilir. Kod migration'a dayanıklıdır:
   - Panel genel bakışı yeni kolonları ayrı ve hataya dayanıklı bir sorguyla okur.
   - Gözlem çağrıları hata verirse yok sayılır.
   - Migration uygulanmadan ücretli kampanya analizi fail-closed kalır.
2. Kuru çalıştırma: `BEGIN; <000300 içeriği>; 03-km3-sonkontrol.sql; ROLLBACK;`. Beklenen sonuç 4/4.
3. Uygulama: dosya kendi işleminde, defter satırıyla birlikte (`20271229000300`, `campaign_provider_usage_gap`).
4. Son kontrol: `03-km3-sonkontrol.sql` 4/4. `02-sonkontrol.sql` güvenlik satırları da aynen geçmeli. Production'da artık bir kampanya taslağı olduğu için "kayıt yok" satırının false çıkması beklenir.
5. Owner paneli → Kota ve Maliyet → **"Gerçek kullanımı doğrula (1 kredi)"**. Ücretli tekniklerin açılabilmesi için gereklidir.

**Ziyaretçiye açma (ayrı Owner onayı):**
1. Vercel'de şu değişkenleri ayarlayın: `CAMPAIGN_SUBJECT_SECRET` (≥ 32 karakter), `CAMPAIGN_MAINTENANCE_ENABLED=true`, `CAMPAIGN_PUBLIC_ENABLED=true`. Ardından yeniden deploy edin.
2. Owner panelinde kampanyayı **Aktif** yapın.

## Gece operasyonu eki — `20271229000400_campaign_event_stats.sql` (PR #682, 02.11.2026)

> YALNIZ yerel geçici PostgreSQL'de doğrulandı (`scripts/campaign/pg/campaign-night.mjs` 32/0). Production'a uygulanması
> ayrı Owner onayı ister. Bağımlılık: 000000 + 000100 (+ 000200, 000300). Açık PR'larda numara çakışması yok (02.11 kontrol).

**Ne yapar (yalnız ekleme):**
- İki tablo: `campaign_event_daily` (toplu sayaç; kişisel veri yok) ve `campaign_event_uniques` (yalnız analitik onaylı, günlük HMAC; 90 gün).
- Üç RPC: `campaign_record_event`, `campaign_purge_event_subjects`, `campaign_event_unique_counts`.
- RLS açık, politika yok; service_role yalnız SELECT; yazma yalnız RPC ile. DROP / TRUNCATE yok.

**Sıra:** 000300 → 000400. Her biri kendi işleminde, defter satırıyla.
1. Kuru çalıştırma: `BEGIN; <000400>; 04-istatistik-sonkontrol.sql; ROLLBACK;` → 6/6.
2. Uygulama + defter satırı (`20271229000400`, `campaign_event_stats`).
3. Son kontrol: `04-istatistik-sonkontrol.sql` 6/6; `03-km3-sonkontrol.sql` ve `02-sonkontrol.sql` güvenlik satırları aynen.
4. Kod dayanıklıdır: tablo yoksa panel "Veri henüz toplanmıyor (migration uygulanmadı)" gösterir; olay kaydı hatası analiz akışını bozmaz.

## Büyük Aşama 3 eki — `20271229000500_campaign_provider_gap_hardening.sql` (B-4, PR #682, 03.11.2026)

> YALNIZ yerel geçici PostgreSQL'de doğrulandı (`scripts/campaign/pg/campaign-b4.mjs` 36/0). Production'a uygulanması ayrı
> Owner onayı ister. Bağımlılık: 000000 + 000100 + 000200 + **000300** (000400'den bağımsız). Açık PR'larda numara çakışması yok.

**Ne yapar:** 000300'ün iki RPC'sini aynı imzayla sertleştirir (`campaign_observe_usage`, `campaign_observe_header`), dört kolon
ekler (`gap_verified_at`, `gap_drift`, `gap_drift_at`, `usage_remaining_real`) ve salt politika işlevi `campaign__gap_policy()`.
- Başlık farkı ancak **≥ 1 saat arayla iki tutarlı Owner "Gerçek kullanımı doğrula" okumasıyla** doğrulanır; doğrulama **24 saat** geçerli.
- Farkta kayma (tolerans: max(2, plan sınırının ‰0,5'i)) = aynı hesapta izlenemeyen tüketim → doğrulama silinir (panelde "Kayma tespit edildi").
- Başlıktan türetilen kalan aynı ayda yükselemez. DROP / TRUNCATE / DELETE yok.

**Owner işletimi:** Ücretli teknikleri açmadan önce 1 saat arayla iki kez, sonra günde bir kez doğrulama (her biri 1 kredi). Doğrulama
yoksa ücretli analizler yalnız son 15 dakikadaki gerçek okuma süresince açılır, sonra fail-closed kapanır (uzman payı korunur).

**Sıra:** 000300 → (000400) → 000500. Kuru çalıştırma `BEGIN; <000500>; 05-b4-sonkontrol.sql; ROLLBACK;` → 5/5; uygulama + defter
(`20271229000500`, `campaign_provider_gap_hardening`); son kontrol 5/5 + 03 / 02 güvenlik satırları aynen.

**Kod dayanıklılığı:** Panel yeni kolonları ayrı ve hataya dayanıklı sorguyla okur (000500 yoksa "Fark doğrulaması" satırı görünmez).
000500 uygulanmadan kod yayına çıkarsa 000300'ün 7 günlük kuralı geçerli kalır → **000500, `CAMPAIGN_PUBLIC_ENABLED` açılmadan ÖNCE uygulanmalı.**

## Teknik kabul eki — `20271229000600_campaign_legacy_provider_rpc_narrow.sql` (D-4, PR #682, 03.11.2026)

> YALNIZ yerel geçici PostgreSQL'de doğrulandı (`scripts/campaign/pg/campaign-d4.mjs` 17/0). Production'a uygulanması ayrı Owner onayı ister.
> Bağımlılık: 000100 (fonksiyon). Sıra: 000300 → 000400 → 000500 → 000600.

**Ne yapar:** Yalnız `REVOKE EXECUTE ON FUNCTION public.campaign_observe_provider(...) FROM service_role`. Fonksiyon silinmez,
gövdesi ve veri değişmez. Gerekçe: bu eski RPC sağlayıcı kalanını doğrudan yazar ve B-4 fark kurallarını atlar (testte kanıtlandı);
uygulama kodu onu hiç çağırmaz. `campaign_record_provider_call` kod tarafından kullanıldığı için yetkisi korunur.
Kuru çalıştırma `BEGIN; <000600>; 06-d4-sonkontrol.sql; ROLLBACK;` → 4/4. **Not:** `02-sonkontrol.sql`'in "16 RPC … service_role
çalıştırabilir" satırı 000600 sonrası beklenen şekilde false (15) döner.

## Yayın kontrol listesi (gece operasyonu sonrası; HER ADIM Owner onayı)

| # | Adım | Not |
|---|---|---|
| 1 | #682 merge | CI yeşil + Owner kararı |
| 2 | 000300 → 000400 → 000500 → 000600 migration | Kuru çalıştırma + son kontroller (03 / 04 / 05 / 06) |
| 3 | Cloudflare Turnstile site oluştur (Managed) | Alan adı: yasamsistemi.com (ve www gerekiyorsa) |
| 4 | Vercel env: `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `CAMPAIGN_BOT_HOSTNAMES=yasamsistemi.com` | Hostname boşsa bot yapılandırması YOK sayılır → ücretli kapalı |
| 5 | Vercel env: `CAMPAIGN_SUBJECT_SECRET` (≥32), `CAMPAIGN_MAINTENANCE_ENABLED=true` | Bakım kapalıyken ziyaretçi yüzeyi açılmaz (denetim O-2) |
| 6 | `CAMPAIGN_BOT_VERIFY_URL` production'da TANIMLANMAZ | Yalnız yerel test; Vercel'de zaten yok sayılır |
| 7 | Gizlilik politikası / KVKK aydınlatma güncellemesi (hukuk onayı) | Taslak: `docs/campaign/gizlilik-politikasi-taslak.md` |
| 8 | Owner panel → "Gerçek kullanımı doğrula (1 kredi)" — 1 saat arayla iki kez | "Fark doğrulaması: Doğrulandı" görünmeli (B-4) |
| 9 | `CAMPAIGN_PUBLIC_ENABLED=true` + redeploy | Yayın anahtarı |
| 10 | Kampanyayı Yakında / Aktif yap; teknikleri ve kotaları seç | Owner paneli |
| 11 | Ana sayfa alanı: bağımlı Draft PR (`work/km3-ana-sayfa-kampanya`) merge | #682'den SONRA |
| 12 | Canlı duman testi: tek yerel analiz + tek ücretli analiz (Owner) | Gerçek kredi harcar — Owner kararı |
