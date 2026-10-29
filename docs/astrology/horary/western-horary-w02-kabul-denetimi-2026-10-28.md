# HORARY-W-02 — teknik kabul denetimi (2026-10-28)

Kapsam: #591'in hesap altyapısı. Yeni teknik yok. Ücretli çağrı 0. Merge, deploy, migration ve bayrak yok.
Testler: `npm run test:astrology:horary-western` → 11/0 + 22/0 + **13/0** (yeni `horaryWestern03.harness.ts`).

## 1. Ekol karışması

| # | Bulgu | Kanıt | Durum |
|---|---|---|---|
| E1 | Radikallik her profilde `TRIPLICITY.lilly` ile hesaplanıyordu | `chart.ts` (eski satır 162) | **Düzeltildi.** Radikallik yalnız `methodology.radicality = lilly_ca121` ise hesaplanır; Dorothean'da `null` |
| E2 | Asal puan (5/4/3/2/1/−5/−4/−5) her profilde Lilly tablosuyla hesaplanıyordu | `calc.ts essentialDignity` | **Düzeltildi.** Puan yalnız `methodology.scoring = lilly_ca115` ise üretilir; diğer profilde `score: null` |
| E3 | Karşılıklı kabul +5/+4 ve arızi puanlar her profilde Lilly'den hesaplanıyordu | `chart.ts`, `accidental.ts` | **Düzeltildi.** Diğer profilde koşullar listelenir, puan `null`, toplam `null` |
| E4 | Dorothean profili yanma, ışın altı, cazimi, Via Combusta, Ay boşlukta ve ASC eşiklerini Lilly'den **sessizce** devralıyordu | `PROFILE_DOROTHEAN_EGYPTIAN = { ...PROFILE_LILLY_1647 }` | **Açıkça işaretlendi.** `inheritedFromLilly` alanı haritada `methodology` içinde yayımlanır. Değerler değiştirilmedi (doğru değer bir metodoloji kararı) |
| E5 | Lilly dikkat noktaları her profilde üretiliyordu | `chart.ts` | **Düzeltildi.** Yalnız `methodology.considerations = lilly_ca121_123` ise üretilir |

Harita çıktısına `methodology` bloğu eklendi: puan, radikallik ve dikkat yöntemi, devralınan eşikler, ev sistemi ve efemeris.
Testler: S1–S3 (`horaryWestern03`).

## 2. Kaynağı belirsiz üç değer — birincil kaynak görseliyle teyit

| Değer | 1647 (Wellcome `b30338724`) | 1659 2. baskı (Wellcome `b30328524_0001`) | Sonuç |
|---|---|---|---|
| 3. ev (arızi) | s. 115, yaprak n148: "In the third house **1**" | aynı | **+1 teyitli** |
| Doğrudan hareket | s. 115: "Direct (the ☉ and ☽ are alwayes so, as to them this is voyd) **4**" | aynı | **+4 teyitli** |
| Mars ortalama hızı | s. 65: "His mean motion is 31 **degr.** 27 min." → baskı hatası; aynı sayfada günlük hareket "32 34 … 44 min. a day" | "His mean motion is **31 min. 27 seconds**"; Lilly'nin kendi örneği "which you see in page 65, is 31…" | **31′27″ teyitli** |
| (ek) Işın altı | s. 115: glif bozuk ("+" benzeri) | açıkça **4** | **−4 teyitli** |

Kalan tek doğrulanmamış kalem: sabit yıldızların konumu ve orbu. Bu kalemler `verified: false` taşır ve toplama **girmez**
(`excludedUnverified` sayılır). Varsayılan harita yıldız kalemi üretmez. Test: S4.

## 3. Regiomontanus — kutup enlemleri

Swiss Ephemeris belgesi §6.4 ("House cusps beyond the polar circle"), www.astro.com/swisseph/swisseph.htm:
- ASC her zaman doğu yarıkürededir.
- Placidus ve Koch'ta Porphyry'ye **otomatik geçilir**. Bizde böyle bir geçiş **yok**.
- Regiomontanus ve Campanus'ta MC ufkun altındaysa MC ↔ IC yer değiştirir ve düzen saat yönüne döner.

Bağımsız denetim: astro.com swetest (DE441), 21.12.2026, boylam 10°E, ±66 / 67 / 70 / 80 / 89° enlem, 6 an. Toplam 60 referans;
ham çıktılar `scripts/astrology/fixtures/horary-western/swetest-ham-polar/` altında.

