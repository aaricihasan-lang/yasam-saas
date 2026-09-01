-- ============================================================
-- 20270102000400_nutrition_plan_clients.sql
--
-- Beslenme FAZ 7 (Class C) — Plan FAMILY ↔ Danışan BAĞI (family-level binding).
--
-- FAMILY-LEVEL: PK (tenant_id, plan_family_id) → bir aile = bir danışan. V1/V2/V3
--   (aynı plan_family_id) otomatik aynı danışana ait; nutrition_plan_revise binding'e
--   DOKUNMAZ. Standalone plan = binding satırı YOK (etkilenmez).
--
-- IMMUTABLE RECIPIENT: bir family bir danışana bağlandıktan sonra BAŞKA danışana
--   REASSIGN EDİLEMEZ (historical recipient geçmişe dönük değişmesin). Idempotent
--   aynı-danışan tekrar kabul; farklı danışan → 45021 (assign RPC enforce eder, §11).
--   Yazma yalnız nutrition_plan_assign_client RPC ile (browser direct YOK).
--
-- CLIENT HARD-DELETE ATOMİK CASCADE (§3/§12): danışan hard-delete edilince
--   clients FK cascade bu binding satırını siler; AFTER DELETE trigger o family'nin
--   TÜM nutrition_plans satırlarını (→ days/meals/items/nutrients composite-FK cascade)
--   AYNI transaction içinde siler. Böylece "client silinince bound plan ANONİM kalmaz"
--   kuralı, mevcut client cascade-delete route'u DEĞİŞTİRMEDEN, tek atomik transaction'da
--   sağlanır. Unassign ürün akışında YOK → trigger yalnız client-delete yolunda ateşlenir.
--
--   Standalone (unbound) planlar: binding satırı olmadığı için ETKİLENMEZ.
--
-- FK client CASCADE. Cross-tenant (client) guard REUSE. RLS doğuştan-kilitli.
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_plan_clients (
  tenant_id      uuid        NOT NULL,
  plan_family_id uuid        NOT NULL,
  client_id      uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  assigned_by    uuid,

  CONSTRAINT nutrition_plan_clients_pkey PRIMARY KEY (tenant_id, plan_family_id)
);

CREATE INDEX nutrition_plan_clients_tenant_client_idx
  ON public.nutrition_plan_clients (tenant_id, client_id);

-- client tutarlılık guard (cross-tenant satır imkansız).
CREATE TRIGGER trg_nutrition_plan_clients_tenant_guard
  BEFORE INSERT OR UPDATE ON public.nutrition_plan_clients
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_client_tenant_guard();

-- Binding satırı silinince (yalnız client hard-delete cascade yolu) o family'nin
-- tüm plan revizyonlarını sil → days/meals/items/nutrients composite-FK cascade.
CREATE FUNCTION public.nutrition_plan_clients_cascade_plans()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.nutrition_plans
  WHERE tenant_id = OLD.tenant_id
    AND plan_family_id = OLD.plan_family_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_nutrition_plan_clients_cascade_plans
  AFTER DELETE ON public.nutrition_plan_clients
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_plan_clients_cascade_plans();

ALTER TABLE public.nutrition_plan_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_plan_clients FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_plan_clients TO service_role;

COMMIT;
