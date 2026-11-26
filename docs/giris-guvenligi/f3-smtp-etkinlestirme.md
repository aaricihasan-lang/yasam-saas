# F3 — Turhost SMTP ilk gerçek etkinleştirme paketi (Owner runbook)

> Bu belge bir **plan**dır. Her adım ayrı Owner onayıyla, Owner tarafından (veya Owner'ın açık onayıyla) uygulanır.
> Gizli değerler (parola, pepper) bu belgeye, terminale, GitHub'a veya sohbete **yazılmaz**.

## 0. Ön koşullar (kod)

1. **Önce kod, sonra ayar.** F3 kodu (kullanıcı e-postası kapsamı, varsayılan yalnız Owner) production'a çıkmadan SMTP
   ayarları **girilmez**. Aksi hâlde ayar girildiği anda "e-postamı doğrula / adresimi değiştir" uzmanlara da açılır.
2. F3 kodu tek başına (SMTP ayarı yokken) davranışı değiştirmez: sağlayıcı yok → e-posta işlemleri herkes için kapalı
   (bugünkü gibi). Tek görünür fark: Ayarlar'daki "E-posta adresimi değiştir" kartında form yerine "şu anda kullanılamıyor" notu.
3. **Geri alma kuralı:** 000200 migration'ı uygulandığı için **eski bir Vercel sürümüne dönülmez** (eski kod doğrudan oturum
   INSERT dener → giriş kırılır). SMTP'yi kapatmak için yalnız **ortam değişkeni** kapatılır (bkz. §7). Kod geri alınması
   gerekirse `main` üzerinde yeni bir düzeltme commit'i ile ileri gidilir.

## 1. Ortam değişkenleri (Vercel › Project › Settings › Environment Variables)

**Kapsam: yalnız `Production`.** Preview / Development işaretlenmez (Preview'a SMTP parolası verilmez).

| Ad | Değer | Gizli? | Not |
|---|---|---|---|
| `EMAIL_PROVIDER` | `smtp` | hayır | |
| `SMTP_HOST` | `srvm06.trwww.com` | hayır | **`mail.yasamsistemi.com` KULLANILMAZ** — sertifika adı uymaz (TLS hatası, gönderim olmaz). |
| `SMTP_PORT` | `465` | hayır | Doğrudan TLS. (587 yalnız zorunlu STARTTLS ile; gerekmedikçe kullanılmaz.) |
| `SMTP_USER` | `info@yasamsistemi.com` | hayır | |
| `SMTP_SENDER` | `info@yasamsistemi.com` | hayır | `SMTP_USER` ile **birebir aynı** olmalı (kod farklıysa sağlayıcıyı kapatır). |
| `SMTP_SENDER_NAME` | `Yaşam Sistemi` | hayır | İsteğe bağlı. |
| `SMTP_PASSWORD` | Turhost posta kutusu parolası | **EVET — Sensitive** | Owner girer; kopyala-yapıştır sonrası pano temizlenir. |
| `AUTH_OTP_PEPPER` | ≥ 32 karakter rastgele | **EVET — Sensitive** | Bkz. §2. Bir kez üretilir, değiştirilmez (değişirse yalnız o anda bekleyen kodlar geçersizleşir). |

**Bu aşamada GİRİLMEYENLER** (girilirse kapsam / giriş akışı değişir — ayrı onay):
`AUTH_EMAIL_SELF_SERVICE_ROLES`, `AUTH_MFA_METHODS`, `AUTH_MFA_METHOD_SCOPE`, `AUTH_MFA_EMAIL_ROLES`,
`ANDROID_APP_SESSION_TRANSPORT`, `SMTP_HOURLY_LIMIT`, `EMAIL_DAILY_LIMIT`, `EMAIL_WARN_AT`.

Varsayılanlar (değişken girilmezse):
- Saatlik tavan **50 ileti/saat** (kodda sabit tavan; `SMTP_HOURLY_LIMIT` yalnız düşürebilir, 60 veya üstü yazılırsa yine 50).
- Günlük: 200 ileti / 24 saat (uyarı 150). Saatlik 50 sınırı her durumda bağlayıcıdır.
- Kullanıcı e-postası kapsamı: **yalnız Owner**.

### 50/saat sınırı ve Outlook'tan elle gönderim

Uygulamanın sayacı yalnız **uygulamanın** gönderimlerini sayar. Owner aynı `info@` kutusundan Outlook ile elle e-posta
gönderirse bu iletiler sayaca girmez; Turhost'un 60/saat hesap sınırı **ikisinin toplamına** uygulanır. Yani 50/saat yazılım
sınırı, yoğun elle gönderimle birleştiğinde Turhost sınırının aşılmayacağını **mutlak garanti etmez**.

Sınır aşılırsa ne olur: Turhost iletiyi geçici/kalıcı reddeder → uygulama kodu göndermez, giriş tamamlanmaz (MFA atlanmaz),
Owner bildirim ziline "e-posta uyarısı" düşer, kullanıcı bir süre sonra "yeni kod" ister veya kurtarma kodunu kullanır.

Maliyetsiz öneriler:
1. **İşletim kuralı:** `info@` kutusundan bir saatte 10'dan fazla elle ileti gönderilmez (toplu gönderim zaten Turhost'ça yasak).
2. Elle yazışma yoğunlaşacaksa `SMTP_HOURLY_LIMIT=40` gibi daha düşük bir değer girilir (elle gönderime 20 pay kalır).
   Değer yalnız **düşürülebilir**; kod 50'nin üstüne çıkmaz.
