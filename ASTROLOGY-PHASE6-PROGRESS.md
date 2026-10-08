# ASTROLOJİ AŞAMA 6 — KP (Krishnamurti Paddhati) İLERLEME KAYDI

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline 433157ff..HEAD` okuyun. Golden çağrı yapmadan önce
> `scripts/astrology/fixtures/golden/kp-*.json` dosyalarını ve aşağıdaki çağrı kaydını kontrol edin.

- Başlangıç HEAD: `433157ff` (Aşama 5.2; temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Push / preview / merge / production / migration: YOK.

## Alt aşamalar

| Alt aşama | Durum | Commit |
|---|---|---|
| 6A KP API envanteri | ✅ tamam (`docs/astrology/phase6a-kp-inventory.md`) | 64ad4029 |
| 6B KP natal çekirdeği | ✅ tamam (backend; UI 6G'de) | (6B–D commit) |
| 6C Cusp ve Lord hiyerarşisi | ✅ tamam (backend) | (6B–D commit) |
| 6D Significator | ✅ tamam (backend) | (6B–D commit) |
| 6E Dasha ve zamanlama | ⏳ sırada | — |
| 6F Ruling Planets / Transit / Horary | ⏳ | — |
| 6G Premium görseller | ⏳ | — |
| 6H Bilgi Bankası | 🟡 KP geleneği + konu türleri hazır (6B–D) | — |
| 6I Kayıtlı analiz | 🟡 kp.chart için test edildi (6B–D) | — |
| 6J Güvenlik ve regresyon | ⏳ | — |

## Gerçek Roxy çağrı kaydı

| Alt aşama | Endpoint | Neden | Sonuç | Sayı |
|---|---|---|---|---|
| (Aşama 0–5.2) | — | — | — | 38 |
| 6B | POST /vedic-astrology/kp/chart (sentetik A, kp-newcomb, mean, tz +3) → `kp-chart.json` | KP çekirdek: cusp/lord/significator gerçek şema + doğrulama | OK (8 üst alan) | 1 |

Tahmin (6A): 7 → **6** (kp/ayanamsa GET çıkarıldı: istemci yalnız POST; değer zaten kp/chart.meta içinde). ≤10 → ayrı onay gerekmez.
Ücret/kota bilinmiyor. **Toplam: 39.**

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

## Sıradaki kesin adım

6B–D commit → 6E KP dasha (golden: dasha/major + sub/{md}, kp-newcomb, significators:true).
