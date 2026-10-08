# ASTROLOJİ AŞAMA 6 — KP (Krishnamurti Paddhati) İLERLEME KAYDI

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline 433157ff..HEAD` okuyun. Golden çağrı yapmadan önce
> `scripts/astrology/fixtures/golden/kp-*.json` dosyalarını ve aşağıdaki çağrı kaydını kontrol edin.

- Başlangıç HEAD: `433157ff` (Aşama 5.2; temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Push / preview / merge / production / migration: YOK.

## Alt aşamalar

| Alt aşama | Durum | Commit |
|---|---|---|
| 6A KP API envanteri | ✅ tamam (`docs/astrology/phase6a-kp-inventory.md`) | 64ad4029 |
| 6B KP natal çekirdeği | ✅ tamam (backend; UI 6G'de) | 52fc00d4 |
| 6C Cusp ve Lord hiyerarşisi | ✅ tamam (backend) | 52fc00d4 |
| 6D Significator | ✅ tamam (backend) | 52fc00d4 |
| 6E Dasha ve zamanlama | ✅ tamam (backend) | 5911ff45 |
| 6F Ruling Planets / Transit / Horary | ✅ tamam (backend) | (6F commit) |
| 6G Premium görseller | ⏳ | — |
| 6H Bilgi Bankası | 🟡 KP geleneği + konu türleri hazır (6B–D) | — |
| 6I Kayıtlı analiz | 🟡 kp.chart için test edildi (6B–D) | — |
| 6J Güvenlik ve regresyon | ⏳ | — |

## Gerçek Roxy çağrı kaydı

| Alt aşama | Endpoint | Neden | Sonuç | Sayı |
|---|---|---|---|---|
| (Aşama 0–5.2) | — | — | — | 38 |
| 6B | POST /vedic-astrology/kp/chart (sentetik A, kp-newcomb, mean, tz +3) → `kp-chart.json` | KP çekirdek: cusp/lord/significator gerçek şema + doğrulama | OK (8 üst alan) | 1 |

| 6E | POST /vedic-astrology/dasha/major (kp-newcomb, significators:true, mean) → `kp-dasha-major.json` | KP dasha katmanı şeması | OK | 1 |
| 6E | POST /vedic-astrology/dasha/sub/Moon (aynı gövde; bugünkü MD) → `kp-dasha-sub-md.json` | alt düzey significator şeması | OK | 1 |
| 6F | POST /vedic-astrology/kp/ruling-planets (an 2026-10-07 09:00 UTC, doğum yeri, doğum verisi) → `kp-ruling-planets.json` | ruling planets + significator | OK | 1 |
| 6F | POST /vedic-astrology/kp/planets-interval (aynı an, 15 dk, 2 nokta) → `kp-planets-at.json` | KP transit (efemeris) | OK | 1 |
| 6F | POST /vedic-astrology/kp/horary (108, aynı an, doğum yeri) → `kp-horary.json` | horary | OK | 1 |

Tahmin (6A): 7 → **6** (kp/ayanamsa GET çıkarıldı: istemci yalnız POST; değer zaten kp/chart.meta içinde). Gerçekleşen: **6** (≤10 → ayrı
onay gerekmedi). Ücret/kota bilinmiyor. **Toplam: 44.**

## 6B–6D bulguları ve kararlar

- Yeni teknik `kp.chart` (aile "kp"): `/vedic-astrology/kp/chart`, ayanamsa yalnız `kp-newcomb` (varsayılan) / `kp-old` — Lahiri/Raman
  seçeneği REDDEDİLİR (KP haritası Lahiri ile üretilmez); düğüm `mean` (varsayılan) / `true`; doğum ofseti açık (Roxy varsayılanı 5.5).
  TIME_REQUIRED (cusp sub-lord yaklaşık 4 dakikada değişir). Not bağlamı `ayanamsa:x|nodeType:y`.
- Ev sistemi: Roxy KP'de yalnız **Placidus** (istekte seçenek yok) — KP standardı; gizlenmez, teknikte `houseSystem: "placidus"`.
- Gelenek ayrımı: KB/not konuları `kp_*` türleri, gelenek **"kp"** (DB CHECK'te vardı → migration YOK). Vedik/Batı ayrıştırıcıları KP
  anahtarını REDDEDER; KP ayrıştırıcısı Vedik anahtarı reddeder; KP anahtarı Vedik gelenekte kaydedilemez (400).
- `houseThemes` (lang=tr anahtar kelimeler) → yalnız yorum katmanı. Düğümlerde retro alanı yok → `null` (uydurulmaz).

### Bağımsız doğrulama (golden, yalnız test kodu)

- KP boylamları = astronomy-engine tropikal − Roxy KP ayanamsa ≤ 0.01° (7 graha + ortalama Rahu).
- **KP ayanamsa:** aynı kişinin Lahiri D1 golden'ıyla fark 9/9 noktada sabit = 0.09655° (5′48″) = Lahiri − KP-Newcomb; KP < Lahiri
  (literatürle uyumlu: KP ayanamsası Lahiri'den yaklaşık 6′ küçük). Newcomb formülünün kendisi bağımsız yeniden hesaplanmadı (çerçeve tutarlılığı).
- **Placidus:** bağımsız yarı-yay yinelemesi (astronomy-engine RAMC + gerçek eğiklik) 12 cusp ≤ 0.02°.
- **Star / sub / sub-sub lord + KP no.:** üretimdeki tutarlılık yardımcısından AYRI, tamsayı yay-saniyesi tabanlı ikinci tablo; 22 nokta birebir;
  iki uygulama 0–360° boyunca 360.000 noktada birebir; yayımlanmış örnekler (1, 108 = 153°–155°06′40″, 249).
- **Bulgu (düzeltildi):** tam sınır noktalarında (ör. 24.0000°, 26.7000° — Roxy 4 ondalık verir) kayan nokta toplamı yüzünden üretim yardımcısı
  önceki dilimi seçiyordu (tolerans nedeniyle yanlış ret yoktu ama birincil aday yanlıştı) → "sınır sonraki dilime aittir" + 1e-9 itme.
- Placidus ev yerleşimi 9/9; karşıt cusp'lar 180°; KP evi ≠ D1 bütün-burç bhava (Venüs KP 8 / D1 9; Mars KP 6 / D1 7) — ayrı gösterilir.
- **Significator:** KP 4 düzey (L1 yıldızı sakinde, L2 sakin, L3 yıldızı sahipte, L4 sahip = cusp burç lordu) 7 graha için Roxy ile birebir;
  ev ⇔ gezegen tablosu 12×4×9 birebir. Düğümler: Roxy "ajan" eki uygular (kavuşan / bakan / burç sahibi) — bu haritada ek ev çıkmadı; sade kural
  Roxy listesinin alt kümesi. Kendi düğüm motorumuz YOK; yöntem UI'da Roxy'nin tanımıyla etiketlenecek.

### Testler
- `phase6.harness.ts` 18/18 (golden gövde, projeksiyon, 4 bağımsız doğrulama, KP tablosu + sınır, 16 fail-closed, significator ×3, motor /
  önbellek / ayanamsa / TIME_REQUIRED / maske, KP konu ayrımı + seçici, KB / not / kayıtlı analiz 0 istek / yorum kapısı / tenant).
- Aşama 5 konu seçici testi yalnız Vedik türleri dolaşacak şekilde daraltıldı (ortak tür haritasında artık KP türleri de var; KP eşdeğeri phase6'da).
- Bulgu (düzeltildi): KP numarası doğrulama regex'indeki ters bölüler betik aktarımında yutulmuştu — KP seçici testi yakaladı.
- Astroloji tamamı yeşil (… phase52 19 · phase6 18 · static 10 + PG) · tsc 0 · eslint 0.

## 6E — KP dasha

- `kp.dasha`: dasha uçları + `ayanamsa: kp-newcomb|kp-old` + `significators: true` + `nodeType`. Dönem başına Roxy KP significator'ları
  (Placidus evi, star/sub lord, L1–L4) teknikte; `strength` (puan/derece/"strong") yöntemi belgelenmemiş değerlendirme → yorum katmanı.
- **Bu bir KP olay tahmini değildir:** tarihler klasik Vimshottari motoru (KP ayanamsa ile); Roxy'de ev grubu → dönem eşleştiren olay
  zamanlama ucu YOK (yalnız `daily-finance` puanı — kapsam dışı).
- Bağımsız: Ay boylamı = kp/chart Ay; doğum bakiyesi (1 − oran) × 17 y; 5.1F'de golden'lardan çıkarılan alt dönem tarih kuralı KP çerçevesinde
  de sub/Moon golden'ını birebir üretir; KP ve Lahiri dasha tarihleri farklı (0.8515 y ≠ 0.9747 y).
- **Çapraz uç bulgusu:** görünür 7 graha için dasha significator'ları = kp/chart; **düğümlerde dasha ucu "ajan" ekli liste** verir (Rahu L1 6,3,9 …),
  kp/chart sade kuralı verir. Özet listeler (`signifiedHouses`, `strongHouses`) sırası tutarsız → içerik (küme) denetlenir.

## 6F — Ruling Planets · KP transit · Horary

- `kp.ruling`: an (şimdi/tarih) + gözlem yeri (varsayılan doğum yeri, seçilebilir) + doğum verisi (significator) → TIME_REQUIRED. Roxy ucu
  **ayanamsa almaz** (KP-Newcomb dahili; Ay lordları KP efemerisiyle birebir → doğrulandı). Ruling planets = klasik 5 öğe (gün lordu, Ay burç/yıldız,
  Lagna burç/yıldız); Roxy sub lordları kümeye katmaz (gösterilir ama sayılmaz). Tek timezone alanı → an doğum ofsetinde yerel.
- `kp.transit` (**KISMİ**): `/kp/planets-interval` tek an — KP hiyerarşili gökyüzü. Natal cusp'lara göre ev yerleşimi / transit analizi Roxy'de
  YOK; Yaşam Sistemi hesaplamaz. Doğum verisi kullanmaz → saat bilinmese de çalışır.
- `kp.horary` (**DOĞRULANDI**): sayı 1–249 + soru anı (UTC) + değerlendirme yeri; doğum verisi KULLANMAZ (saat bilinmese de çalışır).
  Asc = sayının KP alt bölümünün ORTA noktası. Not bağlamı = sayı.
- **Bulgu:** horary yanıtında düğümler için `signifies` AJAN EKLİ, `allHouses` + ev tablosu SADE (+ `agentHouses`) → adaptör sade düzeyleri ev
  tablosundan alır, ajan ekli listeyi ayrı saklar. **Ruling ucunun Ketu significator'ları ([9,12,6,10]) ne kp/chart sade ([3,9,4,5]) ne dasha
  ajan listesiyle aynı** → Roxy'de düğüm significator yöntemi uçlar arasında TUTARSIZ (P3, belgelendi; UI'da her listenin kaynağı yazılacak).

### 6F bağımsız doğrulama
- Gün lordu: Çarşamba → Merkür (yerel öğle, gün doğumundan sonra).
- Ay sign/star/sub/sub-sub = KP efemerisi Ay'ı (aynı an); Lagna lordları = bağımsız Asc (astronomy-engine RAMC + eğiklik) − KP ayanamsa'nın ikinci KP
  tablosundaki lordları.
- KP transit: 9 graha astronomy-engine ≤ 0.01°, Lahiri Gochara golden'ıyla fark 9/9 sabit (KP − Lahiri ≈ +0.0967°), lordlar ikinci tabloyla.
- Horary: Asc = KP 108 orta noktası (153°–155°06′40″); 12 cusp, verilen Asc'yi üreten RAMC'den (tarama + ikiye bölme) bağımsız Placidus ile ≤ 0.05°;
  gezegenler = KP efemerisi; Placidus evleri; görünür grahaların significator'ları sade KP kuralıyla birebir.

### 6E/6F testler
- phase6 33/33 (6E: 6 · 6F: 9). Astroloji tamamı yeşil (39/20/17/37/20/15/33/26/19/**33**/10 + PG) · tsc 0 · eslint 0.

## Sıradaki kesin adım

6F commit → 6G arayüz (KP seçenekleri, KP haritası + tablolar, dasha/ruling/transit/horary panelleri) → tarayıcıda görsel denetim.
