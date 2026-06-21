-- =============================================================================
-- 20260621160000_verify_admin_login_hash_only.sql
--
-- Güvenlik Patch: verify_admin_login plaintext fallback kaldırıldı
--
-- DEĞİŞİKLİK:
--   Önceki sürümde (20260621150000) fonksiyon, password_hash boşsa
--   users.password plaintext alanıyla karşılaştırma yapıyordu.
--   Bu geçiş dönemi kodu production'da güvenlik riski oluşturuyordu.
--
--   Yeni sürüm:
--     - Yalnızca password_hash üzerinden bcrypt (crypt) doğrulaması yapar.
--     - password_hash NULL veya boşsa false döner, başka hiçbir alana bakmaz.
--     - users.password (plaintext) kolonuna hiçbir koşulda erişmez.
--     - Fonksiyon imzası değişmedi; delete route bozulmaz.
--
-- GERİ ALMA:
--   Önceki sürümü geri yüklemek için 20260621150000 migration'ındaki
--   verify_admin_login tanımını tekrar CREATE OR REPLACE ile çalıştır.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.verify_admin_login(p_email text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash   text;
  v_role   text;
  v_active boolean;
BEGIN
  SELECT password_hash, role, active
  INTO v_hash, v_role, v_active
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(p_email))
  LIMIT 1;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role IS DISTINCT FROM 'admin' THEN RETURN false; END IF;
  IF v_active IS NOT TRUE THEN RETURN false; END IF;

  -- Hash yoksa veya boşsa kesinlikle reddet
  IF v_hash IS NULL OR trim(v_hash) = '' THEN RETURN false; END IF;

  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;
