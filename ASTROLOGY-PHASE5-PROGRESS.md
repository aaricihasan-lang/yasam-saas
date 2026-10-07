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
| 5D D9 + Varga | ✅ tamam | (5D commit) |
| 5E Vimshottari Dasha | ⏳ sırada | — |
| 5F Diğer Vedik teknikler | ⏳ | — |
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

Toplam: **16**. Aşama 5 bütçe planı ≈ 9–10.

## Son test sonuçları

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

## Açık hatalar

- Yok. (5B sırasında bulunan ve düzeltilen: başlıkta "undefined" ev sistemi [whole_sign Batı etiket
  tablosunda yoktu] → `houseSystemLabel`; kayıtlı analizde sabit "Tropikal" → `zodiacLabel`; KB editörü
  geleneği sabit "western" gönderiyordu → anahtardan türetiliyor; Konu seçici/KB filtresi Vedik bağlamları
  içermiyordu → eklendi; kundli bileşeninin kendi İngilizce başlık/sekmesi gizlendi [hide-sections].)
- Not: Roxy yoga "quality" alanı (ör. Chandra Mangala = Negative) sağlayıcı sınıflandırmasıdır; UI'da
  "Roxy sınıfı" olarak etiketlenir, kendi yorumumuz değildir.

## Sıradaki kesin adım

5E: Vimshottari — önce sözleşme (major / sub/{md} / sub/{md}/{ad}); fixture kontrolü; en fazla 3 golden (major, sub-md,
sub-md-ad; md/ad gerçek major listesinden). Tembel yükleme (Mahadasha → Antardasha → Pratyantardasha), zaman çizelgesi UI,
konular dasha_*, not bağlamı ayanamsa|dasha yolu; bağımsız denetim: süreler (120 yıl oranları) ve Janma nakshatra bakiyesi.
