-- P1-1 / M2: yeni migration ÖNCESİ fonksiyon ACL/güvenlik anlık görüntüsü (assert karşılaştırır).
-- Supabase varsayılan yetkilerini taklit eder: service_role EXECUTE (REVOKE'ta dokunulmayan rol).
GRANT EXECUTE ON FUNCTION public.yh_client_outbox_enqueue() TO service_role;
CREATE TABLE IF NOT EXISTS public._fh_m2_acl_before AS
SELECT p.proacl::text AS acl, p.prosecdef AS secdef, p.proconfig::text AS config
FROM pg_proc p WHERE p.oid = 'public.yh_client_outbox_enqueue()'::regprocedure;
