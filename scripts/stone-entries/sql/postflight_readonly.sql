-- Salt-okuma son kontrol — migration SONRASI (hiçbir şey yazmaz)
SELECT to_regclass('public.stone_entries') AS stone_entries_table;                          -- stone_entries
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stone_entries'::regclass;           -- true
SELECT count(*) AS anon_auth_grants FROM information_schema.role_table_grants
 WHERE table_name = 'stone_entries' AND grantee IN ('anon', 'authenticated');               -- 0
SELECT count(*) AS entries FROM public.stone_entries;                                       -- 0 (backfill yok)
SELECT count(*) FILTER (WHERE entries_text IS NOT NULL) AS with_entries_text, count(*) AS stones FROM public.stones; -- 0 / N
SELECT count(*) AS stones,
       md5(string_agg(md5(concat_ws('|', id, stone_name, short_description, general_info, source_note, physical_effects,
           spiritual_effects, other_effects, warning_text, feng_shui, meditation, care, application, primary_source_name)), ',' ORDER BY id)) AS content_hash
  FROM public.stones;                                                                       -- preflight ile BİREBİR
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.stone_entries'::regclass AND NOT tgisinternal ORDER BY 1;
  -- stone_entries_guard_trg, stone_entries_refresh_text_trg
