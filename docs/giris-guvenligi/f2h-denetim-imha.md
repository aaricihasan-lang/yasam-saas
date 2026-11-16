# Giriş Güvenliği F2-H — Denetim Kayıtları: Saklama ve Kontrollü İmha

Migration: `supabase/migrations/20280103000800_auth_audit_retention_disposal_f2h.sql` (F2-A…F2-G'ye bağımlı, ekleyici).
Owner ekranı: **Yönetim › Denetim kayıtları — saklama ve imha** (`/admin/denetim-saklama`).

## Varsayılan durum

Üç tablo (`auth_device_decisions`, `auth_recovery_events`, `security_events`) **karar bekliyor**. Süre, hukuki gerekçe ve yöntem
girilmeden önizleme ve imha yapılamaz. Bu sürüm hiçbir süreyi dayatmaz, hiçbir kaydı silmez ve zamanlayıcı içermez.

## Akış

1. **Karar:** süre (30–36500 gün) + hukuki gerekçe (en az 10 karakter) + yöntem.
   - Owner'ın son 30 dk'da ikinci doğrulamayla açılmış oturumu ve işleme özel ek doğrulama (telefon QR veya e-posta kodu) gerekir.
   - Karar veren ve tarih kaydedilir.
   - `security_events` yalnız silinebilir: kullanıcı bağlantısı nedeniyle anonimleştirme gerçek anonimlik sağlamaz.
2. **Önizleme:** yalnız sayım.
   - Kesim tarihi sabitlenir; yasal saklama nedeniyle hariç tutulan kayıt sayısı ve kararın parmak izi kaydedilir.
   - Önizleme 1 saat geçerlidir. Tablo başına tek açık önizleme olabilir.
3. **Yürütme:** ayrı açık onay gerekir.
   - Birebir onay metni (`<tablo> <yöntem> <sayı>`) + çalıştırmaya bağlı ek doğrulama.
   - Tek veritabanı işleminde çalışır. Karar değiştiyse ya da aday sayısı önizlemeden farklıysa **hiçbir kayıt değişmez**.
   - Hata olursa işlem geri alınır, durum `failed` olur; kısmi imha olmaz.
   - Paralel ikinci yürütme reddedilir.
4. **Yasal saklama:**
   - Kişi veya cihaz bazında. Saklamadaki kayıtlar imha edilmez.
   - Saklamaya almak serbesttir; kaldırmak ek doğrulama ister.
   - İkisi de açık önizlemeleri geçersiz kılar.

## Yöntemler

| Yöntem | `auth_recovery_events` | `auth_device_decisions` | `security_events` |
|---|---|---|---|
| Silme | Satır silinir | Satır silinir | Satır silinir |
| Anonimleştirme | Kişi kimliği sıfır kimlik, aktör yok, ayrıntı boş; olay türü ve tarih kalır | Cihaz ve aktör kimliği sıfır, not boş; karar türü ve tarih kalır | İzin yok |

## Değiştirilemezlik

Denetim tabloları sıradan işlemlere (veritabanı yöneticisi dahil) kapalı kalır. Tetikleyici yalnız şu durumda izin verir:
- Bu işlemde yürüyen bir imha çalıştırması var (işlem kimliğine bağlı bağlam; API rolüne kapalı),
- çalıştırma bu tablo içindir,
- satır kesim tarihinden eskidir,
- ve değişiklik tam silme ya da tam anonimleştirme biçimindedir.

İmha işlem kaydı (`auth_retention_log`) değiştirilemezdir ve kişisel veri içermez.

## Hukuki karar sonrasında

Owner bu ekranda kararı girer. Hiçbir kod değişikliği gerekmez.
