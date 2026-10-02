# Numeroloji — PDF Metodoloji Spec (NUM-PDF, 2026-10)

**Kaynaklar (tek metodoloji kaynağı):**
- K1 = "kitap 1. seviye.pdf" — Pera Akademi Numeroloji Eğitimi, 252 PDF sayfası (basılı sayfa = PDF − 1).
- K2 = "kitap 2. seviye.pdf" — 239 PDF sayfası (basılı sayfa = PDF sayfası).

Sayfalar PDF sayfa numarasıdır. Tüm 491 sayfa okundu; yorum-ağırlıklı sayfalar burada yalnız
gerektiğinde anılır. Kodda kural → `lib/numeroloji/*`; golden testler →
`scripts/numeroloji-pdf/pdf-golden.harness.ts` (`npm run numeroloji:pdf`).

## 1. Harf → sayı (K1 s.10–11 "ÇAKRA HARFLERİ"; K1 s.217–224; K2 s.149)

| Değer | Harfler |
|---|---|
| 1 | A J S Ş |
| 2 | B K T |
| 3 | C Ç L U Ü |
| 4 | D M V |
| 5 | E N W |
| 6 | F O Ö X |
| 7 | G Ğ P Y |
| 8 | H Q Z |
| 9 | I İ R |

- I ve İ ikisi de 9 (K1 s.167 ELİF YILMAZ, s.208 NURAN IŞIK). Büyük/küçük harf değeri değiştirmez.
- Kitapta tire, kesme işareti, nokta, çift soyad kuralı **YOK** (tüm sayfalarda). Kitap yalnız
  "kişinin bilinen soyadı/evlilik soyadı eklenir" der (K2 s.205, s.211; K1 s.167 "(X)").
- Ayrı uyum alfabesi (eş/işyeri uyumu) K2 s.205–211'de tanımlıdır; ana hesaplarda kullanılmaz.

## 2. Hesaplar

| # | Hesap | Formül (kitap) | Master | Örnek (kitap) | Kaynak | Motor |
|---|---|---|---|---|---|---|
| 1 | Ana Kulvar | Sesli harfler; kelime başına topla+sadeleştir, sonra topla+sadeleştir | 11,19,22,33 korunur | NURAN IŞIK → 4 | K1 s.16 | ✅ |
| 2 | Yan Kulvar | Sessiz harfler; ad ve soyad AYRI ("19/3") | 19/22 korunur | NURAN IŞIK → 19/3; ELİF YILMAZ → 22/9 | K1 s.30, s.167 | ✅ |
| 3 | İfade = Kader | Tüm harfler, tek haneye | yalnız 11, 22 | NURAN IŞIK → 8; MİNA → 19→1; İPEK OLGUN → 11 | K1 s.34; K2 s.170–171 | ✅ (düzeltildi) |
| 4 | Hayat Yolu / DM | Tüm rakamlar toplanır, **bir kez** sadeleştirilir | yok (22/4, 33/6) | 18.02.1987 → 36/9; 02.03.2000 → 7 | K1 s.51, s.58, s.83–153 | ✅ (düzeltildi) |
| 5 | PİN | h1=gün, h2=ay, h3=yıl (ayrı sade); h4=h1+h2+h3; h5=h1+h4; h6=h1+h2; h7=h2+h3; h8=h6+h7; h9=1–8 toplamı | yok | 18.02.1987 → 9 2 7 9 9 2 9 2 4 | K1 s.156–157, s.168 | ✅ |
| 6 | Çakra sütunu | Sağ: tüm harfler; sol: Ana Kulvar + PİN + DM rakamları | — | ELİF YILMAZ | K1 s.52–53, s.167–168 | ✅ (sol taraf kitap örneğiyle tam tutarlı değil — K1 içi) |
| 7 | Değişim-Dönüşüm | Yıl + yıl rakamları toplamı; yılın çakrası = gün+ay+yıl | — | 1987→2012→2017→2027→2038→2051→2059→2075 | K1 s.169–170 | ✅ ("doğum yılına göre" çakra varyantı kitapta YOK) |
| 8 | Evrensel Yıl/Ay/Gün | Yıl rakamları; +ay; +gün (sade) | iner | 2024→8; 23.01.2024 → 5 | K1 s.175–176 | ✅ |
| 9 | Kişisel Yıl | gün + ay + içinde bulunulan yıl → 1–9; doğum gününde geçiş | iner (19→10→1) | 18.02.1987 / 2024 → 1 | K1 s.177 | ✅ (DY düzeltildi) |
| 10 | Kişisel Ay | Kişisel Yıl + ay (Ekim/Kasım/Aralık = 1/2/3) | iner | — | K1 s.187 | ✅ |
| 11 | Kişisel Gün | Kişisel Yıl + Kişisel Ay + gün | iner | 1+2+5 = 8 | K1 s.190 | ✅ |
| 12 | Zirve | Gün/ay/yıl ayrı (11/22 korunur); Z1=g+a, Z2=g+y, Z3=Z1+Z2, Z4=a+y | 11/2, 22/4 | 18.02.1987 → 11,7,9,9 | K1 s.210–216 | ✅ (11/22 korunumu düzeltildi) |
| 13 | Zirve yaşı | **ÇELİŞKİ:** s.211 "36 − ilk zirve sayısı" (36−11=25) ↔ s.212 "36 − Hayat Yolu" (HY 3 → 33); sonra +9 | — | — | K1 s.211–212 | ⚠️ KULLANICI KARARI (motor: 36 − HY) |
| 14 | Mücadele | Gün/ay/yıl ayrı sade; M1=|g−a| (bitiş 36−M1), M2=|g−y| (+27), M3=|a−y| (+27), Ana=|M1−M2| | 11→2 | 29.03.1986 → 1/35, 4/62, 3/89, ana 3 | K2 s.181–183 | ✅ |
| 15 | Elementler | PİN rakamları: 1,5 Hava; 2,7 Su; 3,6 Ateş; 4,8 Toprak; 9 yok | — | 35214876 → 2'şer | K1 s.229; K2 s.38–39 | ✅ |
| 16 | Harflerin Yankılanışı | Her harf, çakra sayısı kadar yıl; sırayla, döngüsel | — | NURAN IŞIK: N5 U3 R9 A1 N5 I9 Ş1 I9 K2 | K1 s.208 | ✅ |
| 17 | Kişilik Enerjisi | Doğum günü → 1–9 | iner | 15 → 6 | K2 s.169 | ✅ |
| 18 | Hayat Dersi | Kişilik + Hayat Yolu | 11/22 korunur | 6+5 = 11 | K2 s.169 | ✅ |
| 19 | Olgunluk | Tarih + isim | 11/22 korunur | SEMA ÇAYLAR 29.03.1986 → 1 | K2 s.67 | ✅ |
| 20 | Evre / Döngü | Evre n: yaş 9(n−1)+1…9n, değeri n. PİN hanesi; döngü = yaşın rakam toplamı | — | 28.03.1978 yaş 45 → 5. evre, 9. döngü | K2 s.34–35 | ✅ |
| 21 | İsim sayısı (ilişki) | Kelime başına, master korunmaz | iner | SEMA DURMAZ → 4 | K2 s.69 | ✅ (ilişki modülü) |
| 22 | Ev sayısı | Apartman no + daire no | — | 4+11 → 6 | K1 s.231 | ✅ |
| 23 | İşyeri/eş uyumu | Ayrı alfabe, indirgemesiz toplam, İYİ/KÖTÜ/K.Ç.B tablosu | — | — | K2 s.205–211 | ✅ (kitap örneklerinde hesap hataları var) |

