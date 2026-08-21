-- =============================================================================
-- 20261217000000_cupping_content_foundation.sql
--
-- KUPA & HACAMAT — İÇERİK PROFESYONELLEŞTİRME FAZ 1.5: content foundation.
--
-- AMAÇ: Gerçek profesyonel içerik yüklenmeden ÖNCE kaynaklandırma (citation) ve
--   birkaç yapısal alanı ekler. Böylece yüzlerce kayıt yüklendikten sonra atıf
--   retrofit'i (bu fazın önlemek istediği pahalı iş) gerekmez.
--
-- KAPSAM (hepsi ADDITIVE — destructive DDL YOK):
--   A. cupping_sources: year / identifier / publication / language (bibliyografik).
--   B. cupping_points: synonyms text[] / laterality (kontrollü).
--   C. cupping_techniques: technique_type / movement_style (çok-eksenli taksonomi).
--   D. cupping_safety_notes: contraindication_class (absolute/relative/none).
--   E. Composite UNIQUE(tenant_id, id) — citation junction'ların tenant-safe composite
--      FK hedefi (referential + tenant integrity DB tarafından).
--   F. 6 TİPLİ citation junction tablosu (polimorfik DEĞİL — gerçek FK/CASCADE):
--        cupping_point_sources / cupping_topic_sources / cupping_point_topic_sources /
--        cupping_technique_sources / cupping_knowledge_sources / cupping_safety_sources
--      Her biri: composite FK (tenant_id, source_id)→cupping_sources ve
--      (tenant_id, <entity>_id)→parent, ikisi de ON DELETE CASCADE; UNIQUE citation key;
--      evidence_class CHECK; RLS ENABLE + anon/auth REVOKE (service-role only); provenance.
--
-- SEMANTİK: evidence_class citation'a aittir (kaynağın İÇERİĞE ne kanıtladığı) —
--   source_type (kaynağın bibliyografik türü, mevcut kolon) ile KARIŞTIRILMAZ.
--   Geleneksel ile modern klinik katmanı ASLA birleştirilmez.
--
-- GÜVENLİK deseni cupping_schema (20261216000000) ile birebir: RLS ENABLE (policy yok),
--   FORCE RLS YOK, anon/authenticated tüm privilege REVOKE, erişim yalnız /api/kupa/*.
--
-- MEVCUT KOLONLARDA VOCAB: relation_strength / source_type mevcut kolonlardır ve
--   üzerlerinde legacy veri olabilir; CHECK bunlara `NOT VALID` ile eklenir (yeni/güncel
--   satırları kısıtlar, mevcut satırları apply anında DOĞRULAMAZ → apply kesinlikle
--   düşmez). İleride veri temizliği sonrası VALIDATE CONSTRAINT ile tamamlanır.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / conname guard.
-- PRODUCTION APPLY BU TURDA YOK. Deploy sırası: schema → provenance → BU → kod.
-- =============================================================================

BEGIN;

-- ─── A. cupping_sources — bibliyografik additive kolonlar ─────────────────────
ALTER TABLE public.cupping_sources ADD COLUMN IF NOT EXISTS year        integer;
ALTER TABLE public.cupping_sources ADD COLUMN IF NOT EXISTS identifier  text;   -- DOI / PMID / ISBN
ALTER TABLE public.cupping_sources ADD COLUMN IF NOT EXISTS publication text;
ALTER TABLE public.cupping_sources ADD COLUMN IF NOT EXISTS language    text;

-- ─── B. cupping_points — synonyms + laterality ────────────────────────────────
ALTER TABLE public.cupping_points ADD COLUMN IF NOT EXISTS synonyms   text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.cupping_points ADD COLUMN IF NOT EXISTS laterality text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupping_points_laterality_chk') THEN
    ALTER TABLE public.cupping_points ADD CONSTRAINT cupping_points_laterality_chk
      CHECK (laterality IS NULL OR laterality IN ('midline','bilateral','left','right','unspecified'));
  END IF;
END $$;

-- ─── C. cupping_techniques — çok-eksenli taksonomi (kind KORUNUR) ──────────────
ALTER TABLE public.cupping_techniques ADD COLUMN IF NOT EXISTS technique_type text;
ALTER TABLE public.cupping_techniques ADD COLUMN IF NOT EXISTS movement_style text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupping_techniques_type_chk') THEN
    ALTER TABLE public.cupping_techniques ADD CONSTRAINT cupping_techniques_type_chk
      CHECK (technique_type IS NULL OR technique_type IN ('dry','wet','unspecified'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupping_techniques_movement_chk') THEN
    ALTER TABLE public.cupping_techniques ADD CONSTRAINT cupping_techniques_movement_chk
      CHECK (movement_style IS NULL OR movement_style IN ('stationary','gliding','flash','unspecified'));
  END IF;
END $$;

-- ─── D. cupping_safety_notes — contraindication_class (severity'den ayrı) ──────
ALTER TABLE public.cupping_safety_notes ADD COLUMN IF NOT EXISTS contraindication_class text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupping_safety_contraindication_chk') THEN
    ALTER TABLE public.cupping_safety_notes ADD CONSTRAINT cupping_safety_contraindication_chk
      CHECK (contraindication_class IS NULL OR contraindication_class IN ('absolute','relative','none'));
  END IF;
END $$;

-- ─── Mevcut kolonlar için vocab CHECK (NOT VALID — apply düşmez, legacy korunur) ─
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupping_point_topics_relation_strength_chk') THEN
    ALTER TABLE public.cupping_point_topics ADD CONSTRAINT cupping_point_topics_relation_strength_chk
      CHECK (relation_strength IS NULL OR relation_strength IN
        ('traditional_primary','traditional_secondary','historically_associated','modern_supported')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupping_sources_source_type_chk') THEN
    ALTER TABLE public.cupping_sources ADD CONSTRAINT cupping_sources_source_type_chk
      CHECK (source_type IS NULL OR source_type IN
        ('historical_primary','historical_secondary','book_monograph','academic_article',
         'systematic_review','clinical_study','official_guidance','expert_educational')) NOT VALID;
  END IF;
END $$;

-- ─── E. Composite UNIQUE(tenant_id, id) — composite FK hedefi ──────────────────
-- (id zaten PK/eşsiz; composite unique, tenant-safe composite FK için gereklidir.)
DO $$
DECLARE
  p text;
  parents text[] := ARRAY[
    'cupping_sources',
    'cupping_points',
    'cupping_topics',
    'cupping_point_topics',
    'cupping_techniques',
    'cupping_knowledge_records',
    'cupping_safety_notes'
  ];
BEGIN
  FOREACH p IN ARRAY parents LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = p || '_tenant_id_key') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (tenant_id, id)', p, p || '_tenant_id_key');
    END IF;
  END LOOP;
END $$;

-- ─── F. 6 TİPLİ citation junction tablosu ─────────────────────────────────────
-- Ortak citation contract: id, tenant_id, source_id, <entity>_id, locator, evidence_class,
-- note, sort_order, timestamps + provenance. İki composite FK tenant-safe + CASCADE.
DO $$
DECLARE
  r record;
  -- (tablo, entity FK kolonu, parent tablo)
  specs text[][] := ARRAY[
    ARRAY['cupping_point_sources',       'point_id',       'cupping_points'],
    ARRAY['cupping_topic_sources',       'topic_id',       'cupping_topics'],
    ARRAY['cupping_point_topic_sources', 'point_topic_id', 'cupping_point_topics'],
    ARRAY['cupping_technique_sources',   'technique_id',   'cupping_techniques'],
    ARRAY['cupping_knowledge_sources',   'knowledge_id',   'cupping_knowledge_records'],
    ARRAY['cupping_safety_sources',      'safety_id',      'cupping_safety_notes']
  ];
  i int;
  t text; ecol text; parent text;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    t := specs[i][1]; ecol := specs[i][2]; parent := specs[i][3];

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%1$I (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id      uuid        NOT NULL,
        source_id      uuid        NOT NULL,
        %2$I           uuid        NOT NULL,
        locator        text,
        evidence_class text,
        note           text,
        sort_order     integer     NOT NULL DEFAULT 0,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        origin_type              text,
        origin_label             text,
        origin_source_id         uuid,
        origin_transfer_batch_id uuid,
        transferred_at           timestamptz,
        CONSTRAINT %1$s_source_fk
          FOREIGN KEY (tenant_id, source_id) REFERENCES public.cupping_sources (tenant_id, id) ON DELETE CASCADE,
        CONSTRAINT %1$s_entity_fk
          FOREIGN KEY (tenant_id, %2$I) REFERENCES public.%3$I (tenant_id, id) ON DELETE CASCADE,
        CONSTRAINT %1$s_evidence_chk
          CHECK (evidence_class IS NULL OR evidence_class IN
            ('traditional','historical','modern_clinical','systematic_review','safety_guidance','expert_educational')),
        CONSTRAINT %1$s_origin_type_chk
          CHECK (origin_type IS NULL OR origin_type IN ('admin_transfer','expert_created','legacy')),
        CONSTRAINT %1$s_unique UNIQUE (tenant_id, source_id, %2$I, locator)
      )
    $f$, t, ecol, parent);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, %I)', t || '_entity_idx', t, ecol);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, source_id)', t || '_source_idx', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (origin_transfer_batch_id) WHERE origin_transfer_batch_id IS NOT NULL',
      'idx_' || t || '_transfer_batch', t
    );

    -- Kilit: policy düşür, anon/auth REVOKE, RLS ENABLE (FORCE YOK) — cupping_schema deseni.
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   -- 6 citation tablosu + RLS + FORCE false:
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname LIKE 'cupping_%_sources';                       -- t, f (her satır)
--   -- anon/auth erişim yok:
--   SELECT has_table_privilege('anon','public.cupping_point_sources','SELECT');        -- false
--   SELECT has_table_privilege('authenticated','public.cupping_point_sources','INSERT');-- false
--   -- composite tenant-safe FK:
--   SELECT conname FROM pg_constraint WHERE conname LIKE 'cupping_%_source_fk'
--      OR conname LIKE 'cupping_%_entity_fk';                        -- 12 satır
--   -- cross-tenant citation DB tarafından engellenir (composite FK (tenant_id, id)).
--   -- year kolonu vb:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='cupping_sources' AND column_name IN ('year','identifier','publication','language'); -- 4
--
-- ROLLBACK (gerekirse — provenance/veri riski nedeniyle otomatik DROP YOK):
--   DROP TABLE IF EXISTS public.cupping_point_topic_sources, public.cupping_point_sources,
--     public.cupping_topic_sources, public.cupping_technique_sources,
--     public.cupping_knowledge_sources, public.cupping_safety_sources CASCADE;
--   (Additive kolonlar ve UNIQUE(tenant_id,id) veri kaybı riski nedeniyle elle kaldırılır.)
-- =============================================================================
