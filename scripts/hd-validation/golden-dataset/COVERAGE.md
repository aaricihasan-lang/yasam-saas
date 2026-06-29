# Golden Dataset — Kapsama Matrisi

Golden set "rastgele birkaç doğum" değildir; **kasıtlı kenar-durum matrisi**dir.
Her satır, hangi vakanın hangi riski sınadığını ve beklenen sonucu belgeler.
Vakalar FAZ 2'de eklenecek; bu dosya **hedef kapsamı** sabitler.

> **FAZ 2D durumu:** gate/line karşılaştırma harness'ı (`hd_prod_runner.ts` +
> `compare_chart.mjs`) hazır ve çalışır. Şu an yalnız `HD-GOLD-0001.example.json`
> (compare dışı) var → compare **NO_GOLDEN_CASES** verir. **Gerçek MyBodyGraph
> vakası girilene kadar kalibrasyon YAPILMAZ**; mandala ofseti ADAY kalır.

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
