-- ════════════════════════════════════════════════════════════════════════════
-- BIO-19 — Biyoenerji tenant indeksleri (forward-only, KANITA DAYALI, idempotent)
-- ════════════════════════════════════════════════════════════════════════════
--
-- KANIT (repo): 6 temel Biyoenerji tablosunun CREATE TABLE DDL'i migration'larda
-- yoktur (dashboard'da oluşturulmuş); repo'daki tek indeksler kısmi
-- `origin_transfer_batch_id` indeksleridir. Tüm liste/sayım/arama sorguları
-- `.eq("tenant_id", …)` + `order(<orderCol>)` kullanır. Prod indeks kataloğu repo'dan
-- doğrulanamadığı için bu migration TAHMİNLE indeks EKLEMEZ:
--
--   Her tablo için, UYGULAMA ANINDA pg_index kataloğuna bakılır; ilk anahtar kolonu
--   `tenant_id` olan HERHANGİ bir indeks zaten varsa HİÇBİR ŞEY yapılmaz. Yalnız
--   gerçekten eksikse sorgu deseniyle birebir `(tenant_id, <orderCol>)` indeksi kurulur.
--
-- Kolonlar (lib/biyoenerji/resourceConfig.ts): sessions.created_at, energy_bodies.source_uid,
-- subconscious_causes.title, imaginations.title, symbols.title, chakras.name.
-- Tablo / kolon yoksa atlanır. bioenergy_chakra_blocks zaten
-- (tenant_id, chakra_id, section_key, sort_order) indeksine sahiptir (20261203000000).
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  spec   TEXT[];
  tbl    TEXT;
  col    TEXT;
  have   BOOLEAN;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['bioenergy_sessions',            'created_at'],
    ARRAY['bioenergy_energy_bodies',       'source_uid'],
    ARRAY['bioenergy_subconscious_causes', 'title'],
    ARRAY['bioenergy_imaginations',        'title'],
    ARRAY['bioenergy_symbols',             'title'],
    ARRAY['bioenergy_chakras',             'name']
  ] LOOP
    tbl := spec[1];
    col := spec[2];

    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      RAISE NOTICE 'BIO-19: % yok — atlandı', tbl;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name IN ('tenant_id')
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
    ) THEN
      RAISE NOTICE 'BIO-19: %.tenant_id / %.% yok — atlandı', tbl, tbl, col;
      CONTINUE;
    END IF;

    -- İlk anahtar kolonu tenant_id olan mevcut indeks var mı?
    SELECT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = format('public.%I', tbl)::regclass
        AND a.attname = 'tenant_id'
    ) INTO have;

    IF have THEN
      RAISE NOTICE 'BIO-19: % zaten tenant_id ile başlayan indekse sahip — dokunulmadı', tbl;
    ELSE
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, %I)',
        tbl || '_tenant_' || col || '_idx', tbl, col
      );
      RAISE NOTICE 'BIO-19: % için (tenant_id, %) indeksi oluşturuldu', tbl, col;
    END IF;
  END LOOP;
END
$$;
