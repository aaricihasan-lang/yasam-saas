-- =============================================================================
-- 20270125000000_reflexology_protocols_baseline_and_uid_unique.sql
--
-- REFLEKSOLOJİ — reflexology_protocols ŞEMA PARİTESİ + IDEMPOTENCY ALTYAPISI
-- (REF-005 / REF-006 satış öncesi kapanış)
--
-- ⚠️⚠️  BU MIGRATION OWNER ONAYI OLMADAN PROD'A UYGULANMAZ.  ⚠️⚠️
--   Apply YALNIZ ayrı OWNER onayı + güncel yedek doğrulaması sonrasında yapılır.
--   Aşağıdaki fail-fast precondition (bkz. §3) apply anında duplicate varsa
--   transaction'ı ROLLBACK eder; migration hiçbir koşulda kendiliğinden veri SİLMEZ.
--
-- ⚠️ KESİN KARAR (görev §7): BU MIGRATION PROD'DA KENDİLİĞİNDEN VERİ SİLMEZ.
--   Önceki taslaktaki "her grupta en yeni created_at'i tut, diğerlerini DELETE et"
--   otomatik dedup bloğu KALDIRILDI. Duplicate source_uid satırları birebir aynı
--   OLABİLİR veya kullanıcının farklı zamanlarda düzenlediği FARKLI içerikler olabilir;
--   created_at eski diye körlemesine silmek veri kaybı riskidir. Bunun yerine migration
--   duplicate varsa RAISE EXCEPTION ile durur.
--
-- ─── BAĞLAM ──────────────────────────────────────────────────────────────────
-- HISTORICAL (READ-ONLY prod metadata doğrulaması — 2026-09-23):
--   • public.reflexology_protocols PROD'DA MEVCUT (~419 satır).
--   • Repo'da CREATE TABLE migration'ı YOKTU → şema paritesi eksikti (REF-006).
--   • (tenant_id, source_uid) üzerinde UNIQUE constraint/index PROD'DA YOK.
--   • (tenant_id, source_uid) bazında 58 duplicate grup / toplam 116 satır TESPİT
--     EDİLDİ → REF-005 duplicate hatası prod'da fiilen gerçekleşmiş (SENARYO C).
--   • source_uid = 1 NULL satır (eski/elle kayıt) mevcut.
--
-- CURRENT PROD (APPLY ÖNCESİ — 2026-09-24 kontrollü repair sonrası):
--   • 58/58 duplicate grubun gerçek protokol içeriği AYNI çıktı.
--   • Yedek alındı: internal_backup.reflexology_protocols_duplicates_20260924 (116 satır).
--   • Sonradan oluşmuş 58 admin_transfer duplicate satırı kontrollü silindi.
--   • Toplam satır: 419 → 361.  duplicate group = 0.  duplicate rows = 0.
--   • 1 adet legacy NULL source_uid kayıt KORUNDU.  NULL tenant_id = 0.  NULL created_at = 0.
--   • UNIQUE(tenant_id, source_uid) index HÂLÂ YOK → bu migration ekleyecek.
--
-- NEDEN HÂLÂ FAIL-FAST: repair ile duplicate=0 olsa da, apply anına kadar uygulama
--   katmanından teorik olarak yeni duplicate oluşabilir. Bu yüzden §3 precondition
--   apply anında yeniden kontrol eder ve duplicate varsa güvenle DURUR.
--
-- STRATEJİ (deterministik, non-drop, additive, veri-KORUYUCU):
--   1. CREATE TABLE IF NOT EXISTS → prod'da NO-OP; yalnız temiz ortam paritesi.
--      Baseline canlı prod contract'ını temsil eder (kolonlar/CHECK/nullable — bkz. altta).
--   2. Lock/RLS/REVOKE deseni → reflexology_notes/atlas ile birebir aynı.
--   3. FAIL-FAST PRECONDITION: duplicate (tenant_id, source_uid) grubu varsa migration
--      RAISE EXCEPTION ile FAIL olur. Otomatik DELETE YOK. NULL source_uid sayısı
--      RAISE NOTICE ile raporlanır (partial index onu kapsamaz).
--   4. Duplicate YOKSA partial UNIQUE INDEX (WHERE source_uid IS NOT NULL) eklenir →
--      bundan sonra duplicate DB-düzeyinde imkânsız; create route 23505 yakalayıp
--      UPDATE'e düşerek atomik idempotent olur.
--
-- IDEMPOTENT: temiz ortamda tekrar çalıştırma güvenli (IF NOT EXISTS + index IF NOT EXISTS).
-- GERİ UYUMLU: mevcut satır yapısı DEĞİŞMEZ; hiçbir satır silinmez/yeniden sahiplenilmez.
--   ⚠️ Bu migration prod'a yeni NOT NULL constraint EKLEMEZ (tenant_id/created_at canlıda
--   NULLABLE'dır; SET NOT NULL ayrı bir schema-hardening kararıdır, KAPSAM DIŞI).
-- =============================================================================

BEGIN;

-- ─── 1) Baseline parite (prod'da NO-OP; canlı prod şemasından doğrulanmış kontrat) ─
--   id/created_at KAYIT KATMANINDA İSTEMCİ tarafından üretilir (crypto.randomUUID()).
--   ⚠️ Nullable'lar canlı prod ile hizalı: tenant_id ve created_at NOT NULL DEĞİL
--   (canlı metadata NULLABLE gösteriyor). Yeni NOT NULL burada EKLENMEZ (kapsam dışı).
CREATE TABLE IF NOT EXISTS public.reflexology_protocols (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid,
  source_uid               text,
  title                    text,
  target_problem           text,
  organs                   text,
  application_notes        text,
  raw_json                 jsonb,
  created_at               timestamptz DEFAULT now(),
  origin_type              text,
  origin_label             text,
  origin_source_id         uuid,
  origin_transfer_batch_id uuid,
  transferred_at           timestamptz,
  CONSTRAINT reflexology_protocols_origin_type_check CHECK (
    origin_type IS NULL
    OR origin_type IN ('admin_transfer', 'expert_created', 'legacy')
  )
);

CREATE INDEX IF NOT EXISTS reflexology_protocols_tenant_idx
  ON public.reflexology_protocols (tenant_id);

-- Canlı prod'daki transfer batch partial index'i (temiz ortam paritesi; prod'da NO-OP).
CREATE INDEX IF NOT EXISTS idx_reflexology_protocols_transfer_batch
  ON public.reflexology_protocols (origin_transfer_batch_id)
  WHERE origin_transfer_batch_id IS NOT NULL;

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
--   CURRENT PROD (2026-09-24 repair sonrası) duplicate = 0 → beklenen: NOTICE + geçiş.
--   Yine de apply anında yeniden duplicate oluşma ihtimaline karşı kontrol korunur.
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
      'constraint can be added (backup + duplicate audit/repair). '
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
--     WHERE tablename='reflexology_protocols';                      -- *_tenant_uid_uidx +
--                                                                   -- *_transfer_batch var
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname='reflexology_protocols';                       -- t, f
--   SELECT has_table_privilege('anon','public.reflexology_protocols','SELECT'); -- false
--
-- PROD (CURRENT — duplicate = 0) apply edilirse:
--   → §3 NOTICE '0 duplicate group(s)' basar, geçer; partial UNIQUE eklenir. Beklenen.
-- PROD (teorik — apply anında yeniden duplicate oluşmuşsa):
--   → §3 RAISE EXCEPTION ile transaction ROLLBACK; hiçbir satır değişmez. Beklenen.
-- =============================================================================
