-- GA-P2-05 (yalnız yerel geçici PG): karantina migration'ı satır VARKEN iki kez daha uygulandı →
--   (1) önceden eklenen satır birebir korunur (parmak izi aynı), (2) yetki allowlist'i aynı, (3) mevcut astro_* tablolarının
--   rol yetkileri migration öncesiyle AYNI (fark yok), (4) RLS açık, politika 0.
DO $$
DECLARE n int; fp text; rls boolean;
BEGIN
  SELECT count(*) INTO n FROM public.astro_provider_quarantine; IF n <> 1 THEN RAISE EXCEPTION 'PQ-RE: satır sayısı % (1 beklenir)', n; END IF;
  SELECT md5(row_to_json(q)::text) INTO fp FROM public.astro_provider_quarantine q WHERE id = '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e';
  IF fp IS DISTINCT FROM (SELECT s.fp FROM public._pq_seed_before s) THEN RAISE EXCEPTION 'PQ-RE: ikinci uygulama satırı değiştirdi'; END IF;
  SELECT relrowsecurity INTO rls FROM pg_class WHERE oid = 'public.astro_provider_quarantine'::regclass;
  IF NOT rls THEN RAISE EXCEPTION 'PQ-RE: RLS kapalı'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'astro_provider_quarantine') <> 0 THEN RAISE EXCEPTION 'PQ-RE: politika oluştu'; END IF;
  IF NOT has_table_privilege('service_role', 'public.astro_provider_quarantine', 'SELECT') OR NOT has_table_privilege('service_role', 'public.astro_provider_quarantine', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.astro_provider_quarantine', 'DELETE') OR has_table_privilege('service_role', 'public.astro_provider_quarantine', 'UPDATE')
     OR has_table_privilege('anon', 'public.astro_provider_quarantine', 'SELECT') OR has_table_privilege('authenticated', 'public.astro_provider_quarantine', 'SELECT') THEN
    RAISE EXCEPTION 'PQ-RE: yetki allowlist''i bozuldu';
  END IF;
  SELECT count(*) INTO n FROM (
    (SELECT tbl, role, priv FROM public._pq_priv_before
     EXCEPT
     SELECT c.relname, r.rolname, p.priv FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
       CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
       CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
       WHERE c.relkind = 'r' AND c.relname LIKE 'astro\_%' AND c.relname <> 'astro_provider_quarantine' AND has_table_privilege(r.rolname, c.oid, p.priv))
    UNION ALL
    (SELECT c.relname, r.rolname, p.priv FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
       CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
       CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
       WHERE c.relkind = 'r' AND c.relname LIKE 'astro\_%' AND c.relname <> 'astro_provider_quarantine' AND has_table_privilege(r.rolname, c.oid, p.priv)
     EXCEPT
     SELECT tbl, role, priv FROM public._pq_priv_before)
  ) d;
  IF n <> 0 THEN RAISE EXCEPTION 'PQ-RE: mevcut astro_* tablo yetkileri değişti (% fark)', n; END IF;
  IF (SELECT count(*) FROM public._pq_priv_before) < 10 THEN RAISE EXCEPTION 'PQ-RE: yetki parmak izi şüpheli küçük'; END IF;
END $$;
