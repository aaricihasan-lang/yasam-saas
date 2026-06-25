-- =============================================================================
-- 20260625150000_lock_users_table.sql
--
-- users TABLOSU — anon / publishable key ERİŞİM KİLİDİ
--
-- BAĞLAM (Faz 2 — users kritik güvenlik):
--   users tablosunun TÜM okuma/yazma erişimi artık service_role'lü sunucu API
--   route'larına (getServerDb) veya SECURITY DEFINER RPC'ye taşındı:
--     * Kimlik doğrulama  → public.login_user(text,text)  [SECURITY DEFINER,
--                            anon EXECUTE grant'lı, users'ı owner olarak okur]
--     * Profil okuma       → /api/auth/profile            [service_role]
--     * Admin yönetimi     → /api/admin/*                 [service_role]
--     * tenant denetimi    → /api/admin/users-tenant-ids  [service_role]
--   Tarayıcıdan publishable key ile users'a doğrudan erişim KALMADI.
--
--   Önceki durum (20260621150000_users_security_patch.sql):
--     * RLS ENABLED, ama "users_select_open" policy'si USING(true) ile anon'a
--       TÜM satırları açıyordu + "GRANT SELECT ON users TO anon, authenticated".
--     * Bu, password_hash hariç tüm kullanıcı satırlarını (e-posta, ad, rol,
--       tenant_id, lisans/ödeme alanları...) çapraz-tenant ifşa ediyordu.
--
-- YÖNTEM:
--   1) users üzerindeki TÜM policy'leri DROP et (USING(true) açık SELECT dahil).
--   2) REVOKE ALL ON public.users FROM anon, authenticated;  → rol yetkileri sıfır
--   3) ENABLE ROW LEVEL SECURITY (zaten açık; idempotent garanti).
--   4) HİÇBİR POLICY OLUŞTURULMAZ. Policy yokluğu = anon/authenticated TAM RED.
--
--   ⛔ FORCE ROW LEVEL SECURITY KULLANILMAZ.
--      (FORCE, SECURITY DEFINER login_user'ın owner olarak users okumasını da
--       RLS'ye tabi tutar ve login akışını kırardı. Sadece ENABLE.)
--   ⛔ USING(true) / açık policy KESİNLİKLE YAZILMAZ.
--   ⛔ Sadece public.users hedeflenir; başka tabloya DOKUNULMAZ.
--
-- service_role:
--   BYPASSRLS taşır ve REVOKE yalnızca anon/authenticated'a uygulanır → tüm
--   sunucu API route'ları (getServerDb / service_role) çalışmaya devam eder.
--   service_role'e DOKUNULMAZ.
--
-- login_user (SECURITY DEFINER):
--   EXECUTE grant'ı FONKSIYON seviyesindedir; "REVOKE ALL ON TABLE users" onu
--   etkilemez. Fonksiyon owner olarak çalışır (RLS yalnızca ENABLE, FORCE değil
--   → owner muaf) ve users'ı okumaya devam eder. anon login akışı KIRILMAZ.
--
-- SEQUENCE:
--   public.users.id uuid (gen_random_uuid) — tabloya bağlı sequence YOK,
--   bu yüzden REVOKE edilecek sequence yetkisi bulunmuyor.
--
-- NOT: Bu dosyanın canlı DB'ye uygulanıp uygulanmadığı rapor edilir.
-- =============================================================================

BEGIN;

-- 1. users üzerindeki tüm mevcut policy'leri kaldır (USING(true) açık SELECT dahil).
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

-- 2. anon ve authenticated rollerinin TÜM tablo yetkilerini geri al.
REVOKE ALL ON public.users FROM anon, authenticated;

-- 3. RLS etkin (zaten açıktı; idempotent). FORCE KULLANILMAZ.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 4. (policy oluşturulmaz — anon/authenticated için tam red.)

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma):
--   1) publishable key ile  SELECT * FROM users          → erişilemez / 0 satır.
--   2) anon  login_user(email,password) RPC              → çalışmaya devam eder.
--   3) service_role ile users CRUD (API route'ları)      → çalışmaya devam eder.
--   4) /api/auth/profile, /api/admin/* , tenant-kontrol  → çalışmaya devam eder.
--   5) Security Advisor: users "RLS disabled / open policy" uyarısı kalkar.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (geri alma) — yalnızca acil durumda:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;
--   -- (önceki açık okuma davranışına dönmek istenirse, eski security_patch'teki
--   --  users_select_open / service_only policy'leri yeniden oluşturun.)
-- =============================================================================
