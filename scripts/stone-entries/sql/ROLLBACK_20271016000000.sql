-- ROLLBACK — 20271016000000_dogaltas_stone_entries.sql (YALNIZ owner onayıyla, acil durumda)
--
-- UYARI: stone_entries'teki bilgi kayıtları ve eski metinden DÖNÜŞTÜRÜLMÜŞ kayıtlar bu tabloda yaşar.
-- Önce tam yedek alınır (stone_entries_rollback_backup); tablo silinmeden önce satır sayısı karşılaştırılır.
-- Dönüştürülmüş kayıtların eski kolonları boşaltılmıştır → yedek tablodan geri yüklenmeden veri kaybı olur.
-- Bu nedenle tercih edilen geri dönüş UYGULAMA rollback'idir (migration yerinde kalır; eski uygulama
-- yeni tabloyu yok sayar). Bu dosya yalnız şemayı tamamen kaldırmak gerekiyorsa kullanılır.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stone_entries_rollback_backup AS
  SELECT now() AS backed_up_at, e.* FROM public.stone_entries e;

DO $$
DECLARE a int; b int;
BEGIN
  SELECT count(*) INTO a FROM public.stone_entries;
  SELECT count(*) INTO b FROM public.stone_entries_rollback_backup;
  IF b < a THEN RAISE EXCEPTION 'yedek eksik: % < %', b, a; END IF;
END $$;

DROP TRIGGER IF EXISTS stone_entries_refresh_text_trg ON public.stone_entries;
DROP TRIGGER IF EXISTS stone_entries_guard_trg ON public.stone_entries;
DROP FUNCTION IF EXISTS public.dogaltas_stone_legacy_entry(uuid, uuid, text, text, text, text, text, text, integer);
DROP TABLE IF EXISTS public.stone_entries;
DROP FUNCTION IF EXISTS public.stone_entries_refresh_text();
DROP FUNCTION IF EXISTS public.stone_entries_guard();
DROP FUNCTION IF EXISTS public.stone_entries_text(uuid);
DROP FUNCTION IF EXISTS public.dogaltas_entry_field_rank(text);
DROP FUNCTION IF EXISTS public.dogaltas_entry_field_label(text);
ALTER TABLE public.stones DROP COLUMN IF EXISTS entries_text;

NOTIFY pgrst, 'reload schema';
COMMIT;
