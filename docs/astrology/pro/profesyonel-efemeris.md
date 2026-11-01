# Profesyonel Efemeris — yöntem, kaynaklar, doğruluk (WT-03, 2026-10-31)

Durum: **izole, varsayılan KAPALI**. Mevcut Atlas ekranları, motorlar ve sağlayıcı adaptörü değişmedi. Menü/gezinme bağlantısı yok.

## 1. Bileşenler

| Dosya | Görev |
|---|---|
| `lib/astrology/pro/ephemeris/local.ts` | Yerel konum motoru (astronomy-engine 2.1.19, MIT): görünür geosantrik boylam/enlem, RA/dek, anlık hız, ortalama/gerçek düğüm, Lahiri ayanamsa |
| `lib/astrology/pro/ephemeris/deltaT.ts` | ΔT tablosu 1600–2600 (global ΔT işlevi değiştirilmez) |
| `lib/astrology/pro/ephemeris/events.ts` | Burç girişleri + istasyonlar (tarama + ikiye bölme ≤1 s), belirsizlik |
| `lib/astrology/pro/ephemeris/provider.ts` | Sağlayıcı (`/astrology/planets`, 00:00 UT) gövde + izdüşüm + LRU; ağ çağrısı yok |
| `lib/astrology/pro/ephemeris/table.ts` | İstek doğrulama, görünümler (gün/ay/yıl/aralık), sayfalama, tablo kurucu |
| `lib/astrology/pro/ephemeris/accuracy.ts` | ÖLÇÜLMÜŞ hata sınırları, gösterim hassasiyeti kuralı, alan kaynak matrisi |
| `lib/astrology/pro/ephemeris/format.ts` | DMS/RA biçimi, olay etiketi, CSV (yalnız yerel kaynak) |
| `lib/astrology/pro/ephemeris/flags.ts` | `ATLAS_PRO_EPHEMERIS_ENABLED=1` (ekran+API), `ATLAS_PRO_EPHEMERIS_PROVIDER=1` (ücretli kaynak) |
| `app/api/admin/astroloji/efemeris/route.ts` (+ uzman aynası) | POST; `requireAstrologyAccess` → bayrak → doğrulama → DB oran sınırı |
| `app/admin/astroloji/efemeris/page.tsx` (+ uzman aynası) | Bayrak kapalıysa `notFound()` |
| `app/admin/astroloji/_components/ephemeris/EphemerisDesk.tsx` | Tablo ekranı |

## 2. Tanımlar ve zaman standardı

