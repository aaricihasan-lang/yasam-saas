# Profesyonel Natal Ev Sistemleri — Yöntem Belgesi (WT-01, 2026-10-31)

Durum: **GELİŞTİRİLDİ + TEST EDİLDİ — ÜRÜNE BAĞLI DEĞİL.** Hiçbir route, ekran ya da mevcut hesap bu motoru import etmez.
Owner PASS ve eğitmen kararları olmadan ürüne bağlanmaz.

Kod: `lib/astrology/pro/houses/engine.ts` (ana), `crosscheck.ts` (ikinci, bağımsız uygulama), `birth.ts` (yerel saat → UTC).
Testler: `scripts/astrology/pro-houses.harness.ts`, `scripts/astrology/pro-houses-roxy.harness.ts`.

## 1. Neden yerel hesap

Sağlayıcı yalnız `placidus`, `whole-sign`, `equal`, `koch` sunar (OpenAPI 2.0.0, `/astrology/houses` ve
`/astrology/natal-chart`). Regiomontanus, Campanus, Porphyry ve Alcabitius sağlayıcıda yoktur. Bu dört sistem yalnız küresel
trigonometri gerektirir; tek astronomik girdi yerel gök çerçevesidir (RAMC, gerçek eğiklik ε, coğrafi enlem φ).

## 2. Girdiler ve çerçeve

| Girdi | Kaynak | Not |
|---|---|---|
| UTC an | `birth.ts` → mevcut `resolveAstroBirthTime` (IANA + backzone katmanı) | DST belirsizliği seçimsiz hesaplanmaz; yaşanmamış saat reddedilir |
| RAMC | astronomy-engine 2.1.19 `SiderealTime` (GAST, nütasyonlu) × 15 + doğu boylamı | Lilly motorundaki `skyFrameAt` ile aynı fonksiyon |
| ε (gerçek eğiklik) | astronomy-engine `e_tilt().tobl` | |
| φ | girdi | kuzey +, güney − |
| UT1 − UTC | isteğe bağlı `dut1Seconds` | verilmezse UTC = UT1 kabul edilir (bkz. §5) |

Julian Day / TT ayrımı astronomy-engine içinde yapılır (ΔT modeli); ev geometrisi yalnız UT1'e bağlı yıldız zamanını kullanır.

## 3. Sistemlerin tanımı

- **Regiomontanus** (Johannes Müller, *Tabulae directionum*, 1467): ev daireleri ufkun kuzey ve güney noktalarından geçer,
  **gök ekvatorunu** meridyenden başlayarak 30°'lik eşit yaylara böler. Mevcut Lilly motoru (`horary/western/houses.ts`)
  `regiomontanusCusps` AYNEN yeniden kullanılır; yeni kopya yazılmadı.
- **Campanus** (Campanus of Novara, 13. yy): aynı daire ailesi; eşit bölünen daire **ilk dikey**dir (doğu noktası – başucu –
  batı noktası). Ev 11 dairesi ilk dikeyde irtifa 60°, ev 12 irtifa 30°, ev 1 doğu noktası, ev 2 irtifa −30°, ev 3 −60°.
  - Ana uygulama: ev dairesi düzlemi = span(kuzey–güney ekseni, ilk dikey noktası). Bu düzlemin ekliptik düzlemiyle kesişimi
    vektörle bulunur.
  - İkinci uygulama: kapalı formül. Kutup yüksekliği sin φₖ = cos α · sin φ. Ekvator kesişiminin meridyenden doğuya kaydırması
    90° ∓ atan(tan α / cos φ). Ardından "kutup φₖ'de doğan nokta" hesaplanır.
- **Porphyry** (Porphyrios, *Eisagoge*, 3. yy): MC→ASC ve ASC→IC kadranlarının ekliptik boylamı üçe bölünür.
- **Alcabitius** (al-Qabīṣī, *Kitāb al-mudkhal*, 10. yy):
  1. ASC derecesinin gündüz yarım yayı hesaplanır: DSA = arccos(−tan φ · tan δ_ASC).
  2. DSA sağ açıklıkta üçe bölünür (ev 11, 12); gece yarım yayı 180° − DSA de üçe bölünür (ev 2, 3).
  3. Bölüm noktaları **saat daireleriyle** ekliptiğe taşınır.

Her sistemde cusp 1 = ASC, cusp 10 = MC, cusp k+6 = cusp k + 180°.

## 4. Geçerlilik sınırları

| Bölge | Davranış |
|---|---|
| \|φ\| < 60° | normal |
| 60° < \|φ\| < 90° − ε | hesaplanır + `high_latitude` uyarısı (evler çok eşitsiz) |
| sınıra < 1° | ek olarak `near_polar_limit` uyarısı (ASC zamanla çok hızlı değişir) |
| \|φ\| ≥ 90° − ε (≈ 66,56°) | **dört sistemde de `polar_latitude` hatası** |

Kutup bölgesinde hesap reddedilir; yerine Placidus ya da başka bir sistem **sessizce konmaz**.
- Swiss Ephemeris bu bölgede Regiomontanus/Campanus için MC↔IC takası ve saat yönünde ev düzeni uygular (belge §6.4).
- Porphyry/Alcabitius için de bir sonuç üretir.
- Bunların hangisinin kabul edileceği ekol/eğitmen kararıdır (Açık karar K1).

