# FAZ 3C / Adim 1 — Lunar Orbit Dogrulama Harness'i

Ay-Dunya mesafesi, apsisler (perigee/apogee) ve supermoon/micromoon siniflandirmasini
bagimsiz Swiss Ephemeris (pyswisseph) ile dogrular. Production'a DOKUNMAZ.

## Tanim (kilitli — production varsayilani)
- **Mesafe = GEOCENTRIC merkez-merkez** (Dunya merkezi ↔ Ay merkezi). Topocentric varsayilan DEGIL.
- **Supermoon/Micromoon = Nolle/Espenak %90** perigee-apogee yaklasimi: syzygy mesafesi, o
  lunasyonu cevreleyen perigee–apogee araliginin perigee tarafindaki %10 (super) / apogee
  tarafindaki %10 (micro) icindeyse. **Ham distance_km HER ZAMAN saklanir.**
- Sabit esik (≤360000 / ≥405000 km) yalniz **capraz kontrol**, birincil tanim degil.

## Dosyalar
| Dosya | Faz | Rol | Uretim |
|---|---|---|---|
| `lunarorbit-testset.json` | 1 | Pencereler + auKm + nollePct + sabit esikler | el ile |
| `swe_lunarorbit.py` | 1 | Bagimsiz referans (mesafe + apsis minimizasyonu + syzygy) | `swe-lunarorbit.json` |
| `ae_lunarorbit.mjs` | 1 | AE (SearchLunarApsis + Libration + SearchMoonPhase) | `ae-lunarorbit.json` |
| `prod_runner_lunarorbit.ts` | 2 | **Production** `lunarOrbit.ts` | `ae-prod-lunarorbit.json` |
| `compare_lunarorbit.mjs` | 1-2 | 1A mesafe/apsis + 1B syzygy/supermoon (dosya-arg) | `lunarorbit-report.json` |
| `ui_smoke_lunarorbit.mjs` | 3 | Normal UI duman testi (Playwright) | `.png` |
| `ui_smoke_lunarorbit4.mjs` | 4 | Uzman UI (filtre/detay) testi | `.png` |

Uretilen `*.json`, `*.png` artefakttir (`.gitignore`'da).

## Production zinciri
```bash
PYTHONIOENCODING=utf-8 python scripts/cosmic-validation/lunarorbit/swe_lunarorbit.py
npx tsx scripts/cosmic-validation/lunarorbit/prod_runner_lunarorbit.ts
node scripts/cosmic-validation/lunarorbit/compare_lunarorbit.mjs ae-prod-lunarorbit.json
```

## Calistirma
```bash
PYTHONIOENCODING=utf-8 python scripts/cosmic-validation/lunarorbit/swe_lunarorbit.py
node scripts/cosmic-validation/lunarorbit/ae_lunarorbit.mjs
node scripts/cosmic-validation/lunarorbit/compare_lunarorbit.mjs
```

## Sonuc (2026 tam + 2030/2035/2040/2050 spot)
- Mesafe: 56 anlik ornek, max **51.8 km** (ort 25.8); en yakin/uzak Ay ≤50 km.
- Apsis: **54/54** eslesti (tur 54/54, kume tam); mesafe ≤53 km; **zaman ≤16.83 dk**.
- Syzygy: **49/49**; zaman ≤**40 sn**; mesafe ≤14 km.
- Supermoon **15**, Micromoon **9** — AE-SWE etiket **0 uyumsuz**.
- Nolle vs sabit esik: super 8, micro 5 farkli (farkli tanimlar — beklenen).

## Onemli not (apsis zamani "yumusak")
Apsis, mesafenin DUZ ekstremumudur (d(dist)/dt=0). ~27 km'lik AE-SWE model farki dakikalik
zaman farkina donusur. **APOGEE en duz** (Ay en yavas) → ~17 dk; perigee daha keskin → ~10 dk.
Mesafe/tur/kume **kesin** uyusur; yalniz olay ANI yumusaktir. Bu yuzden apsis zaman birimi
**dakika** (saniye iddia EDILMEZ); UI'da apsis zamani dakika gosterilmeli.
