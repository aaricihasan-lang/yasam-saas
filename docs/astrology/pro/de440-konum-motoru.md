# JPL DE440 konum motoru — Profesyonel Efemeris + Derece Geçişleri (03.11.2026)

**Durum:** AŞAMA 1 (PR #697, production) + AŞAMA 2 Gelişmiş Transit Taraması (§8). AŞAMA 1'de yalnız Profesyonel Efemeris (`lib/astrology/pro/ephemeris`) ve Derece Geçişleri (`lib/astrology/pro/degrees`) yerel konum kaynağını değiştirir. Arama ve kök bulma algoritmaları **değişmedi**. Transit Taraması, Ay Evreleri/Tutulmalar, Lilly Horary, Natal, Human Design ve Kozmik Takvim bu aşamada **dokunulmadı** (hâlâ astronomy-engine 2.1.19).

## 1. Neden

03.11.2026 canlı doğrulamasında iki sapma bulundu. İkisinin de kökü aynı katmanda: astronomy-engine'in heliosentrik gezegen konumu.

| Vaka | Eski motor | Bağımsız referans |
|---|---|---|
| Plüton D=346,99° derece geçişleri, 2052-03-17 – 2060-03-14 | 3 geçiş | 5 geçiş. 2055-06-16 istasyonunda Plüton dereceyi 3,25″ aşıyor; eski motorun Plüton hatası −5,7″ |
| Neptün 1984-01-19 Oğlak girişi | 6.623 s (≈1 sa 50 dk) geç | Eski motorun Neptün hatası −9,5″ |

## 2. Bileşenler

| Dosya | Görev |
|---|---|
| `lib/astrology/positions/de440/spk.ts` | DAF/SPK Tip 2 (Chebyshev) okuyucu. Bağımlılık yok. Dosya belleğe alınmaz, kayıt kayıt okunur. |
| `lib/astrology/positions/de440/frames.ts` | IAU 2006 presesyon (P03, Fukushima–Williams, çerçeve sapması dahil) ve IAU 2000A_R06 nütasyon → gerçek ekliptik/ekvator dönüşümü. ERFA'nın (BSD-3) `eraNut00a`, `eraNut06a`, `eraPfw06`, `eraObl06` ve `eraFw2m` işlevlerinin TypeScript aktarımı. |
| `lib/astrology/positions/de440/nutationData.ts` | 678 + 687 nütasyon terimi, ERFA `nut00a.c`'den birebir. Üretici: `scripts/astrology/de440/gen-nutation-table.py`. Lisans: `LICENSE-ERFA.txt`. |
| `lib/astrology/positions/de440/apparent.ts` | Görünür geosantrik konum: ışık zamanı; Güneş, Jüpiter ve Satürn kaynaklı ışık bükülmesi; göreli yıllık sapma; TDB−TT. Gerçek düğüm için Ay'ın geometrik durum vektörü. |
| `lib/astrology/positions/de440/source.ts` | Dosya erişimi. Kimlik: boyut, SHA-256, kapsam. Dosya yoksa `De440UnavailableError`. |
| `lib/astrology/pro/ephemeris/engine.ts` | Etkin motor bilgisi (ekranda gösterilir) ve hesap öncesi ön kontrol. |
| `lib/astrology/pro/ephemeris/flags.ts` | `ATLAS_PRO_EPHEMERIS_ENGINE`: varsayılan `de440`; `legacy` eski motora kontrollü geri dönüş. |
| `lib/astrology/pro/ephemeris/accuracy.ts` | `DE440_LIMITS` (ölçülü), `deltaTUncertaintySec` (ayrı terim), `localLimits`. Eski `LOCAL_LIMITS` değerleri **değişmedi**. |
| `scripts/astrology/de440/fetch-de440.mjs` | `prebuild` adımında resmî kaynaktan indirir ve doğrular (§3). |

## 3. Veri dosyası, lisans, dağıtım

**Dosya:** değiştirilmemiş resmî `de440.bsp`.

| Özellik | Değer |
|---|---|
| Boyut | 119.799.808 bayt |
| SHA-256 | `a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5` |
| MD5 | `c9d581bfd84209dbeee8b1583939b148`; NAIF `aa_checksums.txt` ile eşleşiyor |
| Kapsam | 1549-12-31 – 2650-01-25 (TDB). Ürünün efemeris aralığı 1600–2600'ü tamamen kapsıyor. |

Doğrulama: 03.11.2026'da iki resmî aynadan indirildi ve SHA-256 değerleri birebir aynı çıktı:
- `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp`
- `https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de440.bsp`

**Kaynak gösterimi:** Park, R.S., Folkner, W.M., Williams, J.G., Boggs, D.H. (2021), *The JPL Planetary and Lunar Ephemerides DE440 and DE441*, AJ 161:105.

**NAIF kuralları** ("Rules Regarding Use of SPICE", naif.jpl.nasa.gov/naif/rules.html; 03.11.2026'da okundu):
- *Kernels Redistribution*: değiştirilmemiş kernel yeniden dağıtılabilir. Değiştirilmiş bir kernelde özgün üretici atfı, son değiştirenin adı ve kurumuyla değiştirilmeli; dosya adı da değiştirilmeli (*Modifications to SPICE Kernels*).
- *Commercial Use of SPICE*: ticari üründe kullanım serbest; ücret ya da lisans gerekmez. NASA'nın SPICE sistemine teşekkür önerilir.

**Karar:**
- 25 MB'lık kırpılmış dosya bir *değiştirilmiş kernel* olur; ayrıca ürün aralığını (1600–2600) karşılamaz. Bu yüzden **kullanılmadı**.
- Tam dosya değiştirilmeden kullanılır ve **depoya konmaz**. Repo PUBLIC, dosya GitHub'ın 100 MB sınırını aşıyor, ayrıca owner kuralı gereği.
- Dosya yalnız sunucu fonksiyon paketine girer: `next.config.ts` → `outputFileTracingIncludes`, dört efemeris/derece rotası.

**Yapılmayan dağıtım:** kırpılmış ya da yeniden adlandırılmış kernel üretilmedi, yayımlanmadı.

**Nütasyon katsayıları:**
- Kaynak: ERFA `src/nut00a.c`. BSD-3-Clause, © NumFOCUS; SOFA'dan izinle türetilmiş. Lisans metni dosyanın yanında.
- Sayılar değiştirilmedi.
- Doğrulama: resmî **IERS Conventions 2010 Tablo 5.3a/5.3b** ile, fikstür üreticisindeki ayrı Python uygulaması üzerinden karşılaştırıldı. Fark Δψ ≤ 17 µas, Δε ≤ 4,4 µas (1600–2600, 384 an).

**İndirme kuralı (`fetch-de440.mjs`):**
- Doğru dosya zaten varsa yeniden indirilmez.
- Boyut ya da SHA-256 uyuşmazsa dosya yazılmaz.
- `VERCEL_ENV=production` ya da `DE440_REQUIRED=1` iken başarısızlık **derlemeyi durdurur**; bu durumda eski sürüm yayında kalır.
- Diğer ortamlarda uyarı basar. O zaman efemeris ve derece uçları çalışma anında **503 `ENGINE_UNAVAILABLE`** döner. **Eski motora sessiz düşüş yoktur.**

## 4. Ölçülen doğruluk (bağımsız referanslar)

Harness: `scripts/astrology/pro-ephemeris-de440.harness.ts`.
Fikstür: `scripts/astrology/fixtures/pro-ephemeris-de440/independent-ref.json`, üreticisi `ref_independent.py`. Ürün kodu kullanılmaz.

Owner kuralı gereği "DE440 okuyan iki programın uyuşması" tek başına yeterli sayılmadı. Referanslar farklı veri ya da farklı kod kullanıyor:

| Referans | Veri / kod | Ne ölçüldü |
|---|---|---|
| Swiss Ephemeris 2.10.03 SWIEPH | DE431 tabanlı `sepl/semo_06/12/18/24` dosyaları; Astrodienst indirgeme kodu | 384 anda (1600–2600) boylam, enlem, α, δ, hız; düğümler; 1.126 olay; Plüton 2055; 03.11 QA'nın 120 derece vakası |
| JPL Horizons API | DE441 + JPL'in kendi yazılımı | 48 anda astrometrik ICRF α/δ |
| IERS Conventions 2010 | Resmî tablolar | Nütasyon |
| Swiss Ephemeris Moshier | Analitik, JPL'den bağımsız | Kaba sağlama |
| skyfield 1.55 | DE440, ayrı kod | 3.050 konum ≤ 0,0001″ (geliştirme ölçümü) |

**Konum (verilen TT anında; ΔT hariç), en büyük fark:**

| | 1600–1799 | 1800–2100 | 2101–2600 |
|---|---|---|---|
| Güneş + gezegenler, boylam ↔ SE | 0,006″ | 0,005″ | 0,005″ |
| Güneş + gezegenler, enlem ↔ SE | 0,004″ | 0,002″ | 0,015″ |
| Ay, boylam ↔ SE | **0,171″** | 0,016″ | 0,049″ |
| Ay ↔ Horizons astrometrik | 0,175″ | 0,018″ | 0,036″ |
| Güneş + gezegenler ↔ Horizons astrometrik | ≤ 0,00001″ | | |
| Gerçek düğüm ↔ SE | ≤ 0,11″ (eski motor 37,5″) | | |
| Ortalama düğüm ↔ SE (Meeus formülü, motordan bağımsız) | 0,23″ | 0,16″ | 1,24″ |

1600–1799 Ay farkı DE440 ile DE431/DE441'in kendi aralarındaki farktır. Bu, veri kaynakları arasındaki gerçek belirsizliktir ve sınıra yansıtıldı: Ay 0,3″.

**Beyan sınırı `DE440_LIMITS`:** gezegen ve Güneş için 0,1″, Ay için 0,1″ (1600–1799'da 0,3″), gerçek düğüm 0,5″, ortalama düğüm 1″ (2101 sonrası 1,5″). Hız sınırı 0,1″/gün, Ay için 0,5″/gün.

Güneş'e 2°'den yakın kavuşum anlarında referansın hız tanımı ışık bükülmesi türevini içermez. Bu anlarda hız ayrı raporlanır; konum yine sınanır.

**Önce / sonra (1920–2150), boylamda en büyük fark ↔ SE:**

| Cisim | Eski motor | DE440 |
|---|---|---|
| Güneş | 1,55″ | 0,0025″ |
| Ay | 3,52″ | 0,0115″ |
| Merkür | 11,71″ | 0,0031″ |
| Venüs | 13,64″ | 0,0049″ |
| Mars | 10,15″ | 0,0035″ |
| Jüpiter | 10,14″ | 0,0049″ |
| Satürn | 13,15″ | 0,0016″ |
| Uranüs | 11,12″ | 0,0019″ |
| Neptün | 18,90″ | 0,0018″ |
| Plüton | 14,48″ | 0,0020″ |

**Olay anları (TT ekseninde, ΔT ayrı):** 1.126 burç girişi ve istasyon; eksik 0, fazla 0.
- Burç girişlerinde |ΔTT| ≤ 1,8 s.
- İstasyonlar düz tepeli olduğu için daha geniştir; Plüton istasyonunda 834 s. Hepsi bildirilen belirsizliğin içinde.

## 5. ΔT: konum hatasından AYRI terim

Satır ve olay anları UTC/UT ile verilir; konum TT'de hesaplanır. `deltaTUncertaintySec(ms)` modeli:

| Dönem | ΔT belirsizliği |
|---|---|
| 1961-01-01 – 2027-06-28 | 0 s (TT artık saniye tablosundan kesin) |
| 1955–1961 | 1 s |
| 1955 öncesi | 1 + 1,6·((1955 − yıl)/100)² s. Morrison & Stephenson (2004) biçimi iki katı alındı ki ΔT tablosu ile SE arasındaki ölçülen fark (1600'de 18,8 s) kapsansın. |
| 2027-06-28 sonrası | 1 + 0,5·Δy + 0,01·Δy² s: 2055'te ≈ 22 s, 2100'de ≈ 90 s, 2150'de ≈ 213 s, 2600'de ≈ 1 sa |

- **Olay belirsizliği** = 2 × konum sınırı / |hız| + 1 s (sayısal çözünürlük) + ΔT belirsizliği.
- **Gösterim hassasiyeti:** konum sınırına, cismin en büyük hızı × sayfadaki en büyük ΔT belirsizliği eklenir. Örnekler: 2026'da Ay boylamı saniye basamağında; 2150'de Ay boylamı dakika basamağında, Plüton saniye basamağında. Gereğinden ince basamak gösterilmez.

**ΔT tablosu ile SE ΔT arasındaki fark (bilgi):**

| Yıl | Fark |
|---|---|
| 1600 | +18,8 s |
| 1800 | −0,5 s |
| 1950–2026 | ≤ 0,2 s |
| 2050 | −3,1 s |
| 2150 | +24,6 s |
| 2600 | +411 s |

Bu farklar belirsizlik modelinin içinde kalıyor.

## 6. Geri dönüş

- `ATLAS_PRO_EPHEMERIS_ENGINE=legacy` → eski motor ve eski sınırlar (`LOCAL_LIMITS`) kullanılır; sonuç sürümü `pro-ephemeris-1`.
- Ekranda "Yedek motor (düşük hassasiyet)" etiketi ve uyarı paragrafı çıkar.
- DE440 motorunun sürümleri: `pro-ephemeris-2-de440` ve `pro-degree-crossings-1+jpl_de440`.
- Efemeris ve derece sonuçları **kaydedilmez**. Eski ve yeni kayıtların çakışma riski yok.

## 7. Performans

Yerel ölçüm (Windows, Node 24):
- Görünür konum başına ≈ 28 µs.
- Aylık tablo (11 cisim + olaylar) ≈ 260 ms.
- Plüton 8 yıllık derece taraması ≈ 0,9 s.
- RSS ≈ 180 MB.

Vercel Linux ölçümü PR açıklamasındadır.

## 8. AŞAMA 2 — Gelişmiş Transit Taraması DE440 (03.11.2026, uygulandı)

**Kapsam:** yalnız Gelişmiş Transit Taraması (`lib/astrology/transits`, teknik `western.transit_scan`). Tarama ve kök bulma algoritmaları (`segments.ts` `signChanges` / `levelCrossings`) **değişmedi**. Ay evreleri, tutulmalar, Lilly Horary, natal, HD ve Kozmik Takvim dokunulmadı; Lilly olay çizelgesi astronomy-engine'de kalır.

### 8.1 Mimari
- **Ortak çekirdek taşındı:** `lib/astrology/positions/de440/*` → `lib/astrology/positions/de440/*` (`git mv`, kopya yok). Z19/A14 pro dışı kodun `pro/**` içe aktarmasını yasaklar; `positions/` adı L11 desenine (`/ephemeris|/transits`) takılmaz. ΔT belirsizliği ve 1 s çözünürlük ortak modülde (`positions/de440/uncertainty.ts`); `pro/ephemeris/accuracy.ts` yeniden dışa aktarır.
- **Bayrak:** `lib/astrology/positions/flags.ts` → `ATLAS_TRANSIT_ENGINE` (varsayılan `de440`; `legacy` = astronomy-engine). Efemeris bayrağından AYRI: transit sonuçları kaydedilir, efemeris sonuçları kaydedilmez.
- **Dikiş:** `transits/model.ts` `lonAt`/`speedAt` (tek konum noktası). Önbellek anahtarı motoru içerir (`eng|gövde|ms`). DE440 hata payları: konum 0,1″, hız 0,1″/gün (Ay 0,5).
- **Olay belirsizliği (DE440):** konum hatasından türeyen süre + 1 s çözünürlük + ΔT belirsizliği (ayrı terim; 1961–2027 = 0).
- **Sonuç:** `scan.source.ephemeris = "jpl-de440"`, `engineVersion = "transit-scan-2-de440"`, `deltaTUncertaintySecMax`. Şema `astro.western.transit_scan.v1` korunur (okuyucular şemayı denetlemez; alan birleşim tipine genişletildi).
- **DE440 yoksa:** `engine/service.ts` `resolveSelectionContexts` transit seçimini `ENGINE_UNAVAILABLE` ile engeller → birim PLANLANMAZ, ücretli Natal çağrısı yapılmaz; eski motora sessiz düşüş yok. Motor düzeyinde de `De440UnavailableError` fırlatılır.

### 8.2 Güneş diski arkası ve ivme sınırı
- DE440 görünür konumu Güneş/Jüpiter/Satürn ışık bükülmesini içerir. Ölçüm: gezegen Güneş diskinin arkasından geçerken (θ < 0,27°) nokta-kütle formülü 1/θ ile ıraksıyor → |λ″| 19 °/gün²'ye (Uranüs) çıkıyordu (eski sınır 0,002). Bu, AŞAMA 1 efemerisini de o nadir anlarda etkiliyordu.
- **Düzeltme (ortak çekirdek, `apparent.ts`):** ışın diskin içinden geçiyorsa bükülme yalnız ışının içinde kalan iz düşümü kütleyle ölçeklenir: F(x), x = θ/ρ☉, **n = 3 politrop** (Eddington standart Güneş modeli; Lane–Emden çözümü ξ₁ = 6,8969, tablo üreticisi `scripts/astrology/de440/gen-solar-mass-table.py`). Güneş kütlesi merkezde yoğun olduğundan x ≥ 0,8'de F ≥ 0,9995 → Swiss Ephemeris'in disk içi "etkin kütle" davranışıyla tutarlı (1949-01 Jüpiter, x ≈ 0,84: SE farkı 0,0044″). Disk dışında değişiklik yoktur. (İlk denenen düzgün yoğunluklu küre modeli aynı anda 0,30″ sapma verdiği için reddedildi.)
- **İvme sınırı programı (`scan.ts` `turnsPiecewise`, üç katman):** aralık 12 sa adımla örneklenir (uzama hızı ≤ 3,2°/gün → örnek ile gerçek uzama arası ≤ 0,8°), her örnek ±0,5 gün paylı parçaya katmanını taşır:
  - **Disk** (örnek uzama < 1,4°, yani gerçek < 0,6°): `ACCEL_BOUND_DE440` — ölçülen tepe (0,001 gün adım, 1900–2100): Merkür 0,785 · Venüs 0,026 · Mars 0,029 · Jüpiter 0,271 · Satürn 0,274 · Uranüs 0,892 · Neptün 0,379 · Plüton 0,203 °/gün²; sınır ~2 katı.
  - **Limb** (örnek uzama < 4°): eski sınır + 0,02 (disk dışı nokta-kütle bükülmesinin katkısı ≤ ~0,011 °/gün²).
  - **Uzak** (≥ 3°): eski `ACCEL_BOUND` — DE440 ivmesi burada eski sınırların içinde (en büyük oran 0,50).
  - `signChanges` algoritması değişmez; yalnız aralık parçalanır. Eski motorda tek çağrı (davranış birebir). Performans: 10 yıllık dış gezegen taraması ≈ 5 s (eski motor ≈ 3 s; sınır 10 s).

### 8.3 Bağımsız doğrulama (`scripts/astrology/pro-transits-de440.harness.ts`)
Fikstür `scripts/astrology/fixtures/pro-transits-de440/ref-se-transit.json` (Swiss Ephemeris 2.10.03 SWIEPH, TT ekseninde kök bulma; motor kodu kullanılmaz). 66 vaka: harness S1–S10, 03.11 canlı QA ana set (1.609 pencere / 1.559 kesinleşme) + ek set, istasyon sınırı (SE istasyon boylamı ±1/3/5/10/30″), yavaş gezegen çoklu geçiş.

| Ölçü | Eski motor | DE440 |
|---|---|---|
| Pencere / sınıf / geçiş / aile k/n / istasyon / burç girişi uyuşmazlığı | 27 (hepsi sınır vakası, belirsiz bayraklı) | **0** |
| 4.740 pencere, 4.571 kesinleşme, 532 istasyon, 977 burç girişi | — | birebir |
| En büyük \|Δt\| / beyan edilen belirsizlik | 0,645 | **0,28** |
| Ay olayları en büyük \|Δt\| | ~1 s | 0,3 s |
| Plüton natal 346,99° (2052–2060) kesinleşme | 3 | **5** (1/5..5/5) |

Ek: DE440 skyfield referansının S4'te ürettiği 2 "Güneş-arkası" Uranüs istasyonu (sönümlemesiz bükülme artefaktı) motorda yoktur; SE ile aynıdır.

### 8.4 Kayıt, arşiv, önbellek
- Transit sonucu DB'de önbelleklenmez; her görünüm/kayıtta önbellekteki Natal boylamlarından yerel taranır → motor değişince eski sonuç sessizce dönmez. Kayıt tekrarı yalnız `save_request_id` ile. **Migration gerekmez.**
- Kayıtlı analizler snapshot'tan aynen açılır (yeniden hesap yok). Eski kayıtlar `scan.source.ephemeris = "astronomy-engine@2.1.19"` taşır; ekran ve Word/PDF "Transit konumları: önceki yerel konum motoru…" gösterir, arşivde `transit_scan_legacy_engine` notu ("Eski hesap sürümü") çıkar. Yeni kayıtlar "NASA/JPL DE440 (yerel hesap)" gösterir.
- Demo fikstürü DE440 ile yeniden üretildi (fark yalnız transit taraması analizinin `technical` alanında).

### 8.5 Vercel paketleme
DE440'ı okuyan uçlar: `engine` (plan ön kontrolü + run + view), `workspace`, `analyses` (önizleme + kaydetme) — admin ve uzman yüzeyi. `engine/plan`, `engine/view`, `workspace`, `analyses`, `analyses/preview` için `maxDuration = 60` → DE440'ı zaten taşıyan 60 sn fonksiyon grubuna katılırlar (varsayılan gruba ~120 MB taşınmaz). Rapor ve kayıt okuma uçları (`analyses/[id]`, `…/report`) dışlanır. Ölçüm PR açıklamasında.

## 9. AŞAMA 2 planı (tarihsel not)
Bu bölümdeki plan §8'de uygulandı. Farklar: şema v2 yerine v1 + `source.ephemeris` birleşim tipi (okuyucular şemayı denetlemediği için); önbellek anahtarı DB'de olmadığı için migration yok; ivme sınırı için üç katmanlı Güneş yakını program ve disk içi bükülme sönümlemesi eklendi.
