# Astroloji Aşama 5A — Roxy Vedik/Jyotish Envanteri ve Harita Kabiliyeti

Kaynak: Roxy OpenAPI v2.0.0 (yerel kopya, 2026-10-07) + `@roxyapi/ui@0.49.0` paket kaynağı (npm, MIT).
Gerçek Roxy çağrısı bu alt aşamada YAPILMADI (yalnız şema ve paket incelemesi).

## 1. Harita kabiliyeti (kullanıcı talimatındaki sıra)

| Soru | Bulgu |
|---|---|
| 1. Roxy hazır SVG/PNG harita veriyor mu? | **Hayır.** 261 operasyonun tamamı `application/json`; spec'te `svg`/`png`/`image/` geçmiyor. |
| 2. Gömülebilir harita bileşeni var mı? | **Evet.** Açık kaynak `@roxyapi/ui` (Web Components, Lit) / `@roxyapi/ui-react`, **MIT** lisanslı (Copyright 2026 Roxy Labs). `<roxy-vedic-kundli>` (D1; Kuzey/Güney/Doğu Hindistan), `<roxy-divisional-chart>` (D2–D60), `<roxy-dasha-timeline>`, `<roxy-vedic-planets-table>` vb. |
| 3. Çizim koordinatı/layout verisi var mı? | API'de yok; layout bileşen içinde (kundli-render). |
| 4. Yalnız hesap JSON'u mu? | API evet; görselleştirme ayrı açık kaynak kütüphanede. |

### `@roxyapi/ui` güvenlik/uyumluluk denetimi (kaynak koddan)

- **Lisans:** MIT — ticari kullanım, değiştirme, dağıtım serbest (lisans metni korunur).
- **Ağ:** bileşenler prop-güdümlü. Kendi kendine istek yalnız `data-endpoint` + `publishable-key`
  özniteliği VERİLİRSE (self-fetch modu; gizli anahtarı istemcide reddeder). Biz bu öznitelikleri
  **hiç kullanmayız** → bileşen ağ isteği yapmaz. Telemetri yok.
- **Veri sözleşmesi:** kundli `data.meta` (graha → rashi, longitude, nakshatra{name,pada,lord},
  isRetrograde, awastha), `combustion`, `planetaryWar`, `frame` alanlarını okur — **yalnız teknik alanlar.**
  → Ham Roxy yanıtı istemciye GİTMEZ: bileşene kendi beyaz liste projeksiyonumuzdan kurulan, yalnız
  teknik alanları içeren nesne verilir; yorum yetkisi kapalıyken anlatı zaten yoktur.
- **Etkileşim:** kundli bileşeni planet/house tıklama olayı YAYINLAMIYOR (README eski; kaynakta yalnız
  `roxy-render-error`/`roxy-symbol-select`). Harita içi ayrıntı = SVG `<title>` ipucu. Gezegen/ev seçimi +
  Bilgi Bankası paneli → haritanın yanındaki bağlantılı teknik tablodan.
- **Paket:** ESM, bileşen başına import (`@roxyapi/ui/components/vedic-kundli` ≈ 37 KB min), bağımlılık `lit`.
  Shadow DOM, tema `--roxy-*` CSS değişkenleriyle. Türkçe yerel (`tr`) mevcut.
- **Risk:** sürüm hızlı değişiyor (0.x; 0.49.0 = 2026-10-07). → **tam sürüm sabitlenir**; yükseltme
  bilinçli + golden görsel kontrolüyle.

**Karar:** Roxy'nin hazır, MIT lisanslı kundli/varga bileşeni kullanılır (ikinci harita motoru YAZILMAZ).

## 2. Ayanamsa

`lahiri` (Chitrapaksha, **varsayılan — belge**), `raman` (≈1.45° Lahiri altı), `kp-newcomb`, `kp-old`,
`custom` (+ `ayanamsaValue`). İlk sürüm: lahiri/raman/kp-newcomb/kp-old; `custom` değer doğrulaması
olmadan açılmaz. Ayanamsa önbellek anahtarına (istek gövdesi) ve snapshot'a girer.

**Kritik:** Vedik uçlarda `timezone` belirtilmezse **5.5 (IST) varsayılır** → her istekte doğrulanmış
DOĞUM ofseti açıkça gönderilir.

## 3. Endpoint envanteri (Vedik)

Saat: tüm doğum-tabanlı uçlar `date,time,latitude,longitude` ister. Roxy belgesi: “Time is CRITICAL for
Lagna and house divisions … nakshatra pada and divisional chart (D9, D10)”. Dasha tarihleri Ay boylamından
(≈0.5°/saat) → saat bilinmezse aylarca kayar. → **Tüm Vedik teknikler TIME_REQUIRED.**

