# Profesyonel klasik asalet, kabul ve almuten katmanı (WT-02, 2026-10-31)

**Durum:** GELİŞTİRİLDİ — TEST EDİLDİ — OWNER/EĞİTMEN ONAYI BEKLİYOR. Ürüne bağlı değil; hiçbir route, ekran, menü veya motor
`lib/astrology/pro/dignities/` klasörünü import etmez (varsayılan kapalı = hiç çağrılmıyor). Mevcut Natal/Horary davranışı değişmedi.

## 1. Mimari

| Dosya | İçerik |
|---|---|
| `schools.ts` | Ekol (tablo seti) + puan politikası + almuten politikası + harita almuten nokta setleri + kaynak atıfları |
| `essential.ts` | Asal asalet: mevcut `essentialDignity` (calc.ts) sonucunu kaynaklı puan satırlarına açar; sınır yakınlığı (burç/terim/yüz) |
| `accidentalNatal.ts` | Arızi asalet (mevcut `accidentalDignity` üzerinden, natal uyarlaması), sect (Güneş geometrik irtifası), doğum öncesi kavuşum/dolunay |
| `reception.ts` | Kabul sınıflandırması: yok / tek taraflı / karşılıklı / karışık; Lilly karşılıklı kabul puanı; burç açısı ve moiety |
| `almuten.ts` | Derece almuten'i, ev cusp almuten'leri, harita (figür) almuten'i; eşitlikte `tie` + tüm kazananlar |
| `natal.ts` | Birleşik natal rapor (`astro.pro.dignities.natal.v1`) |

Tablolar **yeniden yazılmadı**: `DOMICILE`, `EXALTATION`, `TRIPLICITY` (dorothean/lilly), `TERMS` (egyptian/lilly), `faceRuler`,
`LILLY_POINTS`, `LILLY_ACCIDENTAL` ve `essentialDignity`, `receptionsOf`, `solarPhase`, `accidentalDignity`, `sunAltitude`,
`partOfFortune` horary katmanından import edilir.

## 2. Ekoller ve kaynaklar

| Ekol | Üçlü | Terim | Puan | Kaynak durumu |
|---|---|---|---|---|
| `lilly-1647` | Lilly (su: Mars/Mars, ortak yok) | Lilly (CA s. 104) | CA s. 115 (5/4/3/2/1, −5/−4, peregrine −5) | Tablo ve puanlar daha önce tıpkıbasımla teyitli (tables.ts notları) |
| `dorothean-egyptian` | Dorothean (gündüz/gece/ortak) | Mısır (Tetrabiblos I.20) | Ekolde sayısal puan YOK → `null` | Mısır terimleri sağlama toplamı testte; birincil metin bu çalışmada yeniden okunmadı |

Farklı ekollerin tabloları **karıştırılmaz**. Dorothean tablolarına Lilly puanı (`scorePolicy: "lilly_ca115"`) uygulanabilir, ama sonuç
`mixedPolicy: true` ve rapor uyarısı "EKOL KARIŞIMI" taşır.

**Ptolemaik terimler (Robbins, Tetrabiblos I.21) EKLENMEDİ:** birincil metin bu çalışmada satır satır doğrulanamadı. Açık karar.

### Almuten kaynakları (Christian Astrology 1647, Wellcome b30338724 OCR, 2026-10-31 okundu)

- **CA s. 48:** "Almuten of any house is that Planet who hath most dignities in the Signe ascending or descending upon the Cusp of
  any house"; "Almuten of a Figure, that Planet who in Essentiall and Accidentall dignities, is most powerfull in the whole Scheame".
- **CA s. 506–507:** beş hyleg yeri = ASC, MC, Güneş, Ay, Şans noktası.
- **CA s. 530–532 (Bölüm CV, Lord of the Geniture):** (a) bazı yazarlar: ASC, MC ve ışıkların yerlerinde en çok asal asalet (OCR satırı
  bozuk → `verified: false`); (b) "The Greeks": Güneş ve Ay'ın yerlerinde en çok asalet (okunaklı → tek `verified: true` set);
  (c) Lilly'nin kendisi: asal + arızi en güçlü, en iyi konumlu ve en yükseltilmiş gezegen — **sayısal birleştirme yok**.
