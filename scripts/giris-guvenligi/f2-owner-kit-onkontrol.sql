-- GİRİŞ GÜVENLİĞİ F2 — YAYIN ÖN KONTROLÜ: "MFA zorunlu ama GEÇERLİ çevrimdışı kiti olmayan Owner" var mı? (SALT-OKUNUR)
-- Hiçbir şey yazmaz; tek SELECT. Her F2 düzeyinde (F2 hiç uygulanmamış production dahil) çalışır: olmayan tablo / sütun yalnız
-- koşullu dinamik sorgu (query_to_xml) içinde okunur.
-- Çalıştır (SQL konsolu):  BEGIN READ ONLY; \i scripts/giris-guvenligi/f2-owner-kit-onkontrol.sql ; ROLLBACK;
-- Çıktı tek satır:  owner_kit|<DURUM>|<açıklama>|<GO|NO-GO>|owner_sayisi=<n>
--   F2 ÖNCESİ  users.mfa_required yok → kitsiz zorunlu Owner olamaz (GO)
--   TAMAM      kitsiz zorunlu Owner 0 ve tam 1 Owner (GO)
--   DUR        kitsiz zorunlu Owner > 0  → ÖNCE kit üretilmeli (auth_owner_offline_kit_issue), sonra tekrar (NO-GO)
--   DUR        Owner sayısı 1 değil       → kit üretimi ve F2 Owner kuralları tek Owner varsayar; insan incelemesi (NO-GO)
WITH f AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'mfa_required') AS has_mfa,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_super_admin') AS has_sa,
    to_regclass('public.auth_recovery_codes') IS NOT NULL AS has_codes
), n AS (
  SELECT f.*,
    CASE WHEN f.has_sa THEN (xpath('/row/n/text()', query_to_xml($q$
      SELECT count(*) AS n FROM public.users u
       WHERE lower(btrim(coalesce(u.role::text, ''))) = 'admin' AND u.active IS TRUE AND u.is_super_admin IS TRUE
    $q$, false, true, '')))[1]::text::int END AS owners,
    CASE WHEN f.has_mfa AND f.has_sa THEN (xpath('/row/n/text()', query_to_xml($q$
      SELECT count(*) AS n FROM public.users u
       WHERE u.mfa_required IS TRUE
         AND lower(btrim(coalesce(u.role::text, ''))) = 'admin' AND u.active IS TRUE AND u.is_super_admin IS TRUE
    $q$ || CASE WHEN f.has_codes THEN $q$
         AND NOT EXISTS (SELECT 1 FROM public.auth_recovery_codes c
                          WHERE c.user_id = u.id AND c.kind = 'owner_offline' AND c.state = 'active'
                            AND (c.expires_at IS NULL OR c.expires_at > now()))
    $q$ ELSE '' END, false, true, '')))[1]::text::int END AS kitless
  FROM f
)
SELECT 'owner_kit|' || CASE
    WHEN NOT has_mfa THEN 'F2 ÖNCESİ|users.mfa_required yok — kitsiz zorunlu Owner olamaz (0)|GO'
    WHEN kitless > 0 THEN 'DUR|kitsiz zorunlu Owner sayısı=' || kitless || ' — önce auth_owner_offline_kit_issue() ile kit üretin, kâğıda yazın|NO-GO'
    WHEN coalesce(owners, 0) <> 1 THEN 'DUR|Owner sayısı 1 değil — kit üretimi ve F2 Owner kuralları tek Owner varsayar; insan incelemesi|NO-GO'
    ELSE 'TAMAM|kitsiz zorunlu Owner yok (0)|GO' END
  || '|owner_sayisi=' || coalesce(owners::text, '?') AS sonuc
FROM n;
