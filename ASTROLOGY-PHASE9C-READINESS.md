# ASTROLOJİ AŞAMA 9C — Son Entegrasyon, Güvenlik ve Canlıya Geçiş Hazırlığı

> **Karar: CONDITIONAL GO.** Kod, migration ve testler hazır. Canlıya geçiş yalnız owner onayıyla ve §7'deki sırayla yapılmalı.
> Koşullar §9'da.

| | |
|---|---|
| Başlangıç SHA | `e132a5ec` (9B P2 kapatma) |
| Birleştirilen main | `origin/main` = `674f031b` (HttpOnly H5 PR #376 dahil; branch main'in 0 commit gerisinde) |
| Entegrasyon | `63cb1791` merge, **çakışma yok** |
| 9C commit'leri | `464af70b` H5 uyumu · `82487107` PG 9C senaryoları · `681550bf` yedek şeması düzeltmesi · bu rapor |
| Production / Frankfurt / Tokyo | **dokunulmadı** |
| Push / merge / deploy / production migration / env | **yok** |
| Gerçek Roxy çağrısı | **0** (toplam **50**, defter `scripts/astrology/fixtures/golden9a/roxy-call-ledger-9a.json`) |
| Human Design ve diğer mühürlü modüller | davranış **değişmedi** (yalnız Astroloji dosyaları ve yedek şemasındaki astro satırı) |

## 1. Main ve HttpOnly H5 entegrasyonu
**Merge:** `origin/main` (674f031b) yerel olarak birleştirildi, çakışma olmadı.

Paylaşılan dosyalar (`app/page.tsx`, `package.json`, `lib/backup/schema.generated.ts`) main'den yalnız Astroloji satırlarıyla ayrılıyor. Statik kapsam testi bunu satır satır denetliyor.

**H5 uyumu (`464af70b`):** yalnız istemci tarafı değişti. Sunucu auth/oturum koduna **dokunulmadı**.

| Dosya | Eski | Yeni |
|---|---|---|
| `app/admin/astroloji/_lib/api.ts` | Ham `x-session-token: readSessionToken()`; token yoksa istek hiç atılmıyordu | `...sessionTokenHeader()` + `hasSessionCredential()` |
| `components/astrology/AstrologyClientStatus.tsx` (DY rozeti) | Aynı | Aynı H5 yardımcıları |

- **Web:** token gerekmez. Kimlik HttpOnly `__Host-yasam_sid` çereziyle taşınır, `x-user-id` / `x-admin-id` başlığı aynen gider.
- **Android WebView ve eski istemci:** token başlığı korunur.

### 8 kuralın doğrulaması
Kanıtlar `scripts/astrology/httponly9c.harness.ts` (9/9) ve gerçek tarayıcı (§5).

| # | Kural | Sonuç |
|---|---|---|
| 1 | HttpOnly zayıflatılmadı | PASS. Çerez JS'ten okunamıyor (`document.cookie` içinde yok). Sunucu taşıma ve CSRF kodu değişmedi |
| 2 | Legacy token zorunlu değil | PASS. localStorage token silinmişken owner ve uzman sayfası ile API'leri, yazma ve Word/PDF çalışıyor |
| 3 | Owner ve uzman erişimi korunuyor | PASS (harness + tarayıcı) |
| 4 | Modülü kapalı uzman | PASS: 404. Üye Yönetimi'nde açılınca 200 |
| 5 | Roxy yorum yetkisi bağımsız | PASS. `astrology` açık, `astrology_provider_interp` kapalı → `providerInterpretations:false` |
| 6 | Demo ve yetkisiz kullanıcı | PASS: tek tip 404 `{ok:false,error:"Bulunamadı."}` |
| 7 | Uzmanlar ve tenant'lar arası sızıntı yok | PASS. Başka tenant analizi ve raporu 404. Başkasının çereziyle kendi `x-user-id`'si 404. Başlık ve çerez farklı kullanıcıysa 404 |
| 8 | HD ve diğer modüllerin oturum davranışı | Değişmedi. H5, h1h4, session-expiry, auth-p0 ve HD harness'leri PASS (§4) |

### Ek doğrulamalar
- **Çerezle durum değiştiren istek:** aynı köken (`Sec-Fetch-Site` veya izinli Origin) kabul ediliyor.
- Yabancı Origin, köken bilgisi yok ya da `x-user-id` / `x-admin-id` yok → reddediliyor ve **hiçbir kayıt yazılmıyor**.
- **Android UA:** çerez yok sayılıyor, token başlığıyla 200.
- **`SESSION_COOKIE_MODE=off`:** çerez tek başına geçersiz, eski token yolu çalışıyor.

## 2. Migration denetimi (000000–000700)
**Sıra:** `20271101000000` → `…0100` → `…0200` → `…0300` → `…0400` → `…0500` → `…0600` → `…0700`. Repodaki tüm migration'lardan sonra gelir; main'deki son migration `20271012000000`.

**Main tablolarına etkisi:**
- **Tek DDL:** `000000`, `public.clients` üzerinde `clients_tenant_id_id_key UNIQUE (tenant_id, id)` kısıtını **yalnız yoksa** ekler. Prod'da var (önceki aşamalarda doğrulandı), yani no-op.
- **Kısa kilit:** FK'ler (`astro_* → clients(tenant_id,id)`) clients üzerinde kısa bir SHARE ROW EXCLUSIVE kilidi alır. Yeni tablolar boş olduğundan doğrulama anında biter.
- Başka hiçbir main tablosuna, uzantıya ya da veriye dokunulmaz.

**Güvenlik:**
- Her `astro_*` tablosunda RLS açık.
- anon / authenticated / PUBLIC için **hiçbir** tablo ya da fonksiyon yetkisi yok. service_role'e açık allowlist var.
- `astro_analyses` ve notları uygulama rolü için değişmez (yalnız SELECT/INSERT).
- SECURITY DEFINER yalnız silme RPC'lerinde. `search_path` sabit, yalnız service_role çalıştırır.

**Veri:**
- `000300` eski veri çakışmasında `ASTRO 7A:` hatasıyla durur ve veriyi korur (beklenen-fail testi PASS).
- `000500` sinastri/kompozit karşı taraf bağlarını CASCADE yerine SET NULL / NO ACTION yapar. Silme kilit altında yapılır.
- `000600` atomik tavan (advisory lock).
- `000700` yalnız KB biçimindeki `kb_snapshot`'ları boşaltır; notlara dokunmaz.

### Gerçek embedded PostgreSQL senaryoları (hepsi PASS)

| Senaryo | Kapsam |
|---|---|
| pg7a (3 koşu) | Sıfırdan 000000–000300 iki kez. Eski veri üzerine yükseltme (satır ve parmak izi aynı). Çakışmada güvenli durma |
| pg7b | Sıfırdan 000000–000500 iki kez + liste ve silme doğrulamaları |
| pg9b | Mevcut şema (000000–000500) + eski KB verisi üzerine 000600 + 000700 iki kez: temizlik + tavan |
| **pg9c-A (yeni)** | **Sıfırdan 8 migration iki kez** + 7A / 7B / silme / tavan doğrulamaları |
| **pg9c-B (yeni)** | **Karma veritabanı:** 7A öncesi eski veri + 9B eski KB kopyaları + yeni kayıtlar; 000000–000700 **iki kez yeniden**. Tüm satırlar ve parmak izleri (kb_snapshot hariç) aynı. KB biçimli eski kopya kalmadı. RLS ve yetkiler sağlam. Değişmezlik korunuyor. Tavan tetikleyicileri tekil (4). **Negatif kontrol:** 000700 olmadan FAIL |
| cap-concurrency | 40 eşzamanlı bağlantı, tavan−1: KB, profil ve analizde 1 başarı + 39 red, **aşım 0** (4/0) |

**Kapasite (9B davranışları korunuyor):**
- Yeni analiz ≈ 14 KB/satır; 3000 analiz ≈ 42 MB.
- KB analize kopyalanmıyor. Not, yorum, sinastri snapshot'ı ve Word/PDF TSİ tarihi aynen çalışıyor (p2fix9b 15/15, report8 72/72).

## 3. Bulgular

| Kod | Seviye | Bulgu | Durum |
|---|---|---|---|
| 9C-P2-01 | P2 | `lib/backup/schema.generated.ts`'te `astro_birth_profiles.archived_at` (000400) eksikti. Yedekten geri yüklemede arşiv durumu kaybolurdu (backup.harness şema senkron FAIL) | **Düzeltildi** (`681550bf`, yalnız o satır) |
| 9C-P3-01 | P3 | `getAnalysis` teknik snapshot'ı beklenen şekilde değilse (ör. `{}`) 500 veriyor. Uygulamanın kayıt yolu bu biçimi üretemez ve analizler değişmez. Yalnız yerel dev tohumunun yapay liste satırlarında görüldü. 9B öncesinde de aynıydı | Kod değiştirilmedi; ileride savunmacı koruma önerilir |
| 9C-P3-02 | P3 (başka modül) | backup.harness `admin_purge_context` tablosu sınıflandırılmamış (Üye Yönetimi purge migration'ı). **origin/main'de de aynı** | Astroloji kapsamı dışı; ilgili oturuma bildirilmeli |
| 9C-P3-03 | P3 (test altyapısı) | `hd:central-client` L8 kontrolü (`git diff origin/main`'de astrolog dosyası olmamalı) Astroloji branch'inde doğası gereği FAIL (126/1). Davranış hatası değil | Bilgi |
| 9C-P3-04 | P3 (test altyapısı) | `hd:analysis-flow` sabit port 54398 ve paylaşılan temp dizini kullanıyor; başka bir oturumun PG'si (hd-word-pro) tuttuğu için çakıştı. Geçici kopya port 54498 ile **61/0 PASS** (kopya silindi; diğer oturumun sürecine dokunulmadı) | Bilgi |

**Açık P0 / P1 / P2: yok.**

## 4. Testler (birleştirilmiş kodda, sıralı, `env -u ROXY_API_KEY`)

| Test | Sonuç |
|---|---|
| `npm run test:astrology` (21 harness) | **485 PASS / 0 FAIL** (476 + httponly9c 9) |
| PG zinciri (pg7a×3, pg7b, pg9b, pg9c-A, pg9c-B) + beklenen-fail | 7/7 RESULT PASS + EXPECTED-FAIL PASS |
| cap-concurrency | 4/0 |
| httponly-h5, httponly-h1h4, session-expiry-ux, auth-session-p0 | PASS (exit 0) |
| Üye Yönetimi faz1 / faz2 / 360 check | PASS |
| HD member / tenant-scope / presale-final / analysis-flow | PASS (analysis-flow 61/0, §3 P3-04) |
| HD central-client | 126/1 (yalnız L8, §3 P3-03) |
| backup.harness | 53/1 (yalnız `admin_purge_context`, main'de de var) |
| Mutasyon kontrolleri | pg9c-B negatif kontrol FAIL verdi (beklenen) |
| `tsc --noEmit` | 0 hata |
| `next build` | PASS (tüm `/astroloji` ve `/api/astroloji/**` route'ları derlendi) |

## 5. Gerçek tarayıcı (Chrome, yerel `next start`, `SESSION_COOKIE_MODE=primary`)
**Ortam:** sahte PostgREST, sentetik kişiler, Roxy anahtarı yok.

**Akış:**
1. Yerel test oturumu.
2. Uygulamanın kendi bootstrap ucu `POST /api/auth/session/cookie` ile 200 alındı.
3. `__Host-yasam_sid` HttpOnly geldi (`document.cookie`'de görünmüyor).
4. localStorage token **silindi**.

**Owner:**
- `/admin/astroloji` açıldı, danışan listesi yüklendi.
- Yalnız çerezle profil oluşturma **201**.
- Kayıtlı natal ve sinastri Word / PDF **200** (159 KB / 162 KB, 12 KB / 23 KB).
- `x-admin-id` olmadan **404**. Çerezsiz **404**.

**Uzman (çerez):**
- Modül kapalı → **404**.
- Owner Üye Yönetimi'nden (yalnız çerezle PATCH) açınca **200**, yorum yetkisi `false`.
- Admin yüzeyi **404**. Owner kimliğini taklit eden başlık **404**.
- `/astroloji` sayfası yalnız kendi danışanını gösteriyor.

**Görünüm:** 1280 px ve 390 px'te yatay taşma **0**, veri yüklü.

**Gerçek Android cihaz: DOĞRULANAMADI.** Android yolu yalnız sunucu harness'leriyle sınandı (UA → çerez yok sayılır, token ile 200). Cihazda PASS sayılmadı.

## 6. Production'a geçiş için gerekenler (owner kararı)
- **Vercel env, yalnız owner onayıyla (auth/env istisnası):**
  - `ASTROLOGY_MODULE_ENABLED=true` (tam olarak "true"; başka her değer kapalı demektir).
  - `ROXY_API_KEY`, `ROXY_API_BASE_URL`.
  - `SESSION_COOKIE_MODE` **değişmez** (prod `primary`).
- `engine/run` ve rapor route'ları `maxDuration=300` kullanır. Vercel planı (ticari kullanım için Pro) bu süreyi desteklemeli.
- Roxy kotası (aylık plan) Roxy panelinden kontrol edilmeli. Uygulama sınırları: 200 analiz/gün/uzman, 120 yazma/10 dk.

## 7. Canlıya geçiş sırası (UYGULANMADI, yalnız plan)

| # | Adım | Ayrıntı ve kabul ölçütü |
|---|---|---|
| 1 | Freeze teyidi | Diğer oturumlarda açık prod işi yok. Main'e merge veya deploy bekleyen başka iş yok (owner teyidi) |
| 2 | Frankfurt yedeği | `pg_dump` (şema + veri, `--no-owner`), Storage manifest gerekmez (Astroloji Storage kullanmıyor). Dosya, SHA256 ve satır sayısı kaydedilir |
| 3 | Yedek bütünlüğü | SHA256 doğrulama. Yerel geçici PG'ye geri yükleme denemesi; tablo sayısı ve ana tablo satır sayıları canlıyla eşleşir |
| 4 | Prod deploy SHA'sını kaydet | Vercel'deki mevcut production deployment id + commit SHA (Instant Rollback hedefi) |
| 5 | Migration öncesi kontrol (salt-okunur) | `to_regclass('public.astro_birth_profiles')` NULL olmalı (astro tablosu yok). `clients_tenant_id_id_key` var. `clients` kolonları: id, tenant_id, ad, soyad, dogum, telefon, created_at. anon / authenticated / service_role rolleri var. `schema_migrations`'ta `20271101%` yok |
| 6 | Migration sırası | 000000 → 0100 → 0200 → 0300 → 0400 → 0500 → 0600 → 0700, her biri ayrı ve sırayla. Her adımdan sonra hata yok, NOTICE'lar kaydedilir. Yeni tablolar boş olduğundan kilit ve süre önemsiz |
| 7 | Kod–DB eşlemesi | **Önce migration, sonra deploy.** Astroloji kodu tablolar olmadan modül açıksa hata verir; `ASTROLOGY_MODULE_ENABLED` deploy'dan sonra açılır. Migration sonrası, deploy öncesi: tablo / RLS / yetki doğrulama SQL'i (pg9c-B'deki RLS ve yetki blokları salt-okunur sorgu olarak) |
| 8 | Vercel deploy doğrulama | Owner merge, ardından otomatik deploy. Deployment READY, bölge fra1. `/api/astroloji/access` modül kapalıyken 404 |
| 9 | Smoke | Env açılır. Owner: `/admin/astroloji` erişim, profil oluşturma, kayıtlı analiz açma, Word/PDF. Uzman (test hesabı, modül açık): erişim 200. Modül kapalı ve demo: 404. Çerezli web oturumu (token'sız) |
| 10 | Roxy kota kontrolü | İlk gerçek hesaptan önce ve sonra Roxy panelinde sayaç. Beklenmeyen artış yok |
| 11 | Geri dönüş | Aşağıda |

### Geri dönüş (rollback)
1. **İlk müdahale (veri kaybı yok):** `ASTROLOGY_MODULE_ENABLED` kapatılır, modül anında 404 olur. Gerekirse Vercel Instant Rollback ile adım 4'teki deployment'a dönülür. Astro tabloları DB'de kalır; zararsız ve izoledir.
2. **Kör geri yükleme YOK:** migration sonrasında prod'a başka modüllerden yeni veri yazılmışsa adım 2'deki yedeğin tamamı geri yüklenmez (yeni veriler kaybolur).
   - DB geri dönüşü gerekiyorsa yalnız astro nesneleri düşürülür: `astro_*` tabloları, `astro_*` fonksiyonları ve tetikleyicileri, ters bağımlılık sırasıyla.
   - **Bu yalnız gerçek Astroloji verisi yoksa ya da owner kaybı onaylarsa yapılır.** `clients_tenant_id_id_key` prod'da önceden vardı ve kaldırılmaz.
3. Tam yedekten geri yükleme yalnız felaket senaryosunda ve owner kararıyla yapılır. Migration sonrasında yazılan veri ayrıca dışa aktarılıp yeniden uygulanmalıdır.

### `VACUUM (FULL)`, ayrı risk notu (otomatik dahil DEĞİL)
- Prod'da eski astro verisi yok (tablolar yeni), yani 000700 boş çalışır ve VACUUM FULL **gerekmez**.
- İleride gerekirse: `VACUUM (FULL) public.astro_analyses` tabloya **ACCESS EXCLUSIVE kilit** alır (okuma dahil her şey bekler) ve tablo boyu kadar ek disk ister. Yalnız bakım penceresinde, owner onayıyla ve tek tabloda çalıştırılmalı. Normal autovacuum boş alanı yeniden kullanır.

## 8. Son durum
- Son yerel SHA: bu raporun commit'i (`681550bf` üzerine). Çalışma ağacı temiz.
- Production, Frankfurt ve Tokyo veritabanı, GitHub, Vercel ve env: **dokunulmadı**.

## 9. Karar: CONDITIONAL GO
Kod ve migration'lar teknik olarak hazır: P0 / P1 / P2 açık yok, testler ve build yeşil, H5 ile uyumlu.

**Koşullar:**
- **(a)** Owner onayı: merge, production migration ve Vercel env (auth/env istisnası).
- **(b)** §7 sırasına uyulması: yedek ve bütünlük, sonra migration, sonra deploy, sonra env.
- **(c)** Gerçek Android cihazda bir smoke (yerelde doğrulanamadı).
- **(d)** Roxy kotasının ve Vercel planının (maxDuration 300) teyidi.
