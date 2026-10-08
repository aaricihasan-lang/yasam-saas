# Aşama 6.1A — Rahu/Ketu significator yöntem denetimi (Roxy KP uçları)

> Kapsam: Aşama 6'da kaydedilmiş sentetik golden yanıtlar (`scripts/astrology/fixtures/golden/kp-*.json`) ve Roxy OpenAPI
> belgesi. **Yeni gerçek Roxy çağrısı yapılmadı** (toplam 44 değişmedi). Kurallar YALNIZ test kodunda
> (`scripts/astrology/phase61.harness.ts`) hesaplanır; üretimde düğüm significator'ı hesaplayan bir motor YOKTUR —
> üretim yalnız hangi listenin hangi kuraldan geldiğini etiketler.

## 1. Soru

Aşama 6'da aynı sentetik doğum (A: 1990-07-15 14:30, İstanbul) için Roxy'nin üç ucu Rahu/Ketu'ya farklı ev listeleri verdi:

| Uç | Ketu | Rahu |
|---|---|---|
| `kp/chart` (planetWise) | L1 3 · L2 9 · L3 4,5 · L4 — | L1 6 · L2 3 · L3 10 · L4 — |
| `dasha/major` (`significators:true`) | L1 3,9 · L2 9,6 · L3 4,5,9,12 · L4 9,12,10 | L1 6,3,9 · L2 3,9 · L3 10,4,5,11 · L4 9,12,4,5 |
| `kp/ruling-planets` (natal significator) | [9, 12, 6, 10] (düzeysiz) | (ruling planet değil) |

Bu farkın bir hesap hatası mı, belgelenmiş/belgelenmemiş bir yöntem farkı mı, yoksa çözülemeyen bir belirsizlik mi olduğu araştırıldı.
Üç sonucun aynı olması gerektiği VARSAYILMADI; önce alanların aynı şeyi anlatıp anlatmadığına bakıldı.

## 2. Alanlar aynı şeyi mi anlatıyor? (Roxy belgesi)

| Uç / alan | Belgedeki tanım | Düğüm kuralı belgede |
|---|---|---|
| `kp/chart` `significators` | "Strength order: L1 planets in star of occupant > L2 occupants > L3 planets in star of owner > L4 house owner" | `nodes.*`: "acts as agent of its sign lord and star lord"; "Nodes are powerful agents that amplify the significations of their dispositors" — **ama tabloya nasıl yansıdığı yazılmaz** |
| `dasha/*` `significators.signifies.L1–L4` | Aynı 4 düzey | **Açık:** "For Rahu and Ketu, also includes the L1 [L2, L3] houses of their agent planets (conjoined, aspecting, sign lord)"; "Rahu and Ketu own no sign, so their L4 comes entirely from their agent planets" |
| `kp/horary` `significators` | kp/chart ile aynı metin | Belgede yok (yanıtta ek `agentHouses` alanı var) |
| `kp/ruling-planets` `significators[].signifies` | "ordered by KP 4-level strength: L1 … L4. Based on 4-level KP significator hierarchy from birth chart" | Yok |

Sonuç: Alanların **adı ve belgelenmiş anlamı aynı** ("4 düzey KP significator"), ama düğüm için uygulanan kural uçtan uca değişiyor.
Yalnız dasha ucu düğüm kuralını açıkça belgeliyor.

## 3. Bağımsız sınama (test kodu; Roxy significator alanları girdi olarak KULLANILMADI)

Model girdisi yalnız ham konum alanlarıdır: her grahanın burcu, Placidus evi, yıldız lordu ve cusp burçları (ev sahibi = cusp burcunun klasik lordu).
Significator listeleri modelden üretilip Roxy'ninkiyle karşılaştırıldı.

- **Sade 4 düzey:** L1 = yıldız lordunun evi · L2 = kendi evi · L3 = yıldız lordunun sahip olduğu evler · L4 = sahip olduğu evler.
  Düğüm burç sahibi değildir; L4 boştur.
