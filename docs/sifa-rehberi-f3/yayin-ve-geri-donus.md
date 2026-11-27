# Şifa Rehberi F3 — Yayın Sırası, Manuel Yedek ve Geri Dönüş

**Kapsam:** Onaylı F2 Revizyon 7 tasarımının ürüne entegrasyonu (kişisel kütüphane). Bu belge yayın ÖNCESİ hazırlanmıştır;
production'da hiçbir adım uygulanmamıştır. Her adım **ayrı Owner onayı** ister.

## 0. Ön koşullar (değişmez kurallar)
- Production'da şu an: `20280110000000` (çekirdek) + `20280110000100` (YH sahiplik) uygulanmış; `20280124000000` (görsel yaşam döngüsü) **uygulanmamış**.
- Supabase **Free plan**: zamanlanmış yedek ve PITR **yok** → migration'dan önce manuel yedek ZORUNLU (§1).
- Kullanıcı hesaplarına ve diğer modüllerin kayıtlarına dokunulmaz. Migration'lar yalnız `sifa_*` tablolarını, `sifa_*` fonksiyonlarını ve
  (`20280130000300`) Şifa'ya özel bir YH tetikleyicisini ekler; genel `yh_cdc_enqueue()` ve diğer modüllerin tetikleyicileri DEĞİŞMEZ.
- Mevcut Şifa kayıtları (Owner: hepsi test amaçlı) **silinmez, taşınmaz, değiştirilmez** — F3 migration'ı yalnız sütun/kısıt/fonksiyon ekler.
- Yaşam Hafızası **kapalı kalır**: `yh_source_activation('sifa_rehberi_v2:notes')` açılmaz; `20280130000300` tetikleyicisi kapalıyken sessiz no-op'tur.

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

## 2. Yayın sırası (F4-R1 — DB-03 kurallarına uygun KESİN sıra)

DB-03 uygulama kapısı yalnız **main'e merge edilmiş** SQL'i uygular (`MAIN_DEGIL`) → migration'lar merge'den SONRA uygulanır.
Yeni kod eski şemayla güvenle çalışsın diye merge'den doğan dağıtım **bakım modunda** açılır (Şifa kapalı; diğer modüller normal).
Not: F3 ÖNCESİ kodda (bugünkü production) bayrak kapatmak bakım DEĞİLDİR — o kod bayrak kapalıyken V1 ekranını açar ve V1 API'leri
bayrakla korunmaz. Gerçek bakım yalnız F3 kodu dağıtıldığında vardır; bu yüzden bayrak, merge'den ÖNCE 0 yapılır ve merge'in
dağıtımı bakımda açılır.

