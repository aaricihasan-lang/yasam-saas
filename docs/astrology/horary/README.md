# Gökyüzü Atlası — Horary Araştırması ve Owner Karar Raporu (2026-10-18)

Belgeler: [A Roxy envanteri](01-roxy-horary-api-envanteri.md) · [B Ekol matrisi](02-ekol-hesaplama-matrisi.md) ·
[C Mevcut sistem](03-mevcut-sistem-karsilastirmasi.md) · [D+E Geliştirme ve test](04-gelistirme-ve-test-kanitlari.md) ·
[F Eğitmen soruları](05-egitmen-sorulari.md) · KP ayrıntı: `kp-horary-01-2026-10-18.md` (PR #437) · Batı ayrıntı:
`western-horary-calc-2026-10-18.md` (PR #438).

## G — Yönetici özeti

**Mevcutta hazır olanlar**
- KP Horary (1–249): sayı → Lagna, 12 Placidus cusp, gerçek gökyüzü gezegenleri, star/sub/sub-sub, 4 düzey
  significator, ruling planets, Bilgi Bankası, uzman yorumu, kayıt/arşiv, Word/PDF. Hesaplar golden + bağımsız
  testlerle doğrulanmış (Aşama 6). Roxy'nin tek horary ucu budur.

**Güvenle geliştirilenler**
- PR #437: ruling ayrıntısı ekranda, sayının Lagna'sı ↔ soru anı Lagna'sı tablosu, cusp sub lordlarının evleri
  (ekran + Word/PDF), yerel soru anı. Motor/adaptör/şema değişmedi; migration yok.

**Kodlandı ama doğrulama/onay bekleyenler**
- PR #438 (taslak): klasik Batı horary hesap katmanı — asalet (iki tablo varyantı), kabul, sect, Şans noktası,
  yaklaşan/ayrılan, yanıklık, Via Combusta, Ay boşlukta. Ürüne bağlı değil. Gerçek Roxy natal verisiyle çapraz
  doğrulandı; Ptolemaik terim tablosu **doğrulanamadı** (işaretli).

**Roxy'de bulunmayanlar**
- Batı horary ucu; Regiomontanus/Alcabitius/Campanus/Porphyry evleri; üçlü/terim/yüz; kabul; Ay boşlukta; yanıklık
  (Batı); ışık aktarımı/toplanması/engelleme; Tajika yogaları; Prashna Marga / Kerala hesapları; horary hükmü.

**Öğretmen onayı bekleyenler** — 15 madde ([F](05-egitmen-sorulari.md)); en kritik üçü: gelenek seçimi, Batı ev sistemi
(Regiomontanus Roxy'de yok), asalet tablosu + orb kuralı.

**Production için engeller**
- #437: owner görsel kabulü + Vercel Preview (Turbopack) derlemesi; fiziksel cihaz testi owner'da.
- #438: eğitmen kararları (2, 3, 6, 7, 10), ≤4 canlı Roxy doğrulama çağrısı (owner izni), ardından ayrı ürün
  entegrasyonu PR'ı (migration gerektirmez).
- Prashna: okul kararı; Roxy'de okul hesapları yok → bugün yalnız teknik veri (soru anı D1/panchang) mümkün.

**PR'lar ve head SHA'lar**
| PR | Dal | Head | Durum |
|---|---|---|---|
| #437 | `work/atlas-kp-horary-complete` | `5ec4a7ef` | Açık, merge YOK |
| #438 | `work/atlas-western-horary-calc` | `b2d298a4` | Taslak, merge YOK |
| (bu belge) | `work/atlas-horary-research` | — | Açık, merge YOK |

**Token / API tüketimi:** gerçek Roxy çağrısı **0**. Owner onayı istenecek en fazla **4** çağrı: tropikal lunar aspects,
transits/monthly, aspects/monthly, panchang/hora (her biri 1).

**Sonraki güvenli adım:** owner #437'yi Preview'da görsel olarak inceler; eğitmene [F](05-egitmen-sorulari.md)
listesi iletilir; eğitmen cevabından sonra (gerekirse ≤4 canlı çağrı ile) `western.horary` tekniği ayrı PR'da
Gökyüzü Atlası'na bağlanır.

Merge 0 · Production deploy 0 · Production migration 0 · Production veri değişikliği 0.
