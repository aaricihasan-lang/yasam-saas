# Şifa Rehberi F3 — Yayın Sırası, Manuel Yedek ve Geri Dönüş

**Kapsam:** Onaylı F2 Revizyon 7 tasarımının ürüne entegrasyonu (kişisel kütüphane). Bu belge yayın ÖNCESİ hazırlanmıştır;
production'da hiçbir adım uygulanmamıştır. Her adım **ayrı Owner onayı** ister.

## 0. Ön koşullar (değişmez kurallar)
- Production'da şu an: `20280110000000` (çekirdek) + `20280110000100` (YH sahiplik) uygulanmış; `20280124000000` (görsel yaşam döngüsü) **uygulanmamış**.
- Supabase **Free plan**: zamanlanmış yedek ve PITR **yok** → migration'dan önce manuel yedek ZORUNLU (§1).
- Kullanıcı hesaplarına ve diğer modüllerin kayıtlarına dokunulmaz. Migration'lar yalnız `sifa_*` tablolarını, `sifa_*` fonksiyonlarını ve
  (§2 adım 4) Şifa'ya özel bir YH tetikleyicisini ekler; genel `yh_cdc_enqueue()` ve diğer modüllerin tetikleyicileri DEĞİŞMEZ.
- Mevcut Şifa kayıtları (Owner: hepsi test amaçlı) **silinmez, taşınmaz, değiştirilmez** — F3 migration'ı yalnız sütun/kısıt/fonksiyon ekler.
- Yaşam Hafızası **kapalı kalır**: `yh_source_activation('sifa_rehberi_v2:notes')` açılmaz; adım 4'teki tetikleyici kapalıyken sessiz no-op'tur.

## 1. Manuel yedek ve geri yükleme provası (Owner, migration'dan hemen önce — ZORUNLU)
**Kapsam:**
- **Veritabanı (tam):** tüm şemalar ve satırlar — `public` (Şifa: `sifa_topics`, `sifa_topic_blocks`, `sifa_block_sources`, `sifa_block_assets`,
  `sifa_topic_links`, `sifa_legacy_import_map`; V1 `healing_guides`/`healing_guide_sections`; diğer TÜM modüller ve kullanıcı hesapları),
  `storage` şeması meta verisi (`storage.objects`, `storage.buckets`) ve migration geçmişi.
- **Storage dosyaları:** en az `sifa-arastirma` (F3/V2 kişisel görseller) ve `stone-photos` (V1 kurum görselleri; eski kayıtlar başvurur);
  altın yedek aracı tüm kovaları alır. Migration'lar **Storage'a dokunmaz**; Şifa çöp temizliği hiçbir zamanlanmış işe bağlı değildir
  (yayın penceresinde otomatik dosya silinmez — Storage nesnesi yalnız kullanıcının kutu kalıcı silme / görsel kaldırma / yükleme iptali ile silinir).

**Adımlar:**
1. Altın yedek aracı (Owner arşivi `db-storage-yedek.mjs`, Frankfurt): veritabanı + Storage tam yedek. Komutu Owner kendi terminalinde
   çalıştırır (Claude Code içinden `!` ile). Parola/anahtar ekrana yazılmaz.
2. Salt-okunur ön sayım (SQL Editor; yazma yok):
   `select (select count(*) from public.sifa_topics) t, (select count(*) from public.sifa_topic_blocks) b, (select count(*) from public.sifa_block_sources) s, (select count(*) from public.sifa_block_assets) a;`
   ve Storage dökümü: `select bucket_id, count(*), sum((metadata->>'size')::bigint) from storage.objects group by 1 order by 1;`
3. **Geri yükleme provası:** yedek YEREL PostgreSQL'e geri yüklenir; yereldeki §1.2 sayıları **birebir** eşleşmeli. Storage yedeğinde
   kova başına dosya sayısı/toplam boyut §1.2 dökümüyle eşleşmeli ve `sifa-arastirma` kovasından rastgele en az 3 dosya açılıp
   bayt boyutu `storage.objects` ile karşılaştırılmalı. Eşleşme yoksa migration'a GEÇİLMEZ.
4. Uygulama içi yedek (lib/backup) içerik kutularını notlarından SONRA yazar (`selfRef parent_block_id`; test: `backup-v2.pg` + `backup.harness`).

