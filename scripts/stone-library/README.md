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
