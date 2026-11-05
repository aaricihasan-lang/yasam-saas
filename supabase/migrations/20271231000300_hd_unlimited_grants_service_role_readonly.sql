-- HUMAN DESIGN — 24 saatlik sınırsız izin: service_role doğrudan yazma yetkilerini kapat (owner talimatı 06.11.2026).
--
-- 20271231000200 yalnız SELECT + EXECUTE veriyordu; ancak Supabase'in public şemadaki varsayılan yetkileri yeni tablolarda
-- service_role'e TAM yetki (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) verir. Bu migration o fazlalığı kaldırır.
-- Tek yazma yolu SECURITY DEFINER fonksiyon hd_unlimited_grant_24h olarak kalır (fonksiyon sahibi yetkisiyle yazar).
-- Veri değişmez; yalnız yetki.
--
-- Geri alma: GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.hd_unlimited_grants,
--            public.hd_unlimited_grant_audit TO service_role;

BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.hd_unlimited_grants, public.hd_unlimited_grant_audit
  FROM service_role;

GRANT SELECT ON public.hd_unlimited_grants, public.hd_unlimited_grant_audit TO service_role;
GRANT EXECUTE ON FUNCTION public.hd_unlimited_grant_24h(uuid, uuid) TO service_role;

COMMIT;
