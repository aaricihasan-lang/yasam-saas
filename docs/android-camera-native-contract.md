# Android Uygulaması — Kamera ile Çekip Yükleme: Native Entegrasyon Sözleşmesi

**Durum (2026-10-14):** Web tarafı HAZIR. Android native kodu bu çalışmada DEĞİŞTİRİLMEDİ.
Android uygulamasında (1.9.x) "Fotoğraf Çek" butonu bu yüzden **gizlidir**. Native taraf bu
belgeyi uyguladığında buton web'de hiçbir değişiklik yapmadan kendiliğinden görünür.

> Bu belge native uygulama içindir. Kamera bu belge uygulanıp gerçek cihazda test edilmeden
> "çalışıyor" sayılmaz.

---

## 1. Web tarafı ne yapıyor? (değişmeyecek sözleşme)

| Konu | Web davranışı | Kaynak |
|---|---|---|
| Galeri / dosya | `<input type="file" accept="image/*" multiple>`; `capture` YOK | her ekranın mevcut seçicisi |
| Kamera | AYRI bir giriş: `<input type="file" accept="image/*" capture="environment">`, tek dosya | `components/media/CameraCaptureButton.tsx` |
| Kamera butonu ne zaman görünür? | Masaüstü: hiç. Mobil tarayıcı: her zaman. **Android uygulaması: yalnız UA'da `YasamCamera/1` varsa** | `lib/media/cameraCapture.ts` (`CAMERA_CAPABILITY_UA_TOKEN`) |
| Çekilen fotoğrafın işlenmesi | Galeri ile AYNI yol: kalite koruyan optimizasyon (EXIF yönü uygulanır, WebP q≥0.80, uzun kenar ≤2560/2048 px), sonra mevcut sunucu doğrulaması ve yükleme | `lib/media/imageOptimize.ts` |
| İptal | Seçici boş dönerse hiçbir şey olmaz | `CameraCaptureButton` |

Kamera girişi bulunan ekranlar: Danışan Taşları, Doğaltaş Yeni Kayıt ve Taş Detayı, Şifa
Rehberi (kayıt, sekme, not fotoğrafı), Refleksoloji not ekleri, Ürün & Stok (yağ, sabun-krem,
aksesuar, diğer, doğaltaş stok), Mağaza yönetimi (ürün, kategori), Kişisel Arşiv.

## 2. Native tarafta yapılacaklar

### 2.1 Kamera isteğini ayırt et (`onShowFileChooser`)

`WebChromeClient.FileChooserParams.isCaptureEnabled()` yalnız `capture` özniteliği olan giriş
için `true` döner. Galeri girişlerinde `capture` olmadığı için mevcut akış **aynen** korunur.

```kotlin
private fun openFileChooser(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
    filePathCallback?.onReceiveValue(null)
    filePathCallback = callback

    val wantsImage = acceptToMimeTypes(params.acceptTypes).let { it.isEmpty() || it.any { t -> t.startsWith("image/") } }
    if (params.isCaptureEnabled && wantsImage) {
        return launchCamera()                    // YENİ: doğrudan kamera
    }
    // MEVCUT: ACTION_GET_CONTENT (galeri + dosya yöneticisi) — DEĞİŞMEZ
    ...
}
```

### 2.2 Kamera intent'i + FileProvider (CAMERA izni İSTENMEZ)

- `ActivityResultContracts.TakePicture()` kullanılır (`MediaStore.ACTION_IMAGE_CAPTURE`).
  Fotoğrafı sistemin kamera uygulaması çeker; uygulamanın kamera donanımına erişmesi gerekmez.
- **ÖNEMLİ:** Manifest'e `android.permission.CAMERA` **EKLENMEMELİ**. İzin manifest'te bildirilir
  ama çalışma anında verilmezse `ACTION_IMAGE_CAPTURE` `SecurityException` fırlatır. İzin hiç
  bildirilmezse kamera uygulaması izinsiz çalışır. Bu yol Play'de ek izin beyanı da gerektirmez.
- Hedef dosya uygulamanın önbelleğindedir (`cacheDir/camera/`). Depolama izni gerekmez ve
  galeride kalıcı kopya oluşmaz.

```kotlin
private var pendingCameraFile: File? = null

private val takePictureLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
    val callback = filePathCallback ?: return@registerForActivityResult
    filePathCallback = null
    val file = pendingCameraFile
    pendingCameraFile = null
    if (saved && file != null && file.length() > 0) {
        callback.onReceiveValue(arrayOf(cameraUri(file)))
    } else {
        file?.delete()                         // iptal / başarısız → geçici dosya silinir
        callback.onReceiveValue(null)          // web tarafında "hiçbir şey olmaz"
    }
}

private fun launchCamera(): Boolean {
    val dir = File(cacheDir, "camera").apply { mkdirs() }
    val file = File(dir, "IMG_${System.currentTimeMillis()}.jpg")
    pendingCameraFile = file
    return try {
        takePictureLauncher.launch(cameraUri(file))
        true
    } catch (_: ActivityNotFoundException) {     // kamera uygulaması yok (ör. bazı tabletler/emülatör)
        pendingCameraFile = null; file.delete()
        filePathCallback?.onReceiveValue(null); filePathCallback = null
        showToast("Kamera uygulaması bulunamadı.")
        true
    }
}

private fun cameraUri(file: File): Uri =
    FileProvider.getUriForFile(this, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
```

