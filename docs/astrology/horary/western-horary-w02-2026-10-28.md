# HORARY-W-02 — Klasik Batı Horary hesap altyapısı (2026-10-28)

Durum: **GELİŞTİRİLDİ — DOĞRULANDI (hesap katmanı) · ÜRÜNE BAĞLI DEĞİL · EĞİTMEN KARARI BEKLİYOR (ekol parametreleri)**.
Hiçbir route, motor, rapor veya ekran `lib/astrology/horary/western` modülünü import etmez (harness C6 bunu denetler).
Migration, feature flag, sağlayıcı çağrısı: **0**.

## 1. #438'den korunanlar ve düzeltilenler

#438 (`b2d298a4`) dosyaları güncel main'e **yol bazlı** aktarıldı (cherry-pick yok; ilk commit içerik değişikliği yapmaz).

| #438 öğesi | Durum | Değişiklik |
|---|---|---|
| Burç yöneticisi, yücelme, zarar, düşüş, yüz tabloları | Korundu | — |
| Lilly / Dorothean üçlüler | Korundu | Dorothean ortak yönetici `rulers.participating` → kabulde de sayılır (10-19 bulgusu) |
| Mısır terimleri (küçük yıl sağlaması) | Korundu | — |
| "Ptolemaik" terimler | **Ad düzeltildi → `lilly`** | İçerik aynı. 10-19: 12/12 satır CA s. 104 tıpkıbasımıyla birebir; Robbins Ptolemy'den 7 burçta farklı. `unverified: terms:ptolemaic` kaldırıldı |
| `solarPhase` | **Düzeltildi** | CA s. 113 "in the same Signe": farklı burçta 8°30′ içi = ışın altı. `crossSign` alanı eklendi (cazimi için kaynak sessiz) |
| `isDayChart` | Korundu (yalnız karşılaştırma) | Harita artık `sunAboveHorizon` (geometrik irtifa) kullanır; kutup enleminde eski kural yanlıştı |
| `aspectState.linearDaysToExact` | Korundu (yalnız #438 testleri) | Gerçek kesinleşme anı `timeline.findPerfections` |
| `moonContext` | Korundu | Yeni `timeline.moonCourse` olay verisini kendisi üretir |
| Puan tablosu | Korundu | Karşılıklı kabul +5/+4 (CA s. 115) haritada ayrı alan |

## 2. Yeni hesaplamalar

| Dosya | İçerik |
|---|---|
| `houses.ts` | Soru anı çerçevesi (GAST + gerçek eğiklik, astronomy-engine), ASC/MC, **Regiomontanus** iki bağımsız uygulama (kapalı formül + vektör geometrisi), ev yerleşimi, kutup engeli |
| `timeline.ts` | Gerçek kesinleşme anları (≤1 sn), istasyonlar, burç girişleri (geri hareket işaretli), Ay'ın seyri (son/sonraki açı, üç boşlukta varyantı), çift analizi: refranation, engelleme/hüsran, ışık aktarımı (s. 111 ve s. 125 ayrı), ışık toplanması (s. 126) |
| `accidental.ts` | Lilly arızi asalet kalemleri (CA s. 115): ev, doğrudan/geri, hızlı/yavaş, doğulu/batılı, yanma evreleri, partile açılar, düğümler, kuşatılma, 1647 yıldız dereceleri |
| `chart.ts` | Soru haritası: gezegen tablosu, kabul matrisi, moiety içi açılar, Ay'ın seyri, Şans noktası (+ev), **gezegen saati** ve radikallik verisi, dikkat noktaları (kanıt metniyle), sağlayıcı anlık görüntüsü tutarlılık denetimi |
| `tables.ts` | Lilly orbları (metin kanıtlı + çelişen alternatifler), ortalama hızlar, arızi puan tablosu, ağırlık sırası |

Hüküm (evet/hayır) **üretilmez**. Her ilişki adayı kendi olay kanıtını (an, açı, gezegen) taşır.

## 3. Regiomontanus çözümü ve lisans

- Sağlayıcı ev sistemleri (OpenAPI 2.0.0): placidus, whole-sign, equal, koch. **Regiomontanus yok.** Yerine başka sistem
  konmaz; hesap kurulamıyorsa `HouseError` döner (`polar_latitude` |φ| ≥ 90° − ε, `invalid_input`).
- Yöntem: yalnız küresel trigonometri (Regiomontanus tanımı: ev daireleri ufkun kuzey/güney noktalarından geçer, gök
  ekvatorunu meridyenden başlayarak 30° eşit yaylara böler). Kod Swiss Ephemeris'ten veya herhangi bir GPL/AGPL koddan
  **alınmadı**.
- Yıldız zamanı/eğiklik: `astronomy-engine` 2.1.19, **MIT**, depoda zaten üretim bağımlılığı (`lunarReturnDate`,
  `planetaryReturnDate`, `localSpaceCenter`). Yeni paket, abonelik, lisans **yok**.
- Swiss Ephemeris yalnız **dış referans** olarak kullanıldı: astro.com'un herkese açık `swetest.cgi` sayfası (DE441), 12 kurgusal
  soru anı, kişisel veri yok. Ham çıktı URL'siyle `scripts/astrology/fixtures/horary-western/swetest-ham/` altında. Kod veya
  veri tablosu kopyalanmadı; bu karşılaştırma AGPL yükümlülüğü doğurmaz (yazılım dağıtılmıyor, yalnız sonuç sayıları
  karşılaştırılıyor). Ürün çalışırken astro.com'a istek **yapılmaz**.
- Alternatifler (gerekmedi): sağlayıcıdan Regiomontanus talebi; astrology-api.io (10-20 araştırması, satın alma yok);
  Swiss Ephemeris profesyonel lisansı (ücretli, owner kararı) — mevcut çözüm bunların hiçbirini gerektirmiyor.

## 4. Doğrulama özeti (`npm run test:astrology:horary-western` → 11/0 + 22/0)

| Kontrol | Referans | Sonuç |
|---|---|---|
| Regiomontanus formül ↔ vektör geometrisi | 3.000 rastgele (φ ±66°) | ≤1e-6″ |
| Regiomontanus ↔ Swiss Ephemeris DE441 | 12 an, φ −54,8°…+66,0° | saf ev matematiği ≤0,15″; tam zincir ≤0,2″; ARMC ≤0,13″ |
| Yerel ASC/MC ↔ GERÇEK sağlayıcı natal | 34 yanıt (≥1950, sayısal ofset) | ≤19,6″ (≈1,3 sn zaman; sağlayıcının UTC/UT1 kuralı) |
| 7 gezegen boylam / hız ↔ DE441 | 12 an | ≤17,8″ / ≤0,76″/gün |
| Kesinleşme anları ↔ bağımsız 1 dk tarama | Ay × 6 gezegen, 7 gün | 11/11 aynı, an farkı ≤29 sn (tarama çözünürlüğü) |
| Merkür 2026 istasyonları | işaret değişimi | 26 Şub R · 20 Mar D · 29 Haz R · 23 Tem D · 24 Eki R · 13 Kas D |
| Ay boşlukta ↔ bağımsız 30 dk tarama | 14 an | 14/14 (10 boşlukta) |
| Gezegen saati ↔ GERÇEK sağlayıcı hora | İstanbul 2026-11-01 | 24/24 yönetici; sınır farkı ≤0,5 dk |
| Sect irtifası ↔ astronomy-engine Horizon | 60 an, kutup dahil | işaret 60/60, ≤0,0025° |
| Sağlayıcı anlık görüntüsü tutarlılığı | GERÇEK natal golden 1990 | boylam 2,1″, ASC/MC 0,1″; 0,1° bozulmada `ok=false` |

Eski Atlas regresyonu: `npm run test:astrology` (tam zincir) — sonuç PR açıklamasında.

## 5. Ekol ayrımı (tek standarda birleştirilmedi)

`HoraryProfile` her eşiği adlandırır; iki profil vardır ve **hiçbiri varsayılan ürün profili değildir**:

| Parametre | `lilly-1647` | `dorothean-egyptian` | Kaynak / not |
|---|---|---|---|
| Üçlü | Lilly (su: Mars/Mars) | Dorothean (gündüz/gece/ortak) | CA s. 104 · Carmen I.1 |
| Terim | Lilly (CA s. 104) | Mısır | 10-19 tıpkıbasım teyidi · Tetrabiblos I.20 |
| Yanma | 8°30′, aynı burç | 8°30′ (burç şartı işaretli) | CA s. 113 |
| Işın altı / cazimi | 17° / 17′ | aynı | CA s. 113; **aynı kitabın 7. ev aforizması 26: 12° / 16′** |
| Via Combusta | Terazi 15° – Akrep 15° | aynı | CA s. 122 |
| Şans noktası | gündüz/gece aynı formül | gece ters | CA s. 143 · Valens |
| Ay boşlukta | burç içinde kesinleşme yok + orb/dış gezegen varyantları ayrı alan | aynı | CA s. 112 ("apply" belirsiz) |
| Aktarma | s. 111 sade tanım **ve** s. 125 kabul şartlı tanım ayrı bayrak | — | CA |

Bonatti (146 considerations), Sahl ibn Bishr (On Questions) ve Māshā'allāh (On Reception) için **profil yok**: tabloları
birincil kaynaktan satır satır teyit edilmedi. Bu ekollerin kabul (reception) ve "itiraz" (pushing/returning light, Sahl'ın
"pushing nature/power") kavramları Lilly'den farklıdır; Lilly kuralı onlara uygulanmaz.

## 6. Eksik kalanlar (ürün kapısı KAPALI)

1. **Eğitmen kararları** (docs/astrology/horary/05 + yeni): ekol seçimi; Ay boşlukta tanımı; orb tablosu (Satürn 10/9, Venüs
   8/7, Mars 7/7°30′); ışın altı 17°/12°; aktarma s. 111/s. 125; partile tanımı; sabit yıldız (1647 derece mi güncel mi, orb);
   cusp'a 5° kuralı; radikallikte "aynı doğa" tablosu; dikkat noktalarının uyarı/engel niteliği.
2. **OCR'de okunamayan 3 Lilly değeri**: 3. ev +1, doğrudan +4, Mars ortalama hızı — tıpkıbasım görsel teyidi.
3. **Zamanlama** (derece → gün/hafta/ay/yıl, burç ve ev niteliği): Lilly CA s. 110'da ilke var, birim kuralı ekole bağlı.
4. **Ürün entegrasyonu**: `western.horary` tekniği, soru kaydı şeması (migration gerekebilir: soru metni + an + yer),
   ekran, Word/PDF, arşiv — kararlardan sonra ayrı PR.
5. Sağlayıcı tutarlılık denetimi için ürün akışında 1 natal-chart çağrısı (soru anı) — çağrı başına maliyet 1.

## 7. Önerilen ürün akışı (tasarım; KOD YOK)

Yeni soru → ekol seçimi (yalnız onaylı profiller) → soru metni, yerel tarih/saat + yer (mevcut konum araması ve
`timeResolution`; belirsiz/boşluk saat uyarıları aynen) → hesap (yerel çerçeve + 1 sağlayıcı anlık görüntüsü, tutarlılık
`ok` değilse kayıt yok) → sekmeler: Harita (Regiomontanus çember, mevcut chartPng altyapısı) · Gezegenler (asal + arızi
asalet ayrı sütun) · Kabul matrisi · Açılar ve olay çizelgesi (kesinleşme/istasyon/giriş, saat dilimli) · Ay'ın seyri ·
Dikkat noktaları (kanıtlı) · Uzman notu. Kayıt/arşiv: mevcut `astro_analyses` (teknik kimliği `western.horary`), yeniden açma
anlık görüntüden (yeniden hesap yok). Word/PDF: mevcut rapor modeli + yeni bölüm. Mobil: tablo → kart düzeni (mevcut Atlas
premium bileşenleri). Hüküm alanı yok; uzman yorumu serbest metin.
