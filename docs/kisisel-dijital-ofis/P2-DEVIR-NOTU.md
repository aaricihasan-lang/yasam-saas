# Kişisel Dijital Ofis — P2 teknik devir notu

P2 güvenli görsel depolamayı ve kullanıcı bazlı kademeli açılışı kurar. **Arayüz yoktur** (P3+). Production'da hiçbir şey açılmaz.

## 1. Erişim (kademeli açılış)
- **Koşul:** `EXPERT_WORKSPACE_DESIGN_ENABLED === "true"` (P1 genel bayrağı) **ve** aşağıdakilerden biri:
  1. **Owner:** `users.is_super_admin`, `resolveIsSuperAdmin` ile denetlenir.
  2. **Owner'ın izin verdiği uzman:** `expert_workspace_access_grants` tablosunda geri alınmamış ve aynı tenant'a ait bir izin.
  3. **Herkes:** `EXPERT_WORKSPACE_ROLLOUT_ALL === "true"`. Bu yalnız Owner'ın **ayrı onayıyla** açılır.
- **Varsayılan kapalı.** Yetkisi olmayan kullanıcı tüm `/api/settings/workspace/*` uçlarında 404 alır. P1'deki tasarım ve tercih uçları da bu kapının arkasındadır.
- **İzin yönetimi:** `GET/POST /api/admin/workspace-access`. Yalnız Owner kullanabilir (`verifyAdminRequest` + `requireMainAdmin`); diğer adminler 403 alır.
  - Uzman kendine izin veremez: DB'de `CHECK user_id <> granted_by` var ve uç uzmanlara kapalı.
  - İzin yalnız onaylı, etkin, demo olmayan uzmana verilir.
  - Kayıt silinmez, yalnız geri alınır. Geri alınan izin diriltilemez (tetikleyici korur). Denetim izi tablonun kendisidir: `granted_by/at`, `revoked_by/at/reason`.

## 2. Görsel yükleme protokolü (P3/P4 arayüzü için) — mimari B (Owner kararı 2026-11-01)
Vercel işlev gövdesi ve yanıtı yaklaşık 4,5 MB ile sınırlı. "İstemci Storage'a yazmaz" kuralı nedeniyle yükleme **sunucu rotası üzerinden parçalıdır**. Ham parçaları **sunucu**, private `expert-workspace-staging` bucket'ına yazar. Bu bucket'ın hiçbir okuma ucu yoktur ve PostgreSQL'de ham fotoğraf verisi tutulmaz.

1. `POST /api/settings/workspace/assets/uploads` ile `{ kind: "logo"|"photo", fileName, mimeType, size }` gönderilir. Yanıt `{ uploadId, chunkSize, chunkCount, expiresAt }` olur. Oturum **15 dakika** geçerlidir; aynı anda en fazla 5 açık oturum olabilir.
2. Her parça için `PUT …/uploads/{uploadId}/chunks/{i}` çağrılır; gövde ham bayttır. Son parça hariç her parça tam `chunkSize` (3 MB) olmalıdır.
   - **Yeniden deneme:** ağ hatasında aynı parça yeniden gönderilir. Parça zaten yazılmışsa `409 chunk_exists` döner; istemci bunu başarılı sayar.
3. `POST …/uploads/{uploadId}/complete` çağrılır. Yanıt yalnız görsel üst verisidir (birkaç yüz bayt); ham dosya hiçbir yanıtta yoktur.
   - `409 incomplete` + `missing: [..]`: eksik parçalar yeniden gönderilip tamamlama tekrar çağrılır. Oturum açık kalır.
   - `409 processing`: başka bir tamamlama sürüyor; birkaç saniye sonra yeniden denenir.
   - 200 (`reused: true`): oturum zaten tamamlanmış; **aynı** görsel döner. İki kez çağrı ikinci görsel üretmez: `assetId = uploadId`, işleme kilidi ve birincil anahtar bunu garanti eder.
   - 4xx doğrulama hatası (tür, polyglot, piksel bombası vb.): oturum iptal edilir, geçici dosyalar silinir ve yeni yükleme başlatılır.
   - 5xx (Storage veya DB geçici hatası): oturum yeniden açılır ve tamamlama tekrar çağrılır.