- **İbn Ezra 5 nokta** (Güneş, Ay, ASC, Şans noktası, doğum öncesi kavuşum): yalnız ikincil kaynak bilgisi → `verified: false`.

## 3. Puan politikası

- **Asal (essential):** Lilly ekolünde `natalEssential(...).score` = `essentialDignity(...).score` (5.040 rastgele vakada birebir).
  Yücelme burç düzeyindedir (derece yalnız bilgi). Peregrine = beş asaletin hiçbiri yok.
- **Almuten (derece):** ev 5, yücelme 4, üçlü 3, terim 2, yüz 1. Üçlü sayımı politikadır:
  `lilly_ca115_sect` (yalnız sect yöneticisi — TEYİTLİ varsayılan), `…_sect_participating` ve `…_all_triplicity` (DOĞRULANMADI).
- **Eşitlik:** tek kazanan uydurulmaz; `winners[]` + `tie: true`. Lilly s. 531'deki eşitlik bozma ölçütleri (hyleg'e bakan, doğulu) uygulanmadı.
  Lilly ekolünde 0,1° ızgarada derecelerin %12,36'sı eşitliktir.
- **Harita almuten'i:** seçilen noktaların derece almuten puanları toplamı. **Arızi ek puan (gün/saat yöneticisi, ev konumu) eklenmez**
  — sayısal değerleri birincil kaynakta teyit edilemedi.
- **Lilly "Lord of the Geniture" sıralaması:** gezegenin kendi asal skoru + CA s. 115 arızi toplamı. `standard: false` — bu toplama
  Lilly'nin değil bu çalışmanın yorumudur.
- **Kabul:** Lilly puanı yalnız ev↔ev (+5) ve yücelme↔yücelme (+4) karşılıklı kabulüne (CA s. 115, chart.ts ile aynı). Karışık kabul puanı `null`.

## 4. Natal uyarlaması (horary'den farklar)

- Ev = çağıranın ev sistemindeki geometrik ev; Lilly 5° "ev etkisi" kuralı uygulanmaz (eğitmen kararı). Ev kalemleri
  `houseSystemDependent: true`.
- Sabit yıldız kalemleri (1647 dereceleri) natalde kapalı.
- Hız verilmeyen gezegende arızi hesaplanmaz ve uyarı döner (uydurma yok).
- Sect: Güneş'in geometrik irtifası > 0 (kırılma/disk yok). Roxy de aynı tanımı kullanıyor: ufka ±0,9° içindeki 20 vakada 20/20 uyum,
  bunların 10'u irtifa −0,22…−0,88° (görünür doğuş tanımında "gündüz" olurdu) → Roxy "gece".

## 5. Doğrulama özeti

- `npm`'siz çalıştırma: `npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-dignities.harness.ts` (41/41) ve
  `…/pro-dignities-roxy.harness.ts` (7/7, 194 gerçek Roxy haritası fixture'dan, yeni çağrı yok).
- Roxy `dignity` alanı ile 1.358 gezegen satırında 1.338 birebir; 20 fark tamamı Merkür Balık (hem zarar hem düşüş; Roxy "fall"
  yazar, `signOnlyDignity` "detriment" önceliklidir) — açıklanamayan fark 0.
- Şans noktası: Roxy gece ters formül; 194/194 ≤1e-6°.
- Konum farkı Roxy ↔ astronomy-engine (1950–2050): Güneş ≤1,7″, gezegenler ≤16,9″, Ay ≤9,5″; 2050 sonrası Ay ≤70,9″ (ΔT).
  Bu katman konum üretmez; sağlayıcı konumunu kullanır. Sınıra < farkın olduğu satırlar `boundary.near` ile işaretlenir.
