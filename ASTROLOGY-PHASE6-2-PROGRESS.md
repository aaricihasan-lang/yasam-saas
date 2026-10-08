# ASTROLOJİ AŞAMA 6.2 — KP RAHU/KETU SON DOĞRULAMASI İLERLEME KAYDI

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline 0b623788..HEAD` okuyun. Golden çağrıdan önce
> `scripts/astrology/fixtures/golden/kp62-*.json` dosyalarını kontrol edin (fixture varsa betik çağrı YAPMAZ).

- Başlangıç: HEAD `0b623788` (Aşama 6.1 yerel mühür) · ağaç temiz · upstream yok · Branch `work/astrology-roxy`.
- Gerçek Roxy çağrısı başlangıç: **44**. Owner onayı: **en fazla 3** yeni sentetik golden.
- Push / preview / merge / production / migration: YOK.

## Ön inceleme (çağrı yok)

- 6.1 raporu, OpenAPI ve bağımsız test modeli okundu.
- **Mantıksal sonuç:** Ketu her zaman Rahu'nun tam karşısındadır. Bu yüzden "Rahu'ya 7. burç bakışı" ile "Ketu ile aynı burçta kavuşma" burç bazında **özdeş** iki koşuldur.
  - İkisi yalnız kavuşma ve karşıtlık **farklı türde** ölçülüyorsa ayrışır (biri burç, biri derece/orb).
  - Bu yüzden Soru 2 ile Soru 4 birlikte tasarlandı.
- **Tasarım aracı:** `scripts/astrology/golden/phase62-design.ts` (yerel astronomi; Roxy çağrısı yok).
  - Model 1990 golden'ıyla tutarlı: Rahu farkı 0.0035°, Lagna farkı 0.003°.
  - Hipotez ızgarası: kavuşma {burç, orb ≤ 10°} × karşıt {7. burç, orb ≤ 10°, yok} × Jüpiter 5/9 {var, yok} × Satürn 3/10 {var, yok}.
  - Aday, her soru boyutunun tek başına ayırt edilebilir olmasıyla seçildi; sınır payı ≥ 1°.
  - Aynı haritada "A tipi" (aynı burç, uzak derece) ve "B tipi" (komşu burç, yakın derece) grahayı Jüpiter + Satürn bakışıyla birlikte veren gün **bulunamadı** (1955–2015). Sorular iki haritaya bölündü.

## Çağrı planı ve ÖNCEDEN kaydedilen hipotezler

Sentetik kişiler; yer İstanbul (yalnız ev hesabı); `kp-newcomb`, ortalama düğüm.

### G1 — `kp62-dasha-x1`

- **İstek:** `/vedic-astrology/dasha/major` (`significators:true`). X1 = 1967-10-21 07:30 İstanbul (UTC 05:30).
- **Konumlar:**
  - Rahu Koç 4.5° (6. ev); Ketu Terazi 4.5° (12. ev)
  - Merkür Terazi 24.0° → Ketu ile aynı burçta, **19.5° uzak (A tipi)**
  - Güneş Terazi 3.8° (Ketu'ya 0.7°)
  - Jüpiter Aslan → Rahu Jüpiter'den 9. burç: **Jüpiter 9. bakışı**
  - Satürn ve Mars düğümlere bakmıyor.
- **Sınanan hipotezler:**
  - **H1a (Jüpiter 9. bakışı ajan mı?):** var → Rahu L2'ye 10, L4'e 3,6 eklenir.
  - **H4 (kavuşma burç mu orb mu?):** burç → Ketu ajanlarına Merkür girer (Ketu L2'de 1, L4'te 9 ve 12). Orb → girmez.
  - **H2 (karşıt):** 7. burç → Rahu ajanlarına Merkür + Güneş girer. Orb → yalnız Güneş. Yok → ikisi de girmez.
  - 12 farklı tahmin; her soru boyutu ayırt edilebilir.

### G2 — `kp62-dasha-x2`

- **İstek:** aynı uç. X2 = 1983-06-17 23:00 İstanbul (UTC 20:00).
- **Konumlar:**
  - Rahu İkizler 1.4° (5. ev); Ketu Yay 1.4° (11. ev)
  - Mars Boğa 28.7° → komşu burçta, Rahu'ya **2.75° (B tipi)**
  - Güneş İkizler 2.5° (Rahu'ya 1.1°)
  - Satürn Terazi → Ketu Satürn'den 3. burç: **Satürn 3. bakışı**
  - Jüpiter düğümlere bakmıyor.
- **Sınanan hipotezler:**
  - **H1b (Satürn 3. bakışı ajan mı?):** var → Ketu L2'ye 8, L4'e 1,2 eklenir.
  - **H4 (orb kavuşma?):** orb → Rahu ajanlarına Mars girer (Rahu L4'e 3, 10, 11). Burç → girmez.
  - **H2 (orb karşıtlık?):** orb → Ketu ajanlarına Mars girer (Ketu L4'e 3, 10, 11). 7. burç → girmez (Mars Ketu'dan 6. burçta).

### G3 — `kp62-ruling-x1`

- **İstek:** `/vedic-astrology/kp/ruling-planets`, X1 natal; an 2026-10-12 10:05 UTC, İstanbul.
- **Beklenen klasik 5 küme:** Ay Swati'de (yıldız lordu **Rahu**, pay 4.2°), Lagna Mula'da (yıldız lordu **Ketu**, pay 5°). Gün lordu Ay (Pazartesi), Ay burç lordu Venüs, Lagna burç lordu Jüpiter → {Ay, Venüs, Rahu, Jüpiter, Ketu}.
- **H3 (Rahu ruling iken liste):**

  | Hipotez | Rahu kümesi | Ketu kümesi |
  |---|---|---|
  | burç lordu kümesi | Mars {2, 7, 12} | Venüs {1, 8, 10} |
  | sade | {6, 12} | {2, 7, 12} |
  | ajan ekli | G1 sonucuna göre | G1 sonucuna göre |

  Not: Rahu'nun burç lordu kümesi tesadüfen Ketu'nun sade kümesine eşit. Bu yüzden iki düğüm **birlikte** okunur ("yer değiştirme" hipotezi Ketu = {6, 12} verirdi).
- **Ek:** Ketu'nun 6.1'de açıklanamayan sıralaması ikinci bir örnekle sınanır.

Ek kontrol (her iki dasha): düğümün kendi 5/9 bakışı ve yıldız lordu ajanlığı 6.1 verisiyle reddedilmişti; yeni verilerle yeniden sınanır.

## Gerçek çağrı kaydı

| # | Fixture | Sonuç | Sayı |
|---|---|---|---|
| — | (Aşama 0–6.1) | — | 44 |
