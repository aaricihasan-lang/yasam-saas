# ASTROLOJİ AŞAMA 6.1 — KP TEKNİK TUTARLILIK İLERLEME KAYDI

> Kesinti sonrası devam için: bu dosyayı + `git log --oneline 3e7f7230..HEAD` okuyun.

- Başlangıç: HEAD `3e7f7230` (Aşama 6 yerel mühür) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Başlangıçta çalışma ağacı temizdi; upstream yoktu.
- Gerçek Roxy çağrısı başlangıç: **44**. Push / preview / merge / production / migration: YOK.

## Alt aşamalar

| Alt aşama | Durum | Commit |
|---|---|---|
| 6.1A Rahu/Ketu yöntem denetimi | ✅ rapor + etiketler + test | 6c14d434 |
| 6.1B Dasha "bugün" rozeti | ✅ düzeltildi + tarayıcı 390/768/1440 | d56a1fb0 |
| 6.1C KP sınırlarının sunumu | ✅ | d56a1fb0 |
| 6.1D Regresyon | ✅ | (6.1D/E commit) |
| 6.1E Güvenlik ve kapanış | ✅ | (6.1D/E commit) |

## 6.1A

Rapor: `docs/astrology/phase6-1-rahu-ketu-method-audit.md`.

Roxy düğüm significator'larında üç kural uyguluyor; bunlar golden'larla bağımsız olarak sınandı:

| Uç | Kural | Durum |
|---|---|---|
| kp/chart | sade | doğrulandı |
| dasha | ajan ekli: burç lordu + aynı burç + 7. burç | 4 düğüm × 4 düzey birebir; "bakış" kapsamı kısmen belirsiz |
| horary | `signifies` ajan ekli, `allHouses`/`houseWise` sade | aynı yanıtta iki yöntem (sağlayıcı iç tutarsızlığı) |
| ruling | Ketu = burç lordu Ay'ın kümesi | belgelenmemiş; tek örnek; sıra açıklanamadı |

- Hesap hatası bulunmadı. Sorun, yöntemin uçtan uca değişmesi ve iki uçta belge ile verinin çelişmesi.
- Ürün: düğüm satırlarına yöntem etiketi ve açıklama kutusu eklendi (hesap yok). Listeler birleştirilmiyor; Bilgi Bankası anahtarları zaten ayrı.
- Yeni gerçek Roxy çağrısı: 0.

## 6.1B — Dasha "bugün" rozeti

- **Kullanım yeri:** `VedicPanels.tsx` → `DashaTimeline`. Tek bileşen; Vedik (Lahiri) dasha ve KP dasha, her düzeyde (maha / antar / pratyantar), çalışma alanı ve kayıtlı analizde aynı.
- **Kök neden:** rozet `absolute -top-4 -translate-x-1/2` ile çubuğun 16 px üstüne taşıyordu. İç içe düzeylerde bu alan düzey başlığına ("Antardasha · Ay (Ch…") denk geliyor ve başlığı örtüyordu. Uçlarda (%0 / %100'e yakın) rozetin yarısı kapsayıcı dışına çıkabiliyordu.
- **Düzeltme:** rozet yalnız "bugün" çizgisi varken açılan 16 px'lik kendi satırına alındı. Çizgi yalnız çubuğun üzerinde. Yatay hizalama `todayShift`: %8'in altında sola, %92'nin üstünde sağa, arada ortalı. Rozet gizlenmedi; hesaplama değişmedi (test: teknik çıktı golden'la aynı).
- **Tarayıcı:** yerel `next start` + sahte arka uç, Chrome, aynı kökenli iframe. Profil "Ali Örnek — natal"; Vimshottari (Lahiri) ve KP dasha; Ay → antardasha → Rahu → pratyantardasha açık.
  - 390, 768, 1440 px'te her iki teknik × 3 düzey: rozet kapsayıcı içinde, çubuğun üstünde, başlıkla çakışma yok.
  - Dasha panelinde yatay taşma 0; taşan öğe 0 (tablo kendi kaydırma alanında, Aşama 5.1 davranışı).
  - Masaüstü ve 390 px görüntüleri incelendi: başlık tam okunuyor, 390 px'te başlık sarılıyor, rozet ayrı satırda.

## 6.1C — KP sınırlarının sunumu

- **KP transit:**
  - Seçicide ve sekmede "(kısmi)"; ipucu "natal ev analizi yok".
  - Panelde "Kısmi destek" bandı; çalışma alanı ve kayıtlı analiz aynı `TechniqueTechnical` bileşenini kullanıyor.
  - Natal cusp, Placidus ev sütunu ve significator gösterilmiyor (test).
