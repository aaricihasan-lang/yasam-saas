# ASTROLOJİ AŞAMA 7A — İLERLEME KAYDI (uzman veri izolasyonu + danışan silme güvenliği)

- Başlangıç HEAD: `91fb3836` (Aşama 6.2; temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Commit'ler: `3d4aa726` migration + PG senaryoları · `91fd53b9` uygulama katmanı · `43ecc879` uçtan uca test · `7345a440` yedek şema eşlemesi · (bu rapor)
- Yeni Roxy çağrısı: **0** (toplam 47 aynı). Production / Frankfurt / Tokyo DB: **dokunulmadı**. Push / merge / preview / deploy / prod migration: **yok**.
- Gerçek kişi verisi: **yok** (tüm testler sentetik).

## 1. Gerçek tenant / uzman mimarisi (kanıt)

| Kanıt | Sonuç |
|---|---|
| `supabase/migrations/20260910000000_provisioning_integrity.sql` — `provision_expert`: `v_tenant_id := gen_random_uuid()` → `INSERT INTO tenants` → kullanıcı bu tenant'la yazılır (hem public kayıt hem admin oluşturma) | Yeni her uzman / admin **kendi tenant'ını** alır |
| `users.tenant_id` üzerinde UNIQUE yok (migration'larda arama: yok); yalnız `users_tenant_id_fkey` | DB **aynı tenant'ta birden çok kullanıcıyı engellemez** |
| `lib/demo/demoVitrinFixture.ts` `DEMO_TENANT_ID` (kanonik demo tenant'ı, YH'de de sabit) | Ortak tenant'lar mevcut tasarımda var |
| `app/api/clients/[id]/cascade-delete/route.ts`, `lib/astrology/persistence/repo.ts findTenantClient` — `clients` yalnız `tenant_id` ile kapsanır | Sistem genelinde güvenlik sınırı = **tenant** |
| `docs/yasam-hafizasi/07-phase-5-pii-security.md:89` "her sorgu `tenant_id = :session`. Başka uzmanın verisi asla görünmez" | Mimari varsayım: **tenant = uzman** |

**Kesin cevap:** Ürün akışında her uzman ayrı tenant'tır (provisioning bunu üretir); ancak bu **DB'de zorlanmayan bir sözleşmedir** — aynı tenant'ta birden çok kullanıcı teknik olarak mümkündür (demo tenant'ı, eski/elle oluşturulmuş hesaplar). Astroloji Aşama 7A'dan itibaren bu varsayıma **güvenmez**: tenant + uzman (`owner_user_id`) birlikte zorunludur. Bu, diğer modüllerin tenant modelini değiştirmez; yalnız Astroloji içinde ikinci bir sınır ekler.

## 2. Bulunan veri izolasyonu açıkları (91fb3836'da)

Hepsi yalnız **aynı tenant içindeki başka kullanıcı** için geçerliydi (başka tenant zaten 404). Modül bugün yalnız system owner'a açık olduğundan canlı istismar yolu yoktu; Aşama 7'de uzmanlara açılmadan önce kapatılması şarttı.

| # | Veri yolu | Önceki filtre | Açık | Seviye |
|---|---|---|---|---|
| 1 | Profil liste / detay / revizyon ekleme (`listProfiles`, `getProfile`, `astro_profile_append_revision`) | yalnız tenant | U2, U1'in profillerini listeler, doğum verisini okur, revizyon ekleyebilirdi | P1 |
| 2 | Revizyon (`getRevision`, `listRevisions`) | yalnız tenant | doğum tarihi/saati/konumu okunabilirdi | P1 |
| 3 | Sağlayıcı sonucu / önbellek (`findResultsByHashes`, `getResultById`, `results/[id]`) | yalnız tenant; UNIQUE (tenant, input_hash) | U2 aynı doğum verisinde U1'in sonucunu **yeniden kullanırdı**; sonuç ID'siyle doğrudan açardı | P1 |
| 4 | Sağlayıcı yorumu (`getInterpretation`) | yalnız tenant | sonuç üzerinden U1'in yorum katmanı | P1 |
| 5 | Karma kimlik: `results/[id]?profileId=&revision=` | sonuç ve profil ayrı ayrı yalnız tenant | **kendi** sonuç ID'si + **başkasının** profil/revizyonu → o revizyonun doğum verisi yanıta girerdi | P2 |
| 6 | Sinastri/kompozit karşı tarafı (`resolveSelectionContexts`) | yalnız tenant | U1'in profili U2'nin hesabında karşı taraf olabilirdi (Roxy'ye gönderilirdi) | P1 |
| 7 | Analiz kaydı (`astro_analysis_save_v2`) | profil yalnız tenant; idempotency (tenant, save_request_id) | başka uzmanın profilinden analiz; aynı istek kimliğiyle başkasının analiz ID'si dönebilirdi | P2 |
| 8 | Danışan silme (`astro_bp_client_fk`, `astro_an_client_fk` ON DELETE CASCADE) | — | Danışan Yolculuğu'nda danışan silinince astroloji **profilleri, revizyonları, sonuçları, yorumları, notları ve KAYITLI ANALİZLERİ** silinirdi | P1 (veri kaybı) |

Zaten doğru olanlar (kanıtla): Bilgi Bankası (`lib/astrology/kb/service.ts` her sorgu `tenant_id` + `owner_user_id`), çalışma notları ve kayıtlı analizler (`analyses/service.ts` `owner_user_id` filtreli), analiz notları (yalnız sahipliği doğrulanmış analizden sonra okunur).

## 3. Yapılan düzeltmeler

**DB (migration `20271101000300_astrology_owner_isolation.sql`, yalnız yerel):**
- `owner_user_id` → profil, revizyon, sağlayıcı sonucu, sağlayıcı yorumu (NOT NULL; geri doldurma: profil = `created_by_user_id`, alt kayıtlar profilden/sonuçtan).
- Bileşik FK `(tenant_id, owner_user_id, profile_id)` → profiller: revizyon, sonuç, sonuç karşı tarafı, analiz, analiz karşı tarafı, çalışma notu; yorum → `(tenant_id, owner_user_id, result_id)` sonuçlar. Başka uzmana bağlanma **DB'de reddedilir**.
- Önbellek: `UNIQUE (tenant_id, input_hash)` → `UNIQUE (tenant_id, owner_user_id, input_hash)`.
- RPC'ler aynı imzayla: `astro_profile_create` sahibi yazar; `astro_profile_append_revision` ve `astro_analysis_save_v2` sahibi doğrular (başka uzman = `P0002` yok); idempotency uzman kapsamlı.
- FAIL-CLOSED: sahipliği tutarsız mevcut satır varsa migration durur, hiçbir şey değişmez (test edildi).

**Uygulama (`lib/astrology`):**
- `repo.ts`: profil/revizyon/sonuç/yorum okumaları `owner_user_id` filtreli; yazmalar sahibi yazar; `assertOwner` fail-closed.
- Servisler `ctx.userId` geçirir (profil, engine, analiz). Başka uzmanın kaydı = **404** (varlık sızdırılmaz).
- `resultIdFor(tenant, hash, uzman)` + "işlemde" kilidi uzman kapsamlı (aynı tenant'taki iki uzman çakışmaz / birbirini beklemez). Mevcut satırların kimliği değişmez; önbellek araması hash ile yapılır.
- Arayüzde değişiklik **yok** (izolasyon sunucu tarafında).

## 4. Danışan silme davranışının yeni durumu

- `clients` satırı silinince (Danışan Yolculuğu `cascade-delete` → tek `DELETE FROM clients`): astroloji profili, revizyonları, sonuçları, yorumları, notları ve kayıtlı analizleri **korunur**; yalnız `astro_birth_profiles.client_id` ve `astro_analyses.client_id` **NULL** olur (`ON DELETE SET NULL (client_id)`).
- Kayıtlı analiz snapshot'ı **değişmez** — kayıt anındaki danışan adı snapshot'ta kalır (değişmezlik kuralı). Uygulama silinmiş danışanı adsız gösterir; profil/sonuç/analiz açılır, Roxy çağrısı yapılmaz.
- Aynı ad/soyad/doğum tarihli üç danışandan biri silinince yalnız o bağ kopar (test edildi).
- Danışan Yolculuğu kodu ve diğer modüllerin FK'leri **değişmedi**.
- Astroloji tarafında doğrudan veya dolaylı silme yolu yok: profil/revizyon/sonuç için DELETE API'si yoktur; `service_role` astroloji değişmez tablolarında UPDATE/DELETE yetkisine sahip değildir (PG testinde doğrulandı); tenant/kullanıcı tablolarına astroloji FK'si yoktur.

## 5. Migration dosyaları ve test sonuçları

| Test | Sonuç |
|---|---|
| `npm run test:astrology` (14 TS dosyası) | **318 PASS / 0 FAIL** (Aşama 6.2'deki 300 + 7A 18) |
| PG — eski zincir (000…200, mevcut assert'ler, `--twice`) | PASS (değişmedi) |
| PG — temiz kurulum (000…300 `--twice`, `astrology-7a-assert.sql`) | PASS |
| PG — yükseltme (eski şemada sentetik veri → 300 `--twice`, `astrology-7a-upgrade-assert.sql`): sayılar, snapshot ve sonuç parmak izleri birebir; geri doldurma; danışan silme sonrası veri tam | PASS |
| PG — fail-closed (çapraz-uzman eski veri → 300 durmalı, `expect-migration-fail.mjs`) | PASS ("ASTRO 7A: 1 sağlayıcı sonucu…" ile durdu; şema ve veri aynen) |
| `tsc --noEmit` (uygulama + test tsconfig) | 0 hata |
| Mutasyon — PG assert: danışan FK değişikliği / karşı taraf owner FK'si / RPC sahiplik kontrolü kaldırılınca | 3/3 yakalandı (RPC kaldırılınca DB FK'si yine reddetti) |
| Mutasyon — `repo.ts` sahiplik filtreleri tek tek kaldırılınca `phase7a.harness` | 5/6 yakalandı; `listRevisions` eşdeğer (yalnız sahipliği doğrulanmış profil kimlikleriyle çağrılır) |

Zorunlu senaryolar → test eşlemesi: aynı tenant iki uzman (phase7a + PG temiz); farklı tenant (phase7a UB + PG); aynı kimlikli üç danışan (phase7a kurulum + PG); başka uzmanın profil ID'si (phase7a 404'ler); başka uzmanın analiz ID'si (phase7a); önbellekten yetkisiz sonuç (phase7a: ID ile, karma kimlik, aynı doğum verisiyle yeniden kullanım); provider yorumu (phase7a: hiçbir yanıtta U1 anlatısı yok + enjekte satır görünmez); danışan silme (phase7a + PG temiz + PG yükseltme); snapshot bütünlüğü (phase7a birebir + PG parmak izi); regresyon (318 PASS).

Production için uygulama sırası (owner onayı ile, ileride): `20271101000000` → `000100` → `000200` → `000300`, **sonra** kod. Kod `owner_user_id` yazar; migration'sız ortamda modül zaten kill switch ile kapalıdır.

## 6. P0 / P1 / P2 / P3

- **P0 = 0.**
- **P1 = 0 açık** (2. bölümdeki P1'ler kapatıldı).
- **P2 = 0 açık.**
- **P3 (açık, bilgi):**
  1. `astro_unmapped_fields` tenant'sız sistem denetim tablosudur (yalnız alan yolları, değer yok). Aşama 7'de uzmanlara açılmamalı; system owner'a özel kalmalı.
  2. `astro_analysis_save` (v1) kodda kullanılmıyor; idempotency'si tenant genelinde. Bileşik FK onu da sahiplik dışına çıkamaz kılıyor (PG testinde doğrulandı). İleride kaldırılabilir.
  3. Danışan silindiğinde astroloji profili doğum verisini, snapshot ise kayıt anındaki danışan adını korur (ürün kararı gereği). KVKK silme talebi için Astroloji'nin **kendi** profil silme/arşiv akışı henüz yok — sonraki aşamalarda tasarlanmalı.
  4. Başka uzmanın profil kimliğiyle `GET /analyses?profileId=` 404 yerine `200 []` döner (veri/varlık sızmaz; tutarlılık için 404 yapılabilir).
  5. `backup.harness` tek FAIL'i `yasam_hafizasi_*` şema eşlemesi sapmasıdır; bu branch'te YH migration'ı değişmedi (`git diff 91fb3836 HEAD -- supabase/migrations` yalnız 7A dosyası) → önceden var olan, kapsam dışı.
  6. Merkezî `clients` sistem genelinde tenant kapsamlıdır; bir tenant'ta birden çok kullanıcı olursa danışan seçicisi tenant'ın tüm danışanlarını gösterir. Bu Astroloji'nin değil sistemin modelidir; Danışan Ön İzleme tasarımında (7. bölüm) "yetkili olduğu danışanlar" = Danışan Yolculuğu ile aynı erişim kuralı olarak tanımlandı.

## 7. Astroloji dışındaki modüllerin etkilenmediğinin kanıtı

- `git diff --stat 91fb3836..HEAD`: yalnız `lib/astrology/**`, `scripts/astrology/**`, `supabase/migrations/20271101000300_astrology_owner_isolation.sql`, `package.json` (yalnız `test:astrology*` betikleri), `lib/backup/schema.generated.ts` (yalnız 4 `astro_*` satırı), bu rapor.
- `static.harness`: "origin/main'e göre Human Design / mühürlü modül dosyası değişmedi" PASS (izin listesine yalnız 7A migration'ı eklendi).
- Migration yalnız `astro_*` tablolarını değiştirir; `public.clients`'e yalnız okuma/FK referansı vardır (`clients` şeması, diğer modüllerin FK'leri, `cascade-delete` route'u değişmedi).
- Danışan Yolculuğu'na hiçbir veri akışı eklenmedi; `event_kind` kolonuna "entegrasyon için değildir" yorumu eklendi.

## 8. TASARIM KAYDI — Danışan Ön İzleme (bir sonraki aşama; bu aşamada arayüz YOK)

**Amaç:** Uzman Astroloji'de bir doğum profilini merkezî danışan kaydıyla **yalnız kimlik tanıma** amacıyla, açık onayla ve geri alınabilir biçimde eşleştirir.

1. **Aday önerisi:** Uzman danışan kimlik bilgilerini (ad, soyad, doğum tarihi) girerken sunucu, uzmanın **erişmeye yetkili olduğu** merkezî danışanlar arasından olası eşleşmeleri döner. "Yetkili" = Danışan Yolculuğu'nun kullandığı erişim kuralının aynısı (bugün tenant; ileride uzman bazlı kural gelirse ona uyar). Yetkisiz danışan aday listesine **girmez**; arama sunucu tarafında yapılır, istemci filtrelemez.
2. **Aynı kimlik:** Aynı ad + soyad + doğum tarihiyle birden çok kayıt olabilir; liste hepsini ayrı ayrı, ayırt edici kısa bilgilerle gösterir. Otomatik seçim / otomatik eşleştirme **yapılmaz**.
3. **Danışan Ön İzleme düğmesi:** Astroloji ekranından ayrılmadan, masaüstünde ekranın ortasında yaklaşık **yarım sayfa genişliğinde**, **salt okunur** bir pencere açar. Yalnız ayırt edici temel bilgiler (ör. ad soyad, doğum tarihi, kayıt tarihi, iletişimden maskeli bir parça gibi sınırlı alanlar) gösterilir; düzenleme yok, Danışan Yolculuğu içeriği (seans, not, anamnez vb.) yok. Mobilde aynı içerik tam genişlikte açılır.
4. **Açık onay:** Uzman doğru danışanı seçip onaylar; sunucu bağı yeniden doğrular (danışan hâlâ var ve yetkili mi) ve yalnız `astro_birth_profiles.client_id` yazar.
5. **Kullanım sınırı:** Bağ yalnız (a) danışan kimliğini tanımak ve (b) o danışan için Astroloji'de kayıtlı analiz bulunup bulunmadığını göstermek için kullanılır. Danışan Yolculuğu'na **harita, teknik hesaplama, yorum veya rapor taşınmaz**; Danışan Yolculuğu tarafına Astroloji verisi okunmaz/gösterilmez.
6. **Geri alınabilirlik:** Eşleştirme kaldırılabilir (bağ NULL). Kayıtlı analizlerin snapshot'ı değişmez (kayıt anındaki danışan bilgisi korunur); yeni analizler yeni bağı kullanır.
7. **Silme:** Danışan silinirse bağ otomatik NULL olur (7A ile hazır); Astroloji kayıtları korunur.
8. **Güvenlik testleri (o aşama için):** yetkisiz danışanın adayda görünmemesi; başka tenant/uzman danışan kimliğiyle doğrudan bağ kurma 404; aynı kimlikli üç danışanda yanlış seçimin geri alınabilmesi; ön izleme yanıtında yalnız izinli alanlar; bağ kaldırma sonrası snapshot bütünlüğü.

## 9. Bir sonraki aşamaya hazırlık

Aşama 7A kapsamı tamamlandı: Astroloji verisi uzman bazında sunucu ve DB katmanında izole; danışan silme Astroloji verisini artık silmiyor. **Bir sonraki aşamaya (uzman yetkileri / Danışan Listesi / Danışan Ön İzleme) teknik olarak hazır**; geçiş owner onayına bağlıdır. Production migration için ayrıca owner onayı gerekir.

**Aşama 7A yerel olarak tamamlandı. Push / preview / merge / production / migration YOK. DUR — owner raporu bekleniyor.**
