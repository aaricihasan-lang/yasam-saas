# Numeroloji Merkezi (Klasik Numeroloji) — Yayın Sırası ve Geri Dönüş Planı

Durum: TASLAK — her adım ayrı Owner onayı ister. Bu belge hiçbir adımı uygulamaz.
Kapsam: Draft PR #604 (`work/numeroloji-merkezi-roxy`). Mevcut Numeroloji modülüne dokunulmaz.

## 0. Ön koşullar (hepsi sağlanmadan 1. adıma geçilmez)

| # | Koşul | Sahibi |
|---|---|---|
| 0.1 | Görsel Owner PASS + kesin ekol adları ("Mevcut Numeroloji" / "Klasik Numeroloji" geçici) | Owner |
| 0.2 | #604 CI yeşil (TypeScript, DB-02, güvenlik çekirdeği, AŞAMA 1 PG, regresyon, build) | Claude |
| 0.3 | Sağlayıcı aboneliği **05.11.2026**'da bitiyor → yenilendi mi? Bitmişse 6. adım yapılmaz | Owner |
| 0.4 | Saklama kararı (SAKLAMA.md §6) — en azından "önce yalnız kuru çalıştırma" onayı | Owner |
| 0.5 | Production altın yedek (DB + Storage) alındı ve doğrulandı (mevcut yedek prosedürü) | Owner |

## 1. Kod yayını — bayraklar KAPALI (davranış değişmez)

1. #604 → main (merge commit). Vercel production deploy.
2. Production ortamında `NUMEROLOGY_CLASSIC_ENABLED` ve `NUMEROLOGY_CLASSIC_PROVIDER_CALLS` **tanımsız** kalır.
3. Duman testi (Owner hesabı):
   - `/numeroloji-merkezi`, `/numeroloji-klasik`, `/api/numeroloji-klasik/entitlements` → **404**.
   - Mevcut `/numeroloji` ekranları, kayıtları, Word/PDF ve danışan dosyası Numeroloji sekmesi aynen çalışır.
   - Danışan dosyası Numeroloji sekmesinde "Klasik Numeroloji" kartı **görünmez** (API 404 → kart çizilmez).
4. Bu adımda veritabanı değişikliği YOK; tablolar yokken bayrak kapalı olduğu için hiçbir yeni sorgu çalışmaz.

## 2. Production migration (yalnız ekleyici)

- Dosya: `supabase/migrations/20271205000000_numerology_classic_core.sql` (idempotent; yalnız yeni tablolar + bir tetikleyici
  fonksiyonu; mevcut tablolara dokunmaz; sonunda `NOTIFY pgrst, 'reload schema'`).
- Uygulama yöntemi Owner'ın mevcut production migration yöntemiyle (Frankfurt production).
- Sonrası kontrol (SQL, salt okunur):
  - 6 tablo var: `numerology_classic_analyses`, `…_response_cache`, `…_catalog`, `numerology_comparative_notes`,
    `numerology_classic_provider_calls`, `numerology_classic_purge_log`.
  - Hepsinde RLS açık, **0 policy**; anon / authenticated / PUBLIC yetkisi yok; yalnız service_role'e allowlist yetki.
  - `clients(tenant_id, id)` bileşik FK hedefi (`clients_tenant_id_id_key`) mevcut.
- Bayrak hâlâ kapalı → kullanıcıya görünür değişiklik yok.

## 3. Production ortam değişkenleri (Vercel → Production)

| Değişken | Değer | Not |
|---|---|---|
| `NUMEROLOGY_CLASSIC_CACHE_SECRET` | yeni rastgele ≥32 karakter | Ayrı sır (service-role döndürülürse önbellek geçersizleşmez) |
| `NUMEROLOGY_CLASSIC_QUOTA_HEADER_GAP` | 29.10 ölçümü ≈ 21.920 → öneri **22000** | NK-006: başlık sayacı hesap kalanından yüksek |
| `NUMEROLOGY_CLASSIC_QUOTA_FLOOR` | varsayılan 3000 (gerekirse artır) | HD + Atlas ile ortak anahtarı korur |
| `NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS` | 90 (varsayılan) | KVKK saklama kararıyla uyumlu |
| `ROXY_API_KEY` | mevcut (HD / Atlas ile ortak) | Değişmez |
| `NUMEROLOGY_CLASSIC_ENABLED`, `…_PROVIDER_CALLS` | **tanımsız** | 5. adıma kadar |

Not: Vercel'de ortam değişkeni değişikliği yeni bir deploy ile etkinleşir.

## 4. Katalog (sayı anlamları + bileşik sayılar + uğurlu ilişkiler)