- **Ajan ekli:** sade düzeyler ∪ her ajanın sade düzeyleri (düzey düzey birleşim).
  Ajan = burç lordu + aynı burçtaki grahalar + 7. burçtaki grahalar (karşı düğüm hariç).
- **Burç lordu kümesi:** düğümün listesi = bulunduğu burcun lordunun düzleştirilmiş sade kümesi.

| Kaynak | Sınanan | Sonuç |
|---|---|---|
| `kp/chart` natal Rahu, Ketu | sade | **Birebir** (2 × 4 düzey). Ajan ekli kurala uymaz. Görünür 7 graha da sade kuralla birebir. |
| `dasha/major` natal Rahu (ajan: Satürn burç lordu, Merkür 7. burç) | ajan ekli | **Birebir** (4/4 düzey) |
| `dasha/major` natal Ketu (ajan: Ay burç lordu, Merkür aynı burç) | ajan ekli | **Birebir** (4/4 düzey). Görünür grahalarda dasha = sade. |
| `kp/horary` Rahu (ajan: Satürn, Ay 7. burç) — `signifies` | ajan ekli | **Birebir** (4/4) |
| `kp/horary` Ketu (ajan: Güneş, Ay aynı burç) — `signifies` | ajan ekli | **Birebir** (4/4) |
| `kp/horary` `allHouses` + ev tablosu (`houseWise`) | sade | **Birebir** — AYNI yanıtta `signifies` ajan ekli, `allHouses` sade |
| `kp/horary` `agentHouses` | ajan ekli L2 ∪ L4 | **Birebir** |
| `kp/ruling-planets` natal Ketu [9,12,6,10] | burç lordu (Ay) kümesi {9,6,12,10} | **Küme eşit.** Sade {3,9,4,5} ve ajan ekli {3,9,6,4,5,12,10} kümelerine eşit değil. **Sıra** Ay'ın düzey sırası [9,6,12,10] değil → sıralama kuralı açıklanamadı. Görünür ruling planet'lerde sıra = L1→L4 düzleştirme. |

Reddedilen alternatifler:

- **Mars'ın 4. özel bakışı ajan sayılırsa:** natal Ketu (Yengeç; Mars Koç'tan 4. bakış) L4'e 2,7 eklenirdi. Roxy'de yok → **sayılmıyor.**
- **7. burç ajanı dışlanırsa:** natal ve horary Rahu tutmaz → **7. burçtaki grahalar ajan sayılıyor.**

## 4. Sınıflandırma

| Uç | Uygulanan kural | Sınıf |
|---|---|---|
| `kp/chart` | Sade 4 düzey | **Yöntem farkı + belge/veri uyumsuzluğu:** belge düğümleri "ajan" diye tanımlıyor, tablo ajanlığı uygulamıyor. Hesap hatası değil; sade kural kendi içinde tutarlı ve bağımsız olarak doğrulandı. |
| `dasha/*` | Ajan ekli | **Belgelenmiş yöntem farkı.** Golden'larla tutarlı. Belgedeki "bakan" ifadesinin kapsamı kısmen belirsiz (bkz. §5). |
| `kp/horary` | `signifies` ajan ekli, `allHouses`/`houseWise` sade | **Sağlayıcı iç tutarsızlığı:** belgeye göre `allHouses` = "four levels flattened"; düğümlerde düzeylerin düzleştirmesi değil. Aynı yanıtta iki yöntem. |
| `kp/ruling-planets` | Burç lordu kümesi (gözlem) | **Belgelenmemiş yöntem / sağlayıcı tutarsızlığı:** belge "4 düzey hiyerarşi" diyor; Ketu listesi Ketu'nun kendi 4 düzeyi değil. Tek örnek; sıra kuralı açıklanamıyor → **belirsiz.** |