4. İptal için `DELETE …/uploads/{uploadId}` çağrılır; işlenen oturum iptal edilemez (409).

**Sınırlar:**
- Tamamlama, parçaları staging'den **sırayla** indirir (en fazla 4 × 3 MB) ve birleştirir.
- Görsel işleme örnek başına aynı anda en fazla 2 iş çalıştırır (Fluid Compute bellek tepe değeri).
- En kötü durumdaki 10 MB fotoğraf yerelde yaklaşık 1,5–3 sn'de işlendi; `maxDuration` 60 sn.
- İşleme kilidi 90 sn geçerlidir. Çöken bir işlemin kilidi düşer ve tamamlama yeniden alınabilir.
- Okunan her varyant **≤ 4 MB**'tır. Kodlayıcı kaliteyi kademeli düşürür; boyut ve oran değişmez. Bu, Vercel yanıt sınırının altında kalmayı sağlar.

**Saatlik temizlik:** Inngest `workspace-staging-hourly-cleanup` (cron `23 * * * *`, concurrency 1, retries 3), `/api/inngest` üzerinde kayıtlı.
- Süresi geçen açık oturumları ve kilidi düşmüş işlenen oturumları iptal eder.
- Tamamlanmış veya iptal edilmiş oturumların kalan geçici dosyalarını siler.
- Silme hatasında hata fırlatır; Inngest yeniden dener.
- Kalıcı görsellere dokunmaz. Migration uygulanmadıysa `not_ready` döner.
- Ayrıca her yükleme başlatmada o uzmanın süresi geçen oturumları hemen toparlanır.

**Diğer uçlar:**
- **Okuma:** `GET /api/settings/workspace/assets/{id}?v=desktop|mobile`. Baytlar sunucudan akar; imzalı URL kullanılmaz.
- **Liste:** `GET /api/settings/workspace/assets`.
- **Silme:** `DELETE /api/settings/workspace/assets/{id}`, gövde `{ confirm: true }`. Görsel uygulanan, taslak veya geçmiş tasarımlardan birinde kullanılıyorsa **409** döner ve `where` alanı nerede kullanıldığını listeler. Dosyalar kaldırılır; kayıt `deleted_at` ile korunur.
- **Tasarım JSON'u:** yalnız `logo.assetId` ve `bg.photoAssetId` (uuid) kullanılır. Sunucu görselin sahibini ve türünü doğrular.

## 3. Görsel güvenliği (sunucu, `lib/workspace/imageProcess.ts`)
- **Sınırlar:** logo 2 MB, fotoğraf 10 MB.
- **Kabul edilen türler:** PNG, JPEG, WebP. Uzantı ve MIME yalnız beyan sayılır; tür içerikten (sihirli bayt + yapı ayrıştırma) belirlenir ve beyanla uyuşmazsa reddedilir.
- **Reddedilenler:**
  - SVG, HTML, GIF, HEIC/AVIF. HEIC için kullanıcıya "JPEG/PNG/WebP seçin" mesajı döner.
  - Bozuk veya kesik dosyalar.
  - Animasyonlu görseller.
  - Sonuna ek veri eklenmiş dosyalar (polyglot). Tek istisna: telefonların "hareketli fotoğraf" JPEG'ine eklediği MP4 kabı. Bu kap yeniden kodlamada atılır; içinde betik, arşiv ya da belge imzası varsa dosya yine reddedilir.
- **Piksel bombası:** en fazla 40 MP ve en uzun kenar 12.000 px. Boyutlar çözümlemeden önce başlıktan okunur.
- **Çıktı:**
  - Her zaman yeniden kodlanmış WebP.
  - EXIF, GPS, XMP, IPTC ve ICC metaverisi çıktıya taşınmaz; EXIF yönü piksellere uygulanır.
  - Varyantlar: logo 1200/600 px, fotoğraf 2560/1280 px (uzun kenar). En-boy oranı korunur ve görsel büyütülmez.
