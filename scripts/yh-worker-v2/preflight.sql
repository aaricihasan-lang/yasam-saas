-- =============================================================================
-- YAŞAM HAFIZASI™ — WORKER V2 PRODUCTION PRE-APPLY PREFLIGHT (READ-ONLY / ISOLATED).
--
-- migration: 20261210000000_yh_worker_v2_shared_section_sources.sql
--
-- BU DOSYA HAZIRLIKTIR — production apply ÖNCESİ AYRI ONAY ile çalıştırılır. Bölüm 1-2 SALT-OKUNUR
-- (aggregate/catalog; ham PII/content SELECT ETMEZ). Bölüm 3 IZOLE cascade/trigger-order deneyidir:
-- YALNIZ TEMP tablo kullanır + tek transaction + ROLLBACK → GERÇEK VERİYE DOKUNMAZ. Bu ortamda
-- disposable PostgreSQL bulunmadığından PostgreSQL RI cascade/trigger sırası burada, apply öncesi,
-- production PG sürümünde doğrulanır (parent-side capture tasarımının temel varsayımı).
--
-- HERHANGİ bir PRECHECK satırı FAIL → apply YAPMA.
-- =============================================================================

-- ─── BÖLÜM 1: READ-ONLY PRECHECK (expected == actual ⇒ PASS) ─────────────────
WITH src(source_key, source_table) AS (VALUES
  ('dogaltas:knowledge','stone_knowledge_articles'),
  ('aromaterapi:oils','aromatherapy_oils'),
  ('aromaterapi:reference-sheets','aromatherapy_reference_sheets'),
  ('aromaterapi:reference-rows','aromatherapy_reference_rows'),
  ('sifa_rehberi:guide-sections','healing_guide_sections')
)
SELECT ord, chk, expected, actual,
       CASE WHEN expected='record' THEN 'RECORD' WHEN expected=actual THEN 'PASS' ELSE 'FAIL' END AS status
FROM (
  SELECT 1 ord,'P1 5 kaynak tablo + 2 parent + outbox mevcut' chk,'8' expected,
    (SELECT count(*)::text FROM (VALUES ('stone_knowledge_articles'),('aromatherapy_oils'),
        ('aromatherapy_reference_sheets'),('aromatherapy_reference_rows'),('healing_guide_sections'),
        ('healing_guides'),('yasam_hafizasi_outbox'),('yh_source_activation')) t(n)
      WHERE to_regclass('public.'||n) IS NOT NULL) actual
  UNION ALL SELECT 2,'P2 reference_rows.sheet_id FK ON DELETE CASCADE','c',
    (SELECT confdeltype FROM pg_constraint c JOIN pg_class ch ON ch.oid=c.conrelid
       JOIN pg_class pa ON pa.oid=c.confrelid
       WHERE c.contype='f' AND ch.relname='aromatherapy_reference_rows' AND pa.relname='aromatherapy_reference_sheets' LIMIT 1)
  UNION ALL SELECT 3,'P3 guide_sections.guide_id FK ON DELETE CASCADE','c',
    (SELECT confdeltype FROM pg_constraint c JOIN pg_class ch ON ch.oid=c.conrelid
       JOIN pg_class pa ON pa.oid=c.confrelid
       WHERE c.contype='f' AND ch.relname='healing_guide_sections' AND pa.relname='healing_guides' LIMIT 1)
  UNION ALL SELECT 4,'P4 outbox tenant_id APPLY ÖNCESİ NOT NULL (henüz uygulanmadı)','NO',
    (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='yasam_hafizasi_outbox' AND column_name='tenant_id')
  UNION ALL SELECT 5,'P5 worker-v2 trigger HENÜZ YOK (5 child + 4 parent-capture)','0',
    (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal
       AND tgname ~ '^(yh_cdc_\w+_v2_trg|yh_capture_\w+_trg)$')
  UNION ALL SELECT 6,'P6 5 kaynak is_active=true DEĞİL (OFF)','0',
    (SELECT count(*)::text FROM public.yh_source_activation a JOIN src ON a.source_key=src.source_key WHERE a.is_active)
  UNION ALL SELECT 7,'P7 5 kaynak backfill_allowed=true DEĞİL','0',
    (SELECT count(*)::text FROM public.yh_source_activation a JOIN src ON a.source_key=src.source_key WHERE a.backfill_allowed)
  UNION ALL SELECT 8,'P8 5 kaynak outbox event = 0 (henüz olay yok)','0',
    (SELECT count(*)::text FROM public.yasam_hafizasi_outbox o JOIN src ON o.source_key=src.source_key)
  UNION ALL SELECT 9,'P9 Cohort A 11 + stones + archive activation DEĞİŞMEDİ (bilgi)','record',
    (SELECT count(*)::text FROM public.yh_source_activation WHERE is_active)
  UNION ALL SELECT 10,'P10 outbox yho_shared_null_chk HENÜZ YOK (apply ekleyecek)','0',
    (SELECT count(*)::text FROM pg_constraint WHERE conname IN ('yho_tenant_scope_chk','yho_shared_null_chk'))
) s ORDER BY ord;

-- ─── BÖLÜM 2: BASELINE (aggregate; apply ÖNCESİ + SONRASI karşılaştır) ────────
-- shared (tenant NULL) vs tenant satır dağılımı (5 kaynak); ham içerik YOK.
SELECT 'stone_knowledge_articles' AS tbl,
  count(*) FILTER (WHERE tenant_id IS NULL) AS shared_rows,
  count(*) FILTER (WHERE tenant_id IS NOT NULL) AS tenant_rows,
  count(*) FILTER (WHERE is_active = false) AS soft_inactive
  FROM public.stone_knowledge_articles
