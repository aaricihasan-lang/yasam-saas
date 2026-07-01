# Golden Dataset — Kapsama Matrisi

Golden set "rastgele birkaç doğum" değildir; **kasıtlı kenar-durum matrisi**dir.
Her satır, hangi vakanın hangi riski sınadığını ve beklenen sonucu belgeler.
Vakalar FAZ 2'de eklenecek; bu dosya **hedef kapsamı** sabitler.

> **FAZ 4.2 durumu (7 gerçek golden case — hepsi PASS):**
>
> | # | Kişi | Type | Authority | Profile/Angle | Definition | TZ/tarih |
> |---|---|---|---|---|---|---|
> | 0001 | Hasan | Generator | Sacral | 2/4 RAX | Split-Small | TR 1987 |
> | 0002 | Alperen | Generator | Sacral | 2/4 RAX | Split-Large | TR 2018 |
> | 0003 | Ali Kaan | Manifestor | Emotional | 3/5 RAX | Split-Small | TR 2014 |
> | 0004 | Einstein | Generator | Emotional | 1/4 RAX | Split-Small | DE 1879 **LMT** |
> | 0005 | Hitler | Manifestor | **Splenic** | **5/1 LAX** | Single | AT 1889 **LMT** |
> | 0006 | Trump | **Manifesting Generator** | Emotional | 1/3 RAX | Single | US 1946 **DST** |
> | 0007 | Agatha | Manifestor | Emotional | **6/2 LAX** | **Triple Split** | GB 1980 **BST** |
>
> compare **7/7 PASS, 0 FAIL, 0 BOUNDARY**; type/authority/profile/cross-gates
> türetim smoke'ları **7/7**. Cross tema adı `gates-only` (tablo yok).
>
> **Kapsanan type'lar:** Generator, Manifesting Generator, Manifestor (Emotional+Splenic auth).

### NOT_YET_VALIDATED — açık kapsamlar (FAZ 4.3)
Bu kapsamlar **henüz gerçek referansla doğrulanmadı**. İlke: yalnız güvenilir bir
dış HD kaynağı (Genetic Matrix/MyBodyGraph görseli) sağlandığında eklenir; **asla
uydurma veriyle "tamamlandı" gösterilmez**. Bulunamayan her dal burada açıkça
NOT_YET_VALIDATED kalır.

| Kapsam | Durum | Sağlanması gereken kaynak |
|---|---|---|
| **Projector** type | `NOT_YET_VALIDATED` | Type=Projector bir chart |
| **Reflector** type | `NOT_YET_VALIDATED` | Type=Reflector (nadir ~%1) bir chart |
| **Juxtaposition** cross | `NOT_YET_VALIDATED` | Profile **4/1** bir chart |
| **Güney yarımküre** | `NOT_YET_VALIDATED` | Doğum enlemi < 0 bir chart |
| **Half-hour timezone** | `NOT_YET_VALIDATED` | Örn. India (+5:30) / Adelaide (+9:30) / Newfoundland (-3:30) doğumu |
| **Boundary vakası** | `NOT_YET_VALIDATED` | Bir aktivasyonu gate/line sınırına ≲30″ olan chart (engine `boundaryFlag` ile teyit) |

> **Kapsanan authority'ler:** Emotional, Sacral, Splenic. **NOT_YET_VALIDATED:**
> Splenic-Projector ayrımı dışındaki Ego / Self-Projected / Mental / Lunar authority'ler
> (Lunar yalnız Reflector'da görülür → Reflector vakasıyla birlikte gelir).
>
> **Kapsanan definition'lar:** Single, Split-Small, Split-Large, Triple-Split.
> **NOT_YET_VALIDATED:** No-Definition (Reflector) ve Quadruple-Split.
>
> ### ⚠️ Bilinen sınırlama / technical debt — LMT dakika yuvarlaması
> `localDateTimeToUtc` (`lib/human-design/engine/time.ts`) timezone ofsetini
> **tam dakikaya yuvarlar**. Standart-zaman öncesi (LMT) doğumlarda IANA ofseti
> sub-dakika saniye içerir (ör. Europe/Berlin 1879 = +0:53:**28**, Europe/Vienna
> 1889 = +1:05:**21**) → engine UTC'si GM'den **Δ28s / Δ21s** sapar.
> **HD-GOLD-0004 ve 0005'te gate/line sonucunu DEĞİŞTİRMEDİ** (hiçbir hızlı cisim
> sınıra yeterince yakın değil), bu yüzden şu an PASS. Ancak gerçek bir **boundary
> vakasında** (aktivasyon sınıra ≲15″) sonucu çevirebilir.
> **Karar:** algoritma şimdilik değiştirilmiyor; yalnızca gerçekten boundary
> vakasını etkilediği kanıtlanırsa ayrı FAZ kapsamında saniye-hassasiyetli
> ofset çözümü ele alınacak.

> **FAZ 2D notu (tarihsel):** harness `hd_prod_runner.ts` + `compare_chart.mjs`;
> gerçek vaka yokken **NO_GOLDEN_CASES** verir.

## Boyut 1 — Type (5/5 zorunlu)
| Risk | Hedef vaka | Durum |
|---|---|---|
| Generator | — | bekliyor |
| Manifesting Generator | — | bekliyor |
| Manifestor | — | bekliyor |
| Projector | — | bekliyor |
| Reflector (nadir — özellikle aranır) | — | bekliyor |

## Boyut 2 — Authority (7/7 zorunlu)
| Risk | Durum |
|---|---|
| Emotional (Solar Plexus) | bekliyor |
| Sacral | bekliyor |
| Splenic | bekliyor |
| Ego (Heart) | bekliyor |
| Self-Projected (G) | bekliyor |
| Mental (Environmental) | bekliyor |
| Lunar (Reflector) | bekliyor |

## Boyut 3 — Zaman / Timezone riski
| Risk | Neden | Durum |
|---|---|---|
| DST geçiş günü doğumu | yerel→UTC kayması line/gate çevirir | bekliyor |
| Tarihsel savaş-saati | tzdata tarihsel kuralları | bekliyor |
| Yarım-saatlik tz (örn. Asia/Kolkata) | tam-saat varsayımını kırar | bekliyor |
| Gece yarısı / gün sınırı | tarih taşması | bekliyor |

## Boyut 4 — Astronomik kenar durum
| Risk | Neden | Durum |
|---|---|---|
| `boundaryFlag:true` — gate/line sınırına ~30″ | garanti-edilemeyen bölge (soft) | bekliyor |
| Ocak doğumu (perihel, hızlı Güneş) | 88° solver gün sayısı kısa uç | bekliyor |
| Temmuz doğumu (afel, yavaş Güneş) | 88° solver gün sayısı uzun uç | bekliyor |
| True vs Mean node ayrışması olası | node tipi kalibrasyonu | bekliyor |

## Boyut 5 — Coğrafya / tarih aralığı
| Risk | Durum |
|---|---|
| Güney yarımküre | bekliyor |
| Yüksek enlem | bekliyor |
| 1920–1950 erken tarih | bekliyor |
| 2000–2030 güncel tarih | bekliyor |

## Hedef
Her boyutta en az 1 vaka; type ve authority boyutlarında **tam kapsama** (5/5, 7/7).
Toplam başlangıç hedefi: ~20–40 kasıtlı vaka. Genişleme FAZ 2+ doğrulama sonuçlarına göre.
