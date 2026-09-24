-- =============================================================================
-- 20270125000000_reflexology_protocols_baseline_and_uid_unique.sql
--
-- REFLEKSOLOJİ — reflexology_protocols ŞEMA PARİTESİ + IDEMPOTENCY ALTYAPISI
-- (REF-005 / REF-006 satış öncesi kapanış)
--
-- ⚠️⚠️  BU MIGRATION AŞAMA 2'DE PROD'A UYGULANMAZ.  ⚠️⚠️
--   Prod'da 58 duplicate grup / 116 satır tespit edildiği için bu migration prod'da
--   FAIL-FAST olur (aşağıya bkz.). Apply YALNIZ AŞAMA 3'te, ayrı OWNER onayı, yedek ve
--   duplicate audit/repair (duplicate count = 0) sonrasında yapılır.
--
-- ⚠️ KESİN KARAR (görev §7): BU MIGRATION PROD'DA KENDİLİĞİNDEN VERİ SİLMEZ.
--   Önceki taslaktaki "her grupta en yeni created_at'i tut, diğerlerini DELETE et"
--   otomatik dedup bloğu KALDIRILDI. Duplicate source_uid satırları birebir aynı
--   OLABİLİR veya kullanıcının farklı zamanlarda düzenlediği FARKLI içerikler olabilir;
--   created_at eski diye körlemesine silmek veri kaybı riskidir. Bunun yerine migration
--   duplicate varsa RAISE EXCEPTION ile durur ve temizliği AŞAMA 3'e havale eder.
--
-- BAĞLAM (READ-ONLY prod metadata doğrulaması — 2026-09-23):
--   • public.reflexology_protocols PROD'DA MEVCUT (~419 satır).
--   • Repo'da CREATE TABLE migration'ı YOKTU → şema paritesi eksikti (REF-006).
--   • (tenant_id, source_uid) üzerinde UNIQUE constraint/index PROD'DA YOK.
--   • (tenant_id, source_uid) bazında 58 duplicate grup / toplam 116 satır TESPİT
--     EDİLDİ → REF-005 duplicate hatası prod'da fiilen gerçekleşmiş.
--   • source_uid = 1 NULL satır (eski/elle kayıt) mevcut.
--   → SENARYO C: UNIQUE YOK + DUPLICATE VAR.
--
-- STRATEJİ (deterministik, non-drop, additive, veri-KORUYUCU):
--   1. CREATE TABLE IF NOT EXISTS → prod'da NO-OP; yalnız temiz ortam paritesi.
--   2. Lock/RLS/REVOKE deseni → reflexology_notes/atlas ile birebir aynı
--      ([[reflexology_notes_atlas]] , [[lock_module_tables_anon]]).
--   3. FAIL-FAST PRECONDITION: duplicate (tenant_id, source_uid) grubu varsa migration
--      RAISE EXCEPTION ile FAIL olur. Otomatik DELETE YOK. NULL source_uid sayısı
--      RAISE NOTICE ile raporlanır (partial index onu kapsamaz; AŞAMA 3'te incelenir).
--   4. Duplicate YOKSA partial UNIQUE INDEX (WHERE source_uid IS NOT NULL) eklenir →
--      bundan sonra duplicate DB-düzeyinde imkânsız; create route 23505 yakalayıp
--      UPDATE'e düşerek atomik idempotent olur.
--
-- IDEMPOTENT: temiz ortamda tekrar çalıştırma güvenli (IF NOT EXISTS + index IF NOT EXISTS).
-- GERİ UYUMLU: mevcut satır yapısı DEĞİŞMEZ; hiçbir satır silinmez/yeniden sahiplenilmez.
-- =============================================================================

BEGIN;

-- ─── 1) Baseline parite (prod'da NO-OP; koddan doğrulanmış kontrat) ───────────
--   id/created_at KAYIT KATMANINDA İSTEMCİ tarafından üretilir (crypto.randomUUID()).
CREATE TABLE IF NOT EXISTS public.reflexology_protocols (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  source_uid        text,
  title             text,
  target_problem    text,
  organs            text,
  application_notes text,
  raw_json          jsonb,
  origin_type       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reflexology_protocols_tenant_idx
  ON public.reflexology_protocols (tenant_id);

-- ─── 2) Kilit: anon/authenticated erişimini kapat, RLS aç (service_role bypass) ─
--   ⛔ FORCE RLS KULLANILMAZ (service_role akışını kırardı — mevcut desenle aynı).
DO $$
DECLARE
  pol record;
  col record;
  tbl text := 'reflexology_protocols';
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
  END LOOP;

  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', tbl);

  FOR col IN
    SELECT column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = tbl
      AND grantee IN ('anon', 'authenticated') AND privilege_type = 'SELECT'
  LOOP
    EXECUTE format('REVOKE SELECT (%I) ON TABLE public.%I FROM %I',
      col.column_name, tbl, col.grantee);
  END LOOP;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
END $$;

-- ─── 3) FAIL-FAST PRECONDITION — otomatik DELETE YOK (görev §7 kararı) ─────────
--   Duplicate (tenant_id, source_uid) grubu varsa migration burada DURUR.
--   Duplicate temizliği (backup + audit/repair) AŞAMA 3'te yapılır; bu migration
--   yalnızca duplicate count = 0 iken UNIQUE index ekler.
DO $$
DECLARE
  dup_groups bigint;
  dup_rows   bigint;
  null_rows  bigint;
