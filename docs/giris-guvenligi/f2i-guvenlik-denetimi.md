# Giriş Güvenliği F2-I — Bağımsız Güvenlik Denetimi (17.11.2026)

Migration: `supabase/migrations/20280103000900_auth_security_hardening_f2i.sql` (F2-A…F2-H'ye bağımlı, ekleyici).

## Yöntem

- Dört bağımsız inceleme yapıldı, saldırgan bakış açısıyla ve yalnız kod okunarak:
  1. Oturum / MFA atlatma
  2. Veritabanı yetkileri / Owner kanıtı
  3. E-posta kodu / kurtarma / imha
  4. Android
- Her bulgu önce sentetik veritabanında başarısız bir testle yeniden üretildi. Ardından düzeltildi ve aynı test düzeltmeli
  kodda PASS verdi.
- Production'a temas yok.

| Kanıt | Düzeltmesiz | Düzeltmeli |
|---|---|---|
| `pg:session-f2i` (SQL, 15 madde) | 15 ihlal | PASS |
| `f2i-routes` (gerçek rotalar, saldırı zincirleri) | BLOCKER zinciri uçtan uca başarılı | 12/0 |
| `session-f2i-hold-race` (iki bağlantı) | — | 11/0, kilitlenme yok |
| `pg:f2-postflight` (yayın sonrası doğrulama) | eski migration yeniden çalıştırılınca FAIL (4 madde) | PASS |
| `purge-senaryolari` (kalıcı silme, HD eğitim RESTRICT) | — | 19/0 |

## Bulgular ve düzeltmeler

| # | Önem | Bulgu | Düzeltme |
|---|---|---|---|
| I1 | **BLOCKER** | Çalınmış taze Owner çereziyle zincir: Owner e-postası admin düzenleme yolundan değiştirilir → `/api/me/email-verification` ile saldırganın adresi doğrulanır → işleme özel kanıt e-postayla alınır → başka kullanıcının MFA zorunluluğu kapatılır → parola sıfırlanır → hesap devralınır. Düzeltmesiz rota testinde kod saldırganın kutusuna gitti, MFA kapatıldı. | Kanıt e-postası yalnız oturum açılmadan **önce** doğrulanmış adrese gider (DB tetikleyicisi + başlatma yanıtı). Owner e-postası admin düzenleme yolundan değiştirilemez. |
| I8 | HIGH | Owner'ın parola sıfırlaması kanıt istemiyordu. | MFA kullanan Owner için işleme özel kanıt (`password_reset`). Owner MFA kullanmıyorsa davranış değişmez. |
| I2 | HIGH | Telefonu olan kullanıcı, e-posta koduyla açılmış oturumda kurtarma kodu üretebiliyordu. Zincir: parola + e-posta kutusu → kurtarma kodu → e-posta değişikliği. | Telefonu olan kullanıcı için güçlü oturum şart. Tek yöntemi e-posta olan kullanıcıda davranış aynı. |
| I3 | HIGH | MFA zorunlu yapılınca MFA'sız eski oturumlar açık kalıyordu (eski Android oturumunun süresi de yoktu). | Zorunluluk açılınca MFA'sız açık / bekleyen oturumlar sona erer (`mfa_enforced`). |
| I6 | MEDIUM | Eski / çalınmış Owner oturumu herkesin telefonunu iptal edebiliyordu (toplu kilitleme). | Başkasının cihazını iptal için 30 dk taze MFA. Kendi cihazını iptal serbest. |
| I7 | MEDIUM | Telefon, giriş isteği ile kritik işlem onayını ayırt edemiyordu. | Sunucu amacı (`purpose`, `action`) bildirir. Android "Kritik işlem onayı" + işlem adı + "Bu bir GİRİŞ değildir" gösterir. |
| I9 | MEDIUM | Yasal saklama, kişinin cihazına ait kararları ve ayrıntıda / metadata'da geçen kimlikleri korumuyordu. | Saklama koşulu tek yerde tanımlandı (sayım = yürütme). Cihaz sahibi, ayrıntı ve metadata da dahil. |
| I10 | MEDIUM | Anonimleştirilen satır tam zaman damgası taşıyordu. Aynı andaki başka tablolarla eşleştirilip kimlik bulunabiliyordu. | Zaman damgası güne yuvarlanır. Yasal saklama ile yürütme arasında kilit sırası sabit (yarış ve kilitlenme yok). |
| I4 | LOW | Parola değişince / hesap pasifleşince açık giriş istekleri tamamlanabiliyordu. | Açık istekler reddedilir (`credentials_changed`). |
| I5 | LOW | Oturum satırının kullanıcısı değiştirilebiliyordu (sunucu rolü). | Tetikleyiciyle yasak. |
| I11 | LOW | `auth_retention_table_uuid` anon rolüne açıktı (zararsız md5). | Yalnız sunucu rolü. |
| G1 | LOW | Gmail yanıtındaki yetki kapsamı denetlenmiyordu. | Yalnız `gmail.send` kapsamlı token kullanılır. |
| G2 | LOW | Uzun Türkçe konu satırı RFC 2047 sınırını (75 karakter) aşıyordu. | Kodlanmış kelimeler bölünür ve katlanır. |
| M3 | MEDIUM (işletim) | Eski bir F2 migration'ı yanlışlıkla yeniden çalıştırılırsa Owner korumalı fonksiyonlar sessizce korumasız sürüme döner. | `scripts/giris-guvenligi/f2-postflight-check.sql` (salt-okunur) yayından sonra çalıştırılır ve bu durumu yakalar. |

Android tarafında (entegrasyon dalı) ek olarak şunlar yapıldı:
- Saat hatası mesajı.
- Dokunuş gizleme (tapjacking) koruması.
- WebView'de alan adı tam eşleşme listesi.
- API ≤29'da üretilmiş anahtar için yalnız biyometri istemi (API 30+'a yükseltme sonrası PIN seçilip imzanın başarısız olması önlenir).

