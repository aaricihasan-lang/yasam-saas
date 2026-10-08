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
| G1 | `kp62-dasha-x1.json` | OK (1 deneme, tekrar yok) | 1 |
| G2 | `kp62-dasha-x2.json` | OK | 1 |
| G3 | `kp62-ruling-x1.json` | OK | 1 |

**Toplam gerçek Roxy çağrısı: 47** (onay sınırı 3, kullanılan 3). Fixture'larda API anahtarı yok (betik denetimi + tarama 0).

## Sonuçlar

Ayrıntı: `docs/astrology/phase6-1-rahu-ketu-method-audit.md` §7.

- **Bağımsız model:** X1 ve X2'de 9 grahanın Placidus evi ve yıldız lordu, görünür 7 grahanın 4 düzeyi Roxy ile birebir.
- **G1:**
  - Jüpiter 9. bakışı **sayılmıyor**.
  - Ketu burcunda 19.5° uzaktaki Merkür **ajan** sayılıyor → kavuşma burç bazlı.
  - Aynı Merkür Rahu'nun 7. burcunda **ajan** → karşıt burç bazlı.
  - Rahu ve Ketu 8/8 düzey birebir.
- **G2:**
  - Satürn 3. bakışı **sayılmıyor**.
  - Komşu burçta Rahu'ya 2.8° yakın Mars **ajan değil**: orb kavuşma, orb karşıtlık ve "burç ∪ orb" karması çürüdü.
  - 8/8 düzey birebir.
- **G3:**
  - Klasik 5 küme tasarlandığı gibi: {Ketu, Jüpiter, Rahu, Venüs, Ay}.
  - Rahu [6,12,11,1,9,2,7] ve Ketu [12,11,1,9,10,8] → **ajan ekli kuralın L2 ∪ L4'ü** ("ajan evleri"), sıra dahil birebir.
  - 6.1 natal Ketu [9,12,6,10] de aynı kurala uyuyor.
  - "Burç lordu kümesi" (6.1 etiketi), sade kural ve tam ajan ekli kural çürüdü. Görünür ruling planet'ler tam 4 düzey (L1→L4) alıyor.

### Çözülen / çözülemeyen

| Soru | Durum |
|---|---|
| 1. Jüpiter / Satürn özel bakışları | **Çözüldü:** Jüpiter 9., Satürn 3. (ve 6.1'de Mars 4.) sayılmaz. Jüpiter 5., Satürn 10., Mars 8. ayrıca sınanmadı (P3). |
| 2. 7. burç bakışı ↔ karşı düğüm kavuşması | **Çözüldü:** ikisi de burç bazlı; Ketu daima Rahu'nun 7. burcunda olduğu için iki kural her doğumda aynı sonucu verir. Gözlemlenebilir fark yok. |
| 3. Rahu ruling iken liste | **Çözüldü:** "ajan evleri" (L2 ∪ L4), sıralı. 6.1'deki "burç lordu kümesi" etiketi tesadüfi bir eşleşmeydi → düzeltildi. |
| 4. Burç mu, derece/orb mu | **Çözüldü:** burç bazlı (19.5° uzak aynı burç → evet; 2.8° yakın komşu burç → hayır). |
| Kalan (P3) | Jüpiter 5. / Satürn 10. / Mars 8.; ajanlar arası sıra ölçütü (boylam ↔ graha sırası bu verilerde aynı); gerçek düğüm (`nodeType: true`). |

## Yapılan düzeltmeler

- `lib/astrology/model/kp.ts`: yöntem `sign_lord` → **`agent_houses`** ("ajan evleri"; doğrulandı + belgelenmemiş sağlayıcı davranışı).
  - Ajan yönteminin açıklaması kanıtlanmış kurala göre yazıldı: burç bazlı, özel bakış yok, 7. burç ≡ karşı düğüm.
  - Durum metni "doğrulandı; Jüpiter 5., Satürn 10., Mars 8. ayrıca sınanmadı" oldu.
  - Hesap kodu, adaptör, şema ve önbellek değişmedi; **KP hesap motoru yok**.
- `KpPanels.tsx`: yöntem rozeti rengi yeni kimliğe bağlandı (tek satır).
- `phase61.harness.ts`: 6.1'in yanlış yorumunu kodlayan testler kanıta göre güncellendi.
- **Yeni:** `phase62.harness.ts` 9/9; tasarım aracı `phase62-design.ts`; çağrı betiği `phase62-golden-calls.ts` (tasarım koşulu tutmazsa çağrı yapılmaz).

## Testler

- **Astroloji tamamı:** 39 / 21 / 17 / 37 / 20 / 15 / 33 / 26 / 19 / 36 / 18 / **9** / 10 + PostgreSQL migration kontrolü geçti.
  - tsc 0, eslint 0, next build başarılı.
  - İstemci paketi taraması (raw_response, ROXY_API_KEY, astro_analyses, calcInputHash, input_hash, sahte anahtar, tema içeriği): 0.
- **Mutasyon:**
  - `mutate62` 5/5 (ruling → sade / ajan ekli; dasha → ajan evleri; ruling etiketi kaldırma / yalnız Ketu).
  - `mutate61` 17/17 (hedefler yeni metinlere güncellendi).
  - Önceki: mutate5 14/14 · mutate51 (B2 hariç) 22/22 · mutate52 18/18 · mutate6 19/20 (kalan K2 eşdeğer).
- **Güvenlik:** routes harness 21/21 (KP owner-only 404, önizlemede yorum / ham yanıt / anahtar yok, kayıtlı analiz 0 istek), phase6 tenant ve fail-closed testleri geçti. Yeni fixture'lar da üretim adaptöründen temiz geçiyor.
- **Astroloji dışı:** HD Roxy 220/0, HD info-panel 65/0, output-visibility 205/0, infra 43/0, admin-hygiene 55/0.
  - Önceden var olan başarısızlıklar değişmedi: backup 53/1, faz1-p3 94/4.
- **Tarayıcı:** bu aşamada yalnız etiket metni ve kimliği değişti; yerleşim değişmedi. Ruling tablosundaki Rahu + Ketu etiketleri statik render testiyle doğrulandı. Gerçek tarayıcı denetimi yapılmadı (6.1'de aynı bileşen 390 px dahil incelenmişti).

## P0 / P1 / P2 / P3

- P0 = 0 · P1 = 0 · P2 = 0.
- P3:
  - Roxy düğüm yöntemi uçtan uca farklı (belgelenmemiş sağlayıcı davranışı; etiketli).
  - Sınanmayan 3 özel bakış türü.
  - Ajan sırası ölçütü.
  - Gerçek düğüm davranışı.
  - 6.1'deki ruling etiketi hatalıydı, düzeltildi (uyarı taşıdığı için yanıltıcı kesinlik yoktu).

## Genel Astroloji denetimine hazırlık

KP Rahu/Ketu belirsizlikleri kanıtla kapatıldı; kalanlar küçük ve açıkça etiketli. **Genel denetime hazır.**

**Aşama 6.2 yerel olarak tamamlandı.** Push / preview / merge / production / migration YOK. DUR — genel denetim için owner onayı beklenir.

