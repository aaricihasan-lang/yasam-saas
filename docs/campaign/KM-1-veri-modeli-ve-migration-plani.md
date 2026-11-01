# Kampanya Merkezi — KM-1 veri modeli, atomik kota ve migration planı

**Durum:** Yalnız yerel geçici veritabanında doğrulandı. Production / staging migration, merge ve deploy **ayrı Owner onayı** ister.
**Taban:** `main` c1e867de · Migration'lar: `20271228000000_campaign_center_core.sql`, `20271228000100_campaign_center_quota_rpc.sql`

## 1. Kapsam

| Parça | Dosya |
|---|---|
| Çekirdek tablolar + owner yardımcısı | `supabase/migrations/20271228000000_campaign_center_core.sql` |
| Kota + Owner RPC'leri | `supabase/migrations/20271228000100_campaign_center_quota_rpc.sql` |
| Sürümlü teknik kataloğu | `lib/campaign/catalog.ts` |
| Kimlik özeti (HMAC, IPv6 /64) + Türkiye günü | `lib/campaign/subject.ts` |
| Kota servisi (fail-closed) | `lib/campaign/quotaService.ts` |
| Owner yönetim servisi | `lib/campaign/adminService.ts` |
| Testler | `scripts/campaign/pg/campaign-quota.mjs`, `scripts/campaign/catalog-parity.test.ts`, `scripts/campaign/services.test.ts` |

KM-1'de **API route yoktur** (public veya admin). Kod hiçbir mevcut ekrana/route'a bağlı değildir; migration uygulanmadan da etkisizdir.

## 2. Veri modeli

- `campaign_settings` (tek satır): acil kapatma, genel günlük kredi/analiz bütçesi, sağlayıcı aylık kotası, ücretli uzman payı %, sağlayıcı dakika tavanı, gözlem tazelik süresi, rezervasyon süresi. **Varsayılan: kredi bütçesi 0, kota tanımsız → ücretli çağrı kapalı başlar.**
- `campaigns`: durum (kapali/yakinda/aktif), tarihli/tarihsiz pencere, reklam metinleri, HD seçenekleri, modül yorum anahtarları, katalog sürümü, iyimser kilit sürümü, arşiv. **Kısmi tekil indeks: aynı anda en fazla bir yayındaki kampanya.**
- `campaign_techniques`: teknik/paket satırı; IP/gün, günlük analiz hakkı, kredi bütçesi, katalogdan alınan analiz başına azami kredi, yorum anahtarı. 0 kredili satırda kredi bütçesi 0 (CHECK). Satırlar silinmez.
- `campaign_text_templates`: reklam metni şablonları (arşivlenir).
- `campaign_usage_daily`: `global` (gün), `month` (ayın ilk günü), `tech:<kampanya>:<teknik>` (gün) sayaçları.
- `campaign_subject_daily`: IP / tarayıcı kimliği başına günlük kullanım — **yalnız HMAC-SHA256**; ham IP DB'ye gitmez (64 hex olmayan değer reddedilir).
- `campaign_reservations`: idempotency anahtarı tekil; durum `reserved/completed/released/expired`.
- `campaign_provider_calls`: sağlayıcı çağrı defteri (kişisel veri yok).
- `campaign_provider_state`: gözlenen kalan kota, sıfırlanma, dakika penceresi, 429 bekleme.
- `campaign_audit_log`: Owner değişikliklerinin değişmez kaydı.

**Yetki:** Tüm tablolarda RLS açık, politika yok; PUBLIC/anon/authenticated yetkisiz. `service_role` **yalnız SELECT**; tüm yazmalar SECURITY DEFINER RPC'lerle (`search_path = pg_catalog, public, pg_temp`). Owner RPC'leri `p_actor`'ı DB'de yeniden doğrular (`is_super_admin` + `role=admin` + `active` + demo değil; aksi 42501). İç yardımcılar service_role dahil herkese kapalı.

## 3. Atomik rezervasyon

`campaign_reserve(idempotency_key, technique_key, ip_hash, browser_hash)` tek işlemde:

