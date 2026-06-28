# Kozmik Ajanda — FAZ 2C / Adım 0: Bağımsız Doğrulama Harness'i

**Amaç:** FAZ 2C "Exact Aspect Time" geliştirmesine başlamadan önce, Astronomy Engine (AE)
çıktısının **bağımsız bir referansla** (Swiss Ephemeris / pyswisseph) dakika doğruluğunda
karşılaştırılabileceği güvenilir bir test zemini kurmak.

> Felsefe: *"Ya en doğru hesap ve en doğru takvim olacak, ya da hiç olmayacak."*
> Bu klasör **doğruluk kanıtı** altyapısıdır — özellik geliştirme değil.

## Bu harness PRODUCTION'A DOKUNMAZ
- `app/`, `lib/cosmic/aspects.ts` ve hiçbir UI dosyası değiştirilmez / import edilmez.
- `scripts/` Next.js tarafından asla import edilmez → **bundle'a girmez**.
- `tsconfig` yalnız `**/*.ts|tsx|mts` derler; buradaki `.mjs/.py/.json` **type-check bile edilmez**.
- `ae_exact.mjs` kasıtlı olarak production aspect motorundan **bağımsız ikinci bir uygulamadır**
  (aynı motoru doğrulamak için aynı motoru kullanmak doğrulama olmaz). Adım 1'de DOĞRULANMIŞ
  çözücü `lib/cosmic/` altına production olarak taşınacaktır.

## Dosyalar
| Dosya | Faz | Rol | Üretim |
|---|---|---|---|
| `testset.json` | 0 | Test seti — tek doğruluk kaynağı (tüm taraflar okur) | el ile |
| `swe_reference.py` | 0 | **Bağımsız referans**: Swiss Ephemeris exact-açı anları | `swe-reference.json` |
| `ae_exact.mjs` | 0 | AE ile bağımsız ikinci uygulama | `ae-exact.json` |
| `prod_runner.ts` | 1 | **Production** `exactAspects.ts` çözücüsü | `ae-prod.json` |
| `compare.mjs` | 0–1 | Exact-saat eşleştirme + tolerans + verdict | `report.json` |
| `motion_runner.ts` | 2 | **Production** `aspectMotion.ts` (applying/separating + triple-pass) | `ae-passes.json` |
| `compare_motion.mjs` | 2 | Yön + üçlü-geçiş bağımsız doğrulaması | — |
| `ui_smoke.mjs` / `ui_smoke4.mjs` | 3–4 | Playwright UI duman testi (normal/uzman/filtre/detay) | `.ui-*.png` |

Üretilen `*.json` çıktıları, `*.png` ve `*.log` **artefakttır** (`.gitignore`'da); yeniden üretilir, commit edilmez.

### Çalıştırma sırası (tam zincir)
```bash
python scripts/cosmic-validation/swe_reference.py          # referans
npx tsx scripts/cosmic-validation/prod_runner.ts           # production exact çözücü
node   scripts/cosmic-validation/compare.mjs ae-prod.json  # exact 208/208
npx tsx scripts/cosmic-validation/motion_runner.ts         # production motion
node   scripts/cosmic-validation/compare_motion.mjs        # yön + triple 208/208
```

## Kurulum
Ek kurulum **gerekmez**. Ortamda hazır:
- Python 3.12 + `pyswisseph` 2.10.03 (zaten kurulu — `import swisseph` çalışıyor).
- Node 24 + `astronomy-engine@2.1.19` (zaten `dependencies`'te).

Swiss Ephemeris tarafı **`FLG_MOSEPH` (Moshier)** kullanır → efemeris veri dosyası gerektirmez,
taşınabilir ve deterministiktir (modern çağ için ~yay-saniye; Güneş'te SWIEPH ile birebir).

## Çalıştırma (proje kökünden)
```bash
python scripts/cosmic-validation/swe_reference.py
node   scripts/cosmic-validation/ae_exact.mjs
node   scripts/cosmic-validation/compare.mjs
```

## Yöntem
Her cisim çifti (A,B) ve majör açı θ için, exact an = `wrap180((lonA−lonB) − hedef)` fonksiyonunun
sıfır geçişidir. Pencere taranır (Ay ~2.4s, iç/Güneş ~12s, dış ~1-2g adım), işaret değişimi
(sarma=wrap atlaması HARİÇ) yakalanan her bracket bisection ile 1 saniyeye indirilir. 0/360 sınırı
`wrap180` ile güvenli. Her iki taraf **aynı algoritmayı** kullanır → fark = saf efemeris farkı.

## Tolerans politikası (ampirik olarak doğrulanmış)
- **Birincil kanıt = KONUM uyumu** (arcsec): her sınıf için iyi-koşullu. Eşik `≤ 30″` (gözlenen max ~19″).
- **İkincil = ZAMAN uyumu** (dakika): yalnız astronomik anlamı olan yerde iddia edilir:
  - **Ay açıları:** ≤ 1 dk (gözlenen max **27 sn**).
  - **Güneş / iç gezegen:** ≤ 3 dk.
  - **Orta/yavaş dış çiftler:** dakika ANLAMSIZ → üretimde **TARİH** gösterilir.
    (Ampirik: ~6″ konum farkı, station civarı yavaş çiftte 48 dk zaman farkına dönüşür — sahte hassasiyet.)

## En son sonuç (208 olay, 2026→2050)
- Küme tamlığı: **208/208** (AE hiçbir olayı kaçırmadı, fazladan üretmedi).
- Konum uyumu: tüm sınıflar **≤ 30″ GEÇTİ**.
- Zaman uyumu: Ay ≤ 27 sn, hızlı ≤ 6 dk — **GEÇTİ**.
- Bu, FAZ 2C exact-saat çözücüsünün bağımsız referansla tutarlı olduğunu kanıtlar.