| Endpoint | Ayanamsa | Teknik çıktı | Yorum/anlatı alanları | Plan |
|---|---|---|---|---|
| POST /vedic-astrology/birth-chart | ✔ | 12 rashi kutusu, meta (graha: rashi, boylam, nakshatra/pada/lord, retro, avastha), houses, combustion, planetaryWar, frame | houses[].description, yogas[].description, interpretations, avasthaInfo.* | **5B/5C D1 + Nakshatra/Pada** |
| POST /vedic-astrology/navamsa | ✔ | chart, vargottama | vargottamaExplanation | divisional-chart(9) yeterli |
| POST /vedic-astrology/divisional-chart | ✔ | division, chart, vargottama, frame | — | **5D D9 + D2…D60** (division ∈ 2,3,4,7,9,10,12,16,20,24,27,30,40,45,60) |
| POST /vedic-astrology/dasha/major | ✔ | 9 mahadasha, birthDashaBalance, Ay nakshatrası | mahadashas[].interpretation | **5E** |
| POST /vedic-astrology/dasha/sub/{md} | ✔ | antardashalar | *.interpretation | **5E** (isteğe bağlı, tembel) |
| POST /vedic-astrology/dasha/sub/{md}/{ad} | ✔ | pratyantardashalar | *.interpretation | **5E** (isteğe bağlı, tembel) |
| POST …/dasha/sub/{md}/{ad}/{pd}(/{sk}) | ✔ | sookshma / prana | *.interpretation | kapsam dışı (saat-dakika ölçeği) |
| POST /vedic-astrology/dasha/current | ✔ | o anki 5 seviye | *.interpretation | gerekmez (major+sub listesinden türetilir) |
| POST /vedic-astrology/yoga/detect | ✔ | yogas, total | yogas[].description | **5F** |
| POST /vedic-astrology/aspects | ✗ (sidereal=Lahiri sabit) | aspects, aspectTable, mutualAspects | — | **5F** (yalnız Lahiri) |
| POST /vedic-astrology/ashtakavarga | ✔ | BAV, SAV, reduced, shodhyaPinda | — | **5F** |
| POST /vedic-astrology/shadbala | ✔ | gezegen bazında 6 bala | balaThemes.*.meaning | **5F** |
| POST /vedic-astrology/panchang/basic | ✗ | tithi, nakshatra, yoga, karana | — | 5F (doğum panchangası; değerlendirilecek) |
| POST /vedic-astrology/panchang/detailed / choghadiya / hora | ✗ | gün muhurtaları | choghadiya effect | kapsam dışı (doğum haritası değil) |
| POST /vedic-astrology/transit (+monthly) | ✗ | natal vs transit (Gochar) | keyTransits[].description | ertelendi |
| POST /vedic-astrology/dosha/manglik, kalsarpa, sadhesati | ✔ | present, severity, type | description, remedies, effects | ertelendi (çoğunlukla hüküm/çare) |
| POST /vedic-astrology/arudha, chara-karakas, bhava-bala, bhav-chalit, upagraha, heliacal | ✔/✗ | çeşitli | *.meaning | ertelendi (sonraki tur) |
| POST /vedic-astrology/compatibility (+dashakoot, papasamyam) | ✔ | eşleşme puanları | recommendation, verdict | ertelendi (ikili; Aşama 3 eş modeli) |
| GET /vedic-astrology/yoga, nakshatras, rashis, avasthas | — | sözlük | anlatı ağırlıklı | KB referansı; çağrılmaz |
| POST /vedic-astrology/daily | — | günlük birleşik okuma | verdict | kapsam dışı |

### KP (yalnız envanter — bu aşamada geliştirme YOK)

/vedic-astrology/kp/ayanamsa, kp/planets, kp/cusps, kp/chart, kp/ruling-planets(-interval), kp/sublord-changes,
kp/rasi-changes, kp/planets-interval, kp/horary, kp/daily-finance — varsayılan ayanamsa `kp-newcomb`;
UI'de `<roxy-kp-chart>` mevcut.

## 4. Golden bütçesi (plan)

D1 1 · D9 (divisional) 1 · dasha major 1 · dasha sub(md) 1 · dasha sub(md/ad) 1 · yoga/detect 1 · aspects 1 ·
ashtakavarga 1 · shadbala 1 · (panchang/basic 1 — değerlendirme) ≈ 9–10 çağrı. Başlangıç toplamı 14.