| Uygulama | Sonuç |
|---|---|
| Mevcut kapalı formül / vektör geometrisi (kutup sınırı olmadan) | 46/60 ≤1″. Sapan 14 vakanın **hepsinde yalnız 10. ve 4. cusp 180° farklı**; bu vakaların hepsi MC'nin ufuk altında olduğu ve |φ| > 90° − ε olan durumlar |
| `regiomontanusCuspsBeyondPolar` (geometri + §6.4 MC↔IC takası) | **60/60 ≤0,123″**; takas 14/60 |
| 66,0° (sınırın altında) | Mevcut fonksiyonla 6/6 aynı, takas yok |

Karar: güvenlik engeli **sürüyor**. `regiomontanusCusps` ve harita |φ| ≥ 90° − ε'da `polar_latitude` döner (test P2).
Geometrik çözüm referansla doğrulandı, ama ürüne açılması için şunlar gerekir:
1. Saat yönünde ev düzeninde `houseOf`, çizim ve raporun uyarlanması (bugün saat yönünün tersini varsayıyorlar).
2. Eğitmen kararı: klasik kaynaklar kutup ötesi haritayı tartışmaz; MC'nin ufuk altında olması horary okumasını değiştirir.

Başka ev sistemine sessiz geçiş yok. Yeni lisans, servis veya kütüphane yok.

## 4. Olay zamanlaması ve sınıflandırma

| # | Bulgu | Durum |
|---|---|---|
| Z1 | Kök çözüm hassasiyeti (≤1 sn) astronomik doğruluk değildir | **Eklendi:** her kesinleşme, istasyon ve girişte `uncertaintySec`. Hesap: DE441 karşılaştırmasından konum ±20″ ve hız ±1″/gün, göreli hıza / ivmeye bölünür. Ölçülen örnekler: Ay–Satürn ±74 sn · Ay girişi ±35 sn · Jüpiter–Satürn 120° ±1,0 sa · Merkür istasyonları ±2–5 dk. `ROOT_PRECISION_SEC = 1` ayrı tutulur |
| Z2 | Hüsran / "hızlı gösterge" ayrımı soru anındaki anlık hızla yapılıyordu. CA s. 112 tanımı ("a swift Planet would corporally joyne with a more ponderous") a–b kavuşumunda **yaklaşan** göstergeyi kastediyor | **Düzeltildi** (dar kapsam): `fasterSig = perfection.applier`. Engelleme kuralı (üçüncü gezegen yaklaşıyorsa) değişmedi |
| Z3 | Işık aktarımı, s. 125: kabul yalnız "House, Triplicity or Terme" | Doğru. Test T5: yücelme ve yüz kabulü `ok` üretmez. s. 111 tanımı ayrı bayrak |
| Z4 | Işık toplama, s. 126: toplayan daha ağır; iki gösterge de ona yaklaşır ve ikisi de onu "some of their essential dignities" ile kabul eder | Doğru, değiştirilmedi |
| Z5 | Refranation, s. 111: göstergelerden biri kesinleşmeden geri döner | Doğru: yalnız a/b istasyonu varken. Değiştirilmedi |

Hedefli testler:
- T2: yavaş çiftlerde (Mars–Jüpiter, Jüpiter–Satürn, Venüs–Satürn, 2026) bağımsız 1 saatlik taramayla aynı sayı ve aynı sıra; istasyon yakınında kök kaçmıyor.
- T3: Merkür geri hareketteyken iç kavuşum 2026-11-04 14:25Z bulunuyor; Venüs'ün geri hareketle Terazi'ye girişi tespit ediliyor.
- T4: 10 an × 3 çift üzerinde sınıflandırma özellikleri ve sıralama.
- T6: Ay burç sınırında ±60 sn.
- T7: 21 çift × 30 gün; kesinleşme anında hedef açı hatası ≤1″.

## 5. Regresyon ve belge tutarlılığı

