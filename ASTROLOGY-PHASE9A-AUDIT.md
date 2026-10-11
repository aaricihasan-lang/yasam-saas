# ASTROLOJİ AŞAMA 9A — SATIŞ ÖNCESİ BAĞIMSIZ TEKNİK, HESAPLAMA VE GÜVENLİK DENETİMİ

- Denetim tarihi: 2026-10-09 · Worktree `C:/yasam-astrology-roxy` · Branch `work/astrology-roxy` · Denetlenen HEAD **`71344781`** (temiz).
- Çalışma türü: **yalnız denetim**. Uygulama kodu değiştirilmedi; yalnız bu rapor dosyası commit edildi.
- Production / Frankfurt / Tokyo: **dokunulmadı**. Push / merge / deploy / migration: **yok**. Gerçek Roxy çağrısı: **0** (toplam **47**).
  Gerçek danışan verisi: **yok** (sentetik kişiler + depodaki kayıtlı golden yanıtlar). Başka oturumların süreçlerine ve kullanıcının açık Word belgesine dokunulmadı.
- Başlangıç durumu: HEAD 71344781, çalışma ağacı temiz, ~6,5 GB boş RAM / 16 GB. Başka oturumlara ait Node / embedded-postgres süreçleri çalışıyordu (dokunulmadı).

## 1. Kapsam ve yöntem

1. **Kod envanteri ve 25 teknik incelemesi:** `lib/astrology/**`, route'lar, migration'lar, UI ve rapor kodu satır düzeyinde okundu (Ek C).
2. **Bağımsız hesaplama doğrulaması:** Kayıtlı 47 golden Roxy yanıtı uygulamanın kendi projeksiyonundan geçirildi. Sonuçlar uygulamadan **bağımsız**
   referanslarla karşılaştırıldı: `astronomy-engine 2.1.19`, el yazımı formüller (ASC/MC, iteratif Placidus, düğümler, ortalama Lilith,
   IAU-2006 presesyon + nütasyon ile Lahiri / KP ayanamsa, BPHS ashtakavarga tabloları, Parashara varga kuralları, Vimshottari, KP 249-sub tablosu)
   ve tzdata 2026a (Intl kaba kuvvet tarama). Golden'lar burada **regresyon değil girdi** olarak kullanıldı; doğrulama bağımsız referansla yapıldı (Ek A).
   Lider denetçi ayrıca Güneş/Ay boylamını astronomy-engine ile tekrar hesapladı (Güneş Δ≈0,00002°, Ay Δ≈0,0001° — Ek A ile tutarlı).
3. **Güvenlik / veri bütünlüğü:** Saldırgan bakışıyla kod incelemesi + yerel embedded PostgreSQL üzerinde yetki ölçümü ve
   **iki bağlantılı eşzamanlı silme testi** (Aşama 7B'de yapılamamıştı) (Ek B).
4. **Testler:** Mevcut paketler bellek gözetilerek **sırayla** çalıştırıldı (Bölüm 9).
5. Bağımsız referans bulunamayan hesaplar **DOĞRULANAMADI** olarak işaretlendi. Astrolojinin öngörü geçerliliği denetlenmedi; yalnız yazılımın seçilen yöntemi doğru uygulayıp uygulamadığı denetlendi.

## 2. Kod envanteri (özet; ayrıntı Ek C §A)

| Bileşen | Dosyalar / servis | API |
|---|---|---|
| Teknik tanımları (25) | `lib/astrology/engine/techniques.ts`, `model/{western,westernTiming,westernLocation,vedic,kp}.ts` | `engine/plan`, `engine/run`, `engine/view` |
| Roxy entegrasyonu | `providers/roxy/{client,requests,natal,timing,location,vedic,kp}.ts`, `config.ts`, `http.ts` (DB oran limiti) | — |
| Yerel hesap | yalnız: lunar return gün seçimi/doğrulaması (astronomy-engine), solar arc directed→natal açıları (`yasam-arith-v1`), `verify/{kpSub,varga}` tutarlılık denetimleri (sonuç olarak gösterilmez) | — |
| Yerel efemeris motoru | **YOK** — 25 tekniğin tamamı Roxy'de hesaplanır | — |
| Harita çizimleri | `NatalWheel.tsx` (kendi SVG), `VedicPanels.tsx` RoxyKundli (`@roxyapi/ui`, istemci), `KpPanels.tsx` güney haritası, `WorldMap.tsx`, rapor `report/wheelSvg.ts` | — |
| Profil / doğum kaydı | `profiles/service.ts`, `birth/{location,profileInput,timeResolution}.ts`, `persistence/repo.ts` | `profiles`, `profiles/[id]`, `profiles/[id]/client` |
| Analiz snapshot'ları | `analyses/service.ts` (değişmez snapshot, notlar kopyası, KB snapshot'ı) | `analyses`, `analyses/[id]`, `analyses/preview`, `workspace`, `notes` |
| Sinastri / kompozit | `techniques.ts` pairTechnique, karşı taraf revizyonu snapshot'ta | aynı |
| Bilgi Bankası + notlar | `kb/service.ts`, `analyses/service.ts saveExpertNote` | `kb`, `kb/[id]`, `notes` |
| Danışan Yolculuğu bağı | `clients/service.ts`, `components/astrology/AstrologyClientStatus.tsx`, DY sayfasında 3 satırlık rozet | `clients/candidates`, `clients/[id]/preview`, `client-status` |
| Yetkiler | `access/{entitlements,ownerGate}.ts`, `lib/auth/*` astroloji kayıtları, Üye Yönetimi anahtarları | `access` |
| Word / PDF | `report/{model,wheelSvg,chartPng,docx,pdf,service}.ts` | `analyses/[id]/report?format=docx\|pdf` |
| Arşiv / kalıcı silme | `clients/deletion.ts`, migration 000500 `astro_profile_delete(_preview)` | `profiles/delete/preview`, `profiles/delete` |
| Yüzeyler | Admin kabuğu `/admin/astroloji` + `/api/admin/astroloji/**` (yalnız owner); uzman `/astroloji` + `/api/astroloji/**` (birebir re-export, 23 route) | — |

