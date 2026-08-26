-- =============================================================================
-- 20261227000000_cupping_topic_note_atomic_update.sql
--
-- KUPA & HACAMAT — Amaç/Rahatsızlık NOTU güncellemesini TEK TRANSACTION'a alır.
--
-- SORUN (bu migration'dan önce, app/api/kupa/topic-notes/[id]/route.ts):
--   PATCH önce not alanlarını (note/source_label/…) DB'ye yazıyor, SONRA point_ids'i
--   doğruluyordu. Geçersiz/başka-tenant point verilirse API 400 dönse de not "V2"
--   olarak KALIYORDU → yarım (partial) güncelleme. Ayrıca note-point replace'i
--   delete→insert→"best-effort restore" ile yapılıyordu; bu GERÇEK transaction DEĞİL.
--
-- ÇÖZÜM: Aşağıdaki fonksiyon TEK PL/pgSQL gövdesinde (dolayısıyla tek transaction)
--   çalışır — herhangi bir RAISE tüm değişiklikleri GERİ ALIR (tam rollback):
--     1) not sahiplik doğrulaması (tenant + id) + satır kilidi (FOR UPDATE),
--     2) yalnız ALLOWLIST not kolonlarının güncellenmesi (mass-assignment yok),
--     3) point_ids verildiyse: her point'in AYNI tenant'ta gerçek olması doğrulanır,
--        sonra note-point ilişkileri atomik REPLACE edilir,
--     4) hata → hiçbir şey yazılmaz.
--
-- GÜVENLİK:
--   - SECURITY INVOKER: fonksiyon çağıranın (service-role /api/kupa/*) yetkisiyle çalışır;
--     yetki yükseltmesi (DEFINER) YOK. tenant_id İSTEMCİDEN gelmez — API server-side verir.
--   - search_path sabit (pg_catalog, public); tüm nesneler public. ile nitelenir.
--   - EXECUTE anon/authenticated/public'ten REVOKE, yalnız service_role'e GRANT.
--   - Yalnız cupping_topic_notes + cupping_topic_note_points'a dokunur; formal
--     source/citation, Yaşam Hafızası, Atlas tablolarına DOKUNMAZ.
--
-- ADDITIVE + IDEMPOTENT: CREATE OR REPLACE FUNCTION; tablo/DDL değişikliği YOK.
--   Bağımlılık: 20261001000000_cupping_topic_notes.sql (tablolar) önce uygulanmalı.
--
-- HATA KODLARI (SQLSTATE → API map):
--   45001 = not bulunamadı / bu tenant'a ait değil  → 404
--   45002 = not metni boş                            → 400
--   45003 = seçilen bölge bu tenant'a ait değil      → 400
--   45004 = çok fazla bölge (MAX_POINTS)             → 400
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cupping_topic_note_update_atomic(
  p_tenant_id  uuid,
  p_note_id    uuid,
  p_fields     jsonb,      -- yalnız allowlist not kolonları (server-built); '{}' olabilir
  p_point_ids  text[]      -- NULL = ilişkilere DOKUNMA; dizi (boş {} dahil) = REPLACE
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  -- 1) Sahiplik (tenant + id) + satır kilidi (eşzamanlı güncellemeyi serialize eder).
  PERFORM 1
  FROM public.cupping_topic_notes
  WHERE id = p_note_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cupping_note_not_found' USING ERRCODE = '45001';
  END IF;

  -- 2) Not alanlarını güncelle — YALNIZ allowlist kolonlar (note/source_label/sort_order/
  --    is_active). p_fields'te olmayan kolon DOKUNULMAZ; bilinmeyen anahtar YOK SAYILIR.
  IF (p_fields ? 'note') AND btrim(coalesce(p_fields->>'note', '')) = '' THEN
    RAISE EXCEPTION 'cupping_note_empty' USING ERRCODE = '45002';
  END IF;

  UPDATE public.cupping_topic_notes AS n SET
    note         = CASE WHEN p_fields ? 'note'
                        THEN p_fields->>'note' ELSE n.note END,
    source_label = CASE WHEN p_fields ? 'source_label'
                        THEN NULLIF(btrim(coalesce(p_fields->>'source_label', '')), '')
                        ELSE n.source_label END,
    sort_order   = CASE WHEN p_fields ? 'sort_order'
                        THEN (p_fields->>'sort_order')::int ELSE n.sort_order END,
    is_active    = CASE WHEN p_fields ? 'is_active'
                        THEN (p_fields->>'is_active')::boolean ELSE n.is_active END,
    updated_at   = now()
  WHERE n.id = p_note_id AND n.tenant_id = p_tenant_id;

  -- 3) İlgili bölgeler (note-point) — YALNIZ p_point_ids verildiyse REPLACE.
  IF p_point_ids IS NOT NULL THEN
    IF coalesce(array_length(p_point_ids, 1), 0) > 50 THEN
      RAISE EXCEPTION 'cupping_note_too_many_points' USING ERRCODE = '45004';
    END IF;

    -- Her point AYNI tenant'ta GERÇEK olmalı (cross-tenant / geçersiz-uuid reddi).
    -- id::text karşılaştırması: geçersiz-uuid string basitçe eşleşmez → 45003 (cast paniği yok).
    IF EXISTS (
      SELECT 1
      FROM unnest(p_point_ids) AS x(pid)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cupping_points p
        WHERE p.tenant_id = p_tenant_id AND p.id::text = x.pid
      )
    ) THEN
      RAISE EXCEPTION 'cupping_point_not_owned' USING ERRCODE = '45003';
    END IF;

    DELETE FROM public.cupping_topic_note_points
    WHERE tenant_id = p_tenant_id AND topic_note_id = p_note_id;

    -- Dedup (ilk görülme sırasını koru) + 0-tabanlı sort_order.
    INSERT INTO public.cupping_topic_note_points (tenant_id, topic_note_id, point_id, sort_order)
    SELECT p_tenant_id, p_note_id, d.pid::uuid, (row_number() OVER (ORDER BY d.first_ord)) - 1
    FROM (
      SELECT x.pid, min(x.ord) AS first_ord
      FROM unnest(p_point_ids) WITH ORDINALITY AS x(pid, ord)
      GROUP BY x.pid
    ) AS d;
  END IF;

  -- 4) Güncel not satırı + sıralı point_ids (API yanıt sözleşmesi ile birebir).
  SELECT to_jsonb(n) || jsonb_build_object(
           'point_ids',
           coalesce(
             (SELECT jsonb_agg(np.point_id ORDER BY np.sort_order)
              FROM public.cupping_topic_note_points np
              WHERE np.tenant_id = p_tenant_id AND np.topic_note_id = p_note_id),
             '[]'::jsonb)
         )
  INTO v_result
  FROM public.cupping_topic_notes n
  WHERE n.id = p_note_id AND n.tenant_id = p_tenant_id;

  RETURN v_result;
END;
$fn$;

-- EXECUTE kilidi: yalnız service-role (anon/authenticated/public erişemez).
REVOKE ALL ON FUNCTION public.cupping_topic_note_update_atomic(uuid, uuid, jsonb, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cupping_topic_note_update_atomic(uuid, uuid, jsonb, text[])
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   SELECT prosecdef, proname FROM pg_proc
--     WHERE proname = 'cupping_topic_note_update_atomic';           -- prosecdef = f (INVOKER)
--   SELECT has_function_privilege('anon',
--     'public.cupping_topic_note_update_atomic(uuid,uuid,jsonb,text[])','EXECUTE');        -- false
--   SELECT has_function_privilege('authenticated',
--     'public.cupping_topic_note_update_atomic(uuid,uuid,jsonb,text[])','EXECUTE');        -- false
--   SELECT has_function_privilege('service_role',
--     'public.cupping_topic_note_update_atomic(uuid,uuid,jsonb,text[])','EXECUTE');        -- true
--
-- FAILURE-INJECTION (beklenen — hepsi TAM rollback):
--   -- geçersiz point → 45003, not DEĞİŞMEZ:
--   SELECT public.cupping_topic_note_update_atomic(
--     '<tenant>','<note>', '{"note":"V2"}'::jsonb, ARRAY['00000000-0000-0000-0000-000000000000']);
--   -- başka-tenant note → 45001.
--
-- ROLLBACK (gerekirse):
--   DROP FUNCTION IF EXISTS public.cupping_topic_note_update_atomic(uuid, uuid, jsonb, text[]);
-- =============================================================================
