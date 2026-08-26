-- =============================================================================
-- 20261228000100_cupping_protocol_entry_atomic.sql
--
-- KUPA & HACAMAT V2 — UNIFIED "Bilgiler" (protocol entry) CREATE + UPDATE'ini TEK
-- TRANSACTION'a alır. Legacy cupping_topic_note_update_atomic'in V2 eşdeğeri
-- (ONA BAĞIMLI DEĞİL) — kaynak (source_id) doğrulaması eklidir.
--
-- SORUN (CREATE): entry INSERT + entry_points INSERT'i uygulama katmanında
--   "insert → başarısızsa compensating DELETE" ile yapmak GERÇEK transaction DEĞİLDİR
--   (compensating DELETE de hata verirse partial state kalır). Bu, legacy topic-note
--   PATCH'te KALDIRILAN delete/restore/compensation anti-pattern'inin AYNI sınıfıdır.
-- SORUN (UPDATE): "önce alan yaz, sonra point/source doğrula" → geçersiz veri alanları
--   KALIR (partial). Aşağıdaki iki fonksiyon TEK PL/pgSQL gövdesinde (tek transaction)
--   çalışır — herhangi bir RAISE/FK/INSERT hatası TÜM işlemi TAM rollback eder.
--   Uygulama katmanı compensating delete YAPMAZ; rollback'i PostgreSQL sağlar.
--
-- GÜVENLİK (her iki fonksiyon): SECURITY INVOKER (yetki yükseltmesi YOK; service-role
--   çağırır), sabit search_path, EXECUTE anon/auth/public REVOKE + yalnız service_role
--   GRANT. tenant_id İSTEMCİDEN gelmez (API guard verir). Yalnız cupping_protocol_entries
--   + cupping_protocol_entry_points'a dokunur.
--
-- HATA KODLARI (SQLSTATE):
--   CREATE: 45001=protokol bu tenant'a ait değil (→400), 45002=içerik boş (→400),
--           45003=bölge sahipsiz (→400), 45004=çok fazla bölge (→400), 45005=kaynak sahipsiz (→400)
--   UPDATE: 45001=entry bulunamadı (→404), 45002/45003/45004/45005 = create ile aynı (→400)
--
-- ADDITIVE + IDEMPOTENT: CREATE OR REPLACE FUNCTION. Bağımlılık:
--   20261228000000_cupping_protocols_v2_core.sql (tablolar) önce uygulanmalı.
-- =============================================================================

BEGIN;