Hiçbir uçta, kendi kuralı içinde sayısal bir hesap hatası bulunmadı. Sorun kuralın uçtan uca **değişmesi** ve iki uçta belgeyle çelişmesi.
Klasik KP literatüründe düğümün kavuşan grahaları, bakan grahaları, burç lordunu ve yıldız lordunu temsil ettiği kabul edilir.
"Sade", "ajan ekli" ve "burç lordu yerine geçme" bu ilkenin farklı uygulamalarıdır. Hangisinin "doğru KP" olduğuna Yaşam Sistemi karar vermez.

## 5. Kalan belirsizlikler (kesin kural diye SUNULMAZ)

1. **Ajan kapsamı:** Dasha belgesi "bakan" diyor. Golden'larda yalnız 7. burç gözlendi, Mars'ın 4. bakışı sayılmadı.
   Jüpiter 5./9. ve Satürn 3./10. bakışları bu verilerde düğüme düşmediği için test edilemedi.
2. **7. burç bakışı ↔ karşı düğümle kavuşma:** İki golden'da da 7. burçtaki ajan karşı düğümle aynı burçta.
   Bu iki hipotez bu verilerle ayırt edilemez.
3. **Ruling ucu:** Tek örnek (Ketu). Rahu ruling planet olduğunda ne döndüğü bilinmiyor. Sıralama kuralı açıklanamadı.
4. **Derece orbu:** Kavuşma burç bazlı mı, orb bazlı mı ayrıştırılamadı (golden'lardaki kavuşmalar aynı burçta ve yakın derecede).
5. **Yıldız lordu ajanlığı:** kp/chart belgesi "star lord" ajanlığından da söz ediyor. Yıldız lordunun evleri zaten sade L1/L3'te bulunduğundan ayrı bir etkisi görülmedi.

Bu belirsizlikleri gidermek yeni sentetik golden çağrıları gerektirir: Jüpiter/Satürn özel bakışlı bir düğüm, 7. burçta karşı düğüm olmayan bir graha, Rahu'nun ruling planet olduğu bir an.
Önerilen sayı en fazla 3 çağrıdır; **owner onayı olmadan yapılmadı.**

## 6. Ürüne yansıması (Aşama 6.1A)

- `lib/astrology/model/kp.ts`: `KP_NODE_SIG_METHODS` (sade / ajan ekli / burç lordu kümesi: etiket, açıklama, güven durumu) ve `KP_NODE_SIG_SOURCE` (uç → yöntem).
  Hesap yok, yalnız etiket.
- **Arayüz:** her Rahu/Ketu satırında listenin geldiği yöntemin etiketi var. Ayrıca bir açıklama kutusu (`astro-kp-node-method`) yöntemi ve güven durumunu yazar:
  - KP haritası: "sade kural"
  - KP dasha: "ajan ekli"; görünür grahalar ve Vedik/Lahiri dasha etiketsiz
  - Ruling: "burç lordu kümesi" + "belgelenmemiş; tek örnek"
  - Horary: tablo "sade kural", mavi "+" ekleri "ajan ekli"
- Listeler **birleştirilmez veya birbirine dönüştürülmez.**
  - Bilgi Bankası anahtarları zaten ayrıdır: haritada `kp_significator:<graha>:<ev>` (sade liste), dasha'da `kp_dasha_signifies:<graha>:<ev>` (ajan ekli liste). Aynı başlık altında karışmaz.
- Adaptör denetimleri değişmedi: dasha L2 kendi evi, signifiedHouses = düzey birleşimi, strongHouses = L1 ∪ L2; horary ajan evi yalnız düğümde; ruling kümesi klasik 5.
  Düğüm kuralları üretimde yeniden hesaplanmaz; **yeni KP hesap motoru yok.**
- Test: `phase61.harness.ts` (6.1A: kural kanıtı 5 + etiket kaynağı 1 + arayüz 4).
