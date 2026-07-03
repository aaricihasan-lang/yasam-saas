# Global Doğrulama Harness'i (FAZ 5 / P5)

`scripts/cosmic-validation/global/` — kozmik motorun **global (Türkiye-dışı) koordinatlarda**
doğru davrandığını, üretim motorundan bağımsız referanslarla teyit eden harness'ler.

> **Kapsam kuralı:** Bu klasör FAZ 3A `../eclipses/` harness'inden **bağımsızdır**; oraya
> dokunmaz. `run-all.mjs` / `run-all-baseline.json` / `package.json` **değiştirilmez**
> (bağlama P5e-4'te). Motor (`lib/cosmic/*`), UI, DB **değiştirilmez**.

## İçerik

| Dosya | Amaç |
|---|---|
| `tz_render_smoke.mjs` | **P5e-1** — timezone render helper doğrulaması (saf Intl; SWE gerektirmez). |
| `global-eclipse-testset.json` | **P5e-2** — 10 pilot global şehir. Koordinatlar `lib/location/world.ts` `WORLD_LOCATIONS`'tan birebir kopyadır (elev=0 dahil). |
| `swe_global_eclipses.py` | **P5e-2** — Swiss Ephemeris (pyswisseph, FLG_MOSEPH) yerel güneş tutulması referansı. |
| `prod_global_runner.ts` | **P5e-2** — production `getSolarCityVisibility(id, observers)` çıktısı; gözlemciler `WORLD_LOCATIONS`'tan. |
| `compare_global_eclipses.mjs` | **P5e-2** — PRODUCTION ↔ SWE kıyaslama; self-contained; PASS/FAIL + rapor. |

Üretilen `*-global-eclipses.json` ve `global-eclipse-report.json` `.gitignore`'dadır
(yeniden üretilebilir; commit edilmez).

## P5e-2 — Global tutulma doğrulaması

10 pilot şehir (aynı-isim ayrımı dahil): Berlin, London, Paris/FR, Paris/TX, New York,
Tokyo, Sydney, Singapore, Dubai, Toronto — **id anahtarlı**.

Kıyaslanan metrikler ve toleranslar:

| Metrik | Tolerans | Not |
|---|---|---|
| peak UTC farkı | ≤ 2 dk | yalnız iki motorda da ufuk üstü (alt>0) olaylar |
| altitude farkı | ≤ 0.5° | iki motorda da alt>0 |
| obscuration farkı | ≤ 0.02 | alan örtülme; magnitude değil. **TOTAL olaylar hariç** (aşağıya bak) |
| görünürlük uyumu | hard mismatch = 0 | ufuk-yakını (≤0.5°) fark → marjinal sayılır |
| şehir sayısı | 10 = 10 | |

### Not: TOTAL tutulmada obscuration

Bir **tam (total)** güneş tutulmasında güneş %100 örtülür → obscuration definisyonel olarak
`1.0`'dır. Swiss Ephemeris'in ham `attr[2]` alanı bu durumda klamplenmemiş geometrik oran
(>1) verir (ör. Sydney 2028-07-22 için 1.1058), production ise doğru biçimde `1.0` raporlar —
ikisi de "tam örtülü" demektir. Bu semantik farkı gerçek uyumsuzluk saymamak için harness,
obscuration farkını **yalnız partial/annular olaylarda** ölçer; total olay sayısı raporda
`total olaylar hariç: N` olarak gösterilir. Peak zaman + altitude + görünürlük bu olaylarda
da tam kıyaslanır.

### Çalıştırma

```bash
python scripts/cosmic-validation/global/swe_global_eclipses.py        # 1) SWE referansı
npx tsx scripts/cosmic-validation/global/prod_global_runner.ts        # 2) production çıktısı
node scripts/cosmic-validation/global/compare_global_eclipses.mjs     # 3) kıyas + rapor
```

Gerekli: Python + `pyswisseph` (efemeris dosyası gerekmez, `FLG_MOSEPH`). Bu harness
**tek başına** çalışır; `npm run validate:cosmic` akışına henüz bağlı değildir.
