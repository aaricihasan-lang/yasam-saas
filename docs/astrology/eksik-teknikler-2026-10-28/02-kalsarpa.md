# Kalsarpa Dosha — metodoloji durumu (2026-10-28)

**Durum: KARAR BEKLİYOR · kod yok · sağlayıcı çağrısı 0.** #527'de bilinçli olarak bekletildi (QA
`ATLAS-ROXY-GERCEK-DOGRULAMA-2026-10-23/ham/527/RAPOR.md`: "Yöntem için owner kararı gerekiyor; gerçek yanıt alınmadı ve kod
yok"). Bu rapor yeni kanıtları ekler.

## 1. Sağlayıcının yazılı tanımı (OpenAPI 2026-10-20 kopyası)

`POST /vedic-astrology/dosha/kalsarpa`
- İstek: `date, time, latitude, longitude, timezone, ayanamsa, ayanamsaValue`. **`nodeType` parametresi YOK.**
- Yanıt: `present` (boolean — "all planets hemmed between Rahu-Ketu axis"), `severity` (Mild / Moderate / Severe —
  "based on Rahu-Ketu house positions", **ölçüt yazılmamış**), `type` (12 ad, "based on Rahu house position"), `description`,
  `remedies[]`, `effects{duration, career, health, relationships, mindset, positive}`.
- Belgede **yazılmayanlar**: yön (Rahu→Ketu mu, iki yön de mi), eksene kavuşan gezegen kuralı, burç/derece tabanı, kısmi
  sınıf (yanıtta yok), Lagna'nın dahil olup olmadığı, ev sisteminin (bütün-burç?) ve düğüm türünün ne olduğu.

## 2. Yeni kanıt (0 çağrı): sağlayıcının Vedik uçları ortalama düğüm kullanıyor

Depodaki gerçek `vedic-d1.json` (birth-chart, 1990-07-15 14:30 +3 İstanbul, Lahiri): Rahu sidereal 284,38193° + ayanamsa
23,72875° = tropikal 308,11068°. Swiss Ephemeris (astro.com swetest, DE441, aynı an): **mean node 308,11069° (fark 0,03″)**,
true node 307,35922° (fark 45′05″). Kalsarpa ucunun aynı motoru kullanması **olası ama ölçülmedi**.
Etkisi: ortalama ↔ gerçek düğüm farkı ±1,5°'ye kadar çıkar; eksene 1–2° yakın gezegen sınıf değiştirebilir.

## 3. Gelenekler arası farklar (her biri ayrı parametre olmalı)

| Konu | Seçenekler | Not |
|---|---|---|
| Kaynak | Klasik metinlerde (BPHS, Saravali, Phaladeepika) bu adla **yaygın kabul görmüş bir tanım yok**; 20. yy yazarları | Kaynak teyidi eğitmenden; "Sarpa yoga" (Brihat Jataka, kötücüller 3 kendrada) **farklı bir yogadır** |
| Eksen yönü | (a) yedi graha Rahu→Ketu yarısında (burç sırasıyla) = Kalsarpa; Ketu→Rahu yarısı = bazı yazarlarda "Kala Amrita"; (b) iki yön de Kalsarpa | Sağlayıcı belirtmiyor |
| Sınır | (a) derece tabanlı (boylam aralığı); (b) burç/ev tabanlı (Rahu ile aynı burçtaki gezegen içeride sayılır) | En sık uyuşmazlık kaynağı |
| Eksen üzerindeki gezegen | kavuşum (aynı derece / orb içinde) içeride mi, bozar mı | Orb tanımı yok |
| Kısmi (ardha / "partial") | bir graha dışarıda; ya da yalnız düğüme kavuşan dışarıda | Modern; sağlayıcıda yok |
| Lagna | "tam" için Lagna da aynı yarıda olmalı mı | Bazı yazarlar |
| Gezegen seti | 7 graha (Güneş–Satürn); dış gezegenler hariç | Ortak |
| Düğüm | ortalama / gerçek | §2 |
| Tür adı | Rahu'nun Lagna'dan evi: 1 Ananta, 2 Kulika, 3 Vasuki, 4 Shankhapala, 5 Padma, 6 Mahapadma, 7 Takshaka, 8 Karkotaka, 9 Shankhachuda, 10 Ghataka, 11 Vishdhara, 12 Sheshnaga | Sağlayıcı listesi aynı sırada; ev = bütün-burç mü, bhava mı yazılmamış |
| Şiddet | ölçütsüz | Sağlayıcı ölçütü yazılı değil → **gösterilmemeli** |
| Çare / etkiler | yorum; sağlık/korku içerikli metin | Ürün ilkesi: teknik veri; çare ve sağlık iddiası **gösterilmez** |

## 4. Önerilen ürün yaklaşımı (karar sonrası)
- Hesap **yerel** ve şeffaf: mevcut `vedic.d1` anlık görüntüsünden (ek çağrı yok) eksen, her grahanın hangi yarıda olduğu,
  eksene uzaklığı, sınır bayrakları, Rahu'nun evi → tür adı. Seçilen tanım(lar) ekranda yazılı.
- "Dosha var/yok" ifadesi yalnız owner/eğitmenin seçtiği tanımla; seçilmezse yalnız dağılım tablosu.
- Sağlayıcı ucu kullanılacaksa önce yöntemi ölçülmeli (aşağıda).

## 5. Sağlayıcı yöntemini ölçmek için gereken ücretli çağrı (öneri; YAPILMADI)
| # | Senaryo | Ayırt ettiği |
|---|---|---|
| 1–2 | Yedi graha Rahu→Ketu / Ketu→Rahu yarısında | yön |
| 3–4 | Bir graha Rahu ile aynı burçta ama derece aralığının dışında (her iki yön) | burç ↔ derece tabanı |
| 5–6 | Bir graha Rahu'ya 0,5° ve 2° kavuşumda | eksen kuralı/orb |
| 7–8 | Ortalama ve gerçek düğüm arasında kalan graha (iki işaret) | düğüm türü |
| 9 | Lagna öteki yarıda | Lagna şartı |
| 10 | Rahu bhava ≠ bütün-burç evi olan bir harita | tür adının ev tabanı |
Toplam **10 çağrı** (Tur 1 kalan 105'ten owner onayıyla ya da ayrı bütçe). Senaryo anları astronomy-engine ile önceden
seçilir; her yanıt bağımsız hesapla karşılaştırılır.
