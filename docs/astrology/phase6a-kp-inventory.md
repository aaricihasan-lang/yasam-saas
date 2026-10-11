# Astroloji Aşama 6A — Roxy KP (Krishnamurti Paddhati) Kabiliyet Envanteri

Kaynak: Roxy OpenAPI v2.0.0 (yerel kopya, 2026-10-07) + `@roxyapi/ui@0.49.0` paket kaynağı. Bu alt aşamada gerçek Roxy çağrısı
YAPILMADI (yalnız şema/doküman). "DOĞRULANDI" = sözleşmede uç + yanıt alanı var; GERÇEK yanıtla teyit 6B+ golden'larında yapılır
ve aşağıdaki tabloya işlenir.

## 1. KP uçları (11)

| Uç | Ne döndürür | Plan |
|---|---|---|
| `GET /vedic-astrology/kp/ayanamsa` | KP-Newcomb değeri (date/time/timezone), `instant`, `formula` "Newcomb precession theory" | çapraz denetim (isteğe bağlı) |
| `POST /vedic-astrology/kp/chart` | `meta` (ayanamsa değeri+tipi, `houseSystem` placidus), `ascendant`, 12 `cusps`, 7 `planets`, `nodes.rahu/ketu`, `significators.houseWise/planetWise` (L1–L4), `houseThemes` (anlatı), `focus` | **6B/6C/6D çekirdek — tek çağrı** |
| `POST /vedic-astrology/kp/cusps` | `kp/chart` cusp alt kümesi | gerekmez (chart kapsar) |
| `POST /vedic-astrology/kp/planets` | 9 graha + `nakshatraNumber`, retro | gerekmez (chart kapsar) |
| `POST /vedic-astrology/kp/ruling-planets` | an + konumda dayLord (gün doğumu esaslı), Ay/Lagna sign-star-sub-subsub lord, `rulingPlanets` sırası; doğum verisi verilirse `significators` | **6F-A** |
| `POST /vedic-astrology/kp/ruling-planets-interval` | aralıklı ruling planets + significator (rektifikasyon) | kapsam dışı (sonraya) |
| `POST /vedic-astrology/kp/horary` | 1–249 sayısı → Asc = alt bölümün ORTA noktası (`spanFrom/spanTo`), 12 Placidus cusp, 9 graha, ruling planets, significators | **6F-C** |
| `POST /vedic-astrology/kp/planets-interval` | aralıklı 9 graha KP hiyerarşisi (efemeris; en çok 7 gün) | **6F-B kısmi** (tek an) |
| `POST /vedic-astrology/kp/sublord-changes` | gezegenin sub-lord sınır geçiş anları (≤365 gün) | kapsam dışı (sonraya) |
| `POST /vedic-astrology/kp/rasi-changes` | burç giriş anları | kapsam dışı (Gochara/forecast benzeri) |
| `POST /vedic-astrology/kp/daily-finance` | 4 katmanlı finans PUANI (ağırlıklı hüküm) | **kapsam dışı** — hüküm/puan üretir, teknik değil |

Ek: `POST /vedic-astrology/dasha/major|sub/...` gövdesinde `significators: true` + `ayanamsa: "kp-newcomb"` → her dönem lordu için
star lord, sub lord, Placidus evi, L1–L4 evleri ve sınıf (KP dasha katmanı).

## 2. Teknik bazında sınıflandırma

