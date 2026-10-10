-- =============================================================================
-- WT9 ROLLBACK — 20271012000000_dogaltas_stone_sources.sql
--
-- VERİ KAYBI UYARISI: ek kaynaklar (stone_sources) tablo düşürülünce silinir. Bu yüzden ÖNCE
-- tam yedek tabloya kopyalanır (public.stone_sources_wt9_rollback_backup; RLS açık, grant yok).
-- Birincil kaynak içerikleri (stones kolonları) etkilenmez; yalnız kaynak ADI kolonu düşer.
-- Backfill'i geri almak için bu dosya gerekmez: tools/rollback_backfill.mjs (yalnız backfill
-- adayı listesindeki taşlarda primary_source_name = NULL).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.stone_sources_wt9_rollback_backup AS
  SELECT ss.*, s.primary_source_name AS stone_primary_source_name, now() AS backed_up_at
    FROM public.stone_sources ss
    JOIN public.stones s ON s.id = ss.stone_id;
REVOKE ALL ON TABLE public.stone_sources_wt9_rollback_backup FROM PUBLIC, anon, authenticated;
ALTER TABLE public.stone_sources_wt9_rollback_backup ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS stone_sources_refresh_text_trg ON public.stone_sources;
DROP TRIGGER IF EXISTS stone_sources_guard_trg ON public.stone_sources;
DROP TABLE IF EXISTS public.stone_sources;

DROP TRIGGER IF EXISTS stones_primary_source_guard_trg ON public.stones;
DROP FUNCTION IF EXISTS public.dogaltas_stone_source_promote(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.stone_sources_refresh_text();
DROP FUNCTION IF EXISTS public.stone_sources_text(uuid);
DROP FUNCTION IF EXISTS public.stone_sources_guard();
DROP FUNCTION IF EXISTS public.stones_primary_source_guard();
DROP FUNCTION IF EXISTS public.dogaltas_source_name_key(text);

ALTER TABLE public.stones DROP CONSTRAINT IF EXISTS stones_primary_source_name_chk;
ALTER TABLE public.stones DROP COLUMN IF EXISTS extra_sources_text;
ALTER TABLE public.stones DROP COLUMN IF EXISTS primary_source_name;

NOTIFY pgrst, 'reload schema';
COMMIT;