1. Ayar satırı `FOR SHARE` (acil kapatma → red).
2. **Genel gün sayacı `FOR UPDATE` — serileştirme noktası.** 100 eşzamanlı istek sırayla değerlendirilir; tavan aşılamaz.
3. İdempotency: aynı anahtar ikinci kez bütçe tüketmez ve **hiçbir koşulda yeni izin vermez** (`ok:false`): süren → `istek_suruyor`, tamamlanan → `istek_tamamlandi`, iptal/süresi dolan → `onceki_istek_sonlandi`; farklı teknik → `idempotency_cakismasi`. Kampanya kapalı veya sağlayıcı durumu bilinmiyor olsa da tekrar izin almaz. Reddedilmiş isteğin satırı olmadığından tekrarı yeniden değerlendirilir (red nedeni ayrı döner).
4. Yayındaki ve zaman penceresi açık `aktif` kampanya + açık teknik satırı.
5. Genel analiz tavanı; ücretli teknikte: genel kredi bütçesi, Owner aylık kotası tanımlı mı, 429 bekleme, kalan kota gözlemi taze mi, **sağlayıcının aylık limiti gözlenmiş ve taze mi (değilse `saglayici_kotasi_bilinmiyor`)**, **Owner kotası ile gözlenen limit toleransı (`provider_quota_mismatch_pct`, varsayılan %5) aşmıyor ve kalan ≤ limit mi (değilse `saglayici_kotasi_uyusmuyor`)**, **uzman tabanı = iki kotanın BÜYÜĞÜ × uzman %** (düşük girilmiş Owner kotası uzman payını azaltamaz), **kampanya aylık payı = iki kotanın KÜÇÜĞÜ × (100 − uzman %)**, **kalan − açık rezervasyonlar − azami ≥ uzman tabanı**, dakika tavanı.
6. Teknik günlük analiz hakkı ve kredi bütçesi; IP ve tarayıcı günlük hakkı.
7. Rezervasyon + sayaç artışları.

Kilit sırası her zaman: ayar → genel gün → sağlayıcı → ay → teknik → kimlik. Sonuçlandırma: rezervasyon → genel → ay → teknik → kimlik (döngüsel bekleme yok).

**0 kredili teknik/paket (Kozmik Takvim, Lilly, Bütüncül):** kredi bütçesi ve sağlayıcı denetimleri işletilmez; analiz ve IP/tarayıcı kontenjanı korunur.

## 4. Sağlayıcı çağrısı yetkilendirmesi (rezervasyon başına tavan)

Sağlayıcı yalnız `ReservationCallGuard.call()` ile çağrılır (`lib/campaign/quotaService.ts`):

1. **Sunucu denetimi:** bu rezervasyonda kullanılan + istenen kredi ≤ rezervasyon azamisi; uç etiketi izinli biçimde (yol atlama yok). Aşarsa DB'ye bile gidilmez.
2. **DB izni `campaign_authorize_call`** (rezervasyon satırı kilitli): rezervasyon açık, süresi dolmamış, 0 kredili değil, acil anahtar kapalı, kampanya `aktif`, 429 beklemesi yok, defter toplamı + istenen ≤ azami. İzin verilen istek defterde `pending` olarak yazılır.
3. Çağrı; 4. `campaign_record_provider_call` ile sonuç (ok / http_error / rate_limited / timeout / network_error) yalnız bir kez yazılır.

İzin alınmış ama sonucu yazılmamış istek de harcanmış sayılır. service_role deftere doğrudan yazamaz. Kapanışta harcama **azami krediyle sınırlıdır** → rezervasyon üstü harcama teknik / genel / aylık bütçeyi aşamaz.

## 4b. Sonuçlandırma kuralları

| Sonuç | Analiz hakkı | IP/tarayıcı hakkı | Kredi |
|---|---|---|---|
| `completed` | kullanıldı | kullanıldı | max(bildirilen, defter) |
| `cache_hit` (defterde çağrı yok) | kullanıldı | kullanıldı | 0 (rezerv serbest) |
| `cache_hit` (defterde çağrı var) | → `completed` | kullanıldı | defter toplamı |
| `aborted_no_call` (defterde çağrı yok) | iade | iade | 0 |
| `aborted_no_call` (defterde çağrı var) | → `failed_after_call` | kullanıldı | ≥ 1 |
| `failed_after_call` (zaman aşımı dahil) | kullanıldı | kullanıldı | max(bildirilen, defter, 1) |
| süre dolumu (`expired`, çökme) | kullanıldı | kullanıldı | max(azami, defter) |

Tüm satırlarda harcama ≤ rezervasyon azamisi. Kapanmış rezervasyonu yeniden kapatma bütçeyi değiştirmez; kapanmış rezervasyon için çağrı yetkilendirilmez. Limit düşürülünce sayaçlar sıfırlanmaz.

## 4c. Güvenli hedefler ve yorum izni

- **CTA hedefi** (DB CHECK + `isSafeCtaTarget`): yalnız `bolum`, `register` veya katalogdaki `<modül>:<teknik>`. `javascript:`, `data:`, dış adres, `//`, yol atlama, sorgu dizgisi reddedilir.
- **Görsel yolu** (DB CHECK + `IMAGE_REF_RE`): yalnız `assets/` veya `campaign/` altında; her bölüm harf/rakamla başlar ('..' ve mutlak yol imkânsız); uzantı webp/png/jpg/jpeg/avif (svg yok).
- **Gerçek yorum izni** = kampanyanın modül ana anahtarı (`module_comments.<modül> = true`) **VE** teknik anahtarı (VE katalogda yorum kaynağı). `campaign_reserve` bu değeri hesaplayıp döner; sunucu yalnız buna göre yorum gösterir (`effectiveCommentsEnabled`).

## 5. Zaman