-- ─── CREATE (gerçek atomik; compensating-delete YOK) ──────────────────────────
CREATE OR REPLACE FUNCTION public.cupping_protocol_entry_create_atomic(
  p_tenant_id   uuid,
  p_protocol_id uuid,
  p_fields      jsonb,     -- allowlist entry kolonları (server-built)
  p_point_ids   text[]     -- NULL/boş {} = bölge yok; dizi = ilgili bölgeler
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_entry_id uuid;
  v_src      text;
  v_src_uuid uuid;
  v_result   jsonb;
BEGIN
  -- 1) protokol sahiplik (AYNI tenant).
  IF NOT EXISTS (
    SELECT 1 FROM public.cupping_protocols
    WHERE id = p_protocol_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'cupping_entry_protocol_not_owned' USING ERRCODE = '45001';
  END IF;

  -- 2) içerik zorunlu (boş olamaz).
  IF btrim(coalesce(p_fields->>'content', '')) = '' THEN
    RAISE EXCEPTION 'cupping_entry_empty' USING ERRCODE = '45002';
  END IF;

  -- 3) source_id opsiyonel; verilirse AYNI tenant source olmalı (id::text → cast paniği yok).
  v_src := NULLIF(btrim(coalesce(p_fields->>'source_id', '')), '');
  IF v_src IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cupping_sources s WHERE s.tenant_id = p_tenant_id AND s.id::text = v_src
    ) THEN
      RAISE EXCEPTION 'cupping_entry_source_not_owned' USING ERRCODE = '45005';
    END IF;
    v_src_uuid := v_src::uuid;
  ELSE
    v_src_uuid := NULL;
  END IF;

  -- 4/5) point sayısı + her point AYNI tenant (dedup INSERT'te yapılır).
  IF p_point_ids IS NOT NULL THEN
    IF coalesce(array_length(p_point_ids, 1), 0) > 50 THEN
      RAISE EXCEPTION 'cupping_entry_too_many_points' USING ERRCODE = '45004';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(p_point_ids) AS x(pid)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cupping_points p
        WHERE p.tenant_id = p_tenant_id AND p.id::text = x.pid
      )
    ) THEN
      RAISE EXCEPTION 'cupping_entry_point_not_owned' USING ERRCODE = '45003';
    END IF;
  END IF;

  -- 6) entry INSERT — allowlist alanlar; tenant_id/protocol_id server tarafından.
  INSERT INTO public.cupping_protocol_entries (
    tenant_id, protocol_id, title, content, source_id, source_label, locator, sort_order, is_active
  ) VALUES (
    p_tenant_id,
    p_protocol_id,
    NULLIF(btrim(coalesce(p_fields->>'title', '')), ''),
    p_fields->>'content',
    v_src_uuid,
    NULLIF(btrim(coalesce(p_fields->>'source_label', '')), ''),
    NULLIF(btrim(coalesce(p_fields->>'locator', '')), ''),
    coalesce((p_fields->>'sort_order')::int, 0),
    coalesce((p_fields->>'is_active')::boolean, true)
  )
  RETURNING id INTO v_entry_id;

  -- 7) entry_points INSERT — AYNI transaction; dedup (ilk görülme) + 0-tabanlı sort_order.
  IF p_point_ids IS NOT NULL AND coalesce(array_length(p_point_ids, 1), 0) > 0 THEN
    INSERT INTO public.cupping_protocol_entry_points (tenant_id, protocol_entry_id, point_id, sort_order)
    SELECT p_tenant_id, v_entry_id, d.pid::uuid, (row_number() OVER (ORDER BY d.first_ord)) - 1
    FROM (
      SELECT x.pid, min(x.ord) AS first_ord
      FROM unnest(p_point_ids) WITH ORDINALITY AS x(pid, ord)
      GROUP BY x.pid
    ) AS d;
  END IF;

  -- 8) oluşturulan entry + sıralı point_ids.
  SELECT to_jsonb(e) || jsonb_build_object(
           'point_ids',
           coalesce(
             (SELECT jsonb_agg(ep.point_id ORDER BY ep.sort_order)
              FROM public.cupping_protocol_entry_points ep
              WHERE ep.tenant_id = p_tenant_id AND ep.protocol_entry_id = v_entry_id),
             '[]'::jsonb)
         )
  INTO v_result
  FROM public.cupping_protocol_entries e
  WHERE e.id = v_entry_id AND e.tenant_id = p_tenant_id;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cupping_protocol_entry_create_atomic(uuid, uuid, jsonb, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cupping_protocol_entry_create_atomic(uuid, uuid, jsonb, text[])
  TO service_role;

-- ─── UPDATE ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cupping_protocol_entry_update_atomic(
  p_tenant_id uuid,
  p_entry_id  uuid,
  p_fields    jsonb,     -- yalnız allowlist entry kolonları (server-built); '{}' olabilir
  p_point_ids text[]     -- NULL = ilişkilere DOKUNMA; dizi (boş {} dahil) = REPLACE
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_result   jsonb;
  v_src      text;
  v_src_uuid uuid;
BEGIN
  -- 1) Sahiplik + satır kilidi.
  PERFORM 1
  FROM public.cupping_protocol_entries
  WHERE id = p_entry_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cupping_entry_not_found' USING ERRCODE = '45001';
  END IF;

  -- 2) content verildiyse boş olamaz.
  IF (p_fields ? 'content') AND btrim(coalesce(p_fields->>'content', '')) = '' THEN
    RAISE EXCEPTION 'cupping_entry_empty' USING ERRCODE = '45002';
  END IF;

  -- 3) source_id verildiyse doğrula. null/'' → temizle; değilse AYNI tenant source olmalı.
  --    id::text karşılaştırması: geçersiz-uuid string basitçe eşleşmez (cast paniği yok).
  IF (p_fields ? 'source_id') THEN
    v_src := NULLIF(btrim(coalesce(p_fields->>'source_id', '')), '');
    IF v_src IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.cupping_sources s
        WHERE s.tenant_id = p_tenant_id AND s.id::text = v_src
      ) THEN
        RAISE EXCEPTION 'cupping_entry_source_not_owned' USING ERRCODE = '45005';
      END IF;
      v_src_uuid := v_src::uuid;
    ELSE
      v_src_uuid := NULL;
    END IF;
  END IF;

  -- 4) Allowlist alan update (title/content/source_id/source_label/locator/sort_order/is_active).
  UPDATE public.cupping_protocol_entries AS e SET
    title        = CASE WHEN p_fields ? 'title'
                        THEN NULLIF(btrim(coalesce(p_fields->>'title', '')), '') ELSE e.title END,
    content      = CASE WHEN p_fields ? 'content'
                        THEN p_fields->>'content' ELSE e.content END,
    source_id    = CASE WHEN p_fields ? 'source_id'
                        THEN v_src_uuid ELSE e.source_id END,
    source_label = CASE WHEN p_fields ? 'source_label'
                        THEN NULLIF(btrim(coalesce(p_fields->>'source_label', '')), '') ELSE e.source_label END,
    locator      = CASE WHEN p_fields ? 'locator'
                        THEN NULLIF(btrim(coalesce(p_fields->>'locator', '')), '') ELSE e.locator END,
    sort_order   = CASE WHEN p_fields ? 'sort_order'
                        THEN (p_fields->>'sort_order')::int ELSE e.sort_order END,
    is_active    = CASE WHEN p_fields ? 'is_active'
                        THEN (p_fields->>'is_active')::boolean ELSE e.is_active END,
    updated_at   = now()
  WHERE e.id = p_entry_id AND e.tenant_id = p_tenant_id;

  -- 5) İlgili bölgeler (entry-point) — YALNIZ p_point_ids verildiyse REPLACE.
  IF p_point_ids IS NOT NULL THEN
    IF coalesce(array_length(p_point_ids, 1), 0) > 50 THEN
      RAISE EXCEPTION 'cupping_entry_too_many_points' USING ERRCODE = '45004';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(p_point_ids) AS x(pid)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cupping_points p
        WHERE p.tenant_id = p_tenant_id AND p.id::text = x.pid
      )
    ) THEN
      RAISE EXCEPTION 'cupping_entry_point_not_owned' USING ERRCODE = '45003';
    END IF;

    DELETE FROM public.cupping_protocol_entry_points
    WHERE tenant_id = p_tenant_id AND protocol_entry_id = p_entry_id;

    -- Dedup (ilk görülme sırasını koru) + 0-tabanlı sort_order.
    INSERT INTO public.cupping_protocol_entry_points (tenant_id, protocol_entry_id, point_id, sort_order)
    SELECT p_tenant_id, p_entry_id, d.pid::uuid, (row_number() OVER (ORDER BY d.first_ord)) - 1
    FROM (
      SELECT x.pid, min(x.ord) AS first_ord
      FROM unnest(p_point_ids) WITH ORDINALITY AS x(pid, ord)
      GROUP BY x.pid
    ) AS d;
  END IF;

  -- 6) Güncel entry + sıralı point_ids (API yanıt sözleşmesi ile birebir).
  SELECT to_jsonb(e) || jsonb_build_object(
           'point_ids',
           coalesce(
             (SELECT jsonb_agg(ep.point_id ORDER BY ep.sort_order)
              FROM public.cupping_protocol_entry_points ep
              WHERE ep.tenant_id = p_tenant_id AND ep.protocol_entry_id = p_entry_id),
             '[]'::jsonb)
         )
  INTO v_result
  FROM public.cupping_protocol_entries e
  WHERE e.id = p_entry_id AND e.tenant_id = p_tenant_id;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cupping_protocol_entry_update_atomic(uuid, uuid, jsonb, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cupping_protocol_entry_update_atomic(uuid, uuid, jsonb, text[])
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   SELECT proname, prosecdef FROM pg_proc
--     WHERE proname IN ('cupping_protocol_entry_create_atomic',
--                       'cupping_protocol_entry_update_atomic');   -- 2 satır, prosecdef = f (INVOKER)
--   SELECT has_function_privilege('anon',
--     'public.cupping_protocol_entry_create_atomic(uuid,uuid,jsonb,text[])','EXECUTE');   -- false
--   SELECT has_function_privilege('service_role',
--     'public.cupping_protocol_entry_create_atomic(uuid,uuid,jsonb,text[])','EXECUTE');   -- true
--
-- FAILURE-INJECTION (beklenen — hepsi TAM rollback, HİÇBİR entry oluşmaz/değişmez):
--   CREATE + cross-tenant point → 45003, entry INSERT rollback (entry YOK);
--   CREATE + cross-tenant source → 45005, entry YOK;  CREATE + boş content → 45002;
--   UPDATE + geçersiz point → 45003, entry DEĞİŞMEZ;  başka-tenant entry → 45001.
--
-- ROLLBACK (gerekirse):
--   DROP FUNCTION IF EXISTS public.cupping_protocol_entry_create_atomic(uuid,uuid,jsonb,text[]);
--   DROP FUNCTION IF EXISTS public.cupping_protocol_entry_update_atomic(uuid,uuid,jsonb,text[]);
-- =============================================================================