- Kaynak: kayıtlı ham yanıtlar (repo dışı QA klasörü) — **0 kredi**. Araç `scripts/numeroloji-klasik/catalog/import.ts`
  yalnız yerel hedefe izinlidir; production için Owner yöntemi: araçla yerelde üretilen satırların SQL/CSV dökümü →
  production'a tek seferde yükleme (yalnız `numerology_classic_catalog`; kişisel veri yok; tekrar yüklemek güvenli/upsert).
- Kontrol: yerel içe aktarımda 79 satır; production'da aynı sayı ve dil (tr/en) dağılımı.
- Katalog yoksa: Sayı Kütüphanesi ekranı "içerik henüz yüklenmedi" boş durumu gösterir; analizler etkilenmez.

## 5. Gizli açılış (menü bağlantısı YOK)

1. `NUMEROLOGY_CLASSIC_ENABLED=true`, `NUMEROLOGY_CLASSIC_PROVIDER_CALLS=false` → deploy.
   Modül yalnız adresle erişilir; yeni hesap yapılamaz (kayıt yok, kredi yok). Ekranlar, yetki, boş durumlar kontrol edilir.
2. `NUMEROLOGY_CLASSIC_PROVIDER_CALLS=true` → deploy.
3. Owner duman testi (gerçek hesap, test danışanı; beklenen tüketim ~10–15 kredi):
   - Kişi analizi (tüm teknikler) → sonuç sekmeleri; Word ve PNG indir; kayıtlardan aç (0 çağrı); karşılaştırma;
     danışan dosyası kartı; ikinci uzman hesabıyla erişilemediğini doğrula; analizi sil.
   - `numerology_classic_provider_calls`: çağrı sayısı ve `quota_remaining`; Vercel loglarında `[numeroloji-klasik]` hatası yok.
   - "Gelecek Yılları Göster" izni olmayan bir uzmanla gelecek yıl hedefi → 403.
4. Bayrak açıkken Doğaltaş Kütüphanesi production'da kapalıysa taşlar "yalnız ad" yedek modunda görünür (beklenen).

## 6. Menü bağlantısı (ayrı küçük PR)

- Ana menü / Analiz Merkezi'nde Numeroloji girişinin ekol kapısına (`/numeroloji-merkezi`) yönlendirilmesi ayrı bir PR'dır
  (bu PR menüyü değiştirmez). Görsel PASS'tan sonra açılır, ayrıca incelenir.

## 7. Açılış sonrası

- Saklama: production'da 2 hafta yalnız `dryRun` temizlik raporu (denetim kaydından okunur) → Owner onayıyla zamanlanmış
  gerçek temizlik (ayrı PR; günlük, düşük trafik saati).
- İzleme: günlük `provider_calls` sayısı, `QUOTA_PROTECTED` / `RATE_LIMITED` yanıtları, hesap `/usage` (Owner, haftalık).
- Yedek: `numerology_classic_analyses` ve `numerology_comparative_notes` açılışta uzman yedeğine alınacak
  (`lib/backup/registry.ts` şu an `system` / yedek dışı; ayrı küçük PR; `provider_meta` maskelenerek — NK-R17).

## Geri dönüş planı (en hafiften en ağıra)

| Seviye | Ne zaman | İşlem | Veri | Süre |
|---|---|---|---|---|
| G1 | Sağlayıcı hatası / kota / maliyet | `NUMEROLOGY_CLASSIC_PROVIDER_CALLS` kaldır → deploy | Kayıtlı analizler okunur; yeni hesap yok | Dakikalar |
| G2 | Ekran / yetki sorunu | `NUMEROLOGY_CLASSIC_ENABLED` kaldır → deploy (ya da Vercel Instant Rollback) | Veri korunur; modül ve danışan kartı görünmez (404) | Dakikalar |
| G3 | Menü bağlantısı sorunu | Menü PR'ını geri al (`git revert`) | Etkisiz | Dakikalar |
| G4 | Kodun kendisi sorunlu | #604 merge commit'ini `git revert` → deploy | Tablolar kalır (zararsız; bayraklar kapalı) | Dakikalar |
| G5 | Modül tamamen kaldırılacak (Owner açık kararı) | Önce yedek; migration başlığındaki `DROP TABLE` sırası | **Yalnız bu modülün verisi silinir** | Owner kararı |

- G1–G4 hiçbir kullanıcı verisini silmez; mevcut Numeroloji her seviyede etkilenmez (kod ve tabloları ayrı).
- G5 yalnız açık Owner talimatıyla ve yedekten sonra.
