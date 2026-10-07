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
| 5C Nakshatra/Pada | ✅ tamam | (5C commit) |
| 5D D9 + Varga | ⏳ sırada | — |
| 5E Vimshottari Dasha | ⏳ | — |
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

Toplam: **15**. Aşama 5 bütçe planı ≈ 9–10.

## Son test sonuçları

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

## Açık hatalar

- Yok. (5B sırasında bulunan ve düzeltilen: başlıkta "undefined" ev sistemi [whole_sign Batı etiket
  tablosunda yoktu] → `houseSystemLabel`; kayıtlı analizde sabit "Tropikal" → `zodiacLabel`; KB editörü
  geleneği sabit "western" gönderiyordu → anahtardan türetiliyor; Konu seçici/KB filtresi Vedik bağlamları
  içermiyordu → eklendi; kundli bileşeninin kendi İngilizce başlık/sekmesi gizlendi [hide-sections].)
- Not: Roxy yoga "quality" alanı (ör. Chandra Mangala = Negative) sağlayıcı sınıflandırmasıdır; UI'da
  "Roxy sınıfı" olarak etiketlenir, kendi yorumumuz değildir.

## Sıradaki kesin adım

5D: önce fixture kontrolü (`vedic-d9.json` yok) → tek golden (/vedic-astrology/divisional-chart, division 9, lahiri) →
D9 adaptörü + teknik `vedic.varga` (division seçeneği; not bağlamı ayanamsa|division) → pada→navamsa bağımsız denetimi
(D1 pada ile D9 rashi uyumu) → `<roxy-divisional-chart>` veya kundli → testler → commit.
