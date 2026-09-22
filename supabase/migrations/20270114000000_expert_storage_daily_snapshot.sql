-- =============================================================================
-- 20270114000000_expert_storage_daily_snapshot.sql   [ADDITIVE — TABLE + RPC]
--
-- UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 1 / İP-5 (günlük depolama snapshot).
--
-- AMAÇ: İleriye dönük depolama BÜYÜMESİ için günde bir çalışan, tenant bazlı depolama
--   ölçümünü kalıcılaştıran hafif snapshot altyapısı. Geçmişe dönük değer ÜRETİLMEZ
--   (yalnız çalıştığı günden itibaren birikir).
--
-- İDEMPOTENCY: PK (tenant_id, snapshot_date) → aynı gün tekrar çalıştırma ÇİFT KAYIT
--   OLUŞTURMAZ (ON CONFLICT DO UPDATE ile en güncel ölçümle yenilenir).
-- STATUS: complete | partial | failed. missing_size (boyutsuz obje) varsa 'partial';
--   kısmi/başarısız ölçüm asla 'complete' gibi sunulmaz (uygulama status'u yansıtır).
--
-- CRON: Yeni HER-DAKİKA cron YOK. Inngest günde bir (lib/inngest/functions/
--   expertStorageSnapshot.ts) — PRODUCTION VARSAYILAN KAPALI (env flag
--   EXPERT_STORAGE_SNAPSHOT_ENABLED === "true" değilse hiçbir DB/IO yapmaz). Sadece
--   merge/deploy snapshot'ı ÇALIŞTIRMAZ.
--
-- GÜVENLİK: snapshot RPC SECURITY DEFINER + sabit search_path + yalnız service_role
--   EXECUTE. Tablo default-deny; service_role SELECT+INSERT+UPDATE (upsert için UPDATE).
--
-- KAPSAM: yalnız public.expert_storage_daily + snapshot RPC. Veri (DML) YOK.
-- ⚠️ Bu migration bu turda HİÇBİR veritabanına UYGULANMAZ (ayrı onay).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.expert_storage_daily (
  tenant_id          uuid        NOT NULL,
  snapshot_date      date        NOT NULL,
  measured_at        timestamptz NOT NULL DEFAULT now(),
  object_count       bigint      NOT NULL DEFAULT 0,
  total_bytes        bigint      NOT NULL DEFAULT 0,
  missing_size_count bigint      NOT NULL DEFAULT 0,
  status             text        NOT NULL DEFAULT 'complete',
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expert_storage_daily_pk PRIMARY KEY (tenant_id, snapshot_date),
  CONSTRAINT expert_storage_daily_status_chk CHECK (status IN ('complete','partial','failed'))
);

COMMENT ON TABLE public.expert_storage_daily IS
  'FAZ 1 İP-5 — günlük tenant depolama snapshot (büyüme trendi). (tenant_id, snapshot_date) idempotent upsert.';

CREATE INDEX IF NOT EXISTS idx_expert_storage_daily_date
  ON public.expert_storage_daily (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_expert_storage_daily_tenant_date
  ON public.expert_storage_daily (tenant_id, snapshot_date DESC);

REVOKE ALL ON TABLE public.expert_storage_daily FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.expert_storage_daily TO service_role;

ALTER TABLE public.expert_storage_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_expert_storage_daily" ON public.expert_storage_daily;
CREATE POLICY "service_role_expert_storage_daily"
  ON public.expert_storage_daily FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Snapshot RPC: expert_storage_usage()'ı tenant bazında toplar, o gün için upsert eder.
-- Yalnız ATFEDİLEBİLEN (tenant_id NOT NULL) çalışma alanları snapshot'lanır. Döndürülen
-- değer = yazılan/güncellenen tenant satır sayısı.
CREATE OR REPLACE FUNCTION public.expert_storage_snapshot_run(p_snapshot_date date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_rows integer;
BEGIN
  WITH agg AS (
    SELECT
      u.tenant_id,
      sum(u.object_count)::bigint       AS object_count,
      sum(u.total_bytes)::bigint        AS total_bytes,
      sum(u.missing_size_count)::bigint AS missing_size_count
    FROM public.expert_storage_usage() u
    WHERE u.tenant_id IS NOT NULL
    GROUP BY u.tenant_id
  ),
  upserted AS (
    INSERT INTO public.expert_storage_daily
      (tenant_id, snapshot_date, measured_at, object_count, total_bytes, missing_size_count, status)
    SELECT
      agg.tenant_id, p_snapshot_date, now(), agg.object_count, agg.total_bytes, agg.missing_size_count,
      CASE WHEN agg.missing_size_count > 0 THEN 'partial' ELSE 'complete' END
    FROM agg
    ON CONFLICT (tenant_id, snapshot_date) DO UPDATE SET
      measured_at        = excluded.measured_at,
      object_count       = excluded.object_count,
      total_bytes        = excluded.total_bytes,
      missing_size_count = excluded.missing_size_count,
      status             = excluded.status
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_rows FROM upserted;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.expert_storage_snapshot_run(date) IS
  'FAZ 1 İP-5 — günlük depolama snapshot upsert (idempotent). service_role-only.';

REVOKE ALL ON FUNCTION public.expert_storage_snapshot_run(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expert_storage_snapshot_run(date) TO service_role;

COMMIT;

-- =============================================================================
-- RETENTION (PLAN — otomatik iş KURMAZ): öneri ~400 gün; eski satırlar operatörce
--   DELETE ile budanır (append-only DEĞİL; upsert tablosu). idx ...date bunu karşılar.
-- ETKİNLEŞTİRME: production'da EXPERT_STORAGE_SNAPSHOT_ENABLED=true set edilmeden
--   Inngest fonksiyonu no-op'tur. Ayrı onay + kontrollü etkinleştirme gerekir.
-- DOĞRULAMA:
--   SELECT has_function_privilege('service_role','public.expert_storage_snapshot_run(date)','EXECUTE'); -- t
--   SELECT prosecdef FROM pg_proc WHERE proname='expert_storage_snapshot_run';                          -- t
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.expert_storage_snapshot_run(date);
--   DROP TABLE IF EXISTS public.expert_storage_daily;
-- =============================================================================
