# 7 Günlük Ücretsiz Deneme — Hukuki Metinler (uygulama kaydı)

> Güncelleme: 2026-11-07. Açıklamalar mevcut sayfalara işlendi (yeni hukuki sayfa yok). Bu belge,
> neyin nereye işlendiğini, mevcut teknik davranışı ve tek deneme hakkı saklama önerisini kaydeder.

## 1. İşlenen yerler

| Konu | Sayfa / dosya |
|---|---|
| Deneme kayıtları, kredi kullanımı, Pro talepleri | Gizlilik Politikası → "Hangi Verileri İşliyoruz?" |
| Sahte/tekrarlı kayıt önleme, HMAC e-posta/IP özetleri, güvenlik sinyalleri | Gizlilik Politikası → aynı bölüm |
| Otomatik güvenlik değerlendirmesi (inceleme durumu, kalıcı ret yok, itiraz) | Gizlilik Politikası → aynı bölüm (paragraf) |
| Cloudflare Turnstile (tarayıcı doğrudan bağlanır; sunucu IP göndermez) | Gizlilik Politikası → "Hizmet Sağlayıcılar"; `/alt-isleyiciler` (#746) |
| Hesap silme ve kayıtların saklanması; tek deneme hakkı kaydı | Gizlilik Politikası → "Saklama ve Silme" |
| Deneme koşulları (168 saat, tek hak, inceleme, Dijital İçerik hariç, süre sonu, Pro) | Kullanım Şartları → "Ücretsiz Deneme Üyeliği" |
| Kayıt anında bilgilendirme (Gizlilik + Kullanım Şartları bağlantısı) | `/register` formu |

`/kvkk-aydinlatma` (danışan örnek metni), Veri İşleme Sözleşmesi ve Ücretsiz Analiz aydınlatması
deneme sistemiyle ilgili olmadığından değiştirilmedi.

## 2. Mevcut teknik davranış (kodla doğrulanmış)

| Kayıt | İçerik | Hesap silinince |
|---|---|---|
| `users.trial_*` | Deneme durumu, başlangıç/bitiş | Silinir |
| `trial_profiles` | IP'nin HMAC özeti, risk puanı ve işaretleri, kredi limitleri | Silinir (FK cascade) |
| `trial_credit_ledger` | Gün, modül, durum, HTTP kodu, uç etiketi (hesaplama içeriği yok) | Silinir (FK cascade) |
| `pro_upgrade_requests` | Tarih, durum, isteğe bağlı not | Silinir (FK cascade) |
| `trial_claims` | Kanonik e-postanın HMAC özeti, oluşturulma tarihi, ilk hesabın sistem içi ID'si | **Kalır** (FK yok) |
| `trial_admin_events` | Yönetici işlem kaydı (kullanıcı ID ile) | Kalır (denetim kaydı) |
| Cloudflare Turnstile | Tarayıcı doğrudan Cloudflare'e bağlanır; sunucu yalnız belirteç + gizli anahtar gönderir (`remoteip` yok, #746) | — |

Hesap silme: `admin_purge_archived_expert` → `DELETE FROM public.users` (FK cascade çalışır).

## 3. Tek deneme hakkı kaydı — saklama önerisi

**Kayıt tarihinden itibaren 24 ay saklama, ardından imha (silme); hesap silinse de bu süre boyunca
tutulur.** İmha aylık çalışan periyodik bir işle yapılır.

Gerekçe:
- **Amaçla sınırlılık ve ölçülülük (KVKK m.4/2-ç, d):** Amaç, aynı kişinin yeniden ücretsiz deneme
  almasını önlemektir. Süresiz saklama bu amaç için ölçüsüzdür; 24 ay, 7 günlük bir deneme ürünü için
  caydırıcılığı korurken sınırlı bir süredir ve platformdaki en uzun mevcut saklama süresiyle
  (günlük kullanım özetleri, 25 ay) uyumludur.
- **Veri en aza indirme:** Kayıt ad, e-posta veya IP içermez; yalnız sunucu sırrıyla üretilmiş
  geri döndürülemeyen özet tutulur (takma adlandırılmış veri — anonim veri değildir).
- **Hukuki sebep:** meşru menfaat (KVKK m.5/2-f) — kötüye kullanımın önlenmesi; temel hak ve
  özgürlüklere etkisi düşük (özet, kısa veri seti, ticari olmayan amaç dışı kullanım yok).
- **Periyodik imha:** Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında
  Yönetmelik — periyodik imha aralığı en fazla 6 ay.

**Owner kararı (2026-11-07): 24 ay saklama + aylık otomatik imha ONAYLANDI ve uygulandı.**
- Migration `20280101000100_trial7_claims_retention.sql`: `trial_claims_retention_purge(p_dry_run)`
  (SECURITY DEFINER, süre sabit 24 ay, yalnız `trial_claims`, yalnız service_role) + `claimed_at` indeksi.
- Inngest `trial-claims-retention-purge`: her ayın 1'i UTC 03:23; varsayılan açık; acil durdurma
  `TRIAL_CLAIMS_RETENTION_DISABLED=true`.
- Gizlilik Politikası → "Saklama ve Silme": 24 ay + aylık imha; süre sonunda (hesap silinmişse)
  yeniden deneme mümkün. Yayımlanan metne hukuki dayanak yazılmadı.

## 4. Owner / hukuk kararı gereken noktalar

1. **Hukuki dayanak teyidi:** tek deneme hakkı kaydı için meşru menfaat (m.5/2-f) dayanağı ve dengeleme
   değerlendirmesi hukukçu tarafından teyit edilmeli (süre Owner kararıyla 24 ay).
2. **Cloudflare'e yurt dışı aktarım dayanağı (KVKK m.9):** Ücretsiz Analiz için belirlenen dayanağın
   uzman kayıt formunu da kapsadığının teyidi.
3. Platform VERBİS kaydına tabiyse saklama-imha politikasına bu kaydın eklenmesi.
