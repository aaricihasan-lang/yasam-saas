-- =============================================================================
-- YAŞAM HAFIZASI™ — WORKER V2: NULL-SENTINEL CASCADE-GHOST REGRESSION (DB-backed).
--
-- NE TEST EDER: Gerçek trigger + FK ON DELETE CASCADE üzerinden PRODUCER (outbox) scope'unu
--   doğrular. reference_row child CDC'sinin cascade-orphan (parent yok) durumunda YANLIŞ
--   shared/null DELETE olayı ÜRETMEDİĞİNİ ispatlar. Bu, 20261212000000 null-sentinel fix'inin
--   regresyonudur.
--
--   PRE-FIX (IF NOT v_found):      Case C child AFTER-DELETE → shared/null → coalesce → ASSERT FAIL.
--   POST-FIX (IS DISTINCT FROM):   Case C child AFTER-DELETE → NOTHING → final tenant → PASS.
--
-- GÜVENLİK: TEK transaction + SON'DA ROLLBACK → HİÇBİR kalıcı yazma. Aktivasyon geçici olarak
--   tx içinde açılır (rollback ile geri alınır). SALT staging/non-prod'da çalıştırın. Marker tenant
--   ('00000000-0000-4000-8000-0000000000aa') ile gerçek verilere karışmaz. Üretime OTOMATİK BAĞLANMAZ.
--
-- ÇALIŞTIRMA (staging, fix uygulanmış DB):  psql "$STAGING_URL" -v ON_ERROR_STOP=1 -f nullSentinelRegression.sql
--   Herhangi bir ASSERT başarısızlığı → RAISE EXCEPTION → tüm tx ROLLBACK + non-zero exit.
-- =============================================================================

BEGIN;

