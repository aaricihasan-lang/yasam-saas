-- Salt-okuma ön kontrol — 20271016000000_dogaltas_stone_entries.sql ÖNCESİ (hiçbir şey yazmaz)
SELECT to_regclass('public.stone_entries') AS stone_entries_table;                         -- NULL beklenir
SELECT count(*) AS entries_text_col FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'stones' AND column_name = 'entries_text'; -- 0 beklenir
SELECT to_regprocedure('public.dogaltas_source_name_key(text)') AS wt9_key_fn;             -- WT9 fonksiyonu VAR olmalı
SELECT count(*) AS stones,
       md5(string_agg(md5(concat_ws('|', id, stone_name, short_description, general_info, source_note, physical_effects,
           spiritual_effects, other_effects, warning_text, feng_shui, meditation, care, application, primary_source_name)), ',' ORDER BY id)) AS content_hash
  FROM public.stones;                                                                      -- değeri NOT ALIN (postflight ile karşılaştırılır)
SELECT count(*) AS stone_sources FROM public.stone_sources;
