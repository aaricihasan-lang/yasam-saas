# ASTROLOJİ AŞAMA 5 — İLERLEME KAYDI (Vedik/Jyotish)

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline` okuyun. Golden çağrı yapmadan önce
> `scripts/astrology/fixtures/golden/vedic-*.json` dosyalarını ve aşağıdaki çağrı kaydını kontrol edin.

- Başlangıç HEAD: `ca534a37` (temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Push / preview / merge / production: YOK.

## Alt aşamalar

| Alt aşama | Durum | Commit |
|---|---|---|
| 5A Envanter + harita kabiliyeti | ✅ tamam (`docs/astrology/phase5a-vedic-inventory.md`) | 5a910e06 + e0fce311 |
| 5B D1 çekirdek | ✅ tamam | d31d00ab |
| 5C Nakshatra/Pada | ✅ tamam | 4786c58a |
| 5D D9 + Varga | ✅ tamam | 94479fb2 |
| 5E Vimshottari Dasha | ✅ tamam | 3d856a50 |
| 5F Diğer Vedik teknikler | ✅ tamam | 779236fe |
| 5G KB / analiz / premium UI / kapanış | ✅ tamam — YEREL MÜHÜR | (5G commit) |

## Kararlar

- Harita: Roxy'nin MIT lisanslı `@roxyapi/ui` kundli/varga bileşeni (tam sürüm sabit), ham yanıt değil
  kendi teknik projeksiyonumuzdan kurulan nesneyle beslenir; self-fetch öznitelikleri kullanılmaz.
- Ayanamsa: lahiri (varsayılan, belge), raman, kp-newcomb, kp-old. custom kapalı.
- Vedik uçlarda timezone varsayılanı 5.5 → doğum ofseti her zaman açıkça gönderilir.
- Tüm Vedik teknikler TIME_REQUIRED.
- Graha Drishti (/aspects) ayanamsa almaz (Lahiri sabit) → yalnız Lahiri seçiliyken.

## Gerçek Roxy çağrı kaydı

| Alt aşama | Endpoint | Sayı |
|---|---|---|
| (önceki aşamalar) | — | 14 |
| 5B | /vedic-astrology/birth-chart (lahiri) → `vedic-d1.json` | 1 |
| 5D | /vedic-astrology/divisional-chart (division 9, lahiri) → `vedic-d9.json` | 1 |
| 5E | /vedic-astrology/dasha/major → `vedic-dasha-major.json` | 1 |
| 5E | /vedic-astrology/dasha/sub/Mercury (doğumdaki, kesilmiş MD) → `vedic-dasha-sub-md.json` | 1 |
| 5E | /vedic-astrology/dasha/sub/Moon/Rahu (bugünkü dönem, tam 9 PD) → `vedic-dasha-sub-md-ad.json` | 1 |
| 5F | /vedic-astrology/aspects (sidereal, Lahiri sabit) → `vedic-aspects.json` | 1 |
| 5F | /vedic-astrology/ashtakavarga (lahiri) → `vedic-ashtakavarga.json` | 1 |
| 5F | /vedic-astrology/shadbala (lahiri) → `vedic-shadbala.json` | 1 |
| 5F | /vedic-astrology/panchang/basic (Lahiri sabit) → `vedic-panchang.json` | 1 |

Toplam: **23** (Aşama 5: 9 — plan ≈9–10 içinde). yoga/detect golden'ı YAPILMADI (D1 aynı 48 denetimi taşır). Aşama 5 bütçe planı ≈ 9–10.

## Son test sonuçları

- 5F: astroloji 39/19/17/37/20/15/**phase5 32**/static 10 + PG PASS; tsc/eslint 0; build OK; bundle: raw/anahtar/hash 0,
  Roxy anlatıları (balaThemes "Konum gücü", nakshatra/karana characteristics) 0. Mutasyon mutate5f.cjs **7/7**.
  Bağımsız: drishti boylamları = D1 (≤1e-4°, uç 4 ondalık yuvarlar) ve açı=(n−1)×30°±orb; BAV toplamları BPHS + SAV=ΣBAV=337;
  Shadbala Σ6/rupa/oran/sıra; Panchanga D1 Güneş/Ay'ından: tithi 23 Krishna, nitya yoga 7 Sukarma, karana Kaulava.
  Tarayıcı: 4 teknik birlikte (4 istek), 4 panel; Ashtakavarga ızgarası + Shodhana sekmesi + Shodhya Pinda.

- 5E: astroloji 39/19/17/37/20/15/**phase5 26**/static 10 + PG PASS; tsc/eslint 0; build OK; bundle: raw/anahtar/hash 0,
  Roxy dasha anlatı cümleleri 0 (tek "Entelektüel" eşleşmesi başka modülün sabit metni). Mutasyon (mutate5.cjs): **14/14 yakalandı**
  (dasha sıra/bakiye/ardışıklık, D9 pada↔navamsa, vargottama, significance sızıntısı, not bağlamı ×2, uç regex'i,
  KB geleneği, Vedik saat maskesi, dasha büyük harf, D1 ayanamsa yankısı, varga↔D1 konu karışması).
  Tarayıcı: MD listesi (Chandra "şimdi"), doğum bakiyesi 0 y 11 ay 21 g, Mercury → AD (Satürn, kesilmiş) tembel;
  kapat/aç 0 istek (sahte Roxy günlüğü: yalnız 3 istek); "seçiciye aktar"; Moon/Rahu PD düzeyi (Budha "şimdi"),
  yorum katmanı + not bağlamı "ayanamsa lahiri · mahadasha moon · antardasha rahu"; 390 px yatay taşma yok.

- 5D: astroloji 39/19/17/37/20/15/**phase5 20**/static 10 + PG PASS; tsc/eslint 0; build OK; bundle taraması 0
  (significance metni bundle'da 0). D9 golden 0 bilinmeyen / 0 düşürülen. Bağımsız denetim: D9 rashisi =
  ⌊boylam×9/30⌋ mod 12 (10/10 nokta) ve pada↔navamsa; D1 boylamı/rashisi D1 golden'la aynı.
  Tarayıcı: <roxy-divisional-chart> Kuzey/Güney/Doğu; başlık/sekme gizli; Mars satırı → Ashwini 3. pada → navamsa İkizler;
  Roxy yorum paneli D9 "Bölümün anlamı" + D1 graha/bhava/yoga açıklamaları; önizleme açıkken içerik YOK.

- 5C: astroloji 39/19/17/37/20/15/**phase5 13**/static 10 + PG PASS; tsc/eslint 0; build OK; bundle taraması 0.
  Tarayıcı: Nakshatra & Pada bölümü (Janma = 27. Revati 4. pada, Budha); 10 satır + Vimshottari yönetici grupları;
  not 'bağlam: ayanamsa lahiri' ile kaydedildi ve yeniden açılışta geri geldi (0 sağlayıcı isteği); Raman seçilip
  sahte Roxy Lahiri döndürünce adaptör REDDETTİ, sonuç kaydedilmedi (fail-closed).

- Aşama 4.1 kapanışı (ca534a37): astroloji 39/19/17/37/20/15/10 + PG PASS.
- 5B: astroloji 39/19/17/37/20/15/**phase5 11**/static 10 + PG PASS; tsc 0; eslint 0; next build OK;
  bundle taraması raw_response/ROXY_API_KEY/astro_analyses/calcInputHash/input_hash = 0.
- 5B tarayıcı (yerel sahte backend, gerçek Roxy YOK): Kuzey/Güney/Doğu kundli çizimi; graha satırı → ayrıntı
  (rashi/bhava/nakshatra/pada/yönetici/oran/avastha); Vedik KB kaydı UI'dan oluşturuldu
  (graha_in_rashi:moon:pisces) → Chandra ayrıntısında eşleşti; kayıtlı sonucu açma 0 sağlayıcı isteği;
  kundli bileşeni dış ağ isteği 0; 390 px: sayfa yatay taşma yok (tablo kendi kabında kayar).

## 5C kararları

- Not bağlamı: `TechniqueDefinition.noteContext` (kanonik "ayanamsa:lahiri"; 5D/5E'de varga/dasha eklenecek).
  Sunucu metni parseOptions ile yeniden türetip doğrular → deterministik uuid (`vedicContextKey`, konumdan ayrı
  ad alanı). Migration gerekmedi (context_key CHECK uuid kabul ediyor). Kayıtlı analiz kendi bağlamının notunu taşır.
- Nakshatra özeti yeni hesap YAPMAZ; Roxy nakshatra nesnelerini aynen kullanır. Bağımsız boylam denetimi testte.
- Ek golden çağrı: 0.

## 5D kararları

- Teknik `vedic.varga` (seçenek division: D9 varsayılan; Roxy belgesindeki 2,3,4,7,9,10,12,16,20,24,27,30,40,45,60).
  D1 ayrı teknik; sonuç/önbellek/not/KB ayrı. Not bağlamı `ayanamsa:x|division:n`.
- Yalnız D9 golden'la doğrulandı; diğer bölümler aynı uç + aynı şema; genel tutarlılık denetimleri (bölüm/ayanamsa yankısı,
  ev, kutu, vargottama) uygulanır, bölüme özgü bağımsız formül denetimi YOK (yalnız D9 için pada↔navamsa).
- HATA BULUNDU+DÜZELTİLDİ: `d9_*` konu türleri DB CHECK'ini (tür adında rakam yok) geçmezdi → `navamsa_*`.
  Sahte depo artık astro_kb_topic_chk'yi de taklit eder; tüm Vedik anahtarların DB regex'ine uyduğu test edilir.
- division.significance = sağlayıcı anlatısı → yalnız yorum katmanı; harita verisine verilmez.
- Yorum paneli Vedik D1/Varga şemalarını çizer (önceden "tanınmıyor"a düşüyordu).

## 5E kararları

- `vedic.dasha` seçenekleri {ayanamsa, mahadasha?, antardasha?}; her düzey AYRI birim/sonuç/önbellek; uç yalnız
  beyaz listedeki yönetici adlarından (`dashaEndpoint`, belgelenmiş enum yazımı "Mercury"). significators GÖNDERİLMEZ
  (varsayılan false; KP kapsam dışı) — gelirse bilinmeyen alan (yalnız yol).
- İstemci uç regex'i büyük harfe genişletildi (`/^\/[a-zA-Z0-9\-/]{1,120}$/` + "//" reddi); ilk deneme yerelde
  reddedilmişti (deneme 0 — gerçek çağrı YOK, maliyet yok).
- Tembel alt düzey: aynı /engine/run (planlayıcı + önbellek + yorum kapısı); KB eşleşmesi /workspace (sağlayıcı çağrısı yok).
  Kayıtlı analizde alt düzey yüklenmez (0 istek kuralı) — "çalışma alanında açın".
- Tarihler sağlayıcının yerel (doğum ofseti) metni; yeniden hesaplanmaz. Bağımsız denetimler: doğum bakiyesi
  (1−oran)×yıl ±0.003 y, kanonik oranlar, ardışıklık, üst dönem sınırları, Ay boylamı = D1 Ay.
- Bilinen sınır: alt dönem drill'i yalnız golden'ı olan yollarda yerel sahte Roxy'de çalışır (gerçek ortamda her yol çağrılır).

## 5F kararları

- yoga/detect AYRI teknik değil: D1 yanıtı aynı 48 yoga denetimini (present + evidence) taşıyor → golden yok, D1 yoga bölümü yeterli.
- Graha Drishti: Roxy derece+orb yöntemi (bütün-burç rashi drishti değil) — UI'da açıkça yazılı; kendi drishti motorumuz YOK.
  /aspects ve /panchang ayanamsa almaz → `lahiriOnlyTechnique`: Lahiri dışında birim YOK (0 istek) + açık neden (NO_UNIT).
- Ashtakavarga konusu yok (yorum eşiği uygulanmaz; renk yalnız göreli). Shadbala konuları BPHS asgari oranına göre
  (`shadbala_above_min` / `below_min`). Panchanga konuları `panchanga_tithi:n`, `panchanga_nitya_yoga:n`, `panchanga_karana:id`.
- Yeni bağlamlar: vedic_drishti, vedic_strength (Shadbala + Ashtakavarga), vedic_panchanga.
- Ortak `formatDegree` düzeltmesi: dakika yuvarlama → KESME (29°59.5′+ "30°00′" gösteriyordu; Güneş 28°59.85′ "29°00′" idi).
  Tüm fazların testleri geçti.
- Transit (Gochar) bu aşamada YOK (zamana bağlı; brief "doğrulanırsa"; bütçe korunsun).

## Açık hatalar

- Yok. (5B sırasında bulunan ve düzeltilen: başlıkta "undefined" ev sistemi [whole_sign Batı etiket
  tablosunda yoktu] → `houseSystemLabel`; kayıtlı analizde sabit "Tropikal" → `zodiacLabel`; KB editörü
  geleneği sabit "western" gönderiyordu → anahtardan türetiliyor; Konu seçici/KB filtresi Vedik bağlamları
  içermiyordu → eklendi; kundli bileşeninin kendi İngilizce başlık/sekmesi gizlendi [hide-sections].)
- Not: Roxy yoga "quality" alanı (ör. Chandra Mangala = Negative) sağlayıcı sınıflandırmasıdır; UI'da
  "Roxy sınıfı" olarak etiketlenir, kendi yorumumuz değildir.

## Sıradaki kesin adım

Aşama 5 kapandı (yerel mühür). **DUR** — Aşama 6 (KP) için owner onayı beklenir.

---

# AŞAMA 5 — NİHAİ RAPOR (2026-10-08)

**Durum: YEREL MÜHÜR (P0/P1/P2 = 0).** Vedik Transit bilinçli olarak dışarıda bırakıldı (madde 26) — tamamlanmış gibi gösterilmez.

1. **Başlangıç / final commit:** başlangıç `ca534a37` (Aşama 4.1). Aşama 5 commitleri: 5a910e06 (5A) · e0fce311 (5A static) ·
   d31d00ab (5B) · 4786c58a (5C) · 94479fb2 (5D) · 3d856a50 (5E) · 779236fe (5F) · **5G = bu commit** (SHA sohbet raporunda).
2. **Alt aşamalar:** 5A envanter + harita kararı · 5B D1 Rashi (kundli, ayrıntı, yoga) · 5C Nakshatra/Pada + ayanamsa not bağlamı ·
   5D D9 + D2…D60 · 5E Vimshottari MD→AD→PD (tembel) · 5F Graha Drishti, Ashtakavarga, Shadbala, Janma Panchanga ·
   5G KB/konu seçici tüm Vedik bağlamlar, kayıtlı analiz KB anlık görüntüsü, görsel/mobil tur, regresyon, mutasyon, rapor.
3. **Roxy Vedik envanter:** `docs/astrology/phase5a-vedic-inventory.md` (uçlar, alanlar, yorum alanları, ayanamsa, timezone=5.5 tuzağı).
4. **Hazır harita araştırması:** Roxy `@roxyapi/ui` (MIT, Lit web bileşenleri) `<roxy-vedic-kundli>` (Kuzey/Güney/Doğu) ve
   `<roxy-divisional-chart>` (D2–D60) sunar; self-fetch yalnız data-endpoint/publishable-key ile — KULLANILMADI.
5. **Seçilen çözüm:** `@roxyapi/ui@0.49.0` (tam sürüm), yalnız kendi TEKNİK projeksiyonumuzdan kurulan veriyle beslenir
   (ham yanıt/anlatı yok; `hide-readings` + başlık/sekme/details gizli; dış ağ isteği 0 ölçüldü). Bileşen tıklama olayı
   yaymadığı için ayrıntı + Bilgi Bankam bağlantılı teknik tablodan açılır. İkinci harita motoru YAZILMADI.
6. **D1:** `/vedic-astrology/birth-chart` whitelist adaptörü; tutarlılık: frame ayanamsa, rashi↔boylam, nakshatra/pada/lord↔boylam,
   bütün-burç ev, 12 kutu↔meta. Bağımsız astronomi: graha ≤2.1″, Lagna 1.2″, ayanamsa 23.7288°, Rahu = ORTALAMA düğüm.
7. **Ayanamsa:** lahiri (belge varsayılanı), raman, kp-newcomb, kp-old; custom kapalı. Önbellek anahtarında, snapshot'ta ve not
   bağlamında. /aspects ve /panchang ayanamsa ALMAZ → bu iki teknik yalnız Lahiri (başka ayanamsada 0 istek + açık neden).
8. **Nakshatra/Pada:** Janma nakshatra, 10 nokta tablosu (sıra/pada/ilerleme/yönetici yeri), Vimshottari yönetici grupları;
   bağımsız boylam→nakshatra/pada/oran denetimi. Konular graha_in_nakshatra, graha_nakshatra_pada, lagna_nakshatra.
9. **D9 + Varga:** `vedic.varga` (D9 varsayılan; 2,3,4,7,10,12,16,20,24,27,30,40,45,60). D9: pada↔navamsa ve ⌊boylam×9/30⌋
   bağımsız; vargottama listesi D1/varga rashileriyle. **D2–D60 yalnız yapısal denetimli** — UI'da açık uyarı (madde 26).
10. **Vimshottari:** major / sub/{md} / sub/{md}/{ad}; sıra (kesilmişse döngü soneki), ardışıklık, kanonik oranlar, üst sınırlar;
    bağımsız doğum bakiyesi (1−oran)×yıl ±0.003 y. Zaman çizelgesi + "bugün", tembel drill (önbellek → tekrar 0 istek), "seçiciye aktar".
11. **Diğer:** Graha Drishti (Roxy derece+orb yöntemi, açıkça etiketli), Ashtakavarga (BAV/SAV=337/Shodhana/Shodhya Pinda),
    Shadbala (Σ6, rupa, BPHS asgari, sıra), Janma Panchanga (tithi/nitya yoga/karana Güneş-Ay'dan bağımsız). Yogalar D1'de (48 denetim;
    yoga/detect ayrı golden gereksiz).
12. **KB taksonomisi:** gelenek `vedic` (DB CHECK'te vardı; migration YOK). Bağlamlar: vedic_d1, vedic_varga, vedic_dasha,
    vedic_drishti, vedic_strength, vedic_panchanga. Tür adları rakamsız (DB regex) — `d9_*` hatası bulundu → `navamsa_*`.
    Konu seçici + KB filtresi Vedik grupları; KB editörü geleneği anahtardan türetir.
13. **Uzman notları:** `TechniqueDefinition.noteContext` → `ayanamsa[:…]|division|mahadasha|antardasha` kanonik metni; sunucu
    parseOptions ile yeniden türetip doğrular → deterministik uuid (konumdan ayrı ad alanı). Lahiri≠Raman, D1≠D9≠D10, MD≠PD.
14. **Kayıtlı analiz:** v2 snapshot (teknik, normalize seçenek, ayanamsa/bölüm/dasha yolu, sürümler, not, KB, yorum yetkiye bağlı);
    açmak 0 istek; Vedik görünümde KB eşleşmesi anlık görüntüden; kayıtlı dashada drill yok. Başlık tarihi Europe/Istanbul (düzeltildi).
15. **Cache/planner:** her Vedik birim kendi inputHash'i (uç + gövde: ayanamsa, bölüm, dasha yolu); D1/D9/Dn/MD/AD/PD ayrı sonuç;
    tekrar 0 istek (harness + tarayıcı günlüğü). Tek seçimli drill eşik altında.
16. **Bilinmeyen saat:** TÜM Vedik teknikler TIME_REQUIRED (Lagna/bhava/pada/varga/dasha/panchanga saate bağlı); saat uydurulmaz;
    görünüm katmanında ayrıca maske.
17. **Teknik/yorum:** yorumlar (rashi/nakshatra/bhava/yoga açıklamaları, division.significance, dasha interpretation, balaThemes,
    characteristics) YALNIZ yorum katmanında; yetkisiz/önizlemede yanıtta bile yok (harness + tarayıcı). Bilinmeyen alan → yalnız yolu.
    Not: brief Shadbala bileşen açıklamalarını teknik sayılabilir diyor; daha sıkı seçenek olarak yorum katmanında tutuldu.
18. **Güvenlik/tenant:** owner-only kapı, uniform 404, kill switch korunuyor; kayıtlı analiz başka tenant'a 404; anahtar/ham yanıt/hash
    bundle'da 0; dasha uçları yalnız beyaz liste yönetici adlarından; istemci uç regex'i büyük harfe genişledi + "//" reddi.
19. **Görsel kalite:** Kuzey D1 + Güney D1 + Kuzey D9 ekran görüntüsüyle incelendi (yerleşimler tablo ve bağımsız denetimle aynı;
    Lagna belirgin; kalabalık ev okunur). Doğu düzeni yalnız çizim doğrulandı (görsel ayrıntı incelemesi yapılmadı — P3).
    Dasha/Ashtakavarga/Shadbala/Panchanga panelleri incelendi; 390 px'te 7 Vedik sekmede sayfa taşması yok.
    Kusurlar: bileşen etiketleri İngilizce kısaltma (Su/Mo, PI/AR) — kütüphane `lang=tr` çevirmiyor (P3).
20. **Bağımsız doğrulamalar:** astronomy-engine (D1), D9 iki yoldan, dasha bakiyesi + oranlar, Ay boylamı D1=dasha=panchanga,
    drishti boylamları=D1 (≤1e-4°), panchanga D1 Güneş/Ay'ından, Ashtakavarga BPHS sabitleri, Shadbala BPHS sabitleri.
21. **Testler:** astroloji 39/19/17/37/20/15/**phase5 33**/static 10 + PG PASS; tsc 0; eslint 0; next build OK; bundle taraması 0.
    Diğer: infra 43/0, admin-hygiene 55/0, HD Roxy 220/0 + info-panel 65/0, output-visibility 205/0; faz1-p3 94/4 ve backup 53/1
    ÖNCEDEN VAR OLAN, astroloji dışı (session-security RPC, route envanteri — astroloji route'u yok —, schema.generated senkronu).
22. **Mutasyon:** mutate5 14/14 + mutate5f 7/7 = **21/21 yakalandı** (ilk turda yakalanamayan "yalnız sıra" mutasyonu için test eklendi).
23. **P0/P1/P2/P3:** P0 0 · P1 0 · P2 0 · P3: (a) kütüphane İngilizce kısaltmaları, (b) Doğu düzeni görsel incelemesi yok,
    (c) D2–D60 bağımsız formül doğrulaması yok (UI uyarılı), (d) drishti Roxy derece/orb yöntemi (rashi drishti değil; etiketli),
    (e) yerel sahte Roxy'de drill yalnız golden yollarında çalışır (ürün etkisi yok).
24. **Yeni gerçek Roxy çağrıları (Aşama 5): 9** — vedic-d1, vedic-d9, dasha major, dasha sub/Mercury, dasha sub/Moon/Rahu,
    aspects, ashtakavarga, shadbala, panchang/basic. Endpoint başına 1; tekrar yok; anahtar loglanmadı. (dasha sub ilk denemesi
    yerelde reddedildi — deneme 0, gerçek çağrı/maliyet yok.)
25. **Genel toplam:** **23** gerçek Roxy çağrısı (Aşama 0–4.1: 14; Aşama 5: 9).
26. **Açık eksikler:** Vedik Transit (Gochar) YAPILMADI (zamana bağlı, ayrı doğrulama + golden gerekir) · D2–D60 bağımsız doğrulama ·
    Doğu düzeni görsel inceleme · kütüphane Türkçe etiket desteği yok · KP yok (kapsam dışı).
27. **Production/main/push:** DEĞİŞMEDİ — push yok, preview yok, main merge/rebase yok, production deploy/migration/SQL yok,
    yeni ücretli servis yok; diğer worktree'lere dokunulmadı. Yeni migration YOK.
28. **Aşama 6 (KP) önerisi:** KP ayanamsa (kp-newcomb/kp-old) zaten destekli; Roxy KP uçları envanteri (cusp/sub-lord/significator,
    ruling planets), dasha `significators=true` KP katmanı (şu an kapalı), Placidus cusp'ları, 249 sub-lord tablosu tutarlılık
    denetimi, KP KB geleneği (`kp` DB CHECK'te var), horary (1–249) ayrı teknik; aynı golden disiplini (uç başına 1).