-- Transaction-scoped assert helper (ROLLBACK ile birlikte kaybolur).
CREATE FUNCTION pg_temp.ns_assert_outbox(p_case text, p_child uuid, p_op text, p_scope text, p_tid uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE r_op text; r_scope text; r_tid uuid; BEGIN
  SELECT operation, tenant_scope, tenant_id INTO r_op, r_scope, r_tid
  FROM public.yasam_hafizasi_outbox
  WHERE source_key = 'aromaterapi:reference-rows' AND source_id = p_child;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[%] outbox satiri YOK (child=%)', p_case, p_child;
  END IF;
  IF r_op IS DISTINCT FROM p_op OR r_scope IS DISTINCT FROM p_scope OR r_tid IS DISTINCT FROM p_tid THEN
    RAISE EXCEPTION '[%] MISMATCH: beklenen op=%/scope=%/tenant=% ; gercek op=%/scope=%/tenant=%',
      p_case, p_op, p_scope, p_tid, r_op, r_scope, r_tid;
  END IF;
  RAISE NOTICE '[%] PASS (op=% scope=% tenant=%)', p_case, r_op, r_scope, r_tid;
END $fn$;

DO $regression$
DECLARE
  c_tenant   constant uuid := '00000000-0000-4000-8000-0000000000aa';
  c_srckey   constant text := 'aromaterapi:reference-rows';
  v_sheet    uuid;
  v_child    uuid;
  v_op       text;
  v_ver_before bigint;
  v_ver_after  bigint;
BEGIN
  -- ── 0) Aktivasyon: producer path'ini exercise etmek için tx-local aç (rollback ile geri) ──
  UPDATE public.yh_source_activation SET is_active = true
    WHERE source_key IN ('aromaterapi:reference-rows','aromaterapi:reference-sheets');
  IF NOT EXISTS (SELECT 1 FROM public.yh_source_activation
                 WHERE source_key = 'aromaterapi:reference-rows' AND is_active) THEN
    RAISE EXCEPTION 'PRECHECK: aromaterapi:reference-rows aktivasyon satiri yok — once 20261210 + activation topolojisi gerekir';
  END IF;

  -- ══ Case G: child INSERT → upsert/tenant (tenant parent) ══
  INSERT INTO public.aromatherapy_reference_sheets (tenant_id, sheet_name, display_title)
    VALUES (c_tenant, 'NS_REG_tenant_G', 'NS_REG') RETURNING id INTO v_sheet;
  INSERT INTO public.aromatherapy_reference_rows (sheet_id, row_index, cells)
    VALUES (v_sheet, 0, '{"0":"g"}'::jsonb) RETURNING id INTO v_child;
  PERFORM pg_temp.ns_assert_outbox('G-tenant-insert', v_child, 'upsert', 'tenant', c_tenant);

  -- ══ Case A: TENANT parent + DIRECT child DELETE → delete/tenant ══
  DELETE FROM public.aromatherapy_reference_rows WHERE id = v_child;
  PERFORM pg_temp.ns_assert_outbox('A-tenant-direct-delete', v_child, 'delete', 'tenant', c_tenant);

  -- ══ Case B: SHARED parent + DIRECT child DELETE → delete/shared/null ══
  INSERT INTO public.aromatherapy_reference_sheets (tenant_id, sheet_name, display_title)
    VALUES (NULL, 'NS_REG_shared_B', 'NS_REG') RETURNING id INTO v_sheet;
  INSERT INTO public.aromatherapy_reference_rows (sheet_id, row_index, cells)
    VALUES (v_sheet, 0, '{"0":"b"}'::jsonb) RETURNING id INTO v_child;
  PERFORM pg_temp.ns_assert_outbox('B-shared-insert', v_child, 'upsert', 'shared', NULL);
  DELETE FROM public.aromatherapy_reference_rows WHERE id = v_child;
  PERFORM pg_temp.ns_assert_outbox('B-shared-direct-delete', v_child, 'delete', 'shared', NULL);

  -- ══ Case C: TENANT parent + CASCADE parent DELETE → final child event MUST remain tenant ══
  --    (exact production reproducer: child AFTER-DELETE cascade-orphan'da parent'ı bulamaz)
  INSERT INTO public.aromatherapy_reference_sheets (tenant_id, sheet_name, display_title)
    VALUES (c_tenant, 'NS_REG_tenant_C', 'NS_REG') RETURNING id INTO v_sheet;
  INSERT INTO public.aromatherapy_reference_rows (sheet_id, row_index, cells)
    VALUES (v_sheet, 0, '{"0":"c"}'::jsonb) RETURNING id INTO v_child;
  DELETE FROM public.aromatherapy_reference_sheets WHERE id = v_sheet;  -- CASCADE removes child
  -- POST-FIX: parent BEFORE-DELETE capture emitted delete/tenant; child AFTER-DELETE emitted NOTHING.
  PERFORM pg_temp.ns_assert_outbox('C-tenant-cascade-delete', v_child, 'delete', 'tenant', c_tenant);

  -- ══ Case D: SHARED parent + CASCADE parent DELETE → final child event shared/null ══
  INSERT INTO public.aromatherapy_reference_sheets (tenant_id, sheet_name, display_title)
    VALUES (NULL, 'NS_REG_shared_D', 'NS_REG') RETURNING id INTO v_sheet;
  INSERT INTO public.aromatherapy_reference_rows (sheet_id, row_index, cells)
    VALUES (v_sheet, 0, '{"0":"d"}'::jsonb) RETURNING id INTO v_child;
  DELETE FROM public.aromatherapy_reference_sheets WHERE id = v_sheet;  -- CASCADE
  PERFORM pg_temp.ns_assert_outbox('D-shared-cascade-delete', v_child, 'delete', 'shared', NULL);

  -- ══ Case E/F: parent is_active true→false→true → child re-eval upsert stays tenant-scoped ══
  INSERT INTO public.aromatherapy_reference_sheets (tenant_id, sheet_name, display_title, is_active)
    VALUES (c_tenant, 'NS_REG_tenant_EF', 'NS_REG', true) RETURNING id INTO v_sheet;
  INSERT INTO public.aromatherapy_reference_rows (sheet_id, row_index, cells)
    VALUES (v_sheet, 0, '{"0":"e"}'::jsonb) RETURNING id INTO v_child;
  UPDATE public.aromatherapy_reference_sheets SET is_active = false WHERE id = v_sheet;  -- B3
  PERFORM pg_temp.ns_assert_outbox('E-parent-active-false', v_child, 'upsert', 'tenant', c_tenant);
  UPDATE public.aromatherapy_reference_sheets SET is_active = true WHERE id = v_sheet;   -- B4
  PERFORM pg_temp.ns_assert_outbox('F-parent-active-true', v_child, 'upsert', 'tenant', c_tenant);

  -- ══ Case H (DIRECT missing-parent proof): capture trigger disabled → yalnız child AFTER-DELETE ══
  --    çalışır; parent yok → child HİÇBİR olay üretmemeli (upsert satırı DEĞİŞMEMELİ).
  --    Not: DISABLE TRIGGER tablo owner'lığı gerektirir; yetki yoksa Case H güvenle atlanır
  --    (Case C zaten cascade-orphan yolunu kapsar).
  BEGIN
    INSERT INTO public.aromatherapy_reference_sheets (tenant_id, sheet_name, display_title)
      VALUES (c_tenant, 'NS_REG_tenant_H', 'NS_REG') RETURNING id INTO v_sheet;
    INSERT INTO public.aromatherapy_reference_rows (sheet_id, row_index, cells)
      VALUES (v_sheet, 0, '{"0":"h"}'::jsonb) RETURNING id INTO v_child;
    SELECT event_version INTO v_ver_before FROM public.yasam_hafizasi_outbox
      WHERE source_key = c_srckey AND source_id = v_child;

    ALTER TABLE public.aromatherapy_reference_sheets DISABLE TRIGGER yh_capture_reference_sheet_children_del_trg;
    DELETE FROM public.aromatherapy_reference_sheets WHERE id = v_sheet;  -- cascade; capture OFF
    ALTER TABLE public.aromatherapy_reference_sheets ENABLE TRIGGER yh_capture_reference_sheet_children_del_trg;

    SELECT operation, event_version INTO v_op, v_ver_after FROM public.yasam_hafizasi_outbox
      WHERE source_key = c_srckey AND source_id = v_child;
    IF v_op IS DISTINCT FROM 'upsert' OR v_ver_after IS DISTINCT FROM v_ver_before THEN
      RAISE EXCEPTION '[H-missing-parent-emits-nothing] child AFTER-DELETE cascade-orphan olay URETTI (op=%, ver %/%)',
        v_op, v_ver_before, v_ver_after;
    END IF;
    RAISE NOTICE '[H-missing-parent-emits-nothing] PASS (child cascade-orphan hicbir olay uretmedi)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[H-missing-parent-emits-nothing] SKIP (DISABLE TRIGGER yetkisi yok; Case C kapsar)';
  END;

  RAISE NOTICE 'NULL-SENTINEL REGRESSION: TUM CASE PASS (rollback edilecek).';
END
$regression$;

ROLLBACK;
-- =============================================================================
-- NOT: Bu betik kalıcı hiçbir değişiklik bırakmaz (ROLLBACK). Bir ASSERT düşerse psql
--   ON_ERROR_STOP=1 ile non-zero exit döner ve tüm tx geri alınır. Worker (deindex) tarafı
--   BURADA test edilmez — producer scope doğruluğu kanıtlanır (kök neden bu üreticidedir).
-- =============================================================================
