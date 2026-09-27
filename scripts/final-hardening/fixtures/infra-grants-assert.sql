-- INFRA 1100 assert: anon/authenticated/PUBLIC grant yok + RLS açık; tablolar DURUYOR.
DO $$
DECLARE
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_charges','client_combinations','combinations','security_events',
      'support_messages','video_transcription_jobs','video_training_records','personal_archive_files',
      '_bak_users_modperm_20260926','_bak_users_modperm_cosmic_preapply_20260926'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION '% DROP edilmiş!', t; END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(r, 'public.' || t, 'SELECT')
         OR has_table_privilege(r, 'public.' || t, 'INSERT')
         OR has_table_privilege(r, 'public.' || t, 'UPDATE')
         OR has_table_privilege(r, 'public.' || t, 'DELETE') THEN
        RAISE EXCEPTION '% hâlâ % tablo yetkisine sahip', r, t;
      END IF;
    END LOOP;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION '% RLS kapalı', t;
    END IF;
  END LOOP;
  IF has_column_privilege('anon', 'public.personal_archive_files', 'file_name', 'SELECT') THEN
    RAISE EXCEPTION 'personal_archive_files.file_name kolon grant''i kaldı';
  END IF;
  -- PUBLIC grant'i kaldırıldı mı? (relacl'de "=r/" PUBLIC girdisi kalmamalı)
  IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
             WHERE c.oid = 'public._bak_users_modperm_20260926'::regclass AND x.grantee = 0) THEN
    RAISE EXCEPTION '_bak_users_modperm_20260926 PUBLIC grant''i kaldı';
  END IF;
END $$;
