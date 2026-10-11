# ASTROLOJİ AŞAMA 9A — DÖRT P2 BULGUSUNUN KAPATILMASI

- Başlangıç HEAD: `428b193d` (9A denetim raporu) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`.
- Production / Frankfurt / Tokyo: **dokunulmadı**. Push / merge / deploy / migration: **yok** (yeni migration da yok).
  Human Design ve diğer mühürlü modüller: **değişmedi** (statik izolasyon testi).
- Gerçek Roxy çağrısı: owner izni **en fazla 10 ek (üst sınır 57)**. Kullanılan: **3** → toplam **50**, kalan bütçe **7**.
  Çağrılar tek tek, yeniden denemesiz, paralel değil; sayaç her çağrıdan ÖNCE artırıldı (`scripts/astrology/fixtures/golden9a/roxy-call-ledger-9a.json`).

## Gerçek çağrı defteri (Aşama 9A)

| # | Ad | Uç nokta | Amaç | Sonuç | Toplam |
|---|---|---|---|---|---|
| R1 | ruling-istanbul-baseline | `/vedic-astrology/kp/ruling-planets` | Mevcut golden gövdesiyle birebir (İstanbul, doğum verili) → sağlayıcı kararlılığı | HTTP 200; yanıt mevcut golden ile metin alanları dışında **birebir** | 48 |
| R2 | ruling-newyork-same-birth | aynı | Gövde birebir, YALNIZ lat/lon = New York | HTTP 200; **natal significator'lar değişti** (Güneş [9,3,6,11]→[12,6,9,2], Mars [9,6,2,7]→[12,9,5,10], Ketu değişti) | 49 |
| R3 | ruling-newyork-no-birth | aynı | New York, doğum verisi YOK (yeni istek biçimi) | HTTP 200; ruling alanları R2 ile **birebir**, `significators`/`houseThemes`/`focus` yok | 50 |

Maliyet: 3 standart istek (Roxy kotasından; ortak HD anahtarı). R1 ayrıca kaydedilmedi (mevcut golden ile aynı); R2/R3 kanıt fixture'ı olarak `fixtures/golden9a/`.

## P2-01 — Vedik/KP zodyak etiketi → **PASS**
- **Önceki:** `techniqueView.ts:197` her teknikte `zodiac:"tropical"`; Vedik/KP `method_snapshot.zodiac` "tropical" kaydediliyor, önizleme ve kaydetme özeti "Tropikal".
- **Gerçek yöntem:** bağımsız denetimle (9A Ek A) Vedik = tropikal − Lahiri (sidereal), KP = KP ayanamsa (sidereal); Vedik/KP teknik katmanı zaten `zodiac:"sidereal"` taşıyor.
- **Düzeltme:**
  - `zodiacOfTechnique(technique, technical)` zodyağı gelenekten türetir. Teknik katmanın kendi `zodiac` alanıyla uyuşmazsa **hata fırlatır**; sessizce etiketlemez.
  - Görünüm, snapshot ve önizleme bu değeri kullanır.
  - UI kaydetme özeti sunucunun zodyağını gösterir.
  - Eski kayıtlar DB'de değiştirilmedi; rapor ve kayıtlı analiz görünümü zaten zodyağı teknikten gösteriyor.
- **Dosyalar:** `lib/astrology/view/techniqueView.ts`, `lib/astrology/analyses/service.ts`, `app/admin/astroloji/_components/AnalysisWorkspace.tsx`.
- **Kanıt:** p2fix9a testleri (21 teknik × gelenek, golden projeksiyonu, önizleme + yeni snapshot sidereal/tropical, eski kayıt aynen + rapor doğru, UI). Mutasyon `zodiac_tropical` → 2 FAIL (yakalandı).

## P2-02 — Roxy çağrı güvenliği → **PASS**
- **Önceki:**
  - Uçuştaki istek kilidi 25 sn, oysa en kötü çağrı 45 sn sürüyordu.
  - Kilit alındıktan sonra önbellek yeniden kontrol edilmiyordu.
  - `engine/run` için süre bütçesi ve `maxDuration` yoktu.
- **Düzeltme:**
  1. **En kötü çağrı süresi** artık sabitlerden hesaplanıyor: `ASTRO_ROXY_WORST_CALL_MS = (1+retry) × 20 sn + 5 sn = 45 sn`. İstemci her denemeyi kendi zaman aşımıyla keser, bu yüzden bundan uzun süremez. Yeniden deneme yalnız 429/503 için ve en fazla 1 kez; ağ hatası, zaman aşımı ve 5xx yeniden denenmez.
  2. **Kilit penceresi** = 2 × en kötü çağrı = **90 sn**. Kilidi alan çağrı, kilit düşmeden önce mutlaka biter (ya tamamlanır ya kesilir) ve sonucu kaydeder. Kilidin süresi dolduğunda hâlâ çalışan bir çağrı kalamaz.
  3. **Kilit alındıktan sonra önbellek yeniden okunur:** Planlamadan beri çift tık, ikinci sekme veya başka bir instance hesabı tamamladıysa sağlayıcı ikinci kez çağrılmaz.
  4. **Çalıştırma süre bütçesi:** route `maxDuration = 300`, bütçe 240 sn. Yeni çağrı ancak "geçen süre + 45 + 10 sn" bütçeye sığıyorsa başlatılır; sığmıyorsa `RUN_TIME_BUDGET` döner. Tamamlananlar kayıtlıdır, yeniden çalıştırmada yalnız eksikler çağrılır. Platform fonksiyonu çağrının ortasında kesmez.
  5. Rate limit, yetki ve önbellek kuralları değişmedi.
- **Bilinçli davranış:** Başarısız bir çağrıdan sonra aynı hesap 90 sn boyunca tekrar başlatılamaz (409 "sürüyor"). DB tabanlı kilit açıkça bırakılamıyor; bu süre ikinci ücretli çağrıyı önlemenin bedeli.
- **Dosyalar:** `lib/astrology/config.ts`, `lib/astrology/providers/roxy/client.ts` (sabitler config'den), `lib/astrology/engine/service.ts`, `app/api/{admin/,}astroloji/engine/run/route.ts`, `scripts/astrology/static.harness.ts` (aynada `maxDuration`).
- **Kanıt** (sahte sağlayıcı, gerçek çağrı yok):
  - Eşzamanlı iki istek → 1 çağrı.
  - Kilit süresi dolduktan sonra gelen istek → 0 çağrı.
  - Bekleyen istek → 0 çağrı + 409.
  - Bütçe testi → 4 birimden 2'si çağrıldı, ikinci çalıştırmada yalnız eksik 2'si çağrıldı.
  - İstemci: ağ hatası / 500 / zaman aşımı → 1 deneme; 503 → 2 deneme.
  - Mutasyonlar `no_recheck`, `lock_25s`, `no_budget` → hepsi yakalandı.

## P2-03 — Uzman başına kapasite koruması → **PASS**
- **Önceki:** Profil, KB, not ve analiz yazımında kota ya da hız sınırı yoktu. KB snapshot 2 MB'ı aşınca 500 dönüyordu.
- **Mevcut kurallar incelendi:**
  - DB CHECK'leri: KB ve not gövdesi 20 000 karakter, analiz teknik katmanı ≤1 MB, KB snapshot ≤2 MB, yorum ≤1 MB.
  - Global atomik oran limiti: `hitDbRateLimit` / `auth_rate_limit_hit` (register, destek ve HD ile aynı).
  - Kapasite: Supabase Free 500 MB, prod 128,5 MB; "dolu" bir uzman diğer modüllerde ≈122 MB.
  - Ölçüm: teknik snapshot ortalama ~11 KB (en büyük ~27 KB), yorum ≤ ~100 KB.
- **Düzeltme:** `lib/astrology/limits.ts`. Yeni modül değil; mevcut oran limiti ve sayım kullanılıyor.

  | Koruma | Değer | Gerekçe |
  |---|---|---|
  | Ortak yazma hızı | 120 / 10 dk, uzman başına | Elle kullanım dakikada birkaç yazma üretir |
  | Kayıtlı analiz | 200 / gün | Yoğun gün ≈ 50 |
  | Kayıt tavanları | profil 2000 · analiz 3000 · KB 1000 · not 10000 | Yalnız YENİ kayıtta uygulanır |
  | Tek analize kopyalanan KB snapshot | 1,5 MB üstü → **413** (eskiden 500) | DB sınırının (2 MB) altında anlaşılır hata |

- **Erişim ve izolasyon:**
  - Okuma, güncelleme ve SİLME sınırlanmaz; uzman kendi kayıtlarına erişir ve yer açabilir.
  - Kova uzman (tenant + kullanıcı) bazlı; başka uzman ve tenant etkilenmez.
  - Koruma yetki kapısından SONRA çalışır; yetkisiz istek yine 404 alır.
- **Eşzamanlılık:**
  - Oran limiti DB'de atomik: 140 eşzamanlı istekten tam 120'si geçti.
  - Sayı tavanı "say → ekle" olduğu için en çok o anki eşzamanlı istek kadar aşılabilir (birkaç kayıt). Belgelendi; kalıcı büyümeyi değiştirmez.
- **En kötü durum:** analiz 3000 × ~60 KB ≈ 180 MB'a ancak ≥15 günde ulaşılabilir (günlük tavan nedeniyle). **Owner kararı:** Supabase Free'de kalınacaksa analiz tavanı düşürülebilir (tek sabit).
- **Dosyalar:** `lib/astrology/limits.ts` (yeni), `app/api/admin/astroloji/{profiles,profiles/[id]/revisions,kb,kb/[id],notes,analyses}/route.ts`, `lib/astrology/analyses/service.ts`, static (server-only listesi).
- **Kanıt:** gerçek route'larla 120/121 sınırı, 140 eşzamanlı istekten 120'si geçti, KB tavanı (güncelleme/silme serbest, silince yer açılıyor), profil/analiz/not tavanları, kapı → koruma sırası, 413. Mutasyonlar `kb_no_limit` → 3, `kb_snapshot_unbounded` → 1 FAIL (yakalandı).

## P2-04 — KP ruling konum ayrımı → **PASS** (hata gerçek çağrıyla doğrulandı ve düzeltildi)
- **Önceki:** Farklı gözlem yeri seçilince tek lat/lon + doğum tarih/saati gönderiliyordu. Belirsizdi: hata mı değil mi?
- **Sağlayıcı sözleşmesi:** Roxy belgesinde bu uçta yalnız TEK `latitude/longitude/timezone` var; `birthDate`/`birthTime` yalnız significator ekler, ayrı doğum konumu parametresi yok (roxyapi.com KP rehberi / ruling planets yazısı).
- **Gerçek davranış (R2):** Yalnız konum değişince natal significator'lar değişti. Sağlayıcı natal haritayı **gözlem yerinde** kuruyor.
  - Konuma bağlı alanlar: gün lordu (gün doğumu), Lagna lordları, ruling planets kümesi ve natal significator'lar.
  - Konumdan bağımsız alanlar: Ay lordları.
  - Ruling alanları doğum verisinden bağımsız (R3 = R2).
- **Düzeltme:**
  - Gözlem yeri ≠ doğum yeri → doğum verisi gönderilmez. Ruling planets doğru, yanlış significator alınmaz (`significatorsOmitted:"place_differs"`), UI ve raporda açıklama gösterilir.
  - Doğum yerinde gövde aynen (golden birebir).
  - Doğum verisiz istekte significator gelirse projeksiyon reddeder.
  - Eski farklı-yer kayıtları değiştirilmedi; UI ve raporda uyarı gösterilir.
- **Dosyalar:** `lib/astrology/providers/roxy/{requests,kp}.ts`, `lib/astrology/model/kp.ts`, `lib/astrology/engine/techniques.ts`, `app/admin/astroloji/_components/{KpPanels,TimingPanels}.tsx`, `lib/astrology/report/model.ts`, `scripts/astrology/fixtures/golden9a/*`.
- **Kanıt:** R1–R3 karşılaştırması; istek gövdeleri (golden ve R3 ile birebir); projeksiyon kabul/ret; rapor ve UI. Mutasyon `ruling_send_birth` → yakalandı.

## Regresyon
- `npm run test:astrology`: **461 PASS / 0 FAIL** (önceki 440 + p2fix9a 21). PG senaryoları PASS (7A çakışması beklenen başarısızlık).
- 25 teknik hesap sonucu korundu: 47 golden'ın projeksiyonu düzeltme öncesi çıktıyla **birebir** (47/47, 0 fark).
- İzolasyon, yorum açık/kapalı ve Word/PDF: perm7c 16/0, report8 72/0.
- `tsc` temiz; `next build` başarılı. Tek uyarı `globals.css @theme` (main'den).