- **Olay zamanlaması:**
  - KP dasha bandı kısaltıldı: "Olay tahmini değildir. … Roxy KP olay zamanlaması (ev grubu → dönem) sunmaz, Yaşam Sistemi de üretmez".
  - Teknik çıktıda olay/tarih eşleştiren bir alan yok (test).
  - Roxy "dönem gücü" bloğu: başlık "lordun gösterdiği evlere bağ derecesi; olay olasılığı veya olumluluk DEĞİLDİR"; İngilizce `strong` vb. → "güçlü bağ" vb. Yalnız yorum katmanında.
- **Rahu/Ketu:** belirsiz yöntemler "doğrulandı" diye sunulmuyor. Ruling satırında "Belgelenmemiş; tek örnek", ajan kuralında "kısmen belirsiz" metni görünür (test).
- Test: `phase61.harness.ts` 17/17 (6.1A 10, 6.1B 3, 6.1C 4).

## 6.1D — Regresyon

- **Yeni KB ayrımı testi:**
  - Haritada `kp_significator:<düğüm>:<ev>` yalnız sade evlerden üretiliyor; dasha'da `kp_dasha_signifies:<düğüm>:<ev>` ajan ekli evlerden. Türler ve bölümler ayrı.
  - Vedik `dasha_mahadasha:*` KP dasha'ya karışmıyor, KP anahtarı Vedik dasha'ya karışmıyor.
  - Toplam: `phase61` **18/18**.
- **Astroloji tamamı:** 39 / 21 / 17 / 37 / 20 / 15 / 33 / 26 / **19** (15 varga golden) / 36 / **18** / 10 + PostgreSQL migration kontrolü geçti.
  - tsc 0, eslint 0, next build başarılı.
- **Mutasyon:**
  - Yeni `mutate61.cjs`: **17/17** (yanlış yöntem etiketi ×3, belirsizlik metni ×2, etiketin kaldırılması / yanlış satıra basılması ×4, horary "+" eki, rozet eski konum / hizalama / gizleme ×3, olay uyarısı, KISMİ bandı, güç etiketi ×2).
  - Önceki: mutate5 14/14 · mutate51 (B2 hariç) 22/22 · mutate52 18/18 · mutate6 19/20 (kalan K2 eşdeğer, Aşama 6'dan beri aynı).
- **Astroloji dışı regresyon:** HD Roxy 220/0, HD info-panel 65/0, output-visibility 205/0, infra 43/0, admin-hygiene 55/0.
  - Önceden var olan başarısızlıklar değişmedi: backup 53/1, faz1-p3 94/4.

## 6.1E — Güvenlik ve kapanış

- **Kapsam:** Bu aşamadaki değişiklikler yalnız arayüz etiketi/metni ve test.
  - Teknik şema, adaptör, önbellek anahtarı ve anlık görüntü değişmedi.
  - Eski kayıtlı analizler etiketleri teknik adından türetilmiş olarak gösterir. Yeniden açılış 0 istek (phase6 6I; routes KP HTTP testi).
- **Güvenlik testleri (paketin parçası, hepsi geçti):**
  - Owner-only 404 ve tenant 404.
  - Önizlemede houseThemes, kpStrength, ham yanıt ve anahtar yok.
  - Yorum yetkisi kapısı.
  - Önbellek ayrımı (KP ↔ Vedik dasha aynı yol, ayrı anahtar).
  - Bozuk yanıtta fail-closed (phase6, 20 vakadan fazla).
- **İstemci paketi taraması:**
  - raw_response, ROXY_API_KEY, astro_analyses, calcInputHash, input_hash ve sahte anahtar: 0.
  - Tema içeriği: 0.
- **Tarayıcı (son derleme, 390 px):** 5 KP sekmesinde yatay taşma 0, taşan etiket 0.
  - Düğüm etiketleri: harita 2, dasha 2, ruling 1, horary 2; transit 0.
  - Ruling ekranı masaüstü görüntüsüyle incelendi.
- **Gerçek Roxy çağrısı:** 0 yeni (toplam **44**).
- **Bulgular:** P0 = 0 · P1 = 0 · P2 = 0. P3:
  - Roxy düğüm yöntemi tutarsızlığı devam ediyor (sağlayıcı kaynaklı; etiketli, güvenli).
  - Ruling Ketu sıra kuralı açıklanamadı.
  - Ajan "bakış" kapsamı kısmen belirsiz.
- **Kalan doğrulanmamış konular:** rapor §5. Gidermek için en fazla 3 yeni sentetik golden gerekir; owner onayı olmadan yapılmadı.

**Aşama 6.1 yerel olarak mühürlendi.** Push / preview / merge / production / migration YOK. DUR.
