# Şifa Rehberi V2: Yayın Sırası ve V1'e Geri Dönüş Planı

**Durum (22.11.2026, PR hazırlığı).** Production'da hiçbir V2 migration'ı uygulanmadı, V2 açılmadı.

| Katman | Kanıt | Sonuç |
|---|---|---|
| Veri katmanı (V1 yanında V2; V1 ve diğer modül verisi birebir aynı) | `integration.pg.mts` 51, `integration.real.mts` 51 | PASS |
| Sürüm bayrağı, **gerçek oturum + gerçek test projesiyle** ekran düzeyinde KAPALI → AÇIK → KAPALI | `real/screen.real.mts` 13 | PASS |
| Bayrak kapalıyken V1 ekranı aynen; V2 API ve `/sifa-rehberi-v2` 404 | `real/screen.real.mts`, `real/legacy.real.mts` | PASS |
| Eski rehber kayıtlarının V2'de salt-okunur gösterimi (tenant izolasyonu, demo, yazma yok) | `real/legacy.real.mts` 19 | PASS |
| Yedek / geri yükleme (V2 tabloları + görsellerin gerçek içeriği) | `backup-v2.pg` 39, `real/backup-app` 10, `real/backup-files` 27, `real/backup.real` 13 | PASS |
| Felaket kurtarma provası | `real/dr.real.mts` 14 (`docs/sifa-rehberi-v2/felaket-kurtarma.md`) | PASS |
| Yaşam Hafızası (V2'ye özel CDC, gerçek worker + arama) | `yh/yh-owner.pg` 38, `real/yh-e2e.real.ts` 32 | PASS |
| Gerçek Inngest olay zinciri (yerel Inngest dev sunucusu) | `real/inngest-prep.real.mts` + `real/inngest-e2e.real.mts` 21 | PASS |
| **Production'a özgü:** Inngest Cloud kaydı, pg_net webhook adresi, canlı ekran | — | NOT VERIFIED (yalnız yayın sırasında, aşağıda §4) |

## 1. Owner kararları (bağlayıcı)
- **Yöntem B:** sunucu tarafı sürüm bayrağı `SIFA_REHBERI_V2_ENABLED`. Kullanıcıya V1/V2 düğmesi yok; canlıda aynı anda tek sürüm.
- **V1 → V2 aktarımı İPTAL (22.11.2026).** V2'de yeni kayıtlar **kişiseldir** (yalnız sahibi görür).
- **V1 test kayıtları silindi (22.11.2026, production HARD DELETE PASS):** kalan tek V1 rehberi demo hesabınındır ve korunur.
- **Eski rehber kayıtları** V2 açıkken salt-okunur bölümde görünür (`components/sifa-rehberi-v2/LegacyGuides.tsx`); V1'e yazmaz, V2'ye kopyalamaz.
- **Production'daki genel `yh_cdc_enqueue()` ve ona bağlı 22 tetikleyiciye dokunulmaz;** V2 kendi `yh_cdc_enqueue_sifa_v2()` fonksiyonunu kullanır (`production-kontrol/D_v2_sonuc_2026-11-22.md`).

## 2. KORUNANLAR (hiçbir adımda silinmez)
- **V1 silme yedeği:** production'da `sifa_v1_silme_yedek.yedek_20261122` (36 rehber + 62 bölüm + 1 idempotency). Bu plan ve migration'lar ona **dokunmaz**; kaldırılması ayrı Owner kararıdır.
- **V1 Storage görselleri:** `stone-photos` kovasındaki `healing-guides/` nesneleri **silinmez** (silinen V1 kayıtlarına ait olanlar dahil); akıbetleri ayrı Owner kararıdır.
- **Demo hesabının V1 rehberi** ve demo hesabının tüm verisi.
- **Geri dönüşte V2 verisi:** `sifa_*` tabloları yerinde kalır (V1 onları okumaz).

## 3. B yönteminin uygulanışı
- **Seçim yeri:** `app/sifa-rehberi/layout.tsx`. Bayrak `"1"` ise `/sifa-rehberi` ve alt yolları V2'yi gösterir (adres aynı kalır; menü, `ModuleRouteGuard` ve yetki kayıtları değişmez). Aksi hâlde V1 sayfaları (`children`) aynen döner.
- **`/sifa-rehberi-v2`:** bayrak açıkken `/sifa-rehberi`'ye yönlendirir, kapalıyken 404.
- **V2 API'leri** (`/api/sifa-rehberi-v2/*`, 6 rota): bayrak kapalıyken 404; açıkken `requireModuleAccess("sifa_rehberi")` + yazma uçlarında demo engeli.
- **Neden `proxy.ts` değil:** astroloji donmuş-fark koruması (`scripts/astrology/static.harness.ts` B4) bozuluyordu; `proxy.ts` ve `next.config.ts` `origin/main` ile aynı.
- **Bayrak değişikliği yeniden dağıtım ister** (Vercel'de ortam değişkeni zaten yeniden dağıtım gerektirir).

## 4. Yayın sırası (her adım ayrı Owner onayıyla)
1. **PR + CI** (migration'lar `supabase/migrations/` altında, `backup:schema:gen` güncel). Merge Owner onayıyla.
2. **Hazırlık:** Supabase yedeği / PITR noktası; salt-okunur `production-kontrol/B`, `C`, `D` sorguları yeniden (beklenen: önceki sonuçlarla aynı).
3. **Migration'lar, sırayla:** `20280110000000_sifa_rehberi_v2_core.sql` → `20280110000100_yh_owner_scope_sifa_v2.sql`.
   - İkincisi `yasam_hafizasi_index`'e kolon + CHECK + kısmi indeks ekler ve işlem süresince tabloyu kilitler → **sessiz saatte**.
   - Sonrası doğrulama: 6 `sifa_*` tablosu ve `sifa-arastirma` kovası var; `yh_search_candidates_v3` var; `yh_cdc_sifa_v2_blocks_*` tetikleyicileri `yh_cdc_enqueue_sifa_v2`'ye bağlı; genel `yh_cdc_enqueue` gövde md5'i `ae15131a8991155fafa1786310340172` ve bağlı tetikleyici sayısı 22 — **değişmemiş**.
4. **Kod dağıtımı, bayrak KAPALI.** V1 kısa duman testi. (Kod migration'dan önce çıksa da güvenlidir: `v3` yoksa arama `v2`'ye düşer; `owner_user_id` yoksa sağlık sayacı ve anlık görüntü eski sorguya döner.)
5. **`SIFA_REHBERI_V2_ENABLED=1` + yeniden dağıtım.** Demo olmayan bir uzman hesabıyla: kayıt, düzenleme, çöp kutusu, geri alma, görsel, Word, eski rehber kayıtları.
6. **(Ayrı onay) YH kaynak aktivasyonu:** `select public.yh_source_activation_set('sifa_rehberi_v2:notes', true, false, null, null, '<gerekçe>')` (production yazımı).
7. **Canlı Inngest / pg_net doğrulaması** (6'dan sonra):
   - Inngest Cloud: uygulama senkron, `yh-outbox-worker` görünür; ortamda `YH_OUTBOX_WORKER_ENABLED=true`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` tanımlı.
   - Salt-okunur: Vault'ta yalnız **ad** kontrolü (`yh_outbox_webhook_secret`, `yh_outbox_webhook_url`; değer okunmaz); `net._http_response` son 10 dk yalnız `status_code` sayıları.
   - Test uzmanının benzersiz kelimeli notu 1–2 dk içinde outbox'ta `succeeded`, sahibinin aramasında var, aynı tenant'taki başka uzmanda YOK; çöpe atılınca kalkar; Inngest çalıştırması `triggerSource: event`.

**Tanımlanmaması gereken:** `SIFA_V2_PROTOTYPE` (prototip sayfası; production'da kapalı kalır).

## 5. Geri dönüş (Owner kararıyla)
| Seviye | İşlem | Etki |
|---|---|---|
| 1 — hızlı | `SIFA_REHBERI_V2_ENABLED` kaldırılır / `0` + yeniden dağıtım | V1 ekranları; V2 verisi kalır; kod/git işlemi yok |
| 2 | `yh_source_activation_set('sifa_rehberi_v2:notes', false, …)` | V2 CDC no-op (kişisel notlar yeni olay üretmez) |
| 3 | Kod revert'ü | YH kodu migration olsa da olmasa da çalışır |
| 4 — yalnız ayrı onayla | Migration başlıklarındaki GERİ DÖNÜŞ blokları (tetikleyici/fonksiyon kaldırma, V2 kişisel indeks satırları) | `DROP TABLE` yok; V1 yedeği ve Storage'a dokunulmaz |

Seviye 1 sonrası canlı kontrol: liste ve arama, kayıt açma/düzenleme (test hesabıyla), fotoğraf, Word, menü ve sayaç.

## 6. Bakım notları
- **Outbox şeması değişirse** (kolon, `UNIQUE(source_key, source_id)`, `event_version` dizisi, `processing` sözleşmesi): genel `yh_cdc_enqueue` ile birlikte **V2'ye özel** `yh_cdc_enqueue_sifa_v2()`, `yh_sifa_v2_topic_trash_enqueue()` ve `yh_sifa_v2_replay_enqueue()` da güncellenmeli; `scripts/sifa-rehberi-v2/yh/yh-owner.pg.harness.mts` (izole CDC bölümü) çalıştırılmalı.
- **YH sahiplik migration'ı üretilmiş dosyadır:** `scripts/sifa-rehberi-v2/yh/gen-migration.mjs` (v1/v2 arama gövdeleri gerçek migration'lardan). Elle düzenlenmez; üretici değiştirilip yeniden üretilir.
- **Production'daki genel `yh_cdc_enqueue()` repo dışında değişmiş** (162 satır; repo 84). V2'yi etkilemez; repo ile uzlaştırılması ayrı iştir.
- **`.hardening/prod-tables.md`** (yedek harness'ının production tablo listesi) Git dışıdır; yerel kopya 23.10.2026 tarihli. Tazelenmesi production'dan okuma gerektirir (ayrı Owner onayı).

## 7. Yedekleme kapsamı: DONE
- `lib/backup/registry.ts`: 5 V2 tablosu (`ownerScope owner_key` → yalnız kişisel kayıtlar; `absentTolerant`: migration uygulanmamış ortamda boş + tamam / geri yüklemede SKIPPED). `sifa_legacy_import_map` yedek dışı (türetilmiş).
- `lib/backup/sifaV2Files.ts`: `sifa-arastirma` görsellerinin gerçek içerik yedeği (parçalı base64 + SHA-256).
- `lib/backup/schema.generated.ts`: `npm run backup:schema:gen` ile `supabase/migrations`'tan üretilir.
