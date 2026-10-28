# Gökyüzü Atlası — güncel teknik envanteri (origin/main `aab7c035`, 2026-10-28)

Kaynak: `lib/astrology/engine/techniques.ts` (TECHNIQUES kaydı), `app/admin/astroloji/_lib/techniques.ts` (UI_TECHNIQUES),
`app/admin/astroloji/_lib/comingSoon.ts` + `ComingSoonPanel.tsx` (Yakında), açık PR listesi (GitHub REST, salt okuma).
Sınıflar: **MEVCUT** (main'de, kullanıcıya açık) · **KISMİ** (bir kısmı açık / başka teknik içinde) · **YOK** · **KARAR BEKLİYOR**
(kod hazır ya da yöntem belli, owner/eğitmen kararı gerekli). Mevcut hesap motorlarına bu çalışmada dokunulmadı.

## Talimatta "yeniden geliştirme" denenler — hepsi MEVCUT

| Teknik | Kimlik | Sınıf | Not |
|---|---|---|---|
| KP Horary | `kp.horary` | MEVCUT | 1–249; #437/#441/#442 PROD |
| Diğer KP | `kp.chart`, `kp.dasha`, `kp.ruling`, `kp.transit`, `kp.ruling_interval` | MEVCUT | |
| Gezegen dönüşleri | `western.planetary_return`, `western.solar_return`, `western.lunar_return` | MEVCUT | |
| Yıllık profeksiyonlar | `western.profections` | MEVCUT | |
| Sekonder progresyon, Solar Arc | `western.progression`, `western.solar_arc` | MEVCUT | |
| Vedik Dasha, Panchanga | `vedic.dasha`, `vedic.panchanga` | MEVCUT | Güncel/Sookshma/Prana düzeyleri dahil |
| Hora, Choghadiya | `vedic.panchanga` seçeneği | MEVCUT | |
| Gun Milan, Dashakoot, Papasamyam | `vedic.gun_milan`, `vedic.dashakoot`, `vedic.papasamyam` | MEVCUT | Dashakoot Rasi sağlayıcı hatası açık; uyarı Draft #576 (dokunulmadı) |
| Arudha, Chara Karaka, Bhav Chalit, Bhava Bala | `vedic.arudha`, `vedic.chara_karaka`, `vedic.bhav_chalit`, `vedic.bhava_bala` | MEVCUT | |
| Upagraha, Heliacal | `vedic.upagraha`, `vedic.heliacal` | MEVCUT | Mandi ekol notu açık |
| Asteroitler, Hermetik lotlar, gerçek Lilith | `western.extra_points` | MEVCUT | |
| Batı ve Vedik aylık | `western.forecast`, `western.declination_parallels`, `vedic.monthly` | MEVCUT | |
| Sade Sati | `vedic.sade_sati` | MEVCUT | Dönem tarihleri Draft #517 (owner + hukuk, dokunulmadı) |

Diğer MEVCUT: `western.natal`, `western.transit`, `western.synastry`, `western.composite`, `western.astrocartography`,
`western.relocation`, `western.local_space`, `western.fixed_stars`, `vedic.d1`, `vedic.varga`, `vedic.drishti`,
`vedic.ashtakavarga`, `vedic.shadbala`, `vedic.transit`. Toplam kayıtlı teknik: 42.

## Eksik / kısmi teknikler

| Teknik | Sınıf | Durum | Engel |
|---|---|---|---|
| **Klasik Batı Horary (Lilly)** | KARAR BEKLİYOR | Hesap katmanı tamam ve doğrulandı — Draft PR HORARY-W-02 (#438'in devamı) | Ekol parametreleri (eğitmen), ürün entegrasyonu ayrı PR |
| Bonatti / Sahl / Māshā'allāh horary | YOK | Profil yok | Birincil kaynak tablosu teyidi + eğitmen |
| Modern horary (dış gezegenli) | YOK | Ay boşlukta varyantı hesaplanıyor (`voidOfCourseWithOuter`) | Ekol kararı |
| Vedik Prashna (tüm aileler) | YOK | `01-vedik-prashna.md` | Okul kararı; Prashna Marga'nın Arudha'sı hesaplanamaz (gözlem girdisi) |
| Kalsarpa Dosha | KARAR BEKLİYOR | `02-kalsarpa.md` | Tanım (yön, sınır, kısmi, Lagna, düğüm) + sağlayıcı yöntemi ölçülmedi |
| Ekliptik geçişleri (düğüm geçişleri) | YOK | `03-kucuk-teknikler.md` | Yöntem açık; gerçek yanıt golden'ı yok (≥2 çağrı) |
| Harita yöneticisi | YOK | `03` | Geleneksel ↔ modern yönetici kararı |
| Baskın gezegen | YOK | `03` | Puanlama sistemi kararı (çok sayıda farklı sistem) |
| Ayrıntılı transit–natal / aylık efemeris / Ay takvimi | KISMİ | `western.forecast` + `western.transit` kapsıyor | Yakında listesi "aynı hesap tekrarlanmayacak" der |
| Manglik | MEVCUT (Gun Milan içinde) | — | — |
| Batı uyum puanı, burç yorumları, Rashi/Nakshatra açıklamaları | YOK | Yorum içerikleri | Hesap tekniği değil (içerik/yorum kararı) |

## Dokunulmayan bekleyen işler
#496 (artık açık değil), #502 (karantina; migration PROD'a uygulanmadı), #517 (Sade Sati dönemleri), #576 (Dashakoot uyarısı),
#491, #454 — bu çalışmada okunmadı/değiştirilmedi.
