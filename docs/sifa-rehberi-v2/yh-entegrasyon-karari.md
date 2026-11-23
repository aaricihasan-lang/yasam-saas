# Şifa Rehberi V2 — Yaşam Hafızası (YH) entegrasyonu: uzman sahipliği (10. aşama)

> 9. aşamadaki "V2 YH'ye eklenmez" kararı bu aşamada **sahiplik modeliyle** değiştirildi. Zorlayıcı harness'lar:
> `scripts/sifa-rehberi-v2/yh-policy.harness.ts` (saf/kaynak) · `scripts/sifa-rehberi-v2/yh/yh-owner.pg.harness.mts`
> (SQL, yerel) · `scripts/sifa-rehberi-v2/real/yh-e2e.real.ts` (gerçek test projesi, uçtan uca).

## Mevcut YH (denetim özeti, gerçek koddan)

| Konu | Bulgu |
|---|---|
| İndeks | `yasam_hafizasi_index` (20260710): `tenant_id` (NULL = shared), `UNIQUE NULLS NOT DISTINCT (source_table, source_id, section_ref)`; sahip kolonu YOKTU |
| Arama | `yh_search_candidates` (v1, 20260724) / `_v2` (20271004): SECURITY INVOKER, yalnız service_role; süzgeç `tenant_id = p_session_tenant` + PII + demo + taş dışlama |
| Sunucu | `/api/yasam-hafizasi/search`: tenant oturumdan; v2 → (PGRST202) v1; post-fetch `evaluateVisibility` (tenant/PII/demo/taş) |
| CDC | kaynak tetikleyicisi → `yh_cdc_enqueue` (20260927; aktivasyon kapılı) → `yasam_hafizasi_outbox` (UNIQUE source_key+source_id; birleştirme) → worker `runOutboxBatch` → exact okuma → upsert / defensive deindex |
| CDC (Şifa V2, 22.11) | V2 kutu tetikleyicileri genel `yh_cdc_enqueue`'ya DEĞİL, V2'ye özel `yh_cdc_enqueue_sifa_v2()`'ye bağlıdır (aynı sözleşme; kaynak/tablo sabit). Neden: production genel fonksiyonu repo dışı değişmiş, 22 tetikleyiciye bağlı → dokunulmaz (`production-kontrol/D_v2_sonuc_2026-11-22.md`). |
| Silme | DELETE → `delete` olayı → fiziksel deindex; satır uygunsuzlaşınca (bulunamaz) → defensive deindex; `deleted_at` desteği YOKTU |
| Diğer okuyucular | danışan rapor anlık görüntüsü (`snapshotStore.readProfessionalCandidate`, indeks kimliğiyle); replay/kapsam fonksiyonları (yalnız kimlik/sayım) |
| V1 Şifa | `sifa_rehberi:guides` / `:guide-sections` (tenant geneli, CONTROLLED) — DEĞİŞMEDİ |

## Yeni model

- **`owner_user_id`** (indekste, NULL = bugünkü tenant geneli). CHECK: sahipli satır tenant'sız olamaz.
- **v1 / v2**: tek ek koşul `AND i.owner_user_id IS NULL` → kullanıcı kimliği taşımayan her çağıran kişisel notu **asla** göremez.
- **v3** (`yh_search_candidates_v3`): v2 + `p_session_user`; sahipli satır yalnız `owner = p_session_user` **ve** kullanıcı o tenant'ın **aktif** üyesiyse. Yalnız service_role.
- **Sunucu**: kullanıcı yalnız oturumdan (`guard.userId`); kullanıcı varsa v3 → (yoksa) v2 → v1; kullanıcısız çağrılar bugünkü zinciri aynen kullanır. Post-fetch `evaluateVisibility` sahiplik kapısı (`hidden-owner`) — savunma derinliği.
- **Kaynak** `sifa_rehberi_v2:notes` (sifa_topic_blocks): `ownerColumn: owner_key`, satır kapısı `scope = 'kisisel'`, CONTROLLED (DB aktivasyonu olmadan işlenmez). Oluşturucu: sahip geçerli UUID değilse ya da tenant'a eşitse birim üretmez.
- **Danışan anlık görüntüsü**: sahipli satır kopyalanamaz (fail-closed).

## Mükerrerlik

V1 kurum kayıtları (healing_guides) YH kaynağı olarak kalır. V2'ye aktarılan **kurum ortak kopyaları** (`scope = 'kurum'`)
tetikleyici `WHEN` koşulu, satır kapısı ve oluşturucu sahip doğrulaması ile **üç katmanda** indeks dışıdır.
Kurum kaydı hiçbir uzmana ait gösterilmez (owner = tenant → birim yok).

## Çöp Kutusu / yaşam döngüsü

| Olay | Davranış |
|---|---|
| Yeni / güncelleme | CDC upsert → exact okuma → indeks (aynı kimlik → tek satır; hash değişmediyse yazılmaz) |
| Çöpe atma (kutu ya da HERHANGİ bir üst konu) | konu tetikleyicisi alt ağacın kişisel kutularını kuyruğa alır; okuyucu kutu + tüm üst konular çöpte değilse indeksler, aksi **deindex** |
| Geri alma | aynı yol → yeniden indeks, aynı sahip/tenant |
| Kalıcı silme (30 gün çöp temizliği) | DELETE tetikleyicisi → `delete` olayı → fiziksel deindex (kalıntı yok) |
| Tarihsel kayıtlar | `yh_sifa_v2_replay_enqueue(tenant)` (service_role, aktivasyon kapılı, idempotent); kör sayfa backfill'i KAPALI |

## Geri dönüş

Migration başlığındaki geri dönüş bloğu yalnız bu aşamanın eklediklerini kaldırır (tetikleyiciler, v3, replay,
sahipli indeks satırları, isteğe bağlı kolon). Kod tarafında v3 yoksa sunucu v2'ye düşer (kişisel notlar görünmez).

## Production'a geçiş için (ayrı Owner onayı)

1. V2 çekirdek + bu migration'ın `supabase/migrations`'a alınması (v1/v2 tanımlarının o andaki production ile birebir olduğu yeniden doğrulanmalı: üretici `scripts/sifa-rehberi-v2/yh/gen-migration.mjs`).
2. `yh_source_activation_set('sifa_rehberi_v2:notes', true)` — ayrı onay; ardından gerekiyorsa tenant bazında `yh_sifa_v2_replay_enqueue`.
3. Admin YH araçları (index-page, reconcile, replay coverage) sahipli satırları yalnız sayım/kimlik olarak görür — içerik gösterimi Owner kararıyla ayrıca denetlenmeli.
