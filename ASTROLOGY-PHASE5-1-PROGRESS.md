# ASTROLOJİ AŞAMA 5.1 — İLERLEME KAYDI (Vedik eksikler, doğruluk, premium kalite)

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline f132a624..HEAD` okuyun. Golden çağrı yapmadan
> önce `scripts/astrology/fixtures/golden/vedic-*.json` dosyalarını ve aşağıdaki çağrı kaydını kontrol edin.

- Başlangıç HEAD: `f132a624` (Aşama 5 yerel mühür; temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Push / preview / merge / production / migration: YOK. KP: YOK (Aşama 6 ayrı onay).

## Alt aşamalar

| Alt aşama | Durum | Commit |
|---|---|---|
| 5.1A Vedik Transit (Gochara) | ✅ tamam | b1ea6f16 |
| 5.1B D2–D60 bağımsız doğrulama | ✅ tamam | (5.1B commit) |
| 5.1C Kuzey/Güney/Doğu görsel denetim | ⏳ | — |
| 5.1D Türkçe gezegen etiketleri | ⏳ | — |
| 5.1E Graha Drishti yöntem denetimi | ⏳ | — |
| 5.1F Dasha alt düzey testleri | ⏳ | — |
| 5.1G KB/kayıtlı analiz/güvenlik/regresyon/mutasyon + nihai rapor | ⏳ | — |

## Gerçek Roxy çağrı kaydı

| Alt aşama | Endpoint | Neden | Sonuç | Sayı |
|---|---|---|---|---|
| (Aşama 0–5) | — | — | — | 23 |
| 5.1A | POST /vedic-astrology/transit (sentetik A, an 2026-10-07 09:00 UTC = Batı transit golden'ıyla aynı an) → `vedic-transit.json` | Gochara yanıt şemasının gerçek doğrulaması (belge yalnız şema) | OK, 6 üst alan, şema belgeyle uyumlu | 1 |

| 5.1B | POST /vedic-astrology/divisional-chart (division 30, lahiri, sentetik A) → `vedic-d30.json` | D9 golden'ı BPHS ile düz eşit bölmeyi AYIRT EDEMEZ; D30 Parashari eşit olmayan dilimler ayırt edicidir (endpoint'in tek yeni çağrısı) | OK; `degreesPerDivision: "Unequal"`; 10/10 BPHS | 1 |

Toplam: **25**.

## 5.1A — Gochara bulguları ve kararlar

- Roxy `POST /vedic-astrology/transit` VAR (belge: "Transit Analysis … (Gochar)"). **Ayanamsa alanı YOK**: `coordinateSystem`
  `sidereal` = Lahiri sabit (`tropical` da var — ASLA gönderilmez). → `vedic.transit` yalnız Lahiri; başka ayanamsada birim YOK
  (0 istek + açık neden), Drishti/Panchanga ile aynı kural.
- **Tek timezone alanı** hem doğum hem transit saatine uygulanır → transit anı (UTC) doğum ofsetinde yerel saate çevrilip gönderilir
  (09:00 UTC, +3 → 12:00:00). Yanıt `transitDatetime`/`birthDatetime` yankısı denetlenir (uyuşmazsa kaydedilmez).
- Yanıt: natal 9 graha (Lagna'dan bütün-burç ev), transit 9 graha: `natalHouse` (Lagna'dan), `houseFromMoon` (Janma Rashi — klasik
  Gochara referansı), `drishtiToNatal` (**bütün-burç Parashari**; Rahu/Ketu bakış atmaz; güç hep 100), `kaksha` (Gochara Kaksha:
  3°45′ dilim, yönetici, bindu, binduCount), `keyTransits` (yavaş grahalar + anlatı).
- `aspectsToNatal` = **Batı sözlüğü** (kare/üçgen/altmışlık, derece+orb) → Vedik teknik katmana ALINMAZ (Batı transitle karışmasın).
  `keyTransits[].description` → yalnız yorum katmanı (yetki/önizleme kapısı).
- Kaksha `bindu` sağlayıcının "favourable/unfavourable" diye açıkladığı alan — UI'da hüküm dili YOK, yalnız "bindu var/yok" +
  "kaksha yöneticisi bindu vermiş/vermemiş"; Rahu/Ketu `null` = "uygulanmaz" (asla olumsuz gösterilmez).
- Not bağlamı yalnız `ayanamsa:lahiri` (an not bağlamına girmez; notlar tarih tarih bölünmez). Konu türleri ayrı:
  `gochara_graha_in_rashi`, `gochara_from_moon`, `gochara_in_bhava`, `gochara_drishti` (bağlam `vedic_gochara`; DB regex uyumlu).
- Migration YOK (teknik adı DB CHECK `^[a-z][a-z0-9_.]{2,63}$` ile uyumlu).

### 5.1A bağımsız doğrulama (golden)

- Transit boylamları = astronomy-engine tropikal − Lahiri(transit anı) **≤ 0.0066°** (9/9; Rahu/Ketu ortalama düğüm).
- Natal = Vedik D1 golden birebir; Lagna (Terazi) ve Janma Rashi (Balık) D1 ile aynı.
- BPHS bindu tabloları (yalnız test kodunda) Roxy Ashtakavarga golden'ını **8×12 aynen** üretiyor → kaksha `binduCount` = natal BAV (7/7),
  `bindu` = kaksha yöneticisinin BAV katkısı (7/7).
- Drishti listesi Parashari bütün-burç kuralıyla birebir (Jüpiter → natal Rahu 12.09° "orb" ile de tam bakış: orb koşul değil).

### 5.1A testler

- `phase51.harness.ts`: 10/10 PASS (golden gövde, projeksiyon, 4 bağımsız doğrulama, 17 fail-closed mutasyon, motor/önbellek/
  Lahiri-dışı/TIME_REQUIRED/"şimdi", Batı↔Vedik ayrımı, yorum kapısı + KB + not + kayıtlı analiz 0 istek + tenant 404).

## 5.1B — D2…D60 bağımsız doğrulama

- Roxy belgesi: "Based on Brihat Parashara Hora Shastra (BPHS) Shodasha Varga system". Desteklenen bölümler (belge) =
  **2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60** (15 varga; D1 ayrı teknik). Aradaki sayılar varga DEĞİLDİR, sunulmaz.
- **Kritik bulgu:** Aşama 5'teki tek varga kanıtı D9 idi; D9 hem BPHS hem "Koç'tan düz eşit bölme" (yaygın hatalı uygulama) ile
  aynı sonucu verir → D9 tek başına Roxy'nin BPHS uyguladığını kanıtlamıyordu. D30 golden'ı düz bölmeyle 10 noktanın ≥8'inde
  farklı, BPHS Parashari Trimsamsa ile **10/10 aynı** → yöntem teyit edildi.
- `lib/astrology/verify/varga.ts`: 15 bölümün **Parashari** kuralı (BPHS Bölüm 6–7), yalnız DOĞRULAMA için (hiçbir değer buradan
  üretilip gösterilmez). Çok ekollü vargalarda (Hora, Drekkana, Trimsamsa, Shashtiamsa) yalnız Parashari; diğer ekoller yok.
- Arayüz: her varga haritası açıldığında Lagna + 9 graha BPHS kuralıyla denetlenir → yeşil "Bağımsız denetim 10/10" (golden
  teyitli bölümde ayrıca belirtilir) · kırmızı "Doğrulanmadı" (farklı noktalar ve kural rashisi listelenir; yöntem farkı olabilir)
  · "unsupported". Uyuşmazlık sonucu REDDETMEZ (Roxy değeri gösterilir, doğrulanmış SAYILMAZ). D9 için adaptördeki pada↔navamsa
  fail-closed denetimi aynen sürer.

| Varga | Bölüm | Ayanamsa | Yöntem (Roxy: BPHS) | Golden teyidi | Durum |
|---|---|---|---|---|---|
| Hora | D2 | seçilen | Parashari Hora (yalnız Yengeç/Aslan) | yok | canlı BPHS denetimi |
| Drekkana | D3 | seçilen | Parashari (1-5-9) | yok | canlı denetim |
| Chaturthamsa | D4 | seçilen | Parashari (1-4-7-10) | yok | canlı denetim |
| Saptamsa | D7 | seçilen | Parashari (tek: aynı / çift: 7.) | yok | canlı denetim |
| **Navamsa** | **D9** | seçilen | Parashari (+ pada↔navamsa) | **var (5D)** | **doğrulandı** (+ fail-closed) |
| Dasamsa | D10 | seçilen | Parashari (tek: aynı / çift: 9.) | yok | canlı denetim |
| Dwadasamsa | D12 | seçilen | Parashari (aynı burçtan) | yok | canlı denetim |
| Shodasamsa | D16 | seçilen | Parashari (Koç/Aslan/Yay) | yok | canlı denetim |
| Vimsamsa | D20 | seçilen | Parashari (Koç/Yay/Aslan) | yok | canlı denetim |
| Chaturvimsamsa | D24 | seçilen | Parashari (tek Aslan / çift Yengeç) | yok | canlı denetim |
| Bhamsa | D27 | seçilen | Parashari (element başlangıcı) | yok | canlı denetim |
| **Trimsamsa** | **D30** | seçilen | Parashari eşit olmayan 5/5/8/7/5 | **var (5.1B)** | **doğrulandı** |
| Khavedamsa | D40 | seçilen | Parashari (tek Koç / çift Terazi) | yok | canlı denetim |
| Akshavedamsa | D45 | seçilen | Parashari (Koç/Aslan/Yay) | yok | canlı denetim |
| Shashtiamsa | D60 | seçilen | Parashari (aynı burçtan sayım) | yok | canlı denetim |

Tüm bölümlerde Roxy alanları aynı şema: `division{number,name,sanskritName,degreesPerDivision,significance}`, `chart.meta`
(Lagna + 9 graha: rashi, D1 boylamı, nakshatra, ev, retro), 12 rashi kutusu, `vargottama`; harita = `<roxy-divisional-chart>`
(kendi teknik projeksiyonumuzla), `significance` yalnız yorum katmanı.

"Canlı denetim" = gerçek kullanımda her yanıt bu kuralla karşılaştırılır ve sonuç ekranda yazar; bu 13 bölüm GERÇEK Roxy
verisiyle (golden) henüz test EDİLMEDİ. Tam teyit için önerilen sınırlı iş: kalan 13 bölüm × 1 golden = 13 çağrı (owner onayı
gerekir; "endpoint başına başlangıçta en fazla 1" kuralı nedeniyle YAPILMADI).

### 5.1B testler
- phase51 +5 (15/15): D30 golden gövde/projeksiyon; D9+D30 10/10 BPHS; ayırt edicilik (D9 düz bölmeyle aynı → yetersiz kanıt; D30
  düz bölmeyle ≥8/10 farklı); referans tablosu iç tutarlılığı (D9 = pada↔navamsa = düz bölme, D27 = düz bölme, D2 yalnız
  Yengeç/Aslan, D30 sınırları, D60 ≠ düz bölme); uyuşmazlık reddedilmez ama işaretlenir.

## Sıradaki kesin adım

5.1B commit → 5.1C (Kuzey/Güney/Doğu görsel denetim, tarayıcıda gerçek ekran görüntüsü).
