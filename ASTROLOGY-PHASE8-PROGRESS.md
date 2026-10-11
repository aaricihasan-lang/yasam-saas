# ASTROLOJİ AŞAMA 8 — İLERLEME KAYDI (Profesyonel Word / PDF Raporları)

- Başlangıç HEAD: `2f97569d` (Aşama 7C; temiz) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Gerçek Roxy çağrısı: **0** (toplam 47 aynı; her test/sunucu `env -u ROXY_API_KEY`). Production / Frankfurt / Tokyo: **dokunulmadı**.
  Push / merge / deploy / prod migration: **yok**. Gerçek danışan verisi: **yok** (sentetik kişiler + depodaki golden yanıtlar). Migration: **gerekmiyor**.

## 1. Altyapı (mevcut olan yeniden kullanıldı)
- **Word:** `docx@9.7.1`, sunucuda (route, `runtime = "nodejs"`) + ortak Word sistemi `lib/docx/reportHelpers.ts`
  (kapak `buildPremiumCover`, `h1/h3` başlık stilleri → Word gezinme bölmesi, `twoColTable`, `muted`, `bulletItem`,
  `embedImageParagraph` (oran korur, büyütmez), `buildHeader/buildFooter` "Sayfa X / Y", `sanitizeXmlText`).
  Geniş tablolar için yerel tablo: başlık satırı her sayfada tekrar eder (`tableHeader`), satır bölünmez (`cantSplit`),
  tamsayı twip (DXA) sütun genişliği + sabit düzen (kesirli yüzde genişlik Word'ü onarım uyarısına sokabiliyordu).
- **PDF:** `jspdf@4.2.1`, sunucuda (Anamnez / Hacamat yöntemi): A4, Türkçe için `public/fonts/Geist-Regular.ttf` gömülür
  (mevcut `anamnezPdfFontBase64`), sayfa sonları elle; başlık sonraki blokla kalır, tablo satırı bölünmez + başlık tekrarı,
  uzun paragraf satır satır akar, görsel oranı korunur. Alt bilgi "Sayfa X / Y".
- **Harita görseli:** `@resvg/resvg-js` (Refleksoloji atlas görseliyle aynı) — SVG → PNG, yalnız depo fontu (sistem fontu yok).
- **İndirme:** ortak `lib/http/downloadResponse` (`downloadFileResponse`); başlık RFC 5987 (`filename` ASCII + `filename*`),
  `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`.
- `next.config.ts`: iki rapor route'u için font izleme satırı (Vercel paketine girer). Statik test farkı satır satır sınırlar.

## 2. Mimari
- `lib/astrology/report/model.ts` — SAF rapor modeli: girdi YALNIZ `getAnalysis` yanıtı (yetki/izolasyon/yorum kapısı orada).
  Word ve PDF aynı modelden üretilir → içerik tutarlı. Tekniğe özgü bölümler; eksik alan "—"; "undefined/null/[object Object]/NaN"
  ve ham JSON çıkmaz (testli).
- `lib/astrology/report/wheelSvg.ts` — uygulamadaki natal çarkın geometrisiyle aynı SVG (glif yerine Türkçe kısaltma; fontta glif yok).
- `lib/astrology/report/{docx,pdf,chartPng,service}.ts` — üreticiler + sunucu-yalnız servis.
- Route: `GET /api/admin/astroloji/analyses/[id]/report?format=docx|pdf` + uzman aynası `/api/astroloji/analyses/[id]/report`
  (birebir re-export). Sıra: **kapı (requireAstrologyAccess) → Android → biçim → hız sınırı (20/dk) → getAnalysis → üret**.
- UI: kayıtlı analiz görünümünde "Word" / "PDF" düğmeleri (`SavedAnalyses.tsx`, `astroDownload`).

## 3. Kapsam (25 tekniğin tamamı)
Batı: natal, transit, forecast, progression, solar arc, solar/lunar return, sinastri, composite, astrocartography, relocation, local space.
Vedik: D1, varga, Vimshottari dasha, drishti, ashtakavarga, shadbala, panchanga, gochara. KP: chart, dasha, ruling, transit, horary.
Rapor sırası: kapak → doğum verileri (sinastride iki kişi) → yöntem (+ saat uyarıları) → harita (varsa) → teknik sonuçlar/tablolar →
uzman notları → Bilgi Bankası snapshot'ı → Roxy yorumu (yalnız yetkiliyse) → kayıt bilgisi.

## 4. Harita görselleri
- Sistemde SAKLANAN görsel yok; çarklar istemcide kayıtlı veriden çizilir. Raporda yalnız sistemin KENDİ çarkı (natal, solar/lunar
  return, composite, relocation) kayıtlı veriden çizilir — yeni hesap/Roxy yok. Vedik kundli (Roxy UI kütüphanesi, istemci),
  KP güney haritası ve dünya haritaları rapora girmez (tablolar tam).

## 5. Güvenlik
- Yorum: rapor `getAnalysis` dışında veri okumaz → yorum yetkisi yoksa `provider_interp_snapshot` kolonu DB'den HİÇ okunmaz (testli).
  Sinastri/kompozit iç içe yorumları, owner önizlemesi, yetki sonradan kaldırma, önbellek (no-store) testli.
- İzolasyon: başka uzman, başka tenant, anonim, yetkisiz uzman, owner (başkasının analizi), rastgele / geçersiz kimlik → tek tip 404.
  Yetki kaldırılınca doğrudan URL 404. Silinen profilin bağımsız analizi 404; korunan ortak sinastri raporlanır.
- Mobil: Android (tarayıcı + uygulama WebView'i) Word ve PDF → 403 (yetkiliye; yetkisize 404). UI: `useIsAndroid` → render yok,
  SSR `.no-android`, telefon genişliğinde `hidden md:inline-flex` (DY Word + Anamnez PDF ürün kuralıyla aynı). Masaüstü aynen.

## 6. Testler
- `scripts/astrology/report8.harness.ts` **72 PASS / 0 FAIL**: 25 tekniğin tamamı gerçek akışla (profil → motor → not/KB → kayıt;
  sağlayıcı = depodaki golden yanıtlar, ağ yok) kaydedilir; GERÇEK route'larla Word + PDF indirilir; .docx JSZip, .pdf unpdf ile
  bağımsız açılır. Model (25), route (25), Türkçe/uzun/çok sayfa, görsel, yorum açık/kapalı/sonradan kaldırma/kolon okunmaması,
  sinastri-kompozit, önbellek, izolasyon matrisi, yetki kaldırma, biçim, Android/WebView/iOS, UI kaynak denetimi, snapshot
  değişmezliği, 0 sağlayıcı/Roxy, eksik eski kayıtlar + saati bilinmeyen profil, silme (bağımsız 404 / ortak 200), owner önizleme, hız sınırı.
- Tam `npm run test:astrology`: **440 PASS / 0 FAIL** (önceki 367 + rapor 72 + statik 1) + PG senaryoları PASS.
  perm7c yetkisiz matrisi yeni rapor ucunu otomatik kapsar (route sayısı 22 → 23).
- Bağımsız Word doğrulaması: 25 .docx gerçek Microsoft Word 16 ile açıldı ve PDF'e aktarıldı (hepsi OK; boş sayfa yok).
  İlk denemede Word açılışta takıldı; kesirli yüzde tablo genişlikleri tamsayı DXA'ya çevrildikten sonra 25/25 açıldı
  (kök neden kesin izole edilmedi: aynı turda Open çağrısı da sadeleştirildi). jsPDF çıktıları PyMuPDF ile sayfa sayfa görüntülendi.
- Mutasyon (rapor harness'ine karşı): interp_forced 4 FAIL, preview_ignored 1, gate_unchecked 4, no_android_pdf 1,
  no_rate_limit 1 → yakalandı; android_before_gate → harness çöktü (özet yok; yakalandı sayılır ama net değil).
  raw_null / no_chart / cacheable: sistem bellek baskısıyla arka plan işi durdurduğu için ÇALIŞTIRILMADI; dosyalar yedekten geri
  yüklendi, temiz durumda 72/0 + statik 15/0 + tsc 0 yeniden doğrulandı.
- `next build` ve yerel tarayıcıda masaüstü/390 px görsel kontrol bu aşamada YAPILMADI (bellek baskısı); tsc temiz.

## 7. Eksik doğrulamaların tamamlanması (2026-10-09, kod değişikliği YOK)
- Kaynak: ~6,3 GB boş RAM / 16 GB; başka oturumların Node süreçlerine ve kullanıcının açık Word belgesine dokunulmadı.
  Önceki turdaki bellek kesintisi nedeniyle her ağır iş tek tek, ön planda çalıştırıldı; build `--max-old-space-size=4096`.
- `next build`: BAŞARILI (rapor route'ları admin + uzman derlendi). Tek uyarı `app/globals.css @theme` — main'den, Aşama 8 dışı.
- Tarayıcı (yerel sahte arka uç, sentetik uzman, gerçek düğmeler): Word + PDF indirme akışı çalışır (Blob: PK… / %PDF-, ASCII dosya adı);
  API ile indirilen dosyalar Word 16'da açıldı (8 / 5 sayfa). Yorum yetkisi AÇIK → Word+PDF ve ekranda yorum var; KAPALI → hiçbirinde yok,
  ekranda "yorumlar kapalı" rozeti. Başka uzmanın (owner) analizi uzmana 404, uzmanın analizi owner'a 404; Android 403; no-store.
- 390 px: Word/PDF düğmeleri gizli, yatay taşma 0; 1280 px: düğmeler görünür, taşma 0.
- Mutasyonlar (tek tek, her biri sonrası yedekten geri yükleme; çalışma ağacı temiz doğrulandı):
  android_before_gate 1 FAIL · raw_null 1 FAIL · no_chart 1 FAIL · cacheable 29 FAIL → hepsi yakalandı.
  (Önceki tur: interp_forced, preview_ignored, gate_unchecked, no_android_pdf, no_rate_limit yakalandı → toplam 9/9.)
- Son regresyon `npm run test:astrology`: 440 PASS / 0 FAIL, PG senaryoları PASS. Gerçek Roxy: 0 (toplam 47).
