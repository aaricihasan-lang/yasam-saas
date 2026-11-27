-- ============================================================================================
-- Şifa Rehberi F3 — Yaşam Hafızası: ANA NOT çöpe atıldı / geri alındı → İÇERİK KUTULARI kuyruğa
-- ============================================================================================
-- Önkoşul: 20280110000100_yh_owner_scope_sifa_v2.sql (yh_cdc_enqueue_sifa_v2, outbox, aktivasyon) +
--          20280130000000_sifa_rehberi_f3.sql (sifa_topic_blocks.parent_block_id).
--
-- Neden: F3'te içerik kutusu, ana notun alt satırıdır (parent_block_id; aynı konu, tek seviye). Not çöpe
-- atıldığında YALNIZ not satırı değişir → mevcut kutu tetikleyicisi yalnız NOT için olay üretir; kutular
-- indekste kalırdı (çöpteki notun içeriği aramada görünürdü). Konu çöpü zaten kapsanıyor
-- (yh_sifa_v2_topic_trash_enqueue: alt ağaçtaki TÜM kutular; kutunun konusu = notunun konusu).
-- Bu migration not çöpünü/geri alınmasını aynı kalıpla alt kutulara yayar. Okuyucu kapısı
-- (lib/yasam-hafizasi/indexer/supabaseIndexAdapters.ts filterSifaV2Live) ana notu çöpte/bulunamayan
-- kutuyu indekslemez → olay işlenince kutu indeksten düşer (defensive deindex); not geri alınınca döner.
--
-- Yaşam Hafızası ETKİNLEŞTİRİLMEZ: aktivasyon kapısı (yh_source_activation 'sifa_rehberi_v2:notes')
-- kapalıyken fonksiyon sessiz no-op'tur; kullanıcı işlemi hiç etkilenmez.
-- Kalıcı silme: not silinince kutular ON DELETE CASCADE ile silinir → mevcut AFTER DELETE tetikleyicisi
-- her kutu için delete olayı üretir (ek iş gerekmez).
-- Yalnız EKLEME: genel yh_cdc_enqueue() ve mevcut tetikleyiciler DEĞİŞMEZ. İdempotent.
-- Geri dönüş: docs/sifa-rehberi-f3/geri-donus-sema.sql (tetikleyici + fonksiyon DROP).
-- ============================================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.yasam_hafizasi_outbox') IS NULL OR to_regclass('public.yh_source_activation') IS NULL
     OR to_regprocedure('public.yh_cdc_enqueue_sifa_v2()') IS NULL THEN
    RAISE EXCEPTION 'önkoşul eksik: 20280110000100_yh_owner_scope_sifa_v2.sql uygulanmamış';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'sifa_topic_blocks' AND column_name = 'parent_block_id') THEN
    RAISE EXCEPTION 'önkoşul eksik: 20280130000000_sifa_rehberi_f3.sql uygulanmamış';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.yh_sifa_v2_note_trash_enqueue()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_active boolean;
BEGIN
  -- Savunma: yalnız kişisel ANA not (tetikleyici WHEN'e ek).
  IF NEW.scope IS DISTINCT FROM 'kisisel' OR NEW.parent_block_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- AKTİVASYON KAPISI: kaynak aktif değilse sessiz no-op (kullanıcı işlemi bozulmaz).
  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = 'sifa_rehberi_v2:notes';
  IF v_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.yasam_hafizasi_outbox AS o (source_key, source_table, source_id, tenant_id, operation)
  SELECT 'sifa_rehberi_v2:notes', 'sifa_topic_blocks', b.id, b.tenant_id, 'upsert'
    FROM public.sifa_topic_blocks b
   WHERE b.parent_block_id = NEW.id AND b.tenant_id = NEW.tenant_id AND b.owner_key = NEW.owner_key
     AND b.scope = 'kisisel'
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at    ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by    ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error   ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at ELSE NULL      END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_sifa_v2_note_trash_enqueue() FROM PUBLIC;
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.yh_sifa_v2_note_trash_enqueue() FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.yh_sifa_v2_note_trash_enqueue() FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON FUNCTION public.yh_sifa_v2_note_trash_enqueue() FROM service_role; END IF;
END
$g$;

DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_note_trash_trg ON public.sifa_topic_blocks;
CREATE TRIGGER yh_cdc_sifa_v2_note_trash_trg
  AFTER UPDATE OF deleted_at ON public.sifa_topic_blocks
  FOR EACH ROW WHEN (NEW.scope = 'kisisel' AND NEW.parent_block_id IS NULL AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.yh_sifa_v2_note_trash_enqueue();

COMMIT;
