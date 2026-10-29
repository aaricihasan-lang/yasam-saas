# William Lilly Horary — yayın kontrol listesi (Owner onayı adım adım)

> Hiçbir adım kendiliğinden uygulanmaz. Production / migration / merge / bayrak adımları yalnız Owner onayıyla ve Owner kanalıyla
> (2026-10-11 astroloji yayınındaki gibi elle `psql`; Supabase `db push` KULLANILMAZ — migration geçmişi bu yolla tutulmuyor).

## 1. Son PR doğrulaması
- Zincir: #591 → #602 → #606 → #611, her biri bir öncekine bağlı; hepsi Draft.
- Her PR'ın farkı yalnız kendi Horary dosyaları; zincirin main'e göre farkında Horary dışı dosya yok.
- Merge'den hemen önce: main'i normal merge ile #591'e al ve zinciri sırayla güncelle (çakışma = DUR). Ardından GitHub `checks` (Regresyon + Next.js build) ve `horary-western` yeşil olmalı.

## 2. Güncel production yedeği (migration ÖNCESİ, zorunlu)
- **Son kanıtlı tam yedek:** Altın Yedek `run-20261028T183608Z` (DB 2026-10-28 18:36 UTC). Migration günü için yeterli DEĞİL; yeni tam yedek alınmalı.
- **Yöntem:** 2026-10-11 paketiyle aynı.
  - Yedek: REPEATABLE READ snapshot + `pg_dump --snapshot`.
  - Doğrulama (`yedek-dogrula`): SHA, TOC ve embedded PG'ye izole restore; satır sayıları birebir olmalı.
  - Saklama: GPG AES-256 ile şifrele; SHA manifest; en az iki ayrı ortam (C: + şifreli USB). USB 29.10'dan beri okunamıyor → önce ikinci kopya ortamı doğrulanmalı.
- **Kapı:** yedek `DOGRULANDI` olmadan migration'a geçilmez.

## 3. Owner onaylı PR merge sırası
#591 → #602 → #606 → #611. Her merge sonrası Vercel production deploy'u modül KAPALI kalacak biçimde (önizleme bayrağı `NEXT_PUBLIC_ATLAS_HORARY_PREVIEW` tanımsız) izlenir. Migration uygulanmadan bayrak açılırsa kayıt uçları DB hatası verir → **sıra: migration önce, bayrak en son.**

## 4. Owner onaylı production migration
**Ön kontrol (salt okunur):**
```sql
SELECT current_setting('server_version_num')::int >= 150000 AS pg15_plus,                     -- ON DELETE SET NULL (kolon)
       to_regclass('public.astro_horary_questions') IS NULL AS tablo_yok,
       to_regprocedure('public.astro_enforce_record_cap()') IS NOT NULL AS tavan_fonksiyonu,  -- 20271101000600
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_tenant_id_id_key') AS clients_tekil; -- 20271101000000
```
Dördü de `true` değilse DUR.

**Uygulama:** `SET lock_timeout = '5s'` + `psql --single-transaction -f supabase/migrations/20271210000000_astro_horary_questions.sql`. Yeni boş tablo oluşur; mevcut tablolarda kısa ACCESS SHARE / REFERENCES kilitleri dışında etki yok.

## 5. Migration sonrası doğrulama (salt okunur)
```sql
SELECT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.astro_horary_questions'::regclass) AS rls,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'astro_horary_questions') AS politika_0,
       has_table_privilege('anon', 'public.astro_horary_questions', 'SELECT') AS anon_false,
       has_table_privilege('authenticated', 'public.astro_horary_questions', 'SELECT') AS auth_false,
       has_table_privilege('service_role', 'public.astro_horary_questions', 'INSERT') AS sr_insert,
       has_table_privilege('service_role', 'public.astro_horary_questions', 'DELETE') AS sr_delete_false,
       has_column_privilege('service_role', 'public.astro_horary_questions', 'result_snapshot', 'UPDATE') AS snap_update_false,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.astro_horary_questions'::regclass AND NOT tgisinternal) AS tetikleyici_2,
       (SELECT confdeltype FROM pg_constraint WHERE conname = 'astro_hq_client_fk') AS fk_set_null_n,
       (SELECT count(*) FROM public.astro_horary_questions) AS satir_0;
```
- Beklenen: `true, 0, false, false, true, false, false, 2, n, 0`.
- **İlk tam yedek (migration SONRASI):** yeni tam yedek alınır. TOC'ta `TABLE public.astro_horary_questions` ve iki tetikleyici bulunmalı; izole restore'da tablo, yetkiler ve tetikleyiciler aynı olmalı (`npm run test:astrology:horary-backup` H-A1…H-A5 ile aynı denetim).

## 6. Horary erişim açılışı (2026-10-30: kalıcı)
- Owner kararı (2026-10-30): Horary önizleme değil, yayınlanmış modül. `NEXT_PUBLIC_ATLAS_HORARY_PREVIEW` bağımlılığı koddan **kaldırıldı** (Vercel ortam değişkeni gerekmez).
- Erişim yalnız `requireAstrologyAccess`: owner (admin yüzeyi) + `module_permissions.astrology` açık uzman (uzman yüzeyi); izinsiz / oturumsuz → 404.
  Yapı testi: `horaryWesternRun.harness` R8; davranış: `horaryWesternRecords-ui.e2e` Y0–Y16.
- Canlı smoke: hesapla → kaydet → arşivde bul → kayıtlı haritayı aç → Word/PDF; başka uzmanla 404; oturumsuz 404.
- **Geri dönüş:** açılış PR'ını geri al (revert) ve yeniden deploy. Tablo ve veri kalır; silme yok.

## 7. Fiziksel cihaz testi ve Owner canlı PASS
- Gerçek iPhone/Android telefon (320–390 px) ve tablette: form, tarih ve saat seçicileri, konum, kaydet, arşiv, PDF açma.
- Yapılan tüm testler tarayıcı öykünmesidir; fiziksel cihaz testi **henüz yapılmadı**.

## Yayın sonrası yedek düzeni (öneri — Owner kararı)
- **Sıklık:** Horary gerçek kullanımdayken en az günlük tam DB yedeği; en az haftalık izole restore doğrulaması. Supabase otomatik yedeği / PITR için kanıt bulunamadı → var sayılmaz.
- **Saklama:** GPG AES-256 + SHA manifest + iki ayrı ortam; anahtar yedekle aynı yerde tutulmaz.
- **Tenant bazlı kurtarma:** `scripts/astrology/horary-records-backup.mjs` her zaman şifreli `.gpg` yazar (düz JSON diske düşmez); geri yüklemede önce `--dry-run`. Üretimden çıktı yalnız Owner kararıyla alınır.
