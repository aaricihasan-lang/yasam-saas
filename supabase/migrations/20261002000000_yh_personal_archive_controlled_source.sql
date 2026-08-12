-- =============================================================================
-- 20261002000000_yh_personal_archive_controlled_source.sql
--
-- YAŞAM HAFIZASI™ — BF-11E: KİŞİSEL ARŞİV CONTROLLED SOURCE HARDENING (foundation)
--
-- AMAÇ: kisisel_arsiv:archives ROW-GATED CONTROLLED kaynağının GÜVENLİ additive DB
--   altyapısını kurar: (1) personal_archives composite UNIQUE(tenant_id, id) [FK hedefi],
--   (2) yh_archive_classifications → personal_archives composite tenant FK (NOT VALID;
--   apply-safe), (3) classification mutation → archive source identity CDC (source-özel
--   enqueue fn), (4) personal_archives CDC (generic enqueue) — her ikisi AKTİVASYON-KAPILI.
--
-- TRACKED SCHEMA NOTU: personal_archives repository'de tracked CREATE TABLE'a SAHİP DEĞİLDİR
--   (teknik borç; ayrı sistem-genel baseline adoption kapısı). Bu migration live tabloyu
--   TAHMİN EDEREK yeniden CREATE TABLE ETMEZ; yalnız FAIL-CLOSED precondition doğrular ve
--   additive hardening uygular. Production read-only introspection (ayrı kapı) uyumluluğu
--   doğruladı: personal_archives(id uuid PK, tenant_id uuid) + yh_archive_classifications
--   UNIQUE(tenant_id, archive_id) mevcut; composite UNIQUE(tenant_id,id) + FK EKSİK.
--
-- MERGE-SAFE / APPLY-SAFE (KİLİTLİ): TRIGGER ATTACHED ≠ SOURCE ACTIVATED.
--   yh_cdc_enqueue* aktivasyon-kapılıdır: yh_source_activation'da kisisel_arsiv:archives için
--   is_active=true YOKSA (apply-safe default) enqueue SESSİZ NO-OP (kaynak CRUD ENGELLENMEZ).
--   Bu migration:
--     - activation row SEED ETMEZ            - is_active=true YAPMAZ
--     - backfill_allowed=true YAPMAZ          - historical SELECT / source-scan YAPMAZ
--     - archive/classification DATA DML YAPMAZ (UPDATE/INSERT/DELETE yok)
--     - index DML YAPMAZ                      - reconcile BAŞLATMAZ    - test row OLUŞTURMAZ
--   FK NOT VALID: mevcut satırlar TARANMAZ (apply-safe; orphan varsayımı YAPILMAZ). YENİ/UPDATE
--   satırlar ZORLANIR. İleride VALIDATE CONSTRAINT ayrı production kapısıdır (orphan-count
--   precheck sonrası). Son foundation kanıtı 0 classification satırıydı; güncel row-count
--   VARSAYILMAZ → NOT VALID bilinçli tercih.
--
-- GÜVENLİK: fonksiyon SECURITY DEFINER + sabit search_path + schema-qualified; PUBLIC/anon/
--   authenticated EXECUTE kapalı. Trigger ham archive içeriği / classification reason / PII /
--   payload snapshot YAZMAZ (yalnız source_key + source_id=archive_id + tenant_id + operation).
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: guard'lı DO blokları + CREATE OR REPLACE + DROP TRIGGER IF EXISTS/CREATE TRIGGER.
-- ROLLBACK-ONLY: tek transaction; herhangi bir adım hata verirse tümü geri alınır.
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED PRECONDITIONS (şema tahmini YOK; eksikse mutation başlamadan BLOCK) ──
DO $pre$
BEGIN
  IF to_regclass('public.personal_archives') IS NULL THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: public.personal_archives yok (untracked live tablo bekleniyor)';
  END IF;
  IF to_regclass('public.yh_archive_classifications') IS NULL THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: public.yh_archive_classifications yok — önce 20260925000000 uygulanmali';
  END IF;
  IF to_regprocedure('public.yh_cdc_enqueue()') IS NULL THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: public.yh_cdc_enqueue() yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yasam_hafizasi_outbox') IS NULL THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: public.yasam_hafizasi_outbox yok — önce 20260815000000 uygulanmali';
  END IF;
  -- personal_archives.id + tenant_id kolonları exact mevcut olmalı (FK/trigger önkoşulu).
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='personal_archives' AND column_name='id') THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: personal_archives.id kolonu yok';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='personal_archives' AND column_name='tenant_id') THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: personal_archives.tenant_id kolonu yok';
  END IF;
  -- classification sidecar (tenant_id, archive_id) UNIQUE mevcut olmalı (kaynak sözleşmesi).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='yh_archive_classifications' AND column_name='archive_id'
  ) THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: yh_archive_classifications.archive_id kolonu yok';
  END IF;
