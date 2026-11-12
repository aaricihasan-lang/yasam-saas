# Yerel web yazı tipleri

Uygulamanın web yazı tipleri `next/font/local` ile **bu dizinden** yüklenir. Build sırasında Google Fonts'a ağ isteği yapılmaz
(önceki `next/font/google` kullanımı CI'da aralıklı `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`
hatasıyla build'i düşürüyordu: 01.11–10.11.2026 arasında 231 build'in 12'si).

**Amaç: görünümü birebir korumak.** İki katman vardır:

1. **Global aileler (root layout) — `google/`:** Geist (gövde), Geist Mono, Fraunces ve Jost. Önceki build'in global
   CSS'iyle **aynı yapı**: aynı aile adları (`"Geist"`, `"Fraunces"`, `"Jost"`), Google'ın sunduğu **aynı alt küme dosyaları
   (bayt bayt)**, aynı `unicode-range` ayrımı, aynı ön yükleme ve aynı yedek font metrikleri. Önceki kurulumda global istekle
   AYNI olan çağrıların değişkenleri bu ailelere bağlanır (`google/degiskenler.css`): `--font-display` (premium), `--eb-serif`
   / `--eb-label` (Enerji & Beden), `--ga-display` (Atlas girişi), `--dy-display`, `--hd-display`, `--hero-serif` /
   `--hero-sans` (Analiz Merkezi). Bu bağlama global stil sayfasında olduğu için rotaya özel CSS parçalarına karışmaz.
2. **Modül aileleri (global değil — yalnız içe aktaran rotada):** Atlas `Unbounded` (`--font-atlas-display`) ve `Manrope`
   (`--font-atlas-text`) — `atlas/fonts.ts`; tek ağırlıklı Jost etiketleri `Jost500` (`--ga-label`, `--dy-label`,
   `--amc-sans`; `google/etiket-500.ts`) ve `Jost400` (`--hd-label`; `google/etiket-400.ts`). Hepsi Google'ın sunduğu alt küme
   dosyaları (önceki build'le bayt bayt aynı), aynı ön yükleme (latin + latin-ext) ve önceki yedek metrikler.
3. **Playfair Display** (Analiz Merkezi kart başlığı): OFL "Reserved Font Name" → özgün dosya değiştirilmeden kullanılır.

## Google alt küme aileleri (`google/`)

| Aile | Alt kümeler (ön yükleme) | Dosyalar | Değişken |
|---|---|---|---|
| Geist v5 | kiril-ext, kiril, Vietnamca, latin-ext, **latin** | `google/geist-*.woff2` | `--font-geist-sans` |
| Unbounded v12 (300, 400) · Manrope v23 (300–600) — Atlas, global değil | kiril-ext, kiril, (Yunanca), Vietnamca, **latin-ext**, **latin** | `google/unbounded-*`, `google/manrope-*` | `--font-atlas-display`, `--font-atlas-text` |
| Jost v20 yalnız 500 / yalnız 400 — etiketler, global değil | kiril, **latin-ext**, **latin** | `google/jost-500-*`, `google/jost-400-*` | `--font-jost-500` / `--font-jost-400` → etiket değişkenleri |
| Geist Mono v6 | kiril-ext, kiril, symbols2, Vietnamca, latin-ext, **latin** | `google/geist-mono-*.woff2` | `--font-geist-mono` |
| Fraunces v38 (opsz, wght, SOFT) | Vietnamca, **latin-ext**, **latin** | `google/fraunces-vietnamese.woff2`; latin / latin-ext: `public/premium/fonts/` (Doğal Destek ile ortak) | `--font-fraunces` → `--font-display`, `--eb-serif` |
| Jost v20 (400, 500) | kiril, **latin-ext**, **latin** | `google/jost-cyrillic.woff2`; latin / latin-ext: `public/premium/fonts/` | `--font-jost` → `--eb-label` |

- **Bayt bayt eşitlik:** her dosya, Google Fonts API'den `next/font`'un isteği ve User-Agent'ıyla alınan dosyadır ve önceki
  `next/font/google` build'inin `.next/static/media` dosyasıyla SHA-256 olarak aynıdır. URL + SHA-256 listesi:
  `scripts/fonts/yerel-font-uret.py` → `GOOGLE_ALT_KUME` (betik indirir ve doğrular).
- **Neden alt küme ayrımı:** tarayıcı harf aralığını (kerning) yalnız aynı dosyadaki harfler arasında uygular. Eskiden Türkçe
  harfler (ğ ş İ Ğ Ş …) latin-ext dosyasındaydı; tek dosyada bu harflere kerning uygulanınca 320 px'te satır kırılmaları
  değişiyordu. Ayrım korunduğu için davranış önceki gibidir.
- **Örtüşme:** Google alt kümelerinin aralıkları kısmen örtüşür (ör. `ı` U+0131 hem latin hem latin-ext); tarayıcı aynı
  ailede son tanımlanan yüzü önce dener, o dosyada glif yoksa sıradaki yüze düşer (ör. `†` U+2020: aralığı latin'de, glifi
  latin-ext'te). Aralıklar bu seçime göre örtüşmez hâle getirildi: her karakter, öncelik sırasında glifi gerçekten içeren
  ilk alt kümeye atanır → eskisiyle aynı dosyadan çizilir ve sonuç CSS sırasına bağlı değildir.
- **Aile adı:** `next/font/local` aileyi sabit adından türetir (`const Geist = localFont(…)` → `"Geist"`). Kampanya CSS'i
  (`"Geist"`, `"Jost"`, `"Geist Fallback"`, `"Jost Fallback"`) ve bazı CSS yedekleri (`"Fraunces"`) bu adları doğrudan kullanır.
- **Yedek metrikler:** `google/yedek-metrikler.css` — önceki build'in ürettiği değerlerle birebir (`Geist Fallback`,
  `Geist Mono Fallback`, `Fraunces Fallback`, `Jost Fallback`, `Unbounded Fallback`, `Manrope Fallback`).

## Kaynak (Playfair Display)

- Depo: [google/fonts](https://github.com/google/fonts), **sabit commit** `5bb28733cec313b63fbd415b574b5ae35c8aa8b8` (2026-11-08).
- Üretim: `python scripts/fonts/yerel-font-uret.py` (fontTools + brotli; CI'da çalışmaz). Kaynak SHA-256'ları betikte
  doğrulanır; üretim belirlenimcidir (aynı girdi → aynı baytlar).
- Sürümler, Google Fonts API'nin build'e sunduğu dosyalarla aynıdır.

## Playfair Display

| Dosya | Aile (sürüm) | Kaynak dosya (SHA-256 başı) | Kapsam | Kullanım |
|---|---|---|---|---|
| `playfair-display.ttf` | Playfair Display 1.203 | `ofl/playfairdisplay/PlayfairDisplay[wght].ttf` (`c40f2293…`) | **özgün dosya (değiştirilmedi)** | 600 |

Tam kaynak SHA-256 değerleri `scripts/fonts/yerel-font-uret.py` içindedir; çıktıların SHA-256'ları betik çıktısında yazılır.

## Alt küme kuralları

- **`subsets` yalnız ön yüklemeyi seçer.** `next/font/google` tarafından üretilen CSS, Google'ın o istek için döndürdüğü **tüm**
  alt kümeleri (`latin`, `latin-ext`, kiril, Vietnamca …) ayrı `unicode-range`'li `@font-face` kuralları olarak içerir. Bu
  yüzden önceki uygulamanın etkin karakter kapsamı = her alt küme dosyasının karakterleri ∩ o alt kümenin `unicode-range`'i
  (birleşim). Yerel dosyalar tam olarak bu kapsamı taşır (betikte `KAPSAM`; Google Fonts API 2026-11-10 yanıtlarından).
- OpenType özellikleri ve değişken eksenler Google'ın sunduğu dosyaların birleşimiyle aynıdır.
- Doğrulama: her ailede eski etkin kapsamdaki her karakter, birden çok eksen konumunda glif çizimi + ilerleme genişliği olarak
  Google'ın sunduğu **tüm alt küme dosyalarıyla** karşılaştırıldı → ailelerde **0 çizim farkı, 0 genişlik farkı, 0 eksik,
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
