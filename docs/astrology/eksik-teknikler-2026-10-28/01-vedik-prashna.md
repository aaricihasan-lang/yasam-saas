# Vedik Prashna — teknik gereksinim ve engel raporu (2026-10-28)

**Ürün kodu yazılmadı.** Batı Horary'den ayrı metodolojidir; yalnız kayıt/arayüz altyapısı paylaşılabilir. Okul seçilmeden
"Prashna" adıyla bir teknik açılmamalıdır. Sağlayıcı çağrısı: 0.

## 1. Aileler (birbirine karıştırılmaz)

| Aile | Esas metin | Özü | Hesaplanabilirlik |
|---|---|---|---|
| Genel soru anı kundali | Pek çok jyotisha metni | Soru anı D1, Lagna ve lordu, Ay, nakshatra, kendra/trikona | Veri mevcut uçlardan alınabilir; **yorum kuralları okula bağlı** |
| Prashna Marga (Kerala) | Prashna Marga (17. yy) | Arudha (soranın oturduğu/dokunduğu burç), Ashtamangala, nimitta (alametler), sphutalar | **Arudha ve nimitta GÖZLEMDİR** (astrolog kaydeder) → hesaplanamaz, uzman girdisi olmalı. Sphutalar hesaplanabilir ama Gulika tanımı okula bağlı |
| Ashtamangala Prashna | Kerala geleneği | Ritüel sayı/kauri seçimi | Ritüel girdisi; hesap değil |
| Tajika Prashna | Prashna Tantra, Tajika Neelakanthi (16. yy) | Ithasala, Ishrafa, Nakta, Yamaya, Manau, Kamboola… (Arap-Fars horary'nin Sanskrit karşılığı), deeptamsha orbları | Olay motoru (Batı `timeline.ts`) yeniden kullanılabilir **ama** sidereal burç koşulları, Tajika orbları ve yoga tanımları ayrı tablo ister |
| Shatpanchasika | Prithuyasas | 56 kıta; Lagna/Ay/kendra kuralları | Kural seti; okul kararı |
| KP Prashna | KSK Reader VI | Sayı 1–249 | **MEVCUT** (`kp.horary`) — ayrı teknik |

## 2. Arudha Prashna ≠ Jaimini Arudha

- **Jaimini Arudha Pada** (`vedic.arudha`, MEVCUT): bir evin lordu o evden kaç burç uzaktaysa lordun konumundan o kadar
  ileri sayılır (+ 1./7. istisnaları) — haritadan **hesaplanır**.
- **Prashna Marga Arudha**: soranın geldiği yön, oturduğu/dokunduğu kare (astrologun önündeki 12 burç düzeni) ile belirlenen
  burç — haritadan **hesaplanmaz**; gözlemdir. Ürün bunu otomatik üretirse yanlış olur → yalnız uzman seçimi.

## 3. Mevcut Vedik motordan güvenle alınabilecekler

| Veri | Mevcut kaynak | Soru anı için gereken | Not |
|---|---|---|---|
| D1 (Lagna, 9 graha, nakshatra) | `vedic.d1` (sağlayıcı birth-chart) | Doğum yerine soru anı/yeri | Sağlayıcı Rahu'su **ortalama düğüm** (golden 1990: Swiss Ephemeris mean node ile 0,03″; true node ile 45′ fark) |
| Panchanga | `vedic.panchanga` | Soru anı kipi | KP horary'deki soru anı akışı örnek |
| Hora / Choghadiya | `vedic.panchanga` | Soru anı | Gün doğumu tanımı okula bağlı |
| Gulika / Mandi | `vedic.upagraha` | Soru anı | Mandi kuralı sağlayıcıda tek örnekten çıkarılamadı (23.10 raporu) → Prashna Marga sphutaları için **engel** |
| Drishti | `vedic.drishti` | Soru anı | Parashari bütün-burç |
| Nakshatra / tara | D1 | Soru anı nakshatrası ↔ soranın doğum nakshatrası (doğum verisi varsa) | Okul kararı |
| Shadbala / Ashtakavarga | mevcut | Natal amaçlı tanımlı | Prashna'da kullanımı okul kararı |

## 4. Okul seçimi gerektirenler
1. Hangi aile (Genel / Prashna Marga / Tajika / Shatpanchasika).
2. Prashna Lagna: soru anının yükseleni mi, sayı/ritüel Lagna'sı mı (KP benzeri), Arudha mı?
3. Ayanamsa (Lahiri varsayılanı) ve düğüm (sağlayıcı ortalama; gerçek düğüm seçeneği sağlayıcıda yok).
4. Gulika/Mandi tanımı (Prashna Marga Trisphuta = Lagna + Ay + Gulika).
5. Tajika seçilirse: deeptamsha orbları, yoga tanımları, sidereal burç sınırları.
6. Zamanlama göstergeleri (Lagna/Ay hareketi, dasha, transit) — okul kuralı.
7. Hüküm üretilecek mi? (Batı ilkesiyle aynı öneri: hayır; yalnız veri + uzman yorumu.)

## 5. Uygulanabilir ilk adım (karar sonrası)
"Soru anı Vedik kundali" (aile bağımsız teknik veri): soru anı D1 + panchanga + hora + drishti, KP horary'nin soru anı/yer
akışıyla. Sağlayıcı maliyeti 2–3 çağrı/analiz (birth-chart, panchang/detailed, hora). Okul kuralları ayrı PR'larda.

## 6. Doğrulama planı (yalnız öneri; çağrı yapılmadı)
- Soru anı D1 ve panchanga: mevcut golden'larla aynı adaptör → 1 gerçek çağrı/uç (3) ile soru anı kipinin doğruluğu.
- Bağımsız: astronomy-engine + Lahiri (IAU1976 ile 0,0″, 24.10 ölçümü) ile Lagna/graha karşılaştırması.
