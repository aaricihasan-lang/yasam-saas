# Doğaltaş Kütüphanesi — F1 (veritabanı altyapısı + güvenlik temeli)

Uzmanların kendi taş kayıtlarından **tamamen bağımsız**, tenant'sız, çok kaynaklı ve sürümlü global referans kütüphanesi.
F1 yalnız altyapıdır: gerçek aktarım (F2), içerik onayı ekranı (F3) ve uzman arayüzü (F4) bu dalda **yoktur**.

## Dosyalar

| Dosya | Amaç |
|---|---|
| `supabase/migrations/20271201000000_stone_library_core.sql` | 17 yeni `stone_library_*` tablo, tetikleyiciler, owner / uzman RPC'leri, ayrıcalıklar (additive) |
| `lib/stone-library/contract.ts` | Saf sözleşme: RPC adları, alanlar, DTO tipleri, sağlık uyarısı |
| `lib/stone-library/fold.ts` | Türkçe harf katlama (DB `stone_library_fold` ile birebir) |
| `lib/stone-library/access.ts` | Owner / uzman erişim kapıları (mevcut auth zincirini yalnız çağırır) |
| `lib/stone-library/expertDto.ts` | Uzman yanıtı beyaz listesi + sızıntı taraması (ikinci kilit) |
| `app/api/dogaltas/kutuphane/route.ts` | `GET` arama (yalnız yetkili uzman + owner) |
| `app/api/dogaltas/kutuphane/[slug]/route.ts` | `GET` taş kartı |
| `lib/backup/ownerPilotTables.ts` (+`schema.generated.ts`) | Tablolar yedek DIŞI olarak sınıflandırıldı |
| `scripts/stone-library/sql/*` | Prod paketi: salt-okunur preflight / postflight + korumalı ROLLBACK |

## Testler (yerel, sentetik veri, prod'a temas YOK)

```bash
npx tsx scripts/stone-library/f1-harness.ts            # 305 kontrol: bağımsızlık, RLS, yetki, gizlilik, arama, sürüm, geri alma, lisans bitişi, ölçek
node scripts/stone-library/pg/rollback-check.mjs        # preflight / postflight / ROLLBACK provası
node scripts/final-hardening/pg-migration-check.mjs --fixture scripts/stone-library/pg/fixture.sql \
  --migration supabase/migrations/20271201000000_stone_library_core.sql --twice \
  --assert scripts/stone-library/sql/postflight_readonly.sql
```

## Güvenlik modeli (özet)

- **Hiçbir rolün tablolara doğrudan ayrıcalığı yok** (anon / authenticated / **service_role** dahil, SELECT de yok).
  Sunucu kodu bile gerçek kaynak adını, lisansı veya ham veriyi tablodan okuyamaz.
- Tüm erişim `SECURITY DEFINER` RPC'lerle. Owner RPC'leri işlemi yapanın **platform owner** olduğunu DB'de yeniden doğrular
  (`is_super_admin` + `admin` + aktif + demo değil). Uzman RPC'leri izleyicinin **etkin kütüphane yetkisini** DB'de yeniden doğrular.
- Uzman yalnız `stone_library_published` yüzeyini görür. Bu yüzey yalnız **yayımlanmış taş + onaylı + görünür kayıt** (+ sağlık
  içeriği için hukuk onayı **ve** genel kilit) üzerinden üretilir. Kaynak etiketi DB'de çözülür (gerçek ad / owner adı / gizli).
- Uzman yetkisi varsayılan **hiç kimse**; owner kişi bazında verir (`stone_library_grant_access`). Rol veya tenant değişirse
  yetki kalıcı iptal edilir. Pasiflik, onay bekleme ve Doğaltaş modül izninin kapanması yalnız geçici reddeder.
- Kaynak metni değiştirilemez (düzeltme = yeni sürüm). Ham veri, işlem kaydı, inceleme ve sürüm geçmişi append-only.
  Fiziksel silme yok → `stone_library_delete` / `stone_library_restore` (geri alınabilir, bağımlılık kontrollü).
- Lisans süresi dolan kaynağın içeriği, uzman okumasından önce yayın yüzeyinden çekilir (zamanlayıcı gerekmez).
- Aktör kolonları users'a FK değildir: kütüphanede işlem yapmış owner/admin hesabı silinebilir, denetim izi uuid olarak kalır.
- Roxy kaynağı 'gerçek ad' ile gösterilemez (marka kuralı); yalnız gizli veya owner adı.
- Hazırlık kapısı `STONE_LIBRARY_ENABLED` (yalnız tam `"true"`). Yoksa tüm kütüphane uçları DB'ye gitmeden 404.

## Prod uygulama sırası (YALNIZ owner onayıyla — bu dalda YAPILMADI)

1. `sql/preflight_readonly.sql` → `READY_TO_APPLY`
2. Migration `20271201000000` uygula
3. `sql/postflight_readonly.sql` → `POSTFLIGHT PASS`
4. Kodu deploy et (env **eklenmeden** kütüphane uçları 404 kalır)
5. F2/F4 hazır olduğunda `STONE_LIBRARY_ENABLED=true`

