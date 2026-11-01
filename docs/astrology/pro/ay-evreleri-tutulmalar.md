# Ay evreleri ve tutulmalar (`lib/astrology/pro/lunations`)

**Durum:** hesap motoru + bağımsız doğrulama. Ürüne, API'ye ve ekrana bağlı **değil**. Sağlayıcı (Roxy) çağrısı yok.
**Aralık:** 1920-01-01 – 2150-12-31. Dışı açık hata verir.

## 1. Ne hesaplanır

| Çıktı | Tanım | Kaynak |
|---|---|---|
| Yeniay / ilk dördün / dolunay / son dördün | Ay ile Güneş'in yer merkezli **görünür** gerçek ekliptik boylamları farkı 0°/90°/180°/270° | astronomy-engine 2.1.19 `GeoVector(aberration=true)` + `Ecliptic`; zaman ortak katmandan (`../time`) |
| Ay tutulması | Tür (yarı gölge / parçalı / tam) ve tepe anı | astronomy-engine `SearchLunarEclipse` / `NextLunarEclipse`; tepe TT → UTC ortak katmanla |
| Güneş tutulması (global) | Tür (parçalı / halkalı / tam), merkezilik ve tepe anı | astronomy-engine `SearchGlobalSolarEclipse` + gölge konisi düzeltmesi (§3) |

Her evrede:
- **UTC** ve **TT** ayrı verilir. Astronomik olay zamanı TT'dir; yerel saat gösterimi entegrasyonda yapılır.
- `uncertaintySec` beyan edilir: konum hata sınırı ÷ o andaki göreli hız.

## 2. Kök bulma
- Elongasyon E = λ☾ − λ☉ her zaman artar (≈ 10–15,5°/gün); her hedefin tek kökü vardır.
- Başlangıç tahmini ortalama sinodik hızdan alınır, ±2 günlük aralık kurulur.
- Aralık korumalı regula falsi (Illinois) ile kök ≤ 50 ms'ye daraltılır.
- astronomy-engine `SearchMoonPhase` **kullanılmaz**: yıllık sapmayı uygulamaz ve evre anını ≈ 45 s kaydırır. Mutasyon testi M1 bunu yakalar.

## 3. Güneş tutulması türü
Kütüphane, gölge ekseni Dünya'yı ıskalayan ama tam/halkalı gölge kenarı yüzeye değen **merkezi olmayan** tutulmaları "parçalı" bildiriyor. Bu, 1920–2150 arasında 12 vaka.

Tür, tepe anındaki gölge konisinden düzeltilir:
- Koni yarıçapı `r = R☾ − (R☉ − R☾)·t/|Ay−Güneş|` (>0 tam gölge, <0 halkalı gölge).
- Eksenin Dünya merkezine uzaklığı − WGS-84 elipsoid yarıçapı (eksen noktasının enleminde) < |r| ise merkezi olmayan tam/halkalı sayılır.

**Melez (hybrid)** tür kütüphanede yoktur. Bu 13 vaka tam ya da halkalı görünür ve **açık sınır** olarak kalır.

## 4. Bağımsız doğrulama (`scripts/astrology/pro-lunations.harness.ts`)

| Karşılaştırma | Referans | Sonuç |
|---|---|---|
| 11.428 evre | JPL DE440 (skyfield 1.55) | Sıra/tür birebir; en büyük ΔTT 9,0 s (1920–2100), 9,2 s (2101–2150); tolerans 40 / 400 s |
| 532 Ay tutulması | DE440 + Swiss Ephemeris 2.10.03 Moshier | Tepe ΔTT ≤ 13,5 s / 7,9 s. Tür farkı 3 vaka, hepsi umbral büyüklük sınırında (model farkı) |
| 521 Güneş tutulması | Swiss Moshier | Tepe ΔTT ≤ 14,2 s. Tür birebir; yalnız 13 melez model farkı |
| Yayımlanmış değerler | NASA (Espenak) ve USNO | Tutulma ≤ 120 s, evre ≤ 60 s |

**Çıktıda olmayanlar (açık beyan):**
- Ay tutulması temas anları ve örtülme. Swiss'e göre yarı süreler sistematik olarak uzun (ortalama yarı gölge %0,85, tam %4,8; en büyük 414 s). Bu, gölge büyütme kuralı farkı. Önceden tanımlı 180 s toleransı aşıldığı için verilmiyor; kural seçimi Owner'da.
- Global tepe noktasının coğrafi konumu ve yerel görünürlük.

**Referansı yeniden üretme:** `DE440_BSP=<yol>/de440.bsp python scripts/astrology/fixtures/pro-lunations/ref_lunations.py`