BEGIN
  SELECT count(*), coalesce(sum(c), 0)
    INTO dup_groups, dup_rows
  FROM (
    SELECT count(*) AS c
    FROM public.reflexology_protocols
    WHERE source_uid IS NOT NULL
    GROUP BY tenant_id, source_uid
    HAVING count(*) > 1
  ) g;

  SELECT count(*) INTO null_rows
  FROM public.reflexology_protocols
  WHERE source_uid IS NULL;

  RAISE NOTICE 'reflexology_protocols precheck: % duplicate group(s), % row(s) in them, % NULL source_uid row(s).',
    dup_groups, dup_rows, null_rows;

  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'ABORT: % duplicate (tenant_id, source_uid) group(s) / % row(s) present. '
      'Duplicate protocol source_uid records must be resolved before the UNIQUE '
      'constraint can be added (AŞAMA 3: backup + duplicate audit/repair). '
      'This migration does NOT delete data.',
      dup_groups, dup_rows
      USING ERRCODE = 'raise_exception';
  END IF;
END $$;

-- ─── 4) Partial unique index (YALNIZ duplicate yokken buraya ulaşılır) ─────────
--   NULL source_uid satırlar index DIŞI; yeni NULL üretimi uygulama katmanında
--   (POST route source_uid zorunlu) engellenir → partial index kaçağı olmaz.
CREATE UNIQUE INDEX IF NOT EXISTS reflexology_protocols_tenant_uid_uidx
  ON public.reflexology_protocols (tenant_id, source_uid)
  WHERE source_uid IS NOT NULL;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (temiz ortamda apply sonrası, beklenen):
--   SELECT count(*) FROM (
--     SELECT tenant_id, source_uid FROM public.reflexology_protocols
--     WHERE source_uid IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1
--   ) d;                                                            -- 0
--   SELECT indexname FROM pg_indexes
--     WHERE tablename='reflexology_protocols';                      -- *_tenant_uid_uidx var
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname='reflexology_protocols';                       -- t, f
--   SELECT has_table_privilege('anon','public.reflexology_protocols','SELECT'); -- false
--
-- PROD (duplicate mevcutken) apply denenirse:
--   → §3 RAISE EXCEPTION ile transaction ROLLBACK; hiçbir satır değişmez. Beklenen.
-- =============================================================================
