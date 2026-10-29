# Numeroloji Merkezi — Mevcut ↔ Klasik Karşılaştırma

Durum: geliştirme (branch `work/numeroloji-merkezi-roxy`). Production'da KAPALI (`NUMEROLOGY_CLASSIC_ENABLED`).

Kod: `lib/numeroloji-klasik/compare/` (saf, istemci + sunucu güvenli) · Test: `scripts/numeroloji-klasik/compare/align.harness.ts`

| Dosya | Görev |
|---|---|
| `glossary.ts` | Kavram sözlüğü: 12 eşlenen kavram + yalnız Mevcut (9) + yalnız Klasik (9) listesi; sabit uzman açıklamaları |
| `legacyReader.ts` | Kayıtlı `numerology_records.analysis_data` okuyucu (hoşgörülü; asla hata fırlatmaz) |
| `align.ts` | `alignRecords()` hizalama + `buildNoteSnapshot()` not anlık görüntüsü |
| `hash.ts` | Kanonik JSON + saf SHA-256 (node:crypto ile birebir test edilir) |

## 1. Karşılaştırma nasıl çalışır

1. Mevcut taraf: uzmanın seçtiği kayıtlı analizin `analysis_data` alanı **kaydedildiği gibi** okunur
   (`{ version: 1, motor, summary, tas?, gorsel?, calc: { methodology, stampedAt, recalculatedFrom? } }`).
2. Klasik taraf: kayıtlı klasik analiz sonucu (`ChartResult`; isteğe bağlı kişisel gün, köprü, Kalde, işletme,
   Doğaltaş eşleştirici çıktısı).
3. `alignRecords(mevcut, klasik)` her kavram için bir satır üretir. Zirve ve Mücadele/Zorluk her dönem için ayrı
   satırdır (Klasik sırası 1–4).
4. Her satırın `relation` alanı **yalnız mekanik** hesaplanır:

