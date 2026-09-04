-- ============================================================
-- 20261229000200_nutrition_topic_sections.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 3 / Class B
-- Topic içeriği — ordered flexible sections (sabit 5 kolon DEĞİL). §F.3
-- Composite tenant-safe FK (tenant_id, topic_id) → topics ON DELETE CASCADE.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_topic_sections (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  topic_id     uuid        NOT NULL,
  section_key  text,
  heading      text,
  content      text,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_topic_sections_section_key_chk CHECK (
    section_key IS NULL OR section_key IN (
      'ozet', 'prensipler', 'uygun_besinler', 'notr_besinler', 'uzak_durulacak', 'notlar', 'diger'
    )
  ),

  CONSTRAINT nutrition_topic_sections_fk
    FOREIGN KEY (tenant_id, topic_id)
    REFERENCES public.nutrition_topics (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX nutrition_topic_sections_topic_idx
  ON public.nutrition_topic_sections (tenant_id, topic_id, sort_order);

CREATE TRIGGER trg_nutrition_topic_sections_updated_at
  BEFORE UPDATE ON public.nutrition_topic_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_topic_sections ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_topic_sections FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_topic_sections TO service_role;

COMMIT;
