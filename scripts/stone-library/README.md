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
npx tsx scripts/stone-library/f1-harness.ts            # 251 kontrol: bağımsızlık, RLS, yetki, gizlilik, arama, sürüm, geri alma
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
- Hazırlık kapısı `STONE_LIBRARY_ENABLED` (yalnız tam `"true"`). Yoksa tüm kütüphane uçları DB'ye gitmeden 404.

## Prod uygulama sırası (YALNIZ owner onayıyla — bu dalda YAPILMADI)

1. `sql/preflight_readonly.sql` → `READY_TO_APPLY`
2. Migration `20271201000000` uygula
3. `sql/postflight_readonly.sql` → `POSTFLIGHT PASS`
4. Kodu deploy et (env **eklenmeden** kütüphane uçları 404 kalır)
5. F2/F4 hazır olduğunda `STONE_LIBRARY_ENABLED=true`

Geri dönüş: `SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F1';` + `sql/ROLLBACK_20271201000000.sql`
(kütüphanede veri varsa kendiliğinden durur; mevcut tablolara dokunmaz).
