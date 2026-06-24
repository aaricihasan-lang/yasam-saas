-- =============================================================================
-- 20260624230000_login_user_gating_fields.sql
--
-- security(auth): include gating fields in login_user RPC
--
-- SORUN:
--   login_user RPC kimlik doğrular ama yalnızca şu kolonları döndürüyordu:
--     id, email, name, role, status, tenant_id
--   `active` ve `approval_status` DÖNMÜYORDU. Profil okumasının güvenli API'ye
--   taşındığı 77149d9 commit'inden sonra (login anında session token henüz
--   olmadığından /api/auth/profile çağrılamaz) EXPERT login bozuldu:
--   parseLoginUserRecord `active = undefined` görüp isExpertAccountReady'i
--   false yapıyor → "onay bekliyor" ile giriş engelleniyordu.
--   (ADMIN login isAdminUser short-circuit sayesinde etkilenmiyordu.)
--
-- ÇÖZÜM:
--   login_user'ın DÖNÜŞÜNE `active` ve `approval_status` eklenir. Böylece
--   uygulama katmanı (canLoginYasamUser / isExpertAccountReady) gating'i doğru
--   yapar. Client tarafında users tablosu TEKRAR OKUNMAZ, service_role tarayıcıya
--   sızmaz, password/password_hash KESİNLİKLE dönmez.
--
-- KORUNAN DAVRANIŞ (kara-kutu testiyle doğrulandı — DEĞİŞTİRİLMEDİ):
--   * Mevcut kolonlar aynen: id, email, name, role, status, tenant_id (+2 yeni)
--   * Şifre: bcrypt (crypt) eşleşmesi; password_hash boş/null ise plaintext
--     fallback (mevcut verify_admin_login deseniyle birebir).
--   * active / approval_status FİLTRELENMEZ — inactive/pending kullanıcı da satır
--     döndürür; gating uygulama katmanındadır. Bu davranış AYNEN korunur
--     (yeni bir kısıt eklenmez, mevcut bir kısıt kaldırılmaz).
--   * Yanlış şifre → 0 satır.
--   * SECURITY DEFINER (RLS bypass; password_hash okunabilsin diye) + güvenli
--     search_path.
--
-- NOT: Bir fonksiyonun dönüş tipine kolon eklemek CREATE OR REPLACE ile YAPILAMAZ
--      ("cannot change return type"). DROP + CREATE gerekir. Tüm işlem tek
--      transaction içinde — CREATE başarısız olursa ROLLBACK ile eski fonksiyon
--      korunur, login akışı asla yarım kalmaz.
--
-- GERİ ALMA (rollback): bu migration'dan önceki login_user tanımını yeniden
--   oluşturun (active/approval_status kolonları olmadan). Uygulama eski davranışa
--   (expert login bozuk) döner.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.login_user(text, text);

CREATE FUNCTION public.login_user(p_email text, p_password text)
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
    AND (
      -- bcrypt: hash varsa yalnızca hash eşleşmesi geçerli
      -- pgcrypto canlı DB'de `extensions` şemasında kurulu; şema-nitelikli çağrı.
      (u.password_hash IS NOT NULL AND u.password_hash <> ''
        AND extensions.crypt(p_password, u.password_hash) = u.password_hash)
      OR
      -- geçiş dönemi: hash yoksa plaintext karşılaştır
      ((u.password_hash IS NULL OR u.password_hash = '')
        AND btrim(u.password) = btrim(p_password))
    )
  LIMIT 1;
$$;

-- Login formu publishable (anon) key ile çağırır — EXECUTE grant'ı korunmalı.
GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated, service_role;

COMMIT;
