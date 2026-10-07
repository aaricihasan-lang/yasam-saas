-- ============================================================================
-- AŞAMA 3C — Human Design profili ↔ merkezî Danışan Yolculuğu danışanı (public.clients)
--
-- YALNIZ EKLEME (additive). BACKFILL YOK: mevcut HD profillerinin journey_client_id değeri NULL
-- kalır; isim/doğum tarihi üzerinden otomatik eşleştirme YAPILMAZ (bağlantıyı uzman onaylar).
--
-- 1) human_design_clients.journey_client_id uuid NULL
-- 2) Tenant-güvenli bileşik FK: (tenant_id, journey_client_id) → clients(tenant_id, id)
--    (hedef: clients_tenant_id_id_key — YH/KVKK/Anamnez ile AYNI desen). Başka tenant'ın danışanına
--    bağlanmak DB seviyesinde imkânsız. ON DELETE CASCADE: merkezî danışan KALICI silinince
--    (cascade-delete) bağlı HD profili de silinir.
-- 3) CHECK: journey_client_id doluysa tenant_id de dolu olmalı (MATCH SIMPLE FK'nin NULL tenant'ta
--    denetimsiz kalmasını engeller). Mevcut satırların hepsi journey_client_id=NULL → ihlal yok.
-- 4) Kısmi UNIQUE index: bir merkezî danışana aynı tenant'ta en fazla BİR HD profili.
-- 5) BEFORE DELETE trigger: HD profili silinirken ONA AİT (aynı tenant + client_id) haritalar ve
--    raporlar da silinir. Böylece merkezî danışanın kalıcı silinmesi TEK transaction'da (FK cascade
--    zinciri) HD kişisel verisini de temizler; haritalar/raporlar SET NULL ile sahipsiz KALMAZ.
--    Mevcut HD danışan silme akışı (deleteHdClient) davranışı korunur: raporlar silmeden ÖNCE
--    danışandan koparıldığı (client_id=NULL) için trigger onları görmez → raporlar KORUNUR; haritalar
--    o akışta zaten siliniyordu (artık aynı ifade içinde, atomik).
--    Emsal: nutrition_plan_clients_cascade_plans (20270102000400) trigger tabanlı cascade.
--
-- Storage (hd-chart-images) DB dışıdır → uygulama katmanı (cascade-delete route) silmeden önce
-- yolları toplar, COMMIT sonrası temizler.
--
-- GERİ ALMA (veri kaybı yok; kolon yeni ve backfill yok):
--   DROP TRIGGER IF EXISTS hd_client_purge_children_trg ON public.human_design_clients;
--   DROP FUNCTION IF EXISTS public.hd_client_purge_children();
--   DROP INDEX IF EXISTS public.hd_clients_tenant_journey_uidx;
--   ALTER TABLE public.human_design_clients DROP CONSTRAINT IF EXISTS hd_clients_journey_fk;
--   ALTER TABLE public.human_design_clients DROP CONSTRAINT IF EXISTS hd_clients_journey_tenant_chk;
--   ALTER TABLE public.human_design_clients DROP COLUMN IF EXISTS journey_client_id;
-- ============================================================================
BEGIN;

DO $hd_journey_pre$
BEGIN
  IF to_regclass('public.clients') IS NULL OR to_regclass('public.human_design_clients') IS NULL THEN
    RAISE EXCEPTION 'hd_client_journey_link: public.clients / public.human_design_clients bulunamadı (precondition)';
  END IF;
  IF to_regclass('public.human_design_charts') IS NULL OR to_regclass('public.human_design_reports') IS NULL THEN
    RAISE EXCEPTION 'hd_client_journey_link: human_design_charts / human_design_reports bulunamadı (precondition)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass AND contype = 'u' AND conname = 'clients_tenant_id_id_key'
  ) THEN
    RAISE EXCEPTION 'hd_client_journey_link: clients_tenant_id_id_key UNIQUE (tenant_id, id) yok (precondition)';
  END IF;
END
$hd_journey_pre$;

ALTER TABLE public.human_design_clients ADD COLUMN IF NOT EXISTS journey_client_id uuid;

DO $hd_journey_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.human_design_clients'::regclass AND conname = 'hd_clients_journey_tenant_chk'
  ) THEN
    ALTER TABLE public.human_design_clients
      ADD CONSTRAINT hd_clients_journey_tenant_chk
      CHECK (journey_client_id IS NULL OR tenant_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.human_design_clients'::regclass AND conname = 'hd_clients_journey_fk'
  ) THEN
    ALTER TABLE public.human_design_clients
      ADD CONSTRAINT hd_clients_journey_fk
      FOREIGN KEY (tenant_id, journey_client_id)
      REFERENCES public.clients (tenant_id, id) ON DELETE CASCADE;
  END IF;
END
$hd_journey_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS hd_clients_tenant_journey_uidx
  ON public.human_design_clients (tenant_id, journey_client_id)
  WHERE journey_client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hd_client_purge_children()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Yalnız SİLİNEN profile ait (aynı tenant + client_id) satırlar. Başka profil/tenant'a dokunulmaz.
  DELETE FROM public.human_design_reports r
   WHERE r.client_id = OLD.id AND r.tenant_id IS NOT DISTINCT FROM OLD.tenant_id;
  DELETE FROM public.human_design_charts c
   WHERE c.client_id = OLD.id AND c.tenant_id IS NOT DISTINCT FROM OLD.tenant_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.hd_client_purge_children() FROM PUBLIC;

DROP TRIGGER IF EXISTS hd_client_purge_children_trg ON public.human_design_clients;
CREATE TRIGGER hd_client_purge_children_trg
  BEFORE DELETE ON public.human_design_clients
  FOR EACH ROW EXECUTE FUNCTION public.hd_client_purge_children();

COMMENT ON COLUMN public.human_design_clients.journey_client_id IS
  'Merkezî Danışan Yolculuğu danışanı (clients.id). Tenant-güvenli bileşik FK; uzman onayıyla bağlanır (otomatik eşleştirme yok). NULL = bağlı değil.';

COMMIT;
