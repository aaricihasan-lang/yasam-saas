# ASTROLOJİ AŞAMA 9B — SATIŞ ÖNCESİ UÇTAN UCA KULLANICI VE GÜVENLİK TESTLERİ

- Tarih: 2026-10-10 · Worktree `C:/yasam-astrology-roxy` · Branch `work/astrology-roxy`.
- **Başlangıç SHA:** `a4c44d0f`. **Bitiş SHA:** bu raporun commit'i. Uygulama kodu **değiştirilmedi**; yalnız bu rapor commit edildi.
- Production / Frankfurt / Tokyo: **dokunulmadı**. Push / merge / deploy / migration: **yok**.
- Gerçek Roxy çağrısı: **0**; toplam **50**, kalan bütçe 7 kullanılmadı. Yerel sahte Roxy'ye giden istek: 4 (HTTPS, `127.0.0.1`, sahte anahtar).
- Gerçek danışan verisi: **yok**. Sentetik owner + 2 uzman + demo hesap + owner olmayan admin kullanıldı.
- Başka oturumların süreçlerine ve açık kullanıcı belgelerine dokunulmadı. Durdurulan süreçlerin hepsi bu worktree'ye aitti.

## Yöntem ve ortam
- **Tarayıcı:** Yerel `next start` + sahte PostgREST + yerel HTTPS sahte Roxy (golden yanıtlar). Arka uç, depodaki `dev-fake-backend`'in scratchpad kopyası; ikinci uzman ve demo hesap eklendi, depo değiştirilmedi. Chrome'da gerçek tıklama ve yazma; 1280 px ve 390 px görünümler iframe ile ölçüldü.
- **API:** Aynı sunucuya oturum başlıklarıyla `curl`.
- **Ölçüm harness'i (scratchpad, depo dışı):** Gerçek route handler'lar + sahte PostgREST + sahte sağlayıcı. Tavan sınırları, eşzamanlı aşım, satır boyutu, zaman aşımı/kilit, yavaş yanıt. Sonuç **7/7 PASS**; ölçümler aşağıda.
- **Bellek:** 16 GB makinede başka oturumların ağır işleri çalışıyordu.
  - Bir ara boş bellek 1,7 GB'a düştü ve yerel Next sunucum kapandı (dış etken). Bellek 3 GB'ın üstüne çıkınca yeniden başlattım.
  - Ağır işler sırayla çalıştı; `next build` boş bellek >2,5 GB koşuluyla ve 4 GB yığın sınırıyla.

## 1. Admin ve uzman senaryoları

| # | Senaryo | Sonuç | Kanıt |
|---|---|---|---|
| 1.1 | Owner'ın erişimi (admin yüzeyi) | **PASS** | `/api/admin/astroloji/access` 200 |
| 1.2 | Owner olmayan admin | **PASS** | 404 |
| 1.3 | Yetkisi kapalı uzman: Hub kartı yok | **PASS** | Tarayıcı: kart yok |
| 1.4 | Yetkisi kapalı uzman: API | **PASS** | `access` + `profiles` 404 |
| 1.5 | Yetki açılınca kart ve çalışma alanı açılıyor | **PASS** | Tarayıcı: kart var; `/astroloji` açıldı; `access` 200 (yorum kapalı) |
| 1.6 | Yetki kaldırılınca API kesiliyor | **PASS** | Aynı oturumla `access` / `profiles` 404 |
| 1.7 | Roxy yorum yetkisi bağımsız açılıp kapanıyor | **PASS** | `providerInterpretations` true ↔ false; ekranda rozet ve yorum metni buna göre değişiyor |
| 1.8 | Uzmanlar arası izolasyon (aynı tenant) | **PASS** | Uzman 1 → uzman 2'nin analizi 404, raporu 404, profil listesinde yok; uzman 2 kendi analizini 200 alıyor |
| 1.9 | Demo hesap (bayrak açık olsa da) | **PASS** | API 404; Hub kartı yok; `/astroloji` "Yetkiniz Bulunmuyor" |

