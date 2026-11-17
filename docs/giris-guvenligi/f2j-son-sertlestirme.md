# Giriş Güvenliği F2-J — Güvenlik Son Sertleştirme (17.11.2026)

Bağımlılık: F2-I (#810). Migration: `supabase/migrations/20280103001000_auth_session_device_binding_f2j.sql` (ekleyici).
Production'a hiçbir şey uygulanmadı; bütün kanıtlar sentetik PostgreSQL ve gerçek route'larla alındı.

## 1. Migration yeniden / sırasız uygulama koruması

Her F2 migration'ı (000000…001000) kendi transaction'ının başında, hiçbir nesneye dokunmadan önce iki bağımsız kaynağı okur:

- kayıt: `public.auth_f2_schema_level()` (her doğrusal F2 migration'ı COMMIT'ten önce kendi düzeyini yazar; API rollerine kapalı);
- katalog parmak izi: her aşamanın ilk oluşturduğu, sonra yeniden tanımlanmayan bir nesne.

| Kod | Anlamı | Sonuç |
|---|---|---|
| YF201 | Daha yeni bir F2 aşaması mevcut | Reddedilir, hiçbir şey değişmez |
| YF202 | Önceki aşamalardan biri eksik (sıra hatası) | Reddedilir |
| YF203 | Kayıt ile katalog çelişiyor | Reddedilir — insan incelemesi |

- En son dosyanın tekrar çalıştırılması idempotenttir (katalog farkı 0, testle kanıtlı).
- `000200` doğrusal zincirin dışındadır: yalnız 000100'ü şart koşar, kaydı değiştirmez.
- Blokları `scripts/giris-guvenligi/f2-migration-guard.mjs --yaz` üretir; CI `--denetle` ile güncelliğini doğrular.
- Bütün F2 dosyaları `BEGIN … COMMIT` içindedir: `psql` `ON_ERROR_STOP` kapalı olsa bile reddedilen / yarıda kalan dosya hiçbir şey bırakmaz (testle kanıtlı).

### Salt-okunur ön kontrol ve yayın sonrası kontrol

- `scripts/giris-guvenligi/f2-preflight.sql` — **tek SELECT**, READ ONLY transaction içinde:
  `BEGIN READ ONLY; \i scripts/giris-guvenligi/f2-preflight.sql ; ROLLBACK;`
  Her migration için `on_kontrol|<sürüm>|<KARAR>|<ayrıntı>`: UYGULANABİLİR · ZATEN UYGULANMIŞ · YENİDEN UYGULAMA YASAK ·
  SIRA HATASI · ŞEMA SAPMASI · İNSAN İNCELEMESİ GEREKLİ. Ayrıca `durum|…` ve `gecmis|UYUMLU/UYUMSUZ|…` (migration geçmişi ↔ katalog).
- `scripts/giris-guvenligi/f2-postflight-check.sql` — elle yazılmış kritik iğneler + üretilmiş **katalog manifesti**: son aşamanın
  bütün F2 fonksiyonları (imza, gövde özeti, SECURITY DEFINER, search_path, API / service_role yetkisi), tetikleyiciler,
  F2 tabloları (RLS, yetki) ve kolonları satır satır karşılaştırılır; eksik, fazla (ör. eski overload) veya farklı her satır FAIL.
- Manifest, zincir production'daki Supabase varsayılan yetkileri taklit edilerek üretilir (`scripts/giris-guvenligi/f2-katalog.mjs --uret`);
  CI `--denetle` ile güncelliğini doğrular.

## 2. Android yönetici oturumu — kriptografik cihaz kanıtı (Owner kararı B)

- Oturum kanalı HTTP başlıklarından türetilir ve **kanıt değildir**. Kanıtsız `android_app` yönetici oturumu web sınırlarındadır
  (24 saat mutlak, 2 saat boşta).
- Uzun sınırlar (Android mutlak süre + uzman boşta süresi) yalnız güvenilir cihazın **asıl anahtarı** (her kullanımda biyometri / cihaz
  kilidi) ile imzalanmış `YS-SESSION-BIND-V1` kanıtından sonra uygulanır:
  `YS-SESSION-BIND-V1\n<deviceId>\n<nonce>\n<sessionId>\n<ts>` (nonce sunucudan, 64 hex, tek kullanımlık, 120 sn, oturuma bağlı).
- Kanıt **24 saatte bir** yenilenir; bayat kanıtlı oturum sonlandırılmaz ama yalnız yeniden kanıt kabul eder (çalınan oturum anahtarının
  değeri en çok 24 saat). Bağlı cihaz iptal edilince oturum `device_revoked` ile hemen biter. Oturum başka cihaza geçirilemez.
- Uç noktalar: `POST /api/auth/session/device-bind/begin` (oturumla), `POST /api/auth/session/device-bind` (oturum anahtarı OLMADAN; imza +
  nonce). Oturum anahtarı Android yerel koduna hiç verilmez.
- Android 2.0.0: web `/m/oturum-bagla#s=…&n=…` ana çerçeve gezinmesi (yalnız uygulama alan adı) yerel `SessionBindActivity`'yi açar.
  WebView User-Agent eki `YasamOturumBagla/1` yalnız yetenek bildirimidir; 1.9.x ve tarayıcılarda bağlama denenmez.
- Kanal tutarlılığı: `auth_finalize_login` kanalı giriş başlangıcında kaydedilen değerden alır; tamamlama isteği kanalı değiştiremez.
- Uzman oturumlarının davranışı değişmedi.

## 3. Eski süresiz Android oturumları — geçiş altyapısı

- `public.auth_legacy_session_policy` (tek satır). Varsayılan `kapali` → davranış **bugünküyle aynı**; yayın hiçbir oturumu kapatmaz.
- Owner, taze MFA'lı oturumla `auth_legacy_session_policy_set(token, 'kademeli', <son tarih ≥ 7 gün sonra>)` çağırabilir:
  son tarihe kadar oturum geçerli (boşta süresi politikanın açıldığı andan itibaren sayılır), son tarihte `legacy_deadline` ile biter.
  `auth_session_legacy_info(token)` bildirim için oturumun eski model olup olmadığını ve son tarihi döndürür.
- **Gerçek oturumlara uygulanması ayrı Owner onayıdır.** Önerilen takvim: 2.0.0 uygulama yayınından sonra en az 14 gün (kullanıcılar
  güncel uygulamayla yeniden giriş yapar); bildirim + son tarih.

## 4. Diğer düzeltmeler

| Kod | Düzeltme |
|---|---|
| N1 | Arşivleme / arşivden çıkarma / kalıcı silme rotalarında parola yeniden doğrulaması, giriş ekranıyla aynı kısıtlamalı doğrulamadan (`auth_login_guarded`, kilit → 429) geçer; mesajlar korunur. |
| L1 | Adres doğrulama kodu gönderildiği adrese bağlı (`verify:<kullanıcı>:<adres>`); adres değişikliği yarışında eski kod yeni adresi doğrulayamaz. |
| L2 | E-posta kodu doğrulaması, üretimle aynı kullanıcı kilidini alır ve 24 saatlik ≤10 yanlış deneme tavanını doğrulamada da uygular (tavan dolunca kod karşılaştırılmaz). |
| L3 | Sentetik e-posta sağlayıcısı yalnız `EMAIL_SYNTHETIC_ALLOW=1` + Vercel üretim/önizleme dışı + yerel veritabanı adresinde seçilebilir. **Production'da `EMAIL_SYNTHETIC_ALLOW` tanımlanmamalıdır.** |
| D2 | `service_role`: `user_sessions`'ta yalnız `is_active`, `ended_at`, `end_reason` güncellenebilir; `security_events` yalnız ekleme + okuma. Uygulama ve geri dönüş hedefi kod yalnız bu kolonları yazar. |

## 5. Yayın sırası (güncel)

1. Ön kontrol: `f2-preflight.sql` → 000000 UYGULANABİLİR, geçmiş UYUMLU.
2. Migration'lar: `000000 → 000100 → 000300 → 000400 → 000500 → 000600 → 000700 → 000800 → 000900 → 001000`
   (her adımdan önce ön kontrol "UYGULANABİLİR" olmalı; eski kod çalışmaya devam eder).
3. `f2-postflight-check.sql` (000200 öncesi) → PASS.
4. PR zinciri üstten aşağı normal merge commit (#812 → #810 → … → #792 → main); tek yayın.
5. Canlı doğrulama.
6. `000200` (en son) → `f2.postflight_final=on` ile postflight → PASS.

Geri dönüş: 001000 eski kodla uyumludur (yeni kolonlar / fonksiyonlar eski kodu etkilemez; eski kod `user_sessions`'ta yalnız
sonlandırma kolonlarını yazar). 000200 sonrası eski koda dönülürse yönetici web girişi kesilir (değişmedi).

## 6. Owner kararı bekleyenler (uygulanmadı)

- QR eşleştirme (3 seçenek → yazma / daha çok seçenek; yanlış seçimde kardeş isteklerin iptali ve kilit).
- Bekleyen cihaz eşleştirmesi süresi (`pending_owner` TTL) ve yerini alma kuralları.
- Kalıcı silme × yasal saklama (`security_events`): saklama varken silmenin reddi önerilir.
- Yönetici hesabı oluşturma / yöneticiye yükseltme için işleme özel doğrulama (N2).
- `AUTH_MFA_EMAIL_ROLES` için Owner'a özel kapsam; Gmail "Gönderilmiş" klasörü işletimi.
- Eski süresiz oturum politikasının açılması ve son tarih.

## 7. Gerçek ortamda doğrulanmayanlar (NOT TESTED)

Fiziksel Android (Keystore, biyometri, App Links, Android 7–10), iPhone Safari, gerçek Gmail gönderimi, production ortam değişkenleri,
donanım attestation.
