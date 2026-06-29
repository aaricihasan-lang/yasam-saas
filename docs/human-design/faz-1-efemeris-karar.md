# FAZ 1 — Human Design Engine / Efemeris & Referans Karar Raporu

> **Durum:** Karar ve risk azaltma fazı. Bu faz motor yazma fazı değildir.
> **Production hesap iddiası yoktur.** FAZ 0 iskeleti (`lib/human-design/engine/`) bozulmadı.

---

## KARAR ÖZETİ (bağlayıcı sonuç)

1. **Üretimde `astronomy-engine` kullanılacak.** (MIT, kurulu sürüm 2.1.19, ≤30″ doğruluk, sıfır Vercel/lisans riski.)
2. **Swiss Ephemeris üretime ALINMAYACAK.** (AGPL/ticari lisans riski + Vercel native binding/veri-dosyası yükü; marjinal doğruluk kazancı HD'nin dakika-tabanlı girdi tavanının altında.)
3. **`pyswisseph` SADECE çevrimdışı doğrulama/oracle amaçlı kullanılacak.** (Ortamda zaten kurulu; ham boylam ve True/Mean node referansı için. Üretim bundle'ına girmez.)
4. **Uçtan uca doğrulama için elle küratörlü MyBodyGraph golden set kullanılacak.** (Jovian lineage; toplu scraping yapılmaz, yorum metinleri çoğaltılmaz.)
5. **FAZ 2 sırası:**
   1. Gerçek AE `PlanetLongitudeProvider`
   2. 88° design solver
   3. Mandala gate/line eşleme
   4. Type / authority / channels / centers / definition / cross

---

## FAZ 1A — Mevcut Altyapı Denetimi (salt-okuma)

### 1. astronomy-engine sürümü
- `package.json`: `^2.1.19` — kurulu sürüm **2.1.19**.
- Lisans: **MIT**. Saf JS; native binary yok; harici efemeris veri dosyası yok.

### 2. Kullanım yerleri
- **Üretim:** `lib/cosmic/*` (planets, moon, eclipses, aspects, exactAspects, aspectMotion, retro, events), `app/cosmic-calendar/page.tsx`, `app/api/cosmic/audit/route.ts`.
- **Doğrulama harness:** `scripts/cosmic-validation/**` (üretimden bağımsız ikinci uygulama).
- **HD tarafı:** `lib/human-design/engine/planets.ts` ve `types.ts` yalnızca yorumda anıyor — gerçek import yok (FAZ 0 mock dokunulmadı).

### 3. Kozmik engine teknik gerçekleri

| Konu | Bulgu |
|---|---|
| Hesaplanan cisimler | Güneş + Merkür→Plüton (8 gezegen) `GeoVector + Ecliptic`; Ay `EclipticGeoMoon`. **Ay düğümü boylamı üretimde hesaplanmıyor** (yalnız `SearchMoonNode` olay aramaları var). |
| Precision | Bağımsız Swiss Ephemeris'e karşı **konum ≤ 30″**; zaman: Ay ≤ 27 sn, hızlı cisim ≤ 6 dk (208/208 olay, 2026–2050). |
| Geocentric/tropical/apparent | **Üçü de doğru:** `GeoVector(body, date, true)` → aberasyon düzeltmeli **apparent**; `Ecliptic()` → **of-date tropikal** ekliptik (ayanamsa yok). HD'nin ihtiyacı olan temel budur. |
| Tutulma doğrulama yaklaşımı (2026–2050) | `scripts/cosmic-validation/eclipses/` içinde **pyswisseph (Swiss Ephemeris, Moshier flag)** bağımsız referans + golden `testset.json` + `compare_*.mjs` verdict. 56/56 güneş, 57/57 ay; peak ≤ 22 sn. |

### 4. Hiçbir kozmik dosya değiştirilmedi.

### 1A çıkarımları (HD için)
- ✅ **Hazır varlık:** Proje zaten (a) ≤30″ doğrulukta apparent-geocentric-tropikal boylam hattına ve (b) pyswisseph'in kurulu olduğu kanıtlanmış bağımsız doğrulama metodolojisine sahip. HD ikisini de yeniden kullanır.
- ⚠️ **HD'ye özel boşluklar (kozmikte yok):**
  1. Ay düğümü **boylamı** (True/Mean — AE'de doğrudan tek-çağrı yok; türetme/oracle gerekir).
  2. `Earth = Güneş + 180°` / `SouthNode = NorthNode + 180°` (trivial türetme).
  3. **88° design çözücü.**
  4. **Mandala ofset / gate-line sınır tablosu** (kalibrasyon-kritik sabit).

### Precision yeterlilik analizi (HD ölçeği)
- Line genişliği = 0.9375° = **3375″**; gate = **20250″**. AE'nin ≤30″ hatası bir line'ın ~%0.9'u → **gate/line için fazlasıyla yeterli**; yalnız sınıra ~30″'den yakın doğumlarda off-by-one riski (girdi-hassasiyeti tavanıyla aynı sınır vakası).
- color (562″) / tone (94″): dikkatle yeterli. **base (18.75″): 30″ hata hücreyi aşar → AE base/PHS Variable için güvenilmez.**
- İstenen kapsam (gate/line/type/authority/profile/center/channel) base'e inmez → **AE istenen kapsam için yeterli.**

---

## FAZ 1B — Efemeris Seçenek Karşılaştırması

| Kriter | (1) astronomy-engine | (2) Swiss Eph ticari + ayrı compute | (3) Golden dataset kalibrasyonu + üretimde AE |
|---|---|---|---|
| Doğruluk | ≤30″ (repoda kanıtlı) | En yüksek (JPL DE431, alt-arcsec) — gate/line için **fazlalık** | = (1); fark CONFIDENCE'ta |
| HD yeterliliği | Tam yeterli (kapsam içi); node türetme gerek; base'e inmez | Tam + node native + base mümkün | = (1) |
| Vercel uyumu | ✅ Native serverless, veri dosyası yok, **zaten bundle'da** | ⚠️ Native binding sorunlu → WASM/ayrı servis + `.se1` veri dosyaları | ✅ = (1) |
| Lisans riski | ✅ MIT, sıfır | ⚠️ AGPL (kaynak açma) **veya** Astrodienst ticari ücret | ✅ MIT (referans çıktıları yalnız testte, yayınlanmazsa düşük) |
| Bakım | Düşük (tek bağımlılık, dosya yok) | Yüksek (veri dosyası, build, servis, lisans takibi) | Orta (dataset küratörlüğü) |
| Production güveni | **Yüksek** (kapsam içi, sınır vakası belgeli) | Yüksek ama marjinal kazanç girdi tavanının altında → azalan getiri | **Mümkün olan en yüksek** (iddia değil, ölçülmüş) |

**1B sonucu:** Üretimde **Seçenek 1 + Seçenek 3 birleşimi** (kozmik motorun zaten başarıyla uyguladığı desen). Swiss Ephemeris üretime sokulmaz; yalnız **çevrimdışı referans oracle** — pyswisseph zaten ortamda kurulu ve True/Mean node boylamını doğrudan verir (1A node boşluğunu ücretsiz kapatır).

---

## FAZ 1C — Referans Motor Kararı

**Öneri: Jovian Archive / MyBodyGraph (kanonik), ikincil çapraz-kontrol Genetic Matrix.**

| Kriter | Değerlendirme |
|---|---|
| Sektör kabulü | **Jovian Archive** sistemin tanımlayıcı otoritesi (Ra Uru Hu); **MyBodyGraph** onun resmi yazılımı — **Swiss Ephemeris + True Node** kullanır. En yüksek meşruiyet. |
| Çıktı erişilebilirliği | Ücretsiz tam bodygraph; 26 aktivasyonun gate/line'ı (Personality siyah / Design kırmızı), type/authority/profile/definition/cross görünür → tüm alanlar karşılaştırılabilir. |
| Test datası | El ile küçük-orta küratörlü golden set (birkaç yüz vaka). Toplu scraping ToS/hukuki risk → yapılmaz. |
| Telif/etik | Gate **yorum metinleri** telifli; ama "hangi gate/line, type" gibi **hesaplanmış olgular** yaratıcı eser değil → test oracle'ı olarak düşük risk. Yorum metinleri çoğaltılmaz/yayınlanmaz; ölçekli scraping yapılmaz. |
| Çapraz-kontrol | İkinci bir SWE-tabanlı araç (Genetic Matrix), referansların sınırda ayrıştığı yerleri (özellikle True vs Mean node) tespit için. |

**Karşılaştırılabilir alanlar:** 26 aktivasyon gate/line · type · authority · profile · definition · centers · channels · incarnation cross — hepsi MyBodyGraph çıktısında görünür.

**Kritik kalibrasyon içgörüsü:** MyBodyGraph **True Node** kullanır. AE ham boylamlarını pyswisseph'e **True Node ile** doğrularsak, referansla aynı astronomik temele otururuz — bu 1B'yi de risksizleştirir.

---

## FAZ 1D — Golden Dataset Formatı (öneri; dataset üretilmedi)

```jsonc
{
  "caseId": "HD-GOLD-0001",
  "provenance": {
    "referenceSource": "MyBodyGraph",      // Jovian lineage
    "referenceCapturedAt": "2026-06-28",   // elle yakalama tarihi
    "ephemerisBasis": "Swiss Ephemeris / True Node",
    "boundaryFlag": false,                  // aktivasyon gate/line sınırına yakın mı?
    "notes": ""
  },
  "input": {
    "date": "1990-05-15", "time": "14:30",
    "timezone": "Europe/Istanbul",
    "location": { "city": "Istanbul", "country": "TR", "lat": 41.0082, "lon": 28.9784 }
  },
  "reference": {
    // 13 cisim: Sun, Earth, Moon, NorthNode, SouthNode, Mercury..Pluto
    "personality": {
      "Sun":  { "gate": 2,  "line": 4, "longitude": 53.91 },
      "Earth":{ "gate": 1,  "line": 4, "longitude": 233.91 }
      // ... 11 cisim daha
    },
    "design": {
      "Sun":  { "gate": 7,  "line": 2, "longitude": 325.40 }
      // ... aynı 13 cisim
    },
    "type": "Generator",
    "authority": "Sacral",
    "profile": "4/2",
    "definition": "Single",
    "centers": { "Head": false, "Ajna": true, "Throat": true, "G": true,
                 "Heart": false, "Spleen": false, "SolarPlexus": false,
                 "Sacral": true, "Root": false },
    "channels": ["34-20", "10-57"],          // gate-çifti gösterimi
    "incarnationCross": {
      "name": "Right Angle Cross of ...",
      "gates": [2, 1, 7, 13]                  // [P-Sun, P-Earth, D-Sun, D-Earth]
    }
  },
  "tolerance": { "longitudeArcsec": 30, "exactGateLine": true }
}
```

**Notlar:** `longitude` alanları opsiyonel ama sapmanın hangi katmanda girdiğini izole etmek için güçlü tavsiye (FAZ 0'daki "ham boylamı snapshot al" ilkesi). `boundaryFlag: true` vakaları, garanti edilemeyen sınır bölgesini ayrı raporlamak için.

---

## FAZ 1E — FAZ 2 Önerisi

**Sıra (katmanlı risk azaltma):**

1. **Gerçek AE boylam sağlayıcı** — `PlanetLongitudeProvider`'ı AE ile uygula (mock'u değiştirmeden yanına ekle). Node boylamı türetme + `Earth/SouthNode` türetme dahil. → ham boylamları pyswisseph'e (True Node) karşı doğrula. En küçük adım, her şeyi açar, kozmik desenini yeniden kullanır.
2. **88° design çözücü** — Güneş boylamının kök-bulması; saf astronomik, HD semantiği gerektirmez → pyswisseph'e karşı bağımsız doğrulanabilir (design JD + boylamlar).
3. **Mandala gate/line eşleme** — kalibrasyon-kritik ofset sabiti; ancak boylamlar (1)+(2)'de objektif oracle'a karşı doğrulandıktan sonra → Jovian golden set'e karşı kalibre et.
4. **type / authority / channels / centers / definition / cross** — saf deterministik grafik mantığı, en düşük risk; gate kümesi doğrulandıktan sonra.

**Net cevaplar:**
- astronomy-engine ile prototype mi? → **Evet, FAZ 2'nin ilk adımı.**
- Swiss araştırması mı? → **Hayır gerekmez** — pyswisseph yalnız çevrimdışı oracle.
- Önce gate/line mandala mı? → **Hayır.** Boylam doğrulanmadan mandala çıktısına güvenilemez.
- Önce 88° design solver mı? → **Boylam sağlayıcıdan sonra, mandala'dan önce** (2. sıra).

---

## "Hangi yolla ilerlemeliyiz?" — Teknik Cevap

Üretimde astronomy-engine (MIT, ≤30″, sıfır Vercel/lisans riski); doğrulamada çift oracle: ham boylam için ortamdaki pyswisseph (True Node), uçtan-uca için elle küratörlü MyBodyGraph golden set. FAZ 2 sırası: gerçek AE provider → 88° design solver → mandala gate/line eşleme → deterministik type/authority/channels/centers. Swiss Ephemeris üretime alınmaz.

---

**Bu faz motor yazma fazı değil, karar ve risk azaltma fazıdır.**
