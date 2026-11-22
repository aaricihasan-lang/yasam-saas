# Şifa Rehberi V2 — Felaket kurtarma (DB + medya) planı (12. aşama)

Prova: `scripts/sifa-rehberi-v2/real/dr.real.mts` (test projesi → yerel geçici PG, 14/14) +
`scripts/sifa-rehberi-v2/real/backup-files.real.ts` (Storage içerikleri, 27/27).

## İlke
**Şema = migration'lar (sırayla); veri = yalnız-veri döküm; tetikleyiciler veri sırasında kapalı.**
Şemayı tablo dökümünden kurmak (pg_dump -t) YH tetikleyici fonksiyonları olmadan kırılır (11. aşama bulgusu);
migration'lar tetikleyici + fonksiyon + yetkiyi doğru sırayla verir.

## Sıra
| # | Adım | Ayrıntı |
|---|---|---|
| 1 | Eklentiler | `pgcrypto`, `unaccent` (`extensions` şeması), `vector` (YH 20260711), `pg_trgm` (V1 arama) |
| 2 | Kimlik tabloları | `tenants`, `users`, `user_sessions` (+ `touch_active_session`) — production şemasından |
| 3 | YH çekirdeği | production migration geçmişi (en az: 20260710, 20260711, 20260712, 20260724, 20260815, 20260901, 20260927 … 20271004, 20271010) |
| 4 | V2 çekirdeği | `20280110000000_sifa_rehberi_v2_core.sql` (tablolar, RPC'ler, `sifa-arastirma` kovası, yetkiler) |
| 5 | YH sahiplik | `20280110000100_yh_owner_scope_sifa_v2.sql` (owner_user_id, v1/v2/v3, V2 CDC tetikleyicileri) |
| 6 | Veri | `pg_restore --data-only --disable-triggers` — sıra: tenants, users → sifa_topics → sifa_topic_blocks → sifa_block_sources, sifa_topic_links, sifa_block_assets (→ sifa_legacy_import_map, boş kalabilir) |
| 7 | Storage | `sifa-arastirma` nesneleri aynı yollara (`<tenant>/<uzman>/<uuid>.<ext>`), SHA-256 doğrulamalı, `upsert:false`. Kaynak: Storage yedeği ya da uzman yedek dosyalarının `files` bölümü |
| 8 | Doğrulama | satır + md5 özeti kaynakla aynı; 6 bileşik FK geçerli; yetim kutu 0; tetikleyiciler yerinde; tarayıcı rollerine yetki yok; service_role yalnız SELECT/INSERT; RLS açık |
| 9 | YH mutabakatı | `yh_source_activation_set('sifa_rehberi_v2:notes', true)` (yalnız yayında aktifse) → tenant başına `yh_sifa_v2_replay_enqueue(tenant)` → worker; indeks satırı = kişisel kutu sayısı |

## Uygulama yedeği (uzmanın kendi verisi) ile farkı
Ayarlar → Sistem Yedeği: yalnız oturumdaki uzmanın **kişisel** V2 kayıtları + **gerçek görsel dosyaları**
(`files` bölümü, SHA-256). Geri yükleme yalnız ekler (var olanı değiştirmez/silmez), dosyalar `upsert:false`.
Kurum ortak kayıtları: Owner kararı (22.11.2026) ile V1 aktarımı iptal → V2'de kurum kaydı **oluşturma yolu yok**;
yeni bir kurum kaydı özelliği gelirse kurum (tenant) yedeği ayrıca tasarlanmalıdır.