Geri dönüş: `SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F1';` + `sql/ROLLBACK_20271201000000.sql`
(kütüphanede veri varsa kendiliğinden durur; mevcut tablolara dokunmaz).

---

# F2 — Aktarım motoru, owner yönetim API'leri, lisanslı görseller

Ön koşul: F1 (PR #552). F2 migration'ı `20271201000100_stone_library_f2.sql`, `build-f2-migration.py` ile üretilir
(`sql/f2_head.sql` + F1'deki 5 fonksiyonun genişletilmiş gövdesi + `sql/f2_tail.sql`); elle düzenlenmez.

| Bileşen | Dosya |
|---|---|
| Sağlayıcı istemcisi (yalnız GET, beyaz liste, zaman aşımı, anahtar yalnız başlıkta) | `lib/stone-library/import/roxyCrystalsClient.ts` |
| Normalizasyon (bileşik değer bölme, renk aileleri, bilinmeyen alan raporu) | `lib/stone-library/import/roxyNormalize.ts` |
| Dil kalitesi (TR silinmez; `lang_suspect` işaretlenir) / sağlık sözlüğü (kök + dilden bağımsız + diller arası) | `langQuality.ts`, `healthLexicon.ts` |
| Görsel doğrulama + optimize WebP (magic byte, MIME, piksel sınırı, tam çözümleme, SHA-256) | `imageProcess.ts` |
| Aktarım motoru (önce defter, yeniden kullanım, sınırlı deneme, kota tabanı, süre bütçesi) | `runner.ts` |
| Owner yönetim uçları (yalnız owner; uzman 404) | `app/api/admin/dogaltas-kutuphane/**` |
| Uzman görsel ucu (bayt; URL / yol yok; lisans doğrulanmış + SHA eşleşmeli) | `app/api/dogaltas/kutuphane/[slug]/gorsel/route.ts` |

Testler (yerel, sentetik; gerçek sağlayıcıya çağrı YOK):

```bash
npx tsx scripts/stone-library/f2-harness.ts          # 201 kontrol: aktarım senaryoları, owner API, görsel, güvenlik, performans
node scripts/stone-library/pg/f2-rollback-check.mjs   # F2 postflight + yalnız-F2 geri dönüş + F1 onarımı
```

Gerçek sağlayıcıdan YEREL aktarım (yalnız owner izniyle; çıktı Git dışı klasöre):

```bash
RUN_REAL_IMPORT=EVET OUT_DIR=C:/YasamSistemi-QA/<klasör> TERMS_SHA256=<64 hex> npx tsx scripts/stone-library/f2-local-import.ts
OFFLINE_REPLAY=1 VERIFY_SEARCH=1 OUT_DIR=... TERMS_SHA256=... npx tsx scripts/stone-library/f2-local-import.ts   # 0 kredi, ağ yok
```

Prod sırası (owner onayıyla): F1 preflight → F1 → F1 postflight → F2 → `sql/f2_postflight_readonly.sql` → deploy →
owner kaynak + lisans izni kaydı → `aktarim` ucu. Geri dönüş: `sql/ROLLBACK_20271201000100.sql` ardından F1 migration'ı yeniden uygulanır.

# F3 — İçerik yayın modeli, kaynak verisi koruması, sağlık C modeli (varsayılan KAPALI)

Migration `supabase/migrations/20271201000200_stone_library_f3.sql` (üretici: `python scripts/stone-library/build-f3-migration.py`;
kaynaklar `sql/f3_head.sql` + yamalanmış F2 yayın üretimi / uzman araması + F1 facet ekleme + `sql/f3_tail.sql`). Yeni tablo YOK.

- **Yayın durumları:** `draft → review → ready → published → hidden` (yayından kaldırılmış). Yayın yalnız `ready` / `hidden`
  durumundan ve `stone_library_readiness` engelleri boşsa (bekleyen kayıt / facet / görsel, görünür içerik yok). Uyarılar
  (gizli kalacak sağlık içeriği, dil şüphesi, yayımlanamayan görsel, kaynakta yeni sürüm) owner'a döner, yayını engellemez.
- **Kaynak verisi koruması (DB tetikleyicileri, `kind='api'`):** owner düzenlemesi / owner metni yok (SL037); kaynak kaydı ve
  her yapısal değer ham yanıta bağlı olmak zorunda (SL038) ve ham yanıt o taşa ait olmalı (SL094); taş adı yalnız ham yanıttaki
  adla aynı olabilir — silinmiş bağlantılar dahil; harici kimlik bağlanırken / geri getirilirken de (SL039); Roxy alan–yol
  kuralı (SL012); veri bağlı kaynağın türü / sağlayıcı kodu değişmez (SL093); API kaynağında paket dışı facet otomatik
  onaylanmaz; alternatif ad RPC'si kapalı. F2 birebir kuralı korunur. Owner API'sinde metin düzenleme ucu kaldırıldı.
- **Sağlık C modeli:** ayar `health_publication_mode` (`legal_review` varsayılan | `owner_decision`), `owner_decision_ref`,
  taş bazında owner kararı (`stone_library_health_decision`, yazılı not zorunlu). Genel kilit iki modda da ayrıca açılmalı.
  Owner kararı `legal_cleared_*` alanlarına yazılmaz. Uzman belgesinde `medical_notice` (ayrı bileşen), `has_health_content`,
  alan bazında `health_related`; kaynak metinlerin içine hiçbir şey eklenmez.
- **Görsel–taş eşleşmesi:** harici kimlik taşın kendi kimliği, optimize sürüm kendi özgününden, kaynak URL ham yanıttaki adresle
  aynı olmak zorunda (SL089); yayın ve uzman görsel ucu bağı her okumada yeniden doğrular.
- **Bütünlük:** `stone_library_integrity` (iç) + owner ucu; bütünlüğü bozuk taş yayına hazır / yayında olamaz (`integrity_failed`).
- **Arama / filtre:** önizleme ilk 240 karakter + `…` (ayrıntıda tam metin); `GET /api/dogaltas/kutuphane?filtreler=1` filtre
  kataloğu (yalnız yayındaki değerler + sayılar); anahtar kelimeler kaynak sırasıyla.
- **Owner uçları:** `taslar/[id]` (hazırlık + bütünlük; `review|ready|publish|withdraw|draft|health_allow|health_revoke`),
  `inceleme` (`bulk_approve`), `butunluk` (ham yanıtla birebir + SHA-256).

| Test | Komut |
|---|---|
| F3 sentetik harness | `npx tsx scripts/stone-library/f3-harness.ts` |
| F3 gerçek veri (çevrimdışı, 0 kredi; veri Git dışında) | `F2_DIR=… OUT_DIR=… LICENSE_FILE=… TERMS_SHA256=… npx tsx scripts/stone-library/f3-real-data.ts` |
| F3 postflight + geri dönüş provası | `node scripts/stone-library/pg/f3-rollback-check.mjs` |

Prod sırası (owner onayıyla — YAPILMADI): F1 → F1 postflight → F2 → F2 postflight → F3 → `sql/f3_postflight_readonly.sql`.
Geri dönüş (TEK ADIM, üretilir): `sql/ROLLBACK_20271201000200.sql` — F3'ün değiştirdiği fonksiyonların özgün F1 / F2 gövdelerini
aynı işlemde geri kurar → ardından `sql/f2_postflight_readonly.sql` PASS. F3'e özgü veri varsa (incelemede / yayına hazır taş,
owner sağlık kararı, owner_decision modu, değiştirilmiş tıbbi bilgilendirme metni) durur.
**Not:** F1 ya da F2 migration'ı F3'ten SONRA tek başına yeniden uygulanırsa F3 gövdeleri (durum, ayarlar, facet ekleme, yayın)
eskiye döner; onarım gerekiyorsa F1 → F2 → F3 sırasıyla birlikte uygulanır.

---

# F6-C — Kaynak adresi sabitleme, 0300 tek işlem, 0 kredili yeniden oynatma aktarımı

- **Kaynak adresi sabitleme (3 katman):** `isOfficialCrystalsBaseUrl` (yalnız `https://roxyapi.com/api/v2`); aktarım motoru resmî
  olmayan tabanla paket açmaz (`base_url_not_official`); `stone_library_raw_put` beyaz liste dışı ucu reddeder (**SL067**, ayrım tüketilmez).
  `f6-offline-import.ts` başka bir `ROXY_API_BASE_URL` ile durur.
- **0300 tek işlem:** migration `BEGIN; … COMMIT;` ile sarıldı (üretici: `build-f6-raw-guard.py`). Yarıda hata → rol / tablo / yetki izi kalmaz.
- **Yeniden oynatma (0 kredi, ağ yok):** `f6-offline-import.ts --replay-dir <F2> --replay-manifest <F4-T3 json> --credit-cap 1000 --confirm-replay`.
  Başlamadan 182 ham JSON (F4-T3 kaynak SHA) + 91 orijinal görsel (görsel manifesti SHA) doğrulanır; tek uyuşmazlıkta hiçbir şey yazılmaz.

| Test | Komut |
|---|---|
| Ön denetim + adres (saf) | `npx tsx scripts/stone-library/f6c-replay-harness.ts` (gerçek paket: `REAL_F2_DIR=… REAL_MANIFEST=…`) |
| SL067 + motor adres reddi | `npx tsx scripts/stone-library/f6-harness.ts` |
| 0300 atomiklik | `node scripts/astrology/pg/expect-migration-fail.mjs --expect "cannot change return type" --fixture scripts/stone-library/pg/fixture.sql --fixture <0000> --fixture <0100> --fixture <0200> --fixture scripts/stone-library/pg/f6c-atomic-conflict.sql --migration <0300> --assert scripts/stone-library/pg/f6c-atomic-assert.sql` |
