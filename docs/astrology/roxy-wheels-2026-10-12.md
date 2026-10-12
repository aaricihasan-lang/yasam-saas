# Gökyüzü Atlası — Roxy çift halka haritaları (2026-10-12)

Dal `work/atlas-roxy-wheels` (PR #392'nin üstünde). Migration YOK. Gerçek Roxy çağrısı: **0**.

## Ne eklendi
| Teknik | Çizim | Veri kaynağı | Yeni istek |
|---|---|---|---|
| Sinastri | Roxy `<roxy-synastry-chart>` (MIT, `@roxyapi/ui` 0.49.0) — dış halka analizin sahibi (person1), iç halka karşı taraf (person2) | Kayıtlı `/astrology/synastry` sonucu | 0 |
| Transit (tek an) | Roxy `<roxy-transit-wheel>` — iç halka natal (+ natal ev cusp'ları, ASC solda), dış halka transit, açı çizgileri | Kayıtlı `/astrology/transits` sonucu + AYNI doğum verisinin önbellekteki natal sonucu | 0 |
| Solar Arc | EKLENMEDİ (aşağıda gerekçe) — tablo + yorum aynen | — | — |

Bileşenler yalnız "denetimli kip"te: veri bizim kayıtlı teknik katmanımızdan, self-fetch / tarayıcıda anahtar YOK, yorum
metni bileşene verilmez (`hide-readings`). Bileşen astrolojik hesap yapmaz; kalabalıkta kaydırılan sembol ince çizgiyle
gerçek dereceye bağlanır.

### Transit natal çerçevesi (yalnız önbellek)
`TechniqueDefinition.contextUnits` (yeni): plana, istek sayısına, onaya ve kayıt zorunluluğuna GİRMEYEN, asla sağlayıcıya
gönderilmeyen, yalnız önbellekte varsa kullanılan birimler. Transit için: aynı doğum verisi + aynı düğüm türüyle natal
(ev sistemi önceliği Placidus → Tam burç → Eşit → Koch). Gövde doğum verisinden kurulduğu için başka revizyonun / başka
kişinin natali eşleşemez. Natal yoksa, düğüm türü farklıysa veya doğum saati bilinmiyorsa çark ÇİZİLMEZ ve uzmana neden
gösterilir. Çerçeve kayıtlı analizin teknik snapshot'ına girer → arşivden açılış 0 istek. Eski transit kayıtlarında çerçeve
yoktur → çark yerine neden metni (kayıt değiştirilmez).

## Doğrulama
- **Veri sadakati** (`phase3.harness` W1–W6, gerçek golden Roxy yanıtları): natal 14 + transit 14 cisim boylam/burç/derece,
  12 natal cusp, ASC; sinastri 2 × 14 cisim + iki ASC → Roxy yanıtıyla BİREBİR. Bağlam yalnız önbellek (natal yokken planda
  1 istek, sağlayıcıya natal gitmez); revizyon / düğüm / saat-bilinmiyor uyuşmazlığında çerçeve yok; kayıt + arşivden açma
  0 istek ve aynı veri; sinastride person1 = analizin sahibi (B'nin dosyasından açılınca tersine döner); sahte ev verisi yok.
- **Geometri** (`wheels-geometry.e2e.cjs`, 375 / 390 / 1536 px — 53/53): SVG'den her cismin çizildiği açı okunup boylama
  çevrildi. Kaydırılan sembollerin gerçek derece işareti 0,0000° sapma; kaydırılmayan semboller ≤ 0,5° (bileşen eşiği; 0,5°
  üstü kaydırmada ince çizgi çizilir). Doğru halka (natal r≈94 / transit r≈124; sinastri 1. kişi r≈124 / 2. kişi r≈96),
  derece etiketi ve ipucu derece/dakikası = veri (kesme), 12 ev cusp çizgisi 0,0000°, ASC solda, sinastride ev çizgisi yok.
  Uç durumlar: 359,95° / 0,05°, 29,99° / 30,01°, 1,2° içinde 4 cisim, ASC 359,9°.
- **Uygulama içi** (`wheels-ui.e2e.cjs`, 375 / 390 / 1536 px — 21/21): sonuç masası ve arşivden açma aynı haritayı
  gösterir; natalsiz durumda çark yok + neden; Odak modu; taşma yok; natal çark bozulmadı; 0 Roxy isteği.
- Bağımsız referans: transit konumları önceden astronomy-engine ile ≤ 0,01° doğrulanmıştı (phase3 "astronomi" testi);
  bileşen bu veriyi 0,0000° sapmayla çiziyor.

## Solar Arc — neden eklenmedi
1. `@roxyapi/ui` 0.49.0'da Solar Arc bileşeni yok; Roxy widget sayfasında da yok.
2. Roxy Solar Arc yanıtı 16 noktanın natal + directed boylamını veriyor (veri eksik değil) ama directed → natal açıları
   Roxy vermiyor; bizde ARİTMETİK hesaplanıyor (`SOLAR_ARC_ASPECT_METHOD`).
3. `<roxy-transit-wheel>` Solar Arc'la kullanılırsa sabit metinler yanıltır: ipuçları "Transiting …", açı çizgisi başlıkları
   "Transiting X … Natal Y", SVG erişilebilirlik metni "Natal and transit bi-wheel / transiting bodies". Directed ASC/MC
   bileşenin cisim adı listesinde yok (sembol yerine metin, cisim gibi çizilir).
4. Doğruluk ancak bileşen metinlerini DOM'da değiştirerek ya da kendi çift halka çizimimizi yazarak sağlanabilir — talimat
   gereği eklenmedi; Solar Arc tablo + yorumları aynen korunur.

## Bilinen küçük konular
- Bileşen ipuçlarında birkaç İngilizce sözcük ("Transiting", "retrograde", "House N") — Roxy TR kataloğunda yok.
- Tam dakika sınırındaki değerlerde ipucu kayan nokta nedeniyle 1′ eksik gösterebilir (gerçek verilerde görülmedi).
