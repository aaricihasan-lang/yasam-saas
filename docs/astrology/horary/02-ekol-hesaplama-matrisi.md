# B — Horary Ekol ve Hesaplama Matrisi (2026-10-18)

Amaç tek bir "evrensel horary" motoru DEĞİLDİR. Üç gelenek ayrı tutulur; bir geleneğin kuralı diğerine uygulanmaz.
Durum sütunu: **H** = hesaplanıyor/üründe · **G** = geliştirildi, test bekliyor (ürüne bağlı değil) · **K** = kaynak veriden
hesaplanabilir ama yapılmadı · **E** = eğitmen kararı · **Y** = API'de yok · **D** = doğrulanamadı.

Kaynak kısaltmaları: **CA** = W. Lilly, *Christian Astrology* (1647) · **Bon** = Guido Bonatti, *Liber Astronomiae*
(13. yy; Tr. 5 "146 considerations", Tr. 6 sorular) · **Sahl** = Sahl ibn Bishr, *Introduction*, *On Questions*
(9. yy; Dykes çev.) · **Mash** = Māshā'allāh, *On Reception* · **Dor** = Dorotheus, *Carmen Astrologicum* · **Ptol** =
Ptolemy, *Tetrabiblos* · **Frawley** = J. Frawley, *The Horary Textbook* (2005) · **Barclay** = O. Barclay, *Horary
Astrology Rediscovered* (1990) · **KSK** = K.S. Krishnamurti, *KP Readers* (özellikle Reader VI "Horary Astrology") ·
**PM** = *Prashna Marga* (Kerala, 1649; B.V. Raman çev.) · **PT** = Neelakantha, *Prashna Tantra* / *Tajika Neelakanthi*
(16. yy) · **SP** = Prithuyasas, *Shatpanchasika*.

## C1. Klasik Batı Horary

