-- GA-P2-05 (yalnız yerel geçici PG): karantina migration'ı UYGULANMADAN ÖNCE mevcut astro_* tablolarının rol yetkilerinin
-- parmak izi. astrology-quarantine-reapply-assert.sql migration'dan (iki kez) SONRA aynı parmak izini karşılaştırır.
CREATE TABLE IF NOT EXISTS public._pq_priv_before AS
SELECT c.relname AS tbl, r.rolname AS role, p.priv
FROM pg_class c
JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
WHERE c.relkind = 'r' AND c.relname LIKE 'astro\_%' AND c.relname <> 'astro_provider_quarantine'
  AND has_table_privilege(r.rolname, c.oid, p.priv);
