# TRANSİT-01 hotfix — tarih girişinde sayfa çökmesi (P1, 2026-10-17)

Canlı commit `80bec74f` (PR #421). Kapsam yalnız Gökyüzü Atlası tarih/saat girişleri. Migration YOK, Roxy çağrısı YOK.

## Belirti
Yeni Analiz → Transit (tek an) → "Seçilen gün ve saat" → tarih kutusunda gün + ay yazıldıktan sonra yılın İLK
rakamı yazılınca sayfa "This page couldn't load" ile çöküyordu (Analizi Başlat'a basılmadan).

## Kök neden (yerelde üretildi)
- Tarayıcının `input[type=date]` kutusu yıl rakam rakam yazılırken ara değerler üretir: `0002-10-17`, `0020-10-17`,
  `0202-10-17` (ve tamamlanmamışken boş dize).
- `lib/astrology/transitDetail.ts` `localWallToUtcMs` (`localToUtcPreview` → her render'da UTC ön izlemesi):
  `Intl.DateTimeFormat(..., { year: "numeric" })` 2. yılı `"2"` olarak verir → `Date.parse("2-10-17T…Z")` = NaN →
  ofset NaN → aday an NaN → `filter` içinde `formatToParts(new Date(NaN))` → **`RangeError: Invalid time value`**.
- Render sırasında atılan istisna sayfanın hata ekranına düştü.
- Stack (yerel `next start`, Chromium, tr-TR): `RangeError: Invalid time value at DateTimeFormat.formatToParts …
  at Array.filter` — gün "17", ay "10", yıl "2" adımında.
- Mevcut e2e tarihi tek seferde `.fill()` ile girdiği için ara değerler hiç oluşmuyordu (bu yüzden yakalanmadı).

## Düzeltme
1. **Ön izleme / UTC dönüşümü** artık SUNUCUNUN kullandığı saf fonksiyonla (`resolveAstroBirthTime`, "earlier") yapılır →
   küçük yıllar doğru işlenir, hiçbir girişte istisna yok, ön izleme ile sunucu kararı ayrışmaz.
2. **Alan denetimi** `dateInputIssue` / `timeInputIssue`: boş → "Tarih eksik…", takvimsel geçersiz → "Tarih geçersiz…",
   1600–2600 dışı (ara değerler dahil) → aralık uyarısı. `Invalid Date` / `NaN` metni yok.
3. **Plana / API'ye girmez**: `dateInputReason` → `buildSelections` eksik/geçersiz tarihli tekniği dışarıda bırakır,
   `missingReason` nedeni gösterir, Hazırlık konsolunda **Analizi Başlat kapalı**. Kapsam: Transit (gün / gün+saat),
   Transit Takvimi başlangıç + bitiş, Progression/Solar arc hedef tarihi, Gochara ve KP tarih/saat (aynı tür giriş).
4. **Girilen veri silinmez**: alanlar kullanıcının ham değerini tutar. Takvim **bitiş** kutusu önceden kontrollü değere
   geri dönüyordu (yıl yazılamıyordu) → taslak `forecastEndDraft`; geçersiz taslakta uyarı + Başlat kapalı; süre /
   başlangıç değişince taslak temizlenir.
5. `middayUtcOf`, `addDaysIso`, `daysBetweenIso` geçersiz girişte istisna atmaz (null).

## Testler
- `scripts/astrology/transit01.harness.ts` D4–D7 (31/0): her ara/geçersiz değerde istisna yok; rakam rakam dizi =
  sunucu kararı; 4800 tarih × bölge taraması; eksik tarihli teknik plana girmez.
- `scripts/astrology/transit01-date-input.e2e.cjs` (yeni, gerçek klavye, tr-TR): 52 adım × (1366 Chrome, 390 mobil,
  412 Android UA, 1366 Edge) — düzeltme öncesi build'de canlı hatayı aynen yakalar (RangeError).
- `transit01-ui.e2e.cjs` 41/0 × 3 görünüm; `npm run test:astrology` 681 PASS / 0 FAIL / 0 SKIP.

## Sınırlar
- Yerli takvim açılır penceresi otomasyonla açılamaz → seçim, tarayıcının tek seferde tam değer atamasıyla (`fill`) test
  edildi. Firefox / Safari motorları bu makinede yok (Chromium + Edge test edildi).
- Fiziksel Android'de tarih kutusu klavye yerine yerli seçici açar; owner cihaz testi gerekir.
