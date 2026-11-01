# Gökyüzü Atlası — Profesyonel Motorlar İçin Ortak Zaman Standardı

Modül: `lib/astrology/time/` (01.11.2026: `pro/` dışına taşındı; ürün motorları kullanabilir — Z19) (`scales.ts`, `leapSeconds.ts`, `deltaT.ts`, `astroTime.ts`).
Test: `scripts/astrology/pro-time.harness.ts`. CI: `npm run test:astrology:pro` (iş `astro-pro`).

**Kapsam yalnız yeni profesyonel motorlardır** (`lib/astrology/pro/**`).

Aşağıdaki üretim bileşenleri bu modülü kullanmaz ve bu modül onları değiştirmez:
- Natal (Roxy adaptörü)
- William Lilly Horary
- Doğum saati çözümleyicisi
- `deltaTNotice`

astronomy-engine'in global `SetDeltaTFunction` ayarına dokunulmaz (statik test Z18 ve izolasyon testi Z17).

## 1. Tanımlar

| Büyüklük | Tanım | Kaynak |
|---|---|---|
| TT | TT = TAI + 32,184 s | SOFA *Time Scale and Calendar Tools*; IERS Conventions |
| TAI − UTC | Artık saniye tablosu (1972 →). 1961–1971 arasında eğimli formül | IERS Leap_Second.dat; USNO tai-utc.dat; SOFA `iauDat` |
| DUT1 | UT1 − UTC; IERS bunu \|DUT1\| < 0,9 s içinde tutar | IERS Bülten A/B; skyfield belgesi |
| ΔT | TT − UT1 | Morrison vd. 2021; IERS (gözlem dönemi) |

DUT1, ΔT ve TT − UTC birbirine karıştırılmaz. Bağıntı: ΔT = (TT − UTC) − DUT1 (test Z01, Z05).

## 2. Dönem kuralları (`scalesFromUtc`)

| Dönem (UTC) | TT | UT1 | İşaretler |
|---|---|---|---|
| 1972-01-01 → 2027-06-28 | **KESİN:** UTC + 32,184 + (TAI−UTC) | UTC + DUT1 (verilmezse 0) | `dut1_assumed_zero` (verilmezse); belirsizlik ≤ 0,9 s |
| 1961-01-01 → 1971-12-31 | **KESİN:** UTC + 32,184 + USNO formülü | UTC + DUT1 (verilmezse 0) | `dut1_assumed_zero`; belirsizlik ≤ 0,70 s (Z07) |
| 1961 öncesi | UT1 + ΔT_model | Yalnız `pre1961: "civil_as_ut"` açıkça seçilirse verilen an | **Otomatik kabul yok:** politika verilmezse `pre1961_policy_required` hatası. İşaretler `pre1961_civil_time_as_ut`, 1800 öncesinde ayrıca `historical_delta_t_model`; UT1 belirsizliği sayısal olarak kanıtlanamadığı için `null` |
| 2027-06-28 → 2600 | UT1 + ΔT_öngörü | UTC + DUT1 (verilmezse 0) | `future_leap_seconds_unknown`, `future_delta_t_predicted` |

- **Gerekçe (1961 öncesi):** UTC henüz tanımlı değil. Sivil saat GMT'ye, yani ortalama güneş zamanına bağlı. Bu yaklaşım ancak çağıranın açık seçimiyle uygulanır.
- **Gerekçe (2027-06-28 sonrası):** IERS tablosunun geçerliliği bu tarihte bitiyor ve gelecekteki artık saniyeler bilinmiyor.
- **Artık saniye etiketi:** `23:59:60` ms ekseninde temsil edilemez. `parseUtcIso` bunu açık hatayla reddeder (Z09).

### Sağlayıcı (Roxy) davranışıyla uyum

Gecenin 220 kayıtlı `/astrology/houses` yanıtıyla, yeni çağrı yapılmadan test edildi (Z16):

| Dönem | Sağlayıcının saat yorumu |
|---|---|
| 1972 öncesi | UT |
| 1972–2025 | UTC + gerçek DUT1 |
| 2026 ve sonrası | DUT1 = 0 |

Önceki belgelerdeki "1972–2030 UTC" ifadesi bu ölçümle düzeltildi. 2027–2030 arasında sağlayıcı DUT1'i sıfır alıyor; fark ≤ 0,11 s.

## 3. ΔT verisi

- **Tablo:** `deltaT.ts`, 1600–2600, yıllık. PR #645'teki tablonun değişmemiş, taşınmış hâli.
- **Kaynak:** skyfield 1.55 yerleşik zaman ölçeği.
  - Sürüm: PyPI yüklemesi 2026-08-07.
  - Lisans: MIT.
  - 1973-01-01 → 2027-01-23: IERS finals günlük ΔT. Son yaklaşık 1 yılı IERS öngörüsü.
  - Öncesi: Morrison, Stephenson, Hohenkerk & Zawilski (2021) Table S15 spline'ı.
  - Dışı: Stephenson, Morrison & Hohenkerk (2016) uzun dönem paraboli.