| relation | Kural |
|---|---|
| `same_value` | İki sayı birebir aynı (Hayat Yolu'nda gösterimin son sayısı; tek parçalı kulvar; dönem sayısı) |
| `same_root` | Sayılar farklı, rakam kökleri (1–9) aynı — ör. 11 ↔ 2, 19/10 ↔ 1, 11/11 (22) ↔ 22 |
| `different` | Kökler de farklı |
| `one_missing` | Taraflardan biri yok ya da değer kayıtta tutulmuyor |
| `not_comparable` | Kavramlar eşdeğer değil (karmik); iki taraf yalnız yan yana gösterilir |

`same_value` asla kökten türetilmez: **11 ile 2 hiçbir zaman "aynı değer" değildir.**

### Kök (root) nasıl bulunur — yeniden hesap değildir

- Hayat Yolu "36/9": değer = son sayı (9), kök = 9. "19/10": değer 10, kök 1. Gösterim değişmez.
- Kulvar "19/2", "22/3", "11/11 (22)": bileşik yol gösterimi tek sayı değildir → `value = null`; kök = kayıtlı
  `componentValues` toplamının kökü (eski kayıtta yoksa ana gösterim sayılarının toplam kökü — testte 192/192
  kulvarda ikisi aynı çıktı). Parantez (`combinedReading`) yalnız ek bilgi olarak taşınır.
- Rakam toplamı ve sadeleştirme mod 9'u korur; bu yüzden kök, kaydın kendi sayılarının köküdür. Mevcut motor
  çalıştırılmaz.

### Formül eşlemeleri

- Ana Kulvar ↔ Ruh Güdüsü, Yan Kulvar ↔ Kişilik: kök karşılaştırması (`comparable: "root"`).
- Mücadele ↔ Zorluk **formüle göre** eşlenir (sıraya göre değil): M1 ↔ 1., M2 ↔ 2., Ana Mücadele ↔ 3. (ana),
  M3 ↔ 4. Önceki metodoloji kayıtlarında (nokta yaş, ana alanı yok) eski M3 = |M1 − M2| → 3.; 4. konum Mevcut'ta yok.
- Zirve: dönem sayısı karşılaştırılır; yaşlar ek bilgi (Mevcut Metot 1 / Metot 2 nokta yaşları, Klasik dönem aralığı).
- Kişisel Yıl/Ay/Gün, Olgunluk, Doğum Günü Enerjisi Mevcut kayıtta **saklanmaz** (ekranda canlı hesaplanır) →
  satır `one_missing`, sebep `not_in_snapshot`. Karşılaştırma bunları yeniden hesaplamaz; uzman Mevcut
  Numeroloji ekranından bakar.

### Taşlar

- `legacyAssigned`: kayıttaki `tas.bileklik / kolye / kutle` (uzmanın atadığı; virgülle ayrılmış).
- `classicDirect`: klasik sonucun doğrudan taşları (eşleştirici `providerDirect`; yoksa uğurlu taş metni).
- `classicDerived`: eşleştiricinin türettiği öneriler (yöntemleriyle).
- `overlap`: iki tarafta bulunan adlar — yalnız tam ad / boşluksuz ad eşitliği ("Kaplan Gözü" = "Kaplangözü");
  kısmi içerme ("Akik" ⊂ "Yosun Akik") eşleşme sayılmaz. Köken (slot + kaynak + yöntem) korunur.

## 2. Salt-okunur garantiler

- Mevcut Numeroloji kodu (`lib/numeroloji/**`, `app/numeroloji/**`) karşılaştırma kütüphanesine **içe aktarılmaz**
  (harness statik tarar). Yalnız test, gerçekçi kayıt şekli üretmek için Mevcut motoru salt-okunur çalıştırır.
- `numerology_records` yalnız `select` ile okunur (bkz. `MIMARI.md` §0, `boundary.harness.ts`).
- Girdi nesneleri değiştirilmez (test: derin dondurulmuş girdi + önce/sonra derin eşitlik).
- Bilinen metodoloji damgası `LEGACY_METHODOLOGY_KNOWN` sabittir; Mevcut damgadan saparsa test FAIL verir.
  Damga yok → `methodologyCurrent: null` (önceki metodoloji), farklı damga → `false`.

## 3. Not saklama

- Tablo: `numerology_comparative_notes` (migration `20271205000000_numerology_classic_core.sql`).
- `legacy_record_id` **metin**dir; `numerology_records` tablosuna FK bilinçli olarak YOKTUR (mevcut tablo değişmez;
  kayıt silinse de not kendi anlık görüntüsüyle okunur). `classic_analysis_id` ve `client_id` tenant'lı FK'dir.
- `snapshot` = `buildNoteSnapshot(alignment)`: şema sürümü, sözlük/hizalama sürümü, kompakt satırlar (gösterim,
  değer, kök, tür, karmik borç, ilişki), taş özeti, iki kaynağın SHA-256 özeti (`sourceHashes`) ve satırların
  özeti (`rowsHash`). Yorum metni içermez; tabloda 256 KiB sınırı vardır (test boyutu doğrular).
- `sourceHashes.legacy` = kayıtlı `analysis_data`'nın kanonik JSON SHA-256'sı. Not açıldığında kayıt yeniden
  özetlenip karşılaştırılırsa, notun yazıldığı andan sonra kayıt değişti mi anlaşılır.

## 4. UX kuralları

- İki sütun: "Mevcut Numeroloji" ve "Klasik Numeroloji". Ortak / birleştirilmiş tek sayı **gösterilmez**.
- İlişki rozeti mekaniktir ("Aynı değer", "Aynı kök", "Farklı", "Bir taraf yok", "Karşılaştırılamaz"); altında
  sözlüğün sabit açıklaması. Sistem hangi okumanın doğru olduğunu söylemez — **karar uzmanındır**.
- Gösterimler kaydedildiği gibidir (ör. "36/9", "11/11 (22)"); kök yalnız ilişki için kullanılır.
- Kayıtta olmayan değerler için "Bu değer kayıtlı analizde saklanmaz; Mevcut Numeroloji ekranında görülür." yazılır.
- Önceki metodoloji kaydı ise bilgilendirme notu gösterilir; karşılaştırma eski kaydı güncel yöntemle yeniden hesaplamaz.
- Uzmana görünen hiçbir metinde sağlayıcı adı yoktur.

## 5. Test

`npx tsx scripts/numeroloji-klasik/compare/align.harness.ts` — 3.945 kontrol (96 gerçekçi kişi × klasik oracle;
usta/karmik; eksik taraflar; eski/kısmi/bozuk kayıtlar; taş kökeni; değişmezlik; statik sınır).
Tip denetimi: `npx tsc -p scripts/numeroloji-klasik/compare/tsconfig.check.json`.

96 kişilik sentetik örnekte gözlenen dağılım: Hayat Yolu, İfade, Ana/Yan Kulvar kökleri **her zaman** aynı
(harf tablosu ve sesli kümesi iki ekolde aynı; mod 9 değişmez); dört Mücadele ↔ Zorluk sayısı formül eşlemesiyle
her zaman aynı; Zirve 1. Metot 2 yaşı = Klasik 1. dönem bitişi; Zirve 2/4'te usta sayı farkı (%9) görülür.