Tüm zaman damgaları `timestamptz` (UTC). Kota günü = `Europe/Istanbul` takvim günü; ay = o günün ayı. Test saati (`p_now`) yalnız `campaign.allow_clock_override='on'` oturumunda ve PostgREST (`authenticator`) dışında geçerlidir.

## 6. Migration dry-run planı (Owner onayından sonra)

1. **Yerel (yapıldı):** embedded PostgreSQL 18, Supabase varsayılan ACL'si, iki migration 2× (idempotent), 122 kontrol.
2. **Canlı salt-okunur ön kontrol:** PostgreSQL sürümü; defterde son migration; `campaign_*` nesnelerinin yokluğu; `users.is_super_admin / role / active / is_demo_account` kolonları; tablo/yetki/politika/RLS parmak izi (önce).
3. **Canlı kuru çalıştırma:** `BEGIN; <iki migration>; <işlem içi denetimler>; ROLLBACK;` — denetimler: 10 tablo RLS açık + politika 0, anon/authenticated yetkisiz, service_role yalnız SELECT (Supabase varsayılan ACL'sine karşı), 13 RPC yalnız service_role, iç fonksiyonlar herkese kapalı, varsayılan ayar satırı (bütçe 0).
4. **Uygulama:** iki dosya sırayla, tek işlem; defter kaydı; işlem sonrası parmak izi (mevcut tablolar önce = sonra).
5. **Son kontrol:** `drift:compare` manifest; Owner değişikliği olmadan kampanya kapalı ve ücretli çağrı kapalı.

Yayın sırası: kod (route yok, etkisiz) → migration. PG17 ↔ PG18 NOT NULL katalog farkı postflight'ta normalleştirilir.

## 7. Geri dönüş stratejisi

- **Anında:** `campaign_settings.kill_switch = true` veya kampanyayı `kapali` yapmak (Owner RPC) → yeni rezervasyon yok.
- **Kod:** KM-1 kodu hiçbir route'a bağlı değil; geri almak için commit'in geri alınması yeterli.
- **Veri silen geri alma migration'ı yoktur** (DROP/TRUNCATE yok). Tabloların kaldırılması gerekirse ayrı Owner onaylı migration + yedek ile yapılır.

## 8. Kozmik Takvim kota sınırlaması (O4 — tasarım notu)

Kozmik Takvim'in altı özelliği (Ay Fazları, Retro Takvimi, Gezegen Saatleri, Güçlü Günler, Transitler, Hacamat Takvimi) mevcut sistemde **tarayıcıda yerel motorla** (`lib/cosmic/*`, astronomy-engine) hesaplanır; sağlayıcı kredisi 0'dır. KM-1'de paket tek anahtar (`kozmik:paket`) ve ortak IP / tarayıcı / günlük kontenjan ile modellenir (DB testi R07–R09, F8).

**Sınırlama:** Hesap sunucuda yapılmadığı için sunucu kotası hesabın kendisini değil, yalnız **erişim iznini** sınırlayabilir. Sayfa ve motor kodu tarayıcıya indikten sonra ziyaretçi tarih değiştirerek sınırsız yerel hesap yapabilir; sunucu bunu sayamaz. Bu bir maliyet riski değildir (sağlayıcı çağrısı yok) ama "günlük kullanım hakkı" kavramını erişim düzeyine indirger.

**KM-3'te ayrı çözülecek (mevcut yerel motora dokunulmadan):** "bir kullanım" tanımı (örn. paket oturumu açma = 1 rezervasyon; oturum süresi ve kapsam sunucu imzalı kısa ömürlü erişim belirteciyle), belirteç yoksa paketin kampanya sayfasında açılmaması, Hacamat için yalnız tarafsız takvim verisi. Yerel motorun sunucuya taşınması bu kapsamda DEĞİLDİR.

## 9. Entegrasyon bağımlılıkları (KM-2 / KM-3)

- Owner yönetim API route'ları (`verifyAdminRequest` + `isCampaignOwner`) ve panel (KM-2).
- Public uç (KM-3): Turnstile, aynı köken denetimi, gövde sınırı, `reserve → ReservationCallGuard.call → settle` akışı, yanıt başlıklarından kalan kota gözlemi. Tekrar yanıtlarında (`istek_suruyor` / `istek_tamamlandi`) sağlayıcı ASLA çağrılmaz; tamamlanmış sonuç ayrı (KM-3) önbellekten verilir.
- **Sağlayıcı gözlemi:** diğer modüllerin sağlayıcı yanıtlarından `observeProvider` beslenmezse durum bayatlar ve ücretli kampanya rezervasyonu reddedilir (fail-closed). KM-3'te ortak sağlayıcı istemcilerine gözlem kancası gerekir.
- Zamanlayıcı (Inngest): `campaign_expire_stale` (dakikalık) ve `campaign_purge_subjects` (günlük, 30 gün).
- Ortam: `CAMPAIGN_SUBJECT_SECRET` (≥ 32 karakter).
- Gizlilik metni ve alt işleyici listesi (RoxyAPI, Turnstile seçilirse Cloudflare).