- **Kullanım yeri:** yalnız 1961 öncesi ve 2027-06-28 sonrası. Arada TT artık saniye tablosundan kesin olarak kurulur.
- **Ölçülen doğruluk (Z04):** skyfield'a göre ≤ 0,074 s (yıllık doğrusal ara değer).
- **Dönem sınıfları:** `observed` 1800–2025 · `historical_model` < 1800 · `predicted` > 2025.
- **Lisans notu:** IERS ürünleri serbestçe kullanılabilir. Morrison vd. 2021 yayımlanmış bilimsel veridir. Ürün içinde atıf bu belgede ve dosya başlığındadır. Owner'ın atıf metni kararı açıktır.

## 4. astronomy-engine ile güvenli kullanım (`astroTime.ts`)

Kaynak kodla doğrulanan tuzaklar (astronomy-engine 2.1.19):

1. `new AstroTime(ut)` ve `AddDays`, `tt`'yi global ΔT'den türetir. Varsayılan ΔT Espenak–Meeus'tur ve 2026'da 5,9 s, 2100'de 107 s fazladır.
2. Işık zamanı düzeltmesi (`CorrectLightTravel` → `AddDays`) geri tarihlenen anı `ut`'den yeniden kurar.
   - "`ut`'yi gerçek UT1 yap, `tt`'yi elle ez" yaklaşımı bu yüzden ışık zamanı uygulanmış konumda hatalıdır. Merkür'de 0,373″ ölçüldü (Z14).
3. `FromTerrestrialTime(tt)`, `ut`'yi global ΔT'nin tersinden seçer.
   - TT doğru ve kütüphane içinde tutarlıdır.
   - Ancak `.ut` gerçek UT1 değildir: 2026'da −5,87 s (Z14).
4. `sidereal_time` önbelleği yalnız `tt` ile anahtarlanır. Aynı `tt` ama farklı `ut` taşıyan nesnede bayat değer döner.

Kurallar:

| İhtiyaç | Kullan | Kullanma |
|---|---|---|
| Gezegen/Ay konumu, eğiklik, nütasyon, ekvator dönüşümü | `ephemerisTime(s)` | `MakeTime(Date)` (global ΔT) |
| Yıldız zamanı, RAMC, ev, ufuk | `gastDegrees(s)`, `ramcDegrees(s, lon)` (ERA gerçek UT1'den) | `SiderealTime`, `Horizon`, Observer'lı `Equator` |
| Olay arama | Kendi kök çözümü (UTC ekseni + `scalesFromUtc`) | Kütüphanenin `Search*` fonksiyonları (global ΔT) |

`gastDegrees` doğruluğu: skyfield'a göre ≤ 0,177″, 1800–2100 (Z15). Kütüphanenin `SiderealTime` formülüyle birebir aynıdır.

## 5. Zaman ölçeği hatası ile model hatası (ayrı)

Ölçüm Z12 ve Z13; referans DE440 (skyfield), aynı TT'de alındı.

**Zaman ölçeği etkisi.** Eski yol, yani `MakeTime(UTC)` + Espenak–Meeus, ile ortak katman arasındaki TT farkı:

| Yıl | 1850 | 1900 | 1950 | 1972 | 2000 | 2026 | 2050 | 2100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| TT farkı (s) | −2,24 | −0,78 | 0,12 | 0,03 | −0,34 | 5,87 | 21,53 | 106,72 |
| Ay, DE440'a göre (″): eski → yeni | 5,4 → 6,7 | 2,5 → 2,9 | 0,2 → 0,2 | 0,7 → 0,7 | 0,2 → 0,4 | 3,8 → 0,1 | 11,5 → 0,6 | 63,2 → 0,9 |

- 1972–2025 arasındaki küçük farklar DUT1 kaynaklıdır (2000: −0,34 s).
- 1850 ve 1900'de Ay için iyileşme yok. Bu yıllarda baskın olan astronomy-engine'in **model** hatasıdır. Eski yoldaki ΔT farkı (−2,2 s ve −0,8 s) tesadüfen bu hatanın bir kısmını götürüyordu. O dönemde ΔT'nin kendi belirsizliği de saniye mertebesindedir.

**Model hatası.** Aynı TT'de astronomy-engine ile DE440 arasındaki en büyük fark (8 yıl):

| Güneş | Ay | Merkür | Venüs | Mars | Jüpiter | Satürn | Neptün |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,8″ | 6,7″ | 6,8″ | 15,1″ | 3,7″ | 6,6″ | 10,3″ | 17,5″ |

Zaman standardı bu hatayı düzeltemez.

## 6. Bağımlılık ve merge sırası

1. **Bu PR (ortak zaman katmanı)** önce merge edilmelidir.
2. **#645 (Efemeris) ve #646 (Transit):** bu dalı normal `git merge` ile içeriyor (rebase yok).
   - Ortak katman main'e girene kadar bu iki PR'ın farkında modül dosyaları da görünür.
   - Bu PR merge edildikten sonra iki dalın main ile güncellenmesi yeterlidir; fark kendiliğinden kapanır.
   - #645 ve #646 bu PR'dan önce merge edilirse ortak katman da onlarla birlikte main'e girer. Teknik olarak çalışır, ama inceleme sırası bozulur. Önerilmez.
3. **#643 ve #644:** hesaplama değişikliği yok, yalnız belge düzeltmesi var. Bu PR'a bağımlı değiller.

CI'da yeni testler `astro-pro` işinde otomatik koşar. `pro-run-all.mjs`, `scripts/astrology/pro-*.harness.ts` dosyalarını kendisi bulur. Merge edilen her motor PR'ı, `package.json` veya `ci.yml` değişmeden kapsama girer.
