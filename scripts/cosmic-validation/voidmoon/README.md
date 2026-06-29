# FAZ 3B / Adım 1 — Void of Course Moon Doğrulama Harness'i

Klasik VOC tanımını bağımsız Swiss Ephemeris (pyswisseph) ile doğrular.
Production'a DOKUNMAZ; `scripts/` bundle'a girmez.

## Tanım (kilitli — production varsayılanı)
Ay, bulunduğu burçta **klasik 6 cisme** (Güneş, Merkür, Venüs, Mars, Jüpiter, Satürn)
yaptığı **son exact majör aspektten** (Kavuşum/Sekstil/Kare/Üçgen/Karşıt) sonra, **yeni
burca girene** kadar Void of Course'tur. **Dış gezegen / minör aspekt / asteroid HARİÇ.**

## Dosyalar
| Dosya | Faz | Rol | Üretim |
|---|---|---|---|
| `voc-testset.json` | 1 | Kapsam + test pencereleri (tek doğruluk kaynağı) | el ile |
| `swe_voc.py` | 1 | Bağımsız referans (ingress + VOC) | `swe-voc.json` |
| `ae_voc.ts` | 1 | `getMoonSignPeriod` + `findExactAspectsInWindow` (READ-ONLY) | `ae-voc.json` |
| `prod_runner_voc.ts` | 2 | **Production** `voidMoon.ts` (getVoidMoonPeriods) | `ae-prod-voc.json` |
| `compare_voc.mjs` | 1–2 | 1A ingress + 1B VOC kıyaslama (dosya-arg) | `voc-report.json` |
| `ui_smoke_voc.mjs` | 3 | Normal UI duman testi (Playwright) | `.png` |
| `ui_smoke_voc4.mjs` | 4 | Uzman UI (filtre/detay) testi | `.png` |

Üretilen `*.json`, `*.png` artefakttır (`.gitignore`'da).

## Çalıştırma (production zinciri)
```bash
python scripts/cosmic-validation/voidmoon/swe_voc.py
npx tsx scripts/cosmic-validation/voidmoon/prod_runner_voc.ts
node   scripts/cosmic-validation/voidmoon/compare_voc.mjs ae-prod-voc.json
```

## Sonuç (2026 tam + 2030/2035/2040/2050 spot)
- **213/213 burç periyodu** eşleşti (AE-only 0, SWE-only 0).
- **1A ingress:** burç adı + sonraki burç 213/213; giriş ≤28 sn, çıkış ≤45 sn.
- **1B VOC:** başlangıç ≤39 sn, bitiş ≤45 sn; **son aspect gezegeni 213/213, türü 213/213.**
- "Aspectsiz pencere" özel durumu: AE 1 / SWE 1 (eşleşti). 0/360 (Balık→Koç): 18 periyot.
- TR dönüşümü (=UTC+3) doğru.

## Not
`getMoonSignPeriod` ~1 dk hassasiyettedir (`to` = burçtaki son an ≈ ingress−≤60 sn);
ingress/VOC-bitiş farkları bu yüzden ~saniye-onlarca-saniye, dakika toleransının altında.
İstenirse Adım 2'de bisection saniyeye sıkılaştırılabilir.