| Başlık | Tam tanım (özet) | Hesaplama yöntemi | Kaynak | Ekol farkı | Test beklentisi | Durum |
|---|---|---|---|---|---|---|
| Soru anı ve yeri | Astrologun soruyu anladığı an ve yer (Lilly); bazı modernler sorunun sorulduğu an | Yerel saat + IANA → UTC; harita soru yerinde | CA II; Frawley | An tanımı | DST, tarih değişimi | K (KP'de H) |
| Yedi geleneksel gezegen | Satürn…Ay; dış gezegenler yönetici değil | Tablo | CA I; Ptol | Modern horary (Watters, Goldstein-Jacobson) dış gezegen kullanır | Tablo | G |
| Burç/ev yöneticileri | Geleneksel ev sahipleri | Tablo | Ptol I.17 | — | 12 burç | G |
| Soran / sorulan göstergeleri | 1. ev yöneticisi + Ay = soran; konunun evi yöneticisi = sorulan | Ev cusp burcu → yönetici | CA II | Ay'ın eş-gösterge rolü | — | E |
| Soru türüne göre ev | Ör. evlilik 7, para 2, iş 10 | Sözlük | CA II–III | Ev atamaları kısmen farklı | — | E |
| Türetilmiş evler | Ör. eşin parası = 7'nin 2'si = 8 | (h + k − 1) mod 12 | CA | — | Aritmetik | K |
| Gündüz/gece, sect | Güneş ufkun üstü/altı | n360(ASC − Güneş) ∈ (0,180) | Ptol; Dor | — | Roxy sect ile birebir | G (W6) |
| Asal asalet (ev/yücelme/üçlü/terim/yüz) | Beş asalet | Tablolar | CA s.104; Dor I.1; Ptol I.20 | Üçlü: Dorothean ↔ Lilly; terim: Mısır ↔ Ptolemaik | Mısır terimi sağlaması | G + E; Ptolemaik terim **D** |
| Zarar, düşüş, peregrine | Karşı burç; Lilly'de peregrine = hiçbir asalet yok | Türetilmiş | CA s.104–115 | Peregrine tanımı (Roxy: yalnız burç) | Örnek puanlar | G |
| Puanlama | Lilly 5/4/3/2/1, −5/−4/−5 | Toplam | CA s.115 | Bonatti/Frawley puan kullanmaz | Örnek | G + E |
| Arızi asalet | Açısal ev, hız, retro, yanıklık, Regulus/Spica vb. | CA tablosu (s.115) | CA | Birçok modern kaynak kısaltır | — | K + E |
| Kabul / karşılıklı kabul | A, B'nin asaletindeyse B A'yı kabul eder | Asalet tabloları | Mash; CA | Hangi asaletler sayılır | Örnek | G (W5) |
| Yaklaşan/ayrılan, kesinleşme | Hızlı gezegen yavaşa açı kesinleştiriyorsa yaklaşan | Anlık: işaret(e)·işaret(Δhız); an: olay araması | Sahl; CA | Orb/moiety kuralı | Roxy 11/11 birebir | G (anlık); an **D** (olay ucu golden'ı yok) |
| Ay'ın son ve sonraki açısı | Burç içinde | Olay listesi | CA; Bon | Hangi açılar/gövdeler | astronomy-engine | G |
| Ay boşlukta (VOC) | Lilly: burcu terk etmeden hiçbir açı kesinleştirmez (moiety tartışmalı); modern: Ptolemaik açıların kesinleşmemesi | Olay listesi + Ay burç girişi | CA s.112; modern | Tanım + dış gezegenler | 15 an bağımsız tarama | G + E |
| Via Combusta | Terazi 15°–Akrep 15° (Lilly); başka aralıklar | Aralık | CA s.122 | Aralık | Sınır | G + E |
| Yanık / ışın altı / cazimi | 8°30′ / 17° / 17′ (Lilly) | |Δλ| | CA s.113 | Eşikler (8°, 15°, 16′) | Sınır | G + E |
| Retro / istasyon | Hız < 0; istasyon ≈ hız → 0 | Roxy `speed`; istasyon anı olay | CA | — | — | K |
| Işık aktarımı | Hızlı bir gezegen birinden ayrılıp diğerine yaklaşarak ikisini birleştirir | Olay sırası | Sahl; CA s.111 | Orb, araya giren açı | — | E + D |
| Işık toplanması | Daha yavaş bir gezegen iki göstergeden de yaklaşan açı alır | Olay sırası | Sahl; CA | — | — | E + D |
| Engelleme (prohibition) | Bir üçüncü gezegen kesinleşmeden önce araya girer | Olay sırası | CA s.111 | — | — | E + D |
| Hüsran (frustration) / refranation | Hedefe ulaşmadan başka açı / retro dönüşü | Olay + istasyon | CA | — | — | E + D |
| Şans noktası | Lilly: ASC + Ay − Güneş (gece de aynı); Helenistik: gece ters | Formül | CA; Valens | Gece formülü | Roxy gece-ters birebir | G + E |
| Diğer lotlar | Gerektiğinde | `/arabic-lots` (7 Hermetik) | — | Lot seçimi | — | E |
| Zamanlama | Kesinleşmeye kalan derece × burç niteliği × ev | Tablo | CA Kitap II (zaman ölçüsü); Frawley | Birim seçimi büyük ölçüde ekol | — | E |
| Considerations before judgement | ASC <3° / >27°, Ay VC/geç derece, Satürn 1/7, 7. ev yöneticisi zarar görmüş… | Konumsal bayraklar | CA s.121–123; Bon Tr.5 | Frawley çoğunu reddeder | Sınır | G (konumsal kısım) + E |
| Ev sistemi | Lilly/Frawley: Regiomontanus; bazıları Placidus / Whole Sign | — | CA; Frawley | — | — | **Y** (Regiomontanus) + E |
| Saat yöneticisi (radikallik) | Gezegen saati ile ASC/yönetici uyumu | `/panchang/hora` | CA | Pek çok modern uygulamaz | — | D + E |

## C2. KP Horary (mevcut teknik)
| Başlık | Tanım | Hesaplama | Kaynak | Durum |
|---|---|---|---|---|
| 249 tablo | 27 × 9 sub (Vimshottari oranı), burçta bölünen 6 sub | `verify/kpSub` | KSK | H (iki uygulama + H3) |
| Sayı → Asc | Dilimin orta noktası | Roxy | KSK; Roxy belgesi | H |
| Soru anının gerçek Lagna'sı ↔ horary Lagna | Ruling için zaman Lagna'sı | Roxy + bağımsız | KSK; Roxy belgesi | H (ekranda ayrım #437) |
| Star / sub / sub-sub hiyerarşisi | Cusp'ta sub-sub yok (Roxy) | Roxy | KSK | H |
| Ev / gezegen significator'ları | 4 düzey | Roxy | KSK Reader III/VI | H |
| Ruling planets | 5 öğe; sub lordlar dışarıda | Roxy | KSK | H |
| Cusp sub lordunun evleri | Sub lordun significator evleri | Yeniden düzenleme | KSK | G (#437) |
| Vaat ↔ zamanlama ayrımı | Önce cusp sub lordu vaadi, sonra dasha/transit/ruling | — | KSK | E (soru-ev sözlüğü, olumlu evler) |
| Dasha / transit bağlantısı | Soru anı dashası, ruling transit | `/kp/sublord-changes`, `/kp/ruling-planets-interval` | KSK | E |

## C3. Vedik Prashna
| Aile | Özü | Roxy'de | Durum |
|---|---|---|---|
| Genel soru anı Prashna Kundali | Soru anında D1, Lagna lordu, Ay, nakshatra | birth-chart, panchang | K + E |
| Prashna Marga (Kerala) | Arudha (soran konumu), Ashtamangala, Trisphuta, Prana/Deha/Mrityu sphuta, nimitta (alametler) | Yok | Y |
| Kerala Prashna (Ashtamangala) | Kauri/sayı ile ritüel sorgu | Yok | Y |
| Tajika Prashna (PT) | Ithasala (yaklaşan), Ishrafa (ayrılan), Nakta (aktarım), Yamaya (toplama), Manau, Kamboola… — Arap-Fars horary öğretisinin Sanskrit karşılığı | Yok (Batı olay verisinden kurulabilir ama sidereal + Tajika orbları) | Y + E |
| Shatpanchasika | 56 kıta; Lagna, Ay, kendra-trikona kuralları | Yok | E |
| KP Prashna | Ayrı mevcut teknik | Var | H |

Prashna için hiçbir kod yazılmadı: hangi metin/okulun esas alınacağı eğitmen kararıdır ve Roxy bu okulların özel
hesaplarını sağlamaz. Teknik veri (soru anı D1 + panchang) mevcut adaptörlerle **K** düzeyinde hazırdır.
