-- =============================================================================
-- 20260625000000_lock_sensitive_client_tables_rls.sql
--
-- HASSAS TABLOLAR — anon / publishable key ERİŞİM KİLİDİ
--
-- BAĞLAM (Faz 0–1F):
--   Aşağıdaki tabloların TÜM okuma/yazma erişimi artık service_role'lü
--   sunucu API route'larına taşındı (browser publishable key ile doğrudan
--   erişim kalmadı). Bu migration, veritabanı seviyesinde anon/authenticated
--   erişimini kapatarak çapraz-tenant ifşasını giderir.
--
-- YÖNTEM (her tablo için):
--   1) REVOKE ALL ... FROM anon, authenticated;   → rol yetkilerini geri al
--   2) ENABLE ROW LEVEL SECURITY;                  → RLS default-deny
--   3) HİÇBİR POLICY OLUŞTURULMAZ.
--
--   ⛔ USING(true) KESİNLİKLE KULLANILMAZ.
--      (USING(true) tüm satırları anon'a açar — okuma açığını kapatmaz.
--       Policy yokluğu = anon/authenticated için TAM RED.)
--
-- service_role:
--   BYPASSRLS taşır ve REVOKE yalnızca anon/authenticated'a uygulanır.
--   Bu yüzden tüm sunucu API route'ları (getServerDb / service_role) çalışmaya
--   devam eder. service_role'e DOKUNULMAZ.
--
-- KAPSAM — KİLİTLENEN TABLOLAR:
--   public.client_notes
--   public.client_analyses
--   public.client_homeworks
--   public.client_stone_photos
--   public.tenants
--   public.client_chakra_records   (boş/legacy — DROP DEĞİL, RLS-lock; geri dönüşü güvenli)
--   public.client_planet_records   (boş/legacy — DROP DEĞİL, RLS-lock; geri dönüşü güvenli)
--
-- DOKUNULMAYAN TABLOLAR (bilinçli olarak hariç):
--   public.stones        → paylaşımlı referans kütüphanesi (public kalır)
--   public.combinations  → paylaşımlı referans kütüphanesi (public kalır)
--   public.users         → ayrı faz konusu; bu migration kapsamı dışı
--
-- NOT: Bu dosya henüz UYGULANMADI; yalnızca hazırlandı.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- client_notes
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.client_notes FROM anon, authenticated;
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
-- (policy oluşturulmaz — anon/authenticated için tam red)

-- ─────────────────────────────────────────────────────────────────────────────
-- client_analyses
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.client_analyses FROM anon, authenticated;
ALTER TABLE public.client_analyses ENABLE ROW LEVEL SECURITY;
-- (policy oluşturulmaz)

-- ─────────────────────────────────────────────────────────────────────────────
-- client_homeworks
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.client_homeworks FROM anon, authenticated;
ALTER TABLE public.client_homeworks ENABLE ROW LEVEL SECURITY;
-- (policy oluşturulmaz)

-- ─────────────────────────────────────────────────────────────────────────────
-- client_stone_photos
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.client_stone_photos FROM anon, authenticated;
ALTER TABLE public.client_stone_photos ENABLE ROW LEVEL SECURITY;
-- (policy oluşturulmaz)

-- ─────────────────────────────────────────────────────────────────────────────
-- tenants
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.tenants FROM anon, authenticated;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
-- (policy oluşturulmaz)

-- ─────────────────────────────────────────────────────────────────────────────
-- client_chakra_records   (boş/legacy — DROP yerine RLS-lock; reversible)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.client_chakra_records FROM anon, authenticated;
ALTER TABLE public.client_chakra_records ENABLE ROW LEVEL SECURITY;
-- (policy oluşturulmaz)

-- ─────────────────────────────────────────────────────────────────────────────
-- client_planet_records   (boş/legacy — DROP yerine RLS-lock; reversible)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.client_planet_records FROM anon, authenticated;
ALTER TABLE public.client_planet_records ENABLE ROW LEVEL SECURITY;
-- (policy oluşturulmaz)

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, opsiyonel — salt-okuma):
--   1) Security Advisor: yukarıdaki tablolarda "RLS disabled" uyarısı kalkmalı.
--   2) publishable key ile SELECT/INSERT → erişilemez / 0 satır beklenir.
--   3) service_role ile SELECT/INSERT/UPDATE/DELETE → çalışmaya devam eder.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (geri alma) — bu migration'ı geri almak için aşağıdakileri çalıştırın:
-- =============================================================================
-- ALTER TABLE public.client_notes          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.client_analyses       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.client_homeworks      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.client_stone_photos   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tenants               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.client_chakra_records DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.client_planet_records DISABLE ROW LEVEL SECURITY;
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_notes          TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_analyses       TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_homeworks      TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_stone_photos   TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants               TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_chakra_records TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_planet_records TO anon, authenticated;
-- =============================================================================
