# Kozmik Ajanda — Günlük Exact Aspect TIMELINE doğrulaması

Bu klasör, "Günün Exact Açıları" timeline özelliğinin iki **bağımsız** referansla
doğrulama zeminidir. Yeni astronomik motor YAZILMAZ; production `getExactAspectsInRange`
(lib/cosmic/exactAspects.ts) + `getZonedDayRange` (lib/location/tz.ts) sınanır.

## İki bağımsız referans
1. **Saat dilimi / gün penceresi** — Python `zoneinfo` (IANA tz DB) ile üretilen
   `[00:00, ertesi 00:00)` yerel→UTC aralığı, production `getZonedDayRange` DST mantığını
   bağımsız doğrular (23s ilkbahar / 24s / 25s sonbahar).
2. **Olay kümesi** — Swiss Ephemeris (pyswisseph, FLG_MOSEPH) ile aynı UTC penceresindeki
   45 çift × 5 majör açının TÜM exact anları; production `getExactAspectsInRange` **set
   completeness**'ini (kaçırma=0, fazla=0) doğrular.

## Dosyalar
| Dosya | Rol | Üretim |
|---|---|---|
| `timeline-fixtures.json` | Gün fixture'ları (tek doğruluk kaynağı) | el ile |
| `swe_timeline.py` | Bağımsız referans: zoneinfo pencere + SwissEph olaylar | `swe-timeline.json` |
| `zoned_day_runner.ts` | PRODUCTION getZonedDayRange + getExactAspectsInRange | `timeline-prod.json` |
| `compare_timeline.mjs` | Pencere + DST + set-completeness + zaman + TZ membership | konsol, exit≠0 sapmada |

## Çalıştırma (proje kökünden)
```bash
python scripts/cosmic-validation/timeline/swe_timeline.py
npx tsx scripts/cosmic-validation/timeline/zoned_day_runner.ts
node   scripts/cosmic-validation/timeline/compare_timeline.mjs

# Yardımcı modlar:
npx tsx scripts/cosmic-validation/timeline/zoned_day_runner.ts --bench      # gerçek performans
npx tsx scripts/cosmic-validation/timeline/zoned_day_runner.ts --adjacent   # ardışık gün döşemesi (gap/overlap yok)
```

`python zoneinfo` Windows'ta `tzdata` paketini gerektirir (`pip install tzdata`).
Üretilen `*.json` artefakttır (`.gitignore`); commit edilmez.

## Kapsam
Bu harness PRODUCTION'a DOKUNMAZ (`scripts/` app tarafından import edilmez, bundle'a girmez).
Astronomik motor (aspects.ts / exactAspects.ts / aspectMotion.ts) değiştirilmez; yalnız import edilir.
