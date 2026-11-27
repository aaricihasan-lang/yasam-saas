# Şifa Rehberi F3 — testler

| Test | Ne sınar | Ortam | Çalıştırma |
|---|---|---|---|
| `db.pg.mts` | Migration (`20280130000200`) — mevcut kayıtların bayt bayt korunması, geriye uyum, kişisel okuma, hazır başlık kuralları, grup türü, not ↔ içerik kutusu, kalıcı kutu silme, galeri görselleri, yaşam döngüsü, yetkiler, kullanıcı kotası YOK, çakışma, izolasyon, **şema geri dönüşü** | Yerel geçici PostgreSQL (ağ yok) — **CI regresyon listesinde** | `npx tsx scripts/sifa-rehberi-f3/db.pg.mts` |
| `counters.pg.mts` | Ana ekran (`/api/dashboard/summary`) ve Yönetim paneli (`/api/admin/expert-stats/modules`) Şifa sayacı = kişinin çöpte olmayan ana konuları; diğer sayaçlar değişmez | Yerel geçici PostgreSQL + gerçek route + PostgREST shim — **CI** | `npx tsx scripts/sifa-rehberi-f3/counters.pg.mts` |
| `yh-kutu.pg.mts` | Yaşam Hafızası: ana not çöpe → kutuları kuyruğa → gerçek worker indeksten siler → gerçek aramada yok; geri alınınca döner; YH kapalıyken etkisiz; şema geri dönüşü | Yerel geçici PostgreSQL + gerçek YH worker + arama RPC — **CI** | `npx tsx scripts/sifa-rehberi-f3/yh-kutu.pg.mts` |
| `geri-donus.pg.mts` | Geri dönüşte veri kaybı yok: F3 ÖNCESİ gerçek sunucu kodu (git `ee5c25aa`) + F3 şeması, şema geri dönüşü, yeniden ileri alma | Yerel geçici PostgreSQL — **CI** (tam git geçmişi gerekir) | `npx tsx scripts/sifa-rehberi-f3/geri-donus.pg.mts` |
| `sinirsiz.pg.mts` | Owner kararı F3-R1: konu/not/kutu/kaynak/görsel SAYISINA kullanıcı sınırı yok — 2.600 kardeşli gruplarda düzenleme yalnız değişen satırı gönderir; 6.000 görsel satırı; kaynakta kota kalıntısı yok | Yerel geçici PostgreSQL — **CI** | `npx tsx scripts/sifa-rehberi-f3/sinirsiz.pg.mts` |
| `ui-mock/f3Mock.mjs` | Ağ taklidi UI betikleri (wt4, delete-safety/ui, alti-is-paketi) için ortak sahte kişisel kütüphane | — | — |
| `real/apply-f3.mts` | Migration'ı YALNIZ izole test projesine uygular; öncesi/sonrası md5 | Supabase test projesi (`guard.ts`, FAIL-CLOSED) | `SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-f3/real/apply-f3.mts` |
| `real/api-security.real.mts` | Kimlik, demo, izolasyon (aynı kurum / başka kurum), sahiplik alanı, kalıcı kutu silme + Storage nesnesi, görsel kaldırma, çöp zamanı, XSS, kaldırılan uçlar (V1, `/copy`), Word, çakışma, kullanıcı kotası YOK (250 MB / 5.000 üstü sentetik), dosya türü + 10 MB teknik sınırı, hız sınırları, acil durum anahtarı | Gerçek `next dev` + gerçek API + test projesi | `SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-f3/real/api-security.real.mts` |
| `real/akislar.real.mjs` | Onaylı F2 Revizyon 7 kabul testinin **613 kontrolü**, gerçek ürüne uyarlanmış (masaüstü 1440×900 + Android WebView 390×844) | Gerçek `next dev` + gerçek API + test projesi + ZZ uzmanlar | `SIFA_V2_TEST_SECRET_DIR=… [SIFA_F3_SHOTS_DIR=…] npx tsx scripts/sifa-rehberi-f3/real/akislar.real.mjs` |

**Production sunucusu modu (önerilen; daha az bellek, yayınlanacak derlenmiş kod):**
`SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-f3/real/build-prod.mts` → ardından `SIFA_F3_SERVER=start` ile `akislar.real.mjs` / `api-security.real.mts`.
Bu build test projesinin tarayıcı anahtarını içerir; YALNIZ yerel test içindir, yayınlanmaz.

## 613 kontrolün uyarlanması (doğrulamalar aynı, altyapı gerçek)
- Depo okuma: tarayıcı belleği yerine sunucu (`real/support.mts → storeOf`); tohum kimlikleri (t-akciger, n-bronsit…) geri eşlenir.
- "Önceden kaydedilmiş not" eklemesi API ile (görseller gerçek yükleme).
- Kayıt beklemesi: tıklamadan sonra "Kaydediliyor…" kilidi kalkana kadar beklenir.
- Word: `.docx` (zip) içindeki `word/document.xml` metni okunur.
- Kayıt hatası benzetimi: `?kayit-hatasi=1` (prototip paneli) yerine API yanıtı 503 ile kesilir.
- Ekran durumu (`data-view`) `body` yerine `.sifa-f3` kökünde; ana sayfa ölçümleri ürün kabuğunun sol menü şeridi hariç tutularak yapılır.
- Not metni kayıtta güvenli JSON'dur: "biçimiyle kalıcı" karşılaştırması metin + satır yapısı + kalın biçim düzeyinde yapılır.
- Görsel kaynağı veri adresi değil, depo kimliğidir (`asset:<uuid>`).