## 2. Yayın sırası
| # | Adım | Not |
|---|---|---|
| 1 | PR + CI (bu dal, güncel main üzerine) | Merge Owner onayıyla. Merge **otomatik deploy** başlatır → migration'lar merge'den ÖNCE uygulanmalı (aşağıda "Neden"). |
| 2 | Migration `20280124000000_sifa_v2_asset_lifecycle.sql` | Yalnız fonksiyon; tablo/veri değişmez. DB-03 defterinde "geçmiş, production'a uygulanmamış". |
| 3 | Migration `20280130000200_sifa_rehberi_f3.sql` | Yalnız EKLEME: 3 sütun, 3 kısıt, 1 tetikleyici, fonksiyon güncellemeleri. Eski kod bu şemayla çalışır (§3 seviye 1, test kanıtı). |
| 4 | Migration `20280130000300_yh_sifa_f3_kutu_yayilimi.sql` | Önkoşul: adım 3 + `20280110000100` (prod'da var). Yalnız EKLEME: not çöpe/geri → içerik kutuları YH kuyruğuna. **YH kapalıyken etkisiz.** Önkoşul eksikse açık hatayla durur. |
| 5 | Doğrulama (salt-okunur) | §1.3 sayıları DEĞİŞMEMİŞ; yeni sütunlar `node_kind`, `parent_block_id`, `content_updated_at` var; `yh_cdc_sifa_v2_note_trash_trg` var. |
| 6 | Merge → deploy | `SIFA_REHBERI_V2_ENABLED=1` zaten tanımlı; yeni ekran açılır. Sayfa dinamik (ƒ): bayrak çalışma anında okunur. |
| 7 | Canlı kabul (Owner izniyle, test hesabıyla) | Konu oluştur, not + içerik kutusu, görsel, kaynak, bağlantı, ⤢ pencere, kutu silme, Silinenler, mükerrer konu uyarısı, Word, Tümünü Oku; masaüstü + Android. Ana ekran ve Yönetim paneli Şifa sayacı. |

**Migration uygulama yöntemi (DB-03, zorunlu):** production'a yalnız merkezi numara sisteminin uygulama kapısıyla
(`scripts/migrations/numara/uygula-prod.mjs`; önce kuru çalıştırma, sonra `--uygula`) ve §2 sırasıyla uygulanır. F3 migration
numaraları merkezi defterden ayrılır ve PR'a bağlanır (dosya adı elle seçilmez).

**Neden migration önce?** Yeni istemci içerik kutusunu `parent_block_id` ile gönderir. Eski şema bu alanı tanımaz ve kutuyu
bağımsız not olarak yazar (veri karışır). Sıra: önce migration, sonra kod.

**Numara benzersizliği:** merkezi defter (DB-03) tekilliği garanti eder; CI kapısı (`migration-reservation-check`) PR'daki dosyanın
SHA-256'sının deftere bağlı olduğunu doğrular. Merge'den hemen önce `node scripts/ci/migration-naming-check.mjs` yeniden çalıştırılır.

## 3. Geri dönüş

**Güvenli çalışma yöntemi (F3-R2):** eski kodda salt-okunur anahtar YOKTUR → eski kodun F3 kayıtlarını düzenlemesini önlemenin yolu,
eski kodu Şifa'da hiç çalıştırmamaktır. Bu nedenle **varsayılan geri dönüş SEVİYE 2'dir** (F3 kodu kalır; `SIFA_REHBERI_V2_ENABLED=0`
+ yeniden dağıtım → Şifa "bakımda", tüm Şifa API'leri 404, HİÇBİR yazma olmaz; veri ve Storage yerinde). Sorun F3 kodunda
düzeltilir ve bayrak yeniden açılır. **Seviye 1 (önceki dağıtım) yalnız Owner'ın açık kararıyla** ve aşağıdaki ölçülmüş davranışlar
kabul edilerek uygulanır; bu durumda uzmanlara "Şifa Rehberi'nde düzenleme yapmayın" duyurusu yapılır ve süre kısa tutulur.
(Vercel'de ortam değişkeni değişikliği yeni dağıtım gerektirir; önceki dağıtımı "Promote" etmek o dağıtımın kendi bayrağıyla açar.)

| Seviye | İşlem | Etki |
|---|---|---|
| 1 — hızlı | Vercel'de önceki production dağıtımını "Promote" (F3 migration'ları YERİNDE kalır) | Önceki ekran döner; F3 şeması geriye uyumlu. **Veri kaybı yok** (test: `geri-donus.pg.mts` C). Eski kod F3 kayıtlarını okur, sade not ve içerik kutusu düzenler (kutu notuna bağlı kalır), kutulu notu çöpe atar (kutular silinmez). **Sınır:** "bağlantı" türü kaynağı olan not ve başlıksız kutu eski kodda **kaydedilemez (400, hiçbir satır değişmez)** — geri dönüş süresince bu kayıtlar salt-okunurdur. |
| 2 — acil kapatma | `SIFA_REHBERI_V2_ENABLED` kaldır / `0` + yeniden dağıtım | Şifa ekranı "bakımda" iletisi; API 404. Veri yerinde. |
| 3 — şema (yalnız ayrı onayla) | `docs/sifa-rehberi-f3/geri-donus-sema.sql` | Fonksiyonları F3 öncesine döndürür; YH not-çöpü tetikleyicisini kaldırır; eklenen sütunlar ve **TÜM VERİ KALIR** (test: satır md5'leri birebir). Boş başlıklı not / 'baglanti' türü / içerik kutusu varsa eski kısıtlar geri konmaz (dosyada denetim var). |
| — yeniden ileri alma | F3 migration'larını tekrar uygula | Yeni kodun gördüğü kütüphane geri dönüş öncesiyle **birebir** (test: `geri-donus.pg.mts` E). |
| 4 — veri | §1 yedeğinden geri yükleme | Yalnız felaket durumunda; Owner kararı. |

### 3.1 Geri dönüş (seviye 1/3) sırasında eski kodla bilinen davranış — veri kaybı ve yanlış yazım YOK
Kanıt: `scripts/sifa-rehberi-f3/geri-donus.pg.mts` (F3 öncesi gerçek sunucu kodu, git `ee5c25aa`).
| Durum | Eski kodda | Veri |
|---|---|---|
| "Bağlantı" türü kaynağı olan not | **Düzenlenemez / çöpe atılamaz** — kayıt 400 ile reddedilir | Hiçbir satır değişmez |
| Başlığı boş içerik kutusu | **Düzenlenemez** — kayıt 400 ile reddedilir | Hiçbir satır değişmez |
| İçerik kutusu (başlıklı) | Ayrı not gibi görünür; düzenlenebilir | Notuna bağı (`parent_block_id`) KORUNUR (sunucu, anahtar yoksa bağı korur) |
| Kutulu not çöpe atılırsa | Yalnız not çöpe gider | Kutu satırları silinmez; F3'e dönünce notla birlikte Silinenler'de / geri alınınca canlı |
| Grup başlığı | Normal başlık görünür | `node_kind` korunur |
| Yeni kayıt | Eski biçimde yazılır (kutu/grup üretmez) | F3'e dönünce sade not/başlık olarak görünür |
| Kutunun sırası değiştirilirse (ölçüldü, F3-R2) | Kabul edilir | Kutu notunda KALIR, içerik aynı; yalnız not içindeki sırası değişir |
| Kutu başka başlığa taşınmak istenirse (ölçüldü, F3-R2) | Veritabanı tetikleyicisi REDDEDER (422) | Hiçbir satır değişmez — yanlış yazım yok |

Tek kalıcı etki: seviye 1'de kutu sırası değiştirilmişse F3'te o sıra görünür (içerik ve bağ değişmez). Geri dönüş süresi kısa tutulmalı; kullanıcılara düzenleme yerine
okuma önerilir. Kullanıcı başına kota YOKTUR (Owner kararı F3-R1); geri dönüşte de kota uygulanmaz (eski kodda da yoktu).

## 4. Kanıtlar (yerel / izole test projesi; production'a temas YOK)
- `scripts/sifa-rehberi-f3/db.pg.mts` — migration + şema geri dönüşü (CI).
- `scripts/sifa-rehberi-f3/geri-donus.pg.mts` — F3 ÖNCESİ gerçek sunucu kodu (git `ee5c25aa`) + F3 şeması + geri dönüş + ileri alma (CI).
- `scripts/sifa-rehberi-f3/yh-kutu.pg.mts` — YH: çöpteki notun kutuları aramada yok; YH kapalıyken etkisiz; geri dönüşte yalnız yeni tetikleyici kalkar (CI).
- `scripts/sifa-rehberi-f3/counters.pg.mts` — ana ekran + Yönetim paneli Şifa sayacı (CI).
- `scripts/sifa-rehberi-f3/sinirsiz.pg.mts` — kullanıcı kotası / içerik sayısı sınırı YOK (CI).
- `scripts/sifa-rehberi-f3/real/*` — gerçek sunucu + izole test projesi: 613 kabul kontrolü, API/güvenlik.

## 5. Production'da doğrulanmamış (NOT VERIFIED — yalnız yayında)
- Canlı Supabase üzerinde F3 migration süresi ve kilit davranışı (tablolar küçük; saniyeler beklenir).
- Vercel ortamında Storage imzalı yükleme/okuma (test projesinde PASS).
- Gerçek Android uygulama WebView'inde dosya seçici ve Word indirme.
- Canlı veride sayaç değerleri (yalnız sentetik veriyle doğrulandı).
