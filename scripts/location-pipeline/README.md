# Global Konum Dataset Pipeline (FAZ 5 / P5f-1)

GeoNames tabanlı **global şehir arama** için server-only trimmed dataset üretir.
Kozmik Ajanda'nın pilot 33 dünya şehrinden (P5b) tam globale geçişinin **veri temeli**.

> **Kapsam (P5f-1):** yalnız veri üretimi + bütünlük doğrulaması. Client/UI, API route,
> cosmic-calendar, astronomik motorlar, DB, `run-all`/baseline ve `package.json`'a
> **DOKUNULMAZ**. Arama API'si P5f-2, UI entegrasyonu P5f-3, geocoding fallback P5h.

## Dosyalar
| Dosya | Rol |
|---|---|
| `build-global-dataset.mjs` | Pipeline: indir → TR-hariç → tz/koordinat doğrula → `Location` trimmed → artefakt |
| `dataset_integrity.mjs` | Bütünlük harness'i (PASS/FAIL, exit 0/1) |
| `.cache/` | Ham GeoNames indirmeleri (gitignore — commit edilmez) |
| `../../lib/location/server-data/global-cities.json` | **Üretilen artefakt (SERVER-ONLY)** |

## Kaynak & lisans
- **GeoNames** — https://www.geonames.org — `cities15000` (nüfus > 15.000) +
  `countryInfo.txt` (ülke adı) + `admin1CodesASCII.txt` (bölge adı).
- Lisans: **Creative Commons Attribution 4.0 (CC-BY 4.0)** → **atıf zorunlu**.
  Artefakt içinde `_attribution: "Konum verisi: GeoNames, CC-BY 4.0"` korunur.

## Kararlar
- **Türkiye HARİÇ:** GeoNames TR kayıtları alınmaz. TR authoritative olarak
  `lib/location/tr.ts` `TR_LOCATIONS` (81 il) kalır — Istanbul byte-identical davranışı
  ve koordinat/isim tutarlılığı korunur.
- **Server-only:** Artefakt hiçbir client modülü tarafından import edilmez (bundle şişmez).
  Yalnız gelecekteki server-side arama route'u (P5f-2) okuyacak.
- **id = `gn-<geonameid>`** (kararlı, benzersiz). Seçim id-tabanlı; aynı-isim ayrımı
  `adminRegion` + `country` ile (Paris/FR ↔ Paris/US). Sıralama `population` azalan.
- **tz doğruluğu:** her satırın IANA tz'si `Intl` ile doğrulanır; geçersiz/boş olan
  artefakta ALINMAZ. `lib/location/tz.ts` helper'a dokunulmaz.
- Koordinatlar 4 ondalığa yuvarlanır (~11 m; astronomik etki ihmal edilebilir).

## Çalıştırma
```bash
node scripts/location-pipeline/build-global-dataset.mjs   # artefaktı üret (ham veriyi indirir/cache'ler)
node scripts/location-pipeline/dataset_integrity.mjs       # bütünlük doğrula (PASS/FAIL)
```
Ham veri GeoNames'te günlük güncellenir → yeniden üretimde kayıt sayısı biraz değişebilir;
harness sabit sayıya değil **yapısal değişmezlere** (tz %100, unique id, koordinat sınırı,
zorunlu alanlar, bilinen şehirler) bakar.
