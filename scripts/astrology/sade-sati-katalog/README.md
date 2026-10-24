# Sade Sati — Satürn geçiş kataloğu araçları (YALNIZ GELİŞTİRME / DOĞRULAMA)

Üretim kodu bu betikleri ÇALIŞTIRMAZ ve efemeris kütüphanesi İÇERMEZ; üretim yalnız sürümlü veri dosyasını
(`lib/astrology/sadeSati/saturnCatalog.ts`) okur ve çalışma anında SHA-256 ile doğrular (bozuksa tarih üretmez).

| Betik | İş |
|---|---|
| `naif_katalog_uret.py <de440s.bsp> [yıl0] [yıl1]` | Satürn sidereal (Lahiri) burç geçişleri: NASA/JPL NAIF DE440 çekirdeği + Skyfield. İstasyonlar ikiye bölmeyle; monoton aralıklarda her 30° sınırı ikiye bölmeyle (1e-7 gün). Çekirdeğin SHA-256'sı uyuşmazsa DURUR. Çıktı `catalog.json`. Aynı girdi → aynı olay listesi (SHA). |
| `ts_uret.py <catalog.json> <dogrulama.json> <hedef.ts>` | `catalog.json` + çapraz doğrulama özeti → `saturnCatalog.ts` (elle düzenlenmez; SHA ve olay sayısı yeniden doğrulanır). |

Bağımlılıklar: `skyfield` 1.55 (MIT), `jplephem` 2.24 (MIT), `numpy` (BSD-3). Swiss Ephemeris / pyswisseph KULLANILMAZ.
Çekirdek depoya konmaz (32,7 MB): https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp
— SHA-256 `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`.

## Sürüm 2 (23.10.2026)

- Kapsam 1900-01-01 – 2100-12-31 (tarama 1898–2103), **176 olay** (kapsamda 172), 396 istasyon, 46 retro geçiş.
- SHA-256 `19bea26cd400a38b63868a54c9d7c81f0bd1d1b72ec9c6a76fc80bfd0fcc944e` — girdi: her olay için
  `utc|from|to|motion|tol(2 ondalık)` satırları, LF ile birleşik.
- Konum: geosantrik görünür (ışık zamanı, sapma, ışık bükülmesi), gerçek ekliptik/ekinoks of date (IAU2006/2000A),
  Satürn barisantırı (de440s merkez içermez; fark < 0,05″). Zaman: UT1 (saniyeye yuvarlı; gelecek = öngörülen UT1).
- Çapraz doğrulama (yalnız kontrol; ürün verisi bunlardan TÜRETİLMEZ):
  - Swiss Ephemeris v1 kataloğu: topoloji 176/176, retro 46/46 aynı sırada, istasyon 396/396; medyan 0,003 dk, en büyük 0,163 dk.
  - JPL Horizons DE441 (olay anlarında görünür boylam, 5 istek): medyan 0,07″, en büyük 2,44″ (2079 Güneş kavuşumu —
    Horizons ışık bükülmesi farkı, ΔT değil).
  - astronomy-engine (VSOP87): topoloji 176/176 aynı (dakika doğruluğu zayıf; yalnız topoloji).

## Ayanamsa (Lahiri, IAE gerçekleştirimi) — sabit hiçbir hedefe göre AYARLANMAZ

1. Tanım: 21 Mart 1956 0h TT anında GERÇEK ayanamsa 23°15'00,658" (ICRC 1955; IAE 1985 düzeltmesi, IAE 1989 s.556).
2. T0'da gerçek → ortalama: Δψ IAU1980 (Wahr) = 16,768926843″ (ERFA `nut80`), IAE'nin kullandığı nütasyon modeli.
3. T0 → J2000,0: IAU1976 (Lieske) genel presesyon — IAE'nin kullandığı presesyon modeli.
4. J2000,0 → t: IAU2006 (Capitaine vd. 2003) genel presesyon; gerçek(t) = ortalama(t) + Δψ IAU2000A(t).

Gerekçe: IAU1976 ve IAU2006 serileri J2000,0'da çakışacak biçimde tanımlıdır; IAE'nin 1956 değerini kendi modeliyle
J2000,0'a taşıyıp oradan güncel modelle sürdürmek sabit sidereal başlangıcı IAE'ye sadık biçimde modern sisteme aktarır.
Sonuç: sağlayıcının Lahiri ayanamsasından (1990-07-15) +0,029″; Swiss Ephemeris SIDM_LAHIRI ile pratikte aynı.
Duyarlılık: alternatif yorum (IAU2006'yı doğrudan T0'dan uygulamak) tüm anları −0,139″ kaydırır → medyan 0,60 dk,
en büyük 6,6 dk (2041 duraklama). Bu fark dönem gösteriminin dakika düzeyindeki belirsizliğidir.

Katalog değişirse `version` ve `SADE_SATI_PERIODS_METHOD` damgası değişir; eski kayıtlar kendi damgası, kaynak metni
ve SHA-256'sıyla açılır (sessiz dönüştürme yok).

## Lisans notu (HUKUKİ GÖRÜŞ DEĞİLDİR)

- NAIF kuralları: SPICE bileşenlerinin ticari üründe kullanımı serbest, ücret/lisans yok; değiştirilmemiş çekirdek yeniden
  dağıtılabilir (https://naif.jpl.nasa.gov/naif/rules.html). Bu depo çekirdeği dağıtmaz; yalnız hesaplanmış 176 anı taşır.
- Skyfield / jplephem MIT; numpy BSD-3.
- Swiss Ephemeris (AGPL-3.0 / ücretli Professional) ve pyswisseph (AGPL-3.0) bu sürümde KULLANILMAZ; v1 üretim betikleri
  ürün deposundan kaldırıldı ve QA arşivinde tutulur.
- Hesaplanmış veri tablosunun ticari dağıtım hakkı ile yazılım lisansı aynı şey değildir; kesin değerlendirme hukukçuya aittir.