END
$pre$;

-- ─── 1) personal_archives composite UNIQUE(tenant_id, id) — FK hedefi (duplicate-safe) ──
-- id zaten PK (tekil) → (tenant_id, id) her zaman tekildir; kör backfill/duplicate riski YOK.
-- Idempotent: constraint yoksa ekle. (Additive; archive verisini OKUMAZ/TAŞIMAZ.)
DO $u$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.personal_archives'::regclass
      AND conname = 'personal_archives_tenant_id_id_key'
  ) THEN
    ALTER TABLE public.personal_archives
      ADD CONSTRAINT personal_archives_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END
$u$;

-- ─── 2) yh_archive_classifications → personal_archives composite tenant FK (NOT VALID) ──
-- Tenant-güvenli: (tenant_id, archive_id) → personal_archives(tenant_id, id). Cross-tenant
-- classification DB düzeyinde imkânsız. Archive silinince classification CASCADE (orphan yok).
-- NOT VALID: mevcut satırlar taranmaz (apply-safe); yeni/UPDATE zorlanır.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.yh_archive_classifications'::regclass
      AND conname = 'yhac_archive_fk'
  ) THEN
    ALTER TABLE public.yh_archive_classifications
      ADD CONSTRAINT yhac_archive_fk
      FOREIGN KEY (tenant_id, archive_id)
      REFERENCES public.personal_archives (tenant_id, id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$fk$;

-- ─── 3) yh_cdc_enqueue_archive_classification() — source-özel, AKTİVASYON-KAPILI enqueue ──
-- Generic yh_cdc_enqueue NEW.id kullanır → classification satırında NEW.id = classification-row
-- id (archive_id DEĞİL). Bu source-özel fonksiyon source_id = NEW/OLD.archive_id eşler. Her mutasyon
-- (INSERT/UPDATE/DELETE) archive'ı REEVALUATE eder (operation='upsert'): worker archive satırını
-- yeniden okur → row-gate ineligible ise (unsafe/missing/stale) tombstone; eligible ise index.
-- Classification DELETE = archive DELETE DEĞİL → 'upsert' reevaluate (archive hâlâ mevcut, artık
-- classification'sız → ineligible → tombstone). Ham içerik/reason/PII YAZILMAZ.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_archive_classification()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key   text := 'kisisel_arsiv:archives';
  v_source_table text := 'personal_archives';
  v_active       boolean;
  v_source_id    uuid;
  v_tenant_id    uuid;
BEGIN
  -- Yanlış-bağlanma savunması: yalnız public.yh_archive_classifications üzerinde çalışmalı.
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public'
     OR TG_TABLE_NAME IS DISTINCT FROM 'yh_archive_classifications' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_archive_classification: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  -- AKTİVASYON KAPISI: kapalı kaynak OLAY ÜRETMEZ (kaynak CRUD ENGELLENMEZ; sessiz no-op).
  SELECT a.is_active INTO v_active
  FROM public.yh_source_activation AS a
  WHERE a.source_key = v_source_key;
  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- source_id = archive_id (classification-row id DEĞİL); tenant classification satırından.
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_source_id := NEW.archive_id;
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_source_id := OLD.archive_id;
    v_tenant_id := OLD.tenant_id;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_archive_classification: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_archive_classification: archive_id null';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_archive_classification: tenant_id null';
  END IF;

  -- Her classification mutasyonu → archive REEVALUATE (upsert). Worker eligibility'i yeniden
  -- değerlendirir (index veya tombstone). Idempotent coalescing (BF-11A UNIQUE(source_key, source_id)).
  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, operation)
  VALUES
    (v_source_key, v_source_table, v_source_id, v_tenant_id, 'upsert')
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_archive_classification() FROM PUBLIC, anon, authenticated;