- **1.349 ↔ 1.335:** fark yok. 25.10 yayın günlüğü (`74-yayin-dali/test-astrology-tum.log`) ve 28.10 günlüğü aynı sayıyı veriyor: `^PASS` satırı 1.349, "N PASS / M FAIL" özet toplamı 1.335, özet satırı 62. Aradaki 14, özetini "14 PASS, 0 FAIL" biçiminde yazan tek düzenekten geliyor; benim sayım ifadem bu biçimi yakalamıyordu. 62 özet satırı birebir aynı; yalnız tz01'in sırası farklı (25.10'da ayrı koşulmuştu).
- **Ortak `node_modules`** (`C:/yasam-atlas-transit/node_modules`): `package-lock.json` ile **788/788 paket sürümü birebir**, eksik 0. Ana depo `node_modules` ise başka bir dal için kurulmuş: 241 sürüm farkı, 54 eksik (`@resvg/resvg-js`, `next-intl`, `three`, `@roxyapi/ui` dahil). Yani testler kilit dosyasıyla tutarlı ortamda koşuldu. Tekrarlamak için `npm ci` ile kurulmuş bir `node_modules` yeterli.
- **#496:** AÇIK (Draft, `work/atl-p2-07-mez-duzeltme`, "Alman yasal saati"). #590'daki "açık değil" ifadesi yanlıştı: önceki sorgum PR'ları başlık anahtar kelimesiyle süzüyordu. #590'da düzeltildi.

## 6. #438 / #439 / #591 ilişkisi (çift merge önleme)

| PR | Dosyalar | #591 ile ilişki |
|---|---|---|
| #438 (`b2d298a4`) | `lib/astrology/horary/western/{calc,tables}.ts`, `scripts/astrology/horaryWestern.harness.ts`, `docs/astrology/horary/western-horary-calc-2026-10-18.md`, `package.json` (`test:astrology` zincirine ekleme) | #591'in ilk commit'i (`9c2256f9`) bu 4 dosyayı **byte düzeyinde aynen** içerir; sonraki commit'ler onları değiştirir. **#591 kabul edilirse #438 merge EDİLMEMELİ, kapatılmalı.** İkisi birden merge edilirse aynı dosyalarda çakışır. `package.json`: #438 `test:astrology` satırını, #591 ayrı `test:astrology:horary-western` anahtarını değiştirir |
| #439 (`a625bda3`) | `docs/astrology/horary/{README,01..05}.md` | **Ortak dosya yok.** Bağımsız merge edilebilir. README'deki "#438 taslak" ifadesi #591'e yönlendirilmeli (#439'a dokunulmadı) |
| #590 | `docs/astrology/eksik-teknikler-2026-10-28/` | Ortak dosya yok |

## 7. Ücretli API gereksinimi (her Horary analizinde Roxy çağrısı zorunlu mu?)

| Seçenek | Güvenilirlik | Maliyet | Teknik risk |
|---|---|---|---|
| **A. Tamamen yerel** (astronomy-engine + Regiomontanus) | Konum ≤17,8″, ev ≤0,2″ (DE441). Horary'nin her hesabı (evler, olaylar, saat) zaten yerel. Sağlayıcı Regiomontanus ve olay araması vermez | 0 | Tek motor; çalışma anında ikinci bir kontrol yok. astronomy-engine sürümü kilitli (2.1.19) |
| **B. Yerel + dönemsel doğrulama** (QA'da örneklem; 10.000 çağrılık büyük kampanyaya dahil) | A + bağımsız gözetim; `consistency` denetimi hazır | Yalnız doğrulama bütçesi | Düşük |
| C. Her analizde sağlayıcı kontrolü (natal-chart, 1 çağrı) | Motor hatasını her koşuda yakalar. Ancak sağlayıcının UTC/UT1 kuralı ASC'de 19,6″'ye kadar fark üretir (eşik 0,02° bunu tolere eder) | Analiz başına 1 | Sağlayıcı kesintisi Horary'yi durdurur; ham yanıt karantina tasarımı (#502, bekliyor) gerekir. Sağlayıcı verisi sonuca girmez, yalnız kontrol eder |

**Öneri: A + B.** Önceki raporumdaki "analiz başına 1 çağrı" zorunlu değil, bir tercihtir. C yalnız owner isterse; o durumda kesinti
davranışı (hata mı, uyarıyla devam mı) ayrıca karara bağlanmalı. Bu çalışmada çağrı yapılmadı; 105 korundu.

## 8. Kalan engeller
- Eğitmen kararları: `egitmen-karar-tablosu-lilly-2026-10-28.md`.
- Kutup ötesi düzen: yukarıda §3.
- Ürün entegrasyonu: ayrı PR (kayıt, ekran, Word/PDF, arşiv, mobil, e2e).