| # | Adım | Kim | Başarı ölçütü | Başarısız olursa (güvenli geri dönüş) |
|---|---|---|---|---|
| 0 | PR #875 üç migration'ı içerir ve DB-03 defterinde PR'a BAĞLI: `20280130000200`, `20280130000300`, `20280130000400` | Claude | CI'da DB-03 kapısı yeşil | Yayın başlamaz. |
| 1 | PR #875 CI güncel main üzerinde yeşil; DB-03 kapısı yeşil | Claude | 18/18 | Yayın başlamaz. |
| 2 | Vercel Production ortam değişkeni `SIFA_REHBERI_V2_ENABLED=0` (yeniden dağıtım YOK; mevcut dağıtım kendi değeriyle sürer) | Owner | Değişken kayıtlı | Değeri `1`'e geri al (etkisi yok). |
| 3 | Owner **merge** → otomatik dağıtım (F3 kodu, bayrak 0 → Şifa bakımda) | Owner | Dağıtım hazır; `/sifa-rehberi` "bakımda"; tüm `/api/sifa-rehberi-v2/*` 404; ana sayfa / giriş / diğer modüller 200 | Vercel'de önceki dağıtımı **Promote** (eski kod + eski şema = bugünkü hâl) ve değişkeni `1` yap. Veri değişmemiştir. |
| 4 | **Manuel yedek + geri yükleme provası** (§1) | Claude/Owner | §1.3 eşleşmeleri birebir | DUR: migration UYGULANMAZ; Şifa bakımda kalır (veya adım 3'ün geri dönüşü). |
| 5 | `uygula-prod.mjs` KURU çalıştırma ×3 (`20280130000200`, `20280130000300`, `20280130000400`) + `denetle` | Claude | Üçü de hazır; kapı dışı 0 / kayıp 0 | DUR; neden raporlanır. |
| 6 | Sırayla `--uygula`: `20280130000200` (F3) → `20280130000300` (YH kutu yayılımı) → `20280130000400` (ileri yaşam döngüsü + yayın hazırlık işareti); her birinden ÖNCE ve SONRA salt-okunur kontrol (§2.2). `20280124000000` UYGULANMAZ (§2.1) | Claude | Her biri kapıdan geçti; §2.2 PASS | Kapı tek işlemdedir: hata = tam geri alma → sonrakiler uygulanmaz, Şifa bakımda kalır. Ön koşullar sırayı zorlar (YH yoksa 000400 YSM02). `UYGULAMA_BELIRSIZ` → önce `uzlastir`; yeniden deneme YOK. Felakette §1 yedeği (Owner kararı). |
| 7 | Salt-okunur son doğrulama (§2.2) + `denetle` | Claude | PASS | Şifa bakımda kalır; sorun incelenir. |
| 8 | `SIFA_REHBERI_V2_ENABLED=1` + aynı commit'in **yeniden dağıtımı** (Redeploy) | Owner | Şifa F3 ekranı açık | Değişkeni `0` yap + yeniden dağıtım (seviye 2 bakım). |
| 9 | Canlı kabul (Owner izniyle, test hesabıyla; masaüstü + Android) | Owner + Claude | Kabul listesi | Seviye 2 bakım (§3). |

**Geçiş penceresi (adım 3–8: F3 kodu + eski şema, Şifa bakımda) — yan etkiler (F4-R1'de test edildi):**
- Şifa ekranı ve 7 API işleyicisinin TAMAMI bayrağı kimlik/veritabanından ÖNCE denetler → 404; açık eski sekme / Android yazamaz
  (`real/bakim.real.mts`). Ana ekran ve Yönetim paneli Şifa sayaçları eski şemada doğru sayar (`counters.pg` `SIFA_ESKI_SEMA=1`).
- **Uygulama içi yedek eski şemada ÇALIŞIR** (önceki "hata verir" notu YANLIŞTI): dışa aktarım `select *`; geri yüklemede şemada
  olmayan sütun raporlanıp düşülür; yeni kayıt defteri yalnız çekirdek şemayla `backup-v2.pg` 39/0. Bu pencerede F3 biçimli
  kayıt oluşmaz (Şifa kapalı) → yedekte F3 sütunu kaybı söz konusu değildir.
- Yaşam Hafızası Şifa kaynağı production'da kapalı (aktivasyon kaydı yok, kuyruk 0) → F3 okuyucusu çalışmaz.
- `trash.ts` (yaşam döngüsü fonksiyonları) hiçbir rotaya / zamanlanmış işe bağlı değil.
- Bakımdan ÖNCE alınmış imzalı yükleme bağlantısı (en fazla ~2 saat geçerli) Storage'a dosya bırakabilir; kesinleştirme 404 →
  **kayıt oluşmaz**, dosya sahipsiz kalır (veriye bağlanmaz; sonradan Owner onaylı temizlikle silinebilir).

### 2.1 `20280124000000` — UYGULANMAZ; yerine ileri yönlü `20280130000400`
`20280124000000` production'a hiç uygulanmadı (gerçek şema karşılaştırması: production'daki 6 yaşam döngüsü fonksiyonu "yalnız
çekirdek" ile birebir). DB-03 onu "gecmis prod:false" olarak dondurdu; kapı onu uygulamaz (`AYIRMA`) ve dosya kapının SQL yapı
kuralına da uymaz (`SQL_YAPI`). DB-03 GEVŞETİLMEDİ, defter elle değiştirilmedi: gereken değişiklik merkezi defterden yeni numara
alan ileri migration `20280130000400_sifa_v2_asset_lifecycle_ileri.sql` ile yapılır (`scripts/sifa-rehberi-f3/gen-lc-ileri.mjs`
üretir — 20280124'ün F3 ile çakışmayan 4 fonksiyonu AYNEN; `__block_dead` / `__asset_in_use` F3'te). Kanıt:
`scripts/sifa-rehberi-f3/lc-ileri.pg.mjs` (gerçek defter + kapı, izole). `20280124000000` dondurulmuş hâliyle main'de kalır.

### 2.1b Yayın hazırlık işareti — üç migration bitmeden Şifa AÇILAMAZ
`20280130000400` son adımda `sifa_v2_f3_hazir()` fonksiyonunu kurar (kapı ön koşulu: F3 + YH uygulanmış). Uygulama Şifa ekranını
ve 7 API işleyicisini **bayrak açık olsa bile** yalnız bu işaret `true` dönerse açar (`lib/sifa-rehberi-v2/server/realRoute.ts`
`sifaV2Ready` / `sifaEkranAcik`; işaret yok / hata → "bakımda", API 404; sonuç 30 sn önbellek). Böylece adım 8'deki bayrak yanlışlıkla
erken açılsa bile eksik şemayla yazma olmaz. Şema geri dönüşü (`geri-donus-sema.sql`) işareti kaldırır → Şifa kapanır.
Kanıt: `scripts/sifa-rehberi-v2/routes.harness.ts` bölüm 1b (işaret yokken 7 işleyici 404, ekran kapalı; işaret gelince açık).

### 2.2 Migration öncesi / sonrası salt-okunur kontroller
- Öncesi: proje kimliği `wctopfooajbpupeyukpd`; migration geçmişinde hedef sürüm YOK; §1.2 sayımları; `sifa_*` fonksiyon listesi.
- `20280130000200` sonrası: `node_kind`, `parent_block_id`, `content_updated_at` sütunları + `sifa_blocks_guard_nest_trg` var;
  eski sütunların satır md5'i öncesiyle BİREBİR; `sifa_v2_upload_usage` YOK (kullanıcı kotası yok).
- `20280130000300` sonrası: `yh_cdc_sifa_v2_note_trash_trg` var; `yh_source_activation('sifa_rehberi_v2:notes')` kaydı YOK (YH kapalı); `sifa_v2_f3_hazir()` HENÜZ YOK (Şifa kapalı).
- `20280130000400` sonrası: `sifa_v2_gc_candidates`, `sifa_v2_gc_purge`, `sifa_v2_trash_candidates`, `sifa_v2_trash_purge` 20280124 gövdeleriyle; `sifa_v2_f3_hazir()` = true (yalnız service_role); `sifa_v2__block_dead` / `__asset_in_use` F3 tanımında.
- Her adımda: diğer modüllerin tablo sayıları değişmez; `denetle` kapı dışı 0 / kayıp 0.

**Migration uygulama yöntemi (DB-03, zorunlu):** yalnız `scripts/migrations/numara/uygula-prod.mjs` (önce kuru çalıştırma, sonra
`--uygula`), her çağrı TEK sürüm, §2 sırasıyla.

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
- `scripts/sifa-rehberi-f3/lc-ileri.pg.mjs` — ileri yaşam döngüsü migration'ı: yanlış seçim, sıra, SHA-256, tekrar, eşzamanlılık, production uyumu, hazırlık işareti (CI).
- `scripts/sifa-rehberi-f3/real/bakim.real.mts` — bakım modu (bayrak 0): ekran kapalı, açık sekme / Android yazamaz, veri birebir, diğer modüller çalışır.
- `scripts/sifa-rehberi-f3/real/*` — gerçek sunucu + izole test projesi: 613 kabul kontrolü, API/güvenlik.

## 5. Production'da doğrulanmamış (NOT VERIFIED — yalnız yayında)
- Canlı Supabase üzerinde F3 migration süresi ve kilit davranışı (tablolar küçük; saniyeler beklenir).
- Vercel ortamında Storage imzalı yükleme/okuma (test projesinde PASS).
- Gerçek Android uygulama WebView'inde dosya seçici ve Word indirme.
- Canlı veride sayaç değerleri (yalnız sentetik veriyle doğrulandı).