-- ─── 4) Archive CDC trigger (generic enqueue; NEW.id = archive id) ─────────────
-- Aktivasyon-kapılı: is_active=false/absent → sessiz no-op. INSERT/UPDATE→upsert, DELETE→delete.
DROP TRIGGER IF EXISTS yh_cdc_personal_archives_trg ON public.personal_archives;
CREATE TRIGGER yh_cdc_personal_archives_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.personal_archives
  FOR EACH ROW
  EXECUTE FUNCTION public.yh_cdc_enqueue('kisisel_arsiv:archives', 'personal_archives');

-- ─── 5) Classification CDC trigger (source-özel; NEW.archive_id → source_id) ────
DROP TRIGGER IF EXISTS yh_cdc_yh_archive_classifications_trg ON public.yh_archive_classifications;
CREATE TRIGGER yh_cdc_yh_archive_classifications_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.yh_archive_classifications
  FOR EACH ROW
  EXECUTE FUNCTION public.yh_cdc_enqueue_archive_classification();

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Composite UNIQUE + FK (NOT VALID) mevcut:
--   SELECT conname, convalidated FROM pg_constraint
--     WHERE conrelid='public.yh_archive_classifications'::regclass AND conname='yhac_archive_fk'; -- convalidated=f
--   SELECT 1 FROM pg_constraint WHERE conrelid='public.personal_archives'::regclass
--     AND conname='personal_archives_tenant_id_id_key';                                           -- 1
--   -- 2) Trigger'lar bağlı + fonksiyon güvenli:
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.personal_archives'::regclass AND NOT tgisinternal;
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.yh_archive_classifications'::regclass AND NOT tgisinternal;
--   SELECT prosecdef FROM pg_proc WHERE proname='yh_cdc_enqueue_archive_classification';          -- t
--   SELECT has_function_privilege('anon','public.yh_cdc_enqueue_archive_classification()','EXECUTE'); -- false
--   -- 3) Aktivasyon OFF (bu migration seed etmez): TRIGGER ATTACHED ≠ SOURCE ACTIVATED:
--   SELECT count(*) FROM public.yh_source_activation WHERE source_key='kisisel_arsiv:archives' AND is_active; -- 0
--   -- 4) Bu migration archive/classification/index DATA DML'i yapmaz; historical scan yapmaz.
--
-- AKTİVASYON (bu migration'da DEĞİL; AYRI ONAY + kod enabled:true zaten merge'li):
--   -- SELECT public.yh_source_activation_set('kisisel_arsiv:archives', true, false,
--   --                                        'ROW_GATED_CONTROLLED','professional','controlled activation');
--   -- ROLLBACK / KILL-SWITCH (index KORUNUR):
--   -- SELECT public.yh_source_deactivate('kisisel_arsiv:archives');
--   -- DROP TRIGGER IF EXISTS yh_cdc_personal_archives_trg ON public.personal_archives;
--   -- DROP TRIGGER IF EXISTS yh_cdc_yh_archive_classifications_trg ON public.yh_archive_classifications;
-- FK VALIDATE (ayrı production kapısı; orphan-count precheck sonrası):
--   -- ALTER TABLE public.yh_archive_classifications VALIDATE CONSTRAINT yhac_archive_fk;
-- =============================================================================
