-- ============================================================
-- 20270101000000_nutrition_templates.sql
--
-- Beslenme FAZ 6 / Profesyonel Tamamlama — TEMPLATE (öğün/gün şablonu). §12-18
--
-- Şablon = yeniden kullanılabilir yapı taşı (≠ plan copy). template_type:
--   'meal' → tek öğün şablonu ("Standart Kahvaltı")
--   'day'  → tam gün şablonu ("2000 kcal Standart Gün", N öğün)
--
-- Yapı plan motorunu AYNALAR (day katmanı YOK; template_id, plan_id yerini alır):
--   template → template_meals → template_items → template_item_nutrients
-- Snapshot kontratı plan item ile BİREBİR aynı (§13): item, food'un hesap-anı görüntüsünü
--   DONDURUR; server-authoritative yazılır; canlı food / catalog güncellemesi şablonu
--   ASLA değiştirmez (§14). Apply = verbatim deep-copy (yeni IDs; §15).
--
-- Tenant-owned owner-only operational data; client verisi YOK (§22, §51).
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  template_type text        NOT NULL,
  title         text        NOT NULL,
  note          text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_templates_type_chk CHECK (template_type IN ('meal', 'day')),
  CONSTRAINT nutrition_templates_title_chk CHECK (btrim(title) <> ''),

  -- child (template_meals) kompozit FK hedefi: (tenant_id, id).
  CONSTRAINT nutrition_templates_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX nutrition_templates_tenant_idx
  ON public.nutrition_templates (tenant_id, template_type, updated_at DESC);

CREATE FUNCTION public.nutrition_templates_identity_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.template_type IS DISTINCT FROM OLD.template_type
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'nutrition_templates identity columns are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_templates_identity_guard
  BEFORE UPDATE ON public.nutrition_templates
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_templates_identity_guard();

CREATE TRIGGER trg_nutrition_templates_updated_at
  BEFORE UPDATE ON public.nutrition_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_templates FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_templates TO service_role;

COMMIT;
