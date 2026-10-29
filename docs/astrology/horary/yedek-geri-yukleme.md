# William Lilly Horary kayıtları — yedek ve geri yükleme

> Durum: doğrulandı (yalnız yerel geçici PostgreSQL, sentetik kayıtlar). Üretim yedek politikası **değiştirilmedi**.

## Hangi yolda ne durumda?

| Yol | Horary kayıtları | Kanıt |
|---|---|---|
| **Tam veritabanı yedeği** (Altın Yedek: `pg_dump` → `pg_restore`) | **Kapsar** — tablo listesi gerekmez; migration canlıya uygulandıktan sonraki ilk tam yedekte yer alır. | `npm run test:astrology:horary-backup` H-A1…H-A5: satırlar birebir; RLS, tetikleyiciler, yetkiler ve FK `SET NULL` geri yüklenen veritabanında çalışır. |
| **Uygulama içi tenant yedeği / veri aktarımı** (`lib/backup` registry) | **Kapsamaz** — Owner kararı: tüm `astro_*` tabloları owner-only pilot olarak dışlanır (`OWNER_PILOT_EXCLUDED_TABLES`, "Aşama 5 kararı"). Horary de aynı listede. | `backup.harness`: tablo sınıflandırılmış; dışlama gerekçesiyle kayıtlı. |
| **Hesap / tenant kalıcı silme** (`admin_purge_archived_expert`) | **Kapsar** — `tenant_id` keşfi. | `npm run test:astrology:horary-pg` H25–H26 (sentetik, geri alınan). |

## Bağımsız tenant aracı (Owner'ın açıkça çalıştırdığı)

`scripts/astrology/horary-records-backup.mjs` — yalnız Horary kayıtları, yalnız verilen tenant. Hiçbir otomatik yedek akışına, route'a veya zamanlayıcıya bağlı değildir.

```
HORARY_BACKUP_DATABASE_URL=… node scripts/astrology/horary-records-backup.mjs export  --tenant <uuid> --file horary.json
HORARY_BACKUP_DATABASE_URL=… node scripts/astrology/horary-records-backup.mjs restore --tenant <uuid> --file horary.json --dry-run
```

- **Dışa aktarma:** satır başına SHA-256, manifest özeti; dosya üzerine yazılmaz (`wx`, `0600`).
- **Geri yükleme:** tek transaction olarak çalışır.
  - Kurcalanmış dosya, tenant uyuşmazlığı ya da hedefte farklı içerikli aynı kimlik → **hiçbir satır yazılmaz**.
  - Aynı içerikli kayıt atlanır (idempotent).
  - Hedefte bulunmayan danışan → kayıt korunur, `client_id` NULL olur ve raporlanır.
  - Soru metni olduğu gibi taşınır (NULL → NULL).
  - Sonuç anlık görüntüsü bayt düzeyinde aynı kalır.
  - Değişmezlik ve kayıt tavanı tetikleyicileri çalışır.
- **Çıktı:** yalnız sayılar ve kimlikler. Soru metni ve sonuç ekrana yazılmaz.
- **Testler:** H-B1…H-B12 (`horary-backup-restore.mjs`).

## Owner kararı bekleyen

1. Horary kayıtları **uygulama içi tenant yedeğine** alınsın mı?
   - Alınırsa diğer `astro_*` tablolarından bağımsız tek istisna olur (dışlama listesinden çıkarma + registry girdisi + geri yükleme testi).
   - Alınmazsa kurtarma yolları: tam veritabanı yedeği ve yukarıdaki bağımsız araç.
2. Bağımsız aracın operasyon prosedürüne (yedek klasörü, şifreleme, saklama süresi) eklenmesi.
