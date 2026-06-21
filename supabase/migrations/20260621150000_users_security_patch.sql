-- =============================================================================
-- 20260621150000_users_security_patch.sql
--
-- Güvenlik Patch: users tablosu
--
-- YAPILAN DEĞİŞİKLİKLER:
--   1. pgcrypto extension → bcrypt hashing
--   2. password_hash kolonu eklendi
--   3. Mevcut plaintext şifreler bcrypt ile hashlendi
--   4. hash_password()  — API route'larının şifre hashlemesi için RPC
--   5. verify_admin_login() — silme işlemi admin doğrulaması için RPC
--   6. users tablosunda RLS açıldı:
--        - SELECT: anon/authenticated serbestçe okuyabilir (session refresh korunur)
--        - INSERT/UPDATE/DELETE: anon/authenticated engellendi (sadece service_role)
--   7. password ve password_hash kolonları anon/authenticated'dan revoke edildi
--
-- GERİ ALMA (rollback) PLANI:
--   ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
--   GRANT INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;
--   GRANT SELECT (password, password_hash) ON public.users TO anon, authenticated;
--
-- ÖNEMLİ: login_user RPC SECURITY DEFINER tanımlıysa RLS'yi bypass eder
-- ve login akışı değişmez. Test edilmesi önerilir.
-- =============================================================================

-- 1. pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. password_hash kolonu (geçiş süreci için nullable)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;

-- 3. Mevcut plaintext şifreleri bcrypt ile hashle
--    Sadece hash'i olmayan ve password alanı dolu olan satırları güncelle.
UPDATE public.users
SET password_hash = crypt(password, gen_salt('bf', 10))
WHERE password IS NOT NULL
  AND trim(password) != ''
  AND password_hash IS NULL;

-- 4. hash_password — API route'larının bcrypt hash üretmesi için
--    SECURITY DEFINER: servis rolü olarak çalışır, RLS'yi bypass eder.
CREATE OR REPLACE FUNCTION public.hash_password(p_plain text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT crypt(p_plain, gen_salt('bf', 10));
$$;

-- 5. verify_admin_login — admin silme işlemi için şifre doğrulama RPC
--    Client tarafından ASLA çağrılmamalı; yalnızca server API route üzerinden.
--    Hem bcrypt hash hem plaintext geçiş (migration sonrası kademeli geçiş) destekler.
CREATE OR REPLACE FUNCTION public.verify_admin_login(p_email text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash    text;
  v_plain   text;
  v_role    text;
  v_active  boolean;
BEGIN
  SELECT password_hash, password, role, active
  INTO v_hash, v_plain, v_role, v_active
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(p_email))
  LIMIT 1;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role IS DISTINCT FROM 'admin' THEN RETURN false; END IF;
  IF v_active IS NOT TRUE THEN RETURN false; END IF;

  -- Önce bcrypt hash ile denetle (migration sonrası standart)
  IF v_hash IS NOT NULL AND v_hash != '' THEN
    RETURN crypt(p_password, v_hash) = v_hash;
  END IF;

  -- Geçiş dönemi: hash henüz oluşturulmadıysa plaintext karşılaştır
  RETURN trim(v_plain) = trim(p_password);
END;
$$;

-- 6. RLS: users tablosunda etkinleştir
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Mevcut policy'leri temizle (idempotent çalıştırma için)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END
$$;

-- SELECT: anon ve authenticated serbestçe okuyabilir
-- (session refresh, workspace sayfaları etkilenmesin)
-- password ve password_hash kolonları aşağıdaki REVOKE ile korunur.
CREATE POLICY "users_select_open"
  ON public.users
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT: yalnızca service_role (API route'ları)
CREATE POLICY "users_insert_service_only"
  ON public.users
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- UPDATE: yalnızca service_role (API route'ları)
CREATE POLICY "users_update_service_only"
  ON public.users
  FOR UPDATE
  TO anon, authenticated
  USING (false);

-- DELETE: yalnızca service_role (API route'ları)
CREATE POLICY "users_delete_service_only"
  ON public.users
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- 7. Hassas kolonları anon / authenticated'dan gizle
--    SELECT * artık password ve password_hash döndürmez.
REVOKE SELECT (password, password_hash) ON public.users FROM anon;
REVOKE SELECT (password, password_hash) ON public.users FROM authenticated;

-- 8. SELECT grant'ın diğer kolonlar için hâlâ açık olduğundan emin ol
GRANT SELECT ON public.users TO anon, authenticated;

-- 9. Finansal kolonları anon / authenticated'dan gizle
--    Bu kolonlar yalnızca service_role (API route'ları) tarafından kullanılır.
--    loginUser.ts ve yasamUser.ts bu kolonları okumaz — uygulama akışı kırılmaz.
REVOKE SELECT (
  payment_status,
  paid_amount,
  last_payment_date,
  next_payment_date,
  payment_note,
  approved_at
)
ON public.users
FROM anon, authenticated;