## Canlıya geçişte dikkat (I3 davranış değişikliği)

Bir kullanıcının ikinci doğrulama zorunluluğu açıldığında o kullanıcının MFA'sız (yalnız parolayla açılmış) oturumları
**hemen kapanır**; kullanıcı yeniden giriş yapar ve ikinci doğrulamayı tamamlar. Owner kendi zorunluluğunu açarsa kendi
MFA'sız oturumu da kapanır. Toplu açılışta kullanıcılar önceden bilgilendirilmelidir.

## Doğrulanıp güvenli bulunanlar (özet)

- **Oturum:**
  - MFA zorunlu kullanıcıya oturum yalnız `auth_finalize_login` ile açılır; tetikleyici diğer bütün yolları reddeder (000200 öncesinde de).
  - Giriş isteği tarayıcıya bağlıdır, tek kullanımlıktır ve satır kilidiyle korunur.
  - Çerezler `__Host-`, HttpOnly, Secure, SameSite=Strict.
- **E-posta kodu:**
  - CSPRNG ile 6 hane, 3 dk geçerli, 5 yanlış denemede kilit.
  - Veritabanında yalnız HMAC tutulur; pepper yoksa yöntem kapalıdır.
  - Gönderim başarısız olursa doğrulanabilir kod oluşmaz.
- **Kurtarma kodları:** 10 × 140 bit, özetle saklanır, tek kullanımlık (satır kilidi). İşleme özel kanıt için geçmez.
- **İşleme özel kanıt:** kullanıcı + oturum + işlem + hedefe bağlı, 5 dk geçerli, tek kullanımlık, satır kilitli.
- **Kalıcı silme:**
  - Owner parolası şart.
  - HD eğitmeni silinebilir; eğitim kaydı ve erişimi silinir, Owner'ın HD denetim olayı kalır ve kişi bağı NULL olur.
  - Uzman, tenant'ı dışında bir RESTRICT kayıtta geçiyorsa silme reddedilir (UP021) ve **hiçbir** satır değişmez.

## Açık konular (Owner kararı / NOT FIXED)

1. **Android kanal iddiası:**
   - Tarayıcı dışı bir istemci Android kimliği taklit ederek yönetici oturumunu 30 gün / 7 gün hareketsizlik sınırıyla alabilir (web: 24 saat / 2 saat). Bunun için parola + bir MFA onayı gerekir.
   - Düzeltme Owner'ın uygulama içi oturum süresini de kısaltacağı için Owner kararı bekliyor.
2. **QR eşleştirme 3 seçenekli:** Uzaktan oltalamada bilinçsiz dokunuşla doğru seçeneği tutturma olasılığı 1/3. Yanlış seçim isteği iptal eder ve yüksek önem kaydı yazar. Kodu yazdırma seçeneği tasarım kararıdır.
3. **Konum bilgisi:** Onay ekranında konum (şehir) gösterilmiyor; IP konum sağlayıcısı kararı gerekiyor.
4. **Kalıcı silme ve yasal saklama:** Kalıcı silme `security_events` satırlarını yasal saklamaya bakmadan siler (kullanıcıya bağlı tablo, mevcut Owner silme politikası). Politika değişikliği Owner kararıdır.
5. **Gönderilmiş kutusu:** Gmail `gmail.send` ile gönderilen iletiler gönderici kutusunun "Gönderilmiş" klasöründe kalır. Gönderici kutuya erişen kişi canlı kodları görebilir. Bu kutu yalnız Owner'da olmalıdır (2 adımlı doğrulama zorunlu).
6. **Yeniden eşleştirme:** Eşleştirme sırasında bağlantı koparsa sunucudaki `pending_owner` kaydı süresiz kalır; yeniden deneme, Owner reddedene kadar 409 alır. Kullanılabilirlik sorunudur, güvenlik açığı değildir.
7. **Donanım kanıtı:** Sunucu attestation doğrulamıyor (`attestation_level = 'unverified'`). Donanım destekli anahtar kullanılıyor, ancak bu sunucu tarafından **kanıtlanmıyor**.
