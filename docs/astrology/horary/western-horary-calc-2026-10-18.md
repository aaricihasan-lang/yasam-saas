# HORARY-W-01 — Klasik Batı Horary: doğrulanmış hesap katmanı (2026-10-18)

**Durum: GELİŞTİRİLDİ — TEST BEKLİYOR / EĞİTMEN ONAYI GEREKİYOR. Ürüne BAĞLI DEĞİL.**
`lib/astrology/horary/western/` hiçbir route, motor, ekran veya rapor tarafından import edilmez; kullanıcı bu kodu
göremez. Amaç: eğitmen ekolü seçtiğinde Gökyüzü Atlası'na ayrı bir teknik olarak bağlanabilecek, testli ve kaynaklı
bir temel. Migration yok, yeni Roxy çağrısı yok.

## Neden yalnız hesap katmanı (D2'nin durma koşulu)
1. **Ev sistemi:** Lilly ve çoğu klasik horary kaynağı Regiomontanus kullanır. Roxy Batı uçları yalnız
   `placidus | whole-sign | equal | koch` sunar (OpenAPI 2.0.0, `/astrology/natal-chart`, `/astrology/houses`).
   Başka sistemi "Regiomontanus" adıyla göstermek yasak; yerel ev hesabı bağımsız referans olmadan doğrulanamaz → yapılmadı.
2. **Asalet:** Roxy `dignity` yalnız burç bazlıdır ("triplicity, bounds and face are not considered" — OpenAPI).
   Üçlü ve terim tabloları ekole göre değişir → tablolar burada iki varyantla, eğitmen seçimine bırakıldı.
3. **Kesinleşme sırası:** Işık aktarımı / toplanması / engelleme / refranation ve Ay boşlukta için gelecekteki
   kesinleşme anları gerekir. Roxy bunu tek-an uçlarında vermez; aylık olay uçlarında verir (aşağıda) ama bu uçların
   gerçek yanıtı henüz golden olarak alınmadı (owner onayı gerekir).

## İçerik
| Dosya | İçerik | Kaynak / doğrulama |
|---|---|---|
| `tables.ts` | 7 klasik gezegen; ev yöneticileri; yücelme (burç+derece); zarar/düşüş (türetilmiş); üçlü (Dorothean · Lilly); terimler (Mısır · Ptolemaik); yüzler (Kalde, algoritmik); Lilly puanları | Mısır terimleri: gezegen toplamı = küçük yıllar (57/79/66/82/76) **bağımsız sağlama PASS**. Ptolemaik terimler: yalnız Koç satırı çevrimiçi teyit edildi → profilde `unverified: ["terms:ptolemaic"]` |
| `calc.ts` | Profil (`lilly-1647`, `dorothean-egyptian`); asalet + puan; kabul / karşılıklı kabul; sect; Şans noktası (Lilly sabit · gece ters); anlık yaklaşan/ayrılan + doğrusal tahmin; cazimi/yanık/ışın altı; Via Combusta; Ay son/sonraki açı + boşlukta Ay (olay listesinden); konumsal dikkat noktaları | Her eşik profilde adlandırılmış ve kaynaklı |

## Testler — `scripts/astrology/horaryWestern.harness.ts` 11/0 (test:astrology zincirinde)
- **GERÇEK Roxy (depodaki natal golden, yeni çağrı yok):** sect = Roxy `partOfFortune.sect`; gece-ters Şans noktası =
  Roxy boylamı (≤1e-6°); 7 klasik gezegende burç-bazlı asalet = Roxy `dignity`; **11 klasik açıda yaklaşan/ayrılan ve
  orb = Roxy `isApplying` / `orb` birebir**.
- **Bağımsız (astronomy-engine 2.1.19):** doğrusal "kesinleşmeye kalan süre" Ay açılarında 59 dk'ya kadar sapar →
  kesinleşme anı diye sunulamaz (test bunu kanıtlar). Ay son/sonraki açı ve boşlukta Ay 15 anda (11'i boşlukta)
  bağımsız taramayla aynı. Bu olaylar SENTETİKTİR (astronomy-engine), Roxy değil.
- Sınırlar: cazimi 17′, yanık 8°30′, ışın altı 17°, Via Combusta yarı açık aralık, 0° Koç sarması.

## Ürüne bağlama önerisi (owner + eğitmen kararından SONRA; bu PR'da yok)
- Yeni teknik `western.horary` (aile `western`; DB CHECK `^[a-z][a-z0-9_.]{2,63}$` ile uyumlu → **migration gerekmez**).
- Seçenekler: soru tarihi + saati + IANA bölge (`displayTz`), değerlendirme yeri (konum kimliği), ev sistemi
  (yalnız Roxy'nin dört sistemi; ad aynen), profil (`lilly-1647` | `dorothean-egyptian` | eğitmenin seçtiği).
- Birim: soru anında `/astrology/natal-chart` (mevcut natal adaptörü ve önbellek; soru anı doğum anı gibi saklanmaz —
  seçenekte `question` olarak tutulur). Ay boşlukta / son-sonraki açı için isteğe bağlı 2–3 olay birimi:
  `/vedic-astrology/aspects/lunar` (`coordinateSystem: "tropical"`, ay başına 1) + `/astrology/transits/monthly`
  (Ay burç girişi, ay başına 1). Ay sonuna yakın sorularda +1 ay.
- Snapshot `astro.western.horary.v1`: Roxy teknik katmanı + bu katmanın çıktısı + profil kimliği + `unverified` listesi
  (ekranda ve Word/PDF'te görünür).
- Hüküm üretilmez; uzman yorumu "Kendi Yorumum" ve Bilgi Bankası ile ayrı kalır.

## Canlı doğrulama için gereken Roxy çağrıları (owner izni olmadan YAPILMADI)
| # | Uç | Neden | Adet |
|---|---|---|---|
| 1 | `/vedic-astrology/aspects/lunar` (tropical) | gerçek olay biçimi, hangi gezegenler, dakika çözünürlüğü | 1 |
| 2 | `/astrology/transits/monthly` | Ay burç girişi anı biçimi | 1 |
| 3 | `/astrology/aspects/monthly` | Ay dışı kesinleşmeler + "dönüş" (refranation adayı) alanı | 1 |
| 4 | `/vedic-astrology/panchang/hora` | saat yöneticisi (Lilly "radikallik" denetimi; gün doğumu tanımı) | 1 |
