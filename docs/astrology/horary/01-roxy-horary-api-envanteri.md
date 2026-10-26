# A — Roxy Horary API Envanteri (2026-10-18)

Kaynak: Roxy OpenAPI **2.0.0** (`/api/v2/astrology/openapi.json`, `/api/v2/vedic-astrology/openapi.json`,
`/api/v2/openapi.json` — 18.10.2026 indirildi; 261 yol), `docs/guides/kp`, `docs/coverage`. Bu belgede yalnız
şemada/belgede **yazılı** olan bilgiler "API" diye geçer; davranış iddiaları depodaki gerçek golden yanıtlarla
desteklenir. **Bu çalışmada yeni Roxy çağrısı yapılmadı (0).**

Arama sonucu (OpenAPI'nin tamamında, büyük/küçük harf duyarsız): `regiomontanus`, `campanus`, `porphyr`, `alcabit`,
`topocentric`, `void of course`, `cazimi`, `under the beams`, `reception`, `via combusta` → **0 eşleşme**.
`horary` yalnız Vedik/KP şemasında (42). Tek horary ucu: **`/vedic-astrology/kp/horary`**.

## A1. KP Horary ve KP uçları

| Uç | İstek (gerçek alan adları) | Yanıt (horary için önemli) | Not |
|---|---|---|---|
| `POST /vedic-astrology/kp/horary` | `horaryNumber` 1–249*, `date`*, `time`* (HH:MM:SS), `latitude`*, `longitude`*, `timezone` (IANA veya ondalık; varsayılan 5.5), `ayanamsa` (kp-newcomb, kp-old, lahiri, raman, custom), `ayanamsaValue`, `nodeType` (mean/true); sorgu: `lang`, `focus` (general/finance) | `horaryNumber`, `questionTime` (UTC), `ayanamsaType`, `ayanamsaDegrees`, `ascendant` {longitude (dilimin ORTA noktası), degreeInSign, sign, star, starLord, subLord, kpNumber, spanFrom, spanTo}, `cusps[12]` {house, longitude, sign, star, starLord, subLord, kpNumber} (**sub-sub YOK**), `planets[9]` {planet, longitude, house (Placidus), isRetrograde, subSubLord, …}, `rulingPlanets` {dayLord, moonSign/Star/Sub/SubSublord, lagnaSign/Star/Sub/SubSublord, rulingPlanets[]}, `significators` {houseWise, planetWise (+agentHouses düğümde)}, `houseThemes` (anlatı), `focus` | Belge: "ruling planets … lagna values here are from the **TIME-based ascendant** … not from the horary number". Doğum verisi gerekmez. Ürün: `kp.horary` (Aşama 6F) |
| `POST /vedic-astrology/kp/ruling-planets` | `datetime` veya doğum verisi + konum | Gün lordu, Ay ve Lagna lordları, ruling listesi, isteğe bağlı significator | Ürün: `kp.ruling` |
| `POST /vedic-astrology/kp/ruling-planets-interval` | aralık + adım | Aralıklarla ruling planets | Ürüne bağlı değil (KP zamanlama tarayıcısı adayı) |
| `POST /vedic-astrology/kp/chart`, `/kp/cusps`, `/kp/planets` | doğum verisi | KP doğum haritası (Placidus, 4 düzey significator) | Ürün: `kp.chart` (`/kp/chart`; diğer ikisi alt küme) |
| `POST /vedic-astrology/kp/sublord-changes`, `/kp/rasi-changes`, `/kp/planets-interval` | gezegen + aralık (≤365 g / ≤7 g) | KP numarası, sub/yıldız lordu, burç geçiş anları | Ürün: KP Transit aralık kipi (TRANSİT-03). Horary zamanlaması için kullanılabilir — **yöntem eğitmen kararı** |
| `GET /vedic-astrology/kp/ayanamsa` | tarih | KP-Newcomb değeri | Doğrulama amaçlı |
| `POST /vedic-astrology/kp/daily-finance` | `gainHouses`, `lossHouses`, `weights` | Günlük finans puanı | Horary DEĞİL; puanlama sağlayıcının; kullanılmadı |

KP horary ayrıntıları (OpenAPI + golden `kp-horary.json`, 2026-10-07, sayı 108):
- 249 sayı = 27 nakshatra × 9 sub, burç sınırını kesen 6 sub iki numara alır (243 + 6). Asc = dilimin orta noktası
  (golden: 153°–155°06′40″ → 154.0556°).
- 12 cusp: verilen Asc'yi üreten RAMC'den değerlendirme yeri enleminde Placidus (bağımsız test ≤0.05°, phase6 6F).
- Gezegenler soru anının gerçek gökyüzü (KP efemerisiyle aynı an ≤1e-3°).
- Ruling Lagna'sı = gerçek zaman Lagna'sı: golden'da horary Lagna Başak (Merkür) iken ruling Lagna lordu Mars —
  astronomy-engine ile bağımsız doğrulandı (horary01 H5).
- Düğüm significator'ları: `signifies` ajan ekli, `allHouses`/`houseWise` sade (aynı yanıtta iki yöntem; Aşama 6.1/6.2).
- `focus=finance` yalnız `houseThemes` sözlüğünü değiştirir (yorum katmanı).

## A2. Batı Horary için kullanılabilecek uçlar (hiçbiri horary motoru DEĞİL)

| Soru (talimat A2) | Cevap | Kanıt |
|---|---|---|
| 1. Soru anının tropikal konumları alınabilir mi? | **Evet.** `/astrology/natal-chart` ve `/astrology/planets` herhangi bir an için tropikal boylam, enlem, günlük hız (negatif = retro), retro bayrağı (14 gövde). | OpenAPI; natal golden astronomy-engine ile ≤10″ (harness.ts) |
| 2. İstenen ev sistemleri? | **Yalnız** `placidus`, `whole-sign`, `equal`, `koch` (`/houses` "all" ile dördünü karşılaştırır). | OpenAPI enum |
| 3. Regiomontanus vb.? | **YOK** (Regiomontanus, Campanus, Alcabitius, Porphyry, Morinus, Topocentric — 0 eşleşme). | OpenAPI tam metin |
| 4. Anlık hareket / yaklaşan-ayrılan? | **Evet (anlık).** `aspects[].isApplying` + `orb` + bütün gövdelerde `speed`. Kesinleşme ANI tek-an uçlarında yok; `/astrology/aspects/monthly` (Ay HARİÇ 13 gövde, 9 açı, kesinleşme tarihi/saati, "dönüp kesinleşmeyen" çift için orb>0) ve `/vedic-astrology/aspects/lunar` (Ay–gezegen, 22 açı, dakika, `coordinateSystem: tropical` seçeneği) ayda bir olay listesi verir. | OpenAPI; isApplying 11 klasik açıda bağımsız formülle birebir (horaryWestern W8) |
| 5. Asal / arızi asalet kaynak verisi? | **Kısmen.** `dignity` (domicile/exaltation/detriment/fall/peregrine) **yalnız burç bazlı** — "triplicity, bounds and face are not considered". Ev konumu, retro, hız var → arızi koşullar türetilebilir; terim/üçlü/yüz tabloları sağlayıcıda yok. | OpenAPI `dignity` açıklaması |
| 6. Ay boşlukta, ışık aktarımı/toplanması, engelleme? | **Doğrudan yok.** Olay uçlarından (lunar aspects + transits/monthly Ay girişi + aspects/monthly) türetilebilir; tanım ekole bağlı; uçların gerçek yanıtı golden olarak henüz alınmadı. | — |
| 7. Neden desteklenmiyor? | Roxy Batı API'si natal/transit/takvim odaklıdır; horary terminolojisi (reception, VOC, combust) şemada yoktur; coverage sayfası "sistem eksikse talep edin" der. | `docs/coverage` |

Diğer yararlı uçlar: `/astrology/arabic-lots` (7 Hermetik lot; **gece formülü otomatik ters**; Lilly'nin tek formülüyle
gece haritalarında FARKLI), `/astrology/fixed-stars` (ürün: `western.fixed_stars`), `/astrology/ecliptic-crossings`
(düğüm geçişleri), `/astrology/transits/monthly` (Ay dahil 14 gövde burç girişi + retro giriş bayrağı),
`/astrology/profections` (yıl lordu — horary değil), `/vedic-astrology/panchang/hora` (gün doğumu–batımı eşit olmayan 24
saat, Kalde sırası = geleneksel **gezegen saati**; Batı "saat yöneticisi" denetimi için çerçeveden bağımsız kullanılabilir;
gün doğumu tanımı doğrulanmadı), `/vedic-astrology/heliacal` (Surya Siddhanta asta — Batı yanıklığı DEĞİL).

## A3. Vedik Prashna için uçlar
| Gereken | Roxy | Not |
|---|---|---|
| Soru anı Rashi kundali (Lagna, 9 graha, nakshatra) | `/vedic-astrology/birth-chart` (doğum yerine soru anı verilir; `combustion[]` orbuyla) | Ürün `vedic.d1` profil doğum verisini kullanır; soru-anı kipi YOK |
| Panchang (tithi, vara, nakshatra, yoga, karana) | `/panchang/basic`, `/panchang/detailed` | Ürün `vedic.panchanga` (doğum anı) |
| Hora (gezegen saati) | `/panchang/hora` | Ürüne bağlı değil |
| Gezegen gücü | `/shadbala`, `/bhava-bala`, `/ashtakavarga` | Natal amaçlı tanımlı |
| Drishti | `/aspects` (Parashari bütün-burç) | Ürün `vedic.drishti` |
| Yogalar | `/yoga/detect` (301 kayıtlık sözlük) | Natal yogaları; Prashna'ya özgü yoga YOK |
| Tajika aspektleri (Ithasala, Ishrafa, Nakta, Yamaya …) | **YOK** | — |
| Prashna Marga / Kerala (Arudha, Ashtamangala, Trisphuta, Prana-Deha-Mrityu sphuta) | **YOK** | — |
| Prashna tahmini / hüküm | **YOK** | — |

KP Horary, Vedik Prashna'nın tamamını temsil ETMEZ: KP 20. yüzyıl (K.S. Krishnamurti) sub-lord yöntemidir; Prashna
Marga (Kerala, 17. yy), Prashna Tantra / Tajika Neelakanthi (16. yy, Arap-Fars kökenli aspekt yogaları) ve
Shatpanchasika (Prithuyasas) farklı kurallar kullanır.

## A4. Denetim tablosu
Etiketler: MEVCUT · API İLE DOĞRULANDI · KAYNAK VERİDEN DOĞRULANARAK HESAPLANABİLİR · EKOL KARARI GEREKİYOR · API'DE YOK ·
DOĞRULANAMADI · GELİŞTİRİLDİ — TEST BEKLİYOR. Maliyet = ürün akışında analiz başına ücretli istek.

| Ekol | Hesaplama | Roxy endpoint | Gerçek alan adı | Projede var mı? | Eksik mi? | Bağımsız doğrulama | Uygulanabilir mi? | API maliyeti | Engel / durum |
|---|---|---|---|---|---|---|---|---|---|
| KP | Sayı → Asc (1–249) | kp/horary | `ascendant.spanFrom/spanTo/longitude/kpNumber` | Evet | Hayır | kpSub iki uygulama + horary01 H3/H4 | Evet | 1 | **MEVCUT · API İLE DOĞRULANDI** |
| KP | 12 Placidus cusp + star/sub lord | kp/horary | `cusps[]` | Evet | sub-sub yok (sağlayıcı vermez) | RAMC'den Placidus ≤0.05° | Evet | — | **MEVCUT · API İLE DOĞRULANDI** |
| KP | 9 graha (gerçek gökyüzü) + ev | kp/horary | `planets[]` | Evet | Hayır | KP efemerisi + Placidus aralığı | Evet | — | **MEVCUT · API İLE DOĞRULANDI** |
| KP | 4 düzey significator | kp/horary | `significators.houseWise/planetWise` | Evet | Hayır | KP kuralı (görünür 7 graha birebir) | Evet | — | **MEVCUT** (düğüm: yöntem etiketi) |
| KP | Ruling planets (zaman Lagna'sı) | kp/horary | `rulingPlanets.*` | Teknikte vardı; ekranda yalnız liste | Ekran ayrıntısı | astronomy-engine (H5, H6) | Evet | — | **GELİŞTİRİLDİ — TEST BEKLİYOR** (#437, owner kabulü) |
| KP | Cusp sub lordunun evleri | (yeniden düzenleme) | planetWise[subLord] | Hayır | Evet | KP kuralı (H7) | Evet | 0 | **GELİŞTİRİLDİ — TEST BEKLİYOR** (#437) |
| KP | Soru → ilgili cusp / olumlu evler | — | — | Hayır | — | — | Ekol | — | **EKOL KARARI GEREKİYOR** |
| KP | Olay zamanlaması (dasha / ruling transit) | kp/sublord-changes, ruling-planets-interval | — | Dolaylı (KP Transit) | Horary bağlantısı | — | Ekol | ≥1 | **EKOL KARARI GEREKİYOR** |
| KP | houseThemes `focus=finance` | kp/horary | `houseThemes`, `focus` | general | Evet | — (anlatı) | Evet | yeni anahtar | Owner kararı (yorum katmanı) |
| Batı | Soru anı tropikal konumlar + hız | natal-chart | `planets[].longitude/speed/isRetrograde` | Evet (natal) | Soru-anı tekniği yok | astronomy-engine ≤10″ | Evet | 1 | **API İLE DOĞRULANDI** |
| Batı | Regiomontanus / Alcabitius ev | — | — | Hayır | Evet | — | Hayır (yerel ev hesabı yapılmadı) | — | **API'DE YOK** |
| Batı | Placidus / Whole Sign / Equal / Koch | natal-chart, houses | `houseSystem` | Evet | — | ASC/MC ≤0.01° | Evet | 1 | **MEVCUT** (ev sistemi seçimi: EKOL) |
| Batı | Burç-bazlı asalet | natal-chart | `planets[].dignity` | Evet | — | horaryWestern W7 | Evet | — | **API İLE DOĞRULANDI** |
| Batı | Üçlü / terim / yüz + Lilly puanı | — | — | Hayır | Evet | Mısır terimi sağlaması; Ptolemaik DOĞRULANAMADI | Evet (tablo) | 0 | **GELİŞTİRİLDİ — TEST BEKLİYOR + EKOL** (#438) |
| Batı | Kabul / karşılıklı kabul | — | — | Hayır | Evet | Tablo | Evet | 0 | **GELİŞTİRİLDİ — TEST BEKLİYOR** (#438) |
| Batı | Sect | natal-chart / arabic-lots | `partOfFortune.sect`, `sect` | Gizli alan | — | W6 | Evet | — | **API İLE DOĞRULANDI** |
| Batı | Şans noktası | natal-chart / arabic-lots | `partOfFortune` | Natal'de | Lilly formülü yok | W6 (gece-ters birebir) | Evet | — | **EKOL KARARI GEREKİYOR** (Lilly tek formül ↔ gece ters) |
| Batı | Yaklaşan/ayrılan (anlık) | natal-chart, aspects | `aspects[].isApplying/orb` | Natal/transit | — | W8 (11/11) | Evet | — | **API İLE DOĞRULANDI** (orb kuralı: EKOL) |
| Batı | Kesinleşme anı (Ay dışı) | aspects/monthly | `date/time/orb` | Hayır | Evet | — (golden yok) | Evet | 1/ay | **DOĞRULANAMADI** (≤1 çağrı owner onayı) |
| Batı | Ay son/sonraki açı, boşlukta Ay | aspects/lunar (tropical) + transits/monthly | `events[]`, `transitEvents[]` | Hayır | Evet | astronomy-engine (W10) | Evet | 2/ay | **GELİŞTİRİLDİ — TEST BEKLİYOR** (+ tanım: EKOL; 2 çağrı owner onayı) |
| Batı | Yanık / ışın altı / cazimi | — (natal'de bayrak yok) | — | Hayır | Evet | Sınır testleri | Evet | 0 | **GELİŞTİRİLDİ — TEST BEKLİYOR + EKOL** (eşikler) |
| Batı | Via Combusta | — | — | Hayır | Evet | Sınır testleri | Evet | 0 | **EKOL KARARI GEREKİYOR** (aralık) |
| Batı | Retro / istasyon | natal-chart; aspects/monthly | `speed`, `isRetrograde` | Evet | İstasyon anı yok | — | Kısmen | — | **KAYNAK VERİDEN DOĞRULANARAK HESAPLANABİLİR** |
| Batı | Işık aktarımı / toplanması / engelleme / refranation | — | — | Hayır | Evet | — | Olay verisi + tanım | 1–3/ay | **EKOL KARARI GEREKİYOR + DOĞRULANAMADI** |
| Batı | Saat yöneticisi (radikallik) | panchang/hora | `planet/start/end` | Hayır | Evet | — | Evet | 1 | **DOĞRULANAMADI** (gün doğumu tanımı; 1 çağrı) |
| Batı | Considerations before judgement | (türetilmiş) | — | Hayır | Evet | Sınır testleri | Kısmen | 0 | **GELİŞTİRİLDİ — TEST BEKLİYOR + EKOL** |
| Batı | Olay zamanlaması (derece→zaman) | — | — | Hayır | — | — | Ekol | — | **EKOL KARARI GEREKİYOR** |
| Prashna | Soru anı Rashi kundali | birth-chart | burç nesneleri, `meta`, `combustion[]` | Natal D1 | Soru-anı kipi | D1 golden | Evet | 1 | **KAYNAK VERİDEN DOĞRULANARAK HESAPLANABİLİR** (okul: EKOL) |
| Prashna | Panchang / hora | panchang/*, hora | — | Natal panchanga | Soru-anı kipi | Panchang golden | Evet | 1–2 | **EKOL KARARI GEREKİYOR** |
| Prashna | Tajika yogaları | — | — | Hayır | — | — | — | — | **API'DE YOK** |
| Prashna | Prashna Marga / Kerala sphutaları, Arudha, Ashtamangala | — | — | Hayır | — | — | — | — | **API'DE YOK** |