- **`sharp`:** doğrudan bağımlılık olarak eklendi (0.35.5, Next.js'in kullandığı sürümle aynı). Next.js'in varsayılan `serverExternalPackages` listesinde olduğu için paketlenmez. Lock dosyasında Linux x64 ikilisi mevcut. Uyum, CI'daki production build ile doğrulanır.

## 4. Depolama, yedek ve hesap silme
- **Bucket'lar (ikisi de private, Storage politikası yok, yalnız service_role):**
  - `expert-workspace`: kalıcı WebP varyantları, en fazla 5 MB. Yol `<tenant>/<kullanıcı>/<asset>/{desktop,mobile}.webp`.
  - `expert-workspace-staging`: geçici ham parçalar, en fazla 3 MB, `application/octet-stream`. Yol `<tenant>/<kullanıcı>/<uploadId>/<n>.part`.
  - Yollar yalnız sunucuda üretilir.
- **Kapasite raporu:** `expert_storage_usage()` iki bucket'ı da tenant'a atfeder. Fonksiyonun geri kalanı ve yetkileri aynen korundu. (`client-anamnesis-files` ve `stone-library-images` kapasite raporunda P2'den önce de yoktu; bu ayrı bir bulgudur, düzeltilmedi.)
- **Hesap kalıcı silme:** `tenantStorageTargets` listesi iki bucket'ın tenant önekini de kapsar. Üç yeni tablonun hepsinde `tenant_id uuid` olduğu için purge keşfine girerler; FK olmadığından silmeyi engellemezler.
- **Yedek:**
  - `expert_workspace_assets` satırları tenant yedeğine girer. `storageRefs` kontrolü sayesinde başka tenant'ın yolu geri yüklenmez.
  - Dosyaların kendisi, mevcut kural gereği tenant yedeğinde değil platform yedeğindedir (`db-storage-yedek.mjs` tüm `storage.objects`'i dinamik alır).
  - Yükleme oturumları geçicidir (tenant yedeğine girmez); geçici bucket dosyaları kısa ömürlüdür. İzin listesi yedekten **geri yüklenmez**; geri alınan izin dirilmesin diye.

## 5. Android WebView
- Projede native Android kodu yok. Mevcut sözleşme `docs/android-camera-native-contract.md`:
  - Galeri için `onShowFileChooser`, `<input type="file">` ve `capture` olmadan seçim.
  - Kamera ayrı bir düğmeyle (`YasamCamera/1`).
- P3/P4 arayüzü galeri seçimi için `accept="image/png,image/jpeg,image/webp"` kullanmalı; `capture` eklenmemeli.
- Bazı Android galerileri HEIC verebilir. Sunucu bunu anlaşılır mesajla reddeder; istemci isterse yüklemeden önce JPEG'e dönüştürebilir, sunucu doğrulaması yine de geçerlidir.
- Parçalı yükleme düz `fetch` (PUT, ham bayt) kullanır; WebView'de ek izin gerekmez.

## 6. Canlıya çıkış sırası (her adım ayrı Owner onayıyla; P2'de yapılmaz)
1. Migration `20271228000000` uygulanır: iki bucket ve üç tablo oluşur.
2. Kod deploy edilir. Bayrak kapalı kalır, `EXPERT_WORKSPACE_ROLLOUT_ALL` tanımsız olmalıdır.
3. Arayüz (P3+) hazır olunca genel bayrak açılır; o anda yalnız Owner erişir.
4. Owner seçtiği test uzmanlarına izin verir.
5. Ayrı onayla `EXPERT_WORKSPACE_ROLLOUT_ALL=true` açılır.
6. **Geri alma:** bayrak kapatılır ve gerekirse kod geri alınır. Bucket, görsel dosyaları ve kayıtlar **korunur**. DROP, TRUNCATE ya da toplu silme yoktur.