- **Konum:** geosantrik, GÖRÜNÜR (ışık zamanı + yıllık sapma), GERÇEK ekliptik ve ekinoks (IAU 2000B nütasyon). Işık bükülmesi yok (<0,05″; Güneş'e çok yakın gezegen hariç).
- **RA/deklinasyon:** gerçek ekvator ve ekinoks; ekliptik (λ, β) → ekvator (α, δ) kesin küresel dönüşümle, gerçek eğiklikle. Doğrudan ekvator vektörüyle sağlaması 0,00000″.
- **Hız:** boylamın ±1 saatlik merkezi farkı (anlık hız).
- **Satır anı:** 00:00 UTC (UT1 − UTC < 0,9 s; 1961 öncesi UT). Yerel motor TT'yi ortak zaman katmanından alır (`lib/astrology/time`, PR #647): 1961–2027-06-28 TT = UTC + 32,184 s + (TAI − UTC) kesin; 1961 öncesi ve sonrası TT = UT + ΔT (tablo). Ayrıntı: `zaman-standardi.md`.
- **ΔT:** `deltaT.ts`. Kaynak: skyfield 1.55'in yerleşik zaman ölçeği (IERS gözlemi + Morrison/Stephenson/Hohenkerk/Zawilski 2021). Her yılın 1 Ocak değeri, yıl içinde doğrusal ara değer.
  - astronomy-engine'in varsayılan Espenak–Meeus polinomu 2026'da 6 s, 2100'de 107 s fazla. Bu Ay'da 3″ / 60″ fark demek.
  - Global işlev değiştirilmedi (Lilly motoru varsayılanla çalışır). Zaman, `AstroTime.FromTerrestrialTime` ile TT'den kuruluyor.
  - 2025 sonrası tahmindir: Ay ve olay anları için not gösterilir.
- **Sağlayıcı saati (AŞAMA 2 ölçümü):** 1972 öncesi UT1; 1972–2025 UTC + gerçek DUT1; 2026 ve sonrası DUT1 = 0 (UTC–UT1 < 0,9 s). Önceki "1972–2030 UTC" ifadesi düzeltildi.
- **Sağlayıcının aylık tablosu** (`/astrology/planets/monthly`) **12:00 UTC'dir**. Ölçüm: 620 değerde 12:00 UT'ye ≤0,21″, 00:00 UT'ye 7°'ye kadar. Bu yüzden 00:00 UT tablosunda KULLANILMAZ.
- **Ortalama düğüm:** Meeus 47.7 polinomu + Δψ.
- **Gerçek düğüm:** Ay durum vektöründen oskülasyon düğümü (h = r × v, gerçek ekliptik).
- **Lahiri ayanamsa:** tanım 1956-03-21 0h'de gerçek ayanamsa 23°15′00,658″.
  - Ortalama değer = tanım − Δψ(t₀). Bu değer IAU 2006 genel presesyonu (p_A) ile taşınır.
  - Sidereal boylam = tropikal − (ortalama ayanamsa + Δψ).

## 3. Kaynak matrisi

| Alan | Yerel kaynak | Sağlayıcı kaynağı |
|---|---|---|
| Boylam, enlem | astronomy-engine + ΔT tablosu | Sağlayıcı `/astrology/planets` 00:00 UT |
| RA, deklinasyon | Yerel dönüşüm | Sağlayıcı λ/β'dan yerel dönüşüm |
| Hız, retro, durağan | Yerel ±1 sa | **Yerel** ±1 sa. Sağlayıcı hızı ±1 GÜN ortalaması (5 ondalıkta birebir); Ay'da anlık hızdan 117″/gün farklı |
| Burç girişi, istasyon | Yerel tarama | Yerel tarama. Sağlayıcıda doğum verisiz istasyon ucu yok |
| Düğüm | Ortalama: Meeus; gerçek: oskülasyon | Sağlayıcı (seçili tür) |
| Sidereal | Yerel Lahiri | Sağlayıcı tropikal − yerel Lahiri |

## 4. Ölçülen doğruluk

**Referans:** skyfield + JPL DE440, 188 an (1600–2600; artık gün, yıl dönümü, ekinoks/gündönümü, Ekim 2026 tam ay, 12:00 satırları). Gerçek düğüm için DE440 oskülasyon. Ortalama düğüm ve Lahiri için pyswisseph (yalnız test referansı).

**Yerel motor, en büyük fark:**

| Cisim/alan | 1600–1799 | 1800–2100 | 2101–2600 |
|---|---|---|---|
| Gezegen boylamı | ≤29″ (Plüton) | ≤20,5″ (Venüs) | ≤42″ (Plüton) |
| Ay boylamı | 35″ | 9,8″ | 52″ |
| Enlem | ≤21″ | ≤21,5″ | ≤26″ |
| RA·cosδ / dek | ≤30″ | ≤21″ | ≤52″ |
| Hız | ≤2,5″/gün | ≤1,5″/gün | ≤7,7″/gün |
| Gerçek düğüm | 22″ | 16″ | 42″ |
| Ortalama düğüm | 0,42″ | 0,26″ | 0,56″ |

Lahiri: ortalama 0,18″, gerçek 0,35″.

**Sağlayıcı** (gerçek 149 yanıt, ürün kod yolundan), 1800–2100:
- Gezegen boylamı ≤0,34″ (Merkür), Ay 2,1″.
- Enlem ≤0,16″, türetilmiş RA/dek ≤2,0″ (Ay).
- Gerçek düğüm 0,03″.

**Sağlayıcı, 2101–2600:** Güneş 17″, Ay 233″. Bu fark sağlayıcının kendi gelecek ΔT modelinden kaynaklanıyor. Gelecek ΔT bilinemediği için "doğru" taraf yoktur; bu yüzden dakika gösterimi kullanılır.

**Gösterim kuralı:**
- Sınır ≤1″ ise saniye.
- Sınır ≤3″ ise 0,1′.
- Aksi hâlde dakika.

Sınır cisim × alan × dönem bazında uygulanır (`bodyPrecision`). Sütun özeti en kaba değeri gösterir.

**Olaylar** (982 DE440 olayı: 2024–2027 tüm cisimler; 1900 ve 2100 Merkür/Mars/Venüs):
- Sayı ve tür birebir eşleşti.
- En büyük fark: Ay girişi 6 sn, Güneş 44 sn, Merkür istasyonu 8 dk, Neptün girişi 3,5 sa.
- Belirsizlik ölçülü sınırın ×2'si olarak bildiriliyor (fark/belirsizlik ≤0,50).
- Lilly bulucularıyla 2026 farkı ≤7,1 sn; bu ΔT politikası farkıdır (6 s).

## 5. Kapalı / sınırlı

- Saniye gösterimi yalnız sağlayıcı kaynağında, 1800–2100 aralığında, Ay hariç gezegenlerde. Yerel kaynak dakika veya 0,1′ gösterir.
- Sağlayıcının aylık 12:00 UTC tablosu kullanılmıyor (00:00 UT etiketi verilemez).
- Asteroit, Kiron, Lilith, heliosentrik, diğer ayanamsalar: yok.
- CSV yalnız yerel kaynakta. Sağlayıcı verisi toplu veri ürünü olarak dışa verilmez (sağlayıcı ToS "bulk data product" gri alanı).
- 1600 öncesi ve 2600 sonrası reddedilir.

## 6. Maliyet ve performans

- **Yerel:** 10 yıl × günlük (118 sayfa, 3.652 satır, 2.286 olay) 5–6 sn; en yavaş sayfa ~80 ms; yığın +17–25 MB.
- **Sağlayıcı:** gün başına 1 çağrı; sayfa ≤31 gün; kullanıcı başına saatte ≤6 sayfa. Süreç belleğinde 4.000 gün LRU; kalıcı önbellek yok (migration gerekir, owner kararı).
- Maliyet örnekleri: 1 ay 28–31 çağrı, 1 yıl 365, 100 yıl 36.525.

## 7. Testler

- `scripts/astrology/pro-ephemeris.harness.ts`: motor, olaylar, istek ve sayfa, sağlayıcı izdüşümü, biçim, CSV, ΔT, performans.
- `scripts/astrology/pro-ephemeris-provider.harness.ts`: gerçek sağlayıcı yanıtları ↔ DE440. Yanıtlar QA klasöründe; yoksa SKIP.
- `scripts/astrology/pro-ephemeris-ui.e2e.cjs`: bayrak kapalı/açık API + 5 görünüm (1366/768/390/375/320).
- Referans üreticileri QA kanıt klasöründe: `ref_uret.py`, `dugum_ref.py`.
