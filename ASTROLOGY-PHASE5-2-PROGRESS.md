# ASTROLOJİ AŞAMA 5.2 — SON VARGA DOĞRULAMASI (Vedik)

- Başlangıç HEAD: `07ff99e4` (Aşama 5.1 yerel mühür; temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Owner onayı (2026-10-08): 13 doğrulanmamış varga için bölüm başına en fazla 1 gerçek sentetik Roxy çağrısı (üst sınır 13).
- Push / preview / merge / production deploy / migration / başka worktree: YOK. KP: YOK (ayrı onay).

## Gerçek Roxy çağrı kaydı

| Çağrı | Endpoint | Gövde | Sonuç |
|---|---|---|---|
| 13 × 1 | POST /vedic-astrology/divisional-chart | sentetik kişi A (1990-07-15 14:30 İstanbul, +3), Lahiri, division = 2, 3, 4, 7, 10, 12, 16, 20, 24, 27, 40, 45, 60 | 13/13 OK → `fixtures/golden/vedic-d{n}.json` |

- D9 (Aşama 5D) ve D30 (Aşama 5.1B) zaten golden'lı → yeniden çağrılmadı. Yeniden deneme kapalı, tekrar yok, anahtar kaydedilmedi.
- **Yeni gerçek çağrı: 13 · Genel toplam: 25 → 38.**

## Harita bazında sonuç

Yöntem: her golden yanıtı (1) ürünün kendi adaptöründen geçirildi (bölüm/ayanamsa yankısı, D1 boylamı ↔ nakshatra/pada, ev ↔ varga
Lagna'sından bütün-burç, 12 kutu ↔ meta, vargottama), (2) `lib/astrology/verify/varga.ts` BPHS Parashari kuralıyla Lagna + 9 graha
(10 nokta) bağımsız karşılaştırıldı, (3) D1 boylamları Vedik D1 golden'ıyla eşlendi.

| Varga | Yöntem (Parashari, BPHS) | Adaptör | BPHS (10 nokta) | Düz bölmeye karşı ayırt edicilik | Sonuç |
|---|---|---|---|---|---|
| D2 Hora | tek: Aslan→Yengeç, çift: tersi | temiz | 10/10 | 9/10 | **PASS** |
| D3 Drekkana | 1-5-9 | temiz | 10/10 | 9/10 | **PASS** |
| D4 Chaturthamsa | 1-4-7-10 | temiz | 10/10 | 8/10 | **PASS** |
| D7 Saptamsa | tek: aynı / çift: 7. | temiz | 10/10 | özdeş (*) | **PASS** |
| D9 Navamsa (5D) | element başlangıcı | temiz | 10/10 | özdeş (*) | PASS (önceden) |
| D10 Dasamsa | tek: aynı / çift: 9. | temiz | 10/10 | 8/10 | **PASS** |
| D12 Dwadasamsa | aynı burçtan | temiz | 10/10 | 9/10 | **PASS** |
| D16 Shodasamsa | Koç/Aslan/Yay | temiz (düzeltme sonrası, aşağıda) | 10/10 | özdeş (*) | **PASS** |
| D20 Vimsamsa | Koç/Yay/Aslan | temiz | 10/10 | özdeş (*) | **PASS** |
| D24 Chaturvimsamsa | tek: Aslan / çift: Yengeç | temiz | 10/10 | 10/10 | **PASS** |
| D27 Bhamsa | ateş Koç, toprak Yengeç, hava Terazi, su Oğlak | temiz | 10/10 | özdeş (*) | **PASS** |
| D30 Trimsamsa (5.1B) | eşit olmayan 5/5/8/7/5 | temiz | 10/10 | 9/10 | PASS (önceden) |
| D40 Khavedamsa | tek: Koç / çift: Terazi | temiz | 10/10 | 8/10 | **PASS** |
| D45 Akshavedamsa | Koç/Aslan/Yay | temiz | 10/10 | 9/10 | **PASS** |
| D60 Shashtiamsa | aynı burçtan sayım | temiz | 10/10 | 9/10 | **PASS** |

**PASS: 13/13 yeni (15/15 toplam) · FAIL: 0 · DOĞRULANAMADI: 0.**

(*) Yöntem notu: D7, D9, D16, D20, D27'de Parashari kuralı "Koç'tan düz sayım"la **matematiksel olarak özdeştir** (0–360° taramayla
test edildi; ör. D16: 16s ≡ 4s mod 12 → hareketli/sabit/çift = Koç/Aslan/Yay). Bu bölümlerde ayırt edilecek rakip hatalı yöntem yoktur;
golden'ın 10/10 uyumu doğrudan doğrulamadır. Diğer 10 bölümde golden, düz bölmeden 8–10/10 noktada ayrışır (ayırt edici kanıt).
Hiçbir bölümde ekol farkı (cyclic hora, Jagannatha drekkana vb.) gözlenmedi — Roxy tüm bölümlerde Parashari kuralını uyguluyor.

## Bulgu ve düzeltme

- **D16 golden:** Roxy, Lagna vargottama olduğunda (D1 Terazi = D16 Terazi) `vargottama` listesine **"Lagna"** da koyuyor. Adaptör listeyi
  yalnız grahalardan bekliyordu → doğru bir değer "düşürülen değer" olarak raporlanıyor ve Lagna vargottaması denetlenmiyordu.
  Düzeltme: "Lagna" kabul edilir; listede Lagna varsa D1/varga rashisi gerçekten aynı olmalı (çelişki → ret). Tek yönlü: listede yokluğu
  reddedilmez (sağlayıcı kuralı tek örneğe dayanıyor). Kullanıcıya görünen bir hata yoktu (Lagna vargottaması teknikte zaten hesaplıydı) — P3.
- Uyarı kaldırma: `VARGA_GOLDEN_CONFIRMED` artık 15 bölümün tamamı; test her biri için golden dosyasının gerçekten var olduğunu doğrular
  (kanıtsız teyit eklenirse test düşer). Arayüzde her varga haritası **yine her açılışta canlı BPHS denetiminden** geçer; uyuşmazlık olursa
  kırmızı "Doğrulanmadı" uyarısı AYNEN gösterilir (golden teyidi bunu bastırmaz).

## Karışma / Bilgi Bankası / kayıtlı analiz

- 15 bölümün konu anahtarları: D9 `navamsa_*`, diğerleri `varga_*:dN` — bölümler arası ve D1/Gochara ile çakışma yok (test: tüm anahtarlar
  tek bölüme ait, DB regex uyumlu, Batı'da geçersiz, not bölümü yalnız vedic.varga).
- Motor: 13 bölüm = 13 ayrı anahtar/istek; tekrar 0. >10 yeni istek tek seferde **409 CONFIRMATION_REQUIRED** (maliyet koruması; onaysız
  istek yapılmaz) — doğru davranış, testte doğrulandı.
- KB: D60 kaydı yalnız D60'ta eşleşir (D2'de eşleşmez); not bağlamı `ayanamsa:lahiri|division:n`.
- Kayıtlı D2 ve D60 analizleri 0 istekle açılır; snapshot'tan BPHS denetimi match + golden teyitli; `significance` yalnız yetkili görünümde;
  başka tenant 404.

## Testler

- `phase52.harness.ts` **19/19** (golden kaydı, 13 bölüm ayrı ayrı, Lagna vargottama, teyit listesi ↔ dosyalar, yöntem notu taraması,
  konu ayrımı, motor + KB + kayıtlı analiz + tenant).
- Astroloji tamamı: 39/20/17/37/20/15/33/26/**19**/10 + PG PASS · tsc 0 · eslint 0 · next build OK · bundle taraması 0
  (raw_response, ROXY_API_KEY, astro_analyses, calcInputHash, input_hash, varga anlatıları).
- Mutasyon: `mutate52.cjs` **18/18** (Lagna/graha vargottama denetimleri, teyit listesi ±, 13 bölümün her birinin kuralı ayrı bozuldu) ·
  Aşama 5 `mutate5` 14/14 hâlâ yakalanıyor.
- Regresyon: HD Roxy 220/0, HD info-panel 65/0, output-visibility 205/0, infra 43/0, admin-hygiene 55/0. Önceden var olan, astroloji dışı:
  backup 53/1, faz1-p3 94/4 (Aşama 5/5.1 ile aynı, değişmedi).
- Güvenlik: rota düzeyi owner-only/404, önizlemede anlatı/ham alan/anahtar yokluğu (Aşama 5.1 routes 20/20 paketin parçası, geçti).

## P0 / P1 / P2 / P3

- **P0 = 0 · P1 = 0 · P2 = 0.**
- P3: (a) D16'da bulunan Lagna vargottama listesi kabulü (düzeltildi); (b) varga golden'ları tek sentetik kişiye ait — farklı haritalarda
  canlı BPHS denetimi sürer; (c) Aşama 5.1'den devreden P3'ler (kütüphane 4+ grahalı küçük üçgen, DOM yerelleştirmesi 0.49.0'a bağlı,
  Gochara Vedha/Sade Sati yok, kısmi drishti yok) değişmedi.

## Production / main / push

DEĞİŞMEDİ — push yok, preview yok, merge/rebase yok, deploy yok, migration/SQL yok, başka worktree'ye dokunulmadı, danışan verisi yok.

## Sıradaki kesin adım

Vedik varga doğrulaması tamam. **DUR** — Aşama 6 (KP) için ayrı owner onayı beklenir.
