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
| 5E Vimshottari Dasha | ✅ tamam | (5E commit) |
| 5F Diğer Vedik teknikler | ⏳ sırada | — |
| 5G KB / analiz / premium UI / kapanış | ⏳ | — |

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

Toplam: **19** (Aşama 5: 5). Aşama 5 bütçe planı ≈ 9–10.

## Son test sonuçları

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

## Açık hatalar

- Yok. (5B sırasında bulunan ve düzeltilen: başlıkta "undefined" ev sistemi [whole_sign Batı etiket
  tablosunda yoktu] → `houseSystemLabel`; kayıtlı analizde sabit "Tropikal" → `zodiacLabel`; KB editörü
  geleneği sabit "western" gönderiyordu → anahtardan türetiliyor; Konu seçici/KB filtresi Vedik bağlamları
  içermiyordu → eklendi; kundli bileşeninin kendi İngilizce başlık/sekmesi gizlendi [hide-sections].)
- Not: Roxy yoga "quality" alanı (ör. Chandra Mangala = Negative) sağlayıcı sınıflandırmasıdır; UI'da
  "Roxy sınıfı" olarak etiketlenir, kendi yorumumuz değildir.

## Sıradaki kesin adım

5F: D1 yoga denetimi (48) zaten var → /yoga/detect gerekli mi belgeden karar (gereksizse golden YOK). Sonra Graha Drishti
(/aspects, yalnız Lahiri), Ashtakavarga, Shadbala — her biri sözleşme → en fazla 1 golden → adaptör/teknik/UI/test → commit.
Panchanga yalnız sözleşme uygunsa.