| Teknik | Sınıf | Dayanak |
|---|---|---|
| KP sidereal doğum haritası | **DOĞRULANDI** | `kp/chart` (planets + nodes + ascendant + cusps) |
| KP ayanamsa | **DOĞRULANDI** | `ayanamsa` enum `kp-newcomb` (varsayılan) / `kp-old`; `meta.ayanamsa` değer + `meta.ayanamsaType`; ayrıca `kp/ayanamsa` |
| KP Placidus ev sistemi | **DOĞRULANDI (yalnız Placidus)** | `meta.houseSystem` "placidus"; istekte ev sistemi alanı YOK → başka sistem seçilemez (KP standardı Placidus — kısıt değil, ama gizlenmez) |
| House cusp dereceleri | **DOĞRULANDI** | `cusps[].longitude` (sidereal) |
| Cusp sign lord / star lord / sub-lord / sub-sub lord | **DOĞRULANDI** | `cusps[].signLord/starLord/subLord/subSubLord` (+ `nakshatra`, `pada`, `kpNumber`) |
| Gezegen sign/star/sub/sub-sub lord | **DOĞRULANDI** | `planets[]` ve `nodes.rahu/ketu` aynı alanlar; gezegende `house` (Placidus), `retrograde` |
| KP number (1–249) | **DOĞRULANDI** | `kpNumber` her noktada |
| Planet-wise / House-wise significator (4 düzey) | **DOĞRULANDI (Roxy yöntemi)** | `significators` — L1 yıldızı ev sakininde olan, L2 sakin, L3 yıldızı ev sahibinde olan, L4 sahip; düğümler için "agent" eki (dasha şeması: kavuşan, bakan, burç sahibi). Bu klasik KP 4 düzeyidir; ekol farkları (ör. düğüm ajanlığı, sub-lord'un ayrı katman sayılması) belge düzeyinde AÇIK DEĞİL → yöntem Roxy'nin tanımıyla etiketlenir |
| Cusp sub-lord → significator bağlantısı | **KISMİ** | Cusp sub-lord'u ve gezegen significator listesi var; "cusp sub-lord şu evleri gösterir" analizi ayrı alan olarak YOK → yalnız iki veriyi yan yana gösteririz, hüküm üretmeyiz |
| Ruling Planets | **DOĞRULANDI** | `kp/ruling-planets`; ayrıca `kp/horary.rulingPlanets` |
| KP Dasha / Bhukti / Antara | **DOĞRULANDI (Vimshottari + KP significator katmanı)** | dasha uçları KP ayanamsa + `significators:true`; tarihler klasik Vimshottari (aynı motor) — "KP olay tahmini" DEĞİL |
| KP olay zamanlama (event timing) | **DESTEKLENMİYOR** | Ev grubu → dönem eşleştirmesi yapan genel uç yok (yalnız `daily-finance` puanı, hüküm üretir) |
| KP Transit | **KISMİ** | `kp/planets-interval` bir an için KP hiyerarşili gezegen konumu verir; natal cusp'lara göre ev yerleşimi/transit analizi YOK |
| KP Horary (1–249) | **DOĞRULANDI** | `kp/horary` `horaryNumber` 1–249; Asc = alt bölüm orta noktası |
| Retrograde | **DOĞRULANDI** | `planets[].retrograde`; düğümler "her zaman retro" (belge; alan yok) |
| Rahu/Ketu | **DOĞRULANDI** | `nodes`; `nodeType` mean (varsayılan) / true |
| KP yorum/anlatı | **VAR (yorum katmanı)** | `houseThemes` anahtar kelimeleri (lang ile yerel), `significators.houseWise[].significators[].description` (düzey etiketi — teknik), ruling planets `houseThemes` |
| Hazır harita görseli | **DESTEKLENMİYOR** | API yalnız JSON; `@roxyapi/ui` `<roxy-kp-chart>` YALNIZ TABLO (planets/cusps/significators sekmeleri, SVG yok) |
| Sub-lord sınır anları | DOĞRULANDI (kapsam dışı) | `kp/sublord-changes` |

**KP ayanamsa seçeneğinin varlığı tüm KP'nin desteklendiği anlamına gelmez:** KP'ye özgü olan (cusp sub-lord, 4 düzey significator,
horary 1–249, ruling planets) ayrı uçlarda ve bu envanterde tek tek doğrulandı. Vedik D1/varga uçlarına `kp-newcomb` göndermek bir
KP haritası ÜRETMEZ (bütün-burç evler, sub-lord yok) — Yaşam Sistemi bunu KP diye sunmaz.

## 3. Kritik sözleşme notları

- Tüm KP uçlarında `timezone` varsayılanı **5.5 (IST)** → doğum ofseti HER ZAMAN açıkça gönderilir (Vedik ile aynı tuzak).
- `kp/chart.planets` yalnız 7 görünür graha; Rahu/Ketu ayrı `nodes` nesnesinde.
- `kp/ruling-planets.datetime` timezone sıfır değilse YEREL saat olarak yorumlanır (sondaki Z yok sayılır) → yerel saat gönderilir.
- Day lord gün doğumu esaslıdır (Hindu vara), gece yarısı değil.
- Horary'de Lagna değerleri `rulingPlanets` içinde ZAMAN tabanlı Asc'den gelir (sayıdan değil) — belgede açık.
- `houseThemes` anlatıdır → yalnız yorum katmanı (yetki/önizleme kapısı). `significators[].description` düzey etiketi (teknik, sabit).
- `focus` sorgu parametresi `houseThemes` dilini değiştirir → yalnız "general" kullanılır (finans odağı kapsam dışı).

## 4. Golden çağrı tahmini (6A sonrası)

| # | Uç | Amaç |
|---|---|---|
| 1 | `kp/chart` (kp-newcomb, mean node) | çekirdek: cusp + lord + significator doğrulaması |
| 2 | `kp/ruling-planets` (doğum verili) | ruling planets + significator |
| 3 | `kp/horary` (sayı 108, sabit an/konum) | horary doğrulaması |
| 4 | `dasha/major` (kp-newcomb, significators:true) | KP dasha katmanı |
| 5 | `dasha/sub/{md}` (kp-newcomb, significators:true) | alt düzey significator şeması |
| 6 | `kp/planets-interval` (tek an) | KP transit (kısmi) |
| 7 | `kp/ayanamsa` (doğum anı) | KP-Newcomb değerinin uçlar arası tutarlılığı |

**Tahmin: 7 gerçek çağrı (≤ 10)** → owner'ın "10'u aşarsa ayrı onay" eşiğinin altında. Ücret/kota: Roxy planı ve çağrı başı ücret
bu ortamda bilinmiyor (yalnız sayı tutulur). Başlangıç toplamı 38 → beklenen 45.

## 5. Bağımsız doğrulama planı (yalnız test kodu)

- Sidereal boylamlar: astronomy-engine tropikal − Roxy'nin bildirdiği KP ayanamsa (çerçeve tutarlılığı) + aynı kişinin Lahiri D1
  golden'ıyla farkın TÜM noktalarda sabit olması (= Lahiri − KP ayanamsa).
- Placidus cusp'ları: test kodunda bağımsız Placidus (yarı-yay) hesabı (astronomy-engine yerel yıldız zamanı + eğiklik).
- Star/sub/sub-sub lord + KP numarası: Vimshottari oranlarıyla bağımsız 249/2241 bölme tablosu; sınır testleri.
- Gezegen Placidus evi: cusp'lardan bağımsız yerleşim.
- Significator: KP 4 düzey kuralının bağımsız uygulaması (düğüm ajan kuralı ayrı raporlanır).
- Ruling planets: Ay/Lagna lord'ları bağımsız; gün lordu gün doğumu esaslı.
- Horary: Asc = sayının alt bölüm orta noktası; KP numarası tablosu.
