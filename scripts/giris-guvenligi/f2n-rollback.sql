-- GİRİŞ GÜVENLİĞİ F2-N — GERİ ALMA (20280103001300_auth_owner_mfa_kit_guard_f2n.sql).
-- YALNIZ Owner kararıyla, SQL konsolunda, tek işlemde çalıştırılır. Veri DEĞİŞTİRMEZ (kit / kullanıcı satırlarına dokunmaz);
-- yalnız F2-N tetikleyicilerini + fonksiyonlarını kaldırır ve F2 şema düzeyi kaydını 1200'e (F2-M) döndürür.
-- Sonuç: Owner'ın kitsiz zorunluluğu yine YALNIZ API katmanında (#833) engellenir; DB katmanı koruması kalkar.
-- Migration geçmişi elle tutuluyorsa: supabase_migrations.schema_migrations'tan '20280103001300' satırı ayrıca silinmelidir
-- (bu betik geçmiş tablosuna DOKUNMAZ; f2-preflight.sql geçmiş / katalog uyumsuzluğunu raporlar).
-- Yeniden uygulama: 20280103001300 dosyası olduğu gibi tekrar çalıştırılabilir (kayıt 1200 → koruma sıradaki aşama sayar).
BEGIN;
DO $f2n_rb$
BEGIN
  IF to_regprocedure('public.auth_f2_schema_level()') IS NULL OR public.auth_f2_schema_level() <> 1300 THEN
    RAISE EXCEPTION 'F2-N geri alma: şema düzeyi 1300 değil (yanlış ortam / zaten geri alınmış) — hiçbir şey değişmedi'
      USING ERRCODE = 'YF203';
  END IF;
END $f2n_rb$;
DROP TRIGGER IF EXISTS users_owner_mfa_kit_guard_trg ON public.users;
DROP TRIGGER IF EXISTS auth_owner_kit_invalidate_upd_trg ON public.auth_recovery_codes;
DROP TRIGGER IF EXISTS auth_owner_kit_invalidate_del_trg ON public.auth_recovery_codes;
DROP TRIGGER IF EXISTS auth_owner_kit_lock_order_trg ON public.auth_recovery_codes;
DROP TRIGGER IF EXISTS auth_owner_kit_truncate_guard_trg ON public.auth_recovery_codes;
DROP FUNCTION IF EXISTS public.auth_owner_kit_lock_order();
DROP FUNCTION IF EXISTS public.users_owner_mfa_kit_guard();
DROP FUNCTION IF EXISTS public.auth_owner_kit_invalidation_guard();
DROP FUNCTION IF EXISTS public.auth_owner_kit_locked_count(uuid);
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 1200 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
