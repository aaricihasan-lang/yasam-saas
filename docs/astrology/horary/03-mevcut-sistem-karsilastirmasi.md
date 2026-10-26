# C — Mevcut Gökyüzü Atlası Karşılaştırması (main d59b1c04, 2026-10-18)

Gerçek yollar: `app/admin/astroloji/_lib/techniques.ts`, `_components/TechniqueSelector.tsx`, `_components/KpPanels.tsx`,
`_components/TimingPanels.tsx`, `_components/atlas/ResultDesk.tsx`, `lib/astrology/model/kp.ts`,
`lib/astrology/providers/roxy/kp.ts`, `lib/astrology/providers/roxy/requests.ts`, `lib/astrology/engine/techniques.ts`,
`lib/astrology/report/model.ts`, `lib/astrology/verify/kpSub.ts`, `scripts/astrology/phase6*.harness.ts`.

Horary ile ilgili tek teknik: **`kp.horary`** ("KP horary (1–249)", Aşama 6F). Batı horary ve Vedik Prashna tekniği YOK.

## KP Horary özellikleri — dört ayrı kanıt düzeyi

| Özellik | Kodda | Otomatik test | Gerçek API ile | Owner canlı kabulü |
|---|---|---|---|---|
| Horary sayısı 1–249 (seçici, sunucu doğrulaması, 0/250/1.5 ret) | ✔ | ✔ phase6 6F | ✔ golden 108 | Bilinmiyor¹ |
| Soru anı (şimdi / tarih-saat-IANA) | ✔ | ✔ | ✔ | Bilinmiyor |
| Yerel soru anı gösterimi | ✘ (yalnız UTC) → #437 | ✔ horary01 H1/H2/H11 | — | Bekliyor |
| Değerlendirme yeri (açık seçim; doğum yeri otomatik değil) | ✔ | ✔ 6F, 6G | ✔ | Bilinmiyor |
| Ayanamsa (KP-Newcomb / KP eski), düğüm türü | ✔ | ✔ | ✔ | Bilinmiyor |
| Harita (Güney Hindistan), Lagna, 12 cusp | ✔ | ✔ 6F bağımsız Placidus | ✔ | Bilinmiyor |
| Gezegenler: star / sub / sub-sub lord, KP no | ✔ | ✔ | ✔ | Bilinmiyor |
| 4 düzey significator (ev + gezegen) + düğüm yöntem etiketi | ✔ | ✔ 6F, 6.1, 6.2 | ✔ | Bilinmiyor |
| Ruling planets listesi | ✔ | ✔ | ✔ | Bilinmiyor |
| Ruling ayrıntısı (gün lordu, Ay, zaman Lagna'sı) | Teknikte ✔, **ekranda ✘** → #437 | ✔ H5/H6 | ✔ | Bekliyor |
| Sayının Lagna'sı ↔ zaman Lagna'sı ayrımı | Tek cümle → tablo #437 | ✔ H5 | ✔ | Bekliyor |
| Cusp sub lordunun gösterdiği evler | ✘ → #437 | ✔ H7/H8 | ✔ (golden'dan) | Bekliyor |
| houseThemes (Roxy yorum katmanı, yetkiyle) | ✔ "Teknik Açıklama" | ✔ | ✔ | Bilinmiyor |
| Kişisel Bilgi Bankası (`kp_horary_number`, `kp_horary_cusp_sublord`) | ✔ | ✔ 6F konular | — | Bilinmiyor |
| Uzman yorumu ("Kendi Yorumum", bağlam = sayı) | ✔ | ✔ | — | Bilinmiyor |
| Kayıt / arşivden 0 istekle açma, tenant 404 | ✔ | ✔ 6I | — | Bilinmiyor |
| Word / PDF | ✔ (sub-lord tablosu ve yerel an yok) → #437 | ✔ report8 + H9/H10 | — | Bekliyor |
| Masaüstü / mobil | ✔ | ✔ horary01-ui 48/0 (5 ekran) | — | Bekliyor |

¹ Bu oturumda owner'ın kp.horary için ayrı bir canlı kabul kaydı bulunamadı (KP Transit kabulleri ayrıdır). "Bilinmiyor"
= kanıt yok, başarısız değil.

## Sadece ekranda gösterilmeyenler (main'de)
- `ruling.dayLord`, `ruling.moon.*`, `ruling.lagna.*` → yalnız Word/PDF'te ("Lagna lordları" — sayının Lagna'sıyla
  karıştırılabilir etiket).
- `focus` yanıtta var, istekte hiç gönderilmiyor (her zaman `general`).

## Dokunulmayanlar
KP Transit (tek an + aralık; mühürlü), KP doğum haritası, dasha, Vedik, Batı teknikleri, Human Design, numeroloji,
auth/RLS/tenant/Storage, kayıt şeması, migration'lar.