Kodda bulunmayan ve raporlanmayan: yerel efemeris, otomatik yorum üretimi (yalnız Roxy yorumu snapshot'ı), Vedik/KP harita görselinin raporda yer alması.

## 3. 25 teknik — denetim tablosu

Ortak sonuçlar (tüm teknikler):
- **Hesap kaynağı:** Roxy. **Girdi:** seçenekler sunucuda `parseOptions` ile normalize/ret edilir; konum yalnız kimlik olarak gelir, koordinat + IANA tz sunucuda çözülür.
- **Saat:** yerel saat → UTC `timeResolution.ts`; DST boşluğu → 422, belirsiz saat → 422 + iki seçenek, LMT saniye hassasiyetinde. Bağımsız tz referansıyla 15/15 vaka **PASS** (Ek A §1).
- **Çıktı:** uç nokta başına beyaz liste projeksiyon; zorunlu alan eksikse 502 ve hiçbir şey kaydedilmez (fail-closed).
- **Projeksiyon bütünlüğü:** 47/47 golden; 0 düşen/eşlenmemiş alan; aynı ham → aynı çıktı (determinizm).
- **Gelenek ayrımı:** KB / not bağlamı / konu anahtarları geleneğe göre ayrılır.
- **Word/PDF:** yalnız kayıtlı snapshot'tan üretilir; 25 tekniğin tamamı Aşama 8 testleriyle doğrulandı.

| # | Teknik | Kaynak (Roxy uç noktası) | Bağımsız doğrulama (sapma) | Girdi doğrulama | Etiket / yöntem | Karar |
|---|---|---|---|---|---|---|
| 1 | Batı natal | /astrology/natal-chart | Gezegenler ≤0,0012°, Ay ≤0,00015°, ASC/MC/Placidus ≤0,00003°, gerçek düğüm 0,001°, ort. Lilith 0,004°, retro + açı orbları birebir | ev sistemi / düğüm beyaz liste | Lilith=ortalama ✔ (raporda "(ortalama)" notu yok → P3) | ✅ |
| 2 | Transit | /astrology/transits | ≤0,0052°, yaklaşan/ayrılan birebir | yıl aralığı yok → P3 | ✔ | ✅ |
| 3 | Forecast | /forecast/transits | 87 açı olayı ≤0,006°, zaman medyanı 0,5 dk (en kötü 52 dk, istasyon yakını Venüs); istasyon ≤0,27 sa, giriş ≤0,21 sa, ay evresi ≤0,7 dk | 1–366 gün; yıl aralığı yok → P3 | ✔ | ✅ (>90 gün birleştirme DOĞRULANAMADI) |
| 4 | Progression | /astrology/progressions | tropikal yıl; gezegenler ≤0,0013°; açı (ASC/MC) Naibod-RA ≤0,0002°; ev yöntemi 14/14 | yıl aralığı yok → P3 | Açı yöntemi (Naibod) etiketsiz → P3 | ✅ |
| 5 | Solar arc | /astrology/solar-arc + **yerel** açılar | yay ≤0,00013°; yerel açılar 11/11 | — | ✔ | ✅ |
| 6 | Solar return | /astrology/solar-return | dönüş anı 36 sn, harita ≤0,005° | yıl 1600–2600 | ✔ | ✅ |
| 7 | Lunar return | /astrology/lunar-return | dönüş anı 7,8 sn, harita ≤0,005° | ay UTC ayı → P3 | ✔ | ✅ |
| 8 | Sinastri | /astrology/synastry | çapraz açılar/evler birebir–0,002° | aynı profil reddi | houseSystem yankısı denetlenmiyor → P3 | ✅ |
| 9 | Kompozit | /astrology/composite-chart | orta nokta (kısa yay) birebir | — | "midpoint" ✔ | ✅ |
| 10 | Astrocartography | /astrology/astrocartography | RA/Dec ≤0,002°, MC hattı 0,0013°, ASC/DSC hattı 0,015° | — | ✔ | ✅ |
| 11 | Relocation | /astrology/relocation-chart (+natal) | ≤0,002° | konum sunucuda çözülür | `angularPlanets/direction` DOĞRULANAMADI | ✅ |
| 12 | Local space | /astrology/local-space | ≤0,004° (geosentrik, kırılmasız) | — | ✔ | ✅ |
| 13 | Vedik D1 | /vedic-astrology/birth-chart | Lahiri ayanamsa 0,000005°; D1 = tropikal − ayanamsa birebir; nakshatra/pada/lord/bhava/Baladi 0 hata | ayanamsa beyaz liste | **method.zodiac "tropical" kaydediliyor → 9A-P2-01**; Rahu=ortalama düğüm etiketsiz → P3 | ⚠️ etiket |
| 14 | Varga | /vedic-astrology/divisional-chart | 15 varganın tamamı Parashara kuralına göre 0 hata | bölüm beyaz liste | aynı zodyak etiketi | ⚠️ etiket |
| 15 | Vimshottari dasha | /vedic-astrology/dasha/* | bakiye 355,86→356 gün; büyük dönemler ≤0,89 gün; alt dönemler ≤0,4 dk | MD/AD beyaz liste | aynı | ⚠️ etiket |
| 16 | Drishti | /vedic-astrology/aspects | 9/9 Parashari bütün-burç | yalnız Lahiri | ✔ | ⚠️ etiket |
| 17 | Ashtakavarga | /vedic-astrology/ashtakavarga | BAV BPHS tablolarıyla birebir (48/49/39/54/56/52/39, SAV 337); pinda birebir; indirgeme iki yaygın kuraldan biriyle uyumlu | — | Lagna tablosu DOĞRULANAMADI | ⚠️ etiket |
| 18 | Shadbala | /vedic-astrology/shadbala | naisargika, asgari, dig bala, toplam, oran, sıra uyumlu | — | sthana/kala/chesta/drik + ishta/kashta DOĞRULANAMADI | ⚠️ etiket |
| 19 | Panchanga | /vedic-astrology/panchang/basic | tithi/nakshatra/yoga/karana birebir; doğum anında hesaplandığı doğrulandı | yalnız Lahiri | ✔ | ⚠️ etiket |
| 20 | Gochara | /vedic-astrology/transit | ≤0,005°; ev/drishti/kaksha birebir | yalnız Lahiri | ✔ | ⚠️ etiket |
| 21 | KP chart | /vedic-astrology/kp/chart | KP ayanamsa (klasik Krishnamurti) 0,00014°; star/sub/sub-sub lord + KP numarası 62/62; 4 düzey significator 12/12 | ayanamsa/düğüm beyaz liste | "kp-newcomb" adı Roxy'nin; klasik KP değerine eşit (gözlem) | ⚠️ etiket |
| 22 | KP dasha | dasha uçları + significators | ≤0,85 gün, alt dönemler birebir | — | aynı | ⚠️ etiket |
| 23 | KP ruling | /vedic-astrology/kp/ruling-planets | gün lordu (son gün doğumu) + Ay/Lagna lordları 0 hata (doğum yerinde) | — | **farklı gözlem yerinde tek konum → 9A-P2-04 (doğrulama gerekir)** | ⚠️ |
| 24 | KP transit | /vedic-astrology/kp/planets-interval | sub-lord'lar birebir | — | KISMİ (natal ev analizi Roxy'de yok — UI'da belirtilmiş) | ⚠️ etiket |
| 25 | KP horary | /vedic-astrology/kp/horary | #108 aralığı 153°–155,1111°, ASC = orta nokta; cusp'lar ≤0,0004° | 1–249 tam sayı | ✔ | ⚠️ etiket |

"⚠️ etiket" = hesap doğru; yalnız 9A-P2-01 (kayıtlı `method_snapshot.zodiac` ve kaydetme özeti "Tropikal") etkiler. Rapor (Word/PDF) ve kayıtlı analiz listesi zodyağı teknikten türettiği için **doğru** gösterir.

## 4. Bağımsız hesaplama doğrulamaları (özet; tam tablo Ek A)

- **FAIL yok.** Kontrol edilen alanlar: tropikal/sidereal ayrımı, Lahiri ve KP ayanamsa, Placidus, gezegen boylamları, retro, UTC/DST/LMT, tarih sınırları, ASC/MC, açılar,
  15 varga, dasha zamanlaması, KP sub-lord (249), horary 1–249 eşlemesi. Hepsi astrolojik toleransın çok altında uyumlu.
- **Referans:** astronomy-engine 2.1.19; Node 24.15, ICU 78.2, tzdata 2026a. **Toleranslar:** gezegen 0,05° (Ay 0,1°), açı noktaları 0,1°, ayanamsa 0,01°, dasha 1 gün, tz birebir.
- **Not (FAIL değil):** 2026 tarihlerinde Venüs/Satürn/Neptün için Roxy ile astronomy-engine arasında 0,0034–0,0054° fark var (1990'da ≤0,0012°). Bu, referansın kendi doğruluk sınırı içindedir.
- **Uygulama projeksiyonu:** 47/47 gövde birebir, sayılar korunur (yalnız KP boylamında 5,7e-14° ve local-space çizgi noktalarında 4 ondalık yuvarlama).
- **DOĞRULANAMADI (Bölüm 11):**
  - Kiron (offline asteroid efemerisi yok)
  - Shadbala'nın 4 bileşeni + ishta/kashta
  - Ashtakavarga Lagna tablosu
  - Jagradadi/Deeptadi avasthaları ve 48 yoga listesi
  - Roxy'nin kendi skorları (açı gücü, uyum, KP güç derecesi, önem)
  - >90 günlük forecast birleştirmesi
  - Relocation `angularPlanets` / `direction`

## 5. Roxy entegrasyonu (ayrıntı Ek C §C)

- **Uç noktalar ve istekler:**
  - Uç noktalar regex beyaz listesinden geçer. 46/46 golden gövdesi uygulamanın ürettiği gövdeyle **birebir**.
  - Roxy'ye yerel saat ve ondalık ofset gider.
- **Hata yönetimi ve süreler:**
  - Zaman aşımı 20 sn (AbortController).
  - Yeniden deneme en fazla 1 kez, yalnız 429/503 ve Retry-After ≤5 sn ise; çift ücret riskine karşı 5xx, zaman aşımı ve ağ hatası tekrar denenmez.
  - Hata kodları eşlenir; şema uyumsuzluğunda 502 döner ve hiçbir şey kaydedilmez.
- **Oran limitleri:** Uçuştaki istek kilidi 1 / 25 sn, kullanıcı 60 / saat, tenant 300 / gün (DB, HMAC kovası). DB hatasında bellek içi limite düşer (P3).
- **Önbellek:** `(tenant, owner_user_id, input_hash)` UNIQUE, TTL yok; "şimdi" UTC saat başına yuvarlanır. Uzmanlar arasında paylaşılmaz (Bölüm 6).
- **Gereksiz çağrı önleme:** planlayıcı tekilleştirmesi, kapsama budaması, önbellek ve >10 yeni istek için açık onay.
- **API anahtarı:** Yalnız sunucuda; `X-API-Key` başlığında gider, log, hata ve istemciye çıkmaz, base URL yalnız https.
- **Yorum / teknik ayrımı:** Ayrı projeksiyon ve ayrı tablo. Yorum yetkisi yoksa yorum kolonu **DB'den okunmaz** (Aşama 7C/8 testleri + bu denetimde kod okuması). Eski snapshot'lar değişmez.
- **Gerçek çağrı yapılmadan doğrulanamayanlar:**
  - 429/503 yanıtlarında ücret düşüp düşmediği
  - KP ruling'de konum kullanımı (9A-P2-04) ve horary tarih tabanı
  - Sinastri/kompozitte `houseSystem` parametresine uyulup uyulmadığı
  - Forecast `endDate`'in dahil olup olmadığı
  - Drishti, panchanga ve ruling çerçevesinin her yanıtta sabit olup olmadığı
  - Koch ve Equal ev sistemlerinin desteklenip desteklenmediği
  - 1550–2650 dışındaki tarihlerde sağlayıcı davranışı
  - Gecikme dağılımı

## 6. Güvenlik (ayrıntı Ek B)

**Sonuç: yetkisiz veri erişimi bulunamadı (P0 yok).**
- **Route kapıları:** 23 admin route'unun hepsi ilk satırda `requireAstrologyAccess` çağırıyor; uzman yüzeyi birebir re-export (statik test).
- **Servis sorguları:** hepsinde `tenant_id` **ve** `owner_user_id` filtresi var. Uzman A, B'nin profil, analiz, not, KB, sonuç veya raporuna ulaşamıyor: aynı tenant, başka tenant, tahmin edilen ya da geçersiz kimlik → tek tip 404 (perm7c + report8 matrisleri).
- **Sağlayıcı önbelleği:** uzman kapsamlı `UNIQUE(tenant, owner, input_hash)` (000300:123). Uzman B, ne kimlikle ne hash ile A'nın sonucuna veya Roxy yorumuna erişebilir.
- **Yetki ve hesap türü durumları:**
  - Modül kapalı, owner olmayan admin, demo hesap, onay bekleyen veya Premium olmayan hesap, kill switch kapalı → 404.
  - Yetki her istekte DB'den okunur; oturum ya da yetki önbelleği yok.
- **Roxy yorumu:** yetki kapalıyken eski snapshot, iç içe sinastri/kompozit yorumu ve Word/PDF yollarının hiçbirinde sızıntı yok (report8: 25 teknik × 2 biçim, "kolon hiç okunmaz" testi).
- **Veritabanı (embedded PG ölçümü):**
  - 9 `astro_*` tablonun hepsinde RLS açık.
  - anon / authenticated için tablo ve fonksiyon yetkisi yok.
  - Tek SECURITY DEFINER fonksiyonu (`astro_profile_delete`) sabit `search_path` kullanıyor ve yalnız service_role çalıştırabiliyor.
  - service_role'ün `UPDATE astro_analyses` denemesi 42501 ile reddediliyor (snapshot değişmezliği DB düzeyinde).
- **Girdi güvenliği:** Arama `astro_like_escape` + `ESCAPE` kullanıyor; `%`, `_`, `\` ve `'; DROP…` → 0 sonuç. Rapor dosya adı yalnız `[A-Za-z0-9-]` içeriyor, Content-Disposition enjeksiyonu yok.
- **Kalıcı silme onayı:** Tekli silme 2, toplu silme 3 onay ister. Onay özeti imzasız, ama kilit altındaki DB beklenen sayı kontrolü atlatmayı önlüyor (P3, tasarım gereği belgelenmiş).
- **Doğrulanamayanlar:**
  - Prod PostgREST yetkileri (migration'lar prod'da yok; uygulama sonrası `has_table_privilege` ile tekrar kontrol edilmeli)
  - Platformun istek gövdesi sınırı
  - Çok instance'lı ortamda bellek içi rapor limiti

## 7. Veri bütünlüğü

- **İki bağlantılı eşzamanlı silme testi (7B'de eksik kalan):** Yerel embedded PostgreSQL 18, boş yüksek port, scratchpad'de geçici veri dizini (test sonrası silindi). Fixture'lar ve 000000→000500 migration'ları sırayla uygulandı; `statement_timeout=20s`, iki ayrı `pg` bağlantısı. Sonuç **20/20 PASS**; her senaryoda yetim satır 0, korunan ortak snapshot'lar **md5 birebir**.

| Senaryo | Sonuç |
|---|---|
| S1a: kayıt önce, eski onayla silme | silme beklemede kaldı → 40001 STALE (hiçbir şey silinmedi); yeni onayla 3 analiz silindi, 2 ortak analiz korundu, partner alanı NULL |
| S1b: silme sürerken karşı taraf ortaklı kayıt | kayıt beklemede kaldı → 23503; yeni satır yok |
| S1c: silme sürerken okuma + kayıt | okuma bloklanmadı (eski görüntü); kayıt → 23503 |
| S2: aynı profilin iki eşzamanlı silmesi | ikincisi P0002; tek silme gerçekleşti |
| S3: A ve B karşılıklı silme | P0001 bütünlük kontrolü veya 40001 → tam geri alma; yeni onayla OK |
| S3b: gerçek yarış | 40P01 deadlock ~1 sn'de tespit edildi, askıda kalma yok |
| S4: revizyon ile silme | revizyon önce → 40001; silme önce → P0002 |
| S5: arşivleme / motor sonucu | 40001 / 23503 |
| S6: toplu silme | biri bayatsa hiçbiri silinmez; geçerli onayla hepsi silinir |

- **Kritik kural sağlanıyor:** Profil silindiğinde ortak analizde yalnız `partner_profile_id` / `partner_profile_revision` alanları NULL oluyor; snapshot içeriği md5 ile aynı kalıyor. (Önbellek satırı silindiği için `result_id` de NULL oluyor; snapshot etkilenmiyor.)
- **Danışan Yolculuğu kaydı silinince:** astro profilleri ve analizleri korunuyor (`ON DELETE SET NULL(client_id)`; testte 6/6 analiz kaldı).
- **Diğer akışlar:** Profil oluşturma/düzenleme (revizyonlu), analiz kaydetme (`save_request_id` ile idempotent), eski analiz açma, arşivleme/geri alma, eksik ve eski snapshot'lar → mevcut testlerle PASS (7A/7B/8).
- **Migration sırası:** 000000 → 000500 iki kez uygulanabilir (idempotent). 7A çakışma senaryosu migration'ı **veriyi koruyarak durduruyor** (beklenen başarısızlık).
- **Yarış hataları:** DB doğru reddediyor, ama API bu hataları 500 olarak döndürüyor (P3; 409 / 404 önerilir).

## 8. Word/PDF (regresyon)

- report8: **72/0**. 25 teknik gerçek route'tan Word + PDF olarak indiriliyor; dosyalar JSZip ve unpdf ile bağımsız açılıyor.
- Kapsanan durumlar: Türkçe karakterler, uzun ve çok sayfalı raporlar, çark görseli (oran 1:1), teknik tablolar, uzman notu, Bilgi Bankası, yorum yetkisi açık / kapalı / sonradan kaldırılmış, izolasyon, Android 403, mobil gizleme, `no-store`, snapshot değişmezliği, 0 Roxy.
- Aşama 8 ek doğrulaması (`71344781`): `next build` OK; tarayıcıda masaüstü indirme ve 390 px mobil görünüm; Word 16 ile açılış; mutasyon testleri 9/9.
- Yeni risk kanıtı yok. Bilinen P3'ler (Vedik/KP görseli yok, sembol yerine kısaltma, nakshatra adlarının İngilizce/Sanskritçe kalması) yeniden sınıflandırılmadı.
- Raporu etkilemeyen bir ek: rapordaki zodyak etiketi doğru, ancak snapshot'taki `method.zodiac` alanı yanlış (9A-P2-01).

## 9. Test sonuçları

Testler sırayla çalıştırıldı; bellek sınırına yaklaşılmadı (boş bellek ≥6 GB). Hiçbir harness'te atlanan (skip) test yok.

| Paket | Toplam | Geçen | Kalan | Atlanan | Beklenen başarısızlık |
|---|---|---|---|---|---|
| astrology harness | 39 | 39 | 0 | 0 | — |
| routes | 21 | 21 | 0 | 0 | — |
| phase2 / 3 / 4 / 4.1 | 17 / 37 / 20 / 15 | hepsi | 0 | 0 | — |
| phase5 / 5.1 / 5.2 | 33 / 26 / 19 | hepsi | 0 | 0 | — |
| phase6 / 6.1 / 6.2 | 36 / 18 / 9 | hepsi | 0 | 0 | — |
| phase7a / 7b / 7c-silme | 18 / 16 / 13 | hepsi | 0 | 0 | — |
| perm7c (uzman yetkileri) | 16 | 16 | 0 | 0 | — |
| report8 (Word/PDF) | 72 | 72 | 0 | 0 | — |
| static | 15 | 15 | 0 | 0 | — |
| **Astroloji toplam** | **440** | **440** | **0** | **0** | — |
| PG migration senaryoları | 5 | 5 | 0 | 0 | 1 (7A çakışma: migration "ASTRO 7A:" ile durur, veri korunur — EXPECTED-FAIL PASS) |
| Eşzamanlı silme (bu denetim, scratchpad) | 20 | 20 | 0 | 0 | çeşitli DB ret kodları beklenen davranış |
| Bağımsız hesap doğrulaması (scratchpad) | 47 golden + 15 tz vakası | FAIL 0 | 0 | — | DOĞRULANAMADI listesi Bölüm 11 |
| Üye Yönetimi faz1 unit / route | 149 / 250 | hepsi | 0 | 0 | — |
| Üye Yönetimi faz2 unit / hub / entegrasyon | 106 / 46 / 119 | hepsi | 0 | 0 | — |
| auth-session P0 | 19 | 19 | 0 | 0 | — |

## 10. Bulgular

**P0: yok. P1: yok.**

### P2 — satış öncesi düzeltilmesi önerilen (4)

**9A-P2-01 · Vedik/KP analizlerinde kayıtlı yöntem "tropikal" olarak yazılıyor**

| Alan | Bilgi |
|---|---|
| Bileşen | Vedik 8 teknik, KP 5 teknik: snapshot ve kaydetme özeti |
| Dosya / satır | `lib/astrology/view/techniqueView.ts:197` (`method: { zodiac: "tropical", …}` tüm teknikler için); `lib/astrology/analyses/service.ts:393` (değişmez `method_snapshot.zodiac`'a yazılır), `:446` (önizleme `zodiac: "tropical"` sabit); `app/admin/astroloji/_components/AnalysisWorkspace.tsx:316` (kaydetme özeti "Tropikal") |
| Tekrarlama | Vedik D1 hesapla → "Kaydet" özetini aç → "Yöntem: Tropikal" görünür; kaydedilen satırda `method_snapshot.zodiac = "tropical"` |
| Beklenen | Vedik "sidereal (nirayana)", KP "sidereal (KP)" |
| Gerçek | "tropical" |
| Kanıt | Kod satırları (lider tarafından okundu); hesap doğru (Bölüm 4) |
| Öneri | `zodiac`'ı gelenekten türet (`zodiacLabel` ile aynı kural); UI özetini düzelt; eski snapshot'lar değişmez kalır, okuma tarafında teknikten türet |
| Risk | Hesap yanlış değil, ama uzman ekranında ve kayıtta yanlış yöntem adı görünür. Profesyonel güven ve belge doğruluğu riski. Word/PDF etkilenmez |

**9A-P2-02 · `engine/run` için süre bütçesi yok; uçuştaki istek kilidi en kötü çağrı süresinden kısa**

| Alan | Bilgi |
|---|---|
| Bileşen | Hesap motoru / Roxy maliyeti |
| Dosya / satır | `app/api/admin/astroloji/engine/run/route.ts` (`maxDuration` yok); `lib/astrology/config.ts:26` (zaman aşımı 20 sn), `:35` (inFlight 1 / 25 sn); `engine/service.ts:325`; birimler sırayla çalışır |
| Tekrarlama | Çok birimli seçim + yavaş sağlayıcı (zaman aşımı + 429 yeniden deneme ≈ 45 sn/birim) → 10 birimde ≈ 450 sn > platform varsayılanı (300 sn) |
| Beklenen | İş platform sınırı içinde biter veya kontrollü durur; aynı birim için ikinci ücretli çağrı olmaz |
| Gerçek | Fonksiyon kesilirse ücretlenmiş ama kaydedilmemiş çağrı kalabilir; 25 sn'lik kilit 45 sn'lik çağrıdan önce düştüğü için aynı hash ikinci kez çağrılabilir |
| Kanıt | Kod okuması; gerçek gecikme ölçülmedi (**ayrıca doğrulama gerekir**) |
| Öneri | Route'a `maxDuration` + çalıştırma başına toplam süre bütçesi; kilit ≥ en kötü çağrı süresi veya açıkça bırakılan kilit |
| Risk | Yoğun ya da yavaş günlerde gereksiz Roxy maliyeti ve kayıtsız hesap |

**9A-P2-03 · Profil, KB, not ve analiz yazımında uzman başına kota veya hız sınırı yok**

| Alan | Bilgi |
|---|---|
| Bileşen | Yazma uçları / Supabase kapasitesi |
| Dosya / satır | Hız sınırı yalnız `lib/astrology/http.ts` (Roxy) ve rapor route'unda; `kb/service.ts` (20 000 karakter/kayıt, sayı sınırsız), `profiles/service.ts`, `analyses/service.ts saveAnalysis` |
| Tekrarlama | Yetkili bir uzman döngüyle binlerce KB kaydı veya analiz oluşturur |
| Beklenen | Makul kota veya hız sınırı |
| Gerçek | Sınır yok. Ayrıca `kb_snapshot` 2 MB sınırını aşarsa kayıt 500 döner (koddan çıkarıldı, **çalıştırılarak doğrulanmadı**) |
| Kanıt | grep: yazma uçlarında rate limit / kota yok (lider doğruladı) |
| Öneri | Uzman başına yazma hız sınırı (mevcut `hitDbRateLimit`) + KB/profil kotası; KB snapshot boyut sınırı ve anlaşılır hata |
| Risk | Supabase Free kapasitesinin kötü niyetli ya da hatalı istemciyle doldurulması (bkz. kapasite notu 10-04) |

**9A-P2-04 · KP ruling: gözlem yeri doğum yerinden farklıyken natal significator için hangi konumun kullanıldığı belirsiz (doğrulama gerekir)**

| Alan | Bilgi |
|---|---|
| Bileşen | kp.ruling |
| Dosya / satır | `lib/astrology/providers/roxy/requests.ts:155-159`: `place` verilirse `latitude/longitude` = gözlem yeri, `timezone` = doğum ofseti, `birthDate/birthTime` = doğum; doğum koordinatı gönderilmez |
| Tekrarlama | Profil İstanbul doğumlu; ruling yerini New York seç → istek tek konum taşır |
| Beklenen | Ruling planets gözlem yerine, natal significator'lar doğum yerine göre hesaplanmalı |
| Gerçek | **Bilinmiyor.** Roxy'nin tek lat/lon'u her ikisi için kullanması olası; gün lordunun yerel tarih tabanı da kayabilir. Golden yalnız doğum yerinde |
| Kanıt | Kod; sağlayıcı davranışı gerçek çağrı olmadan doğrulanamaz |
| Öneri | Owner onayıyla tek bir kontrollü Roxy test çağrısı (toplam 47→48) veya Roxy belgesinden teyit; doğrulanana kadar ruling yerini doğum yeriyle sınırla ya da UI'da uyar |
| Risk | Farklı yer seçen KP uzmanına yanlış significator gösterilebilir. Varsayılan (doğum yeri) doğru |

### P3 — satış sonrasına bırakılabilir (19 + gözlemler)

| ID | Bileşen | Bulgu | Dosya / kanıt |
|---|---|---|---|
| 9A-P3-01 | Zaman seçenekleri | Transit, progression, solar arc, forecast ve KP anlarında yıl aralığı denetimi yok (0005 / 9999 kabul edilir, kota harcanır) | `techniques.ts` parseOptions |
| 9A-P3-02 | Önbellek | Profil silinince, hash ile paylaşılan önbellek satırları uzmanın diğer profillerinden de siliniyor (yeniden hesap maliyeti); `result_ids` içinde bayat kimlikler kalıyor. Snapshot'lar sağlam | Ek B/C |
| 9A-P3-03 | Eski `GET /results/[id]` | Maske istemci parametresiyle değiştirilebiliyor; UI bu ucu kullanmıyor, veri uzman kendi kaydı | Ek C F-06 |
| 9A-P3-04 | Adaptör yankıları | Natal tarih/saat/ofset/koordinat ve sinastri/kompozit `houseSystem`/`nodeType` yankısı istekle karşılaştırılmıyor; etiket istekten alınıyor | Ek C F-07 |
| 9A-P3-05 | KP "şimdi" | ruling/horary için "şimdi" UTC saat başı (UI'da belirtilmiş) | `techniques.ts:289` |
| 9A-P3-06 | Etiketler | Vedik Rahu/Ketu düğüm türü (ortalama) ve rapordaki Lilith "(ortalama)" notu yok | Ek C F-09 |
| 9A-P3-07 | Notlar | Batı natal/sinastri not bağlamı ev sistemini içermiyor | Ek C F-10 |
| 9A-P3-08 | Roxy istemcisi | HTTP-date biçimindeki Retry-After 2 sn sayılıyor | `client.ts` |
| 9A-P3-09 | Lunar return | Ay seçimi UTC ayına göre | Ek C F-12 |
| 9A-P3-10 | Oran limitleri | DB RPC hatasında bellek içi limite düşüyor; rapor limiti yalnız bellek içi ve instance başına | `http.ts`, rapor route'u |
| 9A-P3-11 | Teknik katman | Roxy'den gelen kısa adlar (panchanga adları, ACG `nodeEcho`) teknik katmanda | Ek C F-14 |
| 9A-P3-12 | Silme onayı | `confirmToken` imzasız, onay sayısını istemci bildiriyor; DB kilit kontrolü atlatmayı önlüyor (belgelenmiş tasarım) | `clients/deletion.ts` |
| 9A-P3-13 | Silme bayatlığı | Onaydan sonra yazılan çalışma notları bayatlık kontrolüne girmiyor ve silme ile birlikte siliniyor | Ek B S5b |
| 9A-P3-14 | Hata kodları | Yarış durumlarındaki DB retleri (40P01 / P0001 / 23503) API'de 500 olarak dönüyor | Ek B |
| 9A-P3-15 | Gövde boyutu | `readJsonBody` gövde boyutunu sınırlamıyor (platform sınırına güveniliyor) | `http.ts:16` |
| 9A-P3-16 | Danışan arama | Aday arama ve ön izleme uzman değil tenant kapsamlı (DY kuralıyla tutarlı; çok uzmanlı tenant varsa ürün kararı) | `clients/service.ts` |
| 9A-P3-17 | Eski RPC | Kullanılmayan `astro_analysis_save` (v1) service_role'e açık | migration 000100 |
| 9A-P3-18 | UNIQUE | `UNIQUE(tenant_id, save_request_id)` owner içermiyor (çakışma 500, sızıntı yok) | migration 000100/000300 |
| 9A-P3-19 | Progression | İlerletilmiş ASC/MC yöntemi (Naibod-RA) etiketlenmemiş; değer doğru | Ek A §2 |

**Gözlemler (bulgu sayılmadı):**
- Roxy'nin "kp-newcomb" adı klasik Krishnamurti ayanamsasına eşit; "291 AD / Newcomb" formülünden 0,085° farklı.
- Ashtakavarga indirgemesi iki yaygın kuraldan birine uyuyor (Mars/Akrep: 1 ve 0).
- Dasha takvim yılı yuvarlaması ≤0,89 gün.

## 11. Doğrulanamayan alanlar

1. **Hesap:**
   - Kiron
   - Shadbala sthana/kala/chesta/drik + ishta/kashta
   - Ashtakavarga Lagna tablosu
   - Jagradadi/Deeptadi avasthaları, 48 yoga listesi
   - Roxy'nin kendi skorları
   - >90 günlük forecast birleştirmesi
   - Relocation `angularPlanets` / `direction`
   - Roxy ve astronomy-engine'den hangisinin ark-saniye düzeyinde daha doğru olduğu
2. **Sağlayıcı (gerçek çağrı gerekir):**
   - 429/503 ücretlendirmesi
   - KP ruling konum kullanımı (9A-P2-04), horary tarih tabanı
   - Sinastri/kompozitte `houseSystem`'a uyum
   - Forecast `endDate`'in dahil olup olmadığı
   - Drishti, panchanga ve ruling çerçevesinin sabitliği
   - Koch / Equal desteği
   - 1550–2650 dışı tarihler
   - Gecikme dağılımı
3. **Platform:**
   - Prod PostgREST yetkileri (migration uygulanmadı)
   - Platform gövde boyutu sınırı
   - Çok instance'lı rapor limiti
   - Gerçek Vercel süre sınırının 9A-P2-02 üzerindeki etkisi
4. **Kötü niyetli metinle DOCX/PDF:** XML güvenliği `sanitizeXmlText` ve docx kütüphanesinin kaçışına dayanıyor; özel fuzz testi yapılmadı.

## 12. Satış öncesi zorunlu düzeltmeler (owner onayıyla Aşama 9B'de)

1. **9A-P2-01:** Zodyak etiketi gelenekten türetilmeli (snapshot yazımı + önizleme + kaydetme özeti; eski kayıtlar okumada düzeltilir).
2. **9A-P2-02:** `engine/run` süre bütçesi + `maxDuration` + kilit süresi ≥ en kötü çağrı süresi.
3. **9A-P2-03:** Yazma uçlarına uzman başına hız sınırı / kota + KB snapshot boyut sınırı.
4. **9A-P2-04:** Owner onaylı tek test çağrısıyla doğrulama. Doğrulanana kadar KP ruling yer seçimi doğum yeriyle sınırlanmalı veya UI'da uyarı gösterilmeli.

## 13. Production migration ve dağıtım riskleri

- **Migration'lar:** 000000–000500 prod'da yok. Sırayla uygulanmalı; 000300 çakışma koruması veri tutarsızlığında bilerek durur (önce prod veri ön kontrolü). Uygulama öncesi tam yedek, sonrası `has_table_privilege` / RLS / grant doğrulaması (anon/authenticated 0, SECURITY DEFINER search_path).
- **Ortam:** `ASTROLOGY_MODULE_ENABLED` yalnız tam "true" ile açılır; `ROXY_API_KEY` ve base URL HD modülüyle ortak, yani **kota da ortak**: Astroloji tüketimi HD'yi etkileyebilir.
- **Auth dosyaları:** Branch `lib/auth/**` dosyalarına Astroloji satırları ekliyor (7C). Diğer oturumun bildirdiği istisna gereği auth / session / env / proxy değişiklikleri **owner onayı olmadan prod'a alınmamalı**.
- **Paylaşılan dosyalar:** `next.config.ts` (font izleme 2 satır), `package.json` test zinciri, DY sayfasında 3 satır, `app/page.tsx` Hub kartı. Diğer modüllerle merge çakışması riski; merge öncesi `origin/main` ile yeniden taban ve tam regresyon gerekli (yerel `origin/main` ref'ine göre branch 3 commit geride, 53 commit önde).
- **Bellek / Vercel:** Rapor üretimi (resvg + docx/jsPDF) bellek ve süre tüketir; rapor route'u için `maxDuration` tanımlı değil (varsayılan 300 sn yeterli görünüyor, ölçülmedi).
- **Supabase kapasitesi:** Free planın sınırlarına yakın kapasite (10-04 notu) + 9A-P2-03.

## 14. Sonuç

**CONDITIONAL GO.**

- P0 ve P1 bulgu yok.
- 25 tekniğin hesapları bağımsız referanslarla, astrolojik toleransın çok altında doğrulandı (FAIL 0).
- İzolasyon, yorum güvenliği ve kalıcı silme bütünlüğü kod, test ve iki bağlantılı eşzamanlılık testiyle kanıtlandı.
- Satıştan önce 4 P2 kapatılmalı: 9A-P2-01 / 02 / 03 düzeltilmeli, 9A-P2-04 doğrulanmalı ya da sınırlandırılmalı.
- Ayrıca migration ve auth-dosyası dağıtımı için owner onayı gerekli.

Denetim burada durur. **Owner onayı olmadan Aşama 9B'ye veya düzeltmelere geçilmeyecek.**

---
Ekler: denetim sırasında üretilen ham kanıt tabloları (scratchpad'den kopyalandı; betikler `scratchpad\audit9a\` altında, depo dışı).

## Ek A — Bağımsız hesaplama doğrulaması (ham sonuçlar)

### Audit 9A — Independent verification of astrology calculations (Roxy goldens + app projection)

Repo: `C:\yasam-astrology-roxy`, branch `work/astrology-roxy`, HEAD `71344781` (read-only; no repo file modified, no git writes).
Runs used `env -u ROXY_API_KEY`; **no network/Roxy call was made** (only recorded fixtures were read).

## Reference environment
| Item | Value |
|---|---|
| Ephemeris reference | npm `astronomy-engine` **2.1.19** (repo node_modules) — `Ecliptic(GeoVector(body,t,true))` (true ecliptic/equinox of date, light-time + aberration), `EclipticGeoMoon`, `SiderealTime` (GAST), `e_tilt` (true obliquity, Δψ), `Horizon`, `SearchMoonPhase`, `SearchLunarEclipse`, `SearchGlobalSolarEclipse`, `SearchRiseSet`, `GeoMoonState` |
| Own formulas | ASC/MC from RAMC+ε; iterative Placidus (semi-arc trisection); osculating true node from Moon state vector; Meeus mean node (ch.47) and mean perigee (ch.50) for mean Lilith reduced to ecliptic with i=5.1454°; IAU-2006 p_A general precession for ayanamsa; Lahiri A0 = 23.250182778° − 0.004658035° @ JD 2435553.5 (+Δψ); KP (Krishnamurti) A0 = 22.363889° @ J1900 (+Δψ); Spica-based true Chitrapaksha (cross-check); BPHS Ashtakavarga bindu tables; Parashara varga rules; Vimshottari 120-yr table; KP 249-sub table built from Vimshottari proportions |
| Timezone | Node v24.15.0, ICU 78.2, tzdata **2026a** (Intl, brute-force minute scan, a different algorithm from the app's probe-offset method) + hard-coded tzdata facts |
| Scripts (scratchpad `audit9a\calc\`) | `dump.ts` (projects all 47 goldens via `getTechnique(id).units/project`), `tz.ts`, `ref.cjs`, `w_natal.cjs`, `w_all.cjs`, `prog2.cjs`, `prog3.cjs`, `vedic.cjs`, `av2.cjs`, `dasha_kp.cjs`, `extra.cjs`, `fc2.cjs`, `preserve.cjs`, `venus.cjs`; projected outputs in `proj\` |

Legend — **Roxy raw** = astronomical correctness of provider numbers; **Projection** = app keeps them unchanged; **Label** = method name/label correct. Verdicts: PASS / FAIL / DOĞRULANAMADI.

## 0. Projection integrity & determinism (all techniques)
| Check | Method | Result | Verdict |
|---|---|---|---|
| Unit body == recorded golden body | `def.units(ctx,opts)[i].body` JSON-equal to fixture `body`, endpoint equal | 46/46 goldens with body: equal (natal golden has no body) | PASS |
| Projection ok | `def.project(unit, raw, opts).ok` | 47/47 ok, 0 droppedValues, 0 unmappedFields | PASS |
| Determinism | project same raw twice (deep copy) → JSON-equal | 47/47 identical | PASS |
| Number preservation | every non-integer number in `technical` must exist in raw | all exact except: kp-chart/kp-horary/kp-planets-at longitudes re-normalised (max 5.7e-14°), local-space line points rounded to 4 dp (max 5.0e-5°) | PASS |

## 1. Birth time → UTC (lib/astrology/birth/timeResolution.ts)
Reference: Intl brute-force scan (tzdata 2026a) + hard-coded tzdata facts. Tolerance: exact.
| Case | App | Reference | Verdict |
|---|---|---|---|
| 1990-07-15 14:30 Europe/Istanbul (SYNTH_A) | 11:30Z, +3 (10800 s) → body `timezone:3` | +3 (Turkey DST 1990, EEST) | PASS |
| 1988-03-21 06:45 Istanbul (SYNTH_B, Ankara) | 04:45Z, +2 | +2 (DST began 27 Mar 1988) | PASS |
| 1967-10-21 07:30 Istanbul (X1) | 05:30Z, +2 | +2 | PASS |
| 1983-06-17 23:00 Istanbul (X2) | 20:00Z, +3 | +3 (Turkey std +03 1978-06-29…1984-11-01; DST 1983 only Jul31–Oct2) | PASS |
| 1983-08-10 12:00 Istanbul | +4 | +4 | PASS |
| 1990-03-25 01:30 Istanbul (spring gap 01:00→02:00) | `gap` (rejected) | gap | PASS |
| 1990-09-30 01:30 Istanbul (fall-back) | `ambiguous` (+3 / +2), earlier=+3 | same two instants | PASS |
| 2021-03-14 02:30 New York / 2020-11-01 01:30 NY / 2020-10-25 01:30 London | gap / ambiguous / ambiguous | same | PASS |
| Date boundary 1990-07-15 00:15 Asia/Kolkata | 1990-07-14T18:45Z | same | PASS |
| Date boundary 1990-01-01 00:30 Pacific/Auckland | 1989-12-31T11:30Z (+13) | same | PASS |
| LMT 1900-01-01 12:00 Istanbul | 10:03:04Z, +7016 s (=+1:56:56 IMT); decimal 1.948889 h (round-trip 0.0004 s) | IMT +1:56:56 | PASS |

## 2. Western — natal (SYNTH_A, golden roxy-natal-golden-2026-10-07.json) — computed by **Roxy**
| Check | Reference / settings | Tolerance | Max deviation | Verdict |
|---|---|---|---|---|
| Sun…Pluto (ex-Moon) longitudes | AE geocentric apparent, ecliptic of date | 0.05° | 0.00124° (Uranus) | PASS |
| Moon longitude | AE EclipticGeoMoon | 0.1° | 0.00015° | PASS |
| Retrograde flags / speeds | sign of AE finite-difference speed (±1 h) | sign; speed ±2% | 0 mismatches | PASS |
| Sign / degree-in-sign arithmetic | floor(λ/30), λ mod 30 | exact | 5.7e-14° | PASS |
| ASC / MC | RAMC = GAST·15 + λE, true ε | 0.1° | ASC 0.000026°, MC 0.000033° | PASS |
| Placidus cusps 1–12 | own iterative Placidus | 0.1° | 0.000033° | PASS |
| Body house placement | returned cusps | exact | 0 mismatches | PASS |
| True node (`nodeType:true`) | osculating node from Moon r×v | 0.05° | 0.00096° (mean node would be 0.748° off → it really is the true node) | PASS |
| South node = NN+180 | — | exact | 0 | PASS |
| Black Moon Lilith (mean apogee) | Meeus mean perigee+180° reduced to ecliptic via mean node, i=5.1454° | 0.05° | lon 0.0039°, lat 0.0004° | PASS |
| Part of Fortune (day) | ASC+Moon−Sun (day sect) | exact | 3e-14° | PASS |
| Vertex | ASC formula with RAMC+180°, colatitude | 0.05° | 0.000026° | PASS |
| Aspect angle/orb consistency (33) | recomputed separation | 1e-9 | 2.8e-14° | PASS |
| Aspect completeness (majors, orb ≤6°) | all pairs | — | 0 missing | PASS |
| Chiron | no ephemeris offline | — | — | DOĞRULANAMADI |
| Dignity labels | spot check (Mars♉ detriment, Jupiter♋ exaltation, Saturn♑/Pluto♏ domicile) | — | consistent | PASS (spot) |

## 3. Western — time-dependent / relational
| Technique (engine) | Check | Reference | Tol. | Max dev. | Verdict |
|---|---|---|---|---|---|
| Transit 2026-10-07T09:00Z (Roxy) | 10 planets | AE | 0.05° | 0.0052° (Venus, near inferior conj.) | PASS |
|  | Moon / true node / Lilith | AE / osc. node / Meeus | 0.1/0.05 | 0.00098° / 0.0015° / 0.0024° | PASS |
|  | 74 transit→natal aspects: angle/orb, applying flag | recomputed; applying = orb decreasing with transit speed | 1e-9 | orb 2.8e-14°, applying 0 mismatches | PASS |
| Secondary progression (Roxy) | elapsedYears | (target@birth-UT − birth)/365.242196 | 1e-6 y | implied year = 365.242196 d (tropical) | PASS |
|  | progressed instant = birth + elapsedYears days → 1990-08-20T17:02Z; progressedDate 1990-08-20 | day-for-a-year | — | consistent | PASS |
|  | progressed planets @ that instant | AE | 0.05° | 0.0013° (Moon 0.00023°) | PASS |
|  | progressed ASC/MC | Naibod in RA: RAMC_nat + 0.98564733°·years | 0.1° | MC 0.0001°, ASC 0.0002° (≠ chart cast at progressed instant: 85–89° off; ≠ solar-arc MC 166.77°) | PASS (method = Naibod-RA; app does not label the angle method) |
|  | house numbers | whole sign from progressed ASC | exact | 0/14 mismatches; app label `houseMethod: whole_sign_from_progressed_ascendant` (timing.ts:312) correct | PASS |
| Solar arc (Roxy arc; aspects **local yasam-arith**) | arc = progSun − natSun | AE Sun(prog instant) − AE Sun(birth) | 0.01° | 0.00013° (34.69169 vs 34.69156) | PASS |
|  | directed = natal + arc (16 points) | arithmetic | 1e-9 | 0 | PASS |
|  | local aspects (`yasam-arith-v1:major-aspects:orb-1deg`) | independent recompute (5 majors, orb ≤1°, 4-dp) | exact | 11/11 identical, 0 missing/extra | PASS |
| Solar return 2026 (Roxy) | return instant 2026-07-15T07:19:56 (+3) = 04:19:56Z | AE Newton solve Sun = natal Sun | 2 min | Δ 36.1 s (Roxy Sun − natal = 3e-9°; AE vs Roxy Sun 0.0004°) | PASS |
|  | chart planets / ASC / MC / Placidus (Istanbul & London) | AE + own Placidus | 0.05/0.1 | planets 0.0032°, ASC ≤0.0011°, cusps ≤0.0018°, houses 0 mism. | PASS |
| Lunar return 2026-10 (Roxy; date selection local AE) | return instant 14:43:22 (+3) | AE Newton solve Moon = natal Moon | 2 min | Δ 7.8 s; app expectedUtc 11:44 vs 11:43:22 | PASS |
|  | chart (Istanbul & London) | AE + Placidus | 0.05/0.1 | planets 0.0054°, ASC ≤0.0022°, cusps ≤0.0023° | PASS |
| Synastry (Roxy) | both natal sets | AE (B: 1988-03-21T04:45Z) | 0.05° | A 0.0012°, B 0.0018°; B ASC 0.00002° | PASS |
|  | 94 inter-aspects angle/orb | recomputed | 1e-9 | 5.7e-14° | PASS |
|  | houseInOtherChart (both directions) | own Placidus of other chart | exact | 0 mismatches | PASS |
| Composite (Roxy) | planets = shorter-arc midpoints | from synastry longitudes | 1e-9 | 5.7e-14° | PASS |
|  | ASC/MC = midpoint of natal ASCs/MCs; cusps = midpoints of cusps | own Placidus of A,B | 0.01° | ASC 0.00002°, MC 0.00002°, cusps 0.00002° | PASS (midpoint method, not derived-ASC) |
|  | composite houses & aspects consistency | recomputed | — | 0 / 5.7e-14° | PASS |
| Relocation NY (Roxy) | same instant: planets identical to natal | — | exact | 0 | PASS |
|  | ASC / MC / Placidus / Vertex for 40.7128N, 74.006W | own | 0.1° | 0.00003° | PASS |
|  | distanceKm | haversine R=6371.0088 | 0.1% | 8069.83 vs 8069.84 | PASS |
| Local space (Roxy) | azimuth / altitude of 10 planets | AE geocentric apparent → Horizon (no refraction) | 0.05° | az 0.0038°, alt 0.0008° (topocentric Moon would differ 0.96° → Roxy uses geocentric) | PASS |
|  | compass labels, aboveHorizon, line initial bearing = azimuth | 16-wind rose / great circle | exact | 0 / 2e-13° | PASS |
| Astrocartography (Roxy) | RA / Dec of 10 planets | AE of-date | 0.05° | RA 0.0012°, Dec 0.0019° | PASS |
|  | MC/IC lines (λ = RA − GAST) | own | 0.05° | 0.0013° | PASS |
|  | ASC/DSC lines (in mundo, H0 = acos(−tanφ tanδ)) | own | 0.1° | 0.015° | PASS |
|  | circumpolarBeyond = 90 − abs(δ) | own | 1e-4 | 0 | PASS |
| Forecast 2026-10-01…12-29 (Roxy) | 87 transit-aspect events: longitude exactness at event time | AE | 0.05° | 0.0057° | PASS |
|  | same, timing | root-solve with AE | — | median 0.46 min, p90 7.4 min, max 52 min (Venus opp. natal Moon 11-11, Venus 3 days from station → ill-conditioned; 0.005° Venus offset) | PASS (longitude-based) |
|  | 8 retrograde stations | AE speed root | 1 h | ≤ 0.27 h (Pluto), direction OK | PASS |
|  | 8 sign ingresses | AE | 1 h | ≤ 0.21 h (Venus retro) | PASS |
|  | 6 new/full moons + Moon sign | AE SearchMoonPhase | 5 min | ≤ 0.67 min; signs match | PASS |
|  | completeness (ingresses/stations/lunations) | AE 6-h scan | — | 0 missing | PASS |
|  | eclipses | AE: none in window (next solar 2027-02-06, lunar 2027-02-20); Roxy lists none | — | — | PASS |

Note (Roxy raw): in 2026 Roxy vs AE differs up to 0.0034–0.0054° for Venus/Saturn/Neptune (1990: ≤0.0012°). No single convention (no-aberration / geometric) explains it; it is inside astronomy-engine's own stated accuracy, so it cannot be attributed to either side at the arcsecond level; it is ~10× below any astrological tolerance.

## 4. Vedic (Lahiri) — computed by **Roxy**
| Check | Reference | Tol. | Max dev. | Verdict |
|---|---|---|---|---|
| Lahiri ayanamsa 1990-07-15T11:30Z | A0=23.250182778−0.004658035 @1956-03-21, IAU2006 p_A, +Δψ (true) → 23.728756 | 0.01° | 0.0000054° (Roxy 23.7287506). Pure ICRC A0 gives 23.733414 (0.0047°); Spica-180 true Chitra 23.71317 (0.0156°) | PASS |
| Lahiri 2026-10-07T09Z (Gochara implied: western transit − sidereal transit, 7 planets) | same formula 24.233300 | 0.01° | 24.2334 (4-dp rounding) | PASS |
| D1 sidereal = Roxy tropical − ayanamsa | arithmetic | 1e-9 | 0 | PASS |
| D1 vs AE tropical − own Lahiri (Rahu/Ketu = mean node+Δψ, Lagna) | AE + own | 0.02° | 0.0051° | PASS |
| Node type in Vedic D1 | Rahu trop 308.11068 = mean node+Δψ 308.11071 (true node 307.358) | — | 0.00003° | PASS (mean node) |
| Rashi, nakshatra index/name/pada, lord, ratio, "left" | 13°20′ / 3°20′ arithmetic, Vimshottari lord cycle | exact | 0/10 mismatches | PASS |
| Whole-sign houses; Baladi avastha | from Lagna; odd/even 6° bands | exact | 0 / 0 mismatches | PASS |
| Combustion (Jupiter 0.18° from Sun) | separation | 0.01 | 0.0018 | PASS |
| Varga D2,D3,D4,D7,D9,D10,D12,D16,D20,D24,D27,D30,D40,D45,D60 (15 charts × 9 grahas + Lagna) | own Parashara rules | exact sign | 0 mismatches; varga houses whole-sign from varga Lagna 0 mism.; projection sign/house 0 mism. | PASS |
| Drishti (Parashari whole sign; Mars 4/7/8, Jupiter 5/7/9, Saturn 3/7/10, nodes no drishti) | own | exact | 9/9, 0 missing/extra; mutual 3/3; app label `parashari_whole_sign` (vedic.ts:770) correct | PASS |
| Panchanga: tithi (23 Krishna Ashtami 51.99%), nakshatra (Revati p4), nitya yoga (7 Sukarma 61.75%), karana (half-tithi 46 → Kaulava 3.97%) | (Moon−Sun)/12°, (Sun+Moon)/13°20′, (Moon−Sun)/6° | exact | 0 | PASS |
| Ashtakavarga BAV Sun…Saturn | BPHS bindu tables, from sidereal D1 signs | exact | 7/7 identical; totals 48/49/39/54/56/52/39 | PASS |
| SAV | sum of 7 BAV | exact | identical, 337 | PASS |
| Lagna BAV | no single standard table | — | — | DOĞRULANAMADI |
| Trikona + Ekadhipatya shodhana | own; rule variant "unoccupied sign → 0 when partner sign occupied" | exact | 8/8 identical (the other common variant "reduce to occupied count" differs for Mars, Scorpio 1 vs 0) | PASS (variant) |
| Rashi/Graha/Shodhya pinda | gunakara 7,10,8,4,10,5,7,8,9,5,11,12 / 5,5,8,5,10,7,5 | exact | 8/8 identical | PASS |
| Shadbala naisargika, min required | 60·n/7; BPHS minima | exact | 7/7 | PASS |
| Shadbala dig bala | arc from weak point (IC/Desc/MC/Asc per planet)/3, cusp-based | 0.01 | 7/7 match to 0.01 | PASS |
| Shadbala sum, rupas, ratio, rank | arithmetic; rank = strengthRatio order | 0.01 | ≤0.01 virupa | PASS |
| Sthana, kala, chesta, drik bala; ishta/kashta | not implemented | — | — | DOĞRULANAMADI |
| Vimshottari balance at birth | (1 − frac)·17 y: 0.974299 y = 355.86 d | ≤1 d | Roxy 356 d (rounded to whole days) | PASS |
| Mahadasha dates (9, to 2094) | 365.25-d year from exact balance | ≤1 d | 0.89 d (Roxy convention: balance rounded to days, then calendar-year MD lengths — verified exact) | PASS |
| Antardasha / pratyantardasha | parent actual duration × years/120 | 1 min | 0.0 / 0.4 min (vs pure 365.25-d model: 57–210 min) | PASS |
| Gochara transit positions | AE − own Lahiri, nodes mean+Δψ | 0.02° | 0.0051° | PASS |
| Gochara natalHouse / houseFromMoon / drishti / kaksha lord & binduCount / aspect orbs | whole sign; BAV; recomputed | exact / 0.005 | 0 mismatches; orb 0.0048 (2-dp) | PASS |

## 5. KP — computed by **Roxy**
| Check | Reference | Tol. | Max dev. | Verdict |
|---|---|---|---|---|
| KP ayanamsa ("kp-newcomb") at 1967 / 1983 / 1990 / 2026 | Krishnamurti 22.363889° @ J1900 + IAU2006 p_A + Δψ | 0.001° | 0.000045 / 0.0001 / 0.00003 / 0.00014° | PASS (Roxy raw) |
|  | label: the numbers are the classical KP (Krishnamurti, SE_SIDM_KRISHNAMURTI-type) ayanamsa; the "VP291 / (Y−291)·50.2388″" formula would be +0.085° off | — | — | Label: acceptable (Roxy's own name), noted |
| KP 249-sub table | own build (27×9 Vimshottari subs, split at sign borders) | exact | 249 entries; #108 = 153.0000°–155.1111°, Sun star / Saturn sub | PASS |
| Sign/star/sub/sub-sub lords + kpNumber: kp-chart 12 cusps + 7 planets + 2 nodes, kp-horary 12 cusps + 9 planets, planets-at 2×9 | own table | exact | 0/62 mismatches | PASS |
| KP chart cusps / planets | AE Placidus − Roxy KP ayanamsa | 0.01° | cusps 0.00007°, planets 0.00055° | PASS |
| KP planet houses (cusp-based) | own | exact | 0 mismatches | PASS |
| Horary #108 → ASC = mid-span | (153+155.1111)/2 = 154.0556 | 1e-4 | 0 | PASS |
| Horary other cusps | Placidus re-cast from RAMC that yields horary ASC (standard KP horary) | 0.01° | 0.0004° | PASS |
| Horary / planets-at planets | AE − ayanamsa (nodes mean+Δψ) | 0.01° | 0.0053° (Venus) | PASS |
| Ruling planets (2026-10-07 12:00 +3; X1 2026-10-12 12:05 +2) | day lord = weekday of last sunrise (AE SearchRiseSet); Moon/Lagna sign, star, sub, sub-sub with own KP ayanamsa | exact | 0 mismatches; RP sets equal | PASS |
| Significators 4-level (12 houses) | L1 planets in star of occupants, L2 occupants, L3 planets in star of cusp-sign lord, L4 cusp-sign lord | exact | 12/12 houses identical | PASS |
| KP dasha (Moon 359.3324 sid): balance 310.90 d vs 311; MD dates vs 365.25 | as Vedic | ≤1 d | 0.85 d (1990), 0.51 d (X1), 0.83 d (X2) | PASS |
| KP antardashas (MD Moon) | proportional rule | 1 min | 0.00 min | PASS |
| KP dasha significator "strength score/grade" | provider-proprietary | — | — | DOĞRULANAMADI |

## DOĞRULANAMADI (with reason)
1. Chiron (all western charts) — no offline asteroid ephemeris in astronomy-engine.
2. Shadbala sthana/kala/chesta/drik bala, ishta/kashta phala — multi-component BPHS algorithm not re-implemented (only naisargika, dig bala, totals/ratio/rank checked).
3. Ashtakavarga Lagna-BAV — no single standard bindu table.
4. D1 jagradadi/deeptadi avasthas, 48-yoga list — not re-derived.
5. Provider-proprietary scores: aspect `strength`, forecast `significance`, synastry `compatibilityScore`, KP strength grade, pattern `tightness`.
6. Forecast >90-day merge (`mergeForecast`, app-local) — no multi-chunk golden.
7. Relocation `angularPlanets` / `direction` heuristics — not specified.
8. Sub-arcsecond adjudication Roxy vs astronomy-engine (≤0.0055° in 2026 for Venus/Saturn/Neptune) — both within their stated accuracy; cannot say which is closer to truth.

## FAIL
None.

## Ek B — Güvenlik ve veri bütünlüğü (ham sonuçlar)

### AUDIT 9A — Astroloji Güvenlik + Veri Bütünlüğü (salt okunur denetim)

Repo: `C:\yasam-astrology-roxy` · branch `work/astrology-roxy` · HEAD `71344781`. Repoda hiçbir dosya değiştirilmedi, commit atılmadı.
Prod'a, uzak bir DB'ye veya Roxy'ye bağlanılmadı (`env -u ROXY_API_KEY`). Testler yalnız yerel, geçici bir embedded-postgres üzerinde çalıştı.
Betik: `scratchpad/audit9a/sec/concurrency.mjs` · çıktı: `scratchpad/audit9a/sec/concurrency-output.txt`.

## Özet
- **P0: 0 · P1: 0 · P2: 1 · P3: 9** (bilgi notları ayrıca listelendi).
- Kimlik doğrulama ve izolasyonda bulgu yok:
  - Bütün 22 admin route'u ve 22 uzman yansıması ilk satırda `requireAstrologyAccess` çağırıyor.
  - Bütün servis sorguları `tenant_id` ile birlikte `owner_user_id` filtresi taşıyor.
  - Önbellek uzman başına ayrı; DB'de bileşik FK'ler aynı kuralı ikinci katman olarak zorluyor.
- Eşzamanlılık testi **20/20 PASS**. Veri kaybı, yetim satır ya da askıda kalma (hang) görülmedi. Ortak analizlerin snapshot'ı md5 ile birebir aynı kaldı.

## Saldırgan gözüyle doğrulananlar (kanıt)
| Konu | Sonuç | Kanıt |
|---|---|---|
| Uzman A, uzman B'nin profilini, revizyonunu, sonucunu, yorumunu, analizini, notunu veya KB kaydını istiyor (aynı ya da farklı tenant; tahmin edilmiş UUID) | 404 (yok) | Her sorgu `.eq("tenant_id").eq("owner_user_id")` taşıyor: `repo.ts:111-408`, `analyses/service.ts:171-178,626-632`, `kb/service.ts:97-100,134,186,212,234`, `clients/service.ts` (bağlı profiller). RPC'ler `p_owner_user_id` alıyor (000400/000500). Analiz notları (`analyses/service.ts:636`) yalnız tenant ve analysis_id ile okunuyor, ama owner süzgeçli analiz bulunduktan **sonra**. |
| Sağlayıcı önbelleği (`astro_provider_results`) uzmanlar ya da tenant'lar arasında paylaşılıyor mu? | **Hayır** | `UNIQUE(tenant_id, owner_user_id, input_hash)` (000300:117), eski tenant anahtarı DROP edilmiş (000300:120). Arama `findResultsByHashes` owner filtreli (`repo.ts:266-282`). Sonuç kimliği `resultIdFor(tenant, hash, userId)` ile üretiliyor (`engine/service.ts:364`). Yorum satırının FK'si `(tenant, owner, result_id)` (000300:144). Uzman B ne kimlikle ne hash ile A'nın sonucuna veya yorumuna ulaşabiliyor. |
| Modül yetkisi kapalıyken doğrudan API çağrısı | 404 | `ownerGate.ts:134-167`: `requireModuleAccess` her istekte DB'den okuyor (`userGuard.ts` `verifyUserRequest` → users SELECT, önbellek yok) ve `entitlements.module` kontrol ediliyor. |
| Roxy yorum yetkisi kapalı, eski snapshot'ta yorum var | İçerik dönmüyor | `getAnalysis` yorum kolonunu hiç SELECT etmiyor (`analyses/service.ts:623-625`). Liste bayrağı gizleniyor (`:613`). Rapor da `getAnalysis` üzerinden okuyor (`report/service.ts:27`). Teknik ve yorum projeksiyonları ayrı tiplerde (`model/*`). |
| Owner olmayan admin, demo hesap, kill switch | 404 | `resolveAstrologyOwner` (`ownerGate.ts:41-67`): `is_super_admin`, admin, aktif ve demo değil koşulları. `DEMO_DENIED_MODULE_KEYS` içinde `astrology` var (`moduleAccessCore.ts:97`). `ASTROLOGY_MODULE_ENABLED === "true"` kontrolü API'de (`ownerGate.ts:87,138`) ve iki layout'ta da var. |
| Alan denetimi (`unmapped`, tenant'sız sistem kaydı) | Yalnız owner | `unmapped/route.ts`: `ownerOnly: true`. |
| Rapor indirme başlıkları | Güvenli | `fileBase` = `asciiSlug` sonucu, yalnız `[A-Za-z0-9-]` (`report/model.ts:833-843,966`). Başlıklar: `no-store, private` ve `nosniff`. CRLF ya da `"` enjeksiyonu mümkün değil. |
| SQL enjeksiyonu / LIKE kaçışı | Güvenli | `astro_like_escape` ve `ESCAPE '\'` kullanılıyor (000400). Test: `%`, `_`, `\` ve `'; DROP…` → 0 sonuç; boş sorgu → 3 sonuç. |
| RLS, grant'ler, SECURITY DEFINER (embedded PG'de ölçüldü) | Güvenli | 9 `astro_*` tablosunun hepsinde RLS açık, policy yok. anon/authenticated için tablo grant'i ve fonksiyon EXECUTE yetkisi 0. Tek DEFINER fonksiyon `astro_profile_delete`; sabit `search_path=public, pg_temp`, yalnız service_role çalıştırabiliyor. service_role: `UPDATE astro_analyses` → 42501, `DELETE astro_birth_profiles` → 42501. |
| Danışan silindiğinde astro kayıtları | Korunuyor | 000300 FK'si `ON DELETE SET NULL (client_id)`. Test S7: 6 analizin 6'sı korundu, profillerde `client_id=NULL`. Danışan bağı tenant içinde tutuluyor: `astro_profile_set_client` danışanın tenant'ını kontrol ediyor, ayrıca bileşik FK `(tenant_id, client_id)` var. |
| Profil silme RPC'si ortak analizde neyi güncelliyor? | Yalnız iki bağ kolonunu | 000500:166-168 yalnız `partner_profile_id` ve `partner_profile_revision` alanlarını NULL yapıyor. Snapshot'lar için silme öncesi ve sonrası md5 parmak izi karşılaştırılıyor (000500:146-188). Test: snapshot birebir aynı. |
| confirmToken | İmzasız, ama bu durum güvenlik açığı değil | `deletion.ts:66-87` düz base64url JSON. Sahte token değerleri DB'de kilit altında gerçek değerlerle karşılaştırılıyor (000500:131-142). Yanlış bir sayı her zaman 40001 döndürüyor, değiştirilmiş kimlik ise 404. Tekrar gönderim (replay): silindiyse P0002, durum değiştiyse 40001. Bkz. P3-01. |

## Bulgular

### P2-01 — Kullanıcı başına kota ya da yazma hız sınırı yok (profil, KB, not, analiz)
- **Bileşen:** `lib/astrology/kb/service.ts`, `profiles/service.ts`, `analyses/service.ts` (save, notes). Rate limit yalnız Roxy çağrısında (`engine/service.ts:325-342`) ve raporda var.
- **Repro:** Yetkili bir uzman döngü içinde `POST /api/astroloji/kb` gönderiyor (her kayıt 20 000 karakter, sınırsız sayıda). Aynısı profiller ve analiz kayıtları için de yapılabiliyor.
- **Beklenen:** Makul bir üst sınır olması: uzman başına kayıt kotası ve/veya istek başına DB rate limit.
- **Gerçekleşen:** Kayıt sayısında sınır yok. Okuma tarafında sınırlar var (KB `MAX_LIST=2000`, sayfa 100).
- **Risk:** Supabase Free DB kapasitesi (memory: 128 MB / 500 MB) tek bir kötü niyetli ya da hatalı istemciyle doldurulabilir.
- **Yan etki (doğrulama gerekir):** Çok sayıda ve uzun KB kaydı aynı konulara eşleşirse `kb_snapshot` 2 MB CHECK sınırını aşar (`astro_an_size_chk`, 000100). Bu durumda analiz kaydı 500 `DB_ERROR` ile başarısız olur.
- **Öneri:** `hitDbRateLimit` ile uzman başına yazma kovası; KB, profil ve analiz sayısı için yumuşak kota; KB snapshot'ını boyuta göre kırpma ya da açık bir 413 hatası.
- **Go-live riski:** Orta. Yalnız yetkili ve ücretli uzmanlar bunu yapabilir.

### P3 bulguları
| ID | Bileşen | Dosya:satır | Bulgu | Öneri |
|---|---|---|---|---|
| P3-01 | Silme onayı | `deletion.ts:129` | `confirmations` (2 ya da 3) istemcinin kendi beyanı. Sunucu tek istekte `confirmations: 2` gönderen çağrıyı kabul ediyor; "iki ayrı Evet" yalnız arayüzde zorlanıyor. Token imzasız, ama durum DB'de yeniden doğrulandığı için yetki atlatma yok. Belgelenmiş tasarım (`deletion.ts:12`). | İsterseniz HMAC ve kısa TTL'li, tek kullanımlık nonce eklenebilir. Zorunlu değil. |
| P3-02 | Silme bayatlık kontrolü | 000500:131-142 | Onaydan **sonra** yazılan çalışma notları (`astro_expert_notes`) ve sağlayıcı sonuçları bayatlık kontrolüne girmiyor; profil ile birlikte sessizce siliniyor (test S5b: not=0, silme OK). `updated_ms` ms hassasiyetinde; aynı milisaniyede iki güncelleme teorik olarak ayırt edilemez. | Önizlemeye not sayısı eklenip p_expected'e dahil edilebilir. |
| P3-03 | Eşzamanlı silme hata eşlemesi | `deletion.ts:139-146`, `analyses/service.ts:489-491` | Yarış durumlarında DB doğru şekilde fail-closed çalışıyor, ama API **500 DB_ERROR** döndürüyor, 409 değil: deadlock `40P01` (S3b), bütünlük kontrolü `P0001 ASTRO_DELETE_SHARED_INTEGRITY` (S3), silinen profile analiz/sonuç kaydı `23503` (S1b/S1c/S5c). Silme mesajı doğru ("Hiçbir kayıt silinmedi"), kaydetme mesajı genel. | `40P01` ve `P0001` → 409 DELETE_STALE ("yeniden deneyin"); `23503` → 404 PROFILE_NOT_FOUND. |
| P3-04 | Rapor rate limit | `report/route.ts:42` | `checkRateLimit` bellek içinde ve instance başına; çoklu instance ya da soğuk başlangıçta sınır gevşiyor. | `hitDbRateLimit` kullanılmalı. |
| P3-05 | JSON gövde boyutu | `http.ts:335-343` | `req.json()` üst sınırsız (platform sınırı ~4.5 MB). Alan sınırları sonradan uygulanıyor (not ve KB 20 000, etiket 120/200, seçim ≤20, forecast `FORECAST_MAX_DAYS`). | `content-length` ön kontrolü (ör. 256 KB). |
| P3-06 | Danışan aday arama ve ön izleme | 000400 `astro_client_candidates`, `clients/service.ts` `getClientPreview` | Kapsam tenant düzeyinde, uzman düzeyinde değil. Aynı tenant'ta birden çok kullanıcı varsa (users.tenant_id tekil değil) diğer kullanıcının danışanlarının ad, doğum tarihi ve maskeli telefonu görülebilir. Danışan Yolculuğu'nun kendisi de tenant kapsamlı olduğundan tutarlı; demo hesap astrolojiye zaten kapalı. | Bilgi notu. Çok kullanıcılı tenant'lar varsa ürün kararı gerekir. |
| P3-07 | Eski RPC | 000100 `astro_analysis_save` (v1) | Kodda kullanılmıyor, ama service_role EXECUTE yetkisi duruyor. İçinde owner kontrolü yok; profil sahipliğini yalnız bileşik FK koruyor. | DROP edilmeli ya da REVOKE yapılmalı. |
| P3-08 | İdempotency anahtarı | 000100 `astro_an_request_key UNIQUE(tenant_id, save_request_id)` | Fonksiyon tekrar kontrolünü owner kapsamında yapıyor, kısıt ise tenant kapsamında. Aynı tenant'taki başka bir uzman aynı UUID'yi kullanırsa 23505 → 500 alır. Sızıntı yok. | UNIQUE'i `(tenant_id, owner_user_id, save_request_id)` yapmak. |
| P3-09 | `result_ids` dizisi | 000200 `result_ids uuid[]` | FK yok. Önbellek satırı (profil ya da karşı taraf silinince CASCADE) gittikten sonra kimlikler bayat kalıyor; `result_id` ise SET NULL oluyor. Kayıtlı analiz yalnız snapshot okuduğu için işlevsel etkisi yok. | Bilgi notu. |

### Bilgi notları (ürün kararı, bulgu değil)
- A&B ortak analizi **A'nın** kaydıysa, A silinince bu analiz A'nın kendi analizi sayılır ve silinir. Önizlemede "kendi analiz" sayısına dahil ediliyor.
- Korunan ortak analizler, silinen kişinin kayıt anındaki doğum verisini ve danışan adını snapshot'ta taşımaya devam ediyor. Arayüz bu işlemi KVKK kapsamlı silme olarak sunmuyor (000500 yorumu).

## Eşzamanlılık testi (yerel embedded-postgres 18, port 58000+, scratchpad veri dizini; sonunda silindi → `exists=false`)
Kurulum: BOOT rolleri → `astrology-fixture.sql` ve `astrology-7b-fixture.sql` → migration'lar 000000..000500 sırayla (hepsi OK) → seed.
- Seed: A, B ve C profilleri. Analizler: A natal, A&B sinastri (notlu, yorumlu, result_id dolu), B natal, B&A composite (notlu), C&B sinastri, C natal. Ayrıca B için bir çalışma notu.
- Her senaryo ayrı bir `CREATE DATABASE … TEMPLATE tpl` üzerinde çalıştı.
- İki ayrı `pg` bağlantısı kullanıldı (`SET ROLE service_role`, `statement_timeout=20s`). "blocked" = 700 ms içinde dönmedi.

| # | Senaryo | Sonuç |
|---|---|---|
| S1a | save_v2(B) açık tx + delete(B) eski onay | delete **bloklandı** (706 ms) → commit sonrası **40001 STALE**. B'nin 3 analizi korundu. Yetim satır 0. |
| S1a' | yeniden önizleme → delete(B) | `deleted_analyses=3, preserved_shared=2`. A&B ve C&B snapshot md5 birebir aynı, `partner=NULL`. A&B `result_id` → NULL (önbellek CASCADE). |
| S1b | delete(B) açık tx + save_v2(C, partner B) | save bloklandı → **23503** `astro_an_partner_fk`. Yeni satır yok, ortak snapshot birebir. Yetim 0. |
| S1c | delete(B) açık + save_v2(B) + read(B) | Okuma bloklanmadı (6 ms, MVCC eski görüntü). save bloklandı → 23503 `astro_an_revision_fk`. Sonuçta B analizi 0. Yetim 0. |
| S2 | aynı profil iki kez eşzamanlı silindi | İkincisi bloklandı → **P0002 NOT_FOUND**. Tek silme gerçekleşti. Yetim 0. |
| S3 (A→B) | delete(A) açık + delete(B) | İkincisi bloklandı → **P0001 SHARED_INTEGRITY** (parmak izi değişimi yakalandı, tam rollback). Yeni onayla tekrar → OK. C&B birebir. |
| S3 (B→A) | delete(B) açık + delete(A) | İkincisi → **40001 STALE**. Tekrar → OK. |
| S3b | delete(A) ‖ delete(B) yarış (autocommit) | 1033 ms: A OK, B **40P01 deadlock** (PG tespit etti; askıda kalma yok). Yetim 0, C&B birebir. |
| S4a | append_revision(B) açık + delete(B) eski onay | Bloklandı → 40001. `current_revision=2`. |
| S4b | delete(B) açık + append_revision(B) | Bloklandı → P0002 NOT_FOUND. |
| S5a | onaydan sonra arşivleme | 40001. |
| S5b | onaydan sonra yeni çalışma notu | Silme OK; not da silindi (→ P3-02). |
| S5c | delete(B) açık + sonuç INSERT(B) | Bloklandı → 23503 `astro_pr_revision_fk`. |
| S6 | toplu A+B, biri bayat | 40001, 3 profil de duruyor (kısmi silme yok). Geçerli onayla: 2 profil ve 4 analiz silindi, 1 ortak (C&B) korundu. |
| S7 | danışan DELETE | 6 analizin 6'sı korundu, `client_id` NULL. |

Toplam **20/20 PASS**. Kontrol edilen her durumda yetim satır sayısı 0:
- profilsiz analiz,
- askıda karşı taraf bağı,
- analizi olmayan not,
- profili olmayan revizyon, sonuç ya da çalışma notu.

En uzun bekleme yaklaşık 1 s (deadlock dedektörü). statement_timeout'a hiç ulaşılmadı.

## Doğrulanamayanlar
- Gerçek Supabase/PostgREST davranışı: migration'lar 000000–000500 prod'da **yok**. Grant/RLS sonuçları yalnız embedded PG'de ölçüldü; Supabase'in varsayılan `ALTER DEFAULT PRIVILEGES` etkisi prod'a uygulamadan önce `has_table_privilege` ile yeniden doğrulanmalı.
- Next route'ları çalışan sunucuda (HTTP düzeyinde) denenmedi; lead `test:astrology` ve `next build` çalıştırıyor. `verifyAdminRequest` iç mantığı ayrıntılı incelenmedi (mevcut ve önceden denetlenmiş kapı).
- DOCX/PDF üreticisinin kötü niyetli metinle (çok uzun not, kontrol karakterleri) davranışı ve bellek kullanımı test edilmedi.
- Platform gövde boyutu sınırı ve çoklu instance rate limit davranışı (P3-04, P3-05) yalnız koddan çıkarıldı.
- P2-01'deki `kb_snapshot` 2 MB taşması koddan çıkarıldı, çalıştırılarak denenmedi.

## Ek C — Envanter, 25 teknik ve Roxy entegrasyonu (ham sonuçlar)

### Astroloji modülü — salt-okuma denetimi (envanter, 25 teknik, Roxy entegrasyonu)

Repo: `C:\yasam-astrology-roxy` · dal `work/astrology-roxy` · HEAD `71344781`. Repoda hiçbir dosya değiştirilmedi, commit yapılmadı.
Gerçek Roxy çağrısı yapılmadı. Yerel kontroller (`tz.ts`, `sun.js` bu klasörde) yalnız saf fonksiyonları ve `scripts/astrology/fixtures/golden/*.json` dosyalarını kullandı; `env -u ROXY_API_KEY` ile çalıştırıldı.

---

## A) ENVANTER

| Bileşen | Dosyalar / servisler |
|---|---|
| Teknik kayıt defteri (25) | `lib/astrology/engine/techniques.ts` (TECHNIQUE_IDS :132, TECHNIQUES :996) |
| Planlayıcı / orkestrasyon | `engine/planner.ts` (parseSelections, buildPlan: covers + dedup + cache), `engine/service.ts` (plan/run/view/getResult, executeUnit :437) |
| Önbellek anahtarı | `engine/inputHash.ts` (sha256 canonical: provider+apiVersion+adapter+endpoint+lang+body[+query]); `resultIdFor` (tenant+owner+hash UUIDv5 tarzı) |
| Roxy entegrasyonu | `providers/roxy/client.ts` (HTTP), `requests.ts` (gövdeler), `natal.ts`, `timing.ts`, `location.ts`, `vedic.ts`, `kp.ts`, `shared.ts` (beyaz liste projeksiyonları) |
| Yapılandırma | `lib/astrology/config.ts` (kill switch `ASTROLOGY_MODULE_ENABLED==="true"`, `ROXY_API_KEY`, `ROXY_API_BASE_URL` yalnız https, timeout 20 sn, oran limitleri) |
| Yerel hesap | `engine/lunarReturnDate.ts` (astronomy-engine ile Ay dönüşü taraması/ikiye bölme — yalnız istek günü seçimi ve yanıt doğrulaması); solar arc açıları `timing.ts:362-372` ("yasam-arith-v1:major-aspects:orb-1deg"); `verify/kpSub.ts` (KP sub/sub-sub/numara tutarlılık denetimi, fail-closed); `verify/varga.ts` (BPHS varga denetimi, yalnız UI uyarısı); vedic.ts içi tutarlılık kontrolleri (nakshatra/pada, tithi/yoga/karana, drishti, ashtakavarga 337, shadbala BPHS) |
| Doğum verisi | `birth/profileInput.ts` (parseBirthData), `birth/timeResolution.ts` (IANA→UTC, gap/ambiguous/dst_choice), `birth/location.ts` (TR 81 il + dünya + GeoNames, dış API yok) |
| Profiller | `profiles/service.ts` (list/get/create/appendRevision), RPC `astro_profile_create` / `astro_profile_append_revision` |
| Kalıcılık | `persistence/repo.ts` (her sorguda tenant + owner_user_id; okumalarda `raw_response` seçilmez, RESULT_SAFE_COLUMNS :243) |
| Görünüm / maske | `view/techniqueView.ts` (maskTechnical, maskInterpretation, buildTechniqueView), `view/natalView.ts` |
| Kayıtlı analizler (snapshot) | `analyses/service.ts` (getWorkspace, saveExpertNote, previewAnalysis, saveAnalysis → `astro_analysis_save_v2`, listAnalyses, getAnalysis) |
| Sinastri / composite | techniques.ts pairTechnique :487; partner yükleme `engine/service.ts:319-356`; FK 000200/000500 |
| Uzman bilgi bankası ve notlar | `kb/service.ts` (tenant+owner, gelenek+konu anahtarı), notlar `analyses/service.ts:160-280` (context_key), `topics/*` |
| Danışan Yolculuğu bağlantısı | `clients/service.ts` (listProfilePage, setProfileArchived, searchClientCandidates, getClientPreview, link/unlink, getClientAstrologyStatus), `components/astrology/AstrologyClientStatus.tsx` (yalnız durum rozeti), `app/dashboard/clients/[id]/page.tsx` |
| Yetkiler | `access/ownerGate.ts` (requireAstrologyOwner / requireAstrologyAccess: /api/admin = katı owner, /api/astroloji = uzman), `access/entitlements.ts` (`astrology`, `astrology_provider_interp`), `lib/auth/modulePermissions.ts:41-44,68-69,92-93,116-117`, `lib/auth/moduleAccessCore.ts:33-34,57,97`, `lib/auth/moduleRouteRegistry.ts:40`, `lib/auth/routeModuleAccess.ts:90`, `lib/admin/userManagement.ts:127-230` (Üye Yönetimi anahtarları) |
| Harita çizimleri | `_components/NatalWheel.tsx` (yerel SVG), `VedicPanels.tsx` RoxyKundli (`@roxyapi/ui` 0.49.0 web bileşeni, yalnız `data` özelliği ile beslenir; anahtar/ağ yok) + `_lib/kundliLocalize.ts`, `KpPanels.tsx` (KpSouthChart), `WorldMap.tsx` (+ `_lib/worldMap110m.ts`), `report/wheelSvg.ts` + `report/chartPng.ts` |
| Word/PDF | `report/model.ts` (buildAstroReport), `report/docx.ts`, `report/pdf.ts`, `report/service.ts` (yalnız getAnalysis snapshot'ını okur, 0 Roxy çağrısı) |
| Arşivleme / kalıcı silme | `clients/service.ts` setProfileArchived; `clients/deletion.ts` (önizleme + 2/3 onay + confirmToken), migration `20271101000500_astrology_profile_delete.sql` (RPC `astro_profile_delete`, FOR UPDATE, kilit altında yeniden doğrulama, paylaşılan analiz parmak izi) |
| Alan denetimi | `audit/unmapped.ts` (yalnız owner), RPC `astro_unmapped_touch` |
| Migration'lar | `20271101000000…000500` (6 dosya; 000300–000500 prod'a uygulanmamış olarak işaretli) |

### API rotaları (`/api/admin/astroloji/**`; `/api/astroloji/**` aynı handler'ları yeniden dışa aktarır → uzman kapısı)

| Rota | Yöntem | Servis fonksiyonu |
|---|---|---|
| /access | GET | satır içi (entitlements, isOwner, providerConfigured) |
| /profiles | GET / POST | listAstroProfiles / createAstroProfile(resolveAstroLocation) |
| /profiles/[id] | GET / PATCH | getAstroProfileDetail / setProfileArchived |
| /profiles/[id]/revisions | POST | appendAstroRevision |
| /profiles/[id]/client | PUT / DELETE | linkProfileClient / unlinkProfileClient |
| /profiles/delete/preview | POST | previewProfileDeletion |
| /profiles/delete | POST | deleteProfiles |
| /engine/plan | POST | planAstrology (sağlayıcı çağrılmaz) |
| /engine/run | POST | runAstrology(realEngineDeps) |
| /engine/view | POST | viewCachedSelections (yalnız önbellek) |
| /results/[id] | GET | getAstrologyResult (eski uç; UI kullanmıyor) |
| /workspace | GET / POST | getWorkspace |
| /notes | PUT | saveExpertNote |
| /analyses | GET / POST | listAnalyses / saveAnalysis |
| /analyses/preview | POST | previewAnalysis |
| /analyses/[id] | GET | getAnalysis |
| /analyses/[id]/report | GET ?format=docx\|pdf | buildAnalysisReport (Android'de 403, bellek içi limit 20/dk) |
| /kb | GET / POST | listKb / createKb |
| /kb/[id] | GET / PATCH / DELETE | getKbEntry / updateKb / deleteKb |
| /clients/candidates | GET | searchClientCandidates |
| /clients/[id]/preview | GET | getClientPreview |
| /client-status | GET | getClientAstrologyStatus |
| /unmapped | GET / PATCH | listUnmappedAudit / classifyUnmappedAudit (`ownerOnly`) |

Hiçbir astroloji rotasında `maxDuration` tanımlı değil (bkz. F-03).

---

## B) 25 TEKNİK TABLOSU

Ortak noktalar (tüm teknikler):
- **Hesap:** Yerel efemeris yok; her teknik Roxy'de hesaplanır. Yerel matematik yalnız (a) lunar return gün seçimi/doğrulaması, (b) solar arc yönlendirilmiş→natal açılar, (c) doğrulama kontrolleri (hesap sonucu olarak gösterilmez).
- **Saat dilimi:** İstemci yalnız konum kimliği gönderir; IANA tz + koordinat sunucuda çözülür (`birth/location.ts:23`). Yerel saat→UTC çevirisi `timeResolution.ts:261`: ±36 sa yoklamasıyla aday ofsetler bulunur; **gap → 422 BIRTH_TIME_NONEXISTENT**, **ambiguous + auto → 422 + iki seçenek**, earlier/later açık seçim; LMT saniye hassasiyetiyle korunur. Roxy'ye **yerel tarih/saat + ondalık saat ofseti** gider (`requests.ts:332`, 6 ondalık), IANA adı gitmez. Yerel olarak doğrulandı: İstanbul 2016-03-27 03:30 gap, 2015-11-08 03:30 ambiguous (TR'nin ertelenmiş geri alması doğru), NY 2021 gap/ambiguous, Apia 2011-12-30 atlanan gün = gap, 1900 İstanbul LMT +1:56:56, 1600 Kolkata LMT.
- **Saat bilinmiyor:** 12:00:00 gönderilir; `requiresKnownTime` teknikleri TIME_REQUIRED ile engellenir (istek yapılmaz, `engine/service.ts:247`); diğerleri `maskTechnical` ile maskelenir (`techniqueView.ts:61`).
- **Determinizm:** Gövde parseOptions ile normalize edilir; "şimdi" = UTC saat başı (`techniques.ts:289`); hash = canonical JSON (`inputHash.ts:302`). Önbellek **tenant + uzman** kapsamlıdır (`repo.ts:266`, UNIQUE (tenant, owner, hash) 000300), TTL yok.
- **Çıktı:** Endpoint başına beyaz liste projeksiyon; zorunlu alan hatası → `ok:false` → 502 PROVIDER_INVALID_RESPONSE, hiçbir şey kaydedilmez (fail-closed). Bilinmeyen alanlar yalnız *yol* olarak `unmapped_fields` + `astro_unmapped_fields`'e yazılır; değeri kaydedilmez. Ham yanıt `raw_response`'a yazılır, hiçbir okuma yolunda seçilmez.
- **Yorum ayrımı:** Teknik ve yorum projeksiyonları ayrıdır; yorum ayrı tabloda tutulur ve yalnız `providerInterpretations` + önizleme kapalı değilse okunur.

| Teknik | Roxy uç noktası | Seçenek doğrulama (reddedilenler) | Yanıt doğrulama / etiket | Saat bilinmiyorsa | Not |
|---|---|---|---|---|---|
| western.natal | POST /astrology/natal-chart | houseSystem ∉ {placidus, whole-sign, equal, koch}; nodeType ∉ {true, mean} (`natal.ts:71`) | houseSystem + nodeType yankısı doğrulanır (`natal.ts:233-238`); **tarih/saat/ofset/koordinat yankısı yalnız aralık kontrolünden geçer, istekle karşılaştırılmaz** (F-07). Lilith = `"mean"` sabit (`natal.ts:405`) — golden ile doğrulandı (hız 0.1115°/gün, boylam 238.31 ≈ hesaplanan ortalama apoje 238.21) | evler, açılar (ASC/MC), noktalar, gezegen evleri ve gezegen yorumları maskelenir; Ay uyarısı | |
| western.transit | /astrology/transits | atUtc: `now` → UTC saat başı \| `YYYY-MM-DDTHH:MM` \| yerel tarih+saat+IANA (gap reddedilir, ambiguous → "earlier"); **yıl aralığı yok** (0005 kabul edilir) | transit gezegenleri ≥10 klasik; tz 0 + natal birthBody | natal ASC/MC hedefli açılar çıkarılır, özet yeniden sayılır, yorum filtrelenir | |
| western.forecast | /forecast/transits | startDate geçerli ISO (yıl aralığı yok), days 1..366 | ≤90 günlük parçalar, minSignificance 0, domain≠western atılır; birleştirmede tekrarlar ayıklanır; yorum katmanı yok | ASC/MC olayları çıkarılır | parça sonu dahil mi, doğrulanamaz |
| western.progression | /astrology/progressions | targetDate ISO (aralık yok), nodeType | targetDate yankısı; houseMethod "whole_sign_from_progressed_ascendant" — golden ile 14/14 doğrulandı | angles=null, ev=null; **yorum maskelenmez** (golden metinleri yalnız burç bilgisi içeriyor) | nodeType yankısı kontrol edilmiyor |
| western.solar_arc | /astrology/solar-arc | targetDate, nodeType | solarArc + directed ≥10; **yerel açılar**: majör 5 açı, orb ≤1°, yönlendirilmiş × natal (kendi natal konumu dahil) | yönlendirilmiş ASC/MC ve onlara ait açılar + yorumları çıkarılır | |
| western.solar_return | /astrology/solar-return | returnYear 1600–2600, houseSystem, returnLocationId regex | solarReturnYear, location (±1e-3), chart.houseSystem yankıları | TIME_REQUIRED | ofset her zaman doğum ofseti (requests.ts:353-363) |
| western.lunar_return | /astrology/lunar-return | month YYYY-MM (yıl 1600–2600), sequence 1\|2, houseSystem, konum | dönüş anı yerel beklenen değerle ±36 sa içinde olmalı; konum ve houseSystem yankısı | TIME_REQUIRED | ay **UTC ayıdır** (F-12) |
| western.synastry | /astrology/synastry | partnerProfileId UUID (aynı uzman, aynı profil olamaz), partnerRevision ≥1, houseSystem, nodeType | **houseSystem/nodeType yankısı kontrol edilmiyor**; etiket istekten alınıyor (F-07) | kişi bazında: ASC/evler/houseInOther maskelenir; yorum maskelenmez | |
| western.composite | /astrology/composite-chart | aynı | method "midpoint" — golden ile doğrulandı (Güneş 56.76 = kısa yay orta noktası); houseSystem yankısı yok | evler/açılar/gezegen evleri maskelenir | |
| western.astrocartography | /astrology/astrocartography?include=north-node,chiron,lilith | seçenek yok | nodeEcho saklanır (≤10 karakter) | TIME_REQUIRED | |
| western.relocation | /astrology/relocation-chart + natal karşılaştırma birimi | targetLocationId regex + sunucuda çözülür, houseSystem | hedef yankısı ±1e-3, houseSystem yankısı; zorunlu birim = 0 | TIME_REQUIRED | natal birim nodeType="true" sabit |
| western.local_space | /astrology/local-space?include=… | referenceLocationId boş ya da regex | referans koordinat doğrulaması | TIME_REQUIRED | |
| vedic.d1 | /vedic-astrology/birth-chart | ayanamsa ∉ {lahiri, raman, kp-newcomb, kp-old} → ret | frame.ayanamsa yankısı, nakshatra/pada/lord ↔ boylam, bütün-burç evleri | TIME_REQUIRED + tüm Vedik görünüm maskesi | Rahu/Ketu = **ortalama düğüm** (golden 284.382 ↔ ortalama 284.378); hiçbir yerde etiketli değil (F-09) |
| vedic.varga | /vedic-astrology/divisional-chart | division ∈ {2,3,4,7,9,10,12,16,20,24,27,30,40,45,60} | division + frame + chart.frame yankısı; D9 navamsa ↔ pada; vargottama; BPHS denetimi UI'da | TIME_REQUIRED | |
| vedic.dasha | /vedic-astrology/dasha/major \| /sub/{MD}[/{AD}] | md/ad yalnız küçük harfli 9 graha, AD için MD zorunlu | ayanamsaType, Ay nakshatra ↔ boylam, Vimshottari sırası/süreleri, doğum bakiyesi, ardışıklık | TIME_REQUIRED | |
| vedic.drishti | /vedic-astrology/aspects (+coordinateSystem sidereal) | Lahiri dışı → birim yok (LAHIRI_ONLY) | datetime = doğum anı; Parashari bütün-burç listesinin tamamı; frame sabit `{lahiri, null}` (yanıtta yankı yok) | TIME_REQUIRED | |
| vedic.ashtakavarga | /vedic-astrology/ashtakavarga | ayanamsa | frame yankısı, BAV toplamları, SAV=337, shodhya | TIME_REQUIRED | |
| vedic.shadbala | /vedic-astrology/shadbala | ayanamsa | frame yankısı, virupa/rupa, BPHS minimum ve naisargika değerleri, sıralama | TIME_REQUIRED | |
| vedic.panchanga | /vedic-astrology/panchang/basic | Lahiri dışı → birim yok | tithi/yoga/karana/nakshatra ↔ Güneş/Ay boylamı; **frame "lahiri" sabit, yankı yok** | TIME_REQUIRED | doğum anında hesaplandığı doğrulandı (sidereal Güneş 88.998 ↔ yerel 89.005; gün doğumunda 88.65 olurdu) |
| vedic.transit (Gochara) | /vedic-astrology/transit | Lahiri dışı → birim yok; atUtc normalizasyonu | frame=lahiri, birth/transitDatetime yankısı, drishti/kaksha/ev kontrolleri | TIME_REQUIRED | transit anı doğum ofsetinde yerel saat olarak gönderilir (tek tz alanı) |
| kp.chart | /vedic-astrology/kp/chart | ayanamsa ∉ {kp-newcomb, kp-old}; nodeType ∉ {mean, true} | meta yankısı (tarih/saat/konum/tz/ayanamsa/placidus), Placidus ev ↔ cusp, sub-lord/KP numarası (kpSub) | TIME_REQUIRED | |
| kp.dasha | dasha uçları + significators:true + nodeType | aynı + md/ad | vedic.dasha doğrulaması + significator düzeyleri | TIME_REQUIRED | |
| kp.ruling | /vedic-astrology/kp/ruling-planets | atUtc, nodeType, placeLocationId | datetime anı, konum yankısı, klasik 5 öğeli küme; frame "kp-newcomb" sabit (gövdede ayanamsa yok; dokümana göre dahili olarak doğrulanmış) | TIME_REQUIRED | **gözlem yeri ≠ doğum yeri olduğunda tek lat/lon gönderiliyor** (F-02) |
| kp.transit | /vedic-astrology/kp/planets-interval (15 dk, 2 nokta) | atUtc, ayanamsa, nodeType | ayanamsa yankısı | doğum verisi kullanılmaz, maskelenmez | KISMİ (natal ev analizi yok) |
| kp.horary | /vedic-astrology/kp/horary | horaryNumber 1–249 tam sayı, atUtc, ayanamsa, nodeType, yer | horaryNumber + ayanamsaType yankısı, Placidus kontrolü | doğum verisi kullanılmaz | tz 0 + UTC saat; varsayılan yer = doğum yeri |

**Gelenek ayrımı:** KB eşleşmesi `traditionOfTechnique` ile filtrelenir (`kb/service.ts:228`); not bölümü anahtarları `isSectionKeyForTechnique` ile doğrulanır; not bağlamı Vedik/KP için ayanamsa/düğüm/varga/dasha, konum teknikleri için konum, çiftler için karşı taraf bazındadır. Vedik Gochara Batı transit yönlerini bilinçli olarak dışarıda bırakır. İstisnalar: Batı natal/sinastri not bağlamı ev sistemini içermez (F-10); `method.zodiac` tüm geleneklerde "tropical" yazılır (F-01).

**Word/PDF ile kayıtlı veri tutarlılığı:** Rapor yalnız `getAnalysis` snapshot'ını kullanır. Zodyak etiketi teknik kimliğinden üretilir (`model.ts:889`, doğru). Yorum bölümü yalnız `interpretation.visible` ise yazılır. Natal Lilith için "(ortalama)" notu raporda yok (UI'da var: `NatalTechnicalPanel.tsx:74`). Vedik Rahu/Ketu düğüm türü hiçbir yerde belirtilmiyor. Snapshot'taki `method_snapshot.zodiac` Vedik/KP için yanlış ("tropical"); rapor bu alanı kullanmıyor ama veri kalıcı.

---

## C) ROXY ENTEGRASYONU

- **Base URL:** `https://roxyapi.com/api/v2` (`config.ts:168`); `ROXY_API_BASE_URL` ile değiştirilebilir, https dışı reddedilir (`config.ts:203-214`). HD modülüyle aynı env değişkenleri kullanılıyor (ayrı anahtar yok — owner kararı).
- **Anahtarın gizliliği:** `ROXY_API_KEY` yalnız sunucuda (`NEXT_PUBLIC_` yok; repoda NEXT_PUBLIC_ROXY bulunamadı). Anahtar yalnız `X-API-Key` başlığında gider (`client.ts:83`); hata sonucu `{kind, status, attempts}` taşır; sağlayıcının hata gövdesi okunmaz (`client.ts:95`); loglarda yalnız tür/durum/hash'in ilk 8 karakteri/şema hata dizgeleri bulunur (`engine/service.ts:482,489,493`). `/access` yalnız `providerConfigured` boolean döner. `import "server-only"` + `assertServerOnly`. `@roxyapi/ui` istemci bileşenleri yalnız `data` özelliğiyle beslenir, anahtar almaz.
- **Zaman aşımı / iptal:** 20 sn AbortController; fetch + `res.json()` aynı zamanlayıcının kapsamında (`client.ts:77-119`).
- **Yeniden deneme:** En fazla 1 kez ve yalnız 429/503 için; Retry-After ≤5 sn (sayı) ise, başlık yoksa 2 sn. Zaman aşımı, ağ hatası, 5xx ve 4xx yeniden denenmez (çift ücret riski nedeniyle). HTTP-date biçimindeki Retry-After 2 sn sayılır (F-11).
- **Hata eşlemesi:** 401/403→502 PROVIDER_CONFIG, 429/503→503 PROVIDER_BUSY, diğer 4xx→422 PROVIDER_REJECTED, 5xx/ağ→502, zaman aşımı→504, şema uyuşmazlığı→502 (kaydedilmez).
- **Uç nokta ve sorgu güvenliği:** Uç nokta regex beyaz listesinden geçer (`client.ts:131`); sorgu anahtarı `[a-z]{1,20}`, değeri `[a-z0-9,-]` olmalı, `lang` değiştirilemez.
- **Oran limitleri** (`http.ts:257` → `hitDbRateLimit`, HMAC'li kova): uçuştaki istek kilidi (tenant:uzman:hash) 1/25 sn → bekleyen istek 10×1.5 sn yoklar, sonra 409; kullanıcı 60/sa; tenant 300/gün. Limitler yalnız gerçek sağlayıcı çağrısından önce harcanır (önbellekten gelen sonuçlar saymaz). DB RPC hatası olursa instance başına bellek içi limite düşer (F-13).
- **Önbellek:** `astro_provider_results` (tenant, owner_user_id, input_hash) UNIQUE; deterministik satır kimliği eşzamanlı ikinci INSERT'i 23505 ile reddeder → yeniden okunur. TTL yok; zamana bağlı tekniklerde an anahtarın parçasıdır ("şimdi" saat başına yuvarlanır → saatte en fazla 1 çağrı). Projeksiyon sürümü önbellek aramasında filtrelenmez; eski satırlar eski teknik şemayla yeniden kullanılır, yorum `projection_version` eşleşmesiyle okunur.
- **Gereksiz çağrının önlenmesi:** Planlayıcı tekilleştirme (aynı hash tek birim) + kapsama budaması + önbellek; relocation'ın natal birimi aynı gövdeli western.natal sonucunu yeniden kullanır; eşik üstü (>10 yeni istek) için açık onay gerekir (`engine/service.ts:648`); plan/view uçları sağlayıcıyı çağırmaz. Birimler sırayla çalışır.
- **Yorum ve teknik ayrımı:** Beyaz liste projeksiyonu uygulanır; yorum alanları ayrı projeksiyonda tutulur (natal planet/aspect/pattern metinleri, transit yorumları, sinastri `meaning`, KP `houseThemes`, Vedik `keyTransits.description`…). Teknik katmanda Roxy'den gelen kısa adlar yine de var: panchanga tithi/yoga/karana adları, deity/symbol/element ≤40 karakter, ACG nodeEcho (F-14).
- **Yetki kaldırılınca yorum sızıntısı:** Entitlement her istekte DB'den çözülür; yetki yoksa yorum tablosu ve `provider_interp_snapshot` kolonu hiç okunmaz (`analyses/service.ts:622-625`), listede `providerInterpIncluded` false gösterilir, rapor yorumu atlar. `raw_response` hiçbir okuma yolunda seçilmez. Kod incelemesinde sızıntı yolu bulunamadı. Tek istisna: daha önce yüklenmiş istemci state'i sayfa yenilenene kadar ekranda kalır.
- **Eski snapshot'lar:** Snapshot değişmez; `versions_snapshot` sağlayıcı/adaptör/projeksiyon/şema sürümlerini taşır; rapor bilinmeyen yorum şemasında "desteklenmiyor" mesajı gösterir. Legacy natal `resultId` yolu yalnız western.natal için açıktır.

**Gerçek çağrı yapılmadan doğrulanamayanlar:** Roxy'nin 503 "compute_saturated" ve 429 yanıtlarında ücret düşüp düşmediği; Retry-After biçimi; kp.ruling'de gönderilen tek lat/lon'un natal significator için de kullanılıp kullanılmadığı ve gün lordunun hangi yerel tarihten hesaplandığı; kp.horary'de (tz 0) gün lordu/gün doğumu tarih tabanı; sinastri/composite'in `houseSystem` parametresine gerçekten uyup uymadığı (yankı yok); forecast `endDate`'in dahil olup olmadığı; drishti/panchanga/ruling çerçevesinin her yanıtta gerçekten Lahiri/KP-Newcomb olduğu (yalnız tek golden var); koch/equal ev sistemlerinin desteklenmesi (desteklenmiyorsa yankı denetimi fail-closed reddeder); 1550–2650 dışındaki tarihlerdeki davranış ve ücretlendirme; gerçek gecikme dağılımı.

---

## BULGULAR

P0 ve P1 düzeyinde bulgu yok. Bulgular kod ve golden fixture'lar üzerinden bulundu; "doğrulanamaz" diye işaretlenenler kesin hata değil, risk olarak kaydedildi.

### F-01 · P2 · Vedik/KP analizlerde zodyak "Tropikal" olarak etiketleniyor
- **Yer:** `lib/astrology/view/techniqueView.ts:197` (`method: { zodiac: "tropical", … }` tüm teknikler için); `lib/astrology/analyses/service.ts:393` (`methodSnapshot.zodiac = view.method.zodiac` → DB'ye yazılıyor), `:446` (önizleme özetinde `zodiac: "tropical"` sabit); `app/admin/astroloji/_components/AnalysisWorkspace.tsx:316` (sabit metin "Tropikal · …").
- **Yeniden üretme:** Bir profilde vedic.d1 veya kp.chart hesaplanır → "Analizi kaydet" önizlemesi açılır.
- **Beklenen:** "Sidereal (nirayana)" / "Sidereal (KP)".
- **Gerçekleşen:** Ekranda "Yöntem: Tropikal · ev sistemi yok…" görünür ve değişmez `method_snapshot.zodiac = "tropical"` olarak kalıcı yazılır. Rapor ve kayıtlı analiz listesi `zodiacLabel(technique)` kullandığı için o iki yerde etiket doğru.
- **Önerilen düzeltme:** `method.zodiac` değeri gelenekten türetilmeli (`zodiacLabel` / `traditionOfTechnique`); AnalysisWorkspace `zodiacLabel(s.technique)` kullanmalı; mevcut snapshot'lar okunurken bu alan yok sayılmalı ya da düzeltilmeli.
- **Canlıya çıkış riski:** Orta. Uzman kaydetmeden önce yanlış yöntem etiketi görür; kalıcı kayıtta yanlış metadata birikir.

### F-02 · P2 (doğrulanamaz) · KP ruling: gözlem yeri doğum yerinden farklı seçildiğinde tek konum gönderiliyor
- **Yer:** `lib/astrology/providers/roxy/requests.ts:466-470` (`kpRulingBody`: `latitude/longitude = place ?? doğum yeri`, `timezone = doğum ofseti`, `datetime` doğum ofsetinde, `birthDate/birthTime` var, doğum koordinatı yok); `engine/service.ts:305-317`; UI seçimi `_lib/techniques.ts:272`.
- **Yeniden üretme:** İstanbul doğumlu profil, kp.ruling, yer = New York.
- **Beklenen:** Ruling planet'ler (Lagna lordları, gün lordu) gözlem yerine ve oranın yerel tarihine göre; natal significator'lar ise doğum yerinin Placidus cusp'larına göre hesaplanmalı.
- **Gerçekleşen:** Roxy'nin elinde tek bir lat/lon var. Natal significator'lar büyük olasılıkla gözlem yerinin koordinatıyla kurulan bir "doğum haritasından" hesaplanıyor. Gün lordu (doc: gün doğumu esaslı) doğum ofsetinde ifade edilen yerel tarihe göre belirlenebilir; gece yarısına yakın saatlerde bu yanlış güne düşebilir. Golden çağrılar yalnız doğum yerinde yapıldı (`ASTROLOGY-PHASE6-PROGRESS.md:33`).
- **Önerilen düzeltme:** Gerçek bir test çağrısıyla Roxy sözleşmesi netleştirilmeli. Ayrı doğum koordinatı alanı yoksa: yer ≠ doğum yeri iken significator'lar gizlenmeli ya da ayrı bir kp.chart'tan alınmalı; datetime/timezone gözlem yerinin ofsetiyle gönderilmeli.
- **Canlıya çıkış riski:** Orta; yalnız kullanıcı farklı bir yer seçtiğinde ortaya çıkar.

### F-03 · P2 · `engine/run`'da maxDuration yok; sıralı yürütmenin en kötü süresi platform sınırını aşabilir
- **Yer:** `app/api/admin/astroloji/engine/run/route.ts` (maxDuration yok); `engine/service.ts:659-667` (birimler sırayla); `client.ts` (20 sn + ≤5 sn bekleme + 20 sn ⇒ birim başına ≤45 sn); `config.ts:184` (uçuştaki istek kilidi 25 sn).
- **Yeniden üretme:** Roxy yavaşken 10 yeni birimli (onay eşiği altında) bir çalıştırma (örn. 366 günlük forecast = 5 parça + birkaç teknik).
- **Beklenen:** Ya sınırlı toplam süre ya da kısmi sonuç.
- **Gerçekleşen:** En kötü durumda yaklaşık 450 sn. Platform fonksiyonu kesince istemci gövdesiz 504 alır; kesilme anında yürüyen sağlayıcı çağrısı ücretlenmiş ama kaydedilmemiş olabilir. Ayrıca 25 sn'lik kilit 45 sn'lik en kötü çağrıdan kısa: aynı hash'i 25 sn sonra yeniden gönderen ikinci bir istek ikinci bir ücretli çağrı başlatabilir.
- **Önerilen düzeltme:** `export const maxDuration` açıkça belirlenmeli; çalıştırma başına toplam süre bütçesi konmalı (bütçe aşılınca kalan birimler "sonra" olarak dönmeli); uçuştaki istek kilidi ≥ timeout×2 + retry (≥50 sn) olmalı ya da başarı/başarısızlıkta açıkça bırakılmalı.
- **Canlıya çıkış riski:** Düşük–orta (yalnız sağlayıcı yavaşlarsa; maliyet ve UX etkisi).

### F-04 · P3 · Zaman seçeneklerinde yıl aralığı denetimi yok
- **Yer:** `techniques.ts:289-303` (transit/vedic.transit/kp.*), `:363-367` (forecast startDate), `:387-391` (progression/solar_arc targetDate). Yalnız returns'te `yearOk` 1600–2600 var. `profileInput.ts:80-81` MAX_YEAR = 2100, ama yorum "bugün+1 yıl" diyor.
- **Yeniden üretme:** `parseOptions({atUtc:"0005-01-01T00:00"})` ve `targetDate:"9999-12-31"` kabul edildi (yerel `tz.ts` çıktısı).
- **Beklenen:** Sağlayıcı efemeris aralığı (1550–2650) dışında istek yapılmadan ret.
- **Gerçekleşen:** Ücretli olabilecek bir çağrı ve kota harcanır (4xx → 422; Roxy'nin bu durumda ne döndürdüğü doğrulanamaz). Gelecek tarihli doğum (≤2100) da kabul edilir.
- **Önerilen düzeltme:** Ortak bir `yearOk` kontrolü tüm tarih seçeneklerine uygulanmalı; doğum için üst sınır bugün+1 yıl olmalı.

### F-05 · P3 · Profil silinince, hash ile paylaşılan önbellek satırları başka profillerden de siliniyor
- **Yer:** `astro_pr_owner_fk` / `astro_pr_revision_fk` ON DELETE CASCADE (000300:131-135, 000000:188); önbellek profil-bağımsız (`inputHash.ts:266-269`). kp.transit/kp.horary gövdeleri doğum verisi içermediği için aynı doğum yerine sahip profiller arasında paylaşılır.
- **Yeniden üretme:** A ve B profillerinin doğum verisi aynı (ya da kp.horary'de aynı yer) → B, A'nın satırını yeniden kullanır → A silinir.
- **Gerçekleşen:** B'nin önbelleği kaybolur (yeniden hesap ve ücret); B'nin analizlerindeki `result_ids` dizisinde artık var olmayan kimlikler kalır (snapshot'lar sağlam, veri kaybı yok).
- **Önerilen düzeltme:** Davranış belgelenmeli ya da silmeden önce başka bir profil tarafından kullanılan satırlar bu profile yeniden bağlanmalı.

### F-06 · P3 · Eski `GET /results/[id]` ucu maskeyi üreten profile göre uyguluyor; istemci bunu değiştirebiliyor
- **Yer:** `engine/service.ts:612-631`.
- **Gerçekleşen:** Varsayılan maske, sonucu ilk üreten profilin revizyonuna göre uygulanır. `?profileId=&revision=` ile aynı uzmanın saati bilinen başka bir profili verilirse, öğlen 12:00 varsayımıyla hesaplanmış bir harita maskesiz (geçerliymiş gibi) görüntülenir. UI bu ucu kullanmıyor; veri aynı uzmana ait olduğundan gizlilik açığı değil, bütünlük sorunu.
- **Önerilen düzeltme:** Ucu kaldırmak ya da maskeyi satırın `input.time` değeri ve isteyen revizyonun birlikte değerlendirilmesine bağlamak.

### F-07 · P3 · Bazı adaptörlerde yöntem yankısı istekle karşılaştırılmıyor; etiket istekten alınıyor
- **Yer:** natal birthDetails tarih/saat/ofset/koordinat (`natal.ts:226-231`, yalnız aralık kontrolü); sinastri/composite `houseSystem`/`nodeType` (`timing.ts:559-616, 636-680`); progression/solar arc `birthDetails.nodeType`.
- **Risk:** Sağlayıcı bir parametreyi yok sayarsa sonuç yanlış yöntem etiketiyle kaydedilir. Vedik, KP, return ve relocation adaptörleri yankıyı doğruluyor; tutarlılık için bu adaptörler de aynısını yapmalı.

### F-08 · P3 · "Şimdi" = UTC saat başı (KP ruling ve horary için yöntemsel olarak zayıf)
- **Yer:** `techniques.ts:290-294`; UI "Şimdi (UTC saat başı)" diye açıkça belirtiyor (`TechniqueSelector.tsx:207`).
- **Etki:** Lagna yıldız/sub lordları dakikalar–saatler içinde değişir; ruling planet sonucu 59 dakikaya kadar geçmiş bir ana ait olabilir. Önerilen düzeltme: KP için dakika hassasiyeti (önbellek yine dakika başına).

### F-09 · P3 · Düğüm ve Lilith varyantı raporda/Vedik görünümde etiketlenmiyor
- Vedik D1/varga/dasha Rahu-Ketu = ortalama düğüm (golden ile doğrulandı); UI'da da raporda da belirtilmiyor. Natal Lilith = ortalama; UI'da "(ortalama)" var (`NatalTechnicalPanel.tsx:74`), Word/PDF'te yok (`report/model.ts:201-210`).

### F-10 · P3 · Batı natal ve sinastri not bağlamı ev sistemini içermiyor
- **Yer:** `analyses/service.ts:160-166`. Placidus natal için yazılan ev konusu notları Whole-sign natal çalışma alanında ve snapshot'ında da görünür (Vedik'te ayanamsa ayrımı var, burada yok).

### F-11 · P3 · HTTP-date biçimindeki Retry-After 2 sn sayılıyor
- **Yer:** `client.ts:59-64`. Sağlayıcı daha uzun bir bekleme istediği hâlde 2 sn sonra 1 kez yeniden denenir (en fazla 1 ek çağrı).

### F-12 · P3 · Lunar return ayı UTC ayı olarak hesaplanıyor
- **Yer:** `lunarReturnDate.ts:38-42`. Ay sınırına yakın dönüşler (örn. yerel 1 Kasım 01:00 +3 = UTC 31 Ekim) UTC ayına göre listelenir; UI'nın bunu belirttiği doğrulanmadı.

### F-13 · P3 · Oran limitleri DB hatasında instance başına belleğe düşüyor; rapor limiti yalnız bellek içi
- **Yer:** `lib/security/dbRateLimit.ts:50-54`, `analyses/[id]/report/route.ts:36`. Ücretli çağrı kovaları DB RPC hatasında fiilen gevşer. Ücretli kovalar için fail-closed tercih edilebilir.

### F-14 · P3 · Teknik katmanda Roxy'den gelen kısa adlar var
- panchanga tithi/yoga/karana `name`, deity/symbol/element (`vedic.ts:1016-1025`), ACG `nodeEcho`. Anlatı metni değiller, ama "teknik = yalnız kanonik kimlik" ilkesinin istisnaları.

### Gözlemler (bulgu sayılmadı)
- Arşivlenmiş profil engine'de hesaplanmaya devam ediyor (`loadProfileRevision` archived_at'a bakmıyor); ürün kararı olabilir.
- kp.horary'nin varsayılan değerlendirme yeri doğum yeri; KP'de soru soranın bulunduğu yer önerilir (UI'da seçilebiliyor).
- Saati bilinmeyen profillerde sinastri/composite/progression yorum metinleri maskelenmiyor; golden metinlerde ev bilgisi görülmedi, bu yüzden risk düşük.
- `@roxyapi/ui` sürümü sabit (0.49.0).