## 3. Kitapta karşılığı olmayan (motorda var) — SİLİNMEDİ, raporlandı
- Değişim-Dönüşüm "doğum yılına göre" çakra (yalnız yıl rakamları) ve "etki dönemi (yıl−1…yıl)".
- Kulvar "farklı özel sayı kombinasyonları" (ör. "19/3 (22/0)") — owner tanımlı sunum katmanı.
- Zirve/Mücadele için gelecek yılların gizlenmesi (owner kararı, sunum).
- Kitapta tanımlı ama motorda olmayan: Karmik ders sayıları (K1 s.40–50 yalnız anlamlar; formül yok),
  Aura rengi (K2 s.161–162), Evlilik enerjisi (K2 s.166, kitapta örnek eksik), Bereket günleri (K2 s.167),
  Misyon/Vizyon (K2 s.198), Esma (K1 s.235).

## 4. Kitaplar arası / kitap içi çelişkiler
1. **Zirve yaşı** (K1 s.211 ↔ s.212) — KULLANICI KARARI. Eski kayıtlardaki "yaş 25" s.211 örneğiyle,
   güncel "yaş 35" s.212 metniyle uyumludur.
2. **19/33'ün korunması**: K1 s.7 genel ilke "değişmez sayılar 11 ve 22" ↔ K1 s.16 Ana Kulvar
   "11,19,22,33 sadeleştirilmez". Özel bölüm kuralı yalnız Kulvar'a uygulanır (TAMAMLAYICI).
3. **İfade sırası**: K1 s.34 kelime başına indirger; K2 s.171 tüm harfleri toplar. Sonuç rakamı
   mod-9 eşittir; yalnız ara toplamın 11/22'ye denk geldiği nadir durumda farklılaşabilir
   (motor K2'yi uygular — K2 açıkça "Kader (İfade)" der).
4. Kitap örneklerinde aritmetik/yazım hataları: zirve örneği başlığı "19/02/1987" (rakamlar 18.02.1987),
   K2 s.149 SEMA ÇAYLAR toplamı, K2 s.167 bereket günü, K2 s.207–211 uyum örnekleri, K1 s.248 İbn Arabi DM.
5. **Tire / kesme işareti / çift soyad**: iki kitapta da kural YOK → KULLANICI KARARI.
