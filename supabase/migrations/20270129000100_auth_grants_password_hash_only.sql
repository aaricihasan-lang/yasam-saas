-- =============================================================================
-- 20270129000100_auth_grants_password_hash_only.sql
--
-- FAZ1 FINAL HARDENING — PAKET AUTH (2/3): HASH-ONLY login_user + anon/PUBLIC EXECUTE KAPATMA
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Dosya yalnız HAZIRLANDI; apply ayrı owner onayıyla.
--
-- AMAÇ:
--   (a) Boş password_hash backfill (idempotent). Prod gerçeği: 9/9 kullanıcıda bcrypt hash DOLU →
--       prod'da 0 satır etkiler. Düz metin `password` kolonu NULL'LANMAZ / SİLİNMEZ (owner kararı).
--   (b) login_user HASH-ONLY: aynı imza + aynı dönüş tipi (CREATE OR REPLACE); düz metin
--       fallback dalı KALDIRILDI. Dönen kolonlar/semantik (active/approval filtrelenmez) AYNI.
--   (c) EXECUTE REVOKE (PUBLIC, anon, authenticated) + GRANT service_role:
--         login_user(text,text), verify_admin_login(text,text), hash_password(text),
--         dogaltas_normalize_name(text), hacamat_rules_identity_guard().
--       GEREKÇE (kırılmaz):
--         * login_user: tarayıcı RPC çağrısı KALDIRILDI (tek login yolu /api/auth/session,
--           service_role). change-password da sunucuda (service_role).
--         * verify_admin_login / hash_password: yalnız sunucu route'ları (service_role) çağırır.
--         * dogaltas_normalize_name: yalnız SECURITY DEFINER RPC'ler (create/update_combination_
--           with_stones) içinde çağrılır → fonksiyon SAHİBİNİN yetkisiyle çalışır (sahip EXECUTE
--           hakkını korur). Kod doğrudan RPC olarak çağırmaz (grep: app/lib'de referans yok).
--         * hacamat_rules_identity_guard: TRIGGER fonksiyonu — trigger ateşlenirken EXECUTE yetkisi
--           KONTROL EDİLMEZ (yalnız CREATE TRIGGER anında). Yerel embedded-pg testinde
--           authenticated rolüyle UPDATE → trigger çalıştığı doğrulandı.
--
-- PRECONDITION: public.users (password, password_hash), extensions.pgcrypto. Fonksiyonlar yoksa
--   ilgili REVOKE atlanır (to_regprocedure korumalı, RAISE NOTICE).
-- VERİ-YIKICI MI: HAYIR. (a) yalnız password_hash BOŞ ve password DOLU satırlara hash yazar
--   (prod: 0 satır). Hiçbir satır silinmez; düz metin kolonu değişmez.
-- APPLY SIRASI (ZORUNLU): ÖNCE yeni kod deploy (tarayıcı artık login_user çağırmaz), SONRA bu
--   migration. Aksi halde eski istemci (anon) login'i 401/permission denied alır.
--   20270129000000 (auth_login_throttle) bundan önce/aynı anda.
-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.login_user(text,text) TO anon, authenticated;  (eski davranış)
--   + 20260624230000 içindeki login_user tanımı (düz metin fallback'li) yeniden uygulanabilir.
-- =============================================================================

BEGIN;

-- (a) Boş hash backfill — yalnız hash'i olmayan ve düz metni olan satırlar (prod: 0 satır).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password')
     AND EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash')
  THEN
    UPDATE public.users
       SET password_hash = extensions.crypt(btrim(password), extensions.gen_salt('bf', 10))
     WHERE coalesce(password_hash, '') = ''
       AND coalesce(btrim(password), '') <> '';
  ELSE
    RAISE NOTICE 'users.password/password_hash yok — backfill atlandı';
  END IF;
END $$;

-- (b) login_user HASH-ONLY (aynı imza + dönüş tipi → CREATE OR REPLACE geçerli).
CREATE OR REPLACE FUNCTION public.login_user(p_email text, p_password text)
RETURNS TABLE (
  id              uuid,
  email           text,
  name            text,
  role            text,
  status          text,
  tenant_id       uuid,
  active          boolean,
  approval_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    u.id::uuid,
    u.email::text,
    u.name::text,
    u.role::text,
    u.status::text,
    u.tenant_id::uuid,
    u.active::boolean,
    u.approval_status::text
  FROM public.users u
  WHERE lower(btrim(u.email)) = lower(btrim(p_email))
    -- HASH-ONLY: bcrypt eşleşmesi zorunlu. Düz metin (users.password) dalı KALDIRILDI.
    AND u.password_hash IS NOT NULL
    AND u.password_hash <> ''
    AND extensions.crypt(p_password, u.password_hash) = u.password_hash
  LIMIT 1;
$$;

-- (c) EXECUTE kapatma — PUBLIC/anon/authenticated REVOKE, service_role GRANT.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.login_user(text,text)',
    'public.verify_admin_login(text,text)',
    'public.hash_password(text)',
    'public.dogaltas_normalize_name(text)',
    'public.hacamat_rules_identity_guard()'
  ] LOOP
    IF to_regprocedure(f) IS NULL THEN
      RAISE NOTICE 'fonksiyon yok, atlandı: %', f;
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT p.oid::regprocedure, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname IN ('login_user','verify_admin_login','hash_password',
--          'dogaltas_normalize_name','hacamat_rules_identity_guard');   -- anon_exec = false
--   SELECT count(*) FROM public.users WHERE coalesce(password_hash,'') = '';  -- 0
-- =============================================================================