`AndroidManifest.xml`:

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />
</provider>

<!-- Android 11+ paket görünürlüğü: kamera uygulamasını bulabilmek için -->
<queries>
    <intent><action android:name="android.media.action.IMAGE_CAPTURE" /></intent>
</queries>
```

`res/xml/file_paths.xml`:

```xml
<paths><cache-path name="camera" path="camera/" /></paths>
```

### 2.3 Çekilen fotoğrafın WebView'a dönüşü

- WebView'a uygulamanın kendi `content://…fileprovider/camera/IMG_….jpg` adresi verilir.
  `file://` verilmez, çünkü `allowFileAccess=false`.
- **Doğrulanacak:** Mevcut ayarda `allowContentAccess=false`. Galeri (GET_CONTENT) URI'leriyle
  yüklemenin çalıştığı daha önce test edildi. Uygulamanın kendi FileProvider URI'si de gerçek
  cihazda test edilmeli. Okunamıyorsa çözüm `allowContentAccess=true` değil; fotoğrafı
  `ContentResolver` ile okuyup geçici bir `content://` yerine aynı yolu kullanmaktır.
- Dosya adı `IMG_<zaman>.jpg`, MIME `image/jpeg`. Web tarafı MIME boş gelse bile türü
  baytlardan tanır.

### 2.4 Geçici dosya temizliği

- İptal veya başarısızlıkta dosya hemen silinir (yukarıdaki kod).
- Başarılı çekimde dosya, WebView yüklemesini okuyabilsin diye hemen SİLİNMEZ.
  `onCreate` ve `onDestroy` içinde `cacheDir/camera/` altında 24 saatten eski dosyalar silinir:
  `dir.listFiles()?.filter { now - it.lastModified() > 24h }?.forEach { it.delete() }`.
- `allowBackup=false` ve önbellek dizini zaten yedeğe girmez.

### 2.5 Süreç ölümü / döndürme

- Kamera açıkken sistem uygulamayı kapatabilir. `pendingCameraFile` yolu `onSaveInstanceState`
  içinde saklanmalı. Ancak WebView'ın `filePathCallback`'i süreç ölümünde kaybolur ve geri
  getirilemez. Geri dönüşte geçici dosya silinir ve kullanıcı tekrar dener. Veri kaybı olmaz,
  çünkü web'de henüz hiçbir şey kaydedilmemiştir.
- `configChanges` zaten döndürmeyi kapsıyor; Activity yeniden yaratılmaz.

### 2.6 Yetenek işareti (web butonunu açan anahtar)

Kamera akışı yayınlandığında WebView User-Agent'ına şu ekleme yapılır:

```kotlin
webView.settings.userAgentString = webView.settings.userAgentString +
    " YasamSistemiAndroid/${BuildConfig.VERSION_NAME} YasamCamera/1"
```

- `YasamCamera/1` → web "Fotoğraf Çek" butonunu gösterir (`lib/media/cameraCapture.ts`).
- `YasamSistemiAndroid/<sürüm>` → resmi uygulama işareti (`lib/auth/clientChannel.ts`
  `ANDROID_APP_UA_SUFFIX`). Oturum davranışı değişmez: uygulama zaten `; wv)` ile tanınıyor ve
  header-token yolunda kalıyor.
- İşaret YALNIZ kamera akışı gerçekten hazırsa eklenir. Eski sürümler işaret göndermez, bu
  yüzden butonu görmez.

## 3. Galeri akışının korunması (regresyon yasak)

- `capture` olmayan tüm girişler mevcut `ACTION_GET_CONTENT` yolundan gider. `accept`, `multiple`
  ve `EXTRA_MIME_TYPES` davranışı aynen kalır.
- Kamera her zaman tekli istektir; `multiple` yok sayılır.

## 4. Gerçek cihaz test listesi (native sürüm sonrası)

1. Danışan Taşları → "Fotoğraf Çek" → kamera açılır → çek → onayla → önizleme gelir → kaydet → fotoğraf dikey/yatay doğru yönde görünür.
2. Kamera açıkken geri tuşu / iptal → web'de hiçbir şey eklenmez, uygulama donmaz, sonraki seçim çalışır.
3. Aynı ekranda galeri butonu → eskisi gibi çoklu seçim.
4. Ürün & Stok → kamera fotoğrafı 1 MB sınırına optimize edilip eklenir (hata yoksa).
5. Şifa / Refleksoloji / Mağaza / Kişisel Arşiv / Doğaltaş → kamera ile ekleme.
6. Kamera uygulaması olmayan cihaz / iş profili → "Kamera uygulaması bulunamadı." uyarısı.
7. Kamera açıkken uygulamayı arka plana al → başka uygulama aç → geri dön (süreç ölümü senaryosu).
8. 24 saat sonra `cacheDir/camera` temizlendi mi (adb shell run-as … ls).
9. Android 7 / 10 / 13 / 14 / 15 ve Samsung + Pixel (farklı kamera uygulamaları).
10. Ön kamera ile çekilmiş (aynalı) ve yatay çekilmiş fotoğrafların yönü.

## 5. Kapsam dışı (bu sözleşmede YOK)

- Uygulama içi özel kamera arayüzü (CameraX): gerekmez, sistem kamerası yeterli.
- Video çekimi.
- Galeriye kalıcı kopya kaydetme.
