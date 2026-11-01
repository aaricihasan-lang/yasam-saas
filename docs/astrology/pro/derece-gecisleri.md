# Derece geçişleri (`lib/astrology/pro/degrees`)

**Durum:** hesap motoru + bağımsız doğrulama. Ürüne, API'ye ve ekrana bağlı **değil**. Sağlayıcı (Roxy) çağrısı yok.
**Aralık:** 1920-01-01 – 2150-12-31. Tek istekte en fazla 3.660 gün ve 36 derece. Aralık dışı istek açık hata koduyla döner.

## 1. Ne hesaplanır
`findDegreeCrossings(body, degrees, t0, t1, zodiac)`: bir cismin seçilen ekliptik boylamları `[t0, t1)` aralığında geçtiği anlar.

Her geçiş için şu alanlar döner:
- `ms` / `ut`: UTC zamanı. 1961 öncesi UT kabul edilir.
- `direction`: direkt ya da retro.
- `speedDegPerDay`: geçiş anındaki hız.
- `sign`, `degreeInSign`: burç ve burç içi derece.
- `pass` / `passCount`: retro tekrar grubu. Aynı derecenin ardışık geçişleri yön değiştiriyorsa aynı gruptadır. Örnek: Plüton 0° Kova, 2023–2024'te 5 geçiş. Grup yalnız istenen aralık içinde sayılır.
- `uncertaintySec`: 2 × boylam hata sınırı / |hız|. #645'in olay belirsizliği kuralıdır; istasyon yakınında büyür.

`degreesInEverySign(d)`: aynı burç-içi dereceyi 12 burçta üretir (ör. 29 → anaretik dereceler).

Konum tanımı ve hata sınırları #645 efemerisinden (`zodiacLon`, `LOCAL_LIMITS`) alınır; #645 dosyaları değiştirilmez. Tropikal ve Lahiri sidereal desteklenir.

## 2. Kök bulma
1. Tarama adımı #645 burç girişi taramasıyla aynıdır: Ay 3 sa; gerçek düğüm 6 sa; Güneş, Merkür, Venüs ve Mars 12 sa; diğerleri 1 gün.
2. Adımın iki ucunda hız işareti değişiyorsa istasyon ikiye bölmeyle bulunur ve adım iki monoton parçaya ayrılır. Böylece istasyona çok yakın bir derecenin tek adım içinde ileri-geri iki kez geçilmesi kaçırılmaz (D3 testi).
3. Monoton parçada her derece en fazla bir kez geçilir. Kök ikiye bölmeyle ≤ 100 ms'ye daraltılır.
4. 0°/360° kenarında karşılaştırmalar `wrap180` ile yapılır.

## 3. Bağımsız doğrulama (`scripts/astrology/pro-degree-crossings.harness.ts`)
Referans: JPL DE440 (skyfield 1.55, görünür konum, tarih ekliptiği). Ortalama düğüm ve Lahiri ayanamsa için Swiss Ephemeris 2.10.03 kullanılır. Referans üretici ürün motorundan bağımsızdır: yoğun vektörel örnekleme yapar ve kendi ikiye bölmesini kullanır.

Toleranslar sonuçlara bakılmadan önce tanımlandı:
- **Eşleşen geçiş:** `|ΔTT| ≤ max(uncertaintySec, 2 s)`.
- **Eşleşmeyen geçiş:** yalnız istasyon sınırında kabul edilir. Koşul: ±10 gün içinde bir istasyonda boylam dereceye ≤ 2 × sınır + 5″ olmalı. Bu vakalar ayrı sayılır.
- **USNO ekinoks ve gündönümü:** `≤ uncertaintySec + 60 s`.

Sonuçlar PR açıklamasında ve QA 04/05 raporlarındadır.

**Kapsam dışı:**
- Yerel saat ve DST gösterimi (entegrasyon katmanı).
- Kritik derece ön ayar listesi (gelenek bağımlı; eğitmen kararı).

**Referansı yeniden üretme:** `DE440_BSP=<yol>/de440.bsp python scripts/astrology/fixtures/pro-degrees/ref_degree_crossings.py`