3. Owner E-posta Durumu ekranındaki "son 24 saat / hata" satırları ve bildirim zili düzenli kontrol edilir.

## 2. `AUTH_OTP_PEPPER` güvenli üretimi

Owner'ın bilgisayarında, çıktıyı **ekrana yazdırmadan** panoya alarak (PowerShell):

```powershell
$b = New-Object byte[] 48; [System.Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b) | Set-Clipboard; $b = $null
```

Vercel'de değer alanına yapıştırılır, "Sensitive" işaretlenir, kaydedilir; ardından pano temizlenir (`Set-Clipboard -Value ' '`).
Değer hiçbir dosyaya, nota, sohbete yazılmaz. (Kaybolursa yeni değer üretilir; yalnız o anda bekleyen kodlar geçersizleşir.)

## 3. `SMTP_PASSWORD` güvenli girişi

- Turhost panelinden mevcut parola kullanılır veya **güçlü yeni bir parola** belirlenir (Outlook'ta da güncellenir).
- Parola yalnız Vercel arayüzüne, "Sensitive" olarak, **yalnız Production** kapsamıyla girilir.
- Bu parola posta kutusunun okunmasına da izin verir: başka hiçbir yere (repo, `.env` dosyası, sohbet) konmaz.
- Kod parolayı hiçbir yanıtta / günlükte / bildirimde göstermez (testle doğrulandı).

## 4. Yeniden yayın

Vercel'de ortam değişkeni değişikliği **yalnız yeni bir yayında** etkinleşir. Kod değişmeden, `main`'in güncel production
yayını Vercel'de "Redeploy" ile yeniden yayınlanır (**Owner onayı**). Yeni kod sürümüne dönülmez / eski sürüme geçilmez.

## 5. Yayın sonrası kontroller (gönderimsiz)

1. Owner girişi + çıkış (parola) — çalışıyor mu?
2. Bir uzman hesabıyla giriş (parola) — çalışıyor mu? (Uzman Ayarlar'ında e-posta doğrulama "kullanılamıyor" görünmeli.)
3. Owner › **E-posta Durumu** ekranı:
   - "Yapılandırma: Hazır", sağlayıcı "Kurumsal posta (SMTP)", kod anahtarı "var";
   - "SMTP ayarı eksik / geçersiz" satırı **yok**;
   - "Saatlik gönderim tavanı: 50";
   - "Kullanıcı e-posta işlemleri: yalnız Owner (varsayılan)".
4. Salt-okunur hazırlık betiği (değer okumaz): `node scripts/giris-guvenligi/f3-smtp-hazirlik-kontrol.mjs --vercel-dizini <Vercel'e bağlı klasör>`

## 6. İlk gerçek gönderimler (her biri ayrı Owner onayı)

1. **Test iletisi (kod içermez):** Owner › E-posta Durumu › "Test iletisi gönder" → Owner'ın kendi adresine (saatte ≤ 5).
   - Gelen kutusu + istenmeyen klasörü kontrol edilir.
   - İletinin **özgün başlıkları** (Gmail: "Orijinali göster") incelenir: `SPF: PASS`, `DKIM: PASS` (imzalayan alan
     `yasamsistemi.com`), `DMARC: PASS`. DKIM yoksa → Turhost panelinden DKIM etkinleştirilir / Turhost'tan istenir.
   - **Owner'ın giriş adresi gerçek bir posta kutusu değilse** (ör. kurumsal alan adında kutusu açılmamış ad) test iletisi
     alıcı aşamasında `rejected` ile reddedilir. Bu durumda Owner adresi DEĞİŞTİRİLMEZ; bunun yerine **kayıtlı test hesabı**
     alıcısı kullanılır: Production'a `EMAIL_OWNER_TEST_RECIPIENT=<Owner'ın eriştiği, sistemde kayıtlı tek bir hesabın adresi>`
     (gizli değil) → yeniden yayın → E-posta Durumu'nda "Kayıtlı test hesabına test iletisi" kartı: maskeli alıcıyı kontrol et,
     onay kutusunu işaretle, gönder. Alıcı istekle değiştirilemez; hesap etkin, demo / arşiv / pasif değil olmalı; saatte 5
     test sınırı iki alıcı için ortaktır; SMTP 50/saat kapısı geçerlidir; iletide kod yoktur. İş bitince değişken silinebilir.
2. **İlk gerçek OTP:** Owner › Ayarlar › Hesap Güvenliği › Giriş Yöntemlerim › "Doğrulama kodu gönder".
   - Kod 3 dakika geçerli; önce bilerek **yanlış kod** (hata mesajı görünmeli), sonra doğru kod → "Doğrulandı".
   - 60 saniye dolmadan "yeni kod" istenirse bekleme mesajı görünmeli.
   - **Owner adresi posta kutusu değilse ilk gerçek OTP için tek hesaplık pilot:** Production'a
     `AUTH_EMAIL_VERIFY_PILOT_USER_ID=<pilot uzmanın kullanıcı kimliği (UUID)>` (gizli değil; tam olarak bir değer) → yeniden yayın.
     Yalnız o uzman hesabı (etkin, demo / arşiv / pasif değil) kendi KAYITLI adresini Ayarlar › Giriş Yöntemlerim'den kodla
     doğrulayabilir; diğer uzmanlar kapalı kalır. Pilot adres değiştirme, güvenlik bildirimi, kurtarma ve MFA zorunluluğunu
     AÇMAZ. E-posta Durumu ekranında "Adres doğrulama pilotu: 1 uzman hesabı (uygun)" görünür. Bitince değişken silinir.
3. İlk gönderim **başarısız** olursa: sistem güvenli durumda kalır (kod kullanılamaz, oturum açılmaz, MFA zaten kapalı).
   E-posta Durumu'ndaki son hata kodu okunur:
   - `smtp_auth_failed` → parola hatalı;
   - `smtp_tls_error` → `SMTP_HOST` yanlış (ör. `mail.yasamsistemi.com`);
   - `quota` → saatlik sınır;
   - `network` → bağlantı (Turhost'un yurt dışı IP'lerden SMTP girişini engellemesi dahil — Turhost'a sorulur).

## 7. SMTP'yi kapatma (acil durum)

`EMAIL_PROVIDER` değişkeni **silinir** (veya `disabled` yapılır) → yeniden yayın. Sonuç:
- E-posta gönderimi durur; kullanıcı e-postası işlemleri herkes için kapanır.
- HttpOnly oturum sistemi, parola girişi ve 000200 kilidi **etkilenmez** (kod sürümü değişmez).
- MFA zorunlu bir hesap varsa e-posta yöntemi sunulmaz; kurtarma kodu / QR yolu açık kalır (testle doğrulandı).
  Bu yüzden zorunluluk açılmadan önce her hesapta e-posta dışında en az bir yol bulunmalıdır (§8).

## 8. Sonraki aşamalar ve sıra (her biri ayrı onay)

1. **Owner kurtarma kiti:** Supabase SQL konsolunda `select * from public.auth_owner_offline_kit_issue();`
   - 5 kod **yalnız bir kez** görünür; kâğıda yazılır, ekran görüntüsü / dosya / sohbet YOK; konsol sekmesi kapatılır.
   - Doğrulama: Owner › Üye Detayı › Hesap ve Güvenlik › İki Aşamalı Giriş Yönetimi'nde kit "5 kod" görünür.
2. **Owner'ın MFA kabulü (yalnız Owner):**
   - SQL konsolu: Owner kontrollü test hesabı listesine (90 günü aşmayan süreyle);
   - ortam: `AUTH_MFA_METHODS=email_otp`, `AUTH_MFA_METHOD_SCOPE=test_accounts`, `AUTH_MFA_EMAIL_ROLES=owner` → yeniden yayın;
   - MFA yönetim ekranından Owner kendi zorunluluğunu açar (kit yoksa sistem reddeder) → yeniden giriş: parola + e-posta kodu.
3. Android 2.0.0 Play yayını + gerçek cihaz QR kabulü → `AUTH_MFA_METHODS=qr_device,email_otp`.
4. Uzmanlar: `AUTH_EMAIL_SELF_SERVICE_ROLES=owner,expert` (e-posta doğrulama açılır) → uzman başına kurtarma kodu + yöntem
   → `AUTH_MFA_METHOD_SCOPE=all` ve `AUTH_MFA_EMAIL_ROLES=owner,expert` → uzman başına zorunluluk (Owner, MFA yönetim ekranı).

## 9. Owner onay noktaları (sırayla)

1. F3 PR'ının `main`'e alınması (= production yayını).
2. Yayın sonrası Owner + uzman parola girişi kontrolü.
3. Vercel'e §1'deki değişkenlerin girilmesi (gizli olanları Owner girer).
4. Yeniden yayın.
5. Test iletisi.
6. Owner e-posta doğrulama OTP'si.
7. DKIM etkinleştirme (Turhost) ve DMARC politikasının sıkılaştırılması (`p=quarantine`).
8. Owner kurtarma kiti.
9. Owner MFA kabulü (§8.2).
10. Android ve uzman aşamaları.