Geçersiz girdiler `invalid_input` döner:
- NaN veya sonsuz değer
- |φ| > 90°
- ε ∉ [21°, 25°]
- bilinmeyen sistem
- |DUT1| > 1 sn

## 5. Toleranslar ve gerekçeleri

| Karşılaştırma | Tolerans | Gerekçe |
|---|---|---|
| Geometri (aynı RAMC/ε/φ) ↔ pyswisseph `houses_armc` | ≤ 0,01″ (sınıra ≤ 0,5° bölgede ≤ 1″) | Aynı tanım, çift duyarlıklı trigonometri; ölçülen en büyük 1,8e-7″ |
| İç çapraz (vektör ↔ kapalı formül) | ≤ 1e-7° | Ölçülen 2,5e-9″ |
| GAST ↔ skyfield (IAU 2006/2000A), 1600–2500 | ≤ 0,5″ | astronomy-engine kısaltılmış nütasyon; ölçülen 0,169″ (RAMC), ε 0,051″ |
| Motor ↔ Roxy RAMC, DUT1 verilmeden | ≤ 14,04″ | \|UT1−UTC\| ≤ 0,9 sn × 15,04″/sn + 0,5″; ölçülen 11,2″ |
| Motor ↔ Roxy, DUT1 (IERS) ile | RAMC/MC ≤ 2″, ASC ≤ 5″ | Roxy ↔ skyfield ölçülen ≤ 1,76″; ölçülen 1,72″ / 1,75″ / 3,22″ |
| ASC (her vaka) | ≤ ∂ASC/∂RAMC · ΔRAMC + 0,5″ | Yüksek enlemde ASC, RAMC hatasını büyütür |

Pratik etki:
- 0,9 sn ≈ 13,5″ RAMC farkı, doğum saatinin dakika çözünürlüğünün (1 dk = 15′ RAMC) yaklaşık 1/67'sidir.
- Bu nedenle DUT1 isteğe bağlıdır. Verilmezse sonuçta `timeScale: "utc_as_ut1"` işareti döner.

Ev yerleşimi (`placeBodies`):
- Cusp üzerindeki gövde o eve sayılır (Lilly `houseOf` ile aynı kural).
- Cusp'a 30″'den yakın gövde `nearCusp` işareti alır (astronomy-engine konum hatası ~20″ + pay).
- `timeSensitivity` fonksiyonu doğum saati ±Δ dk iken cusp kaymasını ve evi değişen gövdeleri raporlar. Gövde boylamları sabit
  kabul edilir; Ay ±2 dk'da ~1′ yer değiştirir.

## 6. Doğrulama (bağımsız referanslar)

1. **pyswisseph 2.10.03 `houses_armc`** (Swiss Ephemeris, yalnız depo dışı test aracı; ürün kodunda yok).
   - 610 çerçevelik commit'li ızgara + 38.160 çerçevelik QA ızgarası.
   - Her ızgarada 4 sistem.
2. **İkinci bağımsız uygulama** (`crosscheck.ts`).
3. **Mevcut Lilly Regiomontanus**: birebir aynı sonuç.
4. **skyfield 1.55** GAST + gerçek eğiklik (85 an, 1600–2500).
5. **Gerçek sağlayıcı** (220 sentetik vaka): ortak alanlar ASC/MC/RAMC.
   - Sağlayıcının kendisi de doğrulandı: ima ettiği RAMC ile pyswisseph Placidus ≤ 0,026″.
   - Sağlayıcı bu dört sistemi **sunmadığı için** onların doğrulayıcısı olarak kullanılmadı.
6. **Matematiksel özellikler**:
   - karşı cusp +180°
   - Porphyry eşit üçleme
   - Alcabitius DSA/NSA üçlemesi
   - φ=0'da Campanus = Regiomontanus
   - sıralılık
   - güney yarımküre simetrisi (φ→−φ, RAMC→RAMC+180 ⇒ cusp +180°)

## 7. Entegrasyon tasarımı (UYGULANMADI — owner kararı)

1. `NatalMethodOptions.houseSystem` tipine 4 değer **eklenmez**: sağlayıcıya giden gövde değişmemeli.
   - Bunun yerine natal teknik katmanına ayrı, isteğe bağlı bir `proHouses` bloğu eklenir.
   - Blok, sağlayıcının döndürdüğü an + konumdan yerelde hesaplanır; ek sağlayıcı çağrısı yoktur.
   - Gezegen ev yerleşimi sağlayıcı boylamlarıyla `placeBodies` üzerinden yapılır.
2. Bayrak: `NEXT_PUBLIC_ATLAS_PRO_HOUSES=1` (varsayılan KAPALI). Ekranda "Ev sistemi (yerel hesap)" seçicisi gösterilir.
3. Kayıt: `method_snapshot.houseSystem` alanına yeni değerler yazılmadan önce eski kayıt/rapor uyumluluğu denetlenmeli.
   Migration gerekmez (JSON alan).
4. Kutup bölgesinde mevcut `polarHouseBlock` deseni izlenir: kullanıcıya açık hata gösterilir, sessiz yedek yoktur.
5. Word/PDF: ev sistemi adı + "yerel hesap" notu + `timeScale` işareti.

## 8. Lisans

- Ürün kodunda yalnız astronomy-engine (MIT) kullanılır.
- Swiss Ephemeris/AGPL kodu kopyalanmadı. pyswisseph yalnız depo dışında referans sayıları üretmek için çalıştırıldı;
  fixture'lardaki değerler bu çalışmanın sayısal çıktısıdır.
