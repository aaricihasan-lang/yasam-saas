# Kozmik Ajanda — Uzun Dönem Bağımsız Doğrulama (01.01.2026–31.12.2100)

Ürünün public destek aralığının **her günü** production `lib/cosmic` motorlarıyla hesaplanır ve bağımsız
referanslarla karşılaştırılır. Tek komut:

```bash
SE_EPHE_PATH=/yol/ephe HIJRIDATE_PATH=/yol/pylib npm run validate:cosmic:longrange -- [outDir] [--skip-jpl]
```

| Adım | Dosya | İçerik |
|---|---|---|
| 1 | `compare.py ref-stays` | Swiss Ephemeris ile 9 cismin tüm bitişik burç kalışları (getPlanetSignPeriod sorgu noktaları) |
| 2 | `prod_dump.ts` | production motorları: konum (her gün × 00/06/12/18 TR), Ay fazı/girişi/yaşı, retro (8 gezegen), burç geçişleri, gezegen saatleri (10 şehir), Hicri (4 tarayıcı saat dilimi × 3 kod yolu), Hacamat, tutulma, açılar |
| 3 | `fetch_jpl.py` + `jpl_cmp.ts` | NASA/JPL Horizons DE441 ile AYNI TT anında boylam karşılaştırması |
| 4 | `compare.py all` | Swiss Ephemeris / resmî Umm al-Qura tablosu / UQ kuralı ile karşılaştırma → `results.json` |

Gereksinimler: Python 3, `pyswisseph`, `hijridate==2.6.0`, Swiss Ephemeris `.se1` dosyaları
(`sepl_18.se1`, `semo_18.se1`; https://github.com/aloistr/swisseph/tree/master/ephe). Çıktılar `out/` (gitignore).

Toleranslar ve gerekçeleri `compare.py` başlığındadır. Kalıcı G1–G8 regresyonları: `scripts/cosmic-2100/regression.ts`
(`npm run test:cosmic:2100`).
