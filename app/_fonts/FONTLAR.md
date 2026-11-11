# Yerel web yazı tipleri

Uygulamanın web yazı tipleri `next/font/local` ile **bu dizinden** yüklenir. Build sırasında Google Fonts'a ağ isteği yapılmaz
(önceki `next/font/google` kullanımı CI'da aralıklı `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`
hatasıyla build'i düşürüyordu: 01.11–10.11.2026 arasında 231 build'in 12'si).

**Amaç: görünümü birebir korumak.** Dosyalar, önceki `next/font/google` çağrılarının build'de indirdiği dosyalarla aynı
glifleri, metrikleri, eksenleri ve OpenType özelliklerini taşır; karakter kapsamı önceki CSS'in **etkin** kapsamına eşittir.

## Kaynak

- Depo: [google/fonts](https://github.com/google/fonts), **sabit commit** `5bb28733cec313b63fbd415b574b5ae35c8aa8b8` (2026-11-08).
- Üretim: `python scripts/fonts/yerel-font-uret.py` (fontTools + brotli; CI'da çalışmaz). Kaynak SHA-256'ları betikte
  doğrulanır; üretim belirlenimcidir (aynı girdi → aynı baytlar).
- Sürümler, Google Fonts API'nin build'e sunduğu dosyalarla aynıdır.

| Dosya | Aile (sürüm) | Kaynak dosya (SHA-256 başı) | Kapsam | Kullanım |
|---|---|---|---|---|
| `geist.woff2` | Geist 1.800 | `ofl/geist/Geist[wght].ttf` (`73894e04…`) | latin, latin-ext, kiril, kiril-ext, Vietnamca | `--font-geist-sans` (wght 100–900) |
| `geist-mono.woff2` | Geist Mono 1.701 | `ofl/geistmono/GeistMono[wght].ttf` (`d00e590b…`) | latin, latin-ext, kiril, kiril-ext, Vietnamca, symbols2 | `--font-geist-mono` (wght 100–900) |
| `fraunces.woff2` | Fraunces 1.000 | `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf` (`177ff6c0…`) | latin, latin-ext, Vietnamca | opsz 9–144, wght 100–900, SOFT 0–100 (WONK = 0) |
| `jost.woff2` | Jost 3.710 | `ofl/jost/Jost[wght].ttf` (`6343b709…`) | latin, latin-ext, kiril | 400, 500 |
| `manrope.woff2` | Manrope 4.505 | `ofl/manrope/Manrope[wght].ttf` (`3ae11c49…`) | latin, latin-ext, kiril, kiril-ext, Yunanca, Vietnamca | 300–600 |
| `unbounded.woff2` | Unbounded 1.701 | `ofl/unbounded/Unbounded[wght].ttf` (`323b511b…`) | latin, latin-ext, kiril, kiril-ext, Vietnamca | 300, 400 |
| `playfair-display.ttf` | Playfair Display 1.203 | `ofl/playfairdisplay/PlayfairDisplay[wght].ttf` (`c40f2293…`) | **özgün dosya (değiştirilmedi)** | 600 |

Tam kaynak SHA-256 değerleri `scripts/fonts/yerel-font-uret.py` içindedir; çıktıların SHA-256'ları betik çıktısında yazılır.

## Alt küme kuralları

- **`subsets` yalnız ön yüklemeyi seçer.** `next/font/google` tarafından üretilen CSS, Google'ın o istek için döndürdüğü **tüm**
  alt kümeleri (`latin`, `latin-ext`, kiril, Vietnamca …) ayrı `unicode-range`'li `@font-face` kuralları olarak içerir. Bu
  yüzden önceki uygulamanın etkin karakter kapsamı = her alt küme dosyasının karakterleri ∩ o alt kümenin `unicode-range`'i
  (birleşim). Yerel dosyalar tam olarak bu kapsamı taşır (betikte `KAPSAM`; Google Fonts API 2026-11-10 yanıtlarından).
- OpenType özellikleri ve değişken eksenler Google'ın sunduğu dosyaların birleşimiyle aynıdır.
- Doğrulama: her ailede eski etkin kapsamdaki her karakter, birden çok eksen konumunda glif çizimi + ilerleme genişliği olarak
  Google'ın sunduğu **tüm alt küme dosyalarıyla** karşılaştırıldı → 6 ailede **0 çizim farkı, 0 genişlik farkı, 0 eksik,
  0 fazla karakter, özellik listesi birebir**.
- **Playfair Display**: OFL "Reserved Font Name" içerdiğinden alt küme alınmadı (değiştirilmiş sürüm üretilmedi); özgün
  değişken dosya bayt bayt kullanılır. Eski kapsamın tamamını içerir (eksik 0); Google'ın statik 600 örneğiyle çizim farkı
  ≤ 1/1000 em; ek OpenType özelliklerinin hiçbiri tarayıcıda varsayılan açık değildir.

## Türkçe karakterler

`ç Ç ğ Ğ ı İ ö Ö ş Ş ü Ü` yedi ailenin hepsinde yazı tipinin kendisiyle çizilir — **önceki uygulamayla aynı** (Geist dahil:
önceki CSS latin-ext alt kümesini de içeriyordu). `₺` (U+20BA) Geist, Geist Mono, Jost ve Playfair Display'in kendisinde
yoktur → önceki gibi yedek yazı tipine düşer.

## Lisans

Tüm aileler **SIL Open Font License 1.1** ile lisanslıdır; lisans metinleri `lisanslar/` altındadır ve yazı tipi
dosyalarındaki telif / lisans ad kayıtları korunmuştur.
