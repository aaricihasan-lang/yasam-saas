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
3. İdempotency: aynı anahtar → aynı rezervasyon (ikinci kez bütçe tüketmez); farklı teknik → `idempotency_cakismasi`.
4. Yayındaki ve zaman penceresi açık `aktif` kampanya + açık teknik satırı.
5. Genel analiz tavanı; ücretli teknikte: genel kredi bütçesi, sağlayıcı aylık kotası tanımlı mı, 429 bekleme, gözlem tazeliği, **kampanya aylık payı = kota × (100 − uzman %)**, **kalan − açık rezervasyonlar − azami ≥ uzman tabanı**, dakika tavanı.
6. Teknik günlük analiz hakkı ve kredi bütçesi; IP ve tarayıcı günlük hakkı.
7. Rezervasyon + sayaç artışları.

Kilit sırası her zaman: ayar → genel gün → sağlayıcı → ay → teknik → kimlik. Sonuçlandırma: rezervasyon → genel → ay → teknik → kimlik (döngüsel bekleme yok).

**0 kredili teknik/paket (Kozmik Takvim, Lilly, Bütüncül):** kredi bütçesi ve sağlayıcı denetimleri işletilmez; analiz ve IP/tarayıcı kontenjanı korunur.

## 4. Sonuçlandırma kuralları

| Sonuç | Analiz hakkı | IP/tarayıcı hakkı | Kredi |
|---|---|---|---|
| `completed` | kullanıldı | kullanıldı | max(bildirilen, defter) |
| `cache_hit` (defterde çağrı yok) | kullanıldı | kullanıldı | 0 (rezerv serbest) |
| `cache_hit` (defterde çağrı var) | → `completed` | kullanıldı | defter toplamı |
| `aborted_no_call` (defterde çağrı yok) | iade | iade | 0 |
| `aborted_no_call` (defterde çağrı var) | → `failed_after_call` | kullanıldı | ≥ 1 |
| `failed_after_call` (zaman aşımı dahil) | kullanıldı | kullanıldı | max(bildirilen, defter, 1) |
| süre dolumu (`expired`, çökme) | kullanıldı | kullanıldı | max(azami, defter) |

Kapanmış rezervasyonu yeniden kapatma bütçeyi değiştirmez; kapanmış rezervasyona çağrı yazılamaz. Limit düşürülünce sayaçlar sıfırlanmaz.

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

## 8. Entegrasyon bağımlılıkları (KM-2 / KM-3)

- Owner yönetim API route'ları (`verifyAdminRequest` + `isCampaignOwner`) ve panel (KM-2).
- Public uç (KM-3): Turnstile, aynı köken denetimi, gövde sınırı, `reserve → sağlayıcı → recordProviderCall → settle` akışı, yanıt başlıklarından kalan kota gözlemi.
- **Sağlayıcı gözlemi:** diğer modüllerin sağlayıcı yanıtlarından `observeProvider` beslenmezse durum bayatlar ve ücretli kampanya rezervasyonu reddedilir (fail-closed). KM-3'te ortak sağlayıcı istemcilerine gözlem kancası gerekir.
- Zamanlayıcı (Inngest): `campaign_expire_stale` (dakikalık) ve `campaign_purge_subjects` (günlük, 30 gün).
- Ortam: `CAMPAIGN_SUBJECT_SECRET` (≥ 32 karakter).
- Gizlilik metni ve alt işleyici listesi (RoxyAPI, Turnstile seçilirse Cloudflare).
