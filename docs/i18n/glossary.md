# Yaşam Sistemi — Global Terminoloji Sözleşmesi (Glossary)

> FAZ 1 / AŞAMA 2A. Bu turda **yalnız Türkçe (source) kavramlar** kaydedilir.
> EN/DE/FR karşılıkları sonraki dil aşamalarında doldurulacaktır.
>
> **Kritik kural:** Bu sözlük yalnız **DISPLAY LABEL** (arayüz metni) içindir.
> **CANONICAL VALUE ≠ DISPLAY LABEL.** DB'de saklanan kanonik değerler
> (burç: `Koç`; element: `Ateş`; analysis_data anahtarları: `GÜNEŞ`, `AY`, …)
> **asla** çevrilmez / rename edilmez. Bkz. `lib/i18n/locales.ts`, `lib/i18n/format.ts`.

## Çekirdek Terimler (core)

| TR (source) | EN | DE | FR | Not |
|---|---|---|---|---|
| Kaydet | _(TBD)_ | _(TBD)_ | _(TBD)_ | `common.save` |
| İptal | _(TBD)_ | _(TBD)_ | _(TBD)_ | `common.cancel` |
| Sil | _(TBD)_ | _(TBD)_ | _(TBD)_ | `common.delete` |
| Düzenle | _(TBD)_ | _(TBD)_ | _(TBD)_ | `common.edit` |
| Ara | _(TBD)_ | _(TBD)_ | _(TBD)_ | `common.search` |
| Yükleniyor… | _(TBD)_ | _(TBD)_ | _(TBD)_ | `common.loading` |
| Onayla | _(TBD)_ | _(TBD)_ | _(TBD)_ | `common.confirm` |

## Danışan Modülü Terimleri (client module)

| TR (source) | EN | DE | FR | Not |
|---|---|---|---|---|
| Danışan | _(TBD)_ | _(TBD)_ | _(TBD)_ | Ana varlık |
| Danışan Yolculuğu | _(TBD)_ | _(TBD)_ | _(TBD)_ | Modül adı |
| Randevu | _(TBD)_ | _(TBD)_ | _(TBD)_ | |
| Seans | _(TBD)_ | _(TBD)_ | _(TBD)_ | ⚠️ DB `title` default'u; write payload DEĞİŞMEZ |
| Not | _(TBD)_ | _(TBD)_ | _(TBD)_ | |
| Ödev | _(TBD)_ | _(TBD)_ | _(TBD)_ | |
| Analizler | _(TBD)_ | _(TBD)_ | _(TBD)_ | |
| Yaşam Hafızası | _(TBD)_ | _(TBD)_ | _(TBD)_ | |

## Çevrilmeyen Kanonik Değerler (DO-NOT-TRANSLATE)

Aşağıdakiler **persisted data key / canonical value**'dur — display map dışında
asla dokunulmaz:

- **Burç:** Koç, Boğa, İkizler, Yengeç, Aslan, Başak, Terazi, Akrep, Yay, Oğlak, Kova, Balık
- **Kan grubu:** `A Rh+`, `0 Rh-`, … (canonical string)
- **analysis_data anahtarları:** GÜNEŞ, AY, MERKÜR, VENÜS, MARS (+ diğer gezegenler)
- **Elementler:** Hava, Su, Ateş, Toprak
- **Mizaç:** canonical değerler (value ≠ label pattern korunur)
- **YolculukTab META** canonical değerleri