## 2. Kayıt ve analiz akışları

| # | Senaryo | Sonuç | Kanıt |
|---|---|---|---|
| 2.1 | Profil oluşturma (UI formu) | **PASS** | "Şükran Ilgın Öztürk — 9B test" oluşturuldu. 1990 İstanbul yaz saati UTC+03:00 doğru. Saat alanı eksikken form doğru şekilde reddetti ("Doğum saati gerekli") |
| 2.2 | Profil düzenleme (revizyon) | **PASS** (harness) | phase2/7a revizyon testleri; UI "Doğum bilgisini düzelt" düğmesi mevcut |
| 2.3 | Arama ve filtreleme | **PASS** | Etkin/Arşiv filtresi UI'da çalıştı; Türkçe-duyarsız arama 7B harness'i |
| 2.4 | Analiz oluşturma (UI, Natal + Vedik D1 + KP) | **PASS** | Plan "3 yeni istek"; çift tıkla bile sahte Roxy'ye **3** istek gitti; tekrar "0 yeni / 3 kayıttan" |
| 2.5 | Kaydetme özeti: zodyak | **PASS** | Natal "Tropikal", Vedik D1 "Sidereal (nirayana)", KP "Sidereal (KP)" (9A-P2-01 düzeltmesi UI'da görüldü) |
| 2.6 | Kaydetme ve yeniden açma | **PASS** | 3 analiz kaydedildi ve açıldı |
| 2.7 | Batı / Vedik / KP ayrımı | **PASS** | Liste sekmeleri: Tümü (3) / Batı (1) / Vedik (1) / KP (1) |
| 2.8 | Sinastri / kompozit | **PASS** | Uzman Danışanı & Şükran sinastrisi hesaplandı ve kaydedildi; kompozit harness'te (report8/7b) |
| 2.9 | Uzman notu (UI) | **PASS** | Türkçe notlu kayıt, özette "1 not bölümü" |
| 2.10 | Bilgi Bankası (UI) | **PASS** | "+ Yeni bilgi" ile kayıt oluşturuldu, listede Türkçe doğru |
| 2.11 | Arşivleme / geri alma | **PASS** | Arşivleme onay penceresiyle yapıldı; API'de etkin 0 / arşiv 1. Geri alındı: etkin 1 / arşiv 0 |
| 2.12 | Tekli kalıcı silme: iki ayrı onay | **PASS** | UI: "Onay 1/2" (sayılar + korunacak ortak analiz) → "Onay 2/2" (geri alınamaz) → "Profil ve 3 kayıtlı analizi kalıcı olarak silindi; 1 ortak analiz korundu." |
| 2.13 | Toplu kalıcı silme: üç ayrı onay | **PASS** | UI: Onay 1/3 → 2/3 → 3/3 → "2 profil … silindi" |
| 2.14 | Ortak analizin değişmemesi | **PASS** | Sinastri `technical`/`profile`/`method` md5 silme öncesi ve sonrası **aynı**; karşı taraf etiketi snapshot'ta korunuyor; ortak analizin raporu 200; silinen profil 404 |
| 2.15 | Danışan Yolculuğu rozeti | **PASS** | DY danışan sayfası: "Astroloji analizi mevcut (2)". Yetki kapatılınca rozetin gizlenmesi 7C'de doğrulanmıştı |

## 3. Roxy ve kapasite korumaları (sahte sağlayıcı)

| # | Senaryo | Sonuç | Kanıt |
|---|---|---|---|
| 3.1 | Aynı hesap için eşzamanlı istek / çift tık | **PASS** | UI çift tık → 3 istek (yinelenen yok); harness: 2 eşzamanlı yavaş istek → sağlayıcı 1 kez |
| 3.2 | Yavaş yanıt | **PASS** | İkinci istek bekleyip önbellekten aldı |
| 3.3 | Zaman aşımı | **PASS** | Hata döndü, sonuç kaydedilmedi |
| 3.4 | 90 sn kilit | **PASS** | Zaman aşımından sonra 90 sn boyunca yeniden başlatma 409, sağlayıcı çağrılmadı; pencere sonrası tek çağrı |
| 3.5 | Tekrarlanan hesapta önbellek | **PASS** | 0 çağrı (UI ve harness) |
| 3.6 | 300 sn hesaplama bütçesi | **PASS** | p2fix9a: bütçeye sığmayan birim başlatılmıyor, yeniden çalıştırmada yalnız eksikler çağrılıyor |
| 3.7 | Yazma hız sınırı | **PASS** | 120 kabul, 121. → 429; eşzamanlı 150 → tam 120 kabul (atomik) |
| 3.8 | Kayıt boyutu sınırı | **PASS** | KB/not 20 000 karakter (DB CHECK); analize kopyalanan KB > 1,5 MB → 413 |
| 3.9 | Tavan sınırları (tam değerde) | **PASS** | Profil 1999→2000 kabul, 2001. → 409; analiz 2999→3000; KB 999→1000; not 9999→10000 (gerçek route'lar) |
| 3.10 | Eşzamanlı isteklerle tavan aşımı | **ÖLÇÜLDÜ → bulgu** | Aşağıdaki tablo; **9B-P3-01** |

**Eşzamanlı tavan aşımı ölçümü** (tavan−1 kayıttayken N eşzamanlı oluşturma isteği; gerçek route + sahte PostgREST):

| Tablo | N=10 | N=50 | N=120 | N=150 |
|---|---|---|---|---|
| Profil (tavan 2000) | +8 | +48 | +118 | +119 (30 adet 429) |
| Bilgi Bankası (tavan 1000) | +8 | +48 | +118 | +119 |
| Kayıtlı analiz (tavan 3000) | +8 | +48 | +118 | +119 |

- Sayı kontrolü atomik değil: eşzamanlı istekler aynı sayıyı görüyor.
- Aşım, yazma hız sınırıyla en fazla **≈119 kayıt / tablo** ile sınırlı ve tek seferlik. Sonraki pencerede sayı tavanın üstünde olduğu için yeni kayıt reddediliyor.

**Supabase kapasitesine gerçek etkisi** (ölçülen satır boyutları, JSON bayt):

| Ölçüm | Değer |
|---|---|
| En büyük KB satırı (20 000 karakter Türkçe) | 29 968 bayt |
| Tipik kayıtlı analiz (KB'siz, Roxy yorumlu natal) | 0,03 MB |
| **En büyük kabul edilen analiz** (eşleşen KB 1,5 MB sınırının hemen altında) | **1,43 MB** (kb_snapshot 1,40 MB) |
| Aşım etkisi, analiz (119 ek satır) | tipik 3,97 MB · en kötü **170 MB** |
| Aşım etkisi, KB (119 × 30 KB) | ≈ 3,6 MB |
| **Sınırlar İÇİNDE** günlük analiz (200 × en büyük) | **≈ 286 MB / gün** (tipik 6,7 MB / gün) |
| KB tavanı dolu (1000 × en büyük) | ≈ 28,6 MB |
| Analiz tavanı dolu (3000 × tipik / en büyük) | 100 MB / **≈ 4,3 GB** |

- Ölçümler JSON bayttır. PostgreSQL TOAST sıkıştırması doğal metinde boyutu yaklaşık 2–3 kat azaltabilir; bu gerçek DB'de **ölçülmedi**.
- Prod DB 128,5 MB; Supabase Free sınırı 500 MB.
- **Kapasite riski tavan aşımından değil, kayıtlı analize kopyalanan Bilgi Bankası içeriğinden geliyor** (bkz. **9B-P2-01**). Aşım, bu nedenle en kötü durumda 170 MB'a çıkıyor.

## 4. Word / PDF ve mobil

| # | Senaryo | Sonuç | Kanıt |
|---|---|---|---|
| 4.1 | Kayıtlı analizden gerçek Word / PDF (UI düğmeleri) | **PASS** | Word: `PK` başlığı, ~158 KB; PDF: `%PDF-`, ~156 KB. ASCII dosya adı |
| 4.2 | Yorum yetkisi kapalıyken raporda yorum yok | **PASS** | Uzman 2'nin Roxy yorumlu analizi: yetki açık → Word ve PDF'te "Roxy otomatik yorumu" + anlatı var; kapalı → ikisinde de yok |
| 4.3 | Başka uzmanın raporu indirilemiyor | **PASS** | Uzman 1 → uzman 2 raporu 404 |
| 4.4 | Rapor tarihi | **FAIL → 9B-P2-02** | 10.10.2026 00:03 (İstanbul) kaydedilen analiz: kapakta ve "Kayıt tarihi"nde 09.10.2026, dosya adında 2026-10-09; başlıkta doğru tarih var |
| 4.5 | Masaüstü 1280 px | **PASS** | Ana sayfa, profil, kayıtlı analiz, silme ve danışan ön izleme pencereleri: yatay taşma 0, düğme çakışması 0, pencereler ekrana sığıyor |
| 4.6 | Mobil 390 px | **PASS** | Aynı ekranlar: taşma 0, çakışma 0. Silme penceresi 12–363 px aralığında ve okunabilir (görsel kontrol). Gezegen tablosu okunur; ek sütunlar yatay kaydırılan kap içinde |
| 4.7 | Mobilde Word/PDF düğmeleri | **PASS** | 390 px'te gizli; 1280 px'te görünür |
| 4.8 | Android'de düğmelerin gizlenmesi (sunucu + SSR) | **PASS (sunucu düzeyi)** | Android Chrome UA → `<html data-android>`; WebView UA → `data-android data-android-app`; CSS `.no-android` gizler; Word/PDF API 403 |
| 4.9 | Android gerçek cihaz | **DOĞRULANAMADI** | Gerçek cihaz veya emülatör yok. PASS sayılmadı |

## 5. Son regresyon

| Paket | Sonuç |
|---|---|
| `npm run test:astrology` (19 harness) | **461 PASS / 0 FAIL / 0 atlanan** (rapor commit'inden ÖNCE; sonrasında statik kapsam testi 14/1 → 9B-P3-03) |
| PostgreSQL migration senaryoları | 5/5 PASS (biri beklenen başarısızlık: 7A çakışma) |
| 9B ölçüm harness'i (scratchpad) | 7/7 PASS |
| Üye Yönetimi faz1 unit / route | 149 / 250 PASS |
| Üye Yönetimi faz2 unit / hub / entegrasyon | 106 / 46 / 119 PASS |
| auth-session P0 | 19 PASS |
| Typecheck (`tsc --noEmit`) | temiz |
| `next build` | başarılı (tek uyarı `globals.css @theme`, main'den) |
| Roxy çağrı sayacı | **50** (`fixtures/golden9a/roxy-call-ledger-9a.json`; bu aşamada değişmedi) |

Not: Üye Yönetimi route testi ilk denemede embedded-postgres'in "pre-existing shared memory block" hatasıyla başlamadı. Neden, bu worktree'nin önceki bir testinden kalan iki sahipsiz `postgres io_worker` süreciydi. Yalnız bu worktree'ye ait ikisi durduruldu (diğer worktree'lerinkine dokunulmadı) ve test 250/0 geçti. Ürün hatası değil.

## 6. Bulgular

**P0: yok. P1: yok.**

### Yeni bulgular

**9B-P2-01 · Kapasite: Bilgi Bankası snapshot'ı her kayıtlı analize kopyalanıyor; sınırlar içinde günlük ~286 MB büyüme mümkün**

| Alan | Bilgi |
|---|---|
| Bileşen | Kayıtlı analiz (`kb_snapshot`), kapasite koruması |
| Dosya | `lib/astrology/analyses/service.ts` (buildSnapshot: eşleşen KB kayıtlarının tam metni kopyalanır; tek sınır 1,5 MB / analiz); `lib/astrology/limits.ts:13` (gerekçe "~60 KB / analiz" varsayımına dayanıyor) |
| Tekrarlama | 1) Uzman, aynı konulara bağlı ~50 Bilgi Bankası kaydı (her biri 20 000 karakter) oluşturur. 2) Bu konuları içeren tekniği hesaplayıp kaydeder (günde 200'e kadar, sınırlar içinde) |
| Beklenen | Sınırlar içinde bir uzmanın DB büyümesi, Supabase kapasitesini günler içinde dolduramamalı |
| Gerçek | Analiz satırı 1,43 MB (ölçüldü). 200 / gün × 1,43 MB ≈ 286 MB / gün JSON. TOAST 2–3 kat sıkıştırsa bile ≈ 95–140 MB / gün; Free'de kalan ~370 MB 3–4 günde dolar. Analiz tavanı dolunca teorik ≈ 4,3 GB |
| Kanıt | 9B ölçüm harness'i (scratchpad `e2e9b-output.txt`): "en büyük kabul edilen analiz satırı 1.43 MB (kb_snapshot 1.40 MB)" |
| Not | **9A-P2-03'ün kapanış gerekçesi eksik kaldı**: KB kopyalanma etkisi hesaba katılmamıştı. Bu bir hesap hatası değil; kapasite varsayımı yanlıştı |
| Öneri | (a) Analiz başına KB snapshot sınırını düşürmek (ör. 100–200 KB), ve/veya (b) uzman başına günlük **bayt** bütçesi (mevcut oran limiti altyapısıyla), ve/veya (c) KB snapshot'ını içerik özeti (hash) ile tekrar kullanmak. Owner kararı ve plan seçimi gerekir (Supabase Free / Pro) |
| Canlıya çıkış riski | Kötü niyetli veya çok yoğun tek bir uzman ortak DB kotasını doldurabilir; tüm tenant'ların yazmaları etkilenir. Supabase Pro'da (8 GB) risk azalır ama ortadan kalkmaz |

**9B-P2-02 · Word/PDF raporunda tarih UTC'ye göre; 00:00–03:00 (TR) arası kaydedilen analiz bir önceki günü gösteriyor**

| Alan | Bilgi |
|---|---|
| Bileşen | Word/PDF raporu (Aşama 8) |
| Dosya / satır | `lib/astrology/report/model.ts:965` (`"Kayıt tarihi", dateTr(a.analysisAt)`), `:972` (kapak tarihi), `:977` (dosya adı `a.analysisAt.slice(0, 10)`). `dateTr` ISO dizgesinin ilk 10 karakterini (UTC gün) alıyor |
| Tekrarlama | Analizi 00:00–03:00 İstanbul saatinde kaydet, Word/PDF indir |
| Beklenen | Rapor tarihi, analiz başlığındaki İstanbul tarihiyle aynı (başlık `fmtDateTr`, Europe/Istanbul) |
| Gerçek | Kayıt `2026-10-09T21:03:55Z` (= 10.10.2026 00:03 TR). Rapor: "Analiz tarihi: 09.10.2026", "Kayıt tarihi 09.10.2026", dosya `…-2026-10-09.pdf`. Aynı belgenin başlığında 10.10.2026 |
| Kanıt | Tarayıcıdan indirilen dosya adı `Astroloji-Sukran-Ilgin-Ozturk-9B-test-Natal-2026-10-09.docx` (başlık "… 10.10.2026"); PDF metin çıkarımı |
| Öneri | Rapor tarihleri ve dosya adı için mevcut `lib/time/reportTime` (Europe/Istanbul gün anahtarı) veya `fmtDateTr` kullanılmalı; test eklenmeli. Küçük düzeltme |
| Canlıya çıkış riski | Danışana giden profesyonel belgede yanlış tarih ve belge içi tutarsızlık; günde 3 saatlik pencerede tekrarlanabilir |

**9B-P3-01 · Kayıt tavanı eşzamanlı isteklerle tek seferlik ≤119 kayıt aşılabiliyor**

| Alan | Bilgi |
|---|---|
| Dosya | `lib/astrology/limits.ts` (`enforceAstroWrite`: say → ekle, atomik değil) |
| Kanıt | Bölüm 3 tablosu: tavan−1'de 120 / 150 eşzamanlı istek → +118 / +119 |
| Etki | Profil ≈ 0,4 MB, KB ≈ 3,6 MB, analiz tipik 4 MB / en kötü 170 MB (en kötü değer 9B-P2-01 nedeniyle) |
| Öneri | Sayım + ekleme DB'de atomik (RPC + advisory lock veya trigger; migration gerekir) ya da 9B-P2-01 düzeltilince kabul edilebilir |
| Risk | 9B-P2-01 düzeltilirse düşük |

**9B-P3-03 · Statik test kapsam izin listesi bu raporu tanımıyor (test altyapısı)**
- Bu rapor commit edildikten sonra `scripts/astrology/static.harness.ts` "kapsam dışı değişiklik: ASTROLOGY-PHASE9B-AUDIT.md" diyerek **14/1** veriyor. Ürün hatası değil.
- Commit öncesi regresyon 461/0 idi; tek fark bu rapor dosyası. 9A raporunda da aynı durum oluşmuş ve 9A P2 işinde düzeltilmişti.
- Bu aşamada yalnız rapor commit edilebildiği için test dosyasına dokunulmadı.
- Öneri: izin listesine `/^ASTROLOGY-PHASE9B-AUDIT\.md$/` satırı (tek satır).

**9B-P3-02 · Kaydetme özetinde ham teknik kimlikler**
- Özet `whole_sign`, `placidus`, "düğüm: true / mean", "sağlayıcı: roxy" gösteriyor (`AnalysisWorkspace.tsx` özet satırı).
- Kayıtlı analiz görünümü ve rapor Türkçe etiket kullanıyor. Görsel tutarsızlık; önceden de vardı.

### Önceden bilinen P3 maddeleri (yeniden sınıflandırılmadı; yeni kanıtla risk artmadı)
- **Aşama 8:**
  - Vedik kundli / KP / dünya haritası görselleri raporda yok
  - Çarkta glif yerine kısaltma
  - Nakshatra / yoga adları İngilizce / Sanskritçe
  - Astroloji Usage360 dışında
- **9A-P3-01…19:** yıl aralığı denetimi, paylaşılan önbellek satırı silinmesi, eski `/results/[id]` maskesi, sağlayıcı yankıları, KP "şimdi" saat başı, düğüm/Lilith etiketleri, not bağlamında ev sistemi, Retry-After tarih biçimi, lunar return UTC ayı, bellek içi oran limiti yedeği, teknik katmanda kısa sağlayıcı adları, imzasız silme onay özeti, onay sonrası notların bayatlık dışı kalması, yarış durumlarında 500, gövde boyutu, danışan aramasının tenant kapsamlı olması, eski save RPC, `save_request_id` UNIQUE, progression açı yöntemi etiketi.
- **9A-P2-02 bilinçli davranış:** başarısız çağrıdan sonra aynı hesap 90 sn yeniden başlatılamıyor (409). 9B'de gözlendi; beklenen davranış.

## 7. Özet
- **Çalışma ağacı:** Bu rapor dışında değişiklik yok. Ölçüm harness'i, kopyalanan arka uç, sertifika ve indirilen dosyalar yalnız scratchpad'de.
- **Yerel süreçler:** Next, sahte arka uç ve Chrome sekmesi kapatıldı.
- **Sonuç:** Kullanıcı ve güvenlik akışları (yetki, izolasyon, demo, silme onayları, ortak analizin korunması, yorum güvenliği, mobil) **geçti**.
- **Satış öncesi owner kararı gerekenler:** 2 yeni P2.
  - **9B-P2-01** (KB snapshot kaynaklı kapasite büyümesi): plan ve sınır kararı.
  - **9B-P2-02** (rapor tarihi): küçük kod düzeltmesi.
- Android gerçek cihaz davranışı **DOĞRULANAMADI**.
- Owner kararı olmadan kod değiştirilmeyecek.
