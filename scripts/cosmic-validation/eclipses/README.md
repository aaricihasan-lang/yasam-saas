# FAZ 3A / Adım 1 — Eclipse Doğrulama Harness'i

Astronomy Engine'in tutulma çıktılarını **bağımsız Swiss Ephemeris (pyswisseph)** ile
2026–2050 arası karşılaştırır. Production'a DOKUNMAZ; `scripts/` bundle'a girmez.

## Dosyalar
| Dosya | Faz | Rol | Üretim |
|---|---|---|---|
| `eclipse-testset.json` | 1 | Yıl aralığı + 8 Türkiye şehri (tek doğruluk kaynağı) | el ile |
| `swe_eclipses.py` | 1 | Bağımsız referans (FLG_MOSEPH; hibrit + magnitude + obscuration) | `swe-eclipses.json` |
| `ae_eclipses.mjs` | 1 | Astronomy Engine bağımsız üretici | `ae-eclipses.json` |
| `prod_runner.ts` | 2 | **Production** `lib/cosmic/eclipses.ts` çıktısı | `ae-prod-eclipses.json` |
| `compare_eclipses.mjs` | 1–2 | Peak/tür/altitude/görünürlük kıyaslama (dosya-arg) | `eclipse-report.json` |
| `ui_smoke_eclipse.mjs` | 3 | Normal UI duman testi (Playwright) | `.png` |
| `ui_smoke_eclipse4.mjs` | 4 | Uzman UI (şehir/filtre/detay) testi | `.png` |

Üretilen `*.json`, `*.png` artefakttır (`.gitignore`'da).

## Çalıştırma (tam zincir)
```bash
python scripts/cosmic-validation/eclipses/swe_eclipses.py            # referans
npx tsx scripts/cosmic-validation/eclipses/prod_runner.ts            # production motor
node   scripts/cosmic-validation/eclipses/compare_eclipses.mjs ae-prod-eclipses.json
```

## Sonuç (2026–2050)
- Global güneş: 56/56 eşleşti, peak max **22 sn**, tür 54/56 (2 kutup grazer + 3 hibrit = sınır/katalog).
- Ay: 57/57, peak max **21 sn**, tür 56/57 (1 penumbral/partial sınır).
- Şehir görünürlüğü: **görünür (alt>0)** olaylarda peak **22–24 sn**, altitude **≤0.5°**; ufuk-altı maksimumlar marjinal olarak ayrıştırıldı.

## Çıkan kararlar (Adım 1B)
- **Görünürlük = altitude > 0.** AE geometrik max'ı verir; ufuk altıysa "görünmez/marjinal". Tek şehir ≠ Türkiye geneli.
- **Hibrit:** AE'de yok (3 olay). Kaynak: kürasyonlu NASA/Espenak statik katalog (peak tarihine göre), harness ile doğrulanmış. Aksi halde gösterme.
- **Saros:** AE/SWE-çıktısı vermez → NASA/Espenak katalog veya gösterme.
- **Magnitude:** AE yalnız obscuration (alan) verir. Üretimde **"örtülme oranı (obscuration)"** etiketiyle gösterilir; **asla "magnitude" denmez.** Magnitude istenirse katalog (uzman, kaynak-etiketli).