UNION ALL SELECT 'aromatherapy_oils',
  count(*) FILTER (WHERE tenant_id IS NULL), count(*) FILTER (WHERE tenant_id IS NOT NULL),
  count(*) FILTER (WHERE is_active = false) FROM public.aromatherapy_oils
UNION ALL SELECT 'aromatherapy_reference_sheets',
  count(*) FILTER (WHERE tenant_id IS NULL), count(*) FILTER (WHERE tenant_id IS NOT NULL),
  count(*) FILTER (WHERE is_active = false) FROM public.aromatherapy_reference_sheets;

-- reference_rows / guide_sections: orphan child kontrolü (FK CASCADE ile 0 beklenir) + mevcut index maruziyeti.
SELECT 'reference_rows_orphans' AS metric,
  (SELECT count(*) FROM public.aromatherapy_reference_rows r
     LEFT JOIN public.aromatherapy_reference_sheets s ON s.id = r.sheet_id WHERE s.id IS NULL) AS n
UNION ALL SELECT 'guide_sections_orphans',
  (SELECT count(*) FROM public.healing_guide_sections gs
     LEFT JOIN public.healing_guides g ON g.id = gs.guide_id WHERE g.id IS NULL)
UNION ALL SELECT 'index_rows_5_sources',
  (SELECT count(*) FROM public.yasam_hafizasi_index WHERE source_table IN
     ('stone_knowledge_articles','aromatherapy_oils','aromatherapy_reference_sheets',
      'aromatherapy_reference_rows','healing_guide_sections'));

-- ─── BÖLÜM 3: IZOLE CASCADE/TRIGGER-ORDER DENEYİ (TEMP + ROLLBACK; GERÇEK VERİ YOK) ──
-- Amaç: PostgreSQL RI ON DELETE CASCADE'de child AFTER DELETE trigger'ının parent'ı RESOLVE
-- EDEMEDİĞİNİ ve parent-side BEFORE DELETE capture'ın child kimliklerini YAKALADIĞINI production PG
-- sürümünde kanıtlamak. TEMP tablo + notice log; sonunda ROLLBACK.
BEGIN;
CREATE TEMP TABLE _wv2_parent (id int primary key, tenant text) ON COMMIT DROP;
CREATE TEMP TABLE _wv2_child (id int primary key, pid int references _wv2_parent(id) on delete cascade) ON COMMIT DROP;
CREATE TEMP TABLE _wv2_captured (id int, src text) ON COMMIT DROP;

-- child AFTER DELETE: parent'ı resolve etmeye çalış (cascade'de bulamamalı → 'child-cannot-resolve').
CREATE OR REPLACE FUNCTION pg_temp._wv2_child_ad() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE v_t text;
BEGIN
  SELECT tenant INTO v_t FROM _wv2_parent WHERE id = OLD.pid;
  IF v_t IS NULL THEN
    INSERT INTO _wv2_captured VALUES (OLD.id, 'child-cannot-resolve-parent(cascade)');
  ELSE
    INSERT INTO _wv2_captured VALUES (OLD.id, 'child-resolved(direct)');
  END IF;
  RETURN OLD;
END $f$;
CREATE TRIGGER _wv2_child_ad_trg AFTER DELETE ON _wv2_child FOR EACH ROW EXECUTE FUNCTION pg_temp._wv2_child_ad();

-- parent BEFORE DELETE: child kimliklerini capture et (parent hâlâ mevcutken).
CREATE OR REPLACE FUNCTION pg_temp._wv2_parent_bd() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM _wv2_child WHERE pid = OLD.id LOOP
    INSERT INTO _wv2_captured VALUES (r.id, 'parent-capture(before-delete)');
  END LOOP;
  RETURN OLD;
END $f$;
CREATE TRIGGER _wv2_parent_bd_trg BEFORE DELETE ON _wv2_parent FOR EACH ROW EXECUTE FUNCTION pg_temp._wv2_parent_bd();

INSERT INTO _wv2_parent VALUES (1,'tenant-A');
INSERT INTO _wv2_child VALUES (10,1),(11,1);
DELETE FROM _wv2_parent WHERE id = 1;   -- cascade child delete

-- BEKLENEN: her child için parent-capture(before-delete) VAR (ghost YOK); child-cannot-resolve de
-- görülebilir (cascade sırası kanıtı). Acceptance: capture 'parent-capture' >= child sayısı.
SELECT src, count(*) AS n FROM _wv2_captured GROUP BY src ORDER BY src;
-- ACCEPTANCE: 'parent-capture(before-delete)' = 2 (her child yakalandı). Eğer child cascade trigger'ı
-- parent'ı resolve EDEBİLSEYDİ 'child-resolved(direct)' görülürdü — bu deney o varsayımı test eder.
ROLLBACK;

-- =============================================================================
-- APPLY KARARI: BÖLÜM 1 tüm PASS + BÖLÜM 3 'parent-capture(before-delete)' = child sayısı ⇒
--   COHORT_WORKER_V2_PREAPPLY_PASS → migration 20261210000000 apply edilebilir (AYRI ONAY).
-- Aksi (child cascade trigger parent'ı beklenmedik biçimde resolve ediyorsa) → tasarım gözden geçirilir.
-- Apply SONRASI: outbox tenant_id nullable + 2 check + 9 trigger; 5 kaynak hâlâ OFF (activation ayrı gate).
-- =============================================================================
