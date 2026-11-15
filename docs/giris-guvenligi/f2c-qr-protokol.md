# Giriş Güvenliği F2-C — QR onay + güvenilir Android cihazı protokolü (v1)

Bu belge web sunucusu ile resmî Yaşam Sistemi Android uygulaması (`com.yasamsistemi.app`) arasındaki
**bağlayıcı** sözleşmedir. Gizli anahtar, imza parmak izi veya production verisi İÇERMEZ.

## 1. Kriptografi

- Cihaz anahtarı: **EC P-256**, Android Keystore (`AndroidKeyStore`), mümkünse StrongBox; dışarı aktarılamaz.
- İmza: `SHA256withECDSA` → **DER** imza, **base64 (standart, dolgulu)**.
- Açık anahtar: **SubjectPublicKeyInfo (X.509 SPKI) DER**, base64 (standart).
- Kullanıcı doğrulaması: anahtar `setUserAuthenticationRequired(true)`;
  API 30+: `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG | AUTH_DEVICE_CREDENTIAL)` (her imzada);
  API 24–29: `BiometricPrompt` + `CryptoObject(Signature)`; biyometri yoksa cihaz kilidi zorunlu
  (`KeyguardManager.isDeviceSecure() == false` → eşleştirme reddedilir).
- Parmak izi (Owner karşılaştırması): `base32(sha256(spki_der))[0..8]`, `XXXX-XXXX` biçiminde (RFC 4648 alfabesi, dolgusuz, büyük harf).
- Zaman: imzalı her mesajda `ts` = Unix saniye; sunucu ±120 sn kabul eder.

## 2. İmzalanan mesajlar (UTF-8, satır ayırıcı `\n`, sonda `\n` YOK)

| Amaç | Mesaj |
|---|---|
| Eşleştirme (anahtara sahiplik) | `YS-ENROLL-V1\n{email_küçük_harf}\n{fingerprint}\n{ts}` |
| Aktivasyon | `YS-ACTIVATE-V1\n{deviceId}\n{activationNonce}\n{ts}` |
| QR isteği okuma | `YS-QR-FETCH-V1\n{challengeId}\n{qrNonce}\n{deviceId}\n{ts}` |
| QR karar | `YS-QR-DECIDE-V1\n{challengeId}\n{qrNonce}\n{deviceId}\n{decision}\n{matchCode}\n{ts}` |

`decision` ∈ `approve` | `deny`. `deny` için `matchCode` boş dize (`""`).

## 3. Uçlar (JSON; tümü `https://www.yasamsistemi.com`)

### 3.1 Cihaz eşleştirme (telefonda, parola ile)
`POST /api/devices/enroll`
```json
{ "email": "...", "password": "...", "publicKey": "<spki b64>", "model": "Pixel 8", "androidApi": 34,
  "appVersion": "2.0.0", "ts": 1700000000, "signature": "<b64 DER>", "bootstrapCode": "<yalnız Owner ilk cihaz>" }
```
→ `200 { "deviceId", "state": "pending_owner" | "owner_approved", "fingerprint": "ABCD-EFGH" }`
→ `401 INVALID_CREDENTIALS` · `409 PENDING_EXISTS | DEVICE_LIMIT | KEY_IN_USE` · `429` · `400 BAD_SIGNATURE`.

Uygulama `fingerprint`'i büyük harflerle gösterir ve kullanıcıya şunu söyler:
"Yönetici sizi arayacak; bu kodu **siz** okuyun. Size kod okuyan kişiye kod söylemeyin."

### 3.2 Eşleştirme durumu
`GET /api/devices/status?deviceId=<uuid>` → `{ "state", "activationNonce"? , "activationExpiresAt"? }`
`activationNonce` yalnız `owner_approved` iken döner (nonce tek başına işe yaramaz; imza gerekir).

### 3.3 Aktivasyon (Owner onayından sonra, ≤15 dk)
`POST /api/devices/activate` `{ "deviceId", "nonce", "ts", "signature" }` → `200 { "state": "active" }`.
Owner onayı tek başına oturum AÇMAZ ve cihazı aktif ETMEZ; aktivasyon cihazın kendi imzasıyla olur.

### 3.4 QR bağlantısı (App Link)
`https://www.yasamsistemi.com/m/onay#c=<challengeId>&n=<qrNonce>`
Fragment sunucuya gitmez. App Link (`autoVerify`) yalnız **`www.yasamsistemi.com`**, yol öneki `/m/onay`.
Uygulama kurulu değilse web sayfası yalnız "uygulamayla açın" der; **onay veremez**.

### 3.5 QR isteğini okuma
`POST /api/auth/mfa/qr/fetch` `{ "challengeId", "qrNonce", "deviceId", "ts", "signature" }`
→ `200 { "options": ["37","82","15"], "browser": "Windows · Chrome", "city": null, "createdAt", "expiresAt" }`
→ `404 { "code": "QR_INVALID" }` (yanlış kullanıcı / süresi dolmuş / kullanılmış / iptal edilmiş cihaz — ayrım YOK).

### 3.6 QR kararı
`POST /api/auth/mfa/qr/decide` `{ "challengeId", "qrNonce", "deviceId", "decision", "matchCode", "ts", "signature" }`
→ `200 { "result": "approved" | "denied" }` · `404 QR_INVALID` · `400 BAD_SIGNATURE`.
Yanlış `matchCode` → challenge **kalıcı reddedilir** (`denied`, kimlik avı göstergesi).

### 3.7 Bilgisayar
`POST /api/auth/session` (MFA zorunlu) → `202 { "code": "MFA_REQUIRED", "challengeId", "methods": ["qr_device"], "qr": { "url", "matchCode" } }`
+ `__Host-yasam_mfa` HttpOnly bağlama çerezi. `GET /api/auth/mfa/status` 2 sn aralıkla;
`verified` → `POST /api/auth/mfa/complete`. QR'yi kopyalayan başka tarayıcı bağlama çerezi olmadığından tamamlayamaz.

## 4. Durumlar

Cihaz: `pending_owner → owner_approved → active` · `rejected` · `revoked` · `expired`.
Challenge: `pending → verified → consumed` · `denied` · `expired`.

## 5. Owner ilk cihaz (bootstrap)

Owner kendi cihazını panelden onaylayamaz. Supabase SQL konsolunda `select public.auth_owner_bootstrap_issue();`
→ 15 dk geçerli tek kullanımlık kod. Telefonda eşleştirmede `bootstrapCode` alanıyla girilir → cihaz doğrudan
`owner_approved`; aktivasyon yine cihaz imzasıyla.

## 6. Güvenlik notları

- Telefonun WebView oturumu cihaz kimliği SAYILMAZ; yalnız Keystore imzası.
- Owner onayı: yalnız `is_super_admin=true` + **MFA'lı** Owner oturumu; kendi cihazını onaylayamaz.
- Cihaz iptali: o cihazın onayladığı oturumlar kapanır; iptal edilmiş cihaz hiçbir uçta kabul edilmez.
- Kullanıcı başına en fazla 2 aktif cihaz; tek bekleyen eşleştirme.
